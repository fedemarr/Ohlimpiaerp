-- =====================================================================
-- CRM — crm_generar_casos: agregar el parametro de clientes.
--
-- REEMPLAZA a la version de abm_36 (que recibia solo la paritaria).
-- abm_36 queda como historia: NO se re-corre. Ver la nota en su encabezado.
--
-- POR QUE
-- La pantalla de notas trabaja POR ESCALA; el RPC trabajaba POR PARITARIA.
-- Y una paritaria tiene 2-4 escalas segun el diseno.
--
-- El problema concreto: al marcar enviada la escala A de la paritaria P, la
-- version vieja abria casos para TODOS los clientes con nota en P, incluidos
-- los de la escala B, que todavia no habia salido. Esos nacian en
-- 'pendiente_envio', que era correcto en ese momento. Pero cuando despues se
-- marcaba enviada la escala B, esos casos YA EXISTIAN y el
-- on conflict do nothing no los tocaba: quedaban clavados en
-- 'pendiente_envio' con la nota efectivamente enviada. Datos mal, en
-- silencio, sin ningun error.
--
-- LA SOLUCION: acotar el universo a los clientes que se estan marcando.
-- Pasando la lista, cada escala abre SOLO sus casos, todos nacidos en
-- 'enviada'. El problema desaparece de raiz.
--
-- POR QUE NO on conflict do update
-- Habria que promover 'pendiente_envio' -> 'enviada' cuidando de no pisar un
-- caso que ya avanzo a 'en_renegociacion', y con do update el returning deja
-- de distinguir creados de actualizados (habria que mirar xmax). Es media
-- maquina de estados construida de apuro para tapar algo evitable.
--
-- CONTRATO DE p_clientes
--   NULL          -> toda la paritaria. Es el caso "crear todo lo que falte",
--                    util para SQL a mano y backfills.
--   lista         -> solo esos clientes. Es lo que usa el frontend, tanto en
--                    el marcado automatico como en el boton por fila.
--   array vacio   -> NO crea nada (ningun cliente matchea). Si el frontend
--                    mandara [] por error, la falla es hacia el lado seguro.
--
-- OJO AL USAR NULL DESDE LA PANTALLA: reintroduce el problema de arriba,
-- porque vuelve a abrir casos de escalas que todavia no se enviaron. El boton
-- por fila pasa la lista a proposito.
--
-- Correr de a UN BLOQUE por vez. Los bloques estan ordenados para que cada
-- uno DEPENDA del anterior: si uno no se aplica, el siguiente falla solo.
-- El "Success" del editor no prueba nada (paso 3 veces el 25-jul).
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Borrar la version vieja
--
-- HAY QUE BORRARLA, no alcanza con crear la nueva: quedarian las dos
-- (uuid) y (uuid, uuid[]), y una llamada de UN solo argumento seria
-- AMBIGUA. Postgres la rechaza y el frontend no podria llamarla.
--
-- Si devuelve "function does not exist", ya estaba borrada: seguir.
-- =====================================================================
drop function if exists public.crm_generar_casos(uuid);


-- =====================================================================
-- BLOQUE 2 — La funcion nueva
--
-- Identica a la de abm_36 salvo por el parametro y la linea del where que
-- lo aplica. Todo lo demas (distinct on, on conflict, estado derivado,
-- responsable congelado, validacion de la paritaria) se mantiene igual y
-- por los mismos motivos, que estan explicados en abm_36.
--
-- Si el bloque 1 no se aplico, este bloque igual funciona pero deja DOS
-- funciones. Lo detecta el bloque 4.
-- =====================================================================
create or replace function public.crm_generar_casos(
  p_paritaria_id uuid,
  p_clientes     uuid[] default null
)
returns table (
  clientes_con_nota       integer,
  casos_creados           integer,
  ya_existian             integer,
  creados_sin_responsable integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_universo integer;
  v_creados  integer;
  v_sin_resp integer;
begin
  -- Un uuid equivocado devolveria ceros, y "0 clientes" se lee como un
  -- resultado legitimo. Mejor cortar con un error que se entienda.
  if not exists (select 1 from public.paritarias where id = p_paritaria_id) then
    raise exception 'La paritaria % no existe.', p_paritaria_id
      using hint = 'Verificar el id contra la tabla paritarias.';
  end if;

  with universo as (
    -- Un caso por cliente. Gana la fila ya enviada si hay dos (un cliente
    -- puede tener una fila por escala y otra virtual en la misma paritaria).
    select distinct on (n.cliente_id)
           n.cliente_id,
           n.paritaria_id,
           n.fecha_enviada,
           c.responsable_id
      from public.notas_emitidas n
      join public.clientes c on c.id = n.cliente_id
     where n.paritaria_id = p_paritaria_id
       -- ESTA es la linea nueva. NULL = toda la paritaria.
       and (p_clientes is null or n.cliente_id = any (p_clientes))
     order by n.cliente_id, n.fecha_enviada desc nulls last
  ),
  insertados as (
    insert into public.crm_casos (cliente_id, paritaria_id, estado, responsable_id)
    select u.cliente_id,
           u.paritaria_id,
           -- Estado DERIVADO, no fijo.
           case when u.fecha_enviada is not null then 'enviada' else 'pendiente_envio' end,
           -- RESP. NEG. congelado en el caso.
           u.responsable_id
      from universo u
    on conflict (cliente_id, paritaria_id) do nothing
    returning responsable_id
  )
  select (select count(*) from universo),
         (select count(*) from insertados),
         (select count(*) from insertados where responsable_id is null)
    into v_universo, v_creados, v_sin_resp;

  return query select v_universo, v_creados, v_universo - v_creados, v_sin_resp;
end;
$$;


-- =====================================================================
-- BLOQUE 3 — Comentario y permisos
--
-- Los grants nombran la firma NUEVA. Si el bloque 2 no se aplico, este
-- bloque falla con "function does not exist": es la alarma gratis.
-- =====================================================================
comment on function public.crm_generar_casos(uuid, uuid[]) is
  'Abre un caso de CRM por cada cliente con nota generada en la paritaria. p_clientes NULL = toda la paritaria; lista = solo esos clientes (lo que usa el frontend). Idempotente (on conflict do nothing). Devuelve universo / creados / ya existian / creados sin responsable.';

revoke execute on function public.crm_generar_casos(uuid, uuid[]) from public, anon;
grant  execute on function public.crm_generar_casos(uuid, uuid[]) to authenticated;


-- =====================================================================
-- BLOQUE 4 — VERIFICACION EN EL CATALOGO
--
-- Esperado: UNA SOLA FILA.
--   argumentos = "p_paritaria_id uuid, p_clientes uuid[] DEFAULT NULL"
--   es_definer = false
--   permisos   sin anon y sin PUBLIC; solo authenticated (y el dueno).
--
-- SI DEVUELVE DOS FILAS, el bloque 1 no se aplico y quedo tambien la
-- version vieja de un solo argumento. Hay que correr el bloque 1 de nuevo:
-- con las dos, el frontend no puede llamarla (llamada ambigua).
-- =====================================================================
select p.proname,
       pg_get_function_arguments(p.oid)  as argumentos,
       p.prosecdef                       as es_definer,
       pg_get_function_result(p.oid)     as devuelve,
       array_to_string(p.proacl, ' | ')  as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crm_generar_casos'
 order by argumentos;


-- =====================================================================
-- BLOQUE 5 — Datos para la prueba
--
-- Devuelve, por paritaria: el uuid, cuantos clientes tiene y DOS cliente_id
-- listos para pegar en el bloque 6. La columna dos_clientes ya sale con
-- formato de array de Postgres ({uuid,uuid}): se pega tal cual entre
-- comillas simples y se le agrega ::uuid[].
-- =====================================================================
select paritaria_id,
       count(distinct cliente_id)                  as clientes_con_nota,
       (array_agg(distinct cliente_id))[1:2]       as dos_clientes
  from public.notas_emitidas
 where paritaria_id is not null
 group by paritaria_id
 order by clientes_con_nota desc;


-- =====================================================================
-- BLOQUE 6 — PRUEBA
--
-- VA ENTERO DE UNA SOLA VEZ. El rollback es lo unico que saca los casos de
-- produccion. Cortado a la mitad, el editor abre otra sesion, el rollback no
-- alcanza al resto y quedan casos de prueba en la base.
--
-- Reemplazar PARITARIA por el paritaria_id del bloque 5, y CLI1,CLI2 por el
-- contenido de la columna dos_clientes (sin las llaves).
--
-- Prueba las cuatro cosas de una: que la lista ACOTA el universo, que es
-- idempotente con lista, que NULL sigue significando toda la paritaria, y
-- que el array vacio no crea nada.
--
-- Esperado (con los 77 de hoy, y suponiendo que los 2 clientes esten entre
-- ellos):
--   (a) universo=2,  creados=2,  ya_existian=0
--   (b) universo=2,  creados=0,  ya_existian=2      <- idempotente con lista
--   (c) universo=77, creados=75, ya_existian=2      <- NULL = toda la paritaria
--   (d) universo=77, creados=0,  ya_existian=77     <- idempotente con NULL
--   (e) universo=0,  creados=0,  ya_existian=0      <- array vacio no crea nada
--   total_en_tabla = 77 (no se duplico nada)
-- =====================================================================
-- begin;
--
-- select '(a) lista de 2'      as caso, * from public.crm_generar_casos('PARITARIA', '{CLI1,CLI2}'::uuid[]);
-- select '(b) misma lista'     as caso, * from public.crm_generar_casos('PARITARIA', '{CLI1,CLI2}'::uuid[]);
-- select '(c) null = toda'     as caso, * from public.crm_generar_casos('PARITARIA');
-- select '(d) null otra vez'   as caso, * from public.crm_generar_casos('PARITARIA');
-- select '(e) array vacio'     as caso, * from public.crm_generar_casos('PARITARIA', '{}'::uuid[]);
--
-- select count(*)                                          as total_en_tabla,
--        count(*) filter (where estado = 'pendiente_envio') as pendiente_envio,
--        count(*) filter (where estado = 'enviada')         as enviada,
--        count(*) filter (where responsable_id is null)     as sin_responsable
--   from public.crm_casos;
--
-- rollback;


-- =====================================================================
-- BLOQUE 7 — La validacion de la paritaria sigue viva
--
-- Cambio la firma: hay que confirmar que el raise sigue estando.
-- Tiene que FALLAR con "La paritaria ... no existe." + el hint.
-- Si devuelve una fila de ceros, la validacion se perdio.
-- =====================================================================
-- select * from public.crm_generar_casos('00000000-0000-0000-0000-000000000000');

-- =====================================================================
-- CRM — el ENVIO DE LA NOTA queda registrado como gestion.
--
-- REEMPLAZA a crm_generar_casos de abm_37. abm_37 queda como historia: NO se
-- re-corre su bloque de la funcion.
--
-- EL PROBLEMA
-- Mandar la nota de aumento ES un contacto con el cliente: tiene canal (mail) y
-- tiene fecha. Cumple la definicion de gestion. Pero la fecha vivia solo en
-- notas_emitidas y el CRM no la leia, asi que la columna "Ult. gestion" decia
-- "sin gestiones" en casos cuya nota SI se habia enviado. El dato existia y la
-- pantalla mentia.
--
-- POR QUE ADENTRO DE crm_generar_casos Y NO EN UN RPC APARTE
--   1) El caso y su primera gestion son el MISMO hecho. Con dos llamadas, un
--      corte en el medio deja casos en estado 'enviada' sin ninguna gestion:
--      exactamente el sintoma que vinimos a arreglar, pero producido por
--      nosotros. Misma razon por la que la proxima accion entro dentro de
--      crm_cambiar_estado en abm_40.
--   2) fecha_enviada YA esta adentro de esta funcion: la CTE "universo" la lee
--      para decidir si el caso nace 'enviada' o 'pendiente_envio'. Un RPC aparte
--      tendria que volver a leer notas_emitidas para averiguar lo que esta ya
--      tiene en la mano.
--
-- Correr BLOQUE POR BLOQUE. El bloque 7 va ENTERO de una sola vez.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Borrar la version anterior
--
-- OBLIGATORIO. Aca la lista de parametros NO cambia, pero SI cambia el tipo de
-- retorno (se agrega una quinta columna), y "create or replace" no puede cambiar
-- el tipo de retorno de una funcion existente: falla con "cannot change return
-- type of existing function". Es un error distinto al de abm_40 (alli el riesgo
-- era una funcion AMBIGUA), pero el remedio es el mismo.
--
-- Si devuelve "function does not exist", ya estaba borrada: seguir.
-- =====================================================================
drop function if exists public.crm_generar_casos(uuid, uuid[]);


-- =====================================================================
-- BLOQUE 2 — La funcion nueva
--
-- Identica a la de abm_37 salvo por la CTE "gestiones" y la quinta columna del
-- retorno.
--
-- LA GESTION SE CUELGA DE "insertados", NO DE "universo": solo se registra para
-- los casos RECIEN creados. Asi el "on conflict do nothing" que ya tenia la
-- funcion protege tambien a las gestiones, y volver a apretar "Crear" no duplica
-- nada. Los casos que ya existian se cubren con el relleno del bloque 5.
--
-- Y solo cuando fecha_enviada no es null: un caso que nace 'pendiente_envio'
-- todavia no tuvo ningun contacto que registrar.
-- =====================================================================
create or replace function public.crm_generar_casos(
  p_paritaria_id uuid,
  p_clientes     uuid[] default null
)
returns table (
  clientes_con_nota       integer,
  casos_creados           integer,
  ya_existian             integer,
  creados_sin_responsable integer,
  gestiones_creadas       integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_universo integer;
  v_creados  integer;
  v_sin_resp integer;
  v_gest     integer;
begin
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
    -- Se devuelve tambien el id: lo necesita la CTE de gestiones.
    returning id, cliente_id, responsable_id
  ),
  gestiones as (
    insert into public.crm_gestiones (caso_id, fecha, canal, descripcion)
    select i.id,
           -- notas_emitidas.fecha_enviada es timestamptz y crm_gestiones.fecha
           -- es date: sin la conversion, Postgres rechaza el insert.
           u.fecha_enviada::date,
           'mail',
           'Nota de aumento enviada'
      from insertados i
      join universo u on u.cliente_id = i.cliente_id
     where u.fecha_enviada is not null
    returning 1
  )
  select (select count(*) from universo),
         (select count(*) from insertados),
         (select count(*) from insertados where responsable_id is null),
         (select count(*) from gestiones)
    into v_universo, v_creados, v_sin_resp, v_gest;

  return query select v_universo, v_creados, v_universo - v_creados, v_sin_resp, v_gest;
end;
$$;


-- =====================================================================
-- BLOQUE 3 — Comentario y permisos
--
-- El drop del bloque 1 se llevo los permisos de la version vieja: estos grants
-- NO son opcionales, sin ellos la pantalla de Precios no puede crear casos.
--
-- La funcion es SECURITY INVOKER, asi que la gestion la inserta el usuario que
-- llama y el trigger de crm_gestiones le sella SU mail en cargado_por. Es lo
-- correcto: quien marca las notas como enviadas es quien deja el registro.
-- =====================================================================
comment on function public.crm_generar_casos(uuid, uuid[]) is
  'Crea los casos del CRM de una paritaria (opcionalmente acotada a una lista de clientes) y, para los que nacen enviados, registra la primera gestion: mail con la fecha real de envio. Idempotente: re-ejecutarla no duplica casos ni gestiones. Devuelve clientes con nota / casos creados / ya existian / creados sin responsable / gestiones creadas.';

revoke execute on function public.crm_generar_casos(uuid, uuid[]) from public, anon;
grant  execute on function public.crm_generar_casos(uuid, uuid[]) to authenticated;


-- =====================================================================
-- BLOQUE 4 — VISTA PREVIA del relleno (solo lee, no cambia nada)
--
-- Cuantas gestiones va a crear el bloque 5. Correr esto ANTES del relleno: si el
-- numero no se parece a la cantidad de casos con nota enviada, algo esta mal y
-- conviene mirar antes de escribir.
-- =====================================================================
select count(*) as gestiones_a_crear
  from public.crm_casos c
 where not exists (select 1 from public.crm_gestiones g where g.caso_id = c.id)
   and exists (
     select 1 from public.notas_emitidas n
      where n.cliente_id = c.cliente_id
        and n.paritaria_id = c.paritaria_id
        and n.fecha_enviada is not null
   );


-- =====================================================================
-- BLOQUE 5 — RELLENO de los casos que ya existian
--
-- Los casos creados antes de este script no pasaron por la CTE de gestiones:
-- se quedarian para siempre diciendo "sin gestiones" aunque su nota se haya
-- enviado. Este bloque los cubre, UNA sola vez.
--
-- DOS CONDICIONES, y la segunda es la que importa:
--   · que la nota tenga fecha de envio, y
--   · que el caso NO tenga NINGUNA gestion todavia.
-- La segunda hace el bloque idempotente (re-correrlo inserta cero) y evita
-- meterle una "primera gestion" a un caso que ya tenga otras cargadas despues.
--
-- POR QUE DICE "(registro historico)"
-- crm_gestiones sella cargado_por con quien ejecuta, asi que estas filas van a
-- quedar con el mail de Juan. El campo dice quien CARGO el registro, no quien
-- hizo el contacto, asi que no es incorrecto — pero sin la aclaracion pareceria
-- que alguien registro a mano decenas de contactos reales.
-- =====================================================================
insert into public.crm_gestiones (caso_id, fecha, canal, descripcion)
select c.id,
       (select max(n.fecha_enviada)::date
          from public.notas_emitidas n
         where n.cliente_id = c.cliente_id
           and n.paritaria_id = c.paritaria_id),
       'mail',
       'Nota de aumento enviada (registro histórico)'
  from public.crm_casos c
 where not exists (select 1 from public.crm_gestiones g where g.caso_id = c.id)
   and exists (
     select 1 from public.notas_emitidas n
      where n.cliente_id = c.cliente_id
        and n.paritaria_id = c.paritaria_id
        and n.fecha_enviada is not null
   );


-- =====================================================================
-- BLOQUE 6 — VERIFICACION (solo lee)
-- =====================================================================

-- (a) La funcion quedo con CINCO columnas de retorno y sin anon ni PUBLIC.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as parametros,
       pg_get_function_result(p.oid)             as devuelve,
       array_to_string(p.proacl, ' | ')          as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crm_generar_casos';

-- (b) Cuantos casos siguen sin ninguna gestion. Los que queden tienen que ser
--     los que NO tienen nota enviada (nacieron 'pendiente_envio').
select c.estado, count(*) as casos_sin_gestiones
  from public.crm_casos c
 where not exists (select 1 from public.crm_gestiones g where g.caso_id = c.id)
 group by c.estado
 order by c.estado;

-- (c) Muestra de lo que quedo cargado.
select cl.nombre as cliente, g.fecha, g.canal, g.descripcion, g.cargado_por_email
  from public.crm_gestiones g
  join public.crm_casos c  on c.id = g.caso_id
  join public.clientes  cl on cl.id = c.cliente_id
 order by g.created_at desc
 limit 10;


-- =====================================================================
-- BLOQUE 7 — PRUEBA DE QUE NO DUPLICA
--
-- VA ENTERO, DE UNA SOLA VEZ. Si se corta a la mitad, el editor abre otra sesion,
-- el rollback no alcanza al resto y quedan gestiones de prueba en produccion.
--
-- El riesgo principal de este cambio es DUPLICAR gestiones al re-ejecutar la
-- funcion (el boton "Crear" de Precios se puede apretar de mas: esta pensado
-- justamente para eso). Esta prueba llama a la funcion sobre una paritaria que ya
-- tiene todos sus casos creados: tiene que devolver 0 casos y 0 gestiones.
-- =====================================================================
begin;

do $$
declare
  v_par  uuid;
  v_ant  integer;
  v_desp integer;
  r      record;
begin
  select paritaria_id into v_par
    from public.crm_casos
   group by paritaria_id
   order by count(*) desc
   limit 1;

  if v_par is null then
    raise notice 'SIN DATOS: no hay casos para probar';
    return;
  end if;

  select count(*) into v_ant from public.crm_gestiones;

  select * into r from public.crm_generar_casos(v_par, null);

  select count(*) into v_desp from public.crm_gestiones;

  raise notice 'casos creados: %  | gestiones creadas: %  | gestiones antes: %  despues: %',
    r.casos_creados, r.gestiones_creadas, v_ant, v_desp;

  if r.casos_creados = 0 and r.gestiones_creadas = 0 and v_ant = v_desp then
    raise notice 'OK - re-ejecutar no duplico nada';
  else
    raise notice 'REVISAR - se crearon filas al re-ejecutar';
  end if;
end $$;

rollback;

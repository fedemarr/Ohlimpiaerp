-- =====================================================================
-- CRM — crm_generar_casos: los casos que nacen como 'enviada' salen con
-- la proxima accion ya puesta.
--
-- REEMPLAZA a la version de abm_37. La firma no cambia (uuid, uuid[]),
-- asi que no hay que borrar la anterior: create or replace la pisa.
--
-- QUE CAMBIA
-- El insert agrega dos columnas: proxima_accion_id y fecha_proxima_accion.
-- Solo se escriben cuando el estado sale 'enviada'; los 'pendiente_envio'
-- quedan las tres columnas de accion en NULL, como antes.
--
-- PROXIMA ACCION
--   id   = 653c1f5a-df5e-42d0-8671-a2df1db1f786
--          ("Esperando respuesta del cliente")
--   fecha = fecha_enviada + 20 dias corridos
--
-- LOS 20 DIAS SON UN VALOR FIJO PROVISORIO. Es el plazo que usa Comercial
-- hoy. Va a reemplazarse por paritarias.plazo_aceptacion_tacita cuando esa
-- columna exista; hasta entonces queda como constante en la funcion.
--
-- EFECTO EN EL BOTON "Crear" (reparacion): como la fecha se calcula sobre
-- fecha_enviada y no sobre hoy, un caso reparado semanas despues puede
-- nacer con la fecha tope YA VENCIDA. Es correcto: el plazo de ese
-- cliente ya paso. Aparece en rojo en la agenda, que es exactamente la
-- señal de que hay que actuar.
--
-- TODO LO DEMAS se mantiene igual y por los mismos motivos, que estan
-- explicados en abm_36 y abm_37 (firma, distinct on, on conflict,
-- estado derivado, responsable congelado, validacion de paritaria,
-- contrato de p_clientes).
--
-- Correr de a UN BLOQUE por vez en el editor de Supabase.
-- Y VERIFICAR CONTRA EL CATALOGO despues de cada bloque que cree algo.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — La funcion actualizada
--
-- DROP + CREATE en el mismo bloque: si se corren juntos no queda hueco
-- sin funcion. El DROP borra los permisos; se reaplican en el bloque 2.
-- =====================================================================
drop function if exists public.crm_generar_casos(uuid, uuid[]);

create function public.crm_generar_casos(
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

  -- Plazo FIJO provisorio: 20 dias corridos desde la fecha de envio.
  -- Reemplazar por paritarias.plazo_aceptacion_tacita cuando exista.
  c_plazo_dias constant integer := 20;

  -- "Esperando respuesta del cliente"
  c_accion_espera constant uuid := '653c1f5a-df5e-42d0-8671-a2df1db1f786';
begin
  if not exists (select 1 from public.paritarias where id = p_paritaria_id) then
    raise exception 'La paritaria % no existe.', p_paritaria_id
      using hint = 'Verificar el id contra la tabla paritarias.';
  end if;

  with universo as (
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
    insert into public.crm_casos (
      cliente_id, paritaria_id, estado, responsable_id,
      proxima_accion_id, fecha_proxima_accion
    )
    select u.cliente_id,
           u.paritaria_id,
           case when u.fecha_enviada is not null then 'enviada' else 'pendiente_envio' end,
           u.responsable_id,
           -- Accion y plazo SOLO para los que nacen como 'enviada'.
           -- Los 'pendiente_envio' quedan NULL: lo pendiente ahi es mandar
           -- la nota, y eso lo sigue el modulo de notas, no la agenda.
           case when u.fecha_enviada is not null then c_accion_espera    else null end,
           -- El ::date NO es cosmetico. notas_emitidas.fecha_enviada es timestamptz, y en
           -- Postgres timestamptz + integer NO EXISTE como operacion: sin el cast, la funcion
           -- se CREA sin problema y recien falla al llamarla, con
           -- "operator does not exist: timestamp with time zone + integer".
           -- Es el mismo cast que ya hacen abm_41 y abm_42 por el mismo motivo.
           case when u.fecha_enviada is not null then u.fecha_enviada::date + c_plazo_dias else null end
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
-- BLOQUE 2 — Comentario y permisos
--
-- ESTE BLOQUE ES OBLIGATORIO. NO ES "por las dudas".
--
-- El bloque 1 es DROP + CREATE, no CREATE OR REPLACE. El DROP se lleva puestos
-- los permisos, y la funcion nueva nace con el EXECUTE implicito que Postgres le
-- da a PUBLIC — o sea, alcanzable por anon. Correr el bloque 1 y saltear este
-- deja esa puerta abierta.
--
-- (El comentario anterior decia que los permisos venian de abm_37 y que "el
-- replace no los toca". Era falso: aca no hay ningun replace. Es exactamente el
-- error que dejo el grant a anon en abm_31, abm_32 y abm_33.)
-- =====================================================================
comment on function public.crm_generar_casos(uuid, uuid[]) is
  'Abre un caso de CRM por cada cliente con nota en la paritaria. Los casos ''enviada'' nacen con proxima accion "Esperando respuesta" a fecha_enviada + 20d. Idempotente (on conflict do nothing).';

revoke execute on function public.crm_generar_casos(uuid, uuid[]) from public, anon;
grant  execute on function public.crm_generar_casos(uuid, uuid[]) to authenticated;


-- =====================================================================
-- BLOQUE 3 — VERIFICACION EN EL CATALOGO
--
-- Esperado: UNA SOLA FILA.
--   argumentos  = "p_paritaria_id uuid, p_clientes uuid[] DEFAULT NULL"
--   es_definer  = false
--   anon_puede  = false   <-- LA COLUMNA QUE IMPORTA
--
-- POR QUE has_function_privilege Y NO SOLO proacl: si el bloque 2 no se corrio,
-- proacl queda en NULL (Postgres no materializa los permisos por defecto) y la
-- columna de permisos sale VACIA. Una celda vacia se lee como "limpio, no hay
-- anon", y es exactamente al reves: NULL significa que PUBLIC puede ejecutar.
-- La verificacion vieja daba por buena la puerta abierta.
-- =====================================================================
select p.proname,
       pg_get_function_arguments(p.oid)  as argumentos,
       p.prosecdef                       as es_definer,
       has_function_privilege('anon', p.oid, 'execute')          as anon_puede,
       coalesce(array_to_string(p.proacl, ' | '),
                '(NULL = PUBLIC puede ejecutar)')                as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crm_generar_casos'
 order by argumentos;


-- =====================================================================
-- BLOQUE 4 — PRUEBA (dentro de begin...rollback)
--
-- VA ENTERO DE UNA SOLA VEZ.
--
-- Reemplazar PARITARIA por el paritaria_id real, y CLI1,CLI2 por dos
-- cliente_id del bloque 5 de abm_37.
--
-- Verificar que:
--   (a) casos_creados > 0
--   (b) los casos 'enviada' tienen proxima_accion_id y fecha_proxima_accion
--   (c) los casos 'pendiente_envio' (si los hay) tienen ambas en NULL
--   (d) la fecha = fecha_enviada + 20
-- =====================================================================
-- begin;
--
-- select '(a) crear' as caso, * from public.crm_generar_casos('PARITARIA', '{CLI1,CLI2}'::uuid[]);
--
-- select c.cliente_id, c.estado,
--        c.proxima_accion_id, c.fecha_proxima_accion,
--        a.nombre as accion_nombre
--   from public.crm_casos c
--   left join public.crm_acciones a on a.id = c.proxima_accion_id
--  where c.paritaria_id = 'PARITARIA'
--  order by c.estado, c.cliente_id;
--
-- rollback;

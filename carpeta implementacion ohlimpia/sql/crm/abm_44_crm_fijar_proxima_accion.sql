-- =====================================================================
-- CRM — cambiar la PROXIMA ACCION sin cambiar el estado.
--
-- EL HUECO QUE TAPA
-- Hoy la unica forma de tocar la proxima accion es crm_cambiar_estado, o sea
-- pasando por un cambio de estado. Y eso no siempre corresponde: mover la fecha
-- tope, o pasar de "Esperando respuesta del cliente" a "Enviar nueva propuesta",
-- son cosas que pasan con el caso QUIETO en renegociacion. Con lo que hay, para
-- reagendar habia que re-aplicar el mismo estado, y en un caso precerrado eso
-- BORRA la agenda en vez de fijarla.
--
-- POR QUE UN RPC Y NO UN UPDATE DESDE EL NAVEGADOR
-- crm_casos tiene grant de update para authenticated, asi que la pantalla podria
-- escribir estas tres columnas sola. Pero entonces las reglas —accion vigente,
-- accion y fecha juntas, detalle obligatorio en las que lo piden— vivirian solo
-- en el navegador, que es exactamente lo que evitamos en abm_40. Un caso vivo con
-- accion y sin fecha no le aparece a nadie en la agenda.
--
-- Correr BLOQUE POR BLOQUE. El bloque 4 va ENTERO de una sola vez.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — La funcion
--
-- NO TOCA precerrada NI cerrada. Esos casos terminaron y crm_cambiar_estado les
-- limpia la agenda a proposito: ponerles una proxima accion los devolveria a la
-- lista de pendientes mientras el estado dice que estan cerrados. Se saltean y se
-- informa cuantos se actualizaron de verdad.
--
-- No permite BORRAR la accion (accion y fecha son obligatorias). Dejar un caso
-- vivo sin agenda es lo que el diseno prohibe; si hay que sacarlo de circulacion,
-- el camino es el cambio de estado, no vaciarle la agenda.
-- =====================================================================
create or replace function public.crm_fijar_proxima_accion(
  p_casos     uuid[],
  p_accion_id uuid,
  p_fecha     date,
  p_detalle   text default null
)
returns table (casos_actualizados integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_n   integer;
  v_det text := nullif(btrim(coalesce(p_detalle, '')), '');
  v_nom text;
  v_act boolean;
  v_req boolean;
begin
  if p_casos is null or array_length(p_casos, 1) is null then
    raise exception 'No se selecciono ningun caso.';
  end if;

  if p_accion_id is null or p_fecha is null then
    raise exception 'Hacen falta la proxima accion y la fecha tope.'
      using hint = 'Una accion sin fecha no entra en ninguna agenda.';
  end if;

  select a.nombre, a.activa, a.requiere_detalle
    into v_nom, v_act, v_req
    from public.crm_acciones a
   where a.id = p_accion_id;

  if not found then
    raise exception 'La accion % no existe.', p_accion_id;
  end if;
  -- Una accion retirada explica el pasado, pero no se asigna de nuevo.
  if not v_act then
    raise exception 'La accion "%" esta desactivada.', v_nom;
  end if;
  if v_req and v_det is null then
    raise exception 'La accion "%" necesita un detalle.', v_nom
      using hint = 'Sin explicacion no dice nada dentro de seis meses.';
  end if;

  update public.crm_casos c
     set proxima_accion_id      = p_accion_id,
         fecha_proxima_accion   = p_fecha,
         proxima_accion_detalle = v_det
   where c.id = any (p_casos)
     and c.estado not in ('precerrada', 'cerrada');

  get diagnostics v_n = row_count;
  return query select v_n;
end;
$$;


-- =====================================================================
-- BLOQUE 2 — Comentario y permisos
-- =====================================================================
comment on function public.crm_fijar_proxima_accion(uuid[], uuid, date, text) is
  'Cambia la proxima accion, la fecha tope y el detalle de uno o varios casos SIN tocar el estado. Saltea los precerrados y cerrados. Accion y fecha son obligatorias: un caso vivo sin agenda no le aparece a nadie.';

revoke execute on function public.crm_fijar_proxima_accion(uuid[], uuid, date, text) from public, anon;
grant  execute on function public.crm_fijar_proxima_accion(uuid[], uuid, date, text) to authenticated;


-- =====================================================================
-- BLOQUE 3 — VERIFICACION EN EL CATALOGO (solo lee)
-- Esperado: es_definer = false, y en permisos NI anon NI PUBLIC.
-- =====================================================================
select p.proname,
       pg_get_function_identity_arguments(p.oid) as parametros,
       p.prosecdef                               as es_definer,
       array_to_string(p.proacl, ' | ')          as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('crm_fijar_proxima_accion','crm_cambiar_estado')
 order by p.proname;


-- =====================================================================
-- BLOQUE 4 — PRUEBA
--
-- VA ENTERO, DE UNA SOLA VEZ. Cortado a la mitad, el rollback no alcanza al resto
-- y queda un caso de produccion con una fecha inventada.
--
-- Prueba las tres reglas: que exija fecha, que no toque un precerrado, y que si
-- funcione sobre un caso vivo.
-- =====================================================================
begin;

create temp table _p44 (paso text, resultado text) on commit drop;

do $$
declare
  v_vivo uuid;
  v_pre  uuid;
  v_acc  uuid;
  v_n    integer;
begin
  select id into v_vivo from public.crm_casos
   where estado not in ('precerrada','cerrada') limit 1;
  select id into v_pre  from public.crm_casos where estado = 'precerrada' limit 1;
  select id into v_acc  from public.crm_acciones
   where activa and not requiere_detalle order by orden limit 1;

  if v_vivo is null or v_acc is null then
    insert into _p44 values ('0 preparacion', 'SIN DATOS: falta un caso vivo o una accion');
    return;
  end if;

  -- 1) sin fecha: tiene que fallar
  begin
    perform public.crm_fijar_proxima_accion(array[v_vivo], v_acc, null);
    insert into _p44 values ('1 sin fecha', 'MAL - lo acepto');
  exception when others then
    insert into _p44 values ('1 sin fecha', 'OK rechazado: ' || sqlerrm);
  end;

  -- 2) sobre un caso vivo: tiene que andar
  select casos_actualizados into v_n
    from public.crm_fijar_proxima_accion(array[v_vivo], v_acc, current_date + 10, 'prueba abm_44');
  insert into _p44 values ('2 caso vivo', 'OK actualizo ' || v_n || ' (esperado 1)');

  -- 3) sobre un precerrado: NO tiene que tocarlo
  if v_pre is null then
    insert into _p44 values ('3 precerrado', 'no hay precerrados para probar');
  else
    select casos_actualizados into v_n
      from public.crm_fijar_proxima_accion(array[v_pre], v_acc, current_date + 10);
    insert into _p44 values ('3 precerrado', 'actualizo ' || v_n || ' (esperado 0)');
  end if;
end $$;

select paso, resultado from _p44 order by paso;

rollback;

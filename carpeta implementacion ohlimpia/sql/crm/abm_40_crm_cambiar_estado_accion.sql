-- =====================================================================
-- CRM — crm_cambiar_estado: la PROXIMA ACCION entra en la funcion.
--
-- REEMPLAZA a la version de abm_38 (que recibia 4 parametros).
-- abm_38 queda como historia: NO se re-corre su bloque 4.
--
-- POR QUE VA EN LA BASE Y NO EN LA PANTALLA
-- La seccion 10 del diseno dice que en sin_respuesta, en_renegociacion y
-- reclamo_posterior la proxima accion es OBLIGATORIA, porque un caso vivo sin
-- accion ni fecha no le aparece a nadie en la agenda: queda abierto e invisible.
--
-- Si la pantalla hiciera dos llamadas —primero el estado, despues la accion— un
-- corte de red entre las dos deja exactamente eso: 40 casos en renegociacion sin
-- agenda. La regla tiene que estar donde no se pueda saltear, y eso es adentro de
-- la funcion: estado y accion entran en la MISMA transaccion, o no entra ninguno.
--
-- Correr BLOQUE POR BLOQUE. El bloque 5 es la prueba y va ENTERO de una vez.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Borrar la version de 4 parametros
--
-- OBLIGATORIO, y es el bloque que mas facil se saltea. "create or replace" NO
-- reemplaza una funcion cuando cambia la lista de parametros: crea una SEGUNDA
-- con el mismo nombre. Con las dos vivas, una llamada de 4 argumentos matchea
-- las dos (la nueva tiene defaults) y Postgres la rechaza por AMBIGUA.
--
-- Es lo mismo que paso entre abm_36 y abm_37.
--
-- Si devuelve "function does not exist", ya estaba borrada: seguir.
-- =====================================================================
drop function if exists public.crm_cambiar_estado(uuid[], text, text, text);


-- =====================================================================
-- BLOQUE 2 — La funcion nueva
--
-- Todo lo de abm_38 sigue igual: los estados que acepta, el motivo obligatorio
-- del precierre, saltear los cerrados, y la observacion que se APILA con fecha.
--
-- LO QUE SE AGREGA
--   p_accion_id / p_fecha / p_detalle, con la obligatoriedad adentro.
--
-- DOS CAMPOS QUE SE COMPORTAN DISTINTO, A PROPOSITO:
--   observaciones          -> se APILA. Es historia: lo de antes no se pierde.
--   proxima_accion_detalle -> se REEMPLAZA. No es historia, es el estado actual
--                             de que se esta esperando. Apilarlo dejaria una
--                             pila de detalles viejos describiendo esperas que
--                             ya terminaron.
-- =====================================================================
create or replace function public.crm_cambiar_estado(
  p_casos       uuid[],
  p_estado      text,
  p_motivo      text default null,
  p_observacion text default null,
  p_accion_id   uuid default null,
  p_fecha       date default null,
  p_detalle     text default null
)
returns table (casos_actualizados integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_n     integer;
  v_obs   text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_det   text := nullif(btrim(coalesce(p_detalle, '')), '');
  v_exige boolean;
  v_nom   text;
  v_act   boolean;
  v_req   boolean;
begin
  if p_casos is null or array_length(p_casos, 1) is null then
    raise exception 'No se selecciono ningun caso.';
  end if;

  if p_estado not in ('enviada','sin_respuesta','en_renegociacion','precerrada','reclamo_posterior') then
    raise exception 'El estado % no se puede aplicar en bloque.', p_estado
      using hint = 'cerrada la confirma el pago, no una persona.';
  end if;

  if p_estado = 'precerrada' then
    if p_motivo is null or p_motivo not in ('aceptacion','tacita','rebaja','otro') then
      raise exception 'El precierre necesita un motivo: aceptacion, tacita, rebaja u otro.';
    end if;
    if p_motivo = 'otro' and v_obs is null then
      raise exception 'El motivo "otro" necesita una descripcion.'
        using hint = 'Sin explicacion, "otro" no dice nada dentro de seis meses.';
    end if;
  end if;

  -- ---- Proxima accion ----
  v_exige := p_estado in ('sin_respuesta','en_renegociacion','reclamo_posterior');

  if v_exige and (p_accion_id is null or p_fecha is null) then
    raise exception 'El estado % necesita proxima accion y fecha tope.', p_estado
      using hint = 'Sin accion ni fecha, el caso queda vivo pero no le aparece a nadie en la agenda.';
  end if;

  -- Accion y fecha viajan juntas SIEMPRE. Una accion sin fecha no entra en
  -- ninguna agenda; una fecha sin accion no dice que se espera ni de quien
  -- depende, que es justo lo que este modelo vino a resolver.
  if (p_accion_id is null) <> (p_fecha is null) then
    raise exception 'La proxima accion y la fecha tope van juntas: o las dos, o ninguna.';
  end if;

  if p_accion_id is not null then
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
  end if;

  update public.crm_casos c
     set estado            = p_estado,
         precerrada_motivo = case when p_estado = 'precerrada' then p_motivo
                                  else c.precerrada_motivo end,
         -- La observacion se APILA con fecha, no pisa lo anterior.
         observaciones     = case when v_obs is null then c.observaciones
                                  else coalesce(c.observaciones || E'\n', '')
                                       || to_char(now(), 'YYYY-MM-DD') || ' - ' || v_obs end,

         -- PRECERRADA LIMPIA LA AGENDA. El caso termino: dejarle una accion
         -- pendiente lo mostraria como trabajo por hacer para siempre. Si mas
         -- adelante vuelve por un reclamo posterior, ese estado exige accion y
         -- fecha nuevas, asi que no se pierde nada.
         proxima_accion_id      = case when p_estado = 'precerrada'  then null
                                       when p_accion_id is not null  then p_accion_id
                                       else c.proxima_accion_id end,
         fecha_proxima_accion   = case when p_estado = 'precerrada'  then null
                                       when p_accion_id is not null  then p_fecha
                                       else c.fecha_proxima_accion end,
         proxima_accion_detalle = case when p_estado = 'precerrada'  then null
                                       when p_accion_id is not null  then v_det
                                       else c.proxima_accion_detalle end
   where c.id = any (p_casos)
     and c.estado <> 'cerrada'                      -- lo cobrado no se reabre en bloque
     -- Idempotencia, con una salvedad: si ademas viene una accion, SI hay algo
     -- que cambiar aunque el estado ya sea el destino. Sin esta segunda mitad,
     -- re-agendar 40 casos que ya estan en renegociacion devolveria "0
     -- actualizados", que se lee como una falla y no como un no-op.
     and (c.estado is distinct from p_estado or p_accion_id is not null);

  get diagnostics v_n = row_count;
  return query select v_n;
end;
$$;


-- =====================================================================
-- BLOQUE 3 — Comentario y permisos
--
-- La funcion es SECURITY INVOKER: corre con los permisos de quien llama y RLS
-- se le aplica normalmente. Aun asi el EXECUTE se revoca a public y anon, que es
-- la regla del proyecto: Postgres le da EXECUTE a PUBLIC por defecto a toda
-- funcion nueva, y ese grant implicito alcanza a anon.
--
-- El drop del bloque 1 se llevo los permisos de la version vieja, asi que estos
-- grants NO son opcionales: sin ellos la pantalla no puede llamarla.
-- =====================================================================
comment on function public.crm_cambiar_estado(uuid[], text, text, text, uuid, date, text) is
  'Cambia el estado de varios casos en bloque y, en el mismo movimiento, fija la proxima accion. En sin_respuesta / en_renegociacion / reclamo_posterior la accion y la fecha son OBLIGATORIAS. Precerrada limpia la agenda. La observacion es una sola para todo el grupo y se apila con fecha. Devuelve cuantos casos se actualizaron de verdad.';

revoke execute on function public.crm_cambiar_estado(uuid[], text, text, text, uuid, date, text) from public, anon;
grant  execute on function public.crm_cambiar_estado(uuid[], text, text, text, uuid, date, text) to authenticated;


-- =====================================================================
-- BLOQUE 4 — VERIFICACION EN EL CATALOGO (solo lee)
--
-- Esperado: UNA SOLA fila de crm_cambiar_estado, con 7 parametros.
-- Si aparecen DOS, el bloque 1 no se corrio y la funcion quedo ambigua.
-- =====================================================================
select p.proname,
       pg_get_function_identity_arguments(p.oid) as parametros,
       p.prosecdef as es_definer,
       array_to_string(p.proacl, ' | ') as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('crm_cambiar_estado','crm_asignar_responsable','crm_sellar_precierre')
 order by p.proname, parametros;


-- =====================================================================
-- BLOQUE 5 — PRUEBA CONTRA DATOS REALES
--
-- VA ENTERO, DE UNA SOLA VEZ. Si se corta a la mitad, el editor abre otra
-- sesion, el rollback no alcanza al resto y queda un caso de produccion en
-- renegociacion con una observacion de prueba.
--
-- Prueba las dos mitades de la regla:
--   1) en_renegociacion SIN accion  -> tiene que ser RECHAZADO
--   2) en_renegociacion CON accion y fecha -> tiene que ANDAR
-- =====================================================================
begin;

create temp table _p40 (caso uuid, accion uuid, paso text, resultado text) on commit drop;

do $$
declare
  v_caso uuid;
  v_acc  uuid;
  v_n    integer;
begin
  select id into v_caso from public.crm_casos
   where estado not in ('cerrada','en_renegociacion') limit 1;
  select id into v_acc from public.crm_acciones
   where activa and not requiere_detalle order by orden limit 1;

  if v_caso is null or v_acc is null then
    insert into _p40(paso, resultado) values ('0 preparacion', 'SIN DATOS: no hay caso o accion para probar');
    return;
  end if;
  insert into _p40(caso, accion) values (v_caso, v_acc);

  -- 1) sin accion: tiene que fallar
  begin
    perform public.crm_cambiar_estado(array[v_caso], 'en_renegociacion');
    insert into _p40(paso, resultado) values ('1 sin accion', 'MAL - lo acepto sin accion');
  exception when others then
    insert into _p40(paso, resultado) values ('1 sin accion', 'OK - rechazado: ' || sqlerrm);
  end;

  -- 2) con accion y fecha: tiene que andar
  select casos_actualizados into v_n
    from public.crm_cambiar_estado(
      array[v_caso], 'en_renegociacion', null, 'prueba abm_40', v_acc, current_date + 7);
  insert into _p40(paso, resultado) values ('2 con accion y fecha', 'OK - actualizo ' || v_n || ' caso(s)');
end $$;

-- Resultado de los dos pasos.
select paso, resultado from _p40 where paso is not null order by paso;

-- Como quedo el caso de prueba (todo esto se deshace con el rollback).
select c.estado,
       a.nombre                as accion,
       c.fecha_proxima_accion  as fecha_tope,
       right(c.observaciones, 40) as final_de_observaciones
  from public.crm_casos c
  join _p40 p on p.caso = c.id
  left join public.crm_acciones a on a.id = c.proxima_accion_id
 where p.paso is null;

rollback;

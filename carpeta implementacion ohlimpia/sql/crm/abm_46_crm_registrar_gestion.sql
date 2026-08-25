-- =====================================================================
-- CRM — LA CADENA: registrar la gestion, mover el estado y reagendar, en UN acto.
--
-- EL MODELO
-- La accion pendiente no es un campo que se reemplaza: es el eslabon de adelante
-- de una cadena. Cumplirla la vuelve pasado —queda como gestion— y ese mismo acto
-- engancha el eslabon siguiente. El caso no guarda "una accion": guarda DONDE
-- ESTA PARADA la cadena.
--
-- El ESTADO es de otra escala. No se mueve con cada eslabon: se mueve con los
-- hechos que cambian de que se trata el caso (el cliente acepta, deja de ser
-- cliente). Por eso apenas tres tipos de gestion sugieren estado y los otros ocho
-- no sugieren nada: no es una omision, es la proporcion correcta.
--
-- POR QUE UN SOLO RPC
-- Registrar la gestion, mover el estado y fijar la proxima accion son UN acto, no
-- tres. En llamadas separadas, un corte en el medio deja el caso a medias: una
-- gestion anotada con la agenda vieja, o un estado nuevo sin nada pendiente. Es el
-- mismo problema que resolvimos en abm_40 metiendo la proxima accion adentro de
-- crm_cambiar_estado.
--
-- Y ESTE RPC NO REIMPLEMENTA NINGUNA REGLA: delega en crm_cambiar_estado y en
-- crm_fijar_proxima_accion, que ya las tienen. Copiarlas aca seria garantizar que
-- en seis meses digan cosas distintas.
--
-- Correr BLOQUE POR BLOQUE. El bloque 8 va ENTERO de una sola vez.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Que estado SUGIERE cada tipo de gestion
--
-- SUGIERE, no decide. La pantalla lo propone y el que opera confirma: cambiar el
-- estado en silencio significaria que alguien descubre despues que su caso se
-- movio solo. Ver la nota del bloque 5.
--
-- POR QUE SE DEDUCE DEL TIPO DE GESTION Y NO DE LA ACCION FUTURA
-- La accion futura no alcanza: "Esperando respuesta del cliente" pasa igual en
-- negociacion que despues de una contrapropuesta. Y 'sin_respuesta' no lo dispara
-- ninguna gestion — lo dispara el TIEMPO.
--
-- motivo_sugerido: si el estado sugerido necesita motivo, se sugiere tambien. No
-- hay que pedirle al usuario que elija algo que ya esta implicito en lo que acaba
-- de decir ("el cliente acepto" -> motivo 'aceptacion').
-- =====================================================================
alter table public.crm_gestion_tipos
  add column if not exists estado_sugerido text,
  add column if not exists motivo_sugerido text;

alter table public.crm_gestion_tipos drop constraint if exists crm_gestion_tipos_estado_chk;
alter table public.crm_gestion_tipos add constraint crm_gestion_tipos_estado_chk
  check (estado_sugerido is null or estado_sugerido in (
    'pendiente_envio','enviada','sin_respuesta','en_renegociacion',
    'precerrada','cerrada','reclamo_posterior'));

alter table public.crm_gestion_tipos drop constraint if exists crm_gestion_tipos_motivo_chk;
alter table public.crm_gestion_tipos add constraint crm_gestion_tipos_motivo_chk
  check (motivo_sugerido is null or motivo_sugerido in ('aceptacion','tacita','rebaja','otro'));

comment on column public.crm_gestion_tipos.estado_sugerido is
  'Estado que este tipo de gestion SUGIERE. La pantalla lo propone y el usuario confirma; nunca se aplica en silencio. Null = no sugiere nada (la mayoria).';
comment on column public.crm_gestion_tipos.motivo_sugerido is
  'Motivo sugerido cuando el estado sugerido lo necesita (precerrada). Evita pedir un dato que ya esta implicito en el tipo elegido.';


-- =====================================================================
-- BLOQUE 2 — Las tres sugerencias
--
-- Los otros ocho tipos quedan en null a proposito.
-- =====================================================================
update public.crm_gestion_tipos set estado_sugerido = 'precerrada', motivo_sugerido = 'aceptacion'
 where nombre = 'El cliente aceptó';

update public.crm_gestion_tipos set estado_sugerido = 'en_renegociacion', motivo_sugerido = null
 where nombre = 'El cliente pidió una rebaja';

update public.crm_gestion_tipos set estado_sugerido = 'en_renegociacion', motivo_sugerido = null
 where nombre = 'Se envió una nueva propuesta';


-- =====================================================================
-- BLOQUE 3 — Que accion cerro cada gestion (el eslabon, sellado)
--
-- POR QUE NO ALCANZA cumple_accion_id DEL TIPO
-- Ese es el vinculo GENERICO del catalogo, y el catalogo se edita. Si dentro de
-- tres meses cambia el vinculo de un tipo, todas las gestiones viejas pasarian a
-- "haber cumplido" otra cosa sin que nadie las toque: el pasado se reescribiria
-- solo.
--
-- Esta columna se SELLA en el momento con la accion que el caso tenia pendiente,
-- antes de reemplazarla. Es lo que hace que la cadena se pueda leer eslabon por
-- eslabon, y lo que permite preguntar "cuantas veces reclamamos antes de que
-- contestaran".
--
-- Null = la gestion no cerro ningun eslabon (el camino suelto: el cliente llamo
-- sin previo aviso y la agenda no se toca).
-- =====================================================================
alter table public.crm_gestiones
  add column if not exists cumplio_accion_id uuid references public.crm_acciones(id) on delete set null;

comment on column public.crm_gestiones.cumplio_accion_id is
  'Que accion pendiente cerro esta gestion. SELLADA en el momento, no derivada del catalogo: si el vinculo del tipo cambia despues, el pasado no se reescribe. Null = no cerro ningun eslabon.';

create index if not exists idx_crm_gestiones_cumplio on public.crm_gestiones (cumplio_accion_id);


-- =====================================================================
-- BLOQUE 4 — El limpiado de agenda pasa a depender de una LISTA
--
-- Hasta ahora estaba clavado en 'precerrada'. Se cambia por la lista de estados
-- QUE CIERRAN EL CASO, para que:
--   · el dia que exista un estado de baja ("el cliente dejo de ser cliente", que
--     hoy NO existe entre los siete), sea una linea y no haya que acordarse de
--     este comportamiento;
--   · 'cerrada' quede cubierta de antemano. Hoy este RPC la rechaza —la confirma
--     el pago— pero cuando ese proceso automatico exista, va a tener que limpiar
--     la agenda o va a dejar alarmas sonando sobre casos ya cobrados.
--
-- Alcanza "create or replace": no cambian ni los parametros ni el retorno.
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
  -- Estados que CIERRAN el caso: no queda nada agendado.
  v_cierran text[] := array['precerrada','cerrada'];
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
         observaciones     = case when v_obs is null then c.observaciones
                                  else coalesce(c.observaciones || E'\n', '')
                                       || to_char(now(), 'YYYY-MM-DD') || ' - ' || v_obs end,

         -- LOS ESTADOS QUE CIERRAN LIMPIAN LA AGENDA. El caso termino: dejarle una
         -- fecha tope pendiente es una alarma que va a sonar sobre algo que ya no
         -- existe. Si vuelve por un reclamo posterior, ese estado exige accion y
         -- fecha nuevas, asi que no se pierde nada.
         proxima_accion_id      = case when p_estado = any (v_cierran) then null
                                       when p_accion_id is not null    then p_accion_id
                                       else c.proxima_accion_id end,
         fecha_proxima_accion   = case when p_estado = any (v_cierran) then null
                                       when p_accion_id is not null    then p_fecha
                                       else c.fecha_proxima_accion end,
         proxima_accion_detalle = case when p_estado = any (v_cierran) then null
                                       when p_accion_id is not null    then v_det
                                       else c.proxima_accion_detalle end
   where c.id = any (p_casos)
     and c.estado <> 'cerrada'
     and (c.estado is distinct from p_estado or p_accion_id is not null);

  get diagnostics v_n = row_count;
  return query select v_n;
end;
$$;

revoke execute on function public.crm_cambiar_estado(uuid[], text, text, text, uuid, date, text) from public, anon;
grant  execute on function public.crm_cambiar_estado(uuid[], text, text, text, uuid, date, text) to authenticated;


-- =====================================================================
-- BLOQUE 5 — EL RPC DE LA CADENA
--
-- Un solo acto: la gestion, el estado y el eslabon siguiente.
--
-- COMO DECIDE QUE HACER
--   · Si p_estado viene y es DISTINTO del actual -> crm_cambiar_estado, que mueve
--     el estado Y la agenda de una vez (y la limpia si el estado cierra el caso).
--   · Si el estado no cambia y hay accion nueva  -> crm_fijar_proxima_accion.
--   · Si no hay ninguna de las dos               -> solo la gestion (camino suelto).
--
-- Se compara contra el estado ACTUAL en vez de confiar en que la pantalla mande
-- null: la pantalla precarga el estado actual para que el caso normal sea no
-- tocarlo, asi que casi siempre va a llegar un estado igual al que ya tiene. Y si
-- ese estado es 'pendiente_envio' —que crm_cambiar_estado no acepta— mandarlo
-- igual haria fallar una operacion que no queria cambiar nada.
--
-- LA OBSERVACION solo viaja cuando el estado CAMBIA: asi el cambio queda explicado
-- (y 'precerrada' con motivo "otro" funciona sin pedir un texto mas). Si el estado
-- no se mueve, escribirla seria el mismo texto dos veces, porque ya esta en la
-- descripcion de la gestion.
-- =====================================================================
create or replace function public.crm_registrar_gestion(
  p_caso        uuid,
  p_tipo_id     uuid,
  p_fecha       date,
  p_descripcion text,
  p_canal       text default null,
  p_negociado   text default null,
  p_estado      text default null,
  p_motivo      text default null,
  p_accion_id   uuid default null,
  p_fecha_tope  date default null,
  p_detalle     text default null
)
returns table (
  gestion_id      uuid,
  estado_cambiado boolean,
  agenda_cambiada boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actual  text;
  v_pend    uuid;
  v_desc    text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_neg     text := nullif(btrim(coalesce(p_negociado, '')), '');
  v_canal   text := nullif(btrim(coalesce(p_canal, '')), '');
  v_tipo    text;
  v_activa  boolean;
  v_cambia  boolean;
  v_avanza  boolean;
  v_sella   uuid;
  v_gid     uuid;
  v_cierran text[] := array['precerrada','cerrada'];
begin
  -- El estado actual y el eslabon pendiente se leen ANTES de tocar nada: el
  -- pendiente es justamente lo que se va a reemplazar.
  select c.estado, c.proxima_accion_id into v_actual, v_pend
    from public.crm_casos c where c.id = p_caso;
  if not found then
    raise exception 'El caso % no existe.', p_caso;
  end if;

  if p_fecha is null then
    raise exception 'Falta la fecha del contacto.'
      using hint = 'Es la fecha en que paso, no la de carga.';
  end if;
  if v_desc is null then
    raise exception 'Falta la descripcion de la gestion.'
      using hint = 'Una gestion sin texto no sirve dentro de seis meses.';
  end if;

  select t.nombre, t.activa into v_tipo, v_activa
    from public.crm_gestion_tipos t where t.id = p_tipo_id;
  if not found then
    raise exception 'El tipo de gestion % no existe.', p_tipo_id;
  end if;
  if not v_activa then
    raise exception 'El tipo de gestion "%" esta desactivado.', v_tipo;
  end if;

  v_cambia := p_estado is not null and p_estado <> v_actual;
  -- La cadena AVANZA si se engancha un eslabon nuevo, o si el caso se cierra (que
  -- es la unica forma de cortarla).
  v_avanza := (p_accion_id is not null) or (v_cambia and p_estado = any (v_cierran));
  -- Se sella el eslabon que se esta cerrando. Si la cadena no avanza, no se cerro
  -- ninguno: el camino suelto deja la agenda como estaba.
  v_sella  := case when v_avanza then v_pend else null end;

  insert into public.crm_gestiones
    (caso_id, fecha, canal, descripcion, tipo_id, negociado_por_texto, cumplio_accion_id)
  values
    (p_caso, p_fecha, v_canal, v_desc, p_tipo_id, v_neg, v_sella)
  returning id into v_gid;

  if v_cambia then
    perform public.crm_cambiar_estado(
      array[p_caso], p_estado, p_motivo, v_desc, p_accion_id, p_fecha_tope, p_detalle);
  elsif p_accion_id is not null then
    perform public.crm_fijar_proxima_accion(
      array[p_caso], p_accion_id, p_fecha_tope, p_detalle);
  end if;

  return query select v_gid, v_cambia, (v_cambia or p_accion_id is not null);
end;
$$;


-- =====================================================================
-- BLOQUE 6 — Comentario y permisos
-- =====================================================================
comment on function public.crm_registrar_gestion(uuid, uuid, date, text, text, text, text, text, uuid, date, text) is
  'Un solo acto: registra la gestion, mueve el estado si cambia y engancha el eslabon siguiente de la cadena. Sella en la gestion que accion pendiente cerro. Delega las reglas en crm_cambiar_estado y crm_fijar_proxima_accion: no las reimplementa.';

revoke execute on function public.crm_registrar_gestion(uuid, uuid, date, text, text, text, text, text, uuid, date, text) from public, anon;
grant  execute on function public.crm_registrar_gestion(uuid, uuid, date, text, text, text, text, text, uuid, date, text) to authenticated;


-- =====================================================================
-- BLOQUE 7 — VERIFICACION (solo lee)
-- =====================================================================

-- (a) Las tres sugerencias, y que los otros ocho no sugieran nada.
select orden, nombre,
       coalesce(estado_sugerido, '(no sugiere)') as sugiere_estado,
       coalesce(motivo_sugerido, '-')            as sugiere_motivo
  from public.crm_gestion_tipos
 order by orden;

-- (b) Las columnas nuevas existen.
select table_name, column_name, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and (table_name = 'crm_gestiones'      and column_name = 'cumplio_accion_id')
    or (table_name = 'crm_gestion_tipos'  and column_name in ('estado_sugerido','motivo_sugerido'))
 order by table_name, column_name;

-- (c) Las tres funciones, sin anon ni PUBLIC.
select p.proname, p.prosecdef as es_definer,
       array_to_string(p.proacl, ' | ') as permisos
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('crm_registrar_gestion','crm_cambiar_estado','crm_fijar_proxima_accion')
 order by p.proname;


-- =====================================================================
-- BLOQUE 8 — PRUEBA DE LA CADENA
--
-- VA ENTERO, DE UNA SOLA VEZ. Cortado a la mitad, el rollback no alcanza al resto
-- y quedan gestiones de prueba en produccion.
--
-- Recorre un eslabon completo y controla las tres cosas: que la gestion quede, que
-- se selle el eslabon cerrado, y que la agenda avance.
-- =====================================================================
begin;

create temp table _p46 (paso text, resultado text) on commit drop;

do $$
declare
  v_caso  uuid;
  v_tipo  uuid;
  v_acc1  uuid;
  v_acc2  uuid;
  r       record;
  v_sella uuid;
  v_nueva uuid;
begin
  select id into v_caso from public.crm_casos
   where estado not in ('precerrada','cerrada') limit 1;
  select id into v_tipo from public.crm_gestion_tipos
   where activa and estado_sugerido is null order by orden limit 1;
  select id into v_acc1 from public.crm_acciones where activa and not requiere_detalle order by orden limit 1;
  select id into v_acc2 from public.crm_acciones where activa and not requiere_detalle and id <> v_acc1 order by orden limit 1;

  if v_caso is null or v_tipo is null or v_acc1 is null or v_acc2 is null then
    insert into _p46 values ('0 preparacion', 'SIN DATOS para probar');
    return;
  end if;

  -- Se deja un eslabon pendiente conocido.
  perform public.crm_fijar_proxima_accion(array[v_caso], v_acc1, current_date + 5, null);

  -- 1) Sin descripcion: tiene que fallar.
  begin
    perform public.crm_registrar_gestion(v_caso, v_tipo, current_date, '   ');
    insert into _p46 values ('1 sin descripcion', 'MAL - lo acepto');
  exception when others then
    insert into _p46 values ('1 sin descripcion', 'OK rechazado: ' || sqlerrm);
  end;

  -- 2) La cadena avanza: cumple el eslabon y engancha el siguiente.
  select * into r from public.crm_registrar_gestion(
    v_caso, v_tipo, current_date, 'prueba abm_46', 'celular', null,
    null, null, v_acc2, current_date + 12, null);

  select cumplio_accion_id into v_sella from public.crm_gestiones where id = r.gestion_id;
  select proxima_accion_id into v_nueva from public.crm_casos where id = v_caso;

  insert into _p46 values ('2 eslabon sellado',
    case when v_sella = v_acc1 then 'OK - sello la accion que estaba pendiente'
         else 'MAL - sello ' || coalesce(v_sella::text,'null') end);
  insert into _p46 values ('3 agenda avanzo',
    case when v_nueva = v_acc2 then 'OK - quedo la accion nueva'
         else 'MAL - quedo ' || coalesce(v_nueva::text,'null') end);
  insert into _p46 values ('4 estado',
    case when r.estado_cambiado then 'MAL - movio el estado sin pedirselo'
         else 'OK - no toco el estado' end);

  -- 5) Camino suelto: no se manda accion, la agenda no se toca y no sella nada.
  select * into r from public.crm_registrar_gestion(
    v_caso, v_tipo, current_date, 'prueba suelta abm_46');
  select cumplio_accion_id into v_sella from public.crm_gestiones where id = r.gestion_id;
  select proxima_accion_id into v_nueva from public.crm_casos where id = v_caso;
  insert into _p46 values ('5 camino suelto',
    case when v_sella is null and v_nueva = v_acc2
         then 'OK - no sello nada y dejo la agenda igual'
         else 'MAL - toco algo' end);
end $$;

select paso, resultado from _p46 order by paso;

rollback;

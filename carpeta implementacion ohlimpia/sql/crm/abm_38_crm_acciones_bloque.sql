-- =====================================================================
-- CRM — PASO 3a: acciones EN BLOQUE sobre los casos.
--
-- Es el soporte de la pantalla de lista. El documento de diseno dice que de
-- 300 casos, 280 no necesitan gestion: necesitan SALIR RAPIDO de la vista.
-- El marcado en bloque es la funcion central de la pantalla, no un extra.
--
-- POR QUE VAN COMO RPC Y NO COMO N UPDATES DESDE EL NAVEGADOR
-- Mismo motivo que crm_generar_casos: 280 casos se mueven en UNA sentencia,
-- o todos o ninguno. Desde el navegador, si se corta la red a mitad de
-- camino queda media tanda cambiada y sin forma de saber donde corto.
--
-- POR QUE LAS ACCIONES EN BLOQUE NO ESCRIBEN UNA GESTION
-- crm_gestiones.canal es not null con check de CINCO CANALES DE CONTACTO
-- (mail, celular, whatsapp, personal, intermediario). Un precierre por
-- tacita NO es un contacto con el cliente: el punto de la tacita es que no
-- hubo contacto. Forzarlo ahi obligaria a inventar un canal 'sistema' y
-- convertiria la bitacora de "registro de contactos" en "log de todo".
--
-- Y no hace falta: la AUDITORIA ya lo cubre. El bloque 7 de abm_34 puso
-- auditar_cambio() en crm_casos, asi que cada cambio de estado ya queda
-- registrado con usuario, fecha y el diff de antes/despues. La descripcion
-- opcional va a crm_casos.observaciones, que es lo que se lee al abrir el
-- caso.
--
-- Correr de a UN BLOQUE por vez, COPIANDO DESDE ESTE ARCHIVO (no desde el
-- chat: el texto largo se trunca en el camino y llega cortado, a veces sin
-- dar error). Los bloques estan ordenados para que cada uno DEPENDA del
-- anterior. Verificar contra el catalogo despues de cada bloque que cree
-- algo: el "Success" del editor no prueba nada.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Sellar QUIEN PRECERRO
--
-- El documento (seccion 5) es explicito: el vencimiento del plazo NO cambia
-- el estado solo, lo confirma Comercial en bloque, y eso es una decision de
-- RESPONSABILIDAD — un cambio de estado sin responsable es un problema si
-- despues se discute con el cliente.
--
-- precerrada_por / precerrada_email NO los puede poner el RPC: para leer el
-- usuario hay que llamar a auditoria_usuario(), que tiene el EXECUTE
-- revocado a authenticated. Lo sella un trigger, igual que cargado_por en
-- crm_gestiones y por el mismo motivo: si lo eligiera el que llama, deja de
-- servir como registro.
--
-- SOLO AL ENTRAR a precerrada y SOLO LA PRIMERA VEZ: el precierre original
-- sobrevive a un reclamo posterior (queda como registro de que hubo un
-- primer precierre, y cuando). Es lo que dice el comment de la columna.
-- =====================================================================
create or replace function public.crm_sellar_precierre()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid   uuid;
  v_email text;
  v_orig  text;
begin
  if new.estado = 'precerrada'
     and coalesce(old.estado, '') <> 'precerrada'
     and new.precerrada_at is null
  then
    select u.uid, u.email, u.origen
      into v_uid, v_email, v_orig
      from public.auditoria_usuario() u;

    new.precerrada_at    := now();
    new.precerrada_por   := v_uid;
    new.precerrada_email := v_email;
  end if;

  return new;
end;
$$;


-- =====================================================================
-- BLOQUE 2 — Permisos y trigger del sellado
--
-- Es SECURITY DEFINER (reusa auditoria_usuario(), que lee auth.users), asi
-- que se revoca a public, anon Y authenticated: es una funcion de trigger,
-- la app nunca la llama directo. Revocar el EXECUTE no apaga el trigger.
--
-- Si el bloque 1 no se aplico, este falla con "function does not exist".
-- =====================================================================
revoke execute on function public.crm_sellar_precierre() from public, anon, authenticated;

drop trigger if exists trg_crm_casos_precierre on public.crm_casos;
create trigger trg_crm_casos_precierre
  before update on public.crm_casos
  for each row execute function public.crm_sellar_precierre();


-- =====================================================================
-- BLOQUE 3 — VERIFICACION del sellado
--
-- Esperado:
--   (a) una fila: crm_sellar_precierre, es_definer = true, permisos SIN
--       anon, SIN PUBLIC y SIN authenticated.
--   (b) el trigger trg_crm_casos_precierre en crm_casos, BEFORE UPDATE.
-- =====================================================================
select p.proname,
       p.prosecdef                      as es_definer,
       array_to_string(p.proacl, ' | ') as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crm_sellar_precierre';

-- (b) — correr aparte
-- select trigger_name, action_timing, event_manipulation
--   from information_schema.triggers
--  where trigger_schema = 'public' and event_object_table = 'crm_casos'
--  order by trigger_name;


-- =====================================================================
-- BLOQUE 4 — Cambio de estado en bloque
--
-- Cubre precerrar, marcar sin respuesta y marcar en renegociacion.
--
-- 'cerrada' NO esta permitido a proposito: el cierre lo confirma el PAGO,
-- no una persona (seccion 5 del documento). Y los casos ya cerrados no se
-- tocan: una accion en bloque no puede reabrir algo que ya se cobro.
--
-- MOTIVO OBLIGATORIO EN EL PRECIERRE, DESCRIPCION OPCIONAL.
-- Decision de Juan (25-jul): exigir un texto en una accion de 280 casos
-- garantiza que se escriba "ok" 280 veces — ensucia la bitacora y da falsa
-- sensacion de detalle. El motivo ya es el dato que importa.
-- EXCEPCION: si el motivo es 'otro', la descripcion SI es obligatoria.
-- "otro" sin explicacion no dice nada dentro de seis meses.
--
-- IDEMPOTENTE: el where descarta los casos que YA estan en ese estado, asi
-- que re-ejecutar no re-sella el precierre ni vuelve a apilar la
-- observacion. El contador devuelto es de casos REALMENTE movidos.
-- =====================================================================
create or replace function public.crm_cambiar_estado(
  p_casos       uuid[],
  p_estado      text,
  p_motivo      text default null,
  p_observacion text default null
)
returns table (casos_actualizados integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_n   integer;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
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

  update public.crm_casos c
     set estado            = p_estado,
         precerrada_motivo = case when p_estado = 'precerrada' then p_motivo
                                  else c.precerrada_motivo end,
         -- La observacion se APILA con fecha, no pisa lo anterior.
         observaciones     = case when v_obs is null then c.observaciones
                                  else coalesce(c.observaciones || E'\n', '')
                                       || to_char(now(), 'YYYY-MM-DD') || ' - ' || v_obs end
   where c.id = any (p_casos)
     and c.estado <> 'cerrada'                -- lo cobrado no se reabre en bloque
     and c.estado is distinct from p_estado;  -- idempotencia

  get diagnostics v_n = row_count;
  return query select v_n;
end;
$$;


-- =====================================================================
-- BLOQUE 5 — Comentario y permisos del cambio de estado
-- Si el bloque 4 no se aplico, este falla con "function does not exist".
-- =====================================================================
comment on function public.crm_cambiar_estado(uuid[], text, text, text) is
  'Cambia el estado de varios casos en una sentencia. Motivo obligatorio al precerrar; descripcion obligatoria solo si el motivo es "otro". No toca casos cerrados ni los que ya estan en ese estado. Devuelve cuantos se movieron realmente.';

revoke execute on function public.crm_cambiar_estado(uuid[], text, text, text) from public, anon;
grant  execute on function public.crm_cambiar_estado(uuid[], text, text, text) to authenticated;


-- =====================================================================
-- BLOQUE 6 — Asignar responsable en bloque
--
-- TOCA LOS DOS: el CASO y el CLIENTE.
--   · El caso, para que aparezca en la agenda AHORA.
--   · El cliente, para que las proximas paritarias nazcan bien. Si solo
--     tocara el caso, el mismo trabajo se repetiria en cada tanda.
--
-- No contradice el "responsable congelado" de crm_casos: congelar significa
-- que el SISTEMA no vuelve a leer el cliente sobre casos viejos, no que una
-- persona no pueda escribir los dos a proposito.
--
-- PERO SE SEPARA EN DOS COMPORTAMIENTOS, y esta es la parte importante:
--   · Cliente SIN responsable  -> se completa SIEMPRE. Es el 100% de lo de
--     hoy (76 de 77 clientes sin RESP. NEG.), no hay nada que preguntar.
--   · Cliente que YA tiene otro -> solo con p_pisar_cliente = true.
--     Sin esa guarda, usar la accion para corregir UN caso puntual ("esta
--     negociacion la llevo otro, excepcionalmente") cambiaria en silencio el
--     responsable permanente del cliente y afectaria todas las paritarias
--     futuras.
--
-- Devuelve los tres numeros por separado para que la pantalla pueda decir
-- exactamente que va a pasar antes de confirmar.
-- =====================================================================
create or replace function public.crm_asignar_responsable(
  p_casos          uuid[],
  p_responsable_id uuid,
  p_pisar_cliente  boolean default false
)
returns table (
  casos_actualizados   integer,
  clientes_completados integer,
  clientes_pisados     integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_casos integer;
  v_comp  integer;
  v_pis   integer := 0;
begin
  if p_casos is null or array_length(p_casos, 1) is null then
    raise exception 'No se selecciono ningun caso.';
  end if;

  if not exists (select 1 from public.grupos_clientes where id = p_responsable_id) then
    raise exception 'El responsable % no existe.', p_responsable_id
      using hint = 'Tiene que ser un id de grupos_clientes (tipo = responsable).';
  end if;

  update public.crm_casos
     set responsable_id = p_responsable_id
   where id = any (p_casos)
     and responsable_id is distinct from p_responsable_id;
  get diagnostics v_casos = row_count;

  -- Clientes SIN responsable: se completan siempre.
  update public.clientes cl
     set responsable_id = p_responsable_id
   where cl.responsable_id is null
     and cl.id in (select c.cliente_id from public.crm_casos c where c.id = any (p_casos));
  get diagnostics v_comp = row_count;

  -- Clientes que YA tienen otro: solo si se pide explicitamente.
  if p_pisar_cliente then
    update public.clientes cl
       set responsable_id = p_responsable_id
     where cl.responsable_id is not null
       and cl.responsable_id <> p_responsable_id
       and cl.id in (select c.cliente_id from public.crm_casos c where c.id = any (p_casos));
    get diagnostics v_pis = row_count;
  end if;

  return query select v_casos, v_comp, v_pis;
end;
$$;


-- =====================================================================
-- BLOQUE 7 — Comentario y permisos de asignar responsable
-- Si el bloque 6 no se aplico, este falla con "function does not exist".
-- =====================================================================
comment on function public.crm_asignar_responsable(uuid[], uuid, boolean) is
  'Asigna responsable a varios casos y completa el RESP. NEG. de los clientes que no lo tengan. Los clientes que YA tienen otro responsable solo se pisan con p_pisar_cliente = true. Devuelve casos / clientes completados / clientes pisados.';

revoke execute on function public.crm_asignar_responsable(uuid[], uuid, boolean) from public, anon;
grant  execute on function public.crm_asignar_responsable(uuid[], uuid, boolean) to authenticated;


-- =====================================================================
-- BLOQUE 8 — VERIFICACION EN EL CATALOGO
--
-- Esperado: TRES filas.
--   crm_sellar_precierre     es_definer = true,  SIN authenticated
--   crm_cambiar_estado       es_definer = false, solo authenticated
--   crm_asignar_responsable  es_definer = false, solo authenticated
-- Ninguna con anon ni con PUBLIC.
-- =====================================================================
select p.proname,
       pg_get_function_arguments(p.oid) as argumentos,
       p.prosecdef                      as es_definer,
       array_to_string(p.proacl, ' | ') as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('crm_sellar_precierre','crm_cambiar_estado','crm_asignar_responsable')
 order by p.proname;


-- =====================================================================
-- BLOQUE 9 — PRUEBA
--
-- VA ENTERO DE UNA SOLA VEZ. El rollback es lo unico que deshace los
-- cambios. Cortado a la mitad, el editor abre otra sesion, el rollback no
-- alcanza al resto y quedan casos modificados en produccion.
--
-- Necesita casos creados. Si crm_casos esta vacia, correr antes
-- crm_generar_casos (abm_37) DENTRO de este mismo begin.
--
-- Esperado:
--   (a) 2 casos precerrados, con precerrada_at/por/email sellados por el
--       trigger y motivo 'tacita'.
--   (b) 0 la segunda vez: idempotente, y el precierre NO se re-sella.
--   (c) falla con "El motivo \"otro\" necesita una descripcion."
--   (d) falla con "El estado cerrada no se puede aplicar en bloque."
--   (e) responsable: casos actualizados > 0, clientes_completados > 0,
--       clientes_pisados = 0 (no se pidio pisar).
-- =====================================================================
-- begin;
--
-- -- Si hace falta, crear casos primero (reemplazar PARITARIA):
-- -- select * from public.crm_generar_casos('PARITARIA');
--
-- -- Tomamos 2 casos cualesquiera para probar.
-- create temp table zz_casos on commit drop as
--   select array_agg(id) as ids from (select id from public.crm_casos limit 2) t;
--
-- -- (a) precierre por tacita
-- select '(a) precerrar' as caso, *
--   from public.crm_cambiar_estado((select ids from zz_casos), 'precerrada', 'tacita');
--
-- select estado, precerrada_motivo, precerrada_email,
--        precerrada_at is not null as sello_puesto
--   from public.crm_casos where id = any ((select ids from zz_casos));
--
-- -- (b) otra vez: no mueve nada
-- select '(b) otra vez' as caso, *
--   from public.crm_cambiar_estado((select ids from zz_casos), 'precerrada', 'tacita');
--
-- -- (e) asignar responsable (reemplazar RESPONSABLE por un id de grupos_clientes)
-- -- select '(e) responsable' as caso, *
-- --   from public.crm_asignar_responsable((select ids from zz_casos), 'RESPONSABLE');
--
-- rollback;

-- (c) y (d) van SUELTAS, fuera de la transaccion: tienen que FALLAR.
-- select * from public.crm_cambiar_estado(array[gen_random_uuid()], 'precerrada', 'otro');
-- select * from public.crm_cambiar_estado(array[gen_random_uuid()], 'cerrada');

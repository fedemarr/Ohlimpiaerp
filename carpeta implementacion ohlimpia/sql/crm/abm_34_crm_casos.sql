-- =====================================================================
-- CRM de negociacion — PASO 1: modelo de datos.
--
-- Implementa el modelo de Diseno_CRM_Negociacion.md (secciones 4 y 5):
--   crm_casos            = un caso por cliente y por paritaria.
--   crm_gestiones        = bitacora: una fila por cada contacto con el cliente.
--   crm_gestion_adjuntos = archivos de cada gestion (bucket finflow-docs).
--
-- El caso se ata a PARITARIA, no a escala: la escala es el instrumento de
-- carga (varias escalas por paritaria, y hay clientes con aumento cargado a
-- mano sin escala). Se negocia la paritaria, no el instrumento.
--
-- OJO a futuro: unique (cliente_id, paritaria_id) con paritaria_id NOT NULL
-- asume que toda negociacion pertenece a una paritaria. La negociacion FUERA
-- DE TANDA (pendiente 3 del documento) va a obligar a revisar justo esto:
-- paritaria_id nullable + unique parcial. Se deja anotado a proposito.
--
-- Correr de a UN BLOQUE por vez en el editor de Supabase.
-- Idempotente (if not exists / drop if exists).
-- =====================================================================


-- =====================================================================
-- BLOQUE 0 — VERIFICACION PREVIA (read-only, no escribe nada)
--
-- El repo NO tiene el DDL de paritarias ni el de la ultima version de
-- notas_emitidas. Antes de crear nada hay que confirmar contra la base
-- que los nombres y tipos que asume este script son los reales.
--
-- Esperado:
--   (a) paritarias existe, con id uuid.
--   (b) notas_emitidas tiene paritaria_id y origen_id.
--   (c) clientes.responsable_id es uuid y apunta a grupos_clientes.
--
-- COMO SE CORRE: en DOS pasos, no en cuatro.
--   0.1 = a + b + c en una sola sentencia (union all). Todo sale de
--         information_schema: si una tabla o columna no existe, devuelve cero
--         filas, no error. Por eso se pueden unir sin riesgo.
--   0.2 = aparte, y DESPUES de 0.1. Consulta notas_emitidas.paritaria_id
--         directo: si esa columna no existiera, la sentencia entera falla y
--         se perderia tambien el resultado de a/b/c.
-- =====================================================================

-- ----- 0.1 — estructura (a + b + c en una sola corrida) -----
select 'a) paritarias' as chequeo,
       column_name    as dato,
       data_type || case when is_nullable = 'YES' then ' / nullable' else '' end as detalle
  from information_schema.columns
 where table_schema = 'public' and table_name = 'paritarias'

union all

select 'b) notas_emitidas',
       column_name,
       data_type
         || case when is_nullable = 'YES' then ' / nullable' else '' end
         || case when is_generated = 'ALWAYS' then ' / GENERADA' else '' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notas_emitidas'

union all

select 'c) FK responsable_id',
       kcu.column_name,
       'apunta a ' || ccu.table_name || '.' || ccu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
 where tc.table_schema = 'public' and tc.table_name = 'clientes'
   and tc.constraint_type = 'FOREIGN KEY'
   and kcu.column_name = 'responsable_id'

 order by 1, 2;

-- ----- 0.2 — cuantas notas traen paritaria_id cargado -----
-- Define si el caso puede relacionarse con su nota directo, o si hay que
-- pasar por escalas_aumento.paritaria_id cuando la nota vino por escala.
-- Correr SOLO despues de que 0.1 haya confirmado que la columna existe.
select count(*) filter (where paritaria_id is not null) as con_paritaria,
       count(*) filter (where paritaria_id is null)     as sin_paritaria,
       count(*)                                         as total
  from public.notas_emitidas;


-- =====================================================================
-- BLOQUE 1 — crm_casos
--
-- Un caso por cliente y por paritaria (unique al final).
--
-- responsable_id se GUARDA en el caso, no se lee del cliente: el caso es
-- historico. Si manana Comercial reasigna el cliente a otro responsable, los
-- casos viejos tienen que seguir mostrando quien lo tenia EN ESA paritaria.
-- Apunta a grupos_clientes (donde vive el RESP. NEG., tipo='responsable'),
-- no a personas.
--
-- precerrada_* registra quien y cuando (seccion 5 del documento: un cambio de
-- estado sin responsable es un problema si despues se discute).
-- cerrada_at NO tiene "cerrada_por" a proposito: el cierre lo confirma el pago,
-- no una persona.
-- =====================================================================
create table if not exists public.crm_casos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id)   on delete cascade,
  paritaria_id  uuid not null references public.paritarias(id) on delete restrict,

  estado text not null default 'pendiente_envio'
    check (estado in (
      'pendiente_envio',    -- la nota todavia no se envio
      'enviada',            -- nota enviada, esperando respuesta
      'sin_respuesta',      -- venció el tiempo razonable y no contesto
      'en_renegociacion',   -- hay negociacion abierta
      'precerrada',         -- acepto, o vencio el plazo de aceptacion tacita
      'cerrada',            -- pago una factura con el precio nuevo
      'reclamo_posterior'   -- revierte un precerrado
    )),

  -- RESP. NEG. congelado al abrir el caso (default: el del cliente).
  responsable_id uuid references public.grupos_clientes(id) on delete set null,

  fecha_proxima_accion date,

  -- Precierre: quien y cuando. Sobrevive a un reclamo posterior (queda como
  -- registro de que hubo un primer precierre, y cuando).
  precerrada_at     timestamptz,
  precerrada_por    uuid,
  precerrada_email  text,
  precerrada_motivo text check (precerrada_motivo in ('aceptacion','tacita','rebaja','otro')),

  -- Cierre: lo confirma el pago. Sin persona.
  cerrada_at timestamptz,

  observaciones text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_casos_cliente_paritaria_uk unique (cliente_id, paritaria_id)
);

comment on table public.crm_casos is
  'CRM de negociacion: un caso por cliente y por paritaria. Estado, responsable congelado y fecha de proxima accion. La bitacora vive en crm_gestiones.';
comment on column public.crm_casos.paritaria_id      is 'Paritaria que origina la negociacion. El caso NO se ata a la escala: la escala es el instrumento de carga y hay clientes con aumento manual sin escala.';
comment on column public.crm_casos.responsable_id    is 'RESP. NEG. congelado al abrir el caso (FK a grupos_clientes, tipo=responsable). Se guarda y no se lee del cliente para que reasignar un cliente no reescriba la historia.';
comment on column public.crm_casos.precerrada_por    is 'auth.uid() de quien confirmo el precierre. Null si el caso nunca se precerro.';
comment on column public.crm_casos.precerrada_motivo is 'aceptacion = el cliente acepto; tacita = vencio el plazo; rebaja = se cerro con precio menor; otro = despacho de un caso viejo mal cargado.';
comment on column public.crm_casos.cerrada_at        is 'Timestamp del cierre automatico al detectarse el pago con el precio nuevo. Sin persona asociada a proposito.';

create index if not exists idx_crm_casos_cliente     on public.crm_casos (cliente_id);
create index if not exists idx_crm_casos_paritaria   on public.crm_casos (paritaria_id, estado);
create index if not exists idx_crm_casos_responsable on public.crm_casos (responsable_id, estado);
-- El acceso mas frecuente de la pantalla: "que tengo que trabajar y cuando".
create index if not exists idx_crm_casos_agenda      on public.crm_casos (estado, fecha_proxima_accion);


-- =====================================================================
-- BLOQUE 2 — crm_gestiones (la bitacora)
--
-- DOS PERSONAS distintas por gestion (seccion 4.3 del documento):
--   negociado_por_persona_id = quien hablo con el cliente (coord. de cuenta).
--   cargado_por              = quien cargo el registro (Comercial). Lo sella
--                              un trigger, no lo elige el que carga.
--
-- No se puede derivar el coordinador del cliente: objetivo_comisionistas es
-- POR OBJETIVO y un cliente puede tener varios objetivos con coordinadores
-- distintos. Por eso la persona se guarda explicita en cada gestion.
--
-- negociado_por_texto cubre a quien no esta en personas (un intermediario,
-- un contacto del cliente).
--
-- on delete restrict contra el caso: la bitacora no se borra por arrastre.
-- =====================================================================
create table if not exists public.crm_gestiones (
  id      uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.crm_casos(id) on delete restrict,

  fecha date not null default current_date,   -- cuando ocurrio el contacto

  canal text not null
    check (canal in ('mail','celular','whatsapp','personal','intermediario')),

  descripcion text not null,

  -- Quien NEGOCIO
  negociado_por_persona_id uuid references public.personas(id) on delete set null,
  negociado_por_texto      text,

  -- Quien CARGO (sellado por trigger, ver bloque 5)
  cargado_por       uuid,
  cargado_por_email text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_gestiones is
  'Bitacora del caso: una fila por cada contacto con el cliente. No se borra (sin DELETE en RLS ni en los grants): si se cargo mal, se corrige agregando.';
comment on column public.crm_gestiones.fecha                    is 'Fecha en que ocurrio el contacto (no la de carga; esa es created_at).';
comment on column public.crm_gestiones.negociado_por_persona_id is 'Quien hablo con el cliente. Normalmente el coord. de cuenta. Se guarda explicito porque objetivo_comisionistas es por objetivo y el caso es por cliente.';
comment on column public.crm_gestiones.negociado_por_texto      is 'Nombre libre cuando quien negocio no esta en personas (intermediario, contacto del cliente).';
comment on column public.crm_gestiones.cargado_por              is 'auth.uid() de quien cargo el registro. Lo sella un trigger: no es un campo del formulario.';

create index if not exists idx_crm_gestiones_caso     on public.crm_gestiones (caso_id, fecha desc);
create index if not exists idx_crm_gestiones_persona  on public.crm_gestiones (negociado_por_persona_id);
create index if not exists idx_crm_gestiones_cargador on public.crm_gestiones (cargado_por, created_at desc);


-- =====================================================================
-- BLOQUE 3 — crm_gestion_adjuntos
--
-- Tabla aparte, no un array en la gestion: cada archivo tiene metadatos
-- propios (nombre original, mime, tamano, quien y cuando lo subio) y se
-- lista/borra de a uno.
--
-- Los archivos van al bucket finflow-docs con path UNICO y upsert:false,
-- igual que el resto del sistema (js/pages/precios.js): el archivo es
-- inmutable, nunca se pisa. Por eso path es UNIQUE aca tambien.
-- Convencion de path sugerida: crm/<caso_id>/<gestion_id>/<uuid>-<nombre>
-- =====================================================================
create table if not exists public.crm_gestion_adjuntos (
  id         uuid primary key default gen_random_uuid(),
  gestion_id uuid not null references public.crm_gestiones(id) on delete cascade,

  path   text not null unique,   -- path dentro del bucket finflow-docs
  nombre text not null,          -- nombre original del archivo
  mime   text,
  bytes  bigint,

  subido_por       uuid,
  subido_por_email text,

  created_at timestamptz not null default now()
);

comment on table public.crm_gestion_adjuntos is
  'Adjuntos de una gestion (propuesta formal, nota enviada, factura). El archivo vive en el bucket finflow-docs con path unico e inmutable; aca van los metadatos.';
comment on column public.crm_gestion_adjuntos.path is 'Path dentro del bucket finflow-docs. UNIQUE: el archivo se sube con upsert:false y nunca se pisa.';

create index if not exists idx_crm_adjuntos_gestion on public.crm_gestion_adjuntos (gestion_id);


-- =====================================================================
-- BLOQUE 4 — updated_at automatico
-- Reusa public.set_updated_at() (schema.sql).
-- =====================================================================
-- crm_gestion_adjuntos NO va: no tiene columna updated_at (el adjunto es
-- inmutable). El trigger fallaria al escribir una columna que no existe.
do $$
declare t text;
begin
  foreach t in array array['crm_casos','crm_gestiones'] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on public.%1$s;
       create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- Prueba del trigger (VERIFICADA 25-jul). Va ENTERA de una sola vez:
-- el update escribe una fecha inventada y el rollback es lo unico que la
-- saca. Cortada a la mitad, esa fila queda en produccion con fecha 2000.
--
-- POR QUE NO SE PRUEBA CON "updated_at > created_at":
-- now() NO devuelve el instante actual: devuelve el INICIO DE LA
-- TRANSACCION, y es constante durante toda la transaccion. Dentro de un
-- begin ... rollback el insert y el update reciben el mismo valor. Como
-- created_at (default) y updated_at (trigger) salen los dos de now(),
-- quedan identicos CORRA O NO CORRA el trigger: los dos escenarios dan el
-- mismo resultado y la prueba no distingue nada.
--
-- Esta prueba si discrimina: fuerza un valor falso y mira si el trigger lo
-- PISA. Si lo pisa, funciona. Si queda el ano 2000, no corre.
-- (Para medir tiempo que avanza entre sentencias va clock_timestamp().)
-- ---------------------------------------------------------------------
-- begin;
-- insert into public.crm_casos (cliente_id, paritaria_id)
--   select c.id, p.id from public.clientes c, public.paritarias p limit 1;
--
-- update public.crm_casos
--    set observaciones = 'prueba',
--        updated_at    = timestamptz '2000-01-01 00:00:00+00';
--
-- select updated_at,
--        updated_at <> timestamptz '2000-01-01 00:00:00+00' as el_trigger_piso_el_valor,
--        updated_at =  now()                                as quedo_en_la_hora_real
--   from public.crm_casos;
-- rollback;


-- =====================================================================
-- BLOQUE 5 — Sellar QUIEN CARGO
--
-- cargado_por / subido_por no se piden en el formulario: los pone el servidor
-- desde el JWT. Si fueran campos del alta, "quien cargo" seria un dato que el
-- que carga elige, y deja de servir como registro.
--
-- SECURITY DEFINER porque reusa auditoria_usuario(), que lee auth.users.
-- Por la regla del proyecto: se revoca EXECUTE a public, anon Y authenticated
-- (es una funcion de trigger, la app nunca la llama directo).
-- =====================================================================
create or replace function public.crm_sellar_usuario()
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
  select u.uid, u.email, u.origen
    into v_uid, v_email, v_orig
    from public.auditoria_usuario() u;

  if tg_table_name = 'crm_gestiones' then
    new.cargado_por       := v_uid;
    new.cargado_por_email := v_email;
  else
    new.subido_por        := v_uid;
    new.subido_por_email  := v_email;
  end if;

  return new;
end;
$$;

revoke execute on function public.crm_sellar_usuario() from public, anon, authenticated;

drop trigger if exists trg_crm_gestiones_sellar on public.crm_gestiones;
create trigger trg_crm_gestiones_sellar
  before insert on public.crm_gestiones
  for each row execute function public.crm_sellar_usuario();

drop trigger if exists trg_crm_adjuntos_sellar on public.crm_gestion_adjuntos;
create trigger trg_crm_adjuntos_sellar
  before insert on public.crm_gestion_adjuntos
  for each row execute function public.crm_sellar_usuario();


-- =====================================================================
-- BLOQUE 6 — RLS + grants
--
-- crm_casos: patron auth_all del sistema (ALL para authenticated). El caso es
-- estado regenerable; si se abre una tanda por error hay que poder borrarla.
--
-- crm_gestiones y crm_gestion_adjuntos: DESVIACION DELIBERADA del patron.
-- El documento dice que la bitacora no se borra, y el unico lugar donde eso
-- se puede hacer cumplir es aca. Sin politica de DELETE y sin el grant, no
-- hay delete posible desde la app.
--   gestiones: select, insert, update (para corregir una descripcion).
--   adjuntos : select, insert (el archivo en Storage es inmutable; un adjunto
--              mal subido se resuelve subiendo el correcto).
-- =====================================================================
alter table public.crm_casos            enable row level security;
alter table public.crm_gestiones        enable row level security;
alter table public.crm_gestion_adjuntos enable row level security;

drop policy if exists crm_casos_all on public.crm_casos;
create policy crm_casos_all on public.crm_casos
  for all to authenticated using (true) with check (true);

drop policy if exists crm_gestiones_select on public.crm_gestiones;
create policy crm_gestiones_select on public.crm_gestiones
  for select to authenticated using (true);

drop policy if exists crm_gestiones_insert on public.crm_gestiones;
create policy crm_gestiones_insert on public.crm_gestiones
  for insert to authenticated with check (true);

drop policy if exists crm_gestiones_update on public.crm_gestiones;
create policy crm_gestiones_update on public.crm_gestiones
  for update to authenticated using (true) with check (true);

drop policy if exists crm_adjuntos_select on public.crm_gestion_adjuntos;
create policy crm_adjuntos_select on public.crm_gestion_adjuntos
  for select to authenticated using (true);

drop policy if exists crm_adjuntos_insert on public.crm_gestion_adjuntos;
create policy crm_adjuntos_insert on public.crm_gestion_adjuntos
  for insert to authenticated with check (true);

-- ----- 6.4 — Grants: espejo exacto de las politicas -----
-- Supabase aplica default privileges en el schema public: cada tabla nueva nace
-- con ALL para authenticated. Revocar solo a public y anon deja ese ALL intacto,
-- y el grant de abajo suma pero no resta. Por eso se revoca TAMBIEN a
-- authenticated ANTES de otorgar.
--
-- Lo que se le sacaba de encima a la bitacora:
--   TRUNCATE  = no pasa por RLS y no dispara triggers FOR EACH ROW. Un
--               authenticated vaciaba crm_gestiones entera, sin politica que lo
--               frene y sin quedar en auditoria. Este era el agujero real.
--   DELETE    = hoy lo frena RLS (no hay politica), pero la idea es tener dos
--               candados independientes sobre "la bitacora no se borra".
--   REFERENCES/TRIGGER = no los necesita la app.
--
-- crm_casos conserva DELETE (el caso es estado regenerable, una tanda abierta
-- por error tiene que poder borrarse) pero NO TRUNCATE: vaciar la tabla de un
-- saque saltea la auditoria igual.
revoke all on public.crm_casos            from public, anon, authenticated;
revoke all on public.crm_gestiones        from public, anon, authenticated;
revoke all on public.crm_gestion_adjuntos from public, anon, authenticated;

grant select, insert, update, delete on public.crm_casos            to authenticated;
grant select, insert, update         on public.crm_gestiones        to authenticated;
grant select, insert                 on public.crm_gestion_adjuntos to authenticated;


-- =====================================================================
-- BLOQUE 7 — Auditoria
--
-- El CRM va a modificar precios: entra a la auditoria desde el arranque.
-- Trigger FILA POR FILA (no statement-level): el volumen es de ~300 casos por
-- paritaria. El problema de las 13.713 filas era objetivo_precios, no esto.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'crm_casos',
    'crm_gestiones',
    'crm_gestion_adjuntos'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_auditoria on public.%1$s;
       create trigger trg_%1$s_auditoria
         after insert or update or delete on public.%1$s
         for each row execute function public.auditar_cambio();', t
    );
  end loop;
end $$;


-- =====================================================================
-- BLOQUE 8 — VERIFICACION
-- =====================================================================

-- (a) las tres tablas creadas, 0 filas
select 'crm_casos' as tabla, count(*) as filas from public.crm_casos
union all
select 'crm_gestiones',        count(*) from public.crm_gestiones
union all
select 'crm_gestion_adjuntos', count(*) from public.crm_gestion_adjuntos;

-- (b) RLS activo en las tres
select relname, relrowsecurity, relforcerowsecurity
  from pg_class
 where relname in ('crm_casos','crm_gestiones','crm_gestion_adjuntos');

-- (c) politicas: crm_casos ALL; gestiones SELECT/INSERT/UPDATE; adjuntos SELECT/INSERT.
--     NO tiene que aparecer ningun DELETE en gestiones ni en adjuntos.
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename like 'crm_%'
 order by tablename, cmd;

-- (d) grants: mismo criterio que las politicas. anon y public NO deben aparecer.
--     Para authenticated se espera EXACTAMENTE:
--       crm_casos            = DELETE, INSERT, SELECT, UPDATE
--       crm_gestiones        = INSERT, SELECT, UPDATE
--       crm_gestion_adjuntos = INSERT, SELECT
--     Ningun TRUNCATE ni REFERENCES en ninguna de las tres: los agrega Supabase
--     solo al crear la tabla y hay que revocarlos a mano (ver 6.4).
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as permisos
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name like 'crm_%'
 group by table_name, grantee
 order by table_name, grantee;

-- (e) la funcion de sellado: SECURITY DEFINER y SIN execute para anon/public/authenticated
select p.proname, p.prosecdef, array_to_string(p.proacl, ' | ') as permisos
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crm_sellar_usuario';

-- (f) triggers enganchados (updated_at, sellado y auditoria)
select event_object_table as tabla, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
 where trigger_schema = 'public' and event_object_table like 'crm_%'
 order by tabla, trigger_name;

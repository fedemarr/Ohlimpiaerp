-- =====================================================================
-- CRM — PASO 3b: la PROXIMA ACCION.
--
-- Implementa la seccion 10 de Diseno_CRM_Negociacion.md.
--
-- POR QUE TRES CAMPOS Y NO UNO
-- La proxima accion no es "que hacer", es "que se espera y de quien depende".
-- "Llamar" no se puede agrupar con nada; "A resolver con el Consejo" si. Por eso
-- QUE ACCION sale de una lista cerrada (es el unico campo agrupable), la FECHA
-- TOPE ordena la agenda, y el DETALLE libre queda al lado sin contaminar lo que
-- se cuenta. Con un solo campo de texto libre volvemos a "Llamar".
--
-- La fecha ya existe (crm_casos.fecha_proxima_accion, desde abm_34). Este script
-- agrega los otros dos y la tabla de la lista.
--
-- NO HAY FUNCIONES ACA: ninguna SECURITY DEFINER que revocar.
--
-- Correr BLOQUE POR BLOQUE. El bloque 6 es solo verificacion.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Tabla de acciones configurables
--
-- POR QUE UNA TABLA Y NO UN CHECK CON LA LISTA ADENTRO
-- Es una lista de ETIQUETAS, no de estados. Los estados van fijos en un check
-- porque tienen logica colgada (precerrada saca el caso de la vista, cerrada la
-- confirma el pago): agregar un estado es cambiar el comportamiento del sistema.
-- Estas no disparan nada, solo describen y agrupan. Se tocan por configuracion.
--
-- POR QUE "activa" Y NO BORRAR
-- Una accion que se deja de usar NO se borra: hay casos historicos apuntando a
-- ella, y borrarla los dejaria sin explicacion de por que estaban frenados. Se
-- desactiva: deja de ofrecerse en la pantalla y sigue explicando el pasado.
-- =====================================================================
create table if not exists public.crm_acciones (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,

  -- Orden de la lista en pantalla. No alfabetico: el orden lo define el circuito
  -- (primero lo que mas se usa), y alfabetico dejaria "A resolver..." arriba de
  -- "Esperando respuesta", que es la mas frecuente.
  orden  smallint not null default 100,

  activa boolean not null default true,

  -- "Otro" sin explicacion no dice nada dentro de seis meses. La bandera vive en
  -- la fila y no en el codigo para que una accion nueva pueda pedir detalle sin
  -- tocar la aplicacion.
  requiere_detalle boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_acciones is
  'Lista configurable de proximas acciones del CRM. Etiquetas agrupables: son las que permiten preguntar "cuantos casos estan frenados esperando al Consejo". Editable SOLO desde el editor de Supabase (ver bloque 5).';
comment on column public.crm_acciones.activa is
  'Una accion retirada se desactiva, NO se borra: hay casos historicos apuntando a ella.';
comment on column public.crm_acciones.requiere_detalle is
  'Si es true, la pantalla exige el detalle libre. Hoy solo "Otro".';

-- Lista de la pantalla: las activas, en su orden.
create index if not exists idx_crm_acciones_activas on public.crm_acciones (activa, orden);

-- updated_at automatico, mismo patron que crm_casos (reusa set_updated_at de schema.sql).
drop trigger if exists trg_crm_acciones_updated_at on public.crm_acciones;
create trigger trg_crm_acciones_updated_at before update on public.crm_acciones
for each row execute function public.set_updated_at();


-- =====================================================================
-- BLOQUE 2 — Carga de la lista PROVISORIA
--
-- Juan la cierra con Comercial el lunes 27 de julio de 2026. Hasta entonces
-- estos siete son un punto de partida, no la lista definitiva.
--
-- Idempotente: on conflict do nothing. Re-correr el bloque no duplica ni pisa
-- un nombre que se haya ajustado a mano.
--
-- "Otro" va con el nombre pelado y la regla en requiere_detalle, no como
-- "Otro (con descripcion obligatoria)": el parentesis es una regla de
-- comportamiento, no parte del nombre. Metido en el nombre viajaria a todos los
-- reportes y a cada listado.
-- =====================================================================
insert into public.crm_acciones (nombre, orden, requiere_detalle) values
  ('Esperando respuesta del cliente',       10, false),
  ('Enviar nueva propuesta al cliente',     20, false),
  ('A resolver con el Consejo',             30, false),
  ('A resolver con el Coordinador de Cuenta', 40, false),
  ('Reenviar la nota',                      50, false),
  ('Esperando documentación del cliente',   60, false),
  ('Otro',                                  99, true)
on conflict (nombre) do nothing;


-- =====================================================================
-- BLOQUE 3 — Los dos campos nuevos en crm_casos
--
-- La fecha ya estaba (fecha_proxima_accion, abm_34).
--
-- on delete RESTRICT a proposito: si alguien intenta borrar una accion que
-- todavia usan casos, la base lo frena. Es la contracara de "activa": para sacar
-- una accion de circulacion se desactiva, no se borra.
-- =====================================================================
alter table public.crm_casos
  add column if not exists proxima_accion_id      uuid references public.crm_acciones(id) on delete restrict,
  add column if not exists proxima_accion_detalle text;

comment on column public.crm_casos.proxima_accion_id is
  'Que se esta esperando. Es el campo AGRUPABLE: el que responde "cuantos casos estan frenados esperando al Consejo".';
comment on column public.crm_casos.proxima_accion_detalle is
  'Texto libre OPCIONAL del caso puntual (a quien se llamo, que dijo). No se agrupa: no reemplaza a proxima_accion_id.';

-- Indice de la estadistica por accion. El de la agenda (estado, fecha_proxima_accion)
-- ya existe desde abm_34 y no se toca.
create index if not exists idx_crm_casos_prox_accion on public.crm_casos (proxima_accion_id, estado);


-- =====================================================================
-- BLOQUE 4 — RLS de crm_acciones
--
-- SELECT para authenticated y NADA MAS. No es el patron auth_all del resto del
-- sistema, y es a proposito: la lista se lee desde la pantalla pero se escribe
-- solo desde el editor de Supabase.
--
-- SIN "force row level security": el dueno de la tabla tiene que poder escribirla
-- desde el editor. Con FORCE, RLS alcanzaria tambien al dueno y no habria forma
-- de cargar una accion.
-- =====================================================================
alter table public.crm_acciones enable row level security;

drop policy if exists crm_acciones_select on public.crm_acciones;
create policy crm_acciones_select on public.crm_acciones
  for select to authenticated using (true);


-- =====================================================================
-- BLOQUE 5 — Permisos de crm_acciones
--
-- El candado real de "editable solo por Juan" es este: authenticated NO recibe
-- insert/update/delete. Aunque manden el pedido a mano, la base lo rechaza.
--
-- Hoy no hay forma de distinguir a Juan de Comercial DENTRO de la base: no existe
-- tabla de perfiles y las 8 politicas del sistema apuntan todas a authenticated.
-- El unico que puede escribir esta tabla es quien entra al editor de Supabase, y
-- ese es Juan. Cuando existan los perfiles diferenciados, se agrega la politica de
-- escritura y la pantalla de configuracion; la tabla no cambia.
-- =====================================================================
revoke all on public.crm_acciones from public, anon, authenticated;
grant select on public.crm_acciones to authenticated;


-- =====================================================================
-- BLOQUE 6 — VERIFICACION (solo lee, no cambia nada)
-- =====================================================================

-- (a) Las siete acciones, en su orden de pantalla.
select orden, nombre, activa, requiere_detalle
  from public.crm_acciones
 order by orden;

-- (b) Los dos campos nuevos existen y la fecha sigue estando.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'crm_casos'
   and column_name in ('fecha_proxima_accion','proxima_accion_id','proxima_accion_detalle')
 order by column_name;

-- (c) Permisos: authenticated tiene que tener SELECT y NADA mas.
--     anon y public no tienen que aparecer.
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'crm_acciones'
 order by grantee, privilege_type;

-- (d) RLS prendida y una sola politica, de select.
select c.relrowsecurity as rls_activa, c.relforcerowsecurity as rls_forzada,
       p.polname, p.polcmd
  from pg_class c
  left join pg_policy p on p.polrelid = c.oid
 where c.relname = 'crm_acciones';

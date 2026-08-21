-- =====================================================================
-- v097 — CRM de Negociacion + Precios LIGE
-- Consolidacion de scripts de FinFlow (carpeta implementacion ohlimpia)
-- Adaptado para Ohlimpia ERP
--
-- Este archivo consolida los siguientes scripts de FinFlow:
--   base/schema.sql (sucursales + set_updated_at)
--   precios/abm_18 through abm_50 (precios, escalas, notas, snapshots, auditoria)
--   crm/abm_34 through abm_48 (CRM negociacion completo)
--
-- NO incluye (superseded):
--   abm_36, abm_37, abm_41, abm_42
--
-- Ejecutar en Supabase Dashboard > SQL Editor, de a bloques si es necesario.
-- =====================================================================


-- =====================================================================
-- BLOQUE 0 — Funcion set_updated_at
-- Ohlimpia usa tg_set_updated_at() (v002) pero los scripts de FinFlow
-- llaman a set_updated_at(). Se crea como alias para compatibilidad.
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =====================================================================
-- BLOQUE 0b — Tabla sucursales
-- =====================================================================

create table if not exists public.sucursales (
    id             uuid primary key default gen_random_uuid(),
    cliente_id     uuid not null references public.clientes(id) on delete cascade,
    nombre         text not null,
    direccion      text,
    activo         boolean not null default true,
    observaciones  text,
    odoo_id        text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists idx_sucursales_cliente on public.sucursales(cliente_id);
create index if not exists idx_sucursales_odoo_id on public.sucursales(odoo_id);

comment on table public.sucursales is 'Sucursales/locales de un cliente. FK desde objetivo_precios.';

-- =====================================================================
-- BLOQUE 0c — Adaptación Ohlimpia: tablas/columnas de FinFlow que la base
-- de Ohlimpia NO tenía (venían de migraciones previas de FinFlow que no
-- forman parte de esta carpeta). Sin este bloque, v097 falla:
--   · paritarias_detalle      → no existe (la usa el trigger de auditoría
--                               y el módulo Precios)
--   · personas                → no existe (FK de crm_gestiones y la usa
--                               Precios para coordinadores)
--   · industrias              → no existe (Precios la lee al iniciar)
--   · indices_economicos      → no existe (Precios lee horizonte_meses)
--   · clientes: industria_id, responsable_id, descuento_pronto_pago,
--     email_para, email_cc    → columnas que FinFlow ya tenía y el CRM/
--                               Precios escriben o leen (grupo_id lo agrega
--                               abm_26 más abajo)
--   · paritarias: codigo, descripcion, color, nota_generica, activa,
--     acta_*/homologacion_*   → columnas del modelo FinFlow que Precios
--                               gestiona desde su pantalla de paritarias
-- Todo es idempotente (if not exists / add column if not exists), así que
-- re-ejecutar el archivo completo no rompe nada.
-- =====================================================================

-- 1) industrias — catálogo simple para filtrar clientes en Precios
create table if not exists public.industrias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  created_at timestamptz not null default now()
);
alter table public.industrias enable row level security;
drop policy if exists industrias_all on public.industrias;
create policy industrias_all on public.industrias for all to authenticated using (true) with check (true);

-- 2) personas — coordinadores de cuenta / firmantes (CRM + Precios)
create table if not exists public.personas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.personas enable row level security;
drop policy if exists personas_all on public.personas;
create policy personas_all on public.personas for all to authenticated using (true) with check (true);

-- 3) indices_economicos — Precios lee 'horizonte_meses' para el ancho de
-- la matriz. Seed con el default si todavía no hay ninguna fila.
create table if not exists public.indices_economicos (
  id         bigint generated always as identity primary key,
  mes        text not null,
  tipo       text not null,
  valor      numeric not null,
  created_at timestamptz not null default now()
);
alter table public.indices_economicos enable row level security;
drop policy if exists indices_economicos_all on public.indices_economicos;
create policy indices_economicos_all on public.indices_economicos for all to authenticated using (true) with check (true);
insert into public.indices_economicos (mes, tipo, valor)
select to_char(now(), 'YYYY-MM') || '-01', 'horizonte_meses', 12
where not exists (select 1 from public.indices_economicos where tipo = 'horizonte_meses');

-- 4) Columnas nuevas en clientes (modelo FinFlow)
alter table public.clientes
  add column if not exists industria_id uuid references public.industrias(id) on delete set null,
  add column if not exists responsable_id uuid,          -- FK a grupos_clientes se agrega en abm_26/CRM
  add column if not exists descuento_pronto_pago numeric not null default 0,
  add column if not exists email_para text,
  add column if not exists email_cc text;

-- 5) Columnas del modelo FinFlow sobre la paritarias de Ohlimpia
alter table public.paritarias
  add column if not exists codigo text,
  add column if not exists descripcion text,
  add column if not exists color text,
  add column if not exists nota_generica text,
  add column if not exists activa boolean not null default true,
  add column if not exists acta_url text,
  add column if not exists acta_path text,
  add column if not exists acta_nombre text,
  add column if not exists homologacion_path text,
  add column if not exists homologacion_nombre text;

-- 6) paritarias_detalle — renglones mes/% de cada paritaria (Precios los
-- carga, borra y reguarda al editar). UNIQUE (paritaria_id, mes).
create table if not exists public.paritarias_detalle (
  id           bigint generated always as identity primary key,
  paritaria_id uuid not null references public.paritarias(id) on delete cascade,
  mes          date not null,
  pct_aumento  numeric not null,
  unique (paritaria_id, mes)
);
alter table public.paritarias_detalle enable row level security;
drop policy if exists paritarias_detalle_all on public.paritarias_detalle;
create policy paritarias_detalle_all on public.paritarias_detalle for all to authenticated using (true) with check (true);

-- 7) Código auto-generado de paritaria (en FinFlow lo sellaba un trigger
-- de su migración base; acá reproducimos ese comportamiento). Solo llena
-- el código cuando viene vacío: P-001, P-002, ...
create or replace function public.generar_codigo_paritaria()
returns trigger language plpgsql as $$
declare proximo int;
begin
  if new.codigo is null or new.codigo = '' then
    select coalesce(max((regexp_match(codigo, '^P-(\d+)$'))[1]::int), 0) + 1 into proximo from public.paritarias where codigo ~ '^P-\d+$';
    new.codigo := 'P-' || lpad(proximo::text, 3, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_paritarias_codigo on public.paritarias;
create trigger trg_paritarias_codigo
  before insert on public.paritarias
  for each row execute function public.generar_codigo_paritaria();

-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_18_objetivo_precios.sql
-- =====================================================================

-- =====================================================================
-- Etapa A â€” objetivo_precios: precio por OBJETIVO por mes (una fila por mes,
-- como la vieja clientes_precios pero ligada a sucursales/objetivo en vez de
-- cliente+contrato). Fuente principal: Base Precios LIGE (Importe Hora A).
--
-- UNIQUE (sucursal_id, mes, tipo_servicio): hoy cada objetivo es mono-servicio,
-- asi que equivale a (sucursal_id, mes); se deja tipo_servicio por si un objetivo
-- llega a tener precio de vigilancia + custodia (caso que existia en el modelo
-- viejo: EDESUR/DIA) o para la segunda tarifa (Importe Hora B) sin migrar esquema.
--
-- precio_hora   = Importe Hora A de LIGE -> es EL QUE SE FACTURA.
-- precio_hora_b = Importe Hora B de LIGE -> espejado de referencia, SIN uso actual.
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================

create table if not exists public.objetivo_precios (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null references public.sucursales(id) on delete cascade,  -- el objetivo
  codigo_objetivo text,                                                             -- redundante (lectura/cruce)
  cliente_id     uuid references public.clientes(id) on delete cascade,             -- agrupar por cliente sin join
  mes            date not null,                                                     -- dia 1 del mes
  precio_hora    numeric not null check (precio_hora >= 0),                         -- Importe Hora A de LIGE (SE FACTURA); o monto si tipo_precio='fijo'
  precio_hora_b  numeric,                                                           -- Importe Hora B de LIGE (referencia, SIN uso actual)
  horas_vendidas numeric,                                                           -- opcional (facturacion futura)
  tipo           text not null check (tipo in ('real','proyectado')),
  tipo_precio    text not null default 'hora' check (tipo_precio in ('hora','fijo')),
  tipo_servicio  text check (tipo_servicio in ('vigilancia','custodia','otro')),    -- hereda del objetivo (sucursales)
  fuente         text check (fuente in ('lige','historico_viejo','manual','proyectado')),
  pct_aumento    numeric,                                                           -- % aumento del mes (trazabilidad)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (sucursal_id, mes, tipo_servicio)
);

comment on column public.objetivo_precios.precio_hora   is 'Importe Hora A de LIGE: es el valor que SE FACTURA (o monto mensual si tipo_precio=fijo).';
comment on column public.objetivo_precios.precio_hora_b is 'Importe Hora B de LIGE: espejado/de referencia. SIN uso actual (no se factura); se guarda hasta aclarar que significa.';

create index if not exists idx_obj_precios_suc_mes on public.objetivo_precios (sucursal_id, mes);
create index if not exists idx_obj_precios_cli_mes on public.objetivo_precios (cliente_id, mes);
create index if not exists idx_obj_precios_cod     on public.objetivo_precios (codigo_objetivo);

-- verificacion (tabla nueva, 0 filas; columnas creadas)
select count(*) as filas from public.objetivo_precios;
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='objetivo_precios'
 order by ordinal_position;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_19_tipo_negociado.sql
-- =====================================================================

-- =====================================================================
-- Etapa A â€” objetivo_precios: ampliar el CHECK de 'tipo' con 'negociado'.
--   real      = mes cerrado, ya facturado.
--   negociado = mes futuro con precio YA acordado con el cliente (firme).
--   proyectado= mes futuro estimado (no negociado aun).
-- Solo se AMPLIA el CHECK (tabla vacia); ningun dato existente puede violarlo.
-- Sin begin/commit.
-- =====================================================================

-- PREVIA: definicion actual del CHECK (esperado: tipo in ('real','proyectado'))
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where contype='c' and conrelid = 'public.objetivo_precios'::regclass;

alter table public.objetivo_precios drop constraint if exists objetivo_precios_tipo_check;
alter table public.objetivo_precios add constraint objetivo_precios_tipo_check
  check (tipo in ('real','negociado','proyectado'));

-- POSTERIOR: CHECK ampliado (esperado: tipo in ('real','negociado','proyectado'))
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where contype='c' and conrelid = 'public.objetivo_precios'::regclass;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_24_escalas_aumento.sql
-- =====================================================================

-- =====================================================================
-- Escalas de aumento (paritarias) â€” PASO 1: estructura.
--
-- Juan arma "escalas de aumento" por paritaria (2-4 por aÃ±o). Cada escala
-- es una secuencia de aumentos por mes (ej. 8% en 07/2026, 6% en 09/2026,
-- 5% en 11/2026). Luego filtra un grupo de clientes (por rubro / coordinador
-- / lista) y aplica la escala a todos de una vez (eso es un paso posterior;
-- acÃ¡ solo se crean las tablas que guardan las escalas).
--
--   escalas_aumento          = la escala (cabecera).
--   escalas_aumento_detalle  = los meses y % de cada escala (renglones).
--
-- Sin datos de ejemplo (Juan las carga desde la pantalla).
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) escalas_aumento (cabecera de la escala)
-- ---------------------------------------------------------------------
create table if not exists public.escalas_aumento (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                          -- ej. "Paritaria Jul-Dic 2026 - Consorcios"
  descripcion text,
  paritaria   text,                                   -- ej. "Jul-Dic 2026" (agrupa escalas de una misma paritaria)
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.escalas_aumento is
  'Escala de aumento (paritaria): cabecera. Cada escala es una secuencia de aumentos por mes que luego se aplica a un grupo de clientes filtrado por rubro/coordinador/lista.';
comment on column public.escalas_aumento.nombre      is 'Nombre descriptivo de la escala. Ej. "Paritaria Jul-Dic 2026 - Consorcios".';
comment on column public.escalas_aumento.paritaria   is 'Etiqueta para agrupar escalas de una misma paritaria. Ej. "Jul-Dic 2026".';
comment on column public.escalas_aumento.activa      is 'Si la escala esta vigente/usable (soft-disable sin borrar).';


-- ---------------------------------------------------------------------
-- 2) escalas_aumento_detalle (renglones: mes + % de aumento)
-- ---------------------------------------------------------------------
create table if not exists public.escalas_aumento_detalle (
  id          uuid primary key default gen_random_uuid(),
  escala_id   uuid not null references public.escalas_aumento(id) on delete cascade,
  mes         date not null,                          -- dia 1 del mes en que aplica el aumento
  pct_aumento numeric not null,                       -- % como decimal: 0.08 = 8%
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (escala_id, mes)                             -- un solo % por mes dentro de cada escala
);

comment on table public.escalas_aumento_detalle is
  'Renglones de una escala de aumento: el % que aplica en cada mes. UNIQUE (escala_id, mes).';
comment on column public.escalas_aumento_detalle.mes         is 'Mes en que aplica el aumento (dia 1).';
comment on column public.escalas_aumento_detalle.pct_aumento is '% de aumento como decimal (0.08 = 8%).';

create index if not exists idx_escalas_detalle_escala on public.escalas_aumento_detalle (escala_id, mes);


-- ---------------------------------------------------------------------
-- Verificacion (tablas nuevas, 0 filas; columnas creadas)
-- ---------------------------------------------------------------------
select 'escalas_aumento' as tabla, count(*) as filas from public.escalas_aumento
union all
select 'escalas_aumento_detalle', count(*) from public.escalas_aumento_detalle;

select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name in ('escalas_aumento', 'escalas_aumento_detalle')
 order by table_name, ordinal_position;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_25_grupos_clientes.sql
-- =====================================================================

-- =====================================================================
-- Grupos de clientes (para aplicar escalas/paritarias) â€” estructura.
--
-- Modelo (definido por Juan):
--   PARITARIA = el perÃ­odo de la negociaciÃ³n (ej. "Julio 2026").
--   MODELO de aumento = escalas_aumento (ya existe): meses y % de una paritaria.
--   GRUPO de clientes (ESTO) = lista de clientes (ej. "Consorcios", "Zona Lopez",
--      "Zona Bettolli"). Son ESTABLES y se reusan en cada paritaria; se les
--      agrega/saca clientes o se reconfiguran. NO interesa la historia del grupo:
--      es solo una herramienta para filtrar rapido y aplicar la escala.
--
--   grupos_clientes          = el grupo (cabecera).
--   grupos_clientes_detalle  = que clientes tiene (estado actual, sin historia).
--
-- Sin datos de ejemplo. Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) grupos_clientes (cabecera del grupo)
-- ---------------------------------------------------------------------
create table if not exists public.grupos_clientes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                          -- ej. "Consorcios", "Zona Lopez"
  descripcion text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.grupos_clientes is
  'Grupo estable de clientes para aplicar escalas de aumento (paritarias). Es un estado actual, sin historizacion: se reusa y se reconfigura entre paritarias.';
comment on column public.grupos_clientes.nombre is 'Nombre del grupo. Ej. "Consorcios", "Zona Lopez", "Zona Bettolli".';
comment on column public.grupos_clientes.activo is 'Si el grupo esta en uso (soft-disable sin borrar).';


-- ---------------------------------------------------------------------
-- 2) grupos_clientes_detalle (miembros del grupo)
-- ---------------------------------------------------------------------
create table if not exists public.grupos_clientes_detalle (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.grupos_clientes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (grupo_id, cliente_id)                       -- un cliente aparece una sola vez por grupo
);

comment on table public.grupos_clientes_detalle is
  'Miembros de un grupo de clientes (estado actual). UNIQUE (grupo_id, cliente_id). Sin historia: al reconfigurar el grupo se agregan/quitan filas.';
comment on column public.grupos_clientes_detalle.cliente_id is 'Cliente miembro del grupo (FK a clientes).';

create index if not exists idx_grupos_det_grupo   on public.grupos_clientes_detalle (grupo_id);
create index if not exists idx_grupos_det_cliente on public.grupos_clientes_detalle (cliente_id);


-- ---------------------------------------------------------------------
-- Verificacion (tablas nuevas, 0 filas; columnas creadas)
-- ---------------------------------------------------------------------
select 'grupos_clientes' as tabla, count(*) as filas from public.grupos_clientes
union all
select 'grupos_clientes_detalle', count(*) from public.grupos_clientes_detalle;

select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name in ('grupos_clientes', 'grupos_clientes_detalle')
 order by table_name, ordinal_position;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_26_grupo_en_cliente.sql
-- =====================================================================

-- =====================================================================
-- Grupos de clientes â€” cambio de modelo: 1 cliente pertenece a UN grupo.
--
-- El modelo M:N (grupos_clientes_detalle) se descarta: ahora el grupo es
-- un campo del cliente (clientes.grupo_id). Un cliente pertenece a un solo
-- grupo, o a ninguno (null). La tabla grupos_clientes se mantiene.
--
-- VERIFICADO (read-only) antes de escribir esto: grupos_clientes_detalle
-- esta VACIA (*/0), asi que el DROP no pierde datos.
--
-- Sin begin/commit. Idempotente donde aplica.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) clientes.grupo_id  (FK a grupos_clientes; on delete set null)
-- ---------------------------------------------------------------------
alter table public.clientes
  add column if not exists grupo_id uuid
  references public.grupos_clientes(id) on delete set null;

comment on column public.clientes.grupo_id is
  'Grupo de clientes al que pertenece (para aplicar escalas de paritaria). Un cliente pertenece a un solo grupo, o a ninguno (null).';

-- 1b) clientes.responsable_id — Resp. Neg. del cliente (FK a grupos_clientes
-- con tipo='responsable'). La columna se crea en el BLOQUE 0c sin FK porque
-- grupos_clientes todavía no existía; acá ya existe, se agrega la referencia.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'clientes_responsable_fk'
       and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
      add constraint clientes_responsable_fk
      foreign key (responsable_id) references public.grupos_clientes(id) on delete set null;
  end if;
end $$;

-- 2) indice por grupo (para listar/filtrar los clientes de un grupo)
create index if not exists idx_clientes_grupo on public.clientes (grupo_id);


-- ---------------------------------------------------------------------
-- 3) grupos_clientes: se mantiene (id, nombre, descripcion, activo). No se toca.
-- 4) grupos_clientes_detalle: ya no se usa -> se borra (verificada vacia).
-- ---------------------------------------------------------------------
drop table if exists public.grupos_clientes_detalle;


-- ---------------------------------------------------------------------
-- 5) Verificacion
-- ---------------------------------------------------------------------
-- (a) clientes ahora tiene grupo_id
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'clientes' and column_name = 'grupo_id';

-- (b) grupos_clientes_detalle ya NO existe (esperado: 0 filas)
select count(*) as detalle_existe
  from information_schema.tables
 where table_schema = 'public' and table_name = 'grupos_clientes_detalle';

-- (c) grupos_clientes sigue existiendo
select count(*) as grupos_existe
  from information_schema.tables
 where table_schema = 'public' and table_name = 'grupos_clientes';



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_28_notas_config.sql
-- =====================================================================

-- =====================================================================
-- Notas de aumento â€” PASO 1: estructura (enfoque nuevo: PDF generado por
-- el sistema, sin Word). Guarda el TEXTO de la nota por escala/paritaria y
-- la CONFIGURACION del membrete + firma (imagenes en base64).
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) texto_nota en escalas_aumento
--    El texto completo de la nota para esa escala/paritaria. Juan lo edita.
--    Dentro, una linea con [TABLA] marca donde se inserta la tabla de
--    aumentos (Mes | % | Precio) al generar el PDF.
-- ---------------------------------------------------------------------
alter table public.escalas_aumento add column if not exists texto_nota text;

comment on column public.escalas_aumento.texto_nota is
  'Texto completo de la nota de aumento para esa escala/paritaria (editable). Incluir una linea con el marcador [TABLA] para indicar donde va la tabla de aumentos (Mes | % | Precio) al generar el PDF.';


-- ---------------------------------------------------------------------
-- 2) notas_config â€” configuracion unica: firma + membrete.
--    La app lee la PRIMERA fila (order by created_at). Imagenes en base64
--    (data URI) para simplicidad; si crecen mucho, se puede migrar a Storage.
-- ---------------------------------------------------------------------
create table if not exists public.notas_config (
  id              uuid primary key default gen_random_uuid(),
  firmante_nombre text,                          -- ej. "ARIEL GOROSITO"
  firmante_cargo  text,                          -- ej. "COORD. COMERCIAL"
  firma_imagen    text,                          -- firma escaneada, base64 (data URI: "data:image/png;base64,...")
  membrete_header text,                          -- logo/encabezado, base64
  membrete_footer text,                          -- pie institucional, base64
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.notas_config is
  'Configuracion unica de las notas de aumento: datos del firmante e imagenes del membrete (encabezado/pie) y la firma. La app usa la primera fila. Imagenes en base64 (data URI).';
comment on column public.notas_config.firmante_nombre is 'Nombre del firmante (ej. "ARIEL GOROSITO"). Editable por si cambia el gerente.';
comment on column public.notas_config.firmante_cargo  is 'Cargo del firmante (ej. "COORD. COMERCIAL").';
comment on column public.notas_config.firma_imagen    is 'Imagen de la firma escaneada, base64 (data URI).';
comment on column public.notas_config.membrete_header is 'Imagen del encabezado/logo del membrete, base64 (data URI). A futuro cambiable.';
comment on column public.notas_config.membrete_footer is 'Imagen del pie institucional del membrete, base64 (data URI).';


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
-- (a) escalas_aumento tiene texto_nota
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'escalas_aumento' and column_name = 'texto_nota';

-- (b) notas_config creada (0 filas) + columnas
select count(*) as filas from public.notas_config;
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notas_config'
 order by ordinal_position;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_29_notas_estado.sql
-- =====================================================================

-- =====================================================================
-- Notas de aumento â€” PASO 2: estado / ciclo de vida por CLIENTE dentro de
-- un ORIGEN (escala o paritaria). Registra que notas se generaron y
-- cuales se enviaron, para no regenerar/reenviar por accidente.
--
-- Ciclo de vida de una nota (una fila por cliente x origen):
--   1) GENERADA  -> se crea/actualiza la fila con fecha_generada = now()
--                   al producir el PDF del cliente.
--   2) ENVIADA   -> fecha_enviada = now() cuando se envia (hoy manual;
--                   a futuro automatico al integrar Outlook).
--                   Mientras fecha_enviada IS NULL, la nota esta pendiente.
--   3) Una vez enviada, NO se regenera salvo que se "desmarque"
--      (fecha_enviada = null) explicitamente.
--
-- DOS ORIGENES POSIBLES (el porque completo esta en abm_49, bloque 1):
--   Â· fila de ESCALA   -> escala_id cargado.
--   Â· fila VIRTUAL     -> escala_id NULL y paritaria_id cargado. Son los
--     clientes con el aumento cargado A MANO, sin escala de por medio.
--   origen_id = coalesce(escala_id, paritaria_id) colapsa los dos casos
--   para poder expresar el unique "una nota por cliente por origen".
--
-- CORREGIDO EL 29-JUL-2026: este archivo describia el modelo viejo
-- â€”escala_id NOT NULL y unique (escala_id, cliente_id)â€”, que hacia rato
-- no era el de la base. Las columnas paritaria_id y origen_id se habian
-- agregado a mano y ningun script las creaba: re-correr este archivo en
-- una base limpia armaba una tabla que rompia la generacion de casos del
-- CRM. Sobre una base YA existente no cambia nada (create table if not
-- exists no toca una tabla que existe); el que regulariza una base vieja
-- es abm_49_notas_pdf.sql, bloque 1.
--
-- Las columnas del PDF (pdf_path, pdf_nombre, pdf_subido_en) las agrega
-- abm_49_notas_pdf.sql, que va DESPUES de este.
--
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


create table if not exists public.notas_emitidas (
  id             uuid primary key default gen_random_uuid(),
  escala_id      uuid references public.escalas_aumento(id) on delete cascade,  -- NULL en las notas virtuales
  paritaria_id   uuid references public.paritarias(id)      on delete cascade,  -- origen de las virtuales; ademas permite listar por paritaria
  cliente_id     uuid not null references public.clientes(id) on delete cascade,  -- a que cliente
  fecha_generada timestamptz,                 -- cuando se genero el PDF (null = todavia no generada)
  fecha_enviada  timestamptz,                 -- cuando se envio (null = NO enviada / pendiente)
  fecha_nota     date,                        -- la fecha que figura EN la nota (la que elige Juan al generar)
  incluye_precio boolean not null default false,  -- si se genero con precio (true) o sin precio (false)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Columna GENERADA: el origen efectivo de la nota. No la escribe la app,
  -- asi no puede quedar desincronizada de las dos columnas de las que sale.
  origen_id      uuid generated always as (coalesce(escala_id, paritaria_id)) stored,
  -- una sola nota por cliente por origen
  constraint notas_emitidas_origen_cliente_uk unique (origen_id, cliente_id)
);

comment on table  public.notas_emitidas is
  'Estado / ciclo de vida de las notas de aumento por cliente dentro de un origen (escala o paritaria). Una fila por (origen_id, cliente_id). Generada -> Enviada; enviada no se regenera sin desmarcar (fecha_enviada = null).';
comment on column public.notas_emitidas.escala_id      is 'FK a escalas_aumento. NULL en las notas "virtuales" (aumentos cargados a mano, sin escala).';
comment on column public.notas_emitidas.paritaria_id   is 'FK a paritarias. Es el origen de las notas virtuales y ademas permite listar todas las notas de una paritaria.';
comment on column public.notas_emitidas.origen_id      is 'Columna GENERADA = coalesce(escala_id, paritaria_id). Colapsa los dos origenes posibles en un solo valor para poder expresar el unique por cliente.';
comment on column public.notas_emitidas.cliente_id     is 'FK a clientes: cliente destinatario de la nota.';
comment on column public.notas_emitidas.fecha_generada is 'Timestamp de generacion del PDF. Null = todavia no se genero.';
comment on column public.notas_emitidas.fecha_enviada  is 'Timestamp de envio. Null = no enviada (pendiente). Enviada no se regenera salvo desmarcado.';
comment on column public.notas_emitidas.fecha_nota     is 'Fecha que figura EN la nota (elegida por Juan al generar).';
comment on column public.notas_emitidas.incluye_precio is 'Si la nota se genero con precio (true) o sin precio (false).';

-- Indices para los dos accesos tipicos (por escala y por cliente).
create index if not exists notas_emitidas_escala_idx  on public.notas_emitidas (escala_id);
create index if not exists notas_emitidas_cliente_idx on public.notas_emitidas (cliente_id);


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
-- (a) tabla creada (0 filas) + columnas
select count(*) as filas from public.notas_emitidas;
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notas_emitidas'
 order by ordinal_position;

-- (b) indices y unique
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'notas_emitidas'
 order by indexname;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_30_notas_firmante.sql
-- =====================================================================

-- =====================================================================
-- Notas de aumento -- carga del FIRMANTE en notas_config (correr una vez).
-- Solo texto (nombre + cargo). Las imagenes (logo/firma) las sigue leyendo
-- el generador desde notas/logo_b64.txt y notas/firma_b64.txt.
-- Idempotente: si la tabla esta vacia inserta; si ya hay fila sin firmante,
-- lo completa. No duplica al re-correr.
-- =====================================================================

-- 1) Tabla vacia -> inserta la fila con el firmante.
insert into public.notas_config (firmante_nombre, firmante_cargo)
select 'ARIEL GOROSITO', 'COORD. COMERCIAL'
where not exists (select 1 from public.notas_config);

-- 2) Ya habia una fila sin firmante -> la completa.
update public.notas_config
   set firmante_nombre = 'ARIEL GOROSITO',
       firmante_cargo  = 'COORD. COMERCIAL',
       updated_at      = now()
 where firmante_nombre is null;

-- Verificacion.
select firmante_nombre, firmante_cargo
  from public.notas_config
 order by created_at
 limit 1;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_31_precios_snapshots.sql
-- =====================================================================

-- =====================================================================
-- Backup/restore basico de objetivo_precios DESDE LA PANTALLA (un click).
-- NO es el modulo de versiones completo; es una red de seguridad simple.
--
-- Diseno: DOS tablas.
--   precios_snapshots         -> cabecera (nombre auto, descripcion, fecha, n_filas).
--   precios_snapshot_detalle  -> copia de objetivo_precios + snapshot_id (cascade).
-- + funciones:
--   crear_precios_snapshot(nombre, descripcion) -> saca la foto (server-side).
--   restaurar_precios_snapshot(id)              -> pisa objetivo_precios (transaccion).
--   borrar_precios_snapshot(id)                 -> borra cabecera (+ detalle por cascade).
--
-- IDEMPOTENTE: se puede re-correr entero sin romper nada.
-- NOMBRE: lo arma la app con la fecha/hora local (AAAA-MM-DD-HH-MM).
-- DESCRIPCION: texto opcional que escribe Juan.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Cabecera. n_filas = filas de la foto (para verificar que copio todo).
-- ---------------------------------------------------------------------
create table if not exists public.precios_snapshots (
  id          uuid primary key default gen_random_uuid(),
  nombre      text,                                  -- fecha/hora auto (ej. "2026-07-20-15-42")
  descripcion text,                                  -- opcional (ej. "antes de paritaria Jul")
  creado_at   timestamptz not null default now(),
  n_filas     integer                                -- filas copiadas al detalle
);
-- por si la tabla ya existia sin la columna descripcion:
alter table public.precios_snapshots add column if not exists descripcion text;

comment on table  public.precios_snapshots is 'Backup/restore basico: cabecera de cada foto de objetivo_precios tomada desde la pantalla.';
comment on column public.precios_snapshots.nombre      is 'Nombre auto con fecha/hora local (AAAA-MM-DD-HH-MM).';
comment on column public.precios_snapshots.descripcion is 'Descripcion opcional que escribe Juan (ej. "antes de paritaria Jul").';
comment on column public.precios_snapshots.n_filas     is 'Cantidad de filas copiadas al detalle (para verificar que copio todo).';


-- ---------------------------------------------------------------------
-- 2) Detalle. Copia ESTRUCTURAL de objetivo_precios + snapshot_id (cascade).
-- ---------------------------------------------------------------------
create table if not exists public.precios_snapshot_detalle (
  like public.objetivo_precios
);
alter table public.precios_snapshot_detalle
  add column if not exists snapshot_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'precios_snapshot_detalle_snapshot_fk') then
    alter table public.precios_snapshot_detalle
      add constraint precios_snapshot_detalle_snapshot_fk
      foreign key (snapshot_id) references public.precios_snapshots(id) on delete cascade;
  end if;
end $$;

create index if not exists precios_snapshot_detalle_snap_idx
  on public.precios_snapshot_detalle (snapshot_id);

comment on table public.precios_snapshot_detalle is 'Detalle de cada snapshot: copia de las filas de objetivo_precios + snapshot_id (on delete cascade).';


-- ---------------------------------------------------------------------
-- 3) Crear snapshot: copia el estado actual al detalle (server-side).
--    p_nombre lo arma la app (fecha/hora local); p_descripcion es opcional.
--    Devuelve el id del snapshot.
-- ---------------------------------------------------------------------
drop function if exists public.crear_precios_snapshot(text);   -- reemplaza la version vieja (1 arg)

create or replace function public.crear_precios_snapshot(p_nombre text, p_descripcion text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into public.precios_snapshots (nombre, descripcion, n_filas)
  select nullif(btrim(coalesce(p_nombre, '')), ''),
         nullif(btrim(coalesce(p_descripcion, '')), ''),
         count(*)
    from public.objetivo_precios
  returning id into v_id;

  -- detalle = todas las columnas de objetivo_precios (mismo orden) + snapshot_id
  insert into public.precios_snapshot_detalle
  select o.*, v_id from public.objetivo_precios o;

  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) Restaurar snapshot: pisa objetivo_precios con el detalle elegido.
--    Todo el cuerpo corre en una sola transaccion. Antes de pisar, guarda
--    una foto AUTO del estado actual. Devuelve cuantas filas quedaron.
-- ---------------------------------------------------------------------
create or replace function public.restaurar_precios_snapshot(p_snapshot uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cols text; v_count integer; v_auto text;
begin
  if not exists (select 1 from public.precios_snapshots where id = p_snapshot) then
    raise exception 'El snapshot % no existe.', p_snapshot;
  end if;

  -- Red extra: foto automatica del estado actual antes de pisarlo.
  v_auto := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD-HH24-MI');
  perform public.crear_precios_snapshot(v_auto, 'AUTO - estado antes de restaurar');

  -- Columnas reales de objetivo_precios (en orden), para insertar sin snapshot_id.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'objetivo_precios';

  -- 'where true' satisface la proteccion que exige WHERE en los DELETE
  -- (evita el error "DELETE requires a WHERE clause"). Vacia toda la tabla igual.
  -- Se usa delete (y no truncate) por si hay FKs apuntando a objetivo_precios.
  delete from public.objetivo_precios where true;
  execute format(
    'insert into public.objetivo_precios (%1$s) select %1$s from public.precios_snapshot_detalle where snapshot_id = $1',
    v_cols
  ) using p_snapshot;

  select count(*) into v_count from public.objetivo_precios;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 5) Borrar snapshot: borra la cabecera; el detalle se va por cascade.
-- ---------------------------------------------------------------------
create or replace function public.borrar_precios_snapshot(p_snapshot uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.precios_snapshots where id = p_snapshot;
end;
$$;


-- ---------------------------------------------------------------------
-- 6) Permisos: SOLO usuarios con sesion. NUNCA anon.
--
-- Las tres funciones son SECURITY DEFINER: corren con permisos del dueno y
-- SALTEAN RLS. restaurar_precios_snapshot, ademas, borra las 13.713 filas de
-- objetivo_precios y las reemplaza por las del snapshot. La anon key viaja en
-- el JS del cliente, a la vista de cualquiera, asi que con execute para anon
-- cualquier persona con esa key podia borrar todos los precios sin siquiera
-- tener cuenta. Activar RLS no alcanza: el unico candado es el EXECUTE.
--
-- El revoke a public tambien hace falta: Postgres le da execute a PUBLIC por
-- defecto en cada funcion nueva, y ese grant implicito alcanza a anon igual.
--
-- Se cerro en la base el 24-jul. Este archivo todavia decia "to anon,
-- authenticated": una re-corrida del script reabria el agujero. Corregido el
-- 25-jul, junto con el mismo caso en abm_33 (restaurar_precios_snapshot).
--
-- El grant de SELECT sobre la tabla se deja como estaba: RLS ya bloquea a
-- anon (no hay policy para ese rol), asi que el permiso no habilita nada.
-- ---------------------------------------------------------------------
revoke execute on function public.crear_precios_snapshot(text, text) from public, anon;
revoke execute on function public.restaurar_precios_snapshot(uuid)   from public, anon;
revoke execute on function public.borrar_precios_snapshot(uuid)      from public, anon;

grant select on public.precios_snapshots to anon, authenticated;
grant execute on function public.crear_precios_snapshot(text, text) to authenticated;
grant execute on function public.restaurar_precios_snapshot(uuid)   to authenticated;
grant execute on function public.borrar_precios_snapshot(uuid)      to authenticated;


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
select
  (select count(*) from public.precios_snapshots)        as snapshots,
  (select count(*) from public.precios_snapshot_detalle) as filas_detalle;

select proname, pg_get_function_identity_arguments(oid) as args
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('crear_precios_snapshot', 'restaurar_precios_snapshot', 'borrar_precios_snapshot')
 order by proname;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_32_aplicaciones_escala.sql
-- =====================================================================

-- =====================================================================
-- Registro de APLICACIONES de escala (para el nuevo "Generar notas": el
-- modal muestra las combinaciones grupo/filtro + escala ya aplicadas).
--
-- Una fila por (escala + grupo) o (escala + filtro). Si se reaplica, se
-- actualiza la fecha (upsert). clientes_ids guarda a quienes se aplico
-- (necesario para los "filtrados"; respaldo para grupos).
-- Idempotente (if not exists / or replace).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------
create table if not exists public.aplicaciones_escala (
  id                 uuid primary key default gen_random_uuid(),
  escala_id          uuid not null references public.escalas_aumento(id) on delete cascade,
  grupo_id           uuid references public.grupos_clientes(id) on delete cascade,  -- null = a filtrados
  descripcion_filtro text,                                                          -- null = a un grupo
  clientes_ids       jsonb,                                                         -- clientes a los que se aplico (array de uuids)
  fecha_aplicacion   timestamptz not null default now()
);

comment on table  public.aplicaciones_escala is 'Combinaciones (escala + grupo/filtro) ya aplicadas, para ofrecerlas en "Generar notas". Upsert por combinacion.';
comment on column public.aplicaciones_escala.grupo_id           is 'Grupo al que se aplico; null si fue a clientes filtrados.';
comment on column public.aplicaciones_escala.descripcion_filtro is 'Texto de los filtros usados; null si fue a un grupo.';
comment on column public.aplicaciones_escala.clientes_ids       is 'Array JSON de cliente_id a los que se aplico (para generar las notas del filtro; respaldo para grupos).';

-- una fila por escala+grupo, y una por escala+filtro
create unique index if not exists aplic_escala_grupo_uk
  on public.aplicaciones_escala (escala_id, grupo_id)           where grupo_id is not null;
create unique index if not exists aplic_escala_filtro_uk
  on public.aplicaciones_escala (escala_id, descripcion_filtro) where grupo_id is null;


-- ---------------------------------------------------------------------
-- 2) RPC upsert: registra/actualiza una aplicacion. Rama grupo / filtro
--    segun p_grupo_id. Devuelve el id. security definer (como snapshots).
-- ---------------------------------------------------------------------
create or replace function public.registrar_aplicacion_escala(
  p_escala_id          uuid,
  p_grupo_id           uuid,
  p_descripcion_filtro text,
  p_clientes_ids       jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if p_grupo_id is not null then
    insert into public.aplicaciones_escala (escala_id, grupo_id, descripcion_filtro, clientes_ids, fecha_aplicacion)
    values (p_escala_id, p_grupo_id, null, p_clientes_ids, now())
    on conflict (escala_id, grupo_id) where grupo_id is not null
      do update set clientes_ids = excluded.clientes_ids, fecha_aplicacion = now()
    returning id into v_id;
  else
    insert into public.aplicaciones_escala (escala_id, grupo_id, descripcion_filtro, clientes_ids, fecha_aplicacion)
    values (p_escala_id, null, p_descripcion_filtro, p_clientes_ids, now())
    on conflict (escala_id, descripcion_filtro) where grupo_id is null
      do update set clientes_ids = excluded.clientes_ids, fecha_aplicacion = now()
    returning id into v_id;
  end if;
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 3) Permisos: SOLO usuarios con sesion. NUNCA anon.
--
-- registrar_aplicacion_escala es SECURITY DEFINER: corre con permisos del
-- dueno y SALTEA RLS. Con execute para anon, cualquiera con la anon key (que
-- viaja en el JS del cliente) podia escribir en aplicaciones_escala sin tener
-- cuenta. Activar RLS no alcanza: el unico candado es el EXECUTE.
--
-- El revoke a public tambien hace falta: Postgres le da execute a PUBLIC por
-- defecto en cada funcion nueva, y ese grant implicito alcanza a anon igual.
--
-- Mismo caso que abm_31 (crear/restaurar/borrar_precios_snapshot) y abm_33
-- (restaurar_precios_snapshot). Corregido el 25-jul para que una re-corrida
-- del script no reabra el agujero.
--
-- El grant de SELECT sobre la tabla se deja como estaba: RLS ya bloquea a
-- anon (no hay policy para ese rol), asi que el permiso no habilita nada.
-- ---------------------------------------------------------------------
revoke execute on function public.registrar_aplicacion_escala(uuid, uuid, text, jsonb) from public, anon;

grant select on public.aplicaciones_escala to anon, authenticated;
grant execute on function public.registrar_aplicacion_escala(uuid, uuid, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
select count(*) as aplicaciones from public.aplicaciones_escala;

select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'aplicaciones_escala'
 order by indexname;

select proname, pg_get_function_identity_arguments(oid) as args
  from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'registrar_aplicacion_escala';



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_33_auditoria_precios.sql
-- =====================================================================

-- =====================================================================
-- Auditoria de cambios en precios: quien cambio que y cuando.
--
-- ENFOQUE: triggers en la base, no en el codigo. Es imposible cambiar una
-- fila de las tablas auditadas sin que quede registro, venga del camino que
-- venga (app, SQL manual, funcion SECURITY DEFINER, o un camino futuro).
--
-- DOS MECANISMOS, por rendimiento:
--   a) objetivo_precios (13.713 filas, aumentos masivos) -> trigger
--      STATEMENT-LEVEL con transition tables. Una pasada set-based por
--      sentencia en vez de 13.713 invocaciones con subtransaccion.
--   b) Las otras 8 tablas (volumen despreciable) -> trigger FILA POR FILA.
--
-- REGLAS DE DISENO (no negociables):
--   1. La auditoria NUNCA rompe la operacion. Si el trigger falla, el cambio
--      de precio se hace igual (bloque exception que traga todo).
--   2. Las tablas de auditoria son de SOLO LECTURA para los usuarios de la
--      app. RLS + grants: authenticated solo puede SELECT.
--   3. En UPDATE se guardan SOLO las columnas que cambiaron, no la fila
--      entera.
--
-- TABLAS AUDITADAS (9):
--   objetivo_precios (statement-level), escalas_aumento,
--   escalas_aumento_detalle, paritarias, paritarias_detalle,
--   grupos_clientes, aplicaciones_escala, precios_snapshots, clientes.
-- FUERA: precios_snapshot_detalle (149k filas, copia inmutable por diseno).
--
-- COMO CORRERLO: bloques numerados, de a uno, en orden.
-- IDEMPOTENTE: se puede re-correr entero sin romper nada.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 â€” Tabla de auditoria (cabecera, comun a todas las tablas)
--
-- Para las 8 tablas fila-por-fila, cada fila de aca ES el cambio.
-- Para objetivo_precios, cada fila de aca es la CABECERA de una sentencia
-- y el detalle vive en auditoria_objetivo_precios (bloque 2).
--
-- fila_id es TEXT y no UUID a proposito: no depende del tipo de PK de cada
-- tabla auditada. Si manana se audita una tabla con id bigint, sigue andando.
-- =====================================================================
create table if not exists public.auditoria (
  id               bigint generated always as identity primary key,
  tabla            text        not null,
  fila_id          text,                                    -- null en las cabeceras statement-level
  operacion        text        not null check (operacion in ('INSERT','UPDATE','DELETE','RESTORE')),
  usuario_id       uuid,                                    -- auth.uid(); null si no hubo sesion
  usuario_email    text,                                    -- legible; null si no hubo sesion
  origen           text        not null,                    -- 'app' | 'sin_usuario'
  datos_anteriores jsonb,                                   -- UPDATE: solo las columnas que cambiaron
  datos_nuevos     jsonb,
  hecho_at         timestamptz not null default now()
);

comment on table  public.auditoria is
  'Auditoria centralizada de cambios en las tablas de precios. Escrita solo por triggers. Solo lectura para la app.';
comment on column public.auditoria.fila_id          is 'PK de la fila afectada, como texto. Null en cabeceras statement-level (objetivo_precios).';
comment on column public.auditoria.origen           is 'app = habia sesion de Supabase Auth; sin_usuario = SQL manual, cron o cualquier camino sin JWT.';
comment on column public.auditoria.datos_anteriores is 'INSERT: null. UPDATE: solo las columnas que cambiaron (valor viejo). DELETE: la fila entera.';
comment on column public.auditoria.datos_nuevos     is 'INSERT: la fila entera. UPDATE: solo las columnas que cambiaron (valor nuevo). DELETE: null. Cabecera statement-level: {"filas": N}.';

create index if not exists idx_auditoria_tabla_fecha on public.auditoria (tabla, hecho_at desc);
create index if not exists idx_auditoria_fila        on public.auditoria (tabla, fila_id);
create index if not exists idx_auditoria_usuario     on public.auditoria (usuario_email, hecho_at desc);


-- =====================================================================
-- BLOQUE 2 â€” Detalle de objetivo_precios
--
-- Columnas reales (no jsonb) para lo que se consulta siempre: que objetivo,
-- que cliente, que mes, precio antes y despues. Con indices de verdad.
-- El diff completo de cualquier otra columna queda en antes/despues (jsonb),
-- asi no se pierde nada.
-- =====================================================================
create table if not exists public.auditoria_objetivo_precios (
  id              bigint generated always as identity primary key,
  auditoria_id    bigint  not null references public.auditoria(id) on delete cascade,
  operacion       text    not null check (operacion in ('INSERT','UPDATE','DELETE')),
  fila_id         uuid,
  sucursal_id     uuid,
  cliente_id      uuid,
  codigo_objetivo text,
  mes             date,
  precio_antes    numeric,
  precio_despues  numeric,
  antes           jsonb,     -- UPDATE: solo columnas que cambiaron. DELETE: fila entera.
  despues         jsonb      -- UPDATE: solo columnas que cambiaron. INSERT: fila entera.
);

comment on table public.auditoria_objetivo_precios is
  'Detalle fila por fila de cada sentencia sobre objetivo_precios. Se escribe set-based desde el trigger statement-level. La cabecera (quien/cuando) esta en auditoria via auditoria_id.';

create index if not exists idx_aud_op_cliente  on public.auditoria_objetivo_precios (cliente_id, mes);
create index if not exists idx_aud_op_sucursal on public.auditoria_objetivo_precios (sucursal_id, mes);
create index if not exists idx_aud_op_fila     on public.auditoria_objetivo_precios (fila_id);
create index if not exists idx_aud_op_cabecera on public.auditoria_objetivo_precios (auditoria_id);


-- =====================================================================
-- BLOQUE 3 â€” Quien es el usuario, en forma segura
--
-- auth.jwt() ->> 'email' sale del propio token: no cuesta una consulta.
-- Si el token no trae email, se resuelve contra auth.users. Por eso es
-- SECURITY DEFINER: 'authenticated' no puede leer auth.users por su cuenta.
--
-- OJO: SECURITY DEFINER cambia el ROL efectivo, no el contexto de la request.
-- El GUC request.jwt.claims sigue presente, asi que un cambio disparado desde
-- la app a traves de una funcion definer (ej. restaurar_precios_snapshot)
-- QUEDA ATRIBUIDO AL USUARIO. El unico caso realmente sin usuario es el SQL
-- corrido a mano en el editor.
-- =====================================================================
create or replace function public.auditoria_usuario(
  out uid uuid, out email text, out origen text
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  begin uid := auth.uid(); exception when others then uid := null; end;

  begin
    email := nullif(auth.jwt() ->> 'email', '');
  exception when others then email := null;
  end;

  if uid is not null and email is null then
    begin
      select u.email into email from auth.users u where u.id = uid;
    exception when others then email := null;
    end;
  end if;

  origen := case when uid is null then 'sin_usuario' else 'app' end;
end;
$$;


-- =====================================================================
-- BLOQUE 4 â€” Diff entre dos jsonb
--
-- Devuelve {"antes": {...}, "despues": {...}} con SOLO las claves que
-- cambiaron. Si no cambio nada, los dos objetos vienen vacios.
-- La usan los dos triggers (fila por fila y statement-level).
-- =====================================================================
create or replace function public.auditoria_diff(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
as $$
  with claves as (
    select k from jsonb_object_keys(
      coalesce(p_old, '{}'::jsonb) || coalesce(p_new, '{}'::jsonb)
    ) k
    where (p_old -> k) is distinct from (p_new -> k)
  )
  select jsonb_build_object(
    'antes',   coalesce((select jsonb_object_agg(k, p_old -> k) from claves where p_old ? k), '{}'::jsonb),
    'despues', coalesce((select jsonb_object_agg(k, p_new -> k) from claves where p_new ? k), '{}'::jsonb)
  );
$$;


-- =====================================================================
-- BLOQUE 5 â€” Trigger function FILA POR FILA (las 8 tablas chicas)
--
-- updated_at se excluye de la comparacion: lo pisa el trigger de updated_at
-- en cada UPDATE y ensuciaria todos los diffs.
-- Si no cambio nada real, no escribe nada.
-- =====================================================================
create or replace function public.auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old   jsonb;
  v_new   jsonb;
  v_diff  jsonb;
  v_ant   jsonb;
  v_nue   jsonb;
  v_fila  text;
  v_uid   uuid;
  v_email text;
  v_orig  text;
begin
  -- Operacion masiva declarada: se saltea el registro.
  if coalesce(current_setting('auditoria.omitir', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_nue  := to_jsonb(new);
    v_ant  := null;
    v_fila := v_nue ->> 'id';

  elsif tg_op = 'DELETE' then
    v_ant  := to_jsonb(old);
    v_nue  := null;
    v_fila := v_ant ->> 'id';

  else  -- UPDATE
    v_old  := to_jsonb(old) - 'updated_at';
    v_new  := to_jsonb(new) - 'updated_at';
    v_fila := v_new ->> 'id';

    if v_old = v_new then
      return new;   -- nada real cambio
    end if;

    v_diff := public.auditoria_diff(v_old, v_new);
    v_ant  := v_diff -> 'antes';
    v_nue  := v_diff -> 'despues';
  end if;

  select u.uid, u.email, u.origen
    into v_uid, v_email, v_orig
    from public.auditoria_usuario() u;

  insert into public.auditoria (
    tabla, fila_id, operacion, usuario_id, usuario_email, origen,
    datos_anteriores, datos_nuevos
  ) values (
    tg_table_name, v_fila, tg_op, v_uid, v_email, coalesce(v_orig, 'sin_usuario'),
    v_ant, v_nue
  );

  return coalesce(new, old);

exception when others then
  -- REGLA 1: la auditoria nunca rompe la operacion.
  return coalesce(new, old);
end;
$$;


-- =====================================================================
-- BLOQUE 6 â€” Enganchar el trigger fila por fila en las 8 tablas
-- (mismo patron que schema.sql:180). objetivo_precios NO va aca.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'escalas_aumento',
    'escalas_aumento_detalle',
    'paritarias',
    'paritarias_detalle',
    'grupos_clientes',
    'aplicaciones_escala',
    'precios_snapshots',
    'clientes'
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
-- BLOQUE 7 â€” Trigger function STATEMENT-LEVEL (solo objetivo_precios)
--
-- Una cabecera por sentencia + el detalle en un solo INSERT ... SELECT
-- desde las transition tables. El bloque exception cuesta UNA subtransaccion
-- por sentencia (no por fila), asi que es despreciable.
--
-- Si la sentencia no cambio nada real, se borra la cabecera y no queda rastro.
-- =====================================================================
create or replace function public.auditar_objetivo_precios()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid   uuid;
  v_email text;
  v_orig  text;
  v_aud   bigint;
  v_n     integer := 0;
begin
  if coalesce(current_setting('auditoria.omitir', true), '') = 'on' then
    return null;
  end if;

  select u.uid, u.email, u.origen
    into v_uid, v_email, v_orig
    from public.auditoria_usuario() u;

  insert into public.auditoria (tabla, operacion, usuario_id, usuario_email, origen)
  values ('objetivo_precios', tg_op, v_uid, v_email, coalesce(v_orig, 'sin_usuario'))
  returning id into v_aud;

  if tg_op = 'INSERT' then
    insert into public.auditoria_objetivo_precios
      (auditoria_id, operacion, fila_id, sucursal_id, cliente_id, codigo_objetivo, mes,
       precio_antes, precio_despues, antes, despues)
    select v_aud, 'INSERT', n.id, n.sucursal_id, n.cliente_id, n.codigo_objetivo, n.mes,
           null, n.precio_hora, null, to_jsonb(n)
      from nuevas n;
    get diagnostics v_n = row_count;

  elsif tg_op = 'DELETE' then
    insert into public.auditoria_objetivo_precios
      (auditoria_id, operacion, fila_id, sucursal_id, cliente_id, codigo_objetivo, mes,
       precio_antes, precio_despues, antes, despues)
    select v_aud, 'DELETE', v.id, v.sucursal_id, v.cliente_id, v.codigo_objetivo, v.mes,
           v.precio_hora, null, to_jsonb(v), null
      from viejas v;
    get diagnostics v_n = row_count;

  else  -- UPDATE
    insert into public.auditoria_objetivo_precios
      (auditoria_id, operacion, fila_id, sucursal_id, cliente_id, codigo_objetivo, mes,
       precio_antes, precio_despues, antes, despues)
    select v_aud, 'UPDATE', n.id, n.sucursal_id, n.cliente_id, n.codigo_objetivo, n.mes,
           v.precio_hora, n.precio_hora,
           d.j -> 'antes', d.j -> 'despues'
      from nuevas n
      join viejas v on v.id = n.id
      cross join lateral (
        select public.auditoria_diff(to_jsonb(v) - 'updated_at', to_jsonb(n) - 'updated_at') as j
      ) d
     where (to_jsonb(v) - 'updated_at') is distinct from (to_jsonb(n) - 'updated_at');
    get diagnostics v_n = row_count;
  end if;

  if v_n = 0 then
    delete from public.auditoria where id = v_aud;   -- sentencia sin cambios reales
  else
    update public.auditoria
       set datos_nuevos = jsonb_build_object('filas', v_n)
     where id = v_aud;
  end if;

  return null;

exception when others then
  -- REGLA 1: la auditoria nunca rompe la operacion.
  return null;
end;
$$;


-- =====================================================================
-- BLOQUE 8 â€” Los 3 triggers de objetivo_precios
--
-- Tienen que ser tres y no uno: cada evento necesita su propia clausula
-- REFERENCING (INSERT solo tiene NEW TABLE, DELETE solo OLD TABLE).
--
-- El primer drop saca el trigger fila-por-fila por si quedo de una corrida
-- anterior de este mismo script.
-- =====================================================================
drop trigger if exists trg_objetivo_precios_auditoria on public.objetivo_precios;

drop trigger if exists trg_objetivo_precios_aud_ins on public.objetivo_precios;
create trigger trg_objetivo_precios_aud_ins
  after insert on public.objetivo_precios
  referencing new table as nuevas
  for each statement execute function public.auditar_objetivo_precios();

drop trigger if exists trg_objetivo_precios_aud_upd on public.objetivo_precios;
create trigger trg_objetivo_precios_aud_upd
  after update on public.objetivo_precios
  referencing old table as viejas new table as nuevas
  for each statement execute function public.auditar_objetivo_precios();

drop trigger if exists trg_objetivo_precios_aud_del on public.objetivo_precios;
create trigger trg_objetivo_precios_aud_del
  after delete on public.objetivo_precios
  referencing old table as viejas
  for each statement execute function public.auditar_objetivo_precios();


-- =====================================================================
-- BLOQUE 9 â€” RLS: solo lectura para la app, en las dos tablas
--
-- Sin policy de INSERT/UPDATE/DELETE, esas operaciones quedan denegadas para
-- 'authenticated' aunque el patron auth_all del resto del sistema use ALL.
--
-- IMPORTANTE: NO agregar 'force row level security'. El dueno de la tabla
-- saltea RLS, y es justamente lo que permite que los triggers (SECURITY
-- DEFINER) puedan insertar. Con FORCE se bloquearia tambien el trigger y no
-- se registraria nada.
-- =====================================================================
alter table public.auditoria                  enable row level security;
alter table public.auditoria_objetivo_precios enable row level security;

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated using (true);

drop policy if exists auditoria_op_select on public.auditoria_objetivo_precios;
create policy auditoria_op_select on public.auditoria_objetivo_precios
  for select to authenticated using (true);

-- Los grants son independientes de RLS: hay que cerrarlos igual.
revoke all on public.auditoria                  from anon, authenticated;
revoke all on public.auditoria_objetivo_precios from anon, authenticated;
grant select on public.auditoria                  to authenticated;
grant select on public.auditoria_objetivo_precios to authenticated;

-- Las funciones de este script tambien. Postgres le da EXECUTE a PUBLIC por
-- defecto en toda funcion nueva, y ese grant implicito alcanza a anon Y a
-- authenticated. Las tres son SECURITY DEFINER: corren con permisos del dueno
-- y saltean RLS, asi que el EXECUTE es el unico candado. Mismo criterio que
-- abm_31, abm_32 y el bloque 11 de este archivo.
--
-- Se revoca tambien a AUTHENTICATED, no solo a anon: ninguna de las tres se
-- llama desde la app.
--   Â· auditar_cambio y auditar_objetivo_precios las dispara la BASE cuando
--     salta el trigger, no el cliente.
--   Â· auditoria_usuario la llaman los dos triggers desde adentro, y como esos
--     triggers son SECURITY DEFINER la llamada la hace el dueno, no el usuario.
--
-- ESTO NO APAGA LA AUDITORIA. El EXECUTE se chequea en la llamada DIRECTA y al
-- crear el trigger, no cada vez que el trigger se dispara: los triggers ya
-- creados siguen invocando estas funciones igual. Verificado el 25-jul
-- cambiando un precio desde la app despues de correr los revoke (quedo
-- registrado con el mail del usuario y origen='app').
--
-- auditoria_diff() no esta en la lista a proposito: no es SECURITY DEFINER
-- (es sql immutable, corre como invoker) y no lee ni escribe nada.
revoke execute on function public.auditar_cambio()           from public, anon, authenticated;
revoke execute on function public.auditar_objetivo_precios() from public, anon, authenticated;
revoke execute on function public.auditoria_usuario()        from public, anon, authenticated;


-- =====================================================================
-- BLOQUE 10 â€” Arreglo aparte: updated_at de objetivo_precios nunca se
-- actualizaba. La tabla tiene la columna pero no estaba en el loop de
-- schema.sql:183, asi que conservaba para siempre la fecha del insert.
-- =====================================================================
drop trigger if exists trg_objetivo_precios_updated_at on public.objetivo_precios;
create trigger trg_objetivo_precios_updated_at
  before update on public.objetivo_precios
  for each row execute function public.set_updated_at();


-- =====================================================================
-- BLOQUE 11 â€” restaurar_precios_snapshot
--
-- Una restauracion borra 13.713 filas y reinserta otras tantas: serian
-- ~27.000 filas de detalle por un solo click, que ademas no dicen nada util.
-- Lo que importa es "fulano restauro el snapshot X tal dia".
--
-- La funcion declara la operacion como masiva (GUC local a la transaccion),
-- los triggers se saltean, y la propia funcion escribe UNA fila de resumen
-- con operacion='RESTORE'.
--
-- El set_config va DESPUES de crear la foto automatica, para que el alta en
-- precios_snapshots si quede auditada normalmente.
--
-- Es el mismo cuerpo de abm_31 mas esos agregados; el resto no cambia.
-- =====================================================================
create or replace function public.restaurar_precios_snapshot(p_snapshot uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cols   text;
  v_count  integer;
  v_antes  integer;
  v_auto   text;
  v_nombre text;
begin
  select nombre into v_nombre from public.precios_snapshots where id = p_snapshot;
  if not found then
    raise exception 'El snapshot % no existe.', p_snapshot;
  end if;

  select count(*) into v_antes from public.objetivo_precios;

  -- Red extra: foto automatica del estado actual antes de pisarlo.
  -- (queda auditada como INSERT en precios_snapshots: el flag todavia no esta puesto)
  v_auto := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD-HH24-MI');
  perform public.crear_precios_snapshot(v_auto, 'AUTO - estado antes de restaurar');

  -- A partir de aca, no auditar. 'true' = local a la transaccion.
  perform set_config('auditoria.omitir', 'on', true);

  -- Columnas reales de objetivo_precios (en orden), para insertar sin snapshot_id.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'objetivo_precios';

  -- 'where true' satisface la proteccion que exige WHERE en los DELETE.
  -- Se usa delete (y no truncate) por si hay FKs apuntando a objetivo_precios.
  delete from public.objetivo_precios where true;
  execute format(
    'insert into public.objetivo_precios (%1$s) select %1$s from public.precios_snapshot_detalle where snapshot_id = $1',
    v_cols
  ) using p_snapshot;

  select count(*) into v_count from public.objetivo_precios;

  -- UNA fila de resumen en lugar de ~27.000.
  begin
    insert into public.auditoria (
      tabla, fila_id, operacion, usuario_id, usuario_email, origen,
      datos_anteriores, datos_nuevos
    )
    select 'objetivo_precios', p_snapshot::text, 'RESTORE',
           u.uid, u.email, coalesce(u.origen, 'sin_usuario'),
           jsonb_build_object('filas_antes', v_antes),
           jsonb_build_object('filas_despues', v_count,
                              'snapshot_id', p_snapshot,
                              'snapshot_nombre', v_nombre,
                              'snapshot_auto_previo', v_auto)
      from public.auditoria_usuario() u;
  exception when others then
    null;   -- REGLA 1: ni siquiera el resumen puede romper la restauracion
  end;

  return v_count;
end;
$$;

-- PERMISOS: NUNCA dar execute a anon en esta funcion.
--
-- Es SECURITY DEFINER y saltea RLS: borra las 13.713 filas de objetivo_precios
-- y las reemplaza por las del snapshot. La anon key viaja en el JS del cliente,
-- a la vista de cualquiera, asi que con execute para anon cualquier persona con
-- esa key podia borrar todos los precios sin siquiera tener cuenta.
--
-- El revoke a public tambien hace falta: Postgres le da execute a PUBLIC por
-- defecto en cada funcion nueva, y ese grant implicito alcanza a anon igual.
-- Los dos revoke van ANTES del grant, en este orden, y quedan en el script para
-- que una re-corrida no pueda reabrir el agujero.
revoke execute on function public.restaurar_precios_snapshot(uuid) from public, anon;
grant  execute on function public.restaurar_precios_snapshot(uuid) to authenticated;


-- =====================================================================
-- BLOQUE 12 â€” Verificacion
-- =====================================================================

-- 12.1 Triggers instalados: 8 fila-por-fila + 3 de objetivo_precios
select c.relname as tabla, t.tgname as trigger,
       case t.tgtype & 1 when 1 then 'fila' else 'sentencia' end as nivel
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal
   and c.relnamespace = 'public'::regnamespace
   and (t.tgname like '%_auditoria' or t.tgname like '%_aud_%')
 order by c.relname, t.tgname;

-- 12.2 RLS activo, sin FORCE, y una sola policy de SELECT en cada tabla
select relname, relrowsecurity as rls_on, relforcerowsecurity as rls_forzado
  from pg_class
 where oid in ('public.auditoria'::regclass, 'public.auditoria_objetivo_precios'::regclass);

select tablename, policyname, cmd, roles from pg_policies
 where schemaname = 'public' and tablename in ('auditoria','auditoria_objetivo_precios')
 order by tablename;

-- 12.3 Grants: authenticated solo SELECT, anon sin nada
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('auditoria','auditoria_objetivo_precios')
 order by table_name, grantee, privilege_type;


-- =====================================================================
-- BLOQUE 13 â€” Prueba end-to-end
--
-- ATENCION: el sistema esta en produccion y Comercial lo usa. Por eso TODO
-- el bloque va dentro de una transaccion que termina en ROLLBACK: se prueba
-- contra datos reales pero no queda NADA, ni el cambio de precio ni las
-- filas de auditoria que genero.
--
-- CORRER EL BLOQUE ENTERO DE UNA SOLA VEZ, no linea por linea: si se corta
-- a la mitad, el editor abre otra sesion y el rollback no alcanza al resto.
--
-- Tambien mide el tiempo real del UPDATE masivo ya con el trigger puesto,
-- que es el numero que faltaba.
--
-- Corrido desde el editor SQL debe quedar origen='sin_usuario'.
-- Desde la app, con el email del usuario.
-- =====================================================================
begin;

  -- 13.1 UPDATE que NO cambia nada -> no debe registrar ninguna cabecera
  update public.objetivo_precios
     set precio_hora = precio_hora
   where mes >= '2026-07-01';

  select count(*) as cabeceras_tras_update_vacio
    from public.auditoria where tabla = 'objetivo_precios';

  -- 13.2 UPDATE real sobre TODA la tabla -> 1 cabecera + 13.713 detalles.
  --      El tiempo que reporte este explain es el costo real del aumento masivo.
  explain (analyze, buffers)
  update public.objetivo_precios
     set precio_hora = precio_hora * 1.08;

  -- 13.3 La cabecera: quien, cuando, cuantas filas
  select a.id, a.operacion, a.usuario_email, a.origen,
         a.datos_nuevos ->> 'filas' as filas, a.hecho_at
    from public.auditoria a
   where a.tabla = 'objetivo_precios'
   order by a.id desc
   limit 5;

  -- 13.4 El detalle de la ultima sentencia
  select d.codigo_objetivo, d.mes, d.precio_antes, d.precio_despues, d.antes, d.despues
    from public.auditoria_objetivo_precios d
   where d.auditoria_id = (select max(id) from public.auditoria where tabla = 'objetivo_precios')
   limit 10;

rollback;

-- Confirmacion de que no quedo nada: las dos consultas deben dar 0.
select (select count(*) from public.auditoria where tabla = 'objetivo_precios') as cabeceras,
       (select count(*) from public.auditoria_objetivo_precios)                 as detalles;


-- =====================================================================
-- BLOQUE 14 â€” Consultas de uso (guardar a mano, no hace falta correrlas)
-- =====================================================================

-- Quien cambio los precios de un cliente
-- select a.hecho_at, a.usuario_email, a.origen, d.operacion,
--        d.codigo_objetivo, d.mes, d.precio_antes, d.precio_despues
--   from public.auditoria_objetivo_precios d
--   join public.auditoria a on a.id = d.auditoria_id
--  where d.cliente_id = 'PEGAR-UUID-DEL-CLIENTE'
--  order by a.hecho_at desc;

-- Historia completa de un objetivo (todos sus meses)
-- select a.hecho_at, a.usuario_email, d.mes, d.precio_antes, d.precio_despues
--   from public.auditoria_objetivo_precios d
--   join public.auditoria a on a.id = d.auditoria_id
--  where d.sucursal_id = 'PEGAR-UUID-DEL-OBJETIVO'
--  order by d.mes, a.hecho_at desc;

-- Que hizo un usuario en el ultimo mes (todas las tablas)
-- select tabla, operacion, count(*) as veces, max(hecho_at) as ultima
--   from public.auditoria
--  where usuario_email = 'PEGAR-EMAIL'
--    and hecho_at > now() - interval '30 days'
--  group by tabla, operacion
--  order by ultima desc;

-- Los aumentos masivos: una linea por sentencia, con cuantas filas toco
-- select a.hecho_at, a.usuario_email, a.origen, a.operacion,
--        a.datos_nuevos ->> 'filas' as filas_tocadas
--   from public.auditoria a
--  where a.tabla = 'objetivo_precios'
--    and (a.datos_nuevos ->> 'filas')::int > 100
--  order by a.hecho_at desc;

-- Cambios sin usuario (SQL corrido a mano): control de que nada raro pasa
-- select tabla, operacion, hecho_at, fila_id
--   from public.auditoria
--  where origen = 'sin_usuario'
--  order by hecho_at desc
--  limit 50;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_49_notas_pdf.sql
-- =====================================================================

-- =====================================================================
-- Notas de aumento â€” PASO 3: el PDF de cada nota SE GUARDA en Storage.
--
-- Hasta hoy el PDF se armaba en el navegador, se descargaba dentro de un
-- ZIP y se perdia: no quedaba copia de lo que se le mando al cliente.
-- Ahora cada PDF se sube al bucket finflow-docs y el PUNTERO al archivo
-- queda en notas_emitidas, igual que homologacion_path en paritarias y
-- logo_path / firma_path en notas_config.
--
-- El script hace DOS cosas:
--   BLOQUE 1 â€” regulariza el modelo que YA EXISTE en la base pero que
--              ningun archivo del repo creaba (paritaria_id, origen_id).
--   BLOQUE 2 â€” agrega las tres columnas del PDF.
--   BLOQUE 3 â€” verificacion.
--
-- IMPORTANTE â€” SOBRE LA BASE DE PRODUCCION EL BLOQUE 1 NO CAMBIA NADA.
-- Todo lo que toca ya existe: verificado el 29-jul-2026 contra
-- information_schema.columns y pg_constraint. Esta escrito para que una
-- base recreada desde el repo quede IGUAL a la real. Las columnas se
-- habian agregado a mano en algun momento y el repo no las tenia; quien
-- re-corriera abm_29 tal como estaba recreaba el modelo viejo y rompia
-- la generacion de casos del CRM (Pendiente_Finflow.txt).
--
-- QUE NO TOCA ESTE SCRIPT
--  - RLS y policies de la tabla: agregar columnas no cambia las
--    politicas de FILA. No hace falta tocarlas.
--  - Policies del bucket: las 4 de finflow-docs son por BUCKET COMPLETO,
--    no por carpeta (verificado en pg_policies el 29-jul-2026), asi que
--    la carpeta nueva de las notas se escribe sin permisos adicionales.
--  - No agrega un CHECK de "escala_id o paritaria_id no nulo": hoy la
--    base no lo tiene, y este script regulariza el repo, no cambia el
--    comportamiento de produccion. Si se decide agregarlo, va aparte.
--
-- Requiere abm_29_notas_estado.sql corrido antes (crea la tabla).
-- Sin begin/commit. Idempotente: se puede re-correr entero.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 â€” Modelo de DOS ORIGENES (escala o paritaria)
--
-- POR QUE escala_id ES NULLABLE
-- Una nota puede nacer de dos lados: de una ESCALA aplicada, o de
-- aumentos cargados A MANO con una paritaria activa. Estas ultimas son
-- las filas "virtuales": escala_id null y paritaria_id cargado. El
-- modelo original de abm_29 solo contemplaba el primer caso.
--
-- POR QUE origen_id ES UNA COLUMNA GENERADA
-- La regla real es "una nota por cliente por ORIGEN", sea ese origen una
-- escala o una paritaria. Con dos columnas nullables no hay unique que
-- lo exprese: unique (escala_id, cliente_id) deja pasar infinitas filas
-- con escala_id null, porque en SQL un null nunca choca con otro null.
-- coalesce(escala_id, paritaria_id) colapsa los dos casos en un solo
-- valor y ahi el unique si funciona.
-- GENERADA y no escrita por la app: asi no puede quedar desincronizada
-- de las dos columnas de las que sale.
-- =====================================================================
alter table public.notas_emitidas
  alter column escala_id drop not null;

alter table public.notas_emitidas
  add column if not exists paritaria_id uuid references public.paritarias(id) on delete cascade;

alter table public.notas_emitidas
  add column if not exists origen_id uuid generated always as (coalesce(escala_id, paritaria_id)) stored;

comment on column public.notas_emitidas.escala_id    is 'FK a escalas_aumento. NULL en las notas "virtuales" (aumentos cargados a mano, sin escala).';
comment on column public.notas_emitidas.paritaria_id is 'FK a paritarias. Es el origen de las notas virtuales y ademas permite listar todas las notas de una paritaria.';
comment on column public.notas_emitidas.origen_id    is 'Columna GENERADA = coalesce(escala_id, paritaria_id). Colapsa los dos origenes posibles en un solo valor para poder expresar el unique por cliente.';

-- El unique viejo (por escala) queda reemplazado por el de origen.
alter table public.notas_emitidas
  drop constraint if exists notas_emitidas_escala_cliente_uk;

-- "add constraint" no acepta "if not exists": hay que preguntar primero.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname  = 'notas_emitidas_origen_cliente_uk'
       and conrelid = 'public.notas_emitidas'::regclass
  ) then
    alter table public.notas_emitidas
      add constraint notas_emitidas_origen_cliente_uk unique (origen_id, cliente_id);
  end if;
end $$;


-- =====================================================================
-- BLOQUE 2 â€” El puntero al PDF
--
-- POR QUE TRES COLUMNAS Y NO UNA TABLA APARTE
-- Hay exactamente UNA nota por (origen, cliente) y UN PDF vigente por
-- nota. Una tabla hija solo tendria sentido para guardar el historial de
-- versiones, y se decidio NO guardarlo (ver abajo).
--
-- QUE PASA AL REGENERAR UNA NOTA (decision del 29-jul-2026)
-- pdf_path pasa a apuntar al PDF nuevo y el anterior queda en Storage
-- SIN puntero. Es deliberado, no un descuido. No necesitamos consultar
-- versiones viejas, y el archivo viejo no se pierde ni se pisa: toda
-- subida del sistema es inmutable (path unico + upsert:false). A ~70 KB
-- por nota, el espacio que ocupan los huerfanos es irrelevante. Si algun
-- dia hiciera falta el historial, los archivos siguen estando.
--
-- POR QUE pdf_subido_en Y NO ALCANZA CON pdf_path
-- Distingue "nunca se subio" de "se subio y algo le paso al puntero", y
-- deja ver cuanto despues de generarse se subio cada uno (la reparacion
-- sube tarde, y eso importa: regenera con los precios de ESE momento).
--
-- No se guardan mime (siempre application/pdf) ni bytes (no se usan).
-- =====================================================================
alter table public.notas_emitidas
  add column if not exists pdf_path      text,
  add column if not exists pdf_nombre    text,
  add column if not exists pdf_subido_en timestamptz;

comment on column public.notas_emitidas.pdf_path      is 'Path del PDF dentro del bucket finflow-docs. NULL = la nota se genero pero el archivo no quedo guardado (lo repara el boton "Subir" de la columna PDF).';
comment on column public.notas_emitidas.pdf_nombre    is 'Nombre original del archivo (CUIT - Nombre.pdf), para mostrar y para la descarga.';
comment on column public.notas_emitidas.pdf_subido_en is 'Cuando se subio el PDF a Storage. Puede ser MUY posterior a fecha_generada si se subio con el boton de reparacion.';

-- Un archivo pertenece a UNA sola nota. El path ya es unico por
-- construccion (timestamp + azar), asi que este unique no atrapa choques
-- naturales: atrapa un bug del codigo que escriba el mismo puntero en
-- dos filas. Los null no chocan entre si, asi que las notas todavia sin
-- PDF no se estorban. Misma convencion que crm_gestion_adjuntos.path.
create unique index if not exists notas_emitidas_pdf_path_uk
  on public.notas_emitidas (pdf_path);


-- ---------------------------------------------------------------------
-- BLOQUE 3 â€” Verificacion (solo lectura)
-- ---------------------------------------------------------------------
-- (a) Las tres columnas del PDF existen, y origen_id sigue siendo generada.
select column_name, data_type, is_nullable, is_generated, generation_expression
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notas_emitidas'
 order by ordinal_position;

-- (b) Constraints: tiene que estar notas_emitidas_origen_cliente_uk y NO
--     tiene que estar notas_emitidas_escala_cliente_uk.
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.notas_emitidas'::regclass
 order by conname;

-- (c) Indices. Ademas del unique nuevo del pdf_path, mirar si paritaria_id
--     tiene indice: la columna Nota de la grilla filtra por paritaria_id en
--     cada carga. Si no aparece ninguno, decidir aparte si conviene crearlo.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'notas_emitidas'
 order by indexname;

-- (d) Cuantas notas ya generadas quedaron sin PDF. Antes de que el codigo
--     nuevo entre en produccion tienen que ser TODAS: nunca se guardo uno.
select count(*) filter (where fecha_generada is not null)                        as generadas,
       count(*) filter (where fecha_generada is not null and pdf_path is null)    as sin_pdf,
       count(*) filter (where pdf_path is not null)                              as con_pdf
  from public.notas_emitidas;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\precios\abm_50_notas_indice_paritaria.sql
-- =====================================================================

-- =====================================================================
-- notas_emitidas: indice por paritaria_id.
--
-- POR QUE
-- La columna "Nota" de la grilla de Precios se carga con cargarNotas()
-- (js/pages/precios.js), que trae TODAS las notas de una paritaria:
--     select ... from notas_emitidas where paritaria_id = <pid>
-- Eso corre en cada carga de la pantalla y cada vez que se cambia de
-- paritaria en el selector del encabezado. La tabla tenia indices por
-- escala_id y por cliente_id, pero NINGUNO por paritaria_id: verificado
-- en pg_indexes el 29-jul-2026. Sin indice, cada una de esas lecturas
-- recorre la tabla entera.
--
-- HONESTIDAD SOBRE EL BENEFICIO DE HOY
-- Con 94 filas esto no se nota, y es probable que el planificador ni
-- use el indice: a este tamano leer la tabla completa le sale mas barato
-- que pasar por el indice, y hace bien. El indice es para despues: la
-- tabla crece una tanda por paritaria (~300 filas cada una), y esta
-- consulta esta en el camino critico de la pantalla que Comercial abre
-- todos los dias. Se pone ahora porque cuesta casi nada y evita tener
-- que acordarse cuando ya moleste.
--
-- COSTO: una escritura extra por insert/update de la columna en una
-- tabla que se escribe de a tandas manuales, no continuamente. Nulo en
-- la practica.
--
-- POR QUE NO ES PARCIAL (where paritaria_id is not null)
-- Hoy todas las filas tienen paritaria_id cargado, asi que un indice
-- parcial no ahorraria nada y agregaria una condicion que el
-- planificador tiene que poder demostrar para usarlo.
--
-- Sin begin/commit. Idempotente.
-- =====================================================================
create index if not exists notas_emitidas_paritaria_idx
  on public.notas_emitidas (paritaria_id);


-- ---------------------------------------------------------------------
-- Verificacion (solo lectura): tiene que aparecer notas_emitidas_paritaria_idx.
-- ---------------------------------------------------------------------
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'notas_emitidas'
 order by indexname;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_34_crm_casos.sql
-- =====================================================================

-- =====================================================================
-- CRM de negociacion â€” PASO 1: modelo de datos.
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
-- BLOQUE 0 â€” VERIFICACION PREVIA (read-only, no escribe nada)
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

-- ----- 0.1 â€” estructura (a + b + c en una sola corrida) -----
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

-- ----- 0.2 â€” cuantas notas traen paritaria_id cargado -----
-- Define si el caso puede relacionarse con su nota directo, o si hay que
-- pasar por escalas_aumento.paritaria_id cuando la nota vino por escala.
-- Correr SOLO despues de que 0.1 haya confirmado que la columna existe.
select count(*) filter (where paritaria_id is not null) as con_paritaria,
       count(*) filter (where paritaria_id is null)     as sin_paritaria,
       count(*)                                         as total
  from public.notas_emitidas;


-- =====================================================================
-- BLOQUE 1 â€” crm_casos
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
      'sin_respuesta',      -- venciÃ³ el tiempo razonable y no contesto
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
-- BLOQUE 2 â€” crm_gestiones (la bitacora)
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
-- BLOQUE 3 â€” crm_gestion_adjuntos
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
-- BLOQUE 4 â€” updated_at automatico
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
-- BLOQUE 5 â€” Sellar QUIEN CARGO
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
-- BLOQUE 6 â€” RLS + grants
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

-- ----- 6.4 â€” Grants: espejo exacto de las politicas -----
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
-- BLOQUE 7 â€” Auditoria
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
-- BLOQUE 8 â€” VERIFICACION
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



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_38_crm_acciones_bloque.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” PASO 3a: acciones EN BLOQUE sobre los casos.
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
-- BLOQUE 1 â€” Sellar QUIEN PRECERRO
--
-- El documento (seccion 5) es explicito: el vencimiento del plazo NO cambia
-- el estado solo, lo confirma Comercial en bloque, y eso es una decision de
-- RESPONSABILIDAD â€” un cambio de estado sin responsable es un problema si
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
-- BLOQUE 2 â€” Permisos y trigger del sellado
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
-- BLOQUE 3 â€” VERIFICACION del sellado
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

-- (b) â€” correr aparte
-- select trigger_name, action_timing, event_manipulation
--   from information_schema.triggers
--  where trigger_schema = 'public' and event_object_table = 'crm_casos'
--  order by trigger_name;


-- =====================================================================
-- BLOQUE 4 â€” Cambio de estado en bloque
--
-- Cubre precerrar, marcar sin respuesta y marcar en renegociacion.
--
-- 'cerrada' NO esta permitido a proposito: el cierre lo confirma el PAGO,
-- no una persona (seccion 5 del documento). Y los casos ya cerrados no se
-- tocan: una accion en bloque no puede reabrir algo que ya se cobro.
--
-- MOTIVO OBLIGATORIO EN EL PRECIERRE, DESCRIPCION OPCIONAL.
-- Decision de Juan (25-jul): exigir un texto en una accion de 280 casos
-- garantiza que se escriba "ok" 280 veces â€” ensucia la bitacora y da falsa
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
-- BLOQUE 5 â€” Comentario y permisos del cambio de estado
-- Si el bloque 4 no se aplico, este falla con "function does not exist".
-- =====================================================================
comment on function public.crm_cambiar_estado(uuid[], text, text, text) is
  'Cambia el estado de varios casos en una sentencia. Motivo obligatorio al precerrar; descripcion obligatoria solo si el motivo es "otro". No toca casos cerrados ni los que ya estan en ese estado. Devuelve cuantos se movieron realmente.';

revoke execute on function public.crm_cambiar_estado(uuid[], text, text, text) from public, anon;
grant  execute on function public.crm_cambiar_estado(uuid[], text, text, text) to authenticated;


-- =====================================================================
-- BLOQUE 6 â€” Asignar responsable en bloque
--
-- TOCA LOS DOS: el CASO y el CLIENTE.
--   Â· El caso, para que aparezca en la agenda AHORA.
--   Â· El cliente, para que las proximas paritarias nazcan bien. Si solo
--     tocara el caso, el mismo trabajo se repetiria en cada tanda.
--
-- No contradice el "responsable congelado" de crm_casos: congelar significa
-- que el SISTEMA no vuelve a leer el cliente sobre casos viejos, no que una
-- persona no pueda escribir los dos a proposito.
--
-- PERO SE SEPARA EN DOS COMPORTAMIENTOS, y esta es la parte importante:
--   Â· Cliente SIN responsable  -> se completa SIEMPRE. Es el 100% de lo de
--     hoy (76 de 77 clientes sin RESP. NEG.), no hay nada que preguntar.
--   Â· Cliente que YA tiene otro -> solo con p_pisar_cliente = true.
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
-- BLOQUE 7 â€” Comentario y permisos de asignar responsable
-- Si el bloque 6 no se aplico, este falla con "function does not exist".
-- =====================================================================
comment on function public.crm_asignar_responsable(uuid[], uuid, boolean) is
  'Asigna responsable a varios casos y completa el RESP. NEG. de los clientes que no lo tengan. Los clientes que YA tienen otro responsable solo se pisan con p_pisar_cliente = true. Devuelve casos / clientes completados / clientes pisados.';

revoke execute on function public.crm_asignar_responsable(uuid[], uuid, boolean) from public, anon;
grant  execute on function public.crm_asignar_responsable(uuid[], uuid, boolean) to authenticated;


-- =====================================================================
-- BLOQUE 8 â€” VERIFICACION EN EL CATALOGO
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
-- BLOQUE 9 â€” PRUEBA
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



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_39_crm_proxima_accion.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” PASO 3b: la PROXIMA ACCION.
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
-- BLOQUE 1 â€” Tabla de acciones configurables
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
-- BLOQUE 2 â€” Carga de la lista PROVISORIA
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
  ('Esperando documentaciÃ³n del cliente',   60, false),
  ('Otro',                                  99, true)
on conflict (nombre) do nothing;


-- =====================================================================
-- BLOQUE 3 â€” Los dos campos nuevos en crm_casos
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
-- BLOQUE 4 â€” RLS de crm_acciones
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
-- BLOQUE 5 â€” Permisos de crm_acciones
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
-- BLOQUE 6 â€” VERIFICACION (solo lee, no cambia nada)
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



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_40_crm_cambiar_estado_accion.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” crm_cambiar_estado: la PROXIMA ACCION entra en la funcion.
--
-- REEMPLAZA a la version de abm_38 (que recibia 4 parametros).
-- abm_38 queda como historia: NO se re-corre su bloque 4.
--
-- POR QUE VA EN LA BASE Y NO EN LA PANTALLA
-- La seccion 10 del diseno dice que en sin_respuesta, en_renegociacion y
-- reclamo_posterior la proxima accion es OBLIGATORIA, porque un caso vivo sin
-- accion ni fecha no le aparece a nadie en la agenda: queda abierto e invisible.
--
-- Si la pantalla hiciera dos llamadas â€”primero el estado, despues la accionâ€” un
-- corte de red entre las dos deja exactamente eso: 40 casos en renegociacion sin
-- agenda. La regla tiene que estar donde no se pueda saltear, y eso es adentro de
-- la funcion: estado y accion entran en la MISMA transaccion, o no entra ninguno.
--
-- Correr BLOQUE POR BLOQUE. El bloque 5 es la prueba y va ENTERO de una vez.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 â€” Borrar la version de 4 parametros
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
-- BLOQUE 2 â€” La funcion nueva
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
-- BLOQUE 3 â€” Comentario y permisos
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
-- BLOQUE 4 â€” VERIFICACION EN EL CATALOGO (solo lee)
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
-- BLOQUE 5 â€” PRUEBA CONTRA DATOS REALES
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



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_44_crm_fijar_proxima_accion.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” cambiar la PROXIMA ACCION sin cambiar el estado.
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
-- escribir estas tres columnas sola. Pero entonces las reglas â€”accion vigente,
-- accion y fecha juntas, detalle obligatorio en las que lo pidenâ€” vivirian solo
-- en el navegador, que es exactamente lo que evitamos en abm_40. Un caso vivo con
-- accion y sin fecha no le aparece a nadie en la agenda.
--
-- Correr BLOQUE POR BLOQUE. El bloque 4 va ENTERO de una sola vez.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 â€” La funcion
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
-- BLOQUE 2 â€” Comentario y permisos
-- =====================================================================
comment on function public.crm_fijar_proxima_accion(uuid[], uuid, date, text) is
  'Cambia la proxima accion, la fecha tope y el detalle de uno o varios casos SIN tocar el estado. Saltea los precerrados y cerrados. Accion y fecha son obligatorias: un caso vivo sin agenda no le aparece a nadie.';

revoke execute on function public.crm_fijar_proxima_accion(uuid[], uuid, date, text) from public, anon;
grant  execute on function public.crm_fijar_proxima_accion(uuid[], uuid, date, text) to authenticated;


-- =====================================================================
-- BLOQUE 3 â€” VERIFICACION EN EL CATALOGO (solo lee)
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
-- BLOQUE 4 â€” PRUEBA
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



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_45_crm_gestion_tipos.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” "QUE SE HIZO" en las gestiones. El canal pasa a opcional.
--
-- EL PROBLEMA
-- Hoy el unico campo obligatorio de una gestion es el CANAL, que es justo el que
-- menos importa: "mail" o "telefono" no dicen nada. Lo que importa es QUE PASO â€”
-- se envio presupuesto, se negocio precio, se hablo con el Coordinador.
--
-- Y hay un problema practico: un campo obligatorio que a nadie le importa se
-- completa mal. Comercial va a elegir cualquier canal para poder guardar, y la
-- unica estadistica que ese campo podria dar queda sucia.
--
-- LO QUE CAMBIA
--   Â· "que se hizo" (tipo_id) -> lista predefinida y OBLIGATORIO. Es el agrupable.
--   Â· canal -> OPCIONAL.
--   Â· el texto libre (descripcion) queda igual.
--
-- POR QUE NO COMPARTE LISTA CON LAS PROXIMAS ACCIONES
-- Son dos preguntas distintas: "que hice" y "que falta y de quien depende". Pero
-- SE CONECTAN, y el vinculo va como DATO y no en el codigo: cada tipo declara en
-- cumple_accion_id que accion pendiente cierra. Si viviera en el JavaScript, el
-- dia que se agregue un tipo nadie se acordaria de ensenarle que cumple.
--
-- ATENCION â€” LA PANTALLA Y ESTE SCRIPT VAN JUNTOS.
-- El bloque 5 pone tipo_id NOT NULL. La version de crm.js que manda ese campo
-- entra en el mismo commit: con la pantalla vieja, "Anotar gestion" fallaria.
--
-- Correr BLOQUE POR BLOQUE.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 â€” Tabla de tipos de gestion
--
-- Mismo molde que crm_acciones (abm_39): orden propio, se desactiva en vez de
-- borrarse, y editable SOLO desde el editor de Supabase (ver bloque 7).
--
-- cumple_accion_id es lo unico nuevo respecto de ese molde: el puente entre "lo
-- que hice" y "lo que quedaba pendiente". Nullable, porque no toda gestion cierra
-- una accion (negociar un precio no cumple nada en particular).
-- =====================================================================
create table if not exists public.crm_gestion_tipos (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden  smallint not null default 100,
  activa boolean not null default true,

  -- NO lleva "requiere_detalle" como crm_acciones, y es a proposito:
  -- crm_gestiones.descripcion ya es NOT NULL, asi que el texto es obligatorio en
  -- TODAS las gestiones. La bandera seria una regla que parece existir y no hace
  -- nada â€” peor que no tenerla.

  -- Que accion pendiente cierra esta gestion. Lo usa la pantalla para OFRECER
  -- marcarla como cumplida; nunca para decidirlo sola.
  cumple_accion_id uuid references public.crm_acciones(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_gestion_tipos is
  'Lista configurable de "que se hizo" en una gestion. Es el campo agrupable de la bitacora. Editable SOLO desde el editor de Supabase.';
comment on column public.crm_gestion_tipos.cumple_accion_id is
  'Que proxima accion cierra esta gestion. El vinculo va como dato y no en el codigo: al agregar un tipo hay que declarar que cumple, o no cumple nada.';

create index if not exists idx_crm_gestion_tipos_activas
  on public.crm_gestion_tipos (activa, orden);

drop trigger if exists trg_crm_gestion_tipos_updated_at on public.crm_gestion_tipos;
create trigger trg_crm_gestion_tipos_updated_at before update on public.crm_gestion_tipos
for each row execute function public.set_updated_at();


-- =====================================================================
-- BLOQUE 2 â€” Carga de la lista PROVISORIA
--
-- Juan la cierra con Comercial el lunes 27 de julio de 2026, junto con la de
-- proximas acciones (las dos se definen en la misma conversacion: el vinculo de
-- abajo solo se puede decidir con las dos listas a la vista).
--
-- AJUSTAR NOMBRES DESPUES ES UN UPDATE, no hace falta re-correr el script.
--
-- Las 9 y 10 son RESULTADOS, no acciones nuestras. Van igual porque son las que
-- disparan cambios de estado, y hoy ese momento â€”"aca fue cuando acepto"â€” no
-- queda en ningun lado: solo el estado nuevo, sin la conversacion que lo produjo.
--
-- PENDIENTE DE LA CHARLA: "Se negocio el precio" puede partirse en dos, porque
-- "ofreci un numero" es una gestion y "acordamos un numero" es un resultado que
-- ademas dispara cargar el precio nuevo. Agregar un tipo es un insert.
--
-- El vinculo se resuelve por NOMBRE contra crm_acciones. Si un nombre no coincide
-- queda en null SIN AVISAR: el bloque 6 es el que lo muestra.
-- =====================================================================
insert into public.crm_gestion_tipos (nombre, orden, cumple_accion_id) values
  ('Se enviÃ³ la nota de aumento',            10, null),
  ('Se reenviÃ³ la nota',                     20, (select id from public.crm_acciones where nombre = 'Reenviar la nota')),
  ('Se reclamÃ³ respuesta',                   30, (select id from public.crm_acciones where nombre = 'Esperando respuesta del cliente')),
  ('Se enviÃ³ una nueva propuesta',           40, (select id from public.crm_acciones where nombre = 'Enviar nueva propuesta al cliente')),
  ('Se negociÃ³ el precio',                   50, null),
  ('Se hablÃ³ con el Coordinador de Cuenta',  60, (select id from public.crm_acciones where nombre = 'A resolver con el Coordinador de Cuenta')),
  ('Se hablÃ³ con el Consejo o la administraciÃ³n', 70, (select id from public.crm_acciones where nombre = 'A resolver con el Consejo')),
  ('Se recibiÃ³ documentaciÃ³n',               80, (select id from public.crm_acciones where nombre = 'Esperando documentaciÃ³n del cliente')),
  ('El cliente aceptÃ³',                      90, null),
  ('El cliente pidiÃ³ una rebaja',           100, null),
  ('Otro',                                  110, null)
on conflict (nombre) do nothing;


-- =====================================================================
-- BLOQUE 3 â€” Los cambios en crm_gestiones
--
-- canal: se le saca el NOT NULL. El CHECK no hace falta tocarlo â€” un CHECK solo
-- falla cuando da FALSE, y con NULL da NULL, asi que deja pasar el nulo.
--
-- tipo_id: on delete RESTRICT. Un tipo en uso no se puede borrar; para sacarlo de
-- circulacion se desactiva. Igual que las acciones.
-- =====================================================================
alter table public.crm_gestiones
  alter column canal drop not null;

alter table public.crm_gestiones
  add column if not exists tipo_id uuid references public.crm_gestion_tipos(id) on delete restrict;

comment on column public.crm_gestiones.tipo_id is
  'Que se hizo. Es el campo AGRUPABLE de la bitacora: el que responde "cuantas propuestas nuevas mandamos esta paritaria".';
comment on column public.crm_gestiones.canal is
  'Por que medio. OPCIONAL a proposito: es dato de color. Obligarlo hacia que se eligiera cualquiera para poder guardar.';

create index if not exists idx_crm_gestiones_tipo on public.crm_gestiones (tipo_id);


-- =====================================================================
-- BLOQUE 4 â€” RELLENO de las gestiones que ya existen
--
-- Las unicas que hay son las del envio de la nota, que el sistema creo con
-- origen = 'envio_nota'. Tienen un tipo natural, asi que el relleno es exacto y no
-- inventa nada.
-- =====================================================================
update public.crm_gestiones g
   set tipo_id = (select id from public.crm_gestion_tipos where nombre = 'Se enviÃ³ la nota de aumento')
 where g.tipo_id is null
   and g.origen = 'envio_nota';

-- Control: tiene que dar CERO. Si da mas, hay gestiones sin tipo que el bloque 5
-- no va a poder dejar obligatorias â€” mirar cuales antes de seguir.
select count(*) as gestiones_sin_tipo
  from public.crm_gestiones
 where tipo_id is null;


-- =====================================================================
-- BLOQUE 5 â€” tipo_id OBLIGATORIO
--
-- Solo si el control del bloque 4 dio CERO.
--
-- Va en la base y no solo en la pantalla por lo mismo de siempre: desde el
-- navegador se puede saltear. Una gestion sin tipo no se puede rellenar despues â€”
-- nadie va a releer doscientas notas de texto libre para clasificarlas.
-- =====================================================================
alter table public.crm_gestiones
  alter column tipo_id set not null;


-- =====================================================================
-- BLOQUE 6 â€” La gestion del envio nace con su tipo
--
-- crm_generar_casos inserta la gestion del envio, y con tipo_id obligatorio tiene
-- que darle un valor o el insert falla.
--
-- ACA ALCANZA "create or replace": no cambian ni los parametros ni el tipo de
-- retorno, solo el cuerpo. No hay que dropear nada (a diferencia de abm_41,
-- abm_42 y abm_44).
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
  gestiones_creadas       integer,
  casos_marcados_enviada  integer
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
  v_marcados integer;
  v_tipo     uuid;
begin
  if not exists (select 1 from public.paritarias where id = p_paritaria_id) then
    raise exception 'La paritaria % no existe.', p_paritaria_id
      using hint = 'Verificar el id contra la tabla paritarias.';
  end if;

  -- El tipo de la gestion del envio. Si alguien le cambio el nombre en la tabla,
  -- mejor fallar aca con un mensaje claro que insertar sin tipo y morir en el
  -- NOT NULL con un error de Postgres.
  select id into v_tipo from public.crm_gestion_tipos
   where nombre = 'Se enviÃ³ la nota de aumento';
  if v_tipo is null then
    raise exception 'Falta el tipo de gestion "Se enviÃ³ la nota de aumento" en crm_gestion_tipos.'
      using hint = 'Si se le cambio el nombre, actualizar esta funcion.';
  end if;

  drop table if exists _crm_uni;
  create temp table _crm_uni on commit drop as
  select distinct on (n.cliente_id)
         n.cliente_id, n.paritaria_id, n.fecha_enviada, c.responsable_id
    from public.notas_emitidas n
    join public.clientes c on c.id = n.cliente_id
   where n.paritaria_id = p_paritaria_id
     and (p_clientes is null or n.cliente_id = any (p_clientes))
   order by n.cliente_id, n.fecha_enviada desc nulls last;

  select count(*) into v_universo from _crm_uni;

  -- 1) Los casos que faltan.
  with ins as (
    insert into public.crm_casos (cliente_id, paritaria_id, estado, responsable_id)
    select u.cliente_id, u.paritaria_id,
           case when u.fecha_enviada is not null then 'enviada' else 'pendiente_envio' end,
           u.responsable_id
      from _crm_uni u
    on conflict (cliente_id, paritaria_id) do nothing
    returning responsable_id
  )
  select count(*), count(*) filter (where responsable_id is null)
    into v_creados, v_sin_resp
    from ins;

  -- 2) ESTADO: los que ya existian, siguen en pendiente_envio, y su nota ya salio.
  update public.crm_casos c
     set estado = 'enviada'
    from _crm_uni u
   where u.cliente_id  = c.cliente_id
     and u.paritaria_id = c.paritaria_id
     and u.fecha_enviada is not null
     and c.estado = 'pendiente_envio';
  get diagnostics v_marcados = row_count;

  -- 3) GESTION del envio, para todos los que tengan fecha. Sin condicion de
  --    estado: el envio ocurrio y va al historial aunque el caso ya haya avanzado.
  insert into public.crm_gestiones (caso_id, fecha, canal, descripcion, origen, tipo_id)
  select c.id,
         u.fecha_enviada::date,
         'mail',
         'Nota de aumento enviada',
         'envio_nota',
         v_tipo
    from _crm_uni u
    join public.crm_casos c
      on c.cliente_id = u.cliente_id
     and c.paritaria_id = u.paritaria_id
   where u.fecha_enviada is not null
  on conflict (caso_id) where origen = 'envio_nota' do nothing;
  get diagnostics v_gest = row_count;

  return query select v_universo, v_creados, v_universo - v_creados,
                      v_sin_resp, v_gest, v_marcados;
end;
$$;

-- El create or replace conserva los permisos, pero se re-otorgan por si esta
-- funcion se corriera sobre una base donde nunca se aplico abm_42.
revoke execute on function public.crm_generar_casos(uuid, uuid[]) from public, anon;
grant  execute on function public.crm_generar_casos(uuid, uuid[]) to authenticated;


-- =====================================================================
-- BLOQUE 7 â€” RLS y permisos de crm_gestion_tipos
--
-- SELECT y nada mas, igual que crm_acciones: la lista se lee desde la pantalla y
-- se escribe solo desde el editor de Supabase. SIN "force row level security": el
-- dueno tiene que poder cargarla.
-- =====================================================================
alter table public.crm_gestion_tipos enable row level security;

drop policy if exists crm_gestion_tipos_select on public.crm_gestion_tipos;
create policy crm_gestion_tipos_select on public.crm_gestion_tipos
  for select to authenticated using (true);

revoke all on public.crm_gestion_tipos from public, anon, authenticated;
grant select on public.crm_gestion_tipos to authenticated;


-- =====================================================================
-- BLOQUE 8 â€” VERIFICACION (solo lee)
-- =====================================================================

-- (a) Los once tipos, y CON QUE ACCION quedo vinculado cada uno.
--     Los que digan "(sin vinculo)" y en la tabla de arriba deberian tener uno,
--     significan que el nombre de la accion no coincidio: revisar crm_acciones.
select t.orden,
       t.nombre,
       coalesce(a.nombre, '(sin vinculo)') as cumple_accion
  from public.crm_gestion_tipos t
  left join public.crm_acciones a on a.id = t.cumple_accion_id
 order by t.orden;

-- (b) canal quedo nullable y tipo_id obligatorio.
select column_name, is_nullable, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'crm_gestiones'
   and column_name in ('canal','tipo_id','descripcion')
 order by column_name;

-- (c) Permisos: authenticated con SELECT y nada mas. Sin anon, sin PUBLIC.
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'crm_gestion_tipos'
 order by grantee, privilege_type;

-- (d) Las gestiones que hay, con su tipo.
select coalesce(t.nombre, '(sin tipo)') as tipo, g.canal, count(*) as gestiones
  from public.crm_gestiones g
  left join public.crm_gestion_tipos t on t.id = g.tipo_id
 group by t.nombre, g.canal
 order by tipo;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_46_crm_registrar_gestion.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” LA CADENA: registrar la gestion, mover el estado y reagendar, en UN acto.
--
-- EL MODELO
-- La accion pendiente no es un campo que se reemplaza: es el eslabon de adelante
-- de una cadena. Cumplirla la vuelve pasado â€”queda como gestionâ€” y ese mismo acto
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
-- BLOQUE 1 â€” Que estado SUGIERE cada tipo de gestion
--
-- SUGIERE, no decide. La pantalla lo propone y el que opera confirma: cambiar el
-- estado en silencio significaria que alguien descubre despues que su caso se
-- movio solo. Ver la nota del bloque 5.
--
-- POR QUE SE DEDUCE DEL TIPO DE GESTION Y NO DE LA ACCION FUTURA
-- La accion futura no alcanza: "Esperando respuesta del cliente" pasa igual en
-- negociacion que despues de una contrapropuesta. Y 'sin_respuesta' no lo dispara
-- ninguna gestion â€” lo dispara el TIEMPO.
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
-- BLOQUE 2 â€” Las tres sugerencias
--
-- Los otros ocho tipos quedan en null a proposito.
-- =====================================================================
update public.crm_gestion_tipos set estado_sugerido = 'precerrada', motivo_sugerido = 'aceptacion'
 where nombre = 'El cliente aceptÃ³';

update public.crm_gestion_tipos set estado_sugerido = 'en_renegociacion', motivo_sugerido = null
 where nombre = 'El cliente pidiÃ³ una rebaja';

update public.crm_gestion_tipos set estado_sugerido = 'en_renegociacion', motivo_sugerido = null
 where nombre = 'Se enviÃ³ una nueva propuesta';


-- =====================================================================
-- BLOQUE 3 â€” Que accion cerro cada gestion (el eslabon, sellado)
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
-- BLOQUE 4 â€” El limpiado de agenda pasa a depender de una LISTA
--
-- Hasta ahora estaba clavado en 'precerrada'. Se cambia por la lista de estados
-- QUE CIERRAN EL CASO, para que:
--   Â· el dia que exista un estado de baja ("el cliente dejo de ser cliente", que
--     hoy NO existe entre los siete), sea una linea y no haya que acordarse de
--     este comportamiento;
--   Â· 'cerrada' quede cubierta de antemano. Hoy este RPC la rechaza â€”la confirma
--     el pagoâ€” pero cuando ese proceso automatico exista, va a tener que limpiar
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
-- BLOQUE 5 â€” EL RPC DE LA CADENA
--
-- Un solo acto: la gestion, el estado y el eslabon siguiente.
--
-- COMO DECIDE QUE HACER
--   Â· Si p_estado viene y es DISTINTO del actual -> crm_cambiar_estado, que mueve
--     el estado Y la agenda de una vez (y la limpia si el estado cierra el caso).
--   Â· Si el estado no cambia y hay accion nueva  -> crm_fijar_proxima_accion.
--   Â· Si no hay ninguna de las dos               -> solo la gestion (camino suelto).
--
-- Se compara contra el estado ACTUAL en vez de confiar en que la pantalla mande
-- null: la pantalla precarga el estado actual para que el caso normal sea no
-- tocarlo, asi que casi siempre va a llegar un estado igual al que ya tiene. Y si
-- ese estado es 'pendiente_envio' â€”que crm_cambiar_estado no aceptaâ€” mandarlo
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
-- BLOQUE 6 â€” Comentario y permisos
-- =====================================================================
comment on function public.crm_registrar_gestion(uuid, uuid, date, text, text, text, text, text, uuid, date, text) is
  'Un solo acto: registra la gestion, mueve el estado si cambia y engancha el eslabon siguiente de la cadena. Sella en la gestion que accion pendiente cerro. Delega las reglas en crm_cambiar_estado y crm_fijar_proxima_accion: no las reimplementa.';

revoke execute on function public.crm_registrar_gestion(uuid, uuid, date, text, text, text, text, text, uuid, date, text) from public, anon;
grant  execute on function public.crm_registrar_gestion(uuid, uuid, date, text, text, text, text, text, uuid, date, text) to authenticated;


-- =====================================================================
-- BLOQUE 7 â€” VERIFICACION (solo lee)
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
-- BLOQUE 8 â€” PRUEBA DE LA CADENA
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



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_47_crm_acciones_depende_de.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” de QUIEN DEPENDE cada proxima accion.
--
-- POR QUE ESTE SCRIPT EXISTE
-- La columna puede estar ya en la base, agregada a mano. Igual hace falta el
-- script: la regla del proyecto es que el repo refleje EXACTAMENTE lo que hay, y
-- sin esto, alguien que re-corra abm_39 recrea crm_acciones sin la columna.
--
-- Es idempotente de punta a punta: si ya existe no la toca, y la clasificacion
-- solo escribe donde esta en null. Si ya clasificaste a mano, no se pisa nada.
--
-- LAS DOS NATURALEZAS
--   'terceros' -> la pelota NO la tenemos: esperando al cliente, al Consejo, al
--                 coordinador. El caso esta frenado.
--   'nosotros' -> hay algo que hacer.
-- Con volumen son DOS PREGUNTAS DISTINTAS, y la segunda es la del lunes a la
-- manana: "que tengo que trabajar yo".
--
-- POR QUE UN CAMPO Y NO COLORES EN EL CSS
-- Un color no se puede contar, y la pregunta que importa necesita un where.
-- Ademas, con el criterio escrito en el codigo, cada accion nueva habria que
-- acordarse de pintarla; con el campo, la columna no deja nacer una accion sin
-- naturaleza declarada.
--
-- Correr BLOQUE POR BLOQUE. Ninguno borra nada.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 â€” La columna
-- =====================================================================
alter table public.crm_acciones
  add column if not exists depende_de text;

alter table public.crm_acciones drop constraint if exists crm_acciones_depende_chk;
alter table public.crm_acciones add constraint crm_acciones_depende_chk
  check (depende_de is null or depende_de in ('nosotros', 'terceros'));

comment on column public.crm_acciones.depende_de is
  'De quien depende que el caso avance: terceros (esperando a alguien) o nosotros (hay algo que hacer). Es lo que responde "que tengo que trabajar yo". Null = sin clasificar.';

create index if not exists idx_crm_acciones_depende on public.crm_acciones (depende_de, activa);


-- =====================================================================
-- BLOQUE 2 â€” Clasificacion de las siete acciones
--
-- Solo donde esta en null: no pisa una clasificacion hecha a mano.
--
-- "Otro" QUEDA SIN CLASIFICAR A PROPOSITO. Es ambiguo â€”puede ser de cualquiera de
-- las dosâ€” y la decision ya tomada es PARTIRLO EN DOS ("Otro - estoy esperando
-- algo" / "Otro - tengo algo que hacer"), no ponerle un valor por defecto: si
-- cayera siempre en "nosotros", inflaria justo el numero que arma la agenda del
-- lunes. Ese corte va junto con la revision de la lista con Comercial, para no
-- sembrar nombres que se van a renombrar el mismo dia.
--
-- Mientras siga en null, la pantalla lo muestra como "sin clasificar" y no entra
-- en ninguno de los dos filtros. Se ve, que es lo que corresponde.
-- =====================================================================
update public.crm_acciones set depende_de = 'terceros'
 where depende_de is null and nombre in (
   'Esperando respuesta del cliente',
   'A resolver con el Consejo',
   'A resolver con el Coordinador de Cuenta',
   'Esperando documentaciÃ³n del cliente'
 );

update public.crm_acciones set depende_de = 'nosotros'
 where depende_de is null and nombre in (
   'Enviar nueva propuesta al cliente',
   'Reenviar la nota'
 );


-- =====================================================================
-- BLOQUE 3 â€” VERIFICACION (solo lee)
-- =====================================================================

-- (a) Como quedo clasificada cada accion. Esperado: cuatro 'terceros', dos
--     'nosotros' y "Otro" en "(sin clasificar)".
select orden,
       nombre,
       coalesce(depende_de, '(sin clasificar)') as depende_de,
       activa
  from public.crm_acciones
 order by orden;

-- (b) Cuantos CASOS VIVOS hay de cada lado. Es la foto de la pregunta del lunes.
--     Los que caigan en "(sin clasificar)" son los que estan esperando el corte
--     de "Otro".
select coalesce(a.depende_de, '(sin clasificar)') as depende_de,
       count(*) as casos
  from public.crm_casos c
  left join public.crm_acciones a on a.id = c.proxima_accion_id
 where c.estado not in ('precerrada', 'cerrada')
   and c.proxima_accion_id is not null
 group by coalesce(a.depende_de, '(sin clasificar)')
 order by depende_de;

-- (c) Casos VIVOS SIN ninguna accion pendiente. No los muestra ningun filtro de
--     naturaleza porque no tienen naturaleza: estan vivos y sin agenda, que es el
--     estado que el diseno considera invisible. Si aparecen, conviene agendarlos.
select count(*) as vivos_sin_agenda
  from public.crm_casos c
 where c.estado not in ('precerrada', 'cerrada')
   and c.proxima_accion_id is null;



-- =====================================================================
-- CONTENIDO DE: carpeta implementacion ohlimpia\sql\crm\abm_48_crm_generar_casos_con_accion.sql
-- =====================================================================

-- =====================================================================
-- CRM â€” crm_generar_casos: los casos que nacen como 'enviada' salen con
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
-- seÃ±al de que hay que actuar.
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
-- BLOQUE 1 â€” La funcion actualizada
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
-- BLOQUE 2 â€” Comentario y permisos
--
-- ESTE BLOQUE ES OBLIGATORIO. NO ES "por las dudas".
--
-- El bloque 1 es DROP + CREATE, no CREATE OR REPLACE. El DROP se lleva puestos
-- los permisos, y la funcion nueva nace con el EXECUTE implicito que Postgres le
-- da a PUBLIC â€” o sea, alcanzable por anon. Correr el bloque 1 y saltear este
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
-- BLOQUE 3 â€” VERIFICACION EN EL CATALOGO
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
-- BLOQUE 4 â€” PRUEBA (dentro de begin...rollback)
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




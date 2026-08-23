-- =====================================================================
-- v097a - CRM de Negociacion + Precios LIGE (PARTE 1: PRECIOS)
-- Consolidacion de scripts de FinFlow adaptada a Ohlimpia.
--
-- EJECUTAR ESTE ARCHIVO PRIMERO, y despues v097b_crm.sql.
-- Ambos son idempotentes: correrlos de nuevo no rompe nada.
--
-- Diferencias con los scripts originales de FinFlow:
--   - BLOQUE 0c crea tablas/columnas que FinFlow tenia de migraciones
--     previas y Ohlimpia no tenia.
--   - Los bloques de PRUEBA interactiva de FinFlow (begin..rollback,
--     verificaciones) estan comentados: eran para correr a mano alla.
--
-- Bucket Storage necesario (crear a mano en Supabase > Storage):
--   finflow-docs  (privado)
-- =====================================================================


-- =====================================================================
-- BLOQUE 0 - Funcion set_updated_at
-- Ohlimpia usa tg_set_updated_at() (v002) pero los scripts de FinFlow
-- llaman a set_updated_at(). Se crea como alias.
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =====================================================================
-- BLOQUE 0b - Tabla sucursales
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
-- BLOQUE 0c - Adaptacion Ohlimpia: tablas/columnas de FinFlow que la base
-- de Ohlimpia NO tenia. Sin este bloque, el resto del archivo falla.
-- Todo es idempotente.
-- =====================================================================

-- 1) industrias - catalogo simple para filtrar clientes en Precios
create table if not exists public.industrias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  created_at timestamptz not null default now()
);
alter table public.industrias enable row level security;
drop policy if exists industrias_all on public.industrias;
create policy industrias_all on public.industrias for all to authenticated using (true) with check (true);

-- 2) personas - coordinadores de cuenta / firmantes (CRM + Precios)
create table if not exists public.personas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.personas enable row level security;
drop policy if exists personas_all on public.personas;
create policy personas_all on public.personas for all to authenticated using (true) with check (true);

-- 3) indices_economicos - Precios lee 'horizonte_meses' para el ancho de
-- la matriz. Seed con el default si todavia no hay ninguna fila.
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

-- 4) Columnas nuevas en clientes (modelo FinFlow). responsable_id va sin FK
-- porque grupos_clientes todavia no existe; el FK se agrega en el bloque de
-- abm_26 mas abajo.
alter table public.clientes
  add column if not exists industria_id uuid references public.industrias(id) on delete set null,
  add column if not exists responsable_id uuid,
  add column if not exists descuento_pronto_pago numeric not null default 0,
  add column if not exists email_para text,
  add column if not exists email_cc text;

-- 5) Columnas del modelo FinFlow sobre la tabla paritarias de Ohlimpia
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

-- 6) paritarias_detalle - renglones mes/% de cada paritaria
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

-- 7) Codigo auto-generado de paritaria cuando viene vacio: P-001, P-002...
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
-- CONTENIDO DE: sql/precios/abm_18_objetivo_precios.sql
-- =====================================================================

-- =====================================================================
-- Etapa A — objetivo_precios: precio por OBJETIVO por mes (una fila por mes,
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
-- CONTENIDO DE: sql/precios/abm_19_tipo_negociado.sql
-- =====================================================================

-- =====================================================================
-- Etapa A — objetivo_precios: ampliar el CHECK de 'tipo' con 'negociado'.
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
-- CONTENIDO DE: sql/precios/abm_24_escalas_aumento.sql
-- =====================================================================

-- =====================================================================
-- Escalas de aumento (paritarias) — PASO 1: estructura.
--
-- Juan arma "escalas de aumento" por paritaria (2-4 por año). Cada escala
-- es una secuencia de aumentos por mes (ej. 8% en 07/2026, 6% en 09/2026,
-- 5% en 11/2026). Luego filtra un grupo de clientes (por rubro / coordinador
-- / lista) y aplica la escala a todos de una vez (eso es un paso posterior;
-- acá solo se crean las tablas que guardan las escalas).
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
-- CONTENIDO DE: sql/precios/abm_25_grupos_clientes.sql
-- =====================================================================

-- =====================================================================
-- Grupos de clientes (para aplicar escalas/paritarias) — estructura.
--
-- Modelo (definido por Juan):
--   PARITARIA = el período de la negociación (ej. "Julio 2026").
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
-- CONTENIDO DE: sql/precios/abm_26_grupo_en_cliente.sql
-- =====================================================================

-- =====================================================================
-- Grupos de clientes — cambio de modelo: 1 cliente pertenece a UN grupo.
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

-- 2) indice por grupo (para listar/filtrar los clientes de un grupo)
create index if not exists idx_clientes_grupo on public.clientes (grupo_id);

-- [Ohlimpia] clientes.responsable_id - Resp. Neg. del cliente (FK a
-- grupos_clientes con tipo='responsable'). La columna se creo en BLOQUE 0c
-- sin FK porque grupos_clientes todavia no existia; ahora si.
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
-- CONTENIDO DE: sql/precios/abm_28_notas_config.sql
-- =====================================================================

-- =====================================================================
-- Notas de aumento — PASO 1: estructura (enfoque nuevo: PDF generado por
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
-- 2) notas_config — configuracion unica: firma + membrete.
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
-- CONTENIDO DE: sql/precios/abm_29_notas_estado.sql
-- =====================================================================

-- =====================================================================
-- Notas de aumento — PASO 2: estado / ciclo de vida por CLIENTE dentro de
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
--   · fila de ESCALA   -> escala_id cargado.
--   · fila VIRTUAL     -> escala_id NULL y paritaria_id cargado. Son los
--     clientes con el aumento cargado A MANO, sin escala de por medio.
--   origen_id = coalesce(escala_id, paritaria_id) colapsa los dos casos
--   para poder expresar el unique "una nota por cliente por origen".
--
-- CORREGIDO EL 29-JUL-2026: este archivo describia el modelo viejo
-- —escala_id NOT NULL y unique (escala_id, cliente_id)—, que hacia rato
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
-- CONTENIDO DE: sql/precios/abm_30_notas_firmante.sql
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
-- CONTENIDO DE: sql/precios/abm_31_precios_snapshots.sql
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
-- CONTENIDO DE: sql/precios/abm_32_aplicaciones_escala.sql
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
-- CONTENIDO DE: sql/precios/abm_33_auditoria_precios.sql
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
-- BLOQUE 1 — Tabla de auditoria (cabecera, comun a todas las tablas)
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
-- BLOQUE 2 — Detalle de objetivo_precios
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
-- BLOQUE 3 — Quien es el usuario, en forma segura
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
-- BLOQUE 4 — Diff entre dos jsonb
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
-- BLOQUE 5 — Trigger function FILA POR FILA (las 8 tablas chicas)
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
-- BLOQUE 6 — Enganchar el trigger fila por fila en las 8 tablas
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
-- BLOQUE 7 — Trigger function STATEMENT-LEVEL (solo objetivo_precios)
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
-- BLOQUE 8 — Los 3 triggers de objetivo_precios
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
-- BLOQUE 9 — RLS: solo lectura para la app, en las dos tablas
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
--   · auditar_cambio y auditar_objetivo_precios las dispara la BASE cuando
--     salta el trigger, no el cliente.
--   · auditoria_usuario la llaman los dos triggers desde adentro, y como esos
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
-- BLOQUE 10 — Arreglo aparte: updated_at de objetivo_precios nunca se
-- actualizaba. La tabla tiene la columna pero no estaba en el loop de
-- schema.sql:183, asi que conservaba para siempre la fecha del insert.
-- =====================================================================
drop trigger if exists trg_objetivo_precios_updated_at on public.objetivo_precios;
create trigger trg_objetivo_precios_updated_at
  before update on public.objetivo_precios
  for each row execute function public.set_updated_at();


-- =====================================================================
-- BLOQUE 11 — restaurar_precios_snapshot
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
-- BLOQUE 12 — Verificacion
-- =====================================================================

-- [v097] Bloque de prueba/verificacion de FinFlow desactivado para la
-- migracion: era para correr a mano en su entorno. Comentar no cambia
-- nada del DDL que si se migra.
-- -- 12.1 Triggers instalados: 8 fila-por-fila + 3 de objetivo_precios
-- select c.relname as tabla, t.tgname as trigger,
--        case t.tgtype & 1 when 1 then 'fila' else 'sentencia' end as nivel
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--  where not t.tgisinternal
--    and c.relnamespace = 'public'::regnamespace
--    and (t.tgname like '%_auditoria' or t.tgname like '%_aud_%')
--  order by c.relname, t.tgname;
-- 
-- -- 12.2 RLS activo, sin FORCE, y una sola policy de SELECT en cada tabla
-- select relname, relrowsecurity as rls_on, relforcerowsecurity as rls_forzado
--   from pg_class
--  where oid in ('public.auditoria'::regclass, 'public.auditoria_objetivo_precios'::regclass);
-- 
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' and tablename in ('auditoria','auditoria_objetivo_precios')
--  order by tablename;
-- 
-- -- 12.3 Grants: authenticated solo SELECT, anon sin nada
-- select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('auditoria','auditoria_objetivo_precios')
 order by table_name, grantee, privilege_type;


-- =====================================================================
-- BLOQUE 13 — Prueba end-to-end
--
-- ATENCION: el sistema esta en produccion y Comercial lo usa. Por eso TODO
-- el bloque va dentro de una transaccion que termina en ROLLBACK: se prueba
-- contra datos reales pero no queda NADA, ni el cambio de precio ni las
-- filas de auditoria que genero.
--
-- CORRER EL BLOQUE ENTERO DE UNA SOLA VEZ, no linea por linea: si se corta
-- a la mitad, el editor abre otra sesion y el rollback no alcanza al resto.
-- [v097] Bloque de prueba/verificacion de FinFlow desactivado para la
-- migracion: era para correr a mano en su entorno. Comentar no cambia
-- nada del DDL que si se migra.
-- --
-- -- Tambien mide el tiempo real del UPDATE masivo ya con el trigger puesto,
-- -- que es el numero que faltaba.
-- --
-- -- Corrido desde el editor SQL debe quedar origen='sin_usuario'.
-- -- Desde la app, con el email del usuario.
-- -- =====================================================================
-- begin;
-- 
--   -- 13.1 UPDATE que NO cambia nada -> no debe registrar ninguna cabecera
--   update public.objetivo_precios
--      set precio_hora = precio_hora
--    where mes >= '2026-07-01';
-- 
--   select count(*) as cabeceras_tras_update_vacio
--     from public.auditoria where tabla = 'objetivo_precios';
-- 
--   -- 13.2 UPDATE real sobre TODA la tabla -> 1 cabecera + 13.713 detalles.
--   --      El tiempo que reporte este explain es el costo real del aumento masivo.
--   explain (analyze, buffers)
--   update public.objetivo_precios
--      set precio_hora = precio_hora * 1.08;
-- 
--   -- 13.3 La cabecera: quien, cuando, cuantas filas
--   select a.id, a.operacion, a.usuario_email, a.origen,
--          a.datos_nuevos ->> 'filas' as filas, a.hecho_at
--     from public.auditoria a
--    where a.tabla = 'objetivo_precios'
--    order by a.id desc
--    limit 5;
-- 
--   -- 13.4 El detalle de la ultima sentencia
--   select d.codigo_objetivo, d.mes, d.precio_antes, d.precio_despues, d.antes, d.despues
--     from public.auditoria_objetivo_precios d
--    where d.auditoria_id = (select max(id) from public.auditoria where tabla = 'objetivo_precios')
--    limit 10;
-- 
-- rollback;

-- [v097] Bloque de prueba/verificacion de FinFlow desactivado para la
-- migracion: era para correr a mano en su entorno. Comentar no cambia
-- nada del DDL que si se migra.
-- -- Confirmacion de que no quedo nada: las dos consultas deben dar 0.
-- select (select count(*) from public.auditoria where tabla = 'objetivo_precios') as cabeceras,
--        (select count(*) from public.auditoria_objetivo_precios)                 as detalles;


-- =====================================================================
-- BLOQUE 14 — Consultas de uso (guardar a mano, no hace falta correrlas)
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
-- CONTENIDO DE: sql/precios/abm_49_notas_pdf.sql
-- =====================================================================

-- =====================================================================
-- Notas de aumento — PASO 3: el PDF de cada nota SE GUARDA en Storage.
--
-- Hasta hoy el PDF se armaba en el navegador, se descargaba dentro de un
-- ZIP y se perdia: no quedaba copia de lo que se le mando al cliente.
-- Ahora cada PDF se sube al bucket finflow-docs y el PUNTERO al archivo
-- queda en notas_emitidas, igual que homologacion_path en paritarias y
-- logo_path / firma_path en notas_config.
--
-- El script hace DOS cosas:
--   BLOQUE 1 — regulariza el modelo que YA EXISTE en la base pero que
--              ningun archivo del repo creaba (paritaria_id, origen_id).
--   BLOQUE 2 — agrega las tres columnas del PDF.
--   BLOQUE 3 — verificacion.
--
-- IMPORTANTE — SOBRE LA BASE DE PRODUCCION EL BLOQUE 1 NO CAMBIA NADA.
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
-- BLOQUE 1 — Modelo de DOS ORIGENES (escala o paritaria)
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
-- BLOQUE 2 — El puntero al PDF
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
-- BLOQUE 3 — Verificacion (solo lectura)
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
-- CONTENIDO DE: sql/precios/abm_50_notas_indice_paritaria.sql
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

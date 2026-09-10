-- =============================================================================
-- CLEAN PAZ — Setup completo desde cero (empresa nueva, base vacía)
-- Armado: 2026-09-03 — mismo criterio que fourmaster_setup.sql (18/08/2026)
-- Excluye v099 (overrides individuales de 37 empleados reales de Ohlimpia,
-- matcheados por email — no aplica a otra empresa). Neutraliza el firmante
-- real de notas_config (v097a) a 'A definir' — Clean Paz carga el propio
-- desde Configuración cuando corresponda.
-- Correr ENTERO en el SQL Editor de Supabase de CLEANPAZ (bgqswkqcjvrjjoiihxqe).
-- =============================================================================

-- ============================================================
-- Ohlimpia — Setup completo de tablas en Supabase
-- Ejecutar en SQL Editor del dashboard de Supabase
-- Seguro de ejecutar multiples veces (usa IF NOT EXISTS)
-- ============================================================

-- =========================
-- TABLA: candidatos
-- =========================
create table if not exists candidatos (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table candidatos add column if not exists nombre text;
alter table candidatos add column if not exists dni text;
alter table candidatos add column if not exists cuit text;
alter table candidatos add column if not exists fecnac text;
alter table candidatos add column if not exists email text;
alter table candidatos add column if not exists tel text;
alter table candidatos add column if not exists calle text;
alter table candidatos add column if not exists piso text;
alter table candidatos add column if not exists zona text;
alter table candidatos add column if not exists localidad text;
alter table candidatos add column if not exists estado_civil text;
alter table candidatos add column if not exists genero text;
alter table candidatos add column if not exists medio text;
alter table candidatos add column if not exists rrhh text;
alter table candidatos add column if not exists obs text;
alter table candidatos add column if not exists estado text default 'Sin citar';
alter table candidatos add column if not exists fecha text;
alter table candidatos add column if not exists hora text;
alter table candidatos add column if not exists asistio text;
alter table candidatos add column if not exists motivo_rechazo text;
alter table candidatos add column if not exists obs_entrevista text;

-- =========================
-- TABLA: psicos
-- =========================
create table if not exists psicos (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table psicos add column if not exists candidato_id text;
alter table psicos add column if not exists nombre text;
alter table psicos add column if not exists dni text;
alter table psicos add column if not exists zona text;
alter table psicos add column if not exists tel text;
alter table psicos add column if not exists rrhh text;
alter table psicos add column if not exists psicotecnico text default 'Pendiente';
alter table psicos add column if not exists prelaboral text default 'Pendiente';
alter table psicos add column if not exists antecedentes text default 'No requerido';
alter table psicos add column if not exists libreta_sanitaria text default 'No requerido';
alter table psicos add column if not exists requiere_antecedentes boolean default false;
alter table psicos add column if not exists requiere_libreta boolean default false;
alter table psicos add column if not exists estado text default 'En proceso';
alter table psicos add column if not exists fecha text;
alter table psicos add column if not exists obs text;
alter table psicos add column if not exists fecha_aprobacion text;
alter table psicos add column if not exists motivo_rechazo text;
alter table psicos add column if not exists fecha_rechazo text;

-- =========================
-- TABLA: cat_alt_pendientes
-- =========================
create table if not exists cat_alt_pendientes (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table cat_alt_pendientes add column if not exists psico_id text;
alter table cat_alt_pendientes add column if not exists candidato_id text;
alter table cat_alt_pendientes add column if not exists nombre text;
alter table cat_alt_pendientes add column if not exists dni text;
alter table cat_alt_pendientes add column if not exists zona text;
alter table cat_alt_pendientes add column if not exists tel text;
alter table cat_alt_pendientes add column if not exists rrhh text;
alter table cat_alt_pendientes add column if not exists estado text default 'Pendiente de alta';
alter table cat_alt_pendientes add column if not exists fecha text;
alter table cat_alt_pendientes add column if not exists identificacion jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists domicilio jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists operativo jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists uniforme jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists capital jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists seguros jsonb default '{}'::jsonb;

-- =========================
-- TABLA: turnos
-- =========================
create table if not exists turnos (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table turnos add column if not exists candidato_id text;
alter table turnos add column if not exists nombre text;
alter table turnos add column if not exists fecha text;
alter table turnos add column if not exists hora text;
alter table turnos add column if not exists estado text default 'Pendiente';
alter table turnos add column if not exists responsable text;

-- =========================
-- ROW LEVEL SECURITY
-- =========================
alter table candidatos enable row level security;
alter table psicos enable row level security;
alter table cat_alt_pendientes enable row level security;
alter table turnos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'candidatos' and policyname = 'Acceso total candidatos') then
    create policy "Acceso total candidatos" on candidatos for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'psicos' and policyname = 'Acceso total psicos') then
    create policy "Acceso total psicos" on psicos for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cat_alt_pendientes' and policyname = 'Acceso total cat_alt_pendientes') then
    create policy "Acceso total cat_alt_pendientes" on cat_alt_pendientes for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'turnos' and policyname = 'Acceso total turnos') then
    create policy "Acceso total turnos" on turnos for all using (true) with check (true);
  end if;
end$$;

-- ===== v001_base_tablas_faltantes.sql =====
-- v001_base_tablas_faltantes.sql
-- Esquema real de las tablas que nunca quedaron documentadas en ningún
-- archivo SQL versionado (creadas a mano en Supabase antes de que
-- empezara la disciplina de migraciones numeradas). Reconstruido por
-- introspección directa contra la base de producción de Ohlimpia
-- (information_schema + pg_catalog), 18/08/2026 — no a mano, así queda
-- fiel a lo que realmente existe, columna por columna, PK incluida.
--
-- Con esto + setup_supabase.sql + v002 en adelante, una base nueva
-- (para una empresa cliente nueva) puede levantar el esquema completo
-- desde cero, cosa que antes no era posible: sin este archivo, decenas
-- de migraciones fallaban en cascada porque asumían que estas 34 tablas
-- ya existían.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabla: legajos
CREATE TABLE IF NOT EXISTS public.legajos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro                    integer DEFAULT 0,
  nombre                 text DEFAULT ''::text,
  dni                    text DEFAULT ''::text,
  funcion                text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  ingreso                text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  estado_legal           text DEFAULT ''::text,
  estado_medico          text DEFAULT ''::text,
  fecha_baja             text DEFAULT ''::text,
  fecha_reincorp         text DEFAULT ''::text,
  seguro                 text DEFAULT ''::text,
  localidad              text DEFAULT ''::text,
  tel                    text DEFAULT ''::text,
  mail                   text DEFAULT ''::text,
  cuit                   text DEFAULT ''::text,
  estado_civil           text DEFAULT ''::text,
  nac                    text DEFAULT ''::text,
  banco                  text DEFAULT ''::text,
  calzado                integer DEFAULT 0,
  ambo                   text DEFAULT ''::text,
  periodo_prueba         integer DEFAULT 0,
  fecha_ingreso_prueba   text DEFAULT ''::text,
  adjuntos_legal         jsonb DEFAULT '[]'::jsonb,
  adjuntos_medico        jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  direccion              text,
  fec_nac                text,
  zona                   text,
  cbu                    text,
  art                    text,
  obra_social            text,
  forma_pago             text,
  integracion            integer,
  categoria              text,
  genero                 text,
  legajo_anterior_nro    integer,
  historial_movimientos  jsonb DEFAULT '[]'::jsonb,
  sector                 text,
  dias_vacaciones_anuales integer DEFAULT 0,
  jefe_directo_legajo_id_local text,
  talles_uniforme        jsonb,
  categoria_id_local     text,
  en_tratamiento         boolean NOT NULL DEFAULT false,
  clave_fiscal           text,
  inaes                  text,
  partido                text,
  codigo_postal          text,
  polizas                jsonb DEFAULT '[]'::jsonb,
  obra_social_inicio_tramite text,
  alta_obra_social       boolean NOT NULL DEFAULT false,
  alta_obra_social_fecha timestamp with time zone,
  mipyme_estado          text,
  cuit_estado            text,
  cuit_fecha_verificacion date,
  clave_fiscal_fecha_actualizacion date,
  UNIQUE (id_local)
);

ALTER TABLE public.legajos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.legajos;
CREATE POLICY "Solo usuarios autenticados" ON public.legajos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  razon                  text DEFAULT ''::text,
  cuit                   text DEFAULT ''::text,
  direccion              text DEFAULT ''::text,
  contacto               text DEFAULT ''::text,
  tel                    text DEFAULT ''::text,
  mail                   text DEFAULT ''::text,
  zona                   text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  desde                  text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  ingresos_brutos        text,
  jurisdiccion_iibb      text,
  cond_pago              text,
  codigo_tango           text,
  fact_por               text,
  periodo_fact           text,
  productos_en_factura   text,
  req_oc                 text,
  notas_fact             text,
  doc_req                jsonb,
  contactos              jsonb,
  responsable            text,
  tipo_contrato          text,
  codigo                 text,
  responsable_tipo       text,
  responsable_contacto   text,
  gestiones_cobro        jsonb NOT NULL DEFAULT '[]'::jsonb,
  tipo                   text,
  iva                    text,
  arca                   text,
  forma_pago             text,
  ciudad                 text,
  logo                   text,
  pct_supervision        numeric(5,2),
  UNIQUE (id_local)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_id_local ON public.clientes USING btree (id_local) WHERE (id_local IS NOT NULL);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.clientes;
CREATE POLICY "Solo usuarios autenticados" ON public.clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: objetivos
CREATE TABLE IF NOT EXISTS public.objetivos (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  cliente_id_local       text NOT NULL,
  codigo                 text NOT NULL,
  nombre                 text NOT NULL,
  tipo                   text NOT NULL,
  dir                    text,
  ciudad                 text,
  supervisor_asignado    text,
  supervisor_asignado_por text,
  fecha_asignacion_supervisor timestamp with time zone,
  modelo_precio          text NOT NULL,
  valor                  numeric(12,2),
  valor_hora             numeric(10,2),
  efts                   numeric(6,2),
  valor_eft              numeric(12,2),
  fecha_inicio           date,
  fecha_fin              date,
  contrato               text,
  productos              text,
  clausula_actualizacion text,
  periodo_fact           text,
  req_oc                 text,
  texto_factura          text,
  estado                 text NOT NULL DEFAULT 'Presupuestado'::text,
  notas                  text,
  observaciones          text,
  cargado_por            text NOT NULL,
  fecha_carga            timestamp with time zone NOT NULL DEFAULT now(),
  modificado_por         text,
  modificado_en          timestamp with time zone,
  fecha_baja             date,
  dado_de_baja_por       text,
  motivo_baja            text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  motivo_baja_razon      text,
  motivo_baja_detalle    text,
  fecha_reactivacion     date,
  reactivado_por         text,
  localidad              text,
  personal_horario       text,
  jurisdiccion           text,
  puestos_necesarios     jsonb NOT NULL DEFAULT '[]'::jsonb,
  log_productos          text,
  log_elementos          text,
  log_maquinas           text,
  tipo_sitio             text,
  comisiones             jsonb NOT NULL DEFAULT '[]'::jsonb,
  productos_limpieza     jsonb NOT NULL DEFAULT '[]'::jsonb,
  elementos_limpieza     jsonb NOT NULL DEFAULT '[]'::jsonb,
  maquinas_necesarias    jsonb NOT NULL DEFAULT '[]'::jsonb,
  supervisores_asignados jsonb NOT NULL DEFAULT '[]'::jsonb,
  pct_supervision        numeric(5,2),
  UNIQUE (codigo),
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_obj_cliente ON public.objetivos USING btree (cliente_id_local) WHERE (NOT anulado);
CREATE INDEX IF NOT EXISTS idx_obj_estado ON public.objetivos USING btree (estado) WHERE (NOT anulado);
CREATE INDEX IF NOT EXISTS idx_obj_codigo ON public.objetivos USING btree (codigo) WHERE (NOT anulado);

ALTER TABLE public.objetivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "objetivos_all" ON public.objetivos;
CREATE POLICY "objetivos_all" ON public.objetivos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: usuarios
CREATE TABLE IF NOT EXISTS public.usuarios (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text NOT NULL,
  email                  text,
  perfil                 text,
  funcion                text,
  activo                 boolean DEFAULT true,
  nickname               text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (email)
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_select_authenticated" ON public.usuarios;
CREATE POLICY "usuarios_select_authenticated" ON public.usuarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "usuarios_update_propio_o_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_propio_o_admin" ON public.usuarios FOR UPDATE TO authenticated USING (((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = 'Administrador total'::text))))));

-- Tabla: monotributos
CREATE TABLE IF NOT EXISTS public.monotributos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  historial_categorias   jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  nombre                 text,
  cuit                   text,
  categoria              text,
  fecha_alta             text,
  zona                   text DEFAULT 'provincia'::text,
  obra_social            boolean DEFAULT false,
  jubilado               boolean DEFAULT false,
  cur                    numeric DEFAULT 0,
  estado                 text DEFAULT 'Al día'::text,
  obs                    text,
  nro_socio              text,
  cur_manual             boolean NOT NULL DEFAULT false,
  adherentes_cantidad    integer NOT NULL DEFAULT 0,
  adherentes_monto       numeric NOT NULL DEFAULT 0,
  UNIQUE (id_local)
);

ALTER TABLE public.monotributos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.monotributos;
CREATE POLICY "Solo usuarios autenticados" ON public.monotributos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: uniformes
CREATE TABLE IF NOT EXISTS public.uniformes (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text,
  nro_socio              text,
  nombre                 text NOT NULL,
  fecha                  date NOT NULL,
  talle                  text,
  prendas                jsonb,
  descuento              numeric NOT NULL DEFAULT 0,
  estado                 text NOT NULL DEFAULT 'Pendiente'::text,
  observaciones          text,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_uniformes_legajo ON public.uniformes USING btree (legajo_id_local) WHERE (NOT anulado);

ALTER TABLE public.uniformes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.uniformes;
CREATE POLICY "Solo usuarios autenticados" ON public.uniformes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: retenciones
CREATE TABLE IF NOT EXISTS public.retenciones (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text,
  nro_socio              text,
  nombre                 text NOT NULL,
  tipo                   text NOT NULL,
  periodo                text,
  monto                  numeric NOT NULL DEFAULT 0,
  motivo                 text,
  estado                 text NOT NULL DEFAULT 'Activa'::text,
  fecha_liberacion       date,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  motivo_tipificado      text,
  tipo_valor             text NOT NULL DEFAULT 'Monto'::text,
  origen                 text,
  creado_por             text,
  creado_en              timestamp with time zone,
  liberado_por           text,
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_retenciones_legajo ON public.retenciones USING btree (legajo_id_local) WHERE (NOT anulado);

ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.retenciones;
CREATE POLICY "Solo usuarios autenticados" ON public.retenciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: capacitaciones
CREATE TABLE IF NOT EXISTS public.capacitaciones (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text NOT NULL,
  nro_socio              text NOT NULL,
  nombre_asociado        text NOT NULL,
  tipo                   text NOT NULL,
  fecha                  date NOT NULL,
  lugar                  text NOT NULL,
  servicio               text,
  instructor             text NOT NULL,
  metodo_evaluacion      text,
  estado                 text NOT NULL DEFAULT 'Programada'::text,
  resultado              text,
  puntaje                integer,
  observaciones          text,
  adjunto_id_local       text,
  materiales_ids         text[],
  coordinado_asociado    text,
  coordinado_supervisor  text,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.capacitaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.capacitaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.capacitaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: reasignaciones
CREATE TABLE IF NOT EXISTS public.reasignaciones (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text,
  nro_socio              text NOT NULL,
  nombre_asociado        text NOT NULL,
  servicio_origen        text NOT NULL,
  supervisor_origen      text NOT NULL,
  funcion_origen         text,
  zona_origen            text,
  servicio_destino       text NOT NULL,
  supervisor_destino     text NOT NULL,
  funcion_destino        text,
  zona_destino           text,
  motivo                 text NOT NULL,
  fecha_solicitud        date NOT NULL DEFAULT CURRENT_DATE,
  fecha_efectiva         date NOT NULL,
  fecha_ejecucion        date,
  descripcion            text,
  elevado_por            text NOT NULL,
  originada_por          text NOT NULL,
  pedido_vinculado_id_local text,
  requiere_altura        boolean NOT NULL DEFAULT false,
  requiere_poliza_esp    boolean NOT NULL DEFAULT false,
  estado                 text NOT NULL DEFAULT 'Borrador'::text,
  aprobado_por           text,
  fecha_aprobacion       timestamp with time zone,
  motivo_rechazo         text,
  fecha_rechazo          timestamp with time zone,
  anulado_por            text,
  fecha_anulacion        timestamp with time zone,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.reasignaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reasignaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.reasignaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: casos_legales
CREATE TABLE IF NOT EXISTS public.casos_legales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  asociado               text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  estado                 text DEFAULT ''::text,
  abogado                text DEFAULT ''::text,
  estudio                text DEFAULT ''::text,
  supervisor_al_alta     text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  fecha_inicio           text DEFAULT ''::text,
  ultima_novedad         text DEFAULT ''::text,
  adjuntos               jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  abogado_cooperativa    text,
  estudio_cooperativa    text,
  supervisor_actual      text,
  tipo_reclamo           text,
  tipo_cliente           text,
  monto_reclamado        numeric(12,2),
  descripcion            text,
  relacion_otros_casos   text,
  fecha_proxima_instancia date,
  fecha_cierre           date,
  resultado              text,
  monto_final            numeric(12,2),
  observaciones_cierre   text,
  cerrado_por            text,
  UNIQUE (id_local)
);

ALTER TABLE public.casos_legales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.casos_legales;
CREATE POLICY "Solo usuarios autenticados" ON public.casos_legales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: prestamos
CREATE TABLE IF NOT EXISTS public.prestamos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  monto                  numeric DEFAULT 0,
  cuotas                 integer DEFAULT 0,
  monto_cuota            text DEFAULT ''::text,
  fecha_otorgamiento     text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  pagos                  jsonb DEFAULT '[]'::jsonb,
  obs                    text DEFAULT ''::text,
  aprobado_por           text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  supervisor_nombre      text,
  origen                 text DEFAULT 'Formal'::text,
  periodo                text,
  fecha_pedido           date,
  motivo_rechazo_rrhh    text,
  motivo_rechazo_finanzas text,
  aprobado_por_rrhh      text,
  fecha_aprobacion_rrhh  timestamp with time zone,
  pagado_por             text,
  fecha_pago             timestamp with time zone,
  monto_solicitado       numeric(10,2),
  cuotas_solicitadas     integer,
  monto_cuota_solicitado numeric(10,2),
  legajo_id_local        text,
  supera_tope            boolean NOT NULL DEFAULT false,
  anulado                boolean NOT NULL DEFAULT false,
  UNIQUE (id_local)
);

ALTER TABLE public.prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.prestamos;
CREATE POLICY "Solo usuarios autenticados" ON public.prestamos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: facturas
CREATE TABLE IF NOT EXISTS public.facturas (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cliente_id             bigint DEFAULT 0,
  objetivo_cod           text DEFAULT ''::text,
  nro_factura            text DEFAULT ''::text,
  periodo_desde          text DEFAULT ''::text,
  periodo_hasta          text DEFAULT ''::text,
  importe                numeric(14,2) DEFAULT 0,
  fecha_factura          text DEFAULT ''::text,
  vencimiento            text DEFAULT ''::text,
  forma_pago             text DEFAULT ''::text,
  contacto_cobro         text DEFAULT ''::text,
  telefono_cobro         text DEFAULT ''::text,
  horario_cobro          text DEFAULT ''::text,
  ultimo_contacto        text DEFAULT ''::text,
  proxima_gestion        text DEFAULT ''::text,
  prob_cobro             integer DEFAULT 0,
  estado                 text DEFAULT ''::text,
  fecha_posible_cobro    text DEFAULT ''::text,
  acciones               jsonb DEFAULT '[]'::jsonb,
  tipo                   text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  nota                   text DEFAULT ''::text,
  notas                  text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  saldo                  numeric(14,2) NOT NULL DEFAULT 0,
  marcada_cobrada_por    text,
  fecha_marcada_cobrada  text,
  alerta_tango_no_confirmo boolean NOT NULL DEFAULT false,
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON public.facturas USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON public.facturas USING btree (estado);
CREATE INDEX IF NOT EXISTS idx_facturas_nro ON public.facturas USING btree (nro_factura);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.facturas;
CREATE POLICY "Solo usuarios autenticados" ON public.facturas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: leads
CREATE TABLE IF NOT EXISTS public.leads (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  empresa                text DEFAULT ''::text,
  contacto               text DEFAULT ''::text,
  tipo                   text DEFAULT ''::text,
  zona                   text DEFAULT ''::text,
  valor                  integer DEFAULT 0,
  etapa                  text DEFAULT ''::text,
  responsable            text DEFAULT ''::text,
  origen                 text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  acciones               jsonb DEFAULT '[]'::jsonb,
  fecha                  text DEFAULT ''::text,
  resp                   text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  nota                   text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  cliente_borrador_id    bigint,
  motivo_perdida         text,
  tipo_cliente           text,
  cliente_id_vinculado   bigint,
  UNIQUE (id_local)
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.leads;
CREATE POLICY "Solo usuarios autenticados" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: propuestas_precios
CREATE TABLE IF NOT EXISTS public.propuestas_precios (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  objetivo_cod           text DEFAULT ''::text,
  cliente_nombre         text DEFAULT ''::text,
  objetivo_nombre        text DEFAULT ''::text,
  valor_actual           numeric DEFAULT 0,
  valor_hora_actual      numeric DEFAULT 0,
  valor_propuesto        numeric DEFAULT 0,
  valor_hora_propuesto   numeric DEFAULT 0,
  pct_aumento            numeric DEFAULT 0,
  clausula               text DEFAULT ''::text,
  motivo_cliente         text DEFAULT ''::text,
  fecha_propuesta        text DEFAULT ''::text,
  fecha_vigencia         text DEFAULT ''::text,
  aprobado_cliente       boolean DEFAULT false,
  fecha_aprob_cliente    text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  aprobado_por           text DEFAULT ''::text,
  proyeccion_meses       integer DEFAULT 0,
  origen_paritaria       text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  objetivo_id            bigint,
  cliente_id             bigint,
  tipo_modificacion      text NOT NULL DEFAULT 'Aumento'::text,
  motivo                 text,
  niveles                jsonb,
  tipo_convalidar        text,
  tramos                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  autorizada_por         text,
  fecha_autorizacion     text,
  confirmada_por         text,
  fecha_confirmacion     text,
  motivo_rechazo_gerente text,
  motivo_rechazo_cliente text,
  lote_id                text,
  propuesta_anterior_id  bigint,
  cargado_por            text,
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_propuestas_precios_lote ON public.propuestas_precios USING btree (lote_id);
CREATE INDEX IF NOT EXISTS idx_propuestas_precios_objetivo ON public.propuestas_precios USING btree (objetivo_id);

ALTER TABLE public.propuestas_precios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.propuestas_precios;
CREATE POLICY "Solo usuarios autenticados" ON public.propuestas_precios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: sugerencias
CREATE TABLE IF NOT EXISTS public.sugerencias (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  tipo                   text DEFAULT ''::text,
  modulo                 text DEFAULT ''::text,
  modulo_label           text DEFAULT ''::text,
  descripcion            text DEFAULT ''::text,
  esperado               text DEFAULT ''::text,
  frecuencia             text DEFAULT ''::text,
  nombre_usuario         text DEFAULT ''::text,
  usuario                text DEFAULT ''::text,
  perfil                 text DEFAULT ''::text,
  prioridad              text DEFAULT ''::text,
  estado                 text DEFAULT 'Pendiente'::text,
  fecha                  text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  fecha_estimada         text DEFAULT ''::text,
  fecha_resolucion       text DEFAULT ''::text,
  obs_admin              text DEFAULT ''::text,
  motivo_rechazo         text DEFAULT ''::text,
  visto_bueno            boolean DEFAULT false,
  reabierto              boolean DEFAULT false,
  historial              jsonb DEFAULT '[]'::jsonb,
  ult_accion             text DEFAULT ''::text,
  titulo                 text,
  respuesta_dev          text,
  UNIQUE (id_local)
);

ALTER TABLE public.sugerencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sugerencias;
CREATE POLICY "Solo usuarios autenticados" ON public.sugerencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: no_conformidades
CREATE TABLE IF NOT EXISTS public.no_conformidades (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro                    integer DEFAULT 0,
  fecha                  text DEFAULT ''::text,
  origen                 text DEFAULT ''::text,
  col_desc               text DEFAULT ''::text,
  causa_raiz             text DEFAULT ''::text,
  tratamiento            text DEFAULT ''::text,
  responsable            text DEFAULT ''::text,
  fecha_cierre           text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  reclamo_id             bigint,
  asociado_nro_socio     text,
  firmada                boolean NOT NULL DEFAULT false,
  firmada_en             timestamp with time zone,
  UNIQUE (id_local)
);

ALTER TABLE public.no_conformidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.no_conformidades;
CREATE POLICY "Solo usuarios autenticados" ON public.no_conformidades FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: adelantos_informales
CREATE TABLE IF NOT EXISTS public.adelantos_informales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro_socio              integer DEFAULT 0,
  supervisor_nombre      text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  periodo                text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.adelantos_informales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.adelantos_informales;
CREATE POLICY "Solo usuarios autenticados" ON public.adelantos_informales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: art42
CREATE TABLE IF NOT EXISTS public.art42 (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  dias_semana            integer DEFAULT 0,
  horas_por_dia          numeric DEFAULT 0,
  trabaja_feriados       boolean DEFAULT false,
  trabaja_finde          boolean DEFAULT false,
  t12                    numeric DEFAULT 0,
  col_00                 integer DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.art42 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.art42;
CREATE POLICY "Solo usuarios autenticados" ON public.art42 FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: categorias_salariales
CREATE TABLE IF NOT EXISTS public.categorias_salariales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  valor_hora_actual      numeric DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.categorias_salariales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.categorias_salariales;
CREATE POLICY "Solo usuarios autenticados" ON public.categorias_salariales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: cobros
CREATE TABLE IF NOT EXISTS public.cobros (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cliente_id             bigint DEFAULT 0,
  objetivo_cod           text DEFAULT ''::text,
  nro_factura            text DEFAULT ''::text,
  periodo_desde          text DEFAULT ''::text,
  periodo_hasta          text DEFAULT ''::text,
  importe_facturado      numeric(14,2) DEFAULT 0,
  importe_cobrado        numeric(14,2) DEFAULT 0,
  nro_recibo             text DEFAULT ''::text,
  fecha_cobro            text DEFAULT ''::text,
  fecha_acreditacion     text DEFAULT ''::text,
  forma_pago             text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_cobros_cliente ON public.cobros USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_factura ON public.cobros USING btree (nro_factura);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_recibo ON public.cobros USING btree (nro_recibo);

ALTER TABLE public.cobros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.cobros;
CREATE POLICY "Solo usuarios autenticados" ON public.cobros FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: enfermos
CREATE TABLE IF NOT EXISTS public.enfermos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  asociado               text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  tipo                   text DEFAULT ''::text,
  fecha_hecho            text DEFAULT ''::text,
  dias                   integer DEFAULT 0,
  ultimo_contacto        text DEFAULT ''::text,
  certif                 text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  habilitado             boolean DEFAULT false,
  adjuntos               jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.enfermos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.enfermos;
CREATE POLICY "Solo usuarios autenticados" ON public.enfermos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: evaluaciones
CREATE TABLE IF NOT EXISTS public.evaluaciones (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cap                    text DEFAULT ''::text,
  maquinarias            jsonb DEFAULT '[]'::jsonb,
  modalidad              text DEFAULT ''::text,
  preguntas              jsonb DEFAULT '[]'::jsonb,
  respondieron           integer DEFAULT 0,
  total_enviadas         integer DEFAULT 0,
  aprobaron              integer DEFAULT 0,
  puntos_prom            integer DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.evaluaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.evaluaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.evaluaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: feriados
CREATE TABLE IF NOT EXISTS public.feriados (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  fecha                  text DEFAULT ''::text,
  nombre                 text DEFAULT ''::text,
  tipo                   text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.feriados;
CREATE POLICY "Solo usuarios autenticados" ON public.feriados FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: materiales
CREATE TABLE IF NOT EXISTS public.materiales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  video                  jsonb DEFAULT '[]'::jsonb,
  tipo                   text DEFAULT ''::text,
  cap_tipo               text DEFAULT ''::text,
  maquinarias            jsonb DEFAULT '[]'::jsonb,
  url                    text DEFAULT ''::text,
  https                  text DEFAULT ''::text,
  duracion               text DEFAULT ''::text,
  col_desc               text DEFAULT ''::text,
  requiere_eval          text DEFAULT ''::text,
  fecha_alta             text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.materiales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.materiales;
CREATE POLICY "Solo usuarios autenticados" ON public.materiales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: motivos_fuera_eft
CREATE TABLE IF NOT EXISTS public.motivos_fuera_eft (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  codigo                 text DEFAULT ''::text,
  descripcion            text DEFAULT ''::text,
  activo                 boolean DEFAULT false,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.motivos_fuera_eft ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.motivos_fuera_eft;
CREATE POLICY "Solo usuarios autenticados" ON public.motivos_fuera_eft FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: motivos_no_fact
CREATE TABLE IF NOT EXISTS public.motivos_no_fact (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  codigo                 text DEFAULT ''::text,
  descripcion            text DEFAULT ''::text,
  activo                 boolean DEFAULT false,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.motivos_no_fact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.motivos_no_fact;
CREATE POLICY "Solo usuarios autenticados" ON public.motivos_no_fact FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: paritarias
CREATE TABLE IF NOT EXISTS public.paritarias (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  sindicato              text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  vigencia               text DEFAULT ''::text,
  pct_aumento            numeric DEFAULT 0,
  homologada             boolean DEFAULT false,
  fecha_homologacion     text DEFAULT ''::text,
  estado_aplicacion      text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  escala                 jsonb DEFAULT '[]'::jsonb,
  categoria              text DEFAULT ''::text,
  valor_anterior         integer DEFAULT 0,
  valor_nuevo            numeric DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.paritarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.paritarias;
CREATE POLICY "Solo usuarios autenticados" ON public.paritarias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: planillas_adelantos
CREATE TABLE IF NOT EXISTS public.planillas_adelantos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  supervisor             text,
  fecha                  text,
  estado                 text DEFAULT 'Borrador'::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_planillas_id_local ON public.planillas_adelantos USING btree (id_local);

ALTER TABLE public.planillas_adelantos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.planillas_adelantos;
CREATE POLICY "Solo usuarios autenticados" ON public.planillas_adelantos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: planillas_informales
CREATE TABLE IF NOT EXISTS public.planillas_informales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  periodo                text DEFAULT ''::text,
  supervisor_nombre      text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha_creacion         text DEFAULT ''::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.planillas_informales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.planillas_informales;
CREATE POLICY "Solo usuarios autenticados" ON public.planillas_informales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: reclamos
CREATE TABLE IF NOT EXISTS public.reclamos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cliente_id             bigint DEFAULT 0,
  objetivo_cod           text DEFAULT ''::text,
  tipo                   text DEFAULT ''::text,
  prioridad              text DEFAULT ''::text,
  iniciador              text DEFAULT ''::text,
  col_desc               text DEFAULT ''::text,
  responsable            text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  fecha_cierre           text DEFAULT ''::text,
  genera_nc              boolean DEFAULT false,
  nc                     text DEFAULT ''::text,
  tratamiento            text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.reclamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reclamos;
CREATE POLICY "Solo usuarios autenticados" ON public.reclamos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: retenes
CREATE TABLE IF NOT EXISTS public.retenes (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  periodo                text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha_creacion         text DEFAULT ''::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  nombre                 text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  dias_trabajados        integer DEFAULT 0,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.retenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.retenes;
CREATE POLICY "Solo usuarios autenticados" ON public.retenes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: sanciones
CREATE TABLE IF NOT EXISTS public.sanciones (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  asociado               text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  tipo                   text DEFAULT ''::text,
  motivo                 text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  adjuntos               jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.sanciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sanciones;
CREATE POLICY "Solo usuarios autenticados" ON public.sanciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: solicitudes_prestamos
CREATE TABLE IF NOT EXISTS public.solicitudes_prestamos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  periodo                text DEFAULT ''::text,
  supervisor_nombre      text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha_creacion         text DEFAULT ''::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.solicitudes_prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.solicitudes_prestamos;
CREATE POLICY "Solo usuarios autenticados" ON public.solicitudes_prestamos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: vac_admin
CREATE TABLE IF NOT EXISTS public.vac_admin (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro_socio              integer DEFAULT 0,
  asociado               text DEFAULT ''::text,
  sector                 text DEFAULT ''::text,
  anio                   text DEFAULT ''::text,
  dias_corresp           integer DEFAULT 0,
  planilla               text DEFAULT ''::text,
  dias_sol               integer DEFAULT 0,
  desde                  text DEFAULT ''::text,
  hasta                  text DEFAULT ''::text,
  pendientes             integer DEFAULT 0,
  cumple                 text DEFAULT ''::text,
  reemplaza              text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.vac_admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.vac_admin;
CREATE POLICY "Solo usuarios autenticados" ON public.vac_admin FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: vac_operativo
CREATE TABLE IF NOT EXISTS public.vac_operativo (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  fecha_sol              text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  asociado               text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  cantidad               text DEFAULT ''::text,
  anio                   text DEFAULT ''::text,
  desde                  text DEFAULT ''::text,
  hasta                  text DEFAULT ''::text,
  retorno                text DEFAULT ''::text,
  cumple                 text DEFAULT ''::text,
  form_fisico            text DEFAULT ''::text,
  reemplaza              text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.vac_operativo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.vac_operativo;
CREATE POLICY "Solo usuarios autenticados" ON public.vac_operativo FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v002_candidatos_y_personal_rrhh.sql =====
-- =============================================================================
-- Migración: v002 — Refactor de candidatos + creación de tabla personal_rrhh
-- Fecha:     2026-05-17
-- Autor:     Lautaro (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Este script implementa los siguientes cambios sobre el módulo Candidatos:
--
-- 1. Reemplaza la tabla 'candidatos' por una versión nueva con estructura
--    corregida según el feedback de Gabriela y las políticas A.5, A.6, A.7
--    y A.8 del proyecto.
--
-- 2. Crea la tabla 'personal_rrhh' nueva, que reemplaza el texto libre del
--    campo "Contactado por" por una relación con el equipo de RRHH de la
--    cooperativa. Esta tabla va a usarse también desde otros módulos
--    (sanciones, adelantos, etc.) que necesiten referenciar a una persona
--    del equipo.
--
-- 3. Resuelve 4 inconsistencias detectadas en la auditoría:
--    - Campo 'asistio' que perdía el matiz "no registrado".
--    - Campo 'genero' que existía pero no se usaba.
--    - Campo 'estado' sin validación de valores permitidos.
--    - DNI sin restricción de unicidad (permitía duplicados).
--
-- 4. Agrega los campos pedidos por Gabriela:
--    - apellido y nombre separados (antes era un solo campo).
--    - nombre_referido (texto libre).
--    - rrhh_id (FK a tabla personal_rrhh).
--
-- 5. Agrega columnas de auditoría y soft delete según política A.7.
--
-- IMPORTANTE
-- ----------
-- Este script BORRA la tabla candidatos actual y la recrea. Los datos
-- existentes se pierden. Esto es aceptable porque son datos de prueba.
-- Antes de ejecutar, exportar los datos a CSV como respaldo.
--
-- Para ejecutar en producción con datos reales, este script debe ser
-- reemplazado por uno con ALTER TABLE (política A.7).
--
-- =============================================================================


-- =============================================================================
-- PASO 0 — Backup de datos antes de borrar (opcional, ejecutar manualmente)
-- =============================================================================
-- Antes de correr este script, ejecutar desde el dashboard de Supabase:
--   SELECT * FROM candidatos;
-- y exportar el resultado como CSV. Guardar como:
--   docs/backups/candidatos_backup_2026-05-17.csv


-- =============================================================================
-- PASO 1 — Limpiar tablas y tipos existentes (en orden correcto)
-- =============================================================================
-- Drop en orden inverso a las dependencias (primero las que dependen de otras)

DROP TABLE IF EXISTS public.candidatos CASCADE;
-- CASCADE elimina también constraints externas que apunten a candidatos
-- (por ejemplo, FKs futuras desde psicos, turnos, etc).

-- Si los tipos ENUM ya existen (de una corrida anterior), eliminarlos
DROP TYPE IF EXISTS estado_candidato;
DROP TYPE IF EXISTS genero_persona;


-- =============================================================================
-- PASO 2 — Crear tipos ENUM para valores cerrados
-- =============================================================================
-- ENUM = lista cerrada de valores permitidos. Si alguien intenta guardar un
-- valor distinto, PostgreSQL rechaza la operación.

CREATE TYPE estado_candidato AS ENUM (
  'Sin citar',
  'Citado',
  'Entrevistado',
  'Aprobado',
  'Rechazado',
  'Psicotecnico'
);

CREATE TYPE genero_persona AS ENUM (
  'Masculino',
  'Femenino',
  'Otro'
);


-- =============================================================================
-- PASO 3 — Crear tabla personal_rrhh
-- =============================================================================
-- Equipo de RRHH de la cooperativa. Estas personas entrevistan candidatos,
-- gestionan altas, aprueban sanciones, etc.
-- Otros módulos del sistema van a referenciar esta tabla cuando necesiten
-- vincular una acción con una persona del equipo.

CREATE TABLE IF NOT EXISTS public.personal_rrhh (
  id          bigint generated always as identity PRIMARY KEY,
  nombre      text NOT NULL,
  puesto      text,
  -- Texto libre. Ejemplos: "Responsable de RRHH", "Auxiliar de selección",
  -- "Liquidador", etc. Por ahora no es obligatorio.

  -- Flags de estado
  activa      boolean NOT NULL DEFAULT true,
  -- 'activa' = trabaja en el equipo actualmente (puede desactivarse temporal).

  anulado     boolean NOT NULL DEFAULT false,
  -- 'anulado' = baja definitiva (soft delete, política A.7).

  -- Auditoría
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- (omitido a propósito para CLEAN PAZ: son las 5 personas reales del área
-- de RRHH de Ohlimpia, no aplica a otra empresa. Clean Paz carga su propio
-- equipo desde el módulo Configuración cuando corresponda.)
-- INSERT INTO public.personal_rrhh (nombre) VALUES
--   ('Gabriela Lucero'),
--   ('Matilde Noceti'),
--   ('Jimena Martinez'),
--   ('Martina Ramirez'),
--   ('Naara Rodriguez');


-- =============================================================================
-- PASO 4 — Crear tabla candidatos nueva
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.candidatos (
  -- ====================
  -- Identificadores
  -- ====================
  id              bigint generated always as identity PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,
  -- id_local es el ID que usa el frontend (timestamp truncado).

  -- ====================
  -- Datos personales
  -- ====================
  apellido        text NOT NULL,
  nombre          text NOT NULL,
  dni             text NOT NULL UNIQUE,
  -- DNI obligatorio y único: bloquea duplicados a nivel de base.

  cuit            text,
  fec_nac         date,
  -- Tipo 'date' real, no string. Permite calcular edad y ordenar.

  email           text,
  tel             text,
  estado_civil    text,
  genero          genero_persona,
  -- Solo acepta 'Masculino', 'Femenino' o 'Otro'.

  -- ====================
  -- Domicilio
  -- ====================
  calle           text,
  piso            text,
  zona            text,
  localidad       text,

  -- ====================
  -- Origen del contacto
  -- ====================
  medio           text,
  -- Por ejemplo: 'Referido', 'Web', 'Aviso', etc.

  nombre_referido text,
  -- Texto libre. Si en el futuro queremos relacionarlo con otra persona del
  -- sistema, agregamos una FK. Por ahora va como string.

  rrhh_id         bigint REFERENCES public.personal_rrhh(id),
  -- FK a la tabla personal_rrhh. Si la persona se anula, este campo queda
  -- apuntando al registro anulado (no se rompe la integridad).

  -- ====================
  -- Estado del candidato
  -- ====================
  estado          estado_candidato NOT NULL DEFAULT 'Sin citar',
  -- Solo acepta los 6 valores definidos en el ENUM.

  -- ====================
  -- Cita / Entrevista
  -- ====================
  fecha_cita      date,
  -- Tipo 'date' real. Si no hay cita, queda NULL.

  hora_cita       time,
  -- Tipo 'time' real. Si no hay cita, queda NULL.

  asistio         text,
  -- Valores válidos: 'si', 'no', NULL.
  -- NULL = no registrado todavía (resuelve el bug que le pasó a Gabriela).
  -- Restricción CHECK abajo asegura solo esos valores.

  motivo_rechazo  text,
  obs_entrevista  text,
  obs             text,
  -- Observaciones generales del candidato.

  -- ====================
  -- Soft delete (política A.7)
  -- ====================
  anulado         boolean NOT NULL DEFAULT false,
  anulado_por     text,
  -- Quién hizo la anulación (nombre o username).
  anulado_fecha   timestamptz,

  -- ====================
  -- Auditoría (política A.8)
  -- ====================
  creado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- ====================
  -- Restricciones
  -- ====================
  CONSTRAINT asistio_valores_validos
    CHECK (asistio IS NULL OR asistio IN ('si', 'no'))
);


-- =============================================================================
-- PASO 5 — Habilitar Row Level Security (replica la política existente)
-- =============================================================================

ALTER TABLE public.personal_rrhh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total personal_rrhh" ON public.personal_rrhh;
CREATE POLICY "Acceso total personal_rrhh" ON public.personal_rrhh
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total candidatos" ON public.candidatos;
CREATE POLICY "Acceso total candidatos" ON public.candidatos
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- PASO 6 — Trigger para actualizar updated_at automáticamente
-- =============================================================================
-- Cada vez que se modifica una fila, updated_at se pone en el momento actual.

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_candidatos ON public.candidatos;
CREATE TRIGGER set_updated_at_candidatos
  BEFORE UPDATE ON public.candidatos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_personal_rrhh ON public.personal_rrhh;
CREATE TRIGGER set_updated_at_personal_rrhh
  BEFORE UPDATE ON public.personal_rrhh
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen de lo que hace este script:
--   1. Borra la tabla candidatos vieja (y sus dependencias) con CASCADE.
--   2. Crea los tipos ENUM 'estado_candidato' y 'genero_persona'.
--   3. Crea la tabla 'personal_rrhh' con 5 filas iniciales (equipo actual).
--   4. Crea la tabla 'candidatos' nueva con estructura completa y validada.
--   5. Habilita Row Level Security en ambas tablas.
--   6. Configura triggers para auto-actualizar updated_at.
--
-- Después de ejecutar este script:
--   - Hay que actualizar src/shared/supabase.js (mapeo camel<->snake).
--   - Hay que adaptar src/modules/candidatos/candidatos.js.
--   - Hay que adaptar el HTML del formulario.
--   - Hay que crear el módulo Personal RRHH (ABM básico).
-- =============================================================================

-- ===== v003_personal_rrhh_id_local.sql =====
-- =============================================================================
-- Migración: v003 — Agregar id_local a personal_rrhh
-- Fecha:     2026-05-17
-- Autor:     Lautaro (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El script v002 creó la tabla personal_rrhh con un campo 'id' bigint
-- autoincremental como única clave identificadora. Pero el resto del
-- proyecto usa el patrón 'id_local' (string, timestamp truncado a 9 dígitos
-- generado en el frontend) como identificador real desde JavaScript.
--
-- Las funciones supaSync, supaDel y _toCamel en src/shared/supabase.js
-- están construidas asumiendo que toda tabla tiene id_local UNIQUE NOT NULL.
--
-- Este script corrige el error de diseño de v002 agregando id_local a
-- personal_rrhh, manteniendo el patrón del resto del proyecto.
--
-- =============================================================================


-- =============================================================================
-- PASO 1 — Agregar columna id_local (sin restricciones todavía)
-- =============================================================================
-- Primero la agregamos como nullable para poder rellenarla en las 5 filas
-- existentes sin que falle por NOT NULL.

ALTER TABLE public.personal_rrhh
  ADD COLUMN IF NOT EXISTS id_local text;


-- =============================================================================
-- PASO 2 — Llenar id_local en las 5 filas existentes
-- =============================================================================
-- Usamos el id numérico como string con padding de ceros a la izquierda
-- (9 dígitos, igual que el patrón timestamp truncado del frontend).
--
-- Resultado: '000000001', '000000002', '000000003', '000000004', '000000005'

UPDATE public.personal_rrhh
SET id_local = LPAD(id::text, 9, '0')
WHERE id_local IS NULL;


-- =============================================================================
-- PASO 3 — Aplicar restricciones NOT NULL y UNIQUE
-- =============================================================================
-- Ahora que todas las filas tienen valor, podemos exigir que sea obligatorio
-- y único.

ALTER TABLE public.personal_rrhh
  ALTER COLUMN id_local SET NOT NULL;

ALTER TABLE public.personal_rrhh DROP CONSTRAINT IF EXISTS personal_rrhh_id_local_unique;
ALTER TABLE public.personal_rrhh
  ADD CONSTRAINT personal_rrhh_id_local_unique UNIQUE (id_local);


-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen de lo que hace este script:
--   1. Agrega columna id_local a personal_rrhh.
--   2. Rellena id_local en las 5 filas existentes con el id numérico
--      formateado a 9 dígitos.
--   3. Marca id_local como NOT NULL UNIQUE.
--
-- Después de ejecutar:
--   - personal_rrhh queda alineada con el patrón id_local del resto del proyecto.
--   - Las funciones supaSync/supaDel/_toCamel funcionan sin cambios.
--   - El frontend puede crear nuevas filas en personal_rrhh generando
--     id_local con Date.now() truncado, igual que en candidatos.
-- =============================================================================

-- ===== v004_personal_rrhh_apellido.sql =====
-- Migracion v004: agregar columna apellido a personal_rrhh
-- Fecha: 2026-05-23. Autor: Lautaro (con asistencia de Claude).
-- No modifica v002 ni v003 (politica A.5).

-- PASO 1: agregar columna apellido (nullable)
alter table personal_rrhh add column if not exists apellido text;

-- PASO 2 (omitido a propósito para CLEAN PAZ, ver INSERT comentado más
-- arriba — mismas 5 personas reales de Ohlimpia): sin filas que
-- actualizar, personal_rrhh queda vacía, lista para que Clean Paz cargue
-- su propio equipo.
-- update personal_rrhh set nombre='Gabriela', apellido='Lucero' where id_local='000000001';
-- update personal_rrhh set nombre='Matilde', apellido='Noceti' where id_local='000000002';
-- update personal_rrhh set nombre='Jimena', apellido='Martinez' where id_local='000000003';
-- update personal_rrhh set nombre='Martina', apellido='Ramirez' where id_local='000000004';
-- update personal_rrhh set nombre='Naara', apellido='Rodriguez' where id_local='000000005';

-- PASO 3: hacer apellido obligatorio ahora que todas las filas lo tienen
alter table personal_rrhh alter column apellido set not null;

-- ===== v005_legajos_campos_faltantes.sql =====
-- Migracion v005: agregar columnas faltantes a legajos
-- Fecha: 2026-05-23. Autor: Lautaro (con asistencia de Claude).
-- Estos campos ya se completan en el modal de Alta pero no se guardaban.
-- Todas nullable: los legajos existentes no las tienen. No modifica v002/v003/v004 (A.5).

alter table legajos add column if not exists direccion text;
alter table legajos add column if not exists fec_nac text;
alter table legajos add column if not exists zona text;
alter table legajos add column if not exists cbu text;
alter table legajos add column if not exists art text;
alter table legajos add column if not exists obra_social text;
alter table legajos add column if not exists forma_pago text;
alter table legajos add column if not exists integracion integer;
alter table legajos add column if not exists categoria text;

-- ===== v006_genero_y_nacionalidad.sql =====
-- Migracion v006: genero en legajos + nacionalidad en candidatos
-- Fecha: 2026-05-23. Autor: Lautaro (con asistencia de Claude).
-- Objetivo: que genero (hoy solo en candidato) llegue al legajo,
-- y que nacionalidad se capture desde el candidato (hoy solo en alta).
-- Ambas nullable. No modifica scripts anteriores (A.5).

alter table legajos add column if not exists genero text;
alter table candidatos add column if not exists nacionalidad text;

-- ===== v007_preocupacionales.sql =====
-- v007: tabla preocupacionales (examen médico / apto médico)
-- Fase 1 del flujo de selección. Molde: personal_rrhh (v002).
-- Valores cerrados (prestador, resultado) como text, validados en el front.

CREATE TABLE IF NOT EXISTS public.preocupacionales (
  id           bigint generated always as identity PRIMARY KEY,
  id_local     text UNIQUE NOT NULL,
  candidato_id bigint,
  psico_id     bigint,
  nombre       text,
  dni          text,
  zona         text,
  fecha_turno  date,
  prestador    text,
  resultado    text DEFAULT 'Pendiente',
  motivo       text,
  estado       text DEFAULT 'En proceso',
  obs          text,
  anulado      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.preocupacionales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total preocupacionales" ON public.preocupacionales;
CREATE POLICY "Acceso total preocupacionales" ON public.preocupacionales
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_preocupacionales ON public.preocupacionales;
CREATE TRIGGER set_updated_at_preocupacionales
  BEFORE UPDATE ON public.preocupacionales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== v008_preocupacionales_tel_rrhh.sql =====
-- v008: agregar tel y rrhh a preocupacionales
-- El handoff (aprobarPsico → preocupacional) copia el snapshot del psico,
-- que incluye tel y rrhh. La tabla cat_alt_pendientes ya los tiene; espejamos.

ALTER TABLE public.preocupacionales ADD COLUMN IF NOT EXISTS tel text;
ALTER TABLE public.preocupacionales ADD COLUMN IF NOT EXISTS rrhh text;

-- ===== v009_documentacion_ingreso.sql =====
-- v009: tabla documentacion_ingreso
-- Agrupa 3 requisitos del ingreso: Antecedentes (obligatorio, eliminatorio,
-- vence cada 6 meses), Libreta sanitaria (condicional) y Curso de
-- manipulación (condicional). Molde: preocupacionales (v007).

CREATE TABLE IF NOT EXISTS public.documentacion_ingreso (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local text UNIQUE,
  candidato_id bigint,
  psico_id bigint,
  preocup_id bigint,
  nombre text,
  dni text,
  zona text,
  tel text,
  rrhh text,
  -- Antecedentes penales (obligatorio, eliminatorio)
  antec_resultado text DEFAULT 'Pendiente',
  antec_fecha date,
  antec_vencimiento date,
  antec_excepcion boolean DEFAULT false,
  antec_motivo_excepcion text,
  -- Libreta sanitaria (condicional)
  libreta_aplica boolean DEFAULT false,
  libreta_zona text,
  libreta_vencimiento date,
  -- Curso de manipulación de alimentos (condicional)
  curso_tiene boolean DEFAULT false,
  curso_vencimiento date,
  -- Generales
  estado text DEFAULT 'En proceso',
  motivo text,
  obs text,
  anulado boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.documentacion_ingreso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total" ON public.documentacion_ingreso;
CREATE POLICY "Acceso total" ON public.documentacion_ingreso
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_documentacion_ingreso ON public.documentacion_ingreso;
CREATE TRIGGER set_updated_at_documentacion_ingreso
  BEFORE UPDATE ON public.documentacion_ingreso
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== v010_fechas_aprobacion_rechazo.sql =====
-- v010: agregar fecha_aprobacion y fecha_rechazo a las 3 tablas del flujo
-- (psicos, preocupacionales, documentacion_ingreso).
-- El JS ya escribe estos campos en aprobarX/bajaX/rechazarX y el mapeo
-- camelCase ↔ snake_case ya existe en supabase.js. Hoy los UPDATE fallan
-- silenciosamente con error 400 (columna inexistente). Esto los arregla.
--
-- IF NOT EXISTS agregado (18/08/2026): setup_supabase.sql ya trae
-- "fecha_aprobacion" en psicos por su cuenta (línea propia, sin relación
-- con este archivo) — sin el guard, replicar el esquema en una base nueva
-- rompía acá. No cambia nada en producción (ahí la columna ya existe).

ALTER TABLE public.psicos ADD COLUMN IF NOT EXISTS fecha_aprobacion text;
ALTER TABLE public.psicos ADD COLUMN IF NOT EXISTS fecha_rechazo text;

ALTER TABLE public.preocupacionales ADD COLUMN IF NOT EXISTS fecha_aprobacion text;
ALTER TABLE public.preocupacionales ADD COLUMN IF NOT EXISTS fecha_rechazo text;

ALTER TABLE public.documentacion_ingreso ADD COLUMN IF NOT EXISTS fecha_aprobacion text;
ALTER TABLE public.documentacion_ingreso ADD COLUMN IF NOT EXISTS fecha_rechazo text;

-- ===== v011_crear_tabla_adjuntos.sql =====
-- =====================================================================
-- v011 — Crear tabla adjuntos
-- =====================================================================
-- Mini-proyecto: Adjuntos + Reconstrucción de Legajos
-- Fecha: 2026-05-29 (diseño) / 2026-06-17 (validación pre-aplicación)
-- Política A.5: cada cambio de estructura genera un script SQL nuevo
--
-- Decisiones de diseño tomadas:
--   - Clave de conciliación: DNI (unificado en todo el sistema)
--   - Soft delete con auditoría completa (subido_por + borrado_por)
--   - Soporte de historial vía campo 'vigente' (para antecedentes)
--   - Tipos enumerados con check constraint (no texto libre)
--   - Trigger updated_at siguiendo convención de v002/v007/v009
--   - RLS habilitado con policy abierta (convención del sistema)
--
-- Ejecución: envuelto en transacción. Si algo falla, se revierte todo.
-- =====================================================================

begin;

create table IF NOT EXISTS adjuntos (
    -- Identificador único (patrón estándar del sistema)
    id bigserial primary key,
    id_local text,

    -- Vínculo con la persona (clave de conciliación con todos los módulos)
    dni text not null,

    -- A qué etapa del flujo pertenece el archivo
    etapa text not null check (etapa in (
        'psicotecnico',
        'preocupacional',
        'documentacion',
        'alta'
    )),

    -- Qué tipo de archivo es (define qué etapa lo admite y si es obligatorio)
    tipo text not null check (tipo in (
        'informe-psico',         -- Etapa psicotecnico (opcional)
        'apto-medico',           -- Etapa preocupacional (obligatorio si aprueba)
        'no-apto',               -- Etapa preocupacional (opcional si rechaza)
        'antecedente',           -- Etapa documentacion (obligatorio + historial)
        'libreta',               -- Etapa documentacion (opcional)
        'curso',                 -- Etapa documentacion (opcional)
        'dni-frente',            -- Etapa alta (obligatorio)
        'dni-dorso',             -- Etapa alta (obligatorio)
        'foto-rostro',           -- Etapa alta (obligatorio)
        'monotributo',           -- Etapa alta (obligatorio)
        'inaes'                  -- Etapa alta (opcional)
    )),

    -- Ubicación física del archivo
    url text not null,                    -- ruta en Supabase Storage
    nombre_archivo text not null,         -- nombre humano para mostrar/descargar

    -- Vencimiento (nullable: la mayoría de tipos no vencen)
    fecha_vencimiento date,

    -- Vigencia: true por defecto. false cuando se reemplaza por una versión nueva.
    -- Uso principal: historial de antecedentes (los viejos quedan vigente=false
    -- pero todos siguen visibles en el legajo).
    vigente boolean not null default true,

    -- Auditoría de subida (snapshot del operador al momento)
    subido_por_id bigint not null,        -- currentUser.id de DB.usuarios
    subido_por_nombre text not null,      -- currentUser.nombre
    subido_en timestamptz not null default now(),

    -- Auditoría de borrado (soft delete con registro completo)
    borrado boolean not null default false,
    borrado_por_id bigint,
    borrado_por_nombre text,
    borrado_en timestamptz,

    -- Timestamps estándar del sistema
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- =====================================================================
-- ÍNDICES para consultas frecuentes
-- =====================================================================

-- Buscar todos los archivos de una persona (caso principal del legajo)
create index IF NOT EXISTS idx_adjuntos_dni on adjuntos(dni);

-- Buscar archivos de una etapa específica de una persona
create index IF NOT EXISTS idx_adjuntos_dni_etapa on adjuntos(dni, etapa);

-- Para listas filtradas que muestran solo lo vigente y no borrado
create index IF NOT EXISTS idx_adjuntos_vigente on adjuntos(vigente, borrado);

-- Para alerta de vencimientos (escaneo de fechas próximas)
create index IF NOT EXISTS idx_adjuntos_vencimiento on adjuntos(fecha_vencimiento)
    where vigente = true and borrado = false;

-- =====================================================================
-- TRIGGER updated_at
-- =====================================================================
-- Sigue la convención del sistema: la función tg_set_updated_at()
-- ya está definida en v002 (CREATE OR REPLACE), reusamos esa.
-- El cliente JS NO actualiza updated_at manualmente.

DROP TRIGGER IF EXISTS set_updated_at_adjuntos ON public.adjuntos;
create trigger set_updated_at_adjuntos
    before update on public.adjuntos
    for each row execute function public.tg_set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
-- Sigue convención del sistema: RLS habilitado + policy abierta a public.
-- Replica el patrón de las otras tablas (candidatos, psicos, preocupacionales,
-- documentacion_ingreso, cat_alt_pendientes, legajos).
-- Deuda anotada: cuando se migre a Supabase Auth real, ajustar las policies
-- de todas las tablas en una sola tanda.

alter table adjuntos enable row level security;

DROP POLICY IF EXISTS "Acceso total adjuntos" ON adjuntos;
create policy "Acceso total adjuntos"
    on adjuntos
    for all
    to public
    using (true)
    with check (true);

-- =====================================================================
-- COMENTARIOS de documentación (visibles desde el panel de Supabase)
-- =====================================================================

comment on table adjuntos is
    'Archivos cargados durante el flujo de selección y alta. Centraliza los documentos respaldatorios de cada etapa.';

comment on column adjuntos.dni is
    'Clave de conciliación con candidato/psico/preocup/docum/alta/legajo. Único identificador estable de la persona.';

comment on column adjuntos.etapa is
    'Momento del flujo donde se carga el archivo: psicotecnico, preocupacional, documentacion, alta.';

comment on column adjuntos.tipo is
    'Tipo específico de documento. Determina qué etapa lo admite y si es obligatorio.';

comment on column adjuntos.vigente is
    'False cuando se reemplaza por una versión más nueva. Solo el último vigente cuenta para las validaciones. Antecedentes mantiene historial: todos los anteriores quedan vigente=false pero no se borran.';

comment on column adjuntos.borrado is
    'Soft delete. Si true, no se muestra pero queda en la tabla con auditoría completa de quién y cuándo borró.';

commit;

-- =====================================================================
-- REGLAS DE NEGOCIO (NO se aplican en SQL — se validan desde el código)
-- =====================================================================
--
-- Obligatorios al aprobar la etapa:
--   - preocupacional: 'apto-medico' (al cargar resultado APTO)
--   - documentacion: 'antecedente' (al aprobar)
--   - alta: 'dni-frente', 'dni-dorso', 'foto-rostro', 'monotributo'
--
-- Opcionales (se pueden subir o no):
--   - psicotecnico: 'informe-psico'
--   - preocupacional: 'no-apto' (al cargar NO APTO)
--   - documentacion: 'libreta', 'curso'
--   - alta: 'inaes'
--
-- Comportamiento de renovación:
--   - Por defecto: al subir uno nuevo del mismo tipo+dni, el viejo pasa a vigente=false
--   - Excepción: 'antecedente' guarda historial (todos los anteriores quedan
--     vigente=false pero siguen visibles en el legajo)
--
-- Formatos aceptados (validar en cliente):
--   - PDF, JPG, PNG
--   - Máximo 10 MB por archivo
--
-- Permisos (validar en cliente + Storage policies):
--   - Solo RRHH puede subir, ver, borrar
--
-- Alertas (sistema separado, no en este schema):
--   - 15 días antes del vencimiento, marcar para notificación
-- =====================================================================

-- ===== v012_documentacion_id_local_notnull.sql =====
-- =============================================================================
-- Migración: v012 — documentacion_ingreso.id_local -> NOT NULL
-- Fecha:     2026-06-26
-- Autor:     Lautaro (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- La tabla documentacion_ingreso (v009) se creó con:
--     id_local text UNIQUE
-- a diferencia de las otras 3 tablas del flujo (candidatos, psicos,
-- preocupacionales), que la definen como:
--     id_local text UNIQUE NOT NULL
--
-- Esto es un riesgo real de persistencia: las funciones supaSync/_toCamel en
-- src/shared/supabase.js asumen que id_local SIEMPRE existe. Si una fila se
-- inserta con id_local NULL, al recargar _toCamel deja p.id = undefined, y el
-- siguiente supaSync cae en Date.now() nuevo -> nunca matchea -> INSERT
-- duplicado en cada guardado (duplicados infinitos).
--
-- El diagnóstico del 26/06/2026 confirmó que HOY no hay filas con id_local
-- NULL en la tabla, así que el SET NOT NULL aplica directo. Igual se incluye
-- un backfill defensivo (molde de v003) por si el script corre en otro entorno.
--
-- Las dos operaciones van envueltas en BEGIN/COMMIT para que sean atómicas:
-- si una falla, la otra no se aplica.
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 1 — Backfill defensivo de filas sin id_local (si las hubiera)
-- -----------------------------------------------------------------------------
-- Usa el id numérico de la base formateado a 9 dígitos, igual que v003 para
-- personal_rrhh. En el entorno actual no afecta ninguna fila (no hay NULLs).

UPDATE public.documentacion_ingreso
SET id_local = LPAD(id::text, 9, '0')
WHERE id_local IS NULL;

-- -----------------------------------------------------------------------------
-- PASO 2 — Aplicar la restricción NOT NULL
-- -----------------------------------------------------------------------------
-- La restricción UNIQUE ya existe desde v009; acá solo agregamos NOT NULL para
-- alinear la tabla con el resto del flujo de ingreso.

ALTER TABLE public.documentacion_ingreso
  ALTER COLUMN id_local SET NOT NULL;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen:
--   1. Rellena id_local en filas que lo tuvieran NULL (backfill defensivo).
--   2. Marca documentacion_ingreso.id_local como NOT NULL.
--   Ambas operaciones atómicas (BEGIN/COMMIT).
--
-- Después de ejecutar:
--   - documentacion_ingreso queda alineada con candidatos/psicos/preocupacionales.
--   - Se elimina el riesgo latente de duplicados infinitos por id_local NULL.
-- =============================================================================

-- ===== v013_usuarios_auth_y_rls.sql =====
-- =============================================================================
-- Migración: v013 — Tabla usuarios ligada a Supabase Auth + endurecer RLS
-- Fecha:     2026-06-30
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- 1) DB.usuarios vivía hardcodeado en src/shared/state.js con 5 usuarios y sus
--    contraseñas en TEXTO PLANO, compilado y enviado tal cual al browser de
--    cualquiera que entrara al sitio. Se reemplaza por Supabase Auth (que
--    maneja email+password de forma nativa, hasheado, con sesiones) más esta
--    tabla public.usuarios para los campos propios de la app (perfil, función,
--    nickname, activo) ligados 1 a 1 a auth.users por id (uuid).
--
-- 2) Al revisar el resto del esquema se confirmó que el RLS existente (donde
--    existe) usa políticas "USING (true)" — es decir, sin restricción real:
--    cualquiera con la key pública del código fuente puede leer/escribir TODAS
--    las tablas sin pasar por el login de la app. La mayoría de las tablas ni
--    siquiera tiene RLS habilitado. El login de la app era, hasta ahora, una
--    pantalla — no un control de acceso a nivel de datos.
--
--    Este script endurece eso a "solo usuarios autenticados" en todas las
--    tablas existentes. NO implementa permisos finos por perfil (ej. que
--    Ventas no pueda leer legajos) — eso es una pasada futura aparte, una vez
--    que el modelo de perfiles esté completamente migrado a Supabase Auth.
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 1 — Tabla public.usuarios
-- -----------------------------------------------------------------------------
-- id referencia directa a auth.users.id. Si se borra el usuario de Auth, se
-- borra su fila de perfil (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS public.usuarios (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre    text NOT NULL DEFAULT '',
  email     text NOT NULL,
  perfil    text,
  funcion   text,
  nickname  text,
  activo    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_authenticated" ON public.usuarios;
CREATE POLICY "usuarios_select_authenticated" ON public.usuarios
  FOR SELECT TO authenticated USING (true);

-- Cada usuario puede actualizar su propia fila; un Administrador total puede
-- actualizar cualquiera (necesario para la pantalla de Configuración).
DROP POLICY IF EXISTS "usuarios_update_propio_o_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_propio_o_admin" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total')
  );

-- -----------------------------------------------------------------------------
-- PASO 2 — Trigger: auto-provisionar fila en public.usuarios al crear un
-- usuario en Supabase Auth (vía Dashboard o, a futuro, Admin API).
-- -----------------------------------------------------------------------------
-- Sin esto, un usuario de auth.users sin fila en public.usuarios no puede
-- loguearse en la app (doLogin busca su perfil acá y no lo encuentra).
-- SECURITY DEFINER porque el usuario recién creado todavía no tiene sesión
-- propia para insertar bajo su propia policy.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- PASO 3 — Endurecer RLS en las tablas existentes (solo autenticados)
-- -----------------------------------------------------------------------------
-- Las políticas permisivas ("Acceso total X", con distintos nombres según
-- en qué script se creó cada tabla: v002, v007, v009, v011, crear_tablas.sql,
-- setup_supabase.sql) NO se listan a mano por nombre — se descubren y
-- eliminan dinámicamente vía pg_policies, para no depender de tener el
-- historial completo de nombres. En Postgres las políticas se combinan con
-- OR: si queda una sola política vieja "USING (true)" sin borrar, anula todo
-- el endurecimiento de esa tabla.

DO $$
DECLARE
  t text;
  pol record;
  tablas text[] := ARRAY[
    'legajos', 'candidatos', 'psicos', 'preocupacionales', 'documentacion_ingreso',
    'cat_alt_pendientes', 'turnos', 'clientes', 'sanciones', 'casos_legales',
    'enfermos', 'reasignaciones', 'feriados', 'planillas_adelantos', 'prestamos',
    'grillas_liq', 'monotributos', 'paritarias', 'retenes', 'sugerencias',
    'personal_rrhh', 'adjuntos'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    -- FIX (setup desde cero para CLEAN PAZ, 03/09): esta lista asume que
    -- las 22 tablas ya existen — cierto en el historial real de Ohlimpia
    -- (v013 corrió meses después de crearse varias de ellas), falso en un
    -- bootstrap de una sola sesión donde alguna (ej. grillas_liq) recién
    -- se crea en una migración muy posterior. Si todavía no existe, se
    -- salta sin error — esa tabla activa su propio RLS + policy cuando se
    -- cree más adelante en este mismo script.
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I;', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "Solo usuarios autenticados" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen:
--   1. Crea public.usuarios (perfil de app ligado a auth.users) con RLS.
--   2. Trigger que auto-provisiona la fila de perfil al crear un usuario en
--      Supabase Auth.
--   3. Habilita RLS y exige sesión autenticada en las 22 tablas existentes
--      (antes: abiertas a cualquiera con la key pública, con o sin login).
--
-- DESPUÉS DE EJECUTAR ESTE SCRIPT (pasos manuales, fuera de SQL):
--   1. Dashboard de Supabase → Authentication → Add user, para cada uno de los
--      5 usuarios demo (admin@ohlimpia.coop, rrhh@ohlimpia.coop,
--      operaciones@ohlimpia.coop, finanzas@ohlimpia.coop,
--      supervisor@ohlimpia.coop), con una password nueva (NO reusar las viejas
--      en texto plano del código).
--   2. El trigger crea automáticamente la fila en public.usuarios con nombre =
--      lo que esté antes del @. Completar perfil/nombre/funcion para cada uno
--      con un UPDATE manual, por ejemplo:
--
--      UPDATE public.usuarios SET nombre = 'Juan Peretti', perfil = 'Administrador total', funcion = 'Presidente'
--        WHERE email = 'admin@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Jimena Rrhh', perfil = 'RRHH', funcion = 'Coordinador/a'
--        WHERE email = 'rrhh@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Operaciones User', perfil = 'Operaciones', funcion = 'Coordinador/a'
--        WHERE email = 'operaciones@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Finanzas User', perfil = 'Finanzas', funcion = 'Tesorero/a'
--        WHERE email = 'finanzas@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Supervisor Demo', perfil = 'Supervisor', funcion = 'Supervisor/a'
--        WHERE email = 'supervisor@ohlimpia.coop';
-- =============================================================================

-- ===== v014_crear_tabla_pedidos.sql =====
-- =============================================================================
-- Migración: v014 — Crear tabla pedidos (Pedidos de personal)
-- Fecha:     2026-06-30
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- "Pedidos de personal" (src/legacy.js, sección PEDIDOS) es el primer módulo
-- que se migra a src/modules/pedidos/. Nunca tuvo tabla propia en Supabase —
-- vivía solo en memoria del browser (DB.pedidos), por eso supaSync('pedidos', ...)
-- no persistía nada hasta ahora.
--
-- Sigue el mismo patrón id_local que usan legajos/candidatos/psicos, para
-- que encaje con el mapeo genérico camel↔snake de src/shared/supabase.js
-- (a diferencia de la tabla usuarios de v013, que es un caso especial ligado
-- a auth.users por uuid y no pasa por ese mapeo genérico).
--
-- RLS se crea directamente endurecido (solo autenticados) — no hace falta el
-- paso intermedio "abierta y después la cerramos" porque la tabla es nueva.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pedidos (
  id          bigint generated always as identity PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  fecha       text,
  supervisor  text,
  servicio    text,
  zona        text,
  puesto      text,
  horario     text,
  urgencia    text,
  estado      text NOT NULL DEFAULT 'Pendiente',
  candidato   text,
  obs         text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_pedidos ON public.pedidos;
CREATE TRIGGER set_updated_at_pedidos
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedidos;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v015_endurecer_rls_tablas_restantes.sql =====
-- =============================================================================
-- Migración: v015 — Endurecer RLS en tablas que v013 no conocía
-- Fecha:     2026-07-01
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- v013 endureció RLS a "solo autenticados" en las 22 tablas listadas en
-- src/shared/supabase.js (_SM). Al verificar el resultado contra la base real
-- (consultando pg_tables) aparecieron ~20 tablas más que YA EXISTEN en
-- Supabase pero todavía no están conectadas al mapeo _SM del frontend
-- (adelantos_informales, art42, capacitaciones, categorias_salariales,
-- cobros, evaluaciones, facturas, leads, materiales, motivos_fuera_eft,
-- motivos_no_fact, no_conformidades, objetivos, planillas_informales,
-- propuestas_precios, reclamos, retenciones, solicitudes_prestamos,
-- uniformes, vac_admin, vac_operativo). Todas tenían RLS habilitado pero con
-- una policy "allow_all_X" — es decir, el mismo problema que v013 resolvió
-- para las otras 22, sin resolver.
--
-- En vez de mantener una lista a mano (que ya demostró quedarse corta una
-- vez), este script recorre TODAS las tablas de public dinámicamente vía
-- information_schema, excluyendo únicamente "usuarios" (que ya tiene sus
-- políticas propias de v013, ligadas a auth.uid()).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'usuarios'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I;', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "Solo usuarios autenticados" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Después de esto, TODAS las tablas de public (incluida usuarios vía v013)
-- exigen sesión autenticada. Sigue pendiente el permiso fino por perfil
-- (que Ventas no pueda leer legajos médicos, etc.) — deuda ya anotada en v013.
-- =============================================================================

-- ===== v016_fix_usuarios_preexistente.sql =====
-- =============================================================================
-- Migración: v016 — Fix tabla usuarios pre-existente (policy abierta + sin FK)
-- Fecha:     2026-07-01
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- v013 asumió que public.usuarios no existía (CREATE TABLE IF NOT EXISTS).
-- Al verificar contra la base real se descubrió que la tabla YA EXISTÍA
-- (creada en algún momento anterior, probablemente en preparación para el
-- supaSync('usuarios', ...) que ya estaba en legacy.js), con un esquema
-- distinto al que v013 diseñó:
--   - id uuid DEFAULT uuid_generate_v4() — SIN foreign key a auth.users
--   - id_local text — columna del patrón genérico, no usada por el nuevo flujo
-- Por ser CREATE TABLE IF NOT EXISTS, v013 no tocó nada de esto — sólo agregó
-- las policies nuevas, pero la policy vieja "allow_all_usuarios" (abierta a
-- cualquiera, sin requerir login) seguía activa en paralelo porque v013 sólo
-- borraba policies por nombre exacto y no conocía esa.
--
-- La tabla está vacía (0 filas), así que agregar la FK ahora es seguro.
-- =============================================================================

BEGIN;

-- Sacar la policy abierta que quedó viva sin que v013 la detectara.
DROP POLICY IF EXISTS "allow_all_usuarios" ON public.usuarios;

-- Atar id a auth.users para que sea imposible tener un perfil huérfano
-- (y para que el trigger de v013 sea, además de funcional, correcto a nivel
-- de integridad referencial).
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v017_monotributos_uniformes_retenciones.sql =====
-- =============================================================================
-- Migración: v017 — Completar columnas de monotributos, uniformes, retenciones
-- Fecha:     2026-07-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Los 3 módulos ya tienen render + CRUD completos en legacy.js (guardarMonotributo,
-- guardarUniforme, guardarRetencion) y los 3 YA llaman a supaSync(), pero nunca
-- persistían datos reales.
--
-- Al intentar crear las tablas desde cero (CREATE TABLE) se descubrió que YA
-- EXISTÍAN — igual que pasó con "usuarios" en v016 — armadas parcialmente en
-- algún momento anterior: tienen PK, UNIQUE(id_local), trigger de updated_at y
-- la policy de RLS ya correctamente endurecida (heredada del barrido dinámico
-- de v015, que recorre TODAS las tablas de public). Lo único que falta son las
-- columnas de datos — cada tabla solo tenía id/id_local/una columna jsonb/
-- timestamps.
--
-- El shape sigue el de las funciones guardarX() (la ruta de escritura real vía
-- modal), no el de los datos semilla viejos en legacy.js — hay dos shapes
-- distintos para monotributos en el código legacy (uno viejo con nroSocio/
-- facturacionAnual/familia, uno nuevo con cuit/fechaAlta/cur/historialCategorias)
-- y el nuevo es el que efectivamente lee/escribe la pantalla. Los datos semilla
-- del shape viejo se vacían en el mismo cambio (ver commit de código).
-- =============================================================================

BEGIN;

ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS nombre      text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS cuit        text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS categoria   text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS fecha_alta  text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS zona        text DEFAULT 'provincia';
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS obra_social boolean DEFAULT false;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS jubilado    boolean DEFAULT false;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS cur         numeric DEFAULT 0;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS estado      text DEFAULT 'Al día';
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS obs         text;

ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS nombre    text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS nro_socio text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS fecha     text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS talle     text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS descuento numeric DEFAULT 0;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS estado    text DEFAULT 'Pendiente';
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS obs       text;

ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS nombre    text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS nro_socio text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS periodo   text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS monto     numeric DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS motivo    text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS estado    text DEFAULT 'Activa';
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS fecha     text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v018_adjuntos_por_id_text.sql =====
-- =============================================================================
-- Migración: v018 — adjuntos.subido_por_id / borrado_por_id: bigint -> text
-- Fecha:     2026-07-03
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Bug reportado: no se puede eliminar un certificado de antecedentes ("error
-- al borrar"). Causa: v011 definió subido_por_id/borrado_por_id como bigint,
-- porque en ese momento currentUser.id venía del array hardcodeado
-- DB.usuarios (un número chico). Al migrar el login a Supabase Auth,
-- currentUser.id pasó a ser el uuid de auth.users — un UPDATE con ese valor
-- contra una columna bigint falla (invalid input syntax for type bigint).
--
-- Mismo problema afecta subirAdjunto() (subido_por_id es NOT NULL), no solo
-- borrarAdjunto() — cualquier certificado subido después de la migración de
-- auth también habría fallado.
--
-- Se pasa a text en vez de uuid: estas columnas son solo de auditoría (no
-- hay FK ni join contra auth.users), y text acepta tanto los uuid nuevos
-- como la representación de los bigint viejos sin perder datos históricos.
-- =============================================================================

BEGIN;

ALTER TABLE public.adjuntos ALTER COLUMN subido_por_id TYPE text USING subido_por_id::text;
ALTER TABLE public.adjuntos ALTER COLUMN borrado_por_id TYPE text USING borrado_por_id::text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v019_cuenta_bancaria_alta_pendientes.sql =====
-- =============================================================================
-- Migración: v019 — cat_alt_pendientes.cuenta_bancaria (jsonb)
-- Fecha:     2026-07-04
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El modal de Alta de asociados separó "Cuentas bancarias" (banco/CBU) de
-- la pestaña "Domicilio" en su propia pestaña. El legajo final (tabla
-- legajos) ya guardaba banco/cbu como columnas planas propias — sin cambios
-- ahí. Lo que faltaba era una columna nueva para que la copia histórica que
-- queda en cat_alt_pendientes (altaReg.cuentaBancaria) tenga dónde guardarse,
-- separada del snapshot de domicilio.
-- =============================================================================

BEGIN;

ALTER TABLE public.cat_alt_pendientes
  ADD COLUMN IF NOT EXISTS cuenta_bancaria jsonb DEFAULT '{}'::jsonb;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v020_legajo_anterior_nro.sql =====
-- =============================================================================
-- Migración: v020 — legajos.legajo_anterior_nro
-- Fecha:     2026-07-04
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El campo "¿Es reingresante?" del Alta pedía una fecha de egreso anterior
-- que nunca se usaba en ningún lado (dead code: el valor jamás se leía en
-- confirmarAlta). Se reemplaza por una búsqueda del legajo anterior por DNI
-- (no por nombre, para evitar confusiones entre homónimos) entre TODOS los
-- legajos históricos. Si se encuentra, se guarda acá su N° de legajo para
-- trazabilidad entre el legajo viejo y el nuevo.
-- =============================================================================

BEGIN;

ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS legajo_anterior_nro integer;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v021_reasignaciones.sql =====
-- =============================================================================
-- Migración: v021 — Reescritura del módulo Reasignaciones (Etapa 1)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El módulo Reasignaciones (src/modules/reasignaciones/) tenía bugs graves
-- de persistencia: aprobar/rechazar cambiaban el estado solo en memoria
-- (nunca llamaban supaSync), el ABM de motivos/aprobadores tampoco
-- persistía, y el acceso a las reasignaciones era por índice de array
-- filtrado (frágil: filtrar la lista podía terminar aprobando la fila
-- equivocada). Se reescribe el módulo de cero (política A.11 del proyecto)
-- con un modelo de 6 estados en vez de 4, según especificación de Lautaro.
--
-- La tabla `reasignaciones` ya existía (creada a mano, sin migración
-- versionada propia — solo aparece nombrada en el barrido de RLS de v015).
-- Se hace backup completo antes de recrearla.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 0 — Backup defensivo de la tabla existente (si tiene datos, no se
-- pierden; si no tiene, el backup queda vacío y es inofensivo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reasignaciones_backup_v020 AS
  SELECT * FROM public.reasignaciones;

-- ---------------------------------------------------------------------------
-- Paso 1 — Recrear reasignaciones con el modelo de 6 estados
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.reasignaciones;

CREATE TABLE IF NOT EXISTS public.reasignaciones (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                  text UNIQUE NOT NULL,

  -- Asociado
  legajo_id_local           text,
  nro_socio                 text NOT NULL,
  nombre_asociado           text NOT NULL,

  -- Origen
  servicio_origen           text NOT NULL,
  supervisor_origen         text NOT NULL,
  funcion_origen            text,
  zona_origen               text,

  -- Destino
  servicio_destino          text NOT NULL,
  supervisor_destino        text NOT NULL,
  funcion_destino           text,
  zona_destino              text,

  -- Detalles
  motivo                    text NOT NULL,
  fecha_solicitud           date NOT NULL DEFAULT CURRENT_DATE,
  fecha_efectiva            date NOT NULL,
  fecha_ejecucion           date,
  descripcion               text,

  -- Origen de la solicitud
  elevado_por               text NOT NULL,
  originada_por             text NOT NULL,
  pedido_vinculado_id_local text,

  -- Impacto seguros (solo se marca visualmente por ahora — la notificación
  -- real a RRHH vía campana del sistema queda para una etapa futura)
  requiere_altura           boolean NOT NULL DEFAULT false,
  requiere_poliza_esp       boolean NOT NULL DEFAULT false,

  -- Estado
  estado                    text NOT NULL DEFAULT 'Borrador',

  -- Resolución
  aprobado_por              text,
  fecha_aprobacion          timestamptz,
  motivo_rechazo            text,
  fecha_rechazo             timestamptz,
  anulado_por               text,
  fecha_anulacion           timestamptz,

  -- Auditoría
  editado_por               text,
  editado_en                timestamptz,
  anulado                   boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Paso 2 — Tablas de configuración persistida (antes vivían solo en
-- memoria vía DB.motivosReasignacion / DB.aprobadoresReas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.motivos_reasignacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,
  nombre      text UNIQUE NOT NULL,
  orden       integer NOT NULL DEFAULT 0,
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Semilla: los 12 motivos que ya usaba el sistema (state.js), para no
-- perder la config actual al migrar.
INSERT INTO public.motivos_reasignacion (id_local, nombre, orden) VALUES
  ('000000001', 'Baja del servicio (cliente)', 1),
  ('000000002', 'Conflicto con cliente', 2),
  ('000000003', 'Conflicto con compañeros', 3),
  ('000000004', 'Pedido del supervisor', 4),
  ('000000005', 'Pedido del asociado', 5),
  ('000000006', 'Reducción de personal en servicio', 6),
  ('000000007', 'Cobertura de otro servicio', 7),
  ('000000008', 'Sanción disciplinaria', 8),
  ('000000009', 'Mejora de condiciones', 9),
  ('000000010', 'Cambio de categoría/función', 10),
  ('000000011', 'Reingreso', 11),
  ('000000012', 'Otro', 12)
ON CONFLICT (id_local) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.aprobadores_reasignacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,
  cargo       text UNIQUE NOT NULL,
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Semilla: los 2 aprobadores actuales.
INSERT INTO public.aprobadores_reasignacion (id_local, cargo) VALUES
  ('000000001', 'Gerente de Operaciones'),
  ('000000002', 'Gerente de RRHH')
ON CONFLICT (id_local) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Paso 3 — Legajos: columna para el historial de movimientos (hoy se
-- escribía en memoria pero nunca se persistía ni se leía)
-- ---------------------------------------------------------------------------
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS historial_movimientos jsonb DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Paso 4 — RLS (mismo patrón "solo autenticados" que el resto del sistema,
-- v015). El DROP+CREATE de reasignaciones borró sus políticas viejas.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reasignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motivos_reasignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprobadores_reasignacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reasignaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.reasignaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.motivos_reasignacion;
CREATE POLICY "Solo usuarios autenticados" ON public.motivos_reasignacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.aprobadores_reasignacion;
CREATE POLICY "Solo usuarios autenticados" ON public.aprobadores_reasignacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Pendiente para etapas futuras (no en esta migración):
--   - notificaciones_sistema (campana de RRHH por impacto en póliza) — Etapa 5.
--   - Índices de rendimiento — se agregan si el volumen los justifica.
-- =============================================================================

-- ===== v022_capacitaciones.sql =====
-- =============================================================================
-- Migración: v022 — Módulo Capacitaciones (Etapa 1: Registro + Repositorio)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El módulo Capacitaciones vivía entero sin migrar en src/legacy.js: nada
-- persistía en Supabase (supaSync('capacitaciones', ...) apuntaba a una
-- clave que no estaba en el mapa de tablas del frontend). Se rehace de
-- cero (política A.11) empezando por la Etapa 1 (Registro + Repositorio).
--
-- Igual que pasó con `reasignaciones`, existe una tabla `capacitaciones`
-- huérfana en la base real (detectada en el barrido de RLS de v015) con
-- un schema desconocido — se hace backup genérico antes de recrearla.
--
-- Tablas creadas en esta migración:
--   1. capacitaciones           — registro central (Programada/Dictada/Cancelada)
--   2. materiales_capacitacion  — repositorio de materiales
--
-- Quedan afuera (se crean en su propia migración cuando llegue su etapa):
--   preguntas_evaluacion, plantillas_evaluacion, evaluaciones_enviadas,
--   respuestas_evaluacion (Etapa 3 — Evaluaciones).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 0 — Backup defensivo de la tabla existente (huérfana, schema viejo
-- desconocido). Si no tiene filas, el backup queda vacío y es inofensivo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capacitaciones_backup_v021 AS
  SELECT * FROM public.capacitaciones;

-- ---------------------------------------------------------------------------
-- Paso 1 — Recrear capacitaciones
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.capacitaciones;

CREATE TABLE IF NOT EXISTS public.capacitaciones (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  legajo_id_local       text NOT NULL,
  nro_socio             text NOT NULL,
  nombre_asociado       text NOT NULL,
  tipo                  text NOT NULL,
  fecha                 date NOT NULL,
  lugar                 text NOT NULL,
  servicio              text,
  instructor            text NOT NULL,
  metodo_evaluacion     text,
  estado                text NOT NULL DEFAULT 'Programada',
  resultado             text,
  puntaje               integer,
  observaciones         text,
  adjunto_id_local      text,
  materiales_ids        text[],
  coordinado_asociado   text,
  coordinado_supervisor text,
  editado_por           text,
  editado_en            timestamptz,
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Paso 2 — materiales_capacitacion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materiales_capacitacion (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local           text UNIQUE NOT NULL,
  nombre             text NOT NULL,
  tipo               text NOT NULL,
  origen             text NOT NULL,
  url                text,
  archivo_path       text,
  tipo_capacitacion  text,
  duracion           text,
  descripcion        text,
  requiere_eval      boolean DEFAULT true,
  fecha_alta         date NOT NULL DEFAULT CURRENT_DATE,
  anulado            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Paso 3 — RLS (mismo patrón "solo autenticados" que el resto del sistema)
-- ---------------------------------------------------------------------------
ALTER TABLE public.capacitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiales_capacitacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.capacitaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.capacitaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.materiales_capacitacion;
CREATE POLICY "Solo usuarios autenticados" ON public.materiales_capacitacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v023_evaluaciones.sql =====
-- =============================================================================
-- Migración: v023 — Módulo Capacitaciones, Evaluaciones automáticas (Etapa 3)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Etapa 3 de Capacitaciones: exámenes de opción múltiple con corrección
-- automática. Reemplaza el uso actual de Google Forms. Un banco de
-- preguntas por tipo de capacitación, una plantilla por tipo (qué
-- preguntas se envían + nota mínima + plazo), instancias enviadas a
-- asociados con token único (responden sin login en una página pública),
-- y las respuestas ya corregidas.
--
-- Tablas creadas:
--   1. preguntas_evaluacion   — banco de preguntas por tipo
--   2. plantillas_evaluacion  — 1 plantilla por tipo (preguntas incluidas,
--                                nota mínima, plazo)
--   3. evaluaciones_enviadas  — instancias enviadas (token, plazo, estado)
--   4. respuestas_evaluacion  — respuesta del asociado por pregunta
--
-- Sin tablas pivot: "preguntas incluidas" y no aplica acá porque se
-- resuelve con un array text[] (preguntas_ids), mismo patrón que
-- materiales_ids en capacitaciones (v022).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tabla 1 — preguntas_evaluacion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.preguntas_evaluacion (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  tipo_capacitacion text NOT NULL,
  enunciado         text NOT NULL,
  opcion_a          text NOT NULL,
  opcion_b          text NOT NULL,
  opcion_c          text NOT NULL,
  opcion_d          text NOT NULL,
  correcta          text NOT NULL,
  editado_por       text,
  editado_en        timestamptz,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pregunta_tipo ON public.preguntas_evaluacion(tipo_capacitacion) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Tabla 2 — plantillas_evaluacion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plantillas_evaluacion (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  tipo_capacitacion text UNIQUE NOT NULL,
  preguntas_ids     text[],
  nota_minima       integer NOT NULL DEFAULT 70,
  plazo_horas       integer NOT NULL DEFAULT 48,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Tabla 3 — evaluaciones_enviadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluaciones_enviadas (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  capacitacion_id_local text NOT NULL,
  legajo_id_local       text NOT NULL,
  nro_socio             text NOT NULL,
  nombre_asociado       text NOT NULL,
  tipo_capacitacion     text NOT NULL,
  plantilla_id_local    text NOT NULL,
  token                 text UNIQUE NOT NULL,
  fecha_envio           timestamptz NOT NULL DEFAULT now(),
  fecha_limite          timestamptz NOT NULL,
  estado                text NOT NULL DEFAULT 'Enviada',
  puntaje               integer,
  resultado             text,
  fecha_respuesta       timestamptz,
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evalenv_capacit ON public.evaluaciones_enviadas(capacitacion_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_evalenv_legajo  ON public.evaluaciones_enviadas(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_evalenv_token   ON public.evaluaciones_enviadas(token);

-- ---------------------------------------------------------------------------
-- Tabla 4 — respuestas_evaluacion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.respuestas_evaluacion (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,
  evaluacion_id_local text NOT NULL,
  pregunta_id_local   text NOT NULL,
  respuesta           text NOT NULL,
  correcta            boolean NOT NULL,
  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resp_evalenv ON public.respuestas_evaluacion(evaluacion_id_local) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- RLS — "Solo usuarios autenticados" (mismo patrón que v021/v022). Las
-- funciones serverless de Vercel (api/evaluacion-*) usan la service_role
-- key y no pasan por RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.preguntas_evaluacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_evaluacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluaciones_enviadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respuestas_evaluacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.preguntas_evaluacion;
CREATE POLICY "Solo usuarios autenticados" ON public.preguntas_evaluacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.plantillas_evaluacion;
CREATE POLICY "Solo usuarios autenticados" ON public.plantillas_evaluacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.evaluaciones_enviadas;
CREATE POLICY "Solo usuarios autenticados" ON public.evaluaciones_enviadas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.respuestas_evaluacion;
CREATE POLICY "Solo usuarios autenticados" ON public.respuestas_evaluacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v024_uniformes_retenciones.sql =====
-- =============================================================================
-- Migración: v024 — Módulos Uniformes y Retenciones
-- Fecha:     2026-07-06
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Los dos módulos vivían enteros sin migrar en src/legacy.js con 2 bugs
-- reales: acceso por índice de la fila filtrada (rompe al editar/liberar
-- con un filtro activo) y supaSync() siempre guardaba el último elemento
-- del array (correcto solo al crear, no al editar). Se rehacen de cero
-- (política A.11), por id en vez de índice, con soft delete.
--
-- `uniformes` y `retenciones` ya estaban en el mapa de tablas del
-- frontend (_SM) apuntando a tablas homónimas de schema desconocido/viejo
-- — mismo caso ya visto con reasignaciones/capacitaciones: se hace
-- backup genérico antes de recrearlas.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 0 — Backups defensivos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uniformes_backup_v023 AS
  SELECT * FROM public.uniformes;
CREATE TABLE IF NOT EXISTS public.retenciones_backup_v023 AS
  SELECT * FROM public.retenciones;

-- ---------------------------------------------------------------------------
-- Paso 1 — Recrear uniformes
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.uniformes;

CREATE TABLE IF NOT EXISTS public.uniformes (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text UNIQUE NOT NULL,
  legajo_id_local  text,
  nro_socio        text,
  nombre           text NOT NULL,
  fecha            date NOT NULL,
  talle            text,
  prendas          jsonb,
  descuento        numeric NOT NULL DEFAULT 0,
  estado           text NOT NULL DEFAULT 'Pendiente',
  observaciones    text,
  editado_por      text,
  editado_en       timestamptz,
  anulado          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uniformes_legajo ON public.uniformes(legajo_id_local) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Paso 2 — Recrear retenciones
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.retenciones;

CREATE TABLE IF NOT EXISTS public.retenciones (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text UNIQUE NOT NULL,
  legajo_id_local  text,
  nro_socio        text,
  nombre           text NOT NULL,
  tipo             text NOT NULL,
  periodo          text,
  monto            numeric NOT NULL DEFAULT 0,
  motivo           text,
  estado           text NOT NULL DEFAULT 'Activa',
  fecha_liberacion date,
  editado_por      text,
  editado_en       timestamptz,
  anulado          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retenciones_legajo ON public.retenciones(legajo_id_local) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Paso 3 — RLS (mismo patrón "solo autenticados" que el resto)
-- ---------------------------------------------------------------------------
ALTER TABLE public.uniformes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.uniformes;
CREATE POLICY "Solo usuarios autenticados" ON public.uniformes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.retenciones;
CREATE POLICY "Solo usuarios autenticados" ON public.retenciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v025_reglas_competencia.sql =====
-- =============================================================================
-- Migración: v025 — Reglas de Competencia Anual (persistencia real)
-- Fecha:     2026-07-06
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Competencia Anual vivía entera en src/legacy.js con las reglas del
-- torneo (puntajes por acción, duración, desempate) guardadas solo en
-- memoria: guardarReglas() llamaba a supaSync('reglasCompetencia', ...)
-- pero esa clave nunca estuvo en el mapa de tablas (_SM) del frontend, así
-- que el guardado era un no-op silencioso — cualquier edición se perdía
-- al recargar. Se rehace de cero (política A.11) como módulo migrado.
--
-- Es una fila única (singleton): el frontend siempre hace upsert con un
-- id_local fijo ('global'), no una fila por torneo/año.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.reglas_competencia (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local           text UNIQUE NOT NULL,
  duracion           text,
  desempate          text,
  descuento_ausente  integer NOT NULL DEFAULT 10,
  puntajes           jsonb,
  anulado            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reglas_competencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reglas_competencia;
CREATE POLICY "Solo usuarios autenticados" ON public.reglas_competencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v026_tickets.sql =====
-- =============================================================================
-- Migración: v026 — Tickets (perfil DEVELOPER)
-- Fecha:     2026-07-06
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Nuevo perfil DEVELOPER (exclusivo para Fede) con 4 pantallas propias:
-- Inicio, Tickets, Proyección, Seguridad. Las sugerencias que ya cargan
-- los demás perfiles desde el módulo existente (tabla `sugerencias`) se
-- convierten automáticamente en tickets la primera vez que este perfil
-- inicia sesión (sincronizarSugerenciasComoTickets()).
--
-- Roadmap y checklist de seguridad NO viven acá — se persisten en
-- localStorage del navegador, no en Supabase (ver PROMPT_OHLIMPIA_ERP_DEV.md).
--
-- NOTA: se agrega la columna `fecha` (texto DD/MM/AAAA) además de
-- created_at/updated_at, porque _toCamel() en supabase.js descarta
-- explícitamente created_at/updated_at al leer de Supabase (mismo
-- criterio que el resto de las tablas migradas — reasignaciones,
-- capacitaciones, etc. — que siempre tienen su propio campo `fecha`
-- en vez de depender de las columnas automáticas de Postgres).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tickets (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text UNIQUE NOT NULL,
  sugerencia_id  text,
  titulo         text NOT NULL,
  descripcion    text,
  tipo           text NOT NULL DEFAULT 'sugerencia',
  estado         text NOT NULL DEFAULT 'abierto',
  prioridad      text NOT NULL DEFAULT 'media',
  modulo         text,
  autor          text,
  fecha          text,
  respuesta_dev  text,
  resuelto_at    timestamptz,
  anulado        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.tickets;
CREATE POLICY "Solo usuarios autenticados" ON public.tickets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v027_vacaciones.sql =====
-- =============================================================================
-- Migración: v027 — Módulo Vacaciones (sector administrativo)
-- Fecha:     2026-07-07
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_vacaciones.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Rehace de cero (política A.11) el módulo Vacaciones del sector
-- administrativo (~30 personas: RRHH, Operaciones, Contabilidad, Consejo
-- de Administración). Hoy vive en legacy.js (~873-1093) como DB.vacAdmin
-- y no persiste nada: 'vacAdmin' nunca estuvo mapeada en supabase.js, así
-- que supaSync() era un no-op silencioso — todo se perdía al recargar.
--
-- Cubre SOLO al sector administrativo. Los operarios de limpieza tienen
-- su propio módulo (Descansos, sigue en legacy.js sin tocar — no tiene
-- diseño propio todavía).
--
-- NOTA: DISENO_vacaciones.md pedía nombrar este script v015_vacaciones.sql,
-- pero v015 ya existe (v015_endurecer_rls_tablas_restantes.sql) y la
-- migración real más reciente es v026. Se usa v027.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vacaciones (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                  text UNIQUE NOT NULL,

  -- Solicitante
  legajo_id_local           text NOT NULL,
  nro_socio                 text NOT NULL,
  nombre_asociado           text NOT NULL,
  sector                    text NOT NULL,

  -- Fechas
  fecha_solicitud           timestamptz NOT NULL DEFAULT now(),
  fecha_desde               date NOT NULL,
  fecha_hasta               date NOT NULL,
  dias_solicitados          integer NOT NULL,
  fecha_retorno             date NOT NULL,

  -- Contexto
  reemplazante_legajo_id_local text NOT NULL,
  reemplazante_nombre       text NOT NULL,
  descripcion_reemplazo     text,
  observaciones             text,

  -- Estado
  estado                    text NOT NULL DEFAULT 'Borrador',
    -- Borrador
    -- Pendiente aprobación Gerente
    -- Pendiente aprobación Consejo
    -- Aprobada
    -- Rechazada por Gerente
    -- Rechazada por Consejo
    -- Anulada por solicitante
    -- Anulada por Gerente
    -- Solicitud de anulación pendiente
    -- Anulada por Consejo
    -- Anulación rechazada por Consejo

  -- Aprobación Gerente
  aprobado_por_gerente      text,
  fecha_aprobacion_gerente  timestamptz,
  motivo_rechazo_gerente    text,

  -- Aprobación Consejo (tres votos independientes)
  voto_presidente           text,
  voto_presidente_fecha     timestamptz,
  voto_presidente_motivo    text,

  voto_tesorero             text,
  voto_tesorero_fecha       timestamptz,
  voto_tesorero_motivo      text,

  voto_secretario           text,
  voto_secretario_fecha     timestamptz,
  voto_secretario_motivo    text,

  fecha_aprobacion_consejo  timestamptz,
  fecha_rechazo_consejo     timestamptz,

  -- Anulación
  anulado_por_nombre        text,
  fecha_anulacion           timestamptz,
  motivo_anulacion          text,

  -- Anulación post-aprobación (flujo especial vía Consejo)
  solicitud_anulacion_motivo text,
  voto_anul_presidente      text,
  voto_anul_tesorero        text,
  voto_anul_secretario      text,

  -- Auditoría
  editado_por               text,
  editado_en                timestamptz,
  anulado                   boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vacac_legajo ON public.vacaciones(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_vacac_estado ON public.vacaciones(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_vacac_desde  ON public.vacaciones(fecha_desde) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_vacac_sector ON public.vacaciones(sector) WHERE NOT anulado;

ALTER TABLE public.vacaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.vacaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.vacaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v028_legajos_campos_vacaciones.sql =====
-- =============================================================================
-- Migración: v028 — Campos de Vacaciones en Legajos
-- Fecha:     2026-07-07
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_vacaciones.md §4.4)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El módulo Vacaciones (v027) necesita 3 datos por legajo administrativo
-- que hoy no existen en la tabla `legajos`:
--   - sector: a qué área administrativa pertenece (Coord. RRHH, Coord.
--     Operaciones, etc.) — DISENO_vacaciones.md asumía que este campo ya
--     existía; en realidad legajos solo tiene `servicio`/`supervisor`/
--     `funcion` (personal administrativo se identifica hoy por
--     servicio = 'ADMINISTRATIVO', ver state.js). Se agrega el campo.
--   - dias_vacaciones_anuales: días asignados por RRHH para el año en curso.
--   - jefe_directo_legajo_id_local: referencia al legajo del jefe directo,
--     usada para la alerta de superposición jerárquica (soft warning).
--
-- Los 3 campos son opcionales/nulos para el personal operativo — solo se
-- completan para administrativos.
-- =============================================================================

BEGIN;

ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS dias_vacaciones_anuales integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jefe_directo_legajo_id_local text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v029_notificaciones_sistema.sql =====
-- =============================================================================
-- Migración: v029 — Campana de notificaciones del sistema
-- Fecha:     2026-07-07
-- Autor:     Fede (diseño propio — ver nota abajo)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- DISENO_vacaciones.md (§3.14, §11.2) asume que ya existe una tabla
-- `notificaciones_sistema` "creada en Reasignaciones" para avisar cada
-- transición del flujo de aprobación (elevar, aprobar/rechazar Gerente,
-- aprobar/rechazar Consejo, solicitar/resolver anulación). En la
-- práctica esa tabla NUNCA se creó — en sql/v021_reasignaciones.sql solo
-- aparece como un comentario de una etapa futura ("Etapa 5") que no se
-- implementó. Tampoco existe ninguna campana de UI en el proyecto (lo
-- único parecido es un panel de conteos estático en Inicio, sin
-- persistencia ni estado de leído).
--
-- Esta migración crea la tabla desde cero, como utilidad COMPARTIDA
-- (no exclusiva de Vacaciones) para que otros módulos puedan sumarse
-- después sin rehacer nada — ver src/shared/notificaciones.js.
--
-- destinatario_nombre (no un id de usuario/auth) porque el mock de
-- permisos de Vacaciones (permisos.js) resuelve Gerente/Consejo por
-- nombre, y currentUser.nombre ya está disponible tras el login.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.notificaciones_sistema (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  tipo                  text NOT NULL,
  entidad_tipo          text NOT NULL DEFAULT 'vacacion',
  entidad_id_local      text,
  destinatario_nombre   text NOT NULL,
  mensaje               text NOT NULL,
  leida                 boolean NOT NULL DEFAULT false,
  leida_en              timestamptz,
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_destinatario ON public.notificaciones_sistema(destinatario_nombre) WHERE NOT leida AND NOT anulado;

ALTER TABLE public.notificaciones_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.notificaciones_sistema;
CREATE POLICY "Solo usuarios autenticados" ON public.notificaciones_sistema
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v030_descansos.sql =====
-- =============================================================================
-- Migración: v030 — Módulo Descansos (sector operativo)
-- Fecha:     2026-07-07
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_descansos.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Rehace de cero (política A.11) el módulo Descansos del sector
-- operativo (operarios de servicios de limpieza, ~500 personas). Hoy
-- vive en legacy.js como DB.vacOperativo y no persiste nada: 'vacOperativo'
-- nunca estuvo mapeada en supabase.js, así que supaSync() era un no-op
-- silencioso. El modelo viejo además solo tenía un estado simple
-- "Pendiente/Aprobado/Rechazado" — no refleja el flujo real de doble
-- aprobación (Gerente de Operaciones → Gerente de RRHH).
--
-- Cubre SOLO al sector operativo. Los administrativos tienen su propio
-- módulo (Vacaciones, v027/v028) — ver DISENO_vacaciones.md.
--
-- NOTA: DISENO_descansos.md pedía nombrar este script v016_descansos.sql,
-- pero la migración real más reciente es v029. Se usa v030.
--
-- A diferencia de Vacaciones, acá NO hace falta crear notificaciones_sistema
-- (v029, ya existe) — Descansos solo llama a crearNotificacion() en cada
-- transición (src/shared/notificaciones.js, ya implementado).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.descansos (
  id                            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                      text UNIQUE NOT NULL,

  -- Operario
  legajo_id_local               text NOT NULL,
  nro_socio                     text NOT NULL,
  nombre_operario                text NOT NULL,
  servicio                      text NOT NULL,
  supervisor                    text NOT NULL,

  -- Solicitud
  supervisor_solicitante        text NOT NULL,
  fecha_solicitud                timestamptz NOT NULL DEFAULT now(),

  -- Fechas del descanso
  fecha_desde                   date NOT NULL,
  fecha_hasta                   date NOT NULL,
  duracion_dias                 integer NOT NULL,
  fecha_retorno                 date NOT NULL,

  -- Contexto
  motivo                        text NOT NULL,
  reemplazante_legajo_id_local  text,
  reemplazante_nombre           text,
  observaciones                 text,

  -- Estado
  estado                        text NOT NULL DEFAULT 'Borrador',
    -- Borrador
    -- Pendiente aprobación Operaciones
    -- Pendiente aprobación RRHH
    -- Aprobado
    -- Rechazado por Operaciones
    -- Rechazado por RRHH
    -- Anulado por supervisor
    -- Anulado post-aprobación

  -- Aprobación Operaciones
  aprobado_por_operaciones      text,
  fecha_aprobacion_operaciones  timestamptz,
  motivo_rechazo_operaciones    text,

  -- Aprobación RRHH
  aprobado_por_rrhh             text,
  fecha_aprobacion_rrhh         timestamptz,
  motivo_rechazo_rrhh           text,

  -- Anulación
  anulado_por                   text,
  fecha_anulacion                timestamptz,
  motivo_anulacion               text,

  -- Integración futura con Liquidaciones (Etapa 4 del diseño — no
  -- ejecutada todavía, Liquidaciones no está migrado)
  paga_jornada_completa         boolean NOT NULL DEFAULT true,

  -- Auditoría
  editado_por                   text,
  editado_en                    timestamptz,
  anulado                       boolean NOT NULL DEFAULT false,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_descanso_legajo     ON public.descansos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_descanso_estado     ON public.descansos(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_descanso_desde      ON public.descansos(fecha_desde) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_descanso_servicio   ON public.descansos(servicio) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_descanso_supervisor ON public.descansos(supervisor) WHERE NOT anulado;

ALTER TABLE public.descansos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.descansos;
CREATE POLICY "Solo usuarios autenticados" ON public.descansos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v031_vacaciones_preaviso_corto.sql =====
-- =============================================================================
-- Migración: v031 — Vacaciones v1.1: excepción de preaviso corto
-- Fecha:     2026-07-08
-- Autor:     Fede (con delta de diseño de Lautaro + Claude web, DELTA_vacaciones_v1.1.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- La política oficial de RRHH exige mínimo 15 días de anticipación para
-- elevar una solicitud de vacaciones (antes v1.0 solo avisaba con <48hs,
-- sin bloquear). Si el pedido tiene menos de 15 días de anticipación, el
-- sistema lo deja guardado como Borrador marcado, y RRHH puede autorizar
-- una excepción puntual (motivo obligatorio) que lo hace saltar
-- directamente a "Pendiente aprobación Consejo" (se salta el nivel
-- Gerente para esos casos).
-- =============================================================================

BEGIN;

ALTER TABLE public.vacaciones
  ADD COLUMN IF NOT EXISTS requiere_autorizacion_preaviso_corto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_excepcion_preaviso text,
  ADD COLUMN IF NOT EXISTS autorizada_excepcion_por text,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion_excepcion timestamptz;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v032_uniformes.sql =====
-- =============================================================================
-- Migración: v032 — Módulo Uniformes v2 (rediseño completo)
-- Fecha:     2026-07-08
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_uniformes.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el modelo simple de v024 (tabla `uniformes`, sin ciclo de
-- estados) por el modelo rico que pide DISENO_uniformes.md: 6 tablas,
-- 15 estados con doble handshake (Logística → RRHH → Supervisor),
-- precios con vigencia temporal, descuentos en 4 cuotas y devoluciones
-- por baja. La tabla vieja `uniformes` queda intacta como archivo
-- histórico (decisión del usuario) — el módulo nuevo arranca en blanco.
--
-- DISENO_uniformes.md pedía nombrar este script v017_uniformes.sql,
-- pero v017 ya existe (otra migración real, de monotributos/uniformes
-- v1/retenciones). La migración real más reciente es v031. Se usa v032.
--
-- Correcciones respecto al SQL literal del diseño (§4.2), verificadas
-- contra el estado real del repo:
--   - constancia_firmada_adjunto_id_local / constancia_policial_adjunto_id_local
--     (text) -> constancia_firmada_adjunto_id / constancia_policial_adjunto_id
--     (bigint). subirAdjunto() (src/shared/adjuntos.js) nunca completa
--     la columna id_local de la tabla adjuntos (queda NULL siempre) —
--     el identificador real y estable es adjuntos.id (bigserial).
--   - Se agrega alerta_handshake_enviada a pedidos_uniformes, para no
--     duplicar el aviso de "24hs sin confirmar" cada vez que alguien
--     abre el módulo (el diseño no contempla esto).
--   - Se agrega RLS + policy "Solo usuarios autenticados" a las 6
--     tablas (mismo patrón que v027/v030) — el diseño no incluye RLS.
--
-- También en este script (fuera de las 6 tablas nuevas):
--   - ALTER TABLE legajos: agrega talles_uniforme jsonb (sin backfill;
--     el cliente resuelve el talle inicial de Ambo/Zapatos leyendo los
--     campos existentes legajo.ambo / legajo.calzado como fallback).
--   - ALTER TABLE adjuntos: amplía los CHECK de etapa/tipo para que
--     Uniformes pueda reusar la tabla de adjuntos ya existente
--     (constancia firmada, denuncia policial de robo).
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — pedidos_uniformes (registro central del ciclo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_uniformes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  -- Operario
  legajo_id_local        text NOT NULL,
  nro_socio               text NOT NULL,
  nombre_operario         text NOT NULL,
  servicio               text NOT NULL,
  supervisor_asignado     text NOT NULL,

  -- Origen del pedido
  origen                 text NOT NULL,
    -- 'Supervisor' / 'Auditoría' / 'Asociado directo' / 'RRHH - Ingreso'
  solicitado_por          text NOT NULL,
  fecha_solicitud         timestamptz NOT NULL DEFAULT now(),

  -- Motivo
  motivo                 text NOT NULL,
  con_descuento           boolean NOT NULL,

  -- Estado (15 estados, ver DISENO_uniformes.md §11.1)
  estado                 text NOT NULL DEFAULT 'Borrador',

  -- Autorización RRHH (1 -> 2 -> 3)
  autorizado_por_rrhh     text,
  fecha_autorizacion      timestamptz,
  motivo_rechazo          text,

  -- Traspaso Logística <-> RRHH (3 -> 4 -> 5 -> 6)
  fecha_recibido_logistica        timestamptz,
  logistica_recibe_por            text,
  fecha_enviado_por_logistica     timestamptz,
  logistica_envia_por             text,
  fecha_recibido_por_rrhh         timestamptz,
  rrhh_recibe_por                 text,

  -- Traspaso RRHH <-> Supervisor (6 -> 7 -> 8)
  fecha_retirado_supervisor       timestamptz,
  rrhh_entrega_a_supervisor_por   text,
  fecha_confirmado_por_supervisor timestamptz,
  supervisor_confirma_por         text,

  -- Entrega al operario con firma (8 -> 9)
  fecha_entrega_operario          timestamptz,
  supervisor_entrega_por          text,
  constancia_firmada_adjunto_id   bigint,

  -- Devolución de constancia + uniforme viejo (9 -> 10 -> 11)
  fecha_devolucion_supervisor     timestamptz,
  supervisor_devuelve_por         text,
  fecha_cierre                    timestamptz,
  rrhh_cierra_por                 text,

  -- Cancelación (1/2 -> 13)
  fecha_cancelacion               timestamptz,
  cancelado_por                   text,
  motivo_cancelacion              text,

  -- Vencimientos (9 -> 14 -> 15)
  fecha_vencido                   timestamptz,
  vencido_constancia              boolean NOT NULL DEFAULT false,
  vencido_uniforme_viejo          boolean NOT NULL DEFAULT false,
  fecha_descuento_incumplimiento  timestamptz,
  descuento_aplicado_por          text,
  descuento_incumplimiento_motivo text,
  descuento_incumplimiento_monto  numeric(10,2),

  -- Robo (constancia policial opcional)
  constancia_policial_adjunto_id  bigint,

  -- Devolución incompleta del kit viejo
  falto_prenda_kit_devuelto       boolean NOT NULL DEFAULT false,
  prendas_faltantes_devolucion    text,

  -- Alertas de 24hs sin duplicar (gap detectado, no está en el diseño)
  alerta_handshake_enviada        boolean NOT NULL DEFAULT false,

  observaciones                   text,
  editado_por                     text,
  editado_en                      timestamptz,
  anulado                         boolean NOT NULL DEFAULT false,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pu_legajo     ON public.pedidos_uniformes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pu_estado     ON public.pedidos_uniformes(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pu_solicit    ON public.pedidos_uniformes(fecha_solicitud) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pu_supervisor ON public.pedidos_uniformes(supervisor_asignado) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — pedido_uniforme_prendas (N prendas por pedido)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedido_uniforme_prendas (
  id                          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                    text UNIQUE NOT NULL,
  pedido_id_local              text NOT NULL,
  prenda                      text NOT NULL,
  talle                       text NOT NULL,
  cantidad                    integer NOT NULL,
  precio_unitario_congelado    numeric(10,2),
  precio_id_local_referencia   text,
  anulado                     boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pup_pedido ON public.pedido_uniforme_prendas(pedido_id_local) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — pedido_uniforme_eventos (auditoría de transiciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedido_uniforme_eventos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text UNIQUE NOT NULL,
  pedido_id_local  text NOT NULL,
  estado_desde     text,
  estado_hasta     text NOT NULL,
  ejecutado_por    text NOT NULL,
  ejecutado_en     timestamptz NOT NULL DEFAULT now(),
  observaciones   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pue_pedido ON public.pedido_uniforme_eventos(pedido_id_local);

-- ============================================================
-- Tabla 4 — precios_uniformes (catálogo con vigencia temporal)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.precios_uniformes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text UNIQUE NOT NULL,
  prenda          text NOT NULL,
  talle           text,
  precio          numeric(10,2) NOT NULL,
  vigencia_desde   date NOT NULL,
  vigencia_hasta   date,
  cargado_por      text NOT NULL,
  motivo_carga     text,
  anulado         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_precios_prenda   ON public.precios_uniformes(prenda) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_precios_vigencia ON public.precios_uniformes(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- Tabla 5 — descuentos_uniforme_pendientes (compromisos para Liquidaciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.descuentos_uniforme_pendientes (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,
  pedido_id_local      text NOT NULL,
  legajo_id_local      text NOT NULL,
  monto_total          numeric(10,2) NOT NULL,
  cuotas_totales       integer NOT NULL DEFAULT 4,
  cuotas_cobradas      integer NOT NULL DEFAULT 0,
  monto_cuota          numeric(10,2) NOT NULL,
  fecha_generado       timestamptz NOT NULL DEFAULT now(),
  fecha_primera_cuota   date,
  fecha_ultima_cuota    date,
  estado               text NOT NULL DEFAULT 'En curso',
  motivo_generacion     text,
  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dup_legajo ON public.descuentos_uniforme_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_dup_estado ON public.descuentos_uniforme_pendientes(estado) WHERE NOT anulado;

-- ============================================================
-- Tabla 6 — devoluciones_por_baja
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devoluciones_por_baja (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,
  legajo_id_local      text NOT NULL,
  nombre_operario      text NOT NULL,
  fecha_baja           date NOT NULL,
  fecha_generada       timestamptz NOT NULL DEFAULT now(),
  prendas_a_devolver    jsonb NOT NULL,
  estado               text NOT NULL DEFAULT 'Pendiente devolución',
  fecha_confirmada     timestamptz,
  confirmada_por       text,
  prendas_devueltas    jsonb,
  monto_descuento      numeric(10,2),
  observaciones        text,
  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dpb_legajo ON public.devoluciones_por_baja(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_dpb_estado ON public.devoluciones_por_baja(estado) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que v027/v030 (solo usuarios autenticados)
-- ============================================================
ALTER TABLE public.pedidos_uniformes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedidos_uniformes;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_uniformes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pedido_uniforme_prendas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedido_uniforme_prendas;
CREATE POLICY "Solo usuarios autenticados" ON public.pedido_uniforme_prendas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pedido_uniforme_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedido_uniforme_eventos;
CREATE POLICY "Solo usuarios autenticados" ON public.pedido_uniforme_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.precios_uniformes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.precios_uniformes;
CREATE POLICY "Solo usuarios autenticados" ON public.precios_uniformes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.descuentos_uniforme_pendientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.descuentos_uniforme_pendientes;
CREATE POLICY "Solo usuarios autenticados" ON public.descuentos_uniforme_pendientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.devoluciones_por_baja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.devoluciones_por_baja;
CREATE POLICY "Solo usuarios autenticados" ON public.devoluciones_por_baja
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- ALTER legajos — talle por prenda (Chomba/Grafa/Ambo/Polar/Campera/Zapatos)
-- ============================================================
-- Sin backfill: el cliente resuelve el valor inicial de 'ambo' y
-- 'zapatos' leyendo legajo.ambo / legajo.calzado si talles_uniforme
-- viene vacío o no tiene esa clave todavía.
ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS talles_uniforme jsonb;

-- ============================================================
-- ALTER adjuntos — reusar la tabla existente para constancia
-- firmada y denuncia policial de robo (Uniformes)
-- ============================================================
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_etapa_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_etapa_check
  CHECK (etapa in (
    'psicotecnico',
    'preocupacional',
    'documentacion',
    'alta',
    'uniformes'
  ));

ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_tipo_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_tipo_check
  CHECK (tipo in (
    'informe-psico',
    'apto-medico',
    'no-apto',
    'antecedente',
    'libreta',
    'curso',
    'dni-frente',
    'dni-dorso',
    'foto-rostro',
    'monotributo',
    'inaes',
    'certificado-capacitacion',
    'constancia-uniforme',
    'denuncia-policial-uniforme'
  ));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v033_competencia_anual.sql =====
-- =============================================================================
-- Migración: v033 — Módulo Competencia Anual v2 (motor de puntos con ledger)
-- Fecha:     2026-07-09
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_competencia_anual.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el cálculo "al vuelo" del módulo actual (src/modules/competencia/
-- competencia.js: generarDatosCompetencia() recorre legajos/capacitaciones/
-- evaluaciones en cada render, sin persistencia) por un motor de puntos
-- basado en movimientos: catálogo de reglas con versiones y vigencia
-- temporal, eventos que generan movimientos en cascada (operario +
-- compañeros de servicio + supervisor), reversión auditable, cierre anual
-- con podio congelado.
--
-- DISENO_competencia_anual.md pedía nombrar este script
-- v018_competencia_anual.sql, pero v018 ya existe (adjuntos_por_id_text).
-- La migración real más reciente es v032. Se usa v033.
--
-- Correcciones respecto al SQL literal del diseño (§4.2), verificadas
-- contra el estado real del repo:
--   - sql/v025_reglas_competencia.sql ya creó una tabla `reglas_competencia`
--     como SINGLETON plano (una sola fila 'global', puntajes en un jsonb),
--     incompatible con el modelo de catálogo (N filas, una por regla, con
--     FK a versiones) que pide este diseño. Se renombra esa tabla vieja a
--     `reglas_competencia_legado_singleton` (sin pérdida real — la única
--     fila de datos son los 8 puntajes default, que de todas formas se
--     re-siembran acá como las reglas iniciales) y se crea `reglas_competencia`
--     de nuevo con el esquema de catálogo.
--   - `movimientos_puntos.estado text ('Vigente'/'Revertido')` y
--     `anios_competencia.estado text ('Abierto'/'Cerrado')` se reemplazan
--     por `revertido boolean` / `cerrado boolean` — el proyecto nunca usa
--     strings de 2 valores para banderas binarias (ver anulado, entregado,
--     vencidoConstancia en migraciones anteriores).
--   - Se agrega un campo `codigo text unique` a `reglas_competencia` (slug
--     estable, ej. 'responder_evaluacion') para que los hooks de otros
--     módulos (Capacitaciones, api/evaluacion-responder.js) no dependan
--     del id_local numérico.
--   - Se agrega un índice único parcial en eventos_puntos para que la
--     idempotencia (backfill, hooks automáticos) no dependa solo de un
--     chequeo en memoria del lado del cliente.
--   - Se agrega RLS + policy "Solo usuarios autenticados" a las 7 tablas
--     nuevas (mismo patrón que v027/v030/v032) — el diseño no incluye RLS.
--   - "sector_tipo" que usa el pseudocódigo JS del diseño no existe en
--     legajos — no es un cambio de SQL, se resuelve en JS con
--     servicio.trim().toUpperCase() === 'ADMINISTRATIVO' (mismo criterio
--     ya usado en Legajos/Descansos/Vacaciones/Uniformes).
--
-- Seed: 8 reglas iniciales (de las 9 del diseño original, se fusionan
-- "Capacitación vía video" y "Capacitación por Meet/Virtual" en una sola
-- "Capacitación virtual" — decisión del usuario, el campo real de
-- Capacitaciones (cap-lugar) no distingue video de Meet). "Sanción
-- disciplinaria" NO se siembra acá — el propio diseño la deja para cuando
-- exista el módulo Sanciones; se puede cargar después desde el Tab Reglas.
-- =============================================================================

BEGIN;

-- ============================================================
-- Rename de la tabla vieja (singleton, v025) — se preserva como
-- archivo histórico, no se borra.
-- ============================================================
ALTER TABLE public.reglas_competencia RENAME TO reglas_competencia_legado_singleton;

-- ============================================================
-- Tabla 1 — reglas_competencia (catálogo maestro, nuevo esquema)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reglas_competencia (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,
  origen                 text NOT NULL,        -- Automático / Manual / Ambas
  modulo_origen          text,                 -- Capacitaciones / Comercial / Sanciones / null si solo Manual
  activa                 boolean NOT NULL DEFAULT true,
  destaca                boolean NOT NULL DEFAULT false,
  orden                  integer NOT NULL DEFAULT 0,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reglas_activa ON public.reglas_competencia(activa) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — reglas_competencia_versiones (historial de puntajes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reglas_competencia_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  regla_id_local         text NOT NULL,

  puntos_individual      integer NOT NULL,
  puntos_por_companero   integer NOT NULL DEFAULT 0,
  puntos_supervisor      integer NOT NULL DEFAULT 0,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  cargada_por            text NOT NULL,
  motivo_carga           text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rcv_regla    ON public.reglas_competencia_versiones(regla_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_rcv_vigencia ON public.reglas_competencia_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — eventos_puntos (agrupa cascadas por evento único)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.eventos_puntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  regla_id_local         text NOT NULL,
  regla_version_id_local text NOT NULL,

  operario_id_local      text NOT NULL,
  nombre_operario        text NOT NULL,
  servicio_al_momento    text NOT NULL,
  supervisor_al_momento  text,

  fecha_evento           timestamptz NOT NULL,
  origen                 text NOT NULL,        -- Automático / Manual
  modulo_origen          text,
  referencia_externa     text,
  observaciones          text,

  cargado_por            text NOT NULL,

  revertido              boolean NOT NULL DEFAULT false,
  fecha_reversion        timestamptz,
  revertido_por          text,
  motivo_reversion       text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ep_regla    ON public.eventos_puntos(regla_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_ep_operario ON public.eventos_puntos(operario_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_ep_fecha    ON public.eventos_puntos(fecha_evento) WHERE NOT anulado;

-- Idempotencia real a nivel DB (no solo por convención del cliente):
-- un mismo evento externo (capacitación/evaluación) no puede generar
-- 2 eventos_puntos para la misma regla.
CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_referencia_unica ON public.eventos_puntos(regla_id_local, referencia_externa)
  WHERE NOT anulado AND referencia_externa IS NOT NULL;

-- ============================================================
-- Tabla 4 — movimientos_puntos (cada suma/resta individual)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movimientos_puntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  evento_id_local        text NOT NULL,
  regla_id_local         text NOT NULL,
  regla_version_id_local text NOT NULL,

  destinatario_id_local  text NOT NULL,
  nombre_destinatario    text NOT NULL,
  tipo_destinatario      text NOT NULL,        -- Operario / Compañero / Supervisor

  servicio_al_momento    text NOT NULL,
  supervisor_al_momento  text,

  puntos_congelados      integer NOT NULL,

  fecha_movimiento       timestamptz NOT NULL DEFAULT now(),
  fecha_evento           timestamptz NOT NULL,
  anio_competencia       integer NOT NULL,

  revertido              boolean NOT NULL DEFAULT false,
  fecha_reversion        timestamptz,
  revertido_por          text,
  motivo_reversion       text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_evento      ON public.movimientos_puntos(evento_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_mp_destinat    ON public.movimientos_puntos(destinatario_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_mp_servicio    ON public.movimientos_puntos(servicio_al_momento) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_mp_anio        ON public.movimientos_puntos(anio_competencia) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_mp_revertido_anio ON public.movimientos_puntos(revertido, anio_competencia) WHERE NOT anulado;

-- ============================================================
-- Tabla 5 — premios_competencia_anual (histórico de ganadores)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.premios_competencia_anual (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  anio                   integer NOT NULL,
  categoria              text NOT NULL,        -- Individual / Servicio
  puesto                 integer NOT NULL,

  ganador_id_local       text NOT NULL,
  nombre_ganador         text NOT NULL,
  puntos_finales         integer NOT NULL,

  compartido_con         text,

  entregado              boolean NOT NULL DEFAULT false,
  fecha_entrega          date,
  entregado_por          text,
  observaciones          text,
  descripcion_premio     text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pca_anio      ON public.premios_competencia_anual(anio) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pca_categoria ON public.premios_competencia_anual(anio, categoria, puesto) WHERE NOT anulado;

-- ============================================================
-- Tabla 6 — notificaciones_no_participan
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notificaciones_no_participan (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  operario_id_local      text NOT NULL,
  nivel_riesgo           text NOT NULL,

  destinatario_tipo      text NOT NULL,        -- Asociado / Supervisor / CompanerosServicio
  destinatario_id_local  text,

  canal                  text NOT NULL,        -- Sistema / WhatsApp / Email
  origen                 text NOT NULL,        -- Automatico / Manual
  mensaje                text,

  fecha_enviado          timestamptz NOT NULL DEFAULT now(),
  enviado_por            text NOT NULL,

  anio_competencia       integer NOT NULL,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nnp_operario ON public.notificaciones_no_participan(operario_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_nnp_fecha    ON public.notificaciones_no_participan(fecha_enviado) WHERE NOT anulado;

-- ============================================================
-- Tabla 7 — anios_competencia (control de años abiertos/cerrados)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anios_competencia (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  anio                   integer UNIQUE NOT NULL,
  cerrado                boolean NOT NULL DEFAULT false,

  fecha_cierre           timestamptz,
  cerrado_por            text,
  observaciones_cierre   text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS — mismo patrón que v027/v030/v032
-- ============================================================
ALTER TABLE public.reglas_competencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reglas_competencia;
CREATE POLICY "Solo usuarios autenticados" ON public.reglas_competencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.reglas_competencia_versiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reglas_competencia_versiones;
CREATE POLICY "Solo usuarios autenticados" ON public.reglas_competencia_versiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.eventos_puntos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.eventos_puntos;
CREATE POLICY "Solo usuarios autenticados" ON public.eventos_puntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.movimientos_puntos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.movimientos_puntos;
CREATE POLICY "Solo usuarios autenticados" ON public.movimientos_puntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.premios_competencia_anual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.premios_competencia_anual;
CREATE POLICY "Solo usuarios autenticados" ON public.premios_competencia_anual
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.notificaciones_no_participan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.notificaciones_no_participan;
CREATE POLICY "Solo usuarios autenticados" ON public.notificaciones_no_participan
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.anios_competencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.anios_competencia;
CREATE POLICY "Solo usuarios autenticados" ON public.anios_competencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed — 8 reglas iniciales + primera versión de cada una +
-- año 2026 abierto
-- ============================================================
INSERT INTO public.reglas_competencia (id_local, codigo, nombre, descripcion, origen, modulo_origen, activa, destaca, orden) VALUES
  ('r_resp_eval',   'responder_evaluacion',      'Responder una evaluación',              NULL, 'Automático', 'Capacitaciones', true, false, 1),
  ('r_resp_ok',     'respuesta_correcta',        'Respuesta correcta (por pregunta)',     NULL, 'Automático', 'Capacitaciones', true, false, 2),
  ('r_cap_presen',  'capacitacion_presencial',   'Capacitación presencial en oficina',    NULL, 'Automático', 'Capacitaciones', true, true,  3),
  ('r_cap_serv',    'capacitacion_servicio',     'Capacitación en servicio',              NULL, 'Automático', 'Capacitaciones', true, false, 4),
  ('r_cap_virtual', 'capacitacion_virtual',      'Capacitación virtual (video/Meet)',     'Fusiona "vía video" y "por Meet/Virtual" del diseño original — el campo real de Capacitaciones no distingue ambas modalidades.', 'Automático', 'Capacitaciones', true, false, 5),
  ('r_equipo',      'participacion_equipo',      'Participación en equipo',               'Mismo servicio responde/participa junto — carga manual hasta que exista un evento concreto que la dispare.', 'Automático', 'Capacitaciones', true, true, 6),
  ('r_no_particip', 'no_participar_evaluacion',  'No participar en evaluación',           'Descuento al operario, sus compañeros de servicio y su supervisor.', 'Automático', 'Capacitaciones', true, false, 7),
  ('r_felicit',     'felicitacion_cliente',      'Felicitación de cliente',               'Sin módulo Comercial todavía — carga manual desde el Tab Historial.', 'Ambas', 'Comercial', true, true, 8)
ON CONFLICT (id_local) DO NOTHING;

INSERT INTO public.reglas_competencia_versiones (id_local, regla_id_local, puntos_individual, puntos_por_companero, puntos_supervisor, vigencia_desde, cargada_por, motivo_carga) VALUES
  ('v_resp_eval',   'r_resp_eval',   10,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_resp_ok',     'r_resp_ok',      5,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_cap_presen',  'r_cap_presen',  20,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_cap_serv',    'r_cap_serv',    10,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_cap_virtual', 'r_cap_virtual', 12,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_equipo',      'r_equipo',      15, 15, 10,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_no_particip', 'r_no_particip',-10, -3, -5,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_felicit',     'r_felicit',     25,  5, 10,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial')
ON CONFLICT (id_local) DO NOTHING;

INSERT INTO public.anios_competencia (id_local, anio, cerrado) VALUES ('anio_2026', 2026, false)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v034_sanciones.sql =====
-- =============================================================================
-- Migración: v034 — Módulo Sanciones v1 (Etapa 1: niveles 0-2)
-- Fecha:     2026-07-09
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_sanciones.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el ABM plano de Sanciones (src/legacy.js, tabla `sanciones`
-- sin niveles tipados, sin flujo de aprobación) por el modelo de la
-- política oficial: 5 niveles con flujos diferenciados. Esta migración
-- cubre SOLO los niveles 0 (Verbal), 1 (Observación) y 2
-- (Apercibimiento con descargo obligatorio) — niveles 3 (Suspensión) y
-- 4 (Exclusión), con sumario formal y votación del Consejo, quedan
-- para una tanda aparte (decisión del usuario: es la parte legalmente
-- más sensible, conviene validar 0-2 en producción primero).
--
-- DISENO_sanciones.md pedía nombrar este script v019_sanciones.sql,
-- pero v019 ya existe (cuenta_bancaria_alta_pendientes). La migración
-- real más reciente es v033 (Competencia Anual). Se usa v034.
--
-- Tablas NO incluidas en esta migración (quedan para la tanda 2, ver
-- el plan): sancion_aprobaciones, sancion_sumarios, sancion_apelaciones,
-- descuentos_sanciones_pendientes, composicion_consejo,
-- composicion_sindicatura, gerentes_area, areas_administrativas —
-- ninguna hace falta para niveles 0-2. `sanciones_disciplinarias` SÍ
-- se crea con el esquema completo del diseño (incluye columnas de
-- sumario/Consejo/apelación que quedan NULL hasta la tanda 2) para no
-- necesitar un ALTER TABLE doloroso más adelante.
--
-- No existe `legajo.area` (el diseño lo pedía como prerequisito) — se
-- reusa `legajo.sector`, ya poblado para administrativos con 8 valores
-- reales (SECTORES_ADMIN en src/modules/legajos/legajos.js), más
-- granular que las "5 áreas" que asumía el diseño. No hace falta
-- ALTER TABLE legajos.
--
-- Composición de Consejo/Gerentes: se usan los mismos placeholders ya
-- en producción en vacaciones/permisos.js y descansos/permisos.js
-- (mock editable, sin tablas de composición con vigencia — eso
-- también es tanda 2, cuando haga falta para votación de Consejo).
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — sanciones_disciplinarias (registro central, esquema
-- completo del diseño — columnas de sumario/Consejo/apelación quedan
-- sin usar hasta la tanda 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sanciones_disciplinarias (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  -- Sancionado
  legajo_id_local        text NOT NULL,
  nro_socio               text NOT NULL,
  nombre_sancionado       text NOT NULL,
  tipo_sancionado         text NOT NULL,       -- Operativo / Administrativo
  servicio               text,
  supervisor             text,
  area_administrativa     text,                -- legajo.sector si administrativo

  -- Sanción
  nivel                  integer NOT NULL,     -- 0..4
  nombre_nivel            text NOT NULL,
  infraccion_id_local     text NOT NULL,
  nombre_infraccion       text NOT NULL,
  categoria_infraccion    text NOT NULL,
  gravedad               text NOT NULL,

  -- Detalle del hecho
  fecha_hecho             date NOT NULL,
  fecha_deteccion         date NOT NULL,
  descripcion_hecho       text NOT NULL,

  -- Iniciación
  propuesta_por_legajo    text NOT NULL,
  propuesta_por_rol       text NOT NULL,
  fecha_iniciacion        timestamptz NOT NULL DEFAULT now(),

  -- Estado del proceso
  estado                 text NOT NULL DEFAULT 'Borrador',

  -- Aprobación (niveles 1-2)
  fecha_aprobacion        timestamptz,
  aprobada_por_legajo     text,
  aprobada_por_rol        text,
  aprobacion_secundaria_legajo  text,
  aprobacion_secundaria_rol     text,
  fecha_aprobacion_secundaria   timestamptz,
  motivo_rechazo          text,

  -- Descargo
  descargo_requerido      boolean NOT NULL DEFAULT false,
  descargo_solicitado_en  timestamptz,
  fecha_limite_descargo   timestamptz,
  descargo_id_local       text,

  -- Sumario (tanda 2, columna reservada)
  sumario_id_local        text,

  -- Votación Consejo (tanda 2, columnas reservadas)
  votos_favor             integer NOT NULL DEFAULT 0,
  votos_contra            integer NOT NULL DEFAULT 0,
  votos_abstencion        integer NOT NULL DEFAULT 0,
  fecha_resolucion_consejo timestamptz,

  -- Ejecución
  fecha_notificacion_asociado  timestamptz,
  notificacion_metodo     text,

  -- Suspensión (tanda 2, columnas reservadas)
  suspension_fecha_desde  date,
  suspension_fecha_hasta  date,
  suspension_con_goce     boolean,

  -- Medida cautelar (tanda 2, columnas reservadas)
  medida_cautelar         boolean NOT NULL DEFAULT false,
  medida_cautelar_motivo  text,
  medida_cautelar_desde   date,

  -- Apelación (tanda 2, columnas reservadas)
  apelacion_id_local      text,
  sancion_revocada_por_apelacion boolean NOT NULL DEFAULT false,
  fecha_revocacion        timestamptz,

  -- Impacto en Competencia
  evento_competencia_id_local  text,

  -- Anulación administrativa
  fecha_anulacion         timestamptz,
  anulada_por             text,
  motivo_anulacion        text,

  observaciones           text,
  editado_por             text,
  editado_en              timestamptz,
  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sanc_legajo ON public.sanciones_disciplinarias(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_sanc_estado ON public.sanciones_disciplinarias(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_sanc_nivel  ON public.sanciones_disciplinarias(nivel) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_sanc_fecha  ON public.sanciones_disciplinarias(fecha_iniciacion) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — sancion_eventos (auditoría de transiciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sancion_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local        text NOT NULL,

  estado_desde            text,
  estado_hasta            text NOT NULL,
  ejecutado_por           text NOT NULL,
  ejecutado_rol           text,
  ejecutado_en            timestamptz NOT NULL DEFAULT now(),
  observaciones           text,

  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_se_sancion ON public.sancion_eventos(sancion_id_local);

-- ============================================================
-- Tabla 3 — sancion_descargos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sancion_descargos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local        text NOT NULL,
  legajo_id_local         text NOT NULL,

  fecha_presentacion       timestamptz NOT NULL DEFAULT now(),
  medio                   text NOT NULL,
  descripcion              text NOT NULL,
  adjuntos                 jsonb,

  registrado_por           text NOT NULL,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sd_sancion ON public.sancion_descargos(sancion_id_local) WHERE NOT anulado;

-- ============================================================
-- Tabla 4 — catalogo_infracciones
-- ============================================================
CREATE TABLE IF NOT EXISTS public.catalogo_infracciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  codigo                  text UNIQUE NOT NULL,
  nombre                  text NOT NULL,
  descripcion              text,
  categoria                text NOT NULL,

  activa                  boolean NOT NULL DEFAULT true,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ci_activa ON public.catalogo_infracciones(activa) WHERE NOT anulado;

-- ============================================================
-- Tabla 5 — catalogo_infracciones_versiones (vigencia temporal)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.catalogo_infracciones_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  infraccion_id_local     text NOT NULL,

  gravedad                text NOT NULL,
  sancion_sugerida_primera_vez  integer NOT NULL,
  sancion_sugerida_reiteracion  integer NOT NULL,

  vigencia_desde           date NOT NULL,
  vigencia_hasta           date,
  cargada_por              text NOT NULL,
  motivo_carga             text,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_civ_infrac   ON public.catalogo_infracciones_versiones(infraccion_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_civ_vigencia ON public.catalogo_infracciones_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que v027/v030/v032/v033
-- ============================================================
ALTER TABLE public.sanciones_disciplinarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sanciones_disciplinarias;
CREATE POLICY "Solo usuarios autenticados" ON public.sanciones_disciplinarias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sancion_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sancion_eventos;
CREATE POLICY "Solo usuarios autenticados" ON public.sancion_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sancion_descargos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sancion_descargos;
CREATE POLICY "Solo usuarios autenticados" ON public.sancion_descargos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.catalogo_infracciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.catalogo_infracciones;
CREATE POLICY "Solo usuarios autenticados" ON public.catalogo_infracciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.catalogo_infracciones_versiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.catalogo_infracciones_versiones;
CREATE POLICY "Solo usuarios autenticados" ON public.catalogo_infracciones_versiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- ALTER adjuntos — reusar la tabla existente para evidencia y
-- descargo de Sanciones (mismo patrón que Uniformes en v032)
-- ============================================================
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_etapa_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_etapa_check
  CHECK (etapa in (
    'psicotecnico',
    'preocupacional',
    'documentacion',
    'alta',
    'uniformes',
    'sanciones'
  ));

ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_tipo_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_tipo_check
  CHECK (tipo in (
    'informe-psico',
    'apto-medico',
    'no-apto',
    'antecedente',
    'libreta',
    'curso',
    'dni-frente',
    'dni-dorso',
    'foto-rostro',
    'monotributo',
    'inaes',
    'certificado-capacitacion',
    'constancia-uniforme',
    'denuncia-policial-uniforme',
    'evidencia-sancion',
    'descargo-sancion'
  ));

-- ============================================================
-- Seed — 16 infracciones (política oficial §4.5) + primera versión
-- ============================================================
INSERT INTO public.catalogo_infracciones (id_local, codigo, nombre, categoria) VALUES
  ('inf_001', 'INF-001', 'Llegada tarde aislada (hasta 30 min)',                        'Ausencias e Impuntualidad'),
  ('inf_002', 'INF-002', 'Llegadas tarde reiteradas (3+ en el mes)',                    'Ausencias e Impuntualidad'),
  ('inf_003', 'INF-003', 'Ausencia sin aviso (1 episodio)',                             'Ausencias e Impuntualidad'),
  ('inf_004', 'INF-004', 'Ausencias reiteradas sin justificación',                      'Ausencias e Impuntualidad'),
  ('inf_005', 'INF-005', 'Falsificación de planilla',                                   'Ausencias e Impuntualidad'),
  ('inf_006', 'INF-006', 'No completar tareas asignadas o planillas',                   'Incumplimiento de Tareas y Normas'),
  ('inf_007', 'INF-007', 'Bajo rendimiento o desempeño incorrecto',                     'Incumplimiento de Tareas y Normas'),
  ('inf_008', 'INF-008', 'No usar uniforme o usar uniforme de otro servicio',           'Incumplimiento de Tareas y Normas'),
  ('inf_009', 'INF-009', 'Incumplimiento de protocolos o normas del cliente',           'Incumplimiento de Tareas y Normas'),
  ('inf_010', 'INF-010', 'No informar necesidades del servicio',                        'Incumplimiento de Tareas y Normas'),
  ('inf_011', 'INF-011', 'Comentarios inapropiados / rumores que generan conflicto',    'Conductas y Comportamiento'),
  ('inf_012', 'INF-012', 'Actitud inapropiada ante compañeros o superiores',            'Conductas y Comportamiento'),
  ('inf_013', 'INF-013', 'Falta de respeto al personal del cliente o de seguridad',     'Conductas y Comportamiento'),
  ('inf_014', 'INF-014', 'Abandono de servicio sin autorización',                       'Conductas y Comportamiento'),
  ('inf_015', 'INF-015', 'Consumo de bienes del cliente sin autorización',              'Conductas y Comportamiento'),
  ('inf_016', 'INF-016', 'Robo o apropiación de bienes',                                'Conductas y Comportamiento')
ON CONFLICT (id_local) DO NOTHING;

INSERT INTO public.catalogo_infracciones_versiones (id_local, infraccion_id_local, gravedad, sancion_sugerida_primera_vez, sancion_sugerida_reiteracion, vigencia_desde, cargada_por, motivo_carga) VALUES
  ('inf_v_001', 'inf_001', 'Leve',      0, 1, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_002', 'inf_002', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_003', 'inf_003', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_004', 'inf_004', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_005', 'inf_005', 'Muy grave', 2, 4, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_006', 'inf_006', 'Leve',      1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_007', 'inf_007', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_008', 'inf_008', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_009', 'inf_009', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_010', 'inf_010', 'Leve',      1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_011', 'inf_011', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_012', 'inf_012', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_013', 'inf_013', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_014', 'inf_014', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_015', 'inf_015', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_016', 'inf_016', 'Muy grave', 3, 4, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0')
ON CONFLICT (id_local) DO NOTHING;

-- ============================================================
-- Seed — 2 reglas nuevas en Competencia Anual (tablas ya existentes
-- de v033) para los niveles cubiertos en esta tanda. Suspensión/
-- Exclusión disciplinaria se siembran en la tanda 2, junto con esos
-- niveles.
-- ============================================================
INSERT INTO public.reglas_competencia (id_local, codigo, nombre, descripcion, origen, modulo_origen, activa, destaca, orden) VALUES
  ('r_sancion_observ', 'sancion_observacion',    'Observación disciplinaria (Sanciones)',     'Nivel 1 de la política de sanciones — aplicada por el supervisor.', 'Automático', 'Sanciones', true, false, 9),
  ('r_sancion_aperc',  'sancion_apercibimiento',  'Apercibimiento disciplinario (Sanciones)', 'Nivel 2 de la política de sanciones — con descargo obligatorio.',    'Automático', 'Sanciones', true, false, 10)
ON CONFLICT (id_local) DO NOTHING;

INSERT INTO public.reglas_competencia_versiones (id_local, regla_id_local, puntos_individual, puntos_por_companero, puntos_supervisor, vigencia_desde, cargada_por, motivo_carga) VALUES
  ('v_sancion_observ', 'r_sancion_observ', -5,  0,  0, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('v_sancion_aperc',  'r_sancion_aperc', -20,  0, -5, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0')
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v035_categorias.sql =====
-- =============================================================================
-- Migración: v035 — Módulo Categorías v1 (Etapas 1-4: catálogo, valores
--            hora, plus adicionales, auditoría)
-- Fecha:     2026-07-10
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_categorias.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Infraestructura transversal: catálogo de categorías operativas
-- (Operario, Encargado A/B/C, 7 sub-tipos de Retén, etc.) y su valor
-- hora, versionado con vigencia temporal por combinación
-- categoría+servicio. Prerequisito para que Enfermos y Accidentes y
-- Liquidaciones (ninguno migrado todavía) puedan congelar el valor
-- hora vigente a una fecha. Esta migración NO conecta ningún
-- consumidor — solo crea la infraestructura.
--
-- DISENO_categorias.md pedía v020, pero esa migración ya existe
-- (cuenta_bancaria_alta_pendientes). La migración real más reciente
-- es v034 (Sanciones). Se usa v035.
--
-- No se crea catálogo propio de servicios: se reusa el nombre de
-- servicio como texto libre (columna servicio_nombre), igual que ya
-- lo consume el resto del sistema desde DB.servicios en el frontend.
--
-- legajo.funcion (campo de texto libre preexistente, poblado desde
-- DB.categorias) NO se toca ni se migra — categoria_id_local es una
-- columna nueva y separada, sin popular todavía (no hay UI en
-- Legajos para asignarla en esta tanda).
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — categorias_base (catálogo maestro)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categorias_base (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,

  grupo                  text NOT NULL,        -- Operativo / Encargado / Retén / Especial
  es_reten               boolean NOT NULL DEFAULT false,

  activa                 boolean NOT NULL DEFAULT true,
  orden                  integer NOT NULL DEFAULT 0,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cb_activa ON public.categorias_base(activa) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_cb_grupo  ON public.categorias_base(grupo) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — valores_hora_categoria (versiones con vigencia temporal,
-- un valor por combinación categoría + servicio + fecha)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.valores_hora_categoria (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  categoria_id_local     text NOT NULL,
  servicio_nombre        text NOT NULL,

  valor_hora             numeric(10,2) NOT NULL,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  cargada_por            text NOT NULL,
  motivo_carga           text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vhc_categoria ON public.valores_hora_categoria(categoria_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_vhc_servicio  ON public.valores_hora_categoria(servicio_nombre) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_vhc_vigencia  ON public.valores_hora_categoria(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — plus_adicionales (Extra Sanidad, Extra Nocturno)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plus_adicionales (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,

  activa                 boolean NOT NULL DEFAULT true,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Tabla 4 — valores_plus (valores de los plus, vigencia temporal)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.valores_plus (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  plus_id_local          text NOT NULL,

  valor_adicional        numeric(10,2) NOT NULL,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  cargada_por            text NOT NULL,
  motivo_carga           text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vp_plus     ON public.valores_plus(plus_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_vp_vigencia ON public.valores_plus(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que v027/v030/v032/v033/v034
-- ============================================================
ALTER TABLE public.categorias_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.categorias_base;
CREATE POLICY "Solo usuarios autenticados" ON public.categorias_base
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.valores_hora_categoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.valores_hora_categoria;
CREATE POLICY "Solo usuarios autenticados" ON public.valores_hora_categoria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.plus_adicionales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.plus_adicionales;
CREATE POLICY "Solo usuarios autenticados" ON public.plus_adicionales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.valores_plus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.valores_plus;
CREATE POLICY "Solo usuarios autenticados" ON public.valores_plus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Legajos — columna nueva, separada de "funcion" (no se toca)
-- ============================================================
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS categoria_id_local text;

-- ============================================================
-- Seed — 16 categorías base (política de RRHH)
-- ============================================================
INSERT INTO public.categorias_base (id_local, codigo, nombre, grupo, es_reten, orden) VALUES
  ('cat_operario',             'CAT-001', 'Operario',                  'Operativo', false, 10),
  ('cat_operario_media',       'CAT-002', 'Operario Media Jornada',    'Operativo', false, 20),
  ('cat_operario_primera',     'CAT-003', 'Operario de Primera',       'Operativo', false, 30),
  ('cat_referente',            'CAT-004', 'Referente',                 'Encargado', false, 40),
  ('cat_encargado_a',          'CAT-005', 'Encargado A',               'Encargado', false, 50),
  ('cat_encargado_b',          'CAT-006', 'Encargado B',               'Encargado', false, 60),
  ('cat_encargado_c',          'CAT-007', 'Encargado C',               'Encargado', false, 70),
  ('cat_tareas_especiales',    'CAT-008', 'Tareas Especiales',         'Especial',  false, 80),
  ('cat_reten_hora_base',      'CAT-009', 'Retén Hora Base',           'Retén',     true,  90),
  ('cat_reten_media_dist',     'CAT-010', 'Retén Media Distancia',     'Retén',     true, 100),
  ('cat_reten_larga_dist',     'CAT-011', 'Retén Larga Distancia',     'Retén',     true, 110),
  ('cat_reten_media_jornada',  'CAT-012', 'Retén Media Jornada',       'Retén',     true, 120),
  ('cat_reten_nocturno',       'CAT-013', 'Retén Nocturno',            'Retén',     true, 130),
  ('cat_reten_doble_jornada',  'CAT-014', 'Retén Doble Jornada',       'Retén',     true, 140),
  ('cat_reten_hit',            'CAT-015', 'Retén HIT',                 'Retén',     true, 150),
  ('cat_franquero_eventual',   'CAT-016', 'Franquero Eventual',        'Retén',     true, 160)
ON CONFLICT (id_local) DO NOTHING;

-- ============================================================
-- Seed — plus adicionales
-- ============================================================
INSERT INTO public.plus_adicionales (id_local, codigo, nombre, descripcion) VALUES
  ('plus_extra_sanidad',  'PLUS-001', 'Extra Sanidad',  'Plus por desempeñar tareas en espacios de salud'),
  ('plus_extra_nocturno', 'PLUS-002', 'Extra Nocturno', 'Plus por jornada entre 22hs y 6am')
ON CONFLICT (id_local) DO NOTHING;

-- Los valores hora de cada categoría por servicio y los valores de
-- plus se cargan por RRHH desde el sistema — no hay seed inicial.

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v036_situaciones_legales.sql =====
-- =============================================================================
-- Migración: v036 — Módulo Situaciones Legales v1.1
-- Fecha:     2026-07-10
-- Autor:     Fede (con delta de Lautaro + Claude web, DELTA_situaciones_legales_v1.1.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Consolida un módulo que existe pero no se usa: casos legales
-- manejados hoy fuera del sistema (carpetas + email + abogado
-- externo). `casos_legales` YA existe y persiste en Supabase (creada
-- a mano en el dashboard en algún momento, no está en ningún SQL
-- versionado del repo) — este script solo AGREGA columnas
-- (ADD COLUMN IF NOT EXISTS, todo idempotente) y 2 tablas nuevas. No
-- se pierde ningún dato existente.
--
-- DELTA_situaciones_legales_v1.1.md pedía v024, pero esa numeración
-- ya está usada. La migración real más reciente es v035 (Categorías).
-- Se usa v036.
--
-- El rename supervisor → supervisor_al_alta se hace en un bloque
-- defensivo (solo si la columna existe con ese nombre exacto y
-- supervisor_al_alta todavía no existe) — el nombre real de la
-- columna se confirma con una consulta de solo lectura antes de
-- correr este script completo.
--
-- Los adjuntos de casos legales NO usan la tabla compartida
-- `adjuntos` (esa invalida el documento vigente anterior por
-- (dni,tipo) — sirve para "1 documento vigente" tipo foto de DNI, no
-- para múltiples documentos por caso con varios casos por persona).
-- Se crea `casos_legales_adjuntos`, chica y dedicada, append-only.
-- =============================================================================

BEGIN;

-- ============================================================
-- casos_legales — ampliar con los campos que el modal actual
-- captura pero legacy.js descarta, más los campos de cierre formal.
-- ============================================================
ALTER TABLE public.casos_legales
  ADD COLUMN IF NOT EXISTS abogado_cooperativa      text,
  ADD COLUMN IF NOT EXISTS estudio_cooperativa      text,
  ADD COLUMN IF NOT EXISTS supervisor_actual        text,
  ADD COLUMN IF NOT EXISTS tipo_reclamo             text,
  ADD COLUMN IF NOT EXISTS tipo_cliente             text,
  ADD COLUMN IF NOT EXISTS monto_reclamado          numeric(12,2),
  ADD COLUMN IF NOT EXISTS descripcion              text,
  ADD COLUMN IF NOT EXISTS relacion_otros_casos     text,
  ADD COLUMN IF NOT EXISTS fecha_proxima_instancia  date,
  ADD COLUMN IF NOT EXISTS fecha_cierre             date,
  ADD COLUMN IF NOT EXISTS resultado                text,
  ADD COLUMN IF NOT EXISTS monto_final              numeric(12,2),
  ADD COLUMN IF NOT EXISTS observaciones_cierre     text,
  ADD COLUMN IF NOT EXISTS cerrado_por              text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'casos_legales' AND column_name = 'supervisor'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'casos_legales' AND column_name = 'supervisor_al_alta'
  ) THEN
    ALTER TABLE public.casos_legales RENAME COLUMN supervisor TO supervisor_al_alta;
  END IF;
END $$;

-- ============================================================
-- Tabla nueva — novedades_caso_legal (timeline estructurado, en vez
-- del campo único "última novedad" que se sobrescribía)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.novedades_caso_legal (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  caso_id_local          text NOT NULL,

  fecha_evento           date NOT NULL,
  tipo_evento            text NOT NULL,
  descripcion            text NOT NULL,
  adjuntos               jsonb,

  cargada_por            text NOT NULL,
  cargada_en             timestamptz NOT NULL DEFAULT now(),

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ncl_caso  ON public.novedades_caso_legal(caso_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_ncl_fecha ON public.novedades_caso_legal(fecha_evento) WHERE NOT anulado;

-- ============================================================
-- Tabla nueva — casos_legales_adjuntos (append-only, sin
-- invalidación — ver contexto arriba)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.casos_legales_adjuntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  caso_id_local          text NOT NULL,
  novedad_id_local       text,              -- NULL = adjunto del caso, no de una novedad puntual

  url                    text NOT NULL,     -- path en Storage (bucket ohlimpia-adjuntos)
  nombre_archivo         text NOT NULL,
  tipo_mime              text,
  tamano                 integer,

  subido_por             text NOT NULL,
  subido_en              timestamptz NOT NULL DEFAULT now(),

  borrado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cla_caso ON public.casos_legales_adjuntos(caso_id_local) WHERE NOT borrado;

-- ============================================================
-- RLS — mismo patrón que v032/v033/v034/v035
-- ============================================================
ALTER TABLE public.novedades_caso_legal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.novedades_caso_legal;
CREATE POLICY "Solo usuarios autenticados" ON public.novedades_caso_legal
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.casos_legales_adjuntos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.casos_legales_adjuntos;
CREATE POLICY "Solo usuarios autenticados" ON public.casos_legales_adjuntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v037_enfermos_accidentes.sql =====
-- =============================================================================
-- Migración: v037 — Módulo Enfermos y Accidentes v1 (Etapas 1-5)
-- Fecha:     2026-07-10
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_enfermos_accidentes.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el ABM de legacy.js (guardarEnfermo con el mismo bug de
-- llaves que tenía guardarLegal, sin certificados reales, sin motor
-- económico). Depende del módulo Categorías (v035) para congelar el
-- valor hora del retiro.
--
-- DISENO_enfermos_accidentes.md pedía v021, pero esa migración ya
-- existe. La migración real más reciente es v036 (Situaciones
-- Legales). Se usa v037.
--
-- Desvíos vs. el diseño original (evidencia real del repo):
-- - certificados_medicos.adjunto_url (text) reemplaza
--   adjunto_id_local: un certificado tiene una sola foto (relación
--   1:1) — se sube directo a Storage sin pasar por subirAdjunto()
--   (esa función invalida el adjunto vigente anterior del mismo
--   (dni,tipo), lo que pisaría certificados de casos anteriores del
--   mismo asociado).
-- - certificados_medicos.tipo_certificado nueva columna
--   ('Incapacidad' | 'Alta') — reusa la misma tabla para el
--   certificado de alta del cierre de caso.
-- - legajos.categoria_id_local YA EXISTE (v035, Categorías) — no se
--   vuelve a crear. legajos.en_tratamiento es la única columna nueva
--   en legajos.
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — casos_enfermos_accidentes (registro central)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.casos_enfermos_accidentes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  -- Datos comunes del asociado
  legajo_id_local        text NOT NULL,
  nro_socio               text NOT NULL,
  nombre_asociado         text NOT NULL,
  tipo_asociado           text NOT NULL,       -- Operativo / Administrativo
  servicio                text,
  supervisor              text,
  area                    text,                -- si administrativo (legajo.sector)

  -- Tipo de caso
  tipo_caso               text NOT NULL,       -- Enfermedad / Accidente
  subtipo                 text,

  -- Fechas
  fecha_inicio            date NOT NULL,
  fecha_ingreso_modulo    timestamptz NOT NULL DEFAULT now(),
  fecha_alta_prevista     date,
  fecha_alta_efectiva     date,

  -- Categoría y valor hora (congelado al ingreso)
  categoria_id_local      text,
  categoria_nombre        text,
  servicio_al_ingreso     text,
  valor_hora_congelado    numeric(10,2),
  valor_hora_id_local     text,
  pendiente_administrativo boolean NOT NULL DEFAULT false,

  -- Estado del caso
  estado                  text NOT NULL DEFAULT 'Abierto',

  -- Cierre
  fecha_cierre            timestamptz,
  cerrado_por             text,
  motivo_cierre           text,
  observaciones_cierre    text,

  -- Datos específicos por tipo (jsonb, evita columnas vacías del otro tipo)
  datos_enfermedad        jsonb,
  datos_accidente         jsonb,

  observaciones           text,
  cargado_por             text NOT NULL,

  anulado                 boolean NOT NULL DEFAULT false,
  fecha_anulacion         timestamptz,
  anulado_por             text,
  motivo_anulacion        text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cea_legajo ON public.casos_enfermos_accidentes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_cea_estado ON public.casos_enfermos_accidentes(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_cea_tipo   ON public.casos_enfermos_accidentes(tipo_caso) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_cea_inicio ON public.casos_enfermos_accidentes(fecha_inicio) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — certificados_medicos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificados_medicos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  caso_id_local           text NOT NULL,
  legajo_id_local         text NOT NULL,

  tipo_certificado        text NOT NULL DEFAULT 'Incapacidad',  -- Incapacidad / Alta

  -- Datos del médico (ley 17132)
  medico_apellido_nombre  text NOT NULL,
  medico_profesion        text NOT NULL,
  medico_matricula        text NOT NULL,
  medico_domicilio        text NOT NULL,
  medico_telefono         text,
  medico_email            text,

  -- Datos del asistido
  paciente_nombre         text NOT NULL,
  paciente_documento_tipo text NOT NULL,
  paciente_documento_nro  text NOT NULL,

  -- Contenido médico
  diagnostico_cie10       text NOT NULL,
  fecha_emision           date NOT NULL,
  duracion_incapacidad_dias integer NOT NULL,
  fecha_incapacidad_desde date NOT NULL,
  fecha_incapacidad_hasta date NOT NULL,
  observaciones_medicas   text,

  -- Adjunto: path directo en Storage (ver contexto arriba)
  adjunto_url             text NOT NULL,

  -- Validación por RRHH
  estado_validacion       text NOT NULL DEFAULT 'Pendiente',
  validado_por            text,
  fecha_validacion        timestamptz,
  observaciones_validacion text,

  presentado_en           timestamptz NOT NULL DEFAULT now(),
  presentado_por          text NOT NULL,
  medio_presentacion      text,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cm_caso   ON public.certificados_medicos(caso_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_cm_legajo ON public.certificados_medicos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_cm_estado ON public.certificados_medicos(estado_validacion) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — retiros_enfermos_pendientes (compromisos mensuales
-- para Liquidaciones, cuando migre)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.retiros_enfermos_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  caso_id_local           text NOT NULL,
  legajo_id_local         text NOT NULL,

  periodo                 text NOT NULL,       -- YYYY-MM

  dias_del_caso_en_mes    integer NOT NULL,
  horas_calculadas        numeric(10,2) NOT NULL,
  horas_ajustadas         numeric(10,2) NOT NULL,
  valor_hora_congelado    numeric(10,2) NOT NULL,
  monto_retiro            numeric(10,2) NOT NULL,

  estado                  text NOT NULL DEFAULT 'Pendiente',

  fecha_generado          timestamptz NOT NULL DEFAULT now(),
  fecha_aplicacion        timestamptz,
  aplicado_por            text,

  cargado_por              text NOT NULL,
  observaciones            text,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rep_caso    ON public.retiros_enfermos_pendientes(caso_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_rep_legajo  ON public.retiros_enfermos_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_rep_periodo ON public.retiros_enfermos_pendientes(periodo) WHERE NOT anulado;

-- ============================================================
-- Tabla 4 — caso_eventos (auditoría de transiciones de estado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.caso_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  caso_id_local           text NOT NULL,

  estado_desde            text,
  estado_hasta            text NOT NULL,
  ejecutado_por           text NOT NULL,
  ejecutado_en            timestamptz NOT NULL DEFAULT now(),
  observaciones            text,

  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ce_caso ON public.caso_eventos(caso_id_local);

-- ============================================================
-- RLS — mismo patrón que v032/v033/v034/v035/v036
-- ============================================================
ALTER TABLE public.casos_enfermos_accidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.casos_enfermos_accidentes;
CREATE POLICY "Solo usuarios autenticados" ON public.casos_enfermos_accidentes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.certificados_medicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.certificados_medicos;
CREATE POLICY "Solo usuarios autenticados" ON public.certificados_medicos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.retiros_enfermos_pendientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.retiros_enfermos_pendientes;
CREATE POLICY "Solo usuarios autenticados" ON public.retiros_enfermos_pendientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.caso_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.caso_eventos;
CREATE POLICY "Solo usuarios autenticados" ON public.caso_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Legajos — columna nueva (categoria_id_local ya existe desde v035)
-- ============================================================
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS en_tratamiento boolean NOT NULL DEFAULT false;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v038_adelantos_prestamos.sql =====
-- =============================================================================
-- Migración: v038 — Pedidos de Adelantos + Gestión de Adelantos v1.1
-- Fecha:     2026-07-11
-- Autor:     Fede (con delta de Lautaro + Claude web, DELTA_adelantos_prestamos_v1.1.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Consolida dos superficies conectadas (Pedidos de Adelantos en
-- Operaciones, Gestión de Adelantos en Finanzas) que ya existen pero
-- no se usan — la carga de pedidos está rota en toda la app hoy (los
-- modales que se abren no existen en el DOM) y casi ninguna
-- transición de estado persiste. Se formaliza el flujo Supervisor →
-- RRHH → Finanzas.
--
-- DELTA pedía v022/v023, esos números ya están usados. La migración
-- real más reciente es v037 (Enfermos y Accidentes). Se usa v038.
--
-- Modelo aplanado (decisión de esta sesión, ver plan): una fila por
-- pedido, sin "planilla" contenedora. La tabla vieja `planillas_adelantos`
-- (guarda la planilla completa con items anidados, forma incompatible
-- con el modelo nuevo) queda huérfana, intacta, sin usar. `prestamos`
-- SÍ ya es plana (una fila por préstamo) — se extiende con ALTER en
-- vez de crear una tabla nueva, preservando los préstamos activos que
-- ya existan.
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla nueva — pedidos_adelantos (una fila por pedido de adelanto,
-- reemplaza conceptualmente planillas_adelantos + planillas_informales
-- + adelantos_informales, todas fusionadas via el campo "origen")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_adelantos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  legajo_id_local        text NOT NULL,
  nro_socio               text NOT NULL,
  nombre_asociado         text NOT NULL,
  servicio                text,
  supervisor_nombre       text NOT NULL,     -- nombre del supervisor, o 'Carga directa RRHH'
  origen                  text NOT NULL DEFAULT 'Formal',  -- Formal / Informal / Asociado (WhatsApp) / Carga directa RRHH

  monto                   numeric(10,2) NOT NULL,
  periodo                 text NOT NULL,      -- YYYY-MM
  fecha_pedido             date NOT NULL,

  estado                  text NOT NULL DEFAULT 'Borrador',
    -- Borrador / Enviada / Aprobada RRHH / Aprobada / Rechazada RRHH / Rechazada Finanzas / Cancelada

  motivo_rechazo_rrhh      text,
  motivo_rechazo_finanzas  text,
  aprobado_por_rrhh        text,
  fecha_aprobacion_rrhh    timestamptz,
  pagado_por               text,
  fecha_pago               timestamptz,

  supera_tope              boolean NOT NULL DEFAULT false,
  tope_vigente_al_pedido   numeric(10,2),

  observaciones            text,
  cargado_por              text NOT NULL,

  anulado                  boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_legajo  ON public.pedidos_adelantos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pa_estado  ON public.pedidos_adelantos(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pa_periodo ON public.pedidos_adelantos(periodo) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pa_super   ON public.pedidos_adelantos(supervisor_nombre) WHERE NOT anulado;

-- ============================================================
-- prestamos — YA es plana (una fila por préstamo). Se extiende con
-- las columnas del flujo nuevo. monto/cuotas/monto_cuota/estado/obs
-- existentes pasan a representar los valores aprobados/finales — no
-- se tocan. pagos (jsonb) se deja de escribir pero no se borra.
-- ============================================================
ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS supervisor_nombre       text,
  ADD COLUMN IF NOT EXISTS origen                  text DEFAULT 'Formal',
  ADD COLUMN IF NOT EXISTS periodo                 text,
  ADD COLUMN IF NOT EXISTS fecha_pedido             date,
  ADD COLUMN IF NOT EXISTS motivo_rechazo_rrhh      text,
  ADD COLUMN IF NOT EXISTS motivo_rechazo_finanzas  text,
  ADD COLUMN IF NOT EXISTS aprobado_por_rrhh        text,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion_rrhh    timestamptz,
  ADD COLUMN IF NOT EXISTS pagado_por               text,
  ADD COLUMN IF NOT EXISTS fecha_pago               timestamptz,
  ADD COLUMN IF NOT EXISTS monto_solicitado         numeric(10,2),
  ADD COLUMN IF NOT EXISTS cuotas_solicitadas       integer,
  ADD COLUMN IF NOT EXISTS monto_cuota_solicitado   numeric(10,2),
  ADD COLUMN IF NOT EXISTS legajo_id_local          text,
  ADD COLUMN IF NOT EXISTS supera_tope              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado                  boolean NOT NULL DEFAULT false;

-- ============================================================
-- Tabla nueva — pedidos_adelantos_eventos (auditoría compartida,
-- Adelanto y Préstamo, mismo patrón que sancion_eventos/caso_eventos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_adelantos_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  pedido_id_local         text NOT NULL,
  tipo_pedido             text NOT NULL,      -- Adelanto / Préstamo

  estado_desde            text,
  estado_hasta            text NOT NULL,
  ejecutado_por           text NOT NULL,
  ejecutado_rol           text,
  ejecutado_en            timestamptz NOT NULL DEFAULT now(),
  observaciones            text,

  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pae_pedido ON public.pedidos_adelantos_eventos(pedido_id_local);

-- ============================================================
-- Tabla nueva — descuentos_adelantos_pendientes (compromisos para
-- Liquidaciones, cuando migre)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.descuentos_adelantos_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  tipo_origen             text NOT NULL,      -- Adelanto / Préstamo
  origen_id_local         text NOT NULL,

  legajo_id_local         text NOT NULL,
  nro_socio                text NOT NULL,
  nombre_asociado          text NOT NULL,

  monto                   numeric(10,2) NOT NULL,
  periodo_descuento        text NOT NULL,      -- YYYY-MM

  numero_cuota             integer,
  cuotas_totales           integer,

  estado                  text NOT NULL DEFAULT 'Pendiente',
    -- Pendiente / Aplicado / Cancelado

  fecha_generado           timestamptz NOT NULL DEFAULT now(),
  fecha_aplicacion         timestamptz,
  aplicado_por             text,
  motivo_cancelacion       text,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dap_legajo  ON public.descuentos_adelantos_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_dap_periodo ON public.descuentos_adelantos_pendientes(periodo_descuento) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_dap_origen  ON public.descuentos_adelantos_pendientes(origen_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_dap_estado  ON public.descuentos_adelantos_pendientes(estado) WHERE NOT anulado;

-- ============================================================
-- Tabla nueva — configuracion_adelantos_prestamos (clave/valor con
-- vigencia temporal, para max_cuotas / umbral_alerta_pedidos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.configuracion_adelantos_prestamos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  clave                  text NOT NULL,
  valor                  text NOT NULL,
  descripcion             text,
  vigencia_desde           date NOT NULL,
  vigencia_hasta           date,
  modificado_por           text,
  modificado_en            timestamptz NOT NULL DEFAULT now(),
  anulado                 boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_clave ON public.configuracion_adelantos_prestamos(clave) WHERE NOT anulado;

-- ============================================================
-- Tabla nueva — topes_adelantos_versiones (vigencia temporal del
-- tope de adelanto, patrón Corregir/Nueva vigencia ya usado en
-- Categorías/Competencia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.topes_adelantos_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  monto_tope              numeric(10,2) NOT NULL,
  vigencia_desde           date NOT NULL,
  vigencia_hasta           date,
  cargado_por              text NOT NULL,
  motivo                  text,
  anulado                 boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tav_vigencia ON public.topes_adelantos_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que el resto de la sesión
-- ============================================================
ALTER TABLE public.pedidos_adelantos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedidos_adelantos;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_adelantos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pedidos_adelantos_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedidos_adelantos_eventos;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_adelantos_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.descuentos_adelantos_pendientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.descuentos_adelantos_pendientes;
CREATE POLICY "Solo usuarios autenticados" ON public.descuentos_adelantos_pendientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.configuracion_adelantos_prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.configuracion_adelantos_prestamos;
CREATE POLICY "Solo usuarios autenticados" ON public.configuracion_adelantos_prestamos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.topes_adelantos_versiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.topes_adelantos_versiones;
CREATE POLICY "Solo usuarios autenticados" ON public.topes_adelantos_versiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed — configuración inicial
-- ============================================================
INSERT INTO public.topes_adelantos_versiones (id_local, monto_tope, vigencia_desde, cargado_por, motivo) VALUES
  ('tope_inicial_2026', 50000, '2026-01-01', 'Sistema (seed v038)', 'Configuración inicial')
ON CONFLICT (id_local) DO NOTHING;

INSERT INTO public.configuracion_adelantos_prestamos (id_local, clave, valor, descripcion, vigencia_desde, modificado_por) VALUES
  ('cfg_max_cuotas',            'max_cuotas',            '12', 'Máximo de cuotas para préstamos (soft warning)',              '2026-01-01', 'Sistema (seed v038)'),
  ('cfg_umbral_alerta_pedidos', 'umbral_alerta_pedidos', '3',  'Cantidad de pedidos por mes que gatilla alerta a RRHH',       '2026-01-01', 'Sistema (seed v038)')
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v039_comercial_clientes_objetivos.sql =====
-- v039_comercial_clientes_objetivos.sql
-- Clientes y Objetivos/Servicios v1.1 (Etapas 1-3) — persistencia real de
-- objetivos (hoy 100% en memoria), campos ignorados del modal de clientes,
-- y el flujo de handoff Comercial -> Operaciones para asignar supervisor.
--
-- Nota de arquitectura: a diferencia del SQL del documento de diseño
-- original, NO se agrega una columna `cliente_id bigint` en `objetivos`
-- referenciando el PK real de `clientes`. Esta base nunca usa el bigint
-- identity como clave de relación entre módulos (ver CLAUDE.md — "IDs
-- basados en timestamp... para Supabase se trunca a 9 dígitos como
-- id_local"): todas las relaciones cruzadas de este proyecto se hacen por
-- `*_id_local text`, matcheado en la capa de aplicación, nunca por FK al
-- bigint PK (mismo patrón que sanciones/enfermos/adelantos/legal). Se seguí
-- ese mismo patrón acá.

BEGIN;

-- ========== Limpieza previa: tabla objetivos vieja/incompatible ==========
-- Se encontró un `public.objetivos` ya existente en producción, vacío (0
-- filas) y con un esquema completamente distinto (parece generado por
-- inferencia automática de un JSON de ejemplo: columnas sueltas como rol/
-- tel/fecha/motivo/aprobado_por, cliente_id bigint sin id_local, sin RLS).
-- Nunca fue usado por la app (_SM.objetivos no existía hasta esta
-- migración). Se dropea con un guard que aborta si por algún motivo ya
-- tiene filas, para no perder datos reales por accidente.
DO $$
DECLARE filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='objetivos') THEN
    BEGIN
      EXECUTE 'SELECT count(*) FROM public.objetivos' INTO filas;
    EXCEPTION WHEN undefined_table THEN
      filas := 0;
    END;
    IF filas > 0 THEN
      RAISE EXCEPTION 'public.objetivos tiene % fila(s) — abortando migración, revisar antes de dropear', filas;
    END IF;
    EXECUTE 'DROP TABLE IF EXISTS public.objetivos CASCADE';
  END IF;
END $$;

-- ========== Cambio 6 — campos ignorados del modal de clientes ==========
-- Además de ingresos_brutos/jurisdiccion_iibb (Cambio 6), se agregan acá
-- con IF NOT EXISTS los campos que guardarCliente() ya intentaba guardar
-- sin tener mapeo camelCase->snake_case en supabase.js (bug latente
-- encontrado en esta migración: sin mapeo, _toSnake() dejaba el campo en
-- camelCase, PostgREST rechazaba la columna inexistente, y el insert/update
-- completo fallaba en silencio — solo console.warn, el toast de éxito se
-- mostraba igual). Si alguna de estas columnas ya existe con este mismo
-- nombre, el IF NOT EXISTS es no-op.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ingresos_brutos     text,
  ADD COLUMN IF NOT EXISTS jurisdiccion_iibb   text,
  ADD COLUMN IF NOT EXISTS cond_pago           text,
  ADD COLUMN IF NOT EXISTS codigo_tango        text,
  ADD COLUMN IF NOT EXISTS fact_por            text,
  ADD COLUMN IF NOT EXISTS periodo_fact        text,
  ADD COLUMN IF NOT EXISTS productos_en_factura text,
  ADD COLUMN IF NOT EXISTS req_oc              text,
  ADD COLUMN IF NOT EXISTS notas_fact          text,
  ADD COLUMN IF NOT EXISTS doc_req             jsonb,
  ADD COLUMN IF NOT EXISTS contactos           jsonb,
  ADD COLUMN IF NOT EXISTS id_local            text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_id_local ON public.clientes(id_local) WHERE id_local IS NOT NULL;

-- ========== Cambio 3 — persistir objetivos ==========
CREATE TABLE IF NOT EXISTS public.objetivos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  cliente_id_local       text NOT NULL,

  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,

  tipo                   text NOT NULL,
  dir                    text,
  ciudad                 text,

  -- Handoff a Operaciones (Cambio 5)
  supervisor_asignado           text,
  supervisor_asignado_por       text,
  fecha_asignacion_supervisor   timestamptz,

  -- Precio y contrato
  modelo_precio          text NOT NULL,
  valor                  numeric(12,2),
  valor_hora             numeric(10,2),
  efts                   numeric(6,2),
  valor_eft              numeric(12,2),
  fecha_inicio           date,
  fecha_fin              date,
  contrato               text,
  productos              text,
  clausula_actualizacion text,

  -- Facturación (referencias para Tango)
  periodo_fact           text,
  req_oc                 text,
  texto_factura          text,

  -- Estado (Cambio 5)
  estado                 text NOT NULL DEFAULT 'Presupuestado',
    -- Presupuestado / Pendiente asignación operativa / Operativo / Baja

  notas                  text,
  observaciones          text,

  cargado_por            text NOT NULL,
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  modificado_por         text,
  modificado_en          timestamptz,

  fecha_baja             date,
  dado_de_baja_por       text,
  motivo_baja            text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obj_cliente ON public.objetivos(cliente_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_obj_estado  ON public.objetivos(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_obj_codigo  ON public.objetivos(codigo) WHERE NOT anulado;

CREATE TABLE IF NOT EXISTS public.objetivo_responsables (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  nombre                 text NOT NULL,
  rol                    text,
  telefono               text,
  a_satisfacer           boolean NOT NULL DEFAULT false,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_or_objetivo ON public.objetivo_responsables(objetivo_id_local) WHERE NOT anulado;

CREATE TABLE IF NOT EXISTS public.objetivo_adjuntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  nombre                 text NOT NULL,
  url                    text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oa_objetivo ON public.objetivo_adjuntos(objetivo_id_local) WHERE NOT anulado;

-- ========== Cambio 5/12 — historial de supervisores con vigencia ==========
CREATE TABLE IF NOT EXISTS public.objetivo_supervisores_historial (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  supervisor_nombre      text NOT NULL,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  asignado_por           text NOT NULL,
  motivo_cambio          text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_osh_objetivo ON public.objetivo_supervisores_historial(objetivo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_osh_vigencia ON public.objetivo_supervisores_historial(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ========== §4.2 — auditoría de transiciones de estado del objetivo ==========
CREATE TABLE IF NOT EXISTS public.objetivo_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por           text NOT NULL,
  ejecutado_rol           text,
  ejecutado_en            timestamptz NOT NULL DEFAULT now(),
  observaciones           text,

  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oe_objetivo ON public.objetivo_eventos(objetivo_id_local);

-- ========== RLS ==========
ALTER TABLE public.objetivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_responsables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_supervisores_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS objetivos_all ON public.objetivos;
CREATE POLICY objetivos_all ON public.objetivos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS objetivo_responsables_all ON public.objetivo_responsables;
CREATE POLICY objetivo_responsables_all ON public.objetivo_responsables FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS objetivo_adjuntos_all ON public.objetivo_adjuntos;
CREATE POLICY objetivo_adjuntos_all ON public.objetivo_adjuntos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS objetivo_supervisores_historial_all ON public.objetivo_supervisores_historial;
CREATE POLICY objetivo_supervisores_historial_all ON public.objetivo_supervisores_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS objetivo_eventos_all ON public.objetivo_eventos;
CREATE POLICY objetivo_eventos_all ON public.objetivo_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v040_liquidacion_horas.sql =====
-- v040_liquidacion_horas.sql
-- Liquidación de horas v1.1 (Etapas 1-3) — persistencia real de grillas,
-- pendientes de aprobación de Operaciones, historial de resoluciones y
-- casos Art.42. El único módulo del sistema escrito directamente por
-- Lautaro: se preserva su modelo de datos en memoria (grilla.asociados[]
-- con horas por fecha ISO) persistiéndolo como jsonb en vez de normalizar
-- en filas por día — ver nota de arquitectura en el plan de esta migración.

BEGIN;

-- ========== Limpieza previa: grillas_liq vieja/incompatible ==========
-- Igual hallazgo que con `objetivos` en la migración de Clientes/Objetivos:
-- existe un `public.grillas_liq` en producción, vacío, con el esquema
-- viejo exacto (items/horas_norm/horas_extra/horas_nocturnas) que se
-- acaba de eliminar del seed en legacy.js. Se dropea con guard.
DO $$
DECLARE filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='grillas_liq') THEN
    BEGIN
      EXECUTE 'SELECT count(*) FROM public.grillas_liq' INTO filas;
    EXCEPTION WHEN undefined_table THEN
      -- Reintento de un setup anterior: la tabla puede haber quedado en
      -- un estado intermedio (existe en el catálogo pero la sesión
      -- previa se cortó antes de terminar) — se trata como vacía.
      filas := 0;
    END;
    IF filas > 0 THEN
      RAISE EXCEPTION 'public.grillas_liq tiene % fila(s) — abortando migración, revisar antes de dropear', filas;
    END IF;
    EXECUTE 'DROP TABLE IF EXISTS public.grillas_liq CASCADE';
  END IF;
END $$;

-- ========== Grillas de liquidación (una fila por objetivo/mes) ==========
CREATE TABLE IF NOT EXISTS public.grillas_liq (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  objetivo_codigo        text NOT NULL,
  nombre                 text,
  periodo                text NOT NULL,        -- YYYY-MM
  tipo                   text NOT NULL DEFAULT 'servicio',

  supervisor             text,
  efts                   numeric(6,2),
  horas_eft              numeric(10,2),
  horas_contratadas      numeric(10,2),

  estado                 text NOT NULL DEFAULT 'Abierta',  -- Abierta / Cerrada
  alerta_eft             text,

  total_horas_facturables    numeric(10,2) NOT NULL DEFAULT 0,
  total_horas_no_facturables numeric(10,2) NOT NULL DEFAULT 0,
  total_a_pagar               numeric(12,2) NOT NULL DEFAULT 0,

  -- Preserva la forma exacta de grilla.asociados[] (nombre, categoria,
  -- horas{fechaISO}, facturable{fechaISO}, motivoNoFact{fechaISO},
  -- tipoHora, catAlt, etc.) sin normalizar.
  asociados              jsonb NOT NULL DEFAULT '[]'::jsonb,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_obj_periodo ON public.grillas_liq(objetivo_codigo, periodo) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_gl_periodo ON public.grillas_liq(periodo) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_gl_estado  ON public.grillas_liq(estado) WHERE NOT anulado;

-- ========== Pendientes de autorización de Operaciones ==========
CREATE TABLE IF NOT EXISTS public.pendientes_auth_liq (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  tipo                   text NOT NULL,        -- no_facturable / fuera_eft
  grilla_id_local        text NOT NULL,
  asoc_idx               integer NOT NULL,
  detalle                text,
  solicitado_por         text NOT NULL,
  fecha                  text,                 -- DD/MM/AAAA, tal cual arma el código existente

  estado                 text NOT NULL DEFAULT 'Pendiente',  -- Pendiente / Aprobada / Rechazada
  resuelto_por           text,
  fecha_resolucion       text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pal_estado ON public.pendientes_auth_liq(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pal_grilla ON public.pendientes_auth_liq(grilla_id_local) WHERE NOT anulado;

-- ========== Historial de autorizaciones resueltas ==========
CREATE TABLE IF NOT EXISTS public.historial_auth_liq (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  tipo                   text NOT NULL,
  grilla_id_local        text NOT NULL,
  asoc_idx               integer NOT NULL,
  detalle                text,
  solicitado_por         text NOT NULL,
  fecha                  text,

  estado                 text NOT NULL,        -- Aprobada / Rechazada
  resuelto_por           text,
  fecha_resolucion       text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hal_grilla ON public.historial_auth_liq(grilla_id_local) WHERE NOT anulado;

-- ========== Categoría alternativa pendiente (Retén) — tabla propia ==========
-- NO reusa `cat_alt_pendientes` (ya existe en producción con 9 filas
-- reales, pero pertenece al flujo de Altas — candidato/psico/legajo, con
-- columnas identificacion/domicilio/uniforme/etc. Colisión de nombre pura:
-- el mismo nombre "catAltPendientes" describe dos conceptos distintos en
-- este código. Se crea una tabla y clave _SM separadas para no mezclar
-- datos de ambos features.
CREATE TABLE IF NOT EXISTS public.cat_alt_pendientes_liq (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  grilla_id_local        text NOT NULL,
  asoc_idx               integer NOT NULL,
  asociado               text NOT NULL,
  servicio               text,
  mes                    text,
  cat_actual             text,
  cat_propuesta          text,
  propuesto_por          text,
  fecha                  text,

  estado                 text NOT NULL DEFAULT 'Pendiente',
  resuelto_por           text,
  fecha_resolucion       text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_capl_estado ON public.cat_alt_pendientes_liq(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_capl_grilla ON public.cat_alt_pendientes_liq(grilla_id_local) WHERE NOT anulado;

-- ========== Registros Art.42 (tal como los arma guardarArt42) ==========
CREATE TABLE IF NOT EXISTS public.registros_art42 (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  asociado               text NOT NULL,
  nro_socio              text,
  servicio               text,
  supervisor             text,
  periodo                text,
  fecha_inicio           text,
  dias                   integer,
  horas_por_dia          numeric(4,2),
  categoria              text,
  obs                    text,
  estado                 text NOT NULL DEFAULT 'Abierto',  -- Abierto / (lo que use puente_art42.js)

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ra42_estado ON public.registros_art42(estado) WHERE NOT anulado;

-- ========== RLS ==========
ALTER TABLE public.grillas_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendientes_auth_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_auth_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_alt_pendientes_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_art42 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grillas_liq_all ON public.grillas_liq;
CREATE POLICY grillas_liq_all ON public.grillas_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pendientes_auth_liq_all ON public.pendientes_auth_liq;
CREATE POLICY pendientes_auth_liq_all ON public.pendientes_auth_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS historial_auth_liq_all ON public.historial_auth_liq;
CREATE POLICY historial_auth_liq_all ON public.historial_auth_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS cat_alt_pendientes_liq_all ON public.cat_alt_pendientes_liq;
CREATE POLICY cat_alt_pendientes_liq_all ON public.cat_alt_pendientes_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS registros_art42_all ON public.registros_art42;
CREATE POLICY registros_art42_all ON public.registros_art42 FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v041_sugerencias_realtime.sql =====
-- v041_sugerencias_realtime.sql
-- Reportes y Sugerencias v1.1 — habilita Supabase Realtime en la tabla
-- `sugerencias` para que el perfil DEVELOPER reciba tickets nuevos al
-- instante (websocket, postgres_changes) en vez de esperar el polling de
-- 25s. Primera tabla del proyecto con Realtime habilitado — ya estaba
-- documentado como preferencia en POLITICAS_PROYECTO.md pero nunca
-- implementado. Sin cambios de esquema: la tabla y sus columnas ya
-- existen y alcanzan (estado sigue siendo texto libre).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sugerencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sugerencias;
  END IF;
END $$;

-- ===== v042_sugerencias_titulo_modulo.sql =====
-- v042_sugerencias_titulo_modulo.sql
-- Reportes y Sugerencias — agrega título y módulo al reporte, para que el
-- buzón sea más profesional: quien reporta puede elegir a qué módulo
-- corresponde (o "General" si no aplica) y ponerle un título corto.
-- Sin romper registros viejos: ambas columnas nullable, el código ya
-- maneja el fallback si vienen vacías.

-- Hallazgo durante esta migración: la tabla real ya tenía un esquema mucho
-- más rico que el que usaba el código (modulo, modulo_label, prioridad,
-- fecha_estimada, obs_admin, motivo_rechazo, visto_bueno, reabierto,
-- historial jsonb, ult_accion...) — probablemente de un diseño anterior
-- nunca terminado de cablear. `modulo` ya existía (este ADD es no-op).
-- `respuesta_dev` NO existía: el loop de vuelta armado en v041
-- (guardarRespuestaTicket → sugerencia.respuestaDev) escribía a una
-- columna inexistente y fallaba en silencio desde que se creó. Se agrega
-- acá para que ese fix empiece a funcionar de verdad.
ALTER TABLE public.sugerencias
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS modulo text,
  ADD COLUMN IF NOT EXISTS modulo_label text,
  ADD COLUMN IF NOT EXISTS respuesta_dev text;

-- ===== v043_inaes_clavefiscal_valores_por_categoria.sql =====
-- v043_inaes_clavefiscal_valores_por_categoria.sql
-- Feedback del equipo admin (Gabi, 2026-07-14). Dos cambios sin relación
-- entre sí, agrupados en una sola migración por conveniencia:

-- 1) Libro de asociados — legajos.claveFiscal (clave AFIP, dato nuevo)
--    y legajos.inaes (N° de registro INAES) ya se muestran en el legajo
--    (tab Datos personales) y se editan desde el modal de edición.
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS clave_fiscal text,
  ADD COLUMN IF NOT EXISTS inaes text;

-- 2) Valores hora — la paritaria dejó de negociar por servicio, ahora
--    es un único valor por categoría. Se saca el NOT NULL de
--    servicio_nombre para poder cargar registros "generales"
--    (servicio_nombre = NULL) sin romper el único consumidor real que
--    ya existía del modelo viejo por servicio: Enfermos y Accidentes
--    (categoria_helper.js → congelarValorHora), que sigue funcionando
--    igual porque el código nuevo (obtenerValorHoraVigente) prioriza un
--    valor específico de servicio por sobre uno general cuando ambos
--    están vigentes. Los datos históricos por servicio quedan intactos,
--    solo se habilita coexistencia con el modelo nuevo.
ALTER TABLE public.valores_hora_categoria
  ALTER COLUMN servicio_nombre DROP NOT NULL;

-- ===== v044_comercial_delta_v1_2.sql =====
-- v044_comercial_delta_v1_2.sql
-- Delta Comercial v1.2 (24 julio 2026) — campos nuevos del modal de
-- Cliente. Sin estas columnas, guardarCliente() falla en silencio para
-- TODO el registro (mismo bug de columna inexistente ya documentado en
-- v039 — PostgREST rechaza el insert/update completo, supaSync() solo
-- hace console.warn, el toast de éxito se muestra igual).
--
-- 2.1.1: responsable interno (account manager de Comercial), lee de Legajos.
-- 2.1.2: tipo de contrato (Por hora / Presupuesto fijo), gobierna el modelo
-- de precio de los Objetivos/Servicios del cliente.

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS responsable   text,
  ADD COLUMN IF NOT EXISTS tipo_contrato text;

COMMIT;

-- ===== v045_comercial_delta_v1_2_objetivos.sql =====
-- v045_comercial_delta_v1_2_objetivos.sql
-- Delta Comercial v1.2 — columnas nuevas de objetivos (mismo motivo que
-- v044: sin la columna, el update completo del objetivo falla en silencio).
--
-- 2.2.6: motivo de baja separado en razón parametrizada + detalle libre
-- (motivo_baja se sigue guardando combinado, para no romper lecturas
-- existentes de esa columna).
-- 2.2.7: reactivación de un objetivo dado de baja, sin pisar fecha_baja/
-- dado_de_baja_por/motivo_baja (quedan como historial de la última baja).
-- 2.2.1-2.2.3: checklist de campos mínimos del objetivo — localidad y
-- personal_horario son campos nuevos del formulario, no existían.

BEGIN;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS motivo_baja_razon   text,
  ADD COLUMN IF NOT EXISTS motivo_baja_detalle text,
  ADD COLUMN IF NOT EXISTS fecha_reactivacion  date,
  ADD COLUMN IF NOT EXISTS reactivado_por      text,
  ADD COLUMN IF NOT EXISTS localidad           text,
  ADD COLUMN IF NOT EXISTS personal_horario    text;

COMMIT;

-- ===== v046_persistencia_liq_admin_retenes_mantenimiento.sql =====
-- v046_persistencia_liq_admin_retenes_mantenimiento.sql
-- Liquidación Administración (+ Suplemento), Retenes y Mantenimiento
-- vivían 100% en memoria del navegador — sin tabla propia, sin una sola
-- llamada a supaSync en todo legacy.js. Cualquier alta/carga de horas se
-- perdía al recargar la página. Esta migración les da persistencia real.
--
-- Mismo criterio de diseño que v040 (Liquidación de horas): las
-- estructuras "día por persona" (DB.liqAdminHoras[mes][id][fechaISO],
-- DB.retenHoras[mes][id][fechaISO], etc.) NO se normalizan en una fila
-- por día — se persisten como jsonb, una fila por (persona, período),
-- preservando el shape que ya usa el código en memoria. Ver nota de
-- arquitectura en v040 para el precedente.
--
-- liqAdminHoras + liqAdminTipo + liqAdminValores (y su equivalente en
-- Suplemento) viven las 3 bajo la misma clave (mes, personaId) en el
-- código — se fusionan acá en una sola tabla por período en vez de 3,
-- porque siempre se leen/escriben juntas para la misma persona/mes.

BEGIN;

-- ========== Liquidación Administración — personal ==========
CREATE TABLE IF NOT EXISTS public.liq_admin_personal (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  area              text,
  categoria         text,
  horas_fijas       numeric(8,2) DEFAULT 200,
  valor_hora        numeric(12,2) DEFAULT 0,
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lap_activo ON public.liq_admin_personal(activo);

-- Horas + tipo (facturable/art42) + horas_fijas/valor_hora vigentes,
-- una fila por (persona, período). getValoresPeriodo() en el cliente
-- sigue resolviendo "el período vigente más reciente" leyendo estas filas
-- ordenadas — eso no se replica en SQL, se recalcula en JS tras cargar.
CREATE TABLE IF NOT EXISTS public.liq_admin_periodos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,        -- 'YYYY-MM'
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {fechaISO: horas|'F'|'AJ'|'AI'}
  tipo              text NOT NULL DEFAULT 'facturable',   -- facturable | art42
  horas_fijas       numeric(8,2),
  valor_hora        numeric(12,2),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lapd_persona_periodo ON public.liq_admin_periodos(persona_id_local, periodo);

-- ========== Liquidación Suplemento — mismo patrón, sin "tipo" ==========
CREATE TABLE IF NOT EXISTS public.liq_suplemento_personal (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  area              text,
  funcion_extra     text NOT NULL,
  horas_fijas       numeric(8,2) DEFAULT 0,
  valor_hora        numeric(12,2) DEFAULT 0,
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lsp_activo ON public.liq_suplemento_personal(activo);

CREATE TABLE IF NOT EXISTS public.liq_suplemento_periodos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,
  horas_fijas       numeric(8,2),
  valor_hora        numeric(12,2),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lspd_persona_periodo ON public.liq_suplemento_periodos(persona_id_local, periodo);

-- ========== Retenes ==========
-- OJO: ya existe public.retenes en producción (creada a mano, sin script
-- en este repo, con RLS habilitado desde v013) pero NUNCA usada por
-- ningún código de la app — DB.retenes no tenía ni una llamada a
-- supaSync. Mismo criterio que cat_alt_pendientes_liq en v040: se crea
-- una tabla con sufijo propio en vez de arriesgarse a un schema
-- desconocido, y se repunta la clave _SM 'retenes' → 'retenes_liq'.
CREATE TABLE IF NOT EXISTS public.retenes_liq (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  nro_socio         text,
  categori_base     text DEFAULT 'Operario/a limpieza',
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rl_activo ON public.retenes_liq(activo);

CREATE TABLE IF NOT EXISTS public.retenes_liq_horas (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {fechaISO: {hs, catAlt}}

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rlh_persona_periodo ON public.retenes_liq_horas(persona_id_local, periodo);

-- ========== Mantenimiento ==========
CREATE TABLE IF NOT EXISTS public.mant_personal (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  nro_socio         text,
  categori_base     text DEFAULT 'Operario/a limpieza especializado/a',
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_activo ON public.mant_personal(activo);

CREATE TABLE IF NOT EXISTS public.mant_horas (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mh_persona_periodo ON public.mant_horas(persona_id_local, periodo);

ALTER TABLE public.liq_admin_personal      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_admin_periodos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_suplemento_personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_suplemento_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenes_liq             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenes_liq_horas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mant_personal           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mant_horas              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS liq_admin_personal_all ON public.liq_admin_personal;
CREATE POLICY liq_admin_personal_all      ON public.liq_admin_personal      FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS liq_admin_periodos_all ON public.liq_admin_periodos;
CREATE POLICY liq_admin_periodos_all      ON public.liq_admin_periodos      FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS liq_suplemento_personal_all ON public.liq_suplemento_personal;
CREATE POLICY liq_suplemento_personal_all ON public.liq_suplemento_personal FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS liq_suplemento_periodos_all ON public.liq_suplemento_periodos;
CREATE POLICY liq_suplemento_periodos_all ON public.liq_suplemento_periodos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS retenes_liq_all ON public.retenes_liq;
CREATE POLICY retenes_liq_all             ON public.retenes_liq             FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS retenes_liq_horas_all ON public.retenes_liq_horas;
CREATE POLICY retenes_liq_horas_all       ON public.retenes_liq_horas       FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS mant_personal_all ON public.mant_personal;
CREATE POLICY mant_personal_all           ON public.mant_personal           FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS mant_horas_all ON public.mant_horas;
CREATE POLICY mant_horas_all              ON public.mant_horas              FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v047_comercial_delta_v1_3.sql =====
-- v047_comercial_delta_v1_3.sql
-- Delta Comercial v1.3 (29 julio 2026) — columnas nuevas para Clientes y
-- Servicios. Sin estas columnas, guardarCliente()/guardarObjetivo() fallan
-- en silencio para todo el registro (mismo bug de columna inexistente ya
-- documentado en v039/v044/v045/v046 — PostgREST rechaza el insert/update
-- completo, supaSync() solo hace console.warn, el toast de éxito se
-- muestra igual).
--
-- V.1/1.2: identidad interna propia del cliente (codigo), desacoplada del
-- Código Tango — antes convivían formatos internos (CLI-0001) y códigos
-- crudos de Tango (ej. "46") en el mismo campo.
-- 1.2/A.1: responsable de cliente puede ser externo (no solo Legajos).
-- A.4: jurisdicción del servicio (CABA/Provincia de Buenos Aires, con
-- estructura fácil de extender a futuras provincias).
-- A.3: personal necesario como tabla de puestos estructurada (jsonb).
-- 2.5/A.6: necesidad logística del servicio (productos, elementos de
-- limpieza, máquinas) — la "receta" del servicio, dato estable.
-- 2.3.2: tilde "recibe la factura" sobre los responsables del servicio.
-- V.1: bug preexistente encontrado de paso — objetivo_responsables.telefono
-- ya existe desde v039, pero el mapeo camelCase→snake_case de 'tel' nunca
-- se agregó (se mandaba 'tel' tal cual a una columna 'telefono'
-- inexistente para PostgREST) — fix es solo de código (src/shared/
-- supabase.js), esta migración no toca esa tabla.

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo               text,
  ADD COLUMN IF NOT EXISTS responsable_tipo     text,
  ADD COLUMN IF NOT EXISTS responsable_contacto text;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS jurisdiccion       text,
  ADD COLUMN IF NOT EXISTS puestos_necesarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS log_productos      text,
  ADD COLUMN IF NOT EXISTS log_elementos      text,
  ADD COLUMN IF NOT EXISTS log_maquinas       text;

ALTER TABLE public.objetivo_responsables
  ADD COLUMN IF NOT EXISTS recibe_factura boolean NOT NULL DEFAULT false;

COMMIT;

-- ===== v048_persistencia_cobros_tango.sql =====
-- v048_persistencia_cobros_tango.sql
-- Facturas, Cobros e Historial de importaciones (módulo Cobros / Gestión
-- de cobranzas) vivían 100% en memoria del navegador — sin una sola
-- llamada a supaSync en todo legacy.js. Un pago parcial registrado, una
-- gestión de cobro cargada, o una importación desde Tango se perdían al
-- recargar la página. Esta migración les da persistencia real.
--
-- HALLAZGO al correr esta migración: 'facturas' y 'cobros' YA EXISTÍAN en
-- producción — creadas a mano en algún momento, con 0 filas, sin ninguna
-- llamada a supaSync que las tocara (mismo patrón "creada a mano, sin
-- script en el repo" que 'retenes', documentado en v046/supabase.js).
-- Por eso esta migración es ALTER, no CREATE, para 'facturas'/'cobros'
-- — no hay datos que migrar (0 filas en ambas), pero si hubiera, un
-- CREATE TABLE hubiera fallado y un DROP+CREATE los habría perdido.
--
-- DELTA_comercial_cobros_tango_v1: cada factura ahora tiene saldo propio
-- (pagos parciales vía múltiples recibos) — la tabla existente no tenía
-- columna 'saldo' en absoluto, así que sin esta migración el feature no
-- podía funcionar. Cada recibo de Tango es una fila propia en "cobros"
-- (no se suman) — esa tabla ya calzaba, sin cambios de columnas ahí.
--
-- importe/importe_facturado/importe_cobrado eran 'integer' — los montos
-- reales de Tango vienen con centavos (ej. "2,241,585.39"), así que se
-- amplían a numeric(14,2) para no romper el insert por redondeo/tipo.
--
-- Columna telefono_cobro (rename de "telefono"): el mapeo camelCase↔
-- snake_case de src/shared/supabase.js es global (no por tabla) y ya
-- tiene 'telefono'→'tel' reservado para objetivo_responsables (v047) —
-- una columna "telefono" acá pisaría ese mapeo y el campo se leería mal
-- en ambas tablas. Renombrar es seguro porque la tabla está vacía.
--
-- Columnas 'tipo'/'fecha'/'nota' de la 'facturas' preexistente no se
-- tocan — no las usa este código, quedan sin uso (igual que antes).

BEGIN;

-- ========== facturas (ya existía — se completa) ==========
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS saldo                 numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marcada_cobrada_por    text,
  ADD COLUMN IF NOT EXISTS fecha_marcada_cobrada  text;

ALTER TABLE public.facturas
  ALTER COLUMN importe TYPE numeric(14,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='facturas' AND column_name='telefono'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='facturas' AND column_name='telefono_cobro'
  ) THEN
    ALTER TABLE public.facturas RENAME COLUMN telefono TO telefono_cobro;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON public.facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado  ON public.facturas(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_nro     ON public.facturas(nro_factura);

-- ========== cobros (ya existía — solo se amplía el tipo de importe) ==========
ALTER TABLE public.cobros
  ALTER COLUMN importe_facturado TYPE numeric(14,2),
  ALTER COLUMN importe_cobrado   TYPE numeric(14,2);

CREATE INDEX IF NOT EXISTS idx_cobros_cliente     ON public.cobros(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_factura ON public.cobros(nro_factura);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_recibo  ON public.cobros(nro_recibo);

-- ========== historial_importaciones (nueva) ==========
CREATE TABLE IF NOT EXISTS public.historial_importaciones (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,

  tipo        text,
  fecha       text,
  cantidad    integer DEFAULT 0,
  detalle     text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_historial_importaciones ON public.historial_importaciones;
CREATE TRIGGER set_updated_at_historial_importaciones
  BEFORE UPDATE ON public.historial_importaciones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.historial_importaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.historial_importaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.historial_importaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v049_cobros_tango_v2_alerta.sql =====
-- v049_cobros_tango_v2_alerta.sql
-- DELTA_comercial_cobros_tango_v2 (30 julio 2026) — reemplaza el modelo de
-- importación de v1 (parseo de texto/PDF) por lectura de columnas del
-- Excel/CSV real de Tango ("Estado de cuenta total").
--
-- C.8 (reconciliación): cuando la gestora marca una factura "Cobrada
-- (pendiente Tango)" y una importación posterior NO la confirma (sigue con
-- saldo > 0), hay que avisarle sin borrar la marca — el pago puede estar en
-- camino. Se necesita distinguir "recién marcada, todavía no pasó ninguna
-- importación" de "ya pasó una importación y Tango no la confirmó", así que
-- no alcanza con derivar la alerta en vivo de estado+saldo (una marca
-- fresca también tendría saldo>0 sin que eso sea todavía una alerta).

BEGIN;

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS alerta_tango_no_confirmo boolean NOT NULL DEFAULT false;

COMMIT;

-- ===== v050_crm_leads_flujo_v1.sql =====
-- v050_crm_leads_flujo_v1.sql
-- DELTA_crm_flujo_leads_v1 (30 julio 2026). La tabla 'leads' ya existía en
-- producción (creada a mano, 0 filas, nunca conectada — mismo patrón ya
-- visto con 'facturas'/'cobros' en v048) y supaSync('leads', ...) ya se
-- llamaba desde guardarLead() sin que _SM tuviera la entrada — no
-- persistía nada. Se agrega el mapeo (src/shared/supabase.js) y las 2
-- columnas que le faltan para las novedades del delta:
--
-- - cliente_borrador_id: guarda el id del cliente auto-creado en Borrador
--   al ganar el lead (punto 4) — evita duplicar el cliente si el lead
--   vuelve a pasar por la reconciliación de etapa.
-- - motivo_perdida: espejo del motivo de pérdida más reciente a nivel
--   lead (mismo criterio que "valor" — el detalle completo vive en las
--   acciones, esto es solo para no recorrer todo el historial en listas).

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cliente_borrador_id bigint,
  ADD COLUMN IF NOT EXISTS motivo_perdida       text;

COMMIT;

-- ===== v051_gestion_cobranzas_v1.sql =====
-- v051_gestion_cobranzas_v1.sql
-- DELTA_comercial_gestion_cobranzas_v1 (30 julio 2026). Principio rector:
-- la gestora no cobra facturas, cobra clientes — la gestión de cobro
-- (llamada, mail, etc.) se registra una vez por conversación y aplica por
-- defecto a TODAS las facturas pendientes del cliente. Antes vivía
-- repetida en cada factura (facturas.acciones); pasa a vivir en el
-- cliente, con ciclo de vida propio (Pendiente → Realizada/Vencida) que
-- antes no existía (el formulario nacía y moría en un solo paso).

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS gestiones_cobro jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;

-- ===== v052_gestion_precios_v1.sql =====
-- v052_gestion_precios_v1.sql
-- DELTA_comercial_gestion_precios_v1 (30/07/2026). El módulo se rehace de
-- punta a punta (decisión A.11 tomada con el usuario: sin datos reales que
-- migrar, es el momento más barato para cambiar el modelo). La tabla
-- 'propuestas_precios' ya existía en producción (creada a mano, 0 filas,
-- mismo patrón "no conectada" ya visto en v048/v049/v050/v051) con el
-- modelo VIEJO (un % y una fecha sueltos). Se altera para el modelo nuevo:
-- una propuesta con uno o más tramos (jsonb), dirección aumento/rebaja, y
-- el circuito Secuencia A (dos intervenciones del gerente).
--
-- valor_propuesto/valor_hora_propuesto estaban tipadas "text" (probable
-- resabio de una carga a mano) — se amplían a numeric, que es lo que
-- realmente vamos a mandar.

BEGIN;

-- Guardado contra "text" (18/08/2026): en una base nueva, creada por
-- introspección del esquema YA MIGRADO de producción, esta columna nace
-- numeric directamente — el USING NULLIF(col,'')::numeric de abajo
-- comparaba un numeric contra el literal '' y explotaba al resolver el
-- tipo (''::numeric no es válido), aunque no hubiera ni una fila. Se hace
-- condicional: solo convierte si todavía está en el estado viejo (text).
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='propuestas_precios' AND column_name='valor_propuesto') = 'text' THEN
    ALTER TABLE public.propuestas_precios
      ALTER COLUMN valor_propuesto DROP DEFAULT,
      ALTER COLUMN valor_hora_propuesto DROP DEFAULT,
      ALTER COLUMN valor_propuesto TYPE numeric USING NULLIF(valor_propuesto,'')::numeric,
      ALTER COLUMN valor_hora_propuesto TYPE numeric USING NULLIF(valor_hora_propuesto,'')::numeric,
      ALTER COLUMN valor_propuesto SET DEFAULT 0,
      ALTER COLUMN valor_hora_propuesto SET DEFAULT 0;
  END IF;
END $$;

ALTER TABLE public.propuestas_precios
  ADD COLUMN IF NOT EXISTS objetivo_id            bigint,
  ADD COLUMN IF NOT EXISTS cliente_id              bigint,
  ADD COLUMN IF NOT EXISTS tipo_modificacion       text NOT NULL DEFAULT 'Aumento',
  ADD COLUMN IF NOT EXISTS motivo                  text,
  ADD COLUMN IF NOT EXISTS niveles                 jsonb,
  ADD COLUMN IF NOT EXISTS tipo_convalidar         text,
  ADD COLUMN IF NOT EXISTS tramos                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS autorizada_por          text,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion      text,
  ADD COLUMN IF NOT EXISTS confirmada_por          text,
  ADD COLUMN IF NOT EXISTS fecha_confirmacion      text,
  ADD COLUMN IF NOT EXISTS motivo_rechazo_gerente  text,
  ADD COLUMN IF NOT EXISTS motivo_rechazo_cliente  text,
  ADD COLUMN IF NOT EXISTS lote_id                 text,
  ADD COLUMN IF NOT EXISTS propuesta_anterior_id   bigint,
  ADD COLUMN IF NOT EXISTS cargado_por             text;

CREATE INDEX IF NOT EXISTS idx_propuestas_precios_lote ON public.propuestas_precios(lote_id);
CREATE INDEX IF NOT EXISTS idx_propuestas_precios_objetivo ON public.propuestas_precios(objetivo_id);

COMMIT;

-- ===== v053_servicios_tipo_de_sitio.sql =====
-- v053_servicios_tipo_de_sitio.sql
-- DELTA_servicios_tipo_de_sitio_v1 (31/07/2026). Agrega "Tipo de sitio"
-- (el TIPO DE LUGAR: Supermercado, Centro logístico, Oficina...) como
-- campo propio del objetivo, distinto de "Tipo de servicio" (la TAREA:
-- Limpieza, Mantenimiento). El catálogo parametrizable (DB.tiposSitio)
-- sigue el mismo patrón no-persistido que DB.tiposCliente — sólo el
-- valor por objetivo se guarda acá. 'objetivos' es una tabla real con
-- datos en uso, así que el cambio es puramente aditivo.

BEGIN;

ALTER TABLE public.objetivos ADD COLUMN IF NOT EXISTS tipo_sitio text;

COMMIT;

-- ===== v054_comisiones_v1.sql =====
-- v054_comisiones_v1.sql
-- DELTA_comisiones_v1 (30/07/2026). Módulo NUEVO: cuenta corriente de
-- comisiones por persona (interna de Legajos o externa) que trae ventas.
--
-- La ASIGNACIÓN de quién cobra comisión en cada servicio vive dentro del
-- propio objetivo (jsonb, igual que puestos/responsables/adjuntos) —
-- 'objetivos' es una tabla real con datos en uso, así que el cambio es
-- puramente aditivo (ADD COLUMN IF NOT EXISTS).
--
-- Tres tablas nuevas, ninguna existía antes (a diferencia de facturas/
-- cobros/leads/propuestas_precios en deltas anteriores, que ya estaban
-- creadas a mano en producción):
--   comisiones_externos — mini-registro de personas que no están en Legajos.
--   comisiones_devengos — libro mayor: una fila por factura×comisión,
--     con su ciclo de vida Devengada → Disponible → Pagada.
--   comisiones_pagos — historial de pagos a cada persona, con el detalle
--     de a qué devengos se aplicó cada pago (trazabilidad, tanto en modo
--     FIFO automático como en modo manual/avanzado).

BEGIN;

ALTER TABLE public.objetivos ADD COLUMN IF NOT EXISTS comisiones jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.comisiones_externos (
  id           bigint generated always as identity primary key,
  id_local     text UNIQUE NOT NULL,
  nombre       text NOT NULL,
  dni          text,
  tel          text,
  mail         text,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comisiones_devengos (
  id                 bigint generated always as identity primary key,
  id_local           text UNIQUE NOT NULL,
  comision_id        bigint,
  objetivo_id        bigint,
  objetivo_cod       text,
  objetivo_nombre    text,
  cliente_id         bigint,
  cliente_nombre     text,
  persona_tipo       text,
  persona_ref        text,
  persona_nombre     text,
  factura_id         bigint,
  nro_factura        text,
  periodo            text,
  monto_base         numeric DEFAULT 0,
  pct                numeric DEFAULT 0,
  monto_comision     numeric DEFAULT 0,
  estado             text NOT NULL DEFAULT 'Devengada',
  fecha_devengo      text,
  fecha_disponible   text,
  fecha_pago         text,
  monto_pagado       numeric DEFAULT 0,
  saldo              numeric DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comisiones_devengos_persona ON public.comisiones_devengos(persona_tipo, persona_ref);
CREATE INDEX IF NOT EXISTS idx_comisiones_devengos_factura ON public.comisiones_devengos(factura_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_devengos_comision ON public.comisiones_devengos(comision_id);

CREATE TABLE IF NOT EXISTS public.comisiones_pagos (
  id                 bigint generated always as identity primary key,
  id_local           text UNIQUE NOT NULL,
  persona_tipo       text,
  persona_ref        text,
  persona_nombre     text,
  monto              numeric DEFAULT 0,
  fecha              text,
  referencia         text,
  modo               text NOT NULL DEFAULT 'FIFO',
  aplicaciones       jsonb NOT NULL DEFAULT '[]'::jsonb,
  registrado_por     text,
  registrado_en      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_persona ON public.comisiones_pagos(persona_tipo, persona_ref);

COMMIT;

-- ===== v055_candidatos_disponibilidad_horaria.sql =====
-- v055_candidatos_disponibilidad_horaria.sql
-- Ticket RRHH (04/08/2026): nuevo campo "Disponibilidad horaria" en
-- Candidatos, a la par de ampliar "Zona de residencia" (CABA/Zona Norte/
-- Zona Sur/Zona Oeste) — la zona no necesita migración, ya vivía como
-- texto libre en candidatos.zona; solo cambia el catálogo de opciones
-- en el frontend (DB.zonas). Disponibilidad horaria sí es una columna
-- nueva. 'candidatos' es una tabla real y activa, cambio puramente
-- aditivo.

BEGIN;

ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS disponibilidad_horaria text;

COMMIT;

-- ===== v056_libreta_sanitaria_emision.sql =====
-- v056_libreta_sanitaria_emision.sql
-- Ticket Sistemas: automatizar el vencimiento de la libreta sanitaria igual
-- que antecedentes (fecha del certificado + N meses). Antecedentes ya tenía
-- antec_fecha para disparar el cálculo; libreta_sanitaria no tenía una
-- "fecha de emisión" propia — solo el vencimiento se cargaba a mano. Se
-- agrega libreta_emision (análoga a antec_fecha) para que el frontend
-- calcule libreta_vencimiento = libreta_emision + 1 año, igual que
-- recalcularVencAntec() hace con antec_vencimiento = antec_fecha + 6 meses.
-- 'documentacion_ingreso' es una tabla real y activa, cambio puramente
-- aditivo.

BEGIN;

ALTER TABLE public.documentacion_ingreso ADD COLUMN IF NOT EXISTS libreta_emision date;

COMMIT;

-- ===== v057_libreta_zona_en_desuso.sql =====
-- v057_libreta_zona_en_desuso.sql
-- Ticket Sistemas: se sacó el campo "Zona" de la Libreta sanitaria — vale
-- para toda la Provincia de Buenos Aires, no tiene sentido asociarla a una
-- zona. El código (documentacion.js + mapeo camel/snake en supabase.js) ya
-- no lee ni escribe documentacion_ingreso.libreta_zona.
--
-- A pedido, NO se dropea la columna acá — puede tener datos históricos y
-- se decide en otra migración si se elimina formalmente. Esto solo deja
-- un COMMENT ON COLUMN documentando el desuso (visible en Supabase
-- Studio / \d+ documentacion_ingreso), no es un cambio de esquema.

BEGIN;

COMMENT ON COLUMN public.documentacion_ingreso.libreta_zona IS
  'EN DESUSO desde 2026-08 — el código ya no lee/escribe este campo (la libreta sanitaria vale para toda la Pcia. de Buenos Aires). Columna conservada por datos históricos; no dropear sin migración explícita.';

COMMIT;

-- ===== v058_legajos_partido_codigo_postal.sql =====
-- v058_legajos_partido_codigo_postal.sql
-- Ticket Sistemas: en la carga de Altas se separa "Localidad" (el select
-- existente, que en realidad ya usaba una lista de partidos — ver comentario
-- en candidatos.js sobre LOCALIDADES_BA) de un nuevo campo "Partido"
-- independiente, y se agrega "Código Postal". Ambos campos nuevos, de texto
-- libre, sin tocar el select de Localidad existente. 'legajos' es una tabla
-- real y activa, cambio puramente aditivo.

BEGIN;

ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS partido text;
ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS codigo_postal text;

COMMIT;

-- ===== v059_legajos_polizas_obra_social.sql =====
-- v059_legajos_polizas_obra_social.sql
-- Ticket Sistemas: un asociado puede tener varias pólizas (antes era un
-- único campo "ART" / columna art) — se guardan como jsonb, mismo patrón
-- ya usado en legajos para listas/estructuras repetidas (adjuntos_legal,
-- adjuntos_medico, historial_movimientos, talles_uniforme son todas jsonb
-- en esta tabla). También se agrega la fecha de inicio de trámite de obra
-- social (auto = ingreso + 3 meses, editable). Tipo text para esta última,
-- coherente con el resto de los campos tipo fecha de legajos (fec_nac,
-- ingreso, fecha_baja, fecha_ingreso_prueba son todos text, no date nativo
-- — confirmado contra el esquema real, ver CLAUDE.md sobre schema drift).
--
-- La columna art NO se dropea (compatibilidad con legajos existentes que
-- ya la tienen cargada) — las altas nuevas dejan de escribirla, usan
-- "polizas" en su lugar. 'legajos' es una tabla real y activa, cambio
-- puramente aditivo.

BEGIN;

ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS polizas jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS obra_social_inicio_tramite text;

COMMENT ON COLUMN public.legajos.art IS
  'Reemplazada por polizas (jsonb, múltiples pólizas con número + vencimiento) desde 2026-08. Se conserva por compatibilidad con legajos existentes; las altas nuevas ya no la completan.';

COMMIT;

-- ===== v060_candidatos_partido.sql =====
-- v060_candidatos_partido.sql
-- Dataset de Partido → Localidad pasado por RRHH (05/08/2026) para el
-- selector en cascada de "Zona de residencia" en Candidatos. Antes el
-- select "Localidad" mostraba directamente la lista de partidos (sin
-- desglose real) — ahora primero se elige Partido y recién eso habilita
-- Localidad con las localidades reales de ese partido. candidatos.localidad
-- ya existía (v002); esta migración solo agrega la columna nueva "partido".
-- 'candidatos' es una tabla real y activa, cambio puramente aditivo.

BEGIN;

ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS partido text;

COMMIT;

-- ===== v061_candidatos_backfill_partido.sql =====
-- v061_candidatos_backfill_partido.sql
-- Ticket "Localidad / Partido": backfill de candidatos ya cargados antes
-- del selector en cascada Partido→Localidad (v060). El select viejo
-- guardaba el nombre del PARTIDO en la columna localidad (bajo el label
-- "Localidad", mal etiquetado — ver PARTIDOS_LOCALIDADES en state.js).
-- Mueve ese valor a la columna partido (no se pierde información) y
-- limpia localidad (tenía un dato incorrecto — un partido, no una
-- localidad real) solo para las filas donde matchea exactamente uno de
-- los 41 partidos conocidos y partido todavía está vacío. No toca
-- candidatos que ya tengan partido cargado (los dados de alta después
-- de v060) ni candidatos con localidad = CABA (barrios, sin partido).

BEGIN;

UPDATE public.candidatos
SET partido = localidad,
    localidad = NULL
WHERE partido IS NULL
  AND localidad IN (
    'Almirante Brown','Avellaneda','Berazategui','Berisso','Brandsen','Campana','Cañuelas',
    'Ensenada','Escobar','Esteban Echeverría','Exaltación de la Cruz','Ezeiza','Florencio Varela',
    'General Las Heras','General Rodríguez','General San Martín','Hurlingham','Ituzaingó',
    'José C. Paz','La Matanza','La Plata','Lanús','Lomas de Zamora','Luján','Marcos Paz',
    'Malvinas Argentinas','Mercedes','Merlo','Moreno','Morón','Pilar','Presidente Perón',
    'Quilmes','San Fernando','San Isidro','San Miguel','San Vicente','Tigre',
    'Tres de Febrero','Vicente López','Zárate'
  );

COMMIT;

-- ===== v062_candidatos_medio_redes_sociales.sql =====
-- v062_candidatos_medio_redes_sociales.sql
-- Ticket "Medio de convocatoria": la opción "Instagram" se reemplaza por
-- "Redes sociales" (más general) en el select del frontend (DB.medios,
-- src/shared/state.js). candidatos.medio es text libre, sin CHECK/enum
-- (v002) — no hace falta migrar esquema, solo backfillear los candidatos
-- ya guardados con el valor viejo para que no quede un valor huérfano
-- que ya no aparece en el dropdown. Es el mismo concepto bajo una
-- etiqueta más amplia, no se pierde información al renombrar.

BEGIN;

UPDATE public.candidatos
SET medio = 'Redes sociales'
WHERE medio = 'Instagram';

COMMIT;

-- ===== v063_candidatos_estado_baja.sql =====
-- v063: nuevos estados de salida para candidatos (ticket "Histórico")
--
-- estado_candidato era un ENUM cerrado de 6 valores (Sin citar, Citado,
-- Entrevistado, Aprobado, Rechazado, Psicotecnico). RRHH necesita distinguir,
-- en la vista Histórico, otros motivos de salida del proceso que no son un
-- rechazo en la entrevista: Baja, Caducado, MT Social, MT con deuda.
--
-- No hay regla automática que derive estos 4 estados — RRHH los elige a mano
-- desde el botón "Dar de baja" (src/modules/candidatos/candidatos.js,
-- abrirBajaCandidatoPorId), el sistema no infiere nada.
--
-- ALTER TYPE ... ADD VALUE puede correr dentro de una transacción desde
-- Postgres 12 siempre que el valor nuevo no se use en la misma transacción
-- (acá sólo se agrega, no se usa) — por eso va envuelto en BEGIN/COMMIT como
-- el resto de las migraciones de este proyecto.

BEGIN;

ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'Baja';
ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'Caducado';
ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'MT Social';
ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'MT con deuda';

COMMIT;

-- ===== v064_candidatos_motivo_baja_estructurado.sql =====
-- v064: motivo de baja estructurado (ticket "Histórico 2")
--
-- candidatos.motivo_rechazo (text, v002) ya existía pero es texto libre sin
-- categoría ni fecha propia — sirve para el detalle/aclaración, no para
-- clasificar ni para mostrar "cuándo" de forma confiable en el listado.
--
-- Se agregan dos columnas nuevas, sólo relevantes cuando estado = 'Baja'
-- (no se usan para Caducado / MT Social / MT con deuda, ver
-- src/modules/candidatos/candidatos.js):
--   - tipo_motivo_baja: categoría elegida por RRHH desde un selector fijo.
--     Va con CHECK en vez de un ENUM nuevo (a diferencia de "estado") porque
--     agregar una opción a futuro es un ALTER TABLE simple, sin el ritual de
--     ALTER TYPE ... ADD VALUE fuera de transacción que tiene un enum.
--   - fecha_baja: fecha del evento (la carga RRHH a mano, puede no ser hoy —
--     mismo criterio que "Fecha de citación", no se restringe a futuro).

BEGIN;

ALTER TABLE candidatos
  ADD COLUMN IF NOT EXISTS tipo_motivo_baja text,
  ADD COLUMN IF NOT EXISTS fecha_baja date;

ALTER TABLE candidatos DROP CONSTRAINT IF EXISTS candidatos_tipo_motivo_baja_check;
ALTER TABLE candidatos
  ADD CONSTRAINT candidatos_tipo_motivo_baja_check
  CHECK (tipo_motivo_baja IS NULL OR tipo_motivo_baja IN (
    'Consiguió trabajo',
    'Rechazó propuesta',
    'No se presentó a instancia del proceso',
    'Otro'
  ));

COMMIT;

-- ===== v065_adjuntos_entrevista_candidatos.sql =====
-- v065: adjunto PDF de entrevista en Candidatos (ticket "Adjunto")
--
-- Reutiliza la tabla `adjuntos` + bucket privado `ohlimpia-adjuntos` que ya
-- usan Psicotécnico/Preocupacional/Documentación/Alta (src/shared/adjuntos.js)
-- — no hace falta bucket, tabla ni columna nueva en `candidatos`. Solo hay
-- que sumar los 2 valores nuevos a los CHECK constraints existentes:
--   - etapa: 'candidatos' (no estaba, el flujo de selección todavía no
--     adjuntaba nada en esta etapa).
--   - tipo: 'entrevista' (PDF de la entrevista).
--
-- Los CHECK ya fueron extendidos varias veces desde que se creó la tabla en
-- v011 (uniformes, sanciones, certificado-capacitacion, etc.) — este script
-- toma el estado ACTUAL de ambos constraints (verificado en vivo contra la
-- base) para no pisar ningún valor agregado después de v011.

BEGIN;

ALTER TABLE adjuntos DROP CONSTRAINT adjuntos_etapa_check;
ALTER TABLE adjuntos ADD CONSTRAINT adjuntos_etapa_check CHECK (etapa = ANY (ARRAY[
  'psicotecnico'::text,
  'preocupacional'::text,
  'documentacion'::text,
  'alta'::text,
  'uniformes'::text,
  'sanciones'::text,
  'candidatos'::text
]));

ALTER TABLE adjuntos DROP CONSTRAINT adjuntos_tipo_check;
ALTER TABLE adjuntos ADD CONSTRAINT adjuntos_tipo_check CHECK (tipo = ANY (ARRAY[
  'informe-psico'::text,
  'apto-medico'::text,
  'no-apto'::text,
  'antecedente'::text,
  'libreta'::text,
  'curso'::text,
  'dni-frente'::text,
  'dni-dorso'::text,
  'foto-rostro'::text,
  'monotributo'::text,
  'inaes'::text,
  'certificado-capacitacion'::text,
  'constancia-uniforme'::text,
  'denuncia-policial-uniforme'::text,
  'evidencia-sancion'::text,
  'descargo-sancion'::text,
  'entrevista'::text
]));

COMMIT;

-- ===== v066_adjuntos_poliza_seguro_alta.sql =====
-- v066: adjunto PDF de la póliza de seguro en Altas de asociados (ticket "Póliza")
--
-- Reutiliza el bucket privado ohlimpia-adjuntos + tabla adjuntos que ya usan
-- Candidatos/Psicotécnico/Preocupacional/Documentación/Alta
-- (src/shared/adjuntos.js) — la etapa 'alta' ya estaba habilitada en el
-- CHECK (dni-frente, dni-dorso, foto-rostro, monotributo, inaes), así que
-- solo hace falta sumar el tipo nuevo 'poliza-seguro'.
--
-- No se agrega ninguna columna a `legajos` ni a `candidatos`: el archivo
-- vive en `adjuntos`, indexado por DNI (igual que el resto de los
-- documentos del sistema) — se recupera con
-- listarAdjuntos({ dni, etapa: 'alta', tipo: 'poliza-seguro' }) desde
-- cualquier parte del flujo, sin acoplar el legajo al storage.
--
-- Se toma el estado ACTUAL del constraint (verificado en vivo contra la
-- base, extendido varias veces desde v011) para no pisar valores agregados
-- después de la creación de la tabla.

BEGIN;

ALTER TABLE adjuntos DROP CONSTRAINT adjuntos_tipo_check;
ALTER TABLE adjuntos ADD CONSTRAINT adjuntos_tipo_check CHECK (tipo = ANY (ARRAY[
  'informe-psico'::text,
  'apto-medico'::text,
  'no-apto'::text,
  'antecedente'::text,
  'libreta'::text,
  'curso'::text,
  'dni-frente'::text,
  'dni-dorso'::text,
  'foto-rostro'::text,
  'monotributo'::text,
  'inaes'::text,
  'certificado-capacitacion'::text,
  'constancia-uniforme'::text,
  'denuncia-policial-uniforme'::text,
  'evidencia-sancion'::text,
  'descargo-sancion'::text,
  'entrevista'::text,
  'poliza-seguro'::text
]));

COMMIT;

-- ===== v067_servicios_supervisor.sql =====
-- v067: tabla servicios_supervisor (código de servicio → supervisor asignado)
--
-- Reemplaza al mapeo hardcodeado SERVICIO_SUPERVISOR (state.js, agregado
-- unas horas antes en esta misma sesión) por una tabla real editable desde
-- la pantalla — Fede pidió poder ver/cargar más fácil la lista de códigos
-- activos y tener import/export CSV para el futuro, en vez de que quede
-- fija en el código fuente. Distinta de `objetivos` (Comercial → Servicios,
-- que exige cliente/precio/contrato real) — esta es la lista puente
-- liviana (código + supervisor) que ya usan Altas/Reasignaciones para
-- autocompletar, ahora persistida y editable en vivo.
--
-- Semilla: los 157 códigos de la planilla "Selección y Reubicaciones" de
-- RRHH (08/2026), mismos datos que ya estaban en SERVICIO_SUPERVISOR.

BEGIN;

CREATE TABLE IF NOT EXISTS servicios_supervisor (
  id bigserial PRIMARY KEY,
  id_local text UNIQUE,
  codigo text NOT NULL UNIQUE,
  supervisor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_servicios_supervisor ON public.servicios_supervisor;
CREATE TRIGGER set_updated_at_servicios_supervisor
  BEFORE UPDATE ON public.servicios_supervisor
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE servicios_supervisor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total servicios_supervisor" ON servicios_supervisor;
CREATE POLICY "Acceso total servicios_supervisor"
  ON servicios_supervisor
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE servicios_supervisor IS
  'Código de servicio (puente, sin objetivo comercial formal todavía) → supervisor asignado. Fuente para autocompletar supervisor en Altas/Reasignaciones cuando el código no tiene un objetivo real en la tabla objetivos.';

-- (omitido a propósito para CLEAN PAZ: son los 157 servicios reales de
-- Ohlimpia con su supervisor asignado, no aplica a otra empresa. Clean
-- Paz carga su propio catálogo desde el módulo correspondiente.)
-- INSERT INTO servicios_supervisor (id_local, codigo, supervisor) VALUES
--   ('000000001', 'AGENCIA.FIBRA', 'Dario Lage'),
--   ('000000002', 'AMERICAN.LOGISTIC', 'Dario Lage'),
--   ('000000003', 'CLUB.VASCO', 'Maximiliano Poncino'),
--   ('000000004', 'BILLINGHURST.2048', 'Richard Recalde'),
--   ('000000005', 'CIBRA', 'Alejandro Cacciato'),
--   ('000000006', 'LIBERTADOR.260', 'Alejandro Cacciato'),
--   ('000000007', 'BOULOGNE.662', 'Matias Maidana'),
--   ('000000008', 'E.LAMARCA.1679', 'Matias Maidana'),
--   ('000000009', 'LMC.46', 'Fabio Benvenuto'),
--   ('000000010', 'MAURE.1560', 'Alfredo Arispe'),
--   ('000000011', 'OHIGGINS.1949', 'Santiago Ayala'),
--   ('000000012', 'PALPA.2426', 'Fabio Benvenuto'),
--   ('000000013', 'SALGUERO.2124', 'Fabio Benvenuto'),
--   ('000000014', 'DISTR.VR', 'Fabio Benvenuto'),
--   ('000000015', 'EMBA.CABILDO', 'Fabio Benvenuto'),
--   ('000000016', 'EMBA.PAMPA', 'Fabio Benvenuto'),
--   ('000000017', 'EMBA.PAMPA2', 'Fabio Benvenuto'),
--   ('000000018', 'EMBA.CIUDAD', 'Fabio Benvenuto'),
--   ('000000019', 'ZAPIOLA.GALERIA', 'Fabio Benvenuto'),
--   ('000000020', 'GESNEXT', 'Claudio Gonzalez'),
--   ('000000021', 'HIGHFLOW', 'Dario Lage'),
--   ('000000022', 'HIT.LIBERTADOR.CEL', 'Alvaro Uballes'),
--   ('000000023', 'HIT.LIBERTADOR.8614', 'Alvaro Uballes'),
--   ('000000024', 'LIBERTADOR.6343', 'Alvaro Uballes'),
--   ('000000025', 'HIT.LMC.877', 'Alejandro Cacciato'),
--   ('000000026', 'MIGUELETES.2423', 'Alejandro Cacciato'),
--   ('000000027', 'ALTO.MOLINO', 'Alejandro Cacciato'),
--   ('000000028', 'PAMPA.1391', 'Alvaro Uballes'),
--   ('000000029', 'HIT.MAIPU', 'Alvaro Uballes'),
--   ('000000030', 'HIT.TECNO', 'Claudio Gonzalez'),
--   ('000000031', 'HIT.CHICLANA.3345', 'Claudio Gonzalez'),
--   ('000000032', 'HIT.UGARTE.2110', 'Alejandro Cacciato'),
--   ('000000033', 'IUTRACE.SAS', 'Dario Lage'),
--   ('000000034', 'JOSIMAR.AVELLANEDA', 'Matias Maidana'),
--   ('000000035', 'JOSIMAR.CENTRO.DISTR', 'Matias Maidana'),
--   ('000000036', 'JOSIMAR.LANUS', 'Matias Maidana'),
--   ('000000037', 'JOSIMAR.LOMAS', 'Matias Maidana'),
--   ('000000038', 'JOSIMAR.MTE.GRANDE', 'Matias Maidana'),
--   ('000000039', 'JOSIMAR.BARRACAS', 'Matias Maidana'),
--   ('000000040', 'JOSIMAR.QUILMES', 'Matias Maidana'),
--   ('000000041', 'LOS.PINOS', 'Alejandro Cacciato'),
--   ('000000042', 'OFFICE.PARK', 'Alejandro Cacciato'),
--   ('000000043', 'ROCAMORA', 'Matias Maidana'),
--   ('000000044', 'SAN.ANTONIO', 'Matias Maidana'),
--   ('000000045', 'REYLAT', 'Claudio Gonzalez'),
--   ('000000046', 'GYM.CONGRESO', 'Alvaro Uballes'),
--   ('000000047', 'GYM.DEVOTO', 'Alvaro Uballes'),
--   ('000000048', 'GYM.CAÑITAS', 'Alvaro Uballes'),
--   ('000000049', 'GYM.PERON', 'Alvaro Uballes'),
--   ('000000050', 'GYM.RECOLETA', 'Alvaro Uballes'),
--   ('000000051', 'TECTOOLS', 'Patricia Scaglia'),
--   ('000000052', 'TSOFT.CHICLANA', 'Claudio Gonzalez'),
--   ('000000053', 'UML', 'Matias Maidana'),
--   ('000000054', 'JOSIMAR. BANFIELD', 'Matias Maidana'),
--   ('000000055', 'HIT.POLO', 'Alvaro Uballes'),
--   ('000000056', 'HIT.ALPARGATAS', 'Claudio Gonzalez'),
--   ('000000057', 'NATIONAL.SHIPPING', 'Alvaro Uballes'),
--   ('000000058', 'HOSPITAL.CAMPANA', 'Claudia Cazenave'),
--   ('000000059', 'MAURE.1601', 'Fabio Benvenuto'),
--   ('000000060', 'GYM.CABALLITO', 'Alvaro Uballes'),
--   ('000000061', 'INDICOM', 'Fabio Benvenuto'),
--   ('000000062', 'CONS.DELGADO', 'Claudia Cazenave'),
--   ('000000063', 'ASCENSORES', 'Alfredo Arispe'),
--   ('000000064', 'SKYGLASS', 'Alejandro Cacciato'),
--   ('000000065', 'ALSINA.1609', 'Alejandro Cacciato'),
--   ('000000066', 'LORETO.1510', 'Alvaro Uballes'),
--   ('000000067', 'ARCOS', 'Sandra Luna'),
--   ('000000068', 'CAZADORES', 'Alejandro Cacciato'),
--   ('000000069', 'HIT.VILO', 'Dario Lage'),
--   ('000000070', 'IOMA', 'Claudia Cazenave'),
--   ('000000071', 'ZUG.VERDI', 'Alejandro Cacciato'),
--   ('000000072', 'ZUG.CAAMAÑO', 'Alejandro Cacciato'),
--   ('000000073', 'LINCE', 'Claudia Cazenave'),
--   ('000000074', 'EVERNEX', 'Claudio Gonzalez'),
--   ('000000075', 'MACSTATION', 'Claudia Cazenave'),
--   ('000000076', 'HIT.ARGUIBEL', 'Alvaro Uballes'),
--   ('000000077', 'GYM.NUÑEZ', 'Alvaro Uballes'),
--   ('000000078', 'ELDAR', 'Claudio Gonzalez'),
--   ('000000079', 'HIT.GIGENA', 'Alfredo Arispe'),
--   ('000000080', 'LOTBA', 'Claudia Cazenave'),
--   ('000000081', 'CONEXA', 'Dario Lage'),
--   ('000000082', 'OTIS', 'Claudio Gonzalez'),
--   ('000000083', 'CONS.JUNCAL', 'Lorena Unzain'),
--   ('000000084', 'BIOSINTESIS', 'Alejandro Cacciato'),
--   ('000000085', 'CAMPANA.JOVEN', 'Claudia Cazenave'),
--   ('000000086', 'CAMPANA.BIBLOTECA', 'Claudia Cazenave'),
--   ('000000087', 'CAMPANA.CORAZONES ABIERTOS', 'Claudia Cazenave'),
--   ('000000088', 'CAMPANA.TEATRO', 'Claudia Cazenave'),
--   ('000000089', 'CHANGO. BROWN', 'Matias Maidana'),
--   ('000000090', 'CHANGO. LA TABLADA', 'Claudio Gonzalez'),
--   ('000000091', 'CHANGO.3 DE FEBRERO', 'Alejandro Cacciato'),
--   ('000000092', 'CHANGO.CASEROS', 'Lorena Unzain'),
--   ('000000093', 'CHANGO.CATAN', 'Lorena Unzain'),
--   ('000000094', 'CHANGO.LAFERRERE', 'Lorena Unzain'),
--   ('000000095', 'CHANGO.MALVARG', 'Alejandro Cacciato'),
--   ('000000096', 'CHANGO.MATADEROS', 'Claudio Gonzalez'),
--   ('000000097', 'CHANGO.MORENO 1', 'Alejandro Cacciato'),
--   ('000000098', 'CHANGO.MORENO 2', 'Alejandro Cacciato'),
--   ('000000099', 'CHANGO.MORENO 3', 'Alejandro Cacciato'),
--   ('000000100', 'CHANGO.MORÓN', 'Lorena Unzain'),
--   ('000000101', 'CAMPANA.RECICLADO', 'Claudia Cazenave'),
--   ('000000102', 'CAMPANA.REFUGIO', 'Claudia Cazenave'),
--   ('000000103', 'CONS.OLLEROS', 'Alvaro Uballes'),
--   ('000000104', 'CHANGO.LANUS', 'Matias Maidana'),
--   ('000000105', 'CHANGO.CAMPANA', 'Claudia Cazenave'),
--   ('000000106', 'CAMPANA.ELECTROMECANICA', 'Claudia Cazenave'),
--   ('000000107', 'CAMPANA.RIOLUJAN', 'Claudia Cazenave'),
--   ('000000108', 'CAMPANA.CORRALON', 'Claudia Cazenave'),
--   ('000000109', 'CAMPANA.CIMOPU', 'Claudia Cazenave'),
--   ('000000110', 'CAMPANA.DIGITAL', 'Claudia Cazenave'),
--   ('000000111', 'CAMPANA.CBC', 'Claudia Cazenave'),
--   ('000000112', 'JOSIMAR.BERAZATEGUI', 'Matias Maidana'),
--   ('000000113', 'GYM.BCHINO', 'Alvaro Uballes'),
--   ('000000114', 'GYM.FLORES', 'Alvaro Uballes'),
--   ('000000115', 'CHANGO.PILAR', 'Alejandro Cacciato'),
--   ('000000116', 'CHANGO.SANJUSTO', 'Claudio Gonzalez'),
--   ('000000117', 'CHANGO.QUILMES', 'Matias Maidana'),
--   ('000000118', 'CHANGO.SARANDI', 'Claudio Gonzalez'),
--   ('000000119', 'CHANGO.AVELLANEDA', 'Claudio Gonzalez'),
--   ('000000120', 'GYM.VCRESPO', 'Alvaro Uballes'),
--   ('000000121', 'UNIVERSAL.MUSIC', 'Alvaro Uballes'),
--   ('000000122', 'GYM.BALVANERA', 'Alvaro Uballes'),
--   ('000000123', 'UPGAMING', 'Claudio Gonzalez'),
--   ('000000124', 'CONS.CHICLANA', 'Claudio Gonzalez'),
--   ('000000125', 'ADBLICK', 'Alejandro Cacciato'),
--   ('000000126', 'CAMPANA.REGISTRO', 'Claudia Cazenave'),
--   ('000000127', 'CAMPANA.JUZGADO1', 'Claudia Cazenave'),
--   ('000000128', 'CAMPANA.JUZGADO.NIÑEZ', 'Claudia Cazenave'),
--   ('000000129', 'CAMPANA.JUZGADO.FALTAS', 'Claudia Cazenave'),
--   ('000000130', 'GYM.BELGRANO', 'Alvaro Uballes'),
--   ('000000131', 'CAJA.VALORES', 'Claudio Gonzalez'),
--   ('000000132', 'GENOVESA.CENTRAL', 'Matias Maidana'),
--   ('000000133', 'RESIDENCIA.SMART', 'Claudio Gonzalez'),
--   ('000000134', 'CAMPANA.DESARROLLO', 'Claudia Cazenave'),
--   ('000000135', 'CAMPANA.OBISPADO', 'Claudia Cazenave'),
--   ('000000136', 'CAMPANA.CEMENTERIO', 'Claudia Cazenave'),
--   ('000000137', 'CONS.RIVADAVIA', 'Alfredo Arispe'),
--   ('000000138', 'CHANGO.SVICENTE', 'Claudio Gonzalez'),
--   ('000000139', 'CHANGO.CLAYPOLE', 'Matias Maidana'),
--   ('000000140', 'HURLINGHAM.VILLEGAS', 'Alejandro Cacciato'),
--   ('000000141', 'CHANGO.TIGRE', 'Alejandro Cacciato'),
--   ('000000142', 'CHANGO.LUJAN', 'Dario Lage'),
--   ('000000143', 'CHANGO.TEMPERLEY', 'Matias Maidana'),
--   ('000000144', 'CHANGO.PERGAMINO', 'Lorena Unzain'),
--   ('000000145', 'CHANGO.JUNIN', 'Lorena Unzain'),
--   ('000000146', 'HURLINGHAN.VERGARA', 'Alejandro Cacciato'),
--   ('000000147', 'CHANGO.JOSE C PAZ', 'Alejandro Cacciato'),
--   ('000000148', 'CONS.TERRERO', 'Alfredo Arispe'),
--   ('000000149', 'POTIS', 'Alfredo Arispe'),
--   ('000000150', 'GRUPSA', 'Lorena Unzain'),
--   ('000000151', 'CAPITALHUMANO.AUSTRIA', 'Alfredo Arispe'),
--   ('000000152', 'GYM.CASAMATRIZ', 'Alvaro Uballes'),
--   ('000000153', 'SUPPLYCHAIN', 'Dario Lage'),
--   ('000000154', 'BRIGNONE', 'Alfredo Arispe'),
--   ('000000155', 'DONADO', 'Patricia Scaglia'),
--   ('000000156', 'HIT.PAMPA.OBRA', 'Dario Lage'),
--   ('000000157', 'DADONE.MIGUELETES', 'Alejandro Cacciato');

COMMIT;

-- ===== v068_legajos_alta_obra_social.sql =====
-- v068: checklist de alta de obra social (ticket "Obra social" — Legajos)
--
-- legajos ya tenía obra_social (nombre de la obra social) y
-- obra_social_inicio_tramite (fecha calculada — ver recalcularInicioObraSocial()
-- en altas.js, ingreso + 3 meses) desde el ticket de pólizas de esta misma
-- semana. Lo que faltaba es el registro de que RRHH efectivamente hizo el
-- trámite de alta: un booleano + cuándo se marcó, para el checkbox
-- interactivo del listado de Legajos.

BEGIN;

ALTER TABLE legajos
  ADD COLUMN IF NOT EXISTS alta_obra_social boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alta_obra_social_fecha timestamptz;

COMMENT ON COLUMN legajos.alta_obra_social IS
  'true cuando RRHH marcó que ya se tramitó el alta de obra social del asociado (checkbox en el listado de Legajos). No confundir con obra_social_inicio_tramite, que es la fecha calculada en la que RECIÉN SE PUEDE hacer el trámite (ingreso + 3 meses).';
COMMENT ON COLUMN legajos.alta_obra_social_fecha IS
  'Marca de tiempo de cuándo se tildó alta_obra_social. Se limpia si se destilda.';

COMMIT;

-- ===== v069_documentacion_talles_uniforme.sql =====
-- v069: talles de uniforme en Documentación de ingreso (ticket "Uniforme")
--
-- Permite cargar el uniforme (ambo, calzado, chomba, grafa/pantalón, buzo,
-- campera, gorra) durante la etapa de Documentación de ingreso, antes de
-- que exista el legajo — se guarda acá y se copia a
-- cat_alt_pendientes.uniforme (ya jsonb, sin cambios) al aprobar, y de ahí
-- a legajos.talles_uniforme al confirmar el alta. Mismo formato (jsonb,
-- claves en minúscula por prenda) que legajos.talles_uniforme, para poder
-- copiarlo tal cual entre las 3 tablas sin transformar nada.

BEGIN;

ALTER TABLE documentacion_ingreso
  ADD COLUMN IF NOT EXISTS talles_uniforme jsonb;

COMMENT ON COLUMN documentacion_ingreso.talles_uniforme IS
  'Talles de uniforme cargados en esta etapa (ambo/calzado van en sus propias columnas de legajos más adelante; acá se guardan junto con chomba/grafa/buzo/campera/gorra bajo una sola clave jsonb). Se copia a cat_alt_pendientes.uniforme al aprobar y de ahí a legajos.talles_uniforme al confirmar el alta.';

COMMIT;

-- ===== v070_clientes_campos_faltantes.sql =====
-- v070 — Agrega a `clientes` las columnas que el modal de Comercial
-- (guardarCliente() en legacy.js) ya intenta guardar hoy pero que nunca
-- se crearon en la tabla: tipo, iva, arca, forma_pago, ciudad, logo.
-- Como supaSync() manda el objeto completo sin filtrar por columnas
-- reales, cualquier alta/edición de cliente real con esos campos
-- completos iba a fallar contra Supabase (columna inexistente) — bug
-- latente nunca disparado porque `clientes` está vacía en producción
-- (0 filas) hasta el import de Servicios/Comercial (ticket 08/2026).
-- Todas nullable, additivo, no rompe nada existente.
BEGIN;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS iva text,
  ADD COLUMN IF NOT EXISTS arca text,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS logo text;

COMMIT;

-- ===== v071_stock_uniformes.sql =====
-- v071 — Stock de uniformes (ticket "Módulo Logística" 08/2026, fase 2:
-- Stock). El circuito de pedidos, precios de venta/descuento y
-- devoluciones YA existían (ver v067 en adelante para otras tablas de
-- uniformes) — esto agrega el control de stock físico que faltaba,
-- reemplazando el ítem "Próximamente" del menú.
--
-- 4 tablas:
-- - stock_uniformes: nivel actual (lógico) por prenda+talle.
-- - stock_uniformes_movimientos: ledger de entradas/salidas/ajustes —
--   auditoría completa y base para la futura Previsión de compras
--   (consumo histórico).
-- - compras_uniformes: lote de compra a proveedor (costo real pagado —
--   distinto de precios_uniformes, que es lo que se le cobra al
--   operario por pérdida/daño, no lo que la cooperativa pagó).
-- - stock_conteos_uniformes: conteo físico periódico del depósito,
--   comparado contra el stock lógico en ese momento.
BEGIN;

CREATE TABLE IF NOT EXISTS stock_uniformes (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  prenda text not null,
  talle text not null,
  cantidad numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS stock_uniformes_movimientos (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  tipo text not null, -- 'entrada' | 'salida' | 'ajuste'
  prenda text not null,
  talle text not null,
  cantidad numeric not null,
  motivo text,
  ref_tipo text, -- 'compra' | 'pedido' | 'conteo'
  ref_id_local text,
  fecha timestamptz default now(),
  registrado_por text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS compras_uniformes (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  fecha date not null,
  proveedor text,
  nro_factura text,
  items jsonb not null default '[]'::jsonb,
  total numeric,
  observaciones text,
  registrado_por text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS stock_conteos_uniformes (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  fecha timestamptz default now(),
  items jsonb not null default '[]'::jsonb,
  observaciones text,
  registrado_por text,
  created_at timestamptz default now()
);

COMMIT;

-- ===== v072_objetivos_puestos_tipo_horario.sql =====
-- v072_objetivos_puestos_tipo_horario.sql
-- Ticket "Selección personal": poder indicar si los horarios del personal
-- asignado a un servicio son rotativos o fijos.
--
-- Decisión de alcance: el campo vive a NIVEL DE PUESTO dentro del jsonb
-- puestos_necesarios (cada objeto de la array ya tiene cantidad/perfil/
-- horarioDesde/horarioHasta/dias/obs). No se agrega columna nueva: un
-- servicio puede tener puestos fijos y rotativos a la vez, y la fuente de
-- verdad de horarios ya es por puesto.
--
-- El campo se llama tipoHorario (camelCase, consistente con el resto de
-- claves del jsonb) y se guarda como texto: 'fijo' | 'rotativo'. La UI
-- asume 'fijo' como default cuando el puesto no trae el campo (retro-
-- compatibilidad con puestos creados antes de esta migración).
--
-- Esta migración solo normaliza los puestos existentes que no tengan el
-- campo (backfill a 'fijo'). Es idempotente: re-correrla no cambia nada.

BEGIN;

UPDATE public.objetivos
SET puestos_necesarios = (
  SELECT jsonb_agg(
    CASE
      WHEN p ? 'tipoHorario' THEN p
      ELSE p || '{"tipoHorario":"fijo"}'::jsonb
    END
  )
  FROM jsonb_array_elements(puestos_necesarios) p
)
WHERE jsonb_array_length(puestos_necesarios) > 0;

COMMIT;

-- ===== v073_perfil_personal_atributos.sql =====
-- =============================================================================
-- Migración: v073 — Perfil del personal en Pedidos de personal
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Pedido de personal — parametrizar el perfil del personal": el
-- modal de pedidos hoy tiene 2 selects de perfil hardcodeados en el HTML
-- (Género y Experiencia, sin id → no se guardan nunca). Se parametriza el
-- perfil que se solicita en cada pedido:
--
--   1. Tabla catálogo `perfil_personal_atributos` — atributos configurables
--      en la base (no hardcodeados en el HTML), cada uno con sus opciones.
--      Por decisión de ticket: solo seed SQL por ahora, sin ABM.
--
--   2. Columna `perfil` jsonb en `pedidos` — array [{codigo, valor}] con los
--      atributos elegidos para ese pedido (patrón puestos_necesarios de
--      v072 / comisiones: upsert por fila, sin tabla de relación).
--      Retrocompatible: default '[]', los pedidos viejos renderizan vacío.
--
--   Los atributos existentes (Zona, Puesto, Horario, Urgencia) quedan como
--   columnas propias de `pedidos` — NO se duplican en el perfil.
--
--   RLS se crea endurecida directo (tabla nueva), mismo patrón que v035.
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla catálogo — perfil_personal_atributos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfil_personal_atributos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  codigo      text NOT NULL UNIQUE,   -- clave interna: 'genero', 'experiencia', ...
  nombre      text NOT NULL,          -- label que se muestra en la UI
  tipo        text NOT NULL DEFAULT 'select',  -- 'select' | 'multi' | 'text'
  opciones    jsonb NOT NULL DEFAULT '[]',     -- array de strings para select/multi
  obligatorio boolean NOT NULL DEFAULT false,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfil_personal_atributos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.perfil_personal_atributos;
CREATE POLICY "Solo usuarios autenticados" ON public.perfil_personal_atributos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- pedidos — columna perfil (array [{codigo, valor}])
-- ============================================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS perfil jsonb NOT NULL DEFAULT '[]';

-- ============================================================
-- Seed — 6 atributos de perfil (los 2 actuales + sugeridos del ticket)
-- ============================================================
INSERT INTO public.perfil_personal_atributos
  (id_local, codigo, nombre, tipo, opciones, obligatorio, orden) VALUES
  ('atr_genero',        'genero',       'Género',                'select',
   '["F/M","Femenino","Masculino"]', false, 10),
  ('atr_experiencia',   'experiencia',  'Experiencia',           'select',
   '["Sin experiencia específica","Con experiencia requerida"]', false, 20),
  ('atr_tipo_tarea',    'tipo_tarea',   'Tipo de tarea',         'select',
   '["Limpieza general","Limpieza profunda","Mantenimiento","Cuidado de espacios"]', false, 30),
  ('atr_turno',         'turno',        'Turno',                 'select',
   '["Mañana","Tarde","Noche","Rotativo"]', false, 40),
  ('atr_certificaciones','certificaciones','Certificaciones',    'multi',
   '["Libreta sanitaria","Curso manipulación de alimentos","Trabajo en altura","Habilitación espacios de salud"]', false, 50),
  ('atr_disponibilidad','disponibilidad','Disponibilidad horaria','select',
   '["Full time","Media jornada","Fines de semana","Solo nocturno"]', false, 60)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v074_adjuntos_documento_proceso.sql =====
-- v074: adjunto PDF del proceso en Candidatos (ticket "Proceso")
--
-- Después de aprobar un candidato, RRHH puede subir el PDF del proceso
-- (contrato, resultado de la evaluación, documentación de la contratación).
-- Reutiliza el bucket privado ohlimpia-adjuntos + tabla adjuntos que ya usan
-- Candidatos/Psicotécnico/Preocupacional/Documentación/Alta
-- (src/shared/adjuntos.js) — la etapa 'candidatos' ya estaba habilitada en
-- el CHECK (v065), así que solo hace falta sumar el tipo nuevo 'proceso'.
--
-- No se agrega ninguna columna a `candidatos`: el archivo vive en `adjuntos`,
-- indexado por DNI (igual que el resto de los documentos del sistema) — se
-- recupera con listarAdjuntos({ dni, etapa: 'candidatos', tipo: 'proceso' }).
--
-- Se toma el estado ACTUAL del constraint (verificado en vivo contra la
-- base, último cambio en v066) para no pisar valores agregados después.

BEGIN;

ALTER TABLE adjuntos DROP CONSTRAINT adjuntos_tipo_check;
ALTER TABLE adjuntos ADD CONSTRAINT adjuntos_tipo_check CHECK (tipo = ANY (ARRAY[
  'informe-psico'::text,
  'apto-medico'::text,
  'no-apto'::text,
  'antecedente'::text,
  'libreta'::text,
  'curso'::text,
  'dni-frente'::text,
  'dni-dorso'::text,
  'foto-rostro'::text,
  'monotributo'::text,
  'inaes'::text,
  'certificado-capacitacion'::text,
  'constancia-uniforme'::text,
  'denuncia-policial-uniforme'::text,
  'evidencia-sancion'::text,
  'descargo-sancion'::text,
  'entrevista'::text,
  'poliza-seguro'::text,
  'proceso'::text
]));

COMMIT;

-- ===== v075_psicos_localidad.sql =====
-- v075 — Filtro por Localidad en Psicotécnico (ticket "Selección
-- personal — filtrar por localidad además de zona").
--
-- psicos no tenía columna localidad (solo zona, una clasificación
-- operativa más gruesa: CABA/Zona Norte/Zona Sur/Zona Oeste). El dato
-- de localidad SÍ existe un paso antes, en candidatos (candidatos.localidad
-- / candidatos.partido, cargados por el importador histórico / Altas) —
-- pero pasarAPsicoPorId() nunca lo copiaba al crear el registro de psico.
--
-- Esta migración agrega las columnas y hace un backfill real (no
-- inventado): cruza los psicos existentes contra candidatos por DNI y
-- copia localidad/partido donde haya match. Si no hay match, queda NULL
-- — no se adivina.
BEGIN;

ALTER TABLE psicos
  ADD COLUMN IF NOT EXISTS localidad text,
  ADD COLUMN IF NOT EXISTS partido text;

UPDATE psicos p
SET localidad = c.localidad, partido = c.partido
FROM candidatos c
WHERE p.dni = c.dni
  AND p.localidad IS NULL
  AND (c.localidad IS NOT NULL AND c.localidad <> '');

COMMIT;

-- ===== v075_turnos_observacion.sql =====
-- v075: columna observacion en turnos (ticket "Calendario")
--
-- Agrega una nota libre (opcional) a cada entrevista agendada en el
-- calendario de Candidatos. La tabla `turnos` no está creada en las
-- migraciones v* (vive desde el monolítico/dashboard), así que este
-- ALTER se ejecuta directo sobre la tabla existente.
--
-- La columna es nullable y sin CHECK: el campo es opcional y no tiene
-- restricciones de contenido. El límite práctico de 300 caracteres se
-- aplica en el textarea del formulario (maxlength), no en la base.

ALTER TABLE turnos ADD COLUMN IF NOT EXISTS observacion text;

-- ===== v076_retenciones_tipificadas.sql =====
-- =============================================================================
-- Migración: v076 — Retenciones: candidatos automáticos, motivo tipificado,
--            monto/porcentaje, auditoría de cierre
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 4 del relevamiento (Lautaro, 10/08). El módulo Retenciones ya
-- migrado (src/modules/retenciones/) cubre el ABM básico (crear/editar/
-- liberar/eliminar, ya con id real, sin los bugs de índice que tenía la
-- versión vieja en legacy.js — esa quedó muerta, sin window bindings).
-- Faltaba:
--   1. Motivo TIPIFICADO parametrizable (antes "motivo" era texto libre).
--   2. Retención por MONTO o PORCENTAJE (antes solo monto fijo).
--   3. Origen del caso (automático desde ART42/Baja/Legales, reporte del
--      supervisor, o carga manual de RRHH) — para poder armar la lista de
--      candidatos automáticos sin re-preguntar algo que el legajo ya sabe.
--   4. Auditoría completa de cierre: quién creó el caso y cuándo (antes
--      solo se guardaba editadoPor/editadoEn en la edición, nunca en el
--      alta), y quién liberó la retención (fechaLiberacion ya existía,
--      liberadoPor no).
--
-- No se toca ninguna columna existente ni se borra nada — estrictamente
-- aditivo, retrocompatible con las retenciones ya guardadas (quedan con
-- estos campos nuevos en null/default).
-- =============================================================================

BEGIN;

ALTER TABLE public.retenciones
  ADD COLUMN IF NOT EXISTS motivo_tipificado text,
  ADD COLUMN IF NOT EXISTS tipo_valor text NOT NULL DEFAULT 'Monto',  -- 'Monto' | 'Porcentaje'
  ADD COLUMN IF NOT EXISTS origen text,          -- 'automatico_art42'|'automatico_baja'|'automatico_legal'|'reporte_supervisor'|'manual'
  ADD COLUMN IF NOT EXISTS creado_por text,
  ADD COLUMN IF NOT EXISTS creado_en timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_por text;

-- ============================================================
-- Catálogo parametrizable — motivos_retencion (tema 4: "lista
-- parametrizable en Configuración: ausencias, abandono, daños,
-- conducta, etc.")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.motivos_retencion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.motivos_retencion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.motivos_retencion;
CREATE POLICY "Solo usuarios autenticados" ON public.motivos_retencion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.motivos_retencion (id_local, nombre, orden) VALUES
  ('mot_ausencias',  'Ausencias reiteradas',            10),
  ('mot_abandono',   'Abandono de puesto',              20),
  ('mot_danos',      'Daños a materiales/equipos',       30),
  ('mot_conducta',   'Conducta inadecuada',              40),
  ('mot_incumplimiento', 'Incumplimiento de tareas',     50),
  ('mot_otro',       'Otro',                             60)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v077_roles_contacto_cliente.sql =====
-- =============================================================================
-- Migración: v077 — Rol de contacto de cliente parametrizable
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 6.a del relevamiento (Lautaro, 10/08): en la solapa Contactos del
-- alta de cliente, el campo Rol era texto libre — pasa a ser un
-- desplegable parametrizable, administrable en Configuración.
--
-- Se verificó contra la base real (75 clientes importados en Comercial
-- Fase 2) que ningún cliente tiene contactos.rol cargado todavía
-- (columna contactos jsonb vacía en todos) — no hay riesgo de
-- retrocompatibilidad con valores libres ya guardados. El catálogo
-- semilla es la unión de los ejemplos del ticket + los roles que ya
-- aparecían en los datos de demo del propio código (legacy.js).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.roles_contacto_cliente (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles_contacto_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.roles_contacto_cliente;
CREATE POLICY "Solo usuarios autenticados" ON public.roles_contacto_cliente
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.roles_contacto_cliente (id_local, nombre, orden) VALUES
  ('rol_nos_trajo',      'Quien nos trajo',              10),
  ('rol_recibe_fact',    'Recibe facturas',               20),
  ('rol_gerente_compras','Gerente de compras',            30),
  ('rol_gerente_operaciones','Gerente de Operaciones',    40),
  ('rol_jefe_serv_generales','Jefe de Servicios Generales',50),
  ('rol_contacto_cobros','Contacto de cobros',            60),
  ('rol_encargado_seguridad','Encargado de seguridad',    70),
  ('rol_otro',           'Otro',                          80)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v078_crm_lead_cliente_existente.sql =====
-- =============================================================================
-- Migración: v078 — CRM: distinguir lead de cliente existente vs potencial
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 8 del relevamiento (Lautaro, 10/08). Al crear un lead se elige si
-- es de un cliente YA cargado en el ABM (al ganar, va directo al alta de
-- un servicio nuevo, sin crear un cliente Borrador duplicado) o un
-- cliente potencial (sigue el flujo de siempre: crea un cliente en
-- Borrador con los datos del lead).
--
-- Retrocompatible: los leads existentes no tienen tipo_cliente cargado
-- (NULL) — el código los trata como 'Potencial' por default (mismo
-- comportamiento que tenían antes de este cambio), no se les asigna
-- 'Existente' a ciegas.
-- =============================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tipo_cliente text,
  ADD COLUMN IF NOT EXISTS cliente_id_vinculado bigint;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v079_objetivos_logistica_parametrizable.sql =====
-- =============================================================================
-- Migración: v079 — Logística del servicio: productos/elementos/máquinas
--            parametrizables (multi-select), sin tocar los campos de texto
--            libre existentes
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 6.b del relevamiento (Lautaro, 10/08): los campos Productos,
-- Elementos de limpieza y Máquinas del alta de servicio pasan de texto
-- libre a listas parametrizables con selección múltiple.
--
-- Se verificó contra la base real ANTES de tocar nada: los 164 objetivos
-- ya tienen datos cargados en log_productos, pero NO son una lista de
-- productos de limpieza — son metadata de facturación tipo "SE FACTURA |
-- Envía remito: NO" (probablemente del importador de Comercial Fase 2).
-- Convertir ese campo a multi-select habría ocultado/perdido ese dato en
-- los 164 servicios reales.
--
-- Decisión (confirmada con Fede): NO se toca log_productos/log_elementos/
-- log_maquinas (quedan como están, con su dato real). Se agregan 3
-- columnas jsonb NUEVAS para el multi-select parametrizable, que arrancan
-- vacías — no hay pérdida de datos posible.
--
-- El catálogo semilla usa los mismos ejemplos que ya sugerían los
-- placeholders de los textarea viejos (Ej: Detergente neutro, lavandina,
-- papel higiénico / Trapos de piso, mopas, guantes / Enceradora,
-- hidrolavadora) — no son un catálogo inventado desde cero, son lo que
-- la propia UI ya proponía como contenido esperado.
-- =============================================================================

BEGIN;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS productos_limpieza jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS elementos_limpieza jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS maquinas_necesarias jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS public.items_logistica_servicio (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  categoria   text NOT NULL,   -- 'producto' | 'elemento' | 'maquina'
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.items_logistica_servicio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.items_logistica_servicio;
CREATE POLICY "Solo usuarios autenticados" ON public.items_logistica_servicio
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.items_logistica_servicio (id_local, categoria, nombre, orden) VALUES
  ('prod_detergente',     'producto', 'Detergente neutro',        10),
  ('prod_lavandina',      'producto', 'Lavandina',                 20),
  ('prod_papel_higienico','producto', 'Papel higiénico',           30),
  ('prod_jabon_liquido',  'producto', 'Jabón líquido de manos',    40),
  ('prod_desodorante_amb','producto', 'Desodorante de ambientes',  50),
  ('prod_cera',           'producto', 'Cera para pisos',           60),
  ('elem_trapo_piso',     'elemento', 'Trapos de piso',            10),
  ('elem_mopa',           'elemento', 'Mopas',                     20),
  ('elem_guantes',        'elemento', 'Guantes',                   30),
  ('elem_escoba',         'elemento', 'Escobas',                   40),
  ('elem_balde',          'elemento', 'Baldes',                    50),
  ('elem_paño_microfibra','elemento', 'Paños de microfibra',       60),
  ('maq_enceradora',      'maquina',  'Enceradora',                10),
  ('maq_hidrolavadora',   'maquina',  'Hidrolavadora',             20),
  ('maq_aspiradora',      'maquina',  'Aspiradora',                30),
  ('maq_lustradora',      'maquina',  'Lustradora',                40)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v080_monotributo_completo.sql =====
-- =============================================================================
-- Migración: v080 — Monotributo: adherentes, CUR manual, historial
--            persistente, TAB de pago mensual, integración con Legajos
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 2 del relevamiento (MODULO_MONOTRIBUTO.md, Lautaro+Claude 11/08).
-- Decisión de alcance (confirmada con Fede): se construye todo lo que NO
-- depende del import real de 413 personas (IMPORT_MONOTRIBUTO_completo.
-- xlsx, todavía no entregado en esta conversación) — el padrón arranca
-- vacío/con lo que ya había, listo para poblarse cuando llegue el
-- archivo.
--
-- De paso se encontraron y corrigen 2 bugs reales pre-existentes:
--   1. El padrón (editar/eliminar/historial/recategorizar) operaba por
--      índice de la fila ya filtrada — mismo bug ya corregido en
--      Retenciones/Uniformes. Se corrige en el código (legacy.js), no
--      requiere columnas nuevas.
--   2. DB.monoCambios (historial de cambios de categoría) y DB.monoTablas
--      (tablas de categoría por vigencia) llamaban a supaSync('monoTablas',
--      ...) / nunca llamaban a supaSync para monoCambios — como ninguna
--      de las dos claves estaba en _SM, supaSync no hacía nada (early
--      return silencioso): el historial de cambios NUNCA se guardaba en
--      la nube, se perdía al recargar. Se agrega mono_cambios acá.
--      (monoTablas —tablas de categoría ARCA— queda pendiente de
--      persistir: es de baja frecuencia de cambio y requiere un modelo
--      relacional propio; no bloquea el resto del tema.)
-- =============================================================================

BEGIN;

-- ============================================================
-- Padrón — adherentes (reemplaza a "obraSocial" como única fuente) +
-- CUR manual como excepción explícita + N° de socio para cruzar con
-- Legajos/Liquidación.
-- ============================================================
ALTER TABLE public.monotributos
  ADD COLUMN IF NOT EXISTS nro_socio text,
  ADD COLUMN IF NOT EXISTS cur_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adherentes_cantidad integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adherentes_monto numeric NOT NULL DEFAULT 0;

-- ============================================================
-- Historial de cambios de categoría/CUR — antes se perdía al recargar
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mono_cambios (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,

  nombre          text,
  fecha           text,
  cat_anterior    text,
  cat_nueva       text,
  cur_anterior    numeric,
  cur_nuevo       numeric,
  proyeccion_anual numeric,
  motivo          text,
  decido_por      text,
  resultado       text,   -- 'Aprobado' | 'Rechazado'

  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_cambios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.mono_cambios;
CREATE POLICY "Solo usuarios autenticados" ON public.mono_cambios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- TAB nuevo: Pago de monotributos (mensual) — congela CUR+adherentes
-- del mes, la liquidación descuenta ese importe congelado, RRHH
-- exporta/tilda con auditoría (quién, cuándo, método).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mono_pagos_mes (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text NOT NULL UNIQUE,

  periodo           text NOT NULL,     -- 'YYYY-MM'
  nro_socio         text,
  nombre            text NOT NULL,
  cur_congelado     numeric NOT NULL DEFAULT 0,
  adherentes_monto_congelado numeric NOT NULL DEFAULT 0,
  total             numeric NOT NULL DEFAULT 0,

  pagado            boolean NOT NULL DEFAULT false,
  metodo_pago       text,              -- 'Transferencia'|'Cheque'|'Efectivo'|'Débito automático'|'Otro'
  pagado_por        text,
  pagado_en         timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_pagos_mes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.mono_pagos_mes;
CREATE POLICY "Solo usuarios autenticados" ON public.mono_pagos_mes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Legajos — integración (MODULO_MONOTRIBUTO.md §4)
-- ============================================================
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS mipyme_estado text,             -- 'TRAMITADO' | 'PENDIENTE'
  ADD COLUMN IF NOT EXISTS cuit_estado text,                -- 'ACTIVO' | 'INACTIVO' | 'VERIFICAR'
  ADD COLUMN IF NOT EXISTS cuit_fecha_verificacion date,
  ADD COLUMN IF NOT EXISTS clave_fiscal_fecha_actualizacion date;

-- Certificado MiPyME va como adjunto (mismo patrón que 'proceso' de
-- v074) — se agrega el tipo al CHECK ya existente. Se verificó el valor
-- EXACTO vigente del constraint antes de recrearlo (misma disciplina de
-- v074) para no perder ningún tipo ya en uso.
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_tipo_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'informe-psico','apto-medico','no-apto','antecedente','libreta','curso',
    'dni-frente','dni-dorso','foto-rostro','monotributo','inaes',
    'certificado-capacitacion','constancia-uniforme','denuncia-policial-uniforme',
    'evidencia-sancion','descargo-sancion','entrevista','poliza-seguro','proceso',
    'certificado-mipyme'
  ]));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v081_supervisores_multi.sql =====
-- =============================================================================
-- Migración: v081 — Módulo Supervisores + multi-supervisor por servicio
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 7 del relevamiento (Lautaro, 10/08):
--   - Módulo Supervisores nuevo: catálogo con % de comisión propio por
--     supervisor (arranca en 3% para todos, como está hoy, pero
--     parametrizable — "no hardcodear").
--   - Multi-supervisor: un servicio puede tener MÁS DE UN supervisor.
--     Se agrega objetivos.supervisores_asignados (jsonb, array de
--     nombres) SIN tocar objetivos.supervisor_asignado / .supervisor
--     (texto, quedan como el supervisor "principal" — los siguen leyendo
--     9+ consumidores de obtenerServiciosActivos(): Liquidación de
--     horas, Pedidos, Retenciones, etc. Romper ese contrato ahora sería
--     un cambio mucho más grande y riesgoso que el pedido del ticket).
--   - Comisión de supervisor: se auto-genera/sincroniza en la MISMA
--     tabla `comisiones` que ya existe para coordinadores de cuenta
--     (objetivos.comisiones jsonb) en vez de crear un mecanismo de pago
--     paralelo — marcada con esComisionSupervisor:true para poder
--     diferenciarla y no confundirla con una comisión de coordinador
--     cargada a mano.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.supervisores_config (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  nombre        text NOT NULL UNIQUE,
  pct_comision  numeric NOT NULL DEFAULT 3,
  activo        boolean NOT NULL DEFAULT true,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supervisores_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.supervisores_config;
CREATE POLICY "Solo usuarios autenticados" ON public.supervisores_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- (omitido a propósito para CLEAN PAZ: son los 15 supervisores reales de
-- Ohlimpia, no aplica a otra empresa. Clean Paz carga su propio catálogo
-- de supervisores desde el módulo correspondiente.)
-- INSERT INTO public.supervisores_config (id_local, nombre, pct_comision) VALUES
--   ('sup_alvaro_uballes',      'Alvaro Uballes', 3),
--   ('sup_alejandro_cacciato',  'Alejandro Cacciato', 3),
--   ('sup_claudia_cazenave',    'Claudia Cazenave', 3),
--   ('sup_claudio_gonzalez',    'Claudio Gonzalez', 3),
--   ('sup_fabio_benvenuto',     'Fabio Benvenuto', 3),
--   ('sup_matias_maidana',      'Matias Maidana', 3),
--   ('sup_marcelo_moure',       'Marcelo Moure', 3),
--   ('sup_santiago_ayala',      'Santiago Ayala', 3),
--   ('sup_richard_recalde',     'Richard Recalde', 3),
--   ('sup_alfredo_arispe',      'Alfredo Arispe', 3),
--   ('sup_lorena_unzain',       'Lorena Unzain', 3),
--   ('sup_dario_lage',          'Dario Lage', 3),
--   ('sup_patricia_scaglia',    'Patricia Scaglia', 3),
--   ('sup_maximiliano_poncino', 'Maximiliano Poncino', 3),
--   ('sup_sandra_luna',         'Sandra Luna', 3)
-- ON CONFLICT (id_local) DO NOTHING;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS supervisores_asignados jsonb NOT NULL DEFAULT '[]';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v082_reclamos_nc_persistencia_y_rediseno.sql =====
-- =============================================================================
-- Migración: v082 — Reclamos/NC: fix de persistencia crítico + campos para
--            el rediseño kanban (tema 9 del relevamiento)
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO — BUG CRÍTICO ENCONTRADO
-- ----------------------------------
-- Las tablas `reclamos` y `no_conformidades` YA EXISTÍAN en Supabase
-- (probablemente de una migración vieja) pero NUNCA se registraron en
-- _SM (mapa de tablas de src/shared/supabase.js). Resultado: cada
-- llamada a supaSync('reclamos', ...) hacía early-return silencioso
-- (tabla=_SM['reclamos']=undefined) — TODOS los reclamos y NC creados
-- en el sistema, siempre, vivieron solo en memoria del navegador y se
-- perdieron en cada recarga. Verificado contra la base real: ambas
-- tablas existen con las columnas correctas pero 0 filas.
--
-- Se corrige acá (columnas nuevas + _SM) y en el JS (supaSync ya
-- registrado + guardarReclamo/guardarNC ya no dependen de "el último
-- elemento del array" para saber qué sincronizar).
--
-- CAMPOS NUEVOS PARA EL TEMA 9
-- -----------------------------
-- - no_conformidades.reclamo_id: existía en el objeto JS pero la tabla
--   real no tenía la columna — se agrega (si no, el insert fallaría en
--   cuanto se sincronice de verdad).
-- - no_conformidades.nc_firmada_asociado_nro_socio: a qué legajo se le
--   imprime/hace firmar la NC — necesario para el movimiento en la
--   solapa Sanciones del legajo (tema 1).
-- - no_conformidades.firmada, firmada_en: si ya se subió la foto del
--   documento firmado.
-- =============================================================================

BEGIN;

ALTER TABLE public.no_conformidades
  ADD COLUMN IF NOT EXISTS reclamo_id bigint,
  ADD COLUMN IF NOT EXISTS asociado_nro_socio text,
  ADD COLUMN IF NOT EXISTS firmada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS firmada_en timestamptz;

-- Foto del documento de NC firmado por el asociado — mismo bucket/tabla
-- `adjuntos` que el resto del sistema (patrón v074/v080). Se verificó el
-- valor EXACTO vigente del constraint antes de recrearlo.
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_tipo_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'informe-psico','apto-medico','no-apto','antecedente','libreta','curso',
    'dni-frente','dni-dorso','foto-rostro','monotributo','inaes',
    'certificado-capacitacion','constancia-uniforme','denuncia-policial-uniforme',
    'evidencia-sancion','descargo-sancion','entrevista','poliza-seguro','proceso',
    'certificado-mipyme','nc-firmada'
  ]));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v083_psicos_fecha_realizacion.sql =====
-- v083 — Fecha de realización del psicotécnico (ticket "Criterio de
-- llamado por antigüedad").
--
-- psicos guardaba `fecha` (text, fecha de carga del registro en la app)
-- pero no la fecha en que la persona realizó el psicotécnico. El criterio
-- de llamado es por antigüedad: quienes hicieron el psicotécnico primero
-- se llaman primero. Se agrega `fecha_realizacion` como date (mismo tipo
-- que preocupacionales.fecha_turno) para poder ordenar cronológicamente.
--
-- Sin backfill: los registros existentes quedan NULL. La UI los ordena al
-- final y los muestra como "—", sin romper nada.
BEGIN;

ALTER TABLE psicos
  ADD COLUMN IF NOT EXISTS fecha_realizacion date;

COMMIT;

-- ===== v084_descuentos_asociado.sql =====
-- v084_descuentos_asociado.sql
-- Descuentos por asociado financiados en cuotas, con conceptos parametrizables
-- (ticket "Descuentos por asociado" — descuentos y liquidación). La Liquidación
-- consume una cuota por período mientras el descuento esté "En curso" y tenga
-- cuotas pendientes, con el mismo contrato que descuentos_uniforme_pendientes
-- (v032): cuotasCobradas/cuotasTotales/montoCuota + estado 'En curso'|'Terminado'.

BEGIN;

-- ========== Conceptos parametrizables ==========
CREATE TABLE IF NOT EXISTS public.conceptos_descuento (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  nombre                 text NOT NULL,
  cuotas_maximas         integer NOT NULL DEFAULT 1,
  activo                 boolean NOT NULL DEFAULT true,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ========== Descuentos por asociado ==========
CREATE TABLE IF NOT EXISTS public.descuentos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  concepto_id_local      text,
  legajo_id_local        text NOT NULL,
  monto_total            numeric(12,2) NOT NULL DEFAULT 0,
  cuotas_totales         integer NOT NULL DEFAULT 1,
  cuotas_cobradas        integer NOT NULL DEFAULT 0,
  monto_cuota            numeric(12,2) NOT NULL DEFAULT 0,
  periodo_inicio         text,                 -- YYYY-MM — mes de la primera cuota
  estado                 text NOT NULL DEFAULT 'En curso',  -- En curso / Terminado / Cancelado
  fecha_generado         text,
  observacion            text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_desc_legajo ON public.descuentos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_desc_estado ON public.descuentos(estado) WHERE NOT anulado;

-- ========== RLS ==========
ALTER TABLE public.conceptos_descuento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descuentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conceptos_descuento_all ON public.conceptos_descuento;
CREATE POLICY conceptos_descuento_all ON public.conceptos_descuento FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS descuentos_all ON public.descuentos;
CREATE POLICY descuentos_all ON public.descuentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v085_pedido_productos.sql =====
-- v085_pedido_productos.sql
-- Módulo "Pedido de Productos" (Logística) — diseño Lautaro + Claude web,
-- 11/07/2026 (docs/MODULO_PEDIDO_PRODUCTOS.md). Reemplaza la planilla Excel
-- de pedido mensual de productos/insumos por servicio.
--
-- Prefijo pp_ en todas las tablas a propósito: ya existe una tabla `pedidos`
-- (Pedidos de personal, Selección) — sin el prefijo "pedidos_productos"
-- pisaría ese nombre a la primera de cambio.
--
-- Se sigue la convención del proyecto (id_local text + anulado + auditoría
-- en texto/timestamptz, no las relaciones uuid del documento de diseño
-- original) porque el resto del sistema no usa auth.uid()/FKs uuid reales —
-- usa nombres de persona en texto para "quién hizo qué" (mismo patrón que
-- cargadoPor/resueltoPor en otros módulos). El id_local sigue siendo la
-- identidad real de cada fila para supaSync().

BEGIN;

-- ========== 1. Períodos ==========
-- El "mes habilitado" — interruptor general (§4.1 del diseño).
CREATE TABLE IF NOT EXISTS public.pp_periodos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text UNIQUE NOT NULL,

  mes           text NOT NULL,                    -- YYYY-MM
  estado        text NOT NULL DEFAULT 'abierto',   -- abierto / cerrado
  abierto_por   text,
  abierto_en    text,
  cerrado_en    text,

  anulado       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_periodos_mes ON public.pp_periodos(mes) WHERE NOT anulado;

-- ========== 2. Catálogo maestro de productos ==========
-- Una sola vez en todo el sistema (§4.3). El id_local es la identidad
-- interna estable; codigo_monica es solo la llave para cruzar con el
-- sistema externo Mónica, frágil y no usada como identidad (el propio
-- diseño documenta inconsistencias reales: "100006", "1000006", "10000088").
CREATE TABLE IF NOT EXISTS public.pp_productos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text UNIQUE NOT NULL,

  codigo_monica   text,
  descripcion     text NOT NULL,
  tipo_uso        text NOT NULL DEFAULT 'normal',  -- apertura / tratamiento_piso / con_autorizacion / normal

  anulado         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_productos_tipo_uso ON public.pp_productos(tipo_uso) WHERE NOT anulado;

-- ========== 3. Precios con vigencia temporal ==========
-- El costo NO vive en el producto — vive acá con fecha (§4.4, A.6). Un
-- aumento crea un registro nuevo con vigencia_desde y cierra el anterior
-- con vigencia_hasta; no pisa el precio con el que ya se calculó un pedido
-- pasado. Una corrección de error sí modifica el registro existente.
CREATE TABLE IF NOT EXISTS public.pp_precios (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  producto_id_local text NOT NULL,
  costo_unit        numeric(12,2) NOT NULL DEFAULT 0,
  vigencia_desde    text NOT NULL,   -- YYYY-MM-DD
  vigencia_hasta    text,            -- NULL = vigente

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_precios_producto ON public.pp_precios(producto_id_local) WHERE NOT anulado;

-- ========== 4. Pedido (planilla de un servicio en un mes) ==========
-- facturacion_neta y porcentaje_tope quedan CONGELADOS al abrir el pedido
-- (§4.2) — una corrección futura en Comercial no debe recalcular el tope
-- de un mes ya cerrado (A.6, distinción corrección vs. vigencia aplicada
-- entre módulos).
CREATE TABLE IF NOT EXISTS public.pp_pedidos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  periodo_id_local  text NOT NULL,
  servicio_codigo   text NOT NULL,   -- código canónico del servicio (DB.objetivos.codigo), texto libre como en el resto del app

  facturacion_neta  numeric(14,2) NOT NULL DEFAULT 0,
  porcentaje_tope   numeric(6,4) NOT NULL DEFAULT 0.06,

  estado            text NOT NULL DEFAULT 'borrador',
    -- borrador / cerrado_supervisor / en_auditoria / autorizado / en_compra / entregado
  tipo_pedido       text NOT NULL DEFAULT 'mensual',  -- mensual / extraordinario (previsto, sin uso en v1 — §5)
  supervisor        text,             -- nombre del supervisor del servicio al momento de abrir el pedido

  cerrado_por       text,
  cerrado_en        text,
  auditado_por      text,
  auditado_en       text,
  autorizado_por    text,
  autorizado_en     text,
  en_compra_en      text,
  entregado_en      text,

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_pedidos_periodo_serv ON public.pp_pedidos(periodo_id_local, servicio_codigo) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pp_pedidos_estado ON public.pp_pedidos(estado) WHERE NOT anulado;

-- ========== 5. Ítems del pedido ==========
-- cant_solicitada (supervisor) y cant_autorizada (auditor) son dos campos
-- separados a propósito (§4.5, A.7): el auditor ajusta sin pisar lo que
-- pidió el supervisor, así queda trazabilidad completa del recorte para
-- cuando se prenda la notificación al supervisor (fuera de alcance v1).
-- costo_congelado se copia del precio vigente al cerrar el pedido — el
-- total nunca se guarda (§4.6), se calcula sumando cantidad × costo acá.
CREATE TABLE IF NOT EXISTS public.pp_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,

  pedido_id_local     text NOT NULL,
  producto_id_local   text NOT NULL,

  cant_solicitada     numeric(10,2) NOT NULL DEFAULT 0,
  cant_autorizada     numeric(10,2),           -- NULL hasta que pasa por auditoría
  costo_congelado     numeric(12,2) NOT NULL DEFAULT 0,

  ajustado_por        text,
  ajustado_en         text,
  cant_antes_ajuste   numeric(10,2),           -- valor previo al recorte del auditor (auditoría del cambio)

  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_items_pedido_prod ON public.pp_items(pedido_id_local, producto_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pp_items_pedido ON public.pp_items(pedido_id_local) WHERE NOT anulado;

-- ========== RLS ==========
-- Mismo criterio que el resto del sistema (FOR ALL TO authenticated) — el
-- control real de "quién puede hacer qué en cada estado" se hace en la app
-- (currentUser.perfil), no a nivel de fila en la base. Gap pre-existente en
-- todo el sistema, no específico de este módulo.
ALTER TABLE public.pp_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_periodos_all ON public.pp_periodos;
CREATE POLICY pp_periodos_all ON public.pp_periodos  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pp_productos_all ON public.pp_productos;
CREATE POLICY pp_productos_all ON public.pp_productos FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pp_precios_all ON public.pp_precios;
CREATE POLICY pp_precios_all ON public.pp_precios   FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pp_pedidos_all ON public.pp_pedidos;
CREATE POLICY pp_pedidos_all ON public.pp_pedidos   FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pp_items_all ON public.pp_items;
CREATE POLICY pp_items_all ON public.pp_items     FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v086_supervision_servicios.sql =====
-- v086_supervision_servicios.sql
-- Ticket "Supervisión de Servicios" (Lautaro + Claude, 13/08/2026):
-- el % de supervisión deja de ser una propiedad de cada supervisor (la
-- vieja supervisores_config.pct_comision, v081) y pasa a ser una
-- propiedad de la relación servicio-supervisión, con cascada de defaults
-- GENERAL (3%) → CLIENTE → SERVICIO (override que gana sobre todo).
--
-- 1) supervision_vigencias: trazabilidad completa. Cada % se guarda como
--    registro de vigencia (nivel, alcance, %, vigente-desde, vigente-hasta,
--    usuario, fecha, motivo). Cambiar un % NUNCA pisa el anterior: se cierra
--    la vigencia abierta y se abre una nueva. La liquidación de cada mes usa
--    el % vigente de ESE mes (meses liquidados no se tocan).
-- 2) clientes.pct_supervision / objetivos.pct_supervision: el dato "vive"
--    en las entidades de Comercial (Configuración / Cliente / Servicio),
--    pero la EDICIÓN se hace únicamente desde la grilla del módulo
--    Supervisión — las fichas de Comercial lo muestran en solo lectura.
-- 3) liq_admin_periodos: nuevas columnas para el "Ajuste de nivelación"
--    de Liquidación Administración (editable por Finanzas, con motivo y
--    auditoría). El adicional por supervisión se calcula en vivo desde las
--    vigencias, no se persiste.

BEGIN;

-- ========== Vigencias del % de supervisión ==========
CREATE TABLE IF NOT EXISTS public.supervision_vigencias (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nivel             text NOT NULL,          -- general | cliente | servicio
  alcance           text NOT NULL,          -- 'GENERAL' | clienteId | objetivoId
  alcance_nombre    text NOT NULL DEFAULT '',
  pct               numeric(5,2) NOT NULL,
  vigente_desde     text NOT NULL,          -- 'YYYY-MM' — desde qué mes rige
  vigente_hasta     text,                   -- 'YYYY-MM' — null = abierta (vigente)
  usuario           text NOT NULL DEFAULT '',
  fecha             text NOT NULL DEFAULT '',
  motivo            text NOT NULL DEFAULT '',

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sv_alcance ON public.supervision_vigencias(alcance) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_sv_abierta ON public.supervision_vigencias(alcance) WHERE NOT anulado AND vigente_hasta IS NULL;

-- ========== El % vive en las entidades de Comercial ==========
ALTER TABLE public.clientes  ADD COLUMN IF NOT EXISTS pct_supervision numeric(5,2);
ALTER TABLE public.objetivos ADD COLUMN IF NOT EXISTS pct_supervision numeric(5,2);

-- ========== Ajuste de nivelación en Liquidación Administración ==========
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_nivelacion numeric(12,2);
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_motivo text;
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_usuario text;
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_fecha text;

-- ========== RLS ==========
ALTER TABLE public.supervision_vigencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supervision_vigencias_all ON public.supervision_vigencias;
CREATE POLICY supervision_vigencias_all ON public.supervision_vigencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v087_sugerencia_adjuntos.sql =====
-- =============================================================================
-- Migración: v087 — Adjuntos en Reportes y Sugerencias (tickets)
-- Fecha:     2026-08-15
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El buzón de sugerencias permite escribir texto pero no adjuntar archivos.
-- El usuario quiere adjuntar .md, Excel, PDF, Word, CSV, etc. a sus tickets
-- (su propio tablero de tareas), poder descargarlos y que no se pierdan.
--
-- Decisión: tabla `sugerencia_adjuntos`, chica y dedicada, append-only
-- (mismo patrón que `casos_legales_adjuntos` v036). NO se usa la tabla
-- compartida `adjuntos` porque esa invalida el documento vigente anterior
-- por (dni, tipo) — no aplica a tickets donde puede haber varios archivos
-- por sugerencia y no hay "1 documento vigente".
--
-- Los archivos se suben al bucket privado `ohlimpia-adjuntos` (ya existente)
-- bajo `sugerencias/{sugerenciaIdLocal}/{uuid}.{ext}`. La descarga usa
-- signed URL (obtenerUrlFirmada, patrón estándar del proyecto).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sugerencia_adjuntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sugerencia_id_local    text NOT NULL,     -- id_local de la sugerencia/ticket

  url                    text NOT NULL,     -- path en Storage (bucket ohlimpia-adjuntos)
  nombre_archivo         text NOT NULL,     -- nombre humano para mostrar/descargar
  tipo_mime              text,
  tamano                 integer,           -- bytes

  subido_por             text NOT NULL,
  subido_en              timestamptz NOT NULL DEFAULT now(),

  borrado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suga_sugerencia ON public.sugerencia_adjuntos(sugerencia_id_local) WHERE NOT borrado;

-- ============================================================
-- RLS — mismo patrón que v036/v032/v033/v034/v035
-- ============================================================
ALTER TABLE public.sugerencia_adjuntos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sugerencia_adjuntos;
CREATE POLICY "Solo usuarios autenticados" ON public.sugerencia_adjuntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v088_horario_semanal_pedidos.sql =====
-- =============================================================================
-- Migración: v088 — Horario semanal estructurado en Pedidos de personal
-- Fecha:     2026-08-16
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Horario y días": al dar de alta o editar un pedido de personal,
-- hoy solo hay un input de texto libre (`pedidos.horario`, "Ej: Lunes a
-- viernes 14 a 22hs"). Se replica el mismo componente que usa Servicios
-- (objetivos) en su "personal necesario": checklist de días de la semana
-- (L M X J V S D + Feriados) + horario desde/hasta + tipo fijo/rotativo.
--
-- Decisión: columna `horario_semanal` jsonb en `pedidos`, con el MISMO
-- shape que un puesto de `objetivos.puestos_necesarios`:
--
--   {
--     "dias": { "lunes": true, "martes": true, ..., "feriados": false },
--     "horarioDesde": "14:00",
--     "horarioHasta": "22:00",
--     "tipoHorario": "fijo" | "rotativo"
--   }
--
-- El pedido describe UNA necesidad → objeto único (no array). La columna
-- `horario` (text) se mantiene: al guardar se genera un resumen legible
-- ("L, M, X, V · 14:00 a 22:00 · Fijo") para no romper la tabla, el
-- filtro ni los pedidos antiguos (retrocompat total).
--
-- Se usa el patrón jsonb de v072/v073: default '{}', upsert por fila.
-- =============================================================================

BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS horario_semanal jsonb NOT NULL DEFAULT '{}';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v089_superadmin_empresas.sql =====
-- v089_superadmin_empresas.sql
-- Panel de Superadmin — registro de empresas clientes del sistema (venta
-- del ERP como producto a otras cooperativas/empresas) y qué módulos le
-- vendiste a cada una.
--
-- IMPORTANTE — esto NO es la base de datos operativa de esas empresas.
-- Cada empresa cliente tiene su PROPIO proyecto Supabase separado (con
-- sus propios legajos/liquidaciones/etc — aislamiento total, no hay
-- empresa_id compartido en ninguna tabla operativa). Esta tabla vive
-- únicamente en el Supabase de Ohlimpia y es el registro/bookkeeping de
-- Fede para llevar cuenta de qué empresas existen y qué les vendió — no
-- controla en vivo lo que cada empresa ve (eso se configura por separado,
-- a mano, en el deploy de esa empresa — ver runbook de alta).
--
-- modulos_contratados es un array de las mismas keys que ya usa MENU
-- (state.js) — ej. ['legajos','liquidacion','liq_admin'] — así queda
-- una sola fuente de verdad para "qué módulos existen" en todo el sistema.

BEGIN;

CREATE TABLE IF NOT EXISTS public.empresas_cliente (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  nombre                 text NOT NULL,
  contacto               text,              -- nombre/email/tel del referente
  estado                 text NOT NULL DEFAULT 'Activa',  -- Activa / Inactiva / Prospecto
  modulos_contratados    jsonb NOT NULL DEFAULT '[]'::jsonb,

  supabase_url           text,              -- referencia informativa: dónde vive su base
  vercel_url             text,              -- referencia informativa: dónde está su deploy
  notas                  text,

  fecha_alta             text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empresas_cliente_estado ON public.empresas_cliente(estado) WHERE NOT anulado;

ALTER TABLE public.empresas_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresas_cliente_all ON public.empresas_cliente;
CREATE POLICY empresas_cliente_all ON public.empresas_cliente FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v090_empresas_cliente_anon_key.sql =====
-- v090_empresas_cliente_anon_key.sql
-- Guarda el anon key de cada empresa cliente junto a su supabase_url, para
-- que el panel de Superadmin pueda escribir directo en la base de ESA
-- empresa (ej. branding_config, ver v091) sin salir de la pantalla de
-- Ohlimpia. Es de solo-lectura pública igual que el resto de las tablas
-- de Supabase de este proyecto — no habilita nada que el navegador de la
-- empresa cliente no pueda hacer ya con su propio anon key.

BEGIN;

ALTER TABLE public.empresas_cliente
  ADD COLUMN IF NOT EXISTS supabase_anon_key text;

COMMIT;

-- ===== v091_branding_config.sql =====
-- v091_branding_config.sql
-- Tabla de una sola fila con la personalización visual EN VIVO de esta
-- instancia (empresa cliente) — hoy solo el logo del Inicio. A diferencia
-- de VITE_EMPRESA_NOMBRE/VITE_EMPRESA_LOGO_URL (env vars, requieren
-- redeploy), esto se lee en cada carga de página vía Supabase, así que
-- cambiarlo desde el panel de Superadmin de Ohlimpia se refleja acá sin
-- que Fede tenga que redesplegar nada.
--
-- OJO: esta tabla se crea en la base de CADA empresa cliente (no en la de
-- Ohlimpia) — correr este script contra el Supabase de esa empresa, igual
-- que el resto del historial de migraciones del sistema base.

BEGIN;

CREATE TABLE IF NOT EXISTS public.branding_config (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  logo_url               text,     -- data: URL (base64) o URL pública — lo que haya
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branding_config ENABLE ROW LEVEL SECURITY;

-- Mismo patrón "abierto" que el resto del sistema (ver CLAUDE.md — RLS
-- FOR ALL TO authenticated USING(true) en todas las tablas). Acá además
-- se permite escritura a "anon": quien actualiza el logo es el panel de
-- Superadmin de OHLIMPIA, que escribe con el anon key de ESTA empresa
-- pero sin loguearse contra el Auth de esta empresa (son proyectos de
-- Supabase separados) — y la lectura tiene que ser anónima igual, porque
-- el logo se pinta en el Inicio antes de loguearse.
DROP POLICY IF EXISTS "Lectura pública" ON public.branding_config;
CREATE POLICY "Lectura pública" ON public.branding_config
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Escritura pública" ON public.branding_config;
CREATE POLICY "Escritura pública" ON public.branding_config
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v092_mono_tablas_casos_persist.sql =====
-- =============================================================================
-- Migración: v092 — Monotributo: persistir tablas ARCA y casos del import
-- Fecha:     2026-08-18
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Evolución del módulo Monotributos (MONOTRIBUTOS_CAMBIOS.md, 15/08).
-- Dos tablas nuevas:
--   1. mono_tablas: vigencias de las escalas ARCA (antes solo en memoria
--      como DB.monoTablas, se perdía al recargar).
--   2. mono_casos_import: los 10 casos a resolver por RRHH al cruzar la
--      planilla de RRHH contra la tabla ARCA.
-- =============================================================================

BEGIN;

-- ============================================================
-- Tablas de categorías ARCA por vigencia
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mono_tablas (
  id              text PRIMARY KEY,       -- vigencia, ej: '2026-08'
  id_local        text NOT NULL UNIQUE,
  vigencia        text NOT NULL,
  tabla_data      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_tablas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.mono_tablas;
CREATE POLICY "Solo usuarios autenticados" ON public.mono_tablas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Casos del import — los 10 casos a resolver por RRHH
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mono_casos_import (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,
  nro_socio       text,
  nombre          text NOT NULL,
  tipo            text NOT NULL,           -- 'DEFINIR' | 'VERIFICAR'
  detalle         text,
  accion_esperada text,
  resuelto        boolean NOT NULL DEFAULT false,
  resuelto_por    text,
  resuelto_en     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_casos_import ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.mono_casos_import;
CREATE POLICY "Solo usuarios autenticados" ON public.mono_casos_import
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v093_branding_modulos_contratados.sql =====
-- =============================================================================
-- Migración: v093 — branding_config: módulos contratados en vivo
-- Fecha:     2026-08-18
-- Autor:     Fede
-- =============================================================================
--
-- PROBLEMA
-- -------
-- MODULOS_CONTRATADOS se lee de VITE_MODULOS_CONTRATADOS (env var) UNA vez
-- al build time. Si el Superadmin agrega/quita módulos desde el panel de
-- Ohlimpia, el cliente no se entera hasta que se haga redeploy con la env
-- var actualizada — friction innecesario.
--
-- SOLUCIÓN
-- -------
-- Agregar campo modulos_contratados (jsonb) a branding_config (tabla que ya
-- existe en CADA base de cliente). El Superadmin escribe ahí al guardar la
-- empresa, y el cliente lo lee al login. Si está vacío/null, sigue usando
-- la env var como fallback.
--
-- CORRER EN LA BASE DE CADA EMPRESA CLIENTE (no en la de Ohlimpia).
-- =============================================================================

BEGIN;

ALTER TABLE public.branding_config
  ADD COLUMN IF NOT EXISTS modulos_contratados jsonb DEFAULT NULL;

COMMIT;

-- ===== v094_proveedores_pp.sql =====
-- v094_proveedores_pp.sql
-- Módulo Proveedores (maestro mínimo) + FK en pp_productos para conectar
-- Pedido de Productos con el padrón de proveedores. Migración mínima según
-- ticket de conexión ( alcance: tabla + select en catálogo + filtro).

BEGIN;

-- ========== 1. Maestro de proveedores ==========
CREATE TABLE IF NOT EXISTS public.proveedores (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text UNIQUE NOT NULL,

  nombre        text NOT NULL,                     -- "THAMES", "DIVERSEY"
  codigo        text,                              -- "PROV-001" (opcional)
  estado        text NOT NULL DEFAULT 'activo',    -- activo / inactivo
  contacto      text,                              -- nombre del contacto / vendedor

  anulado       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedores_nombre ON public.proveedores(nombre) WHERE NOT anulado;

-- ========== 2. FK proveedor en pp_productos ==========
-- Nullable para registros existentes sin proveedor asignado.
ALTER TABLE public.pp_productos
  ADD COLUMN IF NOT EXISTS proveedor_id_local text;
CREATE INDEX IF NOT EXISTS idx_pp_productos_proveedor ON public.pp_productos(proveedor_id_local) WHERE NOT anulado AND proveedor_id_local IS NOT NULL;

-- ========== RLS ==========
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proveedores_all ON public.proveedores;
CREATE POLICY proveedores_all ON public.proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v095_stock_productos.sql =====
-- v095_stock_productos.sql
-- Stock de productos de limpieza (extiende el módulo Stock existente de
-- uniformes con tablas paralelas para productos). La UI unifica ambas
-- categorías en una sola vista con filtro.
--
-- Se mantiene stock_uniformes / stock_uniformes_movimientos intactas.
-- Las nuevas tablas usan producto_id_local como FK lógica a pp_productos.
--
-- flujo de stock:
--   ENTRADA  ← recepción de pedido de productos (marcarEntregadoPP)
--   SALIDA   ← futura entrega a servicio (checklist de armado)
--   AJUSTE   ← inventario físico / merma / rotura
--
-- PPP (costo promedio ponderado) se calcula en runtime al momento de la
-- entrada: si hay 100 a $4.180 y entran 60 a $4.559, el PPP nuevo es
-- $4.322.13. Se almacena en la fila de stock_productos.

BEGIN;

-- ========== 1. Nivel actual de stock de productos ==========
CREATE TABLE IF NOT EXISTS public.stock_productos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  producto_id_local text NOT NULL,       -- FK lógica a pp_productos.id_local
  cantidad          numeric NOT NULL DEFAULT 0,
  costo_ppp         numeric(12,2) NOT NULL DEFAULT 0,  -- costo promedio ponderado
  costo_vigente     numeric(12,2) NOT NULL DEFAULT 0,  -- último precio de lista (referencia)
  stock_minimo      numeric(10,2) DEFAULT 0,           -- configurable (futuro)
  stock_objetivo    numeric(10,2) DEFAULT 0,           -- nivel objetivo (futuro)

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_productos_producto ON public.stock_productos(producto_id_local);

-- ========== 2. Ledger de movimientos ==========
CREATE TABLE IF NOT EXISTS public.stock_productos_movimientos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,

  tipo                text NOT NULL,          -- 'entrada' | 'salida' | 'ajuste' | 'refuerzo'
  producto_id_local   text NOT NULL,
  cantidad            numeric NOT NULL,       -- positiva para entrada/refuerzo, negativa para salida
  costo_unitario      numeric(12,2) NOT NULL DEFAULT 0,  -- costo de esta línea (PPP al salir, precio de compra al entrar)
  motivo              text,
  ref_tipo            text,                   -- 'pedido_producto' | 'compra' | 'conteo' | 'ajuste'
  ref_id_local        text,
  registrado_por      text,

  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_prod_mov_producto ON public.stock_productos_movimientos(producto_id_local);
CREATE INDEX IF NOT EXISTS idx_stock_prod_mov_tipo ON public.stock_productos_movimientos(tipo);

-- ========== RLS ==========
ALTER TABLE public.stock_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_productos_movimientos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_productos_all') THEN
    CREATE POLICY stock_productos_all ON public.stock_productos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_productos_movimientos_all') THEN
    CREATE POLICY stock_productos_movimientos_all ON public.stock_productos_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ===== v096_maquinas.sql =====
-- v096_maquinas.sql
-- Módulo Máquinas: padrón, movimientos de ubicación, tickets de reparación
-- e historial de etapas de tickets.
--
-- Diseñado para recibir import del Anexo 053 (43 máquinas, historial
-- 2020-2026) cuando Lautaro lo autorice.
--
-- flujo de estados de máquina:
--   ACTIVA → DEPÓSITO → EN_REPARACIÓN → ACTIVA (ciclo normal)
--   cualquiera → BAJA (con motivo tipificado, conserva historial)
--
-- flujo de ticket (5 etapas):
--   REPORTE → ANÁLISIS_REMOTO → VISITA_INTERNA → PROVEEDOR → FACTURA → CERRADO

BEGIN;

-- ========== 1. PADRÓN DE MÁQUINAS ==========
CREATE TABLE IF NOT EXISTS public.maquinas (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  nro_maquina           text NOT NULL,             -- N° interno (ej: "7736")
  tipo                  text NOT NULL DEFAULT '',   -- ej: "TASKI SWINGO XP"
  marca                 text NOT NULL DEFAULT '',   -- ej: "TASKI"
  modelo                text NOT NULL DEFAULT '',   -- ej: "SWINGO XP"

  -- Propiedad
  propiedad             text NOT NULL DEFAULT 'propia',  -- 'propia' | 'alquilada'
  proveedor_alquiler    text DEFAULT '',            -- proveedor si alquilada
  costo_alquiler_mensual numeric(12,2) DEFAULT 0,
  contrato_nro          text DEFAULT '',

  -- Energía
  energia               text NOT NULL DEFAULT 'bateria',  -- 'bateria' | 'cable'

  -- Estado y ubicación
  estado                text NOT NULL DEFAULT 'activa',   -- 'activa' | 'deposito' | 'reparacion' | 'baja'
  estado_motivo         text DEFAULT '',            -- motivo de baja: 'rota_sin_arreglo' | 'vendida' | 'devuelta_proveedor'
  servicio_codigo       text DEFAULT '',            -- código del servicio/cliente actual
  servicio_nombre       text DEFAULT '',            -- nombre legible del servicio

  -- Compra / amortización
  fecha_compra          text DEFAULT '',            -- DD/MM/AAAA
  costo_compra          numeric(12,2) DEFAULT 0,
  vida_util_meses       numeric(5,0) DEFAULT 60,   -- vida útil para amortización lineal

  -- Batería (campos duplicados de tabla baterías para acceso rápido)
  bateria_tipo          text DEFAULT '',            -- ej: "Gel 12V×2"
  bateria_colocada      text DEFAULT '',            -- fecha de última colocación
  bateria_vida_util     numeric(5,0) DEFAULT 24,   -- meses
  bateria_costo         numeric(12,2) DEFAULT 0,   -- costo estimado recambio

  -- Acumulados (denormalizados paraPerformance de tabla padrón)
  reparaciones_acum     numeric(12,2) DEFAULT 0,   -- suma de costos de tickets cerrados

  -- Adjuntos
  foto_url              text DEFAULT '',

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_maquinas_nro ON public.maquinas(nro_maquina) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maquinas_estado ON public.maquinas(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maquinas_servicio ON public.maquinas(servicio_codigo) WHERE NOT anulado AND servicio_codigo != '';

-- ========== 2. MOVIMIENTOS DE UBICACIÓN ==========
CREATE TABLE IF NOT EXISTS public.maquinas_movimientos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  maquina_id_local  text NOT NULL,
  fecha             text NOT NULL,                 -- DD/MM/AAAA
  origen            text NOT NULL DEFAULT '',       -- servicio o depósito de donde sale
  destino           text NOT NULL DEFAULT '',       -- servicio o depósito a donde va
  motivo            text DEFAULT '',                -- por qué se mueve
  registrado_por    text DEFAULT '',                -- usuario Logística

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maq_mov_maquina ON public.maquinas_movimientos(maquina_id_local) WHERE NOT anulado;

-- ========== 3. TICKETS DE REPARACIÓN ==========
CREATE TABLE IF NOT EXISTS public.maquinas_tickets (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  nro_ticket            bigint GENERATED ALWAYS AS IDENTITY,  -- numeração visible #128
  maquina_id_local      text NOT NULL,
  servicio_codigo       text DEFAULT '',            -- servicio donde está la máquina

  -- Problema reportado
  problema_tipo         text NOT NULL DEFAULT '',   -- catálogo parametrizable
  problema_desc         text DEFAULT '',
  problema_foto_url     text DEFAULT '',
  reportado_por         text DEFAULT '',            -- nombre del operario
  reportado_fecha       text DEFAULT '',            -- DD/MM/AAAA HH:MM

  -- Estado actual del ticket
  etapa                 text NOT NULL DEFAULT 'reporte',
  -- 'reporte' | 'analisis' | 'visita_interna' | 'proveedor' | 'factura' | 'cerrado'

  -- Resolución (se llena al cerrar)
  resolucion            text DEFAULT '',            -- 'remoto' | 'interno' | 'proveedor' | 'baja'
  resolucion_notas      text DEFAULT '',

  -- Proveedor (si etapa = proveedor o factura)
  proveedor_nombre      text DEFAULT '',
  proveedor_acta        text DEFAULT '',            -- texto del acta de visita
  proveedor_acta_url    text DEFAULT '',
  factura_monto         numeric(12,2) DEFAULT 0,
  factura_observada     boolean DEFAULT false,
  factura_obs_notas     text DEFAULT '',

  -- Costo final
  costo_repuestos       numeric(12,2) DEFAULT 0,
  costo_proveedor       numeric(12,2) DEFAULT 0,

  -- SLA / tiempos
  etapa_inicio_en       timestamptz DEFAULT now(),  -- timestamp de la etapa actual
  cerrado_en            timestamptz,

  -- Máquina reemplazo temporal
  reemplazo_id_local    text DEFAULT '',

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maq_tick_maquina ON public.maquinas_tickets(maquina_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maq_tick_etapa ON public.maquinas_tickets(etapa) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maq_tick_estado ON public.maquinas_tickets(etapa) WHERE NOT anulado AND etapa != 'cerrado';

-- ========== 4. HISTORIAL DE ETAPAS (log de cambios) ==========
CREATE TABLE IF NOT EXISTS public.maquinas_ticket_historial (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  ticket_id_local   text NOT NULL,
  etapa_anterior    text NOT NULL,
  etapa_nueva       text NOT NULL,
  notas             text DEFAULT '',
  trabajo_tipo      text DEFAULT '',                -- 'remoto' | 'repuesto' | 'mano_obra' | 'acta_proveedor'
  repuestos         text DEFAULT '',                -- descripción de repuestos usados
  costo_repuestos   numeric(12,2) DEFAULT 0,
  acta_url          text DEFAULT '',
  responsable       text DEFAULT '',                -- quién hizo el cambio

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maq_hist_ticket ON public.maquinas_ticket_historial(ticket_id_local) WHERE NOT anulado;

-- ========== RLS ==========
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_all') THEN
    CREATE POLICY maquinas_all ON public.maquinas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_movimientos_all') THEN
    CREATE POLICY maquinas_movimientos_all ON public.maquinas_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_tickets_all') THEN
    CREATE POLICY maquinas_tickets_all ON public.maquinas_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_ticket_historial_all') THEN
    CREATE POLICY maquinas_ticket_historial_all ON public.maquinas_ticket_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.maquinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinas_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinas_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinas_ticket_historial ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===== v097a_precios.sql =====
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

-- Fix (revision de codigo, 23/08): precios.js (el loader masivo, linea
-- ~4382) lee codigo_objetivo y tipo_servicio directo de sucursales —
-- ninguna de las dos se habia agregado a esta tabla.
alter table public.sucursales
  add column if not exists codigo_objetivo text,
  add column if not exists tipo_servicio   text check (tipo_servicio in ('vigilancia','custodia','otro'));
comment on column public.sucursales.codigo_objetivo is 'Codigo del objetivo/sucursal para cruce con sistemas externos (LIGE, etc.).';
comment on column public.sucursales.tipo_servicio    is 'Tipo de servicio de esta sucursal — hereda a objetivo_precios.tipo_servicio.';

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

-- 2b) objetivo_comisionistas - de acá sale el coordinador de cuenta de cada
-- sucursal/objetivo (ver docs/Diseno_CRM_Negociacion.md §4: "quién habló
-- con el cliente" sale de acá, distinto de "quién cargó el registro").
-- Fix (revision de codigo, 23/08): precios.js:4385 la lee directo — la
-- tabla nunca se había creado en ningún script (ni siquiera en el original
-- de FinFlow), solo se la menciona en comentarios/docs. Sin datos por
-- ahora — falta el proceso que la puebla (a mano o desde otro sistema).
create table if not exists public.objetivo_comisionistas (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null references public.sucursales(id) on delete cascade,
  persona_id    uuid not null references public.personas(id) on delete cascade,
  rol           text,
  vigente_hasta date,
  created_at    timestamptz not null default now(),
  unique (sucursal_id, persona_id, rol)
);
comment on table public.objetivo_comisionistas is
  'Coordinador/comisionista a cargo de cada sucursal (objetivo). De acá sale "quién negoció" en el CRM — distinto de quién cargó el registro.';
alter table public.objetivo_comisionistas enable row level security;
drop policy if exists objetivo_comisionistas_all on public.objetivo_comisionistas;
create policy objetivo_comisionistas_all on public.objetivo_comisionistas for all to authenticated using (true) with check (true);
create index if not exists idx_obj_comisionistas_sucursal on public.objetivo_comisionistas (sucursal_id);
create index if not exists idx_obj_comisionistas_persona  on public.objetivo_comisionistas (persona_id);

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

-- Fix (revision de codigo, 23/08): precios.js (cargarPrecios y el loader
-- masivo) lee paritaria_id/escala_id junto con pct_aumento para saber CON
-- QUE paritaria/escala se generó ese precio — nunca se habian agregado.
-- paritaria_id va acá (paritarias ya existe a esta altura del archivo);
-- escala_id se agrega más abajo, después de crear escalas_aumento.
alter table public.objetivo_precios
  add column if not exists paritaria_id uuid references public.paritarias(id) on delete set null;
comment on column public.objetivo_precios.paritaria_id is 'Paritaria que originó este precio (trazabilidad, complementa pct_aumento).';

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

-- Fix (revision de codigo, 23/08): guardarEscala() en precios.js lee/escribe
-- paritaria_id (FK real a public.paritarias) ademas de la etiqueta de texto
-- "paritaria" de arriba — nunca se habia agregado la columna.
alter table public.escalas_aumento
  add column if not exists paritaria_id uuid references public.paritarias(id) on delete set null;
comment on column public.escalas_aumento.paritaria_id is 'FK real a la paritaria de origen (complementa la etiqueta de texto "paritaria").';

-- objetivo_precios.escala_id se agrega recién acá (no en la definición de
-- objetivo_precios, más arriba en el archivo) porque escalas_aumento
-- todavía no existía en ese punto — referenciarla antes rompía el script.
alter table public.objetivo_precios
  add column if not exists escala_id uuid references public.escalas_aumento(id) on delete set null;
comment on column public.objetivo_precios.escala_id is 'Escala de aumento que originó este precio, si vino de aplicar una escala a un grupo.';


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

-- Fix (revision de codigo, 23/08): tipo/color se usan en precios.js y
-- negociaciones.js (cargarGrupos, el embed grupos_clientes!responsable_id
-- de crm_casos, crm_asignar_responsable) para distinguir filas
-- tipo='grupo' (agrupacion comercial) de tipo='responsable' (persona a
-- cargo de la negociacion) — nunca se habian agregado a esta tabla.
alter table public.grupos_clientes
  add column if not exists tipo  text not null default 'grupo' check (tipo in ('grupo','responsable')),
  add column if not exists color text;
comment on column public.grupos_clientes.tipo  is 'grupo = agrupacion comercial de clientes; responsable = persona a cargo de la negociacion (mismo catalogo, discriminado por tipo).';
comment on column public.grupos_clientes.color is 'Color para mostrar en UI (chips de Precios/CRM). Opcional.';


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

-- Fix (revision de codigo, 23/08): precios.js (abrirModalConfig,
-- guardarConfig, migrarImagenesNotas) lee/escribe logo_path/logo_nombre/
-- firma_path/firma_nombre — punteros a Supabase Storage, para migrar las
-- imagenes de base64 (arriba) a Storage. Nunca se habian agregado; sin
-- esto, abrir "Configuración de notas" en Precios tira error.
alter table public.notas_config
  add column if not exists logo_path   text,
  add column if not exists logo_nombre text,
  add column if not exists firma_path  text,
  add column if not exists firma_nombre text;
comment on column public.notas_config.logo_path    is 'Path en Supabase Storage del logo/membrete (reemplaza membrete_header en base64).';
comment on column public.notas_config.firma_path   is 'Path en Supabase Storage de la firma escaneada (reemplaza firma_imagen en base64).';


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
select 'A definir', 'A definir'
where not exists (select 1 from public.notas_config);

-- 2) Ya habia una fila sin firmante -> la completa.
update public.notas_config
   set firmante_nombre = 'A definir',
       firmante_cargo  = 'A definir',
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
--   from information_schema.role_table_grants
--  where table_schema = 'public' and table_name in ('auditoria','auditoria_objetivo_precios')
--  order by table_name, grantee, privilege_type;


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

-- ===== v097b_crm.sql =====
-- =====================================================================
-- v097b - CRM de Negociacion (PARTE 2: CRM)
-- Consolidacion de scripts crm/ de FinFlow adaptada a Ohlimpia.
--
-- REQUISITO: haber corrido antes v097a_precios.sql (crea grupos_clientes
-- y notas_emitidas, que las funciones de aca referencian).
-- Idempotente: correrlo de nuevo no rompe nada.
--
-- Los bloques de PRUEBA interactiva (begin..rollback) estan comentados:
-- eran para correr a mano en el entorno de FinFlow.
-- =====================================================================

-- =====================================================================
-- CONTENIDO DE: sql/crm/abm_34_crm_casos.sql
-- =====================================================================

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

-- =====================================================================
-- CONTENIDO DE: sql/crm/abm_38_crm_acciones_bloque.sql
-- =====================================================================

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

-- =====================================================================
-- CONTENIDO DE: sql/crm/abm_39_crm_proxima_accion.sql
-- =====================================================================

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

-- =====================================================================
-- CONTENIDO DE: sql/crm/abm_40_crm_cambiar_estado_accion.sql
-- =====================================================================

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
-- [v097] Bloque de prueba/verificacion de FinFlow desactivado para la
-- migracion: era para correr a mano en su entorno. Comentar no cambia
-- nada del DDL que si se migra.
-- begin;
-- 
-- create temp table _p40 (caso uuid, accion uuid, paso text, resultado text) on commit drop;
-- 
-- do $$
-- declare
--   v_caso uuid;
--   v_acc  uuid;
--   v_n    integer;
-- begin
--   select id into v_caso from public.crm_casos
--    where estado not in ('cerrada','en_renegociacion') limit 1;
--   select id into v_acc from public.crm_acciones
--    where activa and not requiere_detalle order by orden limit 1;
-- 
--   if v_caso is null or v_acc is null then
--     insert into _p40(paso, resultado) values ('0 preparacion', 'SIN DATOS: no hay caso o accion para probar');
--     return;
--   end if;
--   insert into _p40(caso, accion) values (v_caso, v_acc);
-- 
--   -- 1) sin accion: tiene que fallar
--   begin
--     perform public.crm_cambiar_estado(array[v_caso], 'en_renegociacion');
--     insert into _p40(paso, resultado) values ('1 sin accion', 'MAL - lo acepto sin accion');
--   exception when others then
--     insert into _p40(paso, resultado) values ('1 sin accion', 'OK - rechazado: ' || sqlerrm);
--   end;
-- 
--   -- 2) con accion y fecha: tiene que andar
--   select casos_actualizados into v_n
--     from public.crm_cambiar_estado(
--       array[v_caso], 'en_renegociacion', null, 'prueba abm_40', v_acc, current_date + 7);
--   insert into _p40(paso, resultado) values ('2 con accion y fecha', 'OK - actualizo ' || v_n || ' caso(s)');
-- end $$;
-- 
-- -- Resultado de los dos pasos.
-- select paso, resultado from _p40 where paso is not null order by paso;
-- 
-- -- Como quedo el caso de prueba (todo esto se deshace con el rollback).
-- select c.estado,
--        a.nombre                as accion,
--        c.fecha_proxima_accion  as fecha_tope,
--        right(c.observaciones, 40) as final_de_observaciones
--   from public.crm_casos c
--   join _p40 p on p.caso = c.id
--   left join public.crm_acciones a on a.id = c.proxima_accion_id
--  where p.paso is null;
-- 
-- rollback;

-- =====================================================================
-- CONTENIDO DE: sql/crm/abm_44_crm_fijar_proxima_accion.sql
-- =====================================================================

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
-- [v097] Bloque de prueba/verificacion de FinFlow desactivado para la
-- migracion: era para correr a mano en su entorno. Comentar no cambia
-- nada del DDL que si se migra.
-- begin;
-- 
-- create temp table _p44 (paso text, resultado text) on commit drop;
-- 
-- do $$
-- declare
--   v_vivo uuid;
--   v_pre  uuid;
--   v_acc  uuid;
--   v_n    integer;
-- begin
--   select id into v_vivo from public.crm_casos
--    where estado not in ('precerrada','cerrada') limit 1;
--   select id into v_pre  from public.crm_casos where estado = 'precerrada' limit 1;
--   select id into v_acc  from public.crm_acciones
--    where activa and not requiere_detalle order by orden limit 1;
-- 
--   if v_vivo is null or v_acc is null then
--     insert into _p44 values ('0 preparacion', 'SIN DATOS: falta un caso vivo o una accion');
--     return;
--   end if;
-- 
--   -- 1) sin fecha: tiene que fallar
--   begin
--     perform public.crm_fijar_proxima_accion(array[v_vivo], v_acc, null);
--     insert into _p44 values ('1 sin fecha', 'MAL - lo acepto');
--   exception when others then
--     insert into _p44 values ('1 sin fecha', 'OK rechazado: ' || sqlerrm);
--   end;
-- 
--   -- 2) sobre un caso vivo: tiene que andar
--   select casos_actualizados into v_n
--     from public.crm_fijar_proxima_accion(array[v_vivo], v_acc, current_date + 10, 'prueba abm_44');
--   insert into _p44 values ('2 caso vivo', 'OK actualizo ' || v_n || ' (esperado 1)');
-- 
--   -- 3) sobre un precerrado: NO tiene que tocarlo
--   if v_pre is null then
--     insert into _p44 values ('3 precerrado', 'no hay precerrados para probar');
--   else
--     select casos_actualizados into v_n
--       from public.crm_fijar_proxima_accion(array[v_pre], v_acc, current_date + 10);
--     insert into _p44 values ('3 precerrado', 'actualizo ' || v_n || ' (esperado 0)');
--   end if;
-- end $$;
-- 
-- select paso, resultado from _p44 order by paso;
-- 
-- rollback;

-- =====================================================================
-- CONTENIDO DE: sql/crm/abm_45_crm_gestion_tipos.sql
-- =====================================================================

-- =====================================================================
-- CRM — "QUE SE HIZO" en las gestiones. El canal pasa a opcional.
--
-- EL PROBLEMA
-- Hoy el unico campo obligatorio de una gestion es el CANAL, que es justo el que
-- menos importa: "mail" o "telefono" no dicen nada. Lo que importa es QUE PASO —
-- se envio presupuesto, se negocio precio, se hablo con el Coordinador.
--
-- Y hay un problema practico: un campo obligatorio que a nadie le importa se
-- completa mal. Comercial va a elegir cualquier canal para poder guardar, y la
-- unica estadistica que ese campo podria dar queda sucia.
--
-- LO QUE CAMBIA
--   · "que se hizo" (tipo_id) -> lista predefinida y OBLIGATORIO. Es el agrupable.
--   · canal -> OPCIONAL.
--   · el texto libre (descripcion) queda igual.
--
-- POR QUE NO COMPARTE LISTA CON LAS PROXIMAS ACCIONES
-- Son dos preguntas distintas: "que hice" y "que falta y de quien depende". Pero
-- SE CONECTAN, y el vinculo va como DATO y no en el codigo: cada tipo declara en
-- cumple_accion_id que accion pendiente cierra. Si viviera en el JavaScript, el
-- dia que se agregue un tipo nadie se acordaria de ensenarle que cumple.
--
-- ATENCION — LA PANTALLA Y ESTE SCRIPT VAN JUNTOS.
-- El bloque 5 pone tipo_id NOT NULL. La version de crm.js que manda ese campo
-- entra en el mismo commit: con la pantalla vieja, "Anotar gestion" fallaria.
--
-- Correr BLOQUE POR BLOQUE.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Tabla de tipos de gestion
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
  -- nada — peor que no tenerla.

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
-- BLOQUE 2 — Carga de la lista PROVISORIA
--
-- Juan la cierra con Comercial el lunes 27 de julio de 2026, junto con la de
-- proximas acciones (las dos se definen en la misma conversacion: el vinculo de
-- abajo solo se puede decidir con las dos listas a la vista).
--
-- AJUSTAR NOMBRES DESPUES ES UN UPDATE, no hace falta re-correr el script.
--
-- Las 9 y 10 son RESULTADOS, no acciones nuestras. Van igual porque son las que
-- disparan cambios de estado, y hoy ese momento —"aca fue cuando acepto"— no
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
  ('Se envió la nota de aumento',            10, null),
  ('Se reenvió la nota',                     20, (select id from public.crm_acciones where nombre = 'Reenviar la nota')),
  ('Se reclamó respuesta',                   30, (select id from public.crm_acciones where nombre = 'Esperando respuesta del cliente')),
  ('Se envió una nueva propuesta',           40, (select id from public.crm_acciones where nombre = 'Enviar nueva propuesta al cliente')),
  ('Se negoció el precio',                   50, null),
  ('Se habló con el Coordinador de Cuenta',  60, (select id from public.crm_acciones where nombre = 'A resolver con el Coordinador de Cuenta')),
  ('Se habló con el Consejo o la administración', 70, (select id from public.crm_acciones where nombre = 'A resolver con el Consejo')),
  ('Se recibió documentación',               80, (select id from public.crm_acciones where nombre = 'Esperando documentación del cliente')),
  ('El cliente aceptó',                      90, null),
  ('El cliente pidió una rebaja',           100, null),
  ('Otro',                                  110, null)
on conflict (nombre) do nothing;


-- =====================================================================
-- BLOQUE 3 — Los cambios en crm_gestiones
--
-- canal: se le saca el NOT NULL. El CHECK no hace falta tocarlo — un CHECK solo
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

-- Fix (revision de codigo, 23/08): el BLOQUE 4 de mas abajo (relleno de
-- gestiones existentes) y crm_generar_casos() ya usan g.origen /
-- origen='envio_nota', y ese INSERT hace "ON CONFLICT (caso_id) WHERE
-- origen='envio_nota'" — pero la columna origen y el indice unico parcial
-- que ese ON CONFLICT necesita nunca se habian creado.
alter table public.crm_gestiones
  add column if not exists origen text;
comment on column public.crm_gestiones.origen is
  'Quien/que generó esta gestión automáticamente (ej. "envio_nota" cuando el sistema manda la nota de aumento). NULL para gestiones cargadas a mano.';
create unique index if not exists idx_crm_gestiones_origen_envio_nota
  on public.crm_gestiones (caso_id) where origen = 'envio_nota';


-- =====================================================================
-- BLOQUE 4 — RELLENO de las gestiones que ya existen
--
-- Las unicas que hay son las del envio de la nota, que el sistema creo con
-- origen = 'envio_nota'. Tienen un tipo natural, asi que el relleno es exacto y no
-- inventa nada.
-- =====================================================================
update public.crm_gestiones g
   set tipo_id = (select id from public.crm_gestion_tipos where nombre = 'Se envió la nota de aumento')
 where g.tipo_id is null
   and g.origen = 'envio_nota';

-- Control: tiene que dar CERO. Si da mas, hay gestiones sin tipo que el bloque 5
-- no va a poder dejar obligatorias — mirar cuales antes de seguir.
select count(*) as gestiones_sin_tipo
  from public.crm_gestiones
 where tipo_id is null;


-- =====================================================================
-- BLOQUE 5 — tipo_id OBLIGATORIO
--
-- Solo si el control del bloque 4 dio CERO.
--
-- Va en la base y no solo en la pantalla por lo mismo de siempre: desde el
-- navegador se puede saltear. Una gestion sin tipo no se puede rellenar despues —
-- nadie va a releer doscientas notas de texto libre para clasificarlas.
-- =====================================================================
alter table public.crm_gestiones
  alter column tipo_id set not null;


-- =====================================================================
-- BLOQUE 6 — La gestion del envio nace con su tipo
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
   where nombre = 'Se envió la nota de aumento';
  if v_tipo is null then
    raise exception 'Falta el tipo de gestion "Se envió la nota de aumento" en crm_gestion_tipos.'
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
-- BLOQUE 7 — RLS y permisos de crm_gestion_tipos
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
-- BLOQUE 8 — VERIFICACION (solo lee)
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
-- CONTENIDO DE: sql/crm/abm_46_crm_registrar_gestion.sql
-- =====================================================================

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
-- [v097] Bloque de prueba/verificacion de FinFlow desactivado para la
-- migracion: era para correr a mano en su entorno. Comentar no cambia
-- nada del DDL que si se migra.
-- begin;
-- 
-- create temp table _p46 (paso text, resultado text) on commit drop;
-- 
-- do $$
-- declare
--   v_caso  uuid;
--   v_tipo  uuid;
--   v_acc1  uuid;
--   v_acc2  uuid;
--   r       record;
--   v_sella uuid;
--   v_nueva uuid;
-- begin
--   select id into v_caso from public.crm_casos
--    where estado not in ('precerrada','cerrada') limit 1;
--   select id into v_tipo from public.crm_gestion_tipos
--    where activa and estado_sugerido is null order by orden limit 1;
--   select id into v_acc1 from public.crm_acciones where activa and not requiere_detalle order by orden limit 1;
--   select id into v_acc2 from public.crm_acciones where activa and not requiere_detalle and id <> v_acc1 order by orden limit 1;
-- 
--   if v_caso is null or v_tipo is null or v_acc1 is null or v_acc2 is null then
--     insert into _p46 values ('0 preparacion', 'SIN DATOS para probar');
--     return;
--   end if;
-- 
--   -- Se deja un eslabon pendiente conocido.
--   perform public.crm_fijar_proxima_accion(array[v_caso], v_acc1, current_date + 5, null);
-- 
--   -- 1) Sin descripcion: tiene que fallar.
--   begin
--     perform public.crm_registrar_gestion(v_caso, v_tipo, current_date, '   ');
--     insert into _p46 values ('1 sin descripcion', 'MAL - lo acepto');
--   exception when others then
--     insert into _p46 values ('1 sin descripcion', 'OK rechazado: ' || sqlerrm);
--   end;
-- 
--   -- 2) La cadena avanza: cumple el eslabon y engancha el siguiente.
--   select * into r from public.crm_registrar_gestion(
--     v_caso, v_tipo, current_date, 'prueba abm_46', 'celular', null,
--     null, null, v_acc2, current_date + 12, null);
-- 
--   select cumplio_accion_id into v_sella from public.crm_gestiones where id = r.gestion_id;
--   select proxima_accion_id into v_nueva from public.crm_casos where id = v_caso;
-- 
--   insert into _p46 values ('2 eslabon sellado',
--     case when v_sella = v_acc1 then 'OK - sello la accion que estaba pendiente'
--          else 'MAL - sello ' || coalesce(v_sella::text,'null') end);
--   insert into _p46 values ('3 agenda avanzo',
--     case when v_nueva = v_acc2 then 'OK - quedo la accion nueva'
--          else 'MAL - quedo ' || coalesce(v_nueva::text,'null') end);
--   insert into _p46 values ('4 estado',
--     case when r.estado_cambiado then 'MAL - movio el estado sin pedirselo'
--          else 'OK - no toco el estado' end);
-- 
--   -- 5) Camino suelto: no se manda accion, la agenda no se toca y no sella nada.
--   select * into r from public.crm_registrar_gestion(
--     v_caso, v_tipo, current_date, 'prueba suelta abm_46');
--   select cumplio_accion_id into v_sella from public.crm_gestiones where id = r.gestion_id;
--   select proxima_accion_id into v_nueva from public.crm_casos where id = v_caso;
--   insert into _p46 values ('5 camino suelto',
--     case when v_sella is null and v_nueva = v_acc2
--          then 'OK - no sello nada y dejo la agenda igual'
--          else 'MAL - toco algo' end);
-- end $$;
-- 
-- select paso, resultado from _p46 order by paso;
-- 
-- rollback;

-- =====================================================================
-- CONTENIDO DE: sql/crm/abm_47_crm_acciones_depende_de.sql
-- =====================================================================

-- =====================================================================
-- CRM — de QUIEN DEPENDE cada proxima accion.
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
-- BLOQUE 1 — La columna
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
-- BLOQUE 2 — Clasificacion de las siete acciones
--
-- Solo donde esta en null: no pisa una clasificacion hecha a mano.
--
-- "Otro" QUEDA SIN CLASIFICAR A PROPOSITO. Es ambiguo —puede ser de cualquiera de
-- las dos— y la decision ya tomada es PARTIRLO EN DOS ("Otro - estoy esperando
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
   'Esperando documentación del cliente'
 );

update public.crm_acciones set depende_de = 'nosotros'
 where depende_de is null and nombre in (
   'Enviar nueva propuesta al cliente',
   'Reenviar la nota'
 );


-- =====================================================================
-- BLOQUE 3 — VERIFICACION (solo lee)
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
-- CONTENIDO DE: sql/crm/abm_48_crm_generar_casos_con_accion.sql
-- =====================================================================

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

-- ===== v098_matriz_accesos_perfiles.sql =====
-- =============================================================================
-- Migración: v098 — Matriz de accesos y perfiles (tab "Acceso y perfiles")
-- Fecha:     2026-08-24
-- Fuente:    MATRIZ_ACCESOS_PERFILES.xlsx — hoja "MATRIZ PERFILES"
--            (seed generado por scripts/gen_v098.cjs desde el CSV exportado)
-- =============================================================================
--
-- MODELO
-- ------
-- * perfil_accesos: la PLANTILLA editable por perfil ("El perfil es la
--   PLANTILLA que precarga la grilla del usuario; después se ajusta
--   individual" — nota de la propia planilla). Nivel: 2=M modificar,
--   1=L solo lectura, 0=— sin acceso.
-- * usuario_accesos: override INDIVIDUAL por usuario (misma escala).
--   Efectivo = override usuario ?? plantilla perfil ?? fallback PERFILES.
--   Los 4 módulos "(futuro)" se persisten igual aunque todavía no tengan
--   pantalla, para que cuando existan ya estén configurados.
-- * RLS: lectura para cualquier autenticado (el menú la necesita para
--   decidir qué mostrar); escritura SOLO Administrador total (mismo
--   patrón que usuarios_update_propio_o_admin en v013).
--
BEGIN;

CREATE TABLE IF NOT EXISTS public.perfil_accesos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  perfil     text NOT NULL,
  modulo_key text NOT NULL,
  nivel      smallint NOT NULL DEFAULT 0 CHECK (nivel IN (0,1,2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil, modulo_key)
);

CREATE TABLE IF NOT EXISTS public.usuario_accesos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  modulo_key text NOT NULL,
  nivel      smallint NOT NULL DEFAULT 0 CHECK (nivel IN (0,1,2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, modulo_key)
);

ALTER TABLE public.perfil_accesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_accesos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accesos_select_authenticated" ON public.perfil_accesos;
CREATE POLICY "accesos_select_authenticated" ON public.perfil_accesos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "accesos_write_admin_total" ON public.perfil_accesos;
CREATE POLICY "accesos_write_admin_total" ON public.perfil_accesos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'));

DROP POLICY IF EXISTS "usuario_accesos_select_authenticated" ON public.usuario_accesos;
CREATE POLICY "usuario_accesos_select_authenticated" ON public.usuario_accesos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "usuario_accesos_write_admin_total" ON public.usuario_accesos;
CREATE POLICY "usuario_accesos_write_admin_total" ON public.usuario_accesos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'));

-- -----------------------------------------------------------------------------
-- SEED — exacto a la hoja "MATRIZ PERFILES" (M=2 · L=1 · —=0)
-- -----------------------------------------------------------------------------
INSERT INTO public.perfil_accesos (perfil, modulo_key, nivel) VALUES
  ('Administrador total', 'liq_admin', 2), ('Gerencia General', 'liq_admin', 2), ('Consejo Directivo', 'liq_admin', 1), ('Finanzas', 'liq_admin', 2), ('RRHH', 'liq_admin', 0), ('Logística', 'liq_admin', 0),
  ('Auditor', 'liq_admin', 0), ('Supervisor', 'liq_admin', 0), ('Comercial', 'liq_admin', 0), ('Operaciones', 'liq_admin', 0), ('DEVELOPER', 'liq_admin', 2), ('Administrador total', 'liquidacion', 2),
  ('Gerencia General', 'liquidacion', 2), ('Consejo Directivo', 'liquidacion', 1), ('Finanzas', 'liquidacion', 2), ('RRHH', 'liquidacion', 1), ('Logística', 'liquidacion', 0), ('Auditor', 'liquidacion', 1),
  ('Supervisor', 'liquidacion', 1), ('Comercial', 'liquidacion', 0), ('Operaciones', 'liquidacion', 2), ('DEVELOPER', 'liquidacion', 2), ('Administrador total', 'mantenimiento', 2), ('Gerencia General', 'mantenimiento', 2),
  ('Consejo Directivo', 'mantenimiento', 1), ('Finanzas', 'mantenimiento', 2), ('RRHH', 'mantenimiento', 1), ('Logística', 'mantenimiento', 0), ('Auditor', 'mantenimiento', 0), ('Supervisor', 'mantenimiento', 1),
  ('Comercial', 'mantenimiento', 0), ('Operaciones', 'mantenimiento', 2), ('DEVELOPER', 'mantenimiento', 2), ('Administrador total', 'reasignaciones', 2), ('Gerencia General', 'reasignaciones', 2), ('Consejo Directivo', 'reasignaciones', 1),
  ('Finanzas', 'reasignaciones', 0), ('RRHH', 'reasignaciones', 1), ('Logística', 'reasignaciones', 0), ('Auditor', 'reasignaciones', 0), ('Supervisor', 'reasignaciones', 1), ('Comercial', 'reasignaciones', 0),
  ('Operaciones', 'reasignaciones', 2), ('DEVELOPER', 'reasignaciones', 2), ('Administrador total', 'retenes', 2), ('Gerencia General', 'retenes', 2), ('Consejo Directivo', 'retenes', 1), ('Finanzas', 'retenes', 2),
  ('RRHH', 'retenes', 1), ('Logística', 'retenes', 0), ('Auditor', 'retenes', 1), ('Supervisor', 'retenes', 1), ('Comercial', 'retenes', 0), ('Operaciones', 'retenes', 2),
  ('DEVELOPER', 'retenes', 2), ('Administrador total', 'clientes', 2), ('Gerencia General', 'clientes', 2), ('Consejo Directivo', 'clientes', 1), ('Finanzas', 'clientes', 1), ('RRHH', 'clientes', 0),
  ('Logística', 'clientes', 1), ('Auditor', 'clientes', 0), ('Supervisor', 'clientes', 0), ('Comercial', 'clientes', 2), ('Operaciones', 'clientes', 1), ('DEVELOPER', 'clientes', 2),
  ('Administrador total', 'comisiones', 2), ('Gerencia General', 'comisiones', 2), ('Consejo Directivo', 'comisiones', 1), ('Finanzas', 'comisiones', 2), ('RRHH', 'comisiones', 0), ('Logística', 'comisiones', 0),
  ('Auditor', 'comisiones', 0), ('Supervisor', 'comisiones', 0), ('Comercial', 'comisiones', 2), ('Operaciones', 'comisiones', 0), ('DEVELOPER', 'comisiones', 2), ('Administrador total', 'crm', 2),
  ('Gerencia General', 'crm', 2), ('Consejo Directivo', 'crm', 1), ('Finanzas', 'crm', 0), ('RRHH', 'crm', 0), ('Logística', 'crm', 0), ('Auditor', 'crm', 0),
  ('Supervisor', 'crm', 0), ('Comercial', 'crm', 2), ('Operaciones', 'crm', 0), ('DEVELOPER', 'crm', 2), ('Administrador total', 'cobros', 2), ('Gerencia General', 'cobros', 2),
  ('Consejo Directivo', 'cobros', 1), ('Finanzas', 'cobros', 2), ('RRHH', 'cobros', 0), ('Logística', 'cobros', 0), ('Auditor', 'cobros', 0), ('Supervisor', 'cobros', 0),
  ('Comercial', 'cobros', 2), ('Operaciones', 'cobros', 0), ('DEVELOPER', 'cobros', 2), ('Administrador total', 'precios', 2), ('Gerencia General', 'precios', 2), ('Consejo Directivo', 'precios', 1),
  ('Finanzas', 'precios', 2), ('RRHH', 'precios', 0), ('Logística', 'precios', 0), ('Auditor', 'precios', 0), ('Supervisor', 'precios', 0), ('Comercial', 'precios', 2),
  ('Operaciones', 'precios', 0), ('DEVELOPER', 'precios', 2), ('Administrador total', 'reclamos', 2), ('Gerencia General', 'reclamos', 2), ('Consejo Directivo', 'reclamos', 2), ('Finanzas', 'reclamos', 2),
  ('RRHH', 'reclamos', 2), ('Logística', 'reclamos', 2), ('Auditor', 'reclamos', 2), ('Supervisor', 'reclamos', 2), ('Comercial', 'reclamos', 2), ('Operaciones', 'reclamos', 1),
  ('DEVELOPER', 'reclamos', 2), ('Administrador total', 'objetivos', 2), ('Gerencia General', 'objetivos', 2), ('Consejo Directivo', 'objetivos', 1), ('Finanzas', 'objetivos', 1), ('RRHH', 'objetivos', 1),
  ('Logística', 'objetivos', 1), ('Auditor', 'objetivos', 1), ('Supervisor', 'objetivos', 1), ('Comercial', 'objetivos', 2), ('Operaciones', 'objetivos', 2), ('DEVELOPER', 'objetivos', 2),
  ('Administrador total', 'supervision', 2), ('Gerencia General', 'supervision', 2), ('Consejo Directivo', 'supervision', 1), ('Finanzas', 'supervision', 2), ('RRHH', 'supervision', 0), ('Logística', 'supervision', 0),
  ('Auditor', 'supervision', 0), ('Supervisor', 'supervision', 0), ('Comercial', 'supervision', 1), ('Operaciones', 'supervision', 1), ('DEVELOPER', 'supervision', 2), ('Administrador total', 'supervisores', 2),
  ('Gerencia General', 'supervisores', 2), ('Consejo Directivo', 'supervisores', 1), ('Finanzas', 'supervisores', 1), ('RRHH', 'supervisores', 1), ('Logística', 'supervisores', 0), ('Auditor', 'supervisores', 0),
  ('Supervisor', 'supervisores', 1), ('Comercial', 'supervisores', 1), ('Operaciones', 'supervisores', 2), ('DEVELOPER', 'supervisores', 2), ('Administrador total', 'legajos', 2), ('Gerencia General', 'legajos', 2),
  ('Consejo Directivo', 'legajos', 1), ('Finanzas', 'legajos', 1), ('RRHH', 'legajos', 2), ('Logística', 'legajos', 0), ('Auditor', 'legajos', 0), ('Supervisor', 'legajos', 0),
  ('Comercial', 'legajos', 0), ('Operaciones', 'legajos', 1), ('DEVELOPER', 'legajos', 2), ('Administrador total', 'capacitaciones', 2), ('Gerencia General', 'capacitaciones', 2), ('Consejo Directivo', 'capacitaciones', 1),
  ('Finanzas', 'capacitaciones', 0), ('RRHH', 'capacitaciones', 2), ('Logística', 'capacitaciones', 2), ('Auditor', 'capacitaciones', 0), ('Supervisor', 'capacitaciones', 1), ('Comercial', 'capacitaciones', 0),
  ('Operaciones', 'capacitaciones', 2), ('DEVELOPER', 'capacitaciones', 2), ('Administrador total', 'competencia', 2), ('Gerencia General', 'competencia', 2), ('Consejo Directivo', 'competencia', 1), ('Finanzas', 'competencia', 1),
  ('RRHH', 'competencia', 2), ('Logística', 'competencia', 1), ('Auditor', 'competencia', 1), ('Supervisor', 'competencia', 1), ('Comercial', 'competencia', 1), ('Operaciones', 'competencia', 1),
  ('DEVELOPER', 'competencia', 2), ('Administrador total', 'descansos', 2), ('Gerencia General', 'descansos', 2), ('Consejo Directivo', 'descansos', 1), ('Finanzas', 'descansos', 0), ('RRHH', 'descansos', 2),
  ('Logística', 'descansos', 0), ('Auditor', 'descansos', 0), ('Supervisor', 'descansos', 1), ('Comercial', 'descansos', 0), ('Operaciones', 'descansos', 2), ('DEVELOPER', 'descansos', 2),
  ('Administrador total', 'enfermos', 2), ('Gerencia General', 'enfermos', 2), ('Consejo Directivo', 'enfermos', 1), ('Finanzas', 'enfermos', 0), ('RRHH', 'enfermos', 2), ('Logística', 'enfermos', 0),
  ('Auditor', 'enfermos', 0), ('Supervisor', 'enfermos', 1), ('Comercial', 'enfermos', 0), ('Operaciones', 'enfermos', 1), ('DEVELOPER', 'enfermos', 2), ('Administrador total', 'sanciones', 2),
  ('Gerencia General', 'sanciones', 2), ('Consejo Directivo', 'sanciones', 1), ('Finanzas', 'sanciones', 1), ('RRHH', 'sanciones', 2), ('Logística', 'sanciones', 1), ('Auditor', 'sanciones', 1),
  ('Supervisor', 'sanciones', 1), ('Comercial', 'sanciones', 1), ('Operaciones', 'sanciones', 2), ('DEVELOPER', 'sanciones', 2), ('Administrador total', 'legal', 2), ('Gerencia General', 'legal', 2),
  ('Consejo Directivo', 'legal', 1), ('Finanzas', 'legal', 0), ('RRHH', 'legal', 2), ('Logística', 'legal', 0), ('Auditor', 'legal', 0), ('Supervisor', 'legal', 0),
  ('Comercial', 'legal', 0), ('Operaciones', 'legal', 0), ('DEVELOPER', 'legal', 2), ('Administrador total', 'vacaciones', 2), ('Gerencia General', 'vacaciones', 2), ('Consejo Directivo', 'vacaciones', 1),
  ('Finanzas', 'vacaciones', 0), ('RRHH', 'vacaciones', 2), ('Logística', 'vacaciones', 0), ('Auditor', 'vacaciones', 0), ('Supervisor', 'vacaciones', 0), ('Comercial', 'vacaciones', 0),
  ('Operaciones', 'vacaciones', 0), ('DEVELOPER', 'vacaciones', 2), ('Administrador total', 'monotributos', 2), ('Gerencia General', 'monotributos', 2), ('Consejo Directivo', 'monotributos', 1), ('Finanzas', 'monotributos', 2),
  ('RRHH', 'monotributos', 2), ('Logística', 'monotributos', 0), ('Auditor', 'monotributos', 0), ('Supervisor', 'monotributos', 0), ('Comercial', 'monotributos', 0), ('Operaciones', 'monotributos', 0),
  ('DEVELOPER', 'monotributos', 2), ('Administrador total', 'uniformes', 2), ('Gerencia General', 'uniformes', 2), ('Consejo Directivo', 'uniformes', 1), ('Finanzas', 'uniformes', 1), ('RRHH', 'uniformes', 2),
  ('Logística', 'uniformes', 2), ('Auditor', 'uniformes', 1), ('Supervisor', 'uniformes', 2), ('Comercial', 'uniformes', 1), ('Operaciones', 'uniformes', 1), ('DEVELOPER', 'uniformes', 2),
  ('Administrador total', 'categorias', 2), ('Gerencia General', 'categorias', 2), ('Consejo Directivo', 'categorias', 1), ('Finanzas', 'categorias', 1), ('RRHH', 'categorias', 2), ('Logística', 'categorias', 0),
  ('Auditor', 'categorias', 0), ('Supervisor', 'categorias', 1), ('Comercial', 'categorias', 1), ('Operaciones', 'categorias', 1), ('DEVELOPER', 'categorias', 2), ('Administrador total', 'feriados', 2),
  ('Gerencia General', 'feriados', 2), ('Consejo Directivo', 'feriados', 1), ('Finanzas', 'feriados', 1), ('RRHH', 'feriados', 2), ('Logística', 'feriados', 1), ('Auditor', 'feriados', 0),
  ('Supervisor', 'feriados', 1), ('Comercial', 'feriados', 1), ('Operaciones', 'feriados', 1), ('DEVELOPER', 'feriados', 2), ('Administrador total', 'paritarias', 2), ('Gerencia General', 'paritarias', 2),
  ('Consejo Directivo', 'paritarias', 1), ('Finanzas', 'paritarias', 1), ('RRHH', 'paritarias', 2), ('Logística', 'paritarias', 0), ('Auditor', 'paritarias', 0), ('Supervisor', 'paritarias', 0),
  ('Comercial', 'paritarias', 1), ('Operaciones', 'paritarias', 0), ('DEVELOPER', 'paritarias', 2), ('Administrador total', 'smvm', 2), ('Gerencia General', 'smvm', 2), ('Consejo Directivo', 'smvm', 1),
  ('Finanzas', 'smvm', 1), ('RRHH', 'smvm', 2), ('Logística', 'smvm', 0), ('Auditor', 'smvm', 0), ('Supervisor', 'smvm', 0), ('Comercial', 'smvm', 1),
  ('Operaciones', 'smvm', 0), ('DEVELOPER', 'smvm', 2), ('Administrador total', 'configuracion', 2), ('Gerencia General', 'configuracion', 2), ('Consejo Directivo', 'configuracion', 2), ('Finanzas', 'configuracion', 1),
  ('RRHH', 'configuracion', 1), ('Logística', 'configuracion', 1), ('Auditor', 'configuracion', 1), ('Supervisor', 'configuracion', 1), ('Comercial', 'configuracion', 1), ('Operaciones', 'configuracion', 1),
  ('DEVELOPER', 'configuracion', 2), ('Administrador total', 'pedido_productos', 2), ('Gerencia General', 'pedido_productos', 2), ('Consejo Directivo', 'pedido_productos', 1), ('Finanzas', 'pedido_productos', 2), ('RRHH', 'pedido_productos', 0),
  ('Logística', 'pedido_productos', 2), ('Auditor', 'pedido_productos', 2), ('Supervisor', 'pedido_productos', 2), ('Comercial', 'pedido_productos', 1), ('Operaciones', 'pedido_productos', 1), ('DEVELOPER', 'pedido_productos', 2),
  ('Administrador total', 'proveedores', 2), ('Gerencia General', 'proveedores', 2), ('Consejo Directivo', 'proveedores', 1), ('Finanzas', 'proveedores', 2), ('RRHH', 'proveedores', 0), ('Logística', 'proveedores', 2),
  ('Auditor', 'proveedores', 0), ('Supervisor', 'proveedores', 0), ('Comercial', 'proveedores', 1), ('Operaciones', 'proveedores', 1), ('DEVELOPER', 'proveedores', 2), ('Administrador total', 'stock', 2),
  ('Gerencia General', 'stock', 2), ('Consejo Directivo', 'stock', 1), ('Finanzas', 'stock', 1), ('RRHH', 'stock', 0), ('Logística', 'stock', 2), ('Auditor', 'stock', 1),
  ('Supervisor', 'stock', 0), ('Comercial', 'stock', 0), ('Operaciones', 'stock', 1), ('DEVELOPER', 'stock', 2), ('Administrador total', 'maquinas', 2), ('Gerencia General', 'maquinas', 2),
  ('Consejo Directivo', 'maquinas', 1), ('Finanzas', 'maquinas', 2), ('RRHH', 'maquinas', 0), ('Logística', 'maquinas', 2), ('Auditor', 'maquinas', 1), ('Supervisor', 'maquinas', 2),
  ('Comercial', 'maquinas', 1), ('Operaciones', 'maquinas', 1), ('DEVELOPER', 'maquinas', 2), ('Administrador total', 'futuro_cuenta_corriente', 2), ('Gerencia General', 'futuro_cuenta_corriente', 2), ('Consejo Directivo', 'futuro_cuenta_corriente', 1),
  ('Finanzas', 'futuro_cuenta_corriente', 2), ('RRHH', 'futuro_cuenta_corriente', 0), ('Logística', 'futuro_cuenta_corriente', 0), ('Auditor', 'futuro_cuenta_corriente', 0), ('Supervisor', 'futuro_cuenta_corriente', 0), ('Comercial', 'futuro_cuenta_corriente', 1),
  ('Operaciones', 'futuro_cuenta_corriente', 0), ('DEVELOPER', 'futuro_cuenta_corriente', 2), ('Administrador total', 'futuro_contable', 2), ('Gerencia General', 'futuro_contable', 2), ('Consejo Directivo', 'futuro_contable', 1), ('Finanzas', 'futuro_contable', 2),
  ('RRHH', 'futuro_contable', 0), ('Logística', 'futuro_contable', 0), ('Auditor', 'futuro_contable', 0), ('Supervisor', 'futuro_contable', 0), ('Comercial', 'futuro_contable', 0), ('Operaciones', 'futuro_contable', 0),
  ('DEVELOPER', 'futuro_contable', 2), ('Administrador total', 'futuro_politicas', 2), ('Gerencia General', 'futuro_politicas', 2), ('Consejo Directivo', 'futuro_politicas', 1), ('Finanzas', 'futuro_politicas', 1), ('RRHH', 'futuro_politicas', 2),
  ('Logística', 'futuro_politicas', 1), ('Auditor', 'futuro_politicas', 1), ('Supervisor', 'futuro_politicas', 1), ('Comercial', 'futuro_politicas', 1), ('Operaciones', 'futuro_politicas', 1), ('DEVELOPER', 'futuro_politicas', 2),
  ('Administrador total', 'futuro_seguros', 2), ('Gerencia General', 'futuro_seguros', 2), ('Consejo Directivo', 'futuro_seguros', 1), ('Finanzas', 'futuro_seguros', 2), ('RRHH', 'futuro_seguros', 2), ('Logística', 'futuro_seguros', 1),
  ('Auditor', 'futuro_seguros', 0), ('Supervisor', 'futuro_seguros', 0), ('Comercial', 'futuro_seguros', 0), ('Operaciones', 'futuro_seguros', 1), ('DEVELOPER', 'futuro_seguros', 2)
ON CONFLICT (perfil, modulo_key) DO NOTHING;

COMMIT;

-- =============================================================================
-- DESPUÉS DE EJECUTAR:
--   1. Recargar la app: Configuración → Acceso y perfiles muestra la matriz
--      precargada y editable (los cambios se guardan en perfil_accesos).
--   2. Los usuarios siguen creándose en Supabase Auth (trigger de v013
--      autoprovisiona public.usuarios) o vía api/crear-usuario.js; el
--      override individual por usuario vive en usuario_accesos.
-- =============================================================================
-- (omitido a propósito: v099_usuarios_planilla_y_overrides.sql — overrides individuales reales de Ohlimpia)
-- ===== v100_proveedores_full.sql =====
-- ============================================================================
-- v100 — Módulo Proveedores (área Logística)
-- ============================================================================
-- La tabla public.proveedores YA EXISTE desde v094 (mínima: id_local, nombre,
-- codigo, estado, contacto, anulado). Este script la EXTIENDE con los campos
-- del mockup (mockup_proveedores_1.html) y crea la tabla de contactos.
--
-- No se recrea nada: los proveedores ya apuntados por pp_productos
-- (proveedor_id_local) y sembrados por _seedProveedoresDemo() quedan intactos.
--
-- Convenciones respetadas:
--   · id bigint identity PK + id_local text UNIQUE NOT NULL (supaSync).
--   · anulado boolean para borrado lógico (patrón del sistema).
--   · RLS espejo de v094: todo authenticated lee y escribe (la restricción
--     fina de quién modifica es responsabilidad del menú/UI vía la matriz
--     de accesos 'proveedores', igual que en v094).
--
-- Ejecutar en Supabase SQL Editor. Idempotente (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Nuevas columnas en proveedores (todas nullable — compatibilidad total
--    con las filas existentes de v094)
-- ---------------------------------------------------------------------------
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cuit               text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cond_arca          text;   -- 'Responsable Inscripto (Factura A)' | 'Monotributo (Factura C)' | 'Exento'
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS direccion          text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS mail               text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS telefono           text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cond_pago          text;   -- 'Contado' | 'Cta cte 30 días' | 'Contra factura c/ OK Logística'
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cbu_alias          text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS banco              text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS frecuencia         text;   -- 'Mensual' | 'Quincenal' | 'A demanda'
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS plazo_entrega_dias integer CHECK (plazo_entrega_dias IS NULL OR plazo_entrega_dias >= 0);
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS rubros             jsonb NOT NULL DEFAULT '[]'::jsonb;  -- ["PRODUCTOS","REPARACIÓN MÁQUINAS",...]
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS marcas             text;   -- marcas que distribuye (ej. Nimi: DV/SCJ/3M…)
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS observaciones      text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS creado_por         text;

COMMENT ON COLUMN public.proveedores.cond_arca IS 'Condición frente a ARCA (antes AFIP): etiqueta completa tal como se muestra';
COMMENT ON COLUMN public.proveedores.rubros      IS 'Rubros del proveedor (array jsonb): PRODUCTOS, REPARACIÓN MÁQUINAS, ALQUILER MÁQUINAS, UNIFORMES, OTRO';

-- Backfill de rubros vacíos explícito (por si alguna fila vieja quedó con NULL
-- antes de agregar el DEFAULT — el DEFAULT no retoca filas preexistentes).
UPDATE public.proveedores SET rubros = '[]'::jsonb WHERE rubros IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Tabla proveedor_contactos (ficha → sección Contactos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proveedor_contactos (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local           text UNIQUE NOT NULL,
  proveedor_id_local text NOT NULL,
  nombre             text NOT NULL,
  rol                text,
  celular            text,
  mail               text,
  anulado            boolean NOT NULL DEFAULT false,
  creado_por         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- FK coherente con pp_productos.proveedor_id_local (v094). Los proveedores
-- nunca se borran físico (borrado lógico), así que sin ON DELETE está bien.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proveedor_contactos_proveedor_fk'
  ) THEN
    ALTER TABLE public.proveedor_contactos
      ADD CONSTRAINT proveedor_contactos_proveedor_fk
      FOREIGN KEY (proveedor_id_local) REFERENCES public.proveedores(id_local);
  END IF;
END $$;

ALTER TABLE public.proveedor_contactos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proveedor_contactos_all ON public.proveedor_contactos;
CREATE POLICY proveedor_contactos_all ON public.proveedor_contactos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3) Verificación rápida (opcional, correr a mano):
--    SELECT column_name FROM information_schema.columns
--      WHERE table_name='proveedores' ORDER BY ordinal_position;
--    SELECT count(*) FROM public.proveedor_contactos;
-- ---------------------------------------------------------------------------

-- (Bloque v101 completo OMITIDO a propósito para CLEAN PAZ: carga el
-- inventario físico REAL de uniformes que Logística de Ohlimpia relevó
-- en su depósito el 14/08/2026 — no aplica a otra empresa. Además,
-- "uniformes" no está entre los módulos contratados por Clean Paz.)
-- INICIO BLOQUE OMITIDO -- v101_stock_inicial_uniformes.sql
-- -- ===== v101_stock_inicial_uniformes.sql =====
-- -- v101 — Stock inicial de uniformes (ticket "Stock inicial de uniformes", 08/2026)
-- --
-- -- Carga el inventario físico que Logística relevó en depósito (14/08/2026,
-- -- 1.080 unidades en 6 prendas: BUZO, AMBO, CAMPERA, CALZADO/Zapatos,
-- -- PANTALON/Grafa, CHOMBA) como punto de partida del stock del módulo
-- -- Uniformes, para que las salidas (pedidos) y entradas (compras) varíen
-- -- correctamente a partir de esa base.
-- --
-- -- No agrega columnas ni tablas nuevas: stock_uniformes y
-- -- stock_uniformes_movimientos (v071) ya tenían todo lo necesario.
-- --
-- -- ENFOQUE ELEGIDO: se reconcilia igual que un conteo físico (ver
-- -- guardarConteoFisico() en src/modules/uniformes/stock.js) — un movimiento
-- -- tipo:'ajuste' por cada combinación prenda/talle, con
-- -- cantidad = valor_del_archivo - cantidad_actual_en_sistema. Esto:
-- --   1) deja stock_uniformes_movimientos como ledger consistente (el nivel
-- --      siempre es la suma de sus movimientos, sin doble conteo);
-- --   2) reconcilia sin problema las 4 filas de prueba que ya existían
-- --      (Ambo/M, Zapatos/42, Chomba/L, Polar/L, las 4 en cantidad -1 —
-- --      quedaron así por pedidos reales descontados antes de que hubiera
-- --      stock inicial cargado, el mismo problema que este ticket resuelve);
-- --   3) funciona igual si la fila prenda/talle ya existe o no.
-- --
-- -- Equivalencias de nombre (archivo de Logística → catálogo del módulo):
-- --   CALZADO → Zapatos · PANTALON → Grafa (pantalón grafa) · resto, igual.
-- -- POLAR: sin stock informado (0 unidades, confirmado por Logística) pero
-- -- tenía la fila de prueba Polar/L en -1 → se reconcilia a 0 explícitamente.
-- -- REMERA: sin stock informado y sin prenda propia en el catálogo todavía
-- -- (no se crea fila — agregar a PRENDAS/TALLES_POR_PRENDA en catalogos.js
-- -- si Logística la releva a futuro).
-- --
-- -- Talles: unificados a notación numérica S/M/L/XL/2XL/3XL/4XL/5XL en todo
-- -- el catálogo (ver catalogos.js TALLES_POR_PRENDA — antes usaba
-- -- XXL/XXXL/XXXXL para Buzo/Ambo/Chomba/Polar/Campera, y el select de
-- -- "Talle de ambo" en Altas/Documentación usaba una tercera notación mixta
-- -- S..XL,XXL,XXXL,4XL,5XL; con el stock inicial llegando en notación
-- -- numérica hasta 5XL para Buzo y Ambo, se adoptó esa como única
-- -- convención en todo el proyecto).
-- --
-- -- Aplicado a producción manualmente el 25/08/2026 vía script Node
-- -- (mismo cálculo que este SQL). Este archivo documenta esa carga de forma
-- -- idempotente (el guard de abajo evita duplicar si se corre más de una
-- -- vez) — es el "script SQL de seed" pedido como entregable del ticket.
-- 
-- do $$
-- declare
--   v_ya_importado boolean;
-- begin
--   select exists(select 1 from stock_uniformes_movimientos where ref_tipo = 'stock_inicial')
--     into v_ya_importado;
--   if v_ya_importado then
--     raise notice 'Stock inicial ya importado (existe un movimiento con ref_tipo=stock_inicial) — no se repite.';
--     return;
--   end if;
-- 
--   create temporary table _stock_inicial_csv (prenda text, talle text, cantidad numeric) on commit drop;
--   insert into _stock_inicial_csv (prenda, talle, cantidad) values
--     ('Buzo','S',23),('Buzo','M',31),('Buzo','L',17),('Buzo','XL',20),
--     ('Buzo','2XL',40),('Buzo','3XL',30),('Buzo','4XL',16),('Buzo','5XL',17),
--     ('Ambo','S',40),('Ambo','M',35),('Ambo','L',35),('Ambo','XL',20),
--     ('Ambo','2XL',30),('Ambo','3XL',21),('Ambo','4XL',23),('Ambo','5XL',11),
--     ('Campera','S',10),('Campera','M',13),('Campera','L',12),('Campera','XL',15),('Campera','2XL',10),
--     ('Zapatos','35',19),('Zapatos','36',8),('Zapatos','37',7),('Zapatos','38',3),
--     ('Zapatos','39',11),('Zapatos','40',8),('Zapatos','41',6),('Zapatos','42',10),
--     ('Zapatos','43',17),('Zapatos','44',25),('Zapatos','45',11),('Zapatos','46',1),
--     ('Grafa','36',59),('Grafa','38',4),('Grafa','40',50),('Grafa','42',10),
--     ('Grafa','44',29),('Grafa','46',25),('Grafa','48',40),('Grafa','50',30),
--     ('Grafa','52',35),('Grafa','54',18),('Grafa','56',25),('Grafa','58',6),('Grafa','60',14),
--     ('Chomba','S',25),('Chomba','M',23),('Chomba','L',26),('Chomba','XL',10),
--     ('Chomba','2XL',12),('Chomba','3XL',40),('Chomba','4XL',4),
--     ('Polar','L',0); -- sin stock informado; reconcilia la fila de prueba vieja a 0
-- 
--   -- Crea las filas de stock_uniformes que todavía no existen, en 0
--   -- (el ajuste de abajo las deja en el valor del CSV).
--   insert into stock_uniformes (id_local, prenda, talle, cantidad)
--   select right((extract(epoch from clock_timestamp())::bigint * 1000 + row_number() over ())::text, 9),
--          c.prenda, c.talle, 0
--   from _stock_inicial_csv c
--   where not exists (
--     select 1 from stock_uniformes s where s.prenda = c.prenda and s.talle = c.talle
--   );
-- 
--   -- Ajusta cada fila al valor del archivo y registra el movimiento.
--   with deltas as (
--     select s.id, s.prenda, s.talle, s.cantidad as actual, c.cantidad as objetivo,
--            (c.cantidad - s.cantidad) as delta
--     from stock_uniformes s
--     join _stock_inicial_csv c on c.prenda = s.prenda and c.talle = s.talle
--   )
--   update stock_uniformes s
--   set cantidad = d.objetivo, updated_at = now()
--   from deltas d
--   where s.id = d.id and d.delta <> 0;
-- 
--   insert into stock_uniformes_movimientos (id_local, tipo, prenda, talle, cantidad, motivo, ref_tipo, ref_id_local, registrado_por)
--   select right((extract(epoch from clock_timestamp())::bigint * 1000 + row_number() over ())::text, 9),
--          'ajuste', d.prenda, d.talle, d.delta,
--          'Stock inicial — inventario físico Logística 14/08/2026' ||
--            case when d.prenda = 'Polar' then ' (sin stock informado por Logística — Polar)' else '' end,
--          'stock_inicial', 'STKINI001', 'seed SQL v101'
--   from (
--     select s.id, s.prenda, s.talle, s.cantidad as actual, c.cantidad as objetivo,
--            (c.cantidad - s.cantidad) as delta
--     from stock_uniformes s
--     join _stock_inicial_csv c on c.prenda = s.prenda and c.talle = s.talle
--   ) d
--   where d.delta <> 0;
-- 
--   raise notice 'Stock inicial de uniformes importado.';
-- end $$;
-- 
-- FIN BLOQUE OMITIDO
-- ===== v102_candidatos_fecha_transicion.sql =====
-- v102: Agregar columna fecha_transicion a candidatos
-- Causa: registrarAsistencia() setea c.fechaTransicion pero no existe como
-- columna en Supabase → PostgREST rechaza el UPDATE con error de columna
-- desconocida → supaSync retorna false → toast genérico.
-- Esta columna registra cuándo cambió el último estado del candidato.

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS fecha_transicion timestamptz;

-- ===== v103_candidatos_estado_precandidato.sql =====
-- v103: Agregar 'Precandidato' al enum estado_candidato
-- Causa: el flujo de Precandidatos (commit 180211d, 19/08/2026) usa
-- estado='Precandidato' desde /postularme (api/postular.js) y desde la
-- tab Precandidatos de Candidatos, pero el valor nunca se agregó al enum
-- estado_candidato en producción → INSERT/UPDATE con ese estado se
-- rechaza con "invalid input value for enum estado_candidato" → toda
-- postulación pública falla con 500 ("No se pudo guardar la postulación").
--
-- No se puede agregar un valor a un enum y usarlo en la misma transacción
-- (ALTER TYPE ... ADD VALUE no es transaccional en ese sentido en
-- versiones viejas de Postgres) — se deja como sentencia suelta, sin
-- BEGIN/COMMIT explícito, tal como recomienda la documentación de
-- Postgres para este caso.

ALTER TYPE public.estado_candidato ADD VALUE IF NOT EXISTS 'Precandidato' BEFORE 'Sin citar';

-- ===== v104_sucursales_tipo_servicio.sql =====
-- v104: sacar el CHECK constraint de sucursales.tipo_servicio
--
-- Causa raíz de "faltan servicios activos en Precios" (ticket "Archivo de
-- precios de cliente", 08/2026): sucursales.tipo_servicio tenía un CHECK
-- que sólo permitía 'vigilancia' | 'custodia' | 'otro' — vocabulario de
-- una empresa de seguridad, heredado sin adaptar del port de FinFlow
-- (sql/v097a_precios.sql, la app original de la que se portó el módulo
-- Precios LIGE es de otro rubro). Ohlimpia es una cooperativa de
-- limpieza: sus servicios reales (objetivos.tipo) son 'Limpieza', 'OBRA',
-- 'RUNNER' — ninguno matchea esos 3 valores, así que CUALQUIER intento de
-- crear una fila en sucursales para un servicio real fallaba con
-- "violates check constraint sucursales_tipo_servicio_check", dejando la
-- tabla casi vacía (4 filas de prueba, contra 164 servicios activos
-- reales en objetivos).
--
-- Se saca el constraint en vez de ampliarlo a la lista real: tipo_servicio
-- acá es sólo informativo (no gobierna ninguna lógica de negocio en
-- precios.js, a diferencia de estado_candidato que sí tiene una máquina
-- de estados) — no tiene sentido mantenerlo cerrado a una lista fija que
-- va a quedar desactualizada de nuevo apenas aparezca un tipo de servicio
-- nuevo en Objetivos.

ALTER TABLE public.sucursales DROP CONSTRAINT IF EXISTS sucursales_tipo_servicio_check;

-- ===== v105_objetivo_precios_tipo_servicio.sql =====
-- v105: sacar el CHECK constraint de objetivo_precios.tipo_servicio
--
-- Mismo problema que sql/v104 (sucursales.tipo_servicio): CHECK heredado
-- sin adaptar del port de FinFlow, sólo permitía 'vigilancia' | 'custodia'
-- | 'otro'. Bloqueaba la carga de precios reales de Ohlimpia (tipo_servicio
-- real: 'Limpieza' / 'OBRA' / 'RUNNER', copiado desde sucursales.tipo_servicio
-- al importar valores hora reales por cliente-servicio, 08/2026).

ALTER TABLE public.objetivo_precios DROP CONSTRAINT IF EXISTS objetivo_precios_tipo_servicio_check;

-- ===== v106_pedidos_personal_ajustes.sql =====
-- =============================================================================
-- Migración: v106 — Pedidos de personal: ajustes de mockup v1.5
-- Fecha:     2026-08-26
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo pedido de personas — AJUSTES", con mockup HTML adjunto
-- (mockup_pedidos_personal_v1_5.html) del área de Operaciones/RRHH. Agrega
-- workflow completo al módulo (hoy solo tenía alta + edición libre):
--   Pendiente → En búsqueda (RRHH lo toma) → Cubierto | Cancelado (con motivo)
--
-- DECISIONES CONFIRMADAS POR EL SOLICITANTE (26/08):
--   - Puede haber otros perfiles además de Operaciones cargando pedidos
--     (no se restringe "cargado_por" a un rol fijo).
--   - N° de pedido: correlativo simple (PP-1, PP-2, ...).
--   - Umbral de "VENCIDO": parametrizable, por urgencia (tabla pedidos_config).
--   - Motivos de cancelación: parametrizable (catálogo, mismo patrón que
--     perfil_personal_atributos de v073 — solo seed SQL por ahora, sin ABM).
--   - Notificaciones (🔔): NO en este alcance. Queda pendiente para más
--     adelante.
--   - Urgencia Alto/Medio/Bajo → Alta/Media/Baja: SIN necesidad de mantener
--     compatibilidad con lo viejo.
--   - N° de socio del candidato cubierto: campo LIBRE por ahora (sin validar
--     contra legajos reales). Se podrá mejorar después.
--   - Los pedidos cargados hasta hoy son de prueba: se BORRAN (no se
--     migran). Confirmado explícitamente por el solicitante.
--
-- Sigue el mismo patrón id_local / RLS endurecida directo que usa el resto
-- del módulo (v014, v073, v088).
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) Limpieza de datos de prueba (confirmado por el solicitante)
-- ============================================================
TRUNCATE public.pedidos;

-- ============================================================
-- 2) pedidos — columnas nuevas del workflow
-- ============================================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero               integer,
  ADD COLUMN IF NOT EXISTS cantidad             integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fecha_limite         text,
  ADD COLUMN IF NOT EXISTS cargado_por          text,
  -- Reemplazan al viejo "candidato" (texto libre suelto, sin estructura).
  -- Se dropea abajo: no hay datos que migrar (tabla recién vaciada).
  ADD COLUMN IF NOT EXISTS ingreso_tipo         text,   -- 'nuevo' | 'interno'
  ADD COLUMN IF NOT EXISTS nombre_candidato     text,
  ADD COLUMN IF NOT EXISTS nro_socio_candidato  text,   -- libre, sin validar contra legajos (por ahora)
  ADD COLUMN IF NOT EXISTS fecha_inicio         text,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion   text,
  ADD COLUMN IF NOT EXISTS motivo_detalle       text;

ALTER TABLE public.pedidos DROP COLUMN IF EXISTS candidato;

-- Urgencia ya no usa Alto/Medio/Bajo (sin compat hacia atrás, confirmado).
-- No hace falta UPDATE: la tabla está vacía tras el TRUNCATE de arriba.
-- El check de valores válidos queda a nivel de aplicación (como ya era).

-- numero: correlativo. UNIQUE pero nullable a nivel de columna porque
-- Postgres permite múltiples NULL en una UNIQUE — en la práctica la
-- aplicación SIEMPRE lo completa (max(numero)+1, mismo patrón que usa
-- Altas para nro de socio).
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_numero_key ON public.pedidos (numero) WHERE numero IS NOT NULL;

-- ============================================================
-- 3) pedidos_eventos — timeline por pedido (creado/tomado/cubierto/cancelado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_eventos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  pedido_id_local text NOT NULL REFERENCES public.pedidos(id_local) ON DELETE CASCADE,
  tipo          text NOT NULL,   -- 'creado' | 'en_busqueda' | 'cubierto' | 'cancelado' | 'editado'
  detalle       text,
  usuario       text,
  -- Texto DD/MM/AAAA HH:MM, mismo criterio que pedidos.fecha (v014):
  -- created_at/updated_at los descarta _toCamel() (supabase.js:1036), así
  -- que la fecha visible en el timeline necesita su PROPIA columna.
  fecha         text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedidos_eventos_pedido_idx ON public.pedidos_eventos (pedido_id_local);

ALTER TABLE public.pedidos_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedidos_eventos;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) pedidos_motivos_cancelacion — catálogo parametrizable (mismo patrón
--    que perfil_personal_atributos de v073: solo seed SQL, sin ABM todavía)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_motivos_cancelacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  codigo      text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_motivos_cancelacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedidos_motivos_cancelacion;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_motivos_cancelacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pedidos_motivos_cancelacion (id_local, codigo, nombre, orden) VALUES
  ('mot_reduccion',   'reduccion_horas',   'El cliente redujo horas',    10),
  ('mot_cubierto_otro','cubierto_otro',    'Se cubrió por otro lado',    20),
  ('mot_baja_servicio','baja_servicio',    'El servicio se dio de baja', 30),
  ('mot_duplicado',   'duplicado',         'Pedido duplicado',           40),
  ('mot_otro',        'otro',              'Otro',                       50)
ON CONFLICT (id_local) DO NOTHING;

-- ============================================================
-- 5) pedidos_config — clave/valor genérico, arranca con el umbral de
--    "VENCIDO" por urgencia (en días sin movimiento). Editable directo en
--    la tabla mientras no tenga pantalla propia.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pedidos_config;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pedidos_config (clave, valor) VALUES
  ('umbral_vencido_dias', '{"Alta":5,"Media":15,"Baja":30}')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v107_stock_uniformes_talles_minimos_precios.sql =====
-- =============================================================================
-- Migración: v107 — Stock de uniformes: columna Talle, tab Mínimos, tab Precios
-- Fecha:     2026-08-27
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "STOCK DE UNIFORMES — Talles, mínimos y precios" (Lautaro,
-- 26/08), con mockup_stock_uniformes_minimos_4.html. Los "tres agregados"
-- sobre el módulo que ya funciona (stock inicial importado, v101):
--   1. Columna TALLE en la grilla de Stock actual (+ valorización PPP/vigente).
--   2. Tab MÍNIMOS (nuevo) — vive en el módulo, NO en Configuración.
--   3. Tab PRECIOS (nuevo, solo uniformes) — precio de reposición vigente
--      con vigencia mensual (mecánica "Valores hora" de Categorías).
--
-- LO QUE YA EXISTÍA Y SE REUSA TAL CUAL (sin tocar esquema):
--   - precios_uniformes (v032): ya soporta prenda+talle+vigencia. El
--     ticket pide "SIN excepciones por talle" para el tab nuevo — se logra
--     usando esta misma tabla con talle SIEMPRE null, sin cambiar el
--     esquema (talle ya es nullable y obtenerPrecioVigente() ya prioriza
--     "sin talle" como precio general).
--   - stock_uniformes_movimientos (v071): ya registra las salidas por
--     entrega — de ahí sale "Consumo prom./mes" sin tabla nueva.
--
-- LO QUE SE AGREGA:
--   - stock_uniformes.costo_ppp: columna nueva, en 0 hasta que exista un
--     circuito de "Nueva compra" de uniformes (compras_uniformes ya
--     existe desde v071 pero sin UI todavía — FUERA de alcance de este
--     ticket, que son los "tres agregados"). Con costo_ppp en 0 la
--     grilla muestra "—", igual que un precio de reposición sin cargar.
--   - stock_minimos: unificada uniformes (prenda+talle) y productos
--     (producto_id_local) — el ticket pide expresamente que Mínimos
--     sirva para las dos categorías con la misma grilla.
--   - stock_minimos_ajustes: registro de cambios (usuario, fecha, valor
--     anterior) — pedido explícito del ticket.
--   - stock_config: umbral BAJO⚠ (% del mínimo, default 60%) y N meses
--     para la "propuesta general" (default 2) — parametrizable, mismo
--     patrón que pedidos_config (v106): seed SQL, editable directo en la
--     tabla, sin pantalla de ABM todavía.
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) stock_uniformes — costo_ppp (queda en 0 = "sin dato" hasta que haya
--    compras de uniformes cargadas)
-- ============================================================
ALTER TABLE public.stock_uniformes
  ADD COLUMN IF NOT EXISTS costo_ppp numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 2) stock_minimos — uniformes (prenda+talle) y productos (producto_id_local)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_minimos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text NOT NULL UNIQUE,

  categoria        text NOT NULL,   -- 'UNIFORMES' | 'PRODUCTOS'
  prenda           text,            -- solo UNIFORMES
  talle            text,            -- solo UNIFORMES
  producto_id_local text,           -- solo PRODUCTOS (matchea ppProductos.id, como stock_productos)
  minimo           numeric NOT NULL DEFAULT 0,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Una fila por combinación prenda+talle (uniformes) o por producto (productos).
CREATE UNIQUE INDEX IF NOT EXISTS stock_minimos_unif_key
  ON public.stock_minimos (prenda, talle) WHERE categoria = 'UNIFORMES';
CREATE UNIQUE INDEX IF NOT EXISTS stock_minimos_prod_key
  ON public.stock_minimos (producto_id_local) WHERE categoria = 'PRODUCTOS';

ALTER TABLE public.stock_minimos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.stock_minimos;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_minimos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3) stock_minimos_ajustes — registro de cambios (pedido explícito del ticket)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_minimos_ajustes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text NOT NULL UNIQUE,

  categoria      text NOT NULL,
  -- Texto ya armado ("AMBO (8 talles)", "AMBO 5XL", nombre del producto):
  -- evita tener que resolver joins para mostrar el historial.
  clave          text NOT NULL,
  valor_anterior numeric,
  valor_nuevo    numeric NOT NULL,
  motivo         text,             -- ej. "mínimo general de la prenda", "propuesta general", null = ajuste manual puntual
  usuario        text,
  fecha          text,             -- DD/MM/AAAA HH:MM, mismo criterio que pedidos_eventos.fecha (v106):
                                    -- created_at lo descarta _toCamel(), hace falta columna propia para mostrarlo.

  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_minimos_ajustes_fecha_idx ON public.stock_minimos_ajustes (created_at DESC);

ALTER TABLE public.stock_minimos_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.stock_minimos_ajustes;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_minimos_ajustes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) stock_config — umbral BAJO⚠ y N meses de la propuesta general
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.stock_config;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.stock_config (clave, valor) VALUES
  ('umbral_bajo_critico_pct', '0.6'),
  ('meses_propuesta_minimo', '2')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v108_pedido_productos_ajustes.sql =====
-- =============================================================================
-- Migración: v108 — Pedido de productos: ajustes (ticket "Módulo productos", 31/08)
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo productos" (Lautaro, 31/08), acompañado de
-- mockup_pedido_productos_14_3.html y PEDIDO_PRODUCTOS_ajustes_para_Fede.md.
-- Se implementan los puntos 1–9 del checklist del MD (prioridad que el
-- propio documento marca como "primero"); 10–13 (Compras por proveedor,
-- Entregas, tab Recargos, tab Margen) quedan para una vuelta siguiente.
--
-- CAMBIOS DE ESTADO (punto 7 del MD — sin CHECK constraint que tocar:
-- pp_pedidos.estado ya es text libre, sin enum):
--   Antes: borrador → cerrado_supervisor → en_auditoria → autorizado → en_compra → entregado
--   Ahora: borrador → confirmado (directo, PAGAN+dentro de presupuesto+sin
--          excepciones) | confirmado_revision (al auditor) → observado
--          (devuelto) | autorizado (aprobado) → en_compra → entregado
--   No hace falta backfill: los pedidos viejos en 'cerrado_supervisor'/
--   'en_auditoria' siguen siendo válidos, el código los sigue leyendo.
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) pp_periodos — un solo período EN CARGA a la vez (punto 8)
-- ============================================================
ALTER TABLE public.pp_periodos
  ADD COLUMN IF NOT EXISTS cierre_programado    text,     -- fecha/hora ISO de cierre (DD/MM HH:MM en la UI)
  ADD COLUMN IF NOT EXISTS recordatorio_enviado boolean NOT NULL DEFAULT false;
-- estado pasa a admitir además 'habilitado' (próximo período, todavía no
-- abierto) — mismo texto libre que ya tenía la columna, no hace falta ALTER.

-- ============================================================
-- 2) pp_pedidos — trazabilidad de CONFIRMADO / OBSERVADO (puntos 7 y 9)
-- ============================================================
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS confirmado_por      text,
  ADD COLUMN IF NOT EXISTS confirmado_en       text,
  ADD COLUMN IF NOT EXISTS observado_por       text,
  ADD COLUMN IF NOT EXISTS observado_en        text,
  ADD COLUMN IF NOT EXISTS observado_motivo    text,   -- chip obligatorio (EXCEDE / CON AUTORIZACIÓN / etc. — texto libre)
  ADD COLUMN IF NOT EXISTS observado_comentario text;  -- comentario obligatorio del auditor

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v109_pedido_productos_compras_entregas.sql =====
-- =============================================================================
-- Migración: v109 — Pedido de productos: Compras por proveedor + Entregas
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo productos" (Lautaro, 31/08), puntos 10 y 11 del checklist
-- de PEDIDO_PRODUCTOS_ajustes_para_Fede.md — la parte que quedó afuera de
-- v108 (que cubrió 1-9). Cambio de fondo que pide el punto 6: Logística NO
-- compra por servicio, compra el CONSOLIDADO por proveedor. Son dos
-- unidades y dos circuitos distintos:
--   - COMPRAS   (unidad: el proveedor) — consolidado → sugerencias de
--     equivalentes más baratos → simulación de ahorro → orden de compra →
--     seguimiento hasta la recepción → factura (alimenta PPP + cta cte).
--   - ENTREGAS  (unidad: el servicio) — arranca con lo recibido, armado
--     con checklist → remito → reparto → entregado (firma/foto).
--
-- Los botones viejos "Marcar en compra"/"Marcar entregado" (a nivel
-- PEDIDO, v085) quedan tal cual para pedidos que ya estén en ese flujo —
-- no se tocan datos existentes. El circuito nuevo es ADITIVO: la
-- consolidación de v109 solo toma ítems que todavía no tengan
-- orden_compra_id_local (pp_items.orden_compra_id_local, nuevo).
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) pp_items — enganche con la orden de compra que se los llevó
--    (evita re-consolidar un ítem que ya está en una orden)
-- ============================================================
ALTER TABLE public.pp_items
  ADD COLUMN IF NOT EXISTS orden_compra_id_local text,
  ADD COLUMN IF NOT EXISTS cantidad_recibida     numeric,   -- null = todavía sin recepción cargada
  ADD COLUMN IF NOT EXISTS armado                boolean NOT NULL DEFAULT false;  -- checklist de Entregas

-- ============================================================
-- 2) pp_grupos_equivalencia — "productos iguales" de distintos proveedores
--    (Comparador de precios, punto 6a.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_grupos_equivalencia (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  nombre        text NOT NULL,
  unidad_comun  text NOT NULL,   -- ej "BOLSA", "LITRO" — a qué se lleva todo con el factor
  anulado       boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pp_grupos_equivalencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_grupos_equivalencia;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_grupos_equivalencia FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pp_grupos_equivalencia_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  grupo_id_local      text NOT NULL REFERENCES public.pp_grupos_equivalencia(id_local) ON DELETE CASCADE,
  producto_id_local   text NOT NULL,
  factor_conversion   numeric NOT NULL DEFAULT 1,  -- 1 unidad de compra = factor × unidad común

  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_geq_items_grupo ON public.pp_grupos_equivalencia_items(grupo_id_local);
ALTER TABLE public.pp_grupos_equivalencia_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_grupos_equivalencia_items;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_grupos_equivalencia_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3) pp_ordenes_compra — unidad PROVEEDOR (punto 6a.1/6a.4). items en
--    jsonb (mismo patrón que compras_uniformes de v071): es un snapshot
--    de lo que se pidió, no hace falta una tabla de líneas aparte.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_ordenes_compra (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text NOT NULL UNIQUE,

  numero                text,             -- "OC-2026-031", correlativo (se arma en JS)
  periodo_id_local      text NOT NULL,
  proveedor_id_local    text NOT NULL,

  estado                text NOT NULL DEFAULT 'confirmada',
    -- confirmada / enviada / recibida_parcial / recibida_completa
  items                 jsonb NOT NULL DEFAULT '[]',
    -- [{productoIdLocal, codigoProveedor, descripcion, costoUnit,
    --   cantidad, cantidadRecibida, obsLinea, sustituidoPor}]
  total                 numeric(14,2) NOT NULL DEFAULT 0,

  confirmada_por        text,
  confirmada_en         text,
  enviada_en            text,
  recibida_en           text,             -- última recepción cargada (parcial o completa)
  backorder_fecha_comprometida text,      -- fecha que dio el proveedor para lo pendiente

  factura_nro           text,
  factura_fecha         text,
  factura_monto         numeric(14,2),
  factura_registrada_por text,
  factura_registrada_en text,

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_ordenes_periodo ON public.pp_ordenes_compra(periodo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pp_ordenes_proveedor ON public.pp_ordenes_compra(proveedor_id_local) WHERE NOT anulado;
ALTER TABLE public.pp_ordenes_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_ordenes_compra;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_ordenes_compra FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) proveedores_cta_cte_movimientos — punto 6a.4: la factura genera el
--    movimiento en la cuenta corriente del proveedor. Ledger simple
--    (debe/haber en un solo campo con signo), sin saldo materializado —
--    el saldo se calcula sumando (mismo criterio que
--    stock_uniformes_movimientos, v071).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proveedores_cta_cte_movimientos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  proveedor_id_local  text NOT NULL,
  tipo                text NOT NULL,   -- 'factura' | 'pago' | 'ajuste'
  monto               numeric(14,2) NOT NULL,  -- factura = positivo (aumenta la deuda), pago = negativo
  motivo              text,
  ref_tipo            text,            -- 'orden_compra'
  ref_id_local        text,

  registrado_por      text,
  fecha               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_ctacte_proveedor ON public.proveedores_cta_cte_movimientos(proveedor_id_local);
ALTER TABLE public.proveedores_cta_cte_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.proveedores_cta_cte_movimientos;
CREATE POLICY "Solo usuarios autenticados" ON public.proveedores_cta_cte_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5) pp_remitos — unidad SERVICIO (punto 6b): se genera al completar el
--    armado con checklist. Correlativo propio (independiente del de
--    órdenes de compra).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_remitos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  numero              text,            -- correlativo "R-000123"
  pedido_id_local     text NOT NULL,
  servicio_codigo     text NOT NULL,

  items               jsonb NOT NULL DEFAULT '[]',  -- snapshot armado: [{productoIdLocal, descripcion, cantidad}]

  estado              text NOT NULL DEFAULT 'armado',  -- armado / en_reparto / entregado
  armado_por          text,
  armado_en           text,
  en_reparto_en       text,
  entregado_a         text,            -- quién recibió
  entregado_en        text,
  foto_path           text,            -- Storage: bucket ohlimpia-adjuntos
  firma_cliente       boolean NOT NULL DEFAULT false,  -- true si el servicio es PAGAN y hubo firma

  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_remitos_pedido ON public.pp_remitos(pedido_id_local);
ALTER TABLE public.pp_remitos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_remitos;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_remitos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6) pp_pedidos — fecha límite de entrega (Hoja de recorrido, punto 6b)
-- ============================================================
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS fecha_limite_entrega text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v110_pedido_productos_recargos_margen.sql =====
-- =============================================================================
-- Migración: v110 — Pedido de productos: tab Recargos + tab Margen (puntos 12-13)
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
-- Cierra el checklist del MD (puntos 1-13). Margen de productos (13) es
-- de solo lectura — no agrega tablas, lee lo que ya existe.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pp_recargo_general (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text NOT NULL UNIQUE,
  pct            numeric NOT NULL,             -- 0.30 = 30%
  vigencia_desde text NOT NULL,                -- YYYY-MM
  vigencia_hasta text,
  cargado_por    text,
  motivo         text,
  anulado        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pp_recargo_general ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_recargo_general;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_recargo_general FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.pp_recargo_general (id_local, pct, vigencia_desde, cargado_por, motivo) VALUES
  ('rg_inicial', 0.30, '2026-01', 'Sistema', 'Valor general ya vigente al construir el tab')
ON CONFLICT (id_local) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pp_recargo_servicio (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,
  servicio_codigo text NOT NULL,
  pct             numeric NOT NULL,
  vigencia_desde  text NOT NULL,
  vigencia_hasta  text,
  cargado_por     text,
  motivo          text,
  anulado         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_recargo_servicio_cod ON public.pp_recargo_servicio(servicio_codigo) WHERE NOT anulado;
ALTER TABLE public.pp_recargo_servicio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_recargo_servicio;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_recargo_servicio FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ===== v111_reclamos_nc_internos.sql =====
-- =============================================================================
-- Migración: v111 — Reclamos/NC internos (sin cliente obligatorio)
-- Fecha:     2026-08-31
-- Autor:     Fede
--
-- CONTEXTO
-- --------
-- Ticket Reclamos y NC: poder registrar reclamos/no conformidades INTERNOS,
-- sin que sea obligatorio asociar un cliente. Hoy el formulario marca
-- "Cliente *" como obligatorio, lo que bloquea NC de origen interno
-- (incidencias de procesos, problemas internos, etc.).
--
-- DECISIÓN DE DISEÑO
-- ------------------
-- Se agrega un flag booleano `es_interno` (default false) tanto en
-- `reclamos` como en `no_conformidades`, coherente con el patrón de flags
-- ya existente en esas tablas (`genera_nc`, `firmada`). Cuando `es_interno
-- = true`, el reclamo/NC no requiere cliente.
--
-- NOTA IMPORTANTE
-- ---------------
-- `reclamos.cliente_id` ya es `bigint DEFAULT 0` SIN NOT NULL (v001), así
-- que NO hay que alterar su nulabilidad: ya acepta NULL. El cambio acá es
-- SOLO agregar el flag de origen. Los reclamos internos persistirán con
-- `cliente_id = 0` (igual que hoy los que no eligen cliente), pero
-- marcados con `es_interno = true` para poder filtrarlos/distinguirlos.
--
-- RLS: no se toca. Ambas tablas usan "Solo usuarios autenticados"
-- FOR ALL TO authenticated USING(true) — ya cubre el caso.
-- =============================================================================

BEGIN;

ALTER TABLE public.reclamos
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;

ALTER TABLE public.no_conformidades
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;

-- Índice opcional si el volumen amerita filtrar por origen; sin él también
-- filtra bien en este volumen. Se deja comentado para no agregar peso si no
-- hace falta.
-- CREATE INDEX IF NOT EXISTS idx_reclamos_es_interno ON public.reclamos(es_interno);

COMMIT;

-- =============================================================================
-- CÓMO APLICARLO
--   En el SQL Editor de Supabase (Dashboard → SQL → New query), pegar este
--   archivo completo y ejecutar. Es idempotente (IF NOT EXISTS), seguro de
--   re-ejecutar. No borra ni altera datos existentes: los reclamos/NC ya
--   creados quedan con es_interno = false (comportamiento actual intacto).
-- =============================================================================

-- ===== v112_uniformes_mejoras_mockup5.sql =====
-- =============================================================================
-- Migración: v112 — Uniformes: mejoras del mockup "solicitud_uniformes (5)"
-- Fecha:     2026-09-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Mejoras del módulo de uniformes" — mockup enviado por WhatsApp
-- (mockup_solicitud_uniformes_5.html, ya en el repo). Decisiones confirmadas
-- por el solicitante (02/09):
--   - Se saca el paso de autorización de RRHH — el pedido va directo a
--     Logística ("la política ya validó sola").
--   - Las reglas de política (renovación SIN CARGO cada 6 meses; Campera/
--     Calzado SIN CARGO la primera vez y CON DESCUENTO después; Polar/
--     Campera solo en ventana marzo-septiembre) son las reglas reales, no
--     ejemplos ilustrativos.
--
-- Con RRHH afuera del circuito operativo, Logística pasa a ser quien
-- recibe la devolución de constancia+viejo y cierra el pedido (antes lo
-- hacía RRHH) — es quien maneja el depósito físico, tiene más sentido que
-- RRHH siga siendo el que confirma un traspaso que ya no existe.
-- =============================================================================

BEGIN;

-- ========== 1. Punto de retiro (Recepción / Maure) ==========
ALTER TABLE public.pedidos_uniformes
  ADD COLUMN IF NOT EXISTS punto_retiro text NOT NULL DEFAULT 'Recepción';

-- ========== 2. Config genérica del módulo (mismo patrón que
--    pedidos_config/stock_config — clave/valor, editable directo en la
--    tabla mientras no tenga pantalla propia) ==========
CREATE TABLE IF NOT EXISTS public.uniformes_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.uniformes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.uniformes_config;
CREATE POLICY "Solo usuarios autenticados" ON public.uniformes_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.uniformes_config (clave, valor) VALUES
  ('cuotas_descuento', '4')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- ===== v113_pedido_productos_ronda_02_09.sql =====
-- =============================================================================
-- Migración: v113 — Pedido de productos: correcciones ronda de prueba 02/09
-- Fecha:     2026-09-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Correcciones y mejoras de Pedido de productos" — mockup
-- mockup_pedidosdeproductosmejoras.html, armado por Lautaro sobre su
-- prueba real del 02/09 (período 2026-09, servicios Migueletes + Hit
-- Ugarte). 8 correcciones puntuales (FIX 1 a FIX 8) sobre el módulo ya
-- construido en v108/v109:
--   FIX 1/2b — la sustitución aceptada en Sugerencias se refleja en el
--     Consolidado (línea mudada al bloque del proveedor del sustituto) y
--     cada proveedor se confirma por separado.
--   FIX 2   — el bloque de un proveedor ya confirmado deja un "rastro"
--     (link a la orden generada) en vez de desaparecer.
--   FIX 3   — el ahorro real de una sugerencia multiplica por el factor
--     de conversión (unidades comunes del pedido, no bultos).
--   FIX 4   — diferencias menores al umbral de empate (2%) no generan
--     sugerencia de cambio.
--   FIX 6   — "Marca" (3M, Diversey, etc.) pasa a ser un dato del
--     PRODUCTO, separado del proveedor real que lo vende.
--   FIX 7   — exportar una orden ya confirmada (formato archivo de
--     compra actual).
--   FIX 8   — un pedido aprobado por el auditor no desaparece de la
--     Bandeja: baja a "Resueltos este período" con historial completo.
-- =============================================================================

BEGIN;

-- ========== FIX 6: Marca del producto (separada del proveedor) ==========
ALTER TABLE public.pp_productos
  ADD COLUMN IF NOT EXISTS marca text;

-- ========== FIX 8: rastro de auditoría por pedido ==========
-- Snapshot del motivo que lo mandó a la bandeja (para "Resueltos" — no se
-- recalcula motivosRevisionPP() después de aprobado, porque el auditor
-- pudo haber ajustado cantidades y ya no daría el mismo motivo) +
-- bandera de si pasó por "observado" alguna vez en su vida (para el
-- texto "aprobado tras devolución con propuesta" vs "sin cambios").
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS motivo_revision_snapshot text,
  ADD COLUMN IF NOT EXISTS tuvo_observacion boolean NOT NULL DEFAULT false;

-- Historial de eventos por pedido (mismo patrón que
-- pedido_uniforme_eventos, v071/v112): un registro por transición, con
-- quién/cuándo/qué cambió. Alimenta el modal "Historial" de la Bandeja
-- del auditor.
CREATE TABLE IF NOT EXISTS public.pp_pedido_eventos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  pedido_id_local   text NOT NULL,
  estado_desde      text,
  estado_hasta      text NOT NULL,
  ejecutado_por     text,
  ejecutado_en      text NOT NULL,
  observaciones     text,

  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_pedido_eventos_pedido ON public.pp_pedido_eventos(pedido_id_local);
ALTER TABLE public.pp_pedido_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_pedido_eventos;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_pedido_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v114_clientes_direccion_fiscal.sql =====
-- =============================================================================
-- Migración: v114 — Clientes: formalizar direccion/ciudad como dirección fiscal
-- Fecha:     2026-09-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Dirección fiscal" — pedía separar "dirección del servicio" de
-- "dirección fiscal" en el alta de clientes. Investigación: el sistema YA
-- separa estos dos conceptos, pero en dos entidades distintas (correcto,
-- porque un cliente puede tener varios servicios en direcciones distintas):
--   - objetivos.dir / objetivos.jurisdiccion / objetivos.localidad → dirección
--     de CADA servicio (ya existía, obligatoria al crear un objetivo).
--   - clientes.direccion / clientes.ciudad → dirección del CLIENTE. El label
--     del formulario (index.html) ya decía "Dirección fiscal" — el dato ya
--     estaba ahí, solo faltaba dejarlo explícito y visible.
--
-- No hace falta agregar columnas nuevas ni migrar datos: nada se pierde ni
-- se mueve. Este script es puramente documental (COMMENT ON COLUMN), para
-- que quede claro en el propio esquema qué es cada campo — evita que en el
-- futuro alguien reintroduzca la confusión.
-- =============================================================================

COMMENT ON COLUMN public.clientes.direccion IS 'Dirección FISCAL del cliente (razón social) — NO es la dirección del servicio. La dirección de cada servicio vive en objetivos.dir/jurisdiccion/localidad, porque un cliente puede tener varios servicios en distintas direcciones.';
COMMENT ON COLUMN public.clientes.ciudad IS 'Ciudad/localidad de la dirección FISCAL del cliente — texto libre, no vinculada a jurisdicciones_servicio (esa tabla es geografía de servicios, no de clientes).';

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v115_clientes_codigo_manual_unico.sql =====
-- =============================================================================
-- Migración: v115 — Clientes: código manual + UNIQUE real en la base
-- Fecha:     2026-09-03
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Código de cliente manual" — antes clientes.codigo se autogeneraba
-- siempre (secuencial "CLI-0001", nunca aleatorio) y el campo del formulario
-- era de solo lectura pese a mostrarse. Ahora se puede cargar/editar a mano
-- (sin formato obligatorio — libre, con fallback a autogenerar si queda
-- vacío). La unicidad hasta hoy se garantizaba SOLO por convención en JS
-- (generarCodigoCliente() calculando max+1) — clientes.codigo nunca tuvo un
-- UNIQUE real en la base (a diferencia de objetivos.codigo, que sí lo
-- tiene desde v039). Al permitir carga manual, hace falta el constraint de
-- verdad — la validación en el frontend (guardarCliente(), legacy.js) evita
-- la mayoría de los casos pero no reemplaza la garantía de la base.
--
-- ⚠️ PASO 1 — CORRER ESTO PRIMERO (verificación, no modifica nada):
-- Si esta consulta devuelve filas, hay códigos duplicados ya cargados y el
-- CREATE UNIQUE INDEX de más abajo va a fallar (con un error claro, sin
-- tocar datos) hasta que se resuelvan a mano (renombrar uno de los
-- duplicados). Si no devuelve nada, saltar directo al PASO 2.
--
--   SELECT codigo, count(*) AS repetidos, array_agg(id_local) AS clientes
--   FROM public.clientes
--   WHERE codigo IS NOT NULL AND codigo <> ''
--   GROUP BY codigo
--   HAVING count(*) > 1;
--
-- =============================================================================

BEGIN;

-- PASO 2 — índice único parcial: exige unicidad entre los clientes que SÍ
-- tienen código cargado (no bloquea filas viejas con código vacío/NULL, si
-- las hubiera). Mismo criterio de "único pero sin exigir NOT NULL" que
-- clientes.id_local (v001).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_unico
  ON public.clientes(lower(codigo))
  WHERE codigo IS NOT NULL AND codigo <> '';

COMMENT ON COLUMN public.clientes.codigo IS 'Código interno del cliente — carga manual (sin formato obligatorio) con fallback a autogenerado (CLI-000X) si queda vacío. Único (case-insensitive, ver idx_clientes_codigo_unico). Usado como clave de matching por el importador comercial (comercial_importador.js) — cambiarlo en un cliente existente puede desincronizar una carga masiva que todavía referencie el código anterior.';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- ===== v116_clientes_codigo_tango_unico.sql =====
-- =============================================================================
-- Migración: v116 — Clientes: UNIQUE real en codigo_tango
-- Fecha:     2026-09-03
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Código de cliente" — investigación con datos reales (83 clientes
-- en producción): el código INTERNO (clientes.codigo) está cargado en el
-- 100% y se usa como slug en Objetivos/Servicios/Pedidos de personal — no
-- hay conflicto ahí. El código TANGO (clientes.codigo_tango) está cargado
-- en apenas 1 de 83 — no hay "duplicidad" real hoy, el problema es que casi
-- no se carga, y de eso depende el matcheo de
-- parsearEstadoCuentaTango()/"Importar Estado de cuenta de Tango" (Gestión
-- de cobros). No se unifica la identidad de cliente (decisión confirmada
-- con el usuario) — se cierra la brecha de carga: reporte "Clientes sin
-- Código Tango" + carga masiva desde el importador comercial + esta
-- migración, que agrega la unicidad real que tampoco tenía en la base.
--
-- Verificado (con el pooler arriba, mismo query que se corrió antes de
-- aplicar esta migración): 0 códigos Tango duplicados en producción.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_tango_unico
  ON public.clientes(upper(codigo_tango))
  WHERE codigo_tango IS NOT NULL AND codigo_tango <> '';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================


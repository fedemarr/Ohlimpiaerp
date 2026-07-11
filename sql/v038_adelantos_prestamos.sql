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
CREATE TABLE public.pedidos_adelantos (
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
CREATE INDEX idx_pa_legajo  ON public.pedidos_adelantos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_pa_estado  ON public.pedidos_adelantos(estado) WHERE NOT anulado;
CREATE INDEX idx_pa_periodo ON public.pedidos_adelantos(periodo) WHERE NOT anulado;
CREATE INDEX idx_pa_super   ON public.pedidos_adelantos(supervisor_nombre) WHERE NOT anulado;

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
CREATE TABLE public.pedidos_adelantos_eventos (
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
CREATE INDEX idx_pae_pedido ON public.pedidos_adelantos_eventos(pedido_id_local);

-- ============================================================
-- Tabla nueva — descuentos_adelantos_pendientes (compromisos para
-- Liquidaciones, cuando migre)
-- ============================================================
CREATE TABLE public.descuentos_adelantos_pendientes (
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
CREATE INDEX idx_dap_legajo  ON public.descuentos_adelantos_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_dap_periodo ON public.descuentos_adelantos_pendientes(periodo_descuento) WHERE NOT anulado;
CREATE INDEX idx_dap_origen  ON public.descuentos_adelantos_pendientes(origen_id_local) WHERE NOT anulado;
CREATE INDEX idx_dap_estado  ON public.descuentos_adelantos_pendientes(estado) WHERE NOT anulado;

-- ============================================================
-- Tabla nueva — configuracion_adelantos_prestamos (clave/valor con
-- vigencia temporal, para max_cuotas / umbral_alerta_pedidos)
-- ============================================================
CREATE TABLE public.configuracion_adelantos_prestamos (
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
CREATE INDEX idx_cap_clave ON public.configuracion_adelantos_prestamos(clave) WHERE NOT anulado;

-- ============================================================
-- Tabla nueva — topes_adelantos_versiones (vigencia temporal del
-- tope de adelanto, patrón Corregir/Nueva vigencia ya usado en
-- Categorías/Competencia)
-- ============================================================
CREATE TABLE public.topes_adelantos_versiones (
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
CREATE INDEX idx_tav_vigencia ON public.topes_adelantos_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que el resto de la sesión
-- ============================================================
ALTER TABLE public.pedidos_adelantos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_adelantos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pedidos_adelantos_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_adelantos_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.descuentos_adelantos_pendientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.descuentos_adelantos_pendientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.configuracion_adelantos_prestamos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.configuracion_adelantos_prestamos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.topes_adelantos_versiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.topes_adelantos_versiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed — configuración inicial
-- ============================================================
INSERT INTO public.topes_adelantos_versiones (id_local, monto_tope, vigencia_desde, cargado_por, motivo) VALUES
  ('tope_inicial_2026', 50000, '2026-01-01', 'Sistema (seed v038)', 'Configuración inicial');

INSERT INTO public.configuracion_adelantos_prestamos (id_local, clave, valor, descripcion, vigencia_desde, modificado_por) VALUES
  ('cfg_max_cuotas',            'max_cuotas',            '12', 'Máximo de cuotas para préstamos (soft warning)',              '2026-01-01', 'Sistema (seed v038)'),
  ('cfg_umbral_alerta_pedidos', 'umbral_alerta_pedidos', '3',  'Cantidad de pedidos por mes que gatilla alerta a RRHH',       '2026-01-01', 'Sistema (seed v038)');

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

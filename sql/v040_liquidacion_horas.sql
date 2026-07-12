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
    EXECUTE 'SELECT count(*) FROM public.grillas_liq' INTO filas;
    IF filas > 0 THEN
      RAISE EXCEPTION 'public.grillas_liq tiene % fila(s) — abortando migración, revisar antes de dropear', filas;
    END IF;
    EXECUTE 'DROP TABLE public.grillas_liq CASCADE';
  END IF;
END $$;

-- ========== Grillas de liquidación (una fila por objetivo/mes) ==========
CREATE TABLE public.grillas_liq (
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
CREATE UNIQUE INDEX idx_gl_obj_periodo ON public.grillas_liq(objetivo_codigo, periodo) WHERE NOT anulado;
CREATE INDEX idx_gl_periodo ON public.grillas_liq(periodo) WHERE NOT anulado;
CREATE INDEX idx_gl_estado  ON public.grillas_liq(estado) WHERE NOT anulado;

-- ========== Pendientes de autorización de Operaciones ==========
CREATE TABLE public.pendientes_auth_liq (
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
CREATE INDEX idx_pal_estado ON public.pendientes_auth_liq(estado) WHERE NOT anulado;
CREATE INDEX idx_pal_grilla ON public.pendientes_auth_liq(grilla_id_local) WHERE NOT anulado;

-- ========== Historial de autorizaciones resueltas ==========
CREATE TABLE public.historial_auth_liq (
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
CREATE INDEX idx_hal_grilla ON public.historial_auth_liq(grilla_id_local) WHERE NOT anulado;

-- ========== Categoría alternativa pendiente (Retén) — tabla propia ==========
-- NO reusa `cat_alt_pendientes` (ya existe en producción con 9 filas
-- reales, pero pertenece al flujo de Altas — candidato/psico/legajo, con
-- columnas identificacion/domicilio/uniforme/etc. Colisión de nombre pura:
-- el mismo nombre "catAltPendientes" describe dos conceptos distintos en
-- este código. Se crea una tabla y clave _SM separadas para no mezclar
-- datos de ambos features.
CREATE TABLE public.cat_alt_pendientes_liq (
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
CREATE INDEX idx_capl_estado ON public.cat_alt_pendientes_liq(estado) WHERE NOT anulado;
CREATE INDEX idx_capl_grilla ON public.cat_alt_pendientes_liq(grilla_id_local) WHERE NOT anulado;

-- ========== Registros Art.42 (tal como los arma guardarArt42) ==========
CREATE TABLE public.registros_art42 (
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
CREATE INDEX idx_ra42_estado ON public.registros_art42(estado) WHERE NOT anulado;

-- ========== RLS ==========
ALTER TABLE public.grillas_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendientes_auth_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_auth_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_alt_pendientes_liq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_art42 ENABLE ROW LEVEL SECURITY;

CREATE POLICY grillas_liq_all ON public.grillas_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pendientes_auth_liq_all ON public.pendientes_auth_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY historial_auth_liq_all ON public.historial_auth_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY cat_alt_pendientes_liq_all ON public.cat_alt_pendientes_liq FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY registros_art42_all ON public.registros_art42 FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

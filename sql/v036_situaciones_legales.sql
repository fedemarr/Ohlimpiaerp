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
CREATE TABLE public.novedades_caso_legal (
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
CREATE INDEX idx_ncl_caso  ON public.novedades_caso_legal(caso_id_local) WHERE NOT anulado;
CREATE INDEX idx_ncl_fecha ON public.novedades_caso_legal(fecha_evento) WHERE NOT anulado;

-- ============================================================
-- Tabla nueva — casos_legales_adjuntos (append-only, sin
-- invalidación — ver contexto arriba)
-- ============================================================
CREATE TABLE public.casos_legales_adjuntos (
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
CREATE INDEX idx_cla_caso ON public.casos_legales_adjuntos(caso_id_local) WHERE NOT borrado;

-- ============================================================
-- RLS — mismo patrón que v032/v033/v034/v035
-- ============================================================
ALTER TABLE public.novedades_caso_legal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.novedades_caso_legal
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.casos_legales_adjuntos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.casos_legales_adjuntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

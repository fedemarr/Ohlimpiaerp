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

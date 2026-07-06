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

CREATE TABLE public.reglas_competencia (
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

CREATE POLICY "Solo usuarios autenticados" ON public.reglas_competencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

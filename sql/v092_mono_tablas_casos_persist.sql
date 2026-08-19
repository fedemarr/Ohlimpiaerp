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

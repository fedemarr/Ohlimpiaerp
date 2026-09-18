-- =============================================================================
-- Migración: v144 — Tareas Especiales: parámetro de convenio (168 hs) versionado
-- Fecha:     2026-09-18
-- Autor:     Fede (vía asistente)
-- =============================================================================
--
-- CONTEXTO (TAREAS_ESPECIALES_para_Fede.md + mockup_tareas_especiales_4.html)
-- --------
-- Módulo nuevo, área Operaciones: los asociados de la categoría "Tareas
-- Especiales" (CAT-008, ya existe en categorias_base desde v035) tienen
-- un convenio de horas mensuales garantizadas — si trabajan menos, la
-- cooperativa completa hasta el convenio; si trabajan más, cobran las
-- reales. El módulo NO tiene tablas de nómina/horas propias (mismo
-- criterio que Retenes): la nómina sale del padrón de categorías y las
-- horas se leen en vivo de las grillas — nada se carga acá.
--
-- Lo ÚNICO que necesita persistencia propia es el parámetro "168 hs",
-- que el documento pide explícitamente editable y con historial ("no
-- hardcodeado") — mismo molde que topes_adelantos_versiones (v038):
-- versiones con vigencia_desde/vigencia_hasta, quién y por qué.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tareas_especiales_convenio_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  horas_convenio         numeric(6,2) NOT NULL,
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  cargado_por            text NOT NULL,
  motivo                 text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teconv_vigencia ON public.tareas_especiales_convenio_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

ALTER TABLE public.tareas_especiales_convenio_versiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.tareas_especiales_convenio_versiones;
CREATE POLICY "Solo usuarios autenticados" ON public.tareas_especiales_convenio_versiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed — 168hs vigente desde siempre (2020, fecha muy anterior a
-- cualquier período que se vaya a consultar), para que el módulo nunca
-- arranque sin un convenio vigente cargado.
INSERT INTO public.tareas_especiales_convenio_versiones (id_local, horas_convenio, vigencia_desde, cargado_por, motivo) VALUES
  ('teconv_inicial_168', 168, '2020-01-01', 'Sistema (seed v144)', 'Configuración inicial — convenio 168 hs')
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select * from information_schema.tables where table_name = 'tareas_especiales_convenio_versiones';
--   select * from public.tareas_especiales_convenio_versiones;
-- =============================================================================

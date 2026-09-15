-- =============================================================================
-- Migración: v134 — periodos_liquidacion (cierre general persistente)
-- Fecha:     2026-09-15
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO — ticket "Resumen de horas" (RESUMEN_HORAS_para_Fede_1.md,
-- Lautaro/Santiago). El nuevo módulo necesita un botón "✅ Confirmar
-- período" que reuse el MISMO cierre general que ya existe en
-- Liquidaciones (Finanzas) — "Congelar y Confirmar son dos momentos del
-- mismo cierre general existente, no crear candados nuevos".
--
-- HALLAZGO al investigar ese cierre general antes de reusarlo: hoy vive
-- SOLO en memoria del navegador — toggleCongelarLiquidacion() (legacy.js)
-- escribe en DB.lqsCongelado[periodo] pero esa clave nunca está en el
-- diccionario _SM de supabase.js, así que jamás se persiste. "Congelar el
-- período" hoy se pierde con un F5 y no lo ve nadie más que quien lo
-- tocó — contradice directamente lo que este mismo ticket da por hecho
-- ("el congelado general que YA existe"). Se corrige de una: esta tabla
-- pasa a ser la fuente real tanto del congelado (Finanzas) como del
-- nuevo confirmado (Operaciones), con quién y cuándo en los dos casos.
--
-- Verificar ANTES de correr (tabla no debe existir todavía):
--   select * from information_schema.tables where table_name='periodos_liquidacion';
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.periodos_liquidacion (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text UNIQUE NOT NULL,

  periodo         text NOT NULL UNIQUE,     -- 'YYYY-MM'

  -- Congelado (Finanzas, módulo Liquidaciones) — ya existía como concepto,
  -- nunca como dato persistido. Manda sobre el candado individual de cada
  -- grilla (_periodoCerradoLiq en legacy.js).
  congelado       boolean NOT NULL DEFAULT false,
  congelado_por   text,
  congelado_en    timestamptz,

  -- Confirmado (Operaciones, módulo Resumen de horas) — nuevo. Es la
  -- decisión que da por buena la revisión y habilita horas a FACTURAR y
  -- a LIQUIDAR. No implica descongelar: normalmente se confirma con el
  -- período ya congelado.
  confirmado      boolean NOT NULL DEFAULT false,
  confirmado_por  text,
  confirmado_en   timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.periodos_liquidacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.periodos_liquidacion;
CREATE POLICY "Solo usuarios autenticados" ON public.periodos_liquidacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select column_name from information_schema.columns
--     where table_name='periodos_liquidacion';
-- =============================================================================

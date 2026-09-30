-- =============================================================================
-- Migración: v174 — Gestión de horas v2: tipo de regla "FT fija" (banco
--            mensual, no varía con el calendario)
-- Fecha:     30/09/2026
-- Autor:     Fede + Lautaro (Finanzas)
-- =============================================================================
--
-- CONTEXTO (GESTION_HORAS_v2_tipos_sembrado_para_Fede.md)
-- --------
-- Hoy TODA vigencia de horas_vigencias se calcula como puestos × calendario
-- real (regla × días hábiles/feriados del mes) — src/modules/gestion_horas/
-- calculo.js. Eso no representa un contrato "banco de horas fijo por mes"
-- (ej. 1.118,07 hs/mes siempre, sin importar feriados) — la fórmula por
-- calendario lo hace bailar mes a mes cuando en realidad es un número
-- plano que solo cambia con una vigencia nueva.
--
-- Se agrega el tipo de regla a nivel de VIGENCIA (no de puesto): 'fija'
-- guarda un total mensual plano en horas_fijas_mes; 'calendario' (default,
-- compatibilidad con todo lo existente) sigue igual que siempre.
--
-- Verificado antes de escribir esta migración: public.horas_vigencias
-- tiene 0 filas en producción hoy — no hace falta backfillear ningún dato
-- existente, el DEFAULT alcanza para no romper nada.
-- =============================================================================

BEGIN;

ALTER TABLE public.horas_vigencias
  ADD COLUMN IF NOT EXISTS tipo_regla text NOT NULL DEFAULT 'calendario',
  ADD COLUMN IF NOT EXISTS horas_fijas_mes numeric;

ALTER TABLE public.horas_vigencias DROP CONSTRAINT IF EXISTS horas_vigencias_tipo_regla_check;
ALTER TABLE public.horas_vigencias ADD CONSTRAINT horas_vigencias_tipo_regla_check
  CHECK (tipo_regla IN ('calendario', 'fija'));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

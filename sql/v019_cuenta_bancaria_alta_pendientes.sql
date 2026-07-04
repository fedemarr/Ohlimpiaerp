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

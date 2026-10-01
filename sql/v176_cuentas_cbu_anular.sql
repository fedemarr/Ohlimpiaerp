-- =============================================================================
-- Migración: v176 — Cuentas CBU: eliminar (soft) → tab "Anuladas" + Reactivar
-- Fecha:     30/09/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- La columna `anulado` ya existía en `cuentas_cbu` desde v138 y ya se usaba
-- para FILTRAR en todos los listados (getCuentaCbu, renderCbuPadron,
-- exportarPadronCbu) — pero nunca se seteaba a true en ningún lado: no había
-- botón de "Eliminar" ni "Reactivar". Esta migración solo agrega las 2
-- columnas de auditoría que faltaban para completar ese flujo (quién y
-- cuándo anuló la fila) — mismo patrón ya usado para cargadoPor/cargadoEn
-- en esta misma tabla.
-- =============================================================================

BEGIN;

ALTER TABLE public.cuentas_cbu
  ADD COLUMN IF NOT EXISTS anulado_por text,
  ADD COLUMN IF NOT EXISTS anulado_en timestamptz;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

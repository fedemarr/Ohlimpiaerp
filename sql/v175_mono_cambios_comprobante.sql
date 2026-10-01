-- =============================================================================
-- Migración: v175 — Monotributo: comprobante en Historial de cambios
-- Fecha:     30/09/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (ticket "Pago mensual — carga en lote + comprobante clickeable")
-- --------
-- Cuando un comprobante de la bandeja de Pendientes promueve a alguien al
-- Padrón (confirmarComprobanteBandeja, src/modules/monotributo_comprobantes/
-- comprobantes.js), el evento queda registrado en `mono_cambios` (el mismo
-- "Historial de cambios" que ya usa la recategorización automática, v080) —
-- pero esa tabla no tenía forma de guardar el link al PDF del comprobante.
-- Se agrega la columna para que el evento sea clickeable como cualquier
-- otro comprobante del sistema.
-- =============================================================================

BEGIN;

ALTER TABLE public.mono_cambios
  ADD COLUMN IF NOT EXISTS comprobante_path text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

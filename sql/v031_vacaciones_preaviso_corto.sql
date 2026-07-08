-- =============================================================================
-- Migración: v031 — Vacaciones v1.1: excepción de preaviso corto
-- Fecha:     2026-07-08
-- Autor:     Fede (con delta de diseño de Lautaro + Claude web, DELTA_vacaciones_v1.1.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- La política oficial de RRHH exige mínimo 15 días de anticipación para
-- elevar una solicitud de vacaciones (antes v1.0 solo avisaba con <48hs,
-- sin bloquear). Si el pedido tiene menos de 15 días de anticipación, el
-- sistema lo deja guardado como Borrador marcado, y RRHH puede autorizar
-- una excepción puntual (motivo obligatorio) que lo hace saltar
-- directamente a "Pendiente aprobación Consejo" (se salta el nivel
-- Gerente para esos casos).
-- =============================================================================

BEGIN;

ALTER TABLE public.vacaciones
  ADD COLUMN IF NOT EXISTS requiere_autorizacion_preaviso_corto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_excepcion_preaviso text,
  ADD COLUMN IF NOT EXISTS autorizada_excepcion_por text,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion_excepcion timestamptz;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v179 — Legajos: marca "sin monotributo" (anti-resembrado)
-- Fecha:     01/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (MONOTRIBUTO_cierre_modulo_para_Fede_1.md, punto 1)
-- --------
-- La bandeja de Pendientes de Monotributo es 100% derivada: cae ahí TODO
-- legajo Activo que no esté en el Padrón (ver filasBandejaMono() en
-- src/modules/monotributo_bandeja/bandeja.js). Para personas que
-- realmente NO corresponden (pruebas de testeo, u otra condición fiscal),
-- no había forma de sacarlas — sin esta marca, vuelven a aparecer en
-- cada render ("zombies").
--
-- Reversible a propósito (el doc lo pide explícito): si la persona se
-- inscribe más adelante, "+ Nuevo monotributista" o re-sembrar desde el
-- alta vuelve a poner sin_monotributo en false.
-- =============================================================================

BEGIN;

ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS sin_monotributo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sin_monotributo_motivo text,
  ADD COLUMN IF NOT EXISTS sin_monotributo_en timestamptz,
  ADD COLUMN IF NOT EXISTS sin_monotributo_por text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

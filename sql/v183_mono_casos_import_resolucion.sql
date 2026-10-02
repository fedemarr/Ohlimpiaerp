-- =============================================================================
-- Migración: v183 — Casos del import: "Marcar resuelto" pasa a persistir y
--             a registrar QUÉ se decidió
-- Fecha:     02/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (MONOTRIBUTO_cierre_modulo_para_Fede_1.md §20)
-- --------
-- resolverCasoImport() era un confirm() que flipeaba `resuelto=true` SIN
-- supaSync — ni siquiera persistía, se perdía en cada reload, y no
-- aplicaba ningún cambio real al Padrón (el caso "se resolvía" pero el
-- dato de fondo seguía mal). Ahora el modal aplica la corrección elegida
-- (categoría/condición/adherentes/IIBB) directo sobre `monotributos`,
-- deja su propio evento en Historial de cambios, y el cierre del caso en
-- sí también persiste con qué se decidió.
-- =============================================================================

BEGIN;

ALTER TABLE public.mono_casos_import
  ADD COLUMN IF NOT EXISTS resolucion text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v028 — Campos de Vacaciones en Legajos
-- Fecha:     2026-07-07
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_vacaciones.md §4.4)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El módulo Vacaciones (v027) necesita 3 datos por legajo administrativo
-- que hoy no existen en la tabla `legajos`:
--   - sector: a qué área administrativa pertenece (Coord. RRHH, Coord.
--     Operaciones, etc.) — DISENO_vacaciones.md asumía que este campo ya
--     existía; en realidad legajos solo tiene `servicio`/`supervisor`/
--     `funcion` (personal administrativo se identifica hoy por
--     servicio = 'ADMINISTRATIVO', ver state.js). Se agrega el campo.
--   - dias_vacaciones_anuales: días asignados por RRHH para el año en curso.
--   - jefe_directo_legajo_id_local: referencia al legajo del jefe directo,
--     usada para la alerta de superposición jerárquica (soft warning).
--
-- Los 3 campos son opcionales/nulos para el personal operativo — solo se
-- completan para administrativos.
-- =============================================================================

BEGIN;

ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS dias_vacaciones_anuales integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jefe_directo_legajo_id_local text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

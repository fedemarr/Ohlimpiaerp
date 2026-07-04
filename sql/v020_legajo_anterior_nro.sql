-- =============================================================================
-- Migración: v020 — legajos.legajo_anterior_nro
-- Fecha:     2026-07-04
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El campo "¿Es reingresante?" del Alta pedía una fecha de egreso anterior
-- que nunca se usaba en ningún lado (dead code: el valor jamás se leía en
-- confirmarAlta). Se reemplaza por una búsqueda del legajo anterior por DNI
-- (no por nombre, para evitar confusiones entre homónimos) entre TODOS los
-- legajos históricos. Si se encuentra, se guarda acá su N° de legajo para
-- trazabilidad entre el legajo viejo y el nuevo.
-- =============================================================================

BEGIN;

ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS legajo_anterior_nro integer;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v018 — adjuntos.subido_por_id / borrado_por_id: bigint -> text
-- Fecha:     2026-07-03
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Bug reportado: no se puede eliminar un certificado de antecedentes ("error
-- al borrar"). Causa: v011 definió subido_por_id/borrado_por_id como bigint,
-- porque en ese momento currentUser.id venía del array hardcodeado
-- DB.usuarios (un número chico). Al migrar el login a Supabase Auth,
-- currentUser.id pasó a ser el uuid de auth.users — un UPDATE con ese valor
-- contra una columna bigint falla (invalid input syntax for type bigint).
--
-- Mismo problema afecta subirAdjunto() (subido_por_id es NOT NULL), no solo
-- borrarAdjunto() — cualquier certificado subido después de la migración de
-- auth también habría fallado.
--
-- Se pasa a text en vez de uuid: estas columnas son solo de auditoría (no
-- hay FK ni join contra auth.users), y text acepta tanto los uuid nuevos
-- como la representación de los bigint viejos sin perder datos históricos.
-- =============================================================================

BEGIN;

ALTER TABLE public.adjuntos ALTER COLUMN subido_por_id TYPE text USING subido_por_id::text;
ALTER TABLE public.adjuntos ALTER COLUMN borrado_por_id TYPE text USING borrado_por_id::text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

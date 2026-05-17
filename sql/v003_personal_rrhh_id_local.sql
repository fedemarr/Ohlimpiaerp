-- =============================================================================
-- Migración: v003 — Agregar id_local a personal_rrhh
-- Fecha:     2026-05-17
-- Autor:     Lautaro (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El script v002 creó la tabla personal_rrhh con un campo 'id' bigint
-- autoincremental como única clave identificadora. Pero el resto del
-- proyecto usa el patrón 'id_local' (string, timestamp truncado a 9 dígitos
-- generado en el frontend) como identificador real desde JavaScript.
--
-- Las funciones supaSync, supaDel y _toCamel en src/shared/supabase.js
-- están construidas asumiendo que toda tabla tiene id_local UNIQUE NOT NULL.
--
-- Este script corrige el error de diseño de v002 agregando id_local a
-- personal_rrhh, manteniendo el patrón del resto del proyecto.
--
-- =============================================================================


-- =============================================================================
-- PASO 1 — Agregar columna id_local (sin restricciones todavía)
-- =============================================================================
-- Primero la agregamos como nullable para poder rellenarla en las 5 filas
-- existentes sin que falle por NOT NULL.

ALTER TABLE public.personal_rrhh
  ADD COLUMN id_local text;


-- =============================================================================
-- PASO 2 — Llenar id_local en las 5 filas existentes
-- =============================================================================
-- Usamos el id numérico como string con padding de ceros a la izquierda
-- (9 dígitos, igual que el patrón timestamp truncado del frontend).
--
-- Resultado: '000000001', '000000002', '000000003', '000000004', '000000005'

UPDATE public.personal_rrhh
SET id_local = LPAD(id::text, 9, '0')
WHERE id_local IS NULL;


-- =============================================================================
-- PASO 3 — Aplicar restricciones NOT NULL y UNIQUE
-- =============================================================================
-- Ahora que todas las filas tienen valor, podemos exigir que sea obligatorio
-- y único.

ALTER TABLE public.personal_rrhh
  ALTER COLUMN id_local SET NOT NULL;

ALTER TABLE public.personal_rrhh
  ADD CONSTRAINT personal_rrhh_id_local_unique UNIQUE (id_local);


-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen de lo que hace este script:
--   1. Agrega columna id_local a personal_rrhh.
--   2. Rellena id_local en las 5 filas existentes con el id numérico
--      formateado a 9 dígitos.
--   3. Marca id_local como NOT NULL UNIQUE.
--
-- Después de ejecutar:
--   - personal_rrhh queda alineada con el patrón id_local del resto del proyecto.
--   - Las funciones supaSync/supaDel/_toCamel funcionan sin cambios.
--   - El frontend puede crear nuevas filas en personal_rrhh generando
--     id_local con Date.now() truncado, igual que en candidatos.
-- =============================================================================

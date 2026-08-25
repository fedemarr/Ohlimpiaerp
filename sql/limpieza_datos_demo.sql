-- ============================================================
-- LIMPIEZA DE CANDIDATOS DE TEST — PRODUCCIÓN
-- ============================================================
-- Borra registros de prueba del flujo de selección (candidatos,
-- psicotécnicos, altas pendientes, adjuntos asociados).
-- NO toca usuarios ni proveedores.
-- ============================================================

-- 1. Backup rápido
CREATE TABLE IF NOT EXISTS backup_candidatos_20260824 AS SELECT * FROM public.candidatos;
CREATE TABLE IF NOT EXISTS backup_psicos_20260824 AS SELECT * FROM public.psicos;
CREATE TABLE IF NOT EXISTS backup_cat_alt_pendientes_20260824 AS SELECT * FROM public.cat_alt_pendientes;
CREATE TABLE IF NOT EXISTS backup_adjuntos_20260824 AS SELECT * FROM public.adjuntos;

-- 2. Verificar qué hay (solo lectura)
SELECT 'candidatos' AS tabla, count(*) AS filas FROM public.candidatos
UNION ALL SELECT 'psicos', count(*) FROM public.psicos
UNION ALL SELECT 'altas_pendientes', count(*) FROM public.cat_alt_pendientes
UNION ALL SELECT 'adjuntos', count(*) FROM public.adjuntos;

SELECT id_local, nombre, dni, estado FROM public.candidatos ORDER BY created_at DESC;

-- 3. Limpiar (descomentar y ejecutar en transacción)
/*
BEGIN;
DELETE FROM public.adjuntos
WHERE entidad_tipo = 'candidato'
  AND entidad_id IN (
    SELECT id_local::text FROM public.candidatos WHERE dni = '35888777'
  );
DELETE FROM public.psicos WHERE dni = '35888777';
DELETE FROM public.cat_alt_pendientes WHERE dni = '35888777';
DELETE FROM public.candidatos WHERE dni = '35888777';
ROLLBACK; -- Cambiar a COMMIT si está correcto
*/

-- 4. Verificar post-limpieza
SELECT 'candidatos' AS tabla, count(*) AS restantes FROM public.candidatos
UNION ALL SELECT 'psicos', count(*) FROM public.psicos
UNION ALL SELECT 'altas_pendientes', count(*) FROM public.cat_alt_pendientes;

-- 5. Rollback de emergencia
/*
INSERT INTO public.candidatos SELECT * FROM backup_candidatos_20260824;
INSERT INTO public.psicos SELECT * FROM backup_psicos_20260824;
INSERT INTO public.cat_alt_pendientes SELECT * FROM backup_cat_alt_pendientes_20260824;
INSERT INTO public.adjuntos SELECT * FROM backup_adjuntos_20260824;
*/

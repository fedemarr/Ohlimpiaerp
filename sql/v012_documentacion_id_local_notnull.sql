-- =============================================================================
-- Migración: v012 — documentacion_ingreso.id_local -> NOT NULL
-- Fecha:     2026-06-26
-- Autor:     Lautaro (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- La tabla documentacion_ingreso (v009) se creó con:
--     id_local text UNIQUE
-- a diferencia de las otras 3 tablas del flujo (candidatos, psicos,
-- preocupacionales), que la definen como:
--     id_local text UNIQUE NOT NULL
--
-- Esto es un riesgo real de persistencia: las funciones supaSync/_toCamel en
-- src/shared/supabase.js asumen que id_local SIEMPRE existe. Si una fila se
-- inserta con id_local NULL, al recargar _toCamel deja p.id = undefined, y el
-- siguiente supaSync cae en Date.now() nuevo -> nunca matchea -> INSERT
-- duplicado en cada guardado (duplicados infinitos).
--
-- El diagnóstico del 26/06/2026 confirmó que HOY no hay filas con id_local
-- NULL en la tabla, así que el SET NOT NULL aplica directo. Igual se incluye
-- un backfill defensivo (molde de v003) por si el script corre en otro entorno.
--
-- Las dos operaciones van envueltas en BEGIN/COMMIT para que sean atómicas:
-- si una falla, la otra no se aplica.
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 1 — Backfill defensivo de filas sin id_local (si las hubiera)
-- -----------------------------------------------------------------------------
-- Usa el id numérico de la base formateado a 9 dígitos, igual que v003 para
-- personal_rrhh. En el entorno actual no afecta ninguna fila (no hay NULLs).

UPDATE public.documentacion_ingreso
SET id_local = LPAD(id::text, 9, '0')
WHERE id_local IS NULL;

-- -----------------------------------------------------------------------------
-- PASO 2 — Aplicar la restricción NOT NULL
-- -----------------------------------------------------------------------------
-- La restricción UNIQUE ya existe desde v009; acá solo agregamos NOT NULL para
-- alinear la tabla con el resto del flujo de ingreso.

ALTER TABLE public.documentacion_ingreso
  ALTER COLUMN id_local SET NOT NULL;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen:
--   1. Rellena id_local en filas que lo tuvieran NULL (backfill defensivo).
--   2. Marca documentacion_ingreso.id_local como NOT NULL.
--   Ambas operaciones atómicas (BEGIN/COMMIT).
--
-- Después de ejecutar:
--   - documentacion_ingreso queda alineada con candidatos/psicos/preocupacionales.
--   - Se elimina el riesgo latente de duplicados infinitos por id_local NULL.
-- =============================================================================

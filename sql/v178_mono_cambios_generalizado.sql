-- =============================================================================
-- Migración: v178 — Historial de cambios de Monotributo: generalizado
-- Fecha:     01/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (MONOTRIBUTO_cierre_modulo_para_Fede_1.md, punto 8)
-- --------
-- `mono_cambios` solo contemplaba cambios de categoría (cat_anterior/
-- cat_nueva, cur_anterior/cur_nuevo). Se generaliza a "toda modificación
-- sobre un monotributista deja fila acá": categoría, condición,
-- adherentes, zona/IIBB, alta por bandeja, "no va a monotributo", baja,
-- tabla importada.
--
-- No se tocan/renombran las columnas existentes (cat_anterior/cat_nueva
-- siguen siendo la fuente para los eventos de tipo 'categoria', por
-- compatibilidad con los registros ya guardados) — se agregan 3 columnas
-- nuevas:
--   tipo: qué clase de cambio fue ('categoria' | 'condicion' | 'adherentes'
--         | 'zona_iibb' | 'alta_bandeja' | 'no_va_monotributo' | 'baja' |
--         'estado' | 'tabla_importada'). Los registros viejos (sin tipo)
--         se backfillean a 'categoria', que es lo que siempre fueron.
--   antes / despues: "antes → después" GENÉRICO para cambios que no son de
--         categoría (ej. condición común → asoc. cooperativa). Para
--         tipo='categoria' la UI sigue leyendo cat_anterior/cat_nueva.
-- cur_anterior/cur_nuevo pasan a mostrarse en la UI como "CUOTA ANTERIOR
-- → NUEVA" (son el mismo dato — la cuota en pesos — ya válido para
-- cualquier tipo de cambio, no hace falta tocarlos).
-- =============================================================================

BEGIN;

ALTER TABLE public.mono_cambios
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS antes text,
  ADD COLUMN IF NOT EXISTS despues text;

UPDATE public.mono_cambios SET tipo = 'categoria' WHERE tipo IS NULL;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

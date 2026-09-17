-- =============================================================================
-- Migración: v141 — Padrón de categorías: UNIQUE(legajo_nro, vigencia_desde)
--            solo debe aplicar a filas activas (no anuladas)
-- Fecha:     17/09/2026
-- Autor:     Fede (vía asistente)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- v140 anuló las 253 filas del padrón corrompidas por la recategorización
-- masiva de 09/2026 (categoria_id_local con basura literal). Pero la tabla
-- (v124) tiene un UNIQUE(legajo_nro, vigencia_desde) SIN condición — Postgres
-- lo hace cumplir sobre TODAS las filas, anuladas o no. Resultado: apenas se
-- intenta recategorizar a alguien para el mismo mes que su fila anulada
-- (septiembre 2026, el mes de la corrupción), el INSERT nuevo choca contra
-- la fila vieja y el guardado falla en el modal "Cambiar categoría" de
-- Categorías → Asociados (padron.js: escribirRegistroPadron → supaSync
-- devuelve false → guardarCambioCategoriaPadron() muestra "No se pudo
-- guardar — reintentá"). Reproducido con legajo 1486 (Rojas Damian
-- Rodrigo): fila anulada id=6, legajo_nro='1486', vigencia_desde=2026-09-01.
--
-- El resto del código (registroPadronVigente, categoriaVigenteAsociado,
-- etc.) ya trata "anulado" como soft-delete — el constraint de la tabla es
-- el único lugar que no lo hace. Se reemplaza el UNIQUE plano por un índice
-- único parcial que ignora las filas anuladas, mismo criterio soft-delete
-- que ya rige en toda la app.
-- =============================================================================

BEGIN;

ALTER TABLE public.padron_categorias_asociado
  DROP CONSTRAINT IF EXISTS padron_categorias_asociado_legajo_nro_vigencia_desde_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pca_legajo_vigencia_activo
  ON public.padron_categorias_asociado(legajo_nro, vigencia_desde)
  WHERE NOT anulado;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

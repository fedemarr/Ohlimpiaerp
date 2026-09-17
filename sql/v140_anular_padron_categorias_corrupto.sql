-- =============================================================================
-- Migración: v140 — anular filas corruptas de padron_categorias_asociado
-- Fecha:     2026-09-18
-- Autor:     Fede
-- =============================================================================
--
-- Hallazgo (investigación del ticket "Módulo Retenes", 18/09): las 253
-- filas vivas de padron_categorias_asociado tienen categoria_id_local con
-- un valor basura — "cargado_a" (249 filas) o "_operario" (4 filas) — en
-- vez de un id de categoría real. TODAS vienen del mismo evento: un
-- import masivo "Recategorización 09/2026" (origen MASIVO), corrido el
-- 10/09/2026 por "Administrador", por fuera de la función de import de la
-- app (esa sí valida el código/nombre contra el catálogo y hubiera
-- rechazado esto como "categoría desconocida").
--
-- Causa raíz confirmada: categorias_base tiene DOS identificadores por
-- categoría — el id numérico que usa hoy todo el código real (getCategoriaById,
-- ver src/modules/categorias/consultas.js) y un id_local viejo tipo slug,
-- heredado del seed original (sql/v035_categorias.sql, ej. 'cat_encargado_a'
-- para CAT-005), que ya no usa ningún código actual. Lo que corrió la
-- recategorización tomó ese id_local viejo y le aplicó el truncado a 9
-- caracteres que se usa en todo el proyecto para ids largos:
--   'cat_encargado_a'.slice(-9) = 'cargado_a'  (249 filas)
--   'cat_operario'.slice(-9)    = '_operario'  (4 filas)
-- — coincide exacto con lo que hay en la base. Ninguna referencia
-- valores_hora_categoria real usa esos ids (son ids de categoría reales
-- 1-16, nunca truncados), así que valorHoraEfectivoAsoc() no encuentra
-- valor hora para NINGUNA de estas 253 personas — riesgo directo sobre
-- Liquidación de horas mientras esto no se corrija.
--
-- Además de la columna equivocada: 249/253 personas quedaron con el
-- MISMO valor ("Encargado A" al decodificar) — una recategorización real
-- no concentra casi todo en una sola categoría, así que el origen de la
-- corrupción también asignó mal el valor por persona, no solo la columna.
-- Por eso NO se decodifica/recupera automáticamente acá — se anula y se
-- vuelve a cargar bien con datos reales (import masivo ya existente en
-- Categorías → Asociados, con código CAT-XXX o nombre exacto por fila).
--
-- Efecto de anular: cada asociado afectado vuelve a verse "sin categoría
-- en el padrón" (estado ya contemplado y visible hoy en Legajos y en
-- Categorías → Asociados) hasta que se recategorice de nuevo — más
-- honesto que dejar un id que no matchea nada y esconde el problema.
--
-- Verificar ANTES de correr (debería dar 253):
--   select count(*) from padron_categorias_asociado where anulado = false and categoria_id_local in ('cargado_a', '_operario');
-- =============================================================================

BEGIN;

UPDATE public.padron_categorias_asociado
SET anulado = true
WHERE anulado = false
  AND categoria_id_local IN ('cargado_a', '_operario');

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select count(*) from padron_categorias_asociado where anulado = false and categoria_id_local in ('cargado_a', '_operario'); -- debería dar 0
--   select count(*) from padron_categorias_asociado where anulado = true and categoria_id_local in ('cargado_a', '_operario');  -- debería dar 253
-- =============================================================================

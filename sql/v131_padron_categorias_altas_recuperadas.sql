-- =============================================================================
-- Migración: v131 — Padrón de categorías para las altas recuperadas + fix de fondo
-- Fecha:     2026-09-14
-- Autor:     Fede
-- =============================================================================
--
-- HALLAZGO (14/09, a partir del ticket de las 5 altas recuperadas — ver
-- sql/v129 y sql/v130): el selector "Categoría" de Alta usaba una lista
-- fija (Operario A, Operario B, Retén, Supervisor, Auxiliar
-- administrativo, Coordinador de área — DB.categorias en state.js) que NO
-- coincide con los nombres reales de categorias_base (Operario, Operario
-- Media Jornada, Operario de Primera, Referente, Encargado A/B/C, Tareas
-- Especiales, Retén Hora Base/Media Distancia/Larga Distancia/Media
-- Jornada/Nocturno/Doble Jornada, Retén HIT, Franquero Eventual).
--
-- Como el matching de confirmarAlta() es por texto exacto (código o
-- nombre), y "Operario A" nunca matcheaba con "Operario", NINGUNA alta
-- escribió jamás su primer registro en el padrón — verificado: 0 filas
-- con origen='ALTA' en padron_categorias_asociado, sobre 424 legajos
-- activos. Los 249 registros que sí existen vinieron todos de la carga
-- masiva (CSV) inicial, no de altas individuales. Sin error, sin aviso:
-- el `if (catMatch)` simplemente nunca se cumplía.
--
-- FIX DE FONDO (aparte, en código): src/modules/altas/altas.js ahora arma
-- el selector "Categoría" directamente desde categorias_base, así no se
-- puede volver a desincronizar (commit aparte de este SQL).
--
-- ESTE SCRIPT: complementa sql/v129 escribiendo el registro de padrón que
-- debió haberse creado en su momento para 4 de las 5 personas recuperadas
-- (las que ingresaron como "Operario/a" con categoría "Operario A" —
-- mapeada a "Operario" en categorias_base, la más literal disponible).
--
-- Martinez Guillen Jimena Mariel (función Administrativo, categoría
-- "Auxiliar administrativo") queda AFUERA a propósito: no existe ninguna
-- categoría administrativa en categorias_base — el padrón y Liquidación
-- de horas son del circuito operativo (por hora/servicio), el personal
-- administrativo se liquida aparte (módulo "Liquidación Administración",
-- todavía en legacy.js). No es un dato que falte cargar, es que no
-- aplica.
--
-- Verificar ANTES de correr (no debería devolver filas):
--   select * from padron_categorias_asociado where legajo_nro in ('5579','5580','5581','5582');
-- =============================================================================

BEGIN;

INSERT INTO public.padron_categorias_asociado (
  id_local, legajo_nro, categoria_id_local, vigencia_desde, vigencia_hasta,
  origen, motivo, pidio, aprobo, cargado_por, cargado_en, anulado
) VALUES
  ('5579-pad01', '5579', '_operario', '2026-08-01', null, 'ALTA', 'Alta de asociado', '', '', 'Sistema (recuperación)', now(), false),
  ('5580-pad01', '5580', '_operario', '2026-08-01', null, 'ALTA', 'Alta de asociado', '', '', 'Sistema (recuperación)', now(), false),
  ('5581-pad01', '5581', '_operario', '2026-08-01', null, 'ALTA', 'Alta de asociado', '', '', 'Sistema (recuperación)', now(), false),
  ('5582-pad01', '5582', '_operario', '2026-08-01', null, 'ALTA', 'Alta de asociado', '', '', 'Sistema (recuperación)', now(), false);

-- Espejo del legajo.categoria_id_local que confirmarAlta() actualiza al matchear
UPDATE public.legajos SET categoria_id_local = '_operario' WHERE nro IN (5579, 5580, 5581, 5582);

COMMIT;

-- Verificación sugerida después:
-- select l.nro, l.nombre, l.categoria, p.categoria_id_local, p.vigencia_desde
--   from legajos l join padron_categorias_asociado p on p.legajo_nro = l.nro::text
--   where l.nro in (5579,5580,5581,5582);

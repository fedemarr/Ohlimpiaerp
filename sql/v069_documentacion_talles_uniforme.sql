-- v069: talles de uniforme en Documentación de ingreso (ticket "Uniforme")
--
-- Permite cargar el uniforme (ambo, calzado, chomba, grafa/pantalón, buzo,
-- campera, gorra) durante la etapa de Documentación de ingreso, antes de
-- que exista el legajo — se guarda acá y se copia a
-- cat_alt_pendientes.uniforme (ya jsonb, sin cambios) al aprobar, y de ahí
-- a legajos.talles_uniforme al confirmar el alta. Mismo formato (jsonb,
-- claves en minúscula por prenda) que legajos.talles_uniforme, para poder
-- copiarlo tal cual entre las 3 tablas sin transformar nada.

BEGIN;

ALTER TABLE documentacion_ingreso
  ADD COLUMN IF NOT EXISTS talles_uniforme jsonb;

COMMENT ON COLUMN documentacion_ingreso.talles_uniforme IS
  'Talles de uniforme cargados en esta etapa (ambo/calzado van en sus propias columnas de legajos más adelante; acá se guardan junto con chomba/grafa/buzo/campera/gorra bajo una sola clave jsonb). Se copia a cat_alt_pendientes.uniforme al aprobar y de ahí a legajos.talles_uniforme al confirmar el alta.';

COMMIT;

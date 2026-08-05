-- v057_libreta_zona_en_desuso.sql
-- Ticket Sistemas: se sacó el campo "Zona" de la Libreta sanitaria — vale
-- para toda la Provincia de Buenos Aires, no tiene sentido asociarla a una
-- zona. El código (documentacion.js + mapeo camel/snake en supabase.js) ya
-- no lee ni escribe documentacion_ingreso.libreta_zona.
--
-- A pedido, NO se dropea la columna acá — puede tener datos históricos y
-- se decide en otra migración si se elimina formalmente. Esto solo deja
-- un COMMENT ON COLUMN documentando el desuso (visible en Supabase
-- Studio / \d+ documentacion_ingreso), no es un cambio de esquema.

BEGIN;

COMMENT ON COLUMN public.documentacion_ingreso.libreta_zona IS
  'EN DESUSO desde 2026-08 — el código ya no lee/escribe este campo (la libreta sanitaria vale para toda la Pcia. de Buenos Aires). Columna conservada por datos históricos; no dropear sin migración explícita.';

COMMIT;

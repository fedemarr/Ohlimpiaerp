-- v061_candidatos_backfill_partido.sql
-- Ticket "Localidad / Partido": backfill de candidatos ya cargados antes
-- del selector en cascada Partido→Localidad (v060). El select viejo
-- guardaba el nombre del PARTIDO en la columna localidad (bajo el label
-- "Localidad", mal etiquetado — ver PARTIDOS_LOCALIDADES en state.js).
-- Mueve ese valor a la columna partido (no se pierde información) y
-- limpia localidad (tenía un dato incorrecto — un partido, no una
-- localidad real) solo para las filas donde matchea exactamente uno de
-- los 41 partidos conocidos y partido todavía está vacío. No toca
-- candidatos que ya tengan partido cargado (los dados de alta después
-- de v060) ni candidatos con localidad = CABA (barrios, sin partido).

BEGIN;

UPDATE public.candidatos
SET partido = localidad,
    localidad = NULL
WHERE partido IS NULL
  AND localidad IN (
    'Almirante Brown','Avellaneda','Berazategui','Berisso','Brandsen','Campana','Cañuelas',
    'Ensenada','Escobar','Esteban Echeverría','Exaltación de la Cruz','Ezeiza','Florencio Varela',
    'General Las Heras','General Rodríguez','General San Martín','Hurlingham','Ituzaingó',
    'José C. Paz','La Matanza','La Plata','Lanús','Lomas de Zamora','Luján','Marcos Paz',
    'Malvinas Argentinas','Mercedes','Merlo','Moreno','Morón','Pilar','Presidente Perón',
    'Quilmes','San Fernando','San Isidro','San Miguel','San Vicente','Tigre',
    'Tres de Febrero','Vicente López','Zárate'
  );

COMMIT;

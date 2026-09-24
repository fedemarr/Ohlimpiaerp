-- v163: reabrir el Alta de Sosa Silvio Fernando (DNI 34209537).
--
-- Confirmado (24/09/2026, reporte WhatsApp + verificación en Supabase):
-- cat_alt_pendientes tiene 1 sola fila para este DNI, marcada "Alta
-- completada" (id_local 404411415, creada 14/09), pero no hay ningún
-- legajo con ese DNI. Coincide con el bug ya documentado en
-- altas.js (14-15/09): antes de ese fix, si el guardado del legajo en
-- Supabase fallaba a mitad de camino, el registro de Alta se marcaba
-- igual como completado — "encontrados al menos 5 casos reales así
-- entre julio y septiembre" (comentario en altas.js línea 1021-1031).
-- Este caso quedó fuera de esos 5 o es uno de ellos recién detectado.
--
-- Arreglo: reabrir el registro (volverlo a 'Pendiente de alta') para
-- que reaparezca en "Altas de asociados" y RRHH complete el alta de
-- verdad esta vez — con los datos ya precargados (nombre, DNI, función,
-- servicio, etc., que Altas lee de este mismo registro). No se toca la
-- tabla legajos: si es reingresante, quien completa el alta debe tildar
-- "¿Es reingresante?" y buscarlo por DNI para no duplicarle el número
-- de socio si tuvo un legajo de baja antes.
BEGIN;

-- Verificación antes de aplicar (debe mostrar 1 fila, estado 'Alta completada'):
--   select id_local, dni, nombre, estado from public.cat_alt_pendientes where id_local = '404411415';

UPDATE public.cat_alt_pendientes
SET estado = 'Pendiente de alta', updated_at = now()
WHERE id_local = '404411415' AND dni = '34209537' AND estado = 'Alta completada';

COMMIT;

-- Verificación después de aplicar (debe mostrar estado 'Pendiente de alta'):
--   select id_local, dni, nombre, estado from public.cat_alt_pendientes where id_local = '404411415';

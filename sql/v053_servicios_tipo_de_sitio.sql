-- v053_servicios_tipo_de_sitio.sql
-- DELTA_servicios_tipo_de_sitio_v1 (31/07/2026). Agrega "Tipo de sitio"
-- (el TIPO DE LUGAR: Supermercado, Centro logístico, Oficina...) como
-- campo propio del objetivo, distinto de "Tipo de servicio" (la TAREA:
-- Limpieza, Mantenimiento). El catálogo parametrizable (DB.tiposSitio)
-- sigue el mismo patrón no-persistido que DB.tiposCliente — sólo el
-- valor por objetivo se guarda acá. 'objetivos' es una tabla real con
-- datos en uso, así que el cambio es puramente aditivo.

BEGIN;

ALTER TABLE public.objetivos ADD COLUMN IF NOT EXISTS tipo_sitio text;

COMMIT;

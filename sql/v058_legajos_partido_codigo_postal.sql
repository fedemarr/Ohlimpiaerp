-- v058_legajos_partido_codigo_postal.sql
-- Ticket Sistemas: en la carga de Altas se separa "Localidad" (el select
-- existente, que en realidad ya usaba una lista de partidos — ver comentario
-- en candidatos.js sobre LOCALIDADES_BA) de un nuevo campo "Partido"
-- independiente, y se agrega "Código Postal". Ambos campos nuevos, de texto
-- libre, sin tocar el select de Localidad existente. 'legajos' es una tabla
-- real y activa, cambio puramente aditivo.

BEGIN;

ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS partido text;
ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS codigo_postal text;

COMMIT;

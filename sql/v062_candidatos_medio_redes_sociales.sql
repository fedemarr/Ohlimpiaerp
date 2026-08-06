-- v062_candidatos_medio_redes_sociales.sql
-- Ticket "Medio de convocatoria": la opción "Instagram" se reemplaza por
-- "Redes sociales" (más general) en el select del frontend (DB.medios,
-- src/shared/state.js). candidatos.medio es text libre, sin CHECK/enum
-- (v002) — no hace falta migrar esquema, solo backfillear los candidatos
-- ya guardados con el valor viejo para que no quede un valor huérfano
-- que ya no aparece en el dropdown. Es el mismo concepto bajo una
-- etiqueta más amplia, no se pierde información al renombrar.

BEGIN;

UPDATE public.candidatos
SET medio = 'Redes sociales'
WHERE medio = 'Instagram';

COMMIT;

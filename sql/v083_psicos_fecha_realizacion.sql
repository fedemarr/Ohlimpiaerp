-- v083 — Fecha de realización del psicotécnico (ticket "Criterio de
-- llamado por antigüedad").
--
-- psicos guardaba `fecha` (text, fecha de carga del registro en la app)
-- pero no la fecha en que la persona realizó el psicotécnico. El criterio
-- de llamado es por antigüedad: quienes hicieron el psicotécnico primero
-- se llaman primero. Se agrega `fecha_realizacion` como date (mismo tipo
-- que preocupacionales.fecha_turno) para poder ordenar cronológicamente.
--
-- Sin backfill: los registros existentes quedan NULL. La UI los ordena al
-- final y los muestra como "—", sin romper nada.
BEGIN;

ALTER TABLE psicos
  ADD COLUMN IF NOT EXISTS fecha_realizacion date;

COMMIT;

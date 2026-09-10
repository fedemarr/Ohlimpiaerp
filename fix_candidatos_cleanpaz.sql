-- Clean Paz: faltan 5 columnas en candidatos que Ohlimpia ya tiene (agregadas
-- en tickets posteriores al bootstrap inicial de Clean Paz). fecha_transicion
-- es la que rompe "Aprobar" en Precandidatos ahora mismo — las otras 4 son
-- el mismo tipo de gap, van todas juntas para no repetir el viaje.

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS disponibilidad_horaria text,
  ADD COLUMN IF NOT EXISTS fecha_baja date,
  ADD COLUMN IF NOT EXISTS fecha_transicion timestamptz,
  ADD COLUMN IF NOT EXISTS partido text,
  ADD COLUMN IF NOT EXISTS tipo_motivo_baja text;

ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS candidatos_tipo_motivo_baja_check;
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_tipo_motivo_baja_check
  CHECK (tipo_motivo_baja IS NULL OR tipo_motivo_baja IN (
    'Consiguió trabajo','Rechazó propuesta','No se presentó a instancia del proceso','Otro'
  ));

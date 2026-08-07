-- v064: motivo de baja estructurado (ticket "Histórico 2")
--
-- candidatos.motivo_rechazo (text, v002) ya existía pero es texto libre sin
-- categoría ni fecha propia — sirve para el detalle/aclaración, no para
-- clasificar ni para mostrar "cuándo" de forma confiable en el listado.
--
-- Se agregan dos columnas nuevas, sólo relevantes cuando estado = 'Baja'
-- (no se usan para Caducado / MT Social / MT con deuda, ver
-- src/modules/candidatos/candidatos.js):
--   - tipo_motivo_baja: categoría elegida por RRHH desde un selector fijo.
--     Va con CHECK en vez de un ENUM nuevo (a diferencia de "estado") porque
--     agregar una opción a futuro es un ALTER TABLE simple, sin el ritual de
--     ALTER TYPE ... ADD VALUE fuera de transacción que tiene un enum.
--   - fecha_baja: fecha del evento (la carga RRHH a mano, puede no ser hoy —
--     mismo criterio que "Fecha de citación", no se restringe a futuro).

BEGIN;

ALTER TABLE candidatos
  ADD COLUMN IF NOT EXISTS tipo_motivo_baja text,
  ADD COLUMN IF NOT EXISTS fecha_baja date;

ALTER TABLE candidatos
  ADD CONSTRAINT candidatos_tipo_motivo_baja_check
  CHECK (tipo_motivo_baja IS NULL OR tipo_motivo_baja IN (
    'Consiguió trabajo',
    'Rechazó propuesta',
    'No se presentó a instancia del proceso',
    'Otro'
  ));

COMMIT;

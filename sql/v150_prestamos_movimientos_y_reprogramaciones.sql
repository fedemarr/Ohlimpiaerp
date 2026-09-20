-- v150: PRESTAMOS_para_Fede.md fases 4-5 (18/09).
-- Movimientos del préstamo (asientos: desembolso, interés, débito de cuota,
-- reprogramación) y el historial de reprogramaciones del plan viven como
-- jsonb dentro del propio préstamo — se guardan atómicos con él y la futura
-- Cuenta Corriente del asociado los consume tal cual. Solo ADD COLUMN.
BEGIN;

ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS movimientos                jsonb,
  ADD COLUMN IF NOT EXISTS historial_reprogramaciones jsonb;

COMMIT;

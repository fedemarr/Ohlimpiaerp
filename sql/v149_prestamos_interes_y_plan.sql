-- v149: PRESTAMOS_para_Fede.md (18/09) — interés + plan de cuotas.
--
-- Al aprobar un préstamo el sistema ahora guarda:
--   tasa_interes  — % aplicado (10 = 10%), interés simple sobre el capital
--   monto_total   — capital + interés (lo que hay que devolver)
--   plan_cuotas   — jsonb [{numero, periodo 'YYYY-MM', monto, estado}]
-- "monto" sigue siendo el CAPITAL (lo que se deposita) y "monto_cuota" la
-- cuota promedio; no se toca nada existente. Solo ADD COLUMN, nullable.
--
-- Verificado contra la tabla real (OpenAPI de PostgREST, 18/09): prestamos
-- tenía monto_cuota pero NO estas 3 columnas. Sin este ALTER el upsert de
-- aprobarRRHH() falla completo (mismo tipo de bug que v148) — ahora al menos
-- _guardar() lo muestra con un toast en vez de fallar mudo.
BEGIN;

ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS tasa_interes numeric(6,2),
  ADD COLUMN IF NOT EXISTS monto_total  numeric(12,2),
  ADD COLUMN IF NOT EXISTS plan_cuotas  jsonb;

COMMIT;

-- Verificación sugerida después de correr:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name='prestamos' AND column_name IN ('tasa_interes','monto_total','plan_cuotas');

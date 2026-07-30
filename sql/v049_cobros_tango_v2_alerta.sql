-- v049_cobros_tango_v2_alerta.sql
-- DELTA_comercial_cobros_tango_v2 (30 julio 2026) — reemplaza el modelo de
-- importación de v1 (parseo de texto/PDF) por lectura de columnas del
-- Excel/CSV real de Tango ("Estado de cuenta total").
--
-- C.8 (reconciliación): cuando la gestora marca una factura "Cobrada
-- (pendiente Tango)" y una importación posterior NO la confirma (sigue con
-- saldo > 0), hay que avisarle sin borrar la marca — el pago puede estar en
-- camino. Se necesita distinguir "recién marcada, todavía no pasó ninguna
-- importación" de "ya pasó una importación y Tango no la confirmó", así que
-- no alcanza con derivar la alerta en vivo de estado+saldo (una marca
-- fresca también tendría saldo>0 sin que eso sea todavía una alerta).

BEGIN;

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS alerta_tango_no_confirmo boolean NOT NULL DEFAULT false;

COMMIT;

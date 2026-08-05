-- v056_libreta_sanitaria_emision.sql
-- Ticket Sistemas: automatizar el vencimiento de la libreta sanitaria igual
-- que antecedentes (fecha del certificado + N meses). Antecedentes ya tenía
-- antec_fecha para disparar el cálculo; libreta_sanitaria no tenía una
-- "fecha de emisión" propia — solo el vencimiento se cargaba a mano. Se
-- agrega libreta_emision (análoga a antec_fecha) para que el frontend
-- calcule libreta_vencimiento = libreta_emision + 1 año, igual que
-- recalcularVencAntec() hace con antec_vencimiento = antec_fecha + 6 meses.
-- 'documentacion_ingreso' es una tabla real y activa, cambio puramente
-- aditivo.

BEGIN;

ALTER TABLE public.documentacion_ingreso ADD COLUMN IF NOT EXISTS libreta_emision date;

COMMIT;

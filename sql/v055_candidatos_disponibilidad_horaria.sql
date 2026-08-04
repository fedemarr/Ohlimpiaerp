-- v055_candidatos_disponibilidad_horaria.sql
-- Ticket RRHH (04/08/2026): nuevo campo "Disponibilidad horaria" en
-- Candidatos, a la par de ampliar "Zona de residencia" (CABA/Zona Norte/
-- Zona Sur/Zona Oeste) — la zona no necesita migración, ya vivía como
-- texto libre en candidatos.zona; solo cambia el catálogo de opciones
-- en el frontend (DB.zonas). Disponibilidad horaria sí es una columna
-- nueva. 'candidatos' es una tabla real y activa, cambio puramente
-- aditivo.

BEGIN;

ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS disponibilidad_horaria text;

COMMIT;

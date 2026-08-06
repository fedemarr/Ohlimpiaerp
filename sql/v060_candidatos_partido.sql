-- v060_candidatos_partido.sql
-- Dataset de Partido → Localidad pasado por RRHH (05/08/2026) para el
-- selector en cascada de "Zona de residencia" en Candidatos. Antes el
-- select "Localidad" mostraba directamente la lista de partidos (sin
-- desglose real) — ahora primero se elige Partido y recién eso habilita
-- Localidad con las localidades reales de ese partido. candidatos.localidad
-- ya existía (v002); esta migración solo agrega la columna nueva "partido".
-- 'candidatos' es una tabla real y activa, cambio puramente aditivo.

BEGIN;

ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS partido text;

COMMIT;

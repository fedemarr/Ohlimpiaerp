-- v075 — Filtro por Localidad en Psicotécnico (ticket "Selección
-- personal — filtrar por localidad además de zona").
--
-- psicos no tenía columna localidad (solo zona, una clasificación
-- operativa más gruesa: CABA/Zona Norte/Zona Sur/Zona Oeste). El dato
-- de localidad SÍ existe un paso antes, en candidatos (candidatos.localidad
-- / candidatos.partido, cargados por el importador histórico / Altas) —
-- pero pasarAPsicoPorId() nunca lo copiaba al crear el registro de psico.
--
-- Esta migración agrega las columnas y hace un backfill real (no
-- inventado): cruza los psicos existentes contra candidatos por DNI y
-- copia localidad/partido donde haya match. Si no hay match, queda NULL
-- — no se adivina.
BEGIN;

ALTER TABLE psicos
  ADD COLUMN IF NOT EXISTS localidad text,
  ADD COLUMN IF NOT EXISTS partido text;

UPDATE psicos p
SET localidad = c.localidad, partido = c.partido
FROM candidatos c
WHERE p.dni = c.dni
  AND p.localidad IS NULL
  AND (c.localidad IS NOT NULL AND c.localidad <> '');

COMMIT;

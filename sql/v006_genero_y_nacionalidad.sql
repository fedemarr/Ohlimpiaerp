-- Migracion v006: genero en legajos + nacionalidad en candidatos
-- Fecha: 2026-05-23. Autor: Lautaro (con asistencia de Claude).
-- Objetivo: que genero (hoy solo en candidato) llegue al legajo,
-- y que nacionalidad se capture desde el candidato (hoy solo en alta).
-- Ambas nullable. No modifica scripts anteriores (A.5).

alter table legajos add column if not exists genero text;
alter table candidatos add column if not exists nacionalidad text;

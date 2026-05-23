-- Migracion v005: agregar columnas faltantes a legajos
-- Fecha: 2026-05-23. Autor: Lautaro (con asistencia de Claude).
-- Estos campos ya se completan en el modal de Alta pero no se guardaban.
-- Todas nullable: los legajos existentes no las tienen. No modifica v002/v003/v004 (A.5).

alter table legajos add column if not exists direccion text;
alter table legajos add column if not exists fec_nac text;
alter table legajos add column if not exists zona text;
alter table legajos add column if not exists cbu text;
alter table legajos add column if not exists art text;
alter table legajos add column if not exists obra_social text;
alter table legajos add column if not exists forma_pago text;
alter table legajos add column if not exists integracion integer;
alter table legajos add column if not exists categoria text;

-- Migracion v004: agregar columna apellido a personal_rrhh
-- Fecha: 2026-05-23. Autor: Lautaro (con asistencia de Claude).
-- No modifica v002 ni v003 (politica A.5).

-- PASO 1: agregar columna apellido (nullable)
alter table personal_rrhh add column if not exists apellido text;

-- PASO 2: separar apellido y nombre en las 5 filas iniciales
update personal_rrhh set nombre='Gabriela', apellido='Lucero' where id_local='000000001';
update personal_rrhh set nombre='Matilde', apellido='Noceti' where id_local='000000002';
update personal_rrhh set nombre='Jimena', apellido='Martinez' where id_local='000000003';
update personal_rrhh set nombre='Martina', apellido='Ramirez' where id_local='000000004';
update personal_rrhh set nombre='Naara', apellido='Rodriguez' where id_local='000000005';

-- PASO 3: hacer apellido obligatorio ahora que todas las filas lo tienen
alter table personal_rrhh alter column apellido set not null;

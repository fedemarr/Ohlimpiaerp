-- Columnas faltantes en tabla candidatos

alter table candidatos add column if not exists cuit text;
alter table candidatos add column if not exists fecnac text;
alter table candidatos add column if not exists email text;
alter table candidatos add column if not exists estado_civil text;
alter table candidatos add column if not exists calle text;
alter table candidatos add column if not exists piso text;
alter table candidatos add column if not exists motivo_rechazo text;
alter table candidatos add column if not exists obs_entrevista text;
alter table candidatos add column if not exists genero text;
alter table candidatos add column if not exists asistio text;
alter table candidatos add column if not exists hora text;
alter table candidatos add column if not exists fecha text;
alter table candidatos add column if not exists localidad text;

-- Columnas faltantes en tabla psicos (por si no se ejecuto crear_tablas.sql)
-- Si la tabla ya existe con todas las columnas, estos comandos no hacen nada

alter table psicos add column if not exists candidato_id text;
alter table psicos add column if not exists antecedentes text default 'No requerido';
alter table psicos add column if not exists libreta_sanitaria text default 'No requerido';
alter table psicos add column if not exists requiere_antecedentes boolean default false;
alter table psicos add column if not exists requiere_libreta boolean default false;
alter table psicos add column if not exists psicotecnico text default 'Pendiente';
alter table psicos add column if not exists prelaboral text default 'Pendiente';
alter table psicos add column if not exists fecha_aprobacion text;
alter table psicos add column if not exists motivo_rechazo text;
alter table psicos add column if not exists fecha_rechazo text;

-- Columnas faltantes en tabla cat_alt_pendientes (por si no se ejecuto crear_tablas.sql)

alter table cat_alt_pendientes add column if not exists psico_id text;
alter table cat_alt_pendientes add column if not exists candidato_id text;
alter table cat_alt_pendientes add column if not exists identificacion jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists domicilio jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists operativo jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists uniforme jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists capital jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists seguros jsonb default '{}'::jsonb;

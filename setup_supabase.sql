-- ============================================================
-- Ohlimpia — Setup completo de tablas en Supabase
-- Ejecutar en SQL Editor del dashboard de Supabase
-- Seguro de ejecutar multiples veces (usa IF NOT EXISTS)
-- ============================================================

-- =========================
-- TABLA: candidatos
-- =========================
create table if not exists candidatos (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table candidatos add column if not exists nombre text;
alter table candidatos add column if not exists dni text;
alter table candidatos add column if not exists cuit text;
alter table candidatos add column if not exists fecnac text;
alter table candidatos add column if not exists email text;
alter table candidatos add column if not exists tel text;
alter table candidatos add column if not exists calle text;
alter table candidatos add column if not exists piso text;
alter table candidatos add column if not exists zona text;
alter table candidatos add column if not exists localidad text;
alter table candidatos add column if not exists estado_civil text;
alter table candidatos add column if not exists genero text;
alter table candidatos add column if not exists medio text;
alter table candidatos add column if not exists rrhh text;
alter table candidatos add column if not exists obs text;
alter table candidatos add column if not exists estado text default 'Sin citar';
alter table candidatos add column if not exists fecha text;
alter table candidatos add column if not exists hora text;
alter table candidatos add column if not exists asistio text;
alter table candidatos add column if not exists motivo_rechazo text;
alter table candidatos add column if not exists obs_entrevista text;

-- =========================
-- TABLA: psicos
-- =========================
create table if not exists psicos (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table psicos add column if not exists candidato_id text;
alter table psicos add column if not exists nombre text;
alter table psicos add column if not exists dni text;
alter table psicos add column if not exists zona text;
alter table psicos add column if not exists tel text;
alter table psicos add column if not exists rrhh text;
alter table psicos add column if not exists psicotecnico text default 'Pendiente';
alter table psicos add column if not exists prelaboral text default 'Pendiente';
alter table psicos add column if not exists antecedentes text default 'No requerido';
alter table psicos add column if not exists libreta_sanitaria text default 'No requerido';
alter table psicos add column if not exists requiere_antecedentes boolean default false;
alter table psicos add column if not exists requiere_libreta boolean default false;
alter table psicos add column if not exists estado text default 'En proceso';
alter table psicos add column if not exists fecha text;
alter table psicos add column if not exists obs text;
alter table psicos add column if not exists fecha_aprobacion text;
alter table psicos add column if not exists motivo_rechazo text;
alter table psicos add column if not exists fecha_rechazo text;

-- =========================
-- TABLA: cat_alt_pendientes
-- =========================
create table if not exists cat_alt_pendientes (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table cat_alt_pendientes add column if not exists psico_id text;
alter table cat_alt_pendientes add column if not exists candidato_id text;
alter table cat_alt_pendientes add column if not exists nombre text;
alter table cat_alt_pendientes add column if not exists dni text;
alter table cat_alt_pendientes add column if not exists zona text;
alter table cat_alt_pendientes add column if not exists tel text;
alter table cat_alt_pendientes add column if not exists rrhh text;
alter table cat_alt_pendientes add column if not exists estado text default 'Pendiente de alta';
alter table cat_alt_pendientes add column if not exists fecha text;
alter table cat_alt_pendientes add column if not exists identificacion jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists domicilio jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists operativo jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists uniforme jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists capital jsonb default '{}'::jsonb;
alter table cat_alt_pendientes add column if not exists seguros jsonb default '{}'::jsonb;

-- =========================
-- TABLA: turnos
-- =========================
create table if not exists turnos (
  id          bigint generated always as identity primary key,
  id_local    text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table turnos add column if not exists candidato_id text;
alter table turnos add column if not exists nombre text;
alter table turnos add column if not exists fecha text;
alter table turnos add column if not exists hora text;
alter table turnos add column if not exists estado text default 'Pendiente';
alter table turnos add column if not exists responsable text;

-- =========================
-- ROW LEVEL SECURITY
-- =========================
alter table candidatos enable row level security;
alter table psicos enable row level security;
alter table cat_alt_pendientes enable row level security;
alter table turnos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'candidatos' and policyname = 'Acceso total candidatos') then
    create policy "Acceso total candidatos" on candidatos for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'psicos' and policyname = 'Acceso total psicos') then
    create policy "Acceso total psicos" on psicos for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cat_alt_pendientes' and policyname = 'Acceso total cat_alt_pendientes') then
    create policy "Acceso total cat_alt_pendientes" on cat_alt_pendientes for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'turnos' and policyname = 'Acceso total turnos') then
    create policy "Acceso total turnos" on turnos for all using (true) with check (true);
  end if;
end$$;

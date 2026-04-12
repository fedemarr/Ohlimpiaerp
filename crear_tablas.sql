-- Tabla: psicos (evaluaciones psicotecnicas)

create table psicos (
  id                    bigint generated always as identity primary key,
  id_local              text unique not null,
  candidato_id          text,
  nombre                text,
  dni                   text,
  zona                  text,
  tel                   text,
  rrhh                  text,
  psicotecnico          text default 'Pendiente',
  prelaboral            text default 'Pendiente',
  antecedentes          text default 'No requerido',
  libreta_sanitaria     text default 'No requerido',
  requiere_antecedentes boolean default false,
  requiere_libreta      boolean default false,
  estado                text default 'En proceso',
  fecha                 text,
  obs                   text,
  fecha_aprobacion      text,
  motivo_rechazo        text,
  fecha_rechazo         text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Tabla: cat_alt_pendientes (altas pendientes)

create table cat_alt_pendientes (
  id                    bigint generated always as identity primary key,
  id_local              text unique not null,
  psico_id              text,
  candidato_id          text,
  nombre                text,
  dni                   text,
  zona                  text,
  tel                   text,
  rrhh                  text,
  estado                text default 'Pendiente de alta',
  fecha                 text,
  identificacion        jsonb default '{}'::jsonb,
  domicilio             jsonb default '{}'::jsonb,
  operativo             jsonb default '{}'::jsonb,
  uniforme              jsonb default '{}'::jsonb,
  capital               jsonb default '{}'::jsonb,
  seguros               jsonb default '{}'::jsonb,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Row Level Security

alter table psicos enable row level security;
alter table cat_alt_pendientes enable row level security;

create policy "Acceso total psicos"
  on psicos for all
  using (true) with check (true);

create policy "Acceso total cat_alt_pendientes"
  on cat_alt_pendientes for all
  using (true) with check (true);

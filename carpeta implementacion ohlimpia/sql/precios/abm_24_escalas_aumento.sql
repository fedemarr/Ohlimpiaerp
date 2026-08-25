-- =====================================================================
-- Escalas de aumento (paritarias) — PASO 1: estructura.
--
-- Juan arma "escalas de aumento" por paritaria (2-4 por año). Cada escala
-- es una secuencia de aumentos por mes (ej. 8% en 07/2026, 6% en 09/2026,
-- 5% en 11/2026). Luego filtra un grupo de clientes (por rubro / coordinador
-- / lista) y aplica la escala a todos de una vez (eso es un paso posterior;
-- acá solo se crean las tablas que guardan las escalas).
--
--   escalas_aumento          = la escala (cabecera).
--   escalas_aumento_detalle  = los meses y % de cada escala (renglones).
--
-- Sin datos de ejemplo (Juan las carga desde la pantalla).
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) escalas_aumento (cabecera de la escala)
-- ---------------------------------------------------------------------
create table if not exists public.escalas_aumento (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                          -- ej. "Paritaria Jul-Dic 2026 - Consorcios"
  descripcion text,
  paritaria   text,                                   -- ej. "Jul-Dic 2026" (agrupa escalas de una misma paritaria)
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.escalas_aumento is
  'Escala de aumento (paritaria): cabecera. Cada escala es una secuencia de aumentos por mes que luego se aplica a un grupo de clientes filtrado por rubro/coordinador/lista.';
comment on column public.escalas_aumento.nombre      is 'Nombre descriptivo de la escala. Ej. "Paritaria Jul-Dic 2026 - Consorcios".';
comment on column public.escalas_aumento.paritaria   is 'Etiqueta para agrupar escalas de una misma paritaria. Ej. "Jul-Dic 2026".';
comment on column public.escalas_aumento.activa      is 'Si la escala esta vigente/usable (soft-disable sin borrar).';


-- ---------------------------------------------------------------------
-- 2) escalas_aumento_detalle (renglones: mes + % de aumento)
-- ---------------------------------------------------------------------
create table if not exists public.escalas_aumento_detalle (
  id          uuid primary key default gen_random_uuid(),
  escala_id   uuid not null references public.escalas_aumento(id) on delete cascade,
  mes         date not null,                          -- dia 1 del mes en que aplica el aumento
  pct_aumento numeric not null,                       -- % como decimal: 0.08 = 8%
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (escala_id, mes)                             -- un solo % por mes dentro de cada escala
);

comment on table public.escalas_aumento_detalle is
  'Renglones de una escala de aumento: el % que aplica en cada mes. UNIQUE (escala_id, mes).';
comment on column public.escalas_aumento_detalle.mes         is 'Mes en que aplica el aumento (dia 1).';
comment on column public.escalas_aumento_detalle.pct_aumento is '% de aumento como decimal (0.08 = 8%).';

create index if not exists idx_escalas_detalle_escala on public.escalas_aumento_detalle (escala_id, mes);


-- ---------------------------------------------------------------------
-- Verificacion (tablas nuevas, 0 filas; columnas creadas)
-- ---------------------------------------------------------------------
select 'escalas_aumento' as tabla, count(*) as filas from public.escalas_aumento
union all
select 'escalas_aumento_detalle', count(*) from public.escalas_aumento_detalle;

select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name in ('escalas_aumento', 'escalas_aumento_detalle')
 order by table_name, ordinal_position;

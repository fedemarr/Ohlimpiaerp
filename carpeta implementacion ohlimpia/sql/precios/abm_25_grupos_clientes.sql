-- =====================================================================
-- Grupos de clientes (para aplicar escalas/paritarias) — estructura.
--
-- Modelo (definido por Juan):
--   PARITARIA = el período de la negociación (ej. "Julio 2026").
--   MODELO de aumento = escalas_aumento (ya existe): meses y % de una paritaria.
--   GRUPO de clientes (ESTO) = lista de clientes (ej. "Consorcios", "Zona Lopez",
--      "Zona Bettolli"). Son ESTABLES y se reusan en cada paritaria; se les
--      agrega/saca clientes o se reconfiguran. NO interesa la historia del grupo:
--      es solo una herramienta para filtrar rapido y aplicar la escala.
--
--   grupos_clientes          = el grupo (cabecera).
--   grupos_clientes_detalle  = que clientes tiene (estado actual, sin historia).
--
-- Sin datos de ejemplo. Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) grupos_clientes (cabecera del grupo)
-- ---------------------------------------------------------------------
create table if not exists public.grupos_clientes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                          -- ej. "Consorcios", "Zona Lopez"
  descripcion text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.grupos_clientes is
  'Grupo estable de clientes para aplicar escalas de aumento (paritarias). Es un estado actual, sin historizacion: se reusa y se reconfigura entre paritarias.';
comment on column public.grupos_clientes.nombre is 'Nombre del grupo. Ej. "Consorcios", "Zona Lopez", "Zona Bettolli".';
comment on column public.grupos_clientes.activo is 'Si el grupo esta en uso (soft-disable sin borrar).';


-- ---------------------------------------------------------------------
-- 2) grupos_clientes_detalle (miembros del grupo)
-- ---------------------------------------------------------------------
create table if not exists public.grupos_clientes_detalle (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.grupos_clientes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (grupo_id, cliente_id)                       -- un cliente aparece una sola vez por grupo
);

comment on table public.grupos_clientes_detalle is
  'Miembros de un grupo de clientes (estado actual). UNIQUE (grupo_id, cliente_id). Sin historia: al reconfigurar el grupo se agregan/quitan filas.';
comment on column public.grupos_clientes_detalle.cliente_id is 'Cliente miembro del grupo (FK a clientes).';

create index if not exists idx_grupos_det_grupo   on public.grupos_clientes_detalle (grupo_id);
create index if not exists idx_grupos_det_cliente on public.grupos_clientes_detalle (cliente_id);


-- ---------------------------------------------------------------------
-- Verificacion (tablas nuevas, 0 filas; columnas creadas)
-- ---------------------------------------------------------------------
select 'grupos_clientes' as tabla, count(*) as filas from public.grupos_clientes
union all
select 'grupos_clientes_detalle', count(*) from public.grupos_clientes_detalle;

select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name in ('grupos_clientes', 'grupos_clientes_detalle')
 order by table_name, ordinal_position;

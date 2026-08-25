-- FinFlow — Esquema Supabase (PostgreSQL)
-- Correr en el SQL editor del proyecto Supabase.

-- Extensiones
create extension if not exists "pgcrypto";

-- =====================================================================
-- clientes
-- =====================================================================
create table if not exists public.clientes (
    id             uuid primary key default gen_random_uuid(),
    nombre         text not null,
    cuit           text unique,
    condicion_iva  text,
    email          text,
    telefono       text,
    direccion      text,
    activo         boolean not null default true,
    fecha_alta     date not null default current_date,
    observaciones  text,
    odoo_id        text unique,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists idx_clientes_cuit on public.clientes(cuit);
create index if not exists idx_clientes_odoo_id on public.clientes(odoo_id);

-- =====================================================================
-- sucursales
-- =====================================================================
create table if not exists public.sucursales (
    id             uuid primary key default gen_random_uuid(),
    cliente_id     uuid not null references public.clientes(id) on delete cascade,
    nombre         text not null,
    direccion      text,
    activo         boolean not null default true,
    observaciones  text,
    odoo_id        text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists idx_sucursales_cliente on public.sucursales(cliente_id);
create index if not exists idx_sucursales_odoo_id on public.sucursales(odoo_id);

-- =====================================================================
-- facturas
-- =====================================================================
create table if not exists public.facturas (
    id                 uuid primary key default gen_random_uuid(),
    numero             text not null,
    tipo               text check (tipo is null or tipo in ('A','B','C','E','nota_credito')),
    cliente_id         uuid not null references public.clientes(id),
    sucursal_id        uuid references public.sucursales(id),
    fecha_emision      date not null,
    fecha_vencimiento  date,
    importe_neto       numeric(14,2) not null default 0,
    iva                numeric(14,2) not null default 0,
    importe_total      numeric(14,2) not null default 0,
    saldo              numeric(14,2) not null default 0,
    estado             text not null default 'pendiente'
                       check (estado in ('pendiente','parcial','cobrada','vencida','anulada')),
    observaciones      text,
    odoo_id            text unique,
    conciliacion_id    text,
    periodo_servicio   date,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index if not exists idx_facturas_cliente on public.facturas(cliente_id);
create index if not exists idx_facturas_sucursal on public.facturas(sucursal_id);
create index if not exists idx_facturas_emision on public.facturas(fecha_emision);
create index if not exists idx_facturas_vencimiento on public.facturas(fecha_vencimiento);
create index if not exists idx_facturas_estado on public.facturas(estado);
create index if not exists idx_facturas_numero on public.facturas(numero);
create index if not exists idx_facturas_conciliacion on public.facturas(conciliacion_id);
create index if not exists idx_facturas_periodo_servicio on public.facturas(periodo_servicio);

-- =====================================================================
-- cobros
-- =====================================================================
create table if not exists public.cobros (
    id             uuid primary key default gen_random_uuid(),
    factura_id     uuid not null references public.facturas(id) on delete cascade,
    fecha          date not null,
    importe        numeric(14,2) not null,
    medio_pago     text check (medio_pago in ('transferencia','cheque','efectivo','debito','otro')),
    referencia     text,
    observaciones  text,
    odoo_id        text unique,
    conciliacion_id text,
    fecha_acreditacion date,
    created_at     timestamptz not null default now()
);
create index if not exists idx_cobros_factura on public.cobros(factura_id);
create index if not exists idx_cobros_fecha on public.cobros(fecha);
create index if not exists idx_cobros_conciliacion on public.cobros(conciliacion_id);
create index if not exists idx_cobros_fecha_acreditacion on public.cobros(fecha_acreditacion);

-- =====================================================================
-- facturas_periodo_override — reasignación manual de período de facturación
-- =====================================================================
create table if not exists public.facturas_periodo_override (
    id                 uuid primary key default gen_random_uuid(),
    factura_id         uuid not null unique references public.facturas(id) on delete cascade,
    periodo_original   date not null,
    periodo_override   date not null,
    fecha_modificacion timestamptz not null default now(),
    usuario            text not null default 'admin'
);
create index if not exists idx_fac_periodo_override_factura on public.facturas_periodo_override(factura_id);
create index if not exists idx_fac_periodo_override_periodo on public.facturas_periodo_override(periodo_override);

-- =====================================================================
-- cobros_cheques — detalle por cheque (imputado o pendiente de pago Borrador)
-- =====================================================================
create table if not exists public.cobros_cheques (
    id             uuid primary key default gen_random_uuid(),
    cheque_numero  text not null unique,
    fecha          date not null,
    importe        numeric(14,2) not null,
    factura_id     uuid references public.facturas(id) on delete cascade,
    cobro_id       uuid references public.cobros(id)   on delete set null,
    estado         text not null default 'pendiente'
                   check (estado in ('pendiente','imputado')),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists idx_cobros_cheques_cobro   on public.cobros_cheques(cobro_id);
create index if not exists idx_cobros_cheques_factura on public.cobros_cheques(factura_id);
create index if not exists idx_cobros_cheques_estado  on public.cobros_cheques(estado);
create index if not exists idx_cobros_cheques_fecha   on public.cobros_cheques(fecha);

-- =====================================================================
-- plan — proyección mensual por (periodo, cliente, sucursal)
-- =====================================================================
create table if not exists public.plan (
    id                    uuid primary key default gen_random_uuid(),
    periodo               date not null,  -- primer día del mes (YYYY-MM-01)
    cliente_id            uuid not null references public.clientes(id),
    sucursal_id           uuid references public.sucursales(id),
    concepto              text,
    monto_facturacion     numeric(14,2) not null default 0,
    monto_cobro           numeric(14,2) not null default 0,
    fecha_cobro_esperada  date,
    observaciones         text,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    constraint uq_plan_periodo_cliente_suc unique (periodo, cliente_id, sucursal_id)
);
create index if not exists idx_plan_periodo on public.plan(periodo);
create index if not exists idx_plan_cliente on public.plan(cliente_id);

-- =====================================================================
-- real — snapshot mensual agregado (facturas + cobros)
-- =====================================================================
create table if not exists public.real (
    id                uuid primary key default gen_random_uuid(),
    periodo           date not null,
    cliente_id        uuid not null references public.clientes(id),
    sucursal_id       uuid references public.sucursales(id),
    monto_facturado   numeric(14,2) not null default 0,
    monto_cobrado     numeric(14,2) not null default 0,
    calculado_en      timestamptz not null default now(),
    constraint uq_real_periodo_cliente_suc unique (periodo, cliente_id, sucursal_id)
);
create index if not exists idx_real_periodo on public.real(periodo);
create index if not exists idx_real_cliente on public.real(cliente_id);

-- =====================================================================
-- trigger updated_at automático
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clientes','sucursales','facturas','plan','cobros_cheques'] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on public.%1$s;
       create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;

-- =====================================================================
-- Row Level Security (activar cuando se defina el modelo de auth)
-- =====================================================================
-- alter table public.clientes    enable row level security;
-- alter table public.sucursales  enable row level security;
-- alter table public.facturas    enable row level security;
-- alter table public.cobros      enable row level security;
-- alter table public.plan        enable row level security;
-- alter table public.real        enable row level security;

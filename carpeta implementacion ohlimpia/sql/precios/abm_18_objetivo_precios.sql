-- =====================================================================
-- Etapa A — objetivo_precios: precio por OBJETIVO por mes (una fila por mes,
-- como la vieja clientes_precios pero ligada a sucursales/objetivo en vez de
-- cliente+contrato). Fuente principal: Base Precios LIGE (Importe Hora A).
--
-- UNIQUE (sucursal_id, mes, tipo_servicio): hoy cada objetivo es mono-servicio,
-- asi que equivale a (sucursal_id, mes); se deja tipo_servicio por si un objetivo
-- llega a tener precio de vigilancia + custodia (caso que existia en el modelo
-- viejo: EDESUR/DIA) o para la segunda tarifa (Importe Hora B) sin migrar esquema.
--
-- precio_hora   = Importe Hora A de LIGE -> es EL QUE SE FACTURA.
-- precio_hora_b = Importe Hora B de LIGE -> espejado de referencia, SIN uso actual.
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================

create table if not exists public.objetivo_precios (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null references public.sucursales(id) on delete cascade,  -- el objetivo
  codigo_objetivo text,                                                             -- redundante (lectura/cruce)
  cliente_id     uuid references public.clientes(id) on delete cascade,             -- agrupar por cliente sin join
  mes            date not null,                                                     -- dia 1 del mes
  precio_hora    numeric not null check (precio_hora >= 0),                         -- Importe Hora A de LIGE (SE FACTURA); o monto si tipo_precio='fijo'
  precio_hora_b  numeric,                                                           -- Importe Hora B de LIGE (referencia, SIN uso actual)
  horas_vendidas numeric,                                                           -- opcional (facturacion futura)
  tipo           text not null check (tipo in ('real','proyectado')),
  tipo_precio    text not null default 'hora' check (tipo_precio in ('hora','fijo')),
  tipo_servicio  text check (tipo_servicio in ('vigilancia','custodia','otro')),    -- hereda del objetivo (sucursales)
  fuente         text check (fuente in ('lige','historico_viejo','manual','proyectado')),
  pct_aumento    numeric,                                                           -- % aumento del mes (trazabilidad)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (sucursal_id, mes, tipo_servicio)
);

comment on column public.objetivo_precios.precio_hora   is 'Importe Hora A de LIGE: es el valor que SE FACTURA (o monto mensual si tipo_precio=fijo).';
comment on column public.objetivo_precios.precio_hora_b is 'Importe Hora B de LIGE: espejado/de referencia. SIN uso actual (no se factura); se guarda hasta aclarar que significa.';

create index if not exists idx_obj_precios_suc_mes on public.objetivo_precios (sucursal_id, mes);
create index if not exists idx_obj_precios_cli_mes on public.objetivo_precios (cliente_id, mes);
create index if not exists idx_obj_precios_cod     on public.objetivo_precios (codigo_objetivo);

-- verificacion (tabla nueva, 0 filas; columnas creadas)
select count(*) as filas from public.objetivo_precios;
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='objetivo_precios'
 order by ordinal_position;

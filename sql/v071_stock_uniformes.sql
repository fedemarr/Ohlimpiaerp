-- v071 — Stock de uniformes (ticket "Módulo Logística" 08/2026, fase 2:
-- Stock). El circuito de pedidos, precios de venta/descuento y
-- devoluciones YA existían (ver v067 en adelante para otras tablas de
-- uniformes) — esto agrega el control de stock físico que faltaba,
-- reemplazando el ítem "Próximamente" del menú.
--
-- 4 tablas:
-- - stock_uniformes: nivel actual (lógico) por prenda+talle.
-- - stock_uniformes_movimientos: ledger de entradas/salidas/ajustes —
--   auditoría completa y base para la futura Previsión de compras
--   (consumo histórico).
-- - compras_uniformes: lote de compra a proveedor (costo real pagado —
--   distinto de precios_uniformes, que es lo que se le cobra al
--   operario por pérdida/daño, no lo que la cooperativa pagó).
-- - stock_conteos_uniformes: conteo físico periódico del depósito,
--   comparado contra el stock lógico en ese momento.
BEGIN;

CREATE TABLE IF NOT EXISTS stock_uniformes (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  prenda text not null,
  talle text not null,
  cantidad numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS stock_uniformes_movimientos (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  tipo text not null, -- 'entrada' | 'salida' | 'ajuste'
  prenda text not null,
  talle text not null,
  cantidad numeric not null,
  motivo text,
  ref_tipo text, -- 'compra' | 'pedido' | 'conteo'
  ref_id_local text,
  fecha timestamptz default now(),
  registrado_por text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS compras_uniformes (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  fecha date not null,
  proveedor text,
  nro_factura text,
  items jsonb not null default '[]'::jsonb,
  total numeric,
  observaciones text,
  registrado_por text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS stock_conteos_uniformes (
  id bigint generated always as identity primary key,
  id_local text unique not null,
  fecha timestamptz default now(),
  items jsonb not null default '[]'::jsonb,
  observaciones text,
  registrado_por text,
  created_at timestamptz default now()
);

COMMIT;

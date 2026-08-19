-- v095_stock_productos.sql
-- Stock de productos de limpieza (extiende el módulo Stock existente de
-- uniformes con tablas paralelas para productos). La UI unifica ambas
-- categorías en una sola vista con filtro.
--
-- Se mantiene stock_uniformes / stock_uniformes_movimientos intactas.
-- Las nuevas tablas usan producto_id_local como FK lógica a pp_productos.
--
-- flujo de stock:
--   ENTRADA  ← recepción de pedido de productos (marcarEntregadoPP)
--   SALIDA   ← futura entrega a servicio (checklist de armado)
--   AJUSTE   ← inventario físico / merma / rotura
--
-- PPP (costo promedio ponderado) se calcula en runtime al momento de la
-- entrada: si hay 100 a $4.180 y entran 60 a $4.559, el PPP nuevo es
-- $4.322.13. Se almacena en la fila de stock_productos.

BEGIN;

-- ========== 1. Nivel actual de stock de productos ==========
CREATE TABLE IF NOT EXISTS public.stock_productos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  producto_id_local text NOT NULL,       -- FK lógica a pp_productos.id_local
  cantidad          numeric NOT NULL DEFAULT 0,
  costo_ppp         numeric(12,2) NOT NULL DEFAULT 0,  -- costo promedio ponderado
  costo_vigente     numeric(12,2) NOT NULL DEFAULT 0,  -- último precio de lista (referencia)
  stock_minimo      numeric(10,2) DEFAULT 0,           -- configurable (futuro)
  stock_objetivo    numeric(10,2) DEFAULT 0,           -- nivel objetivo (futuro)

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_productos_producto ON public.stock_productos(producto_id_local);

-- ========== 2. Ledger de movimientos ==========
CREATE TABLE IF NOT EXISTS public.stock_productos_movimientos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,

  tipo                text NOT NULL,          -- 'entrada' | 'salida' | 'ajuste' | 'refuerzo'
  producto_id_local   text NOT NULL,
  cantidad            numeric NOT NULL,       -- positiva para entrada/refuerzo, negativa para salida
  costo_unitario      numeric(12,2) NOT NULL DEFAULT 0,  -- costo de esta línea (PPP al salir, precio de compra al entrar)
  motivo              text,
  ref_tipo            text,                   -- 'pedido_producto' | 'compra' | 'conteo' | 'ajuste'
  ref_id_local        text,
  registrado_por      text,

  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_prod_mov_producto ON public.stock_productos_movimientos(producto_id_local);
CREATE INDEX IF NOT EXISTS idx_stock_prod_mov_tipo ON public.stock_productos_movimientos(tipo);

-- ========== RLS ==========
ALTER TABLE public.stock_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_productos_movimientos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_productos_all') THEN
    CREATE POLICY stock_productos_all ON public.stock_productos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_productos_movimientos_all') THEN
    CREATE POLICY stock_productos_movimientos_all ON public.stock_productos_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

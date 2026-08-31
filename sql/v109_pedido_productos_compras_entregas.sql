-- =============================================================================
-- Migración: v109 — Pedido de productos: Compras por proveedor + Entregas
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo productos" (Lautaro, 31/08), puntos 10 y 11 del checklist
-- de PEDIDO_PRODUCTOS_ajustes_para_Fede.md — la parte que quedó afuera de
-- v108 (que cubrió 1-9). Cambio de fondo que pide el punto 6: Logística NO
-- compra por servicio, compra el CONSOLIDADO por proveedor. Son dos
-- unidades y dos circuitos distintos:
--   - COMPRAS   (unidad: el proveedor) — consolidado → sugerencias de
--     equivalentes más baratos → simulación de ahorro → orden de compra →
--     seguimiento hasta la recepción → factura (alimenta PPP + cta cte).
--   - ENTREGAS  (unidad: el servicio) — arranca con lo recibido, armado
--     con checklist → remito → reparto → entregado (firma/foto).
--
-- Los botones viejos "Marcar en compra"/"Marcar entregado" (a nivel
-- PEDIDO, v085) quedan tal cual para pedidos que ya estén en ese flujo —
-- no se tocan datos existentes. El circuito nuevo es ADITIVO: la
-- consolidación de v109 solo toma ítems que todavía no tengan
-- orden_compra_id_local (pp_items.orden_compra_id_local, nuevo).
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) pp_items — enganche con la orden de compra que se los llevó
--    (evita re-consolidar un ítem que ya está en una orden)
-- ============================================================
ALTER TABLE public.pp_items
  ADD COLUMN IF NOT EXISTS orden_compra_id_local text,
  ADD COLUMN IF NOT EXISTS cantidad_recibida     numeric,   -- null = todavía sin recepción cargada
  ADD COLUMN IF NOT EXISTS armado                boolean NOT NULL DEFAULT false;  -- checklist de Entregas

-- ============================================================
-- 2) pp_grupos_equivalencia — "productos iguales" de distintos proveedores
--    (Comparador de precios, punto 6a.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_grupos_equivalencia (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  nombre        text NOT NULL,
  unidad_comun  text NOT NULL,   -- ej "BOLSA", "LITRO" — a qué se lleva todo con el factor
  anulado       boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pp_grupos_equivalencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_grupos_equivalencia FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pp_grupos_equivalencia_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  grupo_id_local      text NOT NULL REFERENCES public.pp_grupos_equivalencia(id_local) ON DELETE CASCADE,
  producto_id_local   text NOT NULL,
  factor_conversion   numeric NOT NULL DEFAULT 1,  -- 1 unidad de compra = factor × unidad común

  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_geq_items_grupo ON public.pp_grupos_equivalencia_items(grupo_id_local);
ALTER TABLE public.pp_grupos_equivalencia_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_grupos_equivalencia_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3) pp_ordenes_compra — unidad PROVEEDOR (punto 6a.1/6a.4). items en
--    jsonb (mismo patrón que compras_uniformes de v071): es un snapshot
--    de lo que se pidió, no hace falta una tabla de líneas aparte.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_ordenes_compra (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text NOT NULL UNIQUE,

  numero                text,             -- "OC-2026-031", correlativo (se arma en JS)
  periodo_id_local      text NOT NULL,
  proveedor_id_local    text NOT NULL,

  estado                text NOT NULL DEFAULT 'confirmada',
    -- confirmada / enviada / recibida_parcial / recibida_completa
  items                 jsonb NOT NULL DEFAULT '[]',
    -- [{productoIdLocal, codigoProveedor, descripcion, costoUnit,
    --   cantidad, cantidadRecibida, obsLinea, sustituidoPor}]
  total                 numeric(14,2) NOT NULL DEFAULT 0,

  confirmada_por        text,
  confirmada_en         text,
  enviada_en            text,
  recibida_en           text,             -- última recepción cargada (parcial o completa)
  backorder_fecha_comprometida text,      -- fecha que dio el proveedor para lo pendiente

  factura_nro           text,
  factura_fecha         text,
  factura_monto         numeric(14,2),
  factura_registrada_por text,
  factura_registrada_en text,

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_ordenes_periodo ON public.pp_ordenes_compra(periodo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pp_ordenes_proveedor ON public.pp_ordenes_compra(proveedor_id_local) WHERE NOT anulado;
ALTER TABLE public.pp_ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_ordenes_compra FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) proveedores_cta_cte_movimientos — punto 6a.4: la factura genera el
--    movimiento en la cuenta corriente del proveedor. Ledger simple
--    (debe/haber en un solo campo con signo), sin saldo materializado —
--    el saldo se calcula sumando (mismo criterio que
--    stock_uniformes_movimientos, v071).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proveedores_cta_cte_movimientos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  proveedor_id_local  text NOT NULL,
  tipo                text NOT NULL,   -- 'factura' | 'pago' | 'ajuste'
  monto               numeric(14,2) NOT NULL,  -- factura = positivo (aumenta la deuda), pago = negativo
  motivo              text,
  ref_tipo            text,            -- 'orden_compra'
  ref_id_local        text,

  registrado_por      text,
  fecha               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_ctacte_proveedor ON public.proveedores_cta_cte_movimientos(proveedor_id_local);
ALTER TABLE public.proveedores_cta_cte_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.proveedores_cta_cte_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5) pp_remitos — unidad SERVICIO (punto 6b): se genera al completar el
--    armado con checklist. Correlativo propio (independiente del de
--    órdenes de compra).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_remitos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  numero              text,            -- correlativo "R-000123"
  pedido_id_local     text NOT NULL,
  servicio_codigo     text NOT NULL,

  items               jsonb NOT NULL DEFAULT '[]',  -- snapshot armado: [{productoIdLocal, descripcion, cantidad}]

  estado              text NOT NULL DEFAULT 'armado',  -- armado / en_reparto / entregado
  armado_por          text,
  armado_en           text,
  en_reparto_en       text,
  entregado_a         text,            -- quién recibió
  entregado_en        text,
  foto_path           text,            -- Storage: bucket ohlimpia-adjuntos
  firma_cliente       boolean NOT NULL DEFAULT false,  -- true si el servicio es PAGAN y hubo firma

  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_remitos_pedido ON public.pp_remitos(pedido_id_local);
ALTER TABLE public.pp_remitos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_remitos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6) pp_pedidos — fecha límite de entrega (Hoja de recorrido, punto 6b)
-- ============================================================
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS fecha_limite_entrega text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

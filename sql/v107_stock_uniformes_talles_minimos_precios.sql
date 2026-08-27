-- =============================================================================
-- Migración: v107 — Stock de uniformes: columna Talle, tab Mínimos, tab Precios
-- Fecha:     2026-08-27
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "STOCK DE UNIFORMES — Talles, mínimos y precios" (Lautaro,
-- 26/08), con mockup_stock_uniformes_minimos_4.html. Los "tres agregados"
-- sobre el módulo que ya funciona (stock inicial importado, v101):
--   1. Columna TALLE en la grilla de Stock actual (+ valorización PPP/vigente).
--   2. Tab MÍNIMOS (nuevo) — vive en el módulo, NO en Configuración.
--   3. Tab PRECIOS (nuevo, solo uniformes) — precio de reposición vigente
--      con vigencia mensual (mecánica "Valores hora" de Categorías).
--
-- LO QUE YA EXISTÍA Y SE REUSA TAL CUAL (sin tocar esquema):
--   - precios_uniformes (v032): ya soporta prenda+talle+vigencia. El
--     ticket pide "SIN excepciones por talle" para el tab nuevo — se logra
--     usando esta misma tabla con talle SIEMPRE null, sin cambiar el
--     esquema (talle ya es nullable y obtenerPrecioVigente() ya prioriza
--     "sin talle" como precio general).
--   - stock_uniformes_movimientos (v071): ya registra las salidas por
--     entrega — de ahí sale "Consumo prom./mes" sin tabla nueva.
--
-- LO QUE SE AGREGA:
--   - stock_uniformes.costo_ppp: columna nueva, en 0 hasta que exista un
--     circuito de "Nueva compra" de uniformes (compras_uniformes ya
--     existe desde v071 pero sin UI todavía — FUERA de alcance de este
--     ticket, que son los "tres agregados"). Con costo_ppp en 0 la
--     grilla muestra "—", igual que un precio de reposición sin cargar.
--   - stock_minimos: unificada uniformes (prenda+talle) y productos
--     (producto_id_local) — el ticket pide expresamente que Mínimos
--     sirva para las dos categorías con la misma grilla.
--   - stock_minimos_ajustes: registro de cambios (usuario, fecha, valor
--     anterior) — pedido explícito del ticket.
--   - stock_config: umbral BAJO⚠ (% del mínimo, default 60%) y N meses
--     para la "propuesta general" (default 2) — parametrizable, mismo
--     patrón que pedidos_config (v106): seed SQL, editable directo en la
--     tabla, sin pantalla de ABM todavía.
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) stock_uniformes — costo_ppp (queda en 0 = "sin dato" hasta que haya
--    compras de uniformes cargadas)
-- ============================================================
ALTER TABLE public.stock_uniformes
  ADD COLUMN IF NOT EXISTS costo_ppp numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 2) stock_minimos — uniformes (prenda+talle) y productos (producto_id_local)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_minimos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text NOT NULL UNIQUE,

  categoria        text NOT NULL,   -- 'UNIFORMES' | 'PRODUCTOS'
  prenda           text,            -- solo UNIFORMES
  talle            text,            -- solo UNIFORMES
  producto_id_local text,           -- solo PRODUCTOS (matchea ppProductos.id, como stock_productos)
  minimo           numeric NOT NULL DEFAULT 0,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Una fila por combinación prenda+talle (uniformes) o por producto (productos).
CREATE UNIQUE INDEX IF NOT EXISTS stock_minimos_unif_key
  ON public.stock_minimos (prenda, talle) WHERE categoria = 'UNIFORMES';
CREATE UNIQUE INDEX IF NOT EXISTS stock_minimos_prod_key
  ON public.stock_minimos (producto_id_local) WHERE categoria = 'PRODUCTOS';

ALTER TABLE public.stock_minimos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_minimos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3) stock_minimos_ajustes — registro de cambios (pedido explícito del ticket)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_minimos_ajustes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text NOT NULL UNIQUE,

  categoria      text NOT NULL,
  -- Texto ya armado ("AMBO (8 talles)", "AMBO 5XL", nombre del producto):
  -- evita tener que resolver joins para mostrar el historial.
  clave          text NOT NULL,
  valor_anterior numeric,
  valor_nuevo    numeric NOT NULL,
  motivo         text,             -- ej. "mínimo general de la prenda", "propuesta general", null = ajuste manual puntual
  usuario        text,
  fecha          text,             -- DD/MM/AAAA HH:MM, mismo criterio que pedidos_eventos.fecha (v106):
                                    -- created_at lo descarta _toCamel(), hace falta columna propia para mostrarlo.

  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_minimos_ajustes_fecha_idx ON public.stock_minimos_ajustes (created_at DESC);

ALTER TABLE public.stock_minimos_ajustes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_minimos_ajustes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) stock_config — umbral BAJO⚠ y N meses de la propuesta general
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.stock_config (clave, valor) VALUES
  ('umbral_bajo_critico_pct', '0.6'),
  ('meses_propuesta_minimo', '2')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

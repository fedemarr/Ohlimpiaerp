-- =============================================================================
-- Migración: v113 — Pedido de productos: correcciones ronda de prueba 02/09
-- Fecha:     2026-09-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Correcciones y mejoras de Pedido de productos" — mockup
-- mockup_pedidosdeproductosmejoras.html, armado por Lautaro sobre su
-- prueba real del 02/09 (período 2026-09, servicios Migueletes + Hit
-- Ugarte). 8 correcciones puntuales (FIX 1 a FIX 8) sobre el módulo ya
-- construido en v108/v109:
--   FIX 1/2b — la sustitución aceptada en Sugerencias se refleja en el
--     Consolidado (línea mudada al bloque del proveedor del sustituto) y
--     cada proveedor se confirma por separado.
--   FIX 2   — el bloque de un proveedor ya confirmado deja un "rastro"
--     (link a la orden generada) en vez de desaparecer.
--   FIX 3   — el ahorro real de una sugerencia multiplica por el factor
--     de conversión (unidades comunes del pedido, no bultos).
--   FIX 4   — diferencias menores al umbral de empate (2%) no generan
--     sugerencia de cambio.
--   FIX 6   — "Marca" (3M, Diversey, etc.) pasa a ser un dato del
--     PRODUCTO, separado del proveedor real que lo vende.
--   FIX 7   — exportar una orden ya confirmada (formato archivo de
--     compra actual).
--   FIX 8   — un pedido aprobado por el auditor no desaparece de la
--     Bandeja: baja a "Resueltos este período" con historial completo.
-- =============================================================================

BEGIN;

-- ========== FIX 6: Marca del producto (separada del proveedor) ==========
ALTER TABLE public.pp_productos
  ADD COLUMN IF NOT EXISTS marca text;

-- ========== FIX 8: rastro de auditoría por pedido ==========
-- Snapshot del motivo que lo mandó a la bandeja (para "Resueltos" — no se
-- recalcula motivosRevisionPP() después de aprobado, porque el auditor
-- pudo haber ajustado cantidades y ya no daría el mismo motivo) +
-- bandera de si pasó por "observado" alguna vez en su vida (para el
-- texto "aprobado tras devolución con propuesta" vs "sin cambios").
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS motivo_revision_snapshot text,
  ADD COLUMN IF NOT EXISTS tuvo_observacion boolean NOT NULL DEFAULT false;

-- Historial de eventos por pedido (mismo patrón que
-- pedido_uniforme_eventos, v071/v112): un registro por transición, con
-- quién/cuándo/qué cambió. Alimenta el modal "Historial" de la Bandeja
-- del auditor.
CREATE TABLE IF NOT EXISTS public.pp_pedido_eventos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  pedido_id_local   text NOT NULL,
  estado_desde      text,
  estado_hasta      text NOT NULL,
  ejecutado_por     text,
  ejecutado_en      text NOT NULL,
  observaciones     text,

  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_pedido_eventos_pedido ON public.pp_pedido_eventos(pedido_id_local);
ALTER TABLE public.pp_pedido_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_pedido_eventos;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_pedido_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

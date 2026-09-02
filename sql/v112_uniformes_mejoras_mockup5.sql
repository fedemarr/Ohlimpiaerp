-- =============================================================================
-- Migración: v112 — Uniformes: mejoras del mockup "solicitud_uniformes (5)"
-- Fecha:     2026-09-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Mejoras del módulo de uniformes" — mockup enviado por WhatsApp
-- (mockup_solicitud_uniformes_5.html, ya en el repo). Decisiones confirmadas
-- por el solicitante (02/09):
--   - Se saca el paso de autorización de RRHH — el pedido va directo a
--     Logística ("la política ya validó sola").
--   - Las reglas de política (renovación SIN CARGO cada 6 meses; Campera/
--     Calzado SIN CARGO la primera vez y CON DESCUENTO después; Polar/
--     Campera solo en ventana marzo-septiembre) son las reglas reales, no
--     ejemplos ilustrativos.
--
-- Con RRHH afuera del circuito operativo, Logística pasa a ser quien
-- recibe la devolución de constancia+viejo y cierra el pedido (antes lo
-- hacía RRHH) — es quien maneja el depósito físico, tiene más sentido que
-- RRHH siga siendo el que confirma un traspaso que ya no existe.
-- =============================================================================

BEGIN;

-- ========== 1. Punto de retiro (Recepción / Maure) ==========
ALTER TABLE public.pedidos_uniformes
  ADD COLUMN IF NOT EXISTS punto_retiro text NOT NULL DEFAULT 'Recepción';

-- ========== 2. Config genérica del módulo (mismo patrón que
--    pedidos_config/stock_config — clave/valor, editable directo en la
--    tabla mientras no tenga pantalla propia) ==========
CREATE TABLE IF NOT EXISTS public.uniformes_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.uniformes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.uniformes_config;
CREATE POLICY "Solo usuarios autenticados" ON public.uniformes_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.uniformes_config (clave, valor) VALUES
  ('cuotas_descuento', '4')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- =============================================================================
-- Migración: v119 — Pedido de productos: persistir la decisión de
--            Sugerencias (aceptar/mantener equivalente), hoy solo en memoria
-- Fecha:     05/09/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (ticket "Colores/badges de proveedores" — punto 3, bug real)
-- --------
-- _decisionesSugerenciasPP (compras.js) era un Map en memoria del módulo,
-- NUNCA persistido: si Logística aceptaba una sugerencia (cambio de
-- proveedor por equivalente más barato) y la pestaña se recargaba o se
-- cerraba ANTES de generar la orden — algo tan simple como revisar otro
-- tab, un corte de luz, o retomarlo al otro día — la decisión se perdía
-- en silencio. Al generar la orden más tarde, se armaba con el producto
-- ORIGINAL (proveedor viejo) como si nunca se hubiera decidido nada: "la
-- aprobación no impacta en la orden de compra".
--
-- Encima, la clave del Map era SOLO el producto (productoIdLocal), sin el
-- período — dos períodos con sugerencias pendientes sobre el mismo par de
-- productos se pisaban entre sí, y "Confirmar TODO el período" borraba
-- TODAS las decisiones de TODOS los períodos (_decisionesSugerenciasPP.clear()),
-- no solo las del período que se acababa de confirmar.
--
-- Esta tabla reemplaza ese Map: una fila por (período, producto pedido),
-- con upsert por esa clave — sobrevive a un reload y queda scopeada al
-- período real.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pp_sugerencias_decisiones (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text NOT NULL UNIQUE,

  periodo_id_local  text NOT NULL,
  producto_id_local text NOT NULL,     -- producto ACTUAL (el que pidió el supervisor)
  aceptada          boolean NOT NULL,  -- true = sustituir por el equivalente · false = mantener el actual
  sustituto_id_local text,             -- solo si aceptada=true: producto equivalente elegido
  motivo            text,              -- solo si aceptada=false: motivo obligatorio de "Mantener"
  decidido_por       text,
  decidido_en        timestamptz NOT NULL DEFAULT now(),

  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (periodo_id_local, producto_id_local)
);

ALTER TABLE public.pp_sugerencias_decisiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pp_sugerencias_decisiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v123 — Pedido de productos Ronda 5, punto 2:
--            circuito "comprar para stock / entregar desde stock"
-- Fecha:     10/09/2026
-- Autor:     Fede (vía asistente)
-- =============================================================================
--
-- CONTEXTO (ticket ronda 5, punto 2 — validado con el proceso real que
-- contó el auditor)
-- --------
-- La OC deja de "comprar el pedido": REPONE EL DEPÓSITO. La propuesta de
-- compra por producto se calcula sola:
--     compra sugerida = consumo del período + mínimo − stock actual
-- (si da <= 0, NO se compra). El consumo sale del consolidado (con
-- sustituciones aplicadas y cantidades convertidas), el mínimo y el stock
-- del módulo Stock. La columna es EDITABLE — el sistema propone, Logística
-- decide. Y se pueden agregar LÍNEAS MANUALES (stockeo sin consumo previo:
-- apertura de servicio, stockeo estratégico, oportunidad de precio, otro).
--
-- Esta tabla guarda SOLO lo que Logística tocó a mano sobre la propuesta
-- (override de cantidad y/o líneas manuales) — las filas calculadas sin
-- tocar se derivan de la fórmula en cada render, no se persisten. Clave
-- (periodo, producto): una decisión por producto por período, upsert.
--
-- pp_remitos.faltantes: cuando el armado es PARCIAL (el stock no cubría el
-- pedido), acá queda el faltante por producto — alimenta la prioridad en
-- la reposición y el rastro. jsonb: [{ productoIdLocal, cantidad }].
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pp_reposicion_ajustes (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text NOT NULL UNIQUE,

  periodo_id_local  text NOT NULL,
  producto_id_local text NOT NULL,

  cantidad_override numeric,          -- cantidad que Logística fijó a mano (null = usar la calculada)
  es_manual         boolean NOT NULL DEFAULT false,  -- true = línea agregada a mano, sin consumo previo
  motivo            text,             -- solo si es_manual: 'Apertura de servicio' | 'Stockeo estratégico' | 'Oportunidad de precio' | 'Otro'
  referencia        text,             -- servicio u observación de la línea manual

  decidido_por      text,
  decidido_en       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (periodo_id_local, producto_id_local)
);

ALTER TABLE public.pp_reposicion_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.pp_reposicion_ajustes;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_reposicion_ajustes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pp_remitos
  ADD COLUMN IF NOT EXISTS faltantes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

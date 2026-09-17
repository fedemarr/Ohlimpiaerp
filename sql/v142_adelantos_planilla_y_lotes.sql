-- =============================================================================
-- Migración: v142 — Adelantos: avisos del pedido del período + lotes de
--            depósito propios (motor de tandas)
-- Fecha:     2026-09-17
-- Autor:     Fede (vía asistente)
-- =============================================================================
--
-- CONTEXTO (PEDIDOS_ADELANTOS_para_Fede_2.md + mockup_pedidos_adelantos_2.html
-- + mockup_gestion_adelantos.html)
-- --------
-- Puntos 1-4 del documento (los puntos 5-6, conexión con Liquidaciones y
-- plan de cuotas, quedan para LIQUIDACIONES_conexiones_para_Fede_1.md —
-- el hook ya existe en descuentos_adelantos_pendientes, sin tocar acá):
--
-- 1) pedidos_adelantos.avisos: snapshot de los avisos que calculó el
--    supervisor al armar la planilla del período (0 hs verificadas / ya
--    tiene un adelanto elevado este período) — se congelan en el pedido
--    al elevar, para que RRHH vea EXACTAMENTE lo que vio el supervisor
--    (no un recálculo en vivo que puede cambiar para cuando RRHH revisa).
--
-- 2) lotes_adelantos / lotes_adelantos_items: mismo motor y mismos
--    formateadores de "hoja de copiado" que Liquidaciones — Pago de
--    retiros (liquidaciones_pago/bancos.js, SIN TOCAR), pero con tablas
--    PROPIAS en vez de reusar lotes_pago: esa tabla tiene un campo
--    `tipo` que ahí significa 'operarios'|'administrativos' (split que
--    no existe en Adelantos — "acá no hay split, volumen chico"), y
--    reusarla acoplaría el visor de Lotes de Liquidaciones con un tercer
--    valor de tipo que no le corresponde. Mismo criterio "cada módulo
--    dueño de sus tablas" que ya usa el resto del proyecto (padrón,
--    retenes, cuentas CBU, etc.).
-- =============================================================================

BEGIN;

ALTER TABLE public.pedidos_adelantos
  ADD COLUMN IF NOT EXISTS avisos jsonb;

CREATE TABLE IF NOT EXISTS public.lotes_adelantos (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  nro_lote              text UNIQUE NOT NULL,      -- 'ADEL-003'
  periodo               text NOT NULL,              -- 'YYYY-MM' (mes en que se confirmó el depósito)
  modo                  text NOT NULL,              -- 'archivos' | 'manual'

  cantidad              int NOT NULL DEFAULT 0,
  total                 numeric(14,2) NOT NULL DEFAULT 0,

  fecha_deposito        date,                        -- fecha real del depósito (elegida al confirmar)
  comprobante           text,                        -- solo modo manual

  confirmado_por        text,
  confirmado_en         timestamptz NOT NULL DEFAULT now(),

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lotes_adelantos_items (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  lote_id_local         text NOT NULL,              -- lotes_adelantos.id_local, sin FK (criterio del proyecto)

  tipo_pedido           text NOT NULL,               -- 'Adelanto' | 'Préstamo'
  pedido_id_local       text NOT NULL,               -- pedidos_adelantos.id_local o prestamos.id_local

  legajo_nro            text,
  nombre_asociado       text NOT NULL,
  banco                 text,                         -- snapshot al momento de depositar
  cbu                   text,
  cuit                  text,
  monto                 numeric(12,2) NOT NULL DEFAULT 0,
  es_excepcion          boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotesadel_periodo      ON public.lotes_adelantos (periodo) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_lotesadelitems_lote     ON public.lotes_adelantos_items (lote_id_local);

ALTER TABLE public.lotes_adelantos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_adelantos_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.lotes_adelantos;
CREATE POLICY "Solo usuarios autenticados" ON public.lotes_adelantos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.lotes_adelantos_items;
CREATE POLICY "Solo usuarios autenticados" ON public.lotes_adelantos_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select column_name from information_schema.columns where table_name='pedidos_adelantos' and column_name='avisos';
--   select column_name from information_schema.columns where table_name='lotes_adelantos';
--   select column_name from information_schema.columns where table_name='lotes_adelantos_items';
-- =============================================================================

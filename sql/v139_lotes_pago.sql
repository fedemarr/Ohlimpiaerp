-- =============================================================================
-- Migración: v139 — lotes_pago (Pago de retiros por tandas + archivos bancarios)
-- Fecha:     2026-09-16
-- Autor:     Fede
-- =============================================================================
--
-- Ticket "Liquidaciones — Pago por tandas + generación de los archivos
-- bancarios" — documento de referencia LIQUIDACIONES_pago_archivos_para_Fede_2.md
-- + mockup_pago_retiros.html. Reemplaza el "Autorizar pago" a ciegas (todo
-- junto, sin registrar a qué cuenta salió cada pago) por tandas separadas
-- Operarios/Administrativos que arman un LOTE con el detalle bancario
-- exacto de cada pago — necesario para poder generar después la hoja de
-- copiado de cada banco (BBVA/Macro) y para la Fase 2 (conciliación de
-- acreditaciones, NO se construye en esta entrega).
--
-- lotes_pago: el encabezado de la tanda (quién confirmó, cuándo, cuántos,
-- total). lotes_pago_items: una fila por asociado pagado en esa tanda, con
-- el banco/CBU/CUIT tal como estaban en el momento del pago (snapshot —
-- si el asociado cambia de CBU después, el lote histórico no se altera,
-- mismo criterio que graba retenciones/uniforme al momento de pagar).
--
-- Sin FK real entre las dos tablas (criterio del proyecto: relación por
-- id_local en texto, no constraint de Postgres — igual que revisiones_retiro,
-- cuentas_cbu, etc.)
--
-- Verificar ANTES de correr (no deberían existir todavía):
--   select * from information_schema.tables where table_name in ('lotes_pago','lotes_pago_items');
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lotes_pago (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  nro_lote              text UNIQUE NOT NULL,        -- 'LOTE-2026-015'
  periodo               text NOT NULL,                -- 'YYYY-MM'
  tipo                  text NOT NULL,                -- 'operarios' | 'administrativos'

  cantidad              int NOT NULL DEFAULT 0,
  total                 numeric(14,2) NOT NULL DEFAULT 0,

  -- Elegidos al confirmar la tanda — se guardan para poder REGENERAR el
  -- mismo archivo después ("re-descargable", nunca uno distinto).
  fecha_acreditacion    date,
  concepto              text,                          -- 'RETIROS' | 'ADELANTOS'

  confirmado_por        text,
  confirmado_en         timestamptz NOT NULL DEFAULT now(),

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lotes_pago_items (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  lote_id_local         text NOT NULL,                -- lotes_pago.id_local, sin FK (criterio del proyecto)

  legajo_nro            text,
  nombre_asociado       text NOT NULL,
  banco                 text,                          -- snapshot al momento de pagar ('BBVA'/'Macro'/otro)
  cbu                   text,
  cuit                  text,
  monto                 numeric(12,2) NOT NULL DEFAULT 0,
  es_excepcion          boolean NOT NULL DEFAULT false, -- banco distinto de BBVA/Macro -> listado manual

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotespago_periodo    ON public.lotes_pago (periodo) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_lotespagoitems_lote   ON public.lotes_pago_items (lote_id_local);

ALTER TABLE public.lotes_pago        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_pago_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.lotes_pago;
CREATE POLICY "Solo usuarios autenticados" ON public.lotes_pago
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.lotes_pago_items;
CREATE POLICY "Solo usuarios autenticados" ON public.lotes_pago_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select column_name from information_schema.columns where table_name='lotes_pago';
--   select column_name from information_schema.columns where table_name='lotes_pago_items';
-- =============================================================================

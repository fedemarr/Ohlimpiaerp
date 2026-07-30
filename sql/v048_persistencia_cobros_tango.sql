-- v048_persistencia_cobros_tango.sql
-- Facturas, Cobros e Historial de importaciones (módulo Cobros / Gestión
-- de cobranzas) vivían 100% en memoria del navegador — sin una sola
-- llamada a supaSync en todo legacy.js. Un pago parcial registrado, una
-- gestión de cobro cargada, o una importación desde Tango se perdían al
-- recargar la página. Esta migración les da persistencia real.
--
-- HALLAZGO al correr esta migración: 'facturas' y 'cobros' YA EXISTÍAN en
-- producción — creadas a mano en algún momento, con 0 filas, sin ninguna
-- llamada a supaSync que las tocara (mismo patrón "creada a mano, sin
-- script en el repo" que 'retenes', documentado en v046/supabase.js).
-- Por eso esta migración es ALTER, no CREATE, para 'facturas'/'cobros'
-- — no hay datos que migrar (0 filas en ambas), pero si hubiera, un
-- CREATE TABLE hubiera fallado y un DROP+CREATE los habría perdido.
--
-- DELTA_comercial_cobros_tango_v1: cada factura ahora tiene saldo propio
-- (pagos parciales vía múltiples recibos) — la tabla existente no tenía
-- columna 'saldo' en absoluto, así que sin esta migración el feature no
-- podía funcionar. Cada recibo de Tango es una fila propia en "cobros"
-- (no se suman) — esa tabla ya calzaba, sin cambios de columnas ahí.
--
-- importe/importe_facturado/importe_cobrado eran 'integer' — los montos
-- reales de Tango vienen con centavos (ej. "2,241,585.39"), así que se
-- amplían a numeric(14,2) para no romper el insert por redondeo/tipo.
--
-- Columna telefono_cobro (rename de "telefono"): el mapeo camelCase↔
-- snake_case de src/shared/supabase.js es global (no por tabla) y ya
-- tiene 'telefono'→'tel' reservado para objetivo_responsables (v047) —
-- una columna "telefono" acá pisaría ese mapeo y el campo se leería mal
-- en ambas tablas. Renombrar es seguro porque la tabla está vacía.
--
-- Columnas 'tipo'/'fecha'/'nota' de la 'facturas' preexistente no se
-- tocan — no las usa este código, quedan sin uso (igual que antes).

BEGIN;

-- ========== facturas (ya existía — se completa) ==========
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS saldo                 numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marcada_cobrada_por    text,
  ADD COLUMN IF NOT EXISTS fecha_marcada_cobrada  text;

ALTER TABLE public.facturas
  ALTER COLUMN importe TYPE numeric(14,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='facturas' AND column_name='telefono'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='facturas' AND column_name='telefono_cobro'
  ) THEN
    ALTER TABLE public.facturas RENAME COLUMN telefono TO telefono_cobro;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON public.facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado  ON public.facturas(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_nro     ON public.facturas(nro_factura);

-- ========== cobros (ya existía — solo se amplía el tipo de importe) ==========
ALTER TABLE public.cobros
  ALTER COLUMN importe_facturado TYPE numeric(14,2),
  ALTER COLUMN importe_cobrado   TYPE numeric(14,2);

CREATE INDEX IF NOT EXISTS idx_cobros_cliente     ON public.cobros(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_factura ON public.cobros(nro_factura);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_recibo  ON public.cobros(nro_recibo);

-- ========== historial_importaciones (nueva) ==========
CREATE TABLE IF NOT EXISTS public.historial_importaciones (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,

  tipo        text,
  fecha       text,
  cantidad    integer DEFAULT 0,
  detalle     text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_historial_importaciones
  BEFORE UPDATE ON public.historial_importaciones
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.historial_importaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.historial_importaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

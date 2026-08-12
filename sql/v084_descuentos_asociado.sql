-- v084_descuentos_asociado.sql
-- Descuentos por asociado financiados en cuotas, con conceptos parametrizables
-- (ticket "Descuentos por asociado" — descuentos y liquidación). La Liquidación
-- consume una cuota por período mientras el descuento esté "En curso" y tenga
-- cuotas pendientes, con el mismo contrato que descuentos_uniforme_pendientes
-- (v032): cuotasCobradas/cuotasTotales/montoCuota + estado 'En curso'|'Terminado'.

BEGIN;

-- ========== Conceptos parametrizables ==========
CREATE TABLE public.conceptos_descuento (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  nombre                 text NOT NULL,
  cuotas_maximas         integer NOT NULL DEFAULT 1,
  activo                 boolean NOT NULL DEFAULT true,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ========== Descuentos por asociado ==========
CREATE TABLE public.descuentos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  concepto_id_local      text,
  legajo_id_local        text NOT NULL,
  monto_total            numeric(12,2) NOT NULL DEFAULT 0,
  cuotas_totales         integer NOT NULL DEFAULT 1,
  cuotas_cobradas        integer NOT NULL DEFAULT 0,
  monto_cuota            numeric(12,2) NOT NULL DEFAULT 0,
  periodo_inicio         text,                 -- YYYY-MM — mes de la primera cuota
  estado                 text NOT NULL DEFAULT 'En curso',  -- En curso / Terminado / Cancelado
  fecha_generado         text,
  observacion            text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_desc_legajo ON public.descuentos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_desc_estado ON public.descuentos(estado) WHERE NOT anulado;

-- ========== RLS ==========
ALTER TABLE public.conceptos_descuento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descuentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY conceptos_descuento_all ON public.conceptos_descuento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY descuentos_all ON public.descuentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

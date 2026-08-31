-- =============================================================================
-- Migración: v110 — Pedido de productos: tab Recargos + tab Margen (puntos 12-13)
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
-- Cierra el checklist del MD (puntos 1-13). Margen de productos (13) es
-- de solo lectura — no agrega tablas, lee lo que ya existe.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pp_recargo_general (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text NOT NULL UNIQUE,
  pct            numeric NOT NULL,             -- 0.30 = 30%
  vigencia_desde text NOT NULL,                -- YYYY-MM
  vigencia_hasta text,
  cargado_por    text,
  motivo         text,
  anulado        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pp_recargo_general ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_recargo_general FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.pp_recargo_general (id_local, pct, vigencia_desde, cargado_por, motivo) VALUES
  ('rg_inicial', 0.30, '2026-01', 'Sistema', 'Valor general ya vigente al construir el tab')
ON CONFLICT (id_local) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pp_recargo_servicio (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,
  servicio_codigo text NOT NULL,
  pct             numeric NOT NULL,
  vigencia_desde  text NOT NULL,
  vigencia_hasta  text,
  cargado_por     text,
  motivo          text,
  anulado         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_recargo_servicio_cod ON public.pp_recargo_servicio(servicio_codigo) WHERE NOT anulado;
ALTER TABLE public.pp_recargo_servicio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_recargo_servicio FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

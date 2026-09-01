-- v089_superadmin_empresas.sql
-- Panel de Superadmin — registro de empresas clientes del sistema (venta
-- del ERP como producto a otras cooperativas/empresas) y qué módulos le
-- vendiste a cada una.
--
-- IMPORTANTE — esto NO es la base de datos operativa de esas empresas.
-- Cada empresa cliente tiene su PROPIO proyecto Supabase separado (con
-- sus propios legajos/liquidaciones/etc — aislamiento total, no hay
-- empresa_id compartido en ninguna tabla operativa). Esta tabla vive
-- únicamente en el Supabase de Ohlimpia y es el registro/bookkeeping de
-- Fede para llevar cuenta de qué empresas existen y qué les vendió — no
-- controla en vivo lo que cada empresa ve (eso se configura por separado,
-- a mano, en el deploy de esa empresa — ver runbook de alta).
--
-- modulos_contratados es un array de las mismas keys que ya usa MENU
-- (state.js) — ej. ['legajos','liquidacion','liq_admin'] — así queda
-- una sola fuente de verdad para "qué módulos existen" en todo el sistema.

BEGIN;

CREATE TABLE IF NOT EXISTS public.empresas_cliente (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  nombre                 text NOT NULL,
  contacto               text,              -- nombre/email/tel del referente
  estado                 text NOT NULL DEFAULT 'Activa',  -- Activa / Inactiva / Prospecto
  modulos_contratados    jsonb NOT NULL DEFAULT '[]'::jsonb,

  supabase_url           text,              -- referencia informativa: dónde vive su base
  vercel_url             text,              -- referencia informativa: dónde está su deploy
  notas                  text,

  fecha_alta             text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empresas_cliente_estado ON public.empresas_cliente(estado) WHERE NOT anulado;

ALTER TABLE public.empresas_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresas_cliente_all ON public.empresas_cliente;
CREATE POLICY empresas_cliente_all ON public.empresas_cliente FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- Migración: v081 — Módulo Supervisores + multi-supervisor por servicio
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 7 del relevamiento (Lautaro, 10/08):
--   - Módulo Supervisores nuevo: catálogo con % de comisión propio por
--     supervisor (arranca en 3% para todos, como está hoy, pero
--     parametrizable — "no hardcodear").
--   - Multi-supervisor: un servicio puede tener MÁS DE UN supervisor.
--     Se agrega objetivos.supervisores_asignados (jsonb, array de
--     nombres) SIN tocar objetivos.supervisor_asignado / .supervisor
--     (texto, quedan como el supervisor "principal" — los siguen leyendo
--     9+ consumidores de obtenerServiciosActivos(): Liquidación de
--     horas, Pedidos, Retenciones, etc. Romper ese contrato ahora sería
--     un cambio mucho más grande y riesgoso que el pedido del ticket).
--   - Comisión de supervisor: se auto-genera/sincroniza en la MISMA
--     tabla `comisiones` que ya existe para coordinadores de cuenta
--     (objetivos.comisiones jsonb) en vez de crear un mecanismo de pago
--     paralelo — marcada con esComisionSupervisor:true para poder
--     diferenciarla y no confundirla con una comisión de coordinador
--     cargada a mano.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.supervisores_config (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  nombre        text NOT NULL UNIQUE,
  pct_comision  numeric NOT NULL DEFAULT 3,
  activo        boolean NOT NULL DEFAULT true,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supervisores_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.supervisores_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed: los mismos 15 supervisores reales que ya existen en
-- DB.supervisores (src/shared/state.js) — no se inventa a nadie, se
-- formaliza el catálogo con el 3% que ya es el default actual del
-- sistema para todos.
INSERT INTO public.supervisores_config (id_local, nombre, pct_comision) VALUES
  ('sup_alvaro_uballes',      'Alvaro Uballes', 3),
  ('sup_alejandro_cacciato',  'Alejandro Cacciato', 3),
  ('sup_claudia_cazenave',    'Claudia Cazenave', 3),
  ('sup_claudio_gonzalez',    'Claudio Gonzalez', 3),
  ('sup_fabio_benvenuto',     'Fabio Benvenuto', 3),
  ('sup_matias_maidana',      'Matias Maidana', 3),
  ('sup_marcelo_moure',       'Marcelo Moure', 3),
  ('sup_santiago_ayala',      'Santiago Ayala', 3),
  ('sup_richard_recalde',     'Richard Recalde', 3),
  ('sup_alfredo_arispe',      'Alfredo Arispe', 3),
  ('sup_lorena_unzain',       'Lorena Unzain', 3),
  ('sup_dario_lage',          'Dario Lage', 3),
  ('sup_patricia_scaglia',    'Patricia Scaglia', 3),
  ('sup_maximiliano_poncino', 'Maximiliano Poncino', 3),
  ('sup_sandra_luna',         'Sandra Luna', 3)
ON CONFLICT (id_local) DO NOTHING;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS supervisores_asignados jsonb NOT NULL DEFAULT '[]';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

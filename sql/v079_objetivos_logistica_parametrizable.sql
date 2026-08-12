-- =============================================================================
-- Migración: v079 — Logística del servicio: productos/elementos/máquinas
--            parametrizables (multi-select), sin tocar los campos de texto
--            libre existentes
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 6.b del relevamiento (Lautaro, 10/08): los campos Productos,
-- Elementos de limpieza y Máquinas del alta de servicio pasan de texto
-- libre a listas parametrizables con selección múltiple.
--
-- Se verificó contra la base real ANTES de tocar nada: los 164 objetivos
-- ya tienen datos cargados en log_productos, pero NO son una lista de
-- productos de limpieza — son metadata de facturación tipo "SE FACTURA |
-- Envía remito: NO" (probablemente del importador de Comercial Fase 2).
-- Convertir ese campo a multi-select habría ocultado/perdido ese dato en
-- los 164 servicios reales.
--
-- Decisión (confirmada con Fede): NO se toca log_productos/log_elementos/
-- log_maquinas (quedan como están, con su dato real). Se agregan 3
-- columnas jsonb NUEVAS para el multi-select parametrizable, que arrancan
-- vacías — no hay pérdida de datos posible.
--
-- El catálogo semilla usa los mismos ejemplos que ya sugerían los
-- placeholders de los textarea viejos (Ej: Detergente neutro, lavandina,
-- papel higiénico / Trapos de piso, mopas, guantes / Enceradora,
-- hidrolavadora) — no son un catálogo inventado desde cero, son lo que
-- la propia UI ya proponía como contenido esperado.
-- =============================================================================

BEGIN;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS productos_limpieza jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS elementos_limpieza jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS maquinas_necesarias jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS public.items_logistica_servicio (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  categoria   text NOT NULL,   -- 'producto' | 'elemento' | 'maquina'
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.items_logistica_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.items_logistica_servicio
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.items_logistica_servicio (id_local, categoria, nombre, orden) VALUES
  ('prod_detergente',     'producto', 'Detergente neutro',        10),
  ('prod_lavandina',      'producto', 'Lavandina',                 20),
  ('prod_papel_higienico','producto', 'Papel higiénico',           30),
  ('prod_jabon_liquido',  'producto', 'Jabón líquido de manos',    40),
  ('prod_desodorante_amb','producto', 'Desodorante de ambientes',  50),
  ('prod_cera',           'producto', 'Cera para pisos',           60),
  ('elem_trapo_piso',     'elemento', 'Trapos de piso',            10),
  ('elem_mopa',           'elemento', 'Mopas',                     20),
  ('elem_guantes',        'elemento', 'Guantes',                   30),
  ('elem_escoba',         'elemento', 'Escobas',                   40),
  ('elem_balde',          'elemento', 'Baldes',                    50),
  ('elem_paño_microfibra','elemento', 'Paños de microfibra',       60),
  ('maq_enceradora',      'maquina',  'Enceradora',                10),
  ('maq_hidrolavadora',   'maquina',  'Hidrolavadora',             20),
  ('maq_aspiradora',      'maquina',  'Aspiradora',                30),
  ('maq_lustradora',      'maquina',  'Lustradora',                40)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

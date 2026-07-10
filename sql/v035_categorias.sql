-- =============================================================================
-- Migración: v035 — Módulo Categorías v1 (Etapas 1-4: catálogo, valores
--            hora, plus adicionales, auditoría)
-- Fecha:     2026-07-10
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_categorias.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Infraestructura transversal: catálogo de categorías operativas
-- (Operario, Encargado A/B/C, 7 sub-tipos de Retén, etc.) y su valor
-- hora, versionado con vigencia temporal por combinación
-- categoría+servicio. Prerequisito para que Enfermos y Accidentes y
-- Liquidaciones (ninguno migrado todavía) puedan congelar el valor
-- hora vigente a una fecha. Esta migración NO conecta ningún
-- consumidor — solo crea la infraestructura.
--
-- DISENO_categorias.md pedía v020, pero esa migración ya existe
-- (cuenta_bancaria_alta_pendientes). La migración real más reciente
-- es v034 (Sanciones). Se usa v035.
--
-- No se crea catálogo propio de servicios: se reusa el nombre de
-- servicio como texto libre (columna servicio_nombre), igual que ya
-- lo consume el resto del sistema desde DB.servicios en el frontend.
--
-- legajo.funcion (campo de texto libre preexistente, poblado desde
-- DB.categorias) NO se toca ni se migra — categoria_id_local es una
-- columna nueva y separada, sin popular todavía (no hay UI en
-- Legajos para asignarla en esta tanda).
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — categorias_base (catálogo maestro)
-- ============================================================
CREATE TABLE public.categorias_base (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,

  grupo                  text NOT NULL,        -- Operativo / Encargado / Retén / Especial
  es_reten               boolean NOT NULL DEFAULT false,

  activa                 boolean NOT NULL DEFAULT true,
  orden                  integer NOT NULL DEFAULT 0,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cb_activa ON public.categorias_base(activa) WHERE NOT anulado;
CREATE INDEX idx_cb_grupo  ON public.categorias_base(grupo) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — valores_hora_categoria (versiones con vigencia temporal,
-- un valor por combinación categoría + servicio + fecha)
-- ============================================================
CREATE TABLE public.valores_hora_categoria (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  categoria_id_local     text NOT NULL,
  servicio_nombre        text NOT NULL,

  valor_hora             numeric(10,2) NOT NULL,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  cargada_por            text NOT NULL,
  motivo_carga           text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vhc_categoria ON public.valores_hora_categoria(categoria_id_local) WHERE NOT anulado;
CREATE INDEX idx_vhc_servicio  ON public.valores_hora_categoria(servicio_nombre) WHERE NOT anulado;
CREATE INDEX idx_vhc_vigencia  ON public.valores_hora_categoria(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — plus_adicionales (Extra Sanidad, Extra Nocturno)
-- ============================================================
CREATE TABLE public.plus_adicionales (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,

  activa                 boolean NOT NULL DEFAULT true,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Tabla 4 — valores_plus (valores de los plus, vigencia temporal)
-- ============================================================
CREATE TABLE public.valores_plus (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  plus_id_local          text NOT NULL,

  valor_adicional        numeric(10,2) NOT NULL,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  cargada_por            text NOT NULL,
  motivo_carga           text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vp_plus     ON public.valores_plus(plus_id_local) WHERE NOT anulado;
CREATE INDEX idx_vp_vigencia ON public.valores_plus(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que v027/v030/v032/v033/v034
-- ============================================================
ALTER TABLE public.categorias_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.categorias_base
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.valores_hora_categoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.valores_hora_categoria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.plus_adicionales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.plus_adicionales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.valores_plus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.valores_plus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Legajos — columna nueva, separada de "funcion" (no se toca)
-- ============================================================
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS categoria_id_local text;

-- ============================================================
-- Seed — 16 categorías base (política de RRHH)
-- ============================================================
INSERT INTO public.categorias_base (id_local, codigo, nombre, grupo, es_reten, orden) VALUES
  ('cat_operario',             'CAT-001', 'Operario',                  'Operativo', false, 10),
  ('cat_operario_media',       'CAT-002', 'Operario Media Jornada',    'Operativo', false, 20),
  ('cat_operario_primera',     'CAT-003', 'Operario de Primera',       'Operativo', false, 30),
  ('cat_referente',            'CAT-004', 'Referente',                 'Encargado', false, 40),
  ('cat_encargado_a',          'CAT-005', 'Encargado A',               'Encargado', false, 50),
  ('cat_encargado_b',          'CAT-006', 'Encargado B',               'Encargado', false, 60),
  ('cat_encargado_c',          'CAT-007', 'Encargado C',               'Encargado', false, 70),
  ('cat_tareas_especiales',    'CAT-008', 'Tareas Especiales',         'Especial',  false, 80),
  ('cat_reten_hora_base',      'CAT-009', 'Retén Hora Base',           'Retén',     true,  90),
  ('cat_reten_media_dist',     'CAT-010', 'Retén Media Distancia',     'Retén',     true, 100),
  ('cat_reten_larga_dist',     'CAT-011', 'Retén Larga Distancia',     'Retén',     true, 110),
  ('cat_reten_media_jornada',  'CAT-012', 'Retén Media Jornada',       'Retén',     true, 120),
  ('cat_reten_nocturno',       'CAT-013', 'Retén Nocturno',            'Retén',     true, 130),
  ('cat_reten_doble_jornada',  'CAT-014', 'Retén Doble Jornada',       'Retén',     true, 140),
  ('cat_reten_hit',            'CAT-015', 'Retén HIT',                 'Retén',     true, 150),
  ('cat_franquero_eventual',   'CAT-016', 'Franquero Eventual',        'Retén',     true, 160);

-- ============================================================
-- Seed — plus adicionales
-- ============================================================
INSERT INTO public.plus_adicionales (id_local, codigo, nombre, descripcion) VALUES
  ('plus_extra_sanidad',  'PLUS-001', 'Extra Sanidad',  'Plus por desempeñar tareas en espacios de salud'),
  ('plus_extra_nocturno', 'PLUS-002', 'Extra Nocturno', 'Plus por jornada entre 22hs y 6am');

-- Los valores hora de cada categoría por servicio y los valores de
-- plus se cargan por RRHH desde el sistema — no hay seed inicial.

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v023 — Módulo Capacitaciones, Evaluaciones automáticas (Etapa 3)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Etapa 3 de Capacitaciones: exámenes de opción múltiple con corrección
-- automática. Reemplaza el uso actual de Google Forms. Un banco de
-- preguntas por tipo de capacitación, una plantilla por tipo (qué
-- preguntas se envían + nota mínima + plazo), instancias enviadas a
-- asociados con token único (responden sin login en una página pública),
-- y las respuestas ya corregidas.
--
-- Tablas creadas:
--   1. preguntas_evaluacion   — banco de preguntas por tipo
--   2. plantillas_evaluacion  — 1 plantilla por tipo (preguntas incluidas,
--                                nota mínima, plazo)
--   3. evaluaciones_enviadas  — instancias enviadas (token, plazo, estado)
--   4. respuestas_evaluacion  — respuesta del asociado por pregunta
--
-- Sin tablas pivot: "preguntas incluidas" y no aplica acá porque se
-- resuelve con un array text[] (preguntas_ids), mismo patrón que
-- materiales_ids en capacitaciones (v022).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tabla 1 — preguntas_evaluacion
-- ---------------------------------------------------------------------------
CREATE TABLE public.preguntas_evaluacion (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  tipo_capacitacion text NOT NULL,
  enunciado         text NOT NULL,
  opcion_a          text NOT NULL,
  opcion_b          text NOT NULL,
  opcion_c          text NOT NULL,
  opcion_d          text NOT NULL,
  correcta          text NOT NULL,
  editado_por       text,
  editado_en        timestamptz,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pregunta_tipo ON public.preguntas_evaluacion(tipo_capacitacion) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Tabla 2 — plantillas_evaluacion
-- ---------------------------------------------------------------------------
CREATE TABLE public.plantillas_evaluacion (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  tipo_capacitacion text UNIQUE NOT NULL,
  preguntas_ids     text[],
  nota_minima       integer NOT NULL DEFAULT 70,
  plazo_horas       integer NOT NULL DEFAULT 48,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Tabla 3 — evaluaciones_enviadas
-- ---------------------------------------------------------------------------
CREATE TABLE public.evaluaciones_enviadas (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  capacitacion_id_local text NOT NULL,
  legajo_id_local       text NOT NULL,
  nro_socio             text NOT NULL,
  nombre_asociado       text NOT NULL,
  tipo_capacitacion     text NOT NULL,
  plantilla_id_local    text NOT NULL,
  token                 text UNIQUE NOT NULL,
  fecha_envio           timestamptz NOT NULL DEFAULT now(),
  fecha_limite          timestamptz NOT NULL,
  estado                text NOT NULL DEFAULT 'Enviada',
  puntaje               integer,
  resultado             text,
  fecha_respuesta       timestamptz,
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evalenv_capacit ON public.evaluaciones_enviadas(capacitacion_id_local) WHERE NOT anulado;
CREATE INDEX idx_evalenv_legajo  ON public.evaluaciones_enviadas(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_evalenv_token   ON public.evaluaciones_enviadas(token);

-- ---------------------------------------------------------------------------
-- Tabla 4 — respuestas_evaluacion
-- ---------------------------------------------------------------------------
CREATE TABLE public.respuestas_evaluacion (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,
  evaluacion_id_local text NOT NULL,
  pregunta_id_local   text NOT NULL,
  respuesta           text NOT NULL,
  correcta            boolean NOT NULL,
  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resp_evalenv ON public.respuestas_evaluacion(evaluacion_id_local) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- RLS — "Solo usuarios autenticados" (mismo patrón que v021/v022). Las
-- funciones serverless de Vercel (api/evaluacion-*) usan la service_role
-- key y no pasan por RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.preguntas_evaluacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_evaluacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluaciones_enviadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respuestas_evaluacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.preguntas_evaluacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Solo usuarios autenticados" ON public.plantillas_evaluacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Solo usuarios autenticados" ON public.evaluaciones_enviadas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Solo usuarios autenticados" ON public.respuestas_evaluacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

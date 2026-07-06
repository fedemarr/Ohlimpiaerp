-- =============================================================================
-- Migración: v022 — Módulo Capacitaciones (Etapa 1: Registro + Repositorio)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El módulo Capacitaciones vivía entero sin migrar en src/legacy.js: nada
-- persistía en Supabase (supaSync('capacitaciones', ...) apuntaba a una
-- clave que no estaba en el mapa de tablas del frontend). Se rehace de
-- cero (política A.11) empezando por la Etapa 1 (Registro + Repositorio).
--
-- Igual que pasó con `reasignaciones`, existe una tabla `capacitaciones`
-- huérfana en la base real (detectada en el barrido de RLS de v015) con
-- un schema desconocido — se hace backup genérico antes de recrearla.
--
-- Tablas creadas en esta migración:
--   1. capacitaciones           — registro central (Programada/Dictada/Cancelada)
--   2. materiales_capacitacion  — repositorio de materiales
--
-- Quedan afuera (se crean en su propia migración cuando llegue su etapa):
--   preguntas_evaluacion, plantillas_evaluacion, evaluaciones_enviadas,
--   respuestas_evaluacion (Etapa 3 — Evaluaciones).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 0 — Backup defensivo de la tabla existente (huérfana, schema viejo
-- desconocido). Si no tiene filas, el backup queda vacío y es inofensivo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capacitaciones_backup_v021 AS
  SELECT * FROM public.capacitaciones;

-- ---------------------------------------------------------------------------
-- Paso 1 — Recrear capacitaciones
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.capacitaciones;

CREATE TABLE public.capacitaciones (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  legajo_id_local       text NOT NULL,
  nro_socio             text NOT NULL,
  nombre_asociado       text NOT NULL,
  tipo                  text NOT NULL,
  fecha                 date NOT NULL,
  lugar                 text NOT NULL,
  servicio              text,
  instructor            text NOT NULL,
  metodo_evaluacion     text,
  estado                text NOT NULL DEFAULT 'Programada',
  resultado             text,
  puntaje               integer,
  observaciones         text,
  adjunto_id_local      text,
  materiales_ids        text[],
  coordinado_asociado   text,
  coordinado_supervisor text,
  editado_por           text,
  editado_en            timestamptz,
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Paso 2 — materiales_capacitacion
-- ---------------------------------------------------------------------------
CREATE TABLE public.materiales_capacitacion (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local           text UNIQUE NOT NULL,
  nombre             text NOT NULL,
  tipo               text NOT NULL,
  origen             text NOT NULL,
  url                text,
  archivo_path       text,
  tipo_capacitacion  text,
  duracion           text,
  descripcion        text,
  requiere_eval      boolean DEFAULT true,
  fecha_alta         date NOT NULL DEFAULT CURRENT_DATE,
  anulado            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Paso 3 — RLS (mismo patrón "solo autenticados" que el resto del sistema)
-- ---------------------------------------------------------------------------
ALTER TABLE public.capacitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiales_capacitacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.capacitaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Solo usuarios autenticados" ON public.materiales_capacitacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

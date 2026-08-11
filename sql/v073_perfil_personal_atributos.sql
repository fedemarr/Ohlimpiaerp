-- =============================================================================
-- Migración: v073 — Perfil del personal en Pedidos de personal
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Pedido de personal — parametrizar el perfil del personal": el
-- modal de pedidos hoy tiene 2 selects de perfil hardcodeados en el HTML
-- (Género y Experiencia, sin id → no se guardan nunca). Se parametriza el
-- perfil que se solicita en cada pedido:
--
--   1. Tabla catálogo `perfil_personal_atributos` — atributos configurables
--      en la base (no hardcodeados en el HTML), cada uno con sus opciones.
--      Por decisión de ticket: solo seed SQL por ahora, sin ABM.
--
--   2. Columna `perfil` jsonb en `pedidos` — array [{codigo, valor}] con los
--      atributos elegidos para ese pedido (patrón puestos_necesarios de
--      v072 / comisiones: upsert por fila, sin tabla de relación).
--      Retrocompatible: default '[]', los pedidos viejos renderizan vacío.
--
--   Los atributos existentes (Zona, Puesto, Horario, Urgencia) quedan como
--   columnas propias de `pedidos` — NO se duplican en el perfil.
--
--   RLS se crea endurecida directo (tabla nueva), mismo patrón que v035.
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla catálogo — perfil_personal_atributos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfil_personal_atributos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  codigo      text NOT NULL UNIQUE,   -- clave interna: 'genero', 'experiencia', ...
  nombre      text NOT NULL,          -- label que se muestra en la UI
  tipo        text NOT NULL DEFAULT 'select',  -- 'select' | 'multi' | 'text'
  opciones    jsonb NOT NULL DEFAULT '[]',     -- array de strings para select/multi
  obligatorio boolean NOT NULL DEFAULT false,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfil_personal_atributos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.perfil_personal_atributos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- pedidos — columna perfil (array [{codigo, valor}])
-- ============================================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS perfil jsonb NOT NULL DEFAULT '[]';

-- ============================================================
-- Seed — 6 atributos de perfil (los 2 actuales + sugeridos del ticket)
-- ============================================================
INSERT INTO public.perfil_personal_atributos
  (id_local, codigo, nombre, tipo, opciones, obligatorio, orden) VALUES
  ('atr_genero',        'genero',       'Género',                'select',
   '["F/M","Femenino","Masculino"]', false, 10),
  ('atr_experiencia',   'experiencia',  'Experiencia',           'select',
   '["Sin experiencia específica","Con experiencia requerida"]', false, 20),
  ('atr_tipo_tarea',    'tipo_tarea',   'Tipo de tarea',         'select',
   '["Limpieza general","Limpieza profunda","Mantenimiento","Cuidado de espacios"]', false, 30),
  ('atr_turno',         'turno',        'Turno',                 'select',
   '["Mañana","Tarde","Noche","Rotativo"]', false, 40),
  ('atr_certificaciones','certificaciones','Certificaciones',    'multi',
   '["Libreta sanitaria","Curso manipulación de alimentos","Trabajo en altura","Habilitación espacios de salud"]', false, 50),
  ('atr_disponibilidad','disponibilidad','Disponibilidad horaria','select',
   '["Full time","Media jornada","Fines de semana","Solo nocturno"]', false, 60)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

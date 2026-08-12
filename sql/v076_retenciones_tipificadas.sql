-- =============================================================================
-- Migración: v076 — Retenciones: candidatos automáticos, motivo tipificado,
--            monto/porcentaje, auditoría de cierre
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 4 del relevamiento (Lautaro, 10/08). El módulo Retenciones ya
-- migrado (src/modules/retenciones/) cubre el ABM básico (crear/editar/
-- liberar/eliminar, ya con id real, sin los bugs de índice que tenía la
-- versión vieja en legacy.js — esa quedó muerta, sin window bindings).
-- Faltaba:
--   1. Motivo TIPIFICADO parametrizable (antes "motivo" era texto libre).
--   2. Retención por MONTO o PORCENTAJE (antes solo monto fijo).
--   3. Origen del caso (automático desde ART42/Baja/Legales, reporte del
--      supervisor, o carga manual de RRHH) — para poder armar la lista de
--      candidatos automáticos sin re-preguntar algo que el legajo ya sabe.
--   4. Auditoría completa de cierre: quién creó el caso y cuándo (antes
--      solo se guardaba editadoPor/editadoEn en la edición, nunca en el
--      alta), y quién liberó la retención (fechaLiberacion ya existía,
--      liberadoPor no).
--
-- No se toca ninguna columna existente ni se borra nada — estrictamente
-- aditivo, retrocompatible con las retenciones ya guardadas (quedan con
-- estos campos nuevos en null/default).
-- =============================================================================

BEGIN;

ALTER TABLE public.retenciones
  ADD COLUMN IF NOT EXISTS motivo_tipificado text,
  ADD COLUMN IF NOT EXISTS tipo_valor text NOT NULL DEFAULT 'Monto',  -- 'Monto' | 'Porcentaje'
  ADD COLUMN IF NOT EXISTS origen text,          -- 'automatico_art42'|'automatico_baja'|'automatico_legal'|'reporte_supervisor'|'manual'
  ADD COLUMN IF NOT EXISTS creado_por text,
  ADD COLUMN IF NOT EXISTS creado_en timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_por text;

-- ============================================================
-- Catálogo parametrizable — motivos_retencion (tema 4: "lista
-- parametrizable en Configuración: ausencias, abandono, daños,
-- conducta, etc.")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.motivos_retencion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.motivos_retencion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.motivos_retencion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.motivos_retencion (id_local, nombre, orden) VALUES
  ('mot_ausencias',  'Ausencias reiteradas',            10),
  ('mot_abandono',   'Abandono de puesto',              20),
  ('mot_danos',      'Daños a materiales/equipos',       30),
  ('mot_conducta',   'Conducta inadecuada',              40),
  ('mot_incumplimiento', 'Incumplimiento de tareas',     50),
  ('mot_otro',       'Otro',                             60)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- v072_objetivos_puestos_tipo_horario.sql
-- Ticket "Selección personal": poder indicar si los horarios del personal
-- asignado a un servicio son rotativos o fijos.
--
-- Decisión de alcance: el campo vive a NIVEL DE PUESTO dentro del jsonb
-- puestos_necesarios (cada objeto de la array ya tiene cantidad/perfil/
-- horarioDesde/horarioHasta/dias/obs). No se agrega columna nueva: un
-- servicio puede tener puestos fijos y rotativos a la vez, y la fuente de
-- verdad de horarios ya es por puesto.
--
-- El campo se llama tipoHorario (camelCase, consistente con el resto de
-- claves del jsonb) y se guarda como texto: 'fijo' | 'rotativo'. La UI
-- asume 'fijo' como default cuando el puesto no trae el campo (retro-
-- compatibilidad con puestos creados antes de esta migración).
--
-- Esta migración solo normaliza los puestos existentes que no tengan el
-- campo (backfill a 'fijo'). Es idempotente: re-correrla no cambia nada.

BEGIN;

UPDATE public.objetivos
SET puestos_necesarios = (
  SELECT jsonb_agg(
    CASE
      WHEN p ? 'tipoHorario' THEN p
      ELSE p || '{"tipoHorario":"fijo"}'::jsonb
    END
  )
  FROM jsonb_array_elements(puestos_necesarios) p
)
WHERE jsonb_array_length(puestos_necesarios) > 0;

COMMIT;

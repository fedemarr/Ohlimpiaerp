-- v045_comercial_delta_v1_2_objetivos.sql
-- Delta Comercial v1.2 — columnas nuevas de objetivos (mismo motivo que
-- v044: sin la columna, el update completo del objetivo falla en silencio).
--
-- 2.2.6: motivo de baja separado en razón parametrizada + detalle libre
-- (motivo_baja se sigue guardando combinado, para no romper lecturas
-- existentes de esa columna).
-- 2.2.7: reactivación de un objetivo dado de baja, sin pisar fecha_baja/
-- dado_de_baja_por/motivo_baja (quedan como historial de la última baja).
-- 2.2.1-2.2.3: checklist de campos mínimos del objetivo — localidad y
-- personal_horario son campos nuevos del formulario, no existían.

BEGIN;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS motivo_baja_razon   text,
  ADD COLUMN IF NOT EXISTS motivo_baja_detalle text,
  ADD COLUMN IF NOT EXISTS fecha_reactivacion  date,
  ADD COLUMN IF NOT EXISTS reactivado_por      text,
  ADD COLUMN IF NOT EXISTS localidad           text,
  ADD COLUMN IF NOT EXISTS personal_horario    text;

COMMIT;

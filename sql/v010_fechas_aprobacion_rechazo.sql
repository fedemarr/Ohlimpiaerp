-- v010: agregar fecha_aprobacion y fecha_rechazo a las 3 tablas del flujo
-- (psicos, preocupacionales, documentacion_ingreso).
-- El JS ya escribe estos campos en aprobarX/bajaX/rechazarX y el mapeo
-- camelCase ↔ snake_case ya existe en supabase.js. Hoy los UPDATE fallan
-- silenciosamente con error 400 (columna inexistente). Esto los arregla.
--
-- IF NOT EXISTS agregado (18/08/2026): setup_supabase.sql ya trae
-- "fecha_aprobacion" en psicos por su cuenta (línea propia, sin relación
-- con este archivo) — sin el guard, replicar el esquema en una base nueva
-- rompía acá. No cambia nada en producción (ahí la columna ya existe).

ALTER TABLE public.psicos ADD COLUMN IF NOT EXISTS fecha_aprobacion text;
ALTER TABLE public.psicos ADD COLUMN IF NOT EXISTS fecha_rechazo text;

ALTER TABLE public.preocupacionales ADD COLUMN IF NOT EXISTS fecha_aprobacion text;
ALTER TABLE public.preocupacionales ADD COLUMN IF NOT EXISTS fecha_rechazo text;

ALTER TABLE public.documentacion_ingreso ADD COLUMN IF NOT EXISTS fecha_aprobacion text;
ALTER TABLE public.documentacion_ingreso ADD COLUMN IF NOT EXISTS fecha_rechazo text;

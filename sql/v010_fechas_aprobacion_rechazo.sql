-- v010: agregar fecha_aprobacion y fecha_rechazo a las 3 tablas del flujo
-- (psicos, preocupacionales, documentacion_ingreso).
-- El JS ya escribe estos campos en aprobarX/bajaX/rechazarX y el mapeo
-- camelCase ↔ snake_case ya existe en supabase.js. Hoy los UPDATE fallan
-- silenciosamente con error 400 (columna inexistente). Esto los arregla.

ALTER TABLE public.psicos ADD COLUMN fecha_aprobacion text;
ALTER TABLE public.psicos ADD COLUMN fecha_rechazo text;

ALTER TABLE public.preocupacionales ADD COLUMN fecha_aprobacion text;
ALTER TABLE public.preocupacionales ADD COLUMN fecha_rechazo text;

ALTER TABLE public.documentacion_ingreso ADD COLUMN fecha_aprobacion text;
ALTER TABLE public.documentacion_ingreso ADD COLUMN fecha_rechazo text;

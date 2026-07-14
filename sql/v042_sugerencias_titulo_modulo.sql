-- v042_sugerencias_titulo_modulo.sql
-- Reportes y Sugerencias — agrega título y módulo al reporte, para que el
-- buzón sea más profesional: quien reporta puede elegir a qué módulo
-- corresponde (o "General" si no aplica) y ponerle un título corto.
-- Sin romper registros viejos: ambas columnas nullable, el código ya
-- maneja el fallback si vienen vacías.

-- Hallazgo durante esta migración: la tabla real ya tenía un esquema mucho
-- más rico que el que usaba el código (modulo, modulo_label, prioridad,
-- fecha_estimada, obs_admin, motivo_rechazo, visto_bueno, reabierto,
-- historial jsonb, ult_accion...) — probablemente de un diseño anterior
-- nunca terminado de cablear. `modulo` ya existía (este ADD es no-op).
-- `respuesta_dev` NO existía: el loop de vuelta armado en v041
-- (guardarRespuestaTicket → sugerencia.respuestaDev) escribía a una
-- columna inexistente y fallaba en silencio desde que se creó. Se agrega
-- acá para que ese fix empiece a funcionar de verdad.
ALTER TABLE public.sugerencias
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS modulo text,
  ADD COLUMN IF NOT EXISTS modulo_label text,
  ADD COLUMN IF NOT EXISTS respuesta_dev text;

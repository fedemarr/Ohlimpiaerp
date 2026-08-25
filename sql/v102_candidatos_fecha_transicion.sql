-- v102: Agregar columna fecha_transicion a candidatos
-- Causa: registrarAsistencia() setea c.fechaTransicion pero no existe como
-- columna en Supabase → PostgREST rechaza el UPDATE con error de columna
-- desconocida → supaSync retorna false → toast genérico.
-- Esta columna registra cuándo cambió el último estado del candidato.

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS fecha_transicion timestamptz;

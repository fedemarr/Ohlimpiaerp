-- v041_sugerencias_realtime.sql
-- Reportes y Sugerencias v1.1 — habilita Supabase Realtime en la tabla
-- `sugerencias` para que el perfil DEVELOPER reciba tickets nuevos al
-- instante (websocket, postgres_changes) en vez de esperar el polling de
-- 25s. Primera tabla del proyecto con Realtime habilitado — ya estaba
-- documentado como preferencia en POLITICAS_PROYECTO.md pero nunca
-- implementado. Sin cambios de esquema: la tabla y sus columnas ya
-- existen y alcanzan (estado sigue siendo texto libre).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sugerencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sugerencias;
  END IF;
END $$;

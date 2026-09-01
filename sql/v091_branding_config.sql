-- v091_branding_config.sql
-- Tabla de una sola fila con la personalización visual EN VIVO de esta
-- instancia (empresa cliente) — hoy solo el logo del Inicio. A diferencia
-- de VITE_EMPRESA_NOMBRE/VITE_EMPRESA_LOGO_URL (env vars, requieren
-- redeploy), esto se lee en cada carga de página vía Supabase, así que
-- cambiarlo desde el panel de Superadmin de Ohlimpia se refleja acá sin
-- que Fede tenga que redesplegar nada.
--
-- OJO: esta tabla se crea en la base de CADA empresa cliente (no en la de
-- Ohlimpia) — correr este script contra el Supabase de esa empresa, igual
-- que el resto del historial de migraciones del sistema base.

BEGIN;

CREATE TABLE IF NOT EXISTS public.branding_config (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  logo_url               text,     -- data: URL (base64) o URL pública — lo que haya
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branding_config ENABLE ROW LEVEL SECURITY;

-- Mismo patrón "abierto" que el resto del sistema (ver CLAUDE.md — RLS
-- FOR ALL TO authenticated USING(true) en todas las tablas). Acá además
-- se permite escritura a "anon": quien actualiza el logo es el panel de
-- Superadmin de OHLIMPIA, que escribe con el anon key de ESTA empresa
-- pero sin loguearse contra el Auth de esta empresa (son proyectos de
-- Supabase separados) — y la lectura tiene que ser anónima igual, porque
-- el logo se pinta en el Inicio antes de loguearse.
DROP POLICY IF EXISTS "Lectura pública" ON public.branding_config;
CREATE POLICY "Lectura pública" ON public.branding_config
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Escritura pública" ON public.branding_config;
CREATE POLICY "Escritura pública" ON public.branding_config
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;

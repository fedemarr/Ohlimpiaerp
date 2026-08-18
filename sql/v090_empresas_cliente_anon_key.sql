-- v090_empresas_cliente_anon_key.sql
-- Guarda el anon key de cada empresa cliente junto a su supabase_url, para
-- que el panel de Superadmin pueda escribir directo en la base de ESA
-- empresa (ej. branding_config, ver v091) sin salir de la pantalla de
-- Ohlimpia. Es de solo-lectura pública igual que el resto de las tablas
-- de Supabase de este proyecto — no habilita nada que el navegador de la
-- empresa cliente no pueda hacer ya con su propio anon key.

BEGIN;

ALTER TABLE public.empresas_cliente
  ADD COLUMN IF NOT EXISTS supabase_anon_key text;

COMMIT;

-- v000: documenta 3 tablas que existen en producción desde siempre pero
-- nunca tuvieron un CREATE TABLE versionado en sql/ (creadas a mano en el
-- dashboard de Supabase, en algún momento anterior a que se empezara a
-- versionar el schema). Mismo fenómeno que ya documentaba CLAUDE.md sobre
-- `psicos.id` ("los .sql no reflejan exactamente la base").
--
-- Se descubrió armando el reset de staging (OHLIMPIA_TESTS_STAGING.md,
-- Parte 1): al reproducir el schema desde cero replayando sql/v001..v171 en
-- una base nueva, faltaban psicos, cat_alt_pendientes y turnos — sin esto,
-- staging nunca podía llegar al mismo estado que producción.
--
-- (Un cuarto sospechoso, reglas_competencia_legado_singleton, resultó ser
-- falso positivo: v025 la crea como `reglas_competencia` y v033 la
-- renombra — un RENAME no es un CREATE TABLE, así que la búsqueda de texto
-- no lo encontraba, pero la tabla sí tiene un origen versionado real.)
--
-- Numerada "v000" (antes de v001) a propósito: v010, v075 y otras
-- migraciones más adelante hacen ALTER TABLE sobre psicos/etc. asumiendo
-- que la tabla ya existe — tiene que crearse antes que todo lo demás, no
-- al final del historial.
--
-- Esta migración es un CATCH-UP, no un cambio de schema: usa
-- IF NOT EXISTS en todo a propósito para que sea inofensiva si alguna vez
-- se corre contra producción por error (las tablas ya existen ahí con
-- exactamente esta estructura, verificada por introspección de
-- information_schema/pg_catalog el 29/09/2026).
BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================== psicos =====================
-- Único caso con id uuid (el resto de las tablas del proyecto usa
-- bigint) — ya señalado en CLAUDE.md como drift conocido.
CREATE TABLE IF NOT EXISTS public.psicos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_local text UNIQUE,
  nombre text DEFAULT '',
  dni text DEFAULT '',
  zona text DEFAULT '',
  rrhh text DEFAULT '',
  resultado text DEFAULT '',
  preocup text DEFAULT '',
  estado text DEFAULT '',
  fecha text DEFAULT '',
  obs text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  antecedentes text,
  libreta_sanitaria text,
  requiere_antecedentes boolean DEFAULT false,
  requiere_libreta boolean DEFAULT false,
  psicotecnico text DEFAULT 'Pendiente',
  prelaboral text DEFAULT 'Pendiente',
  candidato_id text,
  fecha_aprobacion text,
  motivo_rechazo text,
  fecha_rechazo text,
  tel text,
  localidad text,
  partido text,
  fecha_realizacion date,
  origen text NOT NULL DEFAULT 'sistema',
  cargado_manual_por text
);
ALTER TABLE public.psicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.psicos;
CREATE POLICY "Solo usuarios autenticados" ON public.psicos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===================== cat_alt_pendientes =====================
CREATE TABLE IF NOT EXISTS public.cat_alt_pendientes (
  id bigint PRIMARY KEY,
  id_local text NOT NULL UNIQUE,
  psico_id text,
  candidato_id text,
  nombre text,
  dni text,
  zona text,
  tel text,
  rrhh text,
  estado text DEFAULT 'Pendiente de alta',
  fecha text,
  identificacion jsonb DEFAULT '{}'::jsonb,
  domicilio jsonb DEFAULT '{}'::jsonb,
  operativo jsonb DEFAULT '{}'::jsonb,
  uniforme jsonb DEFAULT '{}'::jsonb,
  capital jsonb DEFAULT '{}'::jsonb,
  seguros jsonb DEFAULT '{}'::jsonb,
  cuenta_bancaria jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.cat_alt_pendientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.cat_alt_pendientes;
CREATE POLICY "Solo usuarios autenticados" ON public.cat_alt_pendientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===================== turnos =====================
CREATE TABLE IF NOT EXISTS public.turnos (
  id bigint PRIMARY KEY,
  id_local text NOT NULL UNIQUE,
  candidato_id text,
  nombre text NOT NULL,
  fecha text NOT NULL,
  hora text NOT NULL,
  estado text DEFAULT 'Pendiente',
  responsable text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.turnos;
CREATE POLICY "Solo usuarios autenticados" ON public.turnos FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- Verificación:
--   select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('psicos','cat_alt_pendientes','turnos','reglas_competencia_legado_singleton');

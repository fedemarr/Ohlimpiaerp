-- =============================================================================
-- Migración: v013 — Tabla usuarios ligada a Supabase Auth + endurecer RLS
-- Fecha:     2026-06-30
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- 1) DB.usuarios vivía hardcodeado en src/shared/state.js con 5 usuarios y sus
--    contraseñas en TEXTO PLANO, compilado y enviado tal cual al browser de
--    cualquiera que entrara al sitio. Se reemplaza por Supabase Auth (que
--    maneja email+password de forma nativa, hasheado, con sesiones) más esta
--    tabla public.usuarios para los campos propios de la app (perfil, función,
--    nickname, activo) ligados 1 a 1 a auth.users por id (uuid).
--
-- 2) Al revisar el resto del esquema se confirmó que el RLS existente (donde
--    existe) usa políticas "USING (true)" — es decir, sin restricción real:
--    cualquiera con la key pública del código fuente puede leer/escribir TODAS
--    las tablas sin pasar por el login de la app. La mayoría de las tablas ni
--    siquiera tiene RLS habilitado. El login de la app era, hasta ahora, una
--    pantalla — no un control de acceso a nivel de datos.
--
--    Este script endurece eso a "solo usuarios autenticados" en todas las
--    tablas existentes. NO implementa permisos finos por perfil (ej. que
--    Ventas no pueda leer legajos) — eso es una pasada futura aparte, una vez
--    que el modelo de perfiles esté completamente migrado a Supabase Auth.
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 1 — Tabla public.usuarios
-- -----------------------------------------------------------------------------
-- id referencia directa a auth.users.id. Si se borra el usuario de Auth, se
-- borra su fila de perfil (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS public.usuarios (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre    text NOT NULL DEFAULT '',
  email     text NOT NULL,
  perfil    text,
  funcion   text,
  nickname  text,
  activo    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_authenticated" ON public.usuarios;
CREATE POLICY "usuarios_select_authenticated" ON public.usuarios
  FOR SELECT TO authenticated USING (true);

-- Cada usuario puede actualizar su propia fila; un Administrador total puede
-- actualizar cualquiera (necesario para la pantalla de Configuración).
DROP POLICY IF EXISTS "usuarios_update_propio_o_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_propio_o_admin" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total')
  );

-- -----------------------------------------------------------------------------
-- PASO 2 — Trigger: auto-provisionar fila en public.usuarios al crear un
-- usuario en Supabase Auth (vía Dashboard o, a futuro, Admin API).
-- -----------------------------------------------------------------------------
-- Sin esto, un usuario de auth.users sin fila en public.usuarios no puede
-- loguearse en la app (doLogin busca su perfil acá y no lo encuentra).
-- SECURITY DEFINER porque el usuario recién creado todavía no tiene sesión
-- propia para insertar bajo su propia policy.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- PASO 3 — Endurecer RLS en las tablas existentes (solo autenticados)
-- -----------------------------------------------------------------------------
-- Las políticas permisivas ("Acceso total X", con distintos nombres según
-- en qué script se creó cada tabla: v002, v007, v009, v011, crear_tablas.sql,
-- setup_supabase.sql) NO se listan a mano por nombre — se descubren y
-- eliminan dinámicamente vía pg_policies, para no depender de tener el
-- historial completo de nombres. En Postgres las políticas se combinan con
-- OR: si queda una sola política vieja "USING (true)" sin borrar, anula todo
-- el endurecimiento de esa tabla.

DO $$
DECLARE
  t text;
  pol record;
  tablas text[] := ARRAY[
    'legajos', 'candidatos', 'psicos', 'preocupacionales', 'documentacion_ingreso',
    'cat_alt_pendientes', 'turnos', 'clientes', 'sanciones', 'casos_legales',
    'enfermos', 'reasignaciones', 'feriados', 'planillas_adelantos', 'prestamos',
    'grillas_liq', 'monotributos', 'paritarias', 'retenes', 'sugerencias',
    'personal_rrhh', 'adjuntos'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I;', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "Solo usuarios autenticados" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen:
--   1. Crea public.usuarios (perfil de app ligado a auth.users) con RLS.
--   2. Trigger que auto-provisiona la fila de perfil al crear un usuario en
--      Supabase Auth.
--   3. Habilita RLS y exige sesión autenticada en las 22 tablas existentes
--      (antes: abiertas a cualquiera con la key pública, con o sin login).
--
-- DESPUÉS DE EJECUTAR ESTE SCRIPT (pasos manuales, fuera de SQL):
--   1. Dashboard de Supabase → Authentication → Add user, para cada uno de los
--      5 usuarios demo (admin@ohlimpia.coop, rrhh@ohlimpia.coop,
--      operaciones@ohlimpia.coop, finanzas@ohlimpia.coop,
--      supervisor@ohlimpia.coop), con una password nueva (NO reusar las viejas
--      en texto plano del código).
--   2. El trigger crea automáticamente la fila en public.usuarios con nombre =
--      lo que esté antes del @. Completar perfil/nombre/funcion para cada uno
--      con un UPDATE manual, por ejemplo:
--
--      UPDATE public.usuarios SET nombre = 'Juan Peretti', perfil = 'Administrador total', funcion = 'Presidente'
--        WHERE email = 'admin@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Jimena Rrhh', perfil = 'RRHH', funcion = 'Coordinador/a'
--        WHERE email = 'rrhh@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Operaciones User', perfil = 'Operaciones', funcion = 'Coordinador/a'
--        WHERE email = 'operaciones@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Finanzas User', perfil = 'Finanzas', funcion = 'Tesorero/a'
--        WHERE email = 'finanzas@ohlimpia.coop';
--      UPDATE public.usuarios SET nombre = 'Supervisor Demo', perfil = 'Supervisor', funcion = 'Supervisor/a'
--        WHERE email = 'supervisor@ohlimpia.coop';
-- =============================================================================

-- =============================================================================
-- Migración: v120 — Las políticas RLS "solo Administrador total" también
--            aceptan al perfil DEVELOPER
-- Fecha:     07/09/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Fede entra a Ohlimpia con su propia cuenta (fede@ohlimpia.com), perfil
-- DEVELOPER — es el perfil real para el dueño/desarrollador del sistema,
-- con su propio panel de Empresas clientes/Tickets/Proyección/Seguridad
-- que "Administrador total" NO tiene (ver PERFILES.DEVELOPER, state.js) —
-- no es un perfil de RRHH cualquiera al que convenga bajarle el nivel a
-- "Administrador total" para destrabar esto.
--
-- 3 políticas RLS comparaban el perfil contra 'Administrador total' con
-- IGUALDAD LITERAL, sin contemplar a DEVELOPER — encontrado en vivo en 3
-- rondas separadas: editar la matriz de accesos por perfil, ajustar un
-- override individual (caso Jimena, 04/09), y ahora "no me deja crear
-- usuarios" (07/09) — mismo síntoma, mismo origen, cada vez en un lugar
-- distinto. Esta vez se corrige en las 3 a la vez en lugar de ir política
-- por política cuando aparece el próximo síntoma.
--
-- api/crear-usuario.js y api/resetear-password.js tienen el mismo chequeo
-- a nivel de código (no RLS) — se corrigieron aparte, ver ese commit.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "usuario_accesos_write_admin_total" ON public.usuario_accesos;
CREATE POLICY "usuario_accesos_write_admin_total" ON public.usuario_accesos
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('Administrador total', 'DEVELOPER')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('Administrador total', 'DEVELOPER')));

DROP POLICY IF EXISTS "accesos_write_admin_total" ON public.perfil_accesos;
CREATE POLICY "accesos_write_admin_total" ON public.perfil_accesos
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('Administrador total', 'DEVELOPER')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('Administrador total', 'DEVELOPER')));

DROP POLICY IF EXISTS "usuarios_update_propio_o_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_propio_o_admin" ON public.usuarios
  FOR UPDATE
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('Administrador total', 'DEVELOPER')));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

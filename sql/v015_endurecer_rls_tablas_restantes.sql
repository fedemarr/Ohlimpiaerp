-- =============================================================================
-- Migración: v015 — Endurecer RLS en tablas que v013 no conocía
-- Fecha:     2026-07-01
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- v013 endureció RLS a "solo autenticados" en las 22 tablas listadas en
-- src/shared/supabase.js (_SM). Al verificar el resultado contra la base real
-- (consultando pg_tables) aparecieron ~20 tablas más que YA EXISTEN en
-- Supabase pero todavía no están conectadas al mapeo _SM del frontend
-- (adelantos_informales, art42, capacitaciones, categorias_salariales,
-- cobros, evaluaciones, facturas, leads, materiales, motivos_fuera_eft,
-- motivos_no_fact, no_conformidades, objetivos, planillas_informales,
-- propuestas_precios, reclamos, retenciones, solicitudes_prestamos,
-- uniformes, vac_admin, vac_operativo). Todas tenían RLS habilitado pero con
-- una policy "allow_all_X" — es decir, el mismo problema que v013 resolvió
-- para las otras 22, sin resolver.
--
-- En vez de mantener una lista a mano (que ya demostró quedarse corta una
-- vez), este script recorre TODAS las tablas de public dinámicamente vía
-- information_schema, excluyendo únicamente "usuarios" (que ya tiene sus
-- políticas propias de v013, ligadas a auth.uid()).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'usuarios'
  LOOP
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
-- Después de esto, TODAS las tablas de public (incluida usuarios vía v013)
-- exigen sesión autenticada. Sigue pendiente el permiso fino por perfil
-- (que Ventas no pueda leer legajos médicos, etc.) — deuda ya anotada en v013.
-- =============================================================================

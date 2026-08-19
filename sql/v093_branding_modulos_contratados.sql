-- =============================================================================
-- Migración: v093 — branding_config: módulos contratados en vivo
-- Fecha:     2026-08-18
-- Autor:     Fede
-- =============================================================================
--
-- PROBLEMA
-- -------
-- MODULOS_CONTRATADOS se lee de VITE_MODULOS_CONTRATADOS (env var) UNA vez
-- al build time. Si el Superadmin agrega/quita módulos desde el panel de
-- Ohlimpia, el cliente no se entera hasta que se haga redeploy con la env
-- var actualizada — friction innecesario.
--
-- SOLUCIÓN
-- -------
-- Agregar campo modulos_contratados (jsonb) a branding_config (tabla que ya
-- existe en CADA base de cliente). El Superadmin escribe ahí al guardar la
-- empresa, y el cliente lo lee al login. Si está vacío/null, sigue usando
-- la env var como fallback.
--
-- CORRER EN LA BASE DE CADA EMPRESA CLIENTE (no en la de Ohlimpia).
-- =============================================================================

BEGIN;

ALTER TABLE public.branding_config
  ADD COLUMN IF NOT EXISTS modulos_contratados jsonb DEFAULT NULL;

COMMIT;

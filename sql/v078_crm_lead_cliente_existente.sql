-- =============================================================================
-- Migración: v078 — CRM: distinguir lead de cliente existente vs potencial
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 8 del relevamiento (Lautaro, 10/08). Al crear un lead se elige si
-- es de un cliente YA cargado en el ABM (al ganar, va directo al alta de
-- un servicio nuevo, sin crear un cliente Borrador duplicado) o un
-- cliente potencial (sigue el flujo de siempre: crea un cliente en
-- Borrador con los datos del lead).
--
-- Retrocompatible: los leads existentes no tienen tipo_cliente cargado
-- (NULL) — el código los trata como 'Potencial' por default (mismo
-- comportamiento que tenían antes de este cambio), no se les asigna
-- 'Existente' a ciegas.
-- =============================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tipo_cliente text,
  ADD COLUMN IF NOT EXISTS cliente_id_vinculado bigint;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v016 — Fix tabla usuarios pre-existente (policy abierta + sin FK)
-- Fecha:     2026-07-01
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- v013 asumió que public.usuarios no existía (CREATE TABLE IF NOT EXISTS).
-- Al verificar contra la base real se descubrió que la tabla YA EXISTÍA
-- (creada en algún momento anterior, probablemente en preparación para el
-- supaSync('usuarios', ...) que ya estaba en legacy.js), con un esquema
-- distinto al que v013 diseñó:
--   - id uuid DEFAULT uuid_generate_v4() — SIN foreign key a auth.users
--   - id_local text — columna del patrón genérico, no usada por el nuevo flujo
-- Por ser CREATE TABLE IF NOT EXISTS, v013 no tocó nada de esto — sólo agregó
-- las policies nuevas, pero la policy vieja "allow_all_usuarios" (abierta a
-- cualquiera, sin requerir login) seguía activa en paralelo porque v013 sólo
-- borraba policies por nombre exacto y no conocía esa.
--
-- La tabla está vacía (0 filas), así que agregar la FK ahora es seguro.
-- =============================================================================

BEGIN;

-- Sacar la policy abierta que quedó viva sin que v013 la detectara.
DROP POLICY IF EXISTS "allow_all_usuarios" ON public.usuarios;

-- Atar id a auth.users para que sea imposible tener un perfil huérfano
-- (y para que el trigger de v013 sea, además de funcional, correcto a nivel
-- de integridad referencial).
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

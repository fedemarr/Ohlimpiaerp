-- =============================================================================
-- Migración: v014 — Crear tabla pedidos (Pedidos de personal)
-- Fecha:     2026-06-30
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- "Pedidos de personal" (src/legacy.js, sección PEDIDOS) es el primer módulo
-- que se migra a src/modules/pedidos/. Nunca tuvo tabla propia en Supabase —
-- vivía solo en memoria del browser (DB.pedidos), por eso supaSync('pedidos', ...)
-- no persistía nada hasta ahora.
--
-- Sigue el mismo patrón id_local que usan legajos/candidatos/psicos, para
-- que encaje con el mapeo genérico camel↔snake de src/shared/supabase.js
-- (a diferencia de la tabla usuarios de v013, que es un caso especial ligado
-- a auth.users por uuid y no pasa por ese mapeo genérico).
--
-- RLS se crea directamente endurecido (solo autenticados) — no hace falta el
-- paso intermedio "abierta y después la cerramos" porque la tabla es nueva.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pedidos (
  id          bigint generated always as identity PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  fecha       text,
  supervisor  text,
  servicio    text,
  zona        text,
  puesto      text,
  horario     text,
  urgencia    text,
  estado      text NOT NULL DEFAULT 'Pendiente',
  candidato   text,
  obs         text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_pedidos
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pedidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v182 — Monotributo: vencimiento del mes (Pago mensual)
-- Fecha:     02/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (MONOTRIBUTO_cierre_modulo_para_Fede_1.md §17, pedido de Martina)
-- --------
-- El tab Pago mensual necesita un reloj: la fecha de vencimiento ARCA de
-- cada período (default día 20, editable porque ARCA la corre por
-- feriados/fin de semana), que dispara el semáforo de estado de pago
-- (§18) y la campanita de aviso a RRHH cuando se acerca.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mono_vencimientos (
  id bigint PRIMARY KEY,
  id_local text NOT NULL UNIQUE,
  periodo text NOT NULL UNIQUE,      -- 'YYYY-MM'
  fecha date NOT NULL,               -- vencimiento real de ese período
  actualizado_por text,
  actualizado_en timestamptz,
  created_at timestamptz DEFAULT now()
);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

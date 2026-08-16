-- =============================================================================
-- Migración: v088 — Horario semanal estructurado en Pedidos de personal
-- Fecha:     2026-08-16
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Horario y días": al dar de alta o editar un pedido de personal,
-- hoy solo hay un input de texto libre (`pedidos.horario`, "Ej: Lunes a
-- viernes 14 a 22hs"). Se replica el mismo componente que usa Servicios
-- (objetivos) en su "personal necesario": checklist de días de la semana
-- (L M X J V S D + Feriados) + horario desde/hasta + tipo fijo/rotativo.
--
-- Decisión: columna `horario_semanal` jsonb en `pedidos`, con el MISMO
-- shape que un puesto de `objetivos.puestos_necesarios`:
--
--   {
--     "dias": { "lunes": true, "martes": true, ..., "feriados": false },
--     "horarioDesde": "14:00",
--     "horarioHasta": "22:00",
--     "tipoHorario": "fijo" | "rotativo"
--   }
--
-- El pedido describe UNA necesidad → objeto único (no array). La columna
-- `horario` (text) se mantiene: al guardar se genera un resumen legible
-- ("L, M, X, V · 14:00 a 22:00 · Fijo") para no romper la tabla, el
-- filtro ni los pedidos antiguos (retrocompat total).
--
-- Se usa el patrón jsonb de v072/v073: default '{}', upsert por fila.
-- =============================================================================

BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS horario_semanal jsonb NOT NULL DEFAULT '{}';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

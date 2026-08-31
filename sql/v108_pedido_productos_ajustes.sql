-- =============================================================================
-- Migración: v108 — Pedido de productos: ajustes (ticket "Módulo productos", 31/08)
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo productos" (Lautaro, 31/08), acompañado de
-- mockup_pedido_productos_14_3.html y PEDIDO_PRODUCTOS_ajustes_para_Fede.md.
-- Se implementan los puntos 1–9 del checklist del MD (prioridad que el
-- propio documento marca como "primero"); 10–13 (Compras por proveedor,
-- Entregas, tab Recargos, tab Margen) quedan para una vuelta siguiente.
--
-- CAMBIOS DE ESTADO (punto 7 del MD — sin CHECK constraint que tocar:
-- pp_pedidos.estado ya es text libre, sin enum):
--   Antes: borrador → cerrado_supervisor → en_auditoria → autorizado → en_compra → entregado
--   Ahora: borrador → confirmado (directo, PAGAN+dentro de presupuesto+sin
--          excepciones) | confirmado_revision (al auditor) → observado
--          (devuelto) | autorizado (aprobado) → en_compra → entregado
--   No hace falta backfill: los pedidos viejos en 'cerrado_supervisor'/
--   'en_auditoria' siguen siendo válidos, el código los sigue leyendo.
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) pp_periodos — un solo período EN CARGA a la vez (punto 8)
-- ============================================================
ALTER TABLE public.pp_periodos
  ADD COLUMN IF NOT EXISTS cierre_programado    text,     -- fecha/hora ISO de cierre (DD/MM HH:MM en la UI)
  ADD COLUMN IF NOT EXISTS recordatorio_enviado boolean NOT NULL DEFAULT false;
-- estado pasa a admitir además 'habilitado' (próximo período, todavía no
-- abierto) — mismo texto libre que ya tenía la columna, no hace falta ALTER.

-- ============================================================
-- 2) pp_pedidos — trazabilidad de CONFIRMADO / OBSERVADO (puntos 7 y 9)
-- ============================================================
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS confirmado_por      text,
  ADD COLUMN IF NOT EXISTS confirmado_en       text,
  ADD COLUMN IF NOT EXISTS observado_por       text,
  ADD COLUMN IF NOT EXISTS observado_en        text,
  ADD COLUMN IF NOT EXISTS observado_motivo    text,   -- chip obligatorio (EXCEDE / CON AUTORIZACIÓN / etc. — texto libre)
  ADD COLUMN IF NOT EXISTS observado_comentario text;  -- comentario obligatorio del auditor

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

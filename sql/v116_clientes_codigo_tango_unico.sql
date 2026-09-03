-- =============================================================================
-- Migración: v116 — Clientes: UNIQUE real en codigo_tango
-- Fecha:     2026-09-03
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Código de cliente" — investigación con datos reales (83 clientes
-- en producción): el código INTERNO (clientes.codigo) está cargado en el
-- 100% y se usa como slug en Objetivos/Servicios/Pedidos de personal — no
-- hay conflicto ahí. El código TANGO (clientes.codigo_tango) está cargado
-- en apenas 1 de 83 — no hay "duplicidad" real hoy, el problema es que casi
-- no se carga, y de eso depende el matcheo de
-- parsearEstadoCuentaTango()/"Importar Estado de cuenta de Tango" (Gestión
-- de cobros). No se unifica la identidad de cliente (decisión confirmada
-- con el usuario) — se cierra la brecha de carga: reporte "Clientes sin
-- Código Tango" + carga masiva desde el importador comercial + esta
-- migración, que agrega la unicidad real que tampoco tenía en la base.
--
-- Verificado (con el pooler arriba, mismo query que se corrió antes de
-- aplicar esta migración): 0 códigos Tango duplicados en producción.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_tango_unico
  ON public.clientes(upper(codigo_tango))
  WHERE codigo_tango IS NOT NULL AND codigo_tango <> '';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

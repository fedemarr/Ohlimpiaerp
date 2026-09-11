-- =============================================================================
-- Migración: v125 — Servicios: email de facturación / notas de aumento
-- Fecha:     11/09/2026
-- Autor:     Fede (vía asistente)
-- =============================================================================
--
-- CONTEXTO (ticket "Servicios — Mails de facturación y de notas de
-- aumento por servicio", Lautaro/Finanzas)
-- --------
-- El mail a donde se manda la FACTURA y el mail a donde se mandan las
-- NOTAS/CARTAS DE AUMENTO son el mismo destino, y viven en la ficha del
-- SERVICIO (objetivos) — no en el cliente (un cliente puede tener varios
-- servicios con contactos administrativos distintos, ej. HIT.COWORK,
-- SMART.FIT). Facturación y las notas de aumento de Comercial leen de
-- acá, sin lista propia.
--
-- Soporta múltiples destinatarios separados por ';' (ej. Smart Fit tiene
-- 4 en el principal) — se guarda como texto plano, el separador se
-- resuelve en el código al armar el envío (mismo criterio que
-- clientes.email_para/email_cc, que ya usan ';').
-- =============================================================================

BEGIN;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS email_facturacion text,
  ADD COLUMN IF NOT EXISTS email_cc text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v118 — Monotributo: Pago mensual congela el desglose completo
--            por componentes (20/21/24/IIBB), no solo CUR + adherentes
-- Fecha:     05/09/2026
-- Autor:     Fede + Lautaro (Finanzas)
-- =============================================================================
--
-- Continúa v117 (fórmula por componentes). El punto 3 de
-- MONOTRIBUTO_para_Fede.md pide que "Armar lista del mes" congele el
-- DESGLOSE completo (20 · 21 · 24 con adherentes · IIBB · total) de cada
-- asociado, no un monto único — para que el export y la auditoría posterior
-- puedan ver de qué se compone cada cuota congelada, igual que ya se ve en
-- vivo en el Padrón (desgloseCuotaTexto) y en la ficha (calcularCuotaComponentes).
--
-- cur_congelado / adherentes_monto_congelado (v080) quedan como estaban —
-- no se borran, son historial de meses armados antes de esta migración,
-- que no tenían el desglose fino todavía.
-- =============================================================================

BEGIN;

ALTER TABLE public.mono_pagos_mes
  ADD COLUMN IF NOT EXISTS imp_integrado_congelado numeric,
  ADD COLUMN IF NOT EXISTS sipa_congelado numeric,
  ADD COLUMN IF NOT EXISTS obra_social_congelado numeric,
  ADD COLUMN IF NOT EXISTS iibb_congelado numeric,
  ADD COLUMN IF NOT EXISTS condicion_congelada text,
  ADD COLUMN IF NOT EXISTS categoria_congelada text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

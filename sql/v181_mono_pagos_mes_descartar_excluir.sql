-- =============================================================================
-- Migración: v181 — Pago mensual: "Descartar" y "Excluir del mes" dejan de
--             ser un DELETE físico
-- Fecha:     02/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (MONOTRIBUTO_cierre_modulo_para_Fede_1.md, §11.b y §12.b)
-- --------
-- Las dos acciones de 🗑️ en el tab Pago mensual (la de la cola "En
-- revisión" y la de cada fila de la lista principal) compartían la misma
-- función, que hacía un DELETE físico real sobre `mono_pagos_mes`, detrás
-- de un confirm() nativo del navegador cuyo texto además se contradecía
-- para el caso de "en revisión" (un CUIT "no reconocido" nunca estuvo en
-- ninguna lista, no había nada que "sacar" de ahí).
--
-- Ahora son dos acciones distintas, ninguna borra la fila:
--  - "Descartar" (En revisión): marca `descartado=true` — el comprobante
--    no se aplica a nadie, la fila queda como registro de que se decidió
--    ignorarlo.
--  - "Excluir del mes" (lista principal): marca `excluido_mes=true` —
--    la persona sigue en el Padrón, solo este período no se le
--    cobra/paga. Reversible ("Restaurar"), pide motivo obligatorio y deja
--    evento en Historial de cambios (mono_cambios, tipo 'excluido_mes').
-- =============================================================================

BEGIN;

ALTER TABLE public.mono_pagos_mes
  ADD COLUMN IF NOT EXISTS descartado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descartado_motivo text,
  ADD COLUMN IF NOT EXISTS descartado_por text,
  ADD COLUMN IF NOT EXISTS descartado_en timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_mes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluido_mes_motivo text,
  ADD COLUMN IF NOT EXISTS excluido_mes_por text,
  ADD COLUMN IF NOT EXISTS excluido_mes_en timestamptz;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

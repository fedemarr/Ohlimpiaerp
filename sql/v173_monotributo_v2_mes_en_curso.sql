-- =============================================================================
-- Migración: v173 — Monotributo v2: pago a mes en curso, fecha límite en la
--            bandeja, datos del alta y comprobantes de pago
-- Fecha:     30/09/2026
-- Autor:     Fede + Lautaro (Finanzas), con Jimena y Martina (RRHH)
-- =============================================================================
--
-- CONTEXTO (MONOTRIBUTO_v2_mes_en_curso_para_Fede.md)
-- --------
-- El monotributo pasa a pagarse en el MES EN CURSO, no a mes vencido. Dos
-- consecuencias con columnas nuevas:
--
-- 1. mono_tramites (v151) es hoy "una fila viva por asociado pendiente" sin
--    datos propios (solo quién inició el trámite y cuándo). Es el lugar
--    natural para guardar los datos de monotributo que Jimena carga en el
--    alta ANTES de que la persona exista en el padrón real (`monotributos`)
--    — se agregan acá en vez de crear una tabla paralela. Una fila con estos
--    campos en null sigue siendo el caso viejo (SIN INICIAR/EN TRÁMITE, sin
--    constancia todavía) — no se migra nada de lo existente.
--
-- 2. mono_pagos_mes (v080/v118) necesita guardar el comprobante que el
--    sistema lee y matchea (CUIT/período/importe) contra la cuota real. El
--    PDF se sube directo a Storage (bucket ya existente `ohlimpia-adjuntos`)
--    en un path propio `mono-comprobantes/{nroSocio}/{periodo}.pdf` — no se
--    reusa la tabla `adjuntos` (esa está atada a {dni,etapa,tipo}, pensada
--    para "1 documento vigente por tipo de persona", no para "1 archivo por
--    período de una tabla transaccional").
-- =============================================================================

BEGIN;

-- ============================================================
-- mono_tramites — datos del monotributo cargados en el alta (Constancia MT)
-- + fecha límite de pago (calendario de Martina para pagos fuera de tanda).
-- ============================================================
ALTER TABLE public.mono_tramites
  ADD COLUMN IF NOT EXISTS fecha_limite date,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS zona text,
  ADD COLUMN IF NOT EXISTS condicion text,
  -- boolean NULLABLE a propósito (a diferencia de monotributos.iibb_aporta,
  -- que es NOT NULL): acá null significa "todavía no elegido", distinto de
  -- false ("elegido: no aporta").
  ADD COLUMN IF NOT EXISTS iibb_aporta boolean,
  ADD COLUMN IF NOT EXISTS adherentes_cantidad integer,
  -- Fecha de INICIO del monotributo (de la constancia ARCA) — distinta de
  -- la fecha de alta del legajo (caso real: Luque Balmaceda, inicio 01/08
  -- vs alta 27/08).
  ADD COLUMN IF NOT EXISTS fecha_inicio_mt date;

ALTER TABLE public.mono_tramites DROP CONSTRAINT IF EXISTS mono_tramites_condicion_check;
ALTER TABLE public.mono_tramites ADD CONSTRAINT mono_tramites_condicion_check
  CHECK (condicion IS NULL OR condicion IN ('comun','asociado_cooperativa','no_aportante'));

-- ============================================================
-- mono_pagos_mes — comprobante leído/matcheado + estado de revisión manual.
-- en_revision=true: "el sistema propone, Martina decide" — nunca se tilda
-- pagado=true solo porque se subió un comprobante que no cuadra.
-- ============================================================
ALTER TABLE public.mono_pagos_mes
  ADD COLUMN IF NOT EXISTS comprobante_path text,
  ADD COLUMN IF NOT EXISTS comprobante_transaccion text,
  ADD COLUMN IF NOT EXISTS comprobante_importe_leido numeric,
  ADD COLUMN IF NOT EXISTS comprobante_fecha_pago date,
  ADD COLUMN IF NOT EXISTS en_revision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS en_revision_motivo text,
  -- Cantidad de adherentes congelada del mes (el monto ya va incluido en
  -- obra_social_congelado, esto es solo para que la columna "Adherentes"
  -- del tab Pago mensual sea auditable a una fecha pasada, no el valor
  -- actual del padrón).
  ADD COLUMN IF NOT EXISTS adherentes_cantidad_congelada integer;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v183 — Casos del import: "Marcar resuelto" pasa a persistir y
--             a registrar QUÉ se decidió
-- Fecha:     02/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (MONOTRIBUTO_cierre_modulo_para_Fede_1.md §20)
-- --------
-- resolverCasoImport() era un confirm() que flipeaba `resuelto=true` SIN
-- supaSync — ni siquiera persistía, se perdía en cada reload, y no
-- aplicaba ningún cambio real al Padrón (el caso "se resolvía" pero el
-- dato de fondo seguía mal). Ahora el modal aplica la corrección elegida
-- (categoría/condición/adherentes/IIBB) directo sobre `monotributos`,
-- deja su propio evento en Historial de cambios, y el cierre del caso en
-- sí también persiste con qué se decidió.
--
-- CORRECCIÓN (02/10, tras intentar correr esto): `public.mono_casos_import`
-- no existe en producción — la migración que la creaba (sql/v092,
-- 18/08/2026) nunca se corrió ahí. Por eso el tab "Casos del import"
-- siempre mostró los 10 casos de ejemplo hardcodeados en legacy.js (el
-- fallback `if(!DB.monoCasosImport) DB.monoCasosImport=[...]`), nunca
-- datos reales de una tabla — supaInit() intentaba leerla, no encontraba
-- nada, y se quedaba con el hardcodeado. Este script ahora crea la tabla
-- si falta (copiando la definición real de v092) antes de agregar la
-- columna nueva, para no depender de que v092 se haya corrido.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mono_casos_import (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,
  nro_socio       text,
  nombre          text NOT NULL,
  tipo            text NOT NULL,           -- 'DEFINIR' | 'VERIFICAR'
  detalle         text,
  accion_esperada text,
  resuelto        boolean NOT NULL DEFAULT false,
  resuelto_por    text,
  resuelto_en     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_casos_import ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.mono_casos_import;
CREATE POLICY "Solo usuarios autenticados" ON public.mono_casos_import
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.mono_casos_import
  ADD COLUMN IF NOT EXISTS resolucion text;

COMMIT;

-- =============================================================================
-- Nota: si la tabla se acaba de crear (estaba vacía), el tab "Casos del
-- import" va a dejar de mostrar los 10 casos de ejemplo hardcodeados en
-- legacy.js hasta que alguien los cargue de verdad en esta tabla, o hasta
-- que se decida sembrarlos acá con un INSERT aparte (no incluido en este
-- script — son datos reales de personas, se siembran a propósito, no
-- como efecto colateral de una migración de columnas).
-- =============================================================================

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

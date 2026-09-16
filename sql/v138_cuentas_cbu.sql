-- =============================================================================
-- Migración: v138 — cuentas_cbu (Padrón de cuentas bancarias)
-- Fecha:     2026-09-16
-- Autor:     Fede
-- =============================================================================
--
-- Ticket "Módulo cuentas bancarias" (Lautaro, Finanzas) — documento de
-- referencia CUENTAS_BANCARIAS_para_Fede_2.md + mockup_cuentas_bancarias_3.html.
--
-- Hoy el CBU vive suelto en legajos.cbu/legajos.banco (texto libre, sin
-- validación real). Esta tabla pasa a ser la FUENTE ÚNICA — mismo patrón
-- que padron_categorias_asociado (sql/v124) con Legajos: el legajo LEE
-- de acá, no guarda su propia copia editable.
--
-- Circuito real (§1 del doc):
--   ALTA (RRHH) crea sola la fila -> SIN_CUENTA
--     -> RRHH inicia trámite con el banco -> EN_TRAMITE
--       -> el banco informa el CBU a Finanzas, que lo carga -> ACTIVA
--
-- Una fila VIVA por asociado (no versionado por vigencia como categorías):
-- id_local = 'CBU' + legajo_nro, así el upsert de la app (supaSync, por
-- id_local) siempre pisa la misma fila en vez de crear una nueva. El
-- historial de cambios de CBU va aparte, en cuentas_cbu_historial
-- (append-only, una fila por cambio).
--
-- Sin FK real (criterio del proyecto: relación por legajo_nro en texto,
-- no constraint de Postgres — igual que revisiones_retiro, padrón, etc.)
--
-- Fuera de esta pasada (ver .md §3.4 y KPI "con liquidación y sin CBU"):
-- el aviso automático de cambio de CBU a <48hs de una fecha de pago y el
-- cruce de "liquidación retenida" con Liquidaciones — requieren acoplarse
-- a la fecha de pago real por asociado, que hoy no es un dato consultable
-- de forma confiable desde afuera de ese módulo. Quedan para una vuelta
-- siguiente si se confirma que hace falta.
--
-- Verificar ANTES de correr (no deberían existir todavía):
--   select * from information_schema.tables where table_name in ('cuentas_cbu','cuentas_cbu_historial');
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cuentas_cbu (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  legajo_nro            text UNIQUE NOT NULL,
  nombre_asociado        text,

  estado                text NOT NULL DEFAULT 'SIN_CUENTA',
    -- 'SIN_CUENTA' | 'EN_TRAMITE' | 'ACTIVA'

  cbu                   text,                         -- 22 dígitos, solo cuando ACTIVA
  alias                 text,
  banco                 text,                         -- deducido de los primeros 3 dígitos del CBU (o 'Otro banco (XXX)')
  cuit_titular          text,
  es_tercero            boolean NOT NULL DEFAULT false, -- cuit_titular != cuit del asociado
  vigente_desde         date,                          -- fecha en que se cargó/activó este CBU

  -- Trámite bancario (mientras está EN_TRAMITE)
  tramite_banco         text,
  tramite_fecha         date,
  tramite_por           text,
  tramite_observaciones text,

  motivo                text,                          -- motivo del último cambio/carga
  cargado_por           text,
  cargado_en            timestamptz,

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cuentas_cbu_historial (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  legajo_nro            text NOT NULL,
  nombre_asociado       text,

  cbu_anterior          text,
  cbu_nuevo             text,
  banco_anterior        text,
  banco_nuevo           text,
  motivo                text,

  cargado_por           text,
  cargado_en            timestamptz NOT NULL DEFAULT now(),

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cbu_estado      ON public.cuentas_cbu (estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_cbu_legajo      ON public.cuentas_cbu (legajo_nro);
CREATE INDEX IF NOT EXISTS idx_cbu_hist_legajo ON public.cuentas_cbu_historial (legajo_nro);

ALTER TABLE public.cuentas_cbu            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_cbu_historial  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.cuentas_cbu;
CREATE POLICY "Solo usuarios autenticados" ON public.cuentas_cbu
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.cuentas_cbu_historial;
CREATE POLICY "Solo usuarios autenticados" ON public.cuentas_cbu_historial
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select column_name from information_schema.columns where table_name='cuentas_cbu';
--   select column_name from information_schema.columns where table_name='cuentas_cbu_historial';
-- =============================================================================

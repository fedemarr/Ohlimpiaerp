-- =============================================================================
-- Migración: v080 — Monotributo: adherentes, CUR manual, historial
--            persistente, TAB de pago mensual, integración con Legajos
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 2 del relevamiento (MODULO_MONOTRIBUTO.md, Lautaro+Claude 11/08).
-- Decisión de alcance (confirmada con Fede): se construye todo lo que NO
-- depende del import real de 413 personas (IMPORT_MONOTRIBUTO_completo.
-- xlsx, todavía no entregado en esta conversación) — el padrón arranca
-- vacío/con lo que ya había, listo para poblarse cuando llegue el
-- archivo.
--
-- De paso se encontraron y corrigen 2 bugs reales pre-existentes:
--   1. El padrón (editar/eliminar/historial/recategorizar) operaba por
--      índice de la fila ya filtrada — mismo bug ya corregido en
--      Retenciones/Uniformes. Se corrige en el código (legacy.js), no
--      requiere columnas nuevas.
--   2. DB.monoCambios (historial de cambios de categoría) y DB.monoTablas
--      (tablas de categoría por vigencia) llamaban a supaSync('monoTablas',
--      ...) / nunca llamaban a supaSync para monoCambios — como ninguna
--      de las dos claves estaba en _SM, supaSync no hacía nada (early
--      return silencioso): el historial de cambios NUNCA se guardaba en
--      la nube, se perdía al recargar. Se agrega mono_cambios acá.
--      (monoTablas —tablas de categoría ARCA— queda pendiente de
--      persistir: es de baja frecuencia de cambio y requiere un modelo
--      relacional propio; no bloquea el resto del tema.)
-- =============================================================================

BEGIN;

-- ============================================================
-- Padrón — adherentes (reemplaza a "obraSocial" como única fuente) +
-- CUR manual como excepción explícita + N° de socio para cruzar con
-- Legajos/Liquidación.
-- ============================================================
ALTER TABLE public.monotributos
  ADD COLUMN IF NOT EXISTS nro_socio text,
  ADD COLUMN IF NOT EXISTS cur_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adherentes_cantidad integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adherentes_monto numeric NOT NULL DEFAULT 0;

-- ============================================================
-- Historial de cambios de categoría/CUR — antes se perdía al recargar
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mono_cambios (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,

  nombre          text,
  fecha           text,
  cat_anterior    text,
  cat_nueva       text,
  cur_anterior    numeric,
  cur_nuevo       numeric,
  proyeccion_anual numeric,
  motivo          text,
  decido_por      text,
  resultado       text,   -- 'Aprobado' | 'Rechazado'

  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_cambios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.mono_cambios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- TAB nuevo: Pago de monotributos (mensual) — congela CUR+adherentes
-- del mes, la liquidación descuenta ese importe congelado, RRHH
-- exporta/tilda con auditoría (quién, cuándo, método).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mono_pagos_mes (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text NOT NULL UNIQUE,

  periodo           text NOT NULL,     -- 'YYYY-MM'
  nro_socio         text,
  nombre            text NOT NULL,
  cur_congelado     numeric NOT NULL DEFAULT 0,
  adherentes_monto_congelado numeric NOT NULL DEFAULT 0,
  total             numeric NOT NULL DEFAULT 0,

  pagado            boolean NOT NULL DEFAULT false,
  metodo_pago       text,              -- 'Transferencia'|'Cheque'|'Efectivo'|'Débito automático'|'Otro'
  pagado_por        text,
  pagado_en         timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_pagos_mes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.mono_pagos_mes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Legajos — integración (MODULO_MONOTRIBUTO.md §4)
-- ============================================================
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS mipyme_estado text,             -- 'TRAMITADO' | 'PENDIENTE'
  ADD COLUMN IF NOT EXISTS cuit_estado text,                -- 'ACTIVO' | 'INACTIVO' | 'VERIFICAR'
  ADD COLUMN IF NOT EXISTS cuit_fecha_verificacion date,
  ADD COLUMN IF NOT EXISTS clave_fiscal_fecha_actualizacion date;

-- Certificado MiPyME va como adjunto (mismo patrón que 'proceso' de
-- v074) — se agrega el tipo al CHECK ya existente. Se verificó el valor
-- EXACTO vigente del constraint antes de recrearlo (misma disciplina de
-- v074) para no perder ningún tipo ya en uso.
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_tipo_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'informe-psico','apto-medico','no-apto','antecedente','libreta','curso',
    'dni-frente','dni-dorso','foto-rostro','monotributo','inaes',
    'certificado-capacitacion','constancia-uniforme','denuncia-policial-uniforme',
    'evidencia-sancion','descargo-sancion','entrevista','poliza-seguro','proceso',
    'certificado-mipyme'
  ]));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

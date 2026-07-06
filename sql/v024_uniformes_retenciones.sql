-- =============================================================================
-- Migración: v024 — Módulos Uniformes y Retenciones
-- Fecha:     2026-07-06
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Los dos módulos vivían enteros sin migrar en src/legacy.js con 2 bugs
-- reales: acceso por índice de la fila filtrada (rompe al editar/liberar
-- con un filtro activo) y supaSync() siempre guardaba el último elemento
-- del array (correcto solo al crear, no al editar). Se rehacen de cero
-- (política A.11), por id en vez de índice, con soft delete.
--
-- `uniformes` y `retenciones` ya estaban en el mapa de tablas del
-- frontend (_SM) apuntando a tablas homónimas de schema desconocido/viejo
-- — mismo caso ya visto con reasignaciones/capacitaciones: se hace
-- backup genérico antes de recrearlas.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 0 — Backups defensivos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uniformes_backup_v023 AS
  SELECT * FROM public.uniformes;
CREATE TABLE IF NOT EXISTS public.retenciones_backup_v023 AS
  SELECT * FROM public.retenciones;

-- ---------------------------------------------------------------------------
-- Paso 1 — Recrear uniformes
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.uniformes;

CREATE TABLE public.uniformes (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text UNIQUE NOT NULL,
  legajo_id_local  text,
  nro_socio        text,
  nombre           text NOT NULL,
  fecha            date NOT NULL,
  talle            text,
  prendas          jsonb,
  descuento        numeric NOT NULL DEFAULT 0,
  estado           text NOT NULL DEFAULT 'Pendiente',
  observaciones    text,
  editado_por      text,
  editado_en       timestamptz,
  anulado          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_uniformes_legajo ON public.uniformes(legajo_id_local) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Paso 2 — Recrear retenciones
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.retenciones;

CREATE TABLE public.retenciones (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text UNIQUE NOT NULL,
  legajo_id_local  text,
  nro_socio        text,
  nombre           text NOT NULL,
  tipo             text NOT NULL,
  periodo          text,
  monto            numeric NOT NULL DEFAULT 0,
  motivo           text,
  estado           text NOT NULL DEFAULT 'Activa',
  fecha_liberacion date,
  editado_por      text,
  editado_en       timestamptz,
  anulado          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_retenciones_legajo ON public.retenciones(legajo_id_local) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Paso 3 — RLS (mismo patrón "solo autenticados" que el resto)
-- ---------------------------------------------------------------------------
ALTER TABLE public.uniformes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.uniformes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Solo usuarios autenticados" ON public.retenciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

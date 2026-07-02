-- =============================================================================
-- Migración: v017 — Completar columnas de monotributos, uniformes, retenciones
-- Fecha:     2026-07-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Los 3 módulos ya tienen render + CRUD completos en legacy.js (guardarMonotributo,
-- guardarUniforme, guardarRetencion) y los 3 YA llaman a supaSync(), pero nunca
-- persistían datos reales.
--
-- Al intentar crear las tablas desde cero (CREATE TABLE) se descubrió que YA
-- EXISTÍAN — igual que pasó con "usuarios" en v016 — armadas parcialmente en
-- algún momento anterior: tienen PK, UNIQUE(id_local), trigger de updated_at y
-- la policy de RLS ya correctamente endurecida (heredada del barrido dinámico
-- de v015, que recorre TODAS las tablas de public). Lo único que falta son las
-- columnas de datos — cada tabla solo tenía id/id_local/una columna jsonb/
-- timestamps.
--
-- El shape sigue el de las funciones guardarX() (la ruta de escritura real vía
-- modal), no el de los datos semilla viejos en legacy.js — hay dos shapes
-- distintos para monotributos en el código legacy (uno viejo con nroSocio/
-- facturacionAnual/familia, uno nuevo con cuit/fechaAlta/cur/historialCategorias)
-- y el nuevo es el que efectivamente lee/escribe la pantalla. Los datos semilla
-- del shape viejo se vacían en el mismo cambio (ver commit de código).
-- =============================================================================

BEGIN;

ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS nombre      text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS cuit        text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS categoria   text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS fecha_alta  text;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS zona        text DEFAULT 'provincia';
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS obra_social boolean DEFAULT false;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS jubilado    boolean DEFAULT false;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS cur         numeric DEFAULT 0;
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS estado      text DEFAULT 'Al día';
ALTER TABLE public.monotributos ADD COLUMN IF NOT EXISTS obs         text;

ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS nombre    text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS nro_socio text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS fecha     text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS talle     text;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS descuento numeric DEFAULT 0;
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS estado    text DEFAULT 'Pendiente';
ALTER TABLE public.uniformes ADD COLUMN IF NOT EXISTS obs       text;

ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS nombre    text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS nro_socio text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS periodo   text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS monto     numeric DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS motivo    text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS estado    text DEFAULT 'Activa';
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS fecha     text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

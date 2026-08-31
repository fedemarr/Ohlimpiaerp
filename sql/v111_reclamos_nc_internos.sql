-- =============================================================================
-- Migración: v111 — Reclamos/NC internos (sin cliente obligatorio)
-- Fecha:     2026-08-31
-- Autor:     Fede
--
-- CONTEXTO
-- --------
-- Ticket Reclamos y NC: poder registrar reclamos/no conformidades INTERNOS,
-- sin que sea obligatorio asociar un cliente. Hoy el formulario marca
-- "Cliente *" como obligatorio, lo que bloquea NC de origen interno
-- (incidencias de procesos, problemas internos, etc.).
--
-- DECISIÓN DE DISEÑO
-- ------------------
-- Se agrega un flag booleano `es_interno` (default false) tanto en
-- `reclamos` como en `no_conformidades`, coherente con el patrón de flags
-- ya existente en esas tablas (`genera_nc`, `firmada`). Cuando `es_interno
-- = true`, el reclamo/NC no requiere cliente.
--
-- NOTA IMPORTANTE
-- ---------------
-- `reclamos.cliente_id` ya es `bigint DEFAULT 0` SIN NOT NULL (v001), así
-- que NO hay que alterar su nulabilidad: ya acepta NULL. El cambio acá es
-- SOLO agregar el flag de origen. Los reclamos internos persistirán con
-- `cliente_id = 0` (igual que hoy los que no eligen cliente), pero
-- marcados con `es_interno = true` para poder filtrarlos/distinguirlos.
--
-- RLS: no se toca. Ambas tablas usan "Solo usuarios autenticados"
-- FOR ALL TO authenticated USING(true) — ya cubre el caso.
-- =============================================================================

BEGIN;

ALTER TABLE public.reclamos
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;

ALTER TABLE public.no_conformidades
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;

-- Índice opcional si el volumen amerita filtrar por origen; sin él también
-- filtra bien en este volumen. Se deja comentado para no agregar peso si no
-- hace falta.
-- CREATE INDEX IF NOT EXISTS idx_reclamos_es_interno ON public.reclamos(es_interno);

COMMIT;

-- =============================================================================
-- CÓMO APLICARLO
--   En el SQL Editor de Supabase (Dashboard → SQL → New query), pegar este
--   archivo completo y ejecutar. Es idempotente (IF NOT EXISTS), seguro de
--   re-ejecutar. No borra ni altera datos existentes: los reclamos/NC ya
--   creados quedan con es_interno = false (comportamiento actual intacto).
-- =============================================================================

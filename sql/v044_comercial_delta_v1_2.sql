-- v044_comercial_delta_v1_2.sql
-- Delta Comercial v1.2 (24 julio 2026) — campos nuevos del modal de
-- Cliente. Sin estas columnas, guardarCliente() falla en silencio para
-- TODO el registro (mismo bug de columna inexistente ya documentado en
-- v039 — PostgREST rechaza el insert/update completo, supaSync() solo
-- hace console.warn, el toast de éxito se muestra igual).
--
-- 2.1.1: responsable interno (account manager de Comercial), lee de Legajos.
-- 2.1.2: tipo de contrato (Por hora / Presupuesto fijo), gobierna el modelo
-- de precio de los Objetivos/Servicios del cliente.

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS responsable   text,
  ADD COLUMN IF NOT EXISTS tipo_contrato text;

COMMIT;

-- v047_comercial_delta_v1_3.sql
-- Delta Comercial v1.3 (29 julio 2026) — columnas nuevas para Clientes y
-- Servicios. Sin estas columnas, guardarCliente()/guardarObjetivo() fallan
-- en silencio para todo el registro (mismo bug de columna inexistente ya
-- documentado en v039/v044/v045/v046 — PostgREST rechaza el insert/update
-- completo, supaSync() solo hace console.warn, el toast de éxito se
-- muestra igual).
--
-- V.1/1.2: identidad interna propia del cliente (codigo), desacoplada del
-- Código Tango — antes convivían formatos internos (CLI-0001) y códigos
-- crudos de Tango (ej. "46") en el mismo campo.
-- 1.2/A.1: responsable de cliente puede ser externo (no solo Legajos).
-- A.4: jurisdicción del servicio (CABA/Provincia de Buenos Aires, con
-- estructura fácil de extender a futuras provincias).
-- A.3: personal necesario como tabla de puestos estructurada (jsonb).
-- 2.5/A.6: necesidad logística del servicio (productos, elementos de
-- limpieza, máquinas) — la "receta" del servicio, dato estable.
-- 2.3.2: tilde "recibe la factura" sobre los responsables del servicio.
-- V.1: bug preexistente encontrado de paso — objetivo_responsables.telefono
-- ya existe desde v039, pero el mapeo camelCase→snake_case de 'tel' nunca
-- se agregó (se mandaba 'tel' tal cual a una columna 'telefono'
-- inexistente para PostgREST) — fix es solo de código (src/shared/
-- supabase.js), esta migración no toca esa tabla.

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo               text,
  ADD COLUMN IF NOT EXISTS responsable_tipo     text,
  ADD COLUMN IF NOT EXISTS responsable_contacto text;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS jurisdiccion       text,
  ADD COLUMN IF NOT EXISTS puestos_necesarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS log_productos      text,
  ADD COLUMN IF NOT EXISTS log_elementos      text,
  ADD COLUMN IF NOT EXISTS log_maquinas       text;

ALTER TABLE public.objetivo_responsables
  ADD COLUMN IF NOT EXISTS recibe_factura boolean NOT NULL DEFAULT false;

COMMIT;

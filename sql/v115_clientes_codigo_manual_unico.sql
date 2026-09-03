-- =============================================================================
-- Migración: v115 — Clientes: código manual + UNIQUE real en la base
-- Fecha:     2026-09-03
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Código de cliente manual" — antes clientes.codigo se autogeneraba
-- siempre (secuencial "CLI-0001", nunca aleatorio) y el campo del formulario
-- era de solo lectura pese a mostrarse. Ahora se puede cargar/editar a mano
-- (sin formato obligatorio — libre, con fallback a autogenerar si queda
-- vacío). La unicidad hasta hoy se garantizaba SOLO por convención en JS
-- (generarCodigoCliente() calculando max+1) — clientes.codigo nunca tuvo un
-- UNIQUE real en la base (a diferencia de objetivos.codigo, que sí lo
-- tiene desde v039). Al permitir carga manual, hace falta el constraint de
-- verdad — la validación en el frontend (guardarCliente(), legacy.js) evita
-- la mayoría de los casos pero no reemplaza la garantía de la base.
--
-- ⚠️ PASO 1 — CORRER ESTO PRIMERO (verificación, no modifica nada):
-- Si esta consulta devuelve filas, hay códigos duplicados ya cargados y el
-- CREATE UNIQUE INDEX de más abajo va a fallar (con un error claro, sin
-- tocar datos) hasta que se resuelvan a mano (renombrar uno de los
-- duplicados). Si no devuelve nada, saltar directo al PASO 2.
--
--   SELECT codigo, count(*) AS repetidos, array_agg(id_local) AS clientes
--   FROM public.clientes
--   WHERE codigo IS NOT NULL AND codigo <> ''
--   GROUP BY codigo
--   HAVING count(*) > 1;
--
-- =============================================================================

BEGIN;

-- PASO 2 — índice único parcial: exige unicidad entre los clientes que SÍ
-- tienen código cargado (no bloquea filas viejas con código vacío/NULL, si
-- las hubiera). Mismo criterio de "único pero sin exigir NOT NULL" que
-- clientes.id_local (v001).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_unico
  ON public.clientes(lower(codigo))
  WHERE codigo IS NOT NULL AND codigo <> '';

COMMENT ON COLUMN public.clientes.codigo IS 'Código interno del cliente — carga manual (sin formato obligatorio) con fallback a autogenerado (CLI-000X) si queda vacío. Único (case-insensitive, ver idx_clientes_codigo_unico). Usado como clave de matching por el importador comercial (comercial_importador.js) — cambiarlo en un cliente existente puede desincronizar una carga masiva que todavía referencie el código anterior.';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

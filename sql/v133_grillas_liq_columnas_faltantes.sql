-- =============================================================================
-- Migración: v133 — grillas_liq: columnas faltantes que bloqueaban TODA
--            creación de grilla nueva desde el 09/09, + candado real +
--            constraint anti-duplicados
-- Fecha:     2026-09-14
-- Autor:     Fede
-- =============================================================================
--
-- CAUSA RAÍZ del ticket "Módulo de liquidación de horas — planilla
-- supervisores" (LIQ_HORAS_planilla_unica_para_Fede.md, Lautaro):
--
-- 1) crearGrillaDesdeObj() (src/legacy.js) — la función que arma la grilla
--    la primera vez que alguien expande la fila de un servicio — desde el
--    ticket "importación no impacta en el supervisor" (09/09) escribe un
--    campo nuevo `origenGrilla` en el objeto ('auto'|'manual'|'csv'), pero
--    nadie agregó la columna en Supabase ni la entrada en _toSnake/_toCamel
--    (regla del proyecto: cada campo nuevo necesita las dos cosas). Como
--    supaSync() manda el objeto COMPLETO en el insert/update, Postgres
--    rechaza el insert entero con "column grillas_liq.origen_grilla does
--    not exist" — y como supaSync() nunca tiraba esa falla al usuario
--    (silenciosa, solo console.warn), la grilla quedaba creada SOLO en la
--    memoria del navegador de quien la abrió. Confirmado con evidencia
--    dura: el último created_at en TODA la tabla es 2026-09-09T18:25:59 —
--    CERO grillas nuevas se guardaron en Supabase desde entonces, para
--    NINGÚN servicio, de NINGÚN usuario. Esto es lo que Lautaro vio como
--    "cada usuario tiene su propia copia": no es que haya dos copias en la
--    base — es que NINGUNA de las dos llegó nunca a la base, cada una
--    quedó atrapada en su propia pestaña.
--
-- 2) toggleCongelarGrilla() escribe `congelada`/`congeladaPor`/`congeladaEn`
--    /`descongeladaPor`/`descongeladaEn` — ninguna de esas 5 columnas
--    existe tampoco en grillas_liq (el candado se sostenía únicamente con
--    `estado`, nunca se persistía el booleano real). Mismo síntoma: el
--    candado de Fabio nunca salió de su navegador.
--
-- 3) Sin una constraint real, nada impedía que dos sesiones sin la grilla
--    en su copia local crearan cada una la suya (dos filas para el mismo
--    servicio+mes) — la ganancia real de fondo que pide el ticket ("existe
--    UNA sola planilla por servicio+mes"). Verificado por REST: hoy CERO
--    duplicados en las 50 filas existentes, así que se puede agregar la
--    constraint directo, sin necesidad de fusionar datos antes.
--
-- Con (1) y (2) resueltos, cada creación/edición/congelado vuelve a
-- guardarse en Supabase de verdad — con supaInit() recargando todo al
-- iniciar sesión, "refrescar y ver lo mismo" (el estándar de verificación
-- que pidió Lautaro) ya queda cubierto. (3) es el cinturón de seguridad
-- para que, aunque dos personas graben casi al mismo tiempo, la segunda
-- falle en vez de crear una copia — el código (aparte, en JS) ya la
-- recupera sola en ese caso en vez de mostrar un error.
--
-- Verificar ANTES de correr (debería devolver 0):
--   select objetivo_codigo, periodo, tipo, count(*) from grillas_liq
--     group by objetivo_codigo, periodo, tipo having count(*) > 1;
-- =============================================================================

BEGIN;

ALTER TABLE public.grillas_liq
  ADD COLUMN IF NOT EXISTS origen_grilla text,
  ADD COLUMN IF NOT EXISTS importado_de_csv boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS congelada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS congelada_por text,
  ADD COLUMN IF NOT EXISTS congelada_en timestamptz,
  ADD COLUMN IF NOT EXISTS descongelada_por text,
  ADD COLUMN IF NOT EXISTS descongelada_en timestamptz;

ALTER TABLE public.grillas_liq
  ADD CONSTRAINT uq_grillas_liq_obj_periodo_tipo UNIQUE (objetivo_codigo, periodo, tipo);

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select column_name from information_schema.columns
--     where table_name='grillas_liq' and column_name in
--     ('origen_grilla','importado_de_csv','congelada','congelada_por',
--      'congelada_en','descongelada_por','descongelada_en');
--   -- debería devolver las 7 filas.
-- =============================================================================

-- =============================================================================
-- Migración: v135 — limpiar a "Martinez Federico" (prueba) de grillas_liq
-- Fecha:     2026-09-15
-- Autor:     Fede
-- =============================================================================
--
-- Ticket LIQUIDACIONES_conexiones_para_Fede_1.md, punto 2: "borrar al
-- asociado de prueba Martinez Federico (ya pedido en el doc de
-- Monotributo)" — sigue apareciendo en Liquidaciones vía CHANGO.CASEROS.
-- Verificado por REST: aparece en 4 grillas (julio a septiembre 2026).
-- Se quita SOLO su elemento del array `asociados` de cada grilla — no se
-- borra la grilla entera, porque 2 de las 4 tienen además gente real
-- (Elicabe Ricardo/Recalde Axel en CHANGO.BROWN, Ferrari Karina Viviana
-- en CHANGO.CASEROS agosto) que no corresponde tocar.
--
-- Verificar ANTES de correr (debería devolver 4 filas, cada una con
-- "Martinez Federico" en su array `asociados`):
--   select id_local, objetivo_codigo, periodo, asociados from grillas_liq
--     where id_local in ('338795098','125313591','957719243','957042698');
-- =============================================================================

BEGIN;

UPDATE public.grillas_liq g
SET asociados = COALESCE(
  (SELECT jsonb_agg(elem) FROM jsonb_array_elements(g.asociados) elem
     WHERE elem->>'nombre' <> 'Martinez Federico'),
  '[]'::jsonb
)
WHERE g.id_local IN ('338795098','125313591','957719243','957042698');

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto (no debería devolver filas):
--   select id_local, objetivo_codigo, periodo from grillas_liq
--     where asociados @> '[{"nombre":"Martinez Federico"}]'::jsonb;
-- =============================================================================

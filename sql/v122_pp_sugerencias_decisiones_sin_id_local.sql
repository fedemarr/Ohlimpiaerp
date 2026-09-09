-- =============================================================================
-- Migración: v122 — pp_sugerencias_decisiones: sacar id_local (no aplica)
-- Fecha:     09/09/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (bug real reportado por Lautaro en producción, 09/09)
-- --------
-- v119 creó esta tabla siguiendo por inercia la convención general del
-- proyecto (id_local NOT NULL UNIQUE en toda tabla nueva), pero acá no
-- corresponde: la decisión de Sugerencias en la compra NO es un registro
-- por servicio con su propio id — es la decisión sobre la LÍNEA
-- CONSOLIDADA del período (que junta el mismo producto pedido desde
-- varios servicios/pp_items a la vez). Su identidad real y completa ya es
-- la clave compuesta (periodo_id_local, producto_id_local) — la misma
-- que usa el UNIQUE existente y el onConflict del upsert en
-- _guardarDecisionPP() (compras.js). id_local quedó como una columna
-- NOT NULL que ningún código de la app llenaba nunca (ni al insertar, ni
-- al leer — DB.ppSugerenciasDecisiones ni siquiera guarda un id en
-- memoria), así que TODO upsert fallaba con:
--   null value in column "id_local" of relation "pp_sugerencias_decisiones"
--   violates not-null constraint
-- Es decir: esta tabla nunca guardó una decisión con éxito desde que
-- existe (05/09) — se descarta sin riesgo de pérdida de datos.
--
-- Si en el futuro hace falta trazabilidad por servicio de quién generó
-- cada línea que entró al consolidado, eso es una tabla de DETALLE aparte
-- (servicio -> línea consolidada), no una columna acá — la clave de la
-- decisión sigue siendo período + producto original + producto sugerido.
-- =============================================================================

BEGIN;

ALTER TABLE public.pp_sugerencias_decisiones
  DROP COLUMN IF EXISTS id_local;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

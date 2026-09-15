-- =============================================================================
-- Migración: v136 — limpiar a "Martinez Federico" (prueba) de Monotributo
--            y Retenciones
-- Fecha:     2026-09-15
-- Autor:     Fede
-- =============================================================================
--
-- Ticket MONOTRIBUTO_pago_mensual_para_Fede.md, punto 2: "Borrar al
-- asociado de prueba Martinez Federico... imposible de matchear con el
-- padrón (nro_socio null). Además tiene una retención de prueba en el
-- módulo Retenciones (socio 146, período 2026-07, $0). Borrar el
-- registro completo, retención incluida."
--
-- (De grillas_liq / Liquidación de horas ya se limpió aparte — ver
-- sql/v135_limpiar_martinez_federico_grillas.sql. Esta es la parte de
-- Monotributo + Retenciones, tablas distintas.)
--
-- Verificado por REST: no hay movimientos en retenciones_movimientos
-- ligados a esta retención (alcance 'Total', $0 acumulado, sin uso real).
--
-- Verificar ANTES de correr (debería devolver 1 fila en monotributos,
-- 3 en mono_pagos_mes —períodos 07/08/09 2026—, y 1 en retenciones):
--   select id_local, nombre, nro_socio from monotributos where nombre = 'Martinez Federico';
--   select id_local, periodo, nombre, total from mono_pagos_mes where nombre = 'Martinez Federico';
--   select id_local, nombre, nro_socio, periodo_desde, monto from retenciones where nombre = 'Martinez Federico';
-- =============================================================================

BEGIN;

DELETE FROM public.mono_pagos_mes WHERE id_local IN ('631922467', '631959021', '577287046');
DELETE FROM public.monotributos   WHERE id_local = '384098895';
DELETE FROM public.retenciones    WHERE id_local = '529383567';

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto (las 3 consultas de arriba
-- no deberían devolver ninguna fila).
-- =============================================================================

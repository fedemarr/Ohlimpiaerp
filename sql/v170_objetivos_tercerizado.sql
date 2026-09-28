-- v170: PERIODOS_campanita_tercerizados_para_Fede.md — "Servicio
-- tercerizado (sin pedido de productos)" es un dato del servicio, no un
-- supervisor trucho. Marcado, el servicio desaparece por completo de
-- Pedido de productos (tab Períodos, modal "Estado de los pedidos",
-- campanita) — filtro del lado del cliente en pedido_productos.js, esta
-- migración solo agrega la columna.
BEGIN;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS tercerizado boolean NOT NULL DEFAULT false;

COMMIT;

-- Verificación:
--   select column_name from information_schema.columns
--   where table_name = 'objetivos' and column_name = 'tercerizado';

-- ============================================================
-- MIGRACIÓN DE DATOS — a correr aparte, después de confirmar los casos
-- reales con el SELECT de abajo (el doc menciona "Utcydra" con supervisor
-- "ESTO ES TERCIARIZADO", pero puede haber más — "cualquier supervisor
-- que no sea una persona real del módulo de Supervisores es sospechoso").
-- ============================================================

-- 1) Encontrar los casos reales antes de tocar nada:
--   select codigo, nombre, supervisor_asignado
--   from public.objetivos
--   where supervisor_asignado ilike '%tercer%'
--      or supervisor_asignado ilike '%terciar%';

-- 2) Una vez confirmados los códigos exactos, aplicar (ejemplo con
--    'Utcydra' del doc — reemplazar por los códigos reales confirmados):
--   update public.objetivos
--   set tercerizado = true, supervisor_asignado = ''
--   where codigo in ('UTCYDRA')  -- <-- completar con los códigos reales
--     and supervisor_asignado ilike '%tercer%';

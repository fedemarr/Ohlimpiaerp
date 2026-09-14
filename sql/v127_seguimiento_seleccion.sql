-- =============================================================================
-- Migración: v127 — Seguimiento de selección (Jimena/RRHH, 14/09)
-- Fecha:     2026-09-14
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Nuevo módulo "Seguimiento de selección": vista transversal de solo
-- lectura sobre Pedido de personal → Vacante → Candidato → Etapa →
-- Ingreso. Antes de escribir el módulo se investigó el modelo de datos
-- real y se encontró que HOY NO EXISTE ningún vínculo entre un
-- Candidato y el Pedido de personal que está cubriendo (Candidatos ni
-- siquiera tiene un campo de servicio) — es el bloqueante real para
-- que la vista pueda armar el pipeline, confirmado con el usuario
-- (AskUserQuestion) antes de tocar código.
--
-- Nota aparte sobre "Zona" (punto 3.4 del ticket): el ticket pide
-- "definir el campo Zona en la ficha del servicio" asumiendo que no
-- existe — en realidad la ficha de Objetivos YA tiene Jurisdicción
-- (CABA/Provincia de Buenos Aires) + Localidad (partido/barrio), que es
-- exactamente el mismo dato ("La Matanza", "Campana", etc. en el
-- mockup). No se agrega una columna zona nueva y redundante — el
-- problema real es que muchos servicios la tienen vacía, no que falte
-- el campo. La vista lee objetivos.localidad (o jurisdiccion si esa
-- falta) y muestra "zona sin cargar" cuando ninguna de las dos está.
--
-- CAMBIOS
-- -------
-- 1. candidatos.pedido_vinculado_id_local: mismo patrón que ya usa
--    reasignaciones.pedido_vinculado_id_local (select opcional en el
--    alta/edición del candidato) — sin este campo no hay pipeline que
--    mostrar.
-- 2. psicos / preocupacionales / documentacion_ingreso: origen +
--    cargado_manual_por — soporte para la "carga manual = excepción
--    marcada" del punto 3.3 (Jimena puede necesitar anotar una etapa
--    hecha fuera del sistema; queda tipificada como MANUAL, con quién
--    la cargó, en vez de mezclarse sin marca con las etapas reales).
--
-- Aditivo, no rompe nada existente.
-- =============================================================================

BEGIN;

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS pedido_vinculado_id_local text;

ALTER TABLE public.psicos
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'sistema',           -- 'sistema' | 'manual'
  ADD COLUMN IF NOT EXISTS cargado_manual_por text;

ALTER TABLE public.preocupacionales
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'sistema',
  ADD COLUMN IF NOT EXISTS cargado_manual_por text;

ALTER TABLE public.documentacion_ingreso
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'sistema',
  ADD COLUMN IF NOT EXISTS cargado_manual_por text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

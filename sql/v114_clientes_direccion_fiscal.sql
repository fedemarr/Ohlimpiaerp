-- =============================================================================
-- Migración: v114 — Clientes: formalizar direccion/ciudad como dirección fiscal
-- Fecha:     2026-09-02
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Dirección fiscal" — pedía separar "dirección del servicio" de
-- "dirección fiscal" en el alta de clientes. Investigación: el sistema YA
-- separa estos dos conceptos, pero en dos entidades distintas (correcto,
-- porque un cliente puede tener varios servicios en direcciones distintas):
--   - objetivos.dir / objetivos.jurisdiccion / objetivos.localidad → dirección
--     de CADA servicio (ya existía, obligatoria al crear un objetivo).
--   - clientes.direccion / clientes.ciudad → dirección del CLIENTE. El label
--     del formulario (index.html) ya decía "Dirección fiscal" — el dato ya
--     estaba ahí, solo faltaba dejarlo explícito y visible.
--
-- No hace falta agregar columnas nuevas ni migrar datos: nada se pierde ni
-- se mueve. Este script es puramente documental (COMMENT ON COLUMN), para
-- que quede claro en el propio esquema qué es cada campo — evita que en el
-- futuro alguien reintroduzca la confusión.
-- =============================================================================

COMMENT ON COLUMN public.clientes.direccion IS 'Dirección FISCAL del cliente (razón social) — NO es la dirección del servicio. La dirección de cada servicio vive en objetivos.dir/jurisdiccion/localidad, porque un cliente puede tener varios servicios en distintas direcciones.';
COMMENT ON COLUMN public.clientes.ciudad IS 'Ciudad/localidad de la dirección FISCAL del cliente — texto libre, no vinculada a jurisdicciones_servicio (esa tabla es geografía de servicios, no de clientes).';

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

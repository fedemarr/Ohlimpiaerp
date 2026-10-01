-- =============================================================================
-- Migración: v177 — Objetivos (servicios): tab Logística v2
-- Fecha:     30/09/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (SERVICIO_LOGISTICA_v2_para_Fede.md, Lautaro/Finanzas 30/09)
-- --------
-- El tab Logística del servicio tenía un select propio "Facturación de
-- productos" (objetivos.productos) que NO es el que decide nada — la
-- Bandeja del auditor siempre leyó clientes.productos_en_factura. Dos
-- verdades, ninguna confiable (ej.: Ascensores decía "SE FACTURA" y su
-- servicio mostraba "—"). Esta migración agrega las columnas para:
--   1. facturacion_productos: el valor RESUELTO (heredado del cliente, o
--      propio si alguien hizo override) — objetivos.productos (el select
--      viejo) queda intacto pero deja de usarse desde el form.
--   2. lleva_productos / lleva_elementos / lleva_maquinas: 3 checkboxes de
--      concepto fijos que reemplazan la selección múltiple por ítem
--      (objetivos.productos_limpieza/elementos_limpieza/maquinas_necesarias,
--      que también quedan intactas, ya no editables desde el form).
--      lleva_productos es FUNCIONAL: gobierna si el servicio entra a
--      Pedido de productos (ver pedido_productos.js).
--   3. notas_logistica: campo único que reemplaza los 3 textos libres
--      (log_productos/log_elementos/log_maquinas, que quedan intactos
--      como archivo histórico hasta que alguien confirme la migración).
--   4. logistica_migrado: una vez confirmado el reparto del texto viejo,
--      el recuadro de aviso deja de mostrarse para ese servicio.
--
-- Ningún campo viejo se borra ni se renombra — "nada se pierde en
-- silencio" (punto 4 del ticket).
-- =============================================================================

BEGIN;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS facturacion_productos text,
  ADD COLUMN IF NOT EXISTS lleva_productos boolean,
  ADD COLUMN IF NOT EXISTS lleva_elementos boolean,
  ADD COLUMN IF NOT EXISTS lleva_maquinas boolean,
  ADD COLUMN IF NOT EXISTS notas_logistica text,
  ADD COLUMN IF NOT EXISTS logistica_migrado boolean NOT NULL DEFAULT false;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- v051_gestion_cobranzas_v1.sql
-- DELTA_comercial_gestion_cobranzas_v1 (30 julio 2026). Principio rector:
-- la gestora no cobra facturas, cobra clientes — la gestión de cobro
-- (llamada, mail, etc.) se registra una vez por conversación y aplica por
-- defecto a TODAS las facturas pendientes del cliente. Antes vivía
-- repetida en cada factura (facturas.acciones); pasa a vivir en el
-- cliente, con ciclo de vida propio (Pendiente → Realizada/Vencida) que
-- antes no existía (el formulario nacía y moría en un solo paso).

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS gestiones_cobro jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;

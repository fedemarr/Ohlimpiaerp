-- v050_crm_leads_flujo_v1.sql
-- DELTA_crm_flujo_leads_v1 (30 julio 2026). La tabla 'leads' ya existía en
-- producción (creada a mano, 0 filas, nunca conectada — mismo patrón ya
-- visto con 'facturas'/'cobros' en v048) y supaSync('leads', ...) ya se
-- llamaba desde guardarLead() sin que _SM tuviera la entrada — no
-- persistía nada. Se agrega el mapeo (src/shared/supabase.js) y las 2
-- columnas que le faltan para las novedades del delta:
--
-- - cliente_borrador_id: guarda el id del cliente auto-creado en Borrador
--   al ganar el lead (punto 4) — evita duplicar el cliente si el lead
--   vuelve a pasar por la reconciliación de etapa.
-- - motivo_perdida: espejo del motivo de pérdida más reciente a nivel
--   lead (mismo criterio que "valor" — el detalle completo vive en las
--   acciones, esto es solo para no recorrer todo el historial en listas).

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cliente_borrador_id bigint,
  ADD COLUMN IF NOT EXISTS motivo_perdida       text;

COMMIT;

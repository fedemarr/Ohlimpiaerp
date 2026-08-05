-- v059_legajos_polizas_obra_social.sql
-- Ticket Sistemas: un asociado puede tener varias pólizas (antes era un
-- único campo "ART" / columna art) — se guardan como jsonb, mismo patrón
-- ya usado en legajos para listas/estructuras repetidas (adjuntos_legal,
-- adjuntos_medico, historial_movimientos, talles_uniforme son todas jsonb
-- en esta tabla). También se agrega la fecha de inicio de trámite de obra
-- social (auto = ingreso + 3 meses, editable). Tipo text para esta última,
-- coherente con el resto de los campos tipo fecha de legajos (fec_nac,
-- ingreso, fecha_baja, fecha_ingreso_prueba son todos text, no date nativo
-- — confirmado contra el esquema real, ver CLAUDE.md sobre schema drift).
--
-- La columna art NO se dropea (compatibilidad con legajos existentes que
-- ya la tienen cargada) — las altas nuevas dejan de escribirla, usan
-- "polizas" en su lugar. 'legajos' es una tabla real y activa, cambio
-- puramente aditivo.

BEGIN;

ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS polizas jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS obra_social_inicio_tramite text;

COMMENT ON COLUMN public.legajos.art IS
  'Reemplazada por polizas (jsonb, múltiples pólizas con número + vencimiento) desde 2026-08. Se conserva por compatibilidad con legajos existentes; las altas nuevas ya no la completan.';

COMMIT;

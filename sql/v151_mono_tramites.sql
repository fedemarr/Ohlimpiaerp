-- v151: MONOTRIBUTO_bandeja_para_Fede.md (18/09) — Bandeja de Pendientes.
--
-- La bandeja se DERIVA: asociado activo sin monotributo en el Padrón =
-- pendiente (SIN INICIAR). Es el mismo patrón que Pendientes de CBU: el alta
-- "siembra" el trámite porque el asociado nuevo ya cae en la lista, y el
-- backfill de los activos de hoy es automático. Lo único que hay que
-- PERSISTIR es el estado EN TRÁMITE (quién lo inició y cuándo — "si Roque
-- lleva 8 días en trámite, se ve"). Una fila viva por asociado:
-- id_local = 'MTR' + legajo_nro (upsert por id_local, mismo criterio que
-- cuentas_cbu). Sin FK real (relación por legajo_nro en texto).
BEGIN;

CREATE TABLE IF NOT EXISTS public.mono_tramites (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text UNIQUE NOT NULL,
  legajo_nro     text UNIQUE NOT NULL,
  nombre_asociado text,
  tramite_por    text,
  tramite_fecha  date,
  anulado        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mono_tramites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.mono_tramites;
CREATE POLICY "Solo usuarios autenticados" ON public.mono_tramites
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- Verificación: select column_name from information_schema.columns where table_name='mono_tramites';

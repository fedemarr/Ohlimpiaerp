-- v162: GESTION_HORAS_para_Fede.md — módulo nuevo "Gestión de horas"
-- (Operaciones). Mismo patrón de vigencias YA construido y probado en
-- Supervisión de servicios (sql/v086, supervision_vigencias): cada regla
-- de horas pactadas es una VIGENCIA {objetivo, puestos, vigente_desde,
-- vigente_hasta, usuario, fecha, motivo}. Cambiar las horas nunca pisa la
-- anterior: se cierra la vigencia abierta (vigente_hasta = mes anterior al
-- nuevo desde) y se abre una nueva. Los períodos ya liquidados leen la
-- vigencia que les tocó — se reconstruyen exactos siempre.
--
-- obj_codigo (no objetivo_id / objetivo_id_local) como alcance: mismo
-- criterio que ya usa Supervisión (alcanceServicio = o.codigo || o.id) —
-- el código es estable entre reloads, a diferencia del id truncado.
--
-- puestos jsonb: MISMA forma que objetivos.puestos_necesarios
-- ({puesto, cantidad, horarioDesde, horarioHasta, tipoHorario, dias:{...},
-- obs}) — el flag "trabaja feriados" NO es un campo nuevo: ya existe como
-- dias.feriados (el checkbox "Fer." de checklistDiasHtml, el mismo
-- componente que ya usa el bloque Personal necesario del alta). No hace
-- falta reconciliar nada aparte — se lee tal cual.
BEGIN;

CREATE TABLE IF NOT EXISTS public.horas_vigencias (
  id           uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local     text UNIQUE,
  obj_codigo   text NOT NULL,
  puestos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  vigente_desde text NOT NULL,          -- 'YYYY-MM'
  vigente_hasta text,                    -- 'YYYY-MM' o NULL = vigencia abierta
  usuario      text DEFAULT '',
  fecha        text DEFAULT '',          -- DD/MM/AAAA, fecha de carga (no confundir con vigente_desde)
  motivo       text DEFAULT '',
  origen       text DEFAULT 'operaciones', -- 'alta' | 'operaciones' | 'comercial' | 'backfill'
  anulado      boolean DEFAULT false,
  created_at   timestamp with time zone DEFAULT now(),
  updated_at   timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_horas_vigencias_obj_codigo ON public.horas_vigencias (obj_codigo);

ALTER TABLE public.horas_vigencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.horas_vigencias;
CREATE POLICY "Solo usuarios autenticados" ON public.horas_vigencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- Verificación:
--   select column_name from information_schema.columns where table_name='horas_vigencias';

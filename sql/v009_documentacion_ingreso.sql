-- v009: tabla documentacion_ingreso
-- Agrupa 3 requisitos del ingreso: Antecedentes (obligatorio, eliminatorio,
-- vence cada 6 meses), Libreta sanitaria (condicional) y Curso de
-- manipulación (condicional). Molde: preocupacionales (v007).

CREATE TABLE public.documentacion_ingreso (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local text UNIQUE,
  candidato_id bigint,
  psico_id bigint,
  preocup_id bigint,
  nombre text,
  dni text,
  zona text,
  tel text,
  rrhh text,
  -- Antecedentes penales (obligatorio, eliminatorio)
  antec_resultado text DEFAULT 'Pendiente',
  antec_fecha date,
  antec_vencimiento date,
  antec_excepcion boolean DEFAULT false,
  antec_motivo_excepcion text,
  -- Libreta sanitaria (condicional)
  libreta_aplica boolean DEFAULT false,
  libreta_zona text,
  libreta_vencimiento date,
  -- Curso de manipulación de alimentos (condicional)
  curso_tiene boolean DEFAULT false,
  curso_vencimiento date,
  -- Generales
  estado text DEFAULT 'En proceso',
  motivo text,
  obs text,
  anulado boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.documentacion_ingreso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total" ON public.documentacion_ingreso
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_updated_at_documentacion_ingreso
  BEFORE UPDATE ON public.documentacion_ingreso
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

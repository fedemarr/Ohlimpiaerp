-- v007: tabla preocupacionales (examen médico / apto médico)
-- Fase 1 del flujo de selección. Molde: personal_rrhh (v002).
-- Valores cerrados (prestador, resultado) como text, validados en el front.

CREATE TABLE public.preocupacionales (
  id           bigint generated always as identity PRIMARY KEY,
  id_local     text UNIQUE NOT NULL,
  candidato_id bigint,
  psico_id     bigint,
  nombre       text,
  dni          text,
  zona         text,
  fecha_turno  date,
  prestador    text,
  resultado    text DEFAULT 'Pendiente',
  motivo       text,
  estado       text DEFAULT 'En proceso',
  obs          text,
  anulado      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.preocupacionales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total preocupacionales" ON public.preocupacionales
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_updated_at_preocupacionales
  BEFORE UPDATE ON public.preocupacionales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

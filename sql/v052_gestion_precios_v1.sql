-- v052_gestion_precios_v1.sql
-- DELTA_comercial_gestion_precios_v1 (30/07/2026). El módulo se rehace de
-- punta a punta (decisión A.11 tomada con el usuario: sin datos reales que
-- migrar, es el momento más barato para cambiar el modelo). La tabla
-- 'propuestas_precios' ya existía en producción (creada a mano, 0 filas,
-- mismo patrón "no conectada" ya visto en v048/v049/v050/v051) con el
-- modelo VIEJO (un % y una fecha sueltos). Se altera para el modelo nuevo:
-- una propuesta con uno o más tramos (jsonb), dirección aumento/rebaja, y
-- el circuito Secuencia A (dos intervenciones del gerente).
--
-- valor_propuesto/valor_hora_propuesto estaban tipadas "text" (probable
-- resabio de una carga a mano) — se amplían a numeric, que es lo que
-- realmente vamos a mandar.

BEGIN;

-- Guardado contra "text" (18/08/2026): en una base nueva, creada por
-- introspección del esquema YA MIGRADO de producción, esta columna nace
-- numeric directamente — el USING NULLIF(col,'')::numeric de abajo
-- comparaba un numeric contra el literal '' y explotaba al resolver el
-- tipo (''::numeric no es válido), aunque no hubiera ni una fila. Se hace
-- condicional: solo convierte si todavía está en el estado viejo (text).
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='propuestas_precios' AND column_name='valor_propuesto') = 'text' THEN
    ALTER TABLE public.propuestas_precios
      ALTER COLUMN valor_propuesto DROP DEFAULT,
      ALTER COLUMN valor_hora_propuesto DROP DEFAULT,
      ALTER COLUMN valor_propuesto TYPE numeric USING NULLIF(valor_propuesto,'')::numeric,
      ALTER COLUMN valor_hora_propuesto TYPE numeric USING NULLIF(valor_hora_propuesto,'')::numeric,
      ALTER COLUMN valor_propuesto SET DEFAULT 0,
      ALTER COLUMN valor_hora_propuesto SET DEFAULT 0;
  END IF;
END $$;

ALTER TABLE public.propuestas_precios
  ADD COLUMN IF NOT EXISTS objetivo_id            bigint,
  ADD COLUMN IF NOT EXISTS cliente_id              bigint,
  ADD COLUMN IF NOT EXISTS tipo_modificacion       text NOT NULL DEFAULT 'Aumento',
  ADD COLUMN IF NOT EXISTS motivo                  text,
  ADD COLUMN IF NOT EXISTS niveles                 jsonb,
  ADD COLUMN IF NOT EXISTS tipo_convalidar         text,
  ADD COLUMN IF NOT EXISTS tramos                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS autorizada_por          text,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion      text,
  ADD COLUMN IF NOT EXISTS confirmada_por          text,
  ADD COLUMN IF NOT EXISTS fecha_confirmacion      text,
  ADD COLUMN IF NOT EXISTS motivo_rechazo_gerente  text,
  ADD COLUMN IF NOT EXISTS motivo_rechazo_cliente  text,
  ADD COLUMN IF NOT EXISTS lote_id                 text,
  ADD COLUMN IF NOT EXISTS propuesta_anterior_id   bigint,
  ADD COLUMN IF NOT EXISTS cargado_por             text;

CREATE INDEX IF NOT EXISTS idx_propuestas_precios_lote ON public.propuestas_precios(lote_id);
CREATE INDEX IF NOT EXISTS idx_propuestas_precios_objetivo ON public.propuestas_precios(objetivo_id);

COMMIT;

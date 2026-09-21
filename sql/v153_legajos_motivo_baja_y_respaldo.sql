-- v153: Legajos — motivo de la baja + documento de respaldo (carta documento).
--
-- Sugerencia real (socio 5248 · Pérez Sergio, baja por exclusión): al cargar
-- una baja no había dónde dejar constancia del motivo ni adjuntar la CD.
--
-- 1) legajos.motivo_baja (text, NULLABLE): motivo en texto libre. Aditiva, no
--    toca ningún registro existente. Aplica a TODOS los tipos de baja, no solo
--    exclusión (el "tipo" ya vive en legajos.estado_legal: 1CD/2CD/Exclusión…).
--
-- 2) El archivo NO va en una columna nueva: reutiliza el bucket privado
--    `ohlimpia-adjuntos` y la tabla `adjuntos` (indexada por DNI, la misma que
--    ya alimenta la pestaña "Adjuntos" del legajo) con etapa='baja' y
--    tipo='respaldo-baja'. Para eso hay que ampliar los CHECK de adjuntos.
--    Se AMPLÍAN leyendo el estado VIGENTE del constraint en la base (no una
--    lista escrita a mano), así no se pisa ningún valor agregado por otras
--    migraciones. Idempotente: si el valor ya está, no hace nada.
BEGIN;

ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS motivo_baja text;

DO $$
DECLARE
  def   text;
  vals  text[];
  spec  record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('adjuntos_etapa_check', 'baja'),
      ('adjuntos_tipo_check',  'respaldo-baja')
    ) AS t(cname, nuevo)
  LOOP
    SELECT pg_get_constraintdef(oid) INTO def
      FROM pg_constraint
     WHERE conname = spec.cname AND conrelid = 'public.adjuntos'::regclass;

    IF def IS NULL THEN
      RAISE NOTICE 'No existe %, no se toca (la tabla adjuntos no lo restringe).', spec.cname;
      CONTINUE;
    END IF;
    IF position('''' || spec.nuevo || '''' IN def) > 0 THEN
      RAISE NOTICE '% ya admite %', spec.cname, spec.nuevo;
      CONTINUE;
    END IF;

    SELECT array_agg(m[1] ORDER BY ord) INTO vals
      FROM regexp_matches(def, '''([^'']+)''', 'g') WITH ORDINALITY AS r(m, ord);
    vals := array_append(vals, spec.nuevo);

    EXECUTE format('ALTER TABLE public.adjuntos DROP CONSTRAINT %I', spec.cname);
    IF spec.cname = 'adjuntos_etapa_check' THEN
      EXECUTE format('ALTER TABLE public.adjuntos ADD CONSTRAINT %I CHECK (etapa = ANY (%L::text[]))', spec.cname, vals);
    ELSE
      EXECUTE format('ALTER TABLE public.adjuntos ADD CONSTRAINT %I CHECK (tipo = ANY (%L::text[]))', spec.cname, vals);
    END IF;
    RAISE NOTICE '% ampliado con %', spec.cname, spec.nuevo;
  END LOOP;
END $$;

COMMIT;

-- Verificación:
--   select column_name from information_schema.columns where table_name='legajos' and column_name='motivo_baja';
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.adjuntos'::regclass and conname in ('adjuntos_etapa_check','adjuntos_tipo_check');

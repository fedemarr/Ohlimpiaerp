-- v185 — Conciliación de las filas del import viejo en Pago mensual
--
-- MONOTRIBUTO_cierre_modulo_para_Fede_1.md §12.
--
-- ── Qué se investigó (sql/INVESTIGACION_filas_sin_nombre_READONLY.sql y el
--    diagnóstico posterior, con salida real de producción) ────────────────
--
-- Hay 29 filas en 2026-09/2026-10 cuyo campo `nombre` no es un nombre: es un
-- número ("5578", "113 (B)") o un placeholder que dejó una conciliación previa
-- ("SOCIO 5582 (sin legajo encontrado)").
--
-- FALSO PLENO que hubo que descartar en el camino: se sospechó que el `total`
-- era basura porque 8 personas distintas comparten $49.527,18 al centavo. Se
-- comprobó con dos consultas que NO lo son:
--
--   1. DELTA = 0.00 en las 27 filas → cada `total` es exactamente la suma de
--      sus propios componentes (imp_integ + SIPA + obra social + adherentes +
--      IIBB). Los importes NO están corruptos.
--   2. cat_importada == cat_padron, cond_importada == cond_padron y
--      adherentes = 0 en todas las filas → las 8 personas están en la misma
--      situación (categoría A, común, sin adherentes, sin IIBB) y por eso pagan
--      lo mismo. Es aritmética correcta, no un default.
--
-- Lo que SÍ está roto es que hay filas duplicadas:
--   - Sequeira Nicole (5581): 4 filas en 2026-09 y 4 en 2026-10
--   - Díaz Daniela (5579): 2 filas en 2026-10
--   - Cocha Nicol (5580): 1 fila en 2026-09
-- Cada persona debe tener 1 fila por período. Con las 4 de Sequeira, tildar el
-- mes le paga $198.108 de una vez. Eso es el agujero, y por eso §12 pedía
-- excluirlas del tildado mientras tanto (ya implementado en el código).
--
-- De los 29 N°: 5578 y 5583 NO existen en legajos (son basura de columnas
-- corridas), y 5582 es Luque Balmaceda Marcelo Daniel, que ya tiene su fila
-- bien. O sea que no falta ninguna persona por pagar.
--
-- ── Qué hace esta migración ───────────────────────────────────────────────
--   1. Guarda una copia de TODO lo que va a tocar (mono_pagos_mes_v185_backup).
--   2. ABORTA si el panorama no es exactamente el que se investigó.
--   3. Escribe el nombre real (desde legajos) en la fila que se conserva.
--   4. Marca `excluido_mes = true` en las 13 filas sobrantes (duplicados y
--      huérfanos). NO borra: es reversible y auditado, y `excluido_mes` es lo
--      que las saca de la lista del mes, del KPI y del semáforo.
--   5. Loguea cada cambio en mono_cambios (Historial de cambios).
--
-- ── Cómo revertir ─────────────────────────────────────────────────────────
--   UPDATE mono_pagos_mes p SET excluido_mes = false
--     FROM mono_pagos_mes_v185_backup b WHERE b.id_local = p.id_local;
--   UPDATE monotributos t SET nombre = b.nombre_padron
--     FROM mono_pagos_mes_v185_backup b WHERE b.nro_socio_padron = t.nro_socio
--     AND b.nombre_padron IS DISTINCT FROM b.nombre_importado;
--   DROP TABLE mono_pagos_mes_v185_backup;

BEGIN;

-- ── 0bis. Una fila por legajo, guaranteed ─────────────────────────────────
-- CRÍTICO, y salió del dry run contra staging: `legajos.nro` NO tiene
-- restricción unique, y `monotributos.nro_socio` tiene duplicados reales
-- (el 4734 aparece dos veces, con condiciones distintas). Un
-- `LEFT JOIN legajos ON nro = nro_socio` con 2 coincidencias devuelve 2 filas
-- por cada pago: el conteo se infla (29 filenames → 40 en el dry run) y el
-- UPDATE aplica dos veces. Se resuelve con DISTINCT ON, que además hace la
-- elección determinista.
CREATE TEMP VIEW v185_legajo_unico AS
SELECT DISTINCT ON (nro) nro, nombre, cuit, estado
FROM public.legajos
ORDER BY nro, (estado = 'Activo') DESC, id_local;

-- Mismo problema en el Padrón: el 4734 tiene dos filas (condiciones
-- distintas). Para el nombre real de la fila alcanza con el que tenga
-- nombre no-placeholder; si los dos tuvieran, gana el más reciente.
CREATE TEMP VIEW v185_mono_unico AS
SELECT DISTINCT ON (nro_socio) nro_socio, nombre, cuit
FROM public.monotributos
ORDER BY nro_socio,
         (nombre IS NOT NULL AND btrim(nombre) <> ''
          AND btrim(nombre) !~ '^SOCIO\s+\d+\s*\(\s*sin\s+legajo\s+encontrado\s*\)$') DESC,
         updated_at DESC NULLS LAST, id_local;

-- ── 0. Guarda: las columnas que usa la migración tienen que existir ────────
-- `excluido_mes` y `en_revision_motivo` las agrega v181. Si no están, esta
-- migración no puede correr (y con razón: significaría que v181 no se aplicó).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='mono_pagos_mes'
                   AND column_name='excluido_mes') THEN
    RAISE EXCEPTION 'Falta mono_pagos_mes.excluido_mes. Aplicar v181 primero. No se toca nada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='mono_pagos_mes'
                   AND column_name='en_revision_motivo') THEN
    RAISE EXCEPTION 'Falta mono_pagos_mes.en_revision_motivo. Aplicar v181 primero. No se toca nada.';
  END IF;
END $$;

-- ── 1. Backup ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS mono_pagos_mes_v185_backup;
CREATE TABLE mono_pagos_mes_v185_backup AS
SELECT p.*,
       l.nombre AS nombre_real,
       m.nombre AS nombre_padron
FROM public.mono_pagos_mes p
LEFT JOIN v185_legajo_unico l ON l.nro::text = p.nro_socio
LEFT JOIN v185_mono_unico m ON m.nro_socio = p.nro_socio
WHERE TRUE  -- sin filtro de per�odo: ver nota abajo
  AND (p.nombre IS NULL OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$');

-- ── 1bis. El ranking, calculado UNA vez ───────────────────────────────────
-- BUG QUE ENCONTRÓ EL DRY RUN, Y ES EL IMPORTANTE: antes esto iba como un CTE
-- repetido en el paso 3 y en el paso 4. El paso 3 renombra la fila buena, y
-- como el paso 4 vuelve a rankear SOLO sobre las filas que siguen siendo
-- sospechosas, la fila renombrada ya no está en el conjunto: la siguiente pasa
-- a ser rn=1 y sobrevive. Quedaban 2 filas por persona en vez de 1 — o sea,
-- la mitad del problema original sin resolver, y el tildado seguía pagando
-- doble. Ahora el ranking se calcula una vez, antes de tocar nada, y los dos
-- pasos leen la misma tabla.
CREATE TEMP TABLE v185_marcadas AS
SELECT p.id_local,
       p.periodo,
       p.nro_socio,
       l.nombre AS nombre_real,
       row_number() OVER (PARTITION BY p.periodo, p.nro_socio ORDER BY p.id_local) AS rn,
       (l.nro IS NOT NULL) AS tiene_legajo
FROM public.mono_pagos_mes p
LEFT JOIN v185_legajo_unico l ON l.nro::text = p.nro_socio
WHERE TRUE  -- sin filtro de período: ver nota abajo
  AND (p.nombre IS NULL OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$');

-- ── 1ter. Por qué NO se filtra por período ─────────────────────────────────
-- La primera versión filtraba `periodo IN ('2026-09','2026-10')` y abortó en
-- producción:zcayó en 23 en vez de 29. La causa fue MÍA: el 29 salió de la
-- consulta resumen de INVESTIGACION_…, que cuenta TODOS los períodos, y asumí
-- que esos 29 eran los de septiembre y octubre. No lo eran — 6 están en otros
-- períodos.
--
-- El filtro no era sólo un número equivocado: dejaba 6 filas duplicadas o
-- huérfanas fuera de la conciliación, en períodos que pueden seguir abiertos.
-- La regla que se aplica ("1 fila por persona por período, y sólo si tiene
-- legajo") es válida para cualquier período, así que ahora no se filtra y la
-- migración cubre todo lo que esté roto.

-- ── 2. Aserción: si el panorama cambió, que no corra ──────────────────────
-- El total de 29 sí se puede afirmar (viene de la investigación, que no filtra
-- períodos). Lo que NO se afirma es cuántas hay que descartar: eso depende de
-- cuántos duplicados y huérfanos hay en los períodos que no se habían mirado,
-- y poner un número inventado hacía que la migración abortara sin dejar hacer
-- su trabajo. En su lugar, las comprobaciones de verdad van al final (paso 7),
-- sobre el resultado: que cada persona real quede con 1 fila y nombre real.
DO $$
DECLARE
  v_filas int;
  v_personas int;
  v_descartar int;
BEGIN
  SELECT count(*) INTO v_filas FROM mono_pagos_mes_v185_backup;
  SELECT count(*) INTO v_personas
  FROM (SELECT DISTINCT periodo, nro_socio FROM v185_marcadas WHERE tiene_legajo) t;
  SELECT count(*) INTO v_descartar
  FROM v185_marcadas WHERE NOT tiene_legajo OR rn > 1;

  IF v_filas <> 29 THEN
    RAISE EXCEPTION 'Se esperaban 29 filas sospechosas y hay %. No se toca nada: volve a correr la investigación.', v_filas;
  END IF;
  RAISE NOTICE 'OK: % sospechosas, % personas con legajo a renombrar, % a descartar.',
    v_filas, v_personas, v_descartar;
END $$;

-- ── 3. Nombre real en la fila que se conserva ─────────────────────────────
UPDATE public.mono_pagos_mes p
SET nombre = m.nombre_real
FROM v185_marcadas m
WHERE p.id_local = m.id_local
  AND m.tiene_legajo
  AND m.rn = 1
  AND p.nombre IS DISTINCT FROM m.nombre_real;

-- ── 4. Excluir del mes las 13 sobrantes (huérfanos + duplicados) ───────────
-- No se borran. `excluido_mes` es reversible y es lo que las saca de la lista
-- del mes, del KPI y del semáforo. Los huérfanos van con motivo propio para
-- que se distingan de un duplicado. Usa EL MISMO ranking del paso 3 (ver 1bis).
UPDATE public.mono_pagos_mes p
SET excluido_mes = true,
    en_revision_motivo = CASE WHEN m.tiene_legajo
      THEN 'Duplicado del import viejo (v185): la persona ya tiene su fila en el período.'
      ELSE 'Sin legajo asociado (v185): N° ' || p.nro_socio || ' no existe en legajos, no es una persona real.' END
FROM v185_marcadas m
WHERE p.id_local = m.id_local
  AND (NOT m.tiene_legajo OR m.rn > 1)
  AND p.excluido_mes IS NOT TRUE;

-- ── 5. Arreglar el Padrón: 5579 quedó con nombre placeholder ───────────────
-- legajos 5579 = Díaz Daniela Candelaria, CUIT 27379394006, Activo. El Padrón
-- lo tiene como "SOCIO 5582 (sin legajo encontrado)" sin CUIT. Solo se toca
-- lo que matchea el patrón exacto de placeholder — nada más del Padrón.
UPDATE public.monotributos t
SET nombre = l.nombre, cuit = l.cuit
FROM v185_legajo_unico l
WHERE l.nro::text = t.nro_socio
  AND l.nombre IS NOT NULL
  AND (
    t.nombre IS NULL
    OR btrim(t.nombre) = ''
    OR t.nombre ~ '^SOCIO\s+\d+\s*\(\s*sin\s+legajo\s+encontrado\s*\)$'
  );

-- ── 6. Log ────────────────────────────────────────────────────────────────
-- Columnas reales de mono_cambios (verificado contra la base, NO inventadas):
-- nombre, fecha, cat_anterior, cat_nueva, cur_anterior, cur_nuevo,
-- proyeccion_anual, motivo, decido_por, resultado. `fecha` es TEXT (DD/MM/AAAA).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id_local, p.periodo, p.nro_socio, COALESCE(l.nombre,'(sin legajo)') AS nombre_real,
           b.nombre AS nombre_antes,
           CASE WHEN l.nro IS NULL THEN 'huérfano sin legajo' ELSE 'duplicado' END AS tipo
    FROM public.mono_pagos_mes p
    JOIN mono_pagos_mes_v185_backup b ON b.id_local = p.id_local
    LEFT JOIN v185_legajo_unico l ON l.nro::text = p.nro_socio
    WHERE p.excluido_mes IS TRUE
  LOOP
    INSERT INTO public.mono_cambios (id_local, nombre, fecha, motivo, decido_por, resultado)
    VALUES (
      -- No usar epoch()/clock_timestamp(): dentro de una misma transacción
      -- devuelven el mismo segundo y el id_local es unique -> colisión (lo
      -- detectó el dry run). El id_local del pago es único y además deja el
      -- log trazable a la fila exacta.
      'v185-' || r.id_local,
      r.nombre_real,
      to_char(now(), 'DD/MM/YYYY'),
      'v185 — ' || r.tipo || ' · período ' || r.periodo || ' · N° ' || r.nro_socio
        || ' · nombre en la fila: "' || COALESCE(r.nombre_antes,'(vacío)') || '"'
        || ' · excluido del mes, no se eliminó (reversible)',
      'Fede (conciliación manual)',
      'Descartado del pago'
    );
  END LOOP;
END $$;

-- ── 7. Post-condiciones: el resultado se chequea acá, no se promete ───────
-- Si algo de esto no se cumple, la transacción aborta y no queda nada aplicado.
-- Son las comprobaciones que importan: que no haya quedado ninguna fila
-- sospechosa visible, que ninguna persona real haya quedado con más de una fila
-- en su período, y que los nombres escritos sean los del legajo y no los de
-- otro socio (que es como el dry run Fishing→Sosa).
DO $$
DECLARE
  v_malas_visibles int;
  v_sobre_duplicadas int;
  v_nombres_malos int;
BEGIN
  -- 1) Ninguna fila sospechosa quedó visible en ningún período.
  SELECT count(*) INTO v_malas_visibles
  FROM public.mono_pagos_mes
  WHERE (to_jsonb(mono_pagos_mes)->>'excluido_mes') IS DISTINCT FROM 'true'
    AND (nombre IS NULL OR btrim(nombre) = ''
         OR btrim(nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$');

  -- 2) Cada persona con legajo tiene exactamente 1 fila visible por período.
  SELECT count(*) INTO v_sobre_duplicadas
  FROM (
    SELECT p.periodo, p.nro_socio, count(*) AS filas
    FROM public.mono_pagos_mes p
    JOIN v185_legajo_unico l ON l.nro::text = p.nro_socio
    WHERE (to_jsonb(p)->>'excluido_mes') IS DISTINCT FROM 'true'
    GROUP BY p.periodo, p.nro_socio
    HAVING count(*) <> 1
  ) t;

  -- 3) Toda fila visible con legajo lleva el nombre de SU legajo.
  SELECT count(*) INTO v_nombres_malos
  FROM public.mono_pagos_mes p
  JOIN v185_legajo_unico l ON l.nro::text = p.nro_socio
  WHERE (to_jsonb(p)->>'excluido_mes') IS DISTINCT FROM 'true'
    AND p.nombre IS DISTINCT FROM l.nombre;

  IF v_malas_visibles > 0 THEN
    RAISE EXCEPTION 'Quedaron % fila(s) sospechosas visibles. No se toca nada.', v_malas_visibles;
  END IF;
  IF v_sobre_duplicadas > 0 THEN
    RAISE EXCEPTION 'Hay % (período,socio) con más de 1 fila visible. Se iba a pagar doble. No se toca nada.', v_sobre_duplicadas;
  END IF;
  IF v_nombres_malos > 0 THEN
    RAISE EXCEPTION 'Hay % fila(s) con el nombre de otro socio. No se toca nada.', v_nombres_malos;
  END IF;
  RAISE NOTICE 'OK: 0 sospechosas visibles, 0 sobre-duplicados, 0 nombres cruzados.';
END $$;

COMMIT;

-- ── Verificación (para correr después, aparte) ─────────────────────────────
-- Las 3 consultas tienen que dar 0 filas / 0 filas / 0 filas.
--
-- 1) Sospechosas que quedaron visibles:
-- SELECT * FROM public.mono_pagos_mes
-- WHERE (to_jsonb(mono_pagos_mes)->>'excluido_mes') IS DISTINCT FROM 'true'
--   AND (nombre IS NULL OR btrim(nombre) = ''
--        OR btrim(nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$');
--
-- 2) Personas con más de 1 fila visible en su período:
-- SELECT p.periodo, p.nro_socio, count(*)
-- FROM public.mono_pagos_mes p JOIN public.legajos l ON l.nro::text = p.nro_socio
-- WHERE (to_jsonb(p)->>'excluido_mes') IS DISTINCT FROM 'true'
-- GROUP BY 1,2 HAVING count(*) <> 1;
--
-- 3) Lo que quedó, para revisión visual:
-- SELECT periodo, nro_socio, nombre, total,
--        (to_jsonb(mono_pagos_mes)->>'excluido_mes') AS excluido,
--        en_revision_motivo
-- FROM public.mono_pagos_mes ORDER BY periodo, nro_socio;
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
WHERE p.periodo IN ('2026-09','2026-10')
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
WHERE p.periodo IN ('2026-09','2026-10')
  AND (p.nombre IS NULL OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$');

-- ── 2. Aserción: si el panorama cambió, que no corra ──────────────────────
DO $$
DECLARE
  v_filas int;
  v_a_manejar int;
BEGIN
  SELECT count(*) INTO v_filas FROM mono_pagos_mes_v185_backup;
  SELECT count(*) INTO v_a_manejar
  FROM v185_marcadas WHERE NOT tiene_legajo OR rn > 1;

  IF v_filas <> 29 THEN
    RAISE EXCEPTION 'Se esperaban 29 filas sospechosas y hay %. No se toca nada: volve a correr la investigación.', v_filas;
  END IF;
  IF v_a_manejar <> 13 THEN
    RAISE EXCEPTION 'Se esperaban 13 filas a descartar (huérfanos + duplicados) y hay %. No se toca nada.', v_a_manejar;
  END IF;
  RAISE NOTICE 'OK: 29 filas sospechosas, 13 a descartar, 16 a renombrar.';
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

COMMIT;

-- ── Verificación: esto tiene que dar 16 y 13 ──────────────────────────────
-- SELECT count(*) FILTER (WHERE excluido_mes IS TRUE) AS descartadas,
--        count(*) FILTER (WHERE excluido_mes IS NOT TRUE) AS conservadas
-- FROM public.mono_pagos_mes WHERE periodo IN ('2026-09','2026-10');
--
-- Y que no quede ninguna fila sospechosa visible:
-- SELECT * FROM public.mono_pagos_mes
-- WHERE periodo IN ('2026-09','2026-10') AND excluido_mes IS NOT TRUE
--   AND (nombre IS NULL OR btrim(nombre)=''
--        OR btrim(nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$');
-- tiene que dar 0 filas.
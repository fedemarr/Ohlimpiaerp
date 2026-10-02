-- =============================================================================
-- INVESTIGACIÓN DE SOLO LECTURA — filas sin nombre en Pago mensual
-- Fecha:     02/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- PARA: MONOTRIBUTO_cierre_modulo_para_Fede_1.md §12 / Orden sugerido paso 5.
--
-- 🚨 ESTE SCRIPT NO ES UNA MIGRACIÓN Y NO ESCRIBE NADA.
--    Es 100% SELECT. Se puede correr todas las veces que quieras, en staging o
--    en producción, sin riesgo. Correlo en Supabase → SQL Editor.
--
-- POR QUÉ NO SE TOCA NADA TODAVÍA
-- Las filas sin nombre son de un import viejo con columnas corridas. Entre
-- ellas hay basura, duplicados Y gente real. Borrar a ciegas le termina
-- dando de baja el monotributo a alguien que existe. Este script sólo
-- clasifica; la decisión se toma después con los resultados a la vista.
--
-- LOS TRES DESTINOS QUE PIDE EL DOC (§12)
--   (a) DUPLICADO    → el N° ya tiene OTRO registro de monotributo con nombre
--                      real → el sin-nombre se elimina (fusionando pagos).
--   (b) PERSONA REAL → el N° existe en Legajos y no hay otro registro de
--                      monotributo → hay que COMPLETAR el nombre desde el
--                      legajo. NO eliminar: es gente de verdad.
--   (c) HUÉRFANO     → el N° no existe en Legajos → basura de import.
--
-- ⚠ OJO CON LOS TIPOS (esto ya rompió cosas antes):
--    legajos.nro         es INTEGER
--    monotributos.nro_socio es TEXT
--    mono_pagos_mes.nro_socio es TEXT (y a veces trae basura no numérica)
--   Por eso todas las comparaciones de abajo castean a TEXT explícitamente.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 0-A) ¿QUÉ ESQUEMA EXISTE DE VERDAD?
--     Corré esto PRIMERO, en la misma pegada. Contesta una pregunta que viene
--     abierta: v092 y v117 (que crean mono_tablas) nunca se corrieron en
--     producción — ya se descubrió al aplicar v183. Si mono_tablas no aparece
--     acá, "Importar tabla" va a fallar con "relation does not exist" y hace
--     falta una migración tipo v183 que la cree si falta, en vez de asumir.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    t.table_name,
    (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=t.table_name) AS columnas,
    CASE t.table_name
        WHEN 'mono_vencimientos' THEN 'v182 (vencimiento del mes)'
        WHEN 'mono_casos_import' THEN 'v092/v183 (casos del import)'
        WHEN 'mono_tablas'       THEN 'v092/v117 (tablas ARCA/ARBA/AGIP)'
        WHEN 'mono_pagos_mes'    THEN 'tabla principal de Pago mensual'
        ELSE ''
    END AS de_que_migracion
FROM information_schema.tables t
WHERE t.table_schema='public' AND t.table_name LIKE 'mono%'
ORDER BY t.table_name;

-- Las columnas que agregado v181/v182 — si no están, esas features no persisten.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND ( (table_name='mono_pagos_mes' AND column_name IN ('excluido_mes','excluido_motivo','descartado'))
     OR (table_name='monotributos'  AND column_name IN ('condicion','iibb_aporta')) )
ORDER BY table_name, column_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- 0-B) SANITY CHECK — qué hay hoy, antes de clasificar nada
--     Si esto devuelve 0 filas en 'sin_nombre_ligeras', el problema ya no está
--     y no hay nada que conciliar.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    periodo,
    count(*)                                                          AS filas,
    count(*) FILTER (
        WHERE nombre IS NULL
           OR btrim(nombre) = ''
           OR btrim(nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'   -- '5486', '113 (B)'
    )                                                                  AS sin_nombre_ligeras
FROM public.mono_pagos_mes
GROUP BY periodo
ORDER BY periodo;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CLASIFICACIÓN de cada fila sospechosa  ← el resultado que importa
--
-- Devuelve una fila por cada pago sin nombre, con la columna `destino` ya
-- resuelta en (a) / (b) / (c), más `nombre_real_para_completar` (el nombre que
-- habría que poner si es caso b) y `cuit_del_legajo` para verificar a mano.
-- ─────────────────────────────────────────────────────────────────────────────
WITH sospechoso AS (
    SELECT p.*
    FROM public.mono_pagos_mes p
    WHERE p.nombre IS NULL
       OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
),
-- N° de socio "limpio": sólo dígitos, para poder castear contra legajos.nro
norm AS (
    SELECT s.*,
           nullif(regexp_replace(btrim(s.nro_socio), '\D', '', 'g'), '') AS nro_limpio
    FROM sospechoso s
)
SELECT
    n.periodo,
    n.nro_socio              AS nro_en_la_fila,
    n.nro_limpio,
    n.nombre                 AS nombre_en_la_fila,
    n.total,
    n.pagado,
    l.nombre                 AS nombre_del_legajo,
    l.cuit                   AS cuit_del_legajo,
    l.estado                 AS estado_legajo,
    m.nombre                 AS otro_mono_con_nombre,
    m.cuit                   AS cuit_mono,
    CASE
        -- (a) el N° ya tiene otro registro de monotributo CON nombre real
        WHEN m.nro_socio IS NOT NULL
             AND m.nombre IS NOT NULL
             AND btrim(m.nombre) <> ''
             AND NOT (btrim(m.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$')
            THEN '(a) DUPLICADO — eliminar el sin-nombre'
        -- (b) el N° existe en Legajos y no hay otro registro de monotributo
        WHEN l.nro IS NOT NULL THEN '(b) PERSONA REAL — completar nombre desde Legajos'
        -- (c) no está en Legajos
        ELSE '(c) HUÉRFANO — basura de import'
    END                      AS destino,
    -- Si el nombre de la fila NO es un número, es un nombre de verdad: hay que
    -- revisarlo a mano igual, no aplicar (a)/(b)/(c) a ciegas.
    CASE
        WHEN n.nombre IS NOT NULL
             AND btrim(n.nombre) <> ''
             AND NOT (btrim(n.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$')
            THEN 'OJO: la fila SÍ tiene nombre — revisar a mano'
        ELSE 'sin nombre real'
    END                      AS aviso_nombre
FROM norm n
LEFT JOIN public.legajos       l ON l.nro::text = n.nro_limpio
LEFT JOIN public.monotributos m ON m.nro_socio = n.nro_socio
ORDER BY n.periodo, n.nro_socio NULLS FIRST;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RESUMEN — cuántos hay de cada tipo, para decidir si vale la pena
-- ─────────────────────────────────────────────────────────────────────────────
WITH sospechoso AS (
    SELECT p.* FROM public.mono_pagos_mes p
    WHERE p.nombre IS NULL
       OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
),
norm AS (
    SELECT s.*, nullif(regexp_replace(btrim(s.nro_socio), '\D', '', 'g'), '') AS nro_limpio
    FROM sospechoso s
)
SELECT
    CASE
        WHEN m.nro_socio IS NOT NULL
             AND m.nombre IS NOT NULL AND btrim(m.nombre) <> ''
             AND NOT (btrim(m.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$')
            THEN '(a) DUPLICADO'
        WHEN l.nro IS NOT NULL THEN '(b) PERSONA REAL'
        ELSE '(c) HUÉRFANO'
    END              AS destino,
    count(*)         AS filas,
    count(*) FILTER (WHERE pagado) AS ya_pagadas
FROM norm n
LEFT JOIN public.legajos       l ON l.nro::text = n.nro_limpio
LEFT JOIN public.monotributos m ON m.nro_socio = n.nro_socio
GROUP BY 1 ORDER BY 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) LOS CRUCES QUE NOMBRA EL DOC — 5578→5581, 5580→5581, 5583→5579
--    Esta es la huella del import con columnas corridas. Se listan aparte
--    para confirmar si existen hoy y si los dos "distintos" N° que apuntan al
--    mismo 5581 son la misma persona (duplicado) o dos personas distintas.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    p.periodo,
    p.nro_socio,
    p.nombre,
    p.total,
    p.pagado,
    l.nombre AS nombre_legajo_del_nro_de_la_fila
FROM public.mono_pagos_mes p
LEFT JOIN public.legajos l ON l.nro::text = regexp_replace(btrim(p.nro_socio), '\D', '', 'g')
WHERE regexp_replace(btrim(p.nro_socio), '\D', '', 'g') IN ('5578','5580','5583','5579','5581')
   OR p.nombre ~ '5578|5580|5583|5579|5581'
ORDER BY p.periodo, p.nro_socio;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ¿ALGUNA DE ESAS FILAS YA FUE PAGADA?
--    Crítico: si una de estas filas ya tiene pagado=true, alguien ya le pagó
--    una cuota a un fantasma o a un duplicado. Eso no se "concilia", se
--    reporta — hay que avisarle a Finanzas antes de tocar nada.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT periodo, nro_socio, nombre, total, pagado, pagado_en, metodo_pago
FROM public.mono_pagos_mes
WHERE (nombre IS NULL OR btrim(nombre) = ''
       OR btrim(nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$')
  AND pagado
ORDER BY periodo, nro_socio;


-- =============================================================================
-- FIN — NO HAY NINGÚN INSERT/UPDATE/DELETE EN TODO EL SCRIPT.
-- Cuando termines de revisar, pasame la salida de las consultas 1 y 2 y
-- decidimos el plan de conciliación antes de escribir una sola línea de SQL
-- que modifique datos.
-- =============================================================================

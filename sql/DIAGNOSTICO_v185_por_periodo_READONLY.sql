-- =============================================================================
-- DIAGNÓSTICO v185 — las 29 sospechosas, separadas por período
-- =============================================================================
-- Por qué: la investigación (INVESTIGACION_filas_sin_nombre_READONLY.sql §2)
-- cuenta las sospechosas de TODOS los períodos, y dio 29. La migración v185
-- filtra 2026-09 y 2026-10, y por eso sólo encuentra 23 y aborta con la
-- aserción. Faltan 6 filas que están en otros períodos.
--
-- Todo lo de abajo es SELECT. No hay un solo INSERT/UPDATE/DELETE.
-- Pasame la salida y con eso armo la migración correcta.
-- =============================================================================


-- ── A) ¿Qué períodos existen y cuántas filas sospechosas tiene cada uno? ────
-- Esto es lo primero: si los otros 6 están en un período ya cerrado, capaz no
-- hay que tocarlos. Si están en un período abierto, sí.
-- `excluido_mes` se lee con to_jsonb() a propósito: la columna la agrega v181.
-- Escrib-la directo y la consulta no corre en un schema viejo, que es
-- exactamente lo que pasó con el primer intento contra staging.
SELECT
    p.periodo,
    count(*)                                                          AS sospechosas,
    count(*) FILTER (WHERE p.pagado)                                  AS ya_pagadas,
    count(*) FILTER (WHERE (to_jsonb(p)->>'excluido_mes') = 'true')    AS ya_excluidas,
    count(DISTINCT p.nro_socio)                                       AS nros_distintos
FROM public.mono_pagos_mes p
WHERE p.nombre IS NULL
   OR btrim(p.nombre) = ''
   OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
GROUP BY p.periodo
ORDER BY p.periodo;


-- ── B) TODAS las sospechosas, una por fila, con el contexto que hace falta ─
-- rn         : dentro de (período, N°), cuál se conserva (la 1) y cuáles se
--              descartan (las demás). Es el mismo criterio que usa v185.
-- tiene_legajo: si el N° de la fila existe en legajos → es una persona real.
-- padron_nombre: lo que dice el Padrón. Si hay un nombre humano acá para un
--              N° que NO tiene legajo, hay que investigar ese Padrón antes de
--              tocar pagos (el caso de 4734).
SELECT
    p.periodo,
    p.nro_socio,
    p.nombre,
    p.total,
    p.pagado,
    coalesce(to_jsonb(p)->>'excluido_mes', '(sin columna)') AS excluido_mes,
    l.nombre                                    AS legajo_nombre,
    l.estado                                    AS legajo_estado,
    m.nombre                                    AS padron_nombre,
    row_number() OVER (
        PARTITION BY p.periodo, p.nro_socio
        ORDER BY p.id_local)                    AS rn,
    count(*) OVER (
        PARTITION BY p.periodo, p.nro_socio)    AS filas_del_mismo
FROM public.mono_pagos_mes p
LEFT JOIN public.legajos l
       ON l.nro::text = nullif(regexp_replace(btrim(p.nro_socio), '\D', '', 'g'), '')
LEFT JOIN (
        SELECT DISTINCT ON (nro_socio) nro_socio, nombre
        FROM public.monotributos
        ORDER BY nro_socio, coalesce(updated_at, '0001-01-01') DESC, id_local
     ) m ON m.nro_socio = p.nro_socio
WHERE p.nombre IS NULL
   OR btrim(p.nombre) = ''
   OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
ORDER BY p.periodo, p.nro_socio, p.id_local;


-- ── C) Los N° sin legajo que SÍ aparecen en el Padrón ─────────────────────
-- Ojo con esto: un N° sin legajo pero con nombre humano en el Padrón puede ser
-- un alta a medio camino o un N° mal cargado. Si 4734 aparece acá con un nombre
-- real, no es un fantasma y la migración NO lo puede descartar sola.
--
-- El GROUP BY va adentro del subquery, que ya trae una fila por N°. Por fuera
-- no se puede volver a agrupar: `periodos` es un string_agg, no una columna.
SELECT
    n.nro_socio,
    n.periodos,
    n.filas_sospechosas,
    m.nombre                       AS padron_nombre,
    m.categoria,
    m.condicion,
    m.estado
FROM (
    SELECT p.nro_socio,
           string_agg(DISTINCT p.periodo, ' | ') AS periodos,
           count(*) AS filas_sospechosas
    FROM public.mono_pagos_mes p
    WHERE p.nombre IS NULL
       OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
    GROUP BY p.nro_socio
) n
LEFT JOIN public.legajos l
       ON l.nro::text = nullif(regexp_replace(btrim(n.nro_socio), '\D', '', 'g'), '')
LEFT JOIN (
        SELECT DISTINCT ON (nro_socio) nro_socio, nombre, categoria, condicion, estado
        FROM public.monotributos
        ORDER BY nro_socio, coalesce(updated_at, '0001-01-01') DESC, id_local
     ) m ON m.nro_socio = n.nro_socio
WHERE l.nro IS NULL
ORDER BY n.nro_socio;


-- ── D) ¿Hay duplicados de legajos por N°? ─────────────────────────────────
-- La migración usa DISTINCT ON (nro) para no multiplicar filas. Si acá salen
-- N° repetidos, el DISTINCT está eligiendo uno al azar y hay que saber cuál.
SELECT nro, count(*) AS filas, string_agg(DISTINCT nombre, ' | ') AS nombres
FROM public.legajos
GROUP BY nro
HAVING count(*) > 1
ORDER BY nro;


-- =============================================================================
-- FIN — solo SELECT. Pasame la salida de A, B, C y D.
-- =============================================================================
-- =============================================================================
-- PREVISUALIZACIÓN de v185 — qué haría, sin escribir nada
-- =============================================================================
-- Calcula la decisión de v185 con las MISMAS reglas que aplica la migración y
-- la muestra. Acá no se toca ni una fila: es un SELECT. Sirve para ver el
-- resultado ANTES de correr la migración, y para comprobar después que quedó
-- igual.
--
-- Reglas (idénticas a sql/v185_mono_conciliacion_filas_import.sql):
--   - una fila es sospechosa si su `nombre` no es un nombre (vacío, número
--     como "5578" o "113 (B)", o placeholder)
--   - dentro de cada (período, N° de socio) se conserva la de menor id_local
--     y se excluyen las demás
--   - si el N° no existe en legajos, se excluye TODAS: sin legajo no hay
--     forma de saber a quién corresponde el importe
--   - si tiene legajo y es la que se conserva, se le escribe el nombre real
-- =============================================================================


-- ── 1) Las 29, una por fila, con su decisión ──────────────────────────────
WITH sozpechosas AS (
    SELECT p.id_local,
           p.periodo,
           p.nro_socio,
           p.nombre        AS nombre_actual,
           p.total,
           coalesce(to_jsonb(p)->>'pagado','NULL') AS pagado,
           coalesce(to_jsonb(p)->>'excluido_mes', 'NULL') AS excluido_ahora,
           l.nombre        AS nombre_legajo,
           l.estado        AS legajo_estado,
           row_number() OVER (
               PARTITION BY p.periodo, p.nro_socio
               ORDER BY p.id_local) AS rn
    FROM public.mono_pagos_mes p
    LEFT JOIN (
        SELECT DISTINCT ON (nro) nro, nombre, estado
        FROM public.legajos
        ORDER BY nro, (upper(coalesce(estado,'')) = 'ACTIVO') DESC, id_local
    ) l ON l.nro::text = p.nro_socio
    WHERE p.nombre IS NULL
       OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
)
SELECT periodo,
       nro_socio,
       rn,
       nombre_actual,
       CASE
           WHEN rn = 1 AND nombre_legajo IS NOT NULL THEN 'CONSERVAR'
           ELSE 'EXCLUIR'
       END AS decision,
       CASE
           WHEN rn = 1 AND nombre_legajo IS NOT NULL
               THEN 'queda con: ' || nombre_legajo || ' (' || coalesce(legajo_estado,'?') || ')'
           WHEN nombre_legajo IS NULL
               THEN 'Sin legajo: N° ' || nro_socio || ' no existe en legajos'
           ELSE 'Duplicado: esta persona ya tiene su fila del período'
       END AS motivo,
       total,
       pagado,
       excluido_ahora
FROM sozpechosas
ORDER BY periodo, nro_socio, rn;


-- ── 2) Resumen: tiene que dar 29 en total ─────────────────────────────────
-- Si el total NO es 29, la migración va a abortar (es a propósito: la
-- investigación de referencia dio 29 y si cambió, hay que mirarlo antes).
WITH sozpechosas AS (
    SELECT p.periodo, p.nro_socio,
           coalesce(to_jsonb(p)->>'pagado', 'false') AS pagado,
           l.nro IS NOT NULL AS tiene_legajo,
           row_number() OVER (
               PARTITION BY p.periodo, p.nro_socio
               ORDER BY p.id_local) AS rn
    FROM public.mono_pagos_mes p
    LEFT JOIN (
        SELECT DISTINCT ON (nro) nro FROM public.legajos
        ORDER BY nro, (upper(coalesce(estado,'')) = 'ACTIVO') DESC, id_local
    ) l ON l.nro::text = p.nro_socio
    WHERE p.nombre IS NULL
       OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
)
SELECT count(*)::int                                          AS total_sospechosas,
       count(*) FILTER (WHERE rn = 1 AND tiene_legajo)::int   AS a_conservar,
       count(*) FILTER (WHERE NOT tiene_legajo)::int          AS sin_legajo,
       count(*) FILTER (WHERE rn > 1)::int                    AS duplicados,
       count(*) FILTER (WHERE pagado = 'true')::int           AS ya_pagadas
FROM sozpechosas;


-- ── 3) Lo que queda visible después, por período ─────────────────────────
-- Sirve para comparar con lo que vas a ver en la app y confirmar que el KPI
-- del mes baja por la cantidad排除 correcta.
WITH sozpechosas AS (
    SELECT p.id_local, p.periodo, p.nro_socio, l.nombre AS nombre_legajo,
           row_number() OVER (
               PARTITION BY p.periodo, p.nro_socio
               ORDER BY p.id_local) AS rn
    FROM public.mono_pagos_mes p
    LEFT JOIN (
        SELECT DISTINCT ON (nro) nro, nombre FROM public.legajos
        ORDER BY nro, (upper(coalesce(estado,'')) = 'ACTIVO') DESC, id_local
    ) l ON l.nro::text = p.nro_socio
    WHERE p.nombre IS NULL
       OR btrim(p.nombre) = ''
       OR btrim(p.nombre) ~ '^\(?\d+\)?\s*(\([A-Za-zÁ-Úá-ú]\))?\s*$'
)
SELECT periodo,
       count(*) FILTER (WHERE rn = 1 AND nombre_legajo IS NOT NULL)::int AS quedan_visibles,
       count(*) FILTER (WHERE rn <> 1 OR nombre_legajo IS NULL)::int  AS quedan_excluidas
FROM sozpechosas
GROUP BY periodo
ORDER BY periodo;


-- =============================================================================
-- FIN — los tres son SELECT. No se escribe nada.
-- =============================================================================
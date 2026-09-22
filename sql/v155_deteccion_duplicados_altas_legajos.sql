-- v155: detección de "Pendiente de alta" que ya tiene legajo (caso real
-- "Luque Balmaceda", 22/09) + fix puntual de ese caso, para revisión manual.
--
-- NO SE EJECUTA SOLO. El PASO 1 es de solo lectura: corrida para ver qué hay.
-- El PASO 2 (destructivo — en este caso un UPDATE, no un DELETE) queda
-- comentado a propósito: revisar la lista del PASO 1 antes de descomentarlo
-- y correrlo.
--
-- Causa raíz (código real, no un DELETE indebido): cat_alt_pendientes se
-- marca 'Alta completada' SOLO en confirmarAlta() (src/modules/altas/
-- altas.js), el flujo normal Candidatos → ... → Altas. El importador masivo
-- de CSV de Legajos (src/modules/legajos/importador.js, "Importar desde
-- CSV") es un camino TOTALMENTE aparte para traspaso de datos de gente que
-- ya trabaja: no tocaba cat_alt_pendientes ni sabía que existía. Si una
-- persona estaba a mitad del flujo normal (candidato → psico → ... →
-- "Pendiente de alta") y el mismo asociado entraba también por el CSV, la
-- fila de Altas quedaba pendiente para siempre — y si además el DNI estaba
-- tipeado distinto en cada lado (pasó acá: 36381955 vs 31979724), el guard
-- de DNI de confirmarAlta() tampoco lo veía, así que terminar esa alta a
-- mano habría creado un SEGUNDO legajo (otro N° de socio, otro DNI) para la
-- misma persona real.
--
-- Fix de código (ya aplicado, ver commit): el importador de CSV ahora cruza
-- cada fila contra cat_alt_pendientes por DNI y por nombre normalizado
-- (nombreClaveComparacion, src/shared/helpers.js — ignora acentos, mayús/
-- minús y orden apellido/nombre) antes de importar, avisa en el preview, y
-- al importar marca esa alta pendiente como completada. confirmarAlta()
-- ahora también avisa (con confirm(), no bloquea) si el nombre se parece al
-- de un legajo activo con OTRO DNI. Y el botón de Confirmar Alta se
-- deshabilita mientras procesa (doble click ya no dispara una segunda
-- petición). Esto es la limpieza de lo que ya quedó mal ANTES del fix.

-- =====================================================================
-- PASO 1 — DETECCIÓN (solo lectura). Toda fila de cat_alt_pendientes en
-- 'Pendiente de alta' cuyo nombre normalizado coincide con un legajo ya
-- existente. El caso real es el primero de la lista.
--
-- Normalización aproximada en SQL (sin extensión unaccent, no confirmada en
-- esta base): minúsculas + separar en palabras + ordenarlas. Detecta el
-- caso real (orden apellido/nombre invertido, tabs) pero NO ignora acentos
-- — un "José" vs "Jose" no matchea acá aunque sí lo haga nombreClaveComparacion
-- en el frontend. Es una ayuda para revisar, no una fuente de verdad 1:1.
-- =====================================================================
WITH clave AS (
  SELECT id_local, nombre,
         array_to_string(
           array(SELECT unnest(regexp_split_to_array(lower(nombre), '[^a-z]+')) x WHERE x <> '' ORDER BY x),
           ' '
         ) AS k
  FROM public.cat_alt_pendientes
  WHERE estado = 'Pendiente de alta'
), clave_legajo AS (
  SELECT nro, nombre, dni, estado,
         array_to_string(
           array(SELECT unnest(regexp_split_to_array(lower(nombre), '[^a-z]+')) x WHERE x <> '' ORDER BY x),
           ' '
         ) AS k
  FROM public.legajos
)
SELECT
  c.id_local  AS cat_alt_pendientes_id_local,
  c.nombre    AS nombre_en_altas,
  l.nro       AS legajo_nro,
  l.nombre    AS nombre_en_legajo,
  l.dni       AS dni_en_legajo,
  l.estado    AS estado_legajo
FROM clave c
JOIN clave_legajo l ON l.k = c.k
ORDER BY c.nombre;

-- Caso puntual confirmado (Luque Balmaceda): DNI de Altas 36381955 (candidato/
-- cat_alt_pendientes id_local 856894910) vs DNI del legajo 31979724 (N° 5582,
-- creado 21/09 por el importador de CSV) — mismo nombre, DNI distinto.
-- SELECT * FROM public.cat_alt_pendientes WHERE id_local = '856894910';
-- SELECT * FROM public.legajos WHERE nro = 5582;

-- =====================================================================
-- PASO 2 — FIX del caso puntual (Luque Balmaceda). Descomentar y correr
-- SOLO después de confirmar con el PASO 1 que sigue así. No es un DELETE:
-- solo marca la alta pendiente como resuelta (reversible: UPDATE de vuelta
-- a 'Pendiente de alta' si hiciera falta).
-- =====================================================================
-- UPDATE public.cat_alt_pendientes
--    SET estado = 'Alta completada',
--        operativo = coalesce(operativo, '{}'::jsonb)
--                     || jsonb_build_object('notaImportacion',
--                        'Completada a mano (v155) — ya existía como legajo N° 5582, DNI 31979724')
--  WHERE id_local = '856894910' AND estado = 'Pendiente de alta';

-- Verificación tras el paso 2: debe devolver 0 filas.
-- SELECT id_local, estado FROM public.cat_alt_pendientes WHERE id_local = '856894910';

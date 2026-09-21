-- v154: limpieza de registros de PRUEBA / duplicados de la carga masiva de asociados.
--
-- NO SE EJECUTA SOLO: correr en el SQL Editor de Supabase en DOS pasos.
--   PASO 1  (solo lectura): la consulta de verificación. Revisar que los
--           números coincidan con los "esperados" de abajo.
--   PASO 2  (destructivo, transaccional): el bloque BEGIN..COMMIT. Si alguna
--           guarda falla, TODO se revierte y no queda nada a medias.
--
-- Hallazgo que define el alcance (verificado contra la base el 21/09/2026):
-- 5 de los 10 DNI YA TIENEN LEGAJO ACTIVO (alta hecha por otra vía) y les quedó
-- la cadena de ingreso como "Pendiente de alta". El legajo es el registro
-- legítimo: en el GRUPO B se borra SOLO la cadena sobrante (evita un doble
-- alta) y NO se toca legajos ni adjuntos (los adjuntos se leen por DNI y
-- alimentan la pestaña Adjuntos del legajo).
--
--   GRUPO A — sin legajo (prueba/proceso sin alta): cadena de ingreso completa
--     borrada + adjuntos marcados borrado=true (soft, reversible; los archivos
--     quedan en Storage).
--       35888777 Prueba Adjuntos Carlos     22992922 Jorge Haosls
--       43239425 Mora Fernando              39207243 Bilbao Rocio Silvia
--       34596769 Vecchio Marcos Gian
--   GRUPO B — con legajo Activo: SOLO cadena de ingreso.
--       43571967 Elicabe (legajo 4736)      30992164 Alonso Gisela (5570)
--       44421437 Lezcano Esteban (5575)     48093486 Cepeda Axel (5576)
--       37939400 Diaz Daniela Candelaria (5579, creado 21/09; DNI confirmado)
--
-- Cadena = turnos, documentacion_ingreso, preocupacionales, psicos,
-- cat_alt_pendientes, candidatos. No hay claves foráneas reales entre ellas
-- (se relacionan por dni y por candidato_id), así que no hay cascada: el
-- orden de abajo va de hijos a padres.
-- Ojo: psicos.candidato_id de Carlos tiene 13 dígitos (1782393165104) y no el
-- id_local de 9 de candidatos — por eso se borra por DNI Y por candidato_id
-- (en psicos, cat_alt_pendientes y turnos, donde candidato_id es text). En
-- documentacion_ingreso y preocupacionales candidato_id es BIGINT (pierde los
-- ceros a la izquierda del id_local), así que ahí se borra solo por DNI: todas
-- sus filas tienen DNI cargado (verificado).

-- =====================================================================
-- PASO 1 — VERIFICACIÓN (solo lectura). Un renglón por tabla y grupo.
-- ESPERADO (grupo A / grupo B):
--   candidatos 5/5 · psicos 5/5 · preocupacionales 5/5 · documentacion_ingreso 5/6
--   cat_alt_pendientes 8/6 · turnos 3/5 · adjuntos vigentes 16/(22, no se tocan)
--   legajos 0/5  <- el grupo A DEBE dar 0 y el B DEBE dar 5
-- =====================================================================
WITH lote(dni, grupo, nombre) AS (VALUES
  ('35888777','A','Prueba Adjuntos Carlos'), ('22992922','A','Jorge Haosls'),
  ('43239425','A','Mora Fernando'),         ('39207243','A','Bilbao Rocio Silvia'),
  ('34596769','A','Vecchio Marcos Gian'),
  ('43571967','B','Elicabe Lautaro'),       ('30992164','B','Alonso Gisela Mercedes'),
  ('44421437','B','Lezcano Esteban German'),('48093486','B','Cepeda Axel Fernando'),
  ('37939400','B','Diaz Daniela Candelaria')
), ids AS (
  SELECT l.grupo, c.id_local AS cid FROM lote l JOIN public.candidatos c ON btrim(c.dni) = l.dni
  UNION
  SELECT l.grupo, p.candidato_id FROM lote l JOIN public.psicos p ON btrim(p.dni) = l.dni WHERE p.candidato_id IS NOT NULL
)
SELECT 'candidatos' AS tabla, l.grupo, count(*) AS filas FROM lote l JOIN public.candidatos t ON btrim(t.dni)=l.dni GROUP BY l.grupo
UNION ALL SELECT 'psicos', l.grupo, count(*) FROM lote l JOIN public.psicos t ON btrim(t.dni)=l.dni GROUP BY l.grupo
UNION ALL SELECT 'preocupacionales', l.grupo, count(*) FROM lote l JOIN public.preocupacionales t ON btrim(t.dni)=l.dni GROUP BY l.grupo
UNION ALL SELECT 'documentacion_ingreso', l.grupo, count(*) FROM lote l JOIN public.documentacion_ingreso t ON btrim(t.dni)=l.dni GROUP BY l.grupo
UNION ALL SELECT 'cat_alt_pendientes', l.grupo, count(*) FROM lote l JOIN public.cat_alt_pendientes t ON btrim(t.dni)=l.dni GROUP BY l.grupo
UNION ALL SELECT 'turnos', i.grupo, count(*) FROM ids i JOIN public.turnos t ON t.candidato_id = i.cid GROUP BY i.grupo
UNION ALL SELECT 'adjuntos (vigentes, no borrados)', l.grupo, count(*) FROM lote l JOIN public.adjuntos t ON btrim(t.dni)=l.dni WHERE t.borrado = false GROUP BY l.grupo
UNION ALL SELECT 'legajos  (A debe ser 0 · B debe ser 5)', l.grupo, count(*) FROM lote l JOIN public.legajos t ON btrim(t.dni)=l.dni GROUP BY l.grupo
ORDER BY 1, 2;

-- Detalle fila por fila de lo que se va a borrar de la cadena (para leerlo con ojos):
-- SELECT 'candidatos' t, id_local, dni, apellido||' '||nombre AS nombre, estado FROM public.candidatos WHERE btrim(dni) IN ('35888777','22992922','43239425','39207243','34596769','43571967','30992164','44421437','48093486','37939400')
-- UNION ALL SELECT 'cat_alt_pendientes', id_local, dni, nombre, estado FROM public.cat_alt_pendientes WHERE btrim(dni) IN ('35888777','22992922','43239425','39207243','34596769','43571967','30992164','44421437','48093486','37939400')
-- ORDER BY dni, 1;

-- =====================================================================
-- PASO 2 — LIMPIEZA (destructivo). Correr SOLO tras revisar el PASO 1.
-- =====================================================================
BEGIN;

DO $$
DECLARE
  dnis_a  text[] := ARRAY['35888777','22992922','43239425','39207243','34596769'];
  dnis_b  text[] := ARRAY['43571967','30992164','44421437','48093486','37939400'];
  todos   text[];
  cids    text[];
  leg_a   int;
  leg_b_antes int;
  leg_b_despues int;
  n int;
BEGIN
  todos := dnis_a || dnis_b;

  -- GUARDA 1: el grupo A no debe tener legajo (si lo tuviera, alguien se
  -- dio de alta después del análisis: no borrar nada).
  SELECT count(*) INTO leg_a FROM public.legajos WHERE btrim(dni) = ANY(dnis_a);
  IF leg_a <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: % DNI del grupo A ya tienen legajo; revisar antes de borrar', leg_a;
  END IF;

  -- GUARDA 2: el grupo B debe tener exactamente sus 5 legajos activos.
  SELECT count(*) INTO leg_b_antes FROM public.legajos WHERE btrim(dni) = ANY(dnis_b) AND estado = 'Activo';
  IF leg_b_antes <> 5 THEN
    RAISE EXCEPTION 'ABORTADO: se esperaban 5 legajos activos en el grupo B y hay %', leg_b_antes;
  END IF;

  -- ids de candidato involucrados (id_local de candidatos + candidato_id de psicos).
  SELECT array_agg(DISTINCT x) INTO cids FROM (
    SELECT id_local AS x FROM public.candidatos WHERE btrim(dni) = ANY(todos)
    UNION SELECT candidato_id FROM public.psicos WHERE btrim(dni) = ANY(todos) AND candidato_id IS NOT NULL
  ) s;

  -- Cadena de ingreso, de hijos a padres.
  DELETE FROM public.turnos WHERE candidato_id = ANY(cids);
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'turnos borrados: %', n;
  DELETE FROM public.documentacion_ingreso WHERE btrim(dni) = ANY(todos);   -- candidato_id es bigint: solo por DNI
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'documentacion_ingreso borradas: %', n;
  DELETE FROM public.preocupacionales WHERE btrim(dni) = ANY(todos);   -- candidato_id es bigint: solo por DNI
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'preocupacionales borradas: %', n;
  DELETE FROM public.psicos WHERE btrim(dni) = ANY(todos) OR candidato_id = ANY(cids);
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'psicos borrados: %', n;
  DELETE FROM public.cat_alt_pendientes WHERE btrim(dni) = ANY(todos) OR candidato_id = ANY(cids);
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'cat_alt_pendientes borradas: %', n;
  DELETE FROM public.candidatos WHERE btrim(dni) = ANY(todos);
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'candidatos borrados: %', n;

  -- Adjuntos: SOLO grupo A, soft delete (como hace el sistema). El grupo B
  -- conserva los suyos: son los documentos de un asociado real.
  UPDATE public.adjuntos
     SET borrado = true, borrado_por_nombre = 'Limpieza v154', borrado_en = now()
   WHERE btrim(dni) = ANY(dnis_a) AND borrado = false;
    GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'adjuntos marcados borrados (grupo A): %', n;

  -- GUARDA 3: los legajos del grupo B siguen intactos.
  SELECT count(*) INTO leg_b_despues FROM public.legajos WHERE btrim(dni) = ANY(dnis_b) AND estado = 'Activo';
  IF leg_b_despues <> leg_b_antes THEN
    RAISE EXCEPTION 'ABORTADO: cambió la cantidad de legajos del grupo B (% -> %)', leg_b_antes, leg_b_despues;
  END IF;
END $$;

COMMIT;   -- si quedó algo raro en las notas de arriba, cambiar por ROLLBACK;

-- =====================================================================
-- PASO 3 — VERIFICACIÓN POSTERIOR: volver a correr la consulta del PASO 1.
-- ESPERADO: candidatos/psicos/preocupacionales/documentacion_ingreso/
-- cat_alt_pendientes/turnos = sin filas; adjuntos vigentes grupo A = sin
-- filas; legajos: solo grupo B con 5.
--
-- Para DESHACER el soft delete de adjuntos (los archivos siguen en Storage):
--   UPDATE public.adjuntos SET borrado=false, borrado_por_nombre=NULL, borrado_en=NULL
--    WHERE borrado_por_nombre='Limpieza v154';
-- La cadena borrada (candidatos, psicos, etc.) NO es recuperable: hacer un
-- backup de esas tablas antes si se quiere red de seguridad.
-- =====================================================================

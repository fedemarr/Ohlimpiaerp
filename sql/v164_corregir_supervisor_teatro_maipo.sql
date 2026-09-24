-- v164: corrige el nombre de supervisor incompleto en el objetivo
-- "Teatro Maipo" (ticket "Módulo servicios", 24/09/2026).
--
-- Confirmado en producción: de 30 objetivos con Alvaro Jesus Uballes
-- como supervisor, 29 ya tienen el nombre completo y correcto
-- ("Alvaro Jesus Uballes" — mismo valor que el catálogo
-- supervisores_config). Solo Teatro Maipo (id_local 997372827) quedó
-- con "Uballes Alvaro" — se asignó vía el selector de
-- legacy.js:abrirAsignarSupervisor(), que lee legajosSupervisoresActivos()
-- (DB.legajos, no supervisores_config), y el legajo real de Alvaro
-- tiene el nombre incompleto ahí (causa raíz, corrección de legajos
-- pendiente por separado — no se toca acá para no mezclar).
BEGIN;

-- Verificación antes de aplicar (debe mostrar 'Uballes Alvaro'):
--   select id_local, codigo, nombre, supervisor_asignado from public.objetivos where id_local = '997372827';

UPDATE public.objetivos
SET supervisor_asignado = 'Alvaro Jesus Uballes', updated_at = now()
WHERE id_local = '997372827' AND supervisor_asignado = 'Uballes Alvaro';

COMMIT;

-- Verificación después de aplicar (debe mostrar 'Alvaro Jesus Uballes'):
--   select id_local, codigo, nombre, supervisor_asignado from public.objetivos where id_local = '997372827';

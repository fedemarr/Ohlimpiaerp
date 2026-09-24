-- v165: completa el nombre incompleto del legajo del supervisor Alvaro
-- Jesus Uballes (ticket "Módulo servicios", 24/09/2026).
--
-- Causa raíz confirmada: el legajo nro 521 (dni 14151501, funcion
-- SUPERVISOR) tiene nombre = 'Uballes Alvaro' (falta 'Jesus'). Es el
-- legajo que lee legajosSupervisoresActivos() (legacy.js:2642-2643) para
-- poblar el selector "Asignar/Cambiar supervisor" en Servicios — de ahí
-- salió el nombre incompleto que terminó copiado en objetivos.Teatro
-- Maipo (corregido en sql/v164).
--
-- El nombre completo correcto ("Alvaro Jesus Uballes") está corroborado
-- de forma independiente por 3 fuentes: supervisores_config
-- (id_local sup_alvaro_uballes), la lista puente servicios_supervisor
-- (30 registros) y 29 de 30 objetivos.supervisor_asignado.
--
-- NOTA: existe OTRO legajo distinto (nro 1053, dni 32575216, función
-- "Aux. Ventas") con nombre "Uballes Alvaro Jesus" completo. No se toca
-- acá — no hay evidencia de que sea la misma persona que el supervisor
-- (DNI distinto), y mezclarlos requiere confirmación humana aparte.
BEGIN;

-- Verificación antes de aplicar (debe mostrar 'Uballes Alvaro'):
--   select id_local, nro, dni, nombre, funcion from public.legajos where id_local = '521';

UPDATE public.legajos
SET nombre = 'Uballes Alvaro Jesus', updated_at = now()
WHERE id_local = '521' AND dni = '14151501' AND nombre = 'Uballes Alvaro';

COMMIT;

-- Verificación después de aplicar (debe mostrar 'Uballes Alvaro Jesus'):
--   select id_local, nro, dni, nombre, funcion from public.legajos where id_local = '521';

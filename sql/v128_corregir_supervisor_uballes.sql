-- =============================================================================
-- Migración: v128 — Corregir supervisor "Alvaro Uballes" → "Alvaro Jesus Uballes"
-- Fecha:     2026-09-15
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (investigado antes de escribir esto — no es un simple typo)
-- --------
-- "Alvaro Uballes" y "Alvaro Jesus Uballes" son DOS PERSONAS REALES,
-- padre e hijo, cada uno con su propio usuario ya cargado correctamente:
--   - auballes@ohlimpia.com.ar  → "Alvaro Uballes" (padre) — hoy es de
--     Comercial (auxiliar de ventas), NO tiene servicios como supervisor.
--   - ajuballes@ohlimpia.com.ar → "Alvaro Jesus Uballes" (hijo) — es el
--     supervisor real de estos servicios.
-- Esto ya estaba relevado y documentado como "FIX pendiente" en
-- modulo ya echos/SUPERVISORES_y_SERVICIOS_para_Fede.md (02/09/2026).
-- NO se toca la tabla `usuarios` — las dos cuentas son correctas y
-- corresponden a personas distintas; lo que está mal es que varios
-- lugares del sistema tienen guardado el nombre del padre en filas que
-- en realidad son del hijo.
--
-- DIAGNÓSTICO (SELECTs corridos antes de escribir los UPDATE — ver
-- resultados completos en la conversación, resumen acá):
--   - objetivos.supervisor_asignado: YA estaba corregido a "Alvaro Jesus
--     Uballes" en 29 servicios — falta 1 variante con el nombre invertido
--     ("Uballes Alvaro") en GIMNASIO.HERAS.
--   - servicios_supervisor.supervisor: 34 filas con "Alvaro Uballes"
--     (tabla puente v067, todavía no corregida).
--   - supervisores_config.nombre: 1 fila "Alvaro Uballes" (catálogo de
--     comisión, v081). Se verificó que NO existe ya una fila
--     "Alvaro Jesus Uballes" en esta tabla (columna nombre es UNIQUE, así
--     que el UPDATE fallaría solo si hubiera un duplicado real).
--   - legajos.supervisor: 76 filas con "ALVARO UBALLES" (todo en
--     mayúsculas — variante de carga distinta a las demás).
--   - pedidos.supervisor: 4 filas con "Alvaro Uballes" (2 filas más ya
--     dicen "Alvaro Jesus Uballes" — no se tocan, ya están bien).
--   - pedidos_uniformes.supervisor_asignado: 1 fila con "Alvaro Uballes".
--   - reasignaciones (supervisor_origen/destino), casos_legales
--     (supervisor_al_alta), movimientos_puntos (supervisor_al_momento),
--     pedidos_adelantos/prestamos (supervisor_nombre), descansos
--     (supervisor_solicitante), objetivo_supervisores_historial: se
--     verificaron por REST, CERO filas con "Uballes" — no necesitan UPDATE.
--   - objetivos.supervisores_asignados (jsonb, multi-supervisor): vacío
--     en las 983 filas de la base — no necesita UPDATE.
--
-- Cada UPDATE de abajo apunta exactamente a la(s) variante(s) de
-- escritura confirmada(s) por SELECT — no se usa un reemplazo "a ciegas"
-- por substring para no tocar por error algo con un texto parecido.
-- Idempotente: si se corre dos veces, la segunda vez no encuentra filas
-- (el WHERE ya no matchea nada).
-- =============================================================================

BEGIN;

-- 1) Tabla puente servicios_supervisor (v067) — 34 filas esperadas.
UPDATE public.servicios_supervisor
   SET supervisor = 'Alvaro Jesus Uballes'
 WHERE supervisor = 'Alvaro Uballes';

-- 2) Catálogo de comisión por supervisor (v081) — 1 fila esperada.
UPDATE public.supervisores_config
   SET nombre = 'Alvaro Jesus Uballes'
 WHERE nombre = 'Alvaro Uballes';

-- 3) Legajos — supervisor del asociado (76 filas esperadas, variante en
--    MAYÚSCULAS).
UPDATE public.legajos
   SET supervisor = 'Alvaro Jesus Uballes'
 WHERE supervisor = 'ALVARO UBALLES';

-- 4) Pedidos de personal (4 filas esperadas).
UPDATE public.pedidos
   SET supervisor = 'Alvaro Jesus Uballes'
 WHERE supervisor = 'Alvaro Uballes';

-- 5) Pedidos de uniformes — supervisor asignado al pedido (1 fila esperada).
UPDATE public.pedidos_uniformes
   SET supervisor_asignado = 'Alvaro Jesus Uballes'
 WHERE supervisor_asignado = 'Alvaro Uballes';

-- 6) Objetivos (servicios) — la única variante que quedó sin corregir
--    ahí (nombre invertido, GIMNASIO.HERAS). El resto de objetivos ya
--    estaba bien.
UPDATE public.objetivos
   SET supervisor_asignado = 'Alvaro Jesus Uballes'
 WHERE supervisor_asignado = 'Uballes Alvaro';

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto (debería devolver 0 filas
-- cada una):
--
-- select count(*) from servicios_supervisor where supervisor = 'Alvaro Uballes';
-- select count(*) from supervisores_config where nombre = 'Alvaro Uballes';
-- select count(*) from legajos where supervisor = 'ALVARO UBALLES';
-- select count(*) from pedidos where supervisor = 'Alvaro Uballes';
-- select count(*) from pedidos_uniformes where supervisor_asignado = 'Alvaro Uballes';
-- select count(*) from objetivos where supervisor_asignado = 'Uballes Alvaro';
-- =============================================================================

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

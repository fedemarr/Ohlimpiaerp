-- v148: PRESTAMOS_bug_para_Fede.md (18/09) — "el préstamo de Carballo
-- Gisela ($400.000) queda PENDIENTE en Mis pedidos pero nunca llega a
-- Revisión RRHH".
--
-- CAUSA RAÍZ (confirmada contra la base real, no una hipótesis): la
-- tabla prestamos NUNCA tuvo las columnas "servicio" ni "cargado_por" —
-- v038_adelantos_prestamos.sql extendió la tabla con un ALTER largo
-- (supervisor_nombre, origen, periodo, fecha_pedido, monto_solicitado,
-- cuotas_solicitadas, etc.) pero se salteó esas dos. crearPedidoPrestamo()
-- (src/modules/adelantos_prestamos_shared/flujo.js) manda AMBOS campos
-- en TODO insert — Postgrest rechaza el upsert COMPLETO cuando eso pasa
-- ("column prestamos.servicio does not exist", confirmado por REST) y
-- _guardar() nunca miraba el resultado de supaSync(), así que el fallo
-- era mudo: el pedido sobrevivía solo en la memoria del navegador del
-- supervisor que lo cargó (por eso ÉL lo seguía viendo "Pendiente") y
-- jamás llegaba a existir para ninguna otra sesión — ni RRHH, ni
-- siquiera el propio supervisor si recargaba la página.
--
-- Verificado con la tabla real: SELECT * FROM prestamos devuelve 0
-- filas — ningún préstamo se guardó jamás desde que existe el flujo
-- v1.1 (todos los intentos, incluido el de Carballo Gisela, fallaron
-- en este mismo punto).
--
-- Este ALTER agrega las 2 columnas que faltaban. Es un agregado puro
-- (ADD COLUMN IF NOT EXISTS, nullable) — no toca ni borra nada
-- existente, cero riesgo de pérdida de datos.
BEGIN;

ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS servicio     text,
  ADD COLUMN IF NOT EXISTS cargado_por  text;

COMMIT;

-- Verificación sugerida después de correr: pedile a un supervisor que
-- cargue y eleve un préstamo de prueba, después:
-- SELECT id_local, nombre, servicio, cargado_por, estado FROM public.prestamos ORDER BY id_local DESC LIMIT 5;
-- Tiene que aparecer la fila con estado 'Enviada' y servicio/cargado_por
-- completos (antes de este fix, la fila directamente no existía).

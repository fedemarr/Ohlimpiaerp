-- v147: limpieza de pedidos de adelanto de prueba/desarrollador (ticket
-- "Limpieza de Pedidos Duplicados/Prueba y Fix de Aprobación en RRHH").
--
-- Verificado contra producción vía REST antes de escribir esto:
--   - id_local 309333326 / 309335865 — "Martinez Federico", $50, dos
--     copias (Aprobada + Enviada), legajo_id_local=146 — ESE LEGAJO NO
--     EXISTE en la tabla legajos. $50 y "Administrador" como
--     cargado_por/supervisor_nombre confirman que es una carga de
--     prueba del desarrollador, no un pedido real.
--   - id_local 311152246 / 311154441 — "Recalde Axel", $40.000, mismo
--     patrón (Aprobada + Enviada), legajo_id_local=148 — TAMPOCO EXISTE.
--   - id_local 311184254 — "Fernandez Manuela", $50.000, Aprobada RRHH,
--     legajo_id_local=151 — este legajo SÍ existe (Activo, servicio
--     CHANGO.BROWN) pero el pedido es el mencionado explícitamente en
--     el ticket como registro de prueba a limpiar.
--
-- Las copias "Enviada" de Martinez/Recalde son justo las que quedaban
-- TRABADAS en Revisión RRHH: abrirRevisionRRHH() cortaba en seco si no
-- encontraba el legajo (ver fix en
-- src/modules/gestion_adelantos/revision.js), así que ni siquiera se
-- podían rechazar desde la app. Con ese fix ya aplicado, technically
-- ahora SÍ se podrían rechazar a mano desde la UI — pero como las 3
-- personas son enteramente de prueba (no hay nada que auditar), se
-- limpian directo acá para no dejar 5 registros basura dando vueltas
-- por las pantallas de Finanzas/RRHH.
--
-- SOFT DELETE (anulado=true), no DELETE físico: todo el código de
-- pedidos_adelantos ya filtra por "!p.anulado" en cada lista (ver
-- pedidosEnRevision, todosLosPedidos, etc.), así que esto alcanza para
-- que desaparezcan de todas las pantallas — y es reversible con un
-- UPDATE inverso si hiciera falta, a diferencia de un DELETE.
--
-- Verificación sugerida ANTES de correr (para confirmar que sigue
-- siendo exactamente este universo y no se sumó nada nuevo):
--   SELECT id_local, legajo_id_local, nombre_asociado, monto, estado, cargado_por
--   FROM public.pedidos_adelantos
--   WHERE id_local IN ('309333326','309335865','311152246','311154441','311184254');

BEGIN;

UPDATE public.pedidos_adelantos
SET anulado = true, updated_at = now()
WHERE id_local IN ('309333326', '309335865', '311152246', '311154441', '311184254');

COMMIT;

-- Verificación sugerida DESPUÉS de correr — deben salir las 5 filas con anulado=true:
-- SELECT id_local, nombre_asociado, estado, anulado
-- FROM public.pedidos_adelantos
-- WHERE id_local IN ('309333326','309335865','311152246','311154441','311184254');

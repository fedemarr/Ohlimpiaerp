-- v169 — Pedido de productos: los PAGAN salen de la bandeja del auditor.
--
-- ============================ NOTA DE APLICACIÓN ============================
-- Aplicada a producción el 25/09/2026 15:27 (ART), con este resultado:
--   · los 7 pedidos quedaron en 'confirmado' con motivo_revision_snapshot
--     intacto;
--   · la bandeja quedó con los 2 NO PAGAN (Josimar Barracas, Josimar Lanús);
--   · se escribieron 7 eventos en pp_pedido_eventos.
--
-- La PRIMERA ejecución del INSERT filter por (servicio_codigo + estado) en vez
-- de por id_local, y por eso también le inventó un evento al pedido 1012-9986
-- (Hit Libertador 8614, $ 111.814), que ya estaba en 'confirmado' y nunca
-- pasó por la bandeja. El UPDATE no lo tocó —solo afecta a los que estaban en
-- 'confirmado_revision'—, así que el daño era únicamente el evento falso, que
-- se borró en el acto:
--   delete from pp_pedido_eventos
--    where ejecutado_por = 'Migración v169' and pedido_id_local = '1012-9986';
-- Por eso abajo el INSERT filtra por los 7 id_local exactos.
--
-- Consecuencia de esa corrección: los id_local de los eventos quedaron 0001,
-- 0002, 0004, 0005, 0006, 0007 y 0008 (falta el 0003, el que era falso). Es
-- normal, no lo compactes.
--
-- Correrla de nuevo NO hace nada: el guard inicial aborta con un mensaje claro
-- porque los 7 ya no están en 'confirmado_revision'. Es a propósito — si el
-- mundo cambió, alguien tiene que mirarlo a mano antes de seguir.
-- ==========================================================================
--
-- Ticket de Lautaro 25/09 (BANDEJA_AUDITOR_solo_no_pagan_para_Fede.md), código
-- en el commit 7bbabd5: "al auditor solo le importan los pedidos que NO se
-- facturan". Si el cliente factura los productos, el exceso lo paga el cliente
-- y no hay plata de la cooperativa que auditar, así que el pedido va directo a
-- Compras aunque exceda el 6%, tenga autorización o se haya confirmado fuera de
-- ventana.
--
-- El código ya arregla la regla (7bbabd5) para todo lo que se confirme de acá
-- en adelante. Esta migración limpia los pedidos que YA estaban trabados en la
-- bandeja con la regla anterior (caían los PAGAN con cualquier excepción).
--
-- Evidencia contra la base real al 25/09 (9 pedidos en la bandeja):
--   · 2 NO PAGAN  → se quedan donde están, es lo que el auditor tiene que ver.
--       6442-4239 JOSIMAR.BARRACAS   (10 ítems)
--       6960-7489 JOSIMAR.LANUS      (10 ítems)
--   · 7 PAGAN     → salen (todos "SE FACTURA"):
--       3938-8368 CONS.DELGADO        8 ítems  $  63.669  período 2026-10
--       3945-6412 EVENTO.HIT.ARGUIBEL  2 ítems  $ 180.712  período 2026-10
--       48343-950 HIT.ARGUIBEL         0 ítems  $       0  período 2026-09
--       3688-8136 HIT.LIBERTADOR.8614  0 ítems  $       0  período 2026-09
--       6461-3469 HIT.MAIPU            0 ítems  $       0  período 2026-09
--       7092-8835 HIT.TECNO            0 ítems  $       0  período 2026-09
--       7734-1798 HIT.VILO             0 ítems  $       0  período 2026-09
--
-- OJO con los 5 de Hit: no son pedidos reales. Tienen 0 ítems y $0 porque el
-- cierre del período 2026-09 (07/09 14:03:41) los confirmó 4 segundos antes de
-- cerrarse, sin que el supervisor hubiera cargado nada. Migrarlos a
-- 'confirmado' los saca de la bandeja (que es lo que pide el ticket) pero deja
-- 5 filas en $0 en Compras para un período ya cerrado. Si después se quiere
-- limpiar eso, es otra migración que los anula (pp_pedidos.anulado) — no va
-- acá porque cambiaría el conteo de pedidos de un período cerrado.
--
-- Efectos visibles en el drill-down de Períodos (commit bb7ccbd), esperables y
-- sin plata en juego:
--   · 2026-09 "Pendientes de auditoría": 5 → 0, y "Confirmados": 3 → 8. La
--     bandeja cuenta como CONFIRMADOS a confirmado|autorizado|en_compra|
--     entregado, así que los 5 vacíos se suman ahí, pero en $0.
--   · 2026-10 "Pendientes de auditoría": 4 → 2, y "Confirmados": 3 → 5. Los
--     que salen son Cons Delgado ($ 63.669) y Evento Hit Arguibel ($ 180.712).
--
-- Qué NO se toca:
--   · motivo_revision_snapshot: se conserva. Es el motivo por el que el pedido
--     CAÍA en la bandeja bajo la regla vieja, y "Resueltos" lo muestra como
--     columna. Borrarlo sería perder la historia de por qué se revisó.
--   · confirmado_por / confirmado_en: no se tocan. El pedido lo confirmó el
--     supervisor, no esta migración.
--   · auditado_*: no se tocan. Estos pedidos nunca fueron auditados
--     (auditado_en es NULL), así que NO van a aparecer en la tabla "Resueltos",
--     que filtra por ['autorizado','en_compra','entregado'] con auditadoEn. Van
--     a "Pasaron directo a Compras", que es su lugar.
--
-- Idempotente: el UPDATE exige estado='confirmado_revision' y el INSERT exige
-- que no exista ya el evento de esta migración para ese pedido. Correrlo dos
-- veces no tiene efecto. Y si el mundo ya cambió (alguien ya movió alguno, o
-- el pedido se anuló), el guard de abajo aborta en vez de migrar a medias.

BEGIN;

-- ---------------------------------------------------------------------------
-- Verificación previa (debe mostrar 7 filas, todas pef='SE FACTURA'):
--   select p.id_local, p.servicio_codigo, p.estado, c.productos_en_factura
--   from pp_pedidos p
--   left join objetivos o on o.codigo = p.servicio_codigo
--   left join clientes c on c.id_local = o.cliente_id_local
--   where p.estado = 'confirmado_revision' and not p.anulado
--     and c.productos_en_factura = 'SE FACTURA';
-- ---------------------------------------------------------------------------

-- Guard: los 7 tienen que estar exactamente como losfotografió el diagnóstico.
-- Si alguno ya no está en 'confirmado_revision' (o se anuló), el pedido cambió
-- de mundo desde que se escribió esta migración y hay que mirarlo a mano antes
-- de seguir. Cortar acá es mejor que migrar 6 de 7 en silencio.
DO $$
DECLARE
  v_ok integer;
  v_perdidos text;
BEGIN
  SELECT count(*) INTO v_ok
    FROM public.pp_pedidos
   WHERE id_local IN ('3938-8368', '3945-6412', '48343-950', '3688-8136',
                      '6461-3469', '7092-8835', '7734-1798')
     AND estado = 'confirmado_revision'
     AND NOT anulado;

  IF v_ok <> 7 THEN
    SELECT string_agg(id_local || ' (' || estado || ')', ', ')
      INTO v_perdidos
      FROM public.pp_pedidos
     WHERE id_local IN ('3938-8368', '3945-6412', '48343-950', '3688-8136',
                        '6461-3469', '7092-8835', '7734-1798')
       AND NOT (estado = 'confirmado_revision' AND NOT anulado);
    RAISE EXCEPTION
      'v169 abortada: se esperaban 7 pedidos PAGAN en ''confirmado_revision'' y hay %. Fuera de ese estado: %',
      v_ok, COALESCE(v_perdidos, '(ninguno)');
  END IF;
END $$;

UPDATE public.pp_pedidos p
   SET estado = 'confirmado'
 WHERE p.estado = 'confirmado_revision'
   AND NOT p.anulado
   AND EXISTS (
         SELECT 1
           FROM public.objetivos o
           JOIN public.clientes c ON c.id_local = o.cliente_id_local
          WHERE o.codigo = p.servicio_codigo
            AND c.productos_en_factura = 'SE FACTURA'
       );

-- Rastro de auditoría, igual que escribe registrarEventoPP() en la app.
--
-- Filtra por los 7 id_local EXACTOS y no por (servicio_codigo + estado), porque
-- hay al menos un pedido más de esos mismos servicios (1012-9986) que ya
-- estaba en 'confirmado' y no tiene nada que ver con este ticket: por estado
-- entraba al INSERT y le inventaba un evento de migración.
--
-- OJO: pp_pedido_eventos.id es 'bigint GENERATED ALWAYS AS IDENTITY' — no se
-- puede pasar el valor explícito (Postgres lo rechaza con "cannot insert a
-- non-DEFAULT value into column id"), se lo deja asignar a la secuencia.
-- OJO: information_schema.columns.column_default dice NULL en las identity, así
-- que para comprobar esto hay que mirar is_identity, no column_default.
-- El id_local se arma con la misma forma de 9 caracteres que usa
-- _id()/_idTrunc() en la app (4 dígitos-guion-4 dígitos).
INSERT INTO public.pp_pedido_eventos
    (id_local, pedido_id_local, estado_desde, estado_hasta, ejecutado_por, ejecutado_en, observaciones)
SELECT '2609-' || LPAD(ROW_NUMBER() OVER ()::text, 4, '0'),
       p.id_local,
       'confirmado_revision',
       'confirmado',
       'Migración v169',
       to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z',
       'Corrección de regla (BANDEJA_AUDITOR 25/09): el cliente factura los productos, así que el pedido va directo a Compras sin pasar por el auditor'
  FROM public.pp_pedidos p
 WHERE p.id_local IN ('3938-8368', '3945-6412', '48343-950', '3688-8136',
                      '6461-3469', '7092-8835', '7734-1798')
   AND NOT EXISTS (
         SELECT 1 FROM public.pp_pedido_eventos e
          WHERE e.pedido_id_local = p.id_local
            AND e.ejecutado_por = 'Migración v169'
       );

-- Segundo guard: el UPDATE no tiene que haber tocado nada que no sea de la
-- lista. Si el EXISTS del UPDATE agarró algún PAGAN de otro período, el count
-- no cierra y conviene que alguien mire qué se movió.
DO $$
DECLARE v_movidos integer;
BEGIN
  SELECT count(*) INTO v_movidos
    FROM public.pp_pedidos
   WHERE estado = 'confirmado'
     AND NOT anulado
     AND servicio_codigo IN ('CONS.DELGADO', 'EVENTO.HIT.ARGUIBEL', 'HIT.ARGUIBEL',
                              'HIT.LIBERTADOR.8614', 'HIT.MAIPU', 'HIT.TECNO', 'HIT.VILO');
  RAISE NOTICE 'v169: pedidos PAGAN ahora en ''confirmado'' de esos servicios: % (incluye los que ya estaban, p.ej. 1012-9986)', v_movidos;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificación posterior:
--   1) La bandeja debe tener SOLO los 2 NO PAGAN, con snapshot NO FACTURA:
--      select p.id_local, p.servicio_codigo, p.motivo_revision_snapshot
--      from pp_pedidos p
--      left join objetivos o on o.codigo = p.servicio_codigo
--      left join clientes c on c.id_local = o.cliente_id_local
--      where p.estado in ('confirmado_revision','observado') and not p.anulado;
--
--   2) Los 7 deben estar 'confirmado' y con su snapshot intacto (7 filas):
--      select id_local, servicio_codigo, estado, motivo_revision_snapshot
--      from pp_pedidos
--      where id_local in ('3938-8368','3945-6412','48343-950','3688-8136',
--                         '6461-3469','7092-8835','7734-1798');
--
--   3) Los 7 eventos de la migración, y solo 7:
--      select pedido_id_local, estado_desde, estado_hasta, ejecutado_por
--      from pp_pedido_eventos where ejecutado_por = 'Migración v169';
-- ---------------------------------------------------------------------------

-- v101 — Stock inicial de uniformes (ticket "Stock inicial de uniformes", 08/2026)
--
-- Carga el inventario físico que Logística relevó en depósito (14/08/2026,
-- 1.080 unidades en 6 prendas: BUZO, AMBO, CAMPERA, CALZADO/Zapatos,
-- PANTALON/Grafa, CHOMBA) como punto de partida del stock del módulo
-- Uniformes, para que las salidas (pedidos) y entradas (compras) varíen
-- correctamente a partir de esa base.
--
-- No agrega columnas ni tablas nuevas: stock_uniformes y
-- stock_uniformes_movimientos (v071) ya tenían todo lo necesario.
--
-- ENFOQUE ELEGIDO: se reconcilia igual que un conteo físico (ver
-- guardarConteoFisico() en src/modules/uniformes/stock.js) — un movimiento
-- tipo:'ajuste' por cada combinación prenda/talle, con
-- cantidad = valor_del_archivo - cantidad_actual_en_sistema. Esto:
--   1) deja stock_uniformes_movimientos como ledger consistente (el nivel
--      siempre es la suma de sus movimientos, sin doble conteo);
--   2) reconcilia sin problema las 4 filas de prueba que ya existían
--      (Ambo/M, Zapatos/42, Chomba/L, Polar/L, las 4 en cantidad -1 —
--      quedaron así por pedidos reales descontados antes de que hubiera
--      stock inicial cargado, el mismo problema que este ticket resuelve);
--   3) funciona igual si la fila prenda/talle ya existe o no.
--
-- Equivalencias de nombre (archivo de Logística → catálogo del módulo):
--   CALZADO → Zapatos · PANTALON → Grafa (pantalón grafa) · resto, igual.
-- POLAR: sin stock informado (0 unidades, confirmado por Logística) pero
-- tenía la fila de prueba Polar/L en -1 → se reconcilia a 0 explícitamente.
-- REMERA: sin stock informado y sin prenda propia en el catálogo todavía
-- (no se crea fila — agregar a PRENDAS/TALLES_POR_PRENDA en catalogos.js
-- si Logística la releva a futuro).
--
-- Talles: unificados a notación numérica S/M/L/XL/2XL/3XL/4XL/5XL en todo
-- el catálogo (ver catalogos.js TALLES_POR_PRENDA — antes usaba
-- XXL/XXXL/XXXXL para Buzo/Ambo/Chomba/Polar/Campera, y el select de
-- "Talle de ambo" en Altas/Documentación usaba una tercera notación mixta
-- S..XL,XXL,XXXL,4XL,5XL; con el stock inicial llegando en notación
-- numérica hasta 5XL para Buzo y Ambo, se adoptó esa como única
-- convención en todo el proyecto).
--
-- Aplicado a producción manualmente el 25/08/2026 vía script Node
-- (mismo cálculo que este SQL). Este archivo documenta esa carga de forma
-- idempotente (el guard de abajo evita duplicar si se corre más de una
-- vez) — es el "script SQL de seed" pedido como entregable del ticket.

do $$
declare
  v_ya_importado boolean;
begin
  select exists(select 1 from stock_uniformes_movimientos where ref_tipo = 'stock_inicial')
    into v_ya_importado;
  if v_ya_importado then
    raise notice 'Stock inicial ya importado (existe un movimiento con ref_tipo=stock_inicial) — no se repite.';
    return;
  end if;

  create temporary table _stock_inicial_csv (prenda text, talle text, cantidad numeric) on commit drop;
  insert into _stock_inicial_csv (prenda, talle, cantidad) values
    ('Buzo','S',23),('Buzo','M',31),('Buzo','L',17),('Buzo','XL',20),
    ('Buzo','2XL',40),('Buzo','3XL',30),('Buzo','4XL',16),('Buzo','5XL',17),
    ('Ambo','S',40),('Ambo','M',35),('Ambo','L',35),('Ambo','XL',20),
    ('Ambo','2XL',30),('Ambo','3XL',21),('Ambo','4XL',23),('Ambo','5XL',11),
    ('Campera','S',10),('Campera','M',13),('Campera','L',12),('Campera','XL',15),('Campera','2XL',10),
    ('Zapatos','35',19),('Zapatos','36',8),('Zapatos','37',7),('Zapatos','38',3),
    ('Zapatos','39',11),('Zapatos','40',8),('Zapatos','41',6),('Zapatos','42',10),
    ('Zapatos','43',17),('Zapatos','44',25),('Zapatos','45',11),('Zapatos','46',1),
    ('Grafa','36',59),('Grafa','38',4),('Grafa','40',50),('Grafa','42',10),
    ('Grafa','44',29),('Grafa','46',25),('Grafa','48',40),('Grafa','50',30),
    ('Grafa','52',35),('Grafa','54',18),('Grafa','56',25),('Grafa','58',6),('Grafa','60',14),
    ('Chomba','S',25),('Chomba','M',23),('Chomba','L',26),('Chomba','XL',10),
    ('Chomba','2XL',12),('Chomba','3XL',40),('Chomba','4XL',4),
    ('Polar','L',0); -- sin stock informado; reconcilia la fila de prueba vieja a 0

  -- Crea las filas de stock_uniformes que todavía no existen, en 0
  -- (el ajuste de abajo las deja en el valor del CSV).
  insert into stock_uniformes (id_local, prenda, talle, cantidad)
  select right((extract(epoch from clock_timestamp())::bigint * 1000 + row_number() over ())::text, 9),
         c.prenda, c.talle, 0
  from _stock_inicial_csv c
  where not exists (
    select 1 from stock_uniformes s where s.prenda = c.prenda and s.talle = c.talle
  );

  -- Ajusta cada fila al valor del archivo y registra el movimiento.
  with deltas as (
    select s.id, s.prenda, s.talle, s.cantidad as actual, c.cantidad as objetivo,
           (c.cantidad - s.cantidad) as delta
    from stock_uniformes s
    join _stock_inicial_csv c on c.prenda = s.prenda and c.talle = s.talle
  )
  update stock_uniformes s
  set cantidad = d.objetivo, updated_at = now()
  from deltas d
  where s.id = d.id and d.delta <> 0;

  insert into stock_uniformes_movimientos (id_local, tipo, prenda, talle, cantidad, motivo, ref_tipo, ref_id_local, registrado_por)
  select right((extract(epoch from clock_timestamp())::bigint * 1000 + row_number() over ())::text, 9),
         'ajuste', d.prenda, d.talle, d.delta,
         'Stock inicial — inventario físico Logística 14/08/2026' ||
           case when d.prenda = 'Polar' then ' (sin stock informado por Logística — Polar)' else '' end,
         'stock_inicial', 'STKINI001', 'seed SQL v101'
  from (
    select s.id, s.prenda, s.talle, s.cantidad as actual, c.cantidad as objetivo,
           (c.cantidad - s.cantidad) as delta
    from stock_uniformes s
    join _stock_inicial_csv c on c.prenda = s.prenda and c.talle = s.talle
  ) d
  where d.delta <> 0;

  raise notice 'Stock inicial de uniformes importado.';
end $$;

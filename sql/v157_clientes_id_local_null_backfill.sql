-- v157: Bug real detrás de "la modal de baja de cliente muestra otro
-- cliente" + "error de código duplicado al confirmar" (ticket con
-- síntomas descriptos en términos de React/`selectedClient`, que no
-- aplican a este stack vanilla — investigado contra la base real).
--
-- Causa raíz confirmada por REST: 7 clientes (todos con el MISMO
-- created_at, señal de una carga histórica en bloque que nunca pasó por
-- supaSync()) quedaron con id_local = NULL:
--   Cabildo 3878, Depo Interblock, Eventos Hit, Hospital Campana 400,
--   Nordelta Gareca, Obra Hit, Onomy.
--
-- El frontend arma el id de cada fila con `_toCamel()`: cuando id_local
-- es NULL, `c.id` queda en null para los 7 al mismo tiempo. La tabla los
-- renderiza con `onclick="abrirBajaCliente('${idLocalTrunc(c.id)}')"`,
-- y `idLocalTrunc(null)` da el string "null" para los 7 — así que
-- `getClienteByIdLocal('null')` siempre devuelve el PRIMERO de esos 7
-- que aparezca en el array, sin importar en qué fila se haya clickeado
-- (de ahí "Hospital Campana 400" abriendo la modal de "Cabildo 3878").
-- Al confirmar, supaSync() no encuentra id/nro válidos y cae a
-- `Date.now()` como id_local nuevo → hace un INSERT en vez de un UPDATE
-- → choca con el UNIQUE de `codigo` del registro ya existente → el
-- error de "código duplicado" que reportó el ticket.
--
-- No hay servicios (objetivos) enganchados a estos 7 clientes todavía
-- (verificado por REST: cero objetivos con cliente_id_local NULL o
-- apuntando a sus UUID), así que el backfill no puede dejar huérfano
-- ningún objetivo existente.
BEGIN;

UPDATE public.clientes SET id_local = '900000001' WHERE id = 'c15841a1-17c3-4e4a-9423-c5d175f32e05'; -- Cabildo 3878
UPDATE public.clientes SET id_local = '900000002' WHERE id = '9afb534a-4c5c-401a-83f6-502694f84a40'; -- Depo Interblock
UPDATE public.clientes SET id_local = '900000003' WHERE id = 'aa6fcec6-063f-419a-9ade-dedf5be3463a'; -- Eventos Hit
UPDATE public.clientes SET id_local = '900000004' WHERE id = '04a1770c-d536-49bc-b3fb-1a2729839032'; -- Hospital Campana 400
UPDATE public.clientes SET id_local = '900000005' WHERE id = '1e29a090-cc07-4c27-8e70-e352a1f485bc'; -- Nordelta Gareca
UPDATE public.clientes SET id_local = '900000006' WHERE id = '7a1f3ff5-d6ad-41ab-ad14-c1192b951b1d'; -- Obra Hit
UPDATE public.clientes SET id_local = '900000007' WHERE id = '366d59da-a5c1-462c-8038-b22784d12cc1'; -- Onomy

-- Preventivo: que este bug no pueda repetirse silenciosamente con la
-- próxima carga en bloque que alguien haga a mano en la base.
ALTER TABLE public.clientes ALTER COLUMN id_local SET NOT NULL;

COMMIT;

-- Verificación:
--   select count(*) from public.clientes where id_local is null;  -- debe dar 0
--   select id_local, nombre, codigo from public.clientes where id_local like '900000%' order by id_local;

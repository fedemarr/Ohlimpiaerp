-- =====================================================================
-- Notas de aumento — PASO 2: estado / ciclo de vida por CLIENTE dentro de
-- un ORIGEN (escala o paritaria). Registra que notas se generaron y
-- cuales se enviaron, para no regenerar/reenviar por accidente.
--
-- Ciclo de vida de una nota (una fila por cliente x origen):
--   1) GENERADA  -> se crea/actualiza la fila con fecha_generada = now()
--                   al producir el PDF del cliente.
--   2) ENVIADA   -> fecha_enviada = now() cuando se envia (hoy manual;
--                   a futuro automatico al integrar Outlook).
--                   Mientras fecha_enviada IS NULL, la nota esta pendiente.
--   3) Una vez enviada, NO se regenera salvo que se "desmarque"
--      (fecha_enviada = null) explicitamente.
--
-- DOS ORIGENES POSIBLES (el porque completo esta en abm_49, bloque 1):
--   · fila de ESCALA   -> escala_id cargado.
--   · fila VIRTUAL     -> escala_id NULL y paritaria_id cargado. Son los
--     clientes con el aumento cargado A MANO, sin escala de por medio.
--   origen_id = coalesce(escala_id, paritaria_id) colapsa los dos casos
--   para poder expresar el unique "una nota por cliente por origen".
--
-- CORREGIDO EL 29-JUL-2026: este archivo describia el modelo viejo
-- —escala_id NOT NULL y unique (escala_id, cliente_id)—, que hacia rato
-- no era el de la base. Las columnas paritaria_id y origen_id se habian
-- agregado a mano y ningun script las creaba: re-correr este archivo en
-- una base limpia armaba una tabla que rompia la generacion de casos del
-- CRM. Sobre una base YA existente no cambia nada (create table if not
-- exists no toca una tabla que existe); el que regulariza una base vieja
-- es abm_49_notas_pdf.sql, bloque 1.
--
-- Las columnas del PDF (pdf_path, pdf_nombre, pdf_subido_en) las agrega
-- abm_49_notas_pdf.sql, que va DESPUES de este.
--
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


create table if not exists public.notas_emitidas (
  id             uuid primary key default gen_random_uuid(),
  escala_id      uuid references public.escalas_aumento(id) on delete cascade,  -- NULL en las notas virtuales
  paritaria_id   uuid references public.paritarias(id)      on delete cascade,  -- origen de las virtuales; ademas permite listar por paritaria
  cliente_id     uuid not null references public.clientes(id) on delete cascade,  -- a que cliente
  fecha_generada timestamptz,                 -- cuando se genero el PDF (null = todavia no generada)
  fecha_enviada  timestamptz,                 -- cuando se envio (null = NO enviada / pendiente)
  fecha_nota     date,                        -- la fecha que figura EN la nota (la que elige Juan al generar)
  incluye_precio boolean not null default false,  -- si se genero con precio (true) o sin precio (false)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Columna GENERADA: el origen efectivo de la nota. No la escribe la app,
  -- asi no puede quedar desincronizada de las dos columnas de las que sale.
  origen_id      uuid generated always as (coalesce(escala_id, paritaria_id)) stored,
  -- una sola nota por cliente por origen
  constraint notas_emitidas_origen_cliente_uk unique (origen_id, cliente_id)
);

comment on table  public.notas_emitidas is
  'Estado / ciclo de vida de las notas de aumento por cliente dentro de un origen (escala o paritaria). Una fila por (origen_id, cliente_id). Generada -> Enviada; enviada no se regenera sin desmarcar (fecha_enviada = null).';
comment on column public.notas_emitidas.escala_id      is 'FK a escalas_aumento. NULL en las notas "virtuales" (aumentos cargados a mano, sin escala).';
comment on column public.notas_emitidas.paritaria_id   is 'FK a paritarias. Es el origen de las notas virtuales y ademas permite listar todas las notas de una paritaria.';
comment on column public.notas_emitidas.origen_id      is 'Columna GENERADA = coalesce(escala_id, paritaria_id). Colapsa los dos origenes posibles en un solo valor para poder expresar el unique por cliente.';
comment on column public.notas_emitidas.cliente_id     is 'FK a clientes: cliente destinatario de la nota.';
comment on column public.notas_emitidas.fecha_generada is 'Timestamp de generacion del PDF. Null = todavia no se genero.';
comment on column public.notas_emitidas.fecha_enviada  is 'Timestamp de envio. Null = no enviada (pendiente). Enviada no se regenera salvo desmarcado.';
comment on column public.notas_emitidas.fecha_nota     is 'Fecha que figura EN la nota (elegida por Juan al generar).';
comment on column public.notas_emitidas.incluye_precio is 'Si la nota se genero con precio (true) o sin precio (false).';

-- Indices para los dos accesos tipicos (por escala y por cliente).
create index if not exists notas_emitidas_escala_idx  on public.notas_emitidas (escala_id);
create index if not exists notas_emitidas_cliente_idx on public.notas_emitidas (cliente_id);


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
-- (a) tabla creada (0 filas) + columnas
select count(*) as filas from public.notas_emitidas;
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notas_emitidas'
 order by ordinal_position;

-- (b) indices y unique
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'notas_emitidas'
 order by indexname;

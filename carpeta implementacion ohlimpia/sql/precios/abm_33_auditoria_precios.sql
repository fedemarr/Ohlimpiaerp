-- =====================================================================
-- Auditoria de cambios en precios: quien cambio que y cuando.
--
-- ENFOQUE: triggers en la base, no en el codigo. Es imposible cambiar una
-- fila de las tablas auditadas sin que quede registro, venga del camino que
-- venga (app, SQL manual, funcion SECURITY DEFINER, o un camino futuro).
--
-- DOS MECANISMOS, por rendimiento:
--   a) objetivo_precios (13.713 filas, aumentos masivos) -> trigger
--      STATEMENT-LEVEL con transition tables. Una pasada set-based por
--      sentencia en vez de 13.713 invocaciones con subtransaccion.
--   b) Las otras 8 tablas (volumen despreciable) -> trigger FILA POR FILA.
--
-- REGLAS DE DISENO (no negociables):
--   1. La auditoria NUNCA rompe la operacion. Si el trigger falla, el cambio
--      de precio se hace igual (bloque exception que traga todo).
--   2. Las tablas de auditoria son de SOLO LECTURA para los usuarios de la
--      app. RLS + grants: authenticated solo puede SELECT.
--   3. En UPDATE se guardan SOLO las columnas que cambiaron, no la fila
--      entera.
--
-- TABLAS AUDITADAS (9):
--   objetivo_precios (statement-level), escalas_aumento,
--   escalas_aumento_detalle, paritarias, paritarias_detalle,
--   grupos_clientes, aplicaciones_escala, precios_snapshots, clientes.
-- FUERA: precios_snapshot_detalle (149k filas, copia inmutable por diseno).
--
-- COMO CORRERLO: bloques numerados, de a uno, en orden.
-- IDEMPOTENTE: se puede re-correr entero sin romper nada.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Tabla de auditoria (cabecera, comun a todas las tablas)
--
-- Para las 8 tablas fila-por-fila, cada fila de aca ES el cambio.
-- Para objetivo_precios, cada fila de aca es la CABECERA de una sentencia
-- y el detalle vive en auditoria_objetivo_precios (bloque 2).
--
-- fila_id es TEXT y no UUID a proposito: no depende del tipo de PK de cada
-- tabla auditada. Si manana se audita una tabla con id bigint, sigue andando.
-- =====================================================================
create table if not exists public.auditoria (
  id               bigint generated always as identity primary key,
  tabla            text        not null,
  fila_id          text,                                    -- null en las cabeceras statement-level
  operacion        text        not null check (operacion in ('INSERT','UPDATE','DELETE','RESTORE')),
  usuario_id       uuid,                                    -- auth.uid(); null si no hubo sesion
  usuario_email    text,                                    -- legible; null si no hubo sesion
  origen           text        not null,                    -- 'app' | 'sin_usuario'
  datos_anteriores jsonb,                                   -- UPDATE: solo las columnas que cambiaron
  datos_nuevos     jsonb,
  hecho_at         timestamptz not null default now()
);

comment on table  public.auditoria is
  'Auditoria centralizada de cambios en las tablas de precios. Escrita solo por triggers. Solo lectura para la app.';
comment on column public.auditoria.fila_id          is 'PK de la fila afectada, como texto. Null en cabeceras statement-level (objetivo_precios).';
comment on column public.auditoria.origen           is 'app = habia sesion de Supabase Auth; sin_usuario = SQL manual, cron o cualquier camino sin JWT.';
comment on column public.auditoria.datos_anteriores is 'INSERT: null. UPDATE: solo las columnas que cambiaron (valor viejo). DELETE: la fila entera.';
comment on column public.auditoria.datos_nuevos     is 'INSERT: la fila entera. UPDATE: solo las columnas que cambiaron (valor nuevo). DELETE: null. Cabecera statement-level: {"filas": N}.';

create index if not exists idx_auditoria_tabla_fecha on public.auditoria (tabla, hecho_at desc);
create index if not exists idx_auditoria_fila        on public.auditoria (tabla, fila_id);
create index if not exists idx_auditoria_usuario     on public.auditoria (usuario_email, hecho_at desc);


-- =====================================================================
-- BLOQUE 2 — Detalle de objetivo_precios
--
-- Columnas reales (no jsonb) para lo que se consulta siempre: que objetivo,
-- que cliente, que mes, precio antes y despues. Con indices de verdad.
-- El diff completo de cualquier otra columna queda en antes/despues (jsonb),
-- asi no se pierde nada.
-- =====================================================================
create table if not exists public.auditoria_objetivo_precios (
  id              bigint generated always as identity primary key,
  auditoria_id    bigint  not null references public.auditoria(id) on delete cascade,
  operacion       text    not null check (operacion in ('INSERT','UPDATE','DELETE')),
  fila_id         uuid,
  sucursal_id     uuid,
  cliente_id      uuid,
  codigo_objetivo text,
  mes             date,
  precio_antes    numeric,
  precio_despues  numeric,
  antes           jsonb,     -- UPDATE: solo columnas que cambiaron. DELETE: fila entera.
  despues         jsonb      -- UPDATE: solo columnas que cambiaron. INSERT: fila entera.
);

comment on table public.auditoria_objetivo_precios is
  'Detalle fila por fila de cada sentencia sobre objetivo_precios. Se escribe set-based desde el trigger statement-level. La cabecera (quien/cuando) esta en auditoria via auditoria_id.';

create index if not exists idx_aud_op_cliente  on public.auditoria_objetivo_precios (cliente_id, mes);
create index if not exists idx_aud_op_sucursal on public.auditoria_objetivo_precios (sucursal_id, mes);
create index if not exists idx_aud_op_fila     on public.auditoria_objetivo_precios (fila_id);
create index if not exists idx_aud_op_cabecera on public.auditoria_objetivo_precios (auditoria_id);


-- =====================================================================
-- BLOQUE 3 — Quien es el usuario, en forma segura
--
-- auth.jwt() ->> 'email' sale del propio token: no cuesta una consulta.
-- Si el token no trae email, se resuelve contra auth.users. Por eso es
-- SECURITY DEFINER: 'authenticated' no puede leer auth.users por su cuenta.
--
-- OJO: SECURITY DEFINER cambia el ROL efectivo, no el contexto de la request.
-- El GUC request.jwt.claims sigue presente, asi que un cambio disparado desde
-- la app a traves de una funcion definer (ej. restaurar_precios_snapshot)
-- QUEDA ATRIBUIDO AL USUARIO. El unico caso realmente sin usuario es el SQL
-- corrido a mano en el editor.
-- =====================================================================
create or replace function public.auditoria_usuario(
  out uid uuid, out email text, out origen text
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  begin uid := auth.uid(); exception when others then uid := null; end;

  begin
    email := nullif(auth.jwt() ->> 'email', '');
  exception when others then email := null;
  end;

  if uid is not null and email is null then
    begin
      select u.email into email from auth.users u where u.id = uid;
    exception when others then email := null;
    end;
  end if;

  origen := case when uid is null then 'sin_usuario' else 'app' end;
end;
$$;


-- =====================================================================
-- BLOQUE 4 — Diff entre dos jsonb
--
-- Devuelve {"antes": {...}, "despues": {...}} con SOLO las claves que
-- cambiaron. Si no cambio nada, los dos objetos vienen vacios.
-- La usan los dos triggers (fila por fila y statement-level).
-- =====================================================================
create or replace function public.auditoria_diff(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
as $$
  with claves as (
    select k from jsonb_object_keys(
      coalesce(p_old, '{}'::jsonb) || coalesce(p_new, '{}'::jsonb)
    ) k
    where (p_old -> k) is distinct from (p_new -> k)
  )
  select jsonb_build_object(
    'antes',   coalesce((select jsonb_object_agg(k, p_old -> k) from claves where p_old ? k), '{}'::jsonb),
    'despues', coalesce((select jsonb_object_agg(k, p_new -> k) from claves where p_new ? k), '{}'::jsonb)
  );
$$;


-- =====================================================================
-- BLOQUE 5 — Trigger function FILA POR FILA (las 8 tablas chicas)
--
-- updated_at se excluye de la comparacion: lo pisa el trigger de updated_at
-- en cada UPDATE y ensuciaria todos los diffs.
-- Si no cambio nada real, no escribe nada.
-- =====================================================================
create or replace function public.auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old   jsonb;
  v_new   jsonb;
  v_diff  jsonb;
  v_ant   jsonb;
  v_nue   jsonb;
  v_fila  text;
  v_uid   uuid;
  v_email text;
  v_orig  text;
begin
  -- Operacion masiva declarada: se saltea el registro.
  if coalesce(current_setting('auditoria.omitir', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_nue  := to_jsonb(new);
    v_ant  := null;
    v_fila := v_nue ->> 'id';

  elsif tg_op = 'DELETE' then
    v_ant  := to_jsonb(old);
    v_nue  := null;
    v_fila := v_ant ->> 'id';

  else  -- UPDATE
    v_old  := to_jsonb(old) - 'updated_at';
    v_new  := to_jsonb(new) - 'updated_at';
    v_fila := v_new ->> 'id';

    if v_old = v_new then
      return new;   -- nada real cambio
    end if;

    v_diff := public.auditoria_diff(v_old, v_new);
    v_ant  := v_diff -> 'antes';
    v_nue  := v_diff -> 'despues';
  end if;

  select u.uid, u.email, u.origen
    into v_uid, v_email, v_orig
    from public.auditoria_usuario() u;

  insert into public.auditoria (
    tabla, fila_id, operacion, usuario_id, usuario_email, origen,
    datos_anteriores, datos_nuevos
  ) values (
    tg_table_name, v_fila, tg_op, v_uid, v_email, coalesce(v_orig, 'sin_usuario'),
    v_ant, v_nue
  );

  return coalesce(new, old);

exception when others then
  -- REGLA 1: la auditoria nunca rompe la operacion.
  return coalesce(new, old);
end;
$$;


-- =====================================================================
-- BLOQUE 6 — Enganchar el trigger fila por fila en las 8 tablas
-- (mismo patron que schema.sql:180). objetivo_precios NO va aca.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'escalas_aumento',
    'escalas_aumento_detalle',
    'paritarias',
    'paritarias_detalle',
    'grupos_clientes',
    'aplicaciones_escala',
    'precios_snapshots',
    'clientes'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_auditoria on public.%1$s;
       create trigger trg_%1$s_auditoria
         after insert or update or delete on public.%1$s
         for each row execute function public.auditar_cambio();', t
    );
  end loop;
end $$;


-- =====================================================================
-- BLOQUE 7 — Trigger function STATEMENT-LEVEL (solo objetivo_precios)
--
-- Una cabecera por sentencia + el detalle en un solo INSERT ... SELECT
-- desde las transition tables. El bloque exception cuesta UNA subtransaccion
-- por sentencia (no por fila), asi que es despreciable.
--
-- Si la sentencia no cambio nada real, se borra la cabecera y no queda rastro.
-- =====================================================================
create or replace function public.auditar_objetivo_precios()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid   uuid;
  v_email text;
  v_orig  text;
  v_aud   bigint;
  v_n     integer := 0;
begin
  if coalesce(current_setting('auditoria.omitir', true), '') = 'on' then
    return null;
  end if;

  select u.uid, u.email, u.origen
    into v_uid, v_email, v_orig
    from public.auditoria_usuario() u;

  insert into public.auditoria (tabla, operacion, usuario_id, usuario_email, origen)
  values ('objetivo_precios', tg_op, v_uid, v_email, coalesce(v_orig, 'sin_usuario'))
  returning id into v_aud;

  if tg_op = 'INSERT' then
    insert into public.auditoria_objetivo_precios
      (auditoria_id, operacion, fila_id, sucursal_id, cliente_id, codigo_objetivo, mes,
       precio_antes, precio_despues, antes, despues)
    select v_aud, 'INSERT', n.id, n.sucursal_id, n.cliente_id, n.codigo_objetivo, n.mes,
           null, n.precio_hora, null, to_jsonb(n)
      from nuevas n;
    get diagnostics v_n = row_count;

  elsif tg_op = 'DELETE' then
    insert into public.auditoria_objetivo_precios
      (auditoria_id, operacion, fila_id, sucursal_id, cliente_id, codigo_objetivo, mes,
       precio_antes, precio_despues, antes, despues)
    select v_aud, 'DELETE', v.id, v.sucursal_id, v.cliente_id, v.codigo_objetivo, v.mes,
           v.precio_hora, null, to_jsonb(v), null
      from viejas v;
    get diagnostics v_n = row_count;

  else  -- UPDATE
    insert into public.auditoria_objetivo_precios
      (auditoria_id, operacion, fila_id, sucursal_id, cliente_id, codigo_objetivo, mes,
       precio_antes, precio_despues, antes, despues)
    select v_aud, 'UPDATE', n.id, n.sucursal_id, n.cliente_id, n.codigo_objetivo, n.mes,
           v.precio_hora, n.precio_hora,
           d.j -> 'antes', d.j -> 'despues'
      from nuevas n
      join viejas v on v.id = n.id
      cross join lateral (
        select public.auditoria_diff(to_jsonb(v) - 'updated_at', to_jsonb(n) - 'updated_at') as j
      ) d
     where (to_jsonb(v) - 'updated_at') is distinct from (to_jsonb(n) - 'updated_at');
    get diagnostics v_n = row_count;
  end if;

  if v_n = 0 then
    delete from public.auditoria where id = v_aud;   -- sentencia sin cambios reales
  else
    update public.auditoria
       set datos_nuevos = jsonb_build_object('filas', v_n)
     where id = v_aud;
  end if;

  return null;

exception when others then
  -- REGLA 1: la auditoria nunca rompe la operacion.
  return null;
end;
$$;


-- =====================================================================
-- BLOQUE 8 — Los 3 triggers de objetivo_precios
--
-- Tienen que ser tres y no uno: cada evento necesita su propia clausula
-- REFERENCING (INSERT solo tiene NEW TABLE, DELETE solo OLD TABLE).
--
-- El primer drop saca el trigger fila-por-fila por si quedo de una corrida
-- anterior de este mismo script.
-- =====================================================================
drop trigger if exists trg_objetivo_precios_auditoria on public.objetivo_precios;

drop trigger if exists trg_objetivo_precios_aud_ins on public.objetivo_precios;
create trigger trg_objetivo_precios_aud_ins
  after insert on public.objetivo_precios
  referencing new table as nuevas
  for each statement execute function public.auditar_objetivo_precios();

drop trigger if exists trg_objetivo_precios_aud_upd on public.objetivo_precios;
create trigger trg_objetivo_precios_aud_upd
  after update on public.objetivo_precios
  referencing old table as viejas new table as nuevas
  for each statement execute function public.auditar_objetivo_precios();

drop trigger if exists trg_objetivo_precios_aud_del on public.objetivo_precios;
create trigger trg_objetivo_precios_aud_del
  after delete on public.objetivo_precios
  referencing old table as viejas
  for each statement execute function public.auditar_objetivo_precios();


-- =====================================================================
-- BLOQUE 9 — RLS: solo lectura para la app, en las dos tablas
--
-- Sin policy de INSERT/UPDATE/DELETE, esas operaciones quedan denegadas para
-- 'authenticated' aunque el patron auth_all del resto del sistema use ALL.
--
-- IMPORTANTE: NO agregar 'force row level security'. El dueno de la tabla
-- saltea RLS, y es justamente lo que permite que los triggers (SECURITY
-- DEFINER) puedan insertar. Con FORCE se bloquearia tambien el trigger y no
-- se registraria nada.
-- =====================================================================
alter table public.auditoria                  enable row level security;
alter table public.auditoria_objetivo_precios enable row level security;

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated using (true);

drop policy if exists auditoria_op_select on public.auditoria_objetivo_precios;
create policy auditoria_op_select on public.auditoria_objetivo_precios
  for select to authenticated using (true);

-- Los grants son independientes de RLS: hay que cerrarlos igual.
revoke all on public.auditoria                  from anon, authenticated;
revoke all on public.auditoria_objetivo_precios from anon, authenticated;
grant select on public.auditoria                  to authenticated;
grant select on public.auditoria_objetivo_precios to authenticated;

-- Las funciones de este script tambien. Postgres le da EXECUTE a PUBLIC por
-- defecto en toda funcion nueva, y ese grant implicito alcanza a anon Y a
-- authenticated. Las tres son SECURITY DEFINER: corren con permisos del dueno
-- y saltean RLS, asi que el EXECUTE es el unico candado. Mismo criterio que
-- abm_31, abm_32 y el bloque 11 de este archivo.
--
-- Se revoca tambien a AUTHENTICATED, no solo a anon: ninguna de las tres se
-- llama desde la app.
--   · auditar_cambio y auditar_objetivo_precios las dispara la BASE cuando
--     salta el trigger, no el cliente.
--   · auditoria_usuario la llaman los dos triggers desde adentro, y como esos
--     triggers son SECURITY DEFINER la llamada la hace el dueno, no el usuario.
--
-- ESTO NO APAGA LA AUDITORIA. El EXECUTE se chequea en la llamada DIRECTA y al
-- crear el trigger, no cada vez que el trigger se dispara: los triggers ya
-- creados siguen invocando estas funciones igual. Verificado el 25-jul
-- cambiando un precio desde la app despues de correr los revoke (quedo
-- registrado con el mail del usuario y origen='app').
--
-- auditoria_diff() no esta en la lista a proposito: no es SECURITY DEFINER
-- (es sql immutable, corre como invoker) y no lee ni escribe nada.
revoke execute on function public.auditar_cambio()           from public, anon, authenticated;
revoke execute on function public.auditar_objetivo_precios() from public, anon, authenticated;
revoke execute on function public.auditoria_usuario()        from public, anon, authenticated;


-- =====================================================================
-- BLOQUE 10 — Arreglo aparte: updated_at de objetivo_precios nunca se
-- actualizaba. La tabla tiene la columna pero no estaba en el loop de
-- schema.sql:183, asi que conservaba para siempre la fecha del insert.
-- =====================================================================
drop trigger if exists trg_objetivo_precios_updated_at on public.objetivo_precios;
create trigger trg_objetivo_precios_updated_at
  before update on public.objetivo_precios
  for each row execute function public.set_updated_at();


-- =====================================================================
-- BLOQUE 11 — restaurar_precios_snapshot
--
-- Una restauracion borra 13.713 filas y reinserta otras tantas: serian
-- ~27.000 filas de detalle por un solo click, que ademas no dicen nada util.
-- Lo que importa es "fulano restauro el snapshot X tal dia".
--
-- La funcion declara la operacion como masiva (GUC local a la transaccion),
-- los triggers se saltean, y la propia funcion escribe UNA fila de resumen
-- con operacion='RESTORE'.
--
-- El set_config va DESPUES de crear la foto automatica, para que el alta en
-- precios_snapshots si quede auditada normalmente.
--
-- Es el mismo cuerpo de abm_31 mas esos agregados; el resto no cambia.
-- =====================================================================
create or replace function public.restaurar_precios_snapshot(p_snapshot uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cols   text;
  v_count  integer;
  v_antes  integer;
  v_auto   text;
  v_nombre text;
begin
  select nombre into v_nombre from public.precios_snapshots where id = p_snapshot;
  if not found then
    raise exception 'El snapshot % no existe.', p_snapshot;
  end if;

  select count(*) into v_antes from public.objetivo_precios;

  -- Red extra: foto automatica del estado actual antes de pisarlo.
  -- (queda auditada como INSERT en precios_snapshots: el flag todavia no esta puesto)
  v_auto := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD-HH24-MI');
  perform public.crear_precios_snapshot(v_auto, 'AUTO - estado antes de restaurar');

  -- A partir de aca, no auditar. 'true' = local a la transaccion.
  perform set_config('auditoria.omitir', 'on', true);

  -- Columnas reales de objetivo_precios (en orden), para insertar sin snapshot_id.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'objetivo_precios';

  -- 'where true' satisface la proteccion que exige WHERE en los DELETE.
  -- Se usa delete (y no truncate) por si hay FKs apuntando a objetivo_precios.
  delete from public.objetivo_precios where true;
  execute format(
    'insert into public.objetivo_precios (%1$s) select %1$s from public.precios_snapshot_detalle where snapshot_id = $1',
    v_cols
  ) using p_snapshot;

  select count(*) into v_count from public.objetivo_precios;

  -- UNA fila de resumen en lugar de ~27.000.
  begin
    insert into public.auditoria (
      tabla, fila_id, operacion, usuario_id, usuario_email, origen,
      datos_anteriores, datos_nuevos
    )
    select 'objetivo_precios', p_snapshot::text, 'RESTORE',
           u.uid, u.email, coalesce(u.origen, 'sin_usuario'),
           jsonb_build_object('filas_antes', v_antes),
           jsonb_build_object('filas_despues', v_count,
                              'snapshot_id', p_snapshot,
                              'snapshot_nombre', v_nombre,
                              'snapshot_auto_previo', v_auto)
      from public.auditoria_usuario() u;
  exception when others then
    null;   -- REGLA 1: ni siquiera el resumen puede romper la restauracion
  end;

  return v_count;
end;
$$;

-- PERMISOS: NUNCA dar execute a anon en esta funcion.
--
-- Es SECURITY DEFINER y saltea RLS: borra las 13.713 filas de objetivo_precios
-- y las reemplaza por las del snapshot. La anon key viaja en el JS del cliente,
-- a la vista de cualquiera, asi que con execute para anon cualquier persona con
-- esa key podia borrar todos los precios sin siquiera tener cuenta.
--
-- El revoke a public tambien hace falta: Postgres le da execute a PUBLIC por
-- defecto en cada funcion nueva, y ese grant implicito alcanza a anon igual.
-- Los dos revoke van ANTES del grant, en este orden, y quedan en el script para
-- que una re-corrida no pueda reabrir el agujero.
revoke execute on function public.restaurar_precios_snapshot(uuid) from public, anon;
grant  execute on function public.restaurar_precios_snapshot(uuid) to authenticated;


-- =====================================================================
-- BLOQUE 12 — Verificacion
-- =====================================================================

-- 12.1 Triggers instalados: 8 fila-por-fila + 3 de objetivo_precios
select c.relname as tabla, t.tgname as trigger,
       case t.tgtype & 1 when 1 then 'fila' else 'sentencia' end as nivel
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal
   and c.relnamespace = 'public'::regnamespace
   and (t.tgname like '%_auditoria' or t.tgname like '%_aud_%')
 order by c.relname, t.tgname;

-- 12.2 RLS activo, sin FORCE, y una sola policy de SELECT en cada tabla
select relname, relrowsecurity as rls_on, relforcerowsecurity as rls_forzado
  from pg_class
 where oid in ('public.auditoria'::regclass, 'public.auditoria_objetivo_precios'::regclass);

select tablename, policyname, cmd, roles from pg_policies
 where schemaname = 'public' and tablename in ('auditoria','auditoria_objetivo_precios')
 order by tablename;

-- 12.3 Grants: authenticated solo SELECT, anon sin nada
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('auditoria','auditoria_objetivo_precios')
 order by table_name, grantee, privilege_type;


-- =====================================================================
-- BLOQUE 13 — Prueba end-to-end
--
-- ATENCION: el sistema esta en produccion y Comercial lo usa. Por eso TODO
-- el bloque va dentro de una transaccion que termina en ROLLBACK: se prueba
-- contra datos reales pero no queda NADA, ni el cambio de precio ni las
-- filas de auditoria que genero.
--
-- CORRER EL BLOQUE ENTERO DE UNA SOLA VEZ, no linea por linea: si se corta
-- a la mitad, el editor abre otra sesion y el rollback no alcanza al resto.
--
-- Tambien mide el tiempo real del UPDATE masivo ya con el trigger puesto,
-- que es el numero que faltaba.
--
-- Corrido desde el editor SQL debe quedar origen='sin_usuario'.
-- Desde la app, con el email del usuario.
-- =====================================================================
begin;

  -- 13.1 UPDATE que NO cambia nada -> no debe registrar ninguna cabecera
  update public.objetivo_precios
     set precio_hora = precio_hora
   where mes >= '2026-07-01';

  select count(*) as cabeceras_tras_update_vacio
    from public.auditoria where tabla = 'objetivo_precios';

  -- 13.2 UPDATE real sobre TODA la tabla -> 1 cabecera + 13.713 detalles.
  --      El tiempo que reporte este explain es el costo real del aumento masivo.
  explain (analyze, buffers)
  update public.objetivo_precios
     set precio_hora = precio_hora * 1.08;

  -- 13.3 La cabecera: quien, cuando, cuantas filas
  select a.id, a.operacion, a.usuario_email, a.origen,
         a.datos_nuevos ->> 'filas' as filas, a.hecho_at
    from public.auditoria a
   where a.tabla = 'objetivo_precios'
   order by a.id desc
   limit 5;

  -- 13.4 El detalle de la ultima sentencia
  select d.codigo_objetivo, d.mes, d.precio_antes, d.precio_despues, d.antes, d.despues
    from public.auditoria_objetivo_precios d
   where d.auditoria_id = (select max(id) from public.auditoria where tabla = 'objetivo_precios')
   limit 10;

rollback;

-- Confirmacion de que no quedo nada: las dos consultas deben dar 0.
select (select count(*) from public.auditoria where tabla = 'objetivo_precios') as cabeceras,
       (select count(*) from public.auditoria_objetivo_precios)                 as detalles;


-- =====================================================================
-- BLOQUE 14 — Consultas de uso (guardar a mano, no hace falta correrlas)
-- =====================================================================

-- Quien cambio los precios de un cliente
-- select a.hecho_at, a.usuario_email, a.origen, d.operacion,
--        d.codigo_objetivo, d.mes, d.precio_antes, d.precio_despues
--   from public.auditoria_objetivo_precios d
--   join public.auditoria a on a.id = d.auditoria_id
--  where d.cliente_id = 'PEGAR-UUID-DEL-CLIENTE'
--  order by a.hecho_at desc;

-- Historia completa de un objetivo (todos sus meses)
-- select a.hecho_at, a.usuario_email, d.mes, d.precio_antes, d.precio_despues
--   from public.auditoria_objetivo_precios d
--   join public.auditoria a on a.id = d.auditoria_id
--  where d.sucursal_id = 'PEGAR-UUID-DEL-OBJETIVO'
--  order by d.mes, a.hecho_at desc;

-- Que hizo un usuario en el ultimo mes (todas las tablas)
-- select tabla, operacion, count(*) as veces, max(hecho_at) as ultima
--   from public.auditoria
--  where usuario_email = 'PEGAR-EMAIL'
--    and hecho_at > now() - interval '30 days'
--  group by tabla, operacion
--  order by ultima desc;

-- Los aumentos masivos: una linea por sentencia, con cuantas filas toco
-- select a.hecho_at, a.usuario_email, a.origen, a.operacion,
--        a.datos_nuevos ->> 'filas' as filas_tocadas
--   from public.auditoria a
--  where a.tabla = 'objetivo_precios'
--    and (a.datos_nuevos ->> 'filas')::int > 100
--  order by a.hecho_at desc;

-- Cambios sin usuario (SQL corrido a mano): control de que nada raro pasa
-- select tabla, operacion, hecho_at, fila_id
--   from public.auditoria
--  where origen = 'sin_usuario'
--  order by hecho_at desc
--  limit 50;

-- =====================================================================
-- Backup/restore basico de objetivo_precios DESDE LA PANTALLA (un click).
-- NO es el modulo de versiones completo; es una red de seguridad simple.
--
-- Diseno: DOS tablas.
--   precios_snapshots         -> cabecera (nombre auto, descripcion, fecha, n_filas).
--   precios_snapshot_detalle  -> copia de objetivo_precios + snapshot_id (cascade).
-- + funciones:
--   crear_precios_snapshot(nombre, descripcion) -> saca la foto (server-side).
--   restaurar_precios_snapshot(id)              -> pisa objetivo_precios (transaccion).
--   borrar_precios_snapshot(id)                 -> borra cabecera (+ detalle por cascade).
--
-- IDEMPOTENTE: se puede re-correr entero sin romper nada.
-- NOMBRE: lo arma la app con la fecha/hora local (AAAA-MM-DD-HH-MM).
-- DESCRIPCION: texto opcional que escribe Juan.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Cabecera. n_filas = filas de la foto (para verificar que copio todo).
-- ---------------------------------------------------------------------
create table if not exists public.precios_snapshots (
  id          uuid primary key default gen_random_uuid(),
  nombre      text,                                  -- fecha/hora auto (ej. "2026-07-20-15-42")
  descripcion text,                                  -- opcional (ej. "antes de paritaria Jul")
  creado_at   timestamptz not null default now(),
  n_filas     integer                                -- filas copiadas al detalle
);
-- por si la tabla ya existia sin la columna descripcion:
alter table public.precios_snapshots add column if not exists descripcion text;

comment on table  public.precios_snapshots is 'Backup/restore basico: cabecera de cada foto de objetivo_precios tomada desde la pantalla.';
comment on column public.precios_snapshots.nombre      is 'Nombre auto con fecha/hora local (AAAA-MM-DD-HH-MM).';
comment on column public.precios_snapshots.descripcion is 'Descripcion opcional que escribe Juan (ej. "antes de paritaria Jul").';
comment on column public.precios_snapshots.n_filas     is 'Cantidad de filas copiadas al detalle (para verificar que copio todo).';


-- ---------------------------------------------------------------------
-- 2) Detalle. Copia ESTRUCTURAL de objetivo_precios + snapshot_id (cascade).
-- ---------------------------------------------------------------------
create table if not exists public.precios_snapshot_detalle (
  like public.objetivo_precios
);
alter table public.precios_snapshot_detalle
  add column if not exists snapshot_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'precios_snapshot_detalle_snapshot_fk') then
    alter table public.precios_snapshot_detalle
      add constraint precios_snapshot_detalle_snapshot_fk
      foreign key (snapshot_id) references public.precios_snapshots(id) on delete cascade;
  end if;
end $$;

create index if not exists precios_snapshot_detalle_snap_idx
  on public.precios_snapshot_detalle (snapshot_id);

comment on table public.precios_snapshot_detalle is 'Detalle de cada snapshot: copia de las filas de objetivo_precios + snapshot_id (on delete cascade).';


-- ---------------------------------------------------------------------
-- 3) Crear snapshot: copia el estado actual al detalle (server-side).
--    p_nombre lo arma la app (fecha/hora local); p_descripcion es opcional.
--    Devuelve el id del snapshot.
-- ---------------------------------------------------------------------
drop function if exists public.crear_precios_snapshot(text);   -- reemplaza la version vieja (1 arg)

create or replace function public.crear_precios_snapshot(p_nombre text, p_descripcion text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into public.precios_snapshots (nombre, descripcion, n_filas)
  select nullif(btrim(coalesce(p_nombre, '')), ''),
         nullif(btrim(coalesce(p_descripcion, '')), ''),
         count(*)
    from public.objetivo_precios
  returning id into v_id;

  -- detalle = todas las columnas de objetivo_precios (mismo orden) + snapshot_id
  insert into public.precios_snapshot_detalle
  select o.*, v_id from public.objetivo_precios o;

  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) Restaurar snapshot: pisa objetivo_precios con el detalle elegido.
--    Todo el cuerpo corre en una sola transaccion. Antes de pisar, guarda
--    una foto AUTO del estado actual. Devuelve cuantas filas quedaron.
-- ---------------------------------------------------------------------
create or replace function public.restaurar_precios_snapshot(p_snapshot uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cols text; v_count integer; v_auto text;
begin
  if not exists (select 1 from public.precios_snapshots where id = p_snapshot) then
    raise exception 'El snapshot % no existe.', p_snapshot;
  end if;

  -- Red extra: foto automatica del estado actual antes de pisarlo.
  v_auto := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD-HH24-MI');
  perform public.crear_precios_snapshot(v_auto, 'AUTO - estado antes de restaurar');

  -- Columnas reales de objetivo_precios (en orden), para insertar sin snapshot_id.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'objetivo_precios';

  -- 'where true' satisface la proteccion que exige WHERE en los DELETE
  -- (evita el error "DELETE requires a WHERE clause"). Vacia toda la tabla igual.
  -- Se usa delete (y no truncate) por si hay FKs apuntando a objetivo_precios.
  delete from public.objetivo_precios where true;
  execute format(
    'insert into public.objetivo_precios (%1$s) select %1$s from public.precios_snapshot_detalle where snapshot_id = $1',
    v_cols
  ) using p_snapshot;

  select count(*) into v_count from public.objetivo_precios;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 5) Borrar snapshot: borra la cabecera; el detalle se va por cascade.
-- ---------------------------------------------------------------------
create or replace function public.borrar_precios_snapshot(p_snapshot uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.precios_snapshots where id = p_snapshot;
end;
$$;


-- ---------------------------------------------------------------------
-- 6) Permisos: SOLO usuarios con sesion. NUNCA anon.
--
-- Las tres funciones son SECURITY DEFINER: corren con permisos del dueno y
-- SALTEAN RLS. restaurar_precios_snapshot, ademas, borra las 13.713 filas de
-- objetivo_precios y las reemplaza por las del snapshot. La anon key viaja en
-- el JS del cliente, a la vista de cualquiera, asi que con execute para anon
-- cualquier persona con esa key podia borrar todos los precios sin siquiera
-- tener cuenta. Activar RLS no alcanza: el unico candado es el EXECUTE.
--
-- El revoke a public tambien hace falta: Postgres le da execute a PUBLIC por
-- defecto en cada funcion nueva, y ese grant implicito alcanza a anon igual.
--
-- Se cerro en la base el 24-jul. Este archivo todavia decia "to anon,
-- authenticated": una re-corrida del script reabria el agujero. Corregido el
-- 25-jul, junto con el mismo caso en abm_33 (restaurar_precios_snapshot).
--
-- El grant de SELECT sobre la tabla se deja como estaba: RLS ya bloquea a
-- anon (no hay policy para ese rol), asi que el permiso no habilita nada.
-- ---------------------------------------------------------------------
revoke execute on function public.crear_precios_snapshot(text, text) from public, anon;
revoke execute on function public.restaurar_precios_snapshot(uuid)   from public, anon;
revoke execute on function public.borrar_precios_snapshot(uuid)      from public, anon;

grant select on public.precios_snapshots to anon, authenticated;
grant execute on function public.crear_precios_snapshot(text, text) to authenticated;
grant execute on function public.restaurar_precios_snapshot(uuid)   to authenticated;
grant execute on function public.borrar_precios_snapshot(uuid)      to authenticated;


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
select
  (select count(*) from public.precios_snapshots)        as snapshots,
  (select count(*) from public.precios_snapshot_detalle) as filas_detalle;

select proname, pg_get_function_identity_arguments(oid) as args
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('crear_precios_snapshot', 'restaurar_precios_snapshot', 'borrar_precios_snapshot')
 order by proname;

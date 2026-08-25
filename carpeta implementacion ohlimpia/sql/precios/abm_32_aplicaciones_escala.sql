-- =====================================================================
-- Registro de APLICACIONES de escala (para el nuevo "Generar notas": el
-- modal muestra las combinaciones grupo/filtro + escala ya aplicadas).
--
-- Una fila por (escala + grupo) o (escala + filtro). Si se reaplica, se
-- actualiza la fecha (upsert). clientes_ids guarda a quienes se aplico
-- (necesario para los "filtrados"; respaldo para grupos).
-- Idempotente (if not exists / or replace).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------
create table if not exists public.aplicaciones_escala (
  id                 uuid primary key default gen_random_uuid(),
  escala_id          uuid not null references public.escalas_aumento(id) on delete cascade,
  grupo_id           uuid references public.grupos_clientes(id) on delete cascade,  -- null = a filtrados
  descripcion_filtro text,                                                          -- null = a un grupo
  clientes_ids       jsonb,                                                         -- clientes a los que se aplico (array de uuids)
  fecha_aplicacion   timestamptz not null default now()
);

comment on table  public.aplicaciones_escala is 'Combinaciones (escala + grupo/filtro) ya aplicadas, para ofrecerlas en "Generar notas". Upsert por combinacion.';
comment on column public.aplicaciones_escala.grupo_id           is 'Grupo al que se aplico; null si fue a clientes filtrados.';
comment on column public.aplicaciones_escala.descripcion_filtro is 'Texto de los filtros usados; null si fue a un grupo.';
comment on column public.aplicaciones_escala.clientes_ids       is 'Array JSON de cliente_id a los que se aplico (para generar las notas del filtro; respaldo para grupos).';

-- una fila por escala+grupo, y una por escala+filtro
create unique index if not exists aplic_escala_grupo_uk
  on public.aplicaciones_escala (escala_id, grupo_id)           where grupo_id is not null;
create unique index if not exists aplic_escala_filtro_uk
  on public.aplicaciones_escala (escala_id, descripcion_filtro) where grupo_id is null;


-- ---------------------------------------------------------------------
-- 2) RPC upsert: registra/actualiza una aplicacion. Rama grupo / filtro
--    segun p_grupo_id. Devuelve el id. security definer (como snapshots).
-- ---------------------------------------------------------------------
create or replace function public.registrar_aplicacion_escala(
  p_escala_id          uuid,
  p_grupo_id           uuid,
  p_descripcion_filtro text,
  p_clientes_ids       jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if p_grupo_id is not null then
    insert into public.aplicaciones_escala (escala_id, grupo_id, descripcion_filtro, clientes_ids, fecha_aplicacion)
    values (p_escala_id, p_grupo_id, null, p_clientes_ids, now())
    on conflict (escala_id, grupo_id) where grupo_id is not null
      do update set clientes_ids = excluded.clientes_ids, fecha_aplicacion = now()
    returning id into v_id;
  else
    insert into public.aplicaciones_escala (escala_id, grupo_id, descripcion_filtro, clientes_ids, fecha_aplicacion)
    values (p_escala_id, null, p_descripcion_filtro, p_clientes_ids, now())
    on conflict (escala_id, descripcion_filtro) where grupo_id is null
      do update set clientes_ids = excluded.clientes_ids, fecha_aplicacion = now()
    returning id into v_id;
  end if;
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 3) Permisos: SOLO usuarios con sesion. NUNCA anon.
--
-- registrar_aplicacion_escala es SECURITY DEFINER: corre con permisos del
-- dueno y SALTEA RLS. Con execute para anon, cualquiera con la anon key (que
-- viaja en el JS del cliente) podia escribir en aplicaciones_escala sin tener
-- cuenta. Activar RLS no alcanza: el unico candado es el EXECUTE.
--
-- El revoke a public tambien hace falta: Postgres le da execute a PUBLIC por
-- defecto en cada funcion nueva, y ese grant implicito alcanza a anon igual.
--
-- Mismo caso que abm_31 (crear/restaurar/borrar_precios_snapshot) y abm_33
-- (restaurar_precios_snapshot). Corregido el 25-jul para que una re-corrida
-- del script no reabra el agujero.
--
-- El grant de SELECT sobre la tabla se deja como estaba: RLS ya bloquea a
-- anon (no hay policy para ese rol), asi que el permiso no habilita nada.
-- ---------------------------------------------------------------------
revoke execute on function public.registrar_aplicacion_escala(uuid, uuid, text, jsonb) from public, anon;

grant select on public.aplicaciones_escala to anon, authenticated;
grant execute on function public.registrar_aplicacion_escala(uuid, uuid, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
select count(*) as aplicaciones from public.aplicaciones_escala;

select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'aplicaciones_escala'
 order by indexname;

select proname, pg_get_function_identity_arguments(oid) as args
  from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'registrar_aplicacion_escala';

-- =====================================================================
-- CRM — "QUE SE HIZO" en las gestiones. El canal pasa a opcional.
--
-- EL PROBLEMA
-- Hoy el unico campo obligatorio de una gestion es el CANAL, que es justo el que
-- menos importa: "mail" o "telefono" no dicen nada. Lo que importa es QUE PASO —
-- se envio presupuesto, se negocio precio, se hablo con el Coordinador.
--
-- Y hay un problema practico: un campo obligatorio que a nadie le importa se
-- completa mal. Comercial va a elegir cualquier canal para poder guardar, y la
-- unica estadistica que ese campo podria dar queda sucia.
--
-- LO QUE CAMBIA
--   · "que se hizo" (tipo_id) -> lista predefinida y OBLIGATORIO. Es el agrupable.
--   · canal -> OPCIONAL.
--   · el texto libre (descripcion) queda igual.
--
-- POR QUE NO COMPARTE LISTA CON LAS PROXIMAS ACCIONES
-- Son dos preguntas distintas: "que hice" y "que falta y de quien depende". Pero
-- SE CONECTAN, y el vinculo va como DATO y no en el codigo: cada tipo declara en
-- cumple_accion_id que accion pendiente cierra. Si viviera en el JavaScript, el
-- dia que se agregue un tipo nadie se acordaria de ensenarle que cumple.
--
-- ATENCION — LA PANTALLA Y ESTE SCRIPT VAN JUNTOS.
-- El bloque 5 pone tipo_id NOT NULL. La version de crm.js que manda ese campo
-- entra en el mismo commit: con la pantalla vieja, "Anotar gestion" fallaria.
--
-- Correr BLOQUE POR BLOQUE.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Tabla de tipos de gestion
--
-- Mismo molde que crm_acciones (abm_39): orden propio, se desactiva en vez de
-- borrarse, y editable SOLO desde el editor de Supabase (ver bloque 7).
--
-- cumple_accion_id es lo unico nuevo respecto de ese molde: el puente entre "lo
-- que hice" y "lo que quedaba pendiente". Nullable, porque no toda gestion cierra
-- una accion (negociar un precio no cumple nada en particular).
-- =====================================================================
create table if not exists public.crm_gestion_tipos (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden  smallint not null default 100,
  activa boolean not null default true,

  -- NO lleva "requiere_detalle" como crm_acciones, y es a proposito:
  -- crm_gestiones.descripcion ya es NOT NULL, asi que el texto es obligatorio en
  -- TODAS las gestiones. La bandera seria una regla que parece existir y no hace
  -- nada — peor que no tenerla.

  -- Que accion pendiente cierra esta gestion. Lo usa la pantalla para OFRECER
  -- marcarla como cumplida; nunca para decidirlo sola.
  cumple_accion_id uuid references public.crm_acciones(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_gestion_tipos is
  'Lista configurable de "que se hizo" en una gestion. Es el campo agrupable de la bitacora. Editable SOLO desde el editor de Supabase.';
comment on column public.crm_gestion_tipos.cumple_accion_id is
  'Que proxima accion cierra esta gestion. El vinculo va como dato y no en el codigo: al agregar un tipo hay que declarar que cumple, o no cumple nada.';

create index if not exists idx_crm_gestion_tipos_activas
  on public.crm_gestion_tipos (activa, orden);

drop trigger if exists trg_crm_gestion_tipos_updated_at on public.crm_gestion_tipos;
create trigger trg_crm_gestion_tipos_updated_at before update on public.crm_gestion_tipos
for each row execute function public.set_updated_at();


-- =====================================================================
-- BLOQUE 2 — Carga de la lista PROVISORIA
--
-- Juan la cierra con Comercial el lunes 27 de julio de 2026, junto con la de
-- proximas acciones (las dos se definen en la misma conversacion: el vinculo de
-- abajo solo se puede decidir con las dos listas a la vista).
--
-- AJUSTAR NOMBRES DESPUES ES UN UPDATE, no hace falta re-correr el script.
--
-- Las 9 y 10 son RESULTADOS, no acciones nuestras. Van igual porque son las que
-- disparan cambios de estado, y hoy ese momento —"aca fue cuando acepto"— no
-- queda en ningun lado: solo el estado nuevo, sin la conversacion que lo produjo.
--
-- PENDIENTE DE LA CHARLA: "Se negocio el precio" puede partirse en dos, porque
-- "ofreci un numero" es una gestion y "acordamos un numero" es un resultado que
-- ademas dispara cargar el precio nuevo. Agregar un tipo es un insert.
--
-- El vinculo se resuelve por NOMBRE contra crm_acciones. Si un nombre no coincide
-- queda en null SIN AVISAR: el bloque 6 es el que lo muestra.
-- =====================================================================
insert into public.crm_gestion_tipos (nombre, orden, cumple_accion_id) values
  ('Se envió la nota de aumento',            10, null),
  ('Se reenvió la nota',                     20, (select id from public.crm_acciones where nombre = 'Reenviar la nota')),
  ('Se reclamó respuesta',                   30, (select id from public.crm_acciones where nombre = 'Esperando respuesta del cliente')),
  ('Se envió una nueva propuesta',           40, (select id from public.crm_acciones where nombre = 'Enviar nueva propuesta al cliente')),
  ('Se negoció el precio',                   50, null),
  ('Se habló con el Coordinador de Cuenta',  60, (select id from public.crm_acciones where nombre = 'A resolver con el Coordinador de Cuenta')),
  ('Se habló con el Consejo o la administración', 70, (select id from public.crm_acciones where nombre = 'A resolver con el Consejo')),
  ('Se recibió documentación',               80, (select id from public.crm_acciones where nombre = 'Esperando documentación del cliente')),
  ('El cliente aceptó',                      90, null),
  ('El cliente pidió una rebaja',           100, null),
  ('Otro',                                  110, null)
on conflict (nombre) do nothing;


-- =====================================================================
-- BLOQUE 3 — Los cambios en crm_gestiones
--
-- canal: se le saca el NOT NULL. El CHECK no hace falta tocarlo — un CHECK solo
-- falla cuando da FALSE, y con NULL da NULL, asi que deja pasar el nulo.
--
-- tipo_id: on delete RESTRICT. Un tipo en uso no se puede borrar; para sacarlo de
-- circulacion se desactiva. Igual que las acciones.
-- =====================================================================
alter table public.crm_gestiones
  alter column canal drop not null;

alter table public.crm_gestiones
  add column if not exists tipo_id uuid references public.crm_gestion_tipos(id) on delete restrict;

comment on column public.crm_gestiones.tipo_id is
  'Que se hizo. Es el campo AGRUPABLE de la bitacora: el que responde "cuantas propuestas nuevas mandamos esta paritaria".';
comment on column public.crm_gestiones.canal is
  'Por que medio. OPCIONAL a proposito: es dato de color. Obligarlo hacia que se eligiera cualquiera para poder guardar.';

create index if not exists idx_crm_gestiones_tipo on public.crm_gestiones (tipo_id);


-- =====================================================================
-- BLOQUE 4 — RELLENO de las gestiones que ya existen
--
-- Las unicas que hay son las del envio de la nota, que el sistema creo con
-- origen = 'envio_nota'. Tienen un tipo natural, asi que el relleno es exacto y no
-- inventa nada.
-- =====================================================================
update public.crm_gestiones g
   set tipo_id = (select id from public.crm_gestion_tipos where nombre = 'Se envió la nota de aumento')
 where g.tipo_id is null
   and g.origen = 'envio_nota';

-- Control: tiene que dar CERO. Si da mas, hay gestiones sin tipo que el bloque 5
-- no va a poder dejar obligatorias — mirar cuales antes de seguir.
select count(*) as gestiones_sin_tipo
  from public.crm_gestiones
 where tipo_id is null;


-- =====================================================================
-- BLOQUE 5 — tipo_id OBLIGATORIO
--
-- Solo si el control del bloque 4 dio CERO.
--
-- Va en la base y no solo en la pantalla por lo mismo de siempre: desde el
-- navegador se puede saltear. Una gestion sin tipo no se puede rellenar despues —
-- nadie va a releer doscientas notas de texto libre para clasificarlas.
-- =====================================================================
alter table public.crm_gestiones
  alter column tipo_id set not null;


-- =====================================================================
-- BLOQUE 6 — La gestion del envio nace con su tipo
--
-- crm_generar_casos inserta la gestion del envio, y con tipo_id obligatorio tiene
-- que darle un valor o el insert falla.
--
-- ACA ALCANZA "create or replace": no cambian ni los parametros ni el tipo de
-- retorno, solo el cuerpo. No hay que dropear nada (a diferencia de abm_41,
-- abm_42 y abm_44).
-- =====================================================================
create or replace function public.crm_generar_casos(
  p_paritaria_id uuid,
  p_clientes     uuid[] default null
)
returns table (
  clientes_con_nota       integer,
  casos_creados           integer,
  ya_existian             integer,
  creados_sin_responsable integer,
  gestiones_creadas       integer,
  casos_marcados_enviada  integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_universo integer;
  v_creados  integer;
  v_sin_resp integer;
  v_gest     integer;
  v_marcados integer;
  v_tipo     uuid;
begin
  if not exists (select 1 from public.paritarias where id = p_paritaria_id) then
    raise exception 'La paritaria % no existe.', p_paritaria_id
      using hint = 'Verificar el id contra la tabla paritarias.';
  end if;

  -- El tipo de la gestion del envio. Si alguien le cambio el nombre en la tabla,
  -- mejor fallar aca con un mensaje claro que insertar sin tipo y morir en el
  -- NOT NULL con un error de Postgres.
  select id into v_tipo from public.crm_gestion_tipos
   where nombre = 'Se envió la nota de aumento';
  if v_tipo is null then
    raise exception 'Falta el tipo de gestion "Se envió la nota de aumento" en crm_gestion_tipos.'
      using hint = 'Si se le cambio el nombre, actualizar esta funcion.';
  end if;

  drop table if exists _crm_uni;
  create temp table _crm_uni on commit drop as
  select distinct on (n.cliente_id)
         n.cliente_id, n.paritaria_id, n.fecha_enviada, c.responsable_id
    from public.notas_emitidas n
    join public.clientes c on c.id = n.cliente_id
   where n.paritaria_id = p_paritaria_id
     and (p_clientes is null or n.cliente_id = any (p_clientes))
   order by n.cliente_id, n.fecha_enviada desc nulls last;

  select count(*) into v_universo from _crm_uni;

  -- 1) Los casos que faltan.
  with ins as (
    insert into public.crm_casos (cliente_id, paritaria_id, estado, responsable_id)
    select u.cliente_id, u.paritaria_id,
           case when u.fecha_enviada is not null then 'enviada' else 'pendiente_envio' end,
           u.responsable_id
      from _crm_uni u
    on conflict (cliente_id, paritaria_id) do nothing
    returning responsable_id
  )
  select count(*), count(*) filter (where responsable_id is null)
    into v_creados, v_sin_resp
    from ins;

  -- 2) ESTADO: los que ya existian, siguen en pendiente_envio, y su nota ya salio.
  update public.crm_casos c
     set estado = 'enviada'
    from _crm_uni u
   where u.cliente_id  = c.cliente_id
     and u.paritaria_id = c.paritaria_id
     and u.fecha_enviada is not null
     and c.estado = 'pendiente_envio';
  get diagnostics v_marcados = row_count;

  -- 3) GESTION del envio, para todos los que tengan fecha. Sin condicion de
  --    estado: el envio ocurrio y va al historial aunque el caso ya haya avanzado.
  insert into public.crm_gestiones (caso_id, fecha, canal, descripcion, origen, tipo_id)
  select c.id,
         u.fecha_enviada::date,
         'mail',
         'Nota de aumento enviada',
         'envio_nota',
         v_tipo
    from _crm_uni u
    join public.crm_casos c
      on c.cliente_id = u.cliente_id
     and c.paritaria_id = u.paritaria_id
   where u.fecha_enviada is not null
  on conflict (caso_id) where origen = 'envio_nota' do nothing;
  get diagnostics v_gest = row_count;

  return query select v_universo, v_creados, v_universo - v_creados,
                      v_sin_resp, v_gest, v_marcados;
end;
$$;

-- El create or replace conserva los permisos, pero se re-otorgan por si esta
-- funcion se corriera sobre una base donde nunca se aplico abm_42.
revoke execute on function public.crm_generar_casos(uuid, uuid[]) from public, anon;
grant  execute on function public.crm_generar_casos(uuid, uuid[]) to authenticated;


-- =====================================================================
-- BLOQUE 7 — RLS y permisos de crm_gestion_tipos
--
-- SELECT y nada mas, igual que crm_acciones: la lista se lee desde la pantalla y
-- se escribe solo desde el editor de Supabase. SIN "force row level security": el
-- dueno tiene que poder cargarla.
-- =====================================================================
alter table public.crm_gestion_tipos enable row level security;

drop policy if exists crm_gestion_tipos_select on public.crm_gestion_tipos;
create policy crm_gestion_tipos_select on public.crm_gestion_tipos
  for select to authenticated using (true);

revoke all on public.crm_gestion_tipos from public, anon, authenticated;
grant select on public.crm_gestion_tipos to authenticated;


-- =====================================================================
-- BLOQUE 8 — VERIFICACION (solo lee)
-- =====================================================================

-- (a) Los once tipos, y CON QUE ACCION quedo vinculado cada uno.
--     Los que digan "(sin vinculo)" y en la tabla de arriba deberian tener uno,
--     significan que el nombre de la accion no coincidio: revisar crm_acciones.
select t.orden,
       t.nombre,
       coalesce(a.nombre, '(sin vinculo)') as cumple_accion
  from public.crm_gestion_tipos t
  left join public.crm_acciones a on a.id = t.cumple_accion_id
 order by t.orden;

-- (b) canal quedo nullable y tipo_id obligatorio.
select column_name, is_nullable, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'crm_gestiones'
   and column_name in ('canal','tipo_id','descripcion')
 order by column_name;

-- (c) Permisos: authenticated con SELECT y nada mas. Sin anon, sin PUBLIC.
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'crm_gestion_tipos'
 order by grantee, privilege_type;

-- (d) Las gestiones que hay, con su tipo.
select coalesce(t.nombre, '(sin tipo)') as tipo, g.canal, count(*) as gestiones
  from public.crm_gestiones g
  left join public.crm_gestion_tipos t on t.id = g.tipo_id
 group by t.nombre, g.canal
 order by tipo;

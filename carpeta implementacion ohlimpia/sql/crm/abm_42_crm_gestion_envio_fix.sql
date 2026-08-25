-- =====================================================================
-- CRM — la gestion del envio se crea CUANDO SE ENVIA, no cuando nace el caso.
--
-- CORRIGE a abm_41. Su funcion queda superada: NO re-correr su bloque 2 ni su
-- bloque 5.
--
-- EL ERROR DE abm_41
-- La gestion colgaba de "insertados", o sea de los casos RECIEN creados. Pero
-- enviar la nota es OTRO evento, que pasa DESPUES:
--   1) se generan las notas  -> se crean los casos, nacen 'pendiente_envio'
--      (todavia no hay fecha de envio)
--   2) se marcan como enviadas -> recien ahi existe la fecha
--   3) se vuelve a llamar al RPC -> los casos YA existen, el on-conflict-do-nothing
--      no los toca -> ninguna gestion
-- La gestion solo se creaba si el caso nacia ya enviado, o sea con las notas
-- marcadas ANTES de que el caso existiera: el orden inverso al normal.
--
-- El mismo error dejaba el ESTADO desactualizado: el caso seguia diciendo
-- 'pendiente_envio' con la nota ya enviada. Eso ensucia los contadores y los
-- filtros — quien filtre por "pendiente de envio" para ver que falta mandar, ve
-- casos ya enviados.
--
-- DOS CONDICIONES INDEPENDIENTES, NO UNA
--   GESTION: se crea si la nota tiene fecha y el caso no tiene ya su gestion de
--            envio. NO mira el estado. Un caso que Comercial movio a
--            'en_renegociacion' igual recibe su gestion: el envio ocurrio y tiene
--            que estar en el historial.
--   ESTADO : se mueve a 'enviada' SOLO desde 'pendiente_envio'. Nunca pisa un
--            caso que ya avanzo.
--
-- Correr BLOQUE POR BLOQUE. El bloque 8 va ENTERO de una sola vez.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — El candado estructural
--
-- POR QUE UNA COLUMNA Y UN INDICE, Y NO UNA CONDICION ESCRITA A MANO
-- Para no duplicar la gestion en cada llamada hay que saber si el caso ya la
-- tiene. Las dos formas obvias no sirven:
--   · "que no tenga NINGUNA gestion" (lo que usaba el relleno de abm_41) alcanza
--     hoy porque no existe la pantalla para cargar gestiones. Deja de alcanzar el
--     dia que exista: un caso donde Comercial anoto primero un llamado nunca
--     recibiria su gestion de envio. Es un candado que se rompe solo, justo
--     cuando llega la funcion que lo rompe.
--   · buscar por el TEXTO de la descripcion se desarma con cualquier cambio de
--     redaccion, y el relleno ya usa un texto distinto.
--
-- Con el indice unico parcial, la BASE garantiza una sola gestion de envio por
-- caso. El on-conflict-do-nothing pasa a ser idempotencia real, no una condicion
-- que hay que acordarse de mantener.
-- =====================================================================
alter table public.crm_gestiones
  add column if not exists origen text;

-- Nullable a proposito: las gestiones que carga una persona no tienen origen.
alter table public.crm_gestiones drop constraint if exists crm_gestiones_origen_chk;
alter table public.crm_gestiones add constraint crm_gestiones_origen_chk
  check (origen is null or origen in ('envio_nota'));

comment on column public.crm_gestiones.origen is
  'Marca las gestiones que crea el sistema. NULL = la cargo una persona. Hoy el unico valor es envio_nota, y el indice unico parcial garantiza una sola por caso.';

create unique index if not exists ux_crm_gestiones_envio_nota
  on public.crm_gestiones (caso_id)
  where origen = 'envio_nota';


-- =====================================================================
-- BLOQUE 2 — Marcar las gestiones de envio que ya existieran
--
-- Migracion de UNA SOLA VEZ para las filas que haya dejado abm_41. Aca SI se
-- busca por el texto, y esta bien: es una correccion puntual sobre filas ya
-- escritas, no el candado permanente. El candado es el indice del bloque 1.
--
-- Si crm_gestiones esta vacia, este bloque no hace nada y esta bien.
-- =====================================================================
update public.crm_gestiones
   set origen = 'envio_nota'
 where origen is null
   and canal = 'mail'
   and descripcion like 'Nota de aumento enviada%';


-- =====================================================================
-- BLOQUE 3 — Borrar la version anterior de la funcion
--
-- OBLIGATORIO: cambia el tipo de retorno (se agrega una sexta columna) y
-- "create or replace" no puede cambiarlo. Mismo caso que abm_41.
-- =====================================================================
drop function if exists public.crm_generar_casos(uuid, uuid[]);


-- =====================================================================
-- BLOQUE 4 — La funcion nueva
--
-- POR QUE TRES SENTENCIAS SEPARADAS Y NO UNA SOLA CON CTEs
-- En un unico statement, todas las CTE ven la MISMA foto de la base: una CTE que
-- lee crm_casos NO ve las filas que inserto otra CTE del mismo statement. La
-- gestion tiene que alcanzar tanto a los casos nuevos como a los que ya existian,
-- asi que necesita ver el resultado del insert. Con sentencias separadas dentro
-- de la funcion, cada una ve lo que hizo la anterior — y sigue siendo todo una
-- sola transaccion, porque es una sola llamada.
--
-- El universo se calcula UNA vez en una tabla temporal: si se repitiera la
-- consulta en las tres sentencias, el dia que cambie el criterio habria que
-- acordarse de cambiarlo en los tres lugares.
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
begin
  if not exists (select 1 from public.paritarias where id = p_paritaria_id) then
    raise exception 'La paritaria % no existe.', p_paritaria_id
      using hint = 'Verificar el id contra la tabla paritarias.';
  end if;

  -- Universo: una fila por cliente con nota en esta paritaria. Gana la fila ya
  -- enviada si hay dos (un cliente puede tener una por escala y otra virtual).
  -- El drop previo permite llamar la funcion dos veces en la misma transaccion.
  drop table if exists _crm_uni;
  create temp table _crm_uni on commit drop as
  select distinct on (n.cliente_id)
         n.cliente_id,
         n.paritaria_id,
         n.fecha_enviada,
         c.responsable_id
    from public.notas_emitidas n
    join public.clientes c on c.id = n.cliente_id
   where n.paritaria_id = p_paritaria_id
     and (p_clientes is null or n.cliente_id = any (p_clientes))
   order by n.cliente_id, n.fecha_enviada desc nulls last;

  select count(*) into v_universo from _crm_uni;

  -- 1) Los casos que faltan. Estado DERIVADO de si la nota ya salio.
  with ins as (
    insert into public.crm_casos (cliente_id, paritaria_id, estado, responsable_id)
    select u.cliente_id,
           u.paritaria_id,
           case when u.fecha_enviada is not null then 'enviada' else 'pendiente_envio' end,
           u.responsable_id
      from _crm_uni u
    on conflict (cliente_id, paritaria_id) do nothing
    returning responsable_id
  )
  select count(*), count(*) filter (where responsable_id is null)
    into v_creados, v_sin_resp
    from ins;

  -- 2) ESTADO: los que YA existian, siguen en pendiente_envio, y su nota ya salio.
  --    El filtro por estado es el que protege a los casos que Comercial ya movio:
  --    uno en en_renegociacion o precerrada no entra aca ni por casualidad.
  update public.crm_casos c
     set estado = 'enviada'
    from _crm_uni u
   where u.cliente_id  = c.cliente_id
     and u.paritaria_id = c.paritaria_id
     and u.fecha_enviada is not null
     and c.estado = 'pendiente_envio';
  get diagnostics v_marcados = row_count;

  -- 3) GESTION: para TODOS los casos cuya nota tiene fecha, existieran antes o
  --    no. SIN condicion de estado: el envio ocurrio y va al historial aunque el
  --    caso ya haya avanzado. El indice unico parcial evita el duplicado.
  insert into public.crm_gestiones (caso_id, fecha, canal, descripcion, origen)
  select c.id,
         -- notas_emitidas.fecha_enviada es timestamptz y crm_gestiones.fecha es
         -- date: sin la conversion, Postgres rechaza el insert.
         u.fecha_enviada::date,
         'mail',
         'Nota de aumento enviada',
         'envio_nota'
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


-- =====================================================================
-- BLOQUE 5 — Comentario y permisos
-- El drop del bloque 3 se llevo los permisos: estos grants NO son opcionales.
-- =====================================================================
comment on function public.crm_generar_casos(uuid, uuid[]) is
  'Crea los casos del CRM de una paritaria (opcionalmente acotada a clientes), marca como enviados los que seguian en pendiente_envio con la nota ya enviada, y registra la gestion del envio para todos los que tengan fecha. Idempotente. Devuelve clientes con nota / creados / ya existian / creados sin responsable / gestiones creadas / casos marcados enviada.';

revoke execute on function public.crm_generar_casos(uuid, uuid[]) from public, anon;
grant  execute on function public.crm_generar_casos(uuid, uuid[]) to authenticated;


-- =====================================================================
-- BLOQUE 6 — VISTA PREVIA de la recuperacion (solo lee)
--
-- Que va a corregir el bloque 7 sobre lo que YA esta mal. Correrlo antes.
-- =====================================================================
select
  (select count(*)
     from public.crm_casos c
    where c.estado = 'pendiente_envio'
      and exists (select 1 from public.notas_emitidas n
                   where n.cliente_id = c.cliente_id
                     and n.paritaria_id = c.paritaria_id
                     and n.fecha_enviada is not null)
  ) as estados_a_corregir,
  (select count(*)
     from public.crm_casos c
    where not exists (select 1 from public.crm_gestiones g
                       where g.caso_id = c.id and g.origen = 'envio_nota')
      and exists (select 1 from public.notas_emitidas n
                   where n.cliente_id = c.cliente_id
                     and n.paritaria_id = c.paritaria_id
                     and n.fecha_enviada is not null)
  ) as gestiones_a_crear;


-- =====================================================================
-- BLOQUE 7 — RECUPERAR lo que ya quedo mal
--
-- No solo prevenir hacia adelante: dejar consistente lo que ya existe. Corre
-- sobre TODAS las paritarias, no solo una.
--
-- Las dos sentencias son independientes, igual que dentro de la funcion: un caso
-- que Comercial ya movio recibe su gestion y NO se le toca el estado.
-- =====================================================================

-- 7a) Estado: los que siguen en pendiente_envio con la nota ya enviada.
update public.crm_casos c
   set estado = 'enviada'
 where c.estado = 'pendiente_envio'
   and exists (select 1 from public.notas_emitidas n
                where n.cliente_id = c.cliente_id
                  and n.paritaria_id = c.paritaria_id
                  and n.fecha_enviada is not null);

-- 7b) Gestion: para todo caso con nota enviada que no la tenga. SIN mirar estado.
--     Dice "(registro historico)" porque crm_gestiones sella cargado_por con
--     quien ejecuta: estas filas van a quedar con el mail de quien corre el
--     script. El campo dice quien CARGO, no quien contacto — pero sin la
--     aclaracion pareceria que alguien registro a mano decenas de contactos.
insert into public.crm_gestiones (caso_id, fecha, canal, descripcion, origen)
select c.id,
       (select max(n.fecha_enviada)::date
          from public.notas_emitidas n
         where n.cliente_id = c.cliente_id
           and n.paritaria_id = c.paritaria_id),
       'mail',
       'Nota de aumento enviada (registro histórico)',
       'envio_nota'
  from public.crm_casos c
 where not exists (select 1 from public.crm_gestiones g
                    where g.caso_id = c.id and g.origen = 'envio_nota')
   and exists (select 1 from public.notas_emitidas n
                where n.cliente_id = c.cliente_id
                  and n.paritaria_id = c.paritaria_id
                  and n.fecha_enviada is not null)
on conflict (caso_id) where origen = 'envio_nota' do nothing;


-- =====================================================================
-- BLOQUE 8 — VERIFICACION (solo lee)
-- =====================================================================

-- (a) UNA sola funcion, con SEIS columnas de retorno, sin anon ni PUBLIC.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as parametros,
       pg_get_function_result(p.oid)             as devuelve,
       array_to_string(p.proacl, ' | ')          as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crm_generar_casos';

-- (b) El indice unico parcial quedo creado.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'crm_gestiones';

-- (c) Casos sin gestion de envio, por estado. Los que queden tienen que ser
--     SOLO los que no tienen nota enviada.
select c.estado,
       count(*) as casos,
       count(*) filter (
         where exists (select 1 from public.notas_emitidas n
                        where n.cliente_id = c.cliente_id
                          and n.paritaria_id = c.paritaria_id
                          and n.fecha_enviada is not null)
       ) as con_nota_enviada_SIN_gestion
  from public.crm_casos c
 where not exists (select 1 from public.crm_gestiones g
                    where g.caso_id = c.id and g.origen = 'envio_nota')
 group by c.estado
 order by c.estado;

-- (d) INCONSISTENCIA A LA VISTA: casos que estan en 'enviada' o mas adelante
--     pero cuya nota NO figura como enviada. Significa una de dos: alguien movio
--     el estado a mano por error, o la nota salio y nadie la marco en el sistema.
--     No se corrige sola ni se debe inventar: solo se mira.
select cl.nombre as cliente, c.estado, c.created_at::date as caso_creado
  from public.crm_casos c
  join public.clientes cl on cl.id = c.cliente_id
 where c.estado <> 'pendiente_envio'
   and not exists (select 1 from public.notas_emitidas n
                    where n.cliente_id = c.cliente_id
                      and n.paritaria_id = c.paritaria_id
                      and n.fecha_enviada is not null)
 order by cl.nombre;


-- =====================================================================
-- BLOQUE 9 — PRUEBA DE QUE NO DUPLICA
--
-- VA ENTERO, DE UNA SOLA VEZ. Cortado a la mitad, el rollback no alcanza al resto
-- y quedan gestiones de prueba en produccion.
--
-- El riesgo principal es duplicar al re-ejecutar (el boton "Crear" de Precios
-- esta pensado para poder apretarse de mas). Tras el bloque 7 ya esta todo al
-- dia, asi que una llamada nueva tiene que devolver CERO en las tres columnas
-- que escriben.
-- =====================================================================
begin;

do $$
declare
  v_par uuid;
  v_ant integer;
  v_des integer;
  r     record;
begin
  select paritaria_id into v_par
    from public.crm_casos
   group by paritaria_id
   order by count(*) desc
   limit 1;

  if v_par is null then
    raise notice 'SIN DATOS: no hay casos para probar';
    return;
  end if;

  select count(*) into v_ant from public.crm_gestiones;
  select * into r from public.crm_generar_casos(v_par, null);
  select count(*) into v_des from public.crm_gestiones;

  raise notice 'creados: %  marcados enviada: %  gestiones: %  | gestiones antes % despues %',
    r.casos_creados, r.casos_marcados_enviada, r.gestiones_creadas, v_ant, v_des;

  if r.casos_creados = 0 and r.gestiones_creadas = 0
     and r.casos_marcados_enviada = 0 and v_ant = v_des then
    raise notice 'OK - re-ejecutar no duplico ni cambio nada';
  else
    raise notice 'REVISAR - la segunda corrida escribio algo';
  end if;
end $$;

rollback;

-- =====================================================================
-- ATENCION — ESTE SCRIPT ESTA SUPERADO. NO RE-CORRERLO.
--
-- La funcion que crea aca recibe UN solo argumento (la paritaria).
-- abm_37_crm_generar_casos_clientes.sql la reemplaza por una version de DOS
-- argumentos (paritaria + lista de clientes) y BORRA esta.
--
-- Re-correr este archivo volveria a crear la version de un argumento. Como
-- Postgres permite las dos firmas a la vez, quedarian ambas y toda llamada
-- de un solo argumento pasaria a ser AMBIGUA: el frontend dejaria de poder
-- llamarla. Se conserva solo como historia del diseno.
--
-- El porque del cambio esta en el encabezado de abm_37.
-- =====================================================================

-- =====================================================================
-- CRM de negociacion — PASO 2: generar los casos de una paritaria.
--
-- crm_generar_casos(paritaria) abre un caso por cada cliente que tenga
-- nota GENERADA en esa paritaria. Es la unica forma de crear casos.
--
-- DE DONDE SALEN LOS CLIENTES
-- De notas_emitidas filtrada por paritaria_id. Eso cubre los dos caminos:
--   · filas de escala   -> escala_id cargado.
--   · filas "virtuales" -> escala_id NULL y paritaria_id cargado. Son los
--     clientes con aumento cargado A MANO, sin escala.
-- Universo confirmado con Juan: solo clientes con nota generada. Sin nota
-- no hay nada que negociar.
--
-- POR QUE distinct on (cliente_id)
-- Un mismo cliente puede tener DOS filas de nota en la misma paritaria:
-- una por escala y una virtual. El unique de notas_emitidas es por
-- origen_id = coalesce(escala_id, paritaria_id), asi que la base acepta las
-- dos. Para el CRM es UN solo caso (crm_casos es unique por cliente +
-- paritaria). Sin el distinct, el insert choca contra si mismo.
-- El order by fecha_enviada desc nulls last hace que gane la fila ya
-- enviada: si una salio y la otra no, el caso nace como 'enviada'.
--
-- POR QUE on conflict do nothing
-- Sin eso, un solo caso preexistente aborta la sentencia ENTERA y no se
-- crea ninguno. Con eso, crea los que faltan e ignora los que estan. Es lo
-- que permite que la MISMA funcion sirva para el alta automatica y para el
-- boton de reparacion: re-correrla siempre es seguro y nunca duplica.
--
-- POR QUE SECURITY INVOKER (y no DEFINER)
-- No necesita permisos prestados: authenticated ya puede leer
-- notas_emitidas y clientes, e insertar en crm_casos. Dejandola INVOKER,
-- RLS sigue aplicando adentro y no hay privilegio que escalar. La regla del
-- proyecto sobre DEFINER existe porque DEFINER saltea RLS; aca no hace
-- falta saltear nada. Igual se revoca execute a public y anon.
--
-- POR QUE NO ES UN TRIGGER sobre notas_emitidas
-- El marcado de enviadas es un update masivo: 300 filas serian 300 disparos
-- y 300 inserts sueltos. Y acopla el modulo de notas al CRM de forma
-- invisible: despues nadie entiende de donde salio un caso. La llamada
-- explicita se ve.
--
-- NOTA HISTORICA sobre fecha_proxima_accion: esta version la dejaba en
-- NULL porque paritarias.plazo_aceptacion_tacita no existia. Desde
-- abm_48, los casos 'enviada' nacen con proxima accion = "Esperando
-- respuesta del cliente" y fecha = fecha_enviada + 20 dias FIJOS (el
-- plazo que usa Comercial hoy). Los 20 dias van a reemplazarse por
-- paritarias.plazo_aceptacion_tacita cuando esa columna exista. Como la
-- fecha se calcula sobre fecha_enviada y no sobre hoy, un caso reparado
-- con el boton "Crear" semanas despues puede nacer con la fecha tope YA
-- VENCIDA: es correcto, el plazo de ese cliente ya paso.
--
-- Correr de a UN BLOQUE por vez en el editor de Supabase.
-- Y VERIFICAR CONTRA EL CATALOGO despues de cada bloque que cree algo: el
-- editor puede decir "Success" sin haber aplicado nada (ver Desiciones.txt).
-- PASO ACA: el bloque 1 dijo "Success" sin crear la funcion. Se descubrio
-- porque el bloque 2 fallo con "function does not exist". Los bloques estan
-- ordenados a proposito para que el siguiente dependa del anterior.
--
-- APLICADO Y VERIFICADO EL 25-jul (ver los resultados en los bloques 5 y 6).
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — La funcion
--
-- Devuelve UNA fila con cuatro numeros. El conteo solo seria ambiguo: con
-- on conflict do nothing, un 0 puede ser "ya estaban todos" (correcto) o
-- "esta paritaria no tiene notas" (uuid equivocado). Separando el universo
-- del creado, esas dos se distinguen.
--
--   clientes_con_nota       = el universo. Cuantos clientes tienen nota
--                             generada en esa paritaria.
--   casos_creados           = cuantos abrio esta corrida.
--   ya_existian             = universo - creados. Los que salteo el
--                             on conflict.
--   creados_sin_responsable = de los CREADOS, cuantos quedaron sin
--                             responsable_id. Se cuenta sobre los creados y
--                             no sobre el universo porque es lo accionable:
--                             los que ya existian no se arreglan con esta
--                             corrida. Sirve para avisar en pantalla que se
--                             esta abriendo una tanda sin dueno de agenda.
-- =====================================================================
create or replace function public.crm_generar_casos(p_paritaria_id uuid)
returns table (
  clientes_con_nota       integer,
  casos_creados           integer,
  ya_existian             integer,
  creados_sin_responsable integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_universo integer;
  v_creados  integer;
  v_sin_resp integer;
begin
  -- Un uuid equivocado devolveria ceros, y "0 clientes" se lee como un
  -- resultado legitimo. Mejor cortar con un error que se entienda.
  if not exists (select 1 from public.paritarias where id = p_paritaria_id) then
    raise exception 'La paritaria % no existe.', p_paritaria_id
      using hint = 'Verificar el id contra la tabla paritarias.';
  end if;

  with universo as (
    -- Un caso por cliente. Gana la fila ya enviada si hay dos.
    select distinct on (n.cliente_id)
           n.cliente_id,
           n.paritaria_id,
           n.fecha_enviada,
           c.responsable_id
      from public.notas_emitidas n
      join public.clientes c on c.id = n.cliente_id
     where n.paritaria_id = p_paritaria_id
     order by n.cliente_id, n.fecha_enviada desc nulls last
  ),
  insertados as (
    insert into public.crm_casos (cliente_id, paritaria_id, estado, responsable_id)
    select u.cliente_id,
           u.paritaria_id,
           -- Estado DERIVADO, no fijo: permite correr el boton de reparacion
           -- sobre una paritaria mixta (parte enviada, parte no) sin mentir
           -- sobre el estado de nadie.
           case when u.fecha_enviada is not null then 'enviada' else 'pendiente_envio' end,
           -- RESP. NEG. congelado en el caso. No se lee del cliente despues:
           -- reasignar un cliente manana no tiene que reescribir la historia.
           u.responsable_id
      from universo u
    on conflict (cliente_id, paritaria_id) do nothing
    returning responsable_id
  )
  select (select count(*) from universo),
         (select count(*) from insertados),
         (select count(*) from insertados where responsable_id is null)
    into v_universo, v_creados, v_sin_resp;

  return query select v_universo, v_creados, v_universo - v_creados, v_sin_resp;
end;
$$;

comment on function public.crm_generar_casos(uuid) is
  'Abre un caso de CRM por cada cliente con nota generada en la paritaria. Idempotente (on conflict do nothing): re-correrla crea solo los que faltan. Devuelve universo / creados / ya existian / creados sin responsable.';


-- =====================================================================
-- BLOQUE 2 — Permisos
--
-- Es SECURITY INVOKER, asi que no hay privilegio que escalar: si la llamara
-- anon, RLS y los grants de crm_casos la frenarian igual. Se revoca de
-- todos modos, por la regla del proyecto: Postgres le da EXECUTE a PUBLIC
-- por defecto en toda funcion nueva, y ese grant implicito alcanza a anon.
-- =====================================================================
revoke execute on function public.crm_generar_casos(uuid) from public, anon;
grant  execute on function public.crm_generar_casos(uuid) to authenticated;


-- =====================================================================
-- BLOQUE 3 — VERIFICACION EN EL CATALOGO
--
-- El "Success" del bloque 1 NO es prueba de que la funcion exista: ya paso
-- dos veces el 25-jul que el editor dijera Success sin aplicar nada.
--
-- Esperado: una fila.
--   es_definer = false  (tiene que ser INVOKER)
--   permisos   sin anon y sin "=X/" suelto (PUBLIC); solo authenticated.
-- =====================================================================
select p.proname,
       p.prosecdef                          as es_definer,
       pg_get_function_result(p.oid)        as devuelve,
       array_to_string(p.proacl, ' | ')     as permisos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crm_generar_casos';


-- =====================================================================
-- BLOQUE 4 — Elegir una paritaria para probar
--
-- Devuelve el universo por paritaria. La columna clientes_con_nota es
-- EXACTAMENTE lo que va a devolver la funcion como universo: sirve para
-- reconocer el numero antes de correr nada.
--
-- OJO (25-jul): hoy las 77 notas son TODAS DE PRUEBA, ninguna enviada, y 76
-- de 77 clientes no tienen responsable_id (la columna se creo despues de
-- esas notas). O sea que la prueba va a dar casi todo en 'pendiente_envio' y
-- casi todo sin responsable. Eso es CORRECTO con estos datos, no un bug.
-- La verificacion real es la primera tanda de produccion.
-- =====================================================================
select n.paritaria_id,
       count(distinct n.cliente_id)                                            as clientes_con_nota,
       count(distinct n.cliente_id) filter (where c.responsable_id is null)    as sin_responsable,
       count(distinct n.cliente_id) filter (where n.fecha_enviada is not null) as con_nota_enviada
  from public.notas_emitidas n
  join public.clientes c on c.id = n.cliente_id
 group by n.paritaria_id
 order by clientes_con_nota desc;


-- =====================================================================
-- BLOQUE 5 — PRUEBA (contra datos reales, dentro de begin ... rollback)
--
-- VA ENTERO DE UNA SOLA VEZ. El rollback es lo unico que saca los casos de
-- produccion. Cortado a la mitad, el editor abre otra sesion, el rollback no
-- alcanza al resto y quedan casos de prueba en la base.
--
-- Reemplazar PEGAR_UUID_ACA por un paritaria_id del bloque 4.
--
-- Llama DOS VECES a proposito: es la prueba de idempotencia, que es la
-- propiedad de la que depende el boton de reparacion.
--
-- Esperado:
--   1ra corrida -> casos_creados = clientes_con_nota, ya_existian = 0
--   2da corrida -> casos_creados = 0, ya_existian = clientes_con_nota
--   total_en_tabla = clientes_con_nota (no se duplico nada)
--
-- VERIFICADA 25-jul: total_en_tabla = 77 despues de DOS llamadas. No duplico.
-- 77 en pendiente_envio, 0 en enviada, 76 sin responsable. Es lo CORRECTO con
-- los datos de hoy: las 77 notas son de prueba y ninguna se envio, y el
-- RESP. NEG. se creo despues de esas notas. La verificacion de verdad va a ser
-- la primera tanda de produccion.
-- =====================================================================
-- begin;
--
-- select 'primera' as corrida, * from public.crm_generar_casos('PEGAR_UUID_ACA');
-- select 'segunda' as corrida, * from public.crm_generar_casos('PEGAR_UUID_ACA');
--
-- select count(*)                                         as total_en_tabla,
--        count(*) filter (where estado = 'pendiente_envio') as pendiente_envio,
--        count(*) filter (where estado = 'enviada')         as enviada,
--        count(*) filter (where responsable_id is null)     as sin_responsable
--   from public.crm_casos;
--
-- rollback;


-- =====================================================================
-- BLOQUE 6 — PRUEBA DEL ERROR de paritaria inexistente
--
-- Tiene que FALLAR con "La paritaria ... no existe." Si devuelve una fila de
-- ceros, la validacion no quedo puesta.
-- VERIFICADA 25-jul: falla con el mensaje y el hint.
-- =====================================================================
-- select * from public.crm_generar_casos('00000000-0000-0000-0000-000000000000');

-- =====================================================================
-- abm_51 -- RECUPERACION DEL PRECIO B (objetivo_precios.precio_hora_b)
--
-- REGLA DE NEGOCIO (Juan, 31-jul-2026): el precio B sube SIEMPRE con el
-- mismo porcentaje que el A. Sin excepcion, ni siquiera en los objetivos
-- donde el B es MENOR que el A (7/2 y 19/3).
--
-- Dicho de otra forma, y es la forma en que lo calcula este script: la
-- razon B/A de un objetivo es CONSTANTE en el tiempo. Si el B sube el
-- mismo porcentaje que el A, la proporcion entre los dos no cambia nunca.
--
-- POR QUE HIZO FALTA: baseRow (js/pages/precios.js) armaba el payload del
-- upsert sin precio_hora_b. Como la columna no viajaba, la base la dejaba
-- como estaba. Eso produjo DOS sintomas de una sola causa:
--   a) filas que ya existian  -> el B quedo CONGELADO en su valor viejo.
--   b) filas nuevas creadas por una escala -> el B nacio en NULL.
-- El arreglo del codigo corta el problema hacia adelante; este script
-- repara lo que ya quedo mal.
--
-- MES ANCLA = 2026-07-01. Verificado con el bloque 2 (Juan, 31-jul-2026):
-- junio y julio comparten la MISMA razon B/A y el quiebre empieza en
-- AGOSTO. O sea que el B SI acompaño el aumento de julio; ese fue el
-- ultimo que impacto las dos columnas. Anclar en junio pisaria el valor
-- correcto de julio.
--   345/1  06: 1,3906 · 07: 1,3906 · 08: 1,3539 · 12: 1,2166
--   579/2  06: 1,0000 · 07: 1,0000 · 08: 0,9736 · 12: 0,8749
--
-- FORMULA, por objetivo y por mes, desde el ancla hacia adelante:
--   B[mes] = B[ancla] x ( A[mes] / A[ancla] )
-- Reconstruye exactamente la regla de negocio. No aproxima nada.
--
-- ALCANCE: solo los objetivos que tienen precio B EN EL MES ANCLA. Los que
-- no lo tienen no aparecen en la subconsulta "base" y no se tocan. El
-- aumento no puede inventarles un B, y un 0 escrito ahi seria peor que el
-- bug original.
--
-- DOS CASOS QUE QUEDAN AFUERA A PROPOSITO:
--   · 928/1 FOCIDA tiene B en UN SOLO mes (junio) y despues nada. Al no
--     tener B en julio queda fuera del update POR CONSTRUCCION, sin
--     necesidad de excluirlo a mano. Pendiente de definicion: ver el
--     bloque 6.
--   · 579/2 (ADINEZE) y 997/1 (ALBERDI) tienen el B IGUAL al A, razon
--     1,0000. Es un dato, no un problema: con la formula de la razon el B
--     sigue siendo igual al A, que es lo correcto.
--
-- ORDEN DE EJECUCION: este script va ANTES de publicar el arreglo del
-- codigo. Si el codigo sale primero, la proxima escala escala el B viejo
-- y el error deja de estar congelado para pasar a crecer.
--
-- Los bloques se corren DE A UNO. El bloque 4 (prueba) va ENTERO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOQUE 0 -- Red de seguridad. Correr ANTES que todo lo demas.
-- Deja una foto del estado actual, restaurable desde la pantalla.
-- ---------------------------------------------------------------------
select public.crear_precios_snapshot(
  to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD-HH24-MI'),
  'antes de recuperar el precio B (abm_51)'
);


-- ---------------------------------------------------------------------
-- BLOQUE 1 -- ALCANCE. Un renglon por objetivo con precio B.
--
-- ANOTAR LA CANTIDAD DE RENGLONES: el bloque 5(b) la usa para verificar
-- que el update no le agrego el B a ningun objetivo que no lo tenia.
--
-- Que mirar:
--   valores_b_distintos = 1  -> el B nunca se movio.
--   ultimo_mes_b            -> hasta donde llega el B cargado.
--   ultimo_mes_fila         -> hasta donde llegan las filas.
-- ---------------------------------------------------------------------
select s.codigo_objetivo,
       c.nombre                                                                as cliente,
       count(*) filter (where coalesce(p.precio_hora_b, 0) > 0)                as meses_con_b,
       count(distinct p.precio_hora_b) filter (where coalesce(p.precio_hora_b, 0) > 0)
                                                                               as valores_b_distintos,
       min(p.mes) filter (where coalesce(p.precio_hora_b, 0) > 0)              as primer_mes_b,
       max(p.mes) filter (where coalesce(p.precio_hora_b, 0) > 0)              as ultimo_mes_b,
       max(p.mes)                                                              as ultimo_mes_fila,
       count(*) filter (where p.precio_hora = 0)                               as meses_con_a_en_cero
  from public.objetivo_precios p
  join public.sucursales s on s.id = p.sucursal_id
  join public.clientes   c on c.id = p.cliente_id
 where p.sucursal_id in (select sucursal_id
                           from public.objetivo_precios
                          where coalesce(precio_hora_b, 0) > 0)
 group by s.codigo_objetivo, c.nombre
 order by s.codigo_objetivo;


-- ---------------------------------------------------------------------
-- BLOQUE 2 -- Detalle mes a mes con la RAZON B/A a la vista.
-- La razon es lo que hace visible el quiebre: se mantiene mientras el B
-- acompaña y empieza a caer apenas deja de hacerlo.
-- ---------------------------------------------------------------------
select s.codigo_objetivo,
       p.mes,
       p.precio_hora                                                as precio_a,
       p.precio_hora_b                                              as precio_b,
       round(p.precio_hora_b / nullif(p.precio_hora, 0), 4)         as razon_b_a,
       round(100 * (p.precio_hora / nullif(lag(p.precio_hora)
              over (partition by p.sucursal_id, p.tipo_servicio order by p.mes), 0) - 1), 2)
                                                                    as pct_a
  from public.objetivo_precios p
  join public.sucursales s on s.id = p.sucursal_id
 where p.sucursal_id in (select sucursal_id
                           from public.objetivo_precios
                          where coalesce(precio_hora_b, 0) > 0)
   and p.mes between date '2026-04-01' and date '2026-12-01'
 order by s.codigo_objetivo, p.mes;


-- ---------------------------------------------------------------------
-- BLOQUE 2b -- ¿EL ANCLA DE JULIO VALE PARA TODOS?
--
-- El B acompaño el aumento de julio, asi que la razon B/A tiene que ser la
-- MISMA en junio y en julio. Donde eso se cumple, anclar en julio o en
-- junio da el MISMO resultado: la formula solo usa la razon, asi que
-- recalcular julio desde junio lo reescribe identico, no lo pisa.
--
-- Esto resuelve el caso de los objetivos con UN SOLO valor de B, donde a
-- simple vista no se distingue si acompañaron o no:
--   · si su A subio en julio y el B no lo siguio -> la razon de julio CAE
--     respecto de la de junio, y se ve aca.
--   · si su A no subio en julio -> las dos razones coinciden, el B
--     correctamente no se movio, y el ancla da igual.
--
-- ESPERADO: veredicto = 'ancla julio OK' en todos.
-- Si alguno sale 'OJO', ese objetivo necesita un ancla anterior y hay que
-- tratarlo aparte ANTES de correr el bloque 4.
-- ---------------------------------------------------------------------
select s.codigo_objetivo,
       jun.precio_hora   as a_junio,  jun.precio_hora_b as b_junio,
       jul.precio_hora   as a_julio,  jul.precio_hora_b as b_julio,
       round(jun.precio_hora_b / nullif(jun.precio_hora, 0), 4) as razon_junio,
       round(jul.precio_hora_b / nullif(jul.precio_hora, 0), 4) as razon_julio,
       case
         when coalesce(jul.precio_hora_b, 0) = 0 then 'SIN B EN JULIO - queda afuera del update'
         when coalesce(jun.precio_hora_b, 0) = 0 then 'sin B en junio - revisar a mano'
         when round(jun.precio_hora_b / nullif(jun.precio_hora, 0), 4)
            = round(jul.precio_hora_b / nullif(jul.precio_hora, 0), 4)
              then 'ancla julio OK'
         else 'OJO: la razon cambio en julio - necesita ancla anterior'
       end as veredicto
  from public.objetivo_precios jul
  join public.sucursales s on s.id = jul.sucursal_id
  left join public.objetivo_precios jun
         on jun.sucursal_id   = jul.sucursal_id
        and jun.tipo_servicio = jul.tipo_servicio
        and jun.mes           = date '2026-06-01'
 where jul.mes = date '2026-07-01'
   and jul.sucursal_id in (select sucursal_id
                             from public.objetivo_precios
                            where coalesce(precio_hora_b, 0) > 0)
 order by s.codigo_objetivo;


-- ---------------------------------------------------------------------
-- BLOQUE 3 -- Cuantas filas va a tocar el update. Control de magnitud
-- antes de escribir: si este numero sorprende, parar.
-- ---------------------------------------------------------------------
select count(*) as filas_a_actualizar
  from public.objetivo_precios p
  join (select sucursal_id, tipo_servicio
          from public.objetivo_precios
         where mes = date '2026-07-01'
           and coalesce(precio_hora_b, 0) > 0
           and precio_hora > 0) b
    on b.sucursal_id = p.sucursal_id and b.tipo_servicio = p.tipo_servicio
 where p.mes > date '2026-07-01'
   and p.precio_hora > 0;


-- ---------------------------------------------------------------------
-- BLOQUE 4 -- PRUEBA CONTRA DATOS REALES, SIN GUARDAR NADA.
--
-- CORRER ENTERO, DE UNA SOLA VEZ. Si se corta a la mitad, el editor abre
-- otra sesion, el rollback no alcanza al update y quedan datos de prueba
-- en produccion.
--
-- Devuelve como quedaria cada mes, con la razon B/A al lado: tiene que
-- quedar CONSTANTE en toda la serie de cada objetivo.
--
-- LA FECHA DEL ANCLA APARECE DOS VECES EN ESTE BLOQUE. Cambiar LAS DOS.
-- ---------------------------------------------------------------------
begin;

with base as (
  select o.sucursal_id, o.tipo_servicio,
         o.precio_hora   as a_base,
         o.precio_hora_b as b_base
    from public.objetivo_precios o
   where o.mes = date '2026-07-01'
     and coalesce(o.precio_hora_b, 0) > 0
     and o.precio_hora > 0
)
update public.objetivo_precios p
   set precio_hora_b = round(b.b_base * (p.precio_hora / b.a_base), 2)
  from base b
 where p.sucursal_id   = b.sucursal_id
   and p.tipo_servicio = b.tipo_servicio
   and p.mes  > date '2026-07-01'
   and p.precio_hora > 0;   -- un mes con A en cero no se toca: dejaria el B en cero

select s.codigo_objetivo, p.mes,
       p.precio_hora                                        as precio_a,
       p.precio_hora_b                                      as precio_b,
       round(p.precio_hora_b / nullif(p.precio_hora, 0), 4) as razon_b_a
  from public.objetivo_precios p
  join public.sucursales s on s.id = p.sucursal_id
 where p.sucursal_id in (select sucursal_id
                           from public.objetivo_precios
                          where coalesce(precio_hora_b, 0) > 0)
   and p.mes >= date '2026-06-01'
 order by s.codigo_objetivo, p.mes;

rollback;


-- ---------------------------------------------------------------------
-- BLOQUE 5 -- EL UPDATE DEFINITIVO. Correr solo despues de revisar el 4.
-- Identico al del bloque 4, sin el begin/rollback.
--
-- LA FECHA DEL ANCLA APARECE DOS VECES EN ESTE BLOQUE. Cambiar LAS DOS.
-- ---------------------------------------------------------------------
with base as (
  select o.sucursal_id, o.tipo_servicio,
         o.precio_hora   as a_base,
         o.precio_hora_b as b_base
    from public.objetivo_precios o
   where o.mes = date '2026-07-01'
     and coalesce(o.precio_hora_b, 0) > 0
     and o.precio_hora > 0
)
update public.objetivo_precios p
   set precio_hora_b = round(b.b_base * (p.precio_hora / b.a_base), 2)
  from base b
 where p.sucursal_id   = b.sucursal_id
   and p.tipo_servicio = b.tipo_servicio
   and p.mes  > date '2026-07-01'
   and p.precio_hora > 0;


-- ---------------------------------------------------------------------
-- BLOQUE 6 -- VERIFICACION POSTERIOR.
--
-- (a) LA PRUEBA DE FUEGO: la razon B/A tiene que ser UNA SOLA por objetivo
--     de julio en adelante. Esperado: razones_distintas = 1 en todos (2 es
--     tolerable solo si razon_min y razon_max difieren en el 4to decimal,
--     que es el redondeo a 2 decimales del precio).
-- ---------------------------------------------------------------------
select s.codigo_objetivo,
       count(distinct round(p.precio_hora_b / p.precio_hora, 4)) as razones_distintas,
       min(round(p.precio_hora_b / p.precio_hora, 4))            as razon_min,
       max(round(p.precio_hora_b / p.precio_hora, 4))            as razon_max
  from public.objetivo_precios p
  join public.sucursales s on s.id = p.sucursal_id
 where coalesce(p.precio_hora_b, 0) > 0
   and p.precio_hora > 0
   and p.mes >= date '2026-07-01'
 group by s.codigo_objetivo
 order by s.codigo_objetivo;

-- ---------------------------------------------------------------------
-- (b) NADIE MAS fue tocado: esta cantidad tiene que ser IGUAL a la
--     cantidad de renglones que devolvio el bloque 1 (anotada antes de
--     correr el update).
-- ---------------------------------------------------------------------
select count(distinct sucursal_id) as objetivos_con_b
  from public.objetivo_precios
 where coalesce(precio_hora_b, 0) > 0;

-- ---------------------------------------------------------------------
-- (c) Ningun mes con A cargado puede quedar sin B, del ancla en adelante.
--     Esperado: solo 928/1 FOCIDA, que quedo afuera a proposito.
-- ---------------------------------------------------------------------
select s.codigo_objetivo, count(*) as meses_sin_b,
       min(p.mes) as desde, max(p.mes) as hasta
  from public.objetivo_precios p
  join public.sucursales s on s.id = p.sucursal_id
 where p.sucursal_id in (select sucursal_id
                           from public.objetivo_precios
                          where coalesce(precio_hora_b, 0) > 0)
   and p.mes > date '2026-07-01'
   and p.precio_hora > 0
   and coalesce(p.precio_hora_b, 0) = 0
 group by s.codigo_objetivo
 order by s.codigo_objetivo;


-- ---------------------------------------------------------------------
-- BLOQUE 7 -- 928/1 FOCIDA: NO CORRER TODAVIA.
--
-- Tiene B en un solo mes (junio) y despues nada, asi que no entra en el
-- patron de los demas y queda fuera del update de arriba.
--
-- La pregunta es de negocio, no de datos: ¿el servicio que se cobra con el
-- precio B de FOCIDA SIGUE VIGENTE, o termino en junio?
--   · Si termino  -> no se toca. El B de junio es un dato historico y
--     corresponde que los meses siguientes no tengan B.
--   · Si sigue    -> hay que extenderlo desde junio, y mientras no se haga
--     LIGE va a facturar ese servicio SIN el precio B (de menos).
--
-- Esta consulta da los elementos para decidir: si el A sigue cargado
-- despues de junio, el objetivo sigue activo.
-- ---------------------------------------------------------------------
select s.codigo_objetivo, c.nombre as cliente, p.mes, p.tipo,
       p.precio_hora as precio_a, p.precio_hora_b as precio_b
  from public.objetivo_precios p
  join public.sucursales s on s.id = p.sucursal_id
  join public.clientes   c on c.id = p.cliente_id
 where s.codigo_objetivo = '928/1'
 order by p.mes;

-- Si Juan define que el servicio SIGUE VIGENTE, correr este update: es el
-- mismo de arriba pero anclado en JUNIO y acotado a este objetivo.
-- MIENTRAS NO ESTE DEFINIDO, NO CORRERLO.
--
-- with base as (
--   select o.sucursal_id, o.tipo_servicio,
--          o.precio_hora as a_base, o.precio_hora_b as b_base
--     from public.objetivo_precios o
--     join public.sucursales s on s.id = o.sucursal_id
--    where s.codigo_objetivo = '928/1'
--      and o.mes = date '2026-06-01'
--      and coalesce(o.precio_hora_b, 0) > 0
--      and o.precio_hora > 0
-- )
-- update public.objetivo_precios p
--    set precio_hora_b = round(b.b_base * (p.precio_hora / b.a_base), 2)
--   from base b
--  where p.sucursal_id   = b.sucursal_id
--    and p.tipo_servicio = b.tipo_servicio
--    and p.mes  > date '2026-06-01'
--    and p.precio_hora > 0;

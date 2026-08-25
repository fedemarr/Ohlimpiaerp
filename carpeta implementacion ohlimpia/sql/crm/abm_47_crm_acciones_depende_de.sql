-- =====================================================================
-- CRM — de QUIEN DEPENDE cada proxima accion.
--
-- POR QUE ESTE SCRIPT EXISTE
-- La columna puede estar ya en la base, agregada a mano. Igual hace falta el
-- script: la regla del proyecto es que el repo refleje EXACTAMENTE lo que hay, y
-- sin esto, alguien que re-corra abm_39 recrea crm_acciones sin la columna.
--
-- Es idempotente de punta a punta: si ya existe no la toca, y la clasificacion
-- solo escribe donde esta en null. Si ya clasificaste a mano, no se pisa nada.
--
-- LAS DOS NATURALEZAS
--   'terceros' -> la pelota NO la tenemos: esperando al cliente, al Consejo, al
--                 coordinador. El caso esta frenado.
--   'nosotros' -> hay algo que hacer.
-- Con volumen son DOS PREGUNTAS DISTINTAS, y la segunda es la del lunes a la
-- manana: "que tengo que trabajar yo".
--
-- POR QUE UN CAMPO Y NO COLORES EN EL CSS
-- Un color no se puede contar, y la pregunta que importa necesita un where.
-- Ademas, con el criterio escrito en el codigo, cada accion nueva habria que
-- acordarse de pintarla; con el campo, la columna no deja nacer una accion sin
-- naturaleza declarada.
--
-- Correr BLOQUE POR BLOQUE. Ninguno borra nada.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — La columna
-- =====================================================================
alter table public.crm_acciones
  add column if not exists depende_de text;

alter table public.crm_acciones drop constraint if exists crm_acciones_depende_chk;
alter table public.crm_acciones add constraint crm_acciones_depende_chk
  check (depende_de is null or depende_de in ('nosotros', 'terceros'));

comment on column public.crm_acciones.depende_de is
  'De quien depende que el caso avance: terceros (esperando a alguien) o nosotros (hay algo que hacer). Es lo que responde "que tengo que trabajar yo". Null = sin clasificar.';

create index if not exists idx_crm_acciones_depende on public.crm_acciones (depende_de, activa);


-- =====================================================================
-- BLOQUE 2 — Clasificacion de las siete acciones
--
-- Solo donde esta en null: no pisa una clasificacion hecha a mano.
--
-- "Otro" QUEDA SIN CLASIFICAR A PROPOSITO. Es ambiguo —puede ser de cualquiera de
-- las dos— y la decision ya tomada es PARTIRLO EN DOS ("Otro - estoy esperando
-- algo" / "Otro - tengo algo que hacer"), no ponerle un valor por defecto: si
-- cayera siempre en "nosotros", inflaria justo el numero que arma la agenda del
-- lunes. Ese corte va junto con la revision de la lista con Comercial, para no
-- sembrar nombres que se van a renombrar el mismo dia.
--
-- Mientras siga en null, la pantalla lo muestra como "sin clasificar" y no entra
-- en ninguno de los dos filtros. Se ve, que es lo que corresponde.
-- =====================================================================
update public.crm_acciones set depende_de = 'terceros'
 where depende_de is null and nombre in (
   'Esperando respuesta del cliente',
   'A resolver con el Consejo',
   'A resolver con el Coordinador de Cuenta',
   'Esperando documentación del cliente'
 );

update public.crm_acciones set depende_de = 'nosotros'
 where depende_de is null and nombre in (
   'Enviar nueva propuesta al cliente',
   'Reenviar la nota'
 );


-- =====================================================================
-- BLOQUE 3 — VERIFICACION (solo lee)
-- =====================================================================

-- (a) Como quedo clasificada cada accion. Esperado: cuatro 'terceros', dos
--     'nosotros' y "Otro" en "(sin clasificar)".
select orden,
       nombre,
       coalesce(depende_de, '(sin clasificar)') as depende_de,
       activa
  from public.crm_acciones
 order by orden;

-- (b) Cuantos CASOS VIVOS hay de cada lado. Es la foto de la pregunta del lunes.
--     Los que caigan en "(sin clasificar)" son los que estan esperando el corte
--     de "Otro".
select coalesce(a.depende_de, '(sin clasificar)') as depende_de,
       count(*) as casos
  from public.crm_casos c
  left join public.crm_acciones a on a.id = c.proxima_accion_id
 where c.estado not in ('precerrada', 'cerrada')
   and c.proxima_accion_id is not null
 group by coalesce(a.depende_de, '(sin clasificar)')
 order by depende_de;

-- (c) Casos VIVOS SIN ninguna accion pendiente. No los muestra ningun filtro de
--     naturaleza porque no tienen naturaleza: estan vivos y sin agenda, que es el
--     estado que el diseno considera invisible. Si aparecen, conviene agendarlos.
select count(*) as vivos_sin_agenda
  from public.crm_casos c
 where c.estado not in ('precerrada', 'cerrada')
   and c.proxima_accion_id is null;

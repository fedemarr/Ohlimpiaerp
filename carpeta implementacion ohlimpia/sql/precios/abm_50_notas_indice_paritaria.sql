-- =====================================================================
-- notas_emitidas: indice por paritaria_id.
--
-- POR QUE
-- La columna "Nota" de la grilla de Precios se carga con cargarNotas()
-- (js/pages/precios.js), que trae TODAS las notas de una paritaria:
--     select ... from notas_emitidas where paritaria_id = <pid>
-- Eso corre en cada carga de la pantalla y cada vez que se cambia de
-- paritaria en el selector del encabezado. La tabla tenia indices por
-- escala_id y por cliente_id, pero NINGUNO por paritaria_id: verificado
-- en pg_indexes el 29-jul-2026. Sin indice, cada una de esas lecturas
-- recorre la tabla entera.
--
-- HONESTIDAD SOBRE EL BENEFICIO DE HOY
-- Con 94 filas esto no se nota, y es probable que el planificador ni
-- use el indice: a este tamano leer la tabla completa le sale mas barato
-- que pasar por el indice, y hace bien. El indice es para despues: la
-- tabla crece una tanda por paritaria (~300 filas cada una), y esta
-- consulta esta en el camino critico de la pantalla que Comercial abre
-- todos los dias. Se pone ahora porque cuesta casi nada y evita tener
-- que acordarse cuando ya moleste.
--
-- COSTO: una escritura extra por insert/update de la columna en una
-- tabla que se escribe de a tandas manuales, no continuamente. Nulo en
-- la practica.
--
-- POR QUE NO ES PARCIAL (where paritaria_id is not null)
-- Hoy todas las filas tienen paritaria_id cargado, asi que un indice
-- parcial no ahorraria nada y agregaria una condicion que el
-- planificador tiene que poder demostrar para usarlo.
--
-- Sin begin/commit. Idempotente.
-- =====================================================================
create index if not exists notas_emitidas_paritaria_idx
  on public.notas_emitidas (paritaria_id);


-- ---------------------------------------------------------------------
-- Verificacion (solo lectura): tiene que aparecer notas_emitidas_paritaria_idx.
-- ---------------------------------------------------------------------
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'notas_emitidas'
 order by indexname;

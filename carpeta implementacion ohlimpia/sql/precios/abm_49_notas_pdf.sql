-- =====================================================================
-- Notas de aumento — PASO 3: el PDF de cada nota SE GUARDA en Storage.
--
-- Hasta hoy el PDF se armaba en el navegador, se descargaba dentro de un
-- ZIP y se perdia: no quedaba copia de lo que se le mando al cliente.
-- Ahora cada PDF se sube al bucket finflow-docs y el PUNTERO al archivo
-- queda en notas_emitidas, igual que homologacion_path en paritarias y
-- logo_path / firma_path en notas_config.
--
-- El script hace DOS cosas:
--   BLOQUE 1 — regulariza el modelo que YA EXISTE en la base pero que
--              ningun archivo del repo creaba (paritaria_id, origen_id).
--   BLOQUE 2 — agrega las tres columnas del PDF.
--   BLOQUE 3 — verificacion.
--
-- IMPORTANTE — SOBRE LA BASE DE PRODUCCION EL BLOQUE 1 NO CAMBIA NADA.
-- Todo lo que toca ya existe: verificado el 29-jul-2026 contra
-- information_schema.columns y pg_constraint. Esta escrito para que una
-- base recreada desde el repo quede IGUAL a la real. Las columnas se
-- habian agregado a mano en algun momento y el repo no las tenia; quien
-- re-corriera abm_29 tal como estaba recreaba el modelo viejo y rompia
-- la generacion de casos del CRM (Pendiente_Finflow.txt).
--
-- QUE NO TOCA ESTE SCRIPT
--  - RLS y policies de la tabla: agregar columnas no cambia las
--    politicas de FILA. No hace falta tocarlas.
--  - Policies del bucket: las 4 de finflow-docs son por BUCKET COMPLETO,
--    no por carpeta (verificado en pg_policies el 29-jul-2026), asi que
--    la carpeta nueva de las notas se escribe sin permisos adicionales.
--  - No agrega un CHECK de "escala_id o paritaria_id no nulo": hoy la
--    base no lo tiene, y este script regulariza el repo, no cambia el
--    comportamiento de produccion. Si se decide agregarlo, va aparte.
--
-- Requiere abm_29_notas_estado.sql corrido antes (crea la tabla).
-- Sin begin/commit. Idempotente: se puede re-correr entero.
-- =====================================================================


-- =====================================================================
-- BLOQUE 1 — Modelo de DOS ORIGENES (escala o paritaria)
--
-- POR QUE escala_id ES NULLABLE
-- Una nota puede nacer de dos lados: de una ESCALA aplicada, o de
-- aumentos cargados A MANO con una paritaria activa. Estas ultimas son
-- las filas "virtuales": escala_id null y paritaria_id cargado. El
-- modelo original de abm_29 solo contemplaba el primer caso.
--
-- POR QUE origen_id ES UNA COLUMNA GENERADA
-- La regla real es "una nota por cliente por ORIGEN", sea ese origen una
-- escala o una paritaria. Con dos columnas nullables no hay unique que
-- lo exprese: unique (escala_id, cliente_id) deja pasar infinitas filas
-- con escala_id null, porque en SQL un null nunca choca con otro null.
-- coalesce(escala_id, paritaria_id) colapsa los dos casos en un solo
-- valor y ahi el unique si funciona.
-- GENERADA y no escrita por la app: asi no puede quedar desincronizada
-- de las dos columnas de las que sale.
-- =====================================================================
alter table public.notas_emitidas
  alter column escala_id drop not null;

alter table public.notas_emitidas
  add column if not exists paritaria_id uuid references public.paritarias(id) on delete cascade;

alter table public.notas_emitidas
  add column if not exists origen_id uuid generated always as (coalesce(escala_id, paritaria_id)) stored;

comment on column public.notas_emitidas.escala_id    is 'FK a escalas_aumento. NULL en las notas "virtuales" (aumentos cargados a mano, sin escala).';
comment on column public.notas_emitidas.paritaria_id is 'FK a paritarias. Es el origen de las notas virtuales y ademas permite listar todas las notas de una paritaria.';
comment on column public.notas_emitidas.origen_id    is 'Columna GENERADA = coalesce(escala_id, paritaria_id). Colapsa los dos origenes posibles en un solo valor para poder expresar el unique por cliente.';

-- El unique viejo (por escala) queda reemplazado por el de origen.
alter table public.notas_emitidas
  drop constraint if exists notas_emitidas_escala_cliente_uk;

-- "add constraint" no acepta "if not exists": hay que preguntar primero.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname  = 'notas_emitidas_origen_cliente_uk'
       and conrelid = 'public.notas_emitidas'::regclass
  ) then
    alter table public.notas_emitidas
      add constraint notas_emitidas_origen_cliente_uk unique (origen_id, cliente_id);
  end if;
end $$;


-- =====================================================================
-- BLOQUE 2 — El puntero al PDF
--
-- POR QUE TRES COLUMNAS Y NO UNA TABLA APARTE
-- Hay exactamente UNA nota por (origen, cliente) y UN PDF vigente por
-- nota. Una tabla hija solo tendria sentido para guardar el historial de
-- versiones, y se decidio NO guardarlo (ver abajo).
--
-- QUE PASA AL REGENERAR UNA NOTA (decision del 29-jul-2026)
-- pdf_path pasa a apuntar al PDF nuevo y el anterior queda en Storage
-- SIN puntero. Es deliberado, no un descuido. No necesitamos consultar
-- versiones viejas, y el archivo viejo no se pierde ni se pisa: toda
-- subida del sistema es inmutable (path unico + upsert:false). A ~70 KB
-- por nota, el espacio que ocupan los huerfanos es irrelevante. Si algun
-- dia hiciera falta el historial, los archivos siguen estando.
--
-- POR QUE pdf_subido_en Y NO ALCANZA CON pdf_path
-- Distingue "nunca se subio" de "se subio y algo le paso al puntero", y
-- deja ver cuanto despues de generarse se subio cada uno (la reparacion
-- sube tarde, y eso importa: regenera con los precios de ESE momento).
--
-- No se guardan mime (siempre application/pdf) ni bytes (no se usan).
-- =====================================================================
alter table public.notas_emitidas
  add column if not exists pdf_path      text,
  add column if not exists pdf_nombre    text,
  add column if not exists pdf_subido_en timestamptz;

comment on column public.notas_emitidas.pdf_path      is 'Path del PDF dentro del bucket finflow-docs. NULL = la nota se genero pero el archivo no quedo guardado (lo repara el boton "Subir" de la columna PDF).';
comment on column public.notas_emitidas.pdf_nombre    is 'Nombre original del archivo (CUIT - Nombre.pdf), para mostrar y para la descarga.';
comment on column public.notas_emitidas.pdf_subido_en is 'Cuando se subio el PDF a Storage. Puede ser MUY posterior a fecha_generada si se subio con el boton de reparacion.';

-- Un archivo pertenece a UNA sola nota. El path ya es unico por
-- construccion (timestamp + azar), asi que este unique no atrapa choques
-- naturales: atrapa un bug del codigo que escriba el mismo puntero en
-- dos filas. Los null no chocan entre si, asi que las notas todavia sin
-- PDF no se estorban. Misma convencion que crm_gestion_adjuntos.path.
create unique index if not exists notas_emitidas_pdf_path_uk
  on public.notas_emitidas (pdf_path);


-- ---------------------------------------------------------------------
-- BLOQUE 3 — Verificacion (solo lectura)
-- ---------------------------------------------------------------------
-- (a) Las tres columnas del PDF existen, y origen_id sigue siendo generada.
select column_name, data_type, is_nullable, is_generated, generation_expression
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notas_emitidas'
 order by ordinal_position;

-- (b) Constraints: tiene que estar notas_emitidas_origen_cliente_uk y NO
--     tiene que estar notas_emitidas_escala_cliente_uk.
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.notas_emitidas'::regclass
 order by conname;

-- (c) Indices. Ademas del unique nuevo del pdf_path, mirar si paritaria_id
--     tiene indice: la columna Nota de la grilla filtra por paritaria_id en
--     cada carga. Si no aparece ninguno, decidir aparte si conviene crearlo.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'notas_emitidas'
 order by indexname;

-- (d) Cuantas notas ya generadas quedaron sin PDF. Antes de que el codigo
--     nuevo entre en produccion tienen que ser TODAS: nunca se guardo uno.
select count(*) filter (where fecha_generada is not null)                        as generadas,
       count(*) filter (where fecha_generada is not null and pdf_path is null)    as sin_pdf,
       count(*) filter (where pdf_path is not null)                              as con_pdf
  from public.notas_emitidas;

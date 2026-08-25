-- =====================================================================
-- Grupos de clientes — cambio de modelo: 1 cliente pertenece a UN grupo.
--
-- El modelo M:N (grupos_clientes_detalle) se descarta: ahora el grupo es
-- un campo del cliente (clientes.grupo_id). Un cliente pertenece a un solo
-- grupo, o a ninguno (null). La tabla grupos_clientes se mantiene.
--
-- VERIFICADO (read-only) antes de escribir esto: grupos_clientes_detalle
-- esta VACIA (*/0), asi que el DROP no pierde datos.
--
-- Sin begin/commit. Idempotente donde aplica.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) clientes.grupo_id  (FK a grupos_clientes; on delete set null)
-- ---------------------------------------------------------------------
alter table public.clientes
  add column if not exists grupo_id uuid
  references public.grupos_clientes(id) on delete set null;

comment on column public.clientes.grupo_id is
  'Grupo de clientes al que pertenece (para aplicar escalas de paritaria). Un cliente pertenece a un solo grupo, o a ninguno (null).';

-- 2) indice por grupo (para listar/filtrar los clientes de un grupo)
create index if not exists idx_clientes_grupo on public.clientes (grupo_id);


-- ---------------------------------------------------------------------
-- 3) grupos_clientes: se mantiene (id, nombre, descripcion, activo). No se toca.
-- 4) grupos_clientes_detalle: ya no se usa -> se borra (verificada vacia).
-- ---------------------------------------------------------------------
drop table if exists public.grupos_clientes_detalle;


-- ---------------------------------------------------------------------
-- 5) Verificacion
-- ---------------------------------------------------------------------
-- (a) clientes ahora tiene grupo_id
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'clientes' and column_name = 'grupo_id';

-- (b) grupos_clientes_detalle ya NO existe (esperado: 0 filas)
select count(*) as detalle_existe
  from information_schema.tables
 where table_schema = 'public' and table_name = 'grupos_clientes_detalle';

-- (c) grupos_clientes sigue existiendo
select count(*) as grupos_existe
  from information_schema.tables
 where table_schema = 'public' and table_name = 'grupos_clientes';

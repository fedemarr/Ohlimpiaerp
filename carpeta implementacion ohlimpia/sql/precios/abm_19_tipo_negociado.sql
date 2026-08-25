-- =====================================================================
-- Etapa A — objetivo_precios: ampliar el CHECK de 'tipo' con 'negociado'.
--   real      = mes cerrado, ya facturado.
--   negociado = mes futuro con precio YA acordado con el cliente (firme).
--   proyectado= mes futuro estimado (no negociado aun).
-- Solo se AMPLIA el CHECK (tabla vacia); ningun dato existente puede violarlo.
-- Sin begin/commit.
-- =====================================================================

-- PREVIA: definicion actual del CHECK (esperado: tipo in ('real','proyectado'))
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where contype='c' and conrelid = 'public.objetivo_precios'::regclass;

alter table public.objetivo_precios drop constraint if exists objetivo_precios_tipo_check;
alter table public.objetivo_precios add constraint objetivo_precios_tipo_check
  check (tipo in ('real','negociado','proyectado'));

-- POSTERIOR: CHECK ampliado (esperado: tipo in ('real','negociado','proyectado'))
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where contype='c' and conrelid = 'public.objetivo_precios'::regclass;

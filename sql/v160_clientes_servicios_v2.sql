-- v160: CLIENTES_SERVICIOS_v2_para_Fede.md — modal Nuevo cliente de 4 a 3
-- tabs, "Coordinador de cuenta" reemplaza a "Responsable", "Tipo de
-- factura" reemplaza a "Categoría ARCA", y el patrón "Heredar del
-- cliente" del servicio se extiende (cláusula de actualización,
-- coordinador de cuenta, período de facturación, requiere OC, modelo de
-- precio) con estado propio por objetivo (heredado jsonb).
--
-- Aditivo, no destructivo: NO se borran arca/ingresos_brutos/
-- jurisdiccion_iibb/logo/responsable* — el form deja de usarlos, pero la
-- columna se queda por si hay algo que todavía la lee (no encontramos
-- nada al investigar, pero no cuesta nada dejarla).
BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS coordinador_cuenta          text,
  ADD COLUMN IF NOT EXISTS coordinador_cuenta_tipo      text,
  ADD COLUMN IF NOT EXISTS coordinador_cuenta_contacto  text,
  ADD COLUMN IF NOT EXISTS tipo_factura                 text;

-- "Responsable" → "Coordinador de cuenta" es un rename con continuidad de
-- dato, no un campo nuevo desde cero (al momento de este ticket, 1 solo
-- cliente real tenía responsable cargado) — se migra el valor existente.
UPDATE public.clientes
SET coordinador_cuenta = responsable,
    coordinador_cuenta_tipo = COALESCE(responsable_tipo, 'Interno'),
    coordinador_cuenta_contacto = responsable_contacto
WHERE responsable IS NOT NULL AND responsable <> '' AND coordinador_cuenta IS NULL;

ALTER TABLE public.objetivos
  ADD COLUMN IF NOT EXISTS coordinador_cuenta  text,
  ADD COLUMN IF NOT EXISTS heredado            jsonb;

COMMIT;

-- Verificación:
--   select column_name from information_schema.columns where table_name='clientes' and column_name like 'coordinador%' or column_name='tipo_factura';
--   select column_name from information_schema.columns where table_name='objetivos' and column_name in ('coordinador_cuenta','heredado');
--   select id_local, responsable, coordinador_cuenta, coordinador_cuenta_tipo from public.clientes where coordinador_cuenta is not null;

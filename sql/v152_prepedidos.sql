-- v152: ALTA_CLIENTE_SERVICIO_para_Fede_1.md (bloque 5) — 📥 Bandeja de PREPEDIDOS.
--
-- El alta del servicio SIEMBRA el pedido de personal: cuando un servicio entra
-- a "Pendiente asignación operativa" nace su prepedido con la dotación del
-- alta (Personal necesario, una vacante por persona). Operaciones decide por
-- vacante: cubrir con interno (Reasignaciones) o incorporar (pedido normal).
--
-- Lo que se PERSISTE en `prepedidos` es el encabezado + una foto de las
-- vacantes al nacer (puesto, horario, días, tipo, perfil, obs). El ESTADO de
-- cada vacante NO se guarda acá: se DERIVA de los registros vinculados
-- (reasignaciones.prepedido_id_local/prepedido_vacante y
-- pedidos.prepedido_id_local/prepedido_vacante), así hay una sola fuente de
-- verdad y una reasignación rechazada/anulada o un pedido cancelado devuelven
-- la vacante a "esperando decisión" solos.
--
-- Un prepedido por servicio (objetivo_id_local UNIQUE): dar de baja y
-- reactivar el servicio reutiliza el mismo. id_local = últimos 9 dígitos del
-- id del objetivo (upsert idempotente, mismo criterio que mono_tramites).
BEGIN;

CREATE TABLE IF NOT EXISTS public.prepedidos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text UNIQUE NOT NULL,
  numero           integer,
  objetivo_id_local text UNIQUE NOT NULL,
  servicio_codigo  text,
  servicio_nombre  text,
  fecha_alta       date,
  creado_por       text,
  vacantes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  anulado          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prepedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.prepedidos;
CREATE POLICY "Solo usuarios autenticados" ON public.prepedidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vínculo vacante → pedido (Incorporar) y vacante → reasignación (Cubrir con interno).
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS prepedido_id_local text,
  ADD COLUMN IF NOT EXISTS prepedido_vacante  integer;

ALTER TABLE public.reasignaciones
  ADD COLUMN IF NOT EXISTS prepedido_id_local text,
  ADD COLUMN IF NOT EXISTS prepedido_vacante  integer;

COMMIT;

-- Verificación:
--   select column_name from information_schema.columns where table_name='prepedidos';
--   select column_name from information_schema.columns where table_name in ('pedidos','reasignaciones') and column_name like 'prepedido%';

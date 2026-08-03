-- v054_comisiones_v1.sql
-- DELTA_comisiones_v1 (30/07/2026). Módulo NUEVO: cuenta corriente de
-- comisiones por persona (interna de Legajos o externa) que trae ventas.
--
-- La ASIGNACIÓN de quién cobra comisión en cada servicio vive dentro del
-- propio objetivo (jsonb, igual que puestos/responsables/adjuntos) —
-- 'objetivos' es una tabla real con datos en uso, así que el cambio es
-- puramente aditivo (ADD COLUMN IF NOT EXISTS).
--
-- Tres tablas nuevas, ninguna existía antes (a diferencia de facturas/
-- cobros/leads/propuestas_precios en deltas anteriores, que ya estaban
-- creadas a mano en producción):
--   comisiones_externos — mini-registro de personas que no están en Legajos.
--   comisiones_devengos — libro mayor: una fila por factura×comisión,
--     con su ciclo de vida Devengada → Disponible → Pagada.
--   comisiones_pagos — historial de pagos a cada persona, con el detalle
--     de a qué devengos se aplicó cada pago (trazabilidad, tanto en modo
--     FIFO automático como en modo manual/avanzado).

BEGIN;

ALTER TABLE public.objetivos ADD COLUMN IF NOT EXISTS comisiones jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.comisiones_externos (
  id           bigint generated always as identity primary key,
  id_local     text UNIQUE NOT NULL,
  nombre       text NOT NULL,
  dni          text,
  tel          text,
  mail         text,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comisiones_devengos (
  id                 bigint generated always as identity primary key,
  id_local           text UNIQUE NOT NULL,
  comision_id        bigint,
  objetivo_id        bigint,
  objetivo_cod       text,
  objetivo_nombre    text,
  cliente_id         bigint,
  cliente_nombre     text,
  persona_tipo       text,
  persona_ref        text,
  persona_nombre     text,
  factura_id         bigint,
  nro_factura        text,
  periodo            text,
  monto_base         numeric DEFAULT 0,
  pct                numeric DEFAULT 0,
  monto_comision     numeric DEFAULT 0,
  estado             text NOT NULL DEFAULT 'Devengada',
  fecha_devengo      text,
  fecha_disponible   text,
  fecha_pago         text,
  monto_pagado       numeric DEFAULT 0,
  saldo              numeric DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comisiones_devengos_persona ON public.comisiones_devengos(persona_tipo, persona_ref);
CREATE INDEX IF NOT EXISTS idx_comisiones_devengos_factura ON public.comisiones_devengos(factura_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_devengos_comision ON public.comisiones_devengos(comision_id);

CREATE TABLE IF NOT EXISTS public.comisiones_pagos (
  id                 bigint generated always as identity primary key,
  id_local           text UNIQUE NOT NULL,
  persona_tipo       text,
  persona_ref        text,
  persona_nombre     text,
  monto              numeric DEFAULT 0,
  fecha              text,
  referencia         text,
  modo               text NOT NULL DEFAULT 'FIFO',
  aplicaciones       jsonb NOT NULL DEFAULT '[]'::jsonb,
  registrado_por     text,
  registrado_en      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comisiones_pagos_persona ON public.comisiones_pagos(persona_tipo, persona_ref);

COMMIT;

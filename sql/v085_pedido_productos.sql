-- v085_pedido_productos.sql
-- Módulo "Pedido de Productos" (Logística) — diseño Lautaro + Claude web,
-- 11/07/2026 (docs/MODULO_PEDIDO_PRODUCTOS.md). Reemplaza la planilla Excel
-- de pedido mensual de productos/insumos por servicio.
--
-- Prefijo pp_ en todas las tablas a propósito: ya existe una tabla `pedidos`
-- (Pedidos de personal, Selección) — sin el prefijo "pedidos_productos"
-- pisaría ese nombre a la primera de cambio.
--
-- Se sigue la convención del proyecto (id_local text + anulado + auditoría
-- en texto/timestamptz, no las relaciones uuid del documento de diseño
-- original) porque el resto del sistema no usa auth.uid()/FKs uuid reales —
-- usa nombres de persona en texto para "quién hizo qué" (mismo patrón que
-- cargadoPor/resueltoPor en otros módulos). El id_local sigue siendo la
-- identidad real de cada fila para supaSync().

BEGIN;

-- ========== 1. Períodos ==========
-- El "mes habilitado" — interruptor general (§4.1 del diseño).
CREATE TABLE public.pp_periodos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text UNIQUE NOT NULL,

  mes           text NOT NULL,                    -- YYYY-MM
  estado        text NOT NULL DEFAULT 'abierto',   -- abierto / cerrado
  abierto_por   text,
  abierto_en    text,
  cerrado_en    text,

  anulado       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_pp_periodos_mes ON public.pp_periodos(mes) WHERE NOT anulado;

-- ========== 2. Catálogo maestro de productos ==========
-- Una sola vez en todo el sistema (§4.3). El id_local es la identidad
-- interna estable; codigo_monica es solo la llave para cruzar con el
-- sistema externo Mónica, frágil y no usada como identidad (el propio
-- diseño documenta inconsistencias reales: "100006", "1000006", "10000088").
CREATE TABLE public.pp_productos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text UNIQUE NOT NULL,

  codigo_monica   text,
  descripcion     text NOT NULL,
  tipo_uso        text NOT NULL DEFAULT 'normal',  -- apertura / tratamiento_piso / con_autorizacion / normal

  anulado         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_productos_tipo_uso ON public.pp_productos(tipo_uso) WHERE NOT anulado;

-- ========== 3. Precios con vigencia temporal ==========
-- El costo NO vive en el producto — vive acá con fecha (§4.4, A.6). Un
-- aumento crea un registro nuevo con vigencia_desde y cierra el anterior
-- con vigencia_hasta; no pisa el precio con el que ya se calculó un pedido
-- pasado. Una corrección de error sí modifica el registro existente.
CREATE TABLE public.pp_precios (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  producto_id_local text NOT NULL,
  costo_unit        numeric(12,2) NOT NULL DEFAULT 0,
  vigencia_desde    text NOT NULL,   -- YYYY-MM-DD
  vigencia_hasta    text,            -- NULL = vigente

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_precios_producto ON public.pp_precios(producto_id_local) WHERE NOT anulado;

-- ========== 4. Pedido (planilla de un servicio en un mes) ==========
-- facturacion_neta y porcentaje_tope quedan CONGELADOS al abrir el pedido
-- (§4.2) — una corrección futura en Comercial no debe recalcular el tope
-- de un mes ya cerrado (A.6, distinción corrección vs. vigencia aplicada
-- entre módulos).
CREATE TABLE public.pp_pedidos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  periodo_id_local  text NOT NULL,
  servicio_codigo   text NOT NULL,   -- código canónico del servicio (DB.objetivos.codigo), texto libre como en el resto del app

  facturacion_neta  numeric(14,2) NOT NULL DEFAULT 0,
  porcentaje_tope   numeric(6,4) NOT NULL DEFAULT 0.06,

  estado            text NOT NULL DEFAULT 'borrador',
    -- borrador / cerrado_supervisor / en_auditoria / autorizado / en_compra / entregado
  tipo_pedido       text NOT NULL DEFAULT 'mensual',  -- mensual / extraordinario (previsto, sin uso en v1 — §5)
  supervisor        text,             -- nombre del supervisor del servicio al momento de abrir el pedido

  cerrado_por       text,
  cerrado_en        text,
  auditado_por      text,
  auditado_en       text,
  autorizado_por    text,
  autorizado_en     text,
  en_compra_en      text,
  entregado_en      text,

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_pp_pedidos_periodo_serv ON public.pp_pedidos(periodo_id_local, servicio_codigo) WHERE NOT anulado;
CREATE INDEX idx_pp_pedidos_estado ON public.pp_pedidos(estado) WHERE NOT anulado;

-- ========== 5. Ítems del pedido ==========
-- cant_solicitada (supervisor) y cant_autorizada (auditor) son dos campos
-- separados a propósito (§4.5, A.7): el auditor ajusta sin pisar lo que
-- pidió el supervisor, así queda trazabilidad completa del recorte para
-- cuando se prenda la notificación al supervisor (fuera de alcance v1).
-- costo_congelado se copia del precio vigente al cerrar el pedido — el
-- total nunca se guarda (§4.6), se calcula sumando cantidad × costo acá.
CREATE TABLE public.pp_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,

  pedido_id_local     text NOT NULL,
  producto_id_local   text NOT NULL,

  cant_solicitada     numeric(10,2) NOT NULL DEFAULT 0,
  cant_autorizada     numeric(10,2),           -- NULL hasta que pasa por auditoría
  costo_congelado     numeric(12,2) NOT NULL DEFAULT 0,

  ajustado_por        text,
  ajustado_en         text,
  cant_antes_ajuste   numeric(10,2),           -- valor previo al recorte del auditor (auditoría del cambio)

  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_pp_items_pedido_prod ON public.pp_items(pedido_id_local, producto_id_local) WHERE NOT anulado;
CREATE INDEX idx_pp_items_pedido ON public.pp_items(pedido_id_local) WHERE NOT anulado;

-- ========== RLS ==========
-- Mismo criterio que el resto del sistema (FOR ALL TO authenticated) — el
-- control real de "quién puede hacer qué en cada estado" se hace en la app
-- (currentUser.perfil), no a nivel de fila en la base. Gap pre-existente en
-- todo el sistema, no específico de este módulo.
ALTER TABLE public.pp_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_periodos_all  ON public.pp_periodos  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pp_productos_all ON public.pp_productos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pp_precios_all   ON public.pp_precios   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pp_pedidos_all   ON public.pp_pedidos   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pp_items_all     ON public.pp_items     FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

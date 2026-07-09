-- =============================================================================
-- Migración: v032 — Módulo Uniformes v2 (rediseño completo)
-- Fecha:     2026-07-08
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_uniformes.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el modelo simple de v024 (tabla `uniformes`, sin ciclo de
-- estados) por el modelo rico que pide DISENO_uniformes.md: 6 tablas,
-- 15 estados con doble handshake (Logística → RRHH → Supervisor),
-- precios con vigencia temporal, descuentos en 4 cuotas y devoluciones
-- por baja. La tabla vieja `uniformes` queda intacta como archivo
-- histórico (decisión del usuario) — el módulo nuevo arranca en blanco.
--
-- DISENO_uniformes.md pedía nombrar este script v017_uniformes.sql,
-- pero v017 ya existe (otra migración real, de monotributos/uniformes
-- v1/retenciones). La migración real más reciente es v031. Se usa v032.
--
-- Correcciones respecto al SQL literal del diseño (§4.2), verificadas
-- contra el estado real del repo:
--   - constancia_firmada_adjunto_id_local / constancia_policial_adjunto_id_local
--     (text) -> constancia_firmada_adjunto_id / constancia_policial_adjunto_id
--     (bigint). subirAdjunto() (src/shared/adjuntos.js) nunca completa
--     la columna id_local de la tabla adjuntos (queda NULL siempre) —
--     el identificador real y estable es adjuntos.id (bigserial).
--   - Se agrega alerta_handshake_enviada a pedidos_uniformes, para no
--     duplicar el aviso de "24hs sin confirmar" cada vez que alguien
--     abre el módulo (el diseño no contempla esto).
--   - Se agrega RLS + policy "Solo usuarios autenticados" a las 6
--     tablas (mismo patrón que v027/v030) — el diseño no incluye RLS.
--
-- También en este script (fuera de las 6 tablas nuevas):
--   - ALTER TABLE legajos: agrega talles_uniforme jsonb (sin backfill;
--     el cliente resuelve el talle inicial de Ambo/Zapatos leyendo los
--     campos existentes legajo.ambo / legajo.calzado como fallback).
--   - ALTER TABLE adjuntos: amplía los CHECK de etapa/tipo para que
--     Uniformes pueda reusar la tabla de adjuntos ya existente
--     (constancia firmada, denuncia policial de robo).
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — pedidos_uniformes (registro central del ciclo)
-- ============================================================
CREATE TABLE public.pedidos_uniformes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  -- Operario
  legajo_id_local        text NOT NULL,
  nro_socio               text NOT NULL,
  nombre_operario         text NOT NULL,
  servicio               text NOT NULL,
  supervisor_asignado     text NOT NULL,

  -- Origen del pedido
  origen                 text NOT NULL,
    -- 'Supervisor' / 'Auditoría' / 'Asociado directo' / 'RRHH - Ingreso'
  solicitado_por          text NOT NULL,
  fecha_solicitud         timestamptz NOT NULL DEFAULT now(),

  -- Motivo
  motivo                 text NOT NULL,
  con_descuento           boolean NOT NULL,

  -- Estado (15 estados, ver DISENO_uniformes.md §11.1)
  estado                 text NOT NULL DEFAULT 'Borrador',

  -- Autorización RRHH (1 -> 2 -> 3)
  autorizado_por_rrhh     text,
  fecha_autorizacion      timestamptz,
  motivo_rechazo          text,

  -- Traspaso Logística <-> RRHH (3 -> 4 -> 5 -> 6)
  fecha_recibido_logistica        timestamptz,
  logistica_recibe_por            text,
  fecha_enviado_por_logistica     timestamptz,
  logistica_envia_por             text,
  fecha_recibido_por_rrhh         timestamptz,
  rrhh_recibe_por                 text,

  -- Traspaso RRHH <-> Supervisor (6 -> 7 -> 8)
  fecha_retirado_supervisor       timestamptz,
  rrhh_entrega_a_supervisor_por   text,
  fecha_confirmado_por_supervisor timestamptz,
  supervisor_confirma_por         text,

  -- Entrega al operario con firma (8 -> 9)
  fecha_entrega_operario          timestamptz,
  supervisor_entrega_por          text,
  constancia_firmada_adjunto_id   bigint,

  -- Devolución de constancia + uniforme viejo (9 -> 10 -> 11)
  fecha_devolucion_supervisor     timestamptz,
  supervisor_devuelve_por         text,
  fecha_cierre                    timestamptz,
  rrhh_cierra_por                 text,

  -- Cancelación (1/2 -> 13)
  fecha_cancelacion               timestamptz,
  cancelado_por                   text,
  motivo_cancelacion              text,

  -- Vencimientos (9 -> 14 -> 15)
  fecha_vencido                   timestamptz,
  vencido_constancia              boolean NOT NULL DEFAULT false,
  vencido_uniforme_viejo          boolean NOT NULL DEFAULT false,
  fecha_descuento_incumplimiento  timestamptz,
  descuento_aplicado_por          text,
  descuento_incumplimiento_motivo text,
  descuento_incumplimiento_monto  numeric(10,2),

  -- Robo (constancia policial opcional)
  constancia_policial_adjunto_id  bigint,

  -- Devolución incompleta del kit viejo
  falto_prenda_kit_devuelto       boolean NOT NULL DEFAULT false,
  prendas_faltantes_devolucion    text,

  -- Alertas de 24hs sin duplicar (gap detectado, no está en el diseño)
  alerta_handshake_enviada        boolean NOT NULL DEFAULT false,

  observaciones                   text,
  editado_por                     text,
  editado_en                      timestamptz,
  anulado                         boolean NOT NULL DEFAULT false,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pu_legajo     ON public.pedidos_uniformes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_pu_estado     ON public.pedidos_uniformes(estado) WHERE NOT anulado;
CREATE INDEX idx_pu_solicit    ON public.pedidos_uniformes(fecha_solicitud) WHERE NOT anulado;
CREATE INDEX idx_pu_supervisor ON public.pedidos_uniformes(supervisor_asignado) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — pedido_uniforme_prendas (N prendas por pedido)
-- ============================================================
CREATE TABLE public.pedido_uniforme_prendas (
  id                          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                    text UNIQUE NOT NULL,
  pedido_id_local              text NOT NULL,
  prenda                      text NOT NULL,
  talle                       text NOT NULL,
  cantidad                    integer NOT NULL,
  precio_unitario_congelado    numeric(10,2),
  precio_id_local_referencia   text,
  anulado                     boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pup_pedido ON public.pedido_uniforme_prendas(pedido_id_local) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — pedido_uniforme_eventos (auditoría de transiciones)
-- ============================================================
CREATE TABLE public.pedido_uniforme_eventos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text UNIQUE NOT NULL,
  pedido_id_local  text NOT NULL,
  estado_desde     text,
  estado_hasta     text NOT NULL,
  ejecutado_por    text NOT NULL,
  ejecutado_en     timestamptz NOT NULL DEFAULT now(),
  observaciones   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pue_pedido ON public.pedido_uniforme_eventos(pedido_id_local);

-- ============================================================
-- Tabla 4 — precios_uniformes (catálogo con vigencia temporal)
-- ============================================================
CREATE TABLE public.precios_uniformes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text UNIQUE NOT NULL,
  prenda          text NOT NULL,
  talle           text,
  precio          numeric(10,2) NOT NULL,
  vigencia_desde   date NOT NULL,
  vigencia_hasta   date,
  cargado_por      text NOT NULL,
  motivo_carga     text,
  anulado         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_precios_prenda   ON public.precios_uniformes(prenda) WHERE NOT anulado;
CREATE INDEX idx_precios_vigencia ON public.precios_uniformes(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- Tabla 5 — descuentos_uniforme_pendientes (compromisos para Liquidaciones)
-- ============================================================
CREATE TABLE public.descuentos_uniforme_pendientes (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,
  pedido_id_local      text NOT NULL,
  legajo_id_local      text NOT NULL,
  monto_total          numeric(10,2) NOT NULL,
  cuotas_totales       integer NOT NULL DEFAULT 4,
  cuotas_cobradas      integer NOT NULL DEFAULT 0,
  monto_cuota          numeric(10,2) NOT NULL,
  fecha_generado       timestamptz NOT NULL DEFAULT now(),
  fecha_primera_cuota   date,
  fecha_ultima_cuota    date,
  estado               text NOT NULL DEFAULT 'En curso',
  motivo_generacion     text,
  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dup_legajo ON public.descuentos_uniforme_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_dup_estado ON public.descuentos_uniforme_pendientes(estado) WHERE NOT anulado;

-- ============================================================
-- Tabla 6 — devoluciones_por_baja
-- ============================================================
CREATE TABLE public.devoluciones_por_baja (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text UNIQUE NOT NULL,
  legajo_id_local      text NOT NULL,
  nombre_operario      text NOT NULL,
  fecha_baja           date NOT NULL,
  fecha_generada       timestamptz NOT NULL DEFAULT now(),
  prendas_a_devolver    jsonb NOT NULL,
  estado               text NOT NULL DEFAULT 'Pendiente devolución',
  fecha_confirmada     timestamptz,
  confirmada_por       text,
  prendas_devueltas    jsonb,
  monto_descuento      numeric(10,2),
  observaciones        text,
  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dpb_legajo ON public.devoluciones_por_baja(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_dpb_estado ON public.devoluciones_por_baja(estado) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que v027/v030 (solo usuarios autenticados)
-- ============================================================
ALTER TABLE public.pedidos_uniformes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_uniformes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pedido_uniforme_prendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pedido_uniforme_prendas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pedido_uniforme_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pedido_uniforme_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.precios_uniformes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.precios_uniformes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.descuentos_uniforme_pendientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.descuentos_uniforme_pendientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.devoluciones_por_baja ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.devoluciones_por_baja
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- ALTER legajos — talle por prenda (Chomba/Grafa/Ambo/Polar/Campera/Zapatos)
-- ============================================================
-- Sin backfill: el cliente resuelve el valor inicial de 'ambo' y
-- 'zapatos' leyendo legajo.ambo / legajo.calzado si talles_uniforme
-- viene vacío o no tiene esa clave todavía.
ALTER TABLE public.legajos ADD COLUMN IF NOT EXISTS talles_uniforme jsonb;

-- ============================================================
-- ALTER adjuntos — reusar la tabla existente para constancia
-- firmada y denuncia policial de robo (Uniformes)
-- ============================================================
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_etapa_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_etapa_check
  CHECK (etapa in (
    'psicotecnico',
    'preocupacional',
    'documentacion',
    'alta',
    'uniformes'
  ));

ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_tipo_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_tipo_check
  CHECK (tipo in (
    'informe-psico',
    'apto-medico',
    'no-apto',
    'antecedente',
    'libreta',
    'curso',
    'dni-frente',
    'dni-dorso',
    'foto-rostro',
    'monotributo',
    'inaes',
    'certificado-capacitacion',
    'constancia-uniforme',
    'denuncia-policial-uniforme'
  ));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

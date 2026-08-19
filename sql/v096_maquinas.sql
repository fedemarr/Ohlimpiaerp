-- v096_maquinas.sql
-- Módulo Máquinas: padrón, movimientos de ubicación, tickets de reparación
-- e historial de etapas de tickets.
--
-- Diseñado para recibir import del Anexo 053 (43 máquinas, historial
-- 2020-2026) cuando Lautaro lo autorice.
--
-- flujo de estados de máquina:
--   ACTIVA → DEPÓSITO → EN_REPARACIÓN → ACTIVA (ciclo normal)
--   cualquiera → BAJA (con motivo tipificado, conserva historial)
--
-- flujo de ticket (5 etapas):
--   REPORTE → ANÁLISIS_REMOTO → VISITA_INTERNA → PROVEEDOR → FACTURA → CERRADO

BEGIN;

-- ========== 1. PADRÓN DE MÁQUINAS ==========
CREATE TABLE IF NOT EXISTS public.maquinas (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  nro_maquina           text NOT NULL,             -- N° interno (ej: "7736")
  tipo                  text NOT NULL DEFAULT '',   -- ej: "TASKI SWINGO XP"
  marca                 text NOT NULL DEFAULT '',   -- ej: "TASKI"
  modelo                text NOT NULL DEFAULT '',   -- ej: "SWINGO XP"

  -- Propiedad
  propiedad             text NOT NULL DEFAULT 'propia',  -- 'propia' | 'alquilada'
  proveedor_alquiler    text DEFAULT '',            -- proveedor si alquilada
  costo_alquiler_mensual numeric(12,2) DEFAULT 0,
  contrato_nro          text DEFAULT '',

  -- Energía
  energia               text NOT NULL DEFAULT 'bateria',  -- 'bateria' | 'cable'

  -- Estado y ubicación
  estado                text NOT NULL DEFAULT 'activa',   -- 'activa' | 'deposito' | 'reparacion' | 'baja'
  estado_motivo         text DEFAULT '',            -- motivo de baja: 'rota_sin_arreglo' | 'vendida' | 'devuelta_proveedor'
  servicio_codigo       text DEFAULT '',            -- código del servicio/cliente actual
  servicio_nombre       text DEFAULT '',            -- nombre legible del servicio

  -- Compra / amortización
  fecha_compra          text DEFAULT '',            -- DD/MM/AAAA
  costo_compra          numeric(12,2) DEFAULT 0,
  vida_util_meses       numeric(5,0) DEFAULT 60,   -- vida útil para amortización lineal

  -- Batería (campos duplicados de tabla baterías para acceso rápido)
  bateria_tipo          text DEFAULT '',            -- ej: "Gel 12V×2"
  bateria_colocada      text DEFAULT '',            -- fecha de última colocación
  bateria_vida_util     numeric(5,0) DEFAULT 24,   -- meses
  bateria_costo         numeric(12,2) DEFAULT 0,   -- costo estimado recambio

  -- Acumulados (denormalizados paraPerformance de tabla padrón)
  reparaciones_acum     numeric(12,2) DEFAULT 0,   -- suma de costos de tickets cerrados

  -- Adjuntos
  foto_url              text DEFAULT '',

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_maquinas_nro ON public.maquinas(nro_maquina) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maquinas_estado ON public.maquinas(estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maquinas_servicio ON public.maquinas(servicio_codigo) WHERE NOT anulado AND servicio_codigo != '';

-- ========== 2. MOVIMIENTOS DE UBICACIÓN ==========
CREATE TABLE IF NOT EXISTS public.maquinas_movimientos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  maquina_id_local  text NOT NULL,
  fecha             text NOT NULL,                 -- DD/MM/AAAA
  origen            text NOT NULL DEFAULT '',       -- servicio o depósito de donde sale
  destino           text NOT NULL DEFAULT '',       -- servicio o depósito a donde va
  motivo            text DEFAULT '',                -- por qué se mueve
  registrado_por    text DEFAULT '',                -- usuario Logística

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maq_mov_maquina ON public.maquinas_movimientos(maquina_id_local) WHERE NOT anulado;

-- ========== 3. TICKETS DE REPARACIÓN ==========
CREATE TABLE IF NOT EXISTS public.maquinas_tickets (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  nro_ticket            bigint GENERATED ALWAYS AS IDENTITY,  -- numeração visible #128
  maquina_id_local      text NOT NULL,
  servicio_codigo       text DEFAULT '',            -- servicio donde está la máquina

  -- Problema reportado
  problema_tipo         text NOT NULL DEFAULT '',   -- catálogo parametrizable
  problema_desc         text DEFAULT '',
  problema_foto_url     text DEFAULT '',
  reportado_por         text DEFAULT '',            -- nombre del operario
  reportado_fecha       text DEFAULT '',            -- DD/MM/AAAA HH:MM

  -- Estado actual del ticket
  etapa                 text NOT NULL DEFAULT 'reporte',
  -- 'reporte' | 'analisis' | 'visita_interna' | 'proveedor' | 'factura' | 'cerrado'

  -- Resolución (se llena al cerrar)
  resolucion            text DEFAULT '',            -- 'remoto' | 'interno' | 'proveedor' | 'baja'
  resolucion_notas      text DEFAULT '',

  -- Proveedor (si etapa = proveedor o factura)
  proveedor_nombre      text DEFAULT '',
  proveedor_acta        text DEFAULT '',            -- texto del acta de visita
  proveedor_acta_url    text DEFAULT '',
  factura_monto         numeric(12,2) DEFAULT 0,
  factura_observada     boolean DEFAULT false,
  factura_obs_notas     text DEFAULT '',

  -- Costo final
  costo_repuestos       numeric(12,2) DEFAULT 0,
  costo_proveedor       numeric(12,2) DEFAULT 0,

  -- SLA / tiempos
  etapa_inicio_en       timestamptz DEFAULT now(),  -- timestamp de la etapa actual
  cerrado_en            timestamptz,

  -- Máquina reemplazo temporal
  reemplazo_id_local    text DEFAULT '',

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maq_tick_maquina ON public.maquinas_tickets(maquina_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maq_tick_etapa ON public.maquinas_tickets(etapa) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_maq_tick_estado ON public.maquinas_tickets(etapa) WHERE NOT anulado AND etapa != 'cerrado';

-- ========== 4. HISTORIAL DE ETAPAS (log de cambios) ==========
CREATE TABLE IF NOT EXISTS public.maquinas_ticket_historial (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  ticket_id_local   text NOT NULL,
  etapa_anterior    text NOT NULL,
  etapa_nueva       text NOT NULL,
  notas             text DEFAULT '',
  trabajo_tipo      text DEFAULT '',                -- 'remoto' | 'repuesto' | 'mano_obra' | 'acta_proveedor'
  repuestos         text DEFAULT '',                -- descripción de repuestos usados
  costo_repuestos   numeric(12,2) DEFAULT 0,
  acta_url          text DEFAULT '',
  responsable       text DEFAULT '',                -- quién hizo el cambio

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maq_hist_ticket ON public.maquinas_ticket_historial(ticket_id_local) WHERE NOT anulado;

-- ========== RLS ==========
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_all') THEN
    CREATE POLICY maquinas_all ON public.maquinas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_movimientos_all') THEN
    CREATE POLICY maquinas_movimientos_all ON public.maquinas_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_tickets_all') THEN
    CREATE POLICY maquinas_tickets_all ON public.maquinas_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'maquinas_ticket_historial_all') THEN
    CREATE POLICY maquinas_ticket_historial_all ON public.maquinas_ticket_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.maquinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinas_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinas_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinas_ticket_historial ENABLE ROW LEVEL SECURITY;

COMMIT;

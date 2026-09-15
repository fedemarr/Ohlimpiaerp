-- =============================================================================
-- Migración: v137 — revisiones_retiro (Anexo 075 digital)
-- Fecha:     2026-09-15
-- Autor:     Fede
-- =============================================================================
--
-- Ticket "Módulo resumen horas" — tab "Pedido de revisión de horas" que
-- faltaba del módulo Resumen de horas. Documento de referencia:
-- RESUMEN_HORAS_para_Fede_1.md §2-3 + mockup_resumen_horas_3.html (tab
-- "Revisión de retiro"). Circuito del Anexo 075 en papel, hecho digital:
--
--   SUPERVISOR arma  →  CENTRAL DE OPERACIONES revisa  →  FINANZAS paga
--     Armada         →  En revisión → Aprobada-pago pendiente / Rechazada → Pagada
--
-- Regla de negocio clave (§2.1 del doc): el período pagado NO se toca —
-- el ajuste es un pago propio e inmediato, desacoplado del retiro del mes
-- siguiente. Por eso esto es una tabla nueva, no una edición de grillas.
--
-- Imputación con DOS fechas (§3): el período/servicio RECLAMADOS (para
-- costo real y centro de costos) vs. la fecha REAL del pago (para caja).
-- Cada línea de detalle ya trae período+servicio propios — por eso van en
-- una tabla de líneas aparte (una solicitud puede reclamar varios
-- servicios/meses, caso real verificado: Baez 5301, 2 líneas).
--
-- pendiente_facturar (§3, "caso facturable — que no sea pérdida"): si el
-- tipo de hora del ajuste es facturable, esas horas nunca se le
-- facturaron al cliente. Se deja el flag/registro ahora — el módulo de
-- facturación que lo vaya a levantar todavía no existe (a propósito,
-- dice el doc: "no construirlo ahora, solo que el dato lo permita").
--
-- Sin FK real entre las dos tablas (mismo criterio que el resto del
-- proyecto: relación por id_local en texto, no constraint de Postgres)
-- para no atarse a los tipos de id internos que arma el cliente.
--
-- Verificar ANTES de correr (no deberían existir todavía):
--   select * from information_schema.tables where table_name in ('revisiones_retiro','revisiones_retiro_lineas');
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.revisiones_retiro (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,

  nro_solicitud         text UNIQUE NOT NULL,        -- 'SR-2026-0031'
  legajo_nro            text,
  nombre_asociado       text NOT NULL,
  supervisor            text,

  tipo_reclamo          text NOT NULL,                -- 'Horas faltantes' | 'Valor de categoría equivocado' | 'Otro'
  tipo_hora             text NOT NULL,                -- 'facturable' | 'no_facturable' | 'art42' | 'reten' (misma lista que grillas_liq)
  periodo_reclamado     text NOT NULL,                -- 'YYYY-MM' — imputación principal (§3)

  monto_total           numeric(12,2) NOT NULL DEFAULT 0,
  adelanto_detectado    jsonb,                        -- snapshot informativo de Gestión de adelantos al armar, nunca editable a mano
  adjuntos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  observaciones         text,

  estado                text NOT NULL DEFAULT 'Armada',
    -- 'Armada' | 'En revisión' | 'Aprobada - pago pendiente' | 'Rechazada' | 'Pagada'
  armado_por            text,
  armado_en             timestamptz NOT NULL DEFAULT now(),
  revisado_por          text,
  revisado_en           timestamptz,
  motivo_rechazo        text,

  -- Confirmación de pago (patrón Retenciones): fecha real + comprobante
  -- obligatorios, es la fecha de CAJA — distinta de periodo_reclamado.
  fecha_pago            date,
  comprobante_pago      text,
  confirmado_pago_por   text,
  confirmado_pago_en    timestamptz,

  pendiente_facturar    boolean NOT NULL DEFAULT false,

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.revisiones_retiro_lineas (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  revision_id_local     text NOT NULL,                -- revisiones_retiro.id_local, sin FK (criterio del proyecto)

  periodo               text NOT NULL,                -- mes de ESTA línea, 'YYYY-MM'
  servicio_codigo       text NOT NULL,                -- objetivos.codigo — de la lista del padrón, nunca texto libre
  cantidad_horas        numeric(7,2) NOT NULL,
  valor_hora            numeric(10,2) NOT NULL,
  monto                 numeric(12,2) NOT NULL,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revret_estado   ON public.revisiones_retiro (estado) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_revret_legajo   ON public.revisiones_retiro (legajo_nro);
CREATE INDEX IF NOT EXISTS idx_revret_lineas   ON public.revisiones_retiro_lineas (revision_id_local);

ALTER TABLE public.revisiones_retiro        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revisiones_retiro_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.revisiones_retiro;
CREATE POLICY "Solo usuarios autenticados" ON public.revisiones_retiro
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.revisiones_retiro_lineas;
CREATE POLICY "Solo usuarios autenticados" ON public.revisiones_retiro_lineas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select column_name from information_schema.columns where table_name='revisiones_retiro';
--   select column_name from information_schema.columns where table_name='revisiones_retiro_lineas';
-- =============================================================================

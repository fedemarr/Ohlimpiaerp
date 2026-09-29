-- v172: AGENTE_TICKETS_OHLIMPIA.md — Fase 1.
--
-- Dos tablas nuevas: `corridas_agente` (la entidad CorridaAgente del spec,
-- punto 3) y `agente_audit_log` (punto 9.8: "Todo —envío, callback, merge,
-- comunicación— al audit log").
--
-- Seguridad (punto 9.1, "verificado en el backend, no solo ocultando la
-- UI"): la inmensa mayoría de las tablas del proyecto usa
-- `FOR ALL TO authenticated USING (true)` — cualquier perfil autenticado
-- puede leer/escribir. Para ESTAS DOS tablas eso no alcanza (son el panel
-- de un solo desarrollador con capacidad de disparar deploys), así que se
-- usa el patrón más estricto que ya existe en el proyecto (sql/v120,
-- usuario_accesos/perfil_accesos): solo el perfil DEVELOPER, resuelto
-- contra `public.usuarios` por `auth.uid()`, no por lo que declare el
-- cliente.
BEGIN;

CREATE TABLE IF NOT EXISTS public.corridas_agente (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local text NOT NULL UNIQUE,

  ticket_id_local text NOT NULL,
  -- Snapshot del ticket al momento de disparar — el detalle de la corrida
  -- tiene que poder mostrarse igual aunque el ticket original se edite o
  -- se borre después.
  ticket_titulo text NOT NULL,
  ticket_modulo text,
  nivel_riesgo text NOT NULL CHECK (nivel_riesgo IN ('verde', 'amarillo', 'rojo')),

  estado text NOT NULL DEFAULT 'ENVIADO' CHECK (estado IN (
    'ENVIADO', 'EN_PROCESO', 'TESTS_OK', 'ESPERANDO_APROBACION_SQL',
    -- Estado agregado a la máquina del spec (no está en el doc original):
    -- "aprobar" una migración en este proyecto NUNCA significa que algo la
    -- ejecute solo (innegociable, decisión explícita de Fede) — aprobar
    -- solo habilita a aplicarla A MANO en Supabase. Sin un paso separado de
    -- "ya la apliqué", el deploy del código podría salir ANTES de que la
    -- columna/tabla que ese código espera exista de verdad — exactamente el
    -- incidente real de Polo del 28/09 (columna `tercerizado` faltante).
    'MIGRACION_APROBADA_PENDIENTE_APLICAR',
    'DEPLOYADO', 'COMUNICADO', 'TESTS_FALLARON', 'FALLIDO', 'RECHAZADO'
  )),
  modo_simulacion boolean NOT NULL DEFAULT false,

  branch text,
  pr_url text,
  pr_number integer,

  iniciada_por text NOT NULL,
  iniciada_en timestamptz NOT NULL DEFAULT now(),
  finalizada_en timestamptz,

  intentos integer NOT NULL DEFAULT 0,

  resumen text,
  que_probar text,
  archivos_tocados jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,

  tests_ok boolean,
  -- Punto 7 / innegociable #2: 0 se trata como fallo. NOT NULL con default
  -- 0 a propósito — no puede quedar en NULL leyéndose como "no corrió
  -- ningún chequeo todavía" en un estado que ya diga DEPLOYADO.
  tests_corridos integer NOT NULL DEFAULT 0,

  tiene_migracion boolean NOT NULL DEFAULT false,
  sql_migracion text,
  migracion_reversible boolean,
  migracion_filas_afectadas_estimado text,
  migracion_aprobada_por text,
  migracion_aprobada_en timestamptz,
  migracion_aplicada_confirmada_por text,
  migracion_aplicada_confirmada_en timestamptz,

  deployado_en timestamptz,

  resolucion text,
  resolucion_enviada_en timestamptz,

  -- Punto 13: "el token de callback es por corrida, de un solo uso y con
  -- vencimiento". Se genera random en la app al crear la corrida, nunca acá.
  callback_token text UNIQUE,
  callback_token_usado boolean NOT NULL DEFAULT false,
  callback_token_expira_en timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corridas_agente_ticket ON public.corridas_agente(ticket_id_local);
CREATE INDEX IF NOT EXISTS idx_corridas_agente_estado ON public.corridas_agente(estado);

CREATE TABLE IF NOT EXISTS public.agente_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local text NOT NULL UNIQUE,
  corrida_id_local text,
  tipo text NOT NULL, -- envio | callback | aprobacion_sql | rechazo_sql | migracion_confirmada | deploy | comunicacion | error
  detalle text,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agente_audit_corrida ON public.agente_audit_log(corrida_id_local);

ALTER TABLE public.corridas_agente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solo_developer" ON public.corridas_agente;
CREATE POLICY "solo_developer" ON public.corridas_agente
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'DEVELOPER'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'DEVELOPER'));

DROP POLICY IF EXISTS "solo_developer" ON public.agente_audit_log;
CREATE POLICY "solo_developer" ON public.agente_audit_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'DEVELOPER'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'DEVELOPER'));

COMMIT;

-- Verificación:
--   select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('corridas_agente','agente_audit_log');
--   select policyname, roles::text from pg_policies where tablename in ('corridas_agente','agente_audit_log');

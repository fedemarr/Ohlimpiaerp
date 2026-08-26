-- =============================================================================
-- Migración: v106 — Pedidos de personal: ajustes de mockup v1.5
-- Fecha:     2026-08-26
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo pedido de personas — AJUSTES", con mockup HTML adjunto
-- (mockup_pedidos_personal_v1_5.html) del área de Operaciones/RRHH. Agrega
-- workflow completo al módulo (hoy solo tenía alta + edición libre):
--   Pendiente → En búsqueda (RRHH lo toma) → Cubierto | Cancelado (con motivo)
--
-- DECISIONES CONFIRMADAS POR EL SOLICITANTE (26/08):
--   - Puede haber otros perfiles además de Operaciones cargando pedidos
--     (no se restringe "cargado_por" a un rol fijo).
--   - N° de pedido: correlativo simple (PP-1, PP-2, ...).
--   - Umbral de "VENCIDO": parametrizable, por urgencia (tabla pedidos_config).
--   - Motivos de cancelación: parametrizable (catálogo, mismo patrón que
--     perfil_personal_atributos de v073 — solo seed SQL por ahora, sin ABM).
--   - Notificaciones (🔔): NO en este alcance. Queda pendiente para más
--     adelante.
--   - Urgencia Alto/Medio/Bajo → Alta/Media/Baja: SIN necesidad de mantener
--     compatibilidad con lo viejo.
--   - N° de socio del candidato cubierto: campo LIBRE por ahora (sin validar
--     contra legajos reales). Se podrá mejorar después.
--   - Los pedidos cargados hasta hoy son de prueba: se BORRAN (no se
--     migran). Confirmado explícitamente por el solicitante.
--
-- Sigue el mismo patrón id_local / RLS endurecida directo que usa el resto
-- del módulo (v014, v073, v088).
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) Limpieza de datos de prueba (confirmado por el solicitante)
-- ============================================================
TRUNCATE public.pedidos;

-- ============================================================
-- 2) pedidos — columnas nuevas del workflow
-- ============================================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero               integer,
  ADD COLUMN IF NOT EXISTS cantidad             integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fecha_limite         text,
  ADD COLUMN IF NOT EXISTS cargado_por          text,
  -- Reemplazan al viejo "candidato" (texto libre suelto, sin estructura).
  -- Se dropea abajo: no hay datos que migrar (tabla recién vaciada).
  ADD COLUMN IF NOT EXISTS ingreso_tipo         text,   -- 'nuevo' | 'interno'
  ADD COLUMN IF NOT EXISTS nombre_candidato     text,
  ADD COLUMN IF NOT EXISTS nro_socio_candidato  text,   -- libre, sin validar contra legajos (por ahora)
  ADD COLUMN IF NOT EXISTS fecha_inicio         text,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion   text,
  ADD COLUMN IF NOT EXISTS motivo_detalle       text;

ALTER TABLE public.pedidos DROP COLUMN IF EXISTS candidato;

-- Urgencia ya no usa Alto/Medio/Bajo (sin compat hacia atrás, confirmado).
-- No hace falta UPDATE: la tabla está vacía tras el TRUNCATE de arriba.
-- El check de valores válidos queda a nivel de aplicación (como ya era).

-- numero: correlativo. UNIQUE pero nullable a nivel de columna porque
-- Postgres permite múltiples NULL en una UNIQUE — en la práctica la
-- aplicación SIEMPRE lo completa (max(numero)+1, mismo patrón que usa
-- Altas para nro de socio).
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_numero_key ON public.pedidos (numero) WHERE numero IS NOT NULL;

-- ============================================================
-- 3) pedidos_eventos — timeline por pedido (creado/tomado/cubierto/cancelado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_eventos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  pedido_id_local text NOT NULL REFERENCES public.pedidos(id_local) ON DELETE CASCADE,
  tipo          text NOT NULL,   -- 'creado' | 'en_busqueda' | 'cubierto' | 'cancelado' | 'editado'
  detalle       text,
  usuario       text,
  -- Texto DD/MM/AAAA HH:MM, mismo criterio que pedidos.fecha (v014):
  -- created_at/updated_at los descarta _toCamel() (supabase.js:1036), así
  -- que la fecha visible en el timeline necesita su PROPIA columna.
  fecha         text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedidos_eventos_pedido_idx ON public.pedidos_eventos (pedido_id_local);

ALTER TABLE public.pedidos_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) pedidos_motivos_cancelacion — catálogo parametrizable (mismo patrón
--    que perfil_personal_atributos de v073: solo seed SQL, sin ABM todavía)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_motivos_cancelacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  codigo      text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_motivos_cancelacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_motivos_cancelacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pedidos_motivos_cancelacion (id_local, codigo, nombre, orden) VALUES
  ('mot_reduccion',   'reduccion_horas',   'El cliente redujo horas',    10),
  ('mot_cubierto_otro','cubierto_otro',    'Se cubrió por otro lado',    20),
  ('mot_baja_servicio','baja_servicio',    'El servicio se dio de baja', 30),
  ('mot_duplicado',   'duplicado',         'Pedido duplicado',           40),
  ('mot_otro',        'otro',              'Otro',                       50)
ON CONFLICT (id_local) DO NOTHING;

-- ============================================================
-- 5) pedidos_config — clave/valor genérico, arranca con el umbral de
--    "VENCIDO" por urgencia (en días sin movimiento). Editable directo en
--    la tabla mientras no tenga pantalla propia.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pedidos_config (clave, valor) VALUES
  ('umbral_vencido_dias', '{"Alta":5,"Media":15,"Baja":30}')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

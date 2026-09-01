-- v086_supervision_servicios.sql
-- Ticket "Supervisión de Servicios" (Lautaro + Claude, 13/08/2026):
-- el % de supervisión deja de ser una propiedad de cada supervisor (la
-- vieja supervisores_config.pct_comision, v081) y pasa a ser una
-- propiedad de la relación servicio-supervisión, con cascada de defaults
-- GENERAL (3%) → CLIENTE → SERVICIO (override que gana sobre todo).
--
-- 1) supervision_vigencias: trazabilidad completa. Cada % se guarda como
--    registro de vigencia (nivel, alcance, %, vigente-desde, vigente-hasta,
--    usuario, fecha, motivo). Cambiar un % NUNCA pisa el anterior: se cierra
--    la vigencia abierta y se abre una nueva. La liquidación de cada mes usa
--    el % vigente de ESE mes (meses liquidados no se tocan).
-- 2) clientes.pct_supervision / objetivos.pct_supervision: el dato "vive"
--    en las entidades de Comercial (Configuración / Cliente / Servicio),
--    pero la EDICIÓN se hace únicamente desde la grilla del módulo
--    Supervisión — las fichas de Comercial lo muestran en solo lectura.
-- 3) liq_admin_periodos: nuevas columnas para el "Ajuste de nivelación"
--    de Liquidación Administración (editable por Finanzas, con motivo y
--    auditoría). El adicional por supervisión se calcula en vivo desde las
--    vigencias, no se persiste.

BEGIN;

-- ========== Vigencias del % de supervisión ==========
CREATE TABLE IF NOT EXISTS public.supervision_vigencias (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nivel             text NOT NULL,          -- general | cliente | servicio
  alcance           text NOT NULL,          -- 'GENERAL' | clienteId | objetivoId
  alcance_nombre    text NOT NULL DEFAULT '',
  pct               numeric(5,2) NOT NULL,
  vigente_desde     text NOT NULL,          -- 'YYYY-MM' — desde qué mes rige
  vigente_hasta     text,                   -- 'YYYY-MM' — null = abierta (vigente)
  usuario           text NOT NULL DEFAULT '',
  fecha             text NOT NULL DEFAULT '',
  motivo            text NOT NULL DEFAULT '',

  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sv_alcance ON public.supervision_vigencias(alcance) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_sv_abierta ON public.supervision_vigencias(alcance) WHERE NOT anulado AND vigente_hasta IS NULL;

-- ========== El % vive en las entidades de Comercial ==========
ALTER TABLE public.clientes  ADD COLUMN IF NOT EXISTS pct_supervision numeric(5,2);
ALTER TABLE public.objetivos ADD COLUMN IF NOT EXISTS pct_supervision numeric(5,2);

-- ========== Ajuste de nivelación en Liquidación Administración ==========
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_nivelacion numeric(12,2);
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_motivo text;
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_usuario text;
ALTER TABLE public.liq_admin_periodos ADD COLUMN IF NOT EXISTS ajuste_fecha text;

-- ========== RLS ==========
ALTER TABLE public.supervision_vigencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supervision_vigencias_all ON public.supervision_vigencias;
CREATE POLICY supervision_vigencias_all ON public.supervision_vigencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

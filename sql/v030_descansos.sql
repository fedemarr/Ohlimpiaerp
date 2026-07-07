-- =============================================================================
-- Migración: v030 — Módulo Descansos (sector operativo)
-- Fecha:     2026-07-07
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_descansos.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Rehace de cero (política A.11) el módulo Descansos del sector
-- operativo (operarios de servicios de limpieza, ~500 personas). Hoy
-- vive en legacy.js como DB.vacOperativo y no persiste nada: 'vacOperativo'
-- nunca estuvo mapeada en supabase.js, así que supaSync() era un no-op
-- silencioso. El modelo viejo además solo tenía un estado simple
-- "Pendiente/Aprobado/Rechazado" — no refleja el flujo real de doble
-- aprobación (Gerente de Operaciones → Gerente de RRHH).
--
-- Cubre SOLO al sector operativo. Los administrativos tienen su propio
-- módulo (Vacaciones, v027/v028) — ver DISENO_vacaciones.md.
--
-- NOTA: DISENO_descansos.md pedía nombrar este script v016_descansos.sql,
-- pero la migración real más reciente es v029. Se usa v030.
--
-- A diferencia de Vacaciones, acá NO hace falta crear notificaciones_sistema
-- (v029, ya existe) — Descansos solo llama a crearNotificacion() en cada
-- transición (src/shared/notificaciones.js, ya implementado).
-- =============================================================================

BEGIN;

CREATE TABLE public.descansos (
  id                            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                      text UNIQUE NOT NULL,

  -- Operario
  legajo_id_local               text NOT NULL,
  nro_socio                     text NOT NULL,
  nombre_operario                text NOT NULL,
  servicio                      text NOT NULL,
  supervisor                    text NOT NULL,

  -- Solicitud
  supervisor_solicitante        text NOT NULL,
  fecha_solicitud                timestamptz NOT NULL DEFAULT now(),

  -- Fechas del descanso
  fecha_desde                   date NOT NULL,
  fecha_hasta                   date NOT NULL,
  duracion_dias                 integer NOT NULL,
  fecha_retorno                 date NOT NULL,

  -- Contexto
  motivo                        text NOT NULL,
  reemplazante_legajo_id_local  text,
  reemplazante_nombre           text,
  observaciones                 text,

  -- Estado
  estado                        text NOT NULL DEFAULT 'Borrador',
    -- Borrador
    -- Pendiente aprobación Operaciones
    -- Pendiente aprobación RRHH
    -- Aprobado
    -- Rechazado por Operaciones
    -- Rechazado por RRHH
    -- Anulado por supervisor
    -- Anulado post-aprobación

  -- Aprobación Operaciones
  aprobado_por_operaciones      text,
  fecha_aprobacion_operaciones  timestamptz,
  motivo_rechazo_operaciones    text,

  -- Aprobación RRHH
  aprobado_por_rrhh             text,
  fecha_aprobacion_rrhh         timestamptz,
  motivo_rechazo_rrhh           text,

  -- Anulación
  anulado_por                   text,
  fecha_anulacion                timestamptz,
  motivo_anulacion               text,

  -- Integración futura con Liquidaciones (Etapa 4 del diseño — no
  -- ejecutada todavía, Liquidaciones no está migrado)
  paga_jornada_completa         boolean NOT NULL DEFAULT true,

  -- Auditoría
  editado_por                   text,
  editado_en                    timestamptz,
  anulado                       boolean NOT NULL DEFAULT false,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_descanso_legajo     ON public.descansos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_descanso_estado     ON public.descansos(estado) WHERE NOT anulado;
CREATE INDEX idx_descanso_desde      ON public.descansos(fecha_desde) WHERE NOT anulado;
CREATE INDEX idx_descanso_servicio   ON public.descansos(servicio) WHERE NOT anulado;
CREATE INDEX idx_descanso_supervisor ON public.descansos(supervisor) WHERE NOT anulado;

ALTER TABLE public.descansos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.descansos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

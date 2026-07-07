-- =============================================================================
-- Migración: v027 — Módulo Vacaciones (sector administrativo)
-- Fecha:     2026-07-07
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_vacaciones.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Rehace de cero (política A.11) el módulo Vacaciones del sector
-- administrativo (~30 personas: RRHH, Operaciones, Contabilidad, Consejo
-- de Administración). Hoy vive en legacy.js (~873-1093) como DB.vacAdmin
-- y no persiste nada: 'vacAdmin' nunca estuvo mapeada en supabase.js, así
-- que supaSync() era un no-op silencioso — todo se perdía al recargar.
--
-- Cubre SOLO al sector administrativo. Los operarios de limpieza tienen
-- su propio módulo (Descansos, sigue en legacy.js sin tocar — no tiene
-- diseño propio todavía).
--
-- NOTA: DISENO_vacaciones.md pedía nombrar este script v015_vacaciones.sql,
-- pero v015 ya existe (v015_endurecer_rls_tablas_restantes.sql) y la
-- migración real más reciente es v026. Se usa v027.
-- =============================================================================

BEGIN;

CREATE TABLE public.vacaciones (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                  text UNIQUE NOT NULL,

  -- Solicitante
  legajo_id_local           text NOT NULL,
  nro_socio                 text NOT NULL,
  nombre_asociado           text NOT NULL,
  sector                    text NOT NULL,

  -- Fechas
  fecha_solicitud           timestamptz NOT NULL DEFAULT now(),
  fecha_desde               date NOT NULL,
  fecha_hasta               date NOT NULL,
  dias_solicitados          integer NOT NULL,
  fecha_retorno             date NOT NULL,

  -- Contexto
  reemplazante_legajo_id_local text NOT NULL,
  reemplazante_nombre       text NOT NULL,
  descripcion_reemplazo     text,
  observaciones             text,

  -- Estado
  estado                    text NOT NULL DEFAULT 'Borrador',
    -- Borrador
    -- Pendiente aprobación Gerente
    -- Pendiente aprobación Consejo
    -- Aprobada
    -- Rechazada por Gerente
    -- Rechazada por Consejo
    -- Anulada por solicitante
    -- Anulada por Gerente
    -- Solicitud de anulación pendiente
    -- Anulada por Consejo
    -- Anulación rechazada por Consejo

  -- Aprobación Gerente
  aprobado_por_gerente      text,
  fecha_aprobacion_gerente  timestamptz,
  motivo_rechazo_gerente    text,

  -- Aprobación Consejo (tres votos independientes)
  voto_presidente           text,
  voto_presidente_fecha     timestamptz,
  voto_presidente_motivo    text,

  voto_tesorero             text,
  voto_tesorero_fecha       timestamptz,
  voto_tesorero_motivo      text,

  voto_secretario           text,
  voto_secretario_fecha     timestamptz,
  voto_secretario_motivo    text,

  fecha_aprobacion_consejo  timestamptz,
  fecha_rechazo_consejo     timestamptz,

  -- Anulación
  anulado_por_nombre        text,
  fecha_anulacion           timestamptz,
  motivo_anulacion          text,

  -- Anulación post-aprobación (flujo especial vía Consejo)
  solicitud_anulacion_motivo text,
  voto_anul_presidente      text,
  voto_anul_tesorero        text,
  voto_anul_secretario      text,

  -- Auditoría
  editado_por               text,
  editado_en                timestamptz,
  anulado                   boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vacac_legajo ON public.vacaciones(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_vacac_estado ON public.vacaciones(estado) WHERE NOT anulado;
CREATE INDEX idx_vacac_desde  ON public.vacaciones(fecha_desde) WHERE NOT anulado;
CREATE INDEX idx_vacac_sector ON public.vacaciones(sector) WHERE NOT anulado;

ALTER TABLE public.vacaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.vacaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

-- =============================================================================
-- Migración: v037 — Módulo Enfermos y Accidentes v1 (Etapas 1-5)
-- Fecha:     2026-07-10
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_enfermos_accidentes.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el ABM de legacy.js (guardarEnfermo con el mismo bug de
-- llaves que tenía guardarLegal, sin certificados reales, sin motor
-- económico). Depende del módulo Categorías (v035) para congelar el
-- valor hora del retiro.
--
-- DISENO_enfermos_accidentes.md pedía v021, pero esa migración ya
-- existe. La migración real más reciente es v036 (Situaciones
-- Legales). Se usa v037.
--
-- Desvíos vs. el diseño original (evidencia real del repo):
-- - certificados_medicos.adjunto_url (text) reemplaza
--   adjunto_id_local: un certificado tiene una sola foto (relación
--   1:1) — se sube directo a Storage sin pasar por subirAdjunto()
--   (esa función invalida el adjunto vigente anterior del mismo
--   (dni,tipo), lo que pisaría certificados de casos anteriores del
--   mismo asociado).
-- - certificados_medicos.tipo_certificado nueva columna
--   ('Incapacidad' | 'Alta') — reusa la misma tabla para el
--   certificado de alta del cierre de caso.
-- - legajos.categoria_id_local YA EXISTE (v035, Categorías) — no se
--   vuelve a crear. legajos.en_tratamiento es la única columna nueva
--   en legajos.
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — casos_enfermos_accidentes (registro central)
-- ============================================================
CREATE TABLE public.casos_enfermos_accidentes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  -- Datos comunes del asociado
  legajo_id_local        text NOT NULL,
  nro_socio               text NOT NULL,
  nombre_asociado         text NOT NULL,
  tipo_asociado           text NOT NULL,       -- Operativo / Administrativo
  servicio                text,
  supervisor              text,
  area                    text,                -- si administrativo (legajo.sector)

  -- Tipo de caso
  tipo_caso               text NOT NULL,       -- Enfermedad / Accidente
  subtipo                 text,

  -- Fechas
  fecha_inicio            date NOT NULL,
  fecha_ingreso_modulo    timestamptz NOT NULL DEFAULT now(),
  fecha_alta_prevista     date,
  fecha_alta_efectiva     date,

  -- Categoría y valor hora (congelado al ingreso)
  categoria_id_local      text,
  categoria_nombre        text,
  servicio_al_ingreso     text,
  valor_hora_congelado    numeric(10,2),
  valor_hora_id_local     text,
  pendiente_administrativo boolean NOT NULL DEFAULT false,

  -- Estado del caso
  estado                  text NOT NULL DEFAULT 'Abierto',

  -- Cierre
  fecha_cierre            timestamptz,
  cerrado_por             text,
  motivo_cierre           text,
  observaciones_cierre    text,

  -- Datos específicos por tipo (jsonb, evita columnas vacías del otro tipo)
  datos_enfermedad        jsonb,
  datos_accidente         jsonb,

  observaciones           text,
  cargado_por             text NOT NULL,

  anulado                 boolean NOT NULL DEFAULT false,
  fecha_anulacion         timestamptz,
  anulado_por             text,
  motivo_anulacion        text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cea_legajo ON public.casos_enfermos_accidentes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_cea_estado ON public.casos_enfermos_accidentes(estado) WHERE NOT anulado;
CREATE INDEX idx_cea_tipo   ON public.casos_enfermos_accidentes(tipo_caso) WHERE NOT anulado;
CREATE INDEX idx_cea_inicio ON public.casos_enfermos_accidentes(fecha_inicio) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — certificados_medicos
-- ============================================================
CREATE TABLE public.certificados_medicos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  caso_id_local           text NOT NULL,
  legajo_id_local         text NOT NULL,

  tipo_certificado        text NOT NULL DEFAULT 'Incapacidad',  -- Incapacidad / Alta

  -- Datos del médico (ley 17132)
  medico_apellido_nombre  text NOT NULL,
  medico_profesion        text NOT NULL,
  medico_matricula        text NOT NULL,
  medico_domicilio        text NOT NULL,
  medico_telefono         text,
  medico_email            text,

  -- Datos del asistido
  paciente_nombre         text NOT NULL,
  paciente_documento_tipo text NOT NULL,
  paciente_documento_nro  text NOT NULL,

  -- Contenido médico
  diagnostico_cie10       text NOT NULL,
  fecha_emision           date NOT NULL,
  duracion_incapacidad_dias integer NOT NULL,
  fecha_incapacidad_desde date NOT NULL,
  fecha_incapacidad_hasta date NOT NULL,
  observaciones_medicas   text,

  -- Adjunto: path directo en Storage (ver contexto arriba)
  adjunto_url             text NOT NULL,

  -- Validación por RRHH
  estado_validacion       text NOT NULL DEFAULT 'Pendiente',
  validado_por            text,
  fecha_validacion        timestamptz,
  observaciones_validacion text,

  presentado_en           timestamptz NOT NULL DEFAULT now(),
  presentado_por          text NOT NULL,
  medio_presentacion      text,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cm_caso   ON public.certificados_medicos(caso_id_local) WHERE NOT anulado;
CREATE INDEX idx_cm_legajo ON public.certificados_medicos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_cm_estado ON public.certificados_medicos(estado_validacion) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — retiros_enfermos_pendientes (compromisos mensuales
-- para Liquidaciones, cuando migre)
-- ============================================================
CREATE TABLE public.retiros_enfermos_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  caso_id_local           text NOT NULL,
  legajo_id_local         text NOT NULL,

  periodo                 text NOT NULL,       -- YYYY-MM

  dias_del_caso_en_mes    integer NOT NULL,
  horas_calculadas        numeric(10,2) NOT NULL,
  horas_ajustadas         numeric(10,2) NOT NULL,
  valor_hora_congelado    numeric(10,2) NOT NULL,
  monto_retiro            numeric(10,2) NOT NULL,

  estado                  text NOT NULL DEFAULT 'Pendiente',

  fecha_generado          timestamptz NOT NULL DEFAULT now(),
  fecha_aplicacion        timestamptz,
  aplicado_por            text,

  cargado_por              text NOT NULL,
  observaciones            text,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rep_caso    ON public.retiros_enfermos_pendientes(caso_id_local) WHERE NOT anulado;
CREATE INDEX idx_rep_legajo  ON public.retiros_enfermos_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_rep_periodo ON public.retiros_enfermos_pendientes(periodo) WHERE NOT anulado;

-- ============================================================
-- Tabla 4 — caso_eventos (auditoría de transiciones de estado)
-- ============================================================
CREATE TABLE public.caso_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  caso_id_local           text NOT NULL,

  estado_desde            text,
  estado_hasta            text NOT NULL,
  ejecutado_por           text NOT NULL,
  ejecutado_en            timestamptz NOT NULL DEFAULT now(),
  observaciones            text,

  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ce_caso ON public.caso_eventos(caso_id_local);

-- ============================================================
-- RLS — mismo patrón que v032/v033/v034/v035/v036
-- ============================================================
ALTER TABLE public.casos_enfermos_accidentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.casos_enfermos_accidentes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.certificados_medicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.certificados_medicos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.retiros_enfermos_pendientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.retiros_enfermos_pendientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.caso_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.caso_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Legajos — columna nueva (categoria_id_local ya existe desde v035)
-- ============================================================
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS en_tratamiento boolean NOT NULL DEFAULT false;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

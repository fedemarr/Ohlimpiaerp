-- =============================================================================
-- Migración: v034 — Módulo Sanciones v1 (Etapa 1: niveles 0-2)
-- Fecha:     2026-07-09
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_sanciones.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el ABM plano de Sanciones (src/legacy.js, tabla `sanciones`
-- sin niveles tipados, sin flujo de aprobación) por el modelo de la
-- política oficial: 5 niveles con flujos diferenciados. Esta migración
-- cubre SOLO los niveles 0 (Verbal), 1 (Observación) y 2
-- (Apercibimiento con descargo obligatorio) — niveles 3 (Suspensión) y
-- 4 (Exclusión), con sumario formal y votación del Consejo, quedan
-- para una tanda aparte (decisión del usuario: es la parte legalmente
-- más sensible, conviene validar 0-2 en producción primero).
--
-- DISENO_sanciones.md pedía nombrar este script v019_sanciones.sql,
-- pero v019 ya existe (cuenta_bancaria_alta_pendientes). La migración
-- real más reciente es v033 (Competencia Anual). Se usa v034.
--
-- Tablas NO incluidas en esta migración (quedan para la tanda 2, ver
-- el plan): sancion_aprobaciones, sancion_sumarios, sancion_apelaciones,
-- descuentos_sanciones_pendientes, composicion_consejo,
-- composicion_sindicatura, gerentes_area, areas_administrativas —
-- ninguna hace falta para niveles 0-2. `sanciones_disciplinarias` SÍ
-- se crea con el esquema completo del diseño (incluye columnas de
-- sumario/Consejo/apelación que quedan NULL hasta la tanda 2) para no
-- necesitar un ALTER TABLE doloroso más adelante.
--
-- No existe `legajo.area` (el diseño lo pedía como prerequisito) — se
-- reusa `legajo.sector`, ya poblado para administrativos con 8 valores
-- reales (SECTORES_ADMIN en src/modules/legajos/legajos.js), más
-- granular que las "5 áreas" que asumía el diseño. No hace falta
-- ALTER TABLE legajos.
--
-- Composición de Consejo/Gerentes: se usan los mismos placeholders ya
-- en producción en vacaciones/permisos.js y descansos/permisos.js
-- (mock editable, sin tablas de composición con vigencia — eso
-- también es tanda 2, cuando haga falta para votación de Consejo).
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla 1 — sanciones_disciplinarias (registro central, esquema
-- completo del diseño — columnas de sumario/Consejo/apelación quedan
-- sin usar hasta la tanda 2)
-- ============================================================
CREATE TABLE public.sanciones_disciplinarias (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  -- Sancionado
  legajo_id_local        text NOT NULL,
  nro_socio               text NOT NULL,
  nombre_sancionado       text NOT NULL,
  tipo_sancionado         text NOT NULL,       -- Operativo / Administrativo
  servicio               text,
  supervisor             text,
  area_administrativa     text,                -- legajo.sector si administrativo

  -- Sanción
  nivel                  integer NOT NULL,     -- 0..4
  nombre_nivel            text NOT NULL,
  infraccion_id_local     text NOT NULL,
  nombre_infraccion       text NOT NULL,
  categoria_infraccion    text NOT NULL,
  gravedad               text NOT NULL,

  -- Detalle del hecho
  fecha_hecho             date NOT NULL,
  fecha_deteccion         date NOT NULL,
  descripcion_hecho       text NOT NULL,

  -- Iniciación
  propuesta_por_legajo    text NOT NULL,
  propuesta_por_rol       text NOT NULL,
  fecha_iniciacion        timestamptz NOT NULL DEFAULT now(),

  -- Estado del proceso
  estado                 text NOT NULL DEFAULT 'Borrador',

  -- Aprobación (niveles 1-2)
  fecha_aprobacion        timestamptz,
  aprobada_por_legajo     text,
  aprobada_por_rol        text,
  aprobacion_secundaria_legajo  text,
  aprobacion_secundaria_rol     text,
  fecha_aprobacion_secundaria   timestamptz,
  motivo_rechazo          text,

  -- Descargo
  descargo_requerido      boolean NOT NULL DEFAULT false,
  descargo_solicitado_en  timestamptz,
  fecha_limite_descargo   timestamptz,
  descargo_id_local       text,

  -- Sumario (tanda 2, columna reservada)
  sumario_id_local        text,

  -- Votación Consejo (tanda 2, columnas reservadas)
  votos_favor             integer NOT NULL DEFAULT 0,
  votos_contra            integer NOT NULL DEFAULT 0,
  votos_abstencion        integer NOT NULL DEFAULT 0,
  fecha_resolucion_consejo timestamptz,

  -- Ejecución
  fecha_notificacion_asociado  timestamptz,
  notificacion_metodo     text,

  -- Suspensión (tanda 2, columnas reservadas)
  suspension_fecha_desde  date,
  suspension_fecha_hasta  date,
  suspension_con_goce     boolean,

  -- Medida cautelar (tanda 2, columnas reservadas)
  medida_cautelar         boolean NOT NULL DEFAULT false,
  medida_cautelar_motivo  text,
  medida_cautelar_desde   date,

  -- Apelación (tanda 2, columnas reservadas)
  apelacion_id_local      text,
  sancion_revocada_por_apelacion boolean NOT NULL DEFAULT false,
  fecha_revocacion        timestamptz,

  -- Impacto en Competencia
  evento_competencia_id_local  text,

  -- Anulación administrativa
  fecha_anulacion         timestamptz,
  anulada_por             text,
  motivo_anulacion        text,

  observaciones           text,
  editado_por             text,
  editado_en              timestamptz,
  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sanc_legajo ON public.sanciones_disciplinarias(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_sanc_estado ON public.sanciones_disciplinarias(estado) WHERE NOT anulado;
CREATE INDEX idx_sanc_nivel  ON public.sanciones_disciplinarias(nivel) WHERE NOT anulado;
CREATE INDEX idx_sanc_fecha  ON public.sanciones_disciplinarias(fecha_iniciacion) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — sancion_eventos (auditoría de transiciones)
-- ============================================================
CREATE TABLE public.sancion_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local        text NOT NULL,

  estado_desde            text,
  estado_hasta            text NOT NULL,
  ejecutado_por           text NOT NULL,
  ejecutado_rol           text,
  ejecutado_en            timestamptz NOT NULL DEFAULT now(),
  observaciones           text,

  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_se_sancion ON public.sancion_eventos(sancion_id_local);

-- ============================================================
-- Tabla 3 — sancion_descargos
-- ============================================================
CREATE TABLE public.sancion_descargos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local        text NOT NULL,
  legajo_id_local         text NOT NULL,

  fecha_presentacion       timestamptz NOT NULL DEFAULT now(),
  medio                   text NOT NULL,
  descripcion              text NOT NULL,
  adjuntos                 jsonb,

  registrado_por           text NOT NULL,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sd_sancion ON public.sancion_descargos(sancion_id_local) WHERE NOT anulado;

-- ============================================================
-- Tabla 4 — catalogo_infracciones
-- ============================================================
CREATE TABLE public.catalogo_infracciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  codigo                  text UNIQUE NOT NULL,
  nombre                  text NOT NULL,
  descripcion              text,
  categoria                text NOT NULL,

  activa                  boolean NOT NULL DEFAULT true,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ci_activa ON public.catalogo_infracciones(activa) WHERE NOT anulado;

-- ============================================================
-- Tabla 5 — catalogo_infracciones_versiones (vigencia temporal)
-- ============================================================
CREATE TABLE public.catalogo_infracciones_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  infraccion_id_local     text NOT NULL,

  gravedad                text NOT NULL,
  sancion_sugerida_primera_vez  integer NOT NULL,
  sancion_sugerida_reiteracion  integer NOT NULL,

  vigencia_desde           date NOT NULL,
  vigencia_hasta           date,
  cargada_por              text NOT NULL,
  motivo_carga             text,

  anulado                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_civ_infrac   ON public.catalogo_infracciones_versiones(infraccion_id_local) WHERE NOT anulado;
CREATE INDEX idx_civ_vigencia ON public.catalogo_infracciones_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- RLS — mismo patrón que v027/v030/v032/v033
-- ============================================================
ALTER TABLE public.sanciones_disciplinarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.sanciones_disciplinarias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sancion_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.sancion_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sancion_descargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.sancion_descargos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.catalogo_infracciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.catalogo_infracciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.catalogo_infracciones_versiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.catalogo_infracciones_versiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- ALTER adjuntos — reusar la tabla existente para evidencia y
-- descargo de Sanciones (mismo patrón que Uniformes en v032)
-- ============================================================
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_etapa_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_etapa_check
  CHECK (etapa in (
    'psicotecnico',
    'preocupacional',
    'documentacion',
    'alta',
    'uniformes',
    'sanciones'
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
    'denuncia-policial-uniforme',
    'evidencia-sancion',
    'descargo-sancion'
  ));

-- ============================================================
-- Seed — 16 infracciones (política oficial §4.5) + primera versión
-- ============================================================
INSERT INTO public.catalogo_infracciones (id_local, codigo, nombre, categoria) VALUES
  ('inf_001', 'INF-001', 'Llegada tarde aislada (hasta 30 min)',                        'Ausencias e Impuntualidad'),
  ('inf_002', 'INF-002', 'Llegadas tarde reiteradas (3+ en el mes)',                    'Ausencias e Impuntualidad'),
  ('inf_003', 'INF-003', 'Ausencia sin aviso (1 episodio)',                             'Ausencias e Impuntualidad'),
  ('inf_004', 'INF-004', 'Ausencias reiteradas sin justificación',                      'Ausencias e Impuntualidad'),
  ('inf_005', 'INF-005', 'Falsificación de planilla',                                   'Ausencias e Impuntualidad'),
  ('inf_006', 'INF-006', 'No completar tareas asignadas o planillas',                   'Incumplimiento de Tareas y Normas'),
  ('inf_007', 'INF-007', 'Bajo rendimiento o desempeño incorrecto',                     'Incumplimiento de Tareas y Normas'),
  ('inf_008', 'INF-008', 'No usar uniforme o usar uniforme de otro servicio',           'Incumplimiento de Tareas y Normas'),
  ('inf_009', 'INF-009', 'Incumplimiento de protocolos o normas del cliente',           'Incumplimiento de Tareas y Normas'),
  ('inf_010', 'INF-010', 'No informar necesidades del servicio',                        'Incumplimiento de Tareas y Normas'),
  ('inf_011', 'INF-011', 'Comentarios inapropiados / rumores que generan conflicto',    'Conductas y Comportamiento'),
  ('inf_012', 'INF-012', 'Actitud inapropiada ante compañeros o superiores',            'Conductas y Comportamiento'),
  ('inf_013', 'INF-013', 'Falta de respeto al personal del cliente o de seguridad',     'Conductas y Comportamiento'),
  ('inf_014', 'INF-014', 'Abandono de servicio sin autorización',                       'Conductas y Comportamiento'),
  ('inf_015', 'INF-015', 'Consumo de bienes del cliente sin autorización',              'Conductas y Comportamiento'),
  ('inf_016', 'INF-016', 'Robo o apropiación de bienes',                                'Conductas y Comportamiento');

INSERT INTO public.catalogo_infracciones_versiones (id_local, infraccion_id_local, gravedad, sancion_sugerida_primera_vez, sancion_sugerida_reiteracion, vigencia_desde, cargada_por, motivo_carga) VALUES
  ('inf_v_001', 'inf_001', 'Leve',      0, 1, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_002', 'inf_002', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_003', 'inf_003', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_004', 'inf_004', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_005', 'inf_005', 'Muy grave', 2, 4, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_006', 'inf_006', 'Leve',      1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_007', 'inf_007', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_008', 'inf_008', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_009', 'inf_009', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_010', 'inf_010', 'Leve',      1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_011', 'inf_011', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_012', 'inf_012', 'Moderada',  1, 2, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_013', 'inf_013', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_014', 'inf_014', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_015', 'inf_015', 'Grave',     2, 3, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('inf_v_016', 'inf_016', 'Muy grave', 3, 4, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0');

-- ============================================================
-- Seed — 2 reglas nuevas en Competencia Anual (tablas ya existentes
-- de v033) para los niveles cubiertos en esta tanda. Suspensión/
-- Exclusión disciplinaria se siembran en la tanda 2, junto con esos
-- niveles.
-- ============================================================
INSERT INTO public.reglas_competencia (id_local, codigo, nombre, descripcion, origen, modulo_origen, activa, destaca, orden) VALUES
  ('r_sancion_observ', 'sancion_observacion',    'Observación disciplinaria (Sanciones)',     'Nivel 1 de la política de sanciones — aplicada por el supervisor.', 'Automático', 'Sanciones', true, false, 9),
  ('r_sancion_aperc',  'sancion_apercibimiento',  'Apercibimiento disciplinario (Sanciones)', 'Nivel 2 de la política de sanciones — con descargo obligatorio.',    'Automático', 'Sanciones', true, false, 10);

INSERT INTO public.reglas_competencia_versiones (id_local, regla_id_local, puntos_individual, puntos_por_companero, puntos_supervisor, vigencia_desde, cargada_por, motivo_carga) VALUES
  ('v_sancion_observ', 'r_sancion_observ', -5,  0,  0, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0'),
  ('v_sancion_aperc',  'r_sancion_aperc', -20,  0, -5, '2026-01-01', 'Sistema (seed v034)', 'Configuración inicial — Política de Sanciones v1.0');

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

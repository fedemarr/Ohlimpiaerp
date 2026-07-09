-- =============================================================================
-- Migración: v033 — Módulo Competencia Anual v2 (motor de puntos con ledger)
-- Fecha:     2026-07-09
-- Autor:     Fede (con diseño de Lautaro + Claude web, DISENO_competencia_anual.md)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Reemplaza el cálculo "al vuelo" del módulo actual (src/modules/competencia/
-- competencia.js: generarDatosCompetencia() recorre legajos/capacitaciones/
-- evaluaciones en cada render, sin persistencia) por un motor de puntos
-- basado en movimientos: catálogo de reglas con versiones y vigencia
-- temporal, eventos que generan movimientos en cascada (operario +
-- compañeros de servicio + supervisor), reversión auditable, cierre anual
-- con podio congelado.
--
-- DISENO_competencia_anual.md pedía nombrar este script
-- v018_competencia_anual.sql, pero v018 ya existe (adjuntos_por_id_text).
-- La migración real más reciente es v032. Se usa v033.
--
-- Correcciones respecto al SQL literal del diseño (§4.2), verificadas
-- contra el estado real del repo:
--   - sql/v025_reglas_competencia.sql ya creó una tabla `reglas_competencia`
--     como SINGLETON plano (una sola fila 'global', puntajes en un jsonb),
--     incompatible con el modelo de catálogo (N filas, una por regla, con
--     FK a versiones) que pide este diseño. Se renombra esa tabla vieja a
--     `reglas_competencia_legado_singleton` (sin pérdida real — la única
--     fila de datos son los 8 puntajes default, que de todas formas se
--     re-siembran acá como las reglas iniciales) y se crea `reglas_competencia`
--     de nuevo con el esquema de catálogo.
--   - `movimientos_puntos.estado text ('Vigente'/'Revertido')` y
--     `anios_competencia.estado text ('Abierto'/'Cerrado')` se reemplazan
--     por `revertido boolean` / `cerrado boolean` — el proyecto nunca usa
--     strings de 2 valores para banderas binarias (ver anulado, entregado,
--     vencidoConstancia en migraciones anteriores).
--   - Se agrega un campo `codigo text unique` a `reglas_competencia` (slug
--     estable, ej. 'responder_evaluacion') para que los hooks de otros
--     módulos (Capacitaciones, api/evaluacion-responder.js) no dependan
--     del id_local numérico.
--   - Se agrega un índice único parcial en eventos_puntos para que la
--     idempotencia (backfill, hooks automáticos) no dependa solo de un
--     chequeo en memoria del lado del cliente.
--   - Se agrega RLS + policy "Solo usuarios autenticados" a las 7 tablas
--     nuevas (mismo patrón que v027/v030/v032) — el diseño no incluye RLS.
--   - "sector_tipo" que usa el pseudocódigo JS del diseño no existe en
--     legajos — no es un cambio de SQL, se resuelve en JS con
--     servicio.trim().toUpperCase() === 'ADMINISTRATIVO' (mismo criterio
--     ya usado en Legajos/Descansos/Vacaciones/Uniformes).
--
-- Seed: 8 reglas iniciales (de las 9 del diseño original, se fusionan
-- "Capacitación vía video" y "Capacitación por Meet/Virtual" en una sola
-- "Capacitación virtual" — decisión del usuario, el campo real de
-- Capacitaciones (cap-lugar) no distingue video de Meet). "Sanción
-- disciplinaria" NO se siembra acá — el propio diseño la deja para cuando
-- exista el módulo Sanciones; se puede cargar después desde el Tab Reglas.
-- =============================================================================

BEGIN;

-- ============================================================
-- Rename de la tabla vieja (singleton, v025) — se preserva como
-- archivo histórico, no se borra.
-- ============================================================
ALTER TABLE public.reglas_competencia RENAME TO reglas_competencia_legado_singleton;

-- ============================================================
-- Tabla 1 — reglas_competencia (catálogo maestro, nuevo esquema)
-- ============================================================
CREATE TABLE public.reglas_competencia (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,
  origen                 text NOT NULL,        -- Automático / Manual / Ambas
  modulo_origen          text,                 -- Capacitaciones / Comercial / Sanciones / null si solo Manual
  activa                 boolean NOT NULL DEFAULT true,
  destaca                boolean NOT NULL DEFAULT false,
  orden                  integer NOT NULL DEFAULT 0,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reglas_activa ON public.reglas_competencia(activa) WHERE NOT anulado;

-- ============================================================
-- Tabla 2 — reglas_competencia_versiones (historial de puntajes)
-- ============================================================
CREATE TABLE public.reglas_competencia_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  regla_id_local         text NOT NULL,

  puntos_individual      integer NOT NULL,
  puntos_por_companero   integer NOT NULL DEFAULT 0,
  puntos_supervisor      integer NOT NULL DEFAULT 0,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  cargada_por            text NOT NULL,
  motivo_carga           text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rcv_regla    ON public.reglas_competencia_versiones(regla_id_local) WHERE NOT anulado;
CREATE INDEX idx_rcv_vigencia ON public.reglas_competencia_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ============================================================
-- Tabla 3 — eventos_puntos (agrupa cascadas por evento único)
-- ============================================================
CREATE TABLE public.eventos_puntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  regla_id_local         text NOT NULL,
  regla_version_id_local text NOT NULL,

  operario_id_local      text NOT NULL,
  nombre_operario        text NOT NULL,
  servicio_al_momento    text NOT NULL,
  supervisor_al_momento  text,

  fecha_evento           timestamptz NOT NULL,
  origen                 text NOT NULL,        -- Automático / Manual
  modulo_origen          text,
  referencia_externa     text,
  observaciones          text,

  cargado_por            text NOT NULL,

  revertido              boolean NOT NULL DEFAULT false,
  fecha_reversion        timestamptz,
  revertido_por          text,
  motivo_reversion       text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ep_regla    ON public.eventos_puntos(regla_id_local) WHERE NOT anulado;
CREATE INDEX idx_ep_operario ON public.eventos_puntos(operario_id_local) WHERE NOT anulado;
CREATE INDEX idx_ep_fecha    ON public.eventos_puntos(fecha_evento) WHERE NOT anulado;

-- Idempotencia real a nivel DB (no solo por convención del cliente):
-- un mismo evento externo (capacitación/evaluación) no puede generar
-- 2 eventos_puntos para la misma regla.
CREATE UNIQUE INDEX idx_eventos_referencia_unica ON public.eventos_puntos(regla_id_local, referencia_externa)
  WHERE NOT anulado AND referencia_externa IS NOT NULL;

-- ============================================================
-- Tabla 4 — movimientos_puntos (cada suma/resta individual)
-- ============================================================
CREATE TABLE public.movimientos_puntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  evento_id_local        text NOT NULL,
  regla_id_local         text NOT NULL,
  regla_version_id_local text NOT NULL,

  destinatario_id_local  text NOT NULL,
  nombre_destinatario    text NOT NULL,
  tipo_destinatario      text NOT NULL,        -- Operario / Compañero / Supervisor

  servicio_al_momento    text NOT NULL,
  supervisor_al_momento  text,

  puntos_congelados      integer NOT NULL,

  fecha_movimiento       timestamptz NOT NULL DEFAULT now(),
  fecha_evento           timestamptz NOT NULL,
  anio_competencia       integer NOT NULL,

  revertido              boolean NOT NULL DEFAULT false,
  fecha_reversion        timestamptz,
  revertido_por          text,
  motivo_reversion       text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mp_evento      ON public.movimientos_puntos(evento_id_local) WHERE NOT anulado;
CREATE INDEX idx_mp_destinat    ON public.movimientos_puntos(destinatario_id_local) WHERE NOT anulado;
CREATE INDEX idx_mp_servicio    ON public.movimientos_puntos(servicio_al_momento) WHERE NOT anulado;
CREATE INDEX idx_mp_anio        ON public.movimientos_puntos(anio_competencia) WHERE NOT anulado;
CREATE INDEX idx_mp_revertido_anio ON public.movimientos_puntos(revertido, anio_competencia) WHERE NOT anulado;

-- ============================================================
-- Tabla 5 — premios_competencia_anual (histórico de ganadores)
-- ============================================================
CREATE TABLE public.premios_competencia_anual (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  anio                   integer NOT NULL,
  categoria              text NOT NULL,        -- Individual / Servicio
  puesto                 integer NOT NULL,

  ganador_id_local       text NOT NULL,
  nombre_ganador         text NOT NULL,
  puntos_finales         integer NOT NULL,

  compartido_con         text,

  entregado              boolean NOT NULL DEFAULT false,
  fecha_entrega          date,
  entregado_por          text,
  observaciones          text,
  descripcion_premio     text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pca_anio      ON public.premios_competencia_anual(anio) WHERE NOT anulado;
CREATE INDEX idx_pca_categoria ON public.premios_competencia_anual(anio, categoria, puesto) WHERE NOT anulado;

-- ============================================================
-- Tabla 6 — notificaciones_no_participan
-- ============================================================
CREATE TABLE public.notificaciones_no_participan (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  operario_id_local      text NOT NULL,
  nivel_riesgo           text NOT NULL,

  destinatario_tipo      text NOT NULL,        -- Asociado / Supervisor / CompanerosServicio
  destinatario_id_local  text,

  canal                  text NOT NULL,        -- Sistema / WhatsApp / Email
  origen                 text NOT NULL,        -- Automatico / Manual
  mensaje                text,

  fecha_enviado          timestamptz NOT NULL DEFAULT now(),
  enviado_por            text NOT NULL,

  anio_competencia       integer NOT NULL,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nnp_operario ON public.notificaciones_no_participan(operario_id_local) WHERE NOT anulado;
CREATE INDEX idx_nnp_fecha    ON public.notificaciones_no_participan(fecha_enviado) WHERE NOT anulado;

-- ============================================================
-- Tabla 7 — anios_competencia (control de años abiertos/cerrados)
-- ============================================================
CREATE TABLE public.anios_competencia (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  anio                   integer UNIQUE NOT NULL,
  cerrado                boolean NOT NULL DEFAULT false,

  fecha_cierre           timestamptz,
  cerrado_por            text,
  observaciones_cierre   text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS — mismo patrón que v027/v030/v032
-- ============================================================
ALTER TABLE public.reglas_competencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.reglas_competencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.reglas_competencia_versiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.reglas_competencia_versiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.eventos_puntos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.eventos_puntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.movimientos_puntos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.movimientos_puntos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.premios_competencia_anual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.premios_competencia_anual
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.notificaciones_no_participan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.notificaciones_no_participan
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.anios_competencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.anios_competencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed — 8 reglas iniciales + primera versión de cada una +
-- año 2026 abierto
-- ============================================================
INSERT INTO public.reglas_competencia (id_local, codigo, nombre, descripcion, origen, modulo_origen, activa, destaca, orden) VALUES
  ('r_resp_eval',   'responder_evaluacion',      'Responder una evaluación',              NULL, 'Automático', 'Capacitaciones', true, false, 1),
  ('r_resp_ok',     'respuesta_correcta',        'Respuesta correcta (por pregunta)',     NULL, 'Automático', 'Capacitaciones', true, false, 2),
  ('r_cap_presen',  'capacitacion_presencial',   'Capacitación presencial en oficina',    NULL, 'Automático', 'Capacitaciones', true, true,  3),
  ('r_cap_serv',    'capacitacion_servicio',     'Capacitación en servicio',              NULL, 'Automático', 'Capacitaciones', true, false, 4),
  ('r_cap_virtual', 'capacitacion_virtual',      'Capacitación virtual (video/Meet)',     'Fusiona "vía video" y "por Meet/Virtual" del diseño original — el campo real de Capacitaciones no distingue ambas modalidades.', 'Automático', 'Capacitaciones', true, false, 5),
  ('r_equipo',      'participacion_equipo',      'Participación en equipo',               'Mismo servicio responde/participa junto — carga manual hasta que exista un evento concreto que la dispare.', 'Automático', 'Capacitaciones', true, true, 6),
  ('r_no_particip', 'no_participar_evaluacion',  'No participar en evaluación',           'Descuento al operario, sus compañeros de servicio y su supervisor.', 'Automático', 'Capacitaciones', true, false, 7),
  ('r_felicit',     'felicitacion_cliente',      'Felicitación de cliente',               'Sin módulo Comercial todavía — carga manual desde el Tab Historial.', 'Ambas', 'Comercial', true, true, 8);

INSERT INTO public.reglas_competencia_versiones (id_local, regla_id_local, puntos_individual, puntos_por_companero, puntos_supervisor, vigencia_desde, cargada_por, motivo_carga) VALUES
  ('v_resp_eval',   'r_resp_eval',   10,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_resp_ok',     'r_resp_ok',      5,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_cap_presen',  'r_cap_presen',  20,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_cap_serv',    'r_cap_serv',    10,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_cap_virtual', 'r_cap_virtual', 12,  0,  0,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_equipo',      'r_equipo',      15, 15, 10,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_no_particip', 'r_no_particip',-10, -3, -5,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial'),
  ('v_felicit',     'r_felicit',     25,  5, 10,  '2026-01-01', 'Sistema (seed v033)', 'Configuración inicial');

INSERT INTO public.anios_competencia (id_local, anio, cerrado) VALUES ('anio_2026', 2026, false);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

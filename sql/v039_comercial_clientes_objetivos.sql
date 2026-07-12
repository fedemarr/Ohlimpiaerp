-- v039_comercial_clientes_objetivos.sql
-- Clientes y Objetivos/Servicios v1.1 (Etapas 1-3) — persistencia real de
-- objetivos (hoy 100% en memoria), campos ignorados del modal de clientes,
-- y el flujo de handoff Comercial -> Operaciones para asignar supervisor.
--
-- Nota de arquitectura: a diferencia del SQL del documento de diseño
-- original, NO se agrega una columna `cliente_id bigint` en `objetivos`
-- referenciando el PK real de `clientes`. Esta base nunca usa el bigint
-- identity como clave de relación entre módulos (ver CLAUDE.md — "IDs
-- basados en timestamp... para Supabase se trunca a 9 dígitos como
-- id_local"): todas las relaciones cruzadas de este proyecto se hacen por
-- `*_id_local text`, matcheado en la capa de aplicación, nunca por FK al
-- bigint PK (mismo patrón que sanciones/enfermos/adelantos/legal). Se seguí
-- ese mismo patrón acá.

BEGIN;

-- ========== Limpieza previa: tabla objetivos vieja/incompatible ==========
-- Se encontró un `public.objetivos` ya existente en producción, vacío (0
-- filas) y con un esquema completamente distinto (parece generado por
-- inferencia automática de un JSON de ejemplo: columnas sueltas como rol/
-- tel/fecha/motivo/aprobado_por, cliente_id bigint sin id_local, sin RLS).
-- Nunca fue usado por la app (_SM.objetivos no existía hasta esta
-- migración). Se dropea con un guard que aborta si por algún motivo ya
-- tiene filas, para no perder datos reales por accidente.
DO $$
DECLARE filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='objetivos') THEN
    EXECUTE 'SELECT count(*) FROM public.objetivos' INTO filas;
    IF filas > 0 THEN
      RAISE EXCEPTION 'public.objetivos tiene % fila(s) — abortando migración, revisar antes de dropear', filas;
    END IF;
    EXECUTE 'DROP TABLE public.objetivos CASCADE';
  END IF;
END $$;

-- ========== Cambio 6 — campos ignorados del modal de clientes ==========
-- Además de ingresos_brutos/jurisdiccion_iibb (Cambio 6), se agregan acá
-- con IF NOT EXISTS los campos que guardarCliente() ya intentaba guardar
-- sin tener mapeo camelCase->snake_case en supabase.js (bug latente
-- encontrado en esta migración: sin mapeo, _toSnake() dejaba el campo en
-- camelCase, PostgREST rechazaba la columna inexistente, y el insert/update
-- completo fallaba en silencio — solo console.warn, el toast de éxito se
-- mostraba igual). Si alguna de estas columnas ya existe con este mismo
-- nombre, el IF NOT EXISTS es no-op.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ingresos_brutos     text,
  ADD COLUMN IF NOT EXISTS jurisdiccion_iibb   text,
  ADD COLUMN IF NOT EXISTS cond_pago           text,
  ADD COLUMN IF NOT EXISTS codigo_tango        text,
  ADD COLUMN IF NOT EXISTS fact_por            text,
  ADD COLUMN IF NOT EXISTS periodo_fact        text,
  ADD COLUMN IF NOT EXISTS productos_en_factura text,
  ADD COLUMN IF NOT EXISTS req_oc              text,
  ADD COLUMN IF NOT EXISTS notas_fact          text,
  ADD COLUMN IF NOT EXISTS doc_req             jsonb,
  ADD COLUMN IF NOT EXISTS contactos           jsonb,
  ADD COLUMN IF NOT EXISTS id_local            text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_id_local ON public.clientes(id_local) WHERE id_local IS NOT NULL;

-- ========== Cambio 3 — persistir objetivos ==========
CREATE TABLE public.objetivos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,

  cliente_id_local       text NOT NULL,

  codigo                 text UNIQUE NOT NULL,
  nombre                 text NOT NULL,

  tipo                   text NOT NULL,
  dir                    text,
  ciudad                 text,

  -- Handoff a Operaciones (Cambio 5)
  supervisor_asignado           text,
  supervisor_asignado_por       text,
  fecha_asignacion_supervisor   timestamptz,

  -- Precio y contrato
  modelo_precio          text NOT NULL,
  valor                  numeric(12,2),
  valor_hora             numeric(10,2),
  efts                   numeric(6,2),
  valor_eft              numeric(12,2),
  fecha_inicio           date,
  fecha_fin              date,
  contrato               text,
  productos              text,
  clausula_actualizacion text,

  -- Facturación (referencias para Tango)
  periodo_fact           text,
  req_oc                 text,
  texto_factura          text,

  -- Estado (Cambio 5)
  estado                 text NOT NULL DEFAULT 'Presupuestado',
    -- Presupuestado / Pendiente asignación operativa / Operativo / Baja

  notas                  text,
  observaciones          text,

  cargado_por            text NOT NULL,
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  modificado_por         text,
  modificado_en          timestamptz,

  fecha_baja             date,
  dado_de_baja_por       text,
  motivo_baja            text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_obj_cliente ON public.objetivos(cliente_id_local) WHERE NOT anulado;
CREATE INDEX idx_obj_estado  ON public.objetivos(estado) WHERE NOT anulado;
CREATE INDEX idx_obj_codigo  ON public.objetivos(codigo) WHERE NOT anulado;

CREATE TABLE public.objetivo_responsables (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  nombre                 text NOT NULL,
  rol                    text,
  telefono               text,
  a_satisfacer           boolean NOT NULL DEFAULT false,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_or_objetivo ON public.objetivo_responsables(objetivo_id_local) WHERE NOT anulado;

CREATE TABLE public.objetivo_adjuntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  nombre                 text NOT NULL,
  url                    text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oa_objetivo ON public.objetivo_adjuntos(objetivo_id_local) WHERE NOT anulado;

-- ========== Cambio 5/12 — historial de supervisores con vigencia ==========
CREATE TABLE public.objetivo_supervisores_historial (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  supervisor_nombre      text NOT NULL,

  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,

  asignado_por           text NOT NULL,
  motivo_cambio          text,

  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_osh_objetivo ON public.objetivo_supervisores_historial(objetivo_id_local) WHERE NOT anulado;
CREATE INDEX idx_osh_vigencia ON public.objetivo_supervisores_historial(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- ========== §4.2 — auditoría de transiciones de estado del objetivo ==========
CREATE TABLE public.objetivo_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,

  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por           text NOT NULL,
  ejecutado_rol           text,
  ejecutado_en            timestamptz NOT NULL DEFAULT now(),
  observaciones           text,

  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oe_objetivo ON public.objetivo_eventos(objetivo_id_local);

-- ========== RLS ==========
ALTER TABLE public.objetivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_responsables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_supervisores_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivo_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY objetivos_all ON public.objetivos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY objetivo_responsables_all ON public.objetivo_responsables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY objetivo_adjuntos_all ON public.objetivo_adjuntos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY objetivo_supervisores_historial_all ON public.objetivo_supervisores_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY objetivo_eventos_all ON public.objetivo_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

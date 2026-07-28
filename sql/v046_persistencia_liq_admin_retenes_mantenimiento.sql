-- v046_persistencia_liq_admin_retenes_mantenimiento.sql
-- Liquidación Administración (+ Suplemento), Retenes y Mantenimiento
-- vivían 100% en memoria del navegador — sin tabla propia, sin una sola
-- llamada a supaSync en todo legacy.js. Cualquier alta/carga de horas se
-- perdía al recargar la página. Esta migración les da persistencia real.
--
-- Mismo criterio de diseño que v040 (Liquidación de horas): las
-- estructuras "día por persona" (DB.liqAdminHoras[mes][id][fechaISO],
-- DB.retenHoras[mes][id][fechaISO], etc.) NO se normalizan en una fila
-- por día — se persisten como jsonb, una fila por (persona, período),
-- preservando el shape que ya usa el código en memoria. Ver nota de
-- arquitectura en v040 para el precedente.
--
-- liqAdminHoras + liqAdminTipo + liqAdminValores (y su equivalente en
-- Suplemento) viven las 3 bajo la misma clave (mes, personaId) en el
-- código — se fusionan acá en una sola tabla por período en vez de 3,
-- porque siempre se leen/escriben juntas para la misma persona/mes.

BEGIN;

-- ========== Liquidación Administración — personal ==========
CREATE TABLE public.liq_admin_personal (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  area              text,
  categoria         text,
  horas_fijas       numeric(8,2) DEFAULT 200,
  valor_hora        numeric(12,2) DEFAULT 0,
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lap_activo ON public.liq_admin_personal(activo);

-- Horas + tipo (facturable/art42) + horas_fijas/valor_hora vigentes,
-- una fila por (persona, período). getValoresPeriodo() en el cliente
-- sigue resolviendo "el período vigente más reciente" leyendo estas filas
-- ordenadas — eso no se replica en SQL, se recalcula en JS tras cargar.
CREATE TABLE public.liq_admin_periodos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,        -- 'YYYY-MM'
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {fechaISO: horas|'F'|'AJ'|'AI'}
  tipo              text NOT NULL DEFAULT 'facturable',   -- facturable | art42
  horas_fijas       numeric(8,2),
  valor_hora        numeric(12,2),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_lapd_persona_periodo ON public.liq_admin_periodos(persona_id_local, periodo);

-- ========== Liquidación Suplemento — mismo patrón, sin "tipo" ==========
CREATE TABLE public.liq_suplemento_personal (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  area              text,
  funcion_extra     text NOT NULL,
  horas_fijas       numeric(8,2) DEFAULT 0,
  valor_hora        numeric(12,2) DEFAULT 0,
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lsp_activo ON public.liq_suplemento_personal(activo);

CREATE TABLE public.liq_suplemento_periodos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,
  horas_fijas       numeric(8,2),
  valor_hora        numeric(12,2),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_lspd_persona_periodo ON public.liq_suplemento_periodos(persona_id_local, periodo);

-- ========== Retenes ==========
-- OJO: ya existe public.retenes en producción (creada a mano, sin script
-- en este repo, con RLS habilitado desde v013) pero NUNCA usada por
-- ningún código de la app — DB.retenes no tenía ni una llamada a
-- supaSync. Mismo criterio que cat_alt_pendientes_liq en v040: se crea
-- una tabla con sufijo propio en vez de arriesgarse a un schema
-- desconocido, y se repunta la clave _SM 'retenes' → 'retenes_liq'.
CREATE TABLE public.retenes_liq (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  nro_socio         text,
  categori_base     text DEFAULT 'Operario/a limpieza',
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rl_activo ON public.retenes_liq(activo);

CREATE TABLE public.retenes_liq_horas (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {fechaISO: {hs, catAlt}}

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_rlh_persona_periodo ON public.retenes_liq_horas(persona_id_local, periodo);

-- ========== Mantenimiento ==========
CREATE TABLE public.mant_personal (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  nombre            text NOT NULL,
  nro_socio         text,
  categori_base     text DEFAULT 'Operario/a limpieza especializado/a',
  activo            boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mp_activo ON public.mant_personal(activo);

CREATE TABLE public.mant_horas (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,

  persona_id_local  text NOT NULL,
  periodo           text NOT NULL,
  horas             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_mh_persona_periodo ON public.mant_horas(persona_id_local, periodo);

ALTER TABLE public.liq_admin_personal      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_admin_periodos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_suplemento_personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_suplemento_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenes_liq             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenes_liq_horas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mant_personal           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mant_horas              ENABLE ROW LEVEL SECURITY;

CREATE POLICY liq_admin_personal_all      ON public.liq_admin_personal      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY liq_admin_periodos_all      ON public.liq_admin_periodos      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY liq_suplemento_personal_all ON public.liq_suplemento_personal FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY liq_suplemento_periodos_all ON public.liq_suplemento_periodos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY retenes_liq_all             ON public.retenes_liq             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY retenes_liq_horas_all       ON public.retenes_liq_horas       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY mant_personal_all           ON public.mant_personal           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY mant_horas_all              ON public.mant_horas              FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

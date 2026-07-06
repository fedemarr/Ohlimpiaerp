-- =============================================================================
-- Migración: v021 — Reescritura del módulo Reasignaciones (Etapa 1)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- El módulo Reasignaciones (src/modules/reasignaciones/) tenía bugs graves
-- de persistencia: aprobar/rechazar cambiaban el estado solo en memoria
-- (nunca llamaban supaSync), el ABM de motivos/aprobadores tampoco
-- persistía, y el acceso a las reasignaciones era por índice de array
-- filtrado (frágil: filtrar la lista podía terminar aprobando la fila
-- equivocada). Se reescribe el módulo de cero (política A.11 del proyecto)
-- con un modelo de 6 estados en vez de 4, según especificación de Lautaro.
--
-- La tabla `reasignaciones` ya existía (creada a mano, sin migración
-- versionada propia — solo aparece nombrada en el barrido de RLS de v015).
-- Se hace backup completo antes de recrearla.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 0 — Backup defensivo de la tabla existente (si tiene datos, no se
-- pierden; si no tiene, el backup queda vacío y es inofensivo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reasignaciones_backup_v020 AS
  SELECT * FROM public.reasignaciones;

-- ---------------------------------------------------------------------------
-- Paso 1 — Recrear reasignaciones con el modelo de 6 estados
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.reasignaciones;

CREATE TABLE public.reasignaciones (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                  text UNIQUE NOT NULL,

  -- Asociado
  legajo_id_local           text,
  nro_socio                 text NOT NULL,
  nombre_asociado           text NOT NULL,

  -- Origen
  servicio_origen           text NOT NULL,
  supervisor_origen         text NOT NULL,
  funcion_origen            text,
  zona_origen               text,

  -- Destino
  servicio_destino          text NOT NULL,
  supervisor_destino        text NOT NULL,
  funcion_destino           text,
  zona_destino              text,

  -- Detalles
  motivo                    text NOT NULL,
  fecha_solicitud           date NOT NULL DEFAULT CURRENT_DATE,
  fecha_efectiva            date NOT NULL,
  fecha_ejecucion           date,
  descripcion               text,

  -- Origen de la solicitud
  elevado_por               text NOT NULL,
  originada_por             text NOT NULL,
  pedido_vinculado_id_local text,

  -- Impacto seguros (solo se marca visualmente por ahora — la notificación
  -- real a RRHH vía campana del sistema queda para una etapa futura)
  requiere_altura           boolean NOT NULL DEFAULT false,
  requiere_poliza_esp       boolean NOT NULL DEFAULT false,

  -- Estado
  estado                    text NOT NULL DEFAULT 'Borrador',

  -- Resolución
  aprobado_por              text,
  fecha_aprobacion          timestamptz,
  motivo_rechazo            text,
  fecha_rechazo             timestamptz,
  anulado_por               text,
  fecha_anulacion           timestamptz,

  -- Auditoría
  editado_por               text,
  editado_en                timestamptz,
  anulado                   boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Paso 2 — Tablas de configuración persistida (antes vivían solo en
-- memoria vía DB.motivosReasignacion / DB.aprobadoresReas)
-- ---------------------------------------------------------------------------
CREATE TABLE public.motivos_reasignacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,
  nombre      text UNIQUE NOT NULL,
  orden       integer NOT NULL DEFAULT 0,
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Semilla: los 12 motivos que ya usaba el sistema (state.js), para no
-- perder la config actual al migrar.
INSERT INTO public.motivos_reasignacion (id_local, nombre, orden) VALUES
  ('000000001', 'Baja del servicio (cliente)', 1),
  ('000000002', 'Conflicto con cliente', 2),
  ('000000003', 'Conflicto con compañeros', 3),
  ('000000004', 'Pedido del supervisor', 4),
  ('000000005', 'Pedido del asociado', 5),
  ('000000006', 'Reducción de personal en servicio', 6),
  ('000000007', 'Cobertura de otro servicio', 7),
  ('000000008', 'Sanción disciplinaria', 8),
  ('000000009', 'Mejora de condiciones', 9),
  ('000000010', 'Cambio de categoría/función', 10),
  ('000000011', 'Reingreso', 11),
  ('000000012', 'Otro', 12);

CREATE TABLE public.aprobadores_reasignacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,
  cargo       text UNIQUE NOT NULL,
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Semilla: los 2 aprobadores actuales.
INSERT INTO public.aprobadores_reasignacion (id_local, cargo) VALUES
  ('000000001', 'Gerente de Operaciones'),
  ('000000002', 'Gerente de RRHH');

-- ---------------------------------------------------------------------------
-- Paso 3 — Legajos: columna para el historial de movimientos (hoy se
-- escribía en memoria pero nunca se persistía ni se leía)
-- ---------------------------------------------------------------------------
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS historial_movimientos jsonb DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Paso 4 — RLS (mismo patrón "solo autenticados" que el resto del sistema,
-- v015). El DROP+CREATE de reasignaciones borró sus políticas viejas.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reasignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motivos_reasignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprobadores_reasignacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.reasignaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Solo usuarios autenticados" ON public.motivos_reasignacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Solo usuarios autenticados" ON public.aprobadores_reasignacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Pendiente para etapas futuras (no en esta migración):
--   - notificaciones_sistema (campana de RRHH por impacto en póliza) — Etapa 5.
--   - Índices de rendimiento — se agregan si el volumen los justifica.
-- =============================================================================

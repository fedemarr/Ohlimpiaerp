-- =============================================================================
-- Migración: v002 — Refactor de candidatos + creación de tabla personal_rrhh
-- Fecha:     2026-05-17
-- Autor:     Lautaro (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Este script implementa los siguientes cambios sobre el módulo Candidatos:
--
-- 1. Reemplaza la tabla 'candidatos' por una versión nueva con estructura
--    corregida según el feedback de Gabriela y las políticas A.5, A.6, A.7
--    y A.8 del proyecto.
--
-- 2. Crea la tabla 'personal_rrhh' nueva, que reemplaza el texto libre del
--    campo "Contactado por" por una relación con el equipo de RRHH de la
--    cooperativa. Esta tabla va a usarse también desde otros módulos
--    (sanciones, adelantos, etc.) que necesiten referenciar a una persona
--    del equipo.
--
-- 3. Resuelve 4 inconsistencias detectadas en la auditoría:
--    - Campo 'asistio' que perdía el matiz "no registrado".
--    - Campo 'genero' que existía pero no se usaba.
--    - Campo 'estado' sin validación de valores permitidos.
--    - DNI sin restricción de unicidad (permitía duplicados).
--
-- 4. Agrega los campos pedidos por Gabriela:
--    - apellido y nombre separados (antes era un solo campo).
--    - nombre_referido (texto libre).
--    - rrhh_id (FK a tabla personal_rrhh).
--
-- 5. Agrega columnas de auditoría y soft delete según política A.7.
--
-- IMPORTANTE
-- ----------
-- Este script BORRA la tabla candidatos actual y la recrea. Los datos
-- existentes se pierden. Esto es aceptable porque son datos de prueba.
-- Antes de ejecutar, exportar los datos a CSV como respaldo.
--
-- Para ejecutar en producción con datos reales, este script debe ser
-- reemplazado por uno con ALTER TABLE (política A.7).
--
-- =============================================================================


-- =============================================================================
-- PASO 0 — Backup de datos antes de borrar (opcional, ejecutar manualmente)
-- =============================================================================
-- Antes de correr este script, ejecutar desde el dashboard de Supabase:
--   SELECT * FROM candidatos;
-- y exportar el resultado como CSV. Guardar como:
--   docs/backups/candidatos_backup_2026-05-17.csv


-- =============================================================================
-- PASO 1 — Limpiar tablas y tipos existentes (en orden correcto)
-- =============================================================================
-- Drop en orden inverso a las dependencias (primero las que dependen de otras)

DROP TABLE IF EXISTS public.candidatos CASCADE;
-- CASCADE elimina también constraints externas que apunten a candidatos
-- (por ejemplo, FKs futuras desde psicos, turnos, etc).

-- Si los tipos ENUM ya existen (de una corrida anterior), eliminarlos
DROP TYPE IF EXISTS estado_candidato;
DROP TYPE IF EXISTS genero_persona;


-- =============================================================================
-- PASO 2 — Crear tipos ENUM para valores cerrados
-- =============================================================================
-- ENUM = lista cerrada de valores permitidos. Si alguien intenta guardar un
-- valor distinto, PostgreSQL rechaza la operación.

CREATE TYPE estado_candidato AS ENUM (
  'Sin citar',
  'Citado',
  'Entrevistado',
  'Aprobado',
  'Rechazado',
  'Psicotecnico'
);

CREATE TYPE genero_persona AS ENUM (
  'Masculino',
  'Femenino',
  'Otro'
);


-- =============================================================================
-- PASO 3 — Crear tabla personal_rrhh
-- =============================================================================
-- Equipo de RRHH de la cooperativa. Estas personas entrevistan candidatos,
-- gestionan altas, aprueban sanciones, etc.
-- Otros módulos del sistema van a referenciar esta tabla cuando necesiten
-- vincular una acción con una persona del equipo.

CREATE TABLE public.personal_rrhh (
  id          bigint generated always as identity PRIMARY KEY,
  nombre      text NOT NULL,
  puesto      text,
  -- Texto libre. Ejemplos: "Responsable de RRHH", "Auxiliar de selección",
  -- "Liquidador", etc. Por ahora no es obligatorio.

  -- Flags de estado
  activa      boolean NOT NULL DEFAULT true,
  -- 'activa' = trabaja en el equipo actualmente (puede desactivarse temporal).

  anulado     boolean NOT NULL DEFAULT false,
  -- 'anulado' = baja definitiva (soft delete, política A.7).

  -- Auditoría
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Insertamos las 5 personas del área de RRHH de Ohlimpia.
INSERT INTO public.personal_rrhh (nombre) VALUES
  ('Gabriela Lucero'),
  ('Matilde Noceti'),
  ('Jimena Martinez'),
  ('Martina Ramirez'),
  ('Naara Rodriguez');


-- =============================================================================
-- PASO 4 — Crear tabla candidatos nueva
-- =============================================================================

CREATE TABLE public.candidatos (
  -- ====================
  -- Identificadores
  -- ====================
  id              bigint generated always as identity PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,
  -- id_local es el ID que usa el frontend (timestamp truncado).

  -- ====================
  -- Datos personales
  -- ====================
  apellido        text NOT NULL,
  nombre          text NOT NULL,
  dni             text NOT NULL UNIQUE,
  -- DNI obligatorio y único: bloquea duplicados a nivel de base.

  cuit            text,
  fec_nac         date,
  -- Tipo 'date' real, no string. Permite calcular edad y ordenar.

  email           text,
  tel             text,
  estado_civil    text,
  genero          genero_persona,
  -- Solo acepta 'Masculino', 'Femenino' o 'Otro'.

  -- ====================
  -- Domicilio
  -- ====================
  calle           text,
  piso            text,
  zona            text,
  localidad       text,

  -- ====================
  -- Origen del contacto
  -- ====================
  medio           text,
  -- Por ejemplo: 'Referido', 'Web', 'Aviso', etc.

  nombre_referido text,
  -- Texto libre. Si en el futuro queremos relacionarlo con otra persona del
  -- sistema, agregamos una FK. Por ahora va como string.

  rrhh_id         bigint REFERENCES public.personal_rrhh(id),
  -- FK a la tabla personal_rrhh. Si la persona se anula, este campo queda
  -- apuntando al registro anulado (no se rompe la integridad).

  -- ====================
  -- Estado del candidato
  -- ====================
  estado          estado_candidato NOT NULL DEFAULT 'Sin citar',
  -- Solo acepta los 6 valores definidos en el ENUM.

  -- ====================
  -- Cita / Entrevista
  -- ====================
  fecha_cita      date,
  -- Tipo 'date' real. Si no hay cita, queda NULL.

  hora_cita       time,
  -- Tipo 'time' real. Si no hay cita, queda NULL.

  asistio         text,
  -- Valores válidos: 'si', 'no', NULL.
  -- NULL = no registrado todavía (resuelve el bug que le pasó a Gabriela).
  -- Restricción CHECK abajo asegura solo esos valores.

  motivo_rechazo  text,
  obs_entrevista  text,
  obs             text,
  -- Observaciones generales del candidato.

  -- ====================
  -- Soft delete (política A.7)
  -- ====================
  anulado         boolean NOT NULL DEFAULT false,
  anulado_por     text,
  -- Quién hizo la anulación (nombre o username).
  anulado_fecha   timestamptz,

  -- ====================
  -- Auditoría (política A.8)
  -- ====================
  creado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- ====================
  -- Restricciones
  -- ====================
  CONSTRAINT asistio_valores_validos
    CHECK (asistio IS NULL OR asistio IN ('si', 'no'))
);


-- =============================================================================
-- PASO 5 — Habilitar Row Level Security (replica la política existente)
-- =============================================================================

ALTER TABLE public.personal_rrhh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total personal_rrhh" ON public.personal_rrhh
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total candidatos" ON public.candidatos
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- PASO 6 — Trigger para actualizar updated_at automáticamente
-- =============================================================================
-- Cada vez que se modifica una fila, updated_at se pone en el momento actual.

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_candidatos
  BEFORE UPDATE ON public.candidatos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER set_updated_at_personal_rrhh
  BEFORE UPDATE ON public.personal_rrhh
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- Resumen de lo que hace este script:
--   1. Borra la tabla candidatos vieja (y sus dependencias) con CASCADE.
--   2. Crea los tipos ENUM 'estado_candidato' y 'genero_persona'.
--   3. Crea la tabla 'personal_rrhh' con 5 filas iniciales (equipo actual).
--   4. Crea la tabla 'candidatos' nueva con estructura completa y validada.
--   5. Habilita Row Level Security en ambas tablas.
--   6. Configura triggers para auto-actualizar updated_at.
--
-- Después de ejecutar este script:
--   - Hay que actualizar src/shared/supabase.js (mapeo camel<->snake).
--   - Hay que adaptar src/modules/candidatos/candidatos.js.
--   - Hay que adaptar el HTML del formulario.
--   - Hay que crear el módulo Personal RRHH (ABM básico).
-- =============================================================================

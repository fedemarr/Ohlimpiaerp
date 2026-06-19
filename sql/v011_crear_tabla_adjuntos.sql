-- =====================================================================
-- v011 — Crear tabla adjuntos
-- =====================================================================
-- Mini-proyecto: Adjuntos + Reconstrucción de Legajos
-- Fecha: 2026-05-29 (diseño) / 2026-06-17 (validación pre-aplicación)
-- Política A.5: cada cambio de estructura genera un script SQL nuevo
--
-- Decisiones de diseño tomadas:
--   - Clave de conciliación: DNI (unificado en todo el sistema)
--   - Soft delete con auditoría completa (subido_por + borrado_por)
--   - Soporte de historial vía campo 'vigente' (para antecedentes)
--   - Tipos enumerados con check constraint (no texto libre)
--   - Trigger updated_at siguiendo convención de v002/v007/v009
--   - RLS habilitado con policy abierta (convención del sistema)
--
-- Ejecución: envuelto en transacción. Si algo falla, se revierte todo.
-- =====================================================================

begin;

create table adjuntos (
    -- Identificador único (patrón estándar del sistema)
    id bigserial primary key,
    id_local text,

    -- Vínculo con la persona (clave de conciliación con todos los módulos)
    dni text not null,

    -- A qué etapa del flujo pertenece el archivo
    etapa text not null check (etapa in (
        'psicotecnico',
        'preocupacional',
        'documentacion',
        'alta'
    )),

    -- Qué tipo de archivo es (define qué etapa lo admite y si es obligatorio)
    tipo text not null check (tipo in (
        'informe-psico',         -- Etapa psicotecnico (opcional)
        'apto-medico',           -- Etapa preocupacional (obligatorio si aprueba)
        'no-apto',               -- Etapa preocupacional (opcional si rechaza)
        'antecedente',           -- Etapa documentacion (obligatorio + historial)
        'libreta',               -- Etapa documentacion (opcional)
        'curso',                 -- Etapa documentacion (opcional)
        'dni-frente',            -- Etapa alta (obligatorio)
        'dni-dorso',             -- Etapa alta (obligatorio)
        'foto-rostro',           -- Etapa alta (obligatorio)
        'monotributo',           -- Etapa alta (obligatorio)
        'inaes'                  -- Etapa alta (opcional)
    )),

    -- Ubicación física del archivo
    url text not null,                    -- ruta en Supabase Storage
    nombre_archivo text not null,         -- nombre humano para mostrar/descargar

    -- Vencimiento (nullable: la mayoría de tipos no vencen)
    fecha_vencimiento date,

    -- Vigencia: true por defecto. false cuando se reemplaza por una versión nueva.
    -- Uso principal: historial de antecedentes (los viejos quedan vigente=false
    -- pero todos siguen visibles en el legajo).
    vigente boolean not null default true,

    -- Auditoría de subida (snapshot del operador al momento)
    subido_por_id bigint not null,        -- currentUser.id de DB.usuarios
    subido_por_nombre text not null,      -- currentUser.nombre
    subido_en timestamptz not null default now(),

    -- Auditoría de borrado (soft delete con registro completo)
    borrado boolean not null default false,
    borrado_por_id bigint,
    borrado_por_nombre text,
    borrado_en timestamptz,

    -- Timestamps estándar del sistema
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- =====================================================================
-- ÍNDICES para consultas frecuentes
-- =====================================================================

-- Buscar todos los archivos de una persona (caso principal del legajo)
create index idx_adjuntos_dni on adjuntos(dni);

-- Buscar archivos de una etapa específica de una persona
create index idx_adjuntos_dni_etapa on adjuntos(dni, etapa);

-- Para listas filtradas que muestran solo lo vigente y no borrado
create index idx_adjuntos_vigente on adjuntos(vigente, borrado);

-- Para alerta de vencimientos (escaneo de fechas próximas)
create index idx_adjuntos_vencimiento on adjuntos(fecha_vencimiento)
    where vigente = true and borrado = false;

-- =====================================================================
-- TRIGGER updated_at
-- =====================================================================
-- Sigue la convención del sistema: la función tg_set_updated_at()
-- ya está definida en v002 (CREATE OR REPLACE), reusamos esa.
-- El cliente JS NO actualiza updated_at manualmente.

create trigger set_updated_at_adjuntos
    before update on public.adjuntos
    for each row execute function public.tg_set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
-- Sigue convención del sistema: RLS habilitado + policy abierta a public.
-- Replica el patrón de las otras tablas (candidatos, psicos, preocupacionales,
-- documentacion_ingreso, cat_alt_pendientes, legajos).
-- Deuda anotada: cuando se migre a Supabase Auth real, ajustar las policies
-- de todas las tablas en una sola tanda.

alter table adjuntos enable row level security;

create policy "Acceso total adjuntos"
    on adjuntos
    for all
    to public
    using (true)
    with check (true);

-- =====================================================================
-- COMENTARIOS de documentación (visibles desde el panel de Supabase)
-- =====================================================================

comment on table adjuntos is
    'Archivos cargados durante el flujo de selección y alta. Centraliza los documentos respaldatorios de cada etapa.';

comment on column adjuntos.dni is
    'Clave de conciliación con candidato/psico/preocup/docum/alta/legajo. Único identificador estable de la persona.';

comment on column adjuntos.etapa is
    'Momento del flujo donde se carga el archivo: psicotecnico, preocupacional, documentacion, alta.';

comment on column adjuntos.tipo is
    'Tipo específico de documento. Determina qué etapa lo admite y si es obligatorio.';

comment on column adjuntos.vigente is
    'False cuando se reemplaza por una versión más nueva. Solo el último vigente cuenta para las validaciones. Antecedentes mantiene historial: todos los anteriores quedan vigente=false pero no se borran.';

comment on column adjuntos.borrado is
    'Soft delete. Si true, no se muestra pero queda en la tabla con auditoría completa de quién y cuándo borró.';

commit;

-- =====================================================================
-- REGLAS DE NEGOCIO (NO se aplican en SQL — se validan desde el código)
-- =====================================================================
--
-- Obligatorios al aprobar la etapa:
--   - preocupacional: 'apto-medico' (al cargar resultado APTO)
--   - documentacion: 'antecedente' (al aprobar)
--   - alta: 'dni-frente', 'dni-dorso', 'foto-rostro', 'monotributo'
--
-- Opcionales (se pueden subir o no):
--   - psicotecnico: 'informe-psico'
--   - preocupacional: 'no-apto' (al cargar NO APTO)
--   - documentacion: 'libreta', 'curso'
--   - alta: 'inaes'
--
-- Comportamiento de renovación:
--   - Por defecto: al subir uno nuevo del mismo tipo+dni, el viejo pasa a vigente=false
--   - Excepción: 'antecedente' guarda historial (todos los anteriores quedan
--     vigente=false pero siguen visibles en el legajo)
--
-- Formatos aceptados (validar en cliente):
--   - PDF, JPG, PNG
--   - Máximo 10 MB por archivo
--
-- Permisos (validar en cliente + Storage policies):
--   - Solo RRHH puede subir, ver, borrar
--
-- Alertas (sistema separado, no en este schema):
--   - 15 días antes del vencimiento, marcar para notificación
-- =====================================================================

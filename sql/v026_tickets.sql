-- =============================================================================
-- Migración: v026 — Tickets (perfil DEVELOPER)
-- Fecha:     2026-07-06
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Nuevo perfil DEVELOPER (exclusivo para Fede) con 4 pantallas propias:
-- Inicio, Tickets, Proyección, Seguridad. Las sugerencias que ya cargan
-- los demás perfiles desde el módulo existente (tabla `sugerencias`) se
-- convierten automáticamente en tickets la primera vez que este perfil
-- inicia sesión (sincronizarSugerenciasComoTickets()).
--
-- Roadmap y checklist de seguridad NO viven acá — se persisten en
-- localStorage del navegador, no en Supabase (ver PROMPT_OHLIMPIA_ERP_DEV.md).
--
-- NOTA: se agrega la columna `fecha` (texto DD/MM/AAAA) además de
-- created_at/updated_at, porque _toCamel() en supabase.js descarta
-- explícitamente created_at/updated_at al leer de Supabase (mismo
-- criterio que el resto de las tablas migradas — reasignaciones,
-- capacitaciones, etc. — que siempre tienen su propio campo `fecha`
-- en vez de depender de las columnas automáticas de Postgres).
-- =============================================================================

BEGIN;

CREATE TABLE public.tickets (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text UNIQUE NOT NULL,
  sugerencia_id  text,
  titulo         text NOT NULL,
  descripcion    text,
  tipo           text NOT NULL DEFAULT 'sugerencia',
  estado         text NOT NULL DEFAULT 'abierto',
  prioridad      text NOT NULL DEFAULT 'media',
  modulo         text,
  autor          text,
  fecha          text,
  respuesta_dev  text,
  resuelto_at    timestamptz,
  anulado        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.tickets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

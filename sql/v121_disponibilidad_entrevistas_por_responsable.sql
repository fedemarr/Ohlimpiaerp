-- =============================================================================
-- Migración: v121 — Disponibilidad de entrevistas persistida, por responsable
-- Fecha:     07/09/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO (ticket "calendario de entrevistas", 07/09)
-- --------
-- La configuración de disponibilidad (días habilitados, horario, duración
-- del turno, cupo por horario) vivía SOLO en memoria del navegador
-- (configAgente en calendario.js) — se perdía en cada reload y era la
-- misma para cualquiera que entrara, no la disponibilidad personal de
-- quien está agendando. El link público de WhatsApp (/agendar-entrevista)
-- usaba, aparte, su propia copia hardcodeada de esos mismos valores por
-- defecto (CONFIG_DEFAULT en api/agendar-turno.js) — completamente
-- desconectada de lo que se configurara en el calendario interno.
--
-- Decisión confirmada con Fede: la disponibilidad es POR PERSONA de RRHH
-- (cada responsable tiene sus propios días/horario), no una sola
-- compartida. Por eso esta tabla es por "responsable" (mismo criterio de
-- identidad que ya usa turnos.responsable y getResponsables() en
-- calendario.js: nickname o primer nombre — texto libre, no un id de
-- usuario, porque DB.rrhh permite gente sin cuenta de sistema).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.disponibilidad_entrevistas (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text NOT NULL UNIQUE,

  responsable       text NOT NULL UNIQUE,
  dias_habilitados  integer[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 0=domingo … 6=sábado, igual que Date.getDay()
  hora_desde        text NOT NULL DEFAULT '09:00',
  hora_hasta        text NOT NULL DEFAULT '17:00',
  duracion          integer NOT NULL DEFAULT 20,               -- minutos por turno
  max_por_turno     integer NOT NULL DEFAULT 2,                -- cupo simultáneo por franja

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disponibilidad_entrevistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.disponibilidad_entrevistas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

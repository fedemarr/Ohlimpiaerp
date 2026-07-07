-- =============================================================================
-- Migración: v029 — Campana de notificaciones del sistema
-- Fecha:     2026-07-07
-- Autor:     Fede (diseño propio — ver nota abajo)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- DISENO_vacaciones.md (§3.14, §11.2) asume que ya existe una tabla
-- `notificaciones_sistema` "creada en Reasignaciones" para avisar cada
-- transición del flujo de aprobación (elevar, aprobar/rechazar Gerente,
-- aprobar/rechazar Consejo, solicitar/resolver anulación). En la
-- práctica esa tabla NUNCA se creó — en sql/v021_reasignaciones.sql solo
-- aparece como un comentario de una etapa futura ("Etapa 5") que no se
-- implementó. Tampoco existe ninguna campana de UI en el proyecto (lo
-- único parecido es un panel de conteos estático en Inicio, sin
-- persistencia ni estado de leído).
--
-- Esta migración crea la tabla desde cero, como utilidad COMPARTIDA
-- (no exclusiva de Vacaciones) para que otros módulos puedan sumarse
-- después sin rehacer nada — ver src/shared/notificaciones.js.
--
-- destinatario_nombre (no un id de usuario/auth) porque el mock de
-- permisos de Vacaciones (permisos.js) resuelve Gerente/Consejo por
-- nombre, y currentUser.nombre ya está disponible tras el login.
-- =============================================================================

BEGIN;

CREATE TABLE public.notificaciones_sistema (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  tipo                  text NOT NULL,
  entidad_tipo          text NOT NULL DEFAULT 'vacacion',
  entidad_id_local      text,
  destinatario_nombre   text NOT NULL,
  mensaje               text NOT NULL,
  leida                 boolean NOT NULL DEFAULT false,
  leida_en              timestamptz,
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_destinatario ON public.notificaciones_sistema(destinatario_nombre) WHERE NOT leida AND NOT anulado;

ALTER TABLE public.notificaciones_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.notificaciones_sistema
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

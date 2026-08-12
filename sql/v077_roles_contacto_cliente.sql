-- =============================================================================
-- Migración: v077 — Rol de contacto de cliente parametrizable
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Tema 6.a del relevamiento (Lautaro, 10/08): en la solapa Contactos del
-- alta de cliente, el campo Rol era texto libre — pasa a ser un
-- desplegable parametrizable, administrable en Configuración.
--
-- Se verificó contra la base real (75 clientes importados en Comercial
-- Fase 2) que ningún cliente tiene contactos.rol cargado todavía
-- (columna contactos jsonb vacía en todos) — no hay riesgo de
-- retrocompatibilidad con valores libres ya guardados. El catálogo
-- semilla es la unión de los ejemplos del ticket + los roles que ya
-- aparecían en los datos de demo del propio código (legacy.js).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.roles_contacto_cliente (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles_contacto_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.roles_contacto_cliente
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.roles_contacto_cliente (id_local, nombre, orden) VALUES
  ('rol_nos_trajo',      'Quien nos trajo',              10),
  ('rol_recibe_fact',    'Recibe facturas',               20),
  ('rol_gerente_compras','Gerente de compras',            30),
  ('rol_gerente_operaciones','Gerente de Operaciones',    40),
  ('rol_jefe_serv_generales','Jefe de Servicios Generales',50),
  ('rol_contacto_cobros','Contacto de cobros',            60),
  ('rol_encargado_seguridad','Encargado de seguridad',    70),
  ('rol_otro',           'Otro',                          80)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

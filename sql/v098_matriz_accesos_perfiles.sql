-- =============================================================================
-- Migración: v098 — Matriz de accesos y perfiles (tab "Acceso y perfiles")
-- Fecha:     2026-08-24
-- Fuente:    MATRIZ_ACCESOS_PERFILES.xlsx — hoja "MATRIZ PERFILES"
--            (seed generado por scripts/gen_v098.cjs desde el CSV exportado)
-- =============================================================================
--
-- MODELO
-- ------
-- * perfil_accesos: la PLANTILLA editable por perfil ("El perfil es la
--   PLANTILLA que precarga la grilla del usuario; después se ajusta
--   individual" — nota de la propia planilla). Nivel: 2=M modificar,
--   1=L solo lectura, 0=— sin acceso.
-- * usuario_accesos: override INDIVIDUAL por usuario (misma escala).
--   Efectivo = override usuario ?? plantilla perfil ?? fallback PERFILES.
--   Los 4 módulos "(futuro)" se persisten igual aunque todavía no tengan
--   pantalla, para que cuando existan ya estén configurados.
-- * RLS: lectura para cualquier autenticado (el menú la necesita para
--   decidir qué mostrar); escritura SOLO Administrador total (mismo
--   patrón que usuarios_update_propio_o_admin en v013).
--
BEGIN;

CREATE TABLE IF NOT EXISTS public.perfil_accesos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  perfil     text NOT NULL,
  modulo_key text NOT NULL,
  nivel      smallint NOT NULL DEFAULT 0 CHECK (nivel IN (0,1,2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil, modulo_key)
);

CREATE TABLE IF NOT EXISTS public.usuario_accesos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  modulo_key text NOT NULL,
  nivel      smallint NOT NULL DEFAULT 0 CHECK (nivel IN (0,1,2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, modulo_key)
);

ALTER TABLE public.perfil_accesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_accesos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accesos_select_authenticated" ON public.perfil_accesos;
CREATE POLICY "accesos_select_authenticated" ON public.perfil_accesos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "accesos_write_admin_total" ON public.perfil_accesos;
CREATE POLICY "accesos_write_admin_total" ON public.perfil_accesos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'));

DROP POLICY IF EXISTS "usuario_accesos_select_authenticated" ON public.usuario_accesos;
CREATE POLICY "usuario_accesos_select_authenticated" ON public.usuario_accesos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "usuario_accesos_write_admin_total" ON public.usuario_accesos;
CREATE POLICY "usuario_accesos_write_admin_total" ON public.usuario_accesos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'));

-- -----------------------------------------------------------------------------
-- SEED — exacto a la hoja "MATRIZ PERFILES" (M=2 · L=1 · —=0)
-- -----------------------------------------------------------------------------
INSERT INTO public.perfil_accesos (perfil, modulo_key, nivel) VALUES
  ('Administrador total', 'liq_admin', 2), ('Gerencia General', 'liq_admin', 2), ('Consejo Directivo', 'liq_admin', 1), ('Finanzas', 'liq_admin', 2), ('RRHH', 'liq_admin', 0), ('Logística', 'liq_admin', 0),
  ('Auditor', 'liq_admin', 0), ('Supervisor', 'liq_admin', 0), ('Comercial', 'liq_admin', 0), ('Operaciones', 'liq_admin', 0), ('DEVELOPER', 'liq_admin', 2), ('Administrador total', 'liquidacion', 2),
  ('Gerencia General', 'liquidacion', 2), ('Consejo Directivo', 'liquidacion', 1), ('Finanzas', 'liquidacion', 2), ('RRHH', 'liquidacion', 1), ('Logística', 'liquidacion', 0), ('Auditor', 'liquidacion', 1),
  ('Supervisor', 'liquidacion', 1), ('Comercial', 'liquidacion', 0), ('Operaciones', 'liquidacion', 2), ('DEVELOPER', 'liquidacion', 2), ('Administrador total', 'mantenimiento', 2), ('Gerencia General', 'mantenimiento', 2),
  ('Consejo Directivo', 'mantenimiento', 1), ('Finanzas', 'mantenimiento', 2), ('RRHH', 'mantenimiento', 1), ('Logística', 'mantenimiento', 0), ('Auditor', 'mantenimiento', 0), ('Supervisor', 'mantenimiento', 1),
  ('Comercial', 'mantenimiento', 0), ('Operaciones', 'mantenimiento', 2), ('DEVELOPER', 'mantenimiento', 2), ('Administrador total', 'reasignaciones', 2), ('Gerencia General', 'reasignaciones', 2), ('Consejo Directivo', 'reasignaciones', 1),
  ('Finanzas', 'reasignaciones', 0), ('RRHH', 'reasignaciones', 1), ('Logística', 'reasignaciones', 0), ('Auditor', 'reasignaciones', 0), ('Supervisor', 'reasignaciones', 1), ('Comercial', 'reasignaciones', 0),
  ('Operaciones', 'reasignaciones', 2), ('DEVELOPER', 'reasignaciones', 2), ('Administrador total', 'retenes', 2), ('Gerencia General', 'retenes', 2), ('Consejo Directivo', 'retenes', 1), ('Finanzas', 'retenes', 2),
  ('RRHH', 'retenes', 1), ('Logística', 'retenes', 0), ('Auditor', 'retenes', 1), ('Supervisor', 'retenes', 1), ('Comercial', 'retenes', 0), ('Operaciones', 'retenes', 2),
  ('DEVELOPER', 'retenes', 2), ('Administrador total', 'clientes', 2), ('Gerencia General', 'clientes', 2), ('Consejo Directivo', 'clientes', 1), ('Finanzas', 'clientes', 1), ('RRHH', 'clientes', 0),
  ('Logística', 'clientes', 1), ('Auditor', 'clientes', 0), ('Supervisor', 'clientes', 0), ('Comercial', 'clientes', 2), ('Operaciones', 'clientes', 1), ('DEVELOPER', 'clientes', 2),
  ('Administrador total', 'comisiones', 2), ('Gerencia General', 'comisiones', 2), ('Consejo Directivo', 'comisiones', 1), ('Finanzas', 'comisiones', 2), ('RRHH', 'comisiones', 0), ('Logística', 'comisiones', 0),
  ('Auditor', 'comisiones', 0), ('Supervisor', 'comisiones', 0), ('Comercial', 'comisiones', 2), ('Operaciones', 'comisiones', 0), ('DEVELOPER', 'comisiones', 2), ('Administrador total', 'crm', 2),
  ('Gerencia General', 'crm', 2), ('Consejo Directivo', 'crm', 1), ('Finanzas', 'crm', 0), ('RRHH', 'crm', 0), ('Logística', 'crm', 0), ('Auditor', 'crm', 0),
  ('Supervisor', 'crm', 0), ('Comercial', 'crm', 2), ('Operaciones', 'crm', 0), ('DEVELOPER', 'crm', 2), ('Administrador total', 'cobros', 2), ('Gerencia General', 'cobros', 2),
  ('Consejo Directivo', 'cobros', 1), ('Finanzas', 'cobros', 2), ('RRHH', 'cobros', 0), ('Logística', 'cobros', 0), ('Auditor', 'cobros', 0), ('Supervisor', 'cobros', 0),
  ('Comercial', 'cobros', 2), ('Operaciones', 'cobros', 0), ('DEVELOPER', 'cobros', 2), ('Administrador total', 'precios', 2), ('Gerencia General', 'precios', 2), ('Consejo Directivo', 'precios', 1),
  ('Finanzas', 'precios', 2), ('RRHH', 'precios', 0), ('Logística', 'precios', 0), ('Auditor', 'precios', 0), ('Supervisor', 'precios', 0), ('Comercial', 'precios', 2),
  ('Operaciones', 'precios', 0), ('DEVELOPER', 'precios', 2), ('Administrador total', 'reclamos', 2), ('Gerencia General', 'reclamos', 2), ('Consejo Directivo', 'reclamos', 2), ('Finanzas', 'reclamos', 2),
  ('RRHH', 'reclamos', 2), ('Logística', 'reclamos', 2), ('Auditor', 'reclamos', 2), ('Supervisor', 'reclamos', 2), ('Comercial', 'reclamos', 2), ('Operaciones', 'reclamos', 1),
  ('DEVELOPER', 'reclamos', 2), ('Administrador total', 'objetivos', 2), ('Gerencia General', 'objetivos', 2), ('Consejo Directivo', 'objetivos', 1), ('Finanzas', 'objetivos', 1), ('RRHH', 'objetivos', 1),
  ('Logística', 'objetivos', 1), ('Auditor', 'objetivos', 1), ('Supervisor', 'objetivos', 1), ('Comercial', 'objetivos', 2), ('Operaciones', 'objetivos', 2), ('DEVELOPER', 'objetivos', 2),
  ('Administrador total', 'supervision', 2), ('Gerencia General', 'supervision', 2), ('Consejo Directivo', 'supervision', 1), ('Finanzas', 'supervision', 2), ('RRHH', 'supervision', 0), ('Logística', 'supervision', 0),
  ('Auditor', 'supervision', 0), ('Supervisor', 'supervision', 0), ('Comercial', 'supervision', 1), ('Operaciones', 'supervision', 1), ('DEVELOPER', 'supervision', 2), ('Administrador total', 'supervisores', 2),
  ('Gerencia General', 'supervisores', 2), ('Consejo Directivo', 'supervisores', 1), ('Finanzas', 'supervisores', 1), ('RRHH', 'supervisores', 1), ('Logística', 'supervisores', 0), ('Auditor', 'supervisores', 0),
  ('Supervisor', 'supervisores', 1), ('Comercial', 'supervisores', 1), ('Operaciones', 'supervisores', 2), ('DEVELOPER', 'supervisores', 2), ('Administrador total', 'legajos', 2), ('Gerencia General', 'legajos', 2),
  ('Consejo Directivo', 'legajos', 1), ('Finanzas', 'legajos', 1), ('RRHH', 'legajos', 2), ('Logística', 'legajos', 0), ('Auditor', 'legajos', 0), ('Supervisor', 'legajos', 0),
  ('Comercial', 'legajos', 0), ('Operaciones', 'legajos', 1), ('DEVELOPER', 'legajos', 2), ('Administrador total', 'capacitaciones', 2), ('Gerencia General', 'capacitaciones', 2), ('Consejo Directivo', 'capacitaciones', 1),
  ('Finanzas', 'capacitaciones', 0), ('RRHH', 'capacitaciones', 2), ('Logística', 'capacitaciones', 2), ('Auditor', 'capacitaciones', 0), ('Supervisor', 'capacitaciones', 1), ('Comercial', 'capacitaciones', 0),
  ('Operaciones', 'capacitaciones', 2), ('DEVELOPER', 'capacitaciones', 2), ('Administrador total', 'competencia', 2), ('Gerencia General', 'competencia', 2), ('Consejo Directivo', 'competencia', 1), ('Finanzas', 'competencia', 1),
  ('RRHH', 'competencia', 2), ('Logística', 'competencia', 1), ('Auditor', 'competencia', 1), ('Supervisor', 'competencia', 1), ('Comercial', 'competencia', 1), ('Operaciones', 'competencia', 1),
  ('DEVELOPER', 'competencia', 2), ('Administrador total', 'descansos', 2), ('Gerencia General', 'descansos', 2), ('Consejo Directivo', 'descansos', 1), ('Finanzas', 'descansos', 0), ('RRHH', 'descansos', 2),
  ('Logística', 'descansos', 0), ('Auditor', 'descansos', 0), ('Supervisor', 'descansos', 1), ('Comercial', 'descansos', 0), ('Operaciones', 'descansos', 2), ('DEVELOPER', 'descansos', 2),
  ('Administrador total', 'enfermos', 2), ('Gerencia General', 'enfermos', 2), ('Consejo Directivo', 'enfermos', 1), ('Finanzas', 'enfermos', 0), ('RRHH', 'enfermos', 2), ('Logística', 'enfermos', 0),
  ('Auditor', 'enfermos', 0), ('Supervisor', 'enfermos', 1), ('Comercial', 'enfermos', 0), ('Operaciones', 'enfermos', 1), ('DEVELOPER', 'enfermos', 2), ('Administrador total', 'sanciones', 2),
  ('Gerencia General', 'sanciones', 2), ('Consejo Directivo', 'sanciones', 1), ('Finanzas', 'sanciones', 1), ('RRHH', 'sanciones', 2), ('Logística', 'sanciones', 1), ('Auditor', 'sanciones', 1),
  ('Supervisor', 'sanciones', 1), ('Comercial', 'sanciones', 1), ('Operaciones', 'sanciones', 2), ('DEVELOPER', 'sanciones', 2), ('Administrador total', 'legal', 2), ('Gerencia General', 'legal', 2),
  ('Consejo Directivo', 'legal', 1), ('Finanzas', 'legal', 0), ('RRHH', 'legal', 2), ('Logística', 'legal', 0), ('Auditor', 'legal', 0), ('Supervisor', 'legal', 0),
  ('Comercial', 'legal', 0), ('Operaciones', 'legal', 0), ('DEVELOPER', 'legal', 2), ('Administrador total', 'vacaciones', 2), ('Gerencia General', 'vacaciones', 2), ('Consejo Directivo', 'vacaciones', 1),
  ('Finanzas', 'vacaciones', 0), ('RRHH', 'vacaciones', 2), ('Logística', 'vacaciones', 0), ('Auditor', 'vacaciones', 0), ('Supervisor', 'vacaciones', 0), ('Comercial', 'vacaciones', 0),
  ('Operaciones', 'vacaciones', 0), ('DEVELOPER', 'vacaciones', 2), ('Administrador total', 'monotributos', 2), ('Gerencia General', 'monotributos', 2), ('Consejo Directivo', 'monotributos', 1), ('Finanzas', 'monotributos', 2),
  ('RRHH', 'monotributos', 2), ('Logística', 'monotributos', 0), ('Auditor', 'monotributos', 0), ('Supervisor', 'monotributos', 0), ('Comercial', 'monotributos', 0), ('Operaciones', 'monotributos', 0),
  ('DEVELOPER', 'monotributos', 2), ('Administrador total', 'uniformes', 2), ('Gerencia General', 'uniformes', 2), ('Consejo Directivo', 'uniformes', 1), ('Finanzas', 'uniformes', 1), ('RRHH', 'uniformes', 2),
  ('Logística', 'uniformes', 2), ('Auditor', 'uniformes', 1), ('Supervisor', 'uniformes', 2), ('Comercial', 'uniformes', 1), ('Operaciones', 'uniformes', 1), ('DEVELOPER', 'uniformes', 2),
  ('Administrador total', 'categorias', 2), ('Gerencia General', 'categorias', 2), ('Consejo Directivo', 'categorias', 1), ('Finanzas', 'categorias', 1), ('RRHH', 'categorias', 2), ('Logística', 'categorias', 0),
  ('Auditor', 'categorias', 0), ('Supervisor', 'categorias', 1), ('Comercial', 'categorias', 1), ('Operaciones', 'categorias', 1), ('DEVELOPER', 'categorias', 2), ('Administrador total', 'feriados', 2),
  ('Gerencia General', 'feriados', 2), ('Consejo Directivo', 'feriados', 1), ('Finanzas', 'feriados', 1), ('RRHH', 'feriados', 2), ('Logística', 'feriados', 1), ('Auditor', 'feriados', 0),
  ('Supervisor', 'feriados', 1), ('Comercial', 'feriados', 1), ('Operaciones', 'feriados', 1), ('DEVELOPER', 'feriados', 2), ('Administrador total', 'paritarias', 2), ('Gerencia General', 'paritarias', 2),
  ('Consejo Directivo', 'paritarias', 1), ('Finanzas', 'paritarias', 1), ('RRHH', 'paritarias', 2), ('Logística', 'paritarias', 0), ('Auditor', 'paritarias', 0), ('Supervisor', 'paritarias', 0),
  ('Comercial', 'paritarias', 1), ('Operaciones', 'paritarias', 0), ('DEVELOPER', 'paritarias', 2), ('Administrador total', 'smvm', 2), ('Gerencia General', 'smvm', 2), ('Consejo Directivo', 'smvm', 1),
  ('Finanzas', 'smvm', 1), ('RRHH', 'smvm', 2), ('Logística', 'smvm', 0), ('Auditor', 'smvm', 0), ('Supervisor', 'smvm', 0), ('Comercial', 'smvm', 1),
  ('Operaciones', 'smvm', 0), ('DEVELOPER', 'smvm', 2), ('Administrador total', 'configuracion', 2), ('Gerencia General', 'configuracion', 2), ('Consejo Directivo', 'configuracion', 2), ('Finanzas', 'configuracion', 1),
  ('RRHH', 'configuracion', 1), ('Logística', 'configuracion', 1), ('Auditor', 'configuracion', 1), ('Supervisor', 'configuracion', 1), ('Comercial', 'configuracion', 1), ('Operaciones', 'configuracion', 1),
  ('DEVELOPER', 'configuracion', 2), ('Administrador total', 'pedido_productos', 2), ('Gerencia General', 'pedido_productos', 2), ('Consejo Directivo', 'pedido_productos', 1), ('Finanzas', 'pedido_productos', 2), ('RRHH', 'pedido_productos', 0),
  ('Logística', 'pedido_productos', 2), ('Auditor', 'pedido_productos', 2), ('Supervisor', 'pedido_productos', 2), ('Comercial', 'pedido_productos', 1), ('Operaciones', 'pedido_productos', 1), ('DEVELOPER', 'pedido_productos', 2),
  ('Administrador total', 'proveedores', 2), ('Gerencia General', 'proveedores', 2), ('Consejo Directivo', 'proveedores', 1), ('Finanzas', 'proveedores', 2), ('RRHH', 'proveedores', 0), ('Logística', 'proveedores', 2),
  ('Auditor', 'proveedores', 0), ('Supervisor', 'proveedores', 0), ('Comercial', 'proveedores', 1), ('Operaciones', 'proveedores', 1), ('DEVELOPER', 'proveedores', 2), ('Administrador total', 'stock', 2),
  ('Gerencia General', 'stock', 2), ('Consejo Directivo', 'stock', 1), ('Finanzas', 'stock', 1), ('RRHH', 'stock', 0), ('Logística', 'stock', 2), ('Auditor', 'stock', 1),
  ('Supervisor', 'stock', 0), ('Comercial', 'stock', 0), ('Operaciones', 'stock', 1), ('DEVELOPER', 'stock', 2), ('Administrador total', 'maquinas', 2), ('Gerencia General', 'maquinas', 2),
  ('Consejo Directivo', 'maquinas', 1), ('Finanzas', 'maquinas', 2), ('RRHH', 'maquinas', 0), ('Logística', 'maquinas', 2), ('Auditor', 'maquinas', 1), ('Supervisor', 'maquinas', 2),
  ('Comercial', 'maquinas', 1), ('Operaciones', 'maquinas', 1), ('DEVELOPER', 'maquinas', 2), ('Administrador total', 'futuro_cuenta_corriente', 2), ('Gerencia General', 'futuro_cuenta_corriente', 2), ('Consejo Directivo', 'futuro_cuenta_corriente', 1),
  ('Finanzas', 'futuro_cuenta_corriente', 2), ('RRHH', 'futuro_cuenta_corriente', 0), ('Logística', 'futuro_cuenta_corriente', 0), ('Auditor', 'futuro_cuenta_corriente', 0), ('Supervisor', 'futuro_cuenta_corriente', 0), ('Comercial', 'futuro_cuenta_corriente', 1),
  ('Operaciones', 'futuro_cuenta_corriente', 0), ('DEVELOPER', 'futuro_cuenta_corriente', 2), ('Administrador total', 'futuro_contable', 2), ('Gerencia General', 'futuro_contable', 2), ('Consejo Directivo', 'futuro_contable', 1), ('Finanzas', 'futuro_contable', 2),
  ('RRHH', 'futuro_contable', 0), ('Logística', 'futuro_contable', 0), ('Auditor', 'futuro_contable', 0), ('Supervisor', 'futuro_contable', 0), ('Comercial', 'futuro_contable', 0), ('Operaciones', 'futuro_contable', 0),
  ('DEVELOPER', 'futuro_contable', 2), ('Administrador total', 'futuro_politicas', 2), ('Gerencia General', 'futuro_politicas', 2), ('Consejo Directivo', 'futuro_politicas', 1), ('Finanzas', 'futuro_politicas', 1), ('RRHH', 'futuro_politicas', 2),
  ('Logística', 'futuro_politicas', 1), ('Auditor', 'futuro_politicas', 1), ('Supervisor', 'futuro_politicas', 1), ('Comercial', 'futuro_politicas', 1), ('Operaciones', 'futuro_politicas', 1), ('DEVELOPER', 'futuro_politicas', 2),
  ('Administrador total', 'futuro_seguros', 2), ('Gerencia General', 'futuro_seguros', 2), ('Consejo Directivo', 'futuro_seguros', 1), ('Finanzas', 'futuro_seguros', 2), ('RRHH', 'futuro_seguros', 2), ('Logística', 'futuro_seguros', 1),
  ('Auditor', 'futuro_seguros', 0), ('Supervisor', 'futuro_seguros', 0), ('Comercial', 'futuro_seguros', 0), ('Operaciones', 'futuro_seguros', 1), ('DEVELOPER', 'futuro_seguros', 2)
ON CONFLICT (perfil, modulo_key) DO NOTHING;

COMMIT;

-- =============================================================================
-- DESPUÉS DE EJECUTAR:
--   1. Recargar la app: Configuración → Acceso y perfiles muestra la matriz
--      precargada y editable (los cambios se guardan en perfil_accesos).
--   2. Los usuarios siguen creándose en Supabase Auth (trigger de v013
--      autoprovisiona public.usuarios) o vía api/crear-usuario.js; el
--      override individual por usuario vive en usuario_accesos.
-- =============================================================================
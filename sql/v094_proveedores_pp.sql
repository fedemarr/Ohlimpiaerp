-- v094_proveedores_pp.sql
-- Módulo Proveedores (maestro mínimo) + FK en pp_productos para conectar
-- Pedido de Productos con el padrón de proveedores. Migración mínima según
-- ticket de conexión ( alcance: tabla + select en catálogo + filtro).

BEGIN;

-- ========== 1. Maestro de proveedores ==========
CREATE TABLE public.proveedores (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text UNIQUE NOT NULL,

  nombre        text NOT NULL,                     -- "THAMES", "DIVERSEY"
  codigo        text,                              -- "PROV-001" (opcional)
  estado        text NOT NULL DEFAULT 'activo',    -- activo / inactivo
  contacto      text,                              -- nombre del contacto / vendedor

  anulado       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_proveedores_nombre ON public.proveedores(nombre) WHERE NOT anulado;

-- ========== 2. FK proveedor en pp_productos ==========
-- Nullable para registros existentes sin proveedor asignado.
ALTER TABLE public.pp_productos
  ADD COLUMN IF NOT EXISTS proveedor_id_local text;
CREATE INDEX idx_pp_productos_proveedor ON public.pp_productos(proveedor_id_local) WHERE NOT anulado AND proveedor_id_local IS NOT NULL;

-- ========== RLS ==========
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY proveedores_all ON public.proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

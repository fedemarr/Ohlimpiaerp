-- ============================================================================
-- v100 — Módulo Proveedores (área Logística)
-- ============================================================================
-- La tabla public.proveedores YA EXISTE desde v094 (mínima: id_local, nombre,
-- codigo, estado, contacto, anulado). Este script la EXTIENDE con los campos
-- del mockup (mockup_proveedores_1.html) y crea la tabla de contactos.
--
-- No se recrea nada: los proveedores ya apuntados por pp_productos
-- (proveedor_id_local) y sembrados por _seedProveedoresDemo() quedan intactos.
--
-- Convenciones respetadas:
--   · id bigint identity PK + id_local text UNIQUE NOT NULL (supaSync).
--   · anulado boolean para borrado lógico (patrón del sistema).
--   · RLS espejo de v094: todo authenticated lee y escribe (la restricción
--     fina de quién modifica es responsabilidad del menú/UI vía la matriz
--     de accesos 'proveedores', igual que en v094).
--
-- Ejecutar en Supabase SQL Editor. Idempotente (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Nuevas columnas en proveedores (todas nullable — compatibilidad total
--    con las filas existentes de v094)
-- ---------------------------------------------------------------------------
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cuit               text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cond_arca          text;   -- 'Responsable Inscripto (Factura A)' | 'Monotributo (Factura C)' | 'Exento'
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS direccion          text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS mail               text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS telefono           text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cond_pago          text;   -- 'Contado' | 'Cta cte 30 días' | 'Contra factura c/ OK Logística'
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS cbu_alias          text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS banco              text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS frecuencia         text;   -- 'Mensual' | 'Quincenal' | 'A demanda'
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS plazo_entrega_dias integer CHECK (plazo_entrega_dias IS NULL OR plazo_entrega_dias >= 0);
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS rubros             jsonb NOT NULL DEFAULT '[]'::jsonb;  -- ["PRODUCTOS","REPARACIÓN MÁQUINAS",...]
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS marcas             text;   -- marcas que distribuye (ej. Nimi: DV/SCJ/3M…)
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS observaciones      text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS creado_por         text;

COMMENT ON COLUMN public.proveedores.cond_arca IS 'Condición frente a ARCA (antes AFIP): etiqueta completa tal como se muestra';
COMMENT ON COLUMN public.proveedores.rubros      IS 'Rubros del proveedor (array jsonb): PRODUCTOS, REPARACIÓN MÁQUINAS, ALQUILER MÁQUINAS, UNIFORMES, OTRO';

-- Backfill de rubros vacíos explícito (por si alguna fila vieja quedó con NULL
-- antes de agregar el DEFAULT — el DEFAULT no retoca filas preexistentes).
UPDATE public.proveedores SET rubros = '[]'::jsonb WHERE rubros IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Tabla proveedor_contactos (ficha → sección Contactos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proveedor_contactos (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local           text UNIQUE NOT NULL,
  proveedor_id_local text NOT NULL,
  nombre             text NOT NULL,
  rol                text,
  celular            text,
  mail               text,
  anulado            boolean NOT NULL DEFAULT false,
  creado_por         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- FK coherente con pp_productos.proveedor_id_local (v094). Los proveedores
-- nunca se borran físico (borrado lógico), así que sin ON DELETE está bien.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proveedor_contactos_proveedor_fk'
  ) THEN
    ALTER TABLE public.proveedor_contactos
      ADD CONSTRAINT proveedor_contactos_proveedor_fk
      FOREIGN KEY (proveedor_id_local) REFERENCES public.proveedores(id_local);
  END IF;
END $$;

ALTER TABLE public.proveedor_contactos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proveedor_contactos_all ON public.proveedor_contactos;
CREATE POLICY proveedor_contactos_all ON public.proveedor_contactos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3) Verificación rápida (opcional, correr a mano):
--    SELECT column_name FROM information_schema.columns
--      WHERE table_name='proveedores' ORDER BY ordinal_position;
--    SELECT count(*) FROM public.proveedor_contactos;
-- ---------------------------------------------------------------------------

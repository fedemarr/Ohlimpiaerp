-- =============================================================================
-- Migración: v126 — Retenciones: rediseño según mockup_retenciones_3.html
-- Fecha:     2026-09-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo Retenciones" traía dos supuestos incorrectos: (1) que el
-- dominio era retenciones AFIP (IVA/Ganancias/IIBB/SUSS) — es "retenciones
-- sobre haberes" (se retiene el retiro de un asociado); (2) que el módulo
-- no existía — existe desde v024/v076. Se investigó y se confirmaron 3
-- decisiones con el usuario (AskUserQuestion, todas "Recomendado"):
--   1. Se elimina el flujo de "reporte del supervisor" y los candidatos
--      automáticos genéricos (Art.42/Baja/Legal) — el mockup deja
--      Retenciones 100% en manos de RRHH/Finanzas.
--   2. El "alcance TOTAL" (retiene el retiro completo del período,
--      dinámico según horas cargadas) se implementa ahora, enganchado a
--      Liquidación de horas — no se difiere.
--   3. "Aplicar como descuento → Uniformes" reutiliza el circuito real
--      que ya existe (confirmarCierreDevolucion() en
--      src/modules/uniformes/devoluciones.js crea filas en
--      descuentos_uniforme_pendientes, consumidas por
--      descuentosAutomaticosLegajo() en legacy.js) — no se crea un
--      circuito nuevo.
--
-- CAMBIOS DE MODELO
-- -----------------
-- - periodo → periodo_desde: antes una retención aplicaba a UN período
--   exacto (r.periodo===mes); ahora es recurrente desde periodo_desde
--   mientras estado='Activa' (el mockup: "mientras la retención está
--   ACTIVA, cada período nuevo vuelve a retener").
-- - alcance ('Total'|'Parcial'): Total = todo el retiro (bruto) del
--   período, dinámico; Parcial reusa tipo_valor/monto ya existentes
--   (Monto fijo o Porcentaje).
-- - monto_acumulado + periodos_retenidos (jsonb [{periodo,monto}]): lo
--   efectivamente retenido acumulado, idempotente por período —
--   descuentosAutomaticosLegajo()/autorizarPago() en legacy.js escriben
--   acá recién cuando el pago se autoriza de verdad (mismo criterio que
--   ya usan uniforme/préstamo — "se consume al pagar, no al calcular").
-- - adjuntos (jsonb) y origen_ref (id_local de la orden que originó la
--   sugerencia, ej. una devolución de Uniformes) — nuevos, aditivos.
-- - estado pierde 'Pendiente' (era del reporte de supervisor, que se
--   elimina) y gana 'Pagada'/'Aplicada' como estados terminales,
--   registrados en la tabla nueva retenciones_movimientos (una fila por
--   cada liberación o aplicación — permite liberar/aplicar PARCIAL sin
--   perder el resto activo, tal como muestra el mockup).
-- - Catálogo motivos_retencion: se desactivan los genéricos viejos
--   (ausencias/abandono/daños/conducta/incumplimiento) y se cargan los
--   5 tipificados del mockup.
--
-- No se borra ninguna columna ni tabla existente — aditivo y
-- retrocompatible. El único registro real en producción es un caso de
-- prueba de Fede (verificado por REST antes de escribir esto).
-- =============================================================================

BEGIN;

ALTER TABLE public.retenciones RENAME COLUMN periodo TO periodo_desde;

ALTER TABLE public.retenciones
  ADD COLUMN IF NOT EXISTS alcance text NOT NULL DEFAULT 'Total',
  ADD COLUMN IF NOT EXISTS monto_acumulado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS periodos_retenidos jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS origen_ref text;

-- Retrocompat del único registro de prueba: si ya tenía tipo_valor/monto
-- cargado a mano, se interpreta como que el operador quiso un alcance
-- Parcial (el default de la columna nueva es 'Total').
UPDATE public.retenciones SET alcance = 'Parcial' WHERE tipo_valor IS NOT NULL AND monto > 0;

-- ---------------------------------------------------------------------------
-- Movimientos (liberaciones/aplicaciones) — una retención puede resolverse
-- en varios pasos (liberar una parte, aplicar otra), cada uno con su propia
-- auditoría de pago/circuito de destino.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.retenciones_movimientos (
  id                          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                    text UNIQUE NOT NULL,
  retencion_id_local          text NOT NULL,
  tipo                        text NOT NULL,          -- 'liberacion' | 'aplicacion'
  monto                       numeric NOT NULL DEFAULT 0,
  es_total                    boolean NOT NULL DEFAULT false, -- ¿cerró el saldo restante de la retención en este movimiento?
  motivo                      text,
  circuito_destino            text,                   -- solo aplicacion: 'Uniformes — devolución por baja' | 'Sanciones' | 'Otro (manual)'
  descuento_uniforme_id_local text,                    -- solo aplicacion con circuito Uniformes: id_local de descuentos_uniforme_pendientes creado
  estado_pago                 text,                    -- solo liberacion: 'Pendiente' | 'Pagada'
  fecha_pago                  date,
  comprobante                 text,
  observaciones_pago          text,
  confirmado_por              text,
  confirmado_en               timestamptz,
  creado_por                  text,
  creado_en                   timestamptz NOT NULL DEFAULT now(),
  anulado                     boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ret_mov_retencion ON public.retenciones_movimientos(retencion_id_local) WHERE NOT anulado;

ALTER TABLE public.retenciones_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.retenciones_movimientos;
CREATE POLICY "Solo usuarios autenticados" ON public.retenciones_movimientos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Catálogo de motivos — se reemplaza por los 5 tipificados del mockup.
-- Se desactivan (no se borran) los genéricos de v076 por si algún caso
-- viejo los sigue referenciando.
-- ---------------------------------------------------------------------------
UPDATE public.motivos_retencion SET activo = false
  WHERE id_local IN ('mot_ausencias','mot_abandono','mot_danos','mot_conducta','mot_incumplimiento');

INSERT INTO public.motivos_retencion (id_local, nombre, orden) VALUES
  ('mot_desvinculacion',  'Desvinculación — pendientes de devolución', 10),
  ('mot_art42',           'Art. 42',                                   20),
  ('mot_sancion',         'Sanción en proceso',                        30),
  ('mot_conflicto_legal', 'Conflicto / legal',                         40)
ON CONFLICT (id_local) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, activo = true;

UPDATE public.motivos_retencion SET orden = 50 WHERE id_local = 'mot_otro';

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

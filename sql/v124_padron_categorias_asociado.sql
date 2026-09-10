-- =============================================================================
-- Migración: v124 — Categorías: padrón de categoría por asociado
-- Fecha:     10/09/2026
-- Autor:     Fede (vía asistente)
-- =============================================================================
--
-- CONTEXTO (ticket "Mejoras en Categorías" + mockup_categorias_padron_1.html)
-- --------
-- Hoy la categoría de un operario está duplicada/desconectada en 4 lugares:
-- legajos.categoria (texto), legajos.funcion (texto), legajos.categoria_id_local
-- (el link real al catálogo, que SOLO se carga desde el "⚠ Vincular categoría"
-- de las grillas de Liquidación) y DB.categoriasSalariales (legacy, sin
-- vigencia). Este padrón es la ÚNICA fuente de verdad: un registro por
-- evento, con vigencia a nivel MES.
--
-- Decisiones (confirmadas con Fede, 10/09):
--  · Vigencia SIEMPRE a nivel mes → vigencia_desde = primer día del mes.
--  · Clave del asociado = legajo_nro (la que usa toda la app).
--  · Orígenes: ALTA (alta de asociado) · DIRECTO (cambio desde el tab nuevo)
--    · AUTORIZACION (autorización aprobada — además del override por fila que
--    se mantiene) · MASIVO (import CSV de recategorización).
--  · Carga inicial = import CSV (nro socio + categoría) que arma Fede/Lautaro.
--  · La categoría vigente de una persona en un mes = el registro con
--    vigencia_desde más reciente <= primer día de ese mes. Los meses cerrados
--    de Liquidación conservan lo que tenían (la consulta es por fecha).
--
-- Legajos y las grillas de Liquidación de horas LEEN de acá (el "⚠ Vincular
-- categoría" desaparece). La CAT. ALTERNATIVA por fila de la grilla NO se
-- toca — es un override puntual de esa grilla, no la categoría del asociado.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.padron_categorias_asociado (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local           text UNIQUE NOT NULL,

  legajo_nro         text NOT NULL,           -- clave de negocio del asociado
  categoria_id_local text NOT NULL,           -- → categorias_base.id_local
  vigencia_desde     date NOT NULL,           -- primer día del mes desde el que rige
  vigencia_hasta     date,                    -- null = vigente; se setea al insertar el siguiente

  origen             text NOT NULL,           -- 'ALTA' | 'DIRECTO' | 'AUTORIZACION' | 'MASIVO'
  motivo             text,
  pidio              text,                    -- solo AUTORIZACION: quién pidió
  aprobo             text,                    -- solo AUTORIZACION: quién aprobó
  cargado_por        text NOT NULL,
  cargado_en         timestamptz NOT NULL DEFAULT now(),

  anulado            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (legajo_nro, vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_pca_legajo   ON public.padron_categorias_asociado(legajo_nro) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pca_vigencia ON public.padron_categorias_asociado(legajo_nro, vigencia_desde) WHERE NOT anulado;

ALTER TABLE public.padron_categorias_asociado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.padron_categorias_asociado;
CREATE POLICY "Solo usuarios autenticados" ON public.padron_categorias_asociado
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

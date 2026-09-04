-- =============================================================================
-- Migración: v117 — Monotributo: tabla de categorías por organismo (ARCA/ARBA/
--            AGIP) + Condición del asociado (reemplaza "jubilado" booleano)
-- Fecha:     04/09/2026
-- Autor:     Fede + Lautaro (Finanzas)
-- =============================================================================
--
-- CONTEXTO (ticket "Monotributo — cuota por componentes", MONOTRIBUTO_para_Fede.md)
-- --------
-- La cuota deja de ser un valor por categoría cargado a mano y pasa a ser una
-- SUMA de componentes: impuesto integrado (20) + SIPA (21) + obra social (24)
-- × (1+adherentes) + IIBB unificado (ARBA si Provincia / AGIP si Capital, solo
-- si "aporta"). Validado contra 399 credenciales F.1520 reales — la fórmula
-- reproduce el total al centavo en los 399 casos.
--
-- BUG DE FONDO ENCONTRADO: legacy.js ya llama supaSync('monoTablas', ...) y
-- supabase.js ya mapea monoTablas → mono_tablas (líneas 62-70), pero la tabla
-- nunca se creó — cada guardado de tabla de categorías fallaba en silencio y
-- se perdía al recargar. Hoy la tabla ARCA vigente vive SOLO hardcodeada en
-- el JS (legacy.js ~línea 8262). Esta migración crea la tabla que el código
-- ya esperaba y la puebla con los valores YA validados (mismos del mockup
-- mockup_monotributo_componentes_1.html y de los CSV oficiales adjuntos).
--
-- Se unifica en UNA tabla con columna "organismo" (ARCA/ARBA/AGIP) en vez de
-- 3 tablas separadas — decisión confirmada con Fede — reutilizando el nombre
-- que el código ya usa.
-- =============================================================================

BEGIN;

-- ============================================================
-- Tabla de categorías por organismo y vigencia
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mono_tablas (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  organismo           text NOT NULL CHECK (organismo IN ('ARCA','ARBA','AGIP')),
  categoria           text NOT NULL,          -- 'A'..'K', o 'JUBILADO'/'ASOC_COOPERATIVA'
                                                -- (filas especiales de SIPA, solo ARCA — ver más abajo)
  vigencia_desde      date NOT NULL,

  tope_ingresos_anual numeric,                 -- solo ARCA
  impuesto_integrado  numeric,                 -- solo ARCA (null en filas especiales de SIPA)
  sipa                numeric,                 -- ARCA: normal por categoría, o valor especial (jubilado/coop)
  obra_social         numeric,                 -- solo ARCA (null en filas especiales de SIPA)
  cuota               numeric,                 -- ARBA/AGIP: cuota mensual de IIBB unificado por categoría

  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organismo, categoria, vigencia_desde)
);

ALTER TABLE public.mono_tablas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.mono_tablas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Condición del asociado (reemplaza "jubilado" booleano — el ticket agrega
-- 2 condiciones más: "Asociado a cooperativa" y "No aportante al régimen").
-- iibb_aporta: tilde "aporta IIBB" de la ficha, destildado por defecto.
-- ============================================================
ALTER TABLE public.monotributos
  ADD COLUMN IF NOT EXISTS condicion text NOT NULL DEFAULT 'comun',
  ADD COLUMN IF NOT EXISTS iibb_aporta boolean NOT NULL DEFAULT false;

ALTER TABLE public.monotributos DROP CONSTRAINT IF EXISTS monotributos_condicion_check;
ALTER TABLE public.monotributos ADD CONSTRAINT monotributos_condicion_check
  CHECK (condicion IN ('comun','asociado_cooperativa','jubilado','no_aportante'));

-- Migración automática (confirmada con Fede): el jubilado booleano viejo
-- pasa 1 a 1 a la condición nueva — son pocos casos, sin ambigüedad.
UPDATE public.monotributos SET condicion = 'jubilado' WHERE jubilado = true AND condicion = 'comun';

-- ============================================================
-- Seed: ARCA vigencia 2026-08 (11 categorías + 2 filas especiales de SIPA)
-- Fuente: mockup_monotributo_componentes_1.html (validado contra 399
-- credenciales F.1520 reales — MONOTRIBUTO_para_Fede.md).
-- ============================================================
INSERT INTO public.mono_tablas (id_local, organismo, categoria, vigencia_desde, tope_ingresos_anual, impuesto_integrado, sipa, obra_social) VALUES
  ('mt_arca_a_202608', 'ARCA', 'A', '2026-08-01', 12009410.45,   5585.77,   18246.86,  25694.55),
  ('mt_arca_b_202608', 'ARCA', 'B', '2026-08-01', 17595182.74,  10612.98,   20071.55,  25694.55),
  ('mt_arca_c_202608', 'ARCA', 'C', '2026-08-01', 24670494.31,  18246.86,   22078.71,  25694.55),
  ('mt_arca_d_202608', 'ARCA', 'D', '2026-08-01', 30628651.43,  29790.79,   24286.58,  30535.56),
  ('mt_arca_e_202608', 'ARCA', 'E', '2026-08-01', 36028231.33,  55857.73,   26715.24,  37238.48),
  ('mt_arca_f_202608', 'ARCA', 'F', '2026-08-01', 45151659.41,  78573.20,   29386.76,  42824.25),
  ('mt_arca_g_202608', 'ARCA', 'G', '2026-08-01', 53995798.87, 142995.76,   41141.46,  46175.72),
  ('mt_arca_h_202608', 'ARCA', 'H', '2026-08-01', 81924660.37, 409623.31,   57598.04,  55485.33),
  ('mt_arca_i_202608', 'ARCA', 'I', '2026-08-01', 91699761.90, 814591.79,   80637.26,  68518.81),
  ('mt_arca_j_202608', 'ARCA', 'J', '2026-08-01',105012519.20, 977510.14,  112892.16,  76897.46),
  ('mt_arca_k_202608', 'ARCA', 'K', '2026-08-01',126610838.75,1368514.20,  158049.02,  87882.82),
  -- Filas especiales de SIPA (reemplazan el 21 completo, sin impuesto integrado ni obra social)
  ('mt_arca_jub_202608',  'ARCA', 'JUBILADO',        '2026-08-01', NULL, NULL, 18246.86, NULL),
  ('mt_arca_coop_202608', 'ARCA', 'ASOC_COOPERATIVA','2026-08-01', NULL, NULL, 18246.86, NULL)
ON CONFLICT (organismo, categoria, vigencia_desde) DO NOTHING;

-- ============================================================
-- Seed: ARBA vigencia 2026-08 (columna "Locaciones y prestaciones de
-- servicios" únicamente — la de "Venta de cosas muebles" se ignora, ver
-- MONOTRIBUTO_para_Fede.md §3). Fuente: IIBB_ARBA_ago2026.csv.
-- ============================================================
INSERT INTO public.mono_tablas (id_local, organismo, categoria, vigencia_desde, cuota) VALUES
  ('mt_arba_a_202608', 'ARBA', 'A', '2026-08-01',  11505.00),
  ('mt_arba_b_202608', 'ARBA', 'B', '2026-08-01',  18720.00),
  ('mt_arba_c_202608', 'ARBA', 'C', '2026-08-01',  29260.00),
  ('mt_arba_d_202608', 'ARBA', 'D', '2026-08-01',  40685.00),
  ('mt_arba_e_202608', 'ARBA', 'E', '2026-08-01',  53850.00),
  ('mt_arba_f_202608', 'ARBA', 'F', '2026-08-01',  76250.00),
  ('mt_arba_g_202608', 'ARBA', 'G', '2026-08-01', 103490.00),
  ('mt_arba_h_202608', 'ARBA', 'H', '2026-08-01', 179010.00),
  ('mt_arba_i_202608', 'ARBA', 'I', '2026-08-01', 229420.00),
  ('mt_arba_j_202608', 'ARBA', 'J', '2026-08-01', 302140.00),
  ('mt_arba_k_202608', 'ARBA', 'K', '2026-08-01', 420750.00)
ON CONFLICT (organismo, categoria, vigencia_desde) DO NOTHING;

-- ============================================================
-- Seed: AGIP vigencia 2026-08 (única columna, mensual desde 01/2026).
-- Fuente: IIBB_AGIP_ago2026.csv.
-- NO se carga la vigencia 2026-01: MONOTRIBUTO_para_Fede.md §3 avisa que
-- solo el valor de la categoría A ($22.485) está confirmado para esa
-- vigencia — el resto (B a K) son ilustrativos del mockup, no la tabla
-- oficial. Se carga cuando llegue esa tabla real, si hace falta
-- reconstruir enero–julio.
-- ============================================================
INSERT INTO public.mono_tablas (id_local, organismo, categoria, vigencia_desde, cuota) VALUES
  ('mt_agip_a_202608', 'AGIP', 'A', '2026-08-01',  30025.00),
  ('mt_agip_b_202608', 'AGIP', 'B', '2026-08-01',  43990.00),
  ('mt_agip_c_202608', 'AGIP', 'C', '2026-08-01',  61675.00),
  ('mt_agip_d_202608', 'AGIP', 'D', '2026-08-01',  76570.00),
  ('mt_agip_e_202608', 'AGIP', 'E', '2026-08-01',  90070.00),
  ('mt_agip_f_202608', 'AGIP', 'F', '2026-08-01', 112880.00),
  ('mt_agip_g_202608', 'AGIP', 'G', '2026-08-01', 134990.00),
  ('mt_agip_h_202608', 'AGIP', 'H', '2026-08-01', 204810.00),
  ('mt_agip_i_202608', 'AGIP', 'I', '2026-08-01', 229250.00),
  ('mt_agip_j_202608', 'AGIP', 'J', '2026-08-01', 262530.00),
  ('mt_agip_k_202608', 'AGIP', 'K', '2026-08-01', 316525.00)
ON CONFLICT (organismo, categoria, vigencia_desde) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

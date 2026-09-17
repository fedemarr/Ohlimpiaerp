-- =============================================================================
-- Migración: v143 — Revisión de retiro: "Corresponde con ajuste"
-- Fecha:     2026-09-17
-- Autor:     Fede (vía asistente)
-- =============================================================================
--
-- CONTEXTO (REVISION_RESUMEN_ajustes_para_Fede.md §1c + mockup_resumen_horas_v2.html)
-- --------
-- Hasta ahora Operaciones solo podía decidir Corresponde / No corresponde
-- sobre lo que armó el supervisor, sin poder corregir el valor (como pasa
-- con el papel: el supervisor reclama 8 hs, Operaciones constata que
-- fueron 6). Se agrega un tercer camino, "Corresponde con ajuste":
--
--   · Lo SOLICITADO nunca se pisa — cantidad_horas/valor_hora/monto de
--     revisiones_retiro_lineas siguen siendo lo que armó el supervisor.
--   · El AJUSTE se guarda al lado, por línea (una solicitud puede tener
--     varias líneas, cada una con su propio ajuste o sin ajuste).
--   · revisiones_retiro.con_ajuste + ajustado_por/ajustado_en: para poder
--     mostrar el estado con nombre propio "CORRESPONDE CON AJUSTE" sin
--     inventar un estado nuevo en la máquina de estados (Finanzas sigue
--     viendo "Aprobada - pago pendiente" igual, solo cambia la etiqueta
--     que ve el supervisor).
-- =============================================================================

BEGIN;

ALTER TABLE public.revisiones_retiro
  ADD COLUMN IF NOT EXISTS con_ajuste   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ajustado_por text,
  ADD COLUMN IF NOT EXISTS ajustado_en  timestamptz;

ALTER TABLE public.revisiones_retiro_lineas
  ADD COLUMN IF NOT EXISTS ajuste_horas      numeric(7,2),
  ADD COLUMN IF NOT EXISTS ajuste_valor_hora numeric(10,2),
  ADD COLUMN IF NOT EXISTS ajuste_monto      numeric(12,2);

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select column_name from information_schema.columns where table_name='revisiones_retiro' and column_name in ('con_ajuste','ajustado_por','ajustado_en');
--   select column_name from information_schema.columns where table_name='revisiones_retiro_lineas' and column_name like 'ajuste%';
-- =============================================================================

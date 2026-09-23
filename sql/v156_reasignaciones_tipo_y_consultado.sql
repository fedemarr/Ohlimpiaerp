-- v156: REUBICACION_SUMA_SERVICIO_para_Fede.md — Reasignaciones pasa a
-- distinguir dos modalidades de movimiento:
--   REUBICACIÓN   — deja el servicio actual y pasa al nuevo (lo de siempre).
--   SUMA DE SERVICIO — mantiene el actual y agrega el nuevo (pide más horas).
--
-- Aditivo, no rompe nada existente: todo lo ya cargado es, en los hechos,
-- una reubicación (es lo único que existía hasta hoy), así que el default
-- de la columna nueva refleja exactamente ese comportamiento pasado.
--
-- "Asociado consultado — acepta" (obligatorio al elevar, ambos contextos):
-- mudar o sumar un servicio le cambia la rutina a la persona — queda
-- asentado que dijo que sí y quién se lo confirmó.
BEGIN;

ALTER TABLE public.reasignaciones
  ADD COLUMN IF NOT EXISTS tipo               text NOT NULL DEFAULT 'Reubicación',
  ADD COLUMN IF NOT EXISTS consultado_acepta  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consultado_por     text;

ALTER TABLE public.reasignaciones
  DROP CONSTRAINT IF EXISTS reasignaciones_tipo_check;
ALTER TABLE public.reasignaciones
  ADD CONSTRAINT reasignaciones_tipo_check CHECK (tipo IN ('Reubicación', 'Suma de servicio'));

COMMIT;

-- Verificación:
--   select column_name from information_schema.columns where table_name='reasignaciones' and column_name in ('tipo','consultado_acepta','consultado_por');
--   select tipo, count(*) from public.reasignaciones group by tipo;  -- todo lo viejo debe caer en 'Reubicación'

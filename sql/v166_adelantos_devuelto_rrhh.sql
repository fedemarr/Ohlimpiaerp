-- v166: ADELANTOS_devuelto_por_RRHH_para_Fede.md — "Devolver al
-- supervisor" tiene que DEVOLVER (corregible), no rechazar (final).
--
-- Hoy "Devolver al supervisor" (devolverASupervisorTrasRechazoFinanzas)
-- setea estado = 'Rechazada RRHH' — el mismo estado final que "Rechazar".
-- El supervisor no puede corregir nada, tiene que cargar un pedido
-- nuevo desde cero. Se agrega el estado 'Devuelta RRHH' (corregible: el
-- supervisor edita el MISMO registro y lo reeleva) para separar ambos
-- caminos, y columnas de auditoría "quién" que faltaban en los rechazos
-- (doc, bug menor: fila de Figueredo con "— / —" — ningún rechazo
-- registraba responsable en el propio pedido, solo en el evento).
BEGIN;

ALTER TABLE public.pedidos_adelantos
  ADD COLUMN IF NOT EXISTS motivo_devuelto_rrhh text,
  ADD COLUMN IF NOT EXISTS devuelto_por_rrhh    text,
  ADD COLUMN IF NOT EXISTS fecha_devuelto_rrhh  timestamptz,
  ADD COLUMN IF NOT EXISTS rechazado_por_rrhh     text,
  ADD COLUMN IF NOT EXISTS rechazado_por_finanzas text;

ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS motivo_devuelto_rrhh text,
  ADD COLUMN IF NOT EXISTS devuelto_por_rrhh    text,
  ADD COLUMN IF NOT EXISTS fecha_devuelto_rrhh  timestamptz,
  ADD COLUMN IF NOT EXISTS rechazado_por_rrhh     text,
  ADD COLUMN IF NOT EXISTS rechazado_por_finanzas text;

COMMIT;

-- Verificación:
--   select column_name from information_schema.columns
--   where table_name in ('pedidos_adelantos','prestamos')
--     and column_name in ('motivo_devuelto_rrhh','devuelto_por_rrhh','fecha_devuelto_rrhh','rechazado_por_rrhh','rechazado_por_finanzas');

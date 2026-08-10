-- v070 — Agrega a `clientes` las columnas que el modal de Comercial
-- (guardarCliente() en legacy.js) ya intenta guardar hoy pero que nunca
-- se crearon en la tabla: tipo, iva, arca, forma_pago, ciudad, logo.
-- Como supaSync() manda el objeto completo sin filtrar por columnas
-- reales, cualquier alta/edición de cliente real con esos campos
-- completos iba a fallar contra Supabase (columna inexistente) — bug
-- latente nunca disparado porque `clientes` está vacía en producción
-- (0 filas) hasta el import de Servicios/Comercial (ticket 08/2026).
-- Todas nullable, additivo, no rompe nada existente.
BEGIN;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS iva text,
  ADD COLUMN IF NOT EXISTS arca text,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS logo text;

COMMIT;

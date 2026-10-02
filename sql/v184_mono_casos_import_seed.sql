-- =============================================================================
-- Migración: v184 — Casos del import: sembrar los 10 casos reales
-- Fecha:     02/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- v183 crea `mono_casos_import` si no existe (nunca se había corrido esa
-- parte de v092 en producción). Una vez que la tabla exista (aunque sea
-- vacía), DB.monoCasosImport pasa a leer de ahí en vez del array
-- hardcodeado de legacy.js — y como la tabla está vacía, el tab "Casos
-- del import" se queda sin nada, incluidos los 10 casos que se vienen
-- viendo hasta ahora.
--
-- Este script siembra EXACTAMENTE esos mismos 10 casos (copiados tal
-- cual del hardcodeado en legacy.js, no son datos nuevos ni inventados)
-- para que no se pierdan al pasar a la tabla real. Es opcional pero se
-- recomienda correrlo junto con v183 — si alguno de estos 10 casos ya se
-- resolvió en la realidad y no corresponde más, se puede borrar/editar
-- la fila después desde el tab "Casos del import" (botón "Marcar
-- resuelto", ya reconstruido en este mismo ticket).
--
-- ON CONFLICT (id_local) DO NOTHING: si por algún motivo esto se corre
-- dos veces, no duplica filas.
-- =============================================================================

BEGIN;

INSERT INTO public.mono_casos_import (id_local, nro_socio, nombre, tipo, detalle, accion_esperada, resuelto) VALUES
  ('mci_2271', '2271', 'Bianchi Jorgelina',       'DEFINIR',  'AUTÓNOMO — régimen a definir',                               'RRHH define si entra al padrón',       false),
  ('mci_2565', '2565', 'Gonzalez Moure Marcelo',  'DEFINIR',  'AUTÓNOMO — "iba a pasar a monotributo"',                     'RRHH define pase y categoría',         false),
  ('mci_521',  '521',  'Uballes Alvaro',          'DEFINIR',  'Monto planilla $82.073,63 ≠ B $56.379,08',                   'RRHH define qué incluye',              false),
  ('mci_690',  '690',  'Lage Dario',              'DEFINIR',  'Monto planilla $193.608,47 ≠ F $150.784,21',                 'RRHH define qué incluye',              false),
  ('mci_788',  '788',  'Martinez Jose Luis',      'DEFINIR',  'Monto planilla $95.280,12 ≠ C $66.020,12',                   'RRHH define qué incluye',              false),
  ('mci_856',  '856',  'Ramirez Benitez Martina', 'DEFINIR',  'Monto planilla $75.099,08 ≠ B $56.379,08',                   'RRHH define qué incluye',              false),
  ('mci_22',   '22',   'Recalde S. Cecilia',      'VERIFICAR','Bajó a C pero el monto quedó en D ($84.612,93 → $66.020,12)', 'Actualizar monto a $66.020,12',       false),
  ('mci_2212', '2212', 'Lascano Fernando',        'VERIFICAR','Cat B con monto $28.859,84',                                 'Revisar categoría/monto',              false),
  ('mci_3153', '3153', 'Cacciato Alejandro',      'VERIFICAR','Monto no coincide con C',                                    'Revisar',                               false),
  ('mci_3292', '3292', 'Rodriguez Naara',         'VERIFICAR','Monto no coincide con A',                                    'Revisar',                               false)
ON CONFLICT (id_local) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

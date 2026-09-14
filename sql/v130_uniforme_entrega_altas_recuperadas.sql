-- =============================================================================
-- Migración: v130 — Entrega de uniforme (Borrador) para las 5 altas recuperadas
-- Fecha:     2026-09-14
-- Autor:     Fede
-- =============================================================================
--
-- Continuación de sql/v129: crearEntregaUniformeDesdeAlta() genera solo una
-- entrega "Pendiente" en pedidos_uniformes con el talle inicial cuando
-- confirmarAlta() corre en el navegador. Como estas 5 personas quedaron
-- insertadas directo en legajos por SQL, ese paso no ocurrió — se
-- reproduce acá a mano con los mismos talles que quedaron cargados en el
-- alta original (cat_alt_pendientes.uniforme).
--
-- Verificar ANTES de correr (no debería devolver filas):
--   select * from pedidos_uniformes where legajo_id_local in ('5578','5579','5580','5581','5582');
-- =============================================================================

BEGIN;

INSERT INTO public.pedidos_uniformes (
  id_local, legajo_id_local, nro_socio, nombre_operario, servicio, supervisor_asignado,
  origen, solicitado_por, fecha_solicitud, motivo, con_descuento, observaciones, estado
) VALUES
  ('410478901', '5578', '5578', 'Martinez Guillen Jimena Mariel', '— Sin asignar', '— Sin asignar',
   'RRHH - Ingreso', 'Sistema (recuperación)', now(), 'Ingreso', false,
   'Generado automáticamente al dar de alta — completar prendas del kit inicial. (Recuperado — alta original afectada por bug de guardado, ver sql/v129)', 'Borrador'),
  ('410478902', '5579', '5579', 'Cocha Nicol', 'HIT.LIBERTADOR.CEL', 'Alvaro Jesus Uballes',
   'RRHH - Ingreso', 'Sistema (recuperación)', now(), 'Ingreso', false,
   'Generado automáticamente al dar de alta — completar prendas del kit inicial. (Recuperado — alta original afectada por bug de guardado, ver sql/v129)', 'Borrador'),
  ('410478903', '5580', '5580', 'Sequeira Nicole', 'ZUG.VERDI', 'Alejandro Cacciato',
   'RRHH - Ingreso', 'Sistema (recuperación)', now(), 'Ingreso', false,
   'Generado automáticamente al dar de alta — completar prendas del kit inicial. (Recuperado — alta original afectada por bug de guardado, ver sql/v129)', 'Borrador'),
  ('410478904', '5581', '5581', 'Sosa Silvio Fernando', 'CHANGO.TEMPERLEY', 'Matias Maidana',
   'RRHH - Ingreso', 'Sistema (recuperación)', now(), 'Ingreso', false,
   'Generado automáticamente al dar de alta — completar prendas del kit inicial. (Recuperado — alta original afectada por bug de guardado, ver sql/v129)', 'Borrador'),
  ('410478905', '5582', '5582', 'Riveros Bastias Carolina Del Valle', 'HIT.TECNO', 'Claudio Gonzalez',
   'RRHH - Ingreso', 'Sistema (recuperación)', now(), 'Ingreso', false,
   'Generado automáticamente al dar de alta — completar prendas del kit inicial. (Recuperado — alta original afectada por bug de guardado, ver sql/v129)', 'Borrador');

INSERT INTO public.pedido_uniforme_prendas (id_local, pedido_id_local, prenda, talle, cantidad) VALUES
  ('410478801', '410478901', 'Ambo', 'L', 1),
  ('410478802', '410478901', 'Zapatos', '38', 1),

  ('410478811', '410478902', 'Ambo', 'M', 1),
  ('410478812', '410478902', 'Zapatos', '37', 1),
  ('410478813', '410478902', 'Buzo', 'M', 1),

  ('410478821', '410478903', 'Ambo', 'M', 1),
  ('410478822', '410478903', 'Zapatos', '36', 1),
  ('410478823', '410478903', 'Buzo', 'M', 1),

  ('410478831', '410478904', 'Ambo', '2XL', 1),
  ('410478832', '410478904', 'Zapatos', '44', 1),
  ('410478833', '410478904', 'Buzo', '2XL', 1),

  ('410478841', '410478905', 'Ambo', 'XL', 1),
  ('410478842', '410478905', 'Zapatos', '40', 1);

COMMIT;

-- Verificación sugerida después: select * from pedidos_uniformes where legajo_id_local in ('5578','5579','5580','5581','5582');

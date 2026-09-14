-- =============================================================================
-- Migración: v129 — Recuperar legajos perdidos por el bug de confirmarAlta()
-- Fecha:     2026-09-15
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "cargaron gente desde alta de asociados y ni saltan en legajos".
-- Investigado: confirmarAlta() (src/modules/altas/altas.js) guardaba el
-- legajo sin esperar el resultado ni chequearlo — si el guardado real en
-- Supabase fallaba, cat_alt_pendientes se marcaba igual "Alta completada"
-- y salía el toast de éxito. El bug de código ya se corrigió (commit
-- aparte). Esto recupera a la gente real que quedó atrapada por el bug
-- MIENTRAS estuvo activo (verificado contra la base: 14 "Alta completada"
-- en total, 10 sin legajo — 5 son pruebas propias de Fede, no se tocan).
--
-- Se reconstruyen los 5 casos reales desde el snapshot completo que
-- confirmarAlta() ya guarda en cat_alt_pendientes (identificacion,
-- domicilio, operativo, uniforme, capital, seguros) — mismos datos que
-- RRHH cargó en su momento, no se inventa nada. N° de socio: siguientes
-- disponibles a partir del máximo actual (5577), en orden cronológico de
-- cuándo se completó cada alta.
--
-- ⚠️ Un dato para confirmar con RRHH antes de correr esto: la fecha de
-- ingreso de Martinez Guillen Jimena Mariel quedó cargada como 30/04/2023
-- (¡tres años atrás!) — se preserva tal cual está en el snapshot porque
-- no es tema nuestro corregir un dato de negocio, pero probablemente
-- corresponda revisarlo con RRHH (¿carga histórica real, o error de
-- tipeo por 2026?).
--
-- Un ajuste sobre el dato original: el supervisor de Cocha Nicol había
-- quedado cargado como "Alvaro Uballes" (el nombre viejo, antes de la
-- corrección de esta semana — ver sql/v128) — se crea directamente con
-- el nombre correcto "Alvaro Jesus Uballes" en vez de perpetuar el dato
-- viejo en un legajo nuevo.
--
-- Verificar ANTES de correr (debería devolver las 5 filas de abajo, sin
-- legajo):
--   select id_local, dni, nombre, estado, created_at from cat_alt_pendientes
--     where estado = 'Alta completada'
--     and dni in ('45401905','43829120','43183243','34209537','31979724');
-- =============================================================================

BEGIN;

INSERT INTO public.legajos (
  id_local, nro, nombre, dni, funcion, servicio, supervisor, sector, ingreso, estado,
  estado_legal, estado_medico, fecha_baja, fecha_reincorp, legajo_anterior_nro,
  seguro, localidad, partido, codigo_postal, tel, mail, cuit, clave_fiscal, inaes,
  estado_civil, nac, genero, banco, calzado, ambo, talles_uniforme,
  periodo_prueba, fecha_ingreso_prueba, adjuntos_legal, adjuntos_medico,
  direccion, fec_nac, zona, cbu, polizas, obra_social, obra_social_inicio_tramite,
  forma_pago, integracion, categoria
) VALUES
  ('5578', 5578, 'Martinez Guillen Jimena Mariel', '45401905', 'Auxiliar administrativo', '— Sin asignar', '— Sin asignar', '', '30/04/2023', 'Activo',
   '', '', '', '', null,
   'Completo', 'Merlo', '', '', '1128170414', 'jimenammg04@gmail.com', '27454019054', '', '',
   'Soltero/a', 'Argentina', 'Femenino', '', 38, 'L', null,
   6, '2023-04-30', '[]'::jsonb, '[]'::jsonb,
   'Alfonsina Storni 2306', '2004-04-27', 'Buenos Aires', '', '[]'::jsonb, '', '2023-07-30',
   'Efectivo', 14700, 'Auxiliar administrativo'),

  ('5579', 5579, 'Cocha Nicol', '43829120', 'Operario/a', 'HIT.LIBERTADOR.CEL', 'Alvaro Jesus Uballes', '', '20/08/2026', 'Activo',
   '', '', '', '', null,
   'Completo', 'Parque Avellaneda', '', '1407', '1123660119', 'cochanicol4@gmail.com', '27438291208', '', '',
   'Soltero/a', 'Argentina', 'Femenino', 'BBVA', 37, 'M', '{"buzo":"M"}'::jsonb,
   6, '2026-08-20', '[]'::jsonb, '[]'::jsonb,
   'Santiago de Compostela 3763', '2001-02-21', 'CABA', '', '[]'::jsonb, '', '2026-11-21',
   'Efectivo', 14700, 'Operario A'),

  ('5580', 5580, 'Sequeira Nicole', '43183243', 'Operario/a', 'ZUG.VERDI', 'Alejandro Cacciato', '', '20/08/2026', 'Activo',
   '', '', '', '', null,
   'Completo', 'Villa Rosa', 'Pilar', '1631', '1128230683', 'sequeiranicole044@gmail.com', '27431832432', '', '',
   'Soltero/a', 'Argentina', 'Femenino', 'BBVA', 36, 'M', '{"buzo":"M"}'::jsonb,
   6, '2026-08-20', '[]'::jsonb, '[]'::jsonb,
   'Jerónimo Salguero 2620', '2001-01-17', 'Buenos Aires', '', '[]'::jsonb, '', '2026-11-21',
   'Efectivo', 14700, 'Operario A'),

  ('5581', 5581, 'Sosa Silvio Fernando', '34209537', 'Operario/a', 'CHANGO.TEMPERLEY', 'Matias Maidana', '', '20/08/2026', 'Activo',
   '', '', '', '', null,
   'Completo', 'San Francisco Solano', 'Quilmes', '1879', E'1160303715\t1162311621', 'silviofernandososa9@gmail.com', '20342095373', '', '',
   'Casado/a', 'Argentina', 'Masculino', 'BBVA', 44, '2XL', '{"buzo":"2XL"}'::jsonb,
   3, '2026-08-20', '[]'::jsonb, '[]'::jsonb,
   'Calle 897 - 1443', '1988-10-21', 'Buenos Aires', '', '[]'::jsonb, '', '2026-11-21',
   'Efectivo', 14700, 'Operario A'),

  ('5582', 5582, 'Riveros Bastias Carolina Del Valle', '31979724', 'Operario/a', 'HIT.TECNO', 'Claudio Gonzalez', '', '27/08/2026', 'Activo',
   '', '', '', '', null,
   'Completo', 'Dock Sud', 'Avellaneda', '1870', '1137819068', 'carolinabonitariveros@gmail.com', '27319797241', '', '',
   'Soltero/a', 'Argentina', 'Femenino', 'MACRO', 40, 'XL', null,
   3, '2026-08-27', '[]'::jsonb, '[]'::jsonb,
   'Pasaje Peatonal 2	1127', '1985-11-07', 'Buenos Aires', '', '[]'::jsonb, '', '2026-11-28',
   'Efectivo', 14700, 'Operario A');

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto (debería devolver 5 filas):
-- select nro, nombre, dni, servicio, ingreso from legajos where nro between 5578 and 5582;
-- =============================================================================

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

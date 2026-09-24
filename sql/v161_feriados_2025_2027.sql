-- v161: la tabla `feriados` está VACÍA en la base real (0 filas) — el
-- botón "Cargar feriados Argentina" del módulo Feriados nunca insertó
-- nada, solo mostraba un toast. Gestión de horas (GESTION_HORAS_para_Fede.md)
-- depende 100% de feriados reales para calcular días hábiles por mes, así
-- que se siembran acá antes de construir el módulo.
--
-- Fuente de las fechas 2026: el propio mockup del ticket
-- (mockup_gestion_horas_1.html), que el documento dice "verificado contra
-- el calendario real 2026" — se toman tal cual, son la referencia más
-- confiable que tenemos.
--
-- 2025 y 2027: los feriados de fecha FIJA por ley (Año Nuevo, Día de la
-- Memoria, Malvinas, Trabajador, Revolución de Mayo, Belgrano, Independencia,
-- Inmaculada Concepción, Navidad) y los MOVIBLES con fórmula fija (Carnaval
-- = lunes/martes antes de Miércoles de Cenizas, Viernes Santo, Paso a la
-- Inmortalidad de San Martín = 3er lunes de agosto) están calculados y son
-- confiables. ⚠ "Día del Respeto a la Diversidad Cultural" (12/10) y "Día
-- de la Soberanía Nacional" (20/11) pueden trasladarse por DECRETO anual
-- del Poder Ejecutivo para armar fines de semana largos — para 2025 y 2027
-- se cargó la fecha de ley (sin traslado); si el Gobierno decretó un
-- traslado puntual ese año, hay que corregirlo a mano desde la pantalla de
-- Feriados (alta/baja individual, ya construida — no hace falta otra
-- migración para eso).
--
-- Se agrega id_local (formato 9 dígitos, mismo criterio que supaSync) a
-- cada fila sembrada: sin esto, "Eliminar" desde la pantalla de Feriados
-- no podría borrar estos registros (supaDel busca por id_local, y quedaría
-- NULL). Rango 900000xxx, verificado sin colisión contra los id_local
-- reales existentes.
BEGIN;

ALTER TABLE public.feriados ADD CONSTRAINT feriados_fecha_key UNIQUE (fecha);

INSERT INTO public.feriados (id_local, fecha, nombre, tipo) VALUES
  -- 2025
  ('900000001', '2025-01-01', 'Año Nuevo', 'inamovible'),
  ('900000002', '2025-03-03', 'Carnaval', 'inamovible'),
  ('900000003', '2025-03-04', 'Carnaval', 'inamovible'),
  ('900000004', '2025-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'inamovible'),
  ('900000005', '2025-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'inamovible'),
  ('900000006', '2025-04-18', 'Viernes Santo', 'inamovible'),
  ('900000007', '2025-05-01', 'Día del Trabajador', 'inamovible'),
  ('900000008', '2025-05-25', 'Día de la Revolución de Mayo', 'inamovible'),
  ('900000009', '2025-06-20', 'Paso a la Inmortalidad del Gral. Manuel Belgrano', 'inamovible'),
  ('900000010', '2025-07-09', 'Día de la Independencia', 'inamovible'),
  ('900000011', '2025-08-18', 'Paso a la Inmortalidad del Gral. San Martín', 'trasladable'),
  ('900000012', '2025-10-12', 'Día del Respeto a la Diversidad Cultural', 'trasladable'),
  ('900000013', '2025-11-20', 'Día de la Soberanía Nacional', 'trasladable'),
  ('900000014', '2025-12-08', 'Inmaculada Concepción', 'inamovible'),
  ('900000015', '2025-12-25', 'Navidad', 'inamovible'),

  -- 2026 (tal cual el mockup del ticket, verificado por Lautaro)
  ('900000016', '2026-01-01', 'Año Nuevo', 'inamovible'),
  ('900000017', '2026-02-16', 'Carnaval', 'inamovible'),
  ('900000018', '2026-02-17', 'Carnaval', 'inamovible'),
  ('900000019', '2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'inamovible'),
  ('900000020', '2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'inamovible'),
  ('900000021', '2026-04-03', 'Viernes Santo', 'inamovible'),
  ('900000022', '2026-05-01', 'Día del Trabajador', 'inamovible'),
  ('900000023', '2026-05-25', 'Día de la Revolución de Mayo', 'inamovible'),
  ('900000024', '2026-06-20', 'Paso a la Inmortalidad del Gral. Manuel Belgrano', 'inamovible'),
  ('900000025', '2026-07-09', 'Día de la Independencia', 'inamovible'),
  ('900000026', '2026-08-17', 'Paso a la Inmortalidad del Gral. San Martín', 'trasladable'),
  ('900000027', '2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'trasladable'),
  ('900000028', '2026-11-20', 'Día de la Soberanía Nacional', 'trasladable'),
  ('900000029', '2026-12-08', 'Inmaculada Concepción', 'inamovible'),
  ('900000030', '2026-12-25', 'Navidad', 'inamovible'),

  -- 2027
  ('900000031', '2027-01-01', 'Año Nuevo', 'inamovible'),
  ('900000032', '2027-02-08', 'Carnaval', 'inamovible'),
  ('900000033', '2027-02-09', 'Carnaval', 'inamovible'),
  ('900000034', '2027-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'inamovible'),
  ('900000035', '2027-03-26', 'Viernes Santo', 'inamovible'),
  ('900000036', '2027-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'inamovible'),
  ('900000037', '2027-05-01', 'Día del Trabajador', 'inamovible'),
  ('900000038', '2027-05-25', 'Día de la Revolución de Mayo', 'inamovible'),
  ('900000039', '2027-06-20', 'Paso a la Inmortalidad del Gral. Manuel Belgrano', 'inamovible'),
  ('900000040', '2027-07-09', 'Día de la Independencia', 'inamovible'),
  ('900000041', '2027-08-16', 'Paso a la Inmortalidad del Gral. San Martín', 'trasladable'),
  ('900000042', '2027-10-12', 'Día del Respeto a la Diversidad Cultural', 'trasladable'),
  ('900000043', '2027-11-20', 'Día de la Soberanía Nacional', 'trasladable'),
  ('900000044', '2027-12-08', 'Inmaculada Concepción', 'inamovible'),
  ('900000045', '2027-12-25', 'Navidad', 'inamovible')
ON CONFLICT (fecha) DO NOTHING;

COMMIT;

-- Verificación:
--   select count(*) from public.feriados;  -- 45
--   select fecha, nombre from public.feriados order by fecha;

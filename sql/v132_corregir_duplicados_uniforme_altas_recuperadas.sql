-- =============================================================================
-- Migración: v132 — Corrige duplicados de uniforme (v130) + limpia entregas
--            fantasma de 3 altas que siguen trabadas hoy
-- Fecha:     2026-09-14
-- Autor:     Fede
-- =============================================================================
--
-- ERROR PROPIO A CORREGIR (v130): asumí que si el legajo no se guardó, la
-- entrega de uniforme tampoco — pero crearEntregaUniformeDesdeAlta() se
-- dispara SIN esperar el resultado del guardado del legajo (mismo patrón
-- de bug, pero en otra función), así que en los 5 casos SÍ se había creado
-- una entrega real en su momento, con nro de socio "adivinado" (el
-- siguiente disponible en la sesión de quien cargó, que después nunca se
-- confirmó). v130 le sumó una entrega DUPLICADA a cada uno de los 5, con
-- el nro ya corregido — quedaron dos pedidos de uniforme por persona.
--
-- Este script:
--  1) Borra las 5 entregas duplicadas que creó v130.
--  2) Corrige el nro de socio de las 5 entregas REALES (las originales,
--     con prendas ya cargadas) para que apunten al legajo correcto.
--  3) Limpia entregas fantasma de intentos de alta que NUNCA llegaron a
--     buen puerto — de un lote del 27/08 donde varias personas quedaron
--     "Pendiente de alta" (nunca se completó el alta) pero cada reintento
--     sí generó su entrega de uniforme fantasma, con nro de socio que hoy
--     coincide por casualidad con gente real ya recuperada (por eso
--     aparecían mezcladas al revisar). Estas 3 personas SIGUEN visibles
--     en Altas → Pendientes, no se perdieron — hay que reintentar su alta
--     desde la app (ya con el fix puesto). Dejar sus entregas fantasma
--     rotas iba a confundir la pantalla de Pendientes de uniformes.
--     Afectados: Vecchio Marcos Gian (DNI 34596769, 4 intentos entre
--     27/08 y 14/09), Diaz Daniela Candelaria (DNI 37939400, 3 intentos),
--     Balmaceda Marcelo Daniel Luque (DNI 36381955, 1 intento). También
--     se limpian 2 entregas fantasma a nombre de "Cocha Nicole Nazarena"
--     / "Cocha  Nicol Nazarena" — mismo DNI que Cocha Nicol (43829120,
--     ya recuperada en v129), variantes de nombre tipeadas en reintentos
--     fallidos el mismo día.
--
-- Verificar ANTES de correr:
--   select id_local, nombre_operario, legajo_id_local, estado from pedidos_uniformes
--     where id_local in (
--       '410478901','410478902','410478903','410478904','410478905',
--       '780577188','403608382','946540891','188112387','441785078',
--       '188331585','441869809','403779170','405738538','403477788','404105777');
-- =============================================================================

BEGIN;

-- 1) y 3): borrar duplicados (v130) + entregas fantasma de altas nunca completadas
DELETE FROM public.pedido_uniforme_prendas WHERE pedido_id_local IN (
  '410478901','410478902','410478903','410478904','410478905',
  '780577188','403608382','946540891','188112387','441785078',
  '188331585','441869809','403779170','405738538','403477788','404105777'
);

DELETE FROM public.pedidos_uniformes WHERE id_local IN (
  '410478901','410478902','410478903','410478904','410478905',
  '780577188','403608382','946540891','188112387','441785078',
  '188331585','441869809','403779170','405738538','403477788','404105777'
);

-- 2) corregir el nro de socio de las 5 entregas REALES (con prendas ya cargadas)
UPDATE public.pedidos_uniformes SET legajo_id_local = '5578', nro_socio = '5578' WHERE id_local = '878993797'; -- Martinez Guillen Jimena Mariel
UPDATE public.pedidos_uniformes SET legajo_id_local = '5579', nro_socio = '5579' WHERE id_local = '857725850'; -- Cocha Nicol
UPDATE public.pedidos_uniformes SET legajo_id_local = '5580', nro_socio = '5580' WHERE id_local = '196454458'; -- Sequeira Nicole (ya estaba en 5580 de casualidad, se deja explícito igual)
UPDATE public.pedidos_uniformes SET legajo_id_local = '5581', nro_socio = '5581' WHERE id_local = '405417132'; -- Sosa Silvio Fernando
UPDATE public.pedidos_uniformes SET legajo_id_local = '5582', nro_socio = '5582' WHERE id_local = '408510310'; -- Riveros Bastias Carolina Del Valle

COMMIT;

-- =============================================================================
-- Verificación sugerida después de correr esto:
--   select id_local, nombre_operario, legajo_id_local, nro_socio, estado
--     from pedidos_uniformes where legajo_id_local in ('5578','5579','5580','5581','5582');
--   -- debería devolver exactamente 5 filas (una por persona), sin duplicados.
-- =============================================================================

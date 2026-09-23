-- v158: PEDIDOS_LINEAS_PERFIL_para_Fede.md + mockup_pedido_multilinea_1.html
-- (Fases 1+2, alcance confirmado con el usuario — la fase 3, perfil
-- estructurado en el ALTA de servicio, queda para un ticket aparte).
--
-- Hoy un pedido es "UN puesto × cantidad × UN horario × UN perfil", pero
-- RRHH pide gente con horarios/perfiles distintos bajo el mismo pedido
-- (ej. real: PP-29 pide "2× Operario A" cuando en verdad es una de mañana
-- de semana part-time y una franquera de finde rotativa). El pedido pasa
-- a ser CABECERA + N LÍNEAS DE PUESTO, cada una con su propio puesto,
-- cantidad, horario/días y perfil — misma estructura que ya usan
-- objetivos.puestos_necesarios y prepedidos.vacantes.
--
-- Los campos planos (puesto, cantidad, horario_semanal, perfil) NO se
-- borran: quedan como agregado/primera-línea para todo lo que todavía
-- los lee tal cual (el <select> de "pedido vinculado" en Reasignaciones,
-- filtros, CSV de Seguimiento) — la app los recalcula solos a partir de
-- `lineas` en cada guardado, así no hay que tocar esos consumidores.
BEGIN;

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS lineas jsonb;

-- Backfill: todo pedido ya cargado (33 al momento de este ticket, PP-29
-- entre ellos con sus 2 candidatas "Perez" ya vinculadas) queda como UNA
-- línea que reproduce exactamente lo que tenía plano — no se inventa una
-- separación que no está en los datos (confirmado con el usuario).
UPDATE public.pedidos
SET lineas = jsonb_build_array(jsonb_build_object(
  'puesto', puesto,
  'cantidad', COALESCE(cantidad, 1),
  'dias', COALESCE(horario_semanal->'dias', '{}'::jsonb),
  'horarioDesde', horario_semanal->>'horarioDesde',
  'horarioHasta', horario_semanal->>'horarioHasta',
  'tipoHorario', COALESCE(horario_semanal->>'tipoHorario', 'fijo'),
  'perfil', COALESCE(perfil, '[]'::jsonb)
))
WHERE lineas IS NULL;

-- Candidatos: qué VACANTE puntual (índice dentro de las líneas ya
-- expandidas persona-por-persona, mismo criterio que
-- prepedidos.vacantes/prepedido_vacante) cubre cada candidato vinculado.
-- Antes un pedido con cantidad>1 no distinguía candidatos entre sí — las
-- 2 Perez de PP-29 quedaban indistinguibles, que es el bug real que
-- motiva este ticket.
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS pedido_vacante_idx integer;

-- Backfill de los ya vinculados: se numeran por orden de alta (id) dentro
-- de cada pedido — no hay forma de saber HOY cuál Perez es la de mañana y
-- cuál la de finde, así que queda en orden de carga y RRHH reordena a
-- mano si hace falta (decisión confirmada con el usuario: no romper nada,
-- dejar la corrección manual para después).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY pedido_vinculado_id_local ORDER BY id) - 1 AS rn
  FROM public.candidatos
  WHERE pedido_vinculado_id_local IS NOT NULL
)
UPDATE public.candidatos c
SET pedido_vacante_idx = ranked.rn
FROM ranked
WHERE c.id = ranked.id;

COMMIT;

-- Verificación:
--   select numero, lineas from public.pedidos order by numero desc limit 5;
--   select id, apellido, nombre, pedido_vinculado_id_local, pedido_vacante_idx
--     from public.candidatos where pedido_vinculado_id_local is not null order by pedido_vinculado_id_local, pedido_vacante_idx;

-- v103: Agregar 'Precandidato' al enum estado_candidato
-- Causa: el flujo de Precandidatos (commit 180211d, 19/08/2026) usa
-- estado='Precandidato' desde /postularme (api/postular.js) y desde la
-- tab Precandidatos de Candidatos, pero el valor nunca se agregó al enum
-- estado_candidato en producción → INSERT/UPDATE con ese estado se
-- rechaza con "invalid input value for enum estado_candidato" → toda
-- postulación pública falla con 500 ("No se pudo guardar la postulación").
--
-- No se puede agregar un valor a un enum y usarlo en la misma transacción
-- (ALTER TYPE ... ADD VALUE no es transaccional en ese sentido en
-- versiones viejas de Postgres) — se deja como sentencia suelta, sin
-- BEGIN/COMMIT explícito, tal como recomienda la documentación de
-- Postgres para este caso.

ALTER TYPE public.estado_candidato ADD VALUE IF NOT EXISTS 'Precandidato' BEFORE 'Sin citar';

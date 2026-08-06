-- v063: nuevos estados de salida para candidatos (ticket "Histórico")
--
-- estado_candidato era un ENUM cerrado de 6 valores (Sin citar, Citado,
-- Entrevistado, Aprobado, Rechazado, Psicotecnico). RRHH necesita distinguir,
-- en la vista Histórico, otros motivos de salida del proceso que no son un
-- rechazo en la entrevista: Baja, Caducado, MT Social, MT con deuda.
--
-- No hay regla automática que derive estos 4 estados — RRHH los elige a mano
-- desde el botón "Dar de baja" (src/modules/candidatos/candidatos.js,
-- abrirBajaCandidatoPorId), el sistema no infiere nada.
--
-- ALTER TYPE ... ADD VALUE puede correr dentro de una transacción desde
-- Postgres 12 siempre que el valor nuevo no se use en la misma transacción
-- (acá sólo se agrega, no se usa) — por eso va envuelto en BEGIN/COMMIT como
-- el resto de las migraciones de este proyecto.

BEGIN;

ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'Baja';
ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'Caducado';
ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'MT Social';
ALTER TYPE estado_candidato ADD VALUE IF NOT EXISTS 'MT con deuda';

COMMIT;

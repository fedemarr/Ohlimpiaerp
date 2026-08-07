-- v065: adjunto PDF de entrevista en Candidatos (ticket "Adjunto")
--
-- Reutiliza la tabla `adjuntos` + bucket privado `ohlimpia-adjuntos` que ya
-- usan Psicotécnico/Preocupacional/Documentación/Alta (src/shared/adjuntos.js)
-- — no hace falta bucket, tabla ni columna nueva en `candidatos`. Solo hay
-- que sumar los 2 valores nuevos a los CHECK constraints existentes:
--   - etapa: 'candidatos' (no estaba, el flujo de selección todavía no
--     adjuntaba nada en esta etapa).
--   - tipo: 'entrevista' (PDF de la entrevista).
--
-- Los CHECK ya fueron extendidos varias veces desde que se creó la tabla en
-- v011 (uniformes, sanciones, certificado-capacitacion, etc.) — este script
-- toma el estado ACTUAL de ambos constraints (verificado en vivo contra la
-- base) para no pisar ningún valor agregado después de v011.

BEGIN;

ALTER TABLE adjuntos DROP CONSTRAINT adjuntos_etapa_check;
ALTER TABLE adjuntos ADD CONSTRAINT adjuntos_etapa_check CHECK (etapa = ANY (ARRAY[
  'psicotecnico'::text,
  'preocupacional'::text,
  'documentacion'::text,
  'alta'::text,
  'uniformes'::text,
  'sanciones'::text,
  'candidatos'::text
]));

ALTER TABLE adjuntos DROP CONSTRAINT adjuntos_tipo_check;
ALTER TABLE adjuntos ADD CONSTRAINT adjuntos_tipo_check CHECK (tipo = ANY (ARRAY[
  'informe-psico'::text,
  'apto-medico'::text,
  'no-apto'::text,
  'antecedente'::text,
  'libreta'::text,
  'curso'::text,
  'dni-frente'::text,
  'dni-dorso'::text,
  'foto-rostro'::text,
  'monotributo'::text,
  'inaes'::text,
  'certificado-capacitacion'::text,
  'constancia-uniforme'::text,
  'denuncia-policial-uniforme'::text,
  'evidencia-sancion'::text,
  'descargo-sancion'::text,
  'entrevista'::text
]));

COMMIT;

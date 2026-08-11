-- v074: adjunto PDF del proceso en Candidatos (ticket "Proceso")
--
-- Después de aprobar un candidato, RRHH puede subir el PDF del proceso
-- (contrato, resultado de la evaluación, documentación de la contratación).
-- Reutiliza el bucket privado ohlimpia-adjuntos + tabla adjuntos que ya usan
-- Candidatos/Psicotécnico/Preocupacional/Documentación/Alta
-- (src/shared/adjuntos.js) — la etapa 'candidatos' ya estaba habilitada en
-- el CHECK (v065), así que solo hace falta sumar el tipo nuevo 'proceso'.
--
-- No se agrega ninguna columna a `candidatos`: el archivo vive en `adjuntos`,
-- indexado por DNI (igual que el resto de los documentos del sistema) — se
-- recupera con listarAdjuntos({ dni, etapa: 'candidatos', tipo: 'proceso' }).
--
-- Se toma el estado ACTUAL del constraint (verificado en vivo contra la
-- base, último cambio en v066) para no pisar valores agregados después.

BEGIN;

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
  'entrevista'::text,
  'poliza-seguro'::text,
  'proceso'::text
]));

COMMIT;

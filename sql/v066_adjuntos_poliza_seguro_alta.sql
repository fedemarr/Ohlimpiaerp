-- v066: adjunto PDF de la póliza de seguro en Altas de asociados (ticket "Póliza")
--
-- Reutiliza el bucket privado ohlimpia-adjuntos + tabla adjuntos que ya usan
-- Candidatos/Psicotécnico/Preocupacional/Documentación/Alta
-- (src/shared/adjuntos.js) — la etapa 'alta' ya estaba habilitada en el
-- CHECK (dni-frente, dni-dorso, foto-rostro, monotributo, inaes), así que
-- solo hace falta sumar el tipo nuevo 'poliza-seguro'.
--
-- No se agrega ninguna columna a `legajos` ni a `candidatos`: el archivo
-- vive en `adjuntos`, indexado por DNI (igual que el resto de los
-- documentos del sistema) — se recupera con
-- listarAdjuntos({ dni, etapa: 'alta', tipo: 'poliza-seguro' }) desde
-- cualquier parte del flujo, sin acoplar el legajo al storage.
--
-- Se toma el estado ACTUAL del constraint (verificado en vivo contra la
-- base, extendido varias veces desde v011) para no pisar valores agregados
-- después de la creación de la tabla.

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
  'poliza-seguro'::text
]));

COMMIT;

-- v075: columna observacion en turnos (ticket "Calendario")
--
-- Agrega una nota libre (opcional) a cada entrevista agendada en el
-- calendario de Candidatos. La tabla `turnos` no está creada en las
-- migraciones v* (vive desde el monolítico/dashboard), así que este
-- ALTER se ejecuta directo sobre la tabla existente.
--
-- La columna es nullable y sin CHECK: el campo es opcional y no tiene
-- restricciones de contenido. El límite práctico de 300 caracteres se
-- aplica en el textarea del formulario (maxlength), no en la base.

ALTER TABLE turnos ADD COLUMN IF NOT EXISTS observacion text;

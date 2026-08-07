-- v068: checklist de alta de obra social (ticket "Obra social" — Legajos)
--
-- legajos ya tenía obra_social (nombre de la obra social) y
-- obra_social_inicio_tramite (fecha calculada — ver recalcularInicioObraSocial()
-- en altas.js, ingreso + 3 meses) desde el ticket de pólizas de esta misma
-- semana. Lo que faltaba es el registro de que RRHH efectivamente hizo el
-- trámite de alta: un booleano + cuándo se marcó, para el checkbox
-- interactivo del listado de Legajos.

BEGIN;

ALTER TABLE legajos
  ADD COLUMN IF NOT EXISTS alta_obra_social boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alta_obra_social_fecha timestamptz;

COMMENT ON COLUMN legajos.alta_obra_social IS
  'true cuando RRHH marcó que ya se tramitó el alta de obra social del asociado (checkbox en el listado de Legajos). No confundir con obra_social_inicio_tramite, que es la fecha calculada en la que RECIÉN SE PUEDE hacer el trámite (ingreso + 3 meses).';
COMMENT ON COLUMN legajos.alta_obra_social_fecha IS
  'Marca de tiempo de cuándo se tildó alta_obra_social. Se limpia si se destilda.';

COMMIT;

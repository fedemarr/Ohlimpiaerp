// Candidatos — tab "Link público": muestra la URL del formulario de
// postulación externo (postularme.html, ver vite.config.js) para que
// RRHH se la pase a los próximos asociados. Mismo patrón de "copiar
// link" ya usado en capacitaciones/evaluaciones.js.

import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

export function renderLinkPublico() {
  const url = `${location.origin}/postularme`;
  const input = $('cand-link-postulacion');
  if (input) input.value = url;
  const abrir = $('cand-link-postulacion-abrir');
  if (abrir) abrir.href = url;
}

export function copiarLinkPostulacion() {
  const input = $('cand-link-postulacion');
  if (!input) return;
  navigator.clipboard.writeText(input.value)
    .then(() => toast('📋 Link copiado'))
    .catch(() => toast('⚠️ No se pudo copiar, seleccioná y copiá manualmente'));
}

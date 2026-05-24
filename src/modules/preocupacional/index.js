// Módulo Pre-ocupacional — Entry point

export { renderPreocup, abrirGestionPreocup, actualizarMotivoPreocup, guardarPreocup, aprobarPreocup, bajaPreocup } from './preocupacional.js';

import { renderPreocup, abrirGestionPreocup, actualizarMotivoPreocup, guardarPreocup, aprobarPreocup, bajaPreocup } from './preocupacional.js';

export const preocupScreenConfig = {
  preocupacional: {
    title: 'Pre-ocupacional',
    btn: null,
    fn: null,
    render: () => renderPreocup(),
  },
};

window.renderPreocup = renderPreocup;
window.abrirGestionPreocup = abrirGestionPreocup;
window.actualizarMotivoPreocup = actualizarMotivoPreocup;
window.guardarPreocup = guardarPreocup;
window.aprobarPreocup = aprobarPreocup;
window.bajaPreocup = bajaPreocup;

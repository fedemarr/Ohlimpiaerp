// Módulo Pre-ocupacional — Entry point

export { renderPreocup, tabPreocup, abrirGestionPreocup, actualizarMotivoPreocup, guardarPreocup, aprobarPreocup, bajaPreocup } from './preocupacional.js';

import { renderPreocup, tabPreocup, abrirGestionPreocup, actualizarMotivoPreocup, guardarPreocup, aprobarPreocup, bajaPreocup } from './preocupacional.js';

export const preocupScreenConfig = {
  preocupacional: {
    title: 'Pre-ocupacional',
    btn: null,
    fn: null,
    render: () => tabPreocup('activos'),
  },
};

window.renderPreocup = renderPreocup;
window.tabPreocup = tabPreocup;
window.abrirGestionPreocup = abrirGestionPreocup;
window.actualizarMotivoPreocup = actualizarMotivoPreocup;
window.guardarPreocup = guardarPreocup;
window.aprobarPreocup = aprobarPreocup;
window.bajaPreocup = bajaPreocup;

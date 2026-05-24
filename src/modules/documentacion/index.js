// Módulo Documentación de ingreso — Entry point

export {
  renderDocum,
  abrirGestionDocum,
  guardarDocum,
  recalcularVencAntec,
  toggleSeccionLibreta,
  toggleSeccionCurso,
} from './documentacion.js';

import {
  renderDocum,
  abrirGestionDocum,
  guardarDocum,
  recalcularVencAntec,
  toggleSeccionLibreta,
  toggleSeccionCurso,
} from './documentacion.js';

export const documScreenConfig = {
  documentacion: {
    title: 'Documentación de ingreso',
    btn: null,
    fn: null,
    render: () => renderDocum(),
  },
};

window.renderDocum = renderDocum;
window.abrirGestionDocum = abrirGestionDocum;
window.guardarDocum = guardarDocum;
window.recalcularVencAntec = recalcularVencAntec;
window.toggleSeccionLibreta = toggleSeccionLibreta;
window.toggleSeccionCurso = toggleSeccionCurso;

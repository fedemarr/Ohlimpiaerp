// Módulo Documentación de ingreso — Entry point

export {
  renderDocum,
  abrirGestionDocum,
  guardarDocum,
  recalcularVencAntec,
  toggleSeccionLibreta,
  toggleSeccionCurso,
  actualizarBotonesDocum,
  aprobarDocum,
  excepcionDocum,
  bajaDocum,
} from './documentacion.js';

import {
  renderDocum,
  abrirGestionDocum,
  guardarDocum,
  recalcularVencAntec,
  toggleSeccionLibreta,
  toggleSeccionCurso,
  actualizarBotonesDocum,
  aprobarDocum,
  excepcionDocum,
  bajaDocum,
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
window.actualizarBotonesDocum = actualizarBotonesDocum;
window.aprobarDocum = aprobarDocum;
window.excepcionDocum = excepcionDocum;
window.bajaDocum = bajaDocum;

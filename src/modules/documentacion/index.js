// Módulo Documentación de ingreso — Entry point

export {
  renderDocum,
  tabDocum,
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
  tabDocum,
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
    render: () => tabDocum('activos'),
  },
};

window.renderDocum = renderDocum;
window.tabDocum = tabDocum;
window.abrirGestionDocum = abrirGestionDocum;
window.guardarDocum = guardarDocum;
window.recalcularVencAntec = recalcularVencAntec;
window.toggleSeccionLibreta = toggleSeccionLibreta;
window.toggleSeccionCurso = toggleSeccionCurso;
window.actualizarBotonesDocum = actualizarBotonesDocum;
window.aprobarDocum = aprobarDocum;
window.excepcionDocum = excepcionDocum;
window.bajaDocum = bajaDocum;

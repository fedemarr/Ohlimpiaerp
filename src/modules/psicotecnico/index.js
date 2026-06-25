// Módulo Psicotécnico — Entry point

export {
  renderPsico, tabPsico, filtrarPsico, poblarFiltrosColumnasPsico,
  guardarPsico,
  abrirGestionPsico, actualizarBotonesAprobacion,
  guardarEtapasPsico, aprobarPsico, rechazarPsico, revertirPsico,
  cargarAdjuntoPsico, seleccionarArchivoPsico, verAdjuntoPsico, eliminarAdjuntoPsico,
} from './psicotecnico.js';

// ========== SCREEN CONFIG ==========

import { tabPsico } from './psicotecnico.js';

export const psicoScreenConfig = {
  psicotecnico: {
    title: 'Psicotécnico',
    btn: null,
    fn: null,
    render: () => tabPsico('activos'),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarPsico, guardarPsico,
  abrirGestionPsico, actualizarBotonesAprobacion,
  guardarEtapasPsico, aprobarPsico, rechazarPsico, revertirPsico,
  cargarAdjuntoPsico, seleccionarArchivoPsico, verAdjuntoPsico, eliminarAdjuntoPsico,
} from './psicotecnico.js';

window.tabPsico = tabPsico;
window.filtrarPsico = filtrarPsico;
window.guardarPsico = guardarPsico;
window.abrirGestionPsico = abrirGestionPsico;
window.actualizarBotonesAprobacion = actualizarBotonesAprobacion;
window.guardarEtapasPsico = guardarEtapasPsico;
window.aprobarPsico = aprobarPsico;
window.rechazarPsico = rechazarPsico;
window.revertirPsico = revertirPsico;
window.cargarAdjuntoPsico = cargarAdjuntoPsico;
window.seleccionarArchivoPsico = seleccionarArchivoPsico;
window.verAdjuntoPsico = verAdjuntoPsico;
window.eliminarAdjuntoPsico = eliminarAdjuntoPsico;

// Módulo Psicotécnico — Entry point

export {
  renderPsico, tabPsico, filtrarPsico, poblarFiltrosColumnasPsico,
  guardarPsico,
  abrirGestionPsico, toggleEtapaOpcional, actualizarBotonesAprobacion,
  guardarEtapasPsico, aprobarPsico, rechazarPsico,
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
  abrirGestionPsico, toggleEtapaOpcional, actualizarBotonesAprobacion,
  guardarEtapasPsico, aprobarPsico, rechazarPsico,
} from './psicotecnico.js';

window.tabPsico = tabPsico;
window.filtrarPsico = filtrarPsico;
window.guardarPsico = guardarPsico;
window.abrirGestionPsico = abrirGestionPsico;
window.toggleEtapaOpcional = toggleEtapaOpcional;
window.actualizarBotonesAprobacion = actualizarBotonesAprobacion;
window.guardarEtapasPsico = guardarEtapasPsico;
window.aprobarPsico = aprobarPsico;
window.rechazarPsico = rechazarPsico;

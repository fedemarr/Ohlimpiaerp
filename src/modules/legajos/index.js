// Módulo Legajos — Entry point

export {
  calcularPrueba,
  renderLegajos, filtrarLegajos,
  verLegajo, tabLeg,
  editarLegajoActual, guardarEdicionLegajo,
  imprimirLegajo,
} from './legajos.js';

// ========== SCREEN CONFIG ==========

import { renderLegajos } from './legajos.js';

export const legajosScreenConfig = {
  legajos: {
    title: 'Legajos de asociados',
    btn: '',
    fn: null,
    render: renderLegajos,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarLegajos, verLegajo, tabLeg,
  editarLegajoActual, guardarEdicionLegajo,
  imprimirLegajo,
} from './legajos.js';

window.renderLegajos = renderLegajos;
window.filtrarLegajos = filtrarLegajos;
window.verLegajo = verLegajo;
window.tabLeg = tabLeg;
window.editarLegajoActual = editarLegajoActual;
window.guardarEdicionLegajo = guardarEdicionLegajo;
window.imprimirLegajo = imprimirLegajo;

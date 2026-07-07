// Módulo Legajos — Entry point

export {
  calcularPrueba,
  renderLegajos, filtrarLegajos,
  verLegajo, tabLeg,
  editarLegajoActual, guardarEdicionLegajo,
  imprimirLegajo,
  verAdjuntoLegajo,
  SECTORES_ADMIN, toggleSeccionVacacionesLegajo,
} from './legajos.js';

export {
  abrirImportadorLegajos, descargarPlantillaLegajos,
  seleccionarArchivoImportacion, confirmarImportacionLegajos,
} from './importador.js';

// ========== SCREEN CONFIG ==========

import { renderLegajos } from './legajos.js';
import { abrirImportadorLegajos } from './importador.js';

export const legajosScreenConfig = {
  legajos: {
    title: 'Legajos de asociados',
    btn: '📤 Importar desde CSV',
    fn: () => abrirImportadorLegajos(),
    render: renderLegajos,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarLegajos, verLegajo, tabLeg,
  editarLegajoActual, guardarEdicionLegajo,
  imprimirLegajo,
  verAdjuntoLegajo,
  toggleSeccionVacacionesLegajo,
} from './legajos.js';

import {
  descargarPlantillaLegajos,
  seleccionarArchivoImportacion, confirmarImportacionLegajos,
} from './importador.js';

window.renderLegajos = renderLegajos;
window.filtrarLegajos = filtrarLegajos;
window.verLegajo = verLegajo;
window.tabLeg = tabLeg;
window.editarLegajoActual = editarLegajoActual;
window.guardarEdicionLegajo = guardarEdicionLegajo;
window.imprimirLegajo = imprimirLegajo;
window.verAdjuntoLegajo = verAdjuntoLegajo;
window.toggleSeccionVacacionesLegajo = toggleSeccionVacacionesLegajo;
window.abrirImportadorLegajos = abrirImportadorLegajos;
window.descargarPlantillaLegajos = descargarPlantillaLegajos;
window.seleccionarArchivoImportacion = seleccionarArchivoImportacion;
window.confirmarImportacionLegajos = confirmarImportacionLegajos;

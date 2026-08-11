// Módulo Legajos — Entry point

export {
  calcularPrueba,
  renderLegajos, filtrarLegajos,
  verLegajo, tabLeg,
  editarLegajoActual, guardarEdicionLegajo, eliminarLegajoActual,
  imprimirLegajo,
  verAdjuntoLegajo,
  toggleAltaObraSocial,
  SECTORES_ADMIN, toggleSeccionVacacionesLegajo,
  toggleLegajoSelection, toggleAllLegajosSelection, viewSelectedLegajos,
} from './legajos.js';

export {
  abrirImportadorLegajos, descargarPlantillaLegajos,
  seleccionarArchivoImportacion, confirmarImportacionLegajos,
} from './importador.js';

export {
  abrirImportarCbu, seleccionarArchivoCbu, confirmarImportarCbu,
} from './importarCbu.js';

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
  editarLegajoActual, guardarEdicionLegajo, eliminarLegajoActual,
  imprimirLegajo,
  verAdjuntoLegajo,
  toggleAltaObraSocial,
  toggleSeccionVacacionesLegajo,
  toggleLegajoSelection, toggleAllLegajosSelection, viewSelectedLegajos,
} from './legajos.js';

import {
  descargarPlantillaLegajos,
  seleccionarArchivoImportacion, confirmarImportacionLegajos,
} from './importador.js';

import {
  abrirImportarCbu, seleccionarArchivoCbu, confirmarImportarCbu,
} from './importarCbu.js';

window.renderLegajos = renderLegajos;
window.filtrarLegajos = filtrarLegajos;
window.verLegajo = verLegajo;
window.tabLeg = tabLeg;
window.editarLegajoActual = editarLegajoActual;
window.guardarEdicionLegajo = guardarEdicionLegajo;
window.eliminarLegajoActual = eliminarLegajoActual;
window.toggleAltaObraSocial = toggleAltaObraSocial;
window.imprimirLegajo = imprimirLegajo;
window.verAdjuntoLegajo = verAdjuntoLegajo;
window.toggleSeccionVacacionesLegajo = toggleSeccionVacacionesLegajo;
window.abrirImportadorLegajos = abrirImportadorLegajos;
window.descargarPlantillaLegajos = descargarPlantillaLegajos;
window.seleccionarArchivoImportacion = seleccionarArchivoImportacion;
window.confirmarImportacionLegajos = confirmarImportacionLegajos;
window.abrirImportarCbu = abrirImportarCbu;
window.seleccionarArchivoCbu = seleccionarArchivoCbu;
window.confirmarImportarCbu = confirmarImportarCbu;
window.toggleLegajoSelection = toggleLegajoSelection;
window.toggleAllLegajosSelection = toggleAllLegajosSelection;
window.viewSelectedLegajos = viewSelectedLegajos;

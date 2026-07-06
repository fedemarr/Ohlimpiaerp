// Módulo Uniformes — Entry point

export {
  renderUniformes, filtrarUniformes, poblarSelectsUniformes,
  abrirNuevaEntregaUniforme, abrirEditarUniformePorId, guardarUniforme,
  eliminarUniformePorId, autocompletarUniforme, crearEntregaUniformeDesdeAlta,
} from './uniformes.js';

// ========== SCREEN CONFIG ==========

import { renderUniformes, poblarSelectsUniformes, abrirNuevaEntregaUniforme } from './uniformes.js';

export const uniformesScreenConfig = {
  uniformes: {
    title: 'Uniformes',
    btn: '+ Nueva entrega',
    fn: () => abrirNuevaEntregaUniforme(),
    render: () => { poblarSelectsUniformes(); renderUniformes(); },
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarUniformes, abrirEditarUniformePorId, guardarUniforme, eliminarUniformePorId,
  autocompletarUniforme, crearEntregaUniformeDesdeAlta,
} from './uniformes.js';

window.renderUniformes = renderUniformes;
window.filtrarUniformes = filtrarUniformes;
window.poblarSelectsUniformes = poblarSelectsUniformes;
window.abrirNuevaEntregaUniforme = abrirNuevaEntregaUniforme;
window.abrirEditarUniformePorId = abrirEditarUniformePorId;
window.guardarUniforme = guardarUniforme;
window.eliminarUniformePorId = eliminarUniformePorId;
window.autocompletarUniforme = autocompletarUniforme;
window.crearEntregaUniformeDesdeAlta = crearEntregaUniformeDesdeAlta;

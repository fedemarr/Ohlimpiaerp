export {
  abrirModalSugerencia,
  enviarSugerencia,
  renderSugerencias,
  filtrarSugerencias,
  mostrarBotonReporte,
  ocultarBotonReporte,
} from './sugerencias.js';

import {
  abrirModalSugerencia,
  enviarSugerencia,
  renderSugerencias,
  filtrarSugerencias,
  mostrarBotonReporte,
  ocultarBotonReporte,
} from './sugerencias.js';

export const sugerenciasScreenConfig = {
  sugerencias: {
    title: 'Reportes y sugerencias',
    btn: '+ Nueva sugerencia',
    fn: () => abrirModalSugerencia(),
    render: () => renderSugerencias(),
  },
};

window.abrirModalSugerencia = abrirModalSugerencia;
window.enviarSugerencia = enviarSugerencia;
window.renderSugerencias = renderSugerencias;
window.filtrarSugerencias = filtrarSugerencias;
window.mostrarBotonReporte = mostrarBotonReporte;
window.ocultarBotonReporte = ocultarBotonReporte;

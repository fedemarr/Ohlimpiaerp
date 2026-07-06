// Módulo Retenciones — Entry point

export {
  renderRetenciones, filtrarRetenciones, poblarSelectsRetenciones,
  abrirNuevaRetencion, abrirEditarRetencionPorId, guardarRetencion,
  liberarRetencionPorId, eliminarRetencionPorId, autocompletarRetencion,
} from './retenciones.js';

// ========== SCREEN CONFIG ==========

import { renderRetenciones, poblarSelectsRetenciones, abrirNuevaRetencion } from './retenciones.js';

export const retencionesScreenConfig = {
  retenciones: {
    title: 'Retenciones',
    btn: '+ Nueva retención',
    fn: () => abrirNuevaRetencion(),
    render: () => { poblarSelectsRetenciones(); renderRetenciones(); },
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarRetenciones, abrirEditarRetencionPorId, guardarRetencion,
  liberarRetencionPorId, eliminarRetencionPorId, autocompletarRetencion,
} from './retenciones.js';

window.renderRetenciones = renderRetenciones;
window.filtrarRetenciones = filtrarRetenciones;
window.poblarSelectsRetenciones = poblarSelectsRetenciones;
window.abrirNuevaRetencion = abrirNuevaRetencion;
window.abrirEditarRetencionPorId = abrirEditarRetencionPorId;
window.guardarRetencion = guardarRetencion;
window.liberarRetencionPorId = liberarRetencionPorId;
window.eliminarRetencionPorId = eliminarRetencionPorId;
window.autocompletarRetencion = autocompletarRetencion;

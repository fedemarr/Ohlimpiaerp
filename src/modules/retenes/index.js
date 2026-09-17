// Retenes v2 — Entry point (ticket "Módulo Retenes" 18/09). Ver
// consultas.js (modelo de datos: ser retén = categoría del padrón) y
// retenes.js (render — pura lectura en vivo de las grillas).

export { getRetenesActivos, esRetenHoraBase } from './consultas.js';
export { renderRetenes, filtrarRetenes, toggleRetenDetalle, irAGrillaServicio } from './retenes.js';

import { renderRetenes, filtrarRetenes, toggleRetenDetalle, irAGrillaServicio } from './retenes.js';

export const retenesScreenConfig = {
  retenes: {
    title: 'Retenes',
    btn: '',
    fn: null,
    render: renderRetenes,
  },
};

window.renderRetenes = renderRetenes;
window.filtrarRetenes = filtrarRetenes;
window.toggleRetenDetalle = toggleRetenDetalle;
window.irAGrillaServicio = irAGrillaServicio;

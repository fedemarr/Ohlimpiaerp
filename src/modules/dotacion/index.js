// Módulo Dotación — Entry point

export {
  renderDotacion, operariosActivos, estadoOperario, esOperarioEnAlcance,
  serviciosConDotacionIncompleta, movimientosDelMes,
} from './dotacion.js';

import { renderDotacion } from './dotacion.js';

export const dotacionScreenConfig = {
  dotacion: {
    title: 'Dotación',
    btn: null,
    fn: null,
    render: () => renderDotacion(),
  },
};

window.renderDotacion = renderDotacion;

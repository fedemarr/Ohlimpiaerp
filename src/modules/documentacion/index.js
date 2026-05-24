// Módulo Documentación de ingreso — Entry point

export { renderDocum } from './documentacion.js';

import { renderDocum } from './documentacion.js';

export const documScreenConfig = {
  documentacion: {
    title: 'Documentación de ingreso',
    btn: null,
    fn: null,
    render: () => renderDocum(),
  },
};

window.renderDocum = renderDocum;

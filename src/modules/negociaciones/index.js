// Módulo CRM de Negociación — entry point (v097)
// Extraído de FinFlow (carpeta implementacion ohlimpia/js/pages/crm.js).
// Re-exports, screenConfig, window bindings.

export { cargar, renderNegociaciones } from './negociaciones.js';

import { cargar, renderNegociaciones } from './negociaciones.js';

export const negociacionesScreenConfig = {
  negociaciones: {
    title: 'CRM Negociación',
    btn: null,
    fn: null,
    render: () => renderNegociaciones(),
  },
};

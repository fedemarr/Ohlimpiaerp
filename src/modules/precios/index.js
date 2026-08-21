// Módulo Precios LIGE — entry point (v097)
// Extraído de FinFlow (carpeta implementacion ohlimpia/js/pages/precios.js).
// Reemplaza el módulo de precios existente en legacy.js.
// Re-exports, screenConfig, window bindings.

export { init, renderPreciosLige } from './precios.js';

import { init, renderPreciosLige } from './precios.js';

export const preciosScreenConfig = {
  precios: {
    title: 'Gestión de precios',
    btn: null,
    fn: null,
    render: () => renderPreciosLige(),
  },
};

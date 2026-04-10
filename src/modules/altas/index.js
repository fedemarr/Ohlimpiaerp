// Módulo Altas de asociados — Entry point

export {
  renderAltas, filtrarAltas, poblarFiltrosColumnasAltas, poblarSelectsAltas,
  abrirModalAlta, confirmarAlta,
  tabAlta, tabAltaSiguiente, tabAltaAnterior,
  onChangeZonaAlta, toggleReingresante,
} from './altas.js';

// ========== SCREEN CONFIG ==========

import { renderAltas, abrirModalAlta } from './altas.js';

export const altasScreenConfig = {
  altas: {
    title: 'Altas de asociados',
    btn: '+ Registrar alta',
    fn: () => abrirModalAlta(),
    render: renderAltas,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarAltas, confirmarAlta,
  tabAlta, tabAltaSiguiente, tabAltaAnterior,
  onChangeZonaAlta, toggleReingresante,
} from './altas.js';

import { applyTitleCase } from '@shared/helpers.js';

window.renderAltas = renderAltas;
window.filtrarAltas = filtrarAltas;
window.abrirModalAlta = abrirModalAlta;
window.confirmarAlta = confirmarAlta;
window.tabAlta = tabAlta;
window.tabAltaSiguiente = tabAltaSiguiente;
window.tabAltaAnterior = tabAltaAnterior;
window.onChangeZonaAlta = onChangeZonaAlta;
window.toggleReingresante = toggleReingresante;
window.applyTitleCase = applyTitleCase;

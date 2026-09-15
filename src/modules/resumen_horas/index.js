// Módulo Resumen de horas — Entry point

import {
  renderResumenHoras, filtrarResumenHoras, poblarSelectsResumenHoras,
  toggleFilaResumenHoras, toggleDiasResumenHoras,
  exportarResumenHorasCSV, confirmarPeriodoResumen,
} from './resumen_horas.js';

export {
  renderResumenHoras, filtrarResumenHoras, poblarSelectsResumenHoras,
  toggleFilaResumenHoras, toggleDiasResumenHoras,
  exportarResumenHorasCSV, confirmarPeriodoResumen,
};

// ========== SCREEN CONFIG ==========

export const resumenHorasScreenConfig = {
  resumen_horas: {
    title: 'Resumen de horas',
    btn: '',
    fn: null,
    render: () => renderResumenHoras(),
  },
};

// ========== WINDOW BINDINGS ==========

window.filtrarResumenHoras = filtrarResumenHoras;
window.toggleFilaResumenHoras = toggleFilaResumenHoras;
window.toggleDiasResumenHoras = toggleDiasResumenHoras;
window.exportarResumenHorasCSV = exportarResumenHorasCSV;
window.confirmarPeriodoResumen = confirmarPeriodoResumen;

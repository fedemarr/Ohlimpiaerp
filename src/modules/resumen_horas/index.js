// Módulo Resumen de horas — Entry point

import {
  renderResumenHoras, filtrarResumenHoras, poblarSelectsResumenHoras,
  toggleFilaResumenHoras, toggleDiasResumenHoras,
  exportarResumenHorasCSV, confirmarPeriodoResumen,
  tabResumenHoras, renderRevisionesRetiro,
  abrirNuevaRevisionRetiro, autocompletarRevisionRetiro, onChangePeriodoRevisionRetiro,
  agregarLineaRevisionRetiro, quitarLineaRevisionRetiro, actualizarLineaRevisionRetiro,
  agregarAdjuntoRevisionRetiro, quitarAdjuntoRevisionRetiro,
  guardarRevisionRetiro, marcarCorrespondeRevisionRetiro,
  abrirConfirmarPagoRevisionRetiro, confirmarPagoRevisionRetiro,
} from './resumen_horas.js';

export {
  renderResumenHoras, filtrarResumenHoras, poblarSelectsResumenHoras,
  toggleFilaResumenHoras, toggleDiasResumenHoras,
  exportarResumenHorasCSV, confirmarPeriodoResumen,
  tabResumenHoras, renderRevisionesRetiro,
  abrirNuevaRevisionRetiro, autocompletarRevisionRetiro, onChangePeriodoRevisionRetiro,
  agregarLineaRevisionRetiro, quitarLineaRevisionRetiro, actualizarLineaRevisionRetiro,
  agregarAdjuntoRevisionRetiro, quitarAdjuntoRevisionRetiro,
  guardarRevisionRetiro, marcarCorrespondeRevisionRetiro,
  abrirConfirmarPagoRevisionRetiro, confirmarPagoRevisionRetiro,
};

// ========== SCREEN CONFIG ==========

export const resumenHorasScreenConfig = {
  resumen_horas: {
    title: 'Resumen de horas',
    btn: '',
    fn: null,
    // Refresca las dos pestañas — la que no está visible no tiene costo
    // real (son tablas chicas) y así no queda desactualizada si el
    // usuario vuelve a este módulo con "Pedido de revisión" activo.
    render: () => { renderResumenHoras(); renderRevisionesRetiro(); },
  },
};

// ========== WINDOW BINDINGS ==========

window.filtrarResumenHoras = filtrarResumenHoras;
window.toggleFilaResumenHoras = toggleFilaResumenHoras;
window.toggleDiasResumenHoras = toggleDiasResumenHoras;
window.exportarResumenHorasCSV = exportarResumenHorasCSV;
window.confirmarPeriodoResumen = confirmarPeriodoResumen;
window.tabResumenHoras = tabResumenHoras;
window.renderRevisionesRetiro = renderRevisionesRetiro;
window.abrirNuevaRevisionRetiro = abrirNuevaRevisionRetiro;
window.autocompletarRevisionRetiro = autocompletarRevisionRetiro;
window.onChangePeriodoRevisionRetiro = onChangePeriodoRevisionRetiro;
window.agregarLineaRevisionRetiro = agregarLineaRevisionRetiro;
window.quitarLineaRevisionRetiro = quitarLineaRevisionRetiro;
window.actualizarLineaRevisionRetiro = actualizarLineaRevisionRetiro;
window.agregarAdjuntoRevisionRetiro = agregarAdjuntoRevisionRetiro;
window.quitarAdjuntoRevisionRetiro = quitarAdjuntoRevisionRetiro;
window.guardarRevisionRetiro = guardarRevisionRetiro;
window.marcarCorrespondeRevisionRetiro = marcarCorrespondeRevisionRetiro;
window.abrirConfirmarPagoRevisionRetiro = abrirConfirmarPagoRevisionRetiro;
window.confirmarPagoRevisionRetiro = confirmarPagoRevisionRetiro;

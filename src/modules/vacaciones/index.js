// Módulo Vacaciones (sector administrativo) — Entry point

import { $ } from '@shared/helpers.js';

export {
  renderPendientes, filtrarPendientes, poblarSelectsVacacionesTab,
  renderHistorial, filtrarHistorial,
  abrirNuevaSolicitud, abrirEditarSolicitud, recalcularSolicitud,
  guardarBorradorSolicitud, elevarSolicitudDesdeModal, elevarSolicitud,
  aprobarComoGerentePorId, votarConsejoPorId, votarAnulacionPorId,
  abrirRechazoGerente, abrirRechazoConsejo,
  abrirAnularSolicitante, abrirAnularGerente, abrirSolicitarAnulacion,
  abrirDetalleVacacion,
} from './vacaciones.js';

export {
  poblarSelectSectorSaldos, filtrarPanoramaSaldos, renderPanoramaSaldos, exportarSaldosExcel,
} from './saldo.js';

export {
  mesAnteriorVac, mesSiguienteVac, poblarSelectSectorCalendario,
  renderCalendarioVacaciones, verHistorialDesdeCalendario,
} from './calendario.js';

// ========== TABS ==========

import { renderPendientes, poblarSelectsVacacionesTab } from './vacaciones.js';
import { renderHistorial } from './vacaciones.js';
import { poblarSelectSectorSaldos, renderPanoramaSaldos } from './saldo.js';
import { poblarSelectSectorCalendario, renderCalendarioVacaciones } from './calendario.js';

const RENDER_POR_TAB = {
  pendientes: renderPendientes,
  historial: renderHistorial,
  saldos: renderPanoramaSaldos,
  calendario: renderCalendarioVacaciones,
};

export function cambiarTabVacaciones(tab, btn) {
  document.querySelectorAll('#screen-vacaciones .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-vacaciones .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-vacaciones .tab-btn[data-vac-tab="${tab}"]`)?.classList.add('active');
  $('vac-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

// Siempre entra por la pestaña Pendientes, sin importar en qué pestaña
// se había quedado la última visita — si no se resetea acá, el tab-content
// que quedó marcado "active" de una navegación anterior se muestra vacío
// porque nunca se le pidió (re)renderizar sus datos.
function renderVacacionesInicial() {
  poblarSelectsVacacionesTab();
  poblarSelectSectorSaldos();
  poblarSelectSectorCalendario();
  cambiarTabVacaciones('pendientes');
}

// ========== SCREEN CONFIG ==========

export const vacacionesScreenConfig = {
  vacaciones: {
    title: 'Vacaciones',
    btn: '+ Nueva solicitud',
    fn: () => window.abrirNuevaSolicitud(),
    render: renderVacacionesInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarPendientes, abrirNuevaSolicitud, abrirEditarSolicitud, recalcularSolicitud,
  guardarBorradorSolicitud, elevarSolicitudDesdeModal, elevarSolicitud,
  aprobarComoGerentePorId, votarConsejoPorId, votarAnulacionPorId,
  abrirRechazoGerente, abrirRechazoConsejo,
  abrirAnularSolicitante, abrirAnularGerente, abrirSolicitarAnulacion,
  abrirDetalleVacacion, filtrarHistorial,
} from './vacaciones.js';
import { filtrarPanoramaSaldos, exportarSaldosExcel } from './saldo.js';
import { mesAnteriorVac, mesSiguienteVac, verHistorialDesdeCalendario } from './calendario.js';

window.cambiarTabVacaciones = cambiarTabVacaciones;
window.renderPendientes = renderPendientes;
window.filtrarPendientes = filtrarPendientes;
window.abrirNuevaSolicitud = abrirNuevaSolicitud;
window.abrirEditarSolicitud = abrirEditarSolicitud;
window.recalcularSolicitud = recalcularSolicitud;
window.guardarBorradorSolicitud = guardarBorradorSolicitud;
window.elevarSolicitudDesdeModal = elevarSolicitudDesdeModal;
window.elevarSolicitud = elevarSolicitud;
window.aprobarComoGerentePorId = aprobarComoGerentePorId;
window.votarConsejoPorId = votarConsejoPorId;
window.votarAnulacionPorId = votarAnulacionPorId;
window.abrirRechazoGerente = abrirRechazoGerente;
window.abrirRechazoConsejo = abrirRechazoConsejo;
window.abrirAnularSolicitante = abrirAnularSolicitante;
window.abrirAnularGerente = abrirAnularGerente;
window.abrirSolicitarAnulacion = abrirSolicitarAnulacion;
window.abrirDetalleVacacion = abrirDetalleVacacion;
window.filtrarHistorial = filtrarHistorial;
window.renderHistorial = renderHistorial;
window.filtrarPanoramaSaldos = filtrarPanoramaSaldos;
window.renderPanoramaSaldos = renderPanoramaSaldos;
window.exportarSaldosExcel = exportarSaldosExcel;
window.mesAnteriorVac = mesAnteriorVac;
window.mesSiguienteVac = mesSiguienteVac;
window.renderCalendarioVacaciones = renderCalendarioVacaciones;
window.verHistorialDesdeCalendario = verHistorialDesdeCalendario;

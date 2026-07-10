// Módulo Situaciones Legales v1.1 — Entry point. Reemplaza el ABM de
// legacy.js (bug de llaves que perdía casos, fuga de estadoLegal al
// legajo, modal con 3 campos sin id, adjuntos decorativos sin subir
// nada real). Ver DELTA_situaciones_legales_v1.1.md.

import { $ } from '@shared/helpers.js';

export {
  renderCasosActivos, filtrarCasosActivos,
  abrirNuevoCasoLegal, seleccionarAsociadoLegal, confirmarNuevoCasoLegal,
  abrirDetalleCasoLegal, subirAdjuntoDetalleLegal, abrirAdjuntoLegal,
  abrirAgregarNovedad, confirmarAgregarNovedad,
  abrirCerrarCasoLegal, confirmarCerrarCasoLegal,
} from './casos.js';

export { renderHistoricoLegal, filtrarHistoricoLegal, exportarHistoricoLegalExcel } from './historico.js';

export {
  getCasoById, crearCaso, cambiarEstadoCaso, agregarNovedad, novedadesDeCaso, cerrarCaso, supervisorActual,
} from './flujo.js';

// ========== TABS ==========

import { renderCasosActivos } from './casos.js';
import { renderHistoricoLegal } from './historico.js';

const RENDER_POR_TAB = {
  activos: renderCasosActivos,
  historico: renderHistoricoLegal,
};

export function tabLegal(tab, btn) {
  document.querySelectorAll('#screen-legal .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-legal .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-legal .tab-btn[data-legal-tab="${tab}"]`)?.classList.add('active');
  $('legal-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

function renderLegalInicial() {
  tabLegal('activos');
}

// ========== SCREEN CONFIG ==========

import { abrirNuevoCasoLegal } from './casos.js';

export const situacionesLegalesScreenConfig = {
  legal: {
    title: 'Situaciones legales',
    btn: '+ Nuevo caso',
    fn: () => window.abrirNuevoCasoLegal(),
    render: renderLegalInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarCasosActivos, seleccionarAsociadoLegal, confirmarNuevoCasoLegal,
  abrirDetalleCasoLegal, subirAdjuntoDetalleLegal, abrirAdjuntoLegal,
  abrirAgregarNovedad, confirmarAgregarNovedad,
  abrirCerrarCasoLegal, confirmarCerrarCasoLegal,
} from './casos.js';
import { filtrarHistoricoLegal, exportarHistoricoLegalExcel } from './historico.js';

window.tabLegal = tabLegal;
window.abrirNuevoCasoLegal = abrirNuevoCasoLegal;
window.seleccionarAsociadoLegal = seleccionarAsociadoLegal;
window.confirmarNuevoCasoLegal = confirmarNuevoCasoLegal;
window.filtrarCasosActivos = filtrarCasosActivos;
window.abrirDetalleCasoLegal = abrirDetalleCasoLegal;
window.subirAdjuntoDetalleLegal = subirAdjuntoDetalleLegal;
window.abrirAdjuntoLegal = abrirAdjuntoLegal;
window.abrirAgregarNovedad = abrirAgregarNovedad;
window.confirmarAgregarNovedad = confirmarAgregarNovedad;
window.abrirCerrarCasoLegal = abrirCerrarCasoLegal;
window.confirmarCerrarCasoLegal = confirmarCerrarCasoLegal;
window.filtrarHistoricoLegal = filtrarHistoricoLegal;
window.exportarHistoricoLegalExcel = exportarHistoricoLegalExcel;

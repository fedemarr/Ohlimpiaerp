// Módulo Enfermos y Accidentes v1 — Entry point (Etapas 1-5).
// Reemplaza el ABM de legacy.js (modal con 13 campos donde
// guardarEnfermo solo persistía 4, mismo bug de llaves que Legal, sin
// certificados reales, sin motor económico). Depende del módulo
// Categorías para congelar el valor hora.

import { $ } from '@shared/helpers.js';

export {
  renderEnfermedades, filtrarEnfermedades, renderAccidentes, filtrarAccidentes,
  cambiarTipoCasoModal, seleccionarAsociadoEnfermos, recalcularValorHoraModal,
  abrirNuevoCasoEnfermos, confirmarNuevoCasoEnfermos, abrirDetalleCasoEnfermos,
  cambiarMotivoCierreModal, abrirCerrarCasoEnfermos, confirmarCerrarCasoEnfermos,
} from './enfermos.js';

export {
  renderCertificados, filtrarCertificados, abrirCargarCertificado, confirmarSubirCertificado,
  abrirVerCertificado, validarCertificadoPorId, chequearPlazo24hs,
} from './certificados.js';

export { recalcularRetiroModal, recalcularMontoModal, confirmarGuardarRetiro, abrirGestionarRetiro } from './retiros.js';

export { renderHistoricoEnfermos, filtrarHistoricoEnfermos, exportarHistoricoEnfermosExcel } from './historico.js';

export { abrirBuscarArt42, abrirComoCasoFormal } from './puente_art42.js';

export { getCasoById, abrirCaso, cerrarCaso, anularCaso, casoAbiertoDeLegajo } from './flujo.js';

// ========== TABS ==========

import { renderEnfermedades, renderAccidentes } from './enfermos.js';
import { renderCertificados, chequearPlazo24hs } from './certificados.js';
import { renderHistoricoEnfermos } from './historico.js';

const RENDER_POR_TAB = {
  enfermedades: renderEnfermedades,
  accidentes: renderAccidentes,
  certificados: renderCertificados,
  historico: renderHistoricoEnfermos,
};

export function tabEnf(tab, btn) {
  document.querySelectorAll('#screen-enfermos .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-enfermos .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-enfermos .tab-btn[data-enf-tab="${tab}"]`)?.classList.add('active');
  $('enf-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

// Siempre entra por Enfermedades, y de paso chequea plazos de
// certificado vencidos (mismo patrón que Sanciones/Uniformes).
async function renderEnfermosInicial() {
  await chequearPlazo24hs();
  tabEnf('enfermedades');
}

// ========== SCREEN CONFIG ==========

import { abrirNuevoCasoEnfermos } from './enfermos.js';

export const enfermosAccidentesScreenConfig = {
  enfermos: {
    title: 'Enfermos y accidentes',
    btn: '+ Abrir nuevo caso',
    fn: () => window.abrirNuevoCasoEnfermos(),
    render: renderEnfermosInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarEnfermedades, filtrarAccidentes, cambiarTipoCasoModal, seleccionarAsociadoEnfermos,
  recalcularValorHoraModal, confirmarNuevoCasoEnfermos, abrirDetalleCasoEnfermos,
  cambiarMotivoCierreModal, abrirCerrarCasoEnfermos, confirmarCerrarCasoEnfermos,
} from './enfermos.js';
import {
  filtrarCertificados, abrirCargarCertificado, confirmarSubirCertificado,
  abrirVerCertificado, validarCertificadoPorId,
} from './certificados.js';
import { recalcularRetiroModal, recalcularMontoModal, confirmarGuardarRetiro, abrirGestionarRetiro } from './retiros.js';
import { filtrarHistoricoEnfermos, exportarHistoricoEnfermosExcel } from './historico.js';
import { abrirBuscarArt42, abrirComoCasoFormal } from './puente_art42.js';

window.tabEnf = tabEnf;
window.abrirNuevoCasoEnfermos = abrirNuevoCasoEnfermos;
window.filtrarEnfermedades = filtrarEnfermedades;
window.filtrarAccidentes = filtrarAccidentes;
window.cambiarTipoCasoModal = cambiarTipoCasoModal;
window.seleccionarAsociadoEnfermos = seleccionarAsociadoEnfermos;
window.recalcularValorHoraModal = recalcularValorHoraModal;
window.confirmarNuevoCasoEnfermos = confirmarNuevoCasoEnfermos;
window.abrirDetalleCasoEnfermos = abrirDetalleCasoEnfermos;
window.cambiarMotivoCierreModal = cambiarMotivoCierreModal;
window.abrirCerrarCasoEnfermos = abrirCerrarCasoEnfermos;
window.confirmarCerrarCasoEnfermos = confirmarCerrarCasoEnfermos;

window.filtrarCertificados = filtrarCertificados;
window.abrirCargarCertificado = abrirCargarCertificado;
window.confirmarSubirCertificado = confirmarSubirCertificado;
window.abrirVerCertificado = abrirVerCertificado;
window.validarCertificadoPorId = validarCertificadoPorId;

window.recalcularRetiroModal = recalcularRetiroModal;
window.recalcularMontoModal = recalcularMontoModal;
window.confirmarGuardarRetiro = confirmarGuardarRetiro;
window.abrirGestionarRetiro = abrirGestionarRetiro;

window.filtrarHistoricoEnfermos = filtrarHistoricoEnfermos;
window.exportarHistoricoEnfermosExcel = exportarHistoricoEnfermosExcel;

window.abrirBuscarArt42 = abrirBuscarArt42;
window.abrirComoCasoFormal = abrirComoCasoFormal;

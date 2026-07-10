// Módulo Sanciones v1 — Entry point (Etapa 1: niveles 0-2). Reemplaza
// el ABM plano de legacy.js (sin niveles tipados, botón "+ Nueva
// sanción" roto).

import { $ } from '@shared/helpers.js';

export {
  renderPendientesSanciones, filtrarPendientesSanciones,
  renderActivasSanciones, filtrarActivasSanciones,
  renderHistorialSanciones, filtrarHistorialSanciones, exportarSancionesExcel,
  abrirNuevaSancion, seleccionarSancionadoModal, cambiarCategoriaModal, cambiarInfraccionModal,
  recalcularNuevaSancion, confirmarNuevaSancion,
  elevarNivel2PorId, aprobarPrimeraInstanciaPorId, aprobarSegundaInstanciaPorId, ejecutarNivel2PorId,
  abrirRechazarSancion, abrirRevertirNivel1, abrirDetalleSancion,
} from './sanciones.js';

export {
  renderCatalogoInfracciones, activarDesactivarInfraccionPorId, anularInfraccionPorId,
  abrirCorregirVersionInfraccion, abrirNuevaVigenciaInfraccion, guardarVersionInfraccionDesdeModal,
  abrirHistorialVersionesInfraccion, abrirNuevaInfraccion, guardarInfraccionNueva,
} from './catalogo.js';

export { abrirRegistrarDescargo, confirmarRegistrarDescargo } from './descargo.js';

export { chequearDescargosVencidos } from './flujo.js';

// ========== TABS ==========

import {
  renderPendientesSanciones, renderActivasSanciones, renderHistorialSanciones,
} from './sanciones.js';
import { renderCatalogoInfracciones } from './catalogo.js';
import { chequearDescargosVencidos } from './flujo.js';

const RENDER_POR_TAB = {
  pendientes: renderPendientesSanciones,
  activas: renderActivasSanciones,
  historial: renderHistorialSanciones,
  catalogo: renderCatalogoInfracciones,
};

export function tabSanc(tab, btn) {
  document.querySelectorAll('#screen-sanciones .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-sanciones .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-sanciones .tab-btn[data-sanc-tab="${tab}"]`)?.classList.add('active');
  $('sanc-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

// Siempre entra por Pendientes, y de paso chequea descargos con plazo
// vencido (sin cron real, mismo patrón que Uniformes/Competencia).
async function renderSancionesInicial() {
  await chequearDescargosVencidos();
  tabSanc('pendientes');
}

// ========== SCREEN CONFIG ==========

import { abrirNuevaSancion } from './sanciones.js';

export const sancionesScreenConfig = {
  sanciones: {
    title: 'Sanciones',
    btn: '+ Nueva sanción',
    fn: () => window.abrirNuevaSancion(),
    render: renderSancionesInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarPendientesSanciones, filtrarActivasSanciones, filtrarHistorialSanciones, exportarSancionesExcel,
  seleccionarSancionadoModal, cambiarCategoriaModal, cambiarInfraccionModal, recalcularNuevaSancion, confirmarNuevaSancion,
  elevarNivel2PorId, aprobarPrimeraInstanciaPorId, aprobarSegundaInstanciaPorId, ejecutarNivel2PorId,
  abrirRechazarSancion, abrirRevertirNivel1, abrirDetalleSancion,
} from './sanciones.js';
import {
  activarDesactivarInfraccionPorId, anularInfraccionPorId,
  abrirCorregirVersionInfraccion, abrirNuevaVigenciaInfraccion, guardarVersionInfraccionDesdeModal,
  abrirHistorialVersionesInfraccion, abrirNuevaInfraccion, guardarInfraccionNueva,
} from './catalogo.js';
import { abrirRegistrarDescargo, confirmarRegistrarDescargo } from './descargo.js';

window.tabSanc = tabSanc;
window.abrirNuevaSancion = abrirNuevaSancion;
window.filtrarPendientesSanciones = filtrarPendientesSanciones;
window.filtrarActivasSanciones = filtrarActivasSanciones;
window.filtrarHistorialSanciones = filtrarHistorialSanciones;
window.exportarSancionesExcel = exportarSancionesExcel;
window.seleccionarSancionadoModal = seleccionarSancionadoModal;
window.cambiarCategoriaModal = cambiarCategoriaModal;
window.cambiarInfraccionModal = cambiarInfraccionModal;
window.recalcularNuevaSancion = recalcularNuevaSancion;
window.confirmarNuevaSancion = confirmarNuevaSancion;
window.elevarNivel2PorId = elevarNivel2PorId;
window.aprobarPrimeraInstanciaPorId = aprobarPrimeraInstanciaPorId;
window.aprobarSegundaInstanciaPorId = aprobarSegundaInstanciaPorId;
window.ejecutarNivel2PorId = ejecutarNivel2PorId;
window.abrirRechazarSancion = abrirRechazarSancion;
window.abrirRevertirNivel1 = abrirRevertirNivel1;
window.abrirDetalleSancion = abrirDetalleSancion;

window.activarDesactivarInfraccionPorId = activarDesactivarInfraccionPorId;
window.anularInfraccionPorId = anularInfraccionPorId;
window.abrirCorregirVersionInfraccion = abrirCorregirVersionInfraccion;
window.abrirNuevaVigenciaInfraccion = abrirNuevaVigenciaInfraccion;
window.guardarVersionInfraccionDesdeModal = guardarVersionInfraccionDesdeModal;
window.abrirHistorialVersionesInfraccion = abrirHistorialVersionesInfraccion;
window.abrirNuevaInfraccion = abrirNuevaInfraccion;
window.guardarInfraccionNueva = guardarInfraccionNueva;

window.abrirRegistrarDescargo = abrirRegistrarDescargo;
window.confirmarRegistrarDescargo = confirmarRegistrarDescargo;

// Módulo Uniformes v2 — Entry point (reemplaza la versión simple v024).

import { $ } from '@shared/helpers.js';

export {
  renderPendientesUniformes, filtrarPendientesUniformes, poblarSelectsUniformesTab,
  renderTodosUniformes, filtrarTodosUniformes,
  abrirNuevaEntregaUniforme, abrirEditarPedidoUniforme,
  seleccionarOperarioPedidoUniforme, recalcularPedidoUniforme,
  agregarPrendaPedidoUniforme, cambiarPrendaModal, cambiarTalleModal, cambiarCantidadModal, quitarPrendaModal,
  guardarBorradorPedidoUniforme, elevarPedidoDesdeModalUniforme, elevarPedidoUniformePorId,
  abrirCancelarPedidoUniforme, autorizarPedidoUniformePorId, abrirRechazoPedidoUniforme,
  logisticaRecibePorId, logisticaEnviaPorId, rrhhConfirmaRecepcionPorId, rrhhMarcaRetiroPorId,
  supervisorConfirmaRetiroPorId, reactivarDesdeVencidoPorId, confirmarDevolucionConstanciaYViejo,
  abrirEntregaConFirma, confirmarEntregaConFirma,
  abrirConfirmarCierrePedido, confirmarCierrePedidoUniforme,
  abrirAplicarDescuentoIncumplimiento, abrirDetallePedidoUniforme,
  crearEntregaUniformeDesdeAlta,
} from './uniformes.js';

export {
  abrirGestionPrecios, cambiarPrendaPrecio, abrirNuevoPrecioUniforme, abrirEditarPrecioUniforme,
  abrirNuevoPrecioConVigencia, guardarPrecioUniforme, abrirHistorialPrecioUniforme,
} from './precios.js';

export {
  filtrarDescuentosUniformes, renderDescuentosUniformes, exportarDescuentosUniformesExcel,
} from './descuentos.js';

export {
  filtrarDevolucionesBaja, renderDevolucionesBaja, abrirGenerarOrdenManual,
  abrirCierreDevolucion, confirmarCierreDevolucion, generarOrdenDevolucionUniformes,
} from './devoluciones.js';

export { chequearAlertas24hs, chequear15Dias } from './vencimientos.js';

// ========== TABS ==========

import { renderPendientesUniformes, poblarSelectsUniformesTab, renderTodosUniformes } from './uniformes.js';
import { renderDescuentosUniformes } from './descuentos.js';
import { renderDevolucionesBaja } from './devoluciones.js';
import { chequearAlertas24hs, chequear15Dias } from './vencimientos.js';

const RENDER_POR_TAB = {
  pendientes: renderPendientesUniformes,
  todos: renderTodosUniformes,
  descuentos: renderDescuentosUniformes,
  devoluciones: renderDevolucionesBaja,
};

export function cambiarTabUniformes(tab, btn) {
  document.querySelectorAll('#screen-uniformes .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-uniformes .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-uniformes .tab-btn[data-uni-tab="${tab}"]`)?.classList.add('active');
  $('uni-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

// Siempre entra por Pendientes, y de paso corre los chequeos
// automáticos de vencimiento (opción "chequeo al abrir", sin cron
// real — DISENO_uniformes.md §19.1).
async function renderUniformesInicial() {
  poblarSelectsUniformesTab();
  await chequearAlertas24hs();
  await chequear15Dias();
  cambiarTabUniformes('pendientes');
}

// ========== SCREEN CONFIG ==========

export const uniformesScreenConfig = {
  uniformes: {
    title: 'Uniformes',
    btn: '+ Nuevo pedido',
    fn: () => window.abrirNuevaEntregaUniforme(),
    render: renderUniformesInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarPendientesUniformes, filtrarTodosUniformes,
  abrirNuevaEntregaUniforme, abrirEditarPedidoUniforme,
  seleccionarOperarioPedidoUniforme, recalcularPedidoUniforme,
  agregarPrendaPedidoUniforme, cambiarPrendaModal, cambiarTalleModal, cambiarCantidadModal, quitarPrendaModal,
  guardarBorradorPedidoUniforme, elevarPedidoDesdeModalUniforme, elevarPedidoUniformePorId,
  abrirCancelarPedidoUniforme, autorizarPedidoUniformePorId, abrirRechazoPedidoUniforme,
  logisticaRecibePorId, logisticaEnviaPorId, rrhhConfirmaRecepcionPorId, rrhhMarcaRetiroPorId,
  supervisorConfirmaRetiroPorId, reactivarDesdeVencidoPorId, confirmarDevolucionConstanciaYViejo,
  abrirEntregaConFirma, confirmarEntregaConFirma,
  abrirConfirmarCierrePedido, confirmarCierrePedidoUniforme,
  abrirAplicarDescuentoIncumplimiento, abrirDetallePedidoUniforme,
  crearEntregaUniformeDesdeAlta,
} from './uniformes.js';
import {
  abrirGestionPrecios, cambiarPrendaPrecio, abrirNuevoPrecioUniforme, abrirEditarPrecioUniforme,
  abrirNuevoPrecioConVigencia, guardarPrecioUniforme, abrirHistorialPrecioUniforme,
} from './precios.js';
import { filtrarDescuentosUniformes, exportarDescuentosUniformesExcel } from './descuentos.js';
import { filtrarDevolucionesBaja, abrirGenerarOrdenManual, abrirCierreDevolucion, confirmarCierreDevolucion, generarOrdenDevolucionUniformes } from './devoluciones.js';

window.cambiarTabUniformes = cambiarTabUniformes;
window.filtrarPendientesUniformes = filtrarPendientesUniformes;
window.filtrarTodosUniformes = filtrarTodosUniformes;
window.abrirNuevaEntregaUniforme = abrirNuevaEntregaUniforme;
window.abrirEditarPedidoUniforme = abrirEditarPedidoUniforme;
window.seleccionarOperarioPedidoUniforme = seleccionarOperarioPedidoUniforme;
window.recalcularPedidoUniforme = recalcularPedidoUniforme;
window.agregarPrendaPedidoUniforme = agregarPrendaPedidoUniforme;
window.cambiarPrendaModal = cambiarPrendaModal;
window.cambiarTalleModal = cambiarTalleModal;
window.cambiarCantidadModal = cambiarCantidadModal;
window.quitarPrendaModal = quitarPrendaModal;
window.guardarBorradorPedidoUniforme = guardarBorradorPedidoUniforme;
window.elevarPedidoDesdeModalUniforme = elevarPedidoDesdeModalUniforme;
window.elevarPedidoUniformePorId = elevarPedidoUniformePorId;
window.abrirCancelarPedidoUniforme = abrirCancelarPedidoUniforme;
window.autorizarPedidoUniformePorId = autorizarPedidoUniformePorId;
window.abrirRechazoPedidoUniforme = abrirRechazoPedidoUniforme;
window.logisticaRecibePorId = logisticaRecibePorId;
window.logisticaEnviaPorId = logisticaEnviaPorId;
window.rrhhConfirmaRecepcionPorId = rrhhConfirmaRecepcionPorId;
window.rrhhMarcaRetiroPorId = rrhhMarcaRetiroPorId;
window.supervisorConfirmaRetiroPorId = supervisorConfirmaRetiroPorId;
window.reactivarDesdeVencidoPorId = reactivarDesdeVencidoPorId;
window.confirmarDevolucionConstanciaYViejo = confirmarDevolucionConstanciaYViejo;
window.abrirEntregaConFirma = abrirEntregaConFirma;
window.confirmarEntregaConFirma = confirmarEntregaConFirma;
window.abrirConfirmarCierrePedido = abrirConfirmarCierrePedido;
window.confirmarCierrePedidoUniforme = confirmarCierrePedidoUniforme;
window.abrirAplicarDescuentoIncumplimiento = abrirAplicarDescuentoIncumplimiento;
window.abrirDetallePedidoUniforme = abrirDetallePedidoUniforme;
window.crearEntregaUniformeDesdeAlta = crearEntregaUniformeDesdeAlta;

window.abrirGestionPrecios = abrirGestionPrecios;
window.cambiarPrendaPrecio = cambiarPrendaPrecio;
window.abrirNuevoPrecioUniforme = abrirNuevoPrecioUniforme;
window.abrirEditarPrecioUniforme = abrirEditarPrecioUniforme;
window.abrirNuevoPrecioConVigencia = abrirNuevoPrecioConVigencia;
window.guardarPrecioUniforme = guardarPrecioUniforme;
window.abrirHistorialPrecioUniforme = abrirHistorialPrecioUniforme;

window.filtrarDescuentosUniformes = filtrarDescuentosUniformes;
window.exportarDescuentosUniformesExcel = exportarDescuentosUniformesExcel;

window.filtrarDevolucionesBaja = filtrarDevolucionesBaja;
window.abrirGenerarOrdenManual = abrirGenerarOrdenManual;
window.abrirCierreDevolucion = abrirCierreDevolucion;
window.confirmarCierreDevolucion = confirmarCierreDevolucion;
window.generarOrdenDevolucionUniformes = generarOrdenDevolucionUniformes;

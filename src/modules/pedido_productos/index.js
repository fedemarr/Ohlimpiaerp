// Módulo Pedido de Productos (Logística) — Entry point

export {
  renderPedidoProductos, tabPP, poblarSelectsPeriodoPP,
  renderCatalogoPP, abrirNuevoProductoPP, abrirEditarProductoPP, guardarProductoPP, anularProductoPP,
  abrirNuevoPrecioPP, guardarNuevoPrecioPP, corregirPrecioPP,
  renderPeriodosPP, abrirPeriodoPP, cerrarPeriodoPP, filtrarDesglosePeriodoPP, chequearCierrePeriodosPP,
  renderMisPedidosPP, abrirCargaPedidoPP, filtrarCargaPedidoPP, guardarItemPedidoPP,
  repetirPedidoMesAnteriorPP, guardarBorradorPedidoPP, confirmarPedidoPP, aceptarPropuestaAuditorPP,
  renderAuditoriaPP, abrirAuditoriaPedidoPP, ajustarCantidadAuditoriaPP, aprobarPedidoPP, confirmarDevolverConPropuestaPP,
  renderComprasPP, marcarEnCompraPP, marcarEntregadoPP,
} from './pedido_productos.js';

export {
  abrirImportarListadoPP, cambiarProveedorImportPP,
  seleccionarArchivoListadoPP, confirmarImportarListadoPP,
} from './importarListado.js';

// ========== SCREEN CONFIG ==========

import { renderPedidoProductos } from './pedido_productos.js';

export const pedidoProductosScreenConfig = {
  pedido_productos: {
    title: 'Pedido de productos',
    btn: '',
    fn: null,
    render: renderPedidoProductos,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  tabPP,
  renderCatalogoPP, abrirNuevoProductoPP, abrirEditarProductoPP, guardarProductoPP, anularProductoPP,
  abrirNuevoPrecioPP, guardarNuevoPrecioPP, corregirPrecioPP,
  renderPeriodosPP, abrirPeriodoPP, cerrarPeriodoPP, filtrarDesglosePeriodoPP,
  renderMisPedidosPP, abrirCargaPedidoPP, filtrarCargaPedidoPP, guardarItemPedidoPP,
  repetirPedidoMesAnteriorPP, guardarBorradorPedidoPP, confirmarPedidoPP, aceptarPropuestaAuditorPP,
  renderAuditoriaPP, abrirAuditoriaPedidoPP, ajustarCantidadAuditoriaPP, aprobarPedidoPP, confirmarDevolverConPropuestaPP,
  renderComprasPP, marcarEnCompraPP, marcarEntregadoPP,
} from './pedido_productos.js';

import {
  abrirImportarListadoPP, cambiarProveedorImportPP,
  seleccionarArchivoListadoPP, confirmarImportarListadoPP,
} from './importarListado.js';

window.tabPP = tabPP;
window.renderCatalogoPP = renderCatalogoPP;
window.abrirNuevoProductoPP = abrirNuevoProductoPP;
window.abrirEditarProductoPP = abrirEditarProductoPP;
window.guardarProductoPP = guardarProductoPP;
window.anularProductoPP = anularProductoPP;
window.abrirNuevoPrecioPP = abrirNuevoPrecioPP;
window.guardarNuevoPrecioPP = guardarNuevoPrecioPP;
window.corregirPrecioPP = corregirPrecioPP;
window.renderPeriodosPP = renderPeriodosPP;
window.abrirPeriodoPP = abrirPeriodoPP;
window.cerrarPeriodoPP = cerrarPeriodoPP;
window.filtrarDesglosePeriodoPP = filtrarDesglosePeriodoPP;
window.renderMisPedidosPP = renderMisPedidosPP;
window.abrirCargaPedidoPP = abrirCargaPedidoPP;
window.filtrarCargaPedidoPP = filtrarCargaPedidoPP;
window.guardarItemPedidoPP = guardarItemPedidoPP;
window.repetirPedidoMesAnteriorPP = repetirPedidoMesAnteriorPP;
window.guardarBorradorPedidoPP = guardarBorradorPedidoPP;
window.confirmarPedidoPP = confirmarPedidoPP;
window.aceptarPropuestaAuditorPP = aceptarPropuestaAuditorPP;
window.renderAuditoriaPP = renderAuditoriaPP;
window.abrirAuditoriaPedidoPP = abrirAuditoriaPedidoPP;
window.ajustarCantidadAuditoriaPP = ajustarCantidadAuditoriaPP;
window.aprobarPedidoPP = aprobarPedidoPP;
window.confirmarDevolverConPropuestaPP = confirmarDevolverConPropuestaPP;
window.renderComprasPP = renderComprasPP;
window.marcarEnCompraPP = marcarEnCompraPP;
window.marcarEntregadoPP = marcarEntregadoPP;
window.abrirImportarListadoPP = abrirImportarListadoPP;
window.cambiarProveedorImportPP = cambiarProveedorImportPP;
window.seleccionarArchivoListadoPP = seleccionarArchivoListadoPP;
window.confirmarImportarListadoPP = confirmarImportarListadoPP;

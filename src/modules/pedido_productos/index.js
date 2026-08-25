// Módulo Pedido de Productos (Logística) — Entry point

export {
  renderPedidoProductos, tabPP, poblarSelectsPeriodoPP,
  renderCatalogoPP, abrirNuevoProductoPP, abrirEditarProductoPP, guardarProductoPP, anularProductoPP,
  abrirNuevoPrecioPP, guardarNuevoPrecioPP, corregirPrecioPP,
  renderPeriodosPP, abrirPeriodoPP, cerrarPeriodoPP,
  renderMisPedidosPP, abrirCargaPedidoPP, guardarItemPedidoPP, cerrarPedidoSupervisorPP,
  renderAuditoriaPP, abrirAuditoriaPedidoPP, ajustarCantidadAuditoriaPP, autorizarPedidoPP,
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
  renderPeriodosPP, abrirPeriodoPP, cerrarPeriodoPP,
  renderMisPedidosPP, abrirCargaPedidoPP, guardarItemPedidoPP, cerrarPedidoSupervisorPP,
  renderAuditoriaPP, abrirAuditoriaPedidoPP, ajustarCantidadAuditoriaPP, autorizarPedidoPP,
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
window.renderMisPedidosPP = renderMisPedidosPP;
window.abrirCargaPedidoPP = abrirCargaPedidoPP;
window.guardarItemPedidoPP = guardarItemPedidoPP;
window.cerrarPedidoSupervisorPP = cerrarPedidoSupervisorPP;
window.renderAuditoriaPP = renderAuditoriaPP;
window.abrirAuditoriaPedidoPP = abrirAuditoriaPedidoPP;
window.ajustarCantidadAuditoriaPP = ajustarCantidadAuditoriaPP;
window.autorizarPedidoPP = autorizarPedidoPP;
window.renderComprasPP = renderComprasPP;
window.marcarEnCompraPP = marcarEnCompraPP;
window.marcarEntregadoPP = marcarEntregadoPP;
window.abrirImportarListadoPP = abrirImportarListadoPP;
window.cambiarProveedorImportPP = cambiarProveedorImportPP;
window.seleccionarArchivoListadoPP = seleccionarArchivoListadoPP;
window.confirmarImportarListadoPP = confirmarImportarListadoPP;

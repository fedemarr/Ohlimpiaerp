// Módulo Pedido de Productos (Logística) — Entry point

export {
  renderPedidoProductos, tabPP, poblarSelectsPeriodoPP,
  renderCatalogoPP, abrirNuevoProductoPP, abrirEditarProductoPP, guardarProductoPP, anularProductoPP,
  abrirNuevoPrecioPP, guardarNuevoPrecioPP, corregirPrecioPP,
  renderPeriodosPP, abrirPeriodoPP, cerrarPeriodoPP, filtrarDesglosePeriodoPP, chequearCierrePeriodosPP,
  renderMisPedidosPP, abrirCargaPedidoPP, filtrarCargaPedidoPP, guardarItemPedidoPP,
  repetirPedidoMesAnteriorPP, guardarBorradorPedidoPP, confirmarPedidoPP, aceptarPropuestaAuditorPP,
  renderAuditoriaPP, abrirAuditoriaPedidoPP, ajustarCantidadAuditoriaPP, aprobarPedidoPP, confirmarDevolverConPropuestaPP,
  abrirHistorialPedidoPP,
  marcarEnCompraPP, marcarEntregadoPP, subTabComprasPP,
} from './pedido_productos.js';

export {
  abrirImportarListadoPP, cambiarProveedorImportPP,
  seleccionarArchivoListadoPP, confirmarImportarListadoPP,
} from './importarListado.js';

export {
  renderConsolidadoPP, exportarConsolidadoPP, generarOrdenesCompraPP, confirmarProveedorPP,
  renderSugerenciasPP, aceptarSugerenciaPP, mantenerSugerenciaPP, deshacerDecisionSugerenciaPP,
  renderSimulacionPP,
  renderOrdenesPP, abrirDetalleOrdenPP, enviarOrdenPP, guardarRecepcionOrdenPP, exportarOrdenPP,
  abrirFacturaOrdenPP, confirmarFacturaOrdenPP,
  renderComparadorPreciosPP, abrirNuevoGrupoEquivalenciaPP, buscarProductoParaGrupoPP,
  agregarProductoAGrupoPP, quitarProductoDeGrupoPP, cambiarFactorGrupoPP, guardarGrupoEquivalenciaPP,
} from './compras.js';

export {
  renderEntregasPP, abrirArmadoPedidoPP, marcarItemArmadoPP, generarRemitoPP,
  marcarEnRepartoPP, abrirEntregaFinalPP, confirmarEntregaFinalPP,
} from './entregas.js';

export {
  renderRecargosPP, abrirNuevoRecargoGeneralPP, abrirCargarRecargoPropioPP, guardarRecargoPP,
} from './recargos.js';

export { renderMargenPP } from './margen.js';

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
  abrirHistorialPedidoPP,
  marcarEnCompraPP, marcarEntregadoPP, subTabComprasPP,
} from './pedido_productos.js';

import {
  abrirImportarListadoPP, cambiarProveedorImportPP,
  seleccionarArchivoListadoPP, confirmarImportarListadoPP,
} from './importarListado.js';

import {
  renderConsolidadoPP, exportarConsolidadoPP, generarOrdenesCompraPP, confirmarProveedorPP,
  renderSugerenciasPP, aceptarSugerenciaPP, mantenerSugerenciaPP, deshacerDecisionSugerenciaPP,
  renderSimulacionPP,
  renderOrdenesPP, abrirDetalleOrdenPP, enviarOrdenPP, guardarRecepcionOrdenPP, exportarOrdenPP,
  abrirFacturaOrdenPP, confirmarFacturaOrdenPP,
  renderComparadorPreciosPP, abrirNuevoGrupoEquivalenciaPP, buscarProductoParaGrupoPP,
  agregarProductoAGrupoPP, quitarProductoDeGrupoPP, cambiarFactorGrupoPP, guardarGrupoEquivalenciaPP,
} from './compras.js';

import {
  renderEntregasPP, abrirArmadoPedidoPP, marcarItemArmadoPP, generarRemitoPP,
  marcarEnRepartoPP, abrirEntregaFinalPP, confirmarEntregaFinalPP,
} from './entregas.js';

import {
  renderRecargosPP, abrirNuevoRecargoGeneralPP, abrirCargarRecargoPropioPP, guardarRecargoPP,
} from './recargos.js';

import { renderMargenPP } from './margen.js';

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
window.abrirHistorialPedidoPP = abrirHistorialPedidoPP;
window.marcarEnCompraPP = marcarEnCompraPP;
window.marcarEntregadoPP = marcarEntregadoPP;
window.subTabComprasPP = subTabComprasPP;
window.abrirImportarListadoPP = abrirImportarListadoPP;
window.cambiarProveedorImportPP = cambiarProveedorImportPP;
window.seleccionarArchivoListadoPP = seleccionarArchivoListadoPP;
window.confirmarImportarListadoPP = confirmarImportarListadoPP;

window.renderConsolidadoPP = renderConsolidadoPP;
window.exportarConsolidadoPP = exportarConsolidadoPP;
window.generarOrdenesCompraPP = generarOrdenesCompraPP;
window.confirmarProveedorPP = confirmarProveedorPP;
window.renderSugerenciasPP = renderSugerenciasPP;
window.aceptarSugerenciaPP = aceptarSugerenciaPP;
window.mantenerSugerenciaPP = mantenerSugerenciaPP;
window.deshacerDecisionSugerenciaPP = deshacerDecisionSugerenciaPP;
window.renderSimulacionPP = renderSimulacionPP;
window.renderOrdenesPP = renderOrdenesPP;
window.abrirDetalleOrdenPP = abrirDetalleOrdenPP;
window.enviarOrdenPP = enviarOrdenPP;
window.guardarRecepcionOrdenPP = guardarRecepcionOrdenPP;
window.exportarOrdenPP = exportarOrdenPP;
window.abrirFacturaOrdenPP = abrirFacturaOrdenPP;
window.confirmarFacturaOrdenPP = confirmarFacturaOrdenPP;
window.renderComparadorPreciosPP = renderComparadorPreciosPP;
window.abrirNuevoGrupoEquivalenciaPP = abrirNuevoGrupoEquivalenciaPP;
window.buscarProductoParaGrupoPP = buscarProductoParaGrupoPP;
window.agregarProductoAGrupoPP = agregarProductoAGrupoPP;
window.quitarProductoDeGrupoPP = quitarProductoDeGrupoPP;
window.cambiarFactorGrupoPP = cambiarFactorGrupoPP;
window.guardarGrupoEquivalenciaPP = guardarGrupoEquivalenciaPP;

window.renderEntregasPP = renderEntregasPP;
window.abrirArmadoPedidoPP = abrirArmadoPedidoPP;
window.marcarItemArmadoPP = marcarItemArmadoPP;
window.generarRemitoPP = generarRemitoPP;
window.marcarEnRepartoPP = marcarEnRepartoPP;
window.abrirEntregaFinalPP = abrirEntregaFinalPP;
window.confirmarEntregaFinalPP = confirmarEntregaFinalPP;

window.renderRecargosPP = renderRecargosPP;
window.abrirNuevoRecargoGeneralPP = abrirNuevoRecargoGeneralPP;
window.abrirCargarRecargoPropioPP = abrirCargarRecargoPropioPP;
window.guardarRecargoPP = guardarRecargoPP;
window.renderMargenPP = renderMargenPP;

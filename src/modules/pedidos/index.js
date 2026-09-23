// Módulo Pedidos de personal — Entry point
// Incluye la tab "Seguimiento" (antes el módulo aparte
// seguimiento_seleccion/, fusionado acá — ver seguimiento.js).

export {
  renderPedidos, filtrarPedidos, guardarPedido, verDetallePedido,
  resetModalPedido, abrirEdicionPedido, onChangeSupervisorPedido,
  onChangeServicioPedido, abrirNuevoPedido, cambiarTabPedidos, renderHistorialPedidos,
  renderPedidosScreen, tomarPedido, abrirModalCubierto, confirmarCubierto, abrirModalCancelar,
  confirmarCancelar, crearPedidoDesdePrepedido,
  lineasDePedido, expandirVacantesPedido, cantidadTotalPedido, puestoAgregadoPedido,
  agregarLineaPedido, quitarLineaPedido, setLineaPerfil, togLineaPerfilMulti, renderLineasPedido,
} from './pedidos.js';

export {
  renderSeguimientoSeleccion, filtrarSeguimientoSeleccion, abrirDetallePedidoSeguimiento,
  abrirCargaManualEtapaSeguimiento, guardarCargaManualEtapaSeguimiento, exportarSeguimientoCSV,
  abrirVincularCandidato, filtrarVincularCandidatos, elegirCandidatoVincular, irACrearCandidatoDesdeVincular,
  desvincularCandidatoPorId,
} from './seguimiento.js';

// ========== SCREEN CONFIG ==========

import { abrirNuevoPedido, renderPedidosScreen, renderPedidos } from './pedidos.js';

export const pedidosScreenConfig = {
  pedidos: {
    title: 'Pedidos de personal',
    btn: '+ Nuevo pedido',
    fn: () => abrirNuevoPedido(),
    render: () => renderPedidosScreen(),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  crearPedidoDesdePrepedido,
  filtrarPedidos, guardarPedido, verDetallePedido, abrirEdicionPedido,
  onChangeSupervisorPedido, onChangeServicioPedido, cambiarTabPedidos, renderHistorialPedidos,
  tomarPedido, abrirModalCubierto, confirmarCubierto, abrirModalCancelar, confirmarCancelar,
  agregarLineaPedido, quitarLineaPedido, setLineaPerfil, togLineaPerfilMulti, renderLineasPedido,
} from './pedidos.js';
import {
  renderSeguimientoSeleccion, filtrarSeguimientoSeleccion, abrirDetallePedidoSeguimiento,
  abrirCargaManualEtapaSeguimiento, guardarCargaManualEtapaSeguimiento, exportarSeguimientoCSV,
  abrirVincularCandidato, filtrarVincularCandidatos, elegirCandidatoVincular, irACrearCandidatoDesdeVincular,
  pedidoEstaCubierto, desvincularCandidatoPorId,
} from './seguimiento.js';

window.crearPedidoDesdePrepedido = crearPedidoDesdePrepedido;
window.pedidoEstaCubierto = pedidoEstaCubierto;
window.renderPedidosScreen = renderPedidosScreen;
window.renderPedidos = renderPedidos;
window.filtrarPedidos = filtrarPedidos;
window.guardarPedido = guardarPedido;
window.verDetallePedido = verDetallePedido;
window.abrirEdicionPedido = abrirEdicionPedido;
window.agregarLineaPedido = agregarLineaPedido;
window.quitarLineaPedido = quitarLineaPedido;
window.setLineaPerfil = setLineaPerfil;
window.togLineaPerfilMulti = togLineaPerfilMulti;
window.renderLineasPedido = renderLineasPedido;
window.onChangeSupervisorPedido = onChangeSupervisorPedido;
window.onChangeServicioPedido = onChangeServicioPedido;
window.abrirNuevoPedido = abrirNuevoPedido;
window.cambiarTabPedidos = cambiarTabPedidos;
window.renderHistorialPedidos = renderHistorialPedidos;
window.tomarPedido = tomarPedido;
window.abrirModalCubierto = abrirModalCubierto;
window.confirmarCubierto = confirmarCubierto;
window.abrirModalCancelar = abrirModalCancelar;
window.confirmarCancelar = confirmarCancelar;

window.renderSeguimientoSeleccion = renderSeguimientoSeleccion;
window.filtrarSeguimientoSeleccion = filtrarSeguimientoSeleccion;
window.abrirDetallePedidoSeguimiento = abrirDetallePedidoSeguimiento;
window.abrirCargaManualEtapaSeguimiento = abrirCargaManualEtapaSeguimiento;
window.guardarCargaManualEtapaSeguimiento = guardarCargaManualEtapaSeguimiento;
window.exportarSeguimientoCSV = exportarSeguimientoCSV;
window.abrirVincularCandidato = abrirVincularCandidato;
window.filtrarVincularCandidatos = filtrarVincularCandidatos;
window.elegirCandidatoVincular = elegirCandidatoVincular;
window.irACrearCandidatoDesdeVincular = irACrearCandidatoDesdeVincular;
window.desvincularCandidatoPorId = desvincularCandidatoPorId;

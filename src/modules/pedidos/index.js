// Módulo Pedidos de personal — Entry point

export {
  renderPedidos, filtrarPedidos, guardarPedido, verDetallePedido, renderPerfilInputs,
  renderHorarioPedido, resetModalPedido, abrirEdicionPedido, onChangeSupervisorPedido,
  onChangeServicioPedido, abrirNuevoPedido, cambiarTabPedidos, renderHistorialPedidos,
  tomarPedido, abrirModalCubierto, confirmarCubierto, abrirModalCancelar, confirmarCancelar,
} from './pedidos.js';

// ========== SCREEN CONFIG ==========

import { renderPedidos, abrirNuevoPedido } from './pedidos.js';

export const pedidosScreenConfig = {
  pedidos: {
    title: 'Pedidos de personal',
    btn: '+ Nuevo pedido',
    fn: () => abrirNuevoPedido(),
    render: () => renderPedidos(),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarPedidos, guardarPedido, verDetallePedido, renderPerfilInputs, abrirEdicionPedido,
  onChangeSupervisorPedido, onChangeServicioPedido, cambiarTabPedidos, renderHistorialPedidos,
  tomarPedido, abrirModalCubierto, confirmarCubierto, abrirModalCancelar, confirmarCancelar,
} from './pedidos.js';

window.renderPedidos = renderPedidos;
window.filtrarPedidos = filtrarPedidos;
window.guardarPedido = guardarPedido;
window.verDetallePedido = verDetallePedido;
window.abrirEdicionPedido = abrirEdicionPedido;
window.renderPerfilInputs = renderPerfilInputs;
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

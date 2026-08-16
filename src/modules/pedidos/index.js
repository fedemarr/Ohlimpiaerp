// Módulo Pedidos de personal — Entry point

export { renderPedidos, filtrarPedidos, guardarPedido, verDetallePedido, renderPerfilInputs, renderHorarioPedido, resetModalPedido, abrirEdicionPedido, onChangeSupervisorPedido, onChangeServicioPedido } from './pedidos.js';

// ========== SCREEN CONFIG ==========

import { renderPedidos, resetModalPedido } from './pedidos.js';
import { abrirModal } from '@shared/ui.js';

export const pedidosScreenConfig = {
  pedidos: {
    title: 'Pedidos de personal',
    btn: '+ Nuevo pedido',
    fn: () => { resetModalPedido(); abrirModal('modal-pedido'); },
    render: () => renderPedidos(),
  },
};

// ========== WINDOW BINDINGS ==========

import { filtrarPedidos, guardarPedido, verDetallePedido, renderPerfilInputs, abrirEdicionPedido, onChangeSupervisorPedido, onChangeServicioPedido } from './pedidos.js';

window.renderPedidos = renderPedidos;
window.filtrarPedidos = filtrarPedidos;
window.guardarPedido = guardarPedido;
window.verDetallePedido = verDetallePedido;
window.abrirEdicionPedido = abrirEdicionPedido;
window.renderPerfilInputs = renderPerfilInputs;
window.onChangeSupervisorPedido = onChangeSupervisorPedido;
window.onChangeServicioPedido = onChangeServicioPedido;

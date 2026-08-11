// Módulo Pedidos de personal — Entry point

export { renderPedidos, filtrarPedidos, guardarPedido, verDetallePedido, renderPerfilInputs } from './pedidos.js';

// ========== SCREEN CONFIG ==========

import { renderPedidos, renderPerfilInputs } from './pedidos.js';
import { abrirModal } from '@shared/ui.js';

export const pedidosScreenConfig = {
  pedidos: {
    title: 'Pedidos de personal',
    btn: '+ Nuevo pedido',
    fn: () => { renderPerfilInputs(); abrirModal('modal-pedido'); },
    render: () => renderPedidos(),
  },
};

// ========== WINDOW BINDINGS ==========

import { filtrarPedidos, guardarPedido, verDetallePedido } from './pedidos.js';

window.renderPedidos = renderPedidos;
window.filtrarPedidos = filtrarPedidos;
window.guardarPedido = guardarPedido;
window.verDetallePedido = verDetallePedido;
window.renderPerfilInputs = renderPerfilInputs;

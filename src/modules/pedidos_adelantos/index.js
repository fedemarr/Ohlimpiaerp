// Módulo Pedidos de Adelantos v1.1 (Operaciones — Supervisor) —
// Entry point. Reemplaza el ABM de legacy.js, donde ningún supervisor
// podía cargar un pedido a través de la UI (los modales que se abrían
// no existían en el DOM).

import { $ } from '@shared/helpers.js';

export {
  renderMisPedidos, filtrarMisPedidos, renderHistorialEquipo, filtrarHistorialEquipo,
  abrirNuevoPedidoAdelanto, cambiarTipoPedidoModal, seleccionarAsociadoPedido, chequearTopeModal,
  confirmarNuevoPedido, elevarPedidoPorId, abrirDetallePedidoAdelanto, cancelarPedidoPorId,
} from './pedidos.js';

// ========== TABS ==========

import { renderMisPedidos, renderHistorialEquipo } from './pedidos.js';

const RENDER_POR_TAB = { mios: renderMisPedidos, historial: renderHistorialEquipo };

export function tabPedAdl(tab, btn) {
  document.querySelectorAll('#screen-pedidos_adelantos .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-pedidos_adelantos .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-pedidos_adelantos .tab-btn[data-padl-tab="${tab}"]`)?.classList.add('active');
  $('padl-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

function renderPedidosAdelantosInicial() {
  tabPedAdl('mios');
}

// ========== SCREEN CONFIG ==========

import { abrirNuevoPedidoAdelanto } from './pedidos.js';

export const pedidosAdelantosScreenConfig = {
  pedidos_adelantos: {
    title: 'Pedidos de adelantos',
    btn: '+ Nuevo pedido',
    fn: () => window.abrirNuevoPedidoAdelanto(),
    render: renderPedidosAdelantosInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarMisPedidos, filtrarHistorialEquipo, cambiarTipoPedidoModal, seleccionarAsociadoPedido,
  chequearTopeModal, confirmarNuevoPedido, elevarPedidoPorId, abrirDetallePedidoAdelanto, cancelarPedidoPorId,
} from './pedidos.js';

window.tabPedAdl = tabPedAdl;
window.abrirNuevoPedidoAdelanto = abrirNuevoPedidoAdelanto;
window.filtrarMisPedidos = filtrarMisPedidos;
window.filtrarHistorialEquipo = filtrarHistorialEquipo;
window.cambiarTipoPedidoModal = cambiarTipoPedidoModal;
window.seleccionarAsociadoPedido = seleccionarAsociadoPedido;
window.chequearTopeModal = chequearTopeModal;
window.confirmarNuevoPedido = confirmarNuevoPedido;
window.elevarPedidoPorId = elevarPedidoPorId;
window.abrirDetallePedidoAdelanto = abrirDetallePedidoAdelanto;
window.cancelarPedidoPorId = cancelarPedidoPorId;

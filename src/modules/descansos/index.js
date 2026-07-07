// Módulo Descansos (sector operativo) — Entry point

import { $ } from '@shared/helpers.js';

export {
  renderPendientes, filtrarPendientes, poblarSelectsDescansosTab,
  renderHistorial, filtrarHistorial,
  abrirNuevoPedidoDescanso, abrirEditarPedido, seleccionarOperarioPedido, recalcularPedido,
  guardarBorradorPedido, elevarPedidoDesdeModal, elevarPedido,
  aprobarOperacionesPorId, aprobarRRHHPorId,
  abrirRechazoOperaciones, abrirRechazoRRHH,
  abrirAnularSupervisor, abrirAnularPostAprobacion,
  abrirDetalleDescanso,
} from './descansos.js';

export {
  mesAnteriorDesc, mesSiguienteDesc, poblarSelectsCalendarioDescansos,
  renderCalendarioDescansos, verHistorialDesdeCalendarioDescansos,
} from './calendario.js';

// ========== TABS ==========

import { renderPendientes, poblarSelectsDescansosTab, renderHistorial } from './descansos.js';
import { poblarSelectsCalendarioDescansos, renderCalendarioDescansos } from './calendario.js';

const RENDER_POR_TAB = {
  pendientes: renderPendientes,
  historial: renderHistorial,
  calendario: renderCalendarioDescansos,
};

export function cambiarTabDescansos(tab, btn) {
  document.querySelectorAll('#screen-descansos .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-descansos .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-descansos .tab-btn[data-desc-tab="${tab}"]`)?.classList.add('active');
  $('desc-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

// Punto de entrada de la pantalla — siempre entra por Pendientes, sin
// importar en qué pestaña se había quedado la última visita (mismo fix
// aplicado a Vacaciones y Reasignaciones en src/shared/nav.js).
function renderDescansosInicial() {
  poblarSelectsDescansosTab();
  poblarSelectsCalendarioDescansos();
  cambiarTabDescansos('pendientes');
}

// ========== SCREEN CONFIG ==========

export const descansosScreenConfig = {
  descansos: {
    title: 'Descansos',
    btn: '+ Nuevo pedido de descanso',
    fn: () => window.abrirNuevoPedidoDescanso(),
    render: renderDescansosInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarPendientes, abrirNuevoPedidoDescanso, abrirEditarPedido, seleccionarOperarioPedido, recalcularPedido,
  guardarBorradorPedido, elevarPedidoDesdeModal, elevarPedido,
  aprobarOperacionesPorId, aprobarRRHHPorId,
  abrirRechazoOperaciones, abrirRechazoRRHH,
  abrirAnularSupervisor, abrirAnularPostAprobacion,
  abrirDetalleDescanso, filtrarHistorial,
} from './descansos.js';
import { mesAnteriorDesc, mesSiguienteDesc, verHistorialDesdeCalendarioDescansos } from './calendario.js';

// OJO: nombres con sufijo "Descansos" para no colisionar con
// window.renderPendientes/filtrarPendientes/renderHistorial/filtrarHistorial
// que ya usa el módulo Vacaciones (mismo bug que tumbó la app la sesión
// pasada — dos módulos bindeando la misma clave global, gana el que
// carga último).
window.cambiarTabDescansos = cambiarTabDescansos;
window.renderPendientesDescansos = renderPendientes;
window.filtrarPendientesDescansos = filtrarPendientes;
window.abrirNuevoPedidoDescanso = abrirNuevoPedidoDescanso;
window.abrirEditarPedido = abrirEditarPedido;
window.seleccionarOperarioPedido = seleccionarOperarioPedido;
window.recalcularPedido = recalcularPedido;
window.guardarBorradorPedido = guardarBorradorPedido;
window.elevarPedidoDesdeModal = elevarPedidoDesdeModal;
window.elevarPedido = elevarPedido;
window.aprobarOperacionesPorId = aprobarOperacionesPorId;
window.aprobarRRHHPorId = aprobarRRHHPorId;
window.abrirRechazoOperaciones = abrirRechazoOperaciones;
window.abrirRechazoRRHH = abrirRechazoRRHH;
window.abrirAnularSupervisor = abrirAnularSupervisor;
window.abrirAnularPostAprobacion = abrirAnularPostAprobacion;
window.abrirDetalleDescanso = abrirDetalleDescanso;
window.filtrarHistorialDescansos = filtrarHistorial;
window.renderHistorialDescansos = renderHistorial;
window.mesAnteriorDesc = mesAnteriorDesc;
window.mesSiguienteDesc = mesSiguienteDesc;
window.renderCalendarioDescansos = renderCalendarioDescansos;
window.verHistorialDesdeCalendarioDescansos = verHistorialDesdeCalendarioDescansos;

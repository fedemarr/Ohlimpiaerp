// Módulo Seguimiento de selección — Entry point

export {
  renderSeguimientoSeleccion, filtrarSeguimientoSeleccion, abrirDetallePedidoSeguimiento,
  abrirCargaManualEtapaSeguimiento, guardarCargaManualEtapaSeguimiento, exportarSeguimientoCSV,
} from './seguimiento_seleccion.js';

// ========== SCREEN CONFIG ==========

import { renderSeguimientoSeleccion } from './seguimiento_seleccion.js';

// Sin botón propio de "+ Nuevo pedido" — el mockup lo deja como atajo al
// módulo real (Pedidos de personal); acá se linkea a esa pantalla en vez
// de duplicar el alta, la vista es de solo lectura.
export const seguimientoSeleccionScreenConfig = {
  seguimiento_seleccion: {
    title: 'Seguimiento de selección',
    btn: '+ Nuevo pedido',
    fn: () => { if (window.navTo) window.navTo('pedidos'); if (window.abrirNuevoPedido) window.abrirNuevoPedido(); },
    render: () => renderSeguimientoSeleccion(),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarSeguimientoSeleccion, abrirDetallePedidoSeguimiento,
  abrirCargaManualEtapaSeguimiento, guardarCargaManualEtapaSeguimiento, exportarSeguimientoCSV,
} from './seguimiento_seleccion.js';

window.renderSeguimientoSeleccion = renderSeguimientoSeleccion;
window.filtrarSeguimientoSeleccion = filtrarSeguimientoSeleccion;
window.abrirDetallePedidoSeguimiento = abrirDetallePedidoSeguimiento;
window.abrirCargaManualEtapaSeguimiento = abrirCargaManualEtapaSeguimiento;
window.guardarCargaManualEtapaSeguimiento = guardarCargaManualEtapaSeguimiento;
window.exportarSeguimientoCSV = exportarSeguimientoCSV;

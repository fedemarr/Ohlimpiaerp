// Módulo Descuentos por asociado — Entry point.

export {
  getConceptoById, getDescById,
  filtrarDescuentos, renderDescuentos,
  abrirNuevoDescuento, abrirEditarDescuento, recalcularMontoCuota, guardarDescuento,
  marcarCuotaCobrada, anularDescuento,
  renderConceptos, abrirNuevoConcepto, abrirEditarConcepto, guardarConcepto, toggleConceptoActivo,
  cambiarTabDescuentos,
} from './descuentos.js';

// ========== SCREEN CONFIG ==========

export const descuentosScreenConfig = {
  descuentos: {
    title: 'Descuentos por asociado',
    btn: '+ Nuevo descuento',
    fn: () => window.abrirNuevoDescuento(),
    render: () => window.cambiarTabDescuentos('descuentos'),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarDescuentos, renderDescuentos,
  abrirNuevoDescuento, abrirEditarDescuento, recalcularMontoCuota, guardarDescuento,
  marcarCuotaCobrada, anularDescuento,
  renderConceptos, abrirNuevoConcepto, abrirEditarConcepto, guardarConcepto, toggleConceptoActivo,
  cambiarTabDescuentos,
} from './descuentos.js';

window.filtrarDescuentos = filtrarDescuentos;
window.renderDescuentos = renderDescuentos;
window.abrirNuevoDescuento = abrirNuevoDescuento;
window.abrirEditarDescuento = abrirEditarDescuento;
window.recalcularMontoCuota = recalcularMontoCuota;
window.guardarDescuento = guardarDescuento;
window.marcarCuotaCobrada = marcarCuotaCobrada;
window.anularDescuento = anularDescuento;
window.renderConceptos = renderConceptos;
window.abrirNuevoConcepto = abrirNuevoConcepto;
window.abrirEditarConcepto = abrirEditarConcepto;
window.guardarConcepto = guardarConcepto;
window.toggleConceptoActivo = toggleConceptoActivo;
window.cambiarTabDescuentos = cambiarTabDescuentos;

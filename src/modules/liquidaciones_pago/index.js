// Liquidaciones — Pago de retiros. Entry point. Ver pago.js (tabs +
// confirmar tanda + lotes) y bancos.js (formato de archivo por banco).
// No es un screenConfig propio: es un tab MÁS de screen-liquidaciones (ver
// index.html), integrado desde legacy.js/renderLiquidaciones().

export {
  renderPagoRetiros, tabPago, tabLqs,
  renderPagoOperarios, renderPagoAdministrativos, renderLotesPago,
  tildarPago, marcarTodosPago, abrirConfirmarTanda, confirmarTandaPago,
  descargarArchivoLote, descargarExcepcionesLote,
} from './pago.js';

export {
  formatImporteBBVA, formatIdEmpleadoBBVA, formatCuil,
  filasHojaBBVA, bloquesHojaBBVA, deducirCuentaMacro, filasHojaMacro, clasificarPorBanco,
} from './bancos.js';

import {
  renderPagoRetiros, tabPago, tabLqs,
  tildarPago, marcarTodosPago, abrirConfirmarTanda, confirmarTandaPago,
  descargarArchivoLote, descargarExcepcionesLote,
} from './pago.js';

window.renderPagoRetiros = renderPagoRetiros;
window.tabPago = tabPago;
window.tabLqs = tabLqs;
window.tildarPago = tildarPago;
window.marcarTodosPago = marcarTodosPago;
window.abrirConfirmarTanda = abrirConfirmarTanda;
window.confirmarTandaPago = confirmarTandaPago;
window.descargarArchivoLote = descargarArchivoLote;
window.descargarExcepcionesLote = descargarExcepcionesLote;

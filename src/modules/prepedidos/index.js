// 📥 Prepedidos — window bindings (la bandeja vive como tab dentro de
// Pedidos de personal, ver pedidos.js; el módulo Servicios está en legacy.js).
import {
  renderPrepedidos, sembrarPrepedido, sincronizarPrepedidos, cubrirVacanteConInterno, incorporarVacante,
  chipDotacionObjetivo, avisoDotacionIncompleta, chipOrigenPrepedido, actualizarBadgePrepedidos,
} from './prepedidos.js';

export * from './prepedidos.js';

window.renderPrepedidos = renderPrepedidos;
window.sembrarPrepedido = sembrarPrepedido;
window.sincronizarPrepedidos = sincronizarPrepedidos;
window.cubrirVacanteConInterno = cubrirVacanteConInterno;
window.incorporarVacante = incorporarVacante;
window.chipDotacionObjetivo = chipDotacionObjetivo;
window.avisoDotacionIncompleta = avisoDotacionIncompleta;
window.chipOrigenPrepedido = chipOrigenPrepedido;
window.actualizarBadgePrepedidos = actualizarBadgePrepedidos;

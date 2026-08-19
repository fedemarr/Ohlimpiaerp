// Módulo Máquinas — entry point (v096)
// Re-exports, screenConfig, window bindings.

export {
  renderMaquinas, filtrarMaquinas,
  cambiarTabMaquinas, verMaquina, cambiarTabMaqFicha,
  abrirModalNuevaMaquina, guardarMaquina, editarMaquina, bajaMaquina, moverMaquina,
  abrirNuevoTicket, guardarNuevoTicket, verTicket, avanzarTicket, cerrarTicket,
} from './maquinas.js';

import {
  renderMaquinas, filtrarMaquinas,
  cambiarTabMaquinas, verMaquina, cambiarTabMaqFicha,
  abrirModalNuevaMaquina, guardarMaquina, editarMaquina, bajaMaquina, moverMaquina,
  abrirNuevoTicket, guardarNuevoTicket, verTicket, avanzarTicket, cerrarTicket,
} from './maquinas.js';

export const maquinasScreenConfig = {
  maquinas: {
    title: 'Máquinas',
    btn: '+ Nueva máquina',
    fn: () => abrirModalNuevaMaquina(),
    render: () => renderMaquinas(),
  },
};

window.renderMaquinas = renderMaquinas;
window.filtrarMaquinas = filtrarMaquinas;
window.cambiarTabMaquinas = cambiarTabMaquinas;
window.verMaquina = verMaquina;
window.cambiarTabMaqFicha = cambiarTabMaqFicha;
window.abrirModalNuevaMaquina = abrirModalNuevaMaquina;
window.guardarMaquina = guardarMaquina;
window.editarMaquina = editarMaquina;
window.bajaMaquina = bajaMaquina;
window.moverMaquina = moverMaquina;
window.abrirNuevoTicket = abrirNuevoTicket;
window.guardarNuevoTicket = guardarNuevoTicket;
window.verTicket = verTicket;
window.avanzarTicket = avanzarTicket;
window.cerrarTicket = cerrarTicket;

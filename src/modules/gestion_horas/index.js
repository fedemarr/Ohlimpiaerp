// Módulo Gestión de horas — Entry point

export {
  renderGestionHoras, toggleDetalleHoras, abrirVigenciaHoras,
  agregarPuestoHoras, quitarPuestoHoras, previewVigenciaHoras, guardarVigenciaHoras,
  sembrarVigenciaHorasDesdeAlta, sincronizarVigenciasHoras,
  vigenciaParaMes, horasServicioMes, puedeEditarHoras,
} from './gestion_horas.js';

// ========== SCREEN CONFIG ==========

import { renderGestionHoras } from './gestion_horas.js';

export const gestionHorasScreenConfig = {
  gestion_horas: {
    title: 'Gestión de horas',
    btn: null,
    fn: null,
    render: () => renderGestionHoras(),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  toggleDetalleHoras, abrirVigenciaHoras, agregarPuestoHoras, quitarPuestoHoras,
  previewVigenciaHoras, guardarVigenciaHoras, sembrarVigenciaHorasDesdeAlta,
} from './gestion_horas.js';

window.renderGestionHoras = renderGestionHoras;
window.toggleDetalleHoras = toggleDetalleHoras;
window.abrirVigenciaHoras = abrirVigenciaHoras;
window.agregarPuestoHoras = agregarPuestoHoras;
window.quitarPuestoHoras = quitarPuestoHoras;
window.previewVigenciaHoras = previewVigenciaHoras;
window.guardarVigenciaHoras = guardarVigenciaHoras;
// El alta de servicio (legacy.js, todavía no migrado) siembra la regla
// inicial llamando a esto — mismo patrón que window.sembrarPrepedido.
window.sembrarVigenciaHorasDesdeAlta = sembrarVigenciaHorasDesdeAlta;

export {
  renderServiciosSupervisor, filtrarServiciosSupervisor,
  abrirNuevoServicioSupervisor, editarServicioSupervisor, guardarServicioSupervisor, eliminarServicioSupervisor,
  sincronizarServiciosSupervisor, getSupervisorDeCodigo, serviciosDeSupervisor,
  exportarServiciosSupervisorCSV,
  abrirImportadorServiciosSupervisor, seleccionarArchivoImportacionSS, confirmarImportacionServiciosSupervisor,
} from './servicios_supervisor.js';

import {
  renderServiciosSupervisor, filtrarServiciosSupervisor,
  abrirNuevoServicioSupervisor, editarServicioSupervisor, guardarServicioSupervisor, eliminarServicioSupervisor,
  exportarServiciosSupervisorCSV,
  abrirImportadorServiciosSupervisor, seleccionarArchivoImportacionSS, confirmarImportacionServiciosSupervisor,
} from './servicios_supervisor.js';

window.renderServiciosSupervisor = renderServiciosSupervisor;
window.filtrarServiciosSupervisor = filtrarServiciosSupervisor;
window.abrirNuevoServicioSupervisor = abrirNuevoServicioSupervisor;
window.editarServicioSupervisor = editarServicioSupervisor;
window.guardarServicioSupervisor = guardarServicioSupervisor;
window.eliminarServicioSupervisor = eliminarServicioSupervisor;
window.exportarServiciosSupervisorCSV = exportarServiciosSupervisorCSV;
window.abrirImportadorServiciosSupervisor = abrirImportadorServiciosSupervisor;
window.seleccionarArchivoImportacionSS = seleccionarArchivoImportacionSS;
window.confirmarImportacionServiciosSupervisor = confirmarImportacionServiciosSupervisor;

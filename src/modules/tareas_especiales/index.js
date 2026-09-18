// Tareas Especiales — Entry point (ticket "Módulo Tareas Especiales"
// 18/09). Ver consultas.js (nómina por padrón + cálculo del convenio),
// config.js (parámetro 168hs versionado) y tareas_especiales.js
// (render — pura lectura en vivo de las grillas).

export { getTareasEspecialesActivos, esTareaEspecial, complementosTareasEspecialesDelMes } from './consultas.js';
export { obtenerConvenioVigente, historialConvenio } from './config.js';
export {
  renderTareasEspeciales, filtrarTareasEspeciales, tabTareasEspeciales,
  toggleTareaEspecialDetalle, irAGrillaServicioTE, verPlanillaServicioTE,
  abrirConfigConvenioTE, cambiarTipoConvenioTE, confirmarConvenioTE,
} from './tareas_especiales.js';

import {
  renderTareasEspeciales, filtrarTareasEspeciales, tabTareasEspeciales,
  toggleTareaEspecialDetalle, irAGrillaServicioTE, verPlanillaServicioTE,
  abrirConfigConvenioTE, cambiarTipoConvenioTE, confirmarConvenioTE,
} from './tareas_especiales.js';
import { complementosTareasEspecialesDelMes } from './consultas.js';

export const tareasEspecialesScreenConfig = {
  tareas_especiales: {
    title: 'Tareas Especiales',
    btn: '',
    fn: null,
    render: renderTareasEspeciales,
  },
};

window.renderTareasEspeciales = renderTareasEspeciales;
window.filtrarTareasEspeciales = filtrarTareasEspeciales;
window.tabTareasEspeciales = tabTareasEspeciales;
window.toggleTareaEspecialDetalle = toggleTareaEspecialDetalle;
window.irAGrillaServicioTE = irAGrillaServicioTE;
window.verPlanillaServicioTE = verPlanillaServicioTE;
window.abrirConfigConvenioTE = abrirConfigConvenioTE;
window.cambiarTipoConvenioTE = cambiarTipoConvenioTE;
window.confirmarConvenioTE = confirmarConvenioTE;
// Expuesta para legacy.js (renderLiquidaciones/_getFilasConsolidadas/
// verDetalleLqs) y para resumen_horas.js — ninguno de los dos puede
// hacer `import` estático de un módulo ES desde código que se carga
// como import() dinámico (legacy.js) o para no acoplar el import
// directo entre módulos hermanos sin necesidad.
window.complementosTareasEspecialesDelMes = complementosTareasEspecialesDelMes;

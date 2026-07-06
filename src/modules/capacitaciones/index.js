// Módulo Capacitaciones — Entry point

export {
  tabCap,
  renderCapacitaciones, filtrarCapacitaciones,
  poblarSelectsCapacitaciones, autocompletarCap,
  abrirNuevaCapacitacion, abrirEditarCapacitacionPorId, guardarCapacitacion,
  anularCapacitacionPorId,
  abrirDictarCapacitacionPorId, actualizarPuntajeDictarCap,
  subirAdjuntoDictarCap, verAdjuntoDictarCap, guardarDictadoCap,
  analizarCapacitacionesIA,
} from './capacitaciones.js';

export {
  renderMaterialesCap, filtrarMaterialesCap, poblarSelectsMateriales,
  toggleOrigenMaterial, abrirNuevoMaterial, abrirEditarMaterialPorId,
  guardarMaterial, eliminarMaterialPorId, abrirMaterialPorId,
} from './materiales.js';

export {
  poblarFiltrosStats, filtrarStats, renderStatsCapacitaciones, exportarStatsCsv,
} from './stats.js';

export {
  cambiarMesCap, renderCalendarioCap, toggleGeneradorPlan, poblarSelectMesObjetivo,
  generarPlanMensual, confirmarPlanMensual, coordinarWhatsappCap,
} from './calendario.js';

// ========== SCREEN CONFIG ==========

import { tabCap, poblarSelectsCapacitaciones, abrirNuevaCapacitacion } from './capacitaciones.js';
import { poblarSelectsMateriales } from './materiales.js';

export const capacitacionesScreenConfig = {
  capacitaciones: {
    title: 'Capacitaciones',
    btn: '+ Registrar capacitación',
    fn: () => abrirNuevaCapacitacion(),
    render: () => { poblarSelectsCapacitaciones(); poblarSelectsMateriales(); tabCap('registro'); },
  },
};

// ========== WINDOW BINDINGS ==========

import {
  renderCapacitaciones, filtrarCapacitaciones, autocompletarCap,
  abrirEditarCapacitacionPorId, guardarCapacitacion, anularCapacitacionPorId,
  abrirDictarCapacitacionPorId, actualizarPuntajeDictarCap,
  subirAdjuntoDictarCap, verAdjuntoDictarCap, guardarDictadoCap,
  analizarCapacitacionesIA,
} from './capacitaciones.js';

import {
  renderMaterialesCap, filtrarMaterialesCap,
  toggleOrigenMaterial, abrirNuevoMaterial, abrirEditarMaterialPorId,
  guardarMaterial, eliminarMaterialPorId, abrirMaterialPorId,
} from './materiales.js';

import {
  poblarFiltrosStats, filtrarStats, renderStatsCapacitaciones, exportarStatsCsv,
} from './stats.js';

import {
  cambiarMesCap, renderCalendarioCap, toggleGeneradorPlan, poblarSelectMesObjetivo,
  generarPlanMensual, confirmarPlanMensual, coordinarWhatsappCap,
} from './calendario.js';

window.tabCap = tabCap;
window.renderCapacitaciones = renderCapacitaciones;
window.filtrarCapacitaciones = filtrarCapacitaciones;
window.poblarSelectsCapacitaciones = poblarSelectsCapacitaciones;
window.autocompletarCap = autocompletarCap;
window.abrirNuevaCapacitacion = abrirNuevaCapacitacion;
window.abrirEditarCapacitacionPorId = abrirEditarCapacitacionPorId;
window.guardarCapacitacion = guardarCapacitacion;
window.anularCapacitacionPorId = anularCapacitacionPorId;
window.abrirDictarCapacitacionPorId = abrirDictarCapacitacionPorId;
window.actualizarPuntajeDictarCap = actualizarPuntajeDictarCap;
window.subirAdjuntoDictarCap = subirAdjuntoDictarCap;
window.verAdjuntoDictarCap = verAdjuntoDictarCap;
window.guardarDictadoCap = guardarDictadoCap;
window.analizarCapacitacionesIA = analizarCapacitacionesIA;

window.renderMaterialesCap = renderMaterialesCap;
window.filtrarMaterialesCap = filtrarMaterialesCap;
window.toggleOrigenMaterial = toggleOrigenMaterial;
window.abrirNuevoMaterial = abrirNuevoMaterial;
window.abrirEditarMaterialPorId = abrirEditarMaterialPorId;
window.guardarMaterial = guardarMaterial;
window.eliminarMaterialPorId = eliminarMaterialPorId;
window.abrirMaterialPorId = abrirMaterialPorId;

window.poblarFiltrosStats = poblarFiltrosStats;
window.filtrarStats = filtrarStats;
window.renderStatsCapacitaciones = renderStatsCapacitaciones;
window.exportarStatsCsv = exportarStatsCsv;

window.cambiarMesCap = cambiarMesCap;
window.renderCalendarioCap = renderCalendarioCap;
window.toggleGeneradorPlan = toggleGeneradorPlan;
window.poblarSelectMesObjetivo = poblarSelectMesObjetivo;
window.generarPlanMensual = generarPlanMensual;
window.confirmarPlanMensual = confirmarPlanMensual;
window.coordinarWhatsappCap = coordinarWhatsappCap;

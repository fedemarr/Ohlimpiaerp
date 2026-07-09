// Módulo Competencia Anual v2 — Entry point (reemplaza la versión
// anterior, que calculaba todo al vuelo sin ledger de movimientos).

import { $ } from '@shared/helpers.js';

export {
  tabComp, renderCompetencia, renderTablaIndividual, renderTablaEquipos, renderTablaSupervisores,
  poblarFiltrosCompetencia, poblarAniosCompetencia, filtrarCompInd, filtrarCompEq, verRankingPublico,
} from './competencia.js';

export {
  renderReglas, activarDesactivarReglaPorId, anularReglaPorId,
  abrirCorregirVersionRegla, abrirNuevaVigenciaRegla, guardarVersionReglaDesdeModal,
  abrirHistorialVersionesRegla, abrirNuevaRegla, guardarReglaNueva,
} from './reglas.js';

export {
  calcularNoParticipantes, chequearRiesgoYNotificarSupervisores,
  renderTablaNoParticipan, filtrarCompNop, riesgoAltoDelAnio,
} from './no_participan.js';

export {
  abrirNotificarAsociado, abrirNotificarEquipoServicio, abrirNotificarGrupoSupervisor,
  abrirNotificarMasivoRiesgoAlto, confirmarNotificacionPendiente,
} from './notificaciones.js';

export {
  renderHistorialMovimientos, filtrarHistorialMovimientos, poblarFiltroReglasHistorial,
  abrirRevertirMovimiento, abrirDetalleEvento, abrirRevertirEventoDesdeDetalle,
  abrirCargaManual, recalcularPreviewCargaManual, confirmarCargaManual,
} from './historial.js';

export {
  renderPremiosCierre, abrirCerrarAnio, confirmarCerrarAnio, cerrarAnioCompetencia,
  abrirDetallePremiosAnio, abrirMarcarPremioEntregado,
} from './premios.js';

export { backfill2026 } from './backfill.js';

// ========== SCREEN CONFIG ==========

import { tabComp, poblarAniosCompetencia } from './competencia.js';
import { chequearRiesgoYNotificarSupervisores } from './no_participan.js';

// Siempre entra por Individual, y de paso corre el chequeo de riesgo
// de "No participan" (notifica a supervisores la primera vez que
// alguien de su equipo pasa a Alto/Muy alto — sin cron real, mismo
// patrón que las alertas de 24hs/15 días de Uniformes).
async function renderCompetenciaInicial() {
  poblarAniosCompetencia();
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  await chequearRiesgoYNotificarSupervisores(anio);
  tabComp('individual');
}

export const competenciaScreenConfig = {
  competencia: {
    title: 'Competencia Anual',
    btn: '',
    fn: null,
    render: renderCompetenciaInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  renderCompetencia, renderTablaIndividual, renderTablaEquipos, renderTablaSupervisores,
  poblarFiltrosCompetencia, filtrarCompInd, filtrarCompEq, verRankingPublico,
} from './competencia.js';
import {
  renderReglas, activarDesactivarReglaPorId, anularReglaPorId,
  abrirCorregirVersionRegla, abrirNuevaVigenciaRegla, guardarVersionReglaDesdeModal,
  abrirHistorialVersionesRegla, abrirNuevaRegla, guardarReglaNueva,
} from './reglas.js';
import { renderTablaNoParticipan, filtrarCompNop } from './no_participan.js';
import {
  abrirNotificarAsociado, abrirNotificarEquipoServicio, abrirNotificarGrupoSupervisor,
  abrirNotificarMasivoRiesgoAlto, confirmarNotificacionPendiente,
} from './notificaciones.js';
import {
  renderHistorialMovimientos, filtrarHistorialMovimientos, poblarFiltroReglasHistorial,
  abrirRevertirMovimiento, abrirDetalleEvento, abrirRevertirEventoDesdeDetalle,
  abrirCargaManual, recalcularPreviewCargaManual, confirmarCargaManual,
} from './historial.js';
import {
  renderPremiosCierre, abrirCerrarAnio, confirmarCerrarAnio,
  abrirDetallePremiosAnio, abrirMarcarPremioEntregado,
} from './premios.js';
import { backfill2026 } from './backfill.js';

window.tabComp = tabComp;
window.renderCompetencia = renderCompetencia;
window.renderTablaIndividual = renderTablaIndividual;
window.renderTablaEquipos = renderTablaEquipos;
window.renderTablaSupervisores = renderTablaSupervisores;
window.poblarFiltrosCompetencia = poblarFiltrosCompetencia;
window.poblarAniosCompetencia = poblarAniosCompetencia;
window.filtrarCompInd = filtrarCompInd;
window.filtrarCompEq = filtrarCompEq;
window.verRankingPublico = verRankingPublico;

window.renderReglas = renderReglas;
window.activarDesactivarReglaPorId = activarDesactivarReglaPorId;
window.anularReglaPorId = anularReglaPorId;
window.abrirCorregirVersionRegla = abrirCorregirVersionRegla;
window.abrirNuevaVigenciaRegla = abrirNuevaVigenciaRegla;
window.guardarVersionReglaDesdeModal = guardarVersionReglaDesdeModal;
window.abrirHistorialVersionesRegla = abrirHistorialVersionesRegla;
window.abrirNuevaRegla = abrirNuevaRegla;
window.guardarReglaNueva = guardarReglaNueva;

window.renderTablaNoParticipan = renderTablaNoParticipan;
window.filtrarCompNop = filtrarCompNop;

window.abrirNotificarAsociado = abrirNotificarAsociado;
window.abrirNotificarEquipoServicio = abrirNotificarEquipoServicio;
window.abrirNotificarGrupoSupervisor = abrirNotificarGrupoSupervisor;
window.abrirNotificarMasivoRiesgoAlto = abrirNotificarMasivoRiesgoAlto;
window.confirmarNotificacionPendiente = confirmarNotificacionPendiente;

window.renderHistorialMovimientos = renderHistorialMovimientos;
window.filtrarHistorialMovimientos = filtrarHistorialMovimientos;
window.poblarFiltroReglasHistorial = poblarFiltroReglasHistorial;
window.abrirRevertirMovimiento = abrirRevertirMovimiento;
window.abrirDetalleEvento = abrirDetalleEvento;
window.abrirRevertirEventoDesdeDetalle = abrirRevertirEventoDesdeDetalle;
window.abrirCargaManual = abrirCargaManual;
window.recalcularPreviewCargaManual = recalcularPreviewCargaManual;
window.confirmarCargaManual = confirmarCargaManual;

window.renderPremiosCierre = renderPremiosCierre;
window.abrirCerrarAnio = abrirCerrarAnio;
window.confirmarCerrarAnio = confirmarCerrarAnio;
window.abrirDetallePremiosAnio = abrirDetallePremiosAnio;
window.abrirMarcarPremioEntregado = abrirMarcarPremioEntregado;

window.backfill2026 = backfill2026;

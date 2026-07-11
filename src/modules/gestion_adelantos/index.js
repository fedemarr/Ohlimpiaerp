// Módulo Gestión de Adelantos v1.1 (Finanzas — RRHH + Finanzas) —
// Entry point. Comparte datos con Pedidos de Adelantos (Operaciones).
// Reemplaza el ABM de legacy.js, donde la aprobación item-por-item
// era código muerto (sin ningún onclick que la disparara) y casi
// ninguna transición de estado persistía.

import { $ } from '@shared/helpers.js';
import { esRRHHoAdmin, esFinanzasOAdmin } from '../adelantos_prestamos_shared/permisos.js';

export {
  renderRevisionRRHH, abrirRevisionRRHH, aprobarRevisionRRHH, rechazarRevisionRRHH,
} from './revision.js';

export {
  renderDeposito, pagarIndividual, pagarSeleccionadosDeposito,
  abrirRechazarDeposito, confirmarRechazoDeposito,
} from './deposito.js';

export { renderHistorialGestion, filtrarHistorialGestion, exportarHistorialGestionExcel } from './historico.js';

export {
  renderConfiguracionAdelantos, cambiarTipoCambioTope, abrirModificarTope, confirmarModificarTope,
  abrirHistorialTope, abrirModificarMaxCuotas, abrirModificarUmbral, confirmarConfigSimple,
} from './configuracion.js';

// ========== TABS (con gateo por rol) ==========

import { renderRevisionRRHH } from './revision.js';
import { renderDeposito } from './deposito.js';
import { renderHistorialGestion } from './historico.js';
import { renderConfiguracionAdelantos } from './configuracion.js';

const RENDER_POR_TAB = {
  rrhh: renderRevisionRRHH, deposito: renderDeposito,
  historial: renderHistorialGestion, configuracion: renderConfiguracionAdelantos,
};

function aplicarPermisosTabs() {
  const btnRrhh = document.querySelector('#screen-gestion_adelantos .tab-btn[data-gadl-tab="rrhh"]');
  const btnDeposito = document.querySelector('#screen-gestion_adelantos .tab-btn[data-gadl-tab="deposito"]');
  const btnConfig = document.querySelector('#screen-gestion_adelantos .tab-btn[data-gadl-tab="configuracion"]');
  if (btnRrhh) btnRrhh.style.display = esRRHHoAdmin() ? '' : 'none';
  if (btnDeposito) btnDeposito.style.display = esFinanzasOAdmin() ? '' : 'none';
  if (btnConfig) btnConfig.style.display = esRRHHoAdmin() ? '' : 'none';
}

export function tabGestAdl(tab, btn) {
  document.querySelectorAll('#screen-gestion_adelantos .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-gestion_adelantos .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-gestion_adelantos .tab-btn[data-gadl-tab="${tab}"]`)?.classList.add('active');
  $('gadl-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

function renderGestionAdelantosInicial() {
  aplicarPermisosTabs();
  tabGestAdl(esRRHHoAdmin() ? 'rrhh' : 'deposito');
}

// ========== SCREEN CONFIG ==========

export const gestionAdelantosScreenConfig = {
  gestion_adelantos: {
    title: 'Gestión de adelantos',
    btn: '',
    fn: null,
    render: renderGestionAdelantosInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import { abrirRevisionRRHH, aprobarRevisionRRHH, rechazarRevisionRRHH } from './revision.js';
import { pagarIndividual, pagarSeleccionadosDeposito, abrirRechazarDeposito, confirmarRechazoDeposito } from './deposito.js';
import { filtrarHistorialGestion, exportarHistorialGestionExcel } from './historico.js';
import {
  cambiarTipoCambioTope, abrirModificarTope, confirmarModificarTope, abrirHistorialTope,
  abrirModificarMaxCuotas, abrirModificarUmbral, confirmarConfigSimple,
} from './configuracion.js';

window.tabGestAdl = tabGestAdl;
window.abrirRevisionRRHH = abrirRevisionRRHH;
window.aprobarRevisionRRHH = aprobarRevisionRRHH;
window.rechazarRevisionRRHH = rechazarRevisionRRHH;

window.pagarIndividual = pagarIndividual;
window.pagarSeleccionadosDeposito = pagarSeleccionadosDeposito;
window.abrirRechazarDeposito = abrirRechazarDeposito;
window.confirmarRechazoDeposito = confirmarRechazoDeposito;

window.filtrarHistorialGestion = filtrarHistorialGestion;
window.exportarHistorialGestionExcel = exportarHistorialGestionExcel;

window.cambiarTipoCambioTope = cambiarTipoCambioTope;
window.abrirModificarTope = abrirModificarTope;
window.confirmarModificarTope = confirmarModificarTope;
window.abrirHistorialTope = abrirHistorialTope;
window.abrirModificarMaxCuotas = abrirModificarMaxCuotas;
window.abrirModificarUmbral = abrirModificarUmbral;
window.confirmarConfigSimple = confirmarConfigSimple;

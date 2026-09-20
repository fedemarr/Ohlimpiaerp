// Gestión de Adelantos — Tab "💳 Préstamos" (PRESTAMOS_para_Fede.md §4-§7
// + mockup_prestamos_2.html): el STOCK de deudas vivas, no el flujo del
// pedido. Cartera + ficha con plan de cuotas EDITABLE solo por Finanzas
// (postergar / redistribuir con la invariante "suma de pendientes =
// saldo"), motivo obligatorio, historial de reprogramaciones y movimientos.
// El débito de cada cuota lo hace Liquidaciones al confirmar el pago del
// retiro (flujo.js → debitarCuotasPrestamo).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { esFinanzasOAdmin } from '../adelantos_prestamos_shared/permisos.js';
import { reprogramarPlanPrestamo } from '../adelantos_prestamos_shared/flujo.js';
import {
  debitadoDelPlan, saldoDelPrestamo, pendientesDelPlan, diferenciaDePlan, postergarCuota,
} from '../adelantos_prestamos_shared/plan_prestamo.js';

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
function _fmt(v) { return '$' + Math.round(Number(v) || 0).toLocaleString('es-AR'); }
function _periodoTxt(p) {
  if (!p) return '—';
  const [y, m] = String(p).split('-');
  return `${MESES[Number(m) - 1] || m} ${y}`;
}
function _mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function _parseMonto(v) {
  const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Cartera = préstamos ya aprobados (APROBADO o DEPOSITADO) con plan.
function _cartera() {
  return (DB.prestamos || []).filter(p => !p.anulado && ['Aprobada RRHH', 'Aprobada'].includes(p.estado) && Array.isArray(p.planCuotas) && p.planCuotas.length);
}
function _proxima(p) { return p.planCuotas.find(c => c.estado === 'Pendiente') || null; }
function _cancelado(p) { return p.planCuotas.every(c => c.estado === 'Debitada' || c.estado === 'Postergada'); }

export function renderPrestamosCartera() {
  const tbody = $('tbody-pr-cartera');
  if (!tbody) return;
  const lista = _cartera();
  const mes = _mesActual();
  let saldoTot = 0, mesTot = 0, activos = 0;
  tbody.innerHTML = lista.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin préstamos aprobados todavía</td></tr>'
    : lista.map(p => {
      const saldo = saldoDelPrestamo(p), deb = p.planCuotas.filter(c => c.estado === 'Debitada').length;
      const totC = p.planCuotas.filter(c => c.estado !== 'Postergada').length;
      const canc = _cancelado(p);
      if (!canc) { saldoTot += saldo; activos++; }
      // "Se debita este mes": la cuota que le toca a cada préstamo DEPOSITADO en el mes.
      const vig = p.estado === 'Aprobada' ? p.planCuotas.find(c => c.estado === 'Pendiente' && c.periodo <= mes) : null;
      if (vig) mesTot += Number(vig.monto);
      const px = _proxima(p);
      return `<tr style="cursor:pointer;" onclick="abrirFichaPrestamo('${p.id}')">
        <td style="font-weight:500;">${p.nroSocio} · ${p.nombre}${p.estado === 'Aprobada RRHH' ? ' <span class="badge badge-gris" style="font-size:9.5px;">esperando depósito</span>' : ''}</td>
        <td style="text-align:right;">${_fmt(p.monto)}</td>
        <td style="text-align:right;">${p.tasaInteres ?? 0}%</td>
        <td style="text-align:right;">${_fmt(p.montoTotal)}</td>
        <td style="text-align:right;">${_fmt(debitadoDelPlan(p.planCuotas))}</td>
        <td style="text-align:right;font-weight:700;">${_fmt(saldo)}</td>
        <td style="font-size:12px;">${px ? `${_periodoTxt(px.periodo)} · ${_fmt(px.monto)}` : '—'}</td>
        <td><span class="badge ${canc ? 'badge-verde' : 'badge-azul'}">${canc ? 'CANCELADO' : `ACTIVO ${deb}/${totC}`}</span></td>
      </tr>`;
    }).join('');
  if ($('kpi-pr-activos')) $('kpi-pr-activos').textContent = activos;
  if ($('kpi-pr-saldo')) $('kpi-pr-saldo').textContent = _fmt(saldoTot);
  if ($('kpi-pr-mes')) $('kpi-pr-mes').textContent = _fmt(mesTot);
}

// ========== FICHA (plan editable por Finanzas) ==========

let _fichaId = null;
let _planEdit = null;

function ensureModalFicha() {
  if ($('modal-pr-ficha')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-pr-ficha';
  m.innerHTML = `
    <div class="modal" style="max-width:780px;">
      <div class="modal-header"><h3 id="prf-titulo">Préstamo</h3><button class="btn-close" onclick="cerrarModal('modal-pr-ficha')">×</button></div>
      <div class="modal-body" id="prf-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-pr-ficha')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

function _prestamoAbierto() { return (DB.prestamos || []).find(x => String(x.id) === String(_fichaId)); }

export function abrirFichaPrestamo(id) {
  const p = (DB.prestamos || []).find(x => String(x.id) === String(id));
  if (!p || !Array.isArray(p.planCuotas)) return;
  ensureModalFicha();
  _fichaId = id;
  _planEdit = JSON.parse(JSON.stringify(p.planCuotas));
  _pintarFicha();
  abrirModal('modal-pr-ficha');
}

function _pintarFicha() {
  const p = _prestamoAbierto();
  if (!p) return;
  const editable = esFinanzasOAdmin();
  $('prf-titulo').textContent = `${p.nroSocio} · ${p.nombre} — Préstamo ${_fmt(p.monto)} + ${p.tasaInteres ?? 0}% = ${_fmt(p.montoTotal)}`;
  const chip = c => c.estado === 'Debitada' ? '<span class="badge badge-verde">✓ DEBITADA</span>'
    : c.estado === 'Postergada' ? `<span class="badge badge-gris">POSTERGADA${c.postergadaA ? ' → ' + _periodoTxt(c.postergadaA) : ''}</span>`
    : '<span class="badge badge-naranja">PENDIENTE</span>' + (c.nueva ? ' <span class="badge badge-azul">nueva</span>' : '');
  const filas = _planEdit.map((c, i) => {
    const pendiente = c.estado === 'Pendiente';
    const montoCell = pendiente && editable
      ? `<input type="text" inputmode="numeric" id="prf-monto-${i}" value="${Math.round(c.monto).toLocaleString('es-AR')}" style="width:110px;text-align:right;" oninput="editarMontoCuotaFicha(${i}, this.value)">`
      : `<span style="${c.estado === 'Postergada' ? 'color:#aab;' : ''}">${_fmt(c.monto)}</span>`;
    const accion = pendiente && editable ? `<button class="btn btn-secondary btn-sm" onclick="postergarCuotaFicha(${i})">→ Postergar</button>` : '';
    return `<tr><td>${i + 1}</td><td>${_periodoTxt(c.periodo)}</td><td style="text-align:right;">${montoCell}</td><td>${chip(c)}</td><td>${accion}</td></tr>`;
  }).join('');

  const hist = (p.historialReprogramaciones || []).slice().reverse().map(h =>
    `${new Date(h.fecha).toLocaleDateString('es-AR')} · ${h.por}: ${h.motivo} <span style="color:var(--texto-suave);">(plan de ${h.filasAntes} → ${h.filasDespues} filas; el anterior queda guardado)</span>`).join('<br>') || 'Sin reprogramaciones.';
  const movs = (p.movimientos || []).map(m =>
    `${new Date(m.fecha).toLocaleDateString('es-AR')} · ${m.tipo}${m.cuotaNro ? ' ' + m.cuotaNro : ''}${m.referencia ? ' (' + m.referencia + ')' : ''}${m.monto != null ? ' — ' + (m.monto < 0 ? '−' : '+') + _fmt(Math.abs(m.monto)) : ''}`).join('<br>') || 'Sin movimientos.';

  $('prf-cuerpo').innerHTML = `
    <div class="info-grid" style="margin-bottom:14px;">
      <div class="info-item"><div class="key">Capital</div><div class="val">${_fmt(p.monto)}</div></div>
      <div class="info-item"><div class="key">Interés ${p.tasaInteres ?? 0}%</div><div class="val">${_fmt(p.montoTotal - p.monto)}</div></div>
      <div class="info-item"><div class="key">Total</div><div class="val">${_fmt(p.montoTotal)}</div></div>
      <div class="info-item"><div class="key">Debitado</div><div class="val" style="color:var(--verde);">${_fmt(debitadoDelPlan(p.planCuotas))}</div></div>
      <div class="info-item"><div class="key">SALDO</div><div class="val" style="color:#b25b00;font-weight:700;">${_fmt(saldoDelPrestamo(p))}</div></div>
    </div>
    <div class="form-section" style="margin-bottom:6px;">Plan de cuotas ${editable ? '— editable por Finanzas' : '— solo lectura (lo edita Finanzas)'}</div>
    <table style="width:100%;font-size:13px;">
      <thead><tr><th>#</th><th>Período</th><th style="text-align:right;">Monto</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${editable ? `
      <div id="prf-barra" style="padding:9px 12px;border-radius:8px;margin-top:10px;font-size:13px;font-weight:600;"></div>
      <div class="form-group" style="margin-top:10px;"><label>Motivo de la reprogramación (obligatorio para guardar)</label>
        <input type="text" id="prf-motivo" placeholder="Ej: pidió el asociado — posterga octubre"></div>
      <div style="text-align:right;"><button class="btn btn-primary" id="prf-guardar" onclick="guardarReprogramacionFicha()">Guardar reprogramación</button></div>` : ''}
    <div class="alerta alerta-info" style="font-size:12px;margin-top:12px;"><b>Historial de reprogramaciones:</b><br>${hist}</div>
    <div class="alerta alerta-info" style="font-size:12px;"><b>Movimientos</b> (asientos — mañana los consume la Cuenta Corriente del asociado):<br>${movs}</div>`;
  if (editable) _validarFicha();
}

// Solo actualiza la barra y el botón (no re-dibuja la tabla) para no
// perder el foco del input mientras se tipea un monto.
function _validarFicha() {
  const p = _prestamoAbierto();
  const barra = $('prf-barra'), btn = $('prf-guardar');
  if (!p || !barra) return;
  const dif = diferenciaDePlan(p, _planEdit);
  const pend = pendientesDelPlan(_planEdit), saldo = saldoDelPrestamo({ ...p, planCuotas: _planEdit });
  if (Math.abs(dif) < 1) {
    barra.style.background = '#dff2e1'; barra.style.color = '#1e7b34';
    barra.textContent = `✓ Plan balanceado: cuotas pendientes ${_fmt(pend)} = saldo ${_fmt(saldo)}`;
    if (btn) btn.disabled = false;
  } else {
    barra.style.background = '#fbe0dc'; barra.style.color = '#b3261e';
    barra.textContent = `✗ Plan desbalanceado: pendientes ${_fmt(pend)} vs saldo ${_fmt(saldo)} — diferencia ${_fmt(Math.abs(dif))} ${dif > 0 ? 'por encima' : 'por debajo'}. No se puede guardar hasta balancearlo.`;
    if (btn) btn.disabled = true;
  }
}

export function editarMontoCuotaFicha(i, valor) {
  if (!_planEdit?.[i] || _planEdit[i].estado !== 'Pendiente') return;
  _planEdit[i].monto = _parseMonto(valor);
  _validarFicha();
}

export function postergarCuotaFicha(i) {
  postergarCuota(_planEdit, i);
  _pintarFicha();
}

export async function guardarReprogramacionFicha() {
  const motivo = ($('prf-motivo') || {}).value || '';
  if (!motivo.trim()) { toast('⚠️ El motivo es obligatorio — la reprogramación queda en el historial con quién y por qué.'); return; }
  const r = await reprogramarPlanPrestamo(_fichaId, _planEdit, motivo);
  if (r.error) { toast('⚠️ ' + r.error); return; }
  _planEdit = JSON.parse(JSON.stringify(r.pedido.planCuotas));
  _pintarFicha();
  renderPrestamosCartera();
  toast('✅ Plan guardado — Liquidaciones va a descontar según el nuevo plan.');
}

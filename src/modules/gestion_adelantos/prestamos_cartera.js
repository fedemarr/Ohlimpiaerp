// Gestión de Adelantos — Tab "💳 Préstamos" (PRESTAMOS_para_Fede.md §4 +
// mockup_prestamos_2.html): el STOCK de deudas vivas, no el flujo del
// pedido. Fase 3 = solo lectura: cartera + ficha con el plan generado al
// aprobar. Postergar/redistribuir (plan editable con la invariante
// "suma de pendientes = saldo") y el débito automático al confirmar el
// pago del retiro quedan para etapas siguientes — por eso todas las
// cuotas figuran PENDIENTE y "Debitado" cuenta solo las que estén
// marcadas 'Debitada' (hoy ninguna: nadie las marca todavía).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { abrirModal, cerrarModal } from '@shared/ui.js';

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

// Cartera = préstamos ya aprobados (APROBADO o DEPOSITADO) con plan.
function _cartera() {
  return (DB.prestamos || []).filter(p => !p.anulado && ['Aprobada RRHH', 'Aprobada'].includes(p.estado) && Array.isArray(p.planCuotas) && p.planCuotas.length);
}
function _debitado(p) { return p.planCuotas.filter(c => c.estado === 'Debitada').reduce((s, c) => s + Number(c.monto), 0); }
function _saldo(p) { return Number(p.montoTotal) - _debitado(p); }
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
      const saldo = _saldo(p), deb = p.planCuotas.filter(c => c.estado === 'Debitada').length;
      const totC = p.planCuotas.filter(c => c.estado !== 'Postergada').length;
      const canc = _cancelado(p);
      if (!canc) { saldoTot += saldo; activos++; }
      p.planCuotas.forEach(c => { if (c.estado === 'Pendiente' && c.periodo === mes) mesTot += Number(c.monto); });
      const px = _proxima(p);
      return `<tr style="cursor:pointer;" onclick="abrirFichaPrestamo('${p.id}')">
        <td style="font-weight:500;">${p.nroSocio} · ${p.nombre}</td>
        <td style="text-align:right;">${_fmt(p.monto)}</td>
        <td style="text-align:right;">${p.tasaInteres ?? 0}%</td>
        <td style="text-align:right;">${_fmt(p.montoTotal)}</td>
        <td style="text-align:right;">${_fmt(_debitado(p))}</td>
        <td style="text-align:right;font-weight:700;">${_fmt(saldo)}</td>
        <td style="font-size:12px;">${px ? `${_periodoTxt(px.periodo)} · ${_fmt(px.monto)}` : '—'}</td>
        <td><span class="badge ${canc ? 'badge-verde' : 'badge-azul'}">${canc ? 'CANCELADO' : `ACTIVO ${deb}/${totC}`}</span></td>
      </tr>`;
    }).join('');
  if ($('kpi-pr-activos')) $('kpi-pr-activos').textContent = activos;
  if ($('kpi-pr-saldo')) $('kpi-pr-saldo').textContent = _fmt(saldoTot);
  if ($('kpi-pr-mes')) $('kpi-pr-mes').textContent = _fmt(mesTot);
}

function ensureModalFicha() {
  if ($('modal-pr-ficha')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-pr-ficha';
  m.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-header"><h3 id="prf-titulo">Préstamo</h3><button class="btn-close" onclick="cerrarModal('modal-pr-ficha')">×</button></div>
      <div class="modal-body" id="prf-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-pr-ficha')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirFichaPrestamo(id) {
  const p = (DB.prestamos || []).find(x => String(x.id) === String(id));
  if (!p || !Array.isArray(p.planCuotas)) return;
  ensureModalFicha();
  $('prf-titulo').textContent = `${p.nroSocio} · ${p.nombre} — Préstamo ${_fmt(p.monto)} + ${p.tasaInteres ?? 0}% = ${_fmt(p.montoTotal)}`;
  const chip = c => c.estado === 'Debitada' ? '<span class="badge badge-verde">✓ DEBITADA</span>'
    : c.estado === 'Postergada' ? `<span class="badge badge-gris">POSTERGADA${c.postergadaA ? ' → ' + _periodoTxt(c.postergadaA) : ''}</span>`
    : '<span class="badge badge-naranja">PENDIENTE</span>';
  $('prf-cuerpo').innerHTML = `
    <div class="info-grid" style="margin-bottom:14px;">
      <div class="info-item"><div class="key">Capital</div><div class="val">${_fmt(p.monto)}</div></div>
      <div class="info-item"><div class="key">Interés ${p.tasaInteres ?? 0}%</div><div class="val">${_fmt(p.montoTotal - p.monto)}</div></div>
      <div class="info-item"><div class="key">Total</div><div class="val">${_fmt(p.montoTotal)}</div></div>
      <div class="info-item"><div class="key">Debitado</div><div class="val" style="color:var(--verde);">${_fmt(_debitado(p))}</div></div>
      <div class="info-item"><div class="key">SALDO</div><div class="val" style="color:#b25b00;font-weight:700;">${_fmt(_saldo(p))}</div></div>
    </div>
    <div class="form-section" style="margin-bottom:6px;">Plan de cuotas</div>
    <table style="width:100%;font-size:13px;">
      <thead><tr><th>#</th><th>Período</th><th style="text-align:right;">Monto</th><th>Estado</th></tr></thead>
      <tbody>${p.planCuotas.map(c => `<tr><td>${c.numero}</td><td>${_periodoTxt(c.periodo)}</td><td style="text-align:right;">${_fmt(c.monto)}</td><td>${chip(c)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="alerta alerta-info" style="font-size:12px;margin-top:12px;">Vista de solo lectura. Postergar/redistribuir cuotas (solo Finanzas, con motivo e historial) y el débito automático al confirmar el pago del retiro llegan en una etapa siguiente.</div>`;
  abrirModal('modal-pr-ficha');
}

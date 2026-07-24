// Gestión de Adelantos v1.1 (Finanzas — Depósito) — Tab "🏦
// Depósito": pedidos Aprobada RRHH, pago individual o bulk, rechazo
// con motivo (vuelve a Revisión RRHH).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { pagarFinanzas, pagarFinanzasBulk, rechazarFinanzas } from '../adelantos_prestamos_shared/flujo.js';

function pedidosParaDepositar() {
  const adelantos = (DB.pedidosAdelantos || []).filter(p => !p.anulado && p.estado === 'Aprobada RRHH')
    .map(p => ({ ...p, tipo: 'Adelanto', nombreMostrar: p.nombreAsociado }));
  const prestamos = (DB.prestamos || []).filter(p => !p.anulado && p.estado === 'Aprobada RRHH')
    .map(p => ({ ...p, tipo: 'Préstamo', nombreMostrar: p.nombre }));
  return [...adelantos, ...prestamos].sort((a, b) => new Date(a.fechaAprobacionRrhh) - new Date(b.fechaAprobacionRrhh));
}

function filaDeposito(p) {
  return `<tr>
    <td><input type="checkbox" class="chk-gadl-dep" data-tipo="${p.tipo}" data-id="${p.id}"></td>
    <td style="font-size:12px;">${(p.fechaAprobacionRrhh || '').slice(0, 10)}</td>
    <td style="font-weight:500;">${p.nombreMostrar}</td>
    <td style="font-size:12px;">${p.tipo}</td>
    <td style="text-align:right;">$${Number(p.monto || 0).toLocaleString('es-AR')}</td>
    <td style="font-size:12px;">${p.tipo === 'Préstamo' ? (p.cuotas || '—') : '—'}</td>
    <td style="font-size:12px;">${p.aprobadoPorRrhh}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-primary btn-sm" onclick="pagarIndividual('${p.tipo}','${p.id}')">💰 Pagar</button>
      <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;" onclick="abrirRechazarDeposito('${p.tipo}','${p.id}')">❌</button>
    </td>
  </tr>`;
}

export function renderDeposito() {
  const filas = pedidosParaDepositar();
  const tbody = $('tbody-gadl-deposito');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin pedidos esperando depósito</td></tr>'
    : filas.map(filaDeposito).join('');
  if ($('st-gadl-aprobados')) $('st-gadl-aprobados').textContent = filas.length;
  if ($('st-gadl-monto')) $('st-gadl-monto').textContent = '$' + filas.reduce((s, p) => s + (Number(p.monto) || 0), 0).toLocaleString('es-AR');
}

export function pagarIndividual(tipo, id) {
  if (!confirm('¿Confirmás el pago de este pedido?')) return;
  pagarFinanzas(tipo, id).then(r => {
    if (r.error) { toast('⚠️ ' + r.error); return; }
    renderDeposito();
    toast('✅ Pedido pagado — se generó el compromiso de descuento');
  });
}

export async function pagarSeleccionadosDeposito() {
  const checks = Array.from(document.querySelectorAll('.chk-gadl-dep:checked'));
  if (checks.length === 0) { toast('⚠️ Seleccioná al menos uno'); return; }
  if (!confirm(`¿Confirmás el pago de ${checks.length} pedido(s)?`)) return;
  const porTipo = { Adelanto: [], Préstamo: [] };
  checks.forEach(c => porTipo[c.dataset.tipo].push(c.dataset.id));
  // pagarFinanzasBulk devuelve un resultado por id (puede traer error si,
  // por ejemplo, alguien más ya pagó ese pedido mientras tanto) — antes
  // se descartaba y siempre se mostraba éxito, aunque alguno hubiera
  // fallado en silencio.
  const resultados = [];
  if (porTipo.Adelanto.length) resultados.push(...await pagarFinanzasBulk('Adelanto', porTipo.Adelanto));
  if (porTipo.Préstamo.length) resultados.push(...await pagarFinanzasBulk('Préstamo', porTipo.Préstamo));
  renderDeposito();
  const fallidos = resultados.filter(r => r.error);
  if (fallidos.length > 0) {
    toast(`⚠️ ${resultados.length - fallidos.length} pagado(s) — ${fallidos.length} no se pudieron pagar (revisá si ya estaban procesados)`);
  } else {
    toast(`✅ ${resultados.length} pedido(s) pagado(s)`);
  }
}

// ========== MODAL — RECHAZAR (vuelve a RRHH) ==========

let _rechazando = null;

function ensureModalRechazoDeposito() {
  if ($('modal-gadl-rechazo-dep')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-gadl-rechazo-dep';
  m.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header"><h3>❌ Rechazar y devolver a RRHH</h3><button class="btn-close" onclick="cerrarModal('modal-gadl-rechazo-dep')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Motivo del rechazo *</label><textarea id="gdep-motivo" rows="3" placeholder="Ej: el monto no coincide con lo acordado"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-gadl-rechazo-dep')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarRechazoDeposito()">Devolver a RRHH</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirRechazarDeposito(tipo, id) {
  _rechazando = { tipo, id };
  ensureModalRechazoDeposito();
  $('gdep-motivo').value = '';
  abrirModal('modal-gadl-rechazo-dep');
}

export async function confirmarRechazoDeposito() {
  const motivo = ($('gdep-motivo').value || '').trim();
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }
  const r = await rechazarFinanzas(_rechazando.tipo, _rechazando.id, motivo);
  if (r.error) { toast('⚠️ ' + r.error); return; }
  cerrarModal('modal-gadl-rechazo-dep');
  renderDeposito();
  toast('✅ Pedido devuelto a RRHH');
}

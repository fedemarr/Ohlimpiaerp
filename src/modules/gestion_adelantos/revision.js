// Gestión de Adelantos v1.1 (Finanzas — Revisión RRHH) — Tab "👥
// Revisión RRHH": pedidos Enviada + Rechazada Finanzas (devueltos),
// con panel de contexto completo del asociado (Cambio 7 del delta).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { getPedidoById, getPrestamoById, aprobarRRHH, rechazarRRHH, reAprobarTrasRechazoFinanzas } from '../adelantos_prestamos_shared/flujo.js';
import { obtenerTopeVigente, obtenerUmbralAlertaPedidos } from '../adelantos_prestamos_shared/config.js';
import { construirContextoAsociado } from '../adelantos_prestamos_shared/contexto.js';

function pedidosEnRevision() {
  const adelantos = (DB.pedidosAdelantos || []).filter(p => !p.anulado && ['Enviada', 'Rechazada Finanzas'].includes(p.estado))
    .map(p => ({ ...p, tipo: 'Adelanto', nombreMostrar: p.nombreAsociado }));
  const prestamos = (DB.prestamos || []).filter(p => !p.anulado && ['Enviada', 'Rechazada Finanzas'].includes(p.estado))
    .map(p => ({ ...p, tipo: 'Préstamo', monto: p.monto ?? p.montoSolicitado, nombreMostrar: p.nombre }));
  return [...adelantos, ...prestamos];
}

function badgesAlerta(p) {
  const badges = [];
  const tope = obtenerTopeVigente(p.fechaPedido);
  if (p.tipo === 'Adelanto' && tope != null && Number(p.monto) > tope) {
    const factor = Number(p.monto) / tope;
    badges.push(`<span class="badge ${factor > 2 ? 'badge-rojo' : 'badge-naranja'}" style="font-size:10px;">SUPERA TOPE</span>`);
  }
  if (p.estado === 'Rechazada Finanzas') badges.push('<span class="badge badge-naranja" style="font-size:10px;">Devuelto por Finanzas</span>');
  return badges.join(' ');
}

function filaRevision(p) {
  return `<tr>
    <td style="font-weight:500;">${p.nombreMostrar}</td>
    <td style="font-size:12px;">${p.tipo}</td>
    <td style="text-align:right;">$${Number(p.monto || 0).toLocaleString('es-AR')}</td>
    <td style="font-size:12px;">${p.tipo === 'Préstamo' ? (p.cuotasSolicitadas ?? p.cuotas ?? '—') : '—'}</td>
    <td style="font-size:12px;">${p.supervisorNombre}</td>
    <td style="font-size:12px;">${p.fechaPedido}</td>
    <td>${badgesAlerta(p)}</td>
    <td><button class="btn btn-primary btn-sm" onclick="abrirRevisionRRHH('${p.tipo}','${p.id}')">Revisar</button></td>
  </tr>`;
}

export function renderRevisionRRHH() {
  const filas = pedidosEnRevision().sort((a, b) => new Date(a.id) - new Date(b.id));
  const tbody = $('tbody-gadl-rrhh');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin pedidos esperando revisión</td></tr>'
    : filas.map(filaRevision).join('');
  if ($('st-gadl-pendientes')) $('st-gadl-pendientes').textContent = filas.length;
}

// ========== MODAL — REVISAR (contexto + aprobar/rechazar) ==========

let _revisando = null; // { tipo, id }

function ensureModalRevision() {
  if ($('modal-gadl-revision')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-gadl-revision';
  m.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-header"><h3 id="gr-titulo">Revisar pedido</h3><button class="btn-close" onclick="cerrarModal('modal-gadl-revision')">×</button></div>
      <div class="modal-body" id="gr-cuerpo"></div>
      <div class="modal-footer" id="gr-acciones">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-gadl-revision')">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function iconoAlerta(nivel) { return nivel === 'danger' ? '🔴' : nivel === 'warn' ? '🟡' : '🟢'; }

export function abrirRevisionRRHH(tipo, id) {
  const p = tipo === 'Préstamo' ? getPrestamoById(id) : getPedidoById(id);
  if (!p) return;
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(p.legajoIdLocal));
  if (!legajo) { toast('⚠️ No se encontró el legajo del asociado'); return; }

  _revisando = { tipo, id };
  ensureModalRevision();
  const nombre = tipo === 'Préstamo' ? p.nombre : p.nombreAsociado;
  $('gr-titulo').textContent = `Revisar — ${nombre}`;

  const ctx = construirContextoAsociado(legajo, tipo === 'Adelanto' ? p : null);
  const devuelto = p.estado === 'Rechazada Finanzas';

  $('gr-cuerpo').innerHTML = `
    ${devuelto ? `<div class="alerta alerta-danger" style="margin-bottom:12px;"><strong>Devuelto por Finanzas:</strong> ${p.motivoRechazoFinanzas || '—'}</div>` : ''}
    <div class="info-grid" style="margin-bottom:14px;">
      <div class="info-item"><div class="key">Tipo</div><div class="val">${tipo}</div></div>
      <div class="info-item"><div class="key">Monto ${tipo === 'Préstamo' ? 'solicitado' : ''}</div><div class="val">$${Number(p.monto ?? p.montoSolicitado ?? 0).toLocaleString('es-AR')}</div></div>
      ${tipo === 'Préstamo' ? `<div class="info-item"><div class="key">Cuotas solicitadas</div><div class="val">${p.cuotasSolicitadas ?? p.cuotas ?? '—'}</div></div>` : ''}
      <div class="info-item"><div class="key">Origen</div><div class="val">${p.origen || 'Formal'}</div></div>
      <div class="info-item"><div class="key">Supervisor</div><div class="val">${p.supervisorNombre}</div></div>
      <div class="info-item"><div class="key">Fecha</div><div class="val">${p.fechaPedido}</div></div>
    </div>
    ${(p.observaciones || p.obs) ? `<p style="font-size:13px;"><strong>Observaciones:</strong> ${p.observaciones || p.obs}</p>` : ''}

    <div class="form-section" style="margin-bottom:8px;">Contexto del asociado</div>
    <div class="info-grid" style="margin-bottom:10px;">
      <div class="info-item"><div class="key">Asociado</div><div class="val">${ctx.asociado.nombre} — N° ${ctx.asociado.nro}${ctx.asociado.antiguedadAnios != null ? ` (${ctx.asociado.antiguedadAnios} años)` : ''}</div></div>
      <div class="info-item"><div class="key">Función / Servicio</div><div class="val">${ctx.asociado.funcion || '—'} · ${ctx.asociado.servicio || '—'}</div></div>
      <div class="info-item"><div class="key">Historial (6 meses)</div><div class="val">${ctx.historial.aprobados} aprobados / ${ctx.historial.rechazados} rechazados — $${ctx.historial.montoTotal.toLocaleString('es-AR')} tomado</div></div>
      <div class="info-item"><div class="key">Préstamos activos</div><div class="val">${ctx.historial.prestamosActivos} — $${ctx.historial.totalMensualComprometido.toLocaleString('es-AR')}/mes comprometido</div></div>
      <div class="info-item"><div class="key">Sanciones</div><div class="val">${ctx.sanciones.total} totales, ${ctx.sanciones.apercibimientos} apercibimientos${ctx.sanciones.riesgoEscalada !== 'Normal' ? ` — <span style="color:var(--rojo);">${ctx.sanciones.riesgoEscalada}</span>` : ''}</div></div>
      <div class="info-item"><div class="key">Estado médico</div><div class="val">${ctx.casoMedico ? `${ctx.casoMedico.tipoCaso} desde ${ctx.casoMedico.fechaInicio}` : 'Sin casos activos'}</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
      ${ctx.alertas.map(a => `<div style="padding:8px 10px;background:var(--fondo);border-radius:6px;font-size:12.5px;">${iconoAlerta(a.nivel)} ${a.mensaje}</div>`).join('')}
    </div>

    ${tipo === 'Préstamo' ? `
      <div class="form-section" style="margin-bottom:8px;">Definir cuotas aprobadas</div>
      <div class="form-grid form-grid-2">
        <div class="form-group"><label>Monto a aprobar</label><input type="number" id="gr-monto-aprobado" min="0" value="${p.montoSolicitado ?? p.monto ?? ''}"></div>
        <div class="form-group"><label>Cuotas a aprobar</label><input type="number" id="gr-cuotas-aprobadas" min="1" value="${p.cuotasSolicitadas ?? p.cuotas ?? ''}"></div>
      </div>
    ` : ''}
    <div class="form-group"><label>Motivo (obligatorio si rechaza)</label><textarea id="gr-motivo" rows="2"></textarea></div>
  `;

  $('gr-acciones').innerHTML = `
    <button class="btn btn-secondary" onclick="cerrarModal('modal-gadl-revision')">Cerrar</button>
    ${!devuelto ? `<button class="btn" style="background:#fee2e2;color:#991b1b;" onclick="rechazarRevisionRRHH()">❌ Rechazar</button>` : ''}
    <button class="btn btn-primary" onclick="aprobarRevisionRRHH()">✅ ${devuelto ? 'Reenviar a Finanzas' : 'Aprobar'}</button>
  `;
  abrirModal('modal-gadl-revision');
}

export async function aprobarRevisionRRHH() {
  const { tipo, id } = _revisando;
  const extra = {};
  if (tipo === 'Préstamo') {
    extra.montoAprobado = $('gr-monto-aprobado')?.value;
    extra.cuotasAprobadas = $('gr-cuotas-aprobadas')?.value;
  }
  const p = tipo === 'Préstamo' ? getPrestamoById(id) : getPedidoById(id);
  const r = p?.estado === 'Rechazada Finanzas'
    ? await reAprobarTrasRechazoFinanzas(tipo, id, extra)
    : await aprobarRRHH(tipo, id, extra);
  if (r.error) { toast('⚠️ ' + r.error); return; }
  cerrarModal('modal-gadl-revision');
  renderRevisionRRHH();
  toast('✅ Pedido aprobado — pasa a Finanzas');
}

export async function rechazarRevisionRRHH() {
  const { tipo, id } = _revisando;
  const motivo = ($('gr-motivo')?.value || '').trim();
  if (!motivo) { toast('⚠️ El motivo del rechazo es obligatorio'); return; }
  const r = await rechazarRRHH(tipo, id, motivo);
  if (r.error) { toast('⚠️ ' + r.error); return; }
  cerrarModal('modal-gadl-revision');
  renderRevisionRRHH();
  toast('✅ Pedido rechazado');
}

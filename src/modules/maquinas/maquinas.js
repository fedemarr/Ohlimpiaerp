// Módulo Máquinas — padrón, tickets de reparación, baterías, económico.
// v096 · Último operario: Logística · spec: MODULO_MAQUINAS.md · mockup: mockup_maquinas_1.html
//
// 4 tabs: Padrón · Tickets · Baterías y consumibles · Económico
// 4 tablas Supabase: maquinas, maquinas_movimientos, maquinas_tickets, maquinas_ticket_historial
//
// Estados de máquina: activa | deposito | reparacion | baja
// Etapas de ticket:   reporte | analisis | visita_interna | proveedor | factura | cerrado

import { DB, currentUser } from '@shared/state.js';
import { $, badge } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// ========== HELPERS ==========

function _id(pref) { return pref + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function _money2(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _hoy() { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }

const ESTADO_MAQ = {
  activa:     ['var(--verde)',  'ACTIVA'],
  deposito:   ['#5b6690',      'DEPÓSITO'],
  reparacion: ['var(--naranja)', 'EN REPARACIÓN'],
  baja:       ['var(--rojo)',   'BAJA'],
};
const ETAPA_COLORS = {
  reporte:         ['#2563eb', 'Reporte'],
  analisis:        ['#7c3aed', 'Análisis'],
  visita_interna:  ['#d97706', 'Visita interna'],
  proveedor:       ['#dc2626', 'Proveedor'],
  factura:         ['#0891b2', 'Factura'],
  cerrado:         ['#059669', 'Cerrado'],
};
const ETAPAS = ['reporte', 'analisis', 'visita_interna', 'proveedor', 'factura', 'cerrado'];
const ETAPA_LABEL = { reporte: 'Reporte', analisis: 'Análisis remoto', visita_interna: 'Visita interna', proveedor: 'Proveedor', factura: 'Control factura', cerrado: 'Cerrado' };
const RESOLUCION_LABEL = { remoto: 'Resuelto remoto', interno: 'Resuelto interno', proveedor: 'Proveedor', baja: 'Dada de baja' };
const MOTIVO_BAJA = { rota_sin_arreglo: 'Rota sin arreglo', vendida: 'Vendida', devuelta_proveedor: 'Devuelta al proveedor' };
const TIPOS_PROBLEMA = ['No aspira', 'No enciende', 'Pierde agua', 'Sistema dirección', 'Ruido anormal', 'No gira', 'Fallo electrónico', 'Desgaste general', 'Otro'];
const TIPOS_TRABAJO = ['Remoto', 'Repuesto', 'Mano de obra', 'Acta proveedor'];

function getMaquina(id) { return (DB.maquinas || []).find(m => String(m.id) === String(id)); }
function getTicketsMaquina(maqId) { return (DB.maquinasTickets || []).filter(t => String(t.maquinaIdLocal) === String(maqId) && !t.anulado); }
function getMovimientosMaquina(maqId) { return (DB.maquinasMovimientos || []).filter(m => String(m.maquinaIdLocal) === String(maqId) && !m.anulado); }
function getHistorialTicket(ticketId) { return (DB.maquinasTicketHistorial || []).filter(h => String(h.ticketIdLocal) === String(ticketId) && !h.anulado).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))); }

function _estadoChip(estado) {
  const [color, label] = ESTADO_MAQ[estado] || ['#888', estado];
  return `<span style="background:${color}22;color:${color};padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">${label}</span>`;
}
function _etapaChip(etapa) {
  const [color, label] = ETAPA_COLORS[etapa] || ['#888', etapa];
  return `<span style="background:${color}22;color:${color};padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">${label}</span>`;
}
function _propiedadChip(prop) {
  if (prop === 'alquilada') return '<span style="background:#f3e8fb;color:#7a3ba0;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">ALQUILADA</span>';
  return '<span style="background:#e6eefb;color:#2c4a8a;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">PROPIA</span>';
}
function _energiaChip(energia) {
  if (energia === 'cable') return '<span style="background:#eef1f7;color:#5b6690;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">CABLE</span>';
  return '<span style="background:#fff3d6;color:#a06b00;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">BATERÍA</span>';
}

// ========== STATS ==========

function _calcStats() {
  const activas = (DB.maquinas || []).filter(m => !m.anulado && m.estado !== 'baja');
  const ticketsAbiertos = (DB.maquinasTickets || []).filter(t => !t.anulado && t.etapa !== 'cerrado');
  const bateriasRenovar = activas.filter(m => m.energia === 'bateria' && m.bateriaColocada && m.bateriaVidaUtil);
  const hoy = new Date();
  const bateriasProximas = bateriasRenovar.filter(m => {
    const parts = m.bateriaColocada.split('/');
    if (parts.length < 3) return false;
    const colocada = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    const vencimiento = new Date(colocada);
    vencimiento.setMonth(vencimiento.getMonth() + (m.bateriaVidaUtil || 24));
    const diffDias = (vencimiento - hoy) / (1000 * 60 * 60 * 24);
    return diffDias <= 60;
  });
  const propias = activas.filter(m => m.propiedad === 'propia').length;
  const alquiladas = activas.filter(m => m.propiedad === 'alquilada').length;
  const previsionBaterias = bateriasProximas.reduce((s, m) => s + (m.bateriaCosto || 0), 0);
  return { total: activas.length, propias, alquiladas, ticketsAbiertos: ticketsAbiertos.length, bateriasProximas: bateriasProximas.length, previsionBaterias };
}

function renderStatsMaquinas() {
  const s = _calcStats();
  const el = $('maq-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card azul"><div class="stat-label">Parque activo</div><div class="stat-valor">${s.total}</div><div class="stat-sub">${s.propias} propias · ${s.alquiladas} alquiladas</div></div>
    <div class="stat-card" style="background:#fff3d6;"><div class="stat-label">Tickets abiertos</div><div class="stat-valor" style="color:var(--naranja);">${s.ticketsAbiertos}</div><div class="stat-sub">Reparación en curso</div></div>
    <div class="stat-card rojo"><div class="stat-label">Baterías ≤60 días</div><div class="stat-valor">${s.bateriasProximas}</div><div class="stat-sub">${s.bateriasProximas > 0 ? 'Previsión ' + _money(s.previsionBaterias) : 'Todo OK'}</div></div>
    <div class="stat-card verde"><div class="stat-label">Costo reparaciones</div><div class="stat-valor" style="font-size:14px;">${_money((DB.maquinas || []).reduce((s, m) => s + (m.reparacionesAcum || 0), 0))}</div><div class="stat-sub">Acumulado total</div></div>`;
}

// ========== TAB: PADRÓN ==========

export function renderMaquinas() {
  renderStatsMaquinas();
  renderPadronMaquinas();
  renderTicketsMaquinas();
  renderBateriasMaquinas();
  renderEconomicoMaquinas();
}

function renderPadronMaquinas() {
  const tbody = $('tbody-maq-patron');
  if (!tbody) return;
  const q = ($('maq-buscar') || {}).value?.toLowerCase() || '';
  const filtro = ($('maq-filtro-estado') || {}).value || '';
  let filas = (DB.maquinas || []).filter(m => !m.anulado);
  if (q) filas = filas.filter(m => (m.nroMaquina || '').toLowerCase().includes(q) || (m.tipo || '').toLowerCase().includes(q) || (m.marca || '').toLowerCase().includes(q) || (m.servicioNombre || '').toLowerCase().includes(q));
  if (filtro) filas = filas.filter(m => m.estado === filtro);
  filas.sort((a, b) => String(a.nroMaquina || '').localeCompare(String(b.nroMaquina || ''), undefined, { numeric: true }));

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;opacity:.5;">Sin máquinas registradas — click en "+ Nueva máquina" para agregar</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(m => {
    const ticket = (DB.maquinasTickets || []).find(t => String(t.maquinaIdLocal) === String(m.id) && !t.anulado && t.etapa !== 'cerrado');
    const ticketLabel = ticket ? ` <span style="font-size:10px;color:var(--texto-suave);">#${ticket.nroTicket || ''}</span>` : '';
    return `<tr onclick="verMaquina('${m.id}')" style="cursor:pointer;">
      <td style="font-weight:700;color:var(--azul);">${m.nroMaquina || '—'}</td>
      <td><span style="font-weight:500;">${m.tipo || ''}</span> <span style="font-size:11px;color:var(--texto-suave);">${m.marca || ''}</span></td>
      <td>${_propiedadChip(m.propiedad)}${m.propiedad === 'alquilada' && m.proveedorAlquiler ? ' <span style="font-size:10px;color:var(--texto-suave);">' + m.proveedorAlquiler + '</span>' : ''}</td>
      <td>${_energiaChip(m.energia)}</td>
      <td>${_estadoChip(m.estado)}${ticketLabel}</td>
      <td style="font-size:12px;">${m.servicioNombre || '<span style="opacity:.4;">Depósito</span>'}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${m.reparacionesAcum > 0 ? _money(m.reparacionesAcum) : '—'}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${m.propiedad === 'alquilada' && m.costoAlquilerMensual > 0 ? _money(m.costoAlquilerMensual) : '—'}</td>
    </tr>`;
  }).join('');
}
export function filtrarMaquinas() { renderPadronMaquinas(); }

// ========== MODAL: FICHA MÁQUINA ==========

let _maqActualId = null;
let _maqTabActual = 'datos';

export function verMaquina(id) {
  _maqActualId = id;
  _maqTabActual = 'datos';
  _renderFichaMaquina();
  abrirModal('modal-maquina-ficha');
}

function _renderFichaMaquina() {
  const m = getMaquina(_maqActualId);
  if (!m) return;
  const body = $('maq-ficha-body');
  if (!body) return;
  $('maq-ficha-title').textContent = `Máquina ${m.nroMaquina || ''} — ${m.tipo || ''}`;

  const tabs = ['datos', 'movimientos', 'tickets', 'baterias', 'costos'];
  const tabLabels = { datos: 'Datos', movimientos: 'Movimientos', tickets: 'Tickets', baterias: 'Baterías', costos: 'Costos' };

  let html = '<div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap;">';
  tabs.forEach(t => {
    const active = _maqTabActual === t;
    html += `<button class="btn ${active ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="cambiarTabMaqFicha('${t}')">${tabLabels[t]}</button>`;
  });
  html += '</div>';
  html += `<div id="maq-tab-${_maqTabActual}">`;

  if (_maqTabActual === 'datos') html += _renderTabDatos(m);
  else if (_maqTabActual === 'movimientos') html += _renderTabMovimientos(m);
  else if (_maqTabActual === 'tickets') html += _renderTabTickets(m);
  else if (_maqTabActual === 'baterias') html += _renderTabBaterias(m);
  else if (_maqTabActual === 'costos') html += _renderTabCostos(m);

  html += '</div>';
  body.innerHTML = html;
}

function _renderTabDatos(m) {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
    <div><strong>N° máquina:</strong> ${m.nroMaquina || '—'}</div>
    <div><strong>Tipo:</strong> ${m.tipo || '—'}</div>
    <div><strong>Marca:</strong> ${m.marca || '—'}</div>
    <div><strong>Modelo:</strong> ${m.modelo || '—'}</div>
    <div><strong>Propiedad:</strong> ${_propiedadChip(m.propiedad)}${m.propiedad === 'alquilada' ? ' — ' + (m.proveedorAlquiler || '') : ''}</div>
    <div><strong>Energía:</strong> ${_energiaChip(m.energia)}</div>
    <div><strong>Estado:</strong> ${_estadoChip(m.estado)}</div>
    <div><strong>Ubicación:</strong> ${m.servicioNombre || 'Depósito'}</div>
    ${m.propiedad === 'alquilada' ? `
      <div><strong>Costo alquiler:</strong> ${_money2(m.costoAlquilerMensual)}/mes</div>
      <div><strong>Contrato N°:</strong> ${m.contratoNro || '—'}</div>` : ''}
    ${m.fechaCompra ? `<div><strong>Compra:</strong> ${m.fechaCompra}</div><div><strong>Costo:</strong> ${_money2(m.costoCompra)}</div>` : ''}
    <div><strong>Vida útil:</strong> ${m.vidaUtilMeses || 60} meses</div>
  </div>`;
}

function _renderTabMovimientos(m) {
  const movs = getMovimientosMaquina(m.id).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  if (!movs.length) return '<p style="opacity:.5;font-size:12px;">Sin movimientos registrados</p>';
  return `<table style="width:100%;font-size:12px;"><thead><tr><th>Fecha</th><th>Origen</th><th>Destino</th><th>Motivo</th><th>Registrado por</th></tr></thead><tbody>${movs.map(mv => `<tr>
    <td>${mv.fecha || ''}</td><td>${mv.origen || '—'}</td><td>${mv.destino || '—'}</td><td>${mv.motivo || '—'}</td><td>${mv.registradoPor || '—'}</td>
  </tr>`).join('')}</tbody></table>`;
}

function _renderTabTickets(m) {
  const ticks = getTicketsMaquina(m.id).sort((a, b) => (b.nroTicket || 0) - (a.nroTicket || 0));
  if (!ticks.length) return '<p style="opacity:.5;font-size:12px;">Sin tickets para esta máquina</p>';
  return `<table style="width:100%;font-size:12px;"><thead><tr><th>#</th><th>Problema</th><th>Etapa</th><th>Reportado</th><th>Costo</th></tr></thead><tbody>${ticks.map(t => `<tr onclick="verTicket('${t.id}')" style="cursor:pointer;">
    <td style="font-weight:700;color:var(--azul);">${t.nroTicket || '—'}</td>
    <td>${t.problemaTipo || ''}${t.problemaDesc ? ' — ' + t.problemaDesc : ''}</td>
    <td>${_etapaChip(t.etapa)}</td>
    <td style="font-size:11px;">${t.reportadoFecha || '—'}</td>
    <td style="text-align:right;">${(t.costoRepuestos || 0) + (t.costoProveedor || 0) > 0 ? _money((t.costoRepuestos || 0) + (t.costoProveedor || 0)) : '—'}</td>
  </tr>`).join('')}</tbody></table>`;
}

function _renderTabBaterias(m) {
  if (m.energia !== 'bateria') return '<p style="opacity:.5;font-size:12px;">Máquina a cable — sin datos de batería</p>';
  const hoy = new Date();
  let vencimiento = null, diffDias = null, estado = 'OK';
  if (m.bateriaColocada) {
    const parts = m.bateriaColocada.split('/');
    if (parts.length >= 3) {
      vencimiento = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      vencimiento.setMonth(vencimiento.getMonth() + (m.bateriaVidaUtil || 24));
      diffDias = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));
      if (diffDias < 0) estado = 'VENCIDO';
      else if (diffDias <= 60) estado = 'PRÓXIMO';
    }
  }
  const estadoColor = estado === 'VENCIDO' ? 'var(--rojo)' : estado === 'PRÓXIMO' ? 'var(--naranja)' : 'var(--verde)';
  return `<div style="font-size:13px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><strong>Tipo batería:</strong> ${m.bateriaTipo || '—'}</div>
      <div><strong>Costo estimado:</strong> ${_money2(m.bateriaCosto)}</div>
      <div><strong>Colocada:</strong> ${m.bateriaColocada || '—'}</div>
      <div><strong>Vida útil:</strong> ${m.bateriaVidaUtil || 24} meses</div>
      <div><strong>Recambio:</strong> ${vencimiento ? vencimiento.toLocaleDateString('es-AR') : '—'}</div>
      <div><strong>Estado:</strong> <span style="color:${estadoColor};font-weight:700;">${estado}</span></div>
    </div>
    ${diffDias !== null ? `<div style="background:${estadoColor}15;border:1px solid ${estadoColor}40;border-radius:8px;padding:10px;font-size:12px;color:${estadoColor};">
      ${estado === 'VENCIDO' ? '⚠ La batería está vencida — recambio urgente' : estado === 'PRÓXIMO' ? `⏰ Recambio en ${diffDias} días` : `✓ Próximo recambio en ${diffDias} días`}
    </div>` : ''}
  </div>`;
}

function _renderTabCostos(m) {
  const tickets = getTicketsMaquina(m.id).filter(t => t.etapa === 'cerrado');
  const totalRepuestos = tickets.reduce((s, t) => s + (t.costoRepuestos || 0), 0);
  const totalProveedor = tickets.reduce((s, t) => s + (t.costoProveedor || 0), 0);
  const totalAlquiler = m.propiedad === 'alquilada' ? (m.costoAlquilerMensual || 0) * 12 : 0;
  const amortMensual = m.costoCompra && m.vidaUtilMeses ? m.costoCompra / m.vidaUtilMeses : 0;
  return `<div style="font-size:13px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div><strong>Reparaciones internas:</strong> ${_money2(totalRepuestos)}</div>
      <div><strong>Facturas proveedor:</strong> ${_money2(totalProveedor)}</div>
      <div><strong>Total reparaciones:</strong> ${_money2(totalRepuestos + totalProveedor)}</div>
      ${m.propiedad === 'alquilada' ? `<div><strong>Alquiler anual:</strong> ${_money2(totalAlquiler)}</div>` : ''}
      ${m.costoCompra ? `<div><strong>Amortización mensual:</strong> ${_money2(amortMensual)} (${m.vidaUtilMeses || 60} meses)</div>` : ''}
    </div>
    <p style="font-size:11px;color:var(--texto-suave);">La imputación por servicio está en el tab Económico del módulo.</p>
  </div>`;
}

export function cambiarTabMaqFicha(tab) { _maqTabActual = tab; _renderFichaMaquina(); }

// ========== MODAL: NUEVA / EDITAR MÁQUINA ==========

export function abrirModalNuevaMaquina() {
  _maqActualId = null;
  _fillMaquinaForm({});
  $('maq-form-title').textContent = 'Nueva máquina';
  abrirModal('modal-maquina-form');
}

function _fillMaquinaForm(m) {
  const set = (id, v) => { const el = $(id); if (el) el.value = v || ''; };
  set('maq-nro', m.nroMaquina || '');
  set('maq-tipo', m.tipo || '');
  set('maq-marca', m.marca || '');
  set('maq-modelo', m.modelo || '');
  set('maq-propiedad', m.propiedad || 'propia');
  set('maq-proveedor-alquiler', m.proveedorAlquiler || '');
  set('maq-costo-alquiler', m.costoAlquilerMensual || '');
  set('maq-contrato', m.contratoNro || '');
  set('maq-energia', m.energia || 'bateria');
  set('maq-fecha-compra', m.fechaCompra || '');
  set('maq-costo-compra', m.costoCompra || '');
  set('maq-vida-util', m.vidaUtilMeses || '60');
  set('maq-bateria-tipo', m.bateriaTipo || '');
  set('maq-bateria-colocada', m.bateriaColocada || '');
  set('maq-bateria-vida', m.bateriaVidaUtil || '24');
  set('maq-bateria-costo', m.bateriaCosto || '');
}

function _readMaquinaForm() {
  const g = (id) => ($(id) || {}).value || '';
  return {
    nroMaquina: g('maq-nro').trim(), tipo: g('maq-tipo').trim(), marca: g('maq-marca').trim(), modelo: g('maq-modelo').trim(),
    propiedad: g('maq-propiedad'), proveedorAlquiler: g('maq-proveedor-alquiler').trim(),
    costoAlquilerMensual: parseFloat(g('maq-costo-alquiler')) || 0, contratoNro: g('maq-contrato').trim(),
    energia: g('maq-energia'), fechaCompra: g('maq-fecha-compra').trim(),
    costoCompra: parseFloat(g('maq-costo-compra')) || 0, vidaUtilMeses: parseInt(g('maq-vida-util')) || 60,
    bateriaTipo: g('maq-bateria-tipo').trim(), bateriaColocada: g('maq-bateria-colocada').trim(),
    bateriaVidaUtil: parseInt(g('maq-bateria-vida')) || 24, bateriaCosto: parseFloat(g('maq-bateria-costo')) || 0,
  };
}

export async function guardarMaquina() {
  const data = _readMaquinaForm();
  if (!data.nroMaquina) { toast('⚠️ Ingresá el N° de máquina'); return; }
  // Unicidad de N°
  const existe = (DB.maquinas || []).find(m => m.nroMaquina === data.nroMaquina && String(m.id) !== String(_maqActualId));
  if (existe) { toast('⚠️ Ya existe una máquina con ese N°'); return; }
  let m;
  if (_maqActualId) {
    m = getMaquina(_maqActualId);
    if (!m) return;
    Object.assign(m, data);
  } else {
    m = { id: _id('MAQ'), ...data, estado: 'deposito', servicioCodigo: '', servicioNombre: 'Depósito', reparacionesAcum: 0, fotoUrl: '' };
    DB.maquinas = DB.maquinas || [];
    DB.maquinas.push(m);
  }
  await supaSync('maquinas', m);
  cerrarModal('modal-maquina-form');
  renderMaquinas();
  toast(_maqActualId ? '✓ Máquina actualizada' : '✓ Máquina registrada');
}

export function editarMaquina(id) {
  const m = getMaquina(id || _maqActualId);
  if (!m) return;
  _maqActualId = m.id;
  _fillMaquinaForm(m);
  $('maq-form-title').textContent = 'Editar máquina ' + (m.nroMaquina || '');
  cerrarModal('modal-maquina-ficha');
  abrirModal('modal-maquina-form');
}

export async function bajaMaquina(id) {
  const m = getMaquina(id || _maqActualId);
  if (!m) return;
  const motivo = prompt('Motivo de baja (rota_sin_arreglo / vendida / devuelta_proveedor):');
  if (!motivo || !['rota_sin_arreglo', 'vendida', 'devuelta_proveedor'].includes(motivo)) { toast('⚠️ Motivo inválido'); return; }
  m.estado = 'baja';
  m.estadoMotivo = motivo;
  await supaSync('maquinas', m);
  cerrarModal('modal-maquina-ficha');
  renderMaquinas();
  toast('✓ Máquina dada de baja');
}

export async function moverMaquina(id, destino, motivo) {
  const m = getMaquina(id);
  if (!m) return;
  const origen = m.servicioNombre || 'Depósito';
  const mov = { id: _id('MAQM'), maquinaIdLocal: m.id, fecha: _hoy(), origen, destino, motivo: motivo || '', registradoPor: currentUser?.nombre || '' };
  DB.maquinasMovimientos = DB.maquinasMovimientos || [];
  DB.maquinasMovimientos.push(mov);
  await supaSync('maquinasMovimientos', mov);
  m.servicioCodigo = '';
  m.servicioNombre = destino;
  m.estado = destino.toLowerCase().includes('depósito') || destino.toLowerCase().includes('deposito') ? 'deposito' : 'activa';
  await supaSync('maquinas', m);
  renderMaquinas();
  toast('✓ Máquina movida a ' + destino);
}

// ========== TAB: TICKETS ==========

function renderTicketsMaquinas() {
  const tbody = $('tbody-maq-tickets');
  if (!tbody) return;
  const filtro = ($('maq-ticket-filtro') || {}).value || '';
  let ticks = (DB.maquinasTickets || []).filter(t => !t.anulado);
  if (filtro) ticks = ticks.filter(t => t.etapa === filtro);
  ticks.sort((a, b) => (b.nroTicket || 0) - (a.nroTicket || 0));

  if (!ticks.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.5;">Sin tickets registrados</td></tr>';
    return;
  }
  tbody.innerHTML = ticks.slice(0, 200).map(t => {
    const m = getMaquina(t.maquinaIdLocal);
    const maqLabel = m ? `${m.nroMaquina} · ${m.tipo || ''}` : t.maquinaIdLocal || '—';
    const diasAbierto = t.etapa !== 'cerrado' && t.reportadoFecha ? _diasEntre(t.reportadoFecha, _hoy()) : '—';
    return `<tr onclick="verTicket('${t.id}')" style="cursor:pointer;">
      <td style="font-weight:700;color:var(--azul);">${t.nroTicket || '—'}</td>
      <td>${maqLabel}</td>
      <td style="font-size:12px;">${m?.servicioNombre || '—'}</td>
      <td style="font-size:12px;">${t.problemaTipo || '—'}${t.problemaDesc ? '<br><span style="color:var(--texto-suave);">' + t.problemaDesc + '</span>' : ''}</td>
      <td>${_etapaChip(t.etapa)}</td>
      <td style="text-align:center;font-size:12px;">${diasAbierto}</td>
      <td style="font-size:11px;">${t.resolucion ? RESOLUCION_LABEL[t.resolucion] || t.resolucion : '—'}</td>
    </tr>`;
  }).join('');
}

function _diasEntre(f1, f2) {
  const p1 = f1.split('/'), p2 = f2.split('/');
  if (p1.length < 3 || p2.length < 3) return '—';
  const d1 = new Date(parseInt(p1[2]), parseInt(p1[1]) - 1, parseInt(p1[0]));
  const d2 = new Date(parseInt(p2[2]), parseInt(p2[1]) - 1, parseInt(p2[0]));
  return Math.max(0, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
}

// ========== MODAL: TICKET DETALLE ==========

let _ticketActualId = null;

export function verTicket(id) {
  _ticketActualId = id;
  _renderTicketDetalle();
  abrirModal('modal-maq-ticket');
}

function _renderTicketDetalle() {
  const t = (DB.maquinasTickets || []).find(x => String(x.id) === String(_ticketActualId));
  if (!t) return;
  const body = $('maq-ticket-body');
  if (!body) return;
  const m = getMaquina(t.maquinaIdLocal);
  $('maq-ticket-title').textContent = `Ticket #${t.nroTicket || ''} — Máquina ${m?.nroMaquina || ''} · ${m?.tipo || ''}`;

  // Pipeline visual
  const etapaIdx = ETAPAS.indexOf(t.etapa);
  let html = '<div style="display:flex;gap:0;margin:12px 0;flex-wrap:wrap;">';
  ETAPAS.forEach((e, i) => {
    const done = i < etapaIdx;
    const cur = i === etapaIdx;
    const [color] = ETAPA_COLORS[e] || ['#888'];
    const dotBg = done ? color : cur ? color : '#dde3f0';
    const dotColor = done || cur ? 'white' : '#5b6690';
    const labelColor = done || cur ? color : '#5b6690';
    html += `<div style="flex:1;min-width:110px;text-align:center;position:relative;">
      <div style="width:28px;height:28px;border-radius:50%;margin:0 auto 5px;background:${dotBg};color:${dotColor};font-size:12px;font-weight:700;line-height:28px;${cur ? 'box-shadow:0 0 0 4px ' + color + '33;' : ''}">${i + 1}</div>
      <div style="font-size:10px;font-weight:700;color:${labelColor};text-transform:uppercase;">${ETAPA_LABEL[e]}</div>
    </div>`;
  });
  html += '</div>';

  // Datos del ticket
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;margin:14px 0;">
    <div><strong>Reportó:</strong> ${t.reportadoPor || '—'}</div>
    <div><strong>Fecha:</strong> ${t.reportadoFecha || '—'}</div>
    <div><strong>Problema:</strong> ${t.problemaTipo || '—'}</div>
    <div><strong>Descripción:</strong> ${t.problemaDesc || '—'}</div>
    ${t.resolucion ? `<div><strong>Resolución:</strong> ${RESOLUCION_LABEL[t.resolucion] || t.resolucion}</div>` : ''}
    ${t.resolucionNotas ? `<div><strong>Notas:</strong> ${t.resolucionNotas}</div>` : ''}
    ${t.costoRepuestos > 0 ? `<div><strong>Costo repuestos:</strong> ${_money2(t.costoRepuestos)}</div>` : ''}
    ${t.costoProveedor > 0 ? `<div><strong>Costo proveedor:</strong> ${_money2(t.costoProveedor)}</div>` : ''}
    ${t.facturaMonto > 0 ? `<div><strong>Factura:</strong> ${_money2(t.facturaMonto)}${t.facturaObservada ? ' ⚠ OBSERVADA' : ''}</div>` : ''}
    ${t.proveedorNombre ? `<div><strong>Proveedor:</strong> ${t.proveedorNombre}</div>` : ''}
  </div>`;

  // Acta de proveedor
  if (t.proveedorActa) {
    html += `<div style="background:#f8f9fc;border:1px solid var(--borde);border-radius:8px;padding:10px;font-size:12px;margin:8px 0;">
      <strong>Acta de proveedor:</strong><br>${t.proveedorActa}
    </div>`;
  }

  // Historial
  const hist = getHistorialTicket(t.id);
  if (hist.length) {
    html += '<div style="margin-top:14px;"><strong style="font-size:12px;">Historial de cambios:</strong>';
    html += hist.map(h => `<div style="background:#f8f9fc;border-radius:8px;padding:8px 12px;font-size:11px;margin-top:6px;">
      <span style="font-weight:700;">${ETAPA_LABEL[h.etapaAnterior] || h.etapaAnterior}</span> → <span style="font-weight:700;">${ETAPA_LABEL[h.etapaNueva] || h.etapaNueva}</span>
      ${h.notas ? ' — ' + h.notas : ''}
      <br><span style="color:var(--texto-suave);">${h.responsable || '—'} · ${h.created_at ? new Date(h.created_at).toLocaleDateString('es-AR') : ''}</span>
    </div>`).join('');
    html += '</div>';
  }

  body.innerHTML = html;
}

// ========== CREAR / AVANZAR TICKET ==========

export function abrirNuevoTicket(maquinaId) {
  _ticketActualId = null;
  const maq = maquinaId ? getMaquina(maquinaId) : null;
  $('ticket-maq-id').value = maq ? maq.id : '';
  $('ticket-maq-label').textContent = maq ? `${maq.nroMaquina} — ${maq.tipo}` : '';
  $('ticket-problema-tipo').value = '';
  $('ticket-problema-desc').value = '';
  $('ticket-reportado-por').value = currentUser?.nombre || '';
  $('ticket-maq-id-hidden').value = maq ? maq.id : '';
  abrirModal('modal-maq-nuevo-ticket');
}

export async function guardarNuevoTicket() {
  const maqId = $('ticket-maq-id-hidden').value || $('ticket-maq-id').value;
  if (!maqId) { toast('⚠️ Seleccioná una máquina'); return; }
  const problemaTipo = $('ticket-problema-tipo').value.trim();
  if (!problemaTipo) { toast('⚠️ Seleccioná el tipo de problema'); return; }
  const t = {
    id: _id('MAQT'),
    maquinaIdLocal: maqId,
    problemaTipo,
    problemaDesc: $('ticket-problema-desc').value.trim(),
    reportadoPor: $('ticket-reportado-por').value.trim() || currentUser?.nombre || '',
    reportadoFecha: _hoy(),
    etapa: 'reporte',
    etapaInicioEn: new Date().toISOString(),
  };
  DB.maquinasTickets = DB.maquinasTickets || [];
  DB.maquinasTickets.push(t);
  await supaSync('maquinasTickets', t);
  // Marcar máquina como en reparación
  const m = getMaquina(maqId);
  if (m && m.estado !== 'reparacion') {
    m.estado = 'reparacion';
    await supaSync('maquinas', m);
  }
  cerrarModal('modal-maq-nuevo-ticket');
  renderMaquinas();
  toast('✓ Ticket #' + (t.nroTicket || '') + ' creado');
}

export function avanzarTicket(id) {
  _ticketActualId = id || _ticketActualId;
  const t = (DB.maquinasTickets || []).find(x => String(x.id) === String(_ticketActualId));
  if (!t || t.etapa === 'cerrado') return;
  const idx = ETAPAS.indexOf(t.etapa);
  if (idx < 0 || idx >= ETAPAS.length - 1) return;
  const nuevaEtapa = ETAPAS[idx + 1];
  // Guardar historial del cambio
  const hist = {
    id: _id('MAQTH'),
    ticketIdLocal: t.id,
    etapaAnterior: t.etapa,
    etapaNueva: nuevaEtapa,
    notas: '',
    responsable: currentUser?.nombre || '',
  };
  DB.maquinasTicketHistorial = DB.maquinasTicketHistorial || [];
  DB.maquinasTicketHistorial.push(hist);
  supaSync('maquinasTicketHistorial', hist);
  t.etapa = nuevaEtapa;
  t.etapaInicioEn = new Date().toISOString();
  if (nuevaEtapa === 'cerrado') t.cerradoEn = new Date().toISOString();
  supaSync('maquinasTickets', t);
  // Si se cierra y es resuelto interno o proveedor, volver máquina a activa
  if (nuevaEtapa === 'cerrado') {
    const m = getMaquina(t.maquinaIdLocal);
    if (m && m.estado === 'reparacion') {
      m.estado = 'activa';
      supaSync('maquinas', m);
    }
  }
  _renderTicketDetalle();
  renderMaquinas();
  toast('✓ Etapa → ' + ETAPA_LABEL[nuevaEtapa]);
}

export async function cerrarTicket(id, resolucion, notas) {
  const t = (DB.maquinasTickets || []).find(x => String(x.id) === String(id || _ticketActualId));
  if (!t) return;
  t.etapa = 'cerrado';
  t.resolucion = resolucion || 'interno';
  t.resolucionNotas = notas || '';
  t.cerradoEn = new Date().toISOString();
  await supaSync('maquinasTickets', t);
  // Actualizar acumulado en máquina
  const m = getMaquina(t.maquinaIdLocal);
  if (m) {
    m.reparacionesAcum = (m.reparacionesAcum || 0) + (t.costoRepuestos || 0) + (t.costoProveedor || 0);
    if (m.estado === 'reparacion') m.estado = 'activa';
    await supaSync('maquinas', m);
  }
  renderMaquinas();
  toast('✓ Ticket cerrado');
}

// ========== TAB: BATERÍAS ==========

function renderBateriasMaquinas() {
  const tbody = $('tbody-maq-baterias');
  if (!tbody) return;
  const maqBateria = (DB.maquinas || []).filter(m => !m.anulado && m.energia === 'bateria');
  if (!maqBateria.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.5;">Sin máquinas a batería</td></tr>';
    return;
  }
  const hoy = new Date();
  tbody.innerHTML = maqBateria.map(m => {
    const parts = (m.bateriaColocada || '').split('/');
    let vencimiento = null, diffDias = null, estado = 'OK';
    if (parts.length >= 3) {
      vencimiento = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      vencimiento.setMonth(vencimiento.getMonth() + (m.bateriaVidaUtil || 24));
      diffDias = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));
      if (diffDias < 0) estado = 'VENCIDO';
      else if (diffDias <= 60) estado = 'PRÓXIMO';
    }
    const estadoColor = estado === 'VENCIDO' ? 'var(--rojo)' : estado === 'PRÓXIMO' ? 'var(--naranja)' : 'var(--verde)';
    return `<tr>
      <td style="font-weight:600;">${m.nroMaquina || '—'} · ${m.tipo || ''}</td>
      <td>${m.bateriaTipo || '—'}</td>
      <td style="font-size:12px;">${m.bateriaColocada || '—'}</td>
      <td style="font-size:12px;">${m.bateriaVidaUtil || 24} meses</td>
      <td style="font-size:12px;">${vencimiento ? vencimiento.toLocaleDateString('es-AR') : '—'}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${m.bateriaCosto > 0 ? _money(m.bateriaCosto) : '—'}</td>
      <td style="text-align:center;"><span style="font-size:11px;font-weight:700;color:${estadoColor};">${estado}</span></td>
    </tr>`;
  }).join('');
}

// ========== TAB: ECONÓMICO ==========

function renderEconomicoMaquinas() {
  const cont = $('maq-economico-body');
  if (!cont) return;
  const maqs = (DB.maquinas || []).filter(m => !m.anulado);
  // Costos por servicio
  const porServicio = {};
  maqs.forEach(m => {
    const svc = m.servicioNombre || 'Sin servicio';
    if (!porServicio[svc]) porServicio[svc] = { reparaciones: 0, alquiler: 0, maquinas: 0 };
    porServicio[svc].maquinas++;
    porServicio[svc].alquiler += m.propiedad === 'alquilada' ? (m.costoAlquilerMensual || 0) : 0;
    porServicio[svc].reparaciones += m.reparacionesAcum || 0;
  });
  const totalAlquiler = maqs.reduce((s, m) => s + (m.propiedad === 'alquilada' ? (m.costoAlquilerMensual || 0) : 0), 0);
  const totalReparaciones = maqs.reduce((s, m) => s + (m.reparacionesAcum || 0), 0);

  let html = `<div style="font-size:13px;">
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="background:var(--azul-suave);border-radius:8px;padding:10px 16px;"><strong>Alquiler mensual total:</strong> ${_money(totalAlquiler)}</div>
      <div style="background:var(--azul-suave);border-radius:8px;padding:10px 16px;"><strong>Reparaciones acum.:</strong> ${_money(totalReparaciones)}</div>
    </div>
    <strong>Imputación por servicio</strong>
    <table style="width:100%;font-size:12px;margin-top:8px;">
      <thead><tr><th>Servicio</th><th>Máquinas</th><th style="text-align:right;">Reparaciones</th><th style="text-align:right;">Alquiler</th><th style="text-align:right;">Total</th></tr></thead>
      <tbody>${Object.entries(porServicio).map(([svc, d]) => `<tr>
        <td style="font-weight:500;">${svc}</td>
        <td>${d.maquinas}</td>
        <td style="text-align:right;">${d.reparaciones > 0 ? _money(d.reparaciones) : '—'}</td>
        <td style="text-align:right;">${d.alquiler > 0 ? _money(d.alquiler) : '—'}</td>
        <td style="text-align:right;font-weight:600;">${_money(d.reparaciones + d.alquiler)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p style="font-size:11px;color:var(--texto-suave);margin-top:12px;">La previsión fija vs real se integrará con el módulo Económico (Liquidaciones) cuando se active la conexión.</p>
  </div>`;
  cont.innerHTML = html;
}

// ========== CAMBIO DE TABS PRINCIPAL ==========

let _tabActualMaq = 'padron';

export function cambiarTabMaquinas(tab, btn) {
  _tabActualMaq = tab;
  document.querySelectorAll('#screen-maquinas .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-maquinas .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = $('maq-tab-' + tab);
  if (el) el.classList.add('active');
  if (tab === 'padron') renderPadronMaquinas();
  if (tab === 'tickets') renderTicketsMaquinas();
  if (tab === 'baterias') renderBateriasMaquinas();
  if (tab === 'economico') renderEconomicoMaquinas();
}

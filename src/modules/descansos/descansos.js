// Módulo Descansos (sector operativo) — rehecho de cero (política A.11)
// desde legacy.js (~873-1093, DB.vacOperativo), donde no persistía nada
// en Supabase y solo tenía un estado simple. Ver DISENO_descansos.md.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { esGerenteDeOperaciones, esGerenteDeRRHH, nombreGerenteOperaciones, nombreGerenteRRHH } from './permisos.js';
import { getDescansoById, aprobarOperaciones, rechazarOperaciones, aprobarRRHH, rechazarRRHH, buscarSuperposicionesServicio } from './aprobacion.js';
import { puedeAnularPorSupervisor, puedeAnularPostAprobacion, anularPorSupervisor, anularPostAprobacion } from './anulacion.js';
import { crearNotificacion } from '@shared/notificaciones.js';

export const ESTADOS_FINALES = [
  'Aprobado', 'Rechazado por Operaciones', 'Rechazado por RRHH',
  'Anulado por supervisor', 'Anulado post-aprobación',
];

const ESTADO_BADGE = {
  'Borrador': 'badge-gris',
  'Pendiente aprobación Operaciones': 'badge-acento',
  'Pendiente aprobación RRHH': 'badge-acento',
  'Aprobado': 'badge-verde',
  'Rechazado por Operaciones': 'badge-rojo',
  'Rechazado por RRHH': 'badge-rojo',
  'Anulado por supervisor': 'badge-gris',
  'Anulado post-aprobación': 'badge-gris',
};

// ========== HELPERS ==========

function esOperario(l) {
  return !!l.servicio && l.servicio.trim().toUpperCase() !== 'ADMINISTRATIVO';
}

function calcularAntiguedad(legajo) {
  if (!legajo?.ingreso) return '';
  const p = legajo.ingreso.split('/');
  if (p.length !== 3) return '';
  const años = Math.floor((new Date() - new Date(`${p[2]}-${p[1]}-${p[0]}`)) / (365.25 * 24 * 3600 * 1000));
  return años >= 0 ? `${años} año${años === 1 ? '' : 's'}` : '';
}

function progresoAprobacion(d) {
  if (d.estado === 'Borrador') return '—';
  const opOk = !!d.aprobadoPorOperaciones;
  if (['Pendiente aprobación Operaciones', 'Rechazado por Operaciones'].includes(d.estado)) return opOk ? 'Operaciones ✅' : 'Operaciones ⏳';
  const rrhhOk = !!d.aprobadoPorRrhh;
  return `Operaciones ✅ / RRHH ${rrhhOk ? '✅' : '⏳'}`;
}

function diasDesdeSolicitud(d) {
  const dias = Math.floor((new Date() - new Date(d.fechaSolicitud)) / (24 * 3600 * 1000));
  const color = dias <= 2 ? 'badge-verde' : dias <= 6 ? 'badge-acento' : 'badge-rojo';
  return `<span class="badge ${color}">${dias}d</span>`;
}

function badgeDuracion(dias) {
  if (dias === 7) return '<span class="badge badge-verde">1 semana</span>';
  if (dias === 14) return '<span class="badge badge-verde">2 semanas</span>';
  return `<span class="badge badge-rojo">Duración inválida (${dias}d)</span>`;
}

function btn(label, fn, color) {
  return `<button class="btn btn-xs" style="${color ? `background:${color};color:white;` : ''}" onclick="${fn}">${label}</button>`;
}

function filaDescanso(d, { acciones = [] } = {}) {
  return `<tr>
    <td>${d.nombreOperario}<div style="font-size:11px;color:var(--texto-suave);">N° ${d.nroSocio}</div></td>
    <td><span class="chip">${d.servicio}</span></td>
    <td>${d.supervisor}</td>
    <td>${d.fechaDesde}</td>
    <td>${d.fechaHasta}</td>
    <td>${badgeDuracion(d.duracionDias)}</td>
    <td>${d.reemplazanteNombre || '—'}</td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(d.motivo || '').replace(/"/g, '&quot;')}">${(d.motivo || '').slice(0, 40)}${(d.motivo || '').length > 40 ? '…' : ''}</td>
    <td>${(d.fechaSolicitud || '').slice(0, 10)}</td>
    <td>${diasDesdeSolicitud(d)}</td>
    <td><span class="badge ${ESTADO_BADGE[d.estado] || 'badge-gris'}">${d.estado}</span></td>
    <td style="font-size:11px;">${progresoAprobacion(d)}</td>
    <td style="white-space:nowrap;">${acciones.join(' ')}</td>
  </tr>`;
}

// ========== TAB 1 — PENDIENTES ==========

export function filtrarPendientes() { renderPendientes(); }

export function renderPendientes() {
  const nombre = currentUser?.nombre;
  const esGteOp = esGerenteDeOperaciones(nombre);
  const esGteRRHH = esGerenteDeRRHH(nombre);
  const esRRHHoAdmin = ['RRHH', 'Administrador total'].includes(currentUser?.perfil);

  const NO_FINALES = (DB.descansos || []).filter(d => !d.anulado && !ESTADOS_FINALES.includes(d.estado));
  let bandeja = NO_FINALES.filter(d => d.supervisorSolicitante === nombre);
  bandeja.push(...(DB.descansos || []).filter(d => !d.anulado && d.estado === 'Aprobado' && d.supervisor === nombre && new Date(d.fechaDesde) > new Date()));
  if (esGteOp) bandeja.push(...NO_FINALES.filter(d => d.estado === 'Pendiente aprobación Operaciones'));
  if (esGteRRHH) bandeja.push(...NO_FINALES.filter(d => d.estado === 'Pendiente aprobación RRHH'));
  if (esRRHHoAdmin) bandeja.push(...NO_FINALES);
  bandeja = [...new Map(bandeja.map(d => [d.id, d])).values()];

  const q = ($('desc-pend-buscar') || {}).value?.toLowerCase() || '';
  const fServicio = ($('desc-pend-servicio') || {}).value || '';
  const fSupervisor = ($('desc-pend-supervisor') || {}).value || '';
  const fEstado = ($('desc-pend-estado') || {}).value || '';
  if (q) bandeja = bandeja.filter(d => d.nombreOperario.toLowerCase().includes(q));
  if (fServicio) bandeja = bandeja.filter(d => d.servicio === fServicio);
  if (fSupervisor) bandeja = bandeja.filter(d => d.supervisor === fSupervisor);
  if (fEstado) bandeja = bandeja.filter(d => d.estado === fEstado);
  bandeja.sort((a, b) => new Date(a.fechaSolicitud) - new Date(b.fechaSolicitud));

  const tbody = $('tbody-desc-pendientes');
  if (!tbody) return;
  tbody.innerHTML = bandeja.length === 0
    ? '<tr><td colspan="13" style="text-align:center;padding:32px;opacity:.5;">No hay pedidos pendientes</td></tr>'
    : bandeja.map(d => {
      const acciones = [];
      if (esGteOp && d.estado === 'Pendiente aprobación Operaciones') {
        acciones.push(btn('✅ Aprobar', `aprobarOperacionesPorId('${d.id}')`, '#16a34a'));
        acciones.push(btn('❌ Rechazar', `abrirRechazoOperaciones('${d.id}')`, '#dc2626'));
      }
      if (esGteRRHH && d.estado === 'Pendiente aprobación RRHH') {
        acciones.push(btn('✅ Aprobar', `aprobarRRHHPorId('${d.id}')`, '#16a34a'));
        acciones.push(btn('❌ Rechazar', `abrirRechazoRRHH('${d.id}')`, '#dc2626'));
      }
      if (d.supervisorSolicitante === nombre) {
        if (d.estado === 'Borrador') {
          acciones.push(btn('✏️ Editar', `abrirEditarPedido('${d.id}')`));
          acciones.push(btn('📤 Elevar', `elevarPedido('${d.id}')`, '#1b4fa8'));
        }
        if (puedeAnularPorSupervisor(d)) acciones.push(btn('🗑 Anular', `abrirAnularSupervisor('${d.id}')`));
      }
      if ((esGteOp || esGteRRHH) && puedeAnularPostAprobacion(d)) acciones.push(btn('🗑 Anular', `abrirAnularPostAprobacion('${d.id}')`));
      acciones.push(btn('👁', `abrirDetalleDescanso('${d.id}')`));
      return filaDescanso(d, { acciones });
    }).join('');
}

export function poblarSelectsDescansosTab() {
  const fS = (id, items) => { const el = $(id); if (el) el.innerHTML = '<option value="">Todos</option>' + items.map(s => `<option>${s}</option>`).join(''); };
  fS('desc-pend-servicio', window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : (DB.servicios || []));
  fS('desc-pend-supervisor', DB.supervisores || []);
  fS('desc-hist-servicio', window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : (DB.servicios || []));
  fS('desc-hist-supervisor', DB.supervisores || []);
}

// ========== TAB 2 — HISTORIAL ==========

export function filtrarHistorial() { renderHistorial(); }

export function renderHistorial() {
  let lista = (DB.descansos || []).filter(d => !d.anulado);
  const q = ($('desc-hist-buscar') || {}).value?.toLowerCase() || '';
  const fServicio = ($('desc-hist-servicio') || {}).value || '';
  const fSupervisor = ($('desc-hist-supervisor') || {}).value || '';
  const fEstado = ($('desc-hist-estado') || {}).value || '';
  const fAnio = ($('desc-hist-anio') || {}).value || '';
  if (q) lista = lista.filter(d => d.nombreOperario.toLowerCase().includes(q));
  if (fServicio) lista = lista.filter(d => d.servicio === fServicio);
  if (fSupervisor) lista = lista.filter(d => d.supervisor === fSupervisor);
  if (fEstado) lista = lista.filter(d => d.estado === fEstado);
  if (fAnio) lista = lista.filter(d => new Date(d.fechaDesde).getFullYear() === parseInt(fAnio));
  lista.sort((a, b) => new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud));

  const nombre = currentUser?.nombre;
  const tbody = $('tbody-desc-historial');
  if (!tbody) return;
  tbody.innerHTML = lista.length === 0
    ? '<tr><td colspan="13" style="text-align:center;padding:32px;opacity:.5;">Sin resultados</td></tr>'
    : lista.map(d => {
      const acciones = [btn('👁', `abrirDetalleDescanso('${d.id}')`)];
      if (d.supervisorSolicitante === nombre && puedeAnularPorSupervisor(d)) acciones.push(btn('🗑 Anular', `abrirAnularSupervisor('${d.id}')`));
      return filaDescanso(d, { acciones });
    }).join('');
}

// ========== MODAL — NUEVO PEDIDO / EDITAR BORRADOR ==========

let _pedidoEditandoId = null;

function ensureModalPedido() {
  if ($('modal-desc-pedido')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-desc-pedido';
  m.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-header"><h3>👷 Nuevo pedido de descanso</h3><button class="btn-close" onclick="cerrarModal('modal-desc-pedido')">×</button></div>
      <div class="modal-body">
        <div class="form-section">Operario</div>
        <div class="form-group"><label>Operario *</label>
          <input type="text" id="dp-operario" list="dl-dp-operario" oninput="seleccionarOperarioPedido()">
          <datalist id="dl-dp-operario"></datalist>
        </div>
        <div id="dp-info-operario" style="display:flex;flex-direction:column;gap:6px;font-size:13px;background:var(--fondo);border-radius:var(--radio);padding:12px;margin:8px 0 12px;"></div>
        <div class="form-section">Fechas del descanso</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Fecha desde *</label><input type="date" id="dp-desde" oninput="recalcularPedido()"></div>
          <div class="form-group"><label>Fecha hasta *</label><input type="date" id="dp-hasta" oninput="recalcularPedido()"></div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Duración</label><div id="dp-duracion" style="padding:8px 0;"></div></div>
          <div class="form-group"><label>Fecha de retorno</label><input type="date" id="dp-retorno" readonly style="background:var(--fondo);"></div>
        </div>
        <div id="dp-avisos" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
        <div class="form-section">Motivo y contexto</div>
        <div class="form-group"><label>Motivo del pedido *</label><textarea id="dp-motivo" rows="3"></textarea></div>
        <div class="form-group"><label>Reemplazante (mismo servicio, opcional)</label>
          <input type="text" id="dp-reemplazante" list="dl-dp-reemplazante" oninput="recalcularPedido()">
          <datalist id="dl-dp-reemplazante"></datalist>
        </div>
        <div class="form-group"><label>Observaciones</label><textarea id="dp-obs" rows="2"></textarea></div>
        <div class="form-section">Aprobadores</div>
        <div id="dp-aprobadores" style="font-size:12.5px;color:var(--texto-suave);"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-desc-pedido')">Cancelar</button>
        <button class="btn btn-secondary" onclick="guardarBorradorPedido()">💾 Guardar borrador</button>
        <button class="btn btn-primary" onclick="elevarPedidoDesdeModal()">📤 Elevar para aprobación</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function operariosDisponibles() {
  const nombre = currentUser?.nombre;
  let lista = (DB.legajos || []).filter(l => l.estado === 'Activo' && esOperario(l));
  if (currentUser?.perfil === 'Supervisor') lista = lista.filter(l => l.supervisor === nombre);
  return lista;
}

export function abrirNuevoPedidoDescanso() {
  _pedidoEditandoId = null;
  ensureModalPedido();
  $('dp-operario').value = '';
  $('dp-info-operario').innerHTML = '';
  $('dp-desde').value = '';
  $('dp-hasta').value = '';
  $('dp-duracion').innerHTML = '';
  $('dp-retorno').value = '';
  $('dp-motivo').value = '';
  $('dp-reemplazante').value = '';
  $('dp-obs').value = '';
  $('dl-dp-operario').innerHTML = operariosDisponibles().map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  $('dl-dp-reemplazante').innerHTML = '';
  pintarAprobadoresPedido();
  abrirModal('modal-desc-pedido');
}

export function abrirEditarPedido(idLocal) {
  const d = getDescansoById(idLocal);
  if (!d || d.estado !== 'Borrador') { toast('⚠️ Solo se puede editar un borrador'); return; }
  _pedidoEditandoId = d.id;
  ensureModalPedido();
  $('dp-operario').value = `${d.nombreOperario} (N°${d.nroSocio})`;
  $('dl-dp-operario').innerHTML = operariosDisponibles().map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(d.legajoIdLocal));
  if (legajo) pintarInfoOperario(legajo);
  $('dp-desde').value = d.fechaDesde;
  $('dp-hasta').value = d.fechaHasta;
  $('dp-motivo').value = d.motivo || '';
  $('dp-reemplazante').value = d.reemplazanteNombre || '';
  $('dp-obs').value = d.observaciones || '';
  if (legajo) $('dl-dp-reemplazante').innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo' && l.servicio === legajo.servicio && l.nro !== legajo.nro).map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  pintarAprobadoresPedido();
  recalcularPedido();
  abrirModal('modal-desc-pedido');
}

function pintarInfoOperario(legajo) {
  $('dp-info-operario').innerHTML = `
    <div><strong>${legajo.nombre}</strong> — N° ${legajo.nro}</div>
    <div>Servicio: ${legajo.servicio || '—'} · Supervisor: ${legajo.supervisor || '—'}</div>
    <div>Antigüedad: ${calcularAntiguedad(legajo) || '—'}</div>
    ${!legajo.servicio ? '<div style="color:var(--rojo);">⚠️ Este legajo no tiene servicio cargado. Contactá a RRHH para completarlo.</div>' : ''}
  `;
}

export function seleccionarOperarioPedido() {
  const texto = $('dp-operario').value;
  const match = texto.match(/\(N°(\d+)\)\s*$/);
  if (!match) { $('dp-info-operario').innerHTML = ''; return; }
  const legajo = (DB.legajos || []).find(l => String(l.nro) === match[1]);
  if (!legajo) return;
  pintarInfoOperario(legajo);
  $('dl-dp-reemplazante').innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo' && l.servicio === legajo.servicio && l.nro !== legajo.nro).map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  recalcularPedido();
}

function pintarAprobadoresPedido() {
  $('dp-aprobadores').innerHTML = `Gerente de Operaciones: <strong>${nombreGerenteOperaciones()}</strong> · Gerente de RRHH: <strong>${nombreGerenteRRHH()}</strong>`;
}

export function recalcularPedido() {
  const desde = $('dp-desde').value, hasta = $('dp-hasta').value;
  const avisos = [];
  if (desde && hasta) {
    const d = new Date(desde), h = new Date(hasta);
    if (h >= d) {
      const dias = Math.round((h - d) / (24 * 3600 * 1000)) + 1;
      $('dp-duracion').innerHTML = badgeDuracion(dias);
      const retorno = new Date(h); retorno.setDate(retorno.getDate() + 1);
      $('dp-retorno').value = retorno.toISOString().slice(0, 10);
      if (dias !== 7 && dias !== 14) avisos.push('❌ El descanso debe ser de una semana (7 días) o dos semanas (14 días). Ajustá las fechas.');
      if ((d - new Date()) < 48 * 3600 * 1000) avisos.push('⚠️ Este pedido tiene menos de 48hs de anticipación.');
      const operarioMatch = $('dp-operario').value.match(/\(N°(\d+)\)\s*$/);
      if (operarioMatch) {
        const superpuesto = (DB.descansos || []).some(x => !x.anulado && x.estado === 'Aprobado' && String(x.legajoIdLocal) === operarioMatch[1] && new Date(x.fechaHasta) >= d && new Date(x.fechaDesde) <= h);
        if (superpuesto) avisos.push('❌ Este operario ya tiene un descanso aprobado que se superpone con estas fechas. Anulá el anterior antes de pedir uno nuevo.');
      }
    }
  }
  const reemplazoTexto = ($('dp-reemplazante') || { value: '' }).value;
  const reemplazoMatch = reemplazoTexto.match(/\(N°(\d+)\)\s*$/);
  if (reemplazoMatch && desde && hasta) {
    const superpuestoReemplazo = (DB.descansos || []).some(x => !x.anulado && x.estado === 'Aprobado' && String(x.legajoIdLocal) === reemplazoMatch[1] && new Date(x.fechaHasta) >= new Date(desde) && new Date(x.fechaDesde) <= new Date(hasta));
    if (superpuestoReemplazo) avisos.push('🔁 El reemplazante propuesto tiene un descanso esos días. ¿Elegir otro?');
  }
  $('dp-avisos').innerHTML = avisos.map(a => `<div style="padding:8px 10px;background:${a.startsWith('❌') ? 'var(--rojo-suave,#fee2e2)' : 'var(--naranja-suave,#fef3c7)'};border:1px solid ${a.startsWith('❌') ? '#f5c6c0' : '#fcd34d'};border-radius:6px;font-size:12.5px;">${a}</div>`).join('');
}

function validarPedido(legajo) {
  if (!legajo) { toast('⚠️ Elegí un operario de la lista'); return false; }
  if (!$('dp-desde').value || !$('dp-hasta').value) { toast('⚠️ Completá las fechas'); return false; }
  if (new Date($('dp-hasta').value) < new Date($('dp-desde').value)) { toast('⚠️ La fecha hasta debe ser posterior a la fecha desde'); return false; }
  if (!$('dp-motivo').value.trim()) { toast('⚠️ El motivo es obligatorio'); return false; }
  return true;
}

function validarDuracionYSuperposicion(legajo) {
  const dias = Math.round((new Date($('dp-hasta').value) - new Date($('dp-desde').value)) / (24 * 3600 * 1000)) + 1;
  if (dias !== 7 && dias !== 14) { toast('❌ El descanso debe ser de 7 o 14 días'); return false; }
  const superpuesto = (DB.descansos || []).some(x => !x.anulado && x.estado === 'Aprobado' && String(x.legajoIdLocal) === String(legajo.nro) && String(x.id) !== String(_pedidoEditandoId) && new Date(x.fechaHasta) >= new Date($('dp-desde').value) && new Date(x.fechaDesde) <= new Date($('dp-hasta').value));
  if (superpuesto) { toast('❌ Este operario ya tiene un descanso aprobado que se superpone con estas fechas'); return false; }
  return true;
}

function legajoDelOperarioElegido() {
  const match = $('dp-operario').value.match(/\(N°(\d+)\)\s*$/);
  if (!match) return null;
  return (DB.legajos || []).find(l => String(l.nro) === match[1]) || null;
}

function armarObjetoPedido(legajo, estado) {
  const dias = Math.round((new Date($('dp-hasta').value) - new Date($('dp-desde').value)) / (24 * 3600 * 1000)) + 1;
  const reemplazoTexto = $('dp-reemplazante').value;
  const reemplazoMatch = reemplazoTexto.match(/^(.*)\s\(N°(\d+)\)\s*$/);
  return {
    id: _pedidoEditandoId || Date.now(),
    legajoIdLocal: String(legajo.nro),
    nroSocio: String(legajo.nro),
    nombreOperario: legajo.nombre,
    servicio: legajo.servicio,
    supervisor: legajo.supervisor,
    supervisorSolicitante: currentUser?.nombre || '',
    fechaSolicitud: _pedidoEditandoId ? undefined : new Date().toISOString(),
    fechaDesde: $('dp-desde').value,
    fechaHasta: $('dp-hasta').value,
    duracionDias: dias,
    fechaRetorno: $('dp-retorno').value,
    motivo: $('dp-motivo').value.trim(),
    reemplazanteLegajoIdLocal: reemplazoMatch ? reemplazoMatch[2] : '',
    reemplazanteNombre: reemplazoMatch ? reemplazoMatch[1] : (reemplazoTexto || ''),
    observaciones: $('dp-obs').value,
    estado,
  };
}

export async function guardarBorradorPedido() {
  const legajo = legajoDelOperarioElegido();
  if (!validarPedido(legajo)) return;
  const d = armarObjetoPedido(legajo, 'Borrador');
  if (_pedidoEditandoId) {
    const existente = getDescansoById(_pedidoEditandoId);
    Object.assign(existente, d, { fechaSolicitud: existente.fechaSolicitud });
    await supaSync('descansos', existente);
  } else {
    if (!DB.descansos) DB.descansos = [];
    DB.descansos.push(d);
    await supaSync('descansos', d);
  }
  cerrarModal('modal-desc-pedido');
  renderPendientes();
  toast('💾 Borrador guardado');
}

export async function elevarPedidoDesdeModal() {
  const legajo = legajoDelOperarioElegido();
  if (!validarPedido(legajo) || !validarDuracionYSuperposicion(legajo)) return;
  const d = armarObjetoPedido(legajo, 'Pendiente aprobación Operaciones');
  let registro;
  if (_pedidoEditandoId) {
    registro = getDescansoById(_pedidoEditandoId);
    Object.assign(registro, d, { fechaSolicitud: registro.fechaSolicitud });
  } else {
    registro = d;
    if (!DB.descansos) DB.descansos = [];
    DB.descansos.push(registro);
  }
  await supaSync('descansos', registro);
  await crearNotificacion({ tipo: 'descanso_solicitado', entidadTipo: 'descanso', entidadIdLocal: registro.id, destinatarioNombre: nombreGerenteOperaciones(), mensaje: `👷 ${legajo.nombre} tiene un pedido de descanso nuevo (${registro.fechaDesde} a ${registro.fechaHasta}).` });
  cerrarModal('modal-desc-pedido');
  renderPendientes();
  toast('📤 Pedido elevado — esperando a Operaciones');
}

export async function elevarPedido(idLocal) {
  const d = getDescansoById(idLocal);
  if (!d || d.estado !== 'Borrador') return;
  if (d.duracionDias !== 7 && d.duracionDias !== 14) { toast('❌ El descanso debe ser de 7 o 14 días — editalo antes de elevar'); return; }
  d.estado = 'Pendiente aprobación Operaciones';
  await supaSync('descansos', d);
  await crearNotificacion({ tipo: 'descanso_solicitado', entidadTipo: 'descanso', entidadIdLocal: d.id, destinatarioNombre: nombreGerenteOperaciones(), mensaje: `👷 ${d.nombreOperario} tiene un pedido de descanso nuevo (${d.fechaDesde} a ${d.fechaHasta}).` });
  renderPendientes();
  toast('📤 Pedido elevado — esperando a Operaciones');
}

// ========== ACCIONES DE FILA ==========

export async function aprobarOperacionesPorId(idLocal) {
  // Soft warning de superposición por servicio (§10.4) — se avisa ANTES
  // de aprobar, sobre el estado actual (todavía no incluye este pedido
  // como "Aprobado"), no bloquea.
  const d = getDescansoById(idLocal);
  if (d) {
    const superpuestos = buscarSuperposicionesServicio(d.servicio, d.fechaDesde, d.fechaHasta, d.id);
    if (superpuestos.length && !confirm(`⚠️ Hay ${superpuestos.length} descanso(s) aprobado(s) del mismo servicio (${d.servicio}) que se superponen con estas fechas. ¿Aprobar igual?`)) return;
  }
  await aprobarOperaciones(idLocal);
  renderPendientes();
}

export function aprobarRRHHPorId(idLocal) { aprobarRRHH(idLocal).then(renderPendientes); }

export function abrirRechazoOperaciones(idLocal) {
  const motivo = prompt('Motivo del rechazo (obligatorio):');
  if (motivo === null) return;
  rechazarOperaciones(idLocal, motivo).then(renderPendientes);
}

export function abrirRechazoRRHH(idLocal) {
  const motivo = prompt('Motivo del rechazo (obligatorio):');
  if (motivo === null) return;
  rechazarRRHH(idLocal, motivo).then(renderPendientes);
}

export function abrirAnularSupervisor(idLocal) {
  if (!confirm('¿Anular este descanso?')) return;
  anularPorSupervisor(idLocal).then(() => { renderPendientes(); renderHistorial(); });
}

export function abrirAnularPostAprobacion(idLocal) {
  const motivo = prompt('Motivo de la anulación (obligatorio):');
  if (motivo === null) return;
  anularPostAprobacion(idLocal, motivo).then(() => { renderPendientes(); renderHistorial(); });
}

// ========== MODAL DE DETALLE (solo lectura) ==========

function ensureModalDetalle() {
  if ($('modal-desc-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-desc-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3>👷 Detalle del descanso</h3><button class="btn-close" onclick="cerrarModal('modal-desc-detalle')">×</button></div>
      <div class="modal-body" id="dd-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-desc-detalle')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleDescanso(idLocal) {
  const d = getDescansoById(idLocal);
  if (!d) return;
  ensureModalDetalle();
  $('dd-cuerpo').innerHTML = `
    <div class="info-item"><div class="key">Operario</div><div class="val">${d.nombreOperario} — N° ${d.nroSocio} — ${d.servicio}</div></div>
    <div class="info-item"><div class="key">Supervisor</div><div class="val">${d.supervisor} (solicitado por ${d.supervisorSolicitante})</div></div>
    <div class="info-item"><div class="key">Fechas</div><div class="val">${d.fechaDesde} a ${d.fechaHasta} (${d.duracionDias} días) — retorno ${d.fechaRetorno}</div></div>
    <div class="info-item"><div class="key">Motivo</div><div class="val" style="white-space:pre-wrap;">${d.motivo}</div></div>
    ${d.reemplazanteNombre ? `<div class="info-item"><div class="key">Reemplazante</div><div class="val">${d.reemplazanteNombre}</div></div>` : ''}
    <div class="info-item"><div class="key">Estado</div><div class="val"><span class="badge ${ESTADO_BADGE[d.estado] || 'badge-gris'}">${d.estado}</span></div></div>
    ${d.aprobadoPorOperaciones ? `<div class="info-item"><div class="key">Operaciones</div><div class="val">Aprobado por ${d.aprobadoPorOperaciones}</div></div>` : ''}
    ${d.motivoRechazoOperaciones ? `<div class="info-item"><div class="key">Motivo rechazo Operaciones</div><div class="val">${d.motivoRechazoOperaciones}</div></div>` : ''}
    ${d.aprobadoPorRrhh ? `<div class="info-item"><div class="key">RRHH</div><div class="val">Aprobado por ${d.aprobadoPorRrhh}</div></div>` : ''}
    ${d.motivoRechazoRrhh ? `<div class="info-item"><div class="key">Motivo rechazo RRHH</div><div class="val">${d.motivoRechazoRrhh}</div></div>` : ''}
    ${d.observaciones ? `<div class="info-item"><div class="key">Observaciones</div><div class="val">${d.observaciones}</div></div>` : ''}
    ${d.motivoAnulacion ? `<div class="info-item"><div class="key">Anulación</div><div class="val">${d.anuladoPor}: ${d.motivoAnulacion}</div></div>` : ''}
  `;
  abrirModal('modal-desc-detalle');
}

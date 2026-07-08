// Módulo Vacaciones (sector administrativo) — rehecho de cero (política
// A.11) desde legacy.js (~873-1093), donde no persistía nada en Supabase.
// Ver DISENO_vacaciones.md para la especificación completa.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { SECTORES_ADMIN } from '@modules/legajos/index.js';
import { gerenteDeSector, rolEnConsejo, nombresConsejo } from './permisos.js';
import { diasDisponibles, calcularAntiguedad, tieneSuperposicion, calcularDiasAsignadosPorAntiguedad, buscarSuperposicionesSector } from './saldo.js';
import { aprobarComoGerente, rechazarComoGerente, votarConsejo, getVacacionById } from './aprobacion.js';
import { puedeAnularSolicitante, puedeAnularGerente, puedeSolicitarAnulacion, anularPorSolicitante, anularPorGerente, solicitarAnulacion, votarAnulacionConsejo } from './anulacion.js';
import { crearNotificacion } from '@shared/notificaciones.js';

export const ESTADOS_FINALES = [
  'Aprobada', 'Rechazada por Gerente', 'Rechazada por Consejo',
  'Anulada por solicitante', 'Anulada por Gerente', 'Anulada por Consejo',
  'Anulación rechazada por Consejo',
];

const ESTADO_BADGE = {
  'Borrador': 'badge-gris',
  'Pendiente aprobación Gerente': 'badge-acento',
  'Pendiente aprobación Consejo': 'badge-acento',
  'Aprobada': 'badge-verde',
  'Rechazada por Gerente': 'badge-rojo',
  'Rechazada por Consejo': 'badge-rojo',
  'Anulada por solicitante': 'badge-gris',
  'Anulada por Gerente': 'badge-gris',
  'Solicitud de anulación pendiente': 'badge-naranja',
  'Anulada por Consejo': 'badge-gris',
  'Anulación rechazada por Consejo': 'badge-verde',
};

// ========== HELPERS ==========

// Vincula el usuario logueado con su legajo por nombre — no hay otro
// puente hoy entre `usuarios` (auth) y `legajos` (ver DISENO_vacaciones.md,
// no estaba resuelto en el diseño original).
function legajoDelUsuarioActual() {
  return (DB.legajos || []).find(l => l.nombre === currentUser?.nombre);
}

// Vacaciones v1.1 — parsear con hora explícita para que .getDay() no se
// corra por el huso horario: 'YYYY-MM-DD' sin hora se interpreta como
// UTC medianoche, y en Argentina (UTC-3) eso cae en el día anterior.
function esLunes(fechaISO) {
  return !!fechaISO && new Date(fechaISO + 'T00:00:00').getDay() === 1;
}
function esDomingo(fechaISO) {
  return !!fechaISO && new Date(fechaISO + 'T00:00:00').getDay() === 0;
}
function diasDeAnticipacion(fechaDesdeISO) {
  return Math.floor((new Date(fechaDesdeISO + 'T00:00:00') - new Date()) / (24 * 3600 * 1000));
}

function progresoAprobacion(v) {
  if (v.estado === 'Borrador') return '—';
  const gerenteOk = !!v.aprobadoPorGerente;
  if (['Pendiente aprobación Gerente', 'Rechazada por Gerente', 'Anulada por Gerente'].includes(v.estado)) {
    return gerenteOk ? 'Gerente ✅' : 'Gerente ⏳';
  }
  const votos = [v.votoPresidente, v.votoTesorero, v.votoSecretario].filter(x => x != null && x !== '').length;
  return `Gerente ✅ / Consejo ${votos}/2`;
}

function diasDesdeSolicitud(v) {
  const dias = Math.floor((new Date() - new Date(v.fechaSolicitud)) / (24 * 3600 * 1000));
  const color = dias <= 2 ? 'badge-verde' : dias <= 6 ? 'badge-acento' : 'badge-rojo';
  return `<span class="badge ${color}">${dias}d</span>`;
}

function chipsAlerta(v) {
  const chips = [];
  const desde = new Date(v.fechaSolicitud), hastaDesde = new Date(v.fechaDesde);
  if ((hastaDesde - desde) < 48 * 3600 * 1000 && v.estado !== 'Borrador') chips.push('<span class="badge badge-naranja">⏱️ &lt;48hs</span>');
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(v.legajoIdLocal));
  if (legajo && diasDisponibles(legajo, new Date(v.fechaDesde).getFullYear()) < 0) chips.push('<span class="badge badge-rojo">📊 Excede saldo</span>');
  if (legajo?.jefeDirectoLegajoIdLocal && tieneSuperposicion(legajo.jefeDirectoLegajoIdLocal, v.fechaDesde, v.fechaHasta)) chips.push('<span class="badge badge-naranja">👔 Superpone con jefe</span>');
  if (tieneSuperposicion(v.reemplazanteLegajoIdLocal, v.fechaDesde, v.fechaHasta)) chips.push('<span class="badge badge-naranja">🔁 Reemplazante ocupado</span>');
  return chips.join(' ') || '—';
}

function filaVacacion(v, { acciones = [] } = {}) {
  return `<tr>
    <td>${v.nombreAsociado}<div style="font-size:11px;color:var(--texto-suave);">N° ${v.nroSocio}</div></td>
    <td><span class="chip">${v.sector}</span></td>
    <td>${v.fechaDesde}</td>
    <td>${v.fechaHasta}</td>
    <td>${v.diasSolicitados}</td>
    <td>${v.reemplazanteNombre}</td>
    <td>${(v.fechaSolicitud || '').slice(0, 10)}</td>
    <td>${diasDesdeSolicitud(v)}</td>
    <td><span class="badge ${ESTADO_BADGE[v.estado] || 'badge-gris'}">${v.estado}</span></td>
    <td style="font-size:11px;">${progresoAprobacion(v)}</td>
    <td>${chipsAlerta(v)}</td>
    <td style="white-space:nowrap;">${acciones.join(' ')}</td>
  </tr>`;
}

function btn(label, fn, color) {
  return `<button class="btn btn-xs" style="${color ? `background:${color};color:white;` : ''}" onclick="${fn}">${label}</button>`;
}

// ========== TAB 1 — PENDIENTES ==========

export function filtrarPendientes() { renderPendientes(); }

export function renderPendientes() {
  const nombre = currentUser?.nombre;
  const sector = legajoDelUsuarioActual()?.sector;
  const rolConsejo = rolEnConsejo(nombre);
  const esGerente = sector && gerenteDeSector(sector) === nombre;
  const esRRHHoAdmin = ['RRHH', 'Administrador total'].includes(currentUser?.perfil);

  const NO_FINALES = (DB.vacaciones || []).filter(v => !v.anulado && !ESTADOS_FINALES.includes(v.estado));
  const propias = NO_FINALES.filter(v => v.nombreAsociado === nombre);
  let bandeja = [...propias];

  if (esGerente) {
    bandeja.push(...NO_FINALES.filter(v => v.sector === sector && v.estado === 'Pendiente aprobación Gerente' && v.nombreAsociado !== nombre));
  }
  if (rolConsejo) {
    const campoVoto = { Presidente: 'votoPresidente', Tesorero: 'votoTesorero', Secretario: 'votoSecretario' }[rolConsejo];
    bandeja.push(...NO_FINALES.filter(v => v.estado === 'Pendiente aprobación Consejo' && !v[campoVoto] && v.nombreAsociado !== nombre));
    const campoVotoAnul = { Presidente: 'votoAnulPresidente', Tesorero: 'votoAnulTesorero', Secretario: 'votoAnulSecretario' }[rolConsejo];
    bandeja.push(...NO_FINALES.filter(v => v.estado === 'Solicitud de anulación pendiente' && !v[campoVotoAnul] && v.nombreAsociado !== nombre));
  }
  if (esRRHHoAdmin) {
    bandeja.push(...NO_FINALES);
  }
  // Dedup por id
  bandeja = [...new Map(bandeja.map(v => [v.id, v])).values()];

  // Filtros
  const q = ($('vac-pend-buscar') || {}).value?.toLowerCase() || '';
  const fSector = ($('vac-pend-sector') || {}).value || '';
  const fEstado = ($('vac-pend-estado') || {}).value || '';
  if (q) bandeja = bandeja.filter(v => v.nombreAsociado.toLowerCase().includes(q));
  if (fSector) bandeja = bandeja.filter(v => v.sector === fSector);
  if (fEstado) bandeja = bandeja.filter(v => v.estado === fEstado);

  bandeja.sort((a, b) => new Date(a.fechaSolicitud) - new Date(b.fechaSolicitud));

  const tbody = $('tbody-vac-pendientes');
  if (!tbody) return;
  tbody.innerHTML = bandeja.length === 0
    ? '<tr><td colspan="12" style="text-align:center;padding:32px;opacity:.5;">No hay solicitudes pendientes</td></tr>'
    : bandeja.map(v => {
      const acciones = [];
      const esPropia = v.nombreAsociado === nombre;
      if (esGerente && v.sector === sector && v.estado === 'Pendiente aprobación Gerente' && !esPropia) {
        acciones.push(btn('✅ Aprobar', `aprobarComoGerentePorId('${v.id}')`, '#16a34a'));
        acciones.push(btn('❌ Rechazar', `abrirRechazoGerente('${v.id}')`, '#dc2626'));
      }
      if (rolConsejo && v.estado === 'Pendiente aprobación Consejo' && !esPropia) {
        acciones.push(btn('✅ Aprobar', `votarConsejoPorId('${v.id}','Aprobar')`, '#16a34a'));
        acciones.push(btn('❌ Rechazar', `abrirRechazoConsejo('${v.id}')`, '#dc2626'));
      }
      if (rolConsejo && v.estado === 'Solicitud de anulación pendiente' && !esPropia) {
        acciones.push(btn('🚫 Invalidar', `votarAnulacionPorId('${v.id}','Invalidar')`, '#dc2626'));
        acciones.push(btn('✔️ Mantener', `votarAnulacionPorId('${v.id}','Mantener')`, '#16a34a'));
      }
      if (esPropia) {
        if (v.estado === 'Borrador') {
          acciones.push(btn('✏️ Editar', `abrirEditarSolicitud('${v.id}')`));
          acciones.push(btn('📤 Elevar', `elevarSolicitud('${v.id}')`, '#1b4fa8'));
        }
        if (puedeAnularSolicitante(v)) acciones.push(btn('🗑 Anular', `abrirAnularSolicitante('${v.id}')`));
      }
      if (esGerente && puedeAnularGerente(v) && v.sector === sector) acciones.push(btn('🗑 Anular', `abrirAnularGerente('${v.id}')`));
      if (esRRHHoAdmin && v.estado === 'Borrador' && v.requiereAutorizacionPreavisoCorto) {
        acciones.push(btn('✅ Autorizar preaviso corto', `autorizarPreavisoCorto('${v.id}')`, '#7c3aed'));
      }
      acciones.push(btn('👁', `abrirDetalleVacacion('${v.id}')`));
      return filaVacacion(v, { acciones });
    }).join('');
}

export function poblarSelectsVacacionesTab() {
  const fS = (id) => { const el = $(id); if (el) el.innerHTML = '<option value="">Todos</option>' + SECTORES_ADMIN.map(s => `<option>${s}</option>`).join(''); };
  fS('vac-pend-sector'); fS('vac-hist-sector');
}

// ========== TAB 2 — HISTORIAL ==========

export function filtrarHistorial() { renderHistorial(); }

export function renderHistorial() {
  let lista = (DB.vacaciones || []).filter(v => !v.anulado);
  const q = ($('vac-hist-buscar') || {}).value?.toLowerCase() || '';
  const fSector = ($('vac-hist-sector') || {}).value || '';
  const fEstado = ($('vac-hist-estado') || {}).value || '';
  const fAnio = ($('vac-hist-anio') || {}).value || '';
  if (q) lista = lista.filter(v => v.nombreAsociado.toLowerCase().includes(q));
  if (fSector) lista = lista.filter(v => v.sector === fSector);
  if (fEstado) lista = lista.filter(v => v.estado === fEstado);
  if (fAnio) lista = lista.filter(v => new Date(v.fechaDesde).getFullYear() === parseInt(fAnio));
  lista.sort((a, b) => new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud));

  const tbody = $('tbody-vac-historial');
  if (!tbody) return;
  tbody.innerHTML = lista.length === 0
    ? '<tr><td colspan="12" style="text-align:center;padding:32px;opacity:.5;">Sin resultados</td></tr>'
    : lista.map(v => {
      const acciones = [btn('👁', `abrirDetalleVacacion('${v.id}')`)];
      if (v.nombreAsociado === currentUser?.nombre && puedeSolicitarAnulacion(v)) {
        acciones.push(btn('🚫 Solicitar anulación', `abrirSolicitarAnulacion('${v.id}')`, '#b45309'));
      }
      return filaVacacion(v, { acciones });
    }).join('');
}

// ========== MODAL — NUEVA SOLICITUD / EDITAR BORRADOR ==========

let _solicitudEditandoId = null;

function ensureModalSolicitud() {
  if ($('modal-vac-solicitud')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-vac-solicitud';
  m.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-header"><h3>🏖️ Nueva solicitud de vacaciones</h3><button class="btn-close" onclick="cerrarModal('modal-vac-solicitud')">×</button></div>
      <div class="modal-body">
        <div class="form-section">Solicitante</div>
        <div id="vs-info-solicitante" style="display:flex;flex-direction:column;gap:6px;font-size:13px;background:var(--fondo);border-radius:var(--radio);padding:12px;margin-bottom:12px;"></div>
        <div class="form-section">Fechas del pedido</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Fecha desde *</label><input type="date" id="vs-desde" oninput="recalcularSolicitud()"></div>
          <div class="form-group"><label>Fecha hasta *</label><input type="date" id="vs-hasta" oninput="recalcularSolicitud()"></div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Días</label><input type="number" id="vs-dias" readonly style="background:var(--fondo);"></div>
          <div class="form-group"><label>Fecha de retorno</label><input type="date" id="vs-retorno" readonly style="background:var(--fondo);"></div>
        </div>
        <div id="vs-avisos" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
        <div class="form-section">Cobertura</div>
        <div class="form-group"><label>Reemplazante * (mismo sector)</label>
          <input type="text" id="vs-reemplazante" list="dl-vs-reemplazante" oninput="recalcularSolicitud()">
          <datalist id="dl-vs-reemplazante"></datalist>
        </div>
        <div class="form-group"><label>Descripción del reemplazo</label><textarea id="vs-desc-reemplazo" rows="2"></textarea></div>
        <div class="form-group"><label>Observaciones</label><textarea id="vs-obs" rows="2"></textarea></div>
        <div class="form-section">Aprobadores</div>
        <div id="vs-aprobadores" style="font-size:12.5px;color:var(--texto-suave);"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-vac-solicitud')">Cancelar</button>
        <button class="btn btn-secondary" onclick="guardarBorradorSolicitud()">💾 Guardar borrador</button>
        <button class="btn btn-primary" onclick="elevarSolicitudDesdeModal()">📤 Elevar para aprobación</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirNuevaSolicitud() {
  const legajo = legajoDelUsuarioActual();
  if (!legajo) { toast('⚠️ No encontramos tu legajo — contactá a RRHH'); return; }
  if (!legajo.sector) { toast('⚠️ Tu legajo no tiene sector cargado — contactá a RRHH para completarlo'); return; }
  _solicitudEditandoId = null;
  ensureModalSolicitud();
  pintarSolicitanteEnModal(legajo);
  $('vs-desde').value = '';
  $('vs-hasta').value = '';
  $('vs-dias').value = '';
  $('vs-retorno').value = '';
  $('vs-reemplazante').value = '';
  $('vs-desc-reemplazo').value = '';
  $('vs-obs').value = '';
  poblarReemplazantes(legajo);
  pintarAprobadores(legajo);
  abrirModal('modal-vac-solicitud');
}

export function abrirEditarSolicitud(idLocal) {
  const v = getVacacionById(idLocal);
  if (!v || v.estado !== 'Borrador') { toast('⚠️ Solo se puede editar un borrador'); return; }
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(v.legajoIdLocal));
  if (!legajo) return;
  _solicitudEditandoId = v.id;
  ensureModalSolicitud();
  pintarSolicitanteEnModal(legajo);
  $('vs-desde').value = v.fechaDesde;
  $('vs-hasta').value = v.fechaHasta;
  $('vs-reemplazante').value = v.reemplazanteNombre;
  $('vs-desc-reemplazo').value = v.descripcionReemplazo || '';
  $('vs-obs').value = v.observaciones || '';
  poblarReemplazantes(legajo);
  pintarAprobadores(legajo);
  recalcularSolicitud();
  abrirModal('modal-vac-solicitud');
}

function pintarSolicitanteEnModal(legajo) {
  const anio = new Date().getFullYear();
  const disponibles = diasDisponibles(legajo, anio);
  const asignados = calcularDiasAsignadosPorAntiguedad(legajo);
  const origen = legajo.diasVacacionesAnuales > 0
    ? 'asignados manualmente por RRHH'
    : `por antigüedad de ${calcularAntiguedad(legajo) || '—'}`;
  $('vs-info-solicitante').innerHTML = `
    <div><strong>${legajo.nombre}</strong> — N° ${legajo.nro} — ${legajo.sector}</div>
    <div>Antigüedad: ${calcularAntiguedad(legajo) || '—'}</div>
    <div>Días asignados ${anio}: ${asignados} (${origen}) · Días disponibles: <strong>${disponibles}</strong></div>
    ${!asignados ? '<div style="color:var(--rojo);">⚠️ No se pudo calcular tus días asignados (falta la fecha de ingreso en tu legajo). Contactá a RRHH.</div>' : ''}
  `;
}

function poblarReemplazantes(legajo) {
  const dl = $('dl-vs-reemplazante');
  if (!dl) return;
  dl.innerHTML = (DB.legajos || [])
    .filter(l => l.estado === 'Activo' && l.sector === legajo.sector && l.nro !== legajo.nro)
    .map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
}

function pintarAprobadores(legajo) {
  const gerente = gerenteDeSector(legajo.sector) || '—';
  const { presidente, tesorero, secretario } = nombresConsejo();
  const avisoConsejo = rolEnConsejo(legajo.nombre)
    ? '<div style="color:var(--naranja);margin-top:6px;">⚠️ Como miembro del Consejo, no votarás sobre tu propia solicitud. Necesita la aprobación de los otros 2 miembros.</div>' : '';
  $('vs-aprobadores').innerHTML = `Gerente: <strong>${gerente}</strong> · Consejo: ${presidente}, ${tesorero}, ${secretario}${avisoConsejo}`;
}

export function recalcularSolicitud() {
  const desde = $('vs-desde').value, hasta = $('vs-hasta').value;
  const avisos = [];
  if (desde && hasta) {
    const d = new Date(desde), h = new Date(hasta);
    if (h >= d) {
      const dias = Math.round((h - d) / (24 * 3600 * 1000)) + 1;
      $('vs-dias').value = dias;
      const retorno = new Date(h); retorno.setDate(retorno.getDate() + 1);
      $('vs-retorno').value = retorno.toISOString().slice(0, 10);
      if (d.getFullYear() !== h.getFullYear()) avisos.push('❌ Las vacaciones no pueden cruzar el fin de año. Dividí en dos solicitudes.');
      // Vacaciones v1.1 — política oficial: desde debe ser lunes, hasta
      // domingo (semana completa), y mínimo 15 días de anticipación para
      // poder elevar. Acá solo se informa; el bloqueo real es al elevar
      // (ver validarSolicitud/elevarSolicitudDesdeModal) porque el
      // borrador tiene que poder guardarse igual con fechas incompletas.
      if (!esLunes(desde)) avisos.push('❌ Las vacaciones deben comenzar un día lunes.');
      if (!esDomingo(hasta)) avisos.push('❌ Las vacaciones deben terminar un día domingo (semana completa).');
      const anticipacion = diasDeAnticipacion(desde);
      if (anticipacion < 15) avisos.push(`⚠️ Este pedido tiene ${anticipacion} día(s) de anticipación — la política exige mínimo 15. Se puede guardar como borrador, pero para elevarlo RRHH tiene que autorizar la excepción.`);
      const legajo = legajoDelUsuarioActual();
      if (legajo) {
        const disponibles = diasDisponibles(legajo, d.getFullYear());
        if (dias > disponibles) avisos.push(`⚠️ Este pedido excede tu saldo disponible en ${dias - disponibles} día(s). Podés elevarlo si el gerente aprueba en excepción.`);
      }
    }
  }
  const reemplazoTexto = ($('vs-reemplazante') || { value: '' }).value;
  const reemplazoMatch = reemplazoTexto.match(/\(N°(\d+)\)\s*$/);
  if (reemplazoMatch && desde && hasta && tieneSuperposicion(reemplazoMatch[1], desde, hasta)) {
    avisos.push('🔁 El reemplazante propuesto tiene vacaciones esos días. ¿Elegir otro?');
  }
  $('vs-avisos').innerHTML = avisos.map(a => `<div style="padding:8px 10px;background:var(--naranja-suave,#fef3c7);border:1px solid #fcd34d;border-radius:6px;font-size:12.5px;">${a}</div>`).join('');
}

function armarObjetoSolicitud(legajo, estado) {
  const reemplazoTexto = $('vs-reemplazante').value;
  const reemplazoMatch = reemplazoTexto.match(/^(.*)\s\(N°(\d+)\)\s*$/);
  const desde = $('vs-desde').value, hasta = $('vs-hasta').value;
  const dias = parseInt($('vs-dias').value) || 0;
  return {
    id: _solicitudEditandoId || Date.now(),
    legajoIdLocal: String(legajo.nro),
    nroSocio: String(legajo.nro),
    nombreAsociado: legajo.nombre,
    sector: legajo.sector,
    fechaSolicitud: _solicitudEditandoId ? undefined : new Date().toISOString(),
    fechaDesde: desde,
    fechaHasta: hasta,
    diasSolicitados: dias,
    fechaRetorno: $('vs-retorno').value,
    reemplazanteLegajoIdLocal: reemplazoMatch ? reemplazoMatch[2] : '',
    reemplazanteNombre: reemplazoMatch ? reemplazoMatch[1] : reemplazoTexto,
    descripcionReemplazo: $('vs-desc-reemplazo').value,
    observaciones: $('vs-obs').value,
    estado,
  };
}

function validarSolicitud(legajo) {
  if (!$('vs-desde').value || !$('vs-hasta').value) { toast('⚠️ Completá las fechas'); return false; }
  if (new Date($('vs-hasta').value) < new Date($('vs-desde').value)) { toast('⚠️ La fecha hasta debe ser posterior a la fecha desde'); return false; }
  if (new Date($('vs-desde').value).getFullYear() !== new Date($('vs-hasta').value).getFullYear()) { toast('❌ No se puede cruzar el fin de año — dividí en dos solicitudes'); return false; }
  // Vacaciones v1.1 — política oficial: siempre lunes a domingo (semana completa).
  if (!esLunes($('vs-desde').value)) { toast('❌ Las vacaciones deben comenzar un día lunes'); return false; }
  if (!esDomingo($('vs-hasta').value)) { toast('❌ Las vacaciones deben terminar un día domingo (semana completa)'); return false; }
  if (!$('vs-reemplazante').value.trim()) { toast('⚠️ Indicá quién te reemplaza'); return false; }
  const reemplazoMatch = $('vs-reemplazante').value.match(/\(N°(\d+)\)\s*$/);
  if (!reemplazoMatch) { toast('⚠️ Elegí un reemplazante de la lista'); return false; }
  if (reemplazoMatch[1] === String(legajo.nro)) { toast('⚠️ El reemplazante no puede ser vos mismo'); return false; }
  return true;
}

export async function guardarBorradorSolicitud() {
  const legajo = legajoDelUsuarioActual();
  if (!legajo || !validarSolicitud(legajo)) return;
  const v = armarObjetoSolicitud(legajo, 'Borrador');
  if (_solicitudEditandoId) {
    const existente = getVacacionById(_solicitudEditandoId);
    Object.assign(existente, v, { fechaSolicitud: existente.fechaSolicitud });
    await supaSync('vacaciones', existente);
  } else {
    if (!DB.vacaciones) DB.vacaciones = [];
    DB.vacaciones.push(v);
    await supaSync('vacaciones', v);
  }
  cerrarModal('modal-vac-solicitud');
  renderPendientes();
  toast('💾 Borrador guardado');
}

export async function elevarSolicitudDesdeModal() {
  const legajo = legajoDelUsuarioActual();
  if (!legajo || !validarSolicitud(legajo)) return;
  if (!calcularDiasAsignadosPorAntiguedad(legajo)) { toast('⚠️ No se pudieron calcular tus días asignados — no se puede elevar. Contactá a RRHH.'); return; }

  // Vacaciones v1.1 — Cambio 1: mínimo 15 días de anticipación para
  // elevar. Con menos, queda guardado como Borrador marcado para que
  // RRHH autorice la excepción (autorizarPreavisoCorto), en vez de
  // bloquear directamente.
  const requierePreaviso = diasDeAnticipacion($('vs-desde').value) < 15;
  const v = armarObjetoSolicitud(legajo, requierePreaviso ? 'Borrador' : 'Pendiente aprobación Gerente');
  if (requierePreaviso) v.requiereAutorizacionPreavisoCorto = true;

  let registro;
  if (_solicitudEditandoId) {
    registro = getVacacionById(_solicitudEditandoId);
    Object.assign(registro, v, { fechaSolicitud: registro.fechaSolicitud });
  } else {
    registro = v;
    if (!DB.vacaciones) DB.vacaciones = [];
    DB.vacaciones.push(registro);
  }
  await supaSync('vacaciones', registro);

  if (requierePreaviso) {
    cerrarModal('modal-vac-solicitud');
    renderPendientes();
    toast('⚠️ Menos de 15 días de anticipación — quedó guardada como borrador. RRHH tiene que autorizar la excepción antes de poder elevarla.');
    return;
  }
  const gerente = gerenteDeSector(legajo.sector);
  if (gerente) await crearNotificacion({ tipo: 'vacacion_solicitada', entidadIdLocal: registro.id, destinatarioNombre: gerente, mensaje: `🏖️ ${legajo.nombre} solicitó vacaciones (${registro.fechaDesde} a ${registro.fechaHasta}).` });
  cerrarModal('modal-vac-solicitud');
  renderPendientes();
  toast('📤 Solicitud elevada — esperando al Gerente');
}

export async function elevarSolicitud(idLocal) {
  const v = getVacacionById(idLocal);
  if (!v || v.estado !== 'Borrador') return;
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(v.legajoIdLocal));
  if (!legajo || !calcularDiasAsignadosPorAntiguedad(legajo)) { toast('⚠️ No se pudieron calcular los días asignados — no se puede elevar'); return; }
  if (!esLunes(v.fechaDesde)) { toast('❌ Las vacaciones deben comenzar un día lunes — editá la solicitud'); return; }
  if (!esDomingo(v.fechaHasta)) { toast('❌ Las vacaciones deben terminar un día domingo — editá la solicitud'); return; }
  if (diasDeAnticipacion(v.fechaDesde) < 15 && !v.autorizadaExcepcionPor) {
    v.requiereAutorizacionPreavisoCorto = true;
    await supaSync('vacaciones', v);
    renderPendientes();
    toast('⚠️ Menos de 15 días de anticipación — queda marcada para que RRHH autorice la excepción.');
    return;
  }
  v.estado = 'Pendiente aprobación Gerente';
  await supaSync('vacaciones', v);
  const gerente = gerenteDeSector(v.sector);
  if (gerente) await crearNotificacion({ tipo: 'vacacion_solicitada', entidadIdLocal: v.id, destinatarioNombre: gerente, mensaje: `🏖️ ${v.nombreAsociado} solicitó vacaciones (${v.fechaDesde} a ${v.fechaHasta}).` });
  renderPendientes();
  toast('📤 Solicitud elevada — esperando al Gerente');
}

// Vacaciones v1.1 — Cambio 1: RRHH/Admin autoriza una excepción de
// preaviso corto sobre un borrador marcado. Salta directo a "Pendiente
// aprobación Consejo" (se saltea el nivel Gerente para estos casos).
export function autorizarPreavisoCorto(idLocal) {
  const v = getVacacionById(idLocal);
  if (!v || v.estado !== 'Borrador' || !v.requiereAutorizacionPreavisoCorto) { toast('⚠️ Esta solicitud no está esperando autorización de preaviso corto'); return; }
  abrirModalInput({
    titulo: 'Autorizar preaviso corto',
    etiqueta: 'Motivo de la excepción (obligatorio)',
    placeholder: 'Por qué se autoriza a pesar de tener menos de 15 días de anticipación...',
  }, async (motivo) => {
    v.requiereAutorizacionPreavisoCorto = false;
    v.motivoExcepcionPreaviso = motivo;
    v.autorizadaExcepcionPor = currentUser?.nombre || '';
    v.fechaAutorizacionExcepcion = new Date().toISOString();
    v.estado = 'Pendiente aprobación Consejo';
    await supaSync('vacaciones', v);
    const { presidente, tesorero, secretario } = nombresConsejo();
    for (const destinatario of [presidente, tesorero, secretario, v.nombreAsociado]) {
      await crearNotificacion({ tipo: 'vacacion_preaviso_corto_autorizado', entidadIdLocal: v.id, destinatarioNombre: destinatario, mensaje: `✅ RRHH autorizó el preaviso corto de ${v.nombreAsociado} — pasa directo al Consejo.` });
    }
    renderPendientes();
    toast('✅ Excepción autorizada — pasa directo al Consejo');
  });
}

// ========== ACCIONES DE FILA (wrappers con prompt genérico) ==========

// Vacaciones v1.1 — Cambio 4: el aviso de superposición se mudó de "al
// elevar" (contra el jefe directo) a "al aprobar" (contra todo el
// sector) — mismo patrón que descansos.js:aprobarOperacionesPorId.
export async function aprobarComoGerentePorId(idLocal) {
  const v = getVacacionById(idLocal);
  if (v) {
    const legajoSolicitante = (DB.legajos || []).find(l => String(l.nro) === String(v.legajoIdLocal));
    const superpuestas = buscarSuperposicionesSector(v, legajoSolicitante);
    if (superpuestas.length) {
      const detalle = superpuestas.map(s => `${s.esJefeDirecto ? '👔 (jefe directo) ' : ''}${s.nombreAsociado}: ${s.fechaDesde} al ${s.fechaHasta}`).join('\n');
      if (!confirm(`⚠️ Superposición detectada en el sector:\n${detalle}\n\n¿Confirmás la aprobación igual?`)) return;
    }
  }
  await aprobarComoGerente(idLocal);
  renderPendientes();
}
export function votarConsejoPorId(idLocal, voto) { votarConsejo(idLocal, voto).then(renderPendientes); }
export function votarAnulacionPorId(idLocal, voto) { votarAnulacionConsejo(idLocal, voto).then(() => { renderPendientes(); renderHistorial(); }); }

export function abrirRechazoGerente(idLocal) {
  const motivo = prompt('Motivo del rechazo (obligatorio):');
  if (motivo === null) return;
  rechazarComoGerente(idLocal, motivo).then(renderPendientes);
}

export function abrirRechazoConsejo(idLocal) {
  const motivo = prompt('Motivo del rechazo (obligatorio):');
  if (motivo === null) return;
  votarConsejo(idLocal, 'Rechazar', motivo).then(renderPendientes);
}

export function abrirAnularSolicitante(idLocal) {
  const motivo = prompt('Motivo de la anulación (opcional):') || '';
  anularPorSolicitante(idLocal, motivo).then(renderPendientes);
}

export function abrirAnularGerente(idLocal) {
  const motivo = prompt('Motivo de la anulación (opcional):') || '';
  anularPorGerente(idLocal, motivo).then(renderPendientes);
}

export function abrirSolicitarAnulacion(idLocal) {
  const motivo = prompt('¿Por qué querés anular esta vacación aprobada?');
  if (motivo === null) return;
  solicitarAnulacion(idLocal, motivo).then(() => { renderPendientes(); renderHistorial(); });
}

// ========== MODAL DE DETALLE (solo lectura) ==========

function ensureModalDetalle() {
  if ($('modal-vac-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-vac-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3>🏖️ Detalle de la solicitud</h3><button class="btn-close" onclick="cerrarModal('modal-vac-detalle')">×</button></div>
      <div class="modal-body" id="vd-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-vac-detalle')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleVacacion(idLocal) {
  const v = getVacacionById(idLocal);
  if (!v) return;
  ensureModalDetalle();
  const votosConsejo = [
    v.votoPresidente ? `Presidente: ${v.votoPresidente}${v.votoPresidenteMotivo ? ' — ' + v.votoPresidenteMotivo : ''}` : 'Presidente: esperando voto',
    v.votoTesorero ? `Tesorero: ${v.votoTesorero}${v.votoTesoreroMotivo ? ' — ' + v.votoTesoreroMotivo : ''}` : 'Tesorero: esperando voto',
    v.votoSecretario ? `Secretario: ${v.votoSecretario}${v.votoSecretarioMotivo ? ' — ' + v.votoSecretarioMotivo : ''}` : 'Secretario: esperando voto',
  ];
  $('vd-cuerpo').innerHTML = `
    <div class="info-item"><div class="key">Solicitante</div><div class="val">${v.nombreAsociado} — N° ${v.nroSocio} — ${v.sector}</div></div>
    <div class="info-item"><div class="key">Fechas</div><div class="val">${v.fechaDesde} a ${v.fechaHasta} (${v.diasSolicitados} días) — retorno ${v.fechaRetorno}</div></div>
    <div class="info-item"><div class="key">Reemplazante</div><div class="val">${v.reemplazanteNombre}${v.descripcionReemplazo ? ' — ' + v.descripcionReemplazo : ''}</div></div>
    <div class="info-item"><div class="key">Estado</div><div class="val"><span class="badge ${ESTADO_BADGE[v.estado] || 'badge-gris'}">${v.estado}</span></div></div>
    ${v.aprobadoPorGerente ? `<div class="info-item"><div class="key">Gerente</div><div class="val">Aprobado por ${v.aprobadoPorGerente}</div></div>` : ''}
    ${v.motivoRechazoGerente ? `<div class="info-item"><div class="key">Motivo rechazo Gerente</div><div class="val">${v.motivoRechazoGerente}</div></div>` : ''}
    ${['Pendiente aprobación Consejo', 'Aprobada', 'Rechazada por Consejo'].includes(v.estado) ? `<div class="info-item"><div class="key">Consejo</div><div class="val">${votosConsejo.join('<br>')}</div></div>` : ''}
    ${v.observaciones ? `<div class="info-item"><div class="key">Observaciones</div><div class="val">${v.observaciones}</div></div>` : ''}
    ${v.motivoAnulacion ? `<div class="info-item"><div class="key">Anulación</div><div class="val">${v.anuladoPorNombre}: ${v.motivoAnulacion}</div></div>` : ''}
  `;
  abrirModal('modal-vac-detalle');
}

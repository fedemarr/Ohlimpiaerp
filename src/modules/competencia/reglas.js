// Competencia Anual v2 — catálogo de reglas y versiones con vigencia
// temporal (política A.6, mismo patrón que src/modules/uniformes/precios.js:
// "Corregir" edita la versión vigente in-place; "Nueva vigencia" cierra la
// vigente y crea una fila nueva — los movimientos ya generados guardan su
// propia reglaVersionIdLocal y no se recalculan nunca).
//
// Reemplaza por completo la versión anterior de este archivo, que
// gestionaba el singleton plano de sql/v025 (ver v033: esa tabla se
// renombró a reglas_competencia_legado_singleton).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getReglaById, getVersionVigente } from './movimientos.js';

const ORIGENES_REGLA = ['Automático', 'Manual', 'Ambas'];
const MODULOS_ORIGEN = ['Capacitaciones', 'Comercial', 'Sanciones', 'Reasignaciones'];

function slugify(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function versionesDeRegla(reglaIdLocal) {
  return (DB.reglasCompetenciaVersiones || [])
    .filter(v => !v.anulado && String(v.reglaIdLocal) === String(reglaIdLocal))
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
}

// ========== TAB 6 — TABLA DE REGLAS ==========

export function renderReglas() {
  const tbody = $('tbody-comp-reglas');
  if (!tbody) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const reglas = (DB.reglasCompetencia || []).filter(r => !r.anulado)
    .sort((a, b) => (b.activa - a.activa) || (a.orden || 0) - (b.orden || 0));
  tbody.innerHTML = reglas.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:24px;opacity:.5;">Sin reglas cargadas</td></tr>'
    : reglas.map(r => {
      const version = getVersionVigente(r.id, hoy);
      return `<tr style="${!r.activa ? 'opacity:.5;' : ''}">
        <td>${r.destaca ? '⭐ ' : ''}${r.nombre}</td>
        <td><span class="badge badge-azul">${r.origen}</span></td>
        <td style="font-size:12px;">${r.moduloOrigen || '—'}</td>
        <td style="text-align:center;">${version ? (version.puntosIndividual > 0 ? '+' : '') + version.puntosIndividual : '—'}</td>
        <td style="text-align:center;">${version && version.puntosPorCompanero ? (version.puntosPorCompanero > 0 ? '+' : '') + version.puntosPorCompanero : '—'}</td>
        <td style="text-align:center;">${version && version.puntosSupervisor ? (version.puntosSupervisor > 0 ? '+' : '') + version.puntosSupervisor : '—'}</td>
        <td style="font-size:12px;">${version ? version.vigenciaDesde : '—'}</td>
        <td style="text-align:center;"><span class="badge ${r.activa ? 'badge-verde' : 'badge-gris'}">${r.activa ? 'Activa' : 'Inactiva'}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-xs btn-secondary" onclick="abrirCorregirVersionRegla('${r.id}')">✏️ Corregir</button>
          <button class="btn btn-xs" onclick="abrirNuevaVigenciaRegla('${r.id}')">📅 Nueva vigencia</button>
          <button class="btn btn-xs" onclick="abrirHistorialVersionesRegla('${r.id}')">🕐 Historial</button>
          <button class="btn btn-xs" onclick="activarDesactivarReglaPorId('${r.id}')">${r.activa ? '🚫 Desactivar' : '✅ Activar'}</button>
        </td>
      </tr>`;
    }).join('');
}

export async function activarDesactivarReglaPorId(reglaIdLocal) {
  const regla = getReglaById(reglaIdLocal);
  if (!regla) return;
  regla.activa = !regla.activa;
  await supaSync('reglasCompetencia', regla);
  renderReglas();
  toast(regla.activa ? '✅ Regla activada' : '🚫 Regla desactivada — deja de generar puntos nuevos, los movimientos ya generados no se tocan');
}

export async function anularReglaPorId(reglaIdLocal) {
  const regla = getReglaById(reglaIdLocal);
  if (!regla) return;
  const tieneMovimientos = (DB.movimientosPuntos || []).some(m => !m.anulado && !m.revertido && String(m.reglaIdLocal) === String(reglaIdLocal));
  if (tieneMovimientos) { toast('⚠️ Esta regla tiene movimientos vigentes — revertilos o desactivala en vez de anularla'); return; }
  if (!confirm(`¿Anular la regla "${regla.nombre}"? No se puede deshacer.`)) return;
  regla.anulado = true;
  await supaSync('reglasCompetencia', regla);
  renderReglas();
  toast('🗑 Regla anulada');
}

// ========== MODAL — CORREGIR / NUEVA VIGENCIA ==========

let _reglaModo = 'corregir'; // 'corregir' | 'vigencia'
let _reglaEditandoId = null;
let _versionEditandoId = null;

function ensureModalReglaVersion() {
  if ($('modal-comp-regla-version')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-regla-version';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="crv-titulo">Editar puntaje</h3><button class="btn-close" onclick="cerrarModal('modal-comp-regla-version')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Puntos al operario *</label><input type="number" id="crv-individual"></div>
        <div class="form-group"><label>Puntos a cada compañero del servicio</label><input type="number" id="crv-companero" value="0"></div>
        <div class="form-group"><label>Puntos al supervisor</label><input type="number" id="crv-supervisor" value="0"></div>
        <div class="form-group" id="crv-grupo-vigencia" style="display:none;"><label>Vigente desde *</label><input type="date" id="crv-vigencia-desde"></div>
        <div class="form-group"><label>Motivo *</label><textarea id="crv-motivo" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-comp-regla-version')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarVersionReglaDesdeModal()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCorregirVersionRegla(reglaIdLocal) {
  const regla = getReglaById(reglaIdLocal);
  if (!regla) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const version = getVersionVigente(reglaIdLocal, hoy);
  if (!version) { toast('⚠️ Esta regla no tiene una versión vigente para corregir'); return; }
  _reglaModo = 'corregir'; _reglaEditandoId = reglaIdLocal; _versionEditandoId = version.id;
  ensureModalReglaVersion();
  $('crv-titulo').textContent = `Corregir puntaje — ${regla.nombre}`;
  $('crv-individual').value = version.puntosIndividual;
  $('crv-companero').value = version.puntosPorCompanero || 0;
  $('crv-supervisor').value = version.puntosSupervisor || 0;
  $('crv-grupo-vigencia').style.display = 'none';
  $('crv-motivo').value = '';
  abrirModal('modal-comp-regla-version');
}

export function abrirNuevaVigenciaRegla(reglaIdLocal) {
  const regla = getReglaById(reglaIdLocal);
  if (!regla) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const version = getVersionVigente(reglaIdLocal, hoy);
  _reglaModo = 'vigencia'; _reglaEditandoId = reglaIdLocal; _versionEditandoId = null;
  ensureModalReglaVersion();
  $('crv-titulo').textContent = `Nueva vigencia — ${regla.nombre}`;
  $('crv-individual').value = version ? version.puntosIndividual : 0;
  $('crv-companero').value = version ? (version.puntosPorCompanero || 0) : 0;
  $('crv-supervisor').value = version ? (version.puntosSupervisor || 0) : 0;
  $('crv-grupo-vigencia').style.display = 'block';
  $('crv-vigencia-desde').value = hoy;
  $('crv-motivo').value = '';
  abrirModal('modal-comp-regla-version');
}

export async function guardarVersionReglaDesdeModal() {
  const puntosIndividual = parseInt($('crv-individual').value, 10);
  const puntosPorCompanero = parseInt($('crv-companero').value, 10) || 0;
  const puntosSupervisor = parseInt($('crv-supervisor').value, 10) || 0;
  const motivo = ($('crv-motivo').value || '').trim();
  if (isNaN(puntosIndividual)) { toast('⚠️ Ingresá los puntos al operario'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }

  if (_reglaModo === 'corregir') {
    const version = (DB.reglasCompetenciaVersiones || []).find(v => String(v.id) === String(_versionEditandoId));
    if (!version) { toast('⚠️ No se encontró la versión'); return; }
    version.puntosIndividual = puntosIndividual;
    version.puntosPorCompanero = puntosPorCompanero;
    version.puntosSupervisor = puntosSupervisor;
    version.motivoCarga = motivo;
    version.cargadaPor = currentUser?.nombre || '';
    await supaSync('reglasCompetenciaVersiones', version);
    toast('✅ Puntaje corregido — los movimientos históricos no cambian');
  } else {
    const vigenciaDesde = $('crv-vigencia-desde').value;
    if (!vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }
    const anterior = getVersionVigente(_reglaEditandoId, vigenciaDesde);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('reglasCompetenciaVersiones', anterior);
    }
    const nueva = {
      id: Date.now(),
      reglaIdLocal: _reglaEditandoId,
      puntosIndividual, puntosPorCompanero, puntosSupervisor,
      vigenciaDesde, vigenciaHasta: null,
      cargadaPor: currentUser?.nombre || '', motivoCarga: motivo,
    };
    if (!DB.reglasCompetenciaVersiones) DB.reglasCompetenciaVersiones = [];
    DB.reglasCompetenciaVersiones.push(nueva);
    await supaSync('reglasCompetenciaVersiones', nueva);
    toast('✅ Nueva vigencia guardada — los movimientos anteriores mantienen el puntaje congelado');
  }
  cerrarModal('modal-comp-regla-version');
  renderReglas();
}

// ========== MODAL — HISTORIAL DE VERSIONES ==========

function ensureModalReglaHistorial() {
  if ($('modal-comp-regla-historial')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-regla-historial';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3 id="chv-titulo">Historial</h3><button class="btn-close" onclick="cerrarModal('modal-comp-regla-historial')">×</button></div>
      <div class="modal-body" id="chv-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-comp-regla-historial')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirHistorialVersionesRegla(reglaIdLocal) {
  const regla = getReglaById(reglaIdLocal);
  if (!regla) return;
  ensureModalReglaHistorial();
  $('chv-titulo').textContent = `Historial — ${regla.nombre}`;
  const versiones = versionesDeRegla(reglaIdLocal);
  $('chv-cuerpo').innerHTML = versiones.map(v => `<div class="info-item">
      <div class="key">${v.vigenciaDesde} ${v.vigenciaHasta ? 'al ' + v.vigenciaHasta : '(vigente)'}</div>
      <div class="val">Operario ${v.puntosIndividual > 0 ? '+' : ''}${v.puntosIndividual} / Compañero ${v.puntosPorCompanero || 0} / Supervisor ${v.puntosSupervisor || 0} — cargado por ${v.cargadaPor}${v.motivoCarga ? ' — ' + v.motivoCarga : ''}</div>
    </div>`).join('') || '<p style="opacity:.5;">Sin historial</p>';
  abrirModal('modal-comp-regla-historial');
}

// ========== MODAL — NUEVA REGLA ==========

function ensureModalReglaNueva() {
  if ($('modal-comp-regla-nueva')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-regla-nueva';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>+ Nueva regla</h3><button class="btn-close" onclick="cerrarModal('modal-comp-regla-nueva')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Nombre *</label><input type="text" id="crn-nombre"></div>
        <div class="form-group"><label>Descripción</label><textarea id="crn-desc" rows="2"></textarea></div>
        <div class="form-group"><label>Origen *</label>
          <select id="crn-origen">${ORIGENES_REGLA.map(o => `<option>${o}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Módulo origen</label>
          <select id="crn-modulo"><option value="">—</option>${MODULOS_ORIGEN.map(m2 => `<option>${m2}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Puntos al operario *</label><input type="number" id="crn-individual" value="0"></div>
        <div class="form-group"><label>Puntos a cada compañero</label><input type="number" id="crn-companero" value="0"></div>
        <div class="form-group"><label>Puntos al supervisor</label><input type="number" id="crn-supervisor" value="0"></div>
        <div class="form-group"><label><input type="checkbox" id="crn-destaca"> ⭐ Destacar</label></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-comp-regla-nueva')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarReglaNueva()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirNuevaRegla() {
  ensureModalReglaNueva();
  ['crn-nombre', 'crn-desc'].forEach(id => { $(id).value = ''; });
  $('crn-origen').value = 'Manual';
  $('crn-modulo').value = '';
  $('crn-individual').value = 0;
  $('crn-companero').value = 0;
  $('crn-supervisor').value = 0;
  $('crn-destaca').checked = false;
  abrirModal('modal-comp-regla-nueva');
}

export async function guardarReglaNueva() {
  const nombre = ($('crn-nombre').value || '').trim();
  const puntosIndividual = parseInt($('crn-individual').value, 10);
  if (!nombre) { toast('⚠️ Ingresá el nombre de la regla'); return; }
  if (isNaN(puntosIndividual)) { toast('⚠️ Ingresá los puntos al operario'); return; }
  const codigo = slugify(nombre) || `regla_${Date.now()}`;
  if ((DB.reglasCompetencia || []).some(r => !r.anulado && r.codigo === codigo)) {
    toast('⚠️ Ya existe una regla con un nombre muy similar (código duplicado)'); return;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const nueva = {
    id: Date.now(),
    codigo,
    nombre,
    descripcion: ($('crn-desc').value || '').trim(),
    origen: $('crn-origen').value,
    moduloOrigen: $('crn-modulo').value || null,
    activa: true,
    destaca: $('crn-destaca').checked,
    orden: (DB.reglasCompetencia || []).length + 1,
  };
  if (!DB.reglasCompetencia) DB.reglasCompetencia = [];
  DB.reglasCompetencia.push(nueva);
  await supaSync('reglasCompetencia', nueva);

  const version = {
    id: Date.now() + 1,
    reglaIdLocal: nueva.id,
    puntosIndividual,
    puntosPorCompanero: parseInt($('crn-companero').value, 10) || 0,
    puntosSupervisor: parseInt($('crn-supervisor').value, 10) || 0,
    vigenciaDesde: hoy, vigenciaHasta: null,
    cargadaPor: currentUser?.nombre || '', motivoCarga: 'Alta inicial de la regla',
  };
  if (!DB.reglasCompetenciaVersiones) DB.reglasCompetenciaVersiones = [];
  DB.reglasCompetenciaVersiones.push(version);
  await supaSync('reglasCompetenciaVersiones', version);

  cerrarModal('modal-comp-regla-nueva');
  renderReglas();
  toast('✅ Regla creada');
}

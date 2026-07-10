// Sanciones v1 — catálogo de infracciones con vigencia temporal
// (política A.6, mismo patrón "Corregir vs. Nueva vigencia" ya usado
// en competencia/reglas.js y uniformes/precios.js).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const CATEGORIAS_INFRACCION = ['Ausencias e Impuntualidad', 'Incumplimiento de Tareas y Normas', 'Conductas y Comportamiento'];
const GRAVEDADES = ['Leve', 'Moderada', 'Grave', 'Muy grave'];
const NOMBRES_NIVEL = { 0: '0 - Verbal', 1: '1 - Observación', 2: '2 - Apercibimiento', 3: '3 - Suspensión', 4: '4 - Exclusión' };

// id_local se trunca a 9 dígitos al persistir (supaSync); las referencias
// cruzadas armadas en memoria con el Date.now() de 13 dígitos completo
// dejan de matchear tras un reload si no se canonicalizan acá también.
const idLocalTrunc = id => String(id).slice(-9);

export function getInfraccionById(id) {
  return (DB.catalogoInfracciones || []).find(i => !i.anulado && String(i.id) === String(id));
}

export function getVersionInfraccionVigente(infraccionIdLocal, fechaISO) {
  const candidatas = (DB.catalogoInfraccionesVersiones || []).filter(v =>
    !v.anulado && String(v.infraccionIdLocal) === idLocalTrunc(infraccionIdLocal) &&
    v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  return candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0] || null;
}

function versionesDeInfraccion(infraccionIdLocal) {
  return (DB.catalogoInfraccionesVersiones || [])
    .filter(v => !v.anulado && String(v.infraccionIdLocal) === idLocalTrunc(infraccionIdLocal))
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
}

function siguienteCodigo() {
  const nums = (DB.catalogoInfracciones || [])
    .map(i => parseInt((i.codigo || '').replace('INF-', ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'INF-' + String(max + 1).padStart(3, '0');
}

// ========== TAB CATÁLOGO ==========

export function renderCatalogoInfracciones() {
  const tbody = $('tbody-sanc-catalogo');
  if (!tbody) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const infracciones = (DB.catalogoInfracciones || []).filter(i => !i.anulado)
    .sort((a, b) => (b.activa - a.activa) || a.codigo.localeCompare(b.codigo));
  tbody.innerHTML = infracciones.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:24px;opacity:.5;">Sin infracciones cargadas</td></tr>'
    : infracciones.map(i => {
      const version = getVersionInfraccionVigente(i.id, hoy);
      return `<tr style="${!i.activa ? 'opacity:.5;' : ''}">
        <td style="font-family:'DM Mono',monospace;font-size:12px;">${i.codigo}</td>
        <td>${i.nombre}</td>
        <td style="font-size:12px;">${i.categoria}</td>
        <td style="text-align:center;"><span class="badge ${version?.gravedad === 'Muy grave' || version?.gravedad === 'Grave' ? 'badge-rojo' : 'badge-acento'}">${version?.gravedad || '—'}</span></td>
        <td style="text-align:center;font-size:12px;">${version ? NOMBRES_NIVEL[version.sancionSugeridaPrimeraVez] : '—'}</td>
        <td style="text-align:center;font-size:12px;">${version ? NOMBRES_NIVEL[version.sancionSugeridaReiteracion] : '—'}</td>
        <td style="text-align:center;"><span class="badge ${i.activa ? 'badge-verde' : 'badge-gris'}">${i.activa ? 'Activa' : 'Inactiva'}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-xs btn-secondary" onclick="abrirCorregirVersionInfraccion('${i.id}')">✏️</button>
          <button class="btn btn-xs" onclick="abrirNuevaVigenciaInfraccion('${i.id}')">📅</button>
          <button class="btn btn-xs" onclick="abrirHistorialVersionesInfraccion('${i.id}')">🕐</button>
          <button class="btn btn-xs" onclick="activarDesactivarInfraccionPorId('${i.id}')">${i.activa ? '🚫' : '✅'}</button>
        </td>
      </tr>`;
    }).join('');
}

export async function activarDesactivarInfraccionPorId(id) {
  const i = getInfraccionById(id);
  if (!i) return;
  i.activa = !i.activa;
  await supaSync('catalogoInfracciones', i);
  renderCatalogoInfracciones();
  toast(i.activa ? '✅ Infracción activada' : '🚫 Infracción desactivada');
}

export async function anularInfraccionPorId(id) {
  const i = getInfraccionById(id);
  if (!i) return;
  const tieneSanciones = (DB.sancionesDisciplinarias || []).some(s => !s.anulado && String(s.infraccionIdLocal) === idLocalTrunc(id));
  if (tieneSanciones) { toast('⚠️ Esta infracción ya se usó en sanciones — no se puede anular, desactivala en su lugar'); return; }
  if (!confirm(`¿Anular la infracción "${i.nombre}"? No se puede deshacer.`)) return;
  i.anulado = true;
  await supaSync('catalogoInfracciones', i);
  renderCatalogoInfracciones();
  toast('🗑 Infracción anulada');
}

// ========== MODAL — CORREGIR / NUEVA VIGENCIA ==========

let _infraccionModo = 'corregir';
let _infraccionEditandoId = null;
let _versionInfraccionEditandoId = null;

function ensureModalVersionInfraccion() {
  if ($('modal-sanc-infraccion-version')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-sanc-infraccion-version';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="siv-titulo">Editar infracción</h3><button class="btn-close" onclick="cerrarModal('modal-sanc-infraccion-version')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Gravedad *</label><select id="siv-gravedad">${GRAVEDADES.map(g => `<option>${g}</option>`).join('')}</select></div>
        <div class="form-group"><label>Sanción sugerida 1ra vez *</label>
          <select id="siv-primera">${Object.entries(NOMBRES_NIVEL).map(([n, l]) => `<option value="${n}">${l}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Sanción sugerida reiteración *</label>
          <select id="siv-reiteracion">${Object.entries(NOMBRES_NIVEL).map(([n, l]) => `<option value="${n}">${l}</option>`).join('')}</select>
        </div>
        <div class="form-group" id="siv-grupo-vigencia" style="display:none;"><label>Vigente desde *</label><input type="date" id="siv-vigencia-desde"></div>
        <div class="form-group"><label>Motivo *</label><textarea id="siv-motivo" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-sanc-infraccion-version')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarVersionInfraccionDesdeModal()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCorregirVersionInfraccion(infraccionId) {
  const i = getInfraccionById(infraccionId);
  if (!i) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const version = getVersionInfraccionVigente(infraccionId, hoy);
  if (!version) { toast('⚠️ Esta infracción no tiene una versión vigente para corregir'); return; }
  _infraccionModo = 'corregir'; _infraccionEditandoId = infraccionId; _versionInfraccionEditandoId = version.id;
  ensureModalVersionInfraccion();
  $('siv-titulo').textContent = `Corregir — ${i.nombre}`;
  $('siv-gravedad').value = version.gravedad;
  $('siv-primera').value = version.sancionSugeridaPrimeraVez;
  $('siv-reiteracion').value = version.sancionSugeridaReiteracion;
  $('siv-grupo-vigencia').style.display = 'none';
  $('siv-motivo').value = '';
  abrirModal('modal-sanc-infraccion-version');
}

export function abrirNuevaVigenciaInfraccion(infraccionId) {
  const i = getInfraccionById(infraccionId);
  if (!i) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const version = getVersionInfraccionVigente(infraccionId, hoy);
  _infraccionModo = 'vigencia'; _infraccionEditandoId = infraccionId; _versionInfraccionEditandoId = null;
  ensureModalVersionInfraccion();
  $('siv-titulo').textContent = `Nueva vigencia — ${i.nombre}`;
  $('siv-gravedad').value = version?.gravedad || GRAVEDADES[0];
  $('siv-primera').value = version?.sancionSugeridaPrimeraVez ?? 1;
  $('siv-reiteracion').value = version?.sancionSugeridaReiteracion ?? 2;
  $('siv-grupo-vigencia').style.display = 'block';
  $('siv-vigencia-desde').value = hoy;
  $('siv-motivo').value = '';
  abrirModal('modal-sanc-infraccion-version');
}

export async function guardarVersionInfraccionDesdeModal() {
  const gravedad = $('siv-gravedad').value;
  const sancionSugeridaPrimeraVez = parseInt($('siv-primera').value, 10);
  const sancionSugeridaReiteracion = parseInt($('siv-reiteracion').value, 10);
  const motivo = ($('siv-motivo').value || '').trim();
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }

  if (_infraccionModo === 'corregir') {
    const version = (DB.catalogoInfraccionesVersiones || []).find(v => String(v.id) === String(_versionInfraccionEditandoId));
    if (!version) { toast('⚠️ No se encontró la versión'); return; }
    version.gravedad = gravedad;
    version.sancionSugeridaPrimeraVez = sancionSugeridaPrimeraVez;
    version.sancionSugeridaReiteracion = sancionSugeridaReiteracion;
    version.motivoCarga = motivo;
    version.cargadaPor = currentUser?.nombre || '';
    await supaSync('catalogoInfraccionesVersiones', version);
    toast('✅ Infracción corregida — las sanciones históricas no cambian');
  } else {
    const vigenciaDesde = $('siv-vigencia-desde').value;
    if (!vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }
    const anterior = getVersionInfraccionVigente(_infraccionEditandoId, vigenciaDesde);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('catalogoInfraccionesVersiones', anterior);
    }
    const nueva = {
      id: Date.now(),
      infraccionIdLocal: idLocalTrunc(_infraccionEditandoId),
      gravedad, sancionSugeridaPrimeraVez, sancionSugeridaReiteracion,
      vigenciaDesde, vigenciaHasta: null,
      cargadaPor: currentUser?.nombre || '', motivoCarga: motivo,
    };
    if (!DB.catalogoInfraccionesVersiones) DB.catalogoInfraccionesVersiones = [];
    DB.catalogoInfraccionesVersiones.push(nueva);
    await supaSync('catalogoInfraccionesVersiones', nueva);
    toast('✅ Nueva vigencia guardada');
  }
  cerrarModal('modal-sanc-infraccion-version');
  renderCatalogoInfracciones();
}

// ========== MODAL — HISTORIAL ==========

function ensureModalHistorialInfraccion() {
  if ($('modal-sanc-infraccion-historial')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-sanc-infraccion-historial';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3 id="sih-titulo">Historial</h3><button class="btn-close" onclick="cerrarModal('modal-sanc-infraccion-historial')">×</button></div>
      <div class="modal-body" id="sih-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-sanc-infraccion-historial')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirHistorialVersionesInfraccion(infraccionId) {
  const i = getInfraccionById(infraccionId);
  if (!i) return;
  ensureModalHistorialInfraccion();
  $('sih-titulo').textContent = `Historial — ${i.nombre}`;
  const versiones = versionesDeInfraccion(infraccionId);
  $('sih-cuerpo').innerHTML = versiones.map(v => `<div class="info-item">
      <div class="key">${v.vigenciaDesde} ${v.vigenciaHasta ? 'al ' + v.vigenciaHasta : '(vigente)'}</div>
      <div class="val">${v.gravedad} — 1ra vez: ${NOMBRES_NIVEL[v.sancionSugeridaPrimeraVez]} / reiteración: ${NOMBRES_NIVEL[v.sancionSugeridaReiteracion]} — ${v.cargadaPor}${v.motivoCarga ? ' — ' + v.motivoCarga : ''}</div>
    </div>`).join('') || '<p style="opacity:.5;">Sin historial</p>';
  abrirModal('modal-sanc-infraccion-historial');
}

// ========== MODAL — NUEVA INFRACCIÓN ==========

function ensureModalInfraccionNueva() {
  if ($('modal-sanc-infraccion-nueva')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-sanc-infraccion-nueva';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>+ Nueva infracción</h3><button class="btn-close" onclick="cerrarModal('modal-sanc-infraccion-nueva')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Código</label><input type="text" id="sin-codigo" readonly></div>
        <div class="form-group"><label>Nombre *</label><input type="text" id="sin-nombre"></div>
        <div class="form-group"><label>Categoría *</label><select id="sin-categoria">${CATEGORIAS_INFRACCION.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="form-group"><label>Descripción</label><textarea id="sin-desc" rows="2"></textarea></div>
        <div class="form-group"><label>Gravedad *</label><select id="sin-gravedad">${GRAVEDADES.map(g => `<option>${g}</option>`).join('')}</select></div>
        <div class="form-group"><label>Sanción sugerida 1ra vez *</label>
          <select id="sin-primera">${Object.entries(NOMBRES_NIVEL).map(([n, l]) => `<option value="${n}">${l}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Sanción sugerida reiteración *</label>
          <select id="sin-reiteracion">${Object.entries(NOMBRES_NIVEL).map(([n, l]) => `<option value="${n}">${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-sanc-infraccion-nueva')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarInfraccionNueva()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirNuevaInfraccion() {
  ensureModalInfraccionNueva();
  $('sin-codigo').value = siguienteCodigo();
  $('sin-nombre').value = '';
  $('sin-categoria').value = CATEGORIAS_INFRACCION[0];
  $('sin-desc').value = '';
  $('sin-gravedad').value = GRAVEDADES[0];
  $('sin-primera').value = 1;
  $('sin-reiteracion').value = 2;
  abrirModal('modal-sanc-infraccion-nueva');
}

export async function guardarInfraccionNueva() {
  const nombre = ($('sin-nombre').value || '').trim();
  if (!nombre) { toast('⚠️ Ingresá el nombre de la infracción'); return; }
  const hoy = new Date().toISOString().slice(0, 10);
  const nueva = {
    id: Date.now(),
    codigo: $('sin-codigo').value,
    nombre,
    descripcion: ($('sin-desc').value || '').trim(),
    categoria: $('sin-categoria').value,
    activa: true,
  };
  if (!DB.catalogoInfracciones) DB.catalogoInfracciones = [];
  DB.catalogoInfracciones.push(nueva);
  await supaSync('catalogoInfracciones', nueva);

  const version = {
    id: Date.now() + 1,
    infraccionIdLocal: idLocalTrunc(nueva.id),
    gravedad: $('sin-gravedad').value,
    sancionSugeridaPrimeraVez: parseInt($('sin-primera').value, 10),
    sancionSugeridaReiteracion: parseInt($('sin-reiteracion').value, 10),
    vigenciaDesde: hoy, vigenciaHasta: null,
    cargadaPor: currentUser?.nombre || '', motivoCarga: 'Alta inicial',
  };
  if (!DB.catalogoInfraccionesVersiones) DB.catalogoInfraccionesVersiones = [];
  DB.catalogoInfraccionesVersiones.push(version);
  await supaSync('catalogoInfraccionesVersiones', version);

  cerrarModal('modal-sanc-infraccion-nueva');
  renderCatalogoInfracciones();
  toast('✅ Infracción creada');
}

// Módulo Capacitaciones — Registro (Etapa 1, política A.11: rehecho de
// cero). Antes vivía entero en src/legacy.js y NADA persistía: los
// supaSync('capacitaciones', ...) apuntaban a una clave que no estaba en
// el mapa de tablas (src/shared/supabase.js), así que todo se perdía al
// recargar. Acá todo persiste, todo es por id (no por índice), y se
// corrigen los 2 bugs conocidos del Registro: el botón "editar" no tenía
// handler, y guardarCapacitacion() llamaba a supaSync dos veces.
//
// Estadísticas, Calendario/Plan mensual y Evaluaciones quedan para etapas
// futuras — sus tabs muestran un aviso "en rediseño" en vez de datos rotos
// por el cambio de schema (ver index.html).

import { DB, currentUser } from '@shared/state.js';
import { $, cleanText, toTitleCase } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { subirAdjunto, obtenerUrlFirmada } from '@shared/adjuntos.js';
// Hook a Competencia Anual (ver src/modules/competencia/movimientos.js)
// — mismo patrón de import cross-módulo que ya usa legajos.js con
// documentacion.js. Genera puntos cuando se aprueba una capacitación.
import { registrarEvento, esAdministrativo } from '../competencia/movimientos.js';

// ========== HELPERS ==========

const hoyISO = () => new Date().toISOString().slice(0, 10);
function ddmm(fechaISO) {
  if (!fechaISO) return '';
  const p = fechaISO.split('-');
  if (p.length !== 3) return fechaISO;
  return p[2] + '/' + p[1] + '/' + p[0];
}
const getCapById = (id) => (DB.capacitaciones || []).find(c => String(c.id) === String(id));

// ========== TABS ==========

export function tabCap(tab, btn) {
  document.querySelectorAll('#screen-capacitaciones .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-capacitaciones .tab-btn').forEach(b => b.classList.remove('active'));
  const content = $('cap-tab-' + tab);
  if (content) content.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'registro') renderCapacitaciones();
  if (tab === 'estadisticas' && window.renderStatsCapacitaciones) { if (window.poblarFiltrosStats) window.poblarFiltrosStats(); window.renderStatsCapacitaciones(); }
  if (tab === 'calendario') { if (window.poblarSelectMesObjetivo) window.poblarSelectMesObjetivo(); if (window.renderCalendarioCap) window.renderCalendarioCap(); }
  if (tab === 'repositorio' && window.renderMaterialesCap) window.renderMaterialesCap();
  if (tab === 'evaluaciones' && window.tabEval) window.tabEval('banco', document.querySelector('#cap-tab-evaluaciones .eval-subtab-btn'));
}

// ========== RENDER REGISTRO ==========
// Muestra Programada + Dictada-sin-resultado. Cancelada y Dictada-con-
// resultado-real quedan fuera (se ven en la pestaña del legajo del
// asociado, no hay vista global de histórico en esta etapa).

export function renderCapacitaciones(lista) {
  const tbody = $('tbody-capacitaciones'); if (!tbody) return;
  const activas = (DB.capacitaciones || []).filter(c => !c.anulado);
  const rows = lista || activas.filter(c =>
    c.estado === 'Programada' || (c.estado === 'Dictada' && c.resultado === 'Pendiente evaluación')
  );

  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-cap-total', activas.length);
  const anioActual = new Date().getFullYear();
  const capacitadosEsteAnio = new Set(
    activas.filter(c => c.estado === 'Dictada' && c.resultado === 'Aprobado' && c.fecha && c.fecha.startsWith(String(anioActual))).map(c => c.nroSocio)
  );
  ss('st-cap-anio', capacitadosEsteAnio.size);

  // st-cap-pend / st-cap-sin: se calculan sobre activos, no sobre las
  // filas del Registro (antes st-cap-pend mostraba rows.length, sin
  // relación con su label "Pendientes de ingreso" — bug de Etapa 1
  // corregido en Etapa 2 al construir el tab Estadísticas).
  const activosLegajos = (DB.legajos || []).filter(l => l.estado === 'Activo');
  const tiposIngreso = (DB.tiposCapacitacion || []).slice(0, 3);
  const aprobado = (nroSocio, tipo) => activas.some(c => String(c.nroSocio) === String(nroSocio) && c.tipo === tipo && c.estado === 'Dictada' && c.resultado === 'Aprobado');
  const sinIngresoCompleto = activosLegajos.filter(l => !tiposIngreso.every(t => aprobado(l.nro, t))).length;
  ss('st-cap-pend', sinIngresoCompleto);
  const asocConAlguna = new Set(activas.filter(c => c.estado === 'Dictada' && c.resultado === 'Aprobado').map(c => c.nroSocio));
  const sinNinguna = activosLegajos.filter(l => !asocConAlguna.has(String(l.nro))).length;
  ss('st-cap-sin', sinNinguna);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><div class="icon">🎓</div><p>Sin capacitaciones programadas</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(c => {
    const btnStyle = 'font-size:11px;padding:3px 8px;border:none;border-radius:4px;cursor:pointer;margin-right:2px;';
    const esProgramada = c.estado === 'Programada';
    let btns = `<button data-action="editar" data-id="${c.id}" style="${btnStyle}background:#e2e8f0;color:#374151;">✏️</button>`;
    btns += `<button data-action="dictar" data-id="${c.id}" style="${btnStyle}background:#7c3aed;color:white;">🎓 ${esProgramada ? 'Dictar' : 'Cargar resultado'}</button>`;
    if (c.estado === 'Dictada' && c.resultado === 'Pendiente evaluación') btns += `<button data-action="enviar-eval" data-id="${c.id}" style="${btnStyle}background:#0f766e;color:white;">📧 Enviar evaluación</button>`;
    if (esProgramada) btns += `<button data-action="anular" data-id="${c.id}" style="${btnStyle}background:#dc2626;color:white;">❌</button>`;
    const matCount = (c.materialesIds || []).length;
    return '<tr>'
      + '<td style="font-weight:500;">' + c.nombreAsociado + '</td>'
      + '<td style="font-family:\'DM Mono\',monospace;font-size:12px;color:var(--azul);">' + c.nroSocio + '</td>'
      + '<td style="font-size:12px;">' + ddmm(c.fecha) + '</td>'
      + '<td style="font-size:12px;">' + c.tipo + '</td>'
      + '<td style="font-size:12px;">' + c.lugar + '</td>'
      + '<td style="font-size:12px;">' + (c.servicio || '—') + '</td>'
      + '<td style="font-size:12px;">' + c.instructor + '</td>'
      + '<td style="font-size:12px;">' + (c.metodoEvaluacion || '—') + '</td>'
      + '<td><span class="badge ' + (c.resultado === 'Pendiente evaluación' ? 'badge-naranja' : 'badge-azul') + '" style="font-size:10px;">' + (c.resultado || 'Programada') + '</span></td>'
      + '<td style="text-align:center;font-size:12px;">' + (matCount ? matCount : '—') + '</td>'
      + '<td><div style="display:flex;flex-wrap:wrap;">' + btns + '</div></td>'
      + '</tr>';
  }).join('');
  bindTbodyCap(tbody);
}

function bindTbodyCap(tbody) {
  tbody.onclick = (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'editar') abrirEditarCapacitacionPorId(id);
    else if (action === 'dictar') abrirDictarCapacitacionPorId(id);
    else if (action === 'anular') anularCapacitacionPorId(id);
    else if (action === 'enviar-eval' && window.enviarEvaluacionPorId) window.enviarEvaluacionPorId(id);
  };
}

// ========== FILTROS (unificados — cf-cap-tipo/cf-cap-resultado de la
// cabecera duplicaban a cf-cap-tipo2/cf-cap-res de columna) ==========

export function filtrarCapacitaciones() {
  const nombre = ($('cf-cap-nombre') || { value: '' }).value.toLowerCase();
  const nro = ($('cf-cap-nro') || { value: '' }).value.toLowerCase();
  const fecha = ($('cf-cap-fecha') || { value: '' }).value.toLowerCase();
  const tipo = ($('cf-cap-tipo2') || { value: '' }).value;
  const lugar = ($('cf-cap-lugar') || { value: '' }).value;
  const serv = ($('cf-cap-serv') || { value: '' }).value.toLowerCase();
  const inst = ($('cf-cap-inst') || { value: '' }).value;
  const metodo = ($('cf-cap-metodo') || { value: '' }).value;
  const resultado = ($('cf-cap-res') || { value: '' }).value;
  const anio = ($('cf-cap-anio') || { value: '' }).value;
  const bg = ($('buscar-cap') || { value: '' }).value.toLowerCase();

  const activas = (DB.capacitaciones || []).filter(c => !c.anulado);
  const base = activas.filter(c => c.estado === 'Programada' || (c.estado === 'Dictada' && c.resultado === 'Pendiente evaluación'));

  renderCapacitaciones(base.filter(c =>
    (!nombre || c.nombreAsociado.toLowerCase().includes(nombre)) &&
    (!nro || String(c.nroSocio).includes(nro)) &&
    (!fecha || ddmm(c.fecha).includes(fecha)) &&
    (!tipo || c.tipo === tipo) &&
    (!lugar || c.lugar === lugar) &&
    (!serv || (c.servicio || '').toLowerCase().includes(serv)) &&
    (!inst || c.instructor === inst) &&
    (!metodo || c.metodoEvaluacion === metodo) &&
    (!resultado || c.resultado === resultado) &&
    (!anio || (c.fecha || '').startsWith(anio)) &&
    (!bg || c.nombreAsociado.toLowerCase().includes(bg))
  ));
}

// ========== SELECTS ==========

export function poblarSelectsCapacitaciones() {
  const fS = (id, items) => { const el = $(id); if (!el) return; const ph = el.options[0]?.outerHTML || ''; el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join(''); };
  const fDL = (id, items) => { const el = $(id); if (el) el.innerHTML = items.map(i => `<option value="${i}">`).join(''); };

  fS('cap-tipo', DB.tiposCapacitacion);
  fS('cf-cap-tipo2', DB.tiposCapacitacion);
  fS('cap-instructor', DB.instructores);
  fS('cf-cap-inst', DB.instructores);
  fS('cf-cap-metodo', DB.metodosEval);
  fDL('dl-serv-cap', window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : DB.servicios);
  fDL('dl-asoc-cap', (DB.legajos || []).filter(l => l.estado === 'Activo').map(l => `${l.nombre} (N°${l.nro})`));
}

export function autocompletarCap() {
  const val = ($('cap-asociado') || { value: '' }).value;
  const m = val.match(/N°(\d+)/);
  if (!m) return;
  const leg = (DB.legajos || []).find(l => String(l.nro) === m[1]);
  if (!leg) return;
  if ($('cap-nro-socio')) $('cap-nro-socio').value = leg.nro;
  const servEl = $('cap-servicio');
  if (servEl && !servEl.value) servEl.value = leg.servicio || '';
}

// ========== AGENDAR / EDITAR ==========

export function abrirNuevaCapacitacion(fechaISO) {
  ['cap-asociado', 'cap-nro-socio', 'cap-servicio', 'cap-obs'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const fechaEl = $('cap-fecha'); if (fechaEl) { fechaEl.value = fechaISO || ''; fechaEl.min = hoyISO(); }
  ['cap-tipo', 'cap-lugar', 'cap-instructor', 'cap-metodo'].forEach(id => { const el = $(id); if (el) el.selectedIndex = 0; });
  const asocEl = $('cap-asociado'); if (asocEl) asocEl.readOnly = false;
  const modal = $('modal-capacitacion'); if (modal) delete modal.dataset.editId;
  poblarSelectsCapacitaciones();
  abrirModal('modal-capacitacion');
}

export function abrirEditarCapacitacionPorId(id) {
  const c = getCapById(id); if (!c) return;
  poblarSelectsCapacitaciones();
  if ($('cap-asociado')) { $('cap-asociado').value = `${c.nombreAsociado} (N°${c.nroSocio})`; $('cap-asociado').readOnly = true; }
  if ($('cap-nro-socio')) $('cap-nro-socio').value = c.nroSocio;
  if ($('cap-tipo')) $('cap-tipo').value = c.tipo;
  const fechaEl = $('cap-fecha'); if (fechaEl) { fechaEl.min = ''; fechaEl.value = c.fecha || ''; }
  if ($('cap-lugar')) $('cap-lugar').value = c.lugar;
  if ($('cap-servicio')) $('cap-servicio').value = c.servicio || '';
  if ($('cap-instructor')) $('cap-instructor').value = c.instructor;
  if ($('cap-metodo')) $('cap-metodo').value = c.metodoEvaluacion || '';
  if ($('cap-obs')) $('cap-obs').value = c.observaciones || '';
  $('modal-capacitacion').dataset.editId = c.id;
  abrirModal('modal-capacitacion');
}

export function guardarCapacitacion() {
  const nroVal = ($('cap-nro-socio') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => String(l.nro) === String(nroVal));
  const tipo = ($('cap-tipo') || { value: '' }).value;
  const fecha = ($('cap-fecha') || { value: '' }).value;
  const lugar = ($('cap-lugar') || { value: '' }).value;
  const servicio = cleanText(($('cap-servicio') || { value: '' }).value);
  const instructor = ($('cap-instructor') || { value: '' }).value;

  if (!leg) { toast('⚠️ Seleccioná un asociado'); return; }
  if (leg.estado !== 'Activo') { toast('⚠️ El asociado no está activo, no se le puede agendar capacitación'); return; }
  if (!tipo) { toast('⚠️ Seleccioná el tipo de capacitación'); $('cap-tipo').focus(); return; }
  if (!fecha) { toast('⚠️ Ingresá la fecha'); $('cap-fecha').focus(); return; }

  const modal = $('modal-capacitacion');
  const editId = modal?.dataset?.editId;
  if (!editId && fecha < hoyISO()) { toast('⚠️ La fecha no puede ser anterior a hoy'); $('cap-fecha').focus(); return; }
  if (lugar === 'Servicio' && !servicio) { toast('⚠️ Ingresá el servicio'); $('cap-servicio').focus(); return; }
  if (!instructor) { toast('⚠️ Seleccioná el instructor/a'); $('cap-instructor').focus(); return; }

  if (!editId) {
    const yaAprobada = (DB.capacitaciones || []).some(c => !c.anulado && String(c.nroSocio) === String(leg.nro) && c.tipo === tipo && c.estado === 'Dictada' && c.resultado === 'Aprobado');
    if (yaAprobada && !confirm(`ℹ️ ${leg.nombre} ya tiene aprobada "${tipo}". ¿Confirmás agendarla igual?`)) return;
  }

  const c = editId ? getCapById(editId) : {
    id: Date.now(),
    estado: 'Programada',
    resultado: null,
  };
  if (!c) { toast('⚠️ No se encontró la capacitación'); return; }

  c.legajoIdLocal = String(leg.nro);
  c.nroSocio = String(leg.nro);
  c.nombreAsociado = leg.nombre;
  c.tipo = tipo;
  c.fecha = fecha;
  c.lugar = lugar;
  c.servicio = servicio || null;
  c.instructor = instructor;
  c.metodoEvaluacion = ($('cap-metodo') || { value: '' }).value || null;
  c.observaciones = cleanText(($('cap-obs') || { value: '' }).value);
  if (editId) { c.editadoPor = currentUser?.nombre || ''; c.editadoEn = new Date().toISOString(); }

  if (!editId) DB.capacitaciones.push(c);
  if (modal) delete modal.dataset.editId;

  supaSync('capacitaciones', c);
  cerrarModal('modal-capacitacion');
  renderCapacitaciones();
  toast(editId ? '✅ Capacitación actualizada' : `✅ Capacitación agendada para ${leg.nombre} el ${ddmm(fecha)}`);
}

// ========== ANULAR ==========

export function anularCapacitacionPorId(id) {
  const c = getCapById(id); if (!c) return;
  if (c.estado !== 'Programada') { toast('⚠️ Solo se pueden anular capacitaciones Programadas'); return; }
  if (!confirm(`¿Estás seguro que querés anular la capacitación de ${c.nombreAsociado}?`)) return;
  c.estado = 'Cancelada';
  c.editadoPor = currentUser?.nombre || '';
  c.editadoEn = new Date().toISOString();
  supaSync('capacitaciones', c);
  renderCapacitaciones();
  toast('✅ Capacitación cancelada');
}

// ========== DICTAR / CARGAR RESULTADO ==========

function ensureModalDictar() {
  if ($('modal-cap-dictar')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cap-dictar';
  m.innerHTML = [
    '<div class="modal" style="max-width:560px;">',
      '<div class="modal-header"><h3 id="cap-dictar-titulo">🎓 Dictar capacitación</h3><button class="btn-close" onclick="cerrarModal(\'modal-cap-dictar\')">×</button></div>',
      '<div class="modal-body">',
        '<input type="hidden" id="cap-dictar-id">',
        '<div class="form-group"><label>Resultado *</label>',
          '<select id="cap-dictar-resultado" onchange="actualizarPuntajeDictarCap()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
            '<option value="">— Seleccionar —</option><option>Aprobado</option><option>Desaprobado</option><option>Pendiente evaluación</option><option>Sin evaluación</option>',
          '</select></div>',
        '<div id="cap-dictar-puntaje-row" class="form-group" style="display:none;"><label>Puntaje (0-100)</label><input type="number" id="cap-dictar-puntaje" min="0" max="100" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Materiales usados</label>',
          '<select id="cap-dictar-materiales" multiple style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;min-height:80px;"></select></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Observaciones</label><textarea id="cap-dictar-obs" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;"></textarea></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Certificado / constancia (opcional)</label>',
          '<div id="cap-dictar-adjunto-info" style="font-size:12px;color:#64748b;margin-bottom:6px;">Sin adjunto</div>',
          '<input type="file" id="cap-dictar-adjunto-file" accept="application/pdf,image/jpeg,image/png" style="display:none;" onchange="subirAdjuntoDictarCap()">',
          '<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'cap-dictar-adjunto-file\').click()">⬆️ Subir archivo</button>',
        '</div>',
      '</div>',
      '<div class="modal-footer">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-cap-dictar\')">Cancelar</button>',
        '<button class="btn btn-primary" onclick="guardarDictadoCap()">Guardar</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

export function actualizarPuntajeDictarCap() {
  const res = ($('cap-dictar-resultado') || { value: '' }).value;
  const row = $('cap-dictar-puntaje-row');
  if (row) row.style.display = (res === 'Aprobado' || res === 'Desaprobado') ? 'block' : 'none';
}

export function abrirDictarCapacitacionPorId(id) {
  const c = getCapById(id); if (!c) return;
  ensureModalDictar();
  $('cap-dictar-titulo').textContent = c.estado === 'Programada' ? `🎓 Dictar — ${c.nombreAsociado}` : `📝 Cargar resultado — ${c.nombreAsociado}`;
  $('cap-dictar-id').value = c.id;
  $('cap-dictar-resultado').value = c.resultado || '';
  $('cap-dictar-puntaje').value = c.puntaje != null ? c.puntaje : '';
  $('cap-dictar-obs').value = c.observaciones || '';

  const matEl = $('cap-dictar-materiales');
  const disponibles = (DB.materialesCapacitacion || []).filter(m => !m.anulado && (!m.tipoCapacitacion || m.tipoCapacitacion === c.tipo));
  matEl.innerHTML = disponibles.map(m => `<option value="${m.id}"${(c.materialesIds || []).includes(String(m.id)) ? ' selected' : ''}>${m.nombre}</option>`).join('') || '<option disabled>Sin materiales para este tipo</option>';

  const infoEl = $('cap-dictar-adjunto-info');
  infoEl.textContent = c.adjuntoIdLocal ? 'Adjunto cargado' : 'Sin adjunto';
  if (c.adjuntoIdLocal) {
    infoEl.innerHTML = 'Adjunto cargado — <a href="#" onclick="verAdjuntoDictarCap(); return false;">Ver</a>';
  }

  actualizarPuntajeDictarCap();
  abrirModal('modal-cap-dictar');
}

export async function subirAdjuntoDictarCap() {
  const input = $('cap-dictar-adjunto-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const id = $('cap-dictar-id').value;
  const c = getCapById(id);
  if (!c) { toast('⚠️ No se encontró la capacitación'); return; }
  const leg = (DB.legajos || []).find(l => String(l.nro) === String(c.nroSocio));
  if (!leg || !leg.dni) { toast('⚠️ No se encontró el DNI del asociado'); return; }
  const infoEl = $('cap-dictar-adjunto-info');
  infoEl.textContent = 'Subiendo…';
  try {
    const adj = await subirAdjunto({ dni: leg.dni, etapa: 'capacitacion', tipo: 'certificado-capacitacion', file });
    c.adjuntoIdLocal = String(adj.url);
    infoEl.innerHTML = 'Adjunto cargado — <a href="#" onclick="verAdjuntoDictarCap(); return false;">Ver</a>';
    toast('📎 Archivo subido — se guarda al confirmar');
  } catch (e) {
    infoEl.textContent = 'Sin adjunto';
    toast('⚠️ ' + (e.message || 'Error al subir el archivo'));
  } finally {
    if (input) input.value = '';
  }
}

export async function verAdjuntoDictarCap() {
  const id = $('cap-dictar-id').value;
  const c = getCapById(id);
  if (!c || !c.adjuntoIdLocal) return;
  const url = await obtenerUrlFirmada(c.adjuntoIdLocal);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

export function guardarDictadoCap() {
  const id = $('cap-dictar-id').value;
  const c = getCapById(id);
  if (!c) { toast('⚠️ No se encontró la capacitación'); return; }
  const resultado = ($('cap-dictar-resultado') || { value: '' }).value;
  if (!resultado) { toast('⚠️ Seleccioná el resultado'); return; }

  const matEl = $('cap-dictar-materiales');
  const materialesIds = matEl ? Array.from(matEl.selectedOptions).map(o => o.value) : [];

  c.estado = 'Dictada';
  c.resultado = resultado;
  const puntajeVal = ($('cap-dictar-puntaje') || { value: '' }).value;
  c.puntaje = puntajeVal !== '' ? parseInt(puntajeVal, 10) : null;
  c.materialesIds = materialesIds;
  c.observaciones = cleanText(($('cap-dictar-obs') || { value: '' }).value);
  c.editadoPor = currentUser?.nombre || '';
  c.editadoEn = new Date().toISOString();

  supaSync('capacitaciones', c);

  // Competencia Anual: capacitación aprobada suma puntos. El campo
  // real `lugar` solo tiene 4 valores (Servicio/Oficina Central/
  // Virtual/Externo) — "Virtual" y "Externo" fusionan en la regla
  // "Capacitación virtual" (no hay distinción real de video vs Meet).
  if (resultado === 'Aprobado') {
    const legajo = (DB.legajos || []).find(l => String(l.nro) === String(c.nroSocio) && l.estado === 'Activo');
    if (legajo && !esAdministrativo(legajo)) {
      const codigoRegla = c.lugar === 'Oficina Central' ? 'capacitacion_presencial'
        : c.lugar === 'Servicio' ? 'capacitacion_servicio'
        : (c.lugar === 'Virtual' || c.lugar === 'Externo') ? 'capacitacion_virtual' : null;
      if (codigoRegla) {
        registrarEvento({
          reglaCodigo: codigoRegla, fecha: c.fecha, protagonista: legajo,
          referenciaExterna: 'cap:' + String(c.id), origenModulo: 'Capacitaciones',
          observaciones: 'Capacitación aprobada: ' + (c.tipo || ''), generadoPor: currentUser?.nombre || 'Sistema',
        });
      }
    }
  }

  cerrarModal('modal-cap-dictar');
  renderCapacitaciones();
  toast(resultado === 'Pendiente evaluación'
    ? '✅ Capacitación dictada — queda en Registro esperando resultado'
    : '✅ Capacitación cerrada');
}

// ========== ANÁLISIS IA (placeholder — spec §3.6) ==========

export function analizarCapacitacionesIA() {
  toast('🤖 Análisis con IA — Próximamente');
}

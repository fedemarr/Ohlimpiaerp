// Módulo Capacitaciones — Tab Evaluaciones (Etapa 3, spec §10).
// Exámenes de opción múltiple con corrección automática, reemplaza el
// uso actual de Google Forms. El envío/respuesta pasa por
// api/evaluacion-preguntas.js y api/evaluacion-responder.js (funciones
// serverless de Vercel, mismo patrón que api/postular.js), no por una
// Edge Function de Supabase — el proyecto ya resuelve "escritura pública
// sin login" así.
//
// Ojo con el truncamiento de id_local (mismo bug ya documentado para
// candidato/psico por DNI): supaSync trunca cualquier id a 9 dígitos.
// Acá se evita casi todo el problema resolviendo los cruces por
// `tipoCapacitacion` (clave de negocio estable) en vez de por id; el
// único cruce por id real que persiste es `capacitacionIdLocal` (lo
// necesita la función de Vercel para actualizar la capacitación después
// de corregir), así que se guarda ya truncado con `.slice(-9)`.

import { DB, currentUser } from '@shared/state.js';
import { $, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const getPreguntaById = (id) => (DB.preguntasEvaluacion || []).find(p => String(p.id) === String(id));
const getPlantillaById = (id) => (DB.plantillasEvaluacion || []).find(p => String(p.id) === String(id));
const getEvaluacionById = (id) => (DB.evaluacionesEnviadas || []).find(e => String(e.id) === String(id));
const idLocalTrunc = (id) => String(id).slice(-9);

// ========== SUB-TABS ==========

export function tabEval(sub, btn) {
  document.querySelectorAll('#cap-tab-evaluaciones .eval-subtab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#cap-tab-evaluaciones .eval-subtab-btn').forEach(b => b.classList.remove('active'));
  const content = $('eval-sub-' + sub);
  if (content) content.classList.add('active');
  if (btn) btn.classList.add('active');
  if (sub === 'banco') { poblarSelectBancoTipo(); renderBancoPreguntas(); }
  if (sub === 'plantillas') renderPlantillas();
  if (sub === 'enviadas') { chequearVencidas(); renderEvaluacionesEnviadas(); }
  if (sub === 'norespondieron') renderNoRespondieron();
}

// ========== BANCO DE PREGUNTAS ==========

export function poblarSelectBancoTipo() {
  const sel = $('eval-banco-tipo'); if (!sel || sel.options.length) return;
  sel.innerHTML = (DB.tiposCapacitacion || []).map(t => `<option>${t}</option>`).join('');
}

export function cambiarTipoBanco() { renderBancoPreguntas(); }

export function renderBancoPreguntas() {
  const cont = $('lista-banco-preguntas'); if (!cont) return;
  const tipo = ($('eval-banco-tipo') || { value: '' }).value || (DB.tiposCapacitacion || [])[0];
  const preguntas = (DB.preguntasEvaluacion || []).filter(p => !p.anulado && p.tipoCapacitacion === tipo);
  if (!preguntas.length) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">❓</div><p>Sin preguntas cargadas para este tipo</p></div>';
    return;
  }
  cont.innerHTML = preguntas.map(p => `
    <div style="background:white;border:1px solid var(--borde);border-radius:var(--radio);padding:12px;margin-bottom:8px;">
      <div style="font-weight:500;font-size:13px;margin-bottom:6px;">${p.enunciado}</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;font-size:12px;color:var(--texto-suave);margin-bottom:8px;">
        <div>${p.correcta === 'A' ? '✅' : '◻️'} A) ${p.opcionA}</div>
        <div>${p.correcta === 'B' ? '✅' : '◻️'} B) ${p.opcionB}</div>
        <div>${p.correcta === 'C' ? '✅' : '◻️'} C) ${p.opcionC}</div>
        <div>${p.correcta === 'D' ? '✅' : '◻️'} D) ${p.opcionD}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-secondary btn-xs" data-action="editar" data-id="${p.id}">✏️ Editar</button>
        <button class="btn btn-danger btn-xs" data-action="eliminar" data-id="${p.id}">🗑️ Eliminar</button>
      </div>
    </div>`).join('');
  cont.onclick = (e) => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'editar') abrirEditarPreguntaPorId(id);
    else eliminarPreguntaPorId(id);
  };
}

function ensureModalPregunta() {
  if ($('modal-eval-pregunta')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-eval-pregunta';
  m.innerHTML = [
    '<div class="modal" style="max-width:520px;">',
      '<div class="modal-header"><h3 id="eval-pregunta-titulo">❓ Nueva pregunta</h3><button class="btn-close" onclick="cerrarModal(\'modal-eval-pregunta\')">×</button></div>',
      '<div class="modal-body">',
        '<input type="hidden" id="eval-pregunta-id">',
        '<div class="form-group"><label>Tipo de capacitación *</label><select id="eval-pregunta-tipo" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></select></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Enunciado *</label><textarea id="eval-pregunta-enunciado" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;"></textarea></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Opción A *</label><input type="text" id="eval-pregunta-a" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Opción B *</label><input type="text" id="eval-pregunta-b" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Opción C *</label><input type="text" id="eval-pregunta-c" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Opción D *</label><input type="text" id="eval-pregunta-d" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Respuesta correcta *</label><select id="eval-pregunta-correcta" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">— Seleccionar —</option><option>A</option><option>B</option><option>C</option><option>D</option></select></div>',
      '</div>',
      '<div class="modal-footer">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-eval-pregunta\')">Cancelar</button>',
        '<button class="btn btn-primary" onclick="guardarPregunta()">Guardar</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

export function abrirNuevaPregunta() {
  ensureModalPregunta();
  $('eval-pregunta-titulo').textContent = '❓ Nueva pregunta';
  $('eval-pregunta-id').value = '';
  const tipoSel = $('eval-pregunta-tipo');
  tipoSel.innerHTML = (DB.tiposCapacitacion || []).map(t => `<option>${t}</option>`).join('');
  const tipoActual = ($('eval-banco-tipo') || {}).value;
  if (tipoActual) tipoSel.value = tipoActual;
  ['eval-pregunta-enunciado', 'eval-pregunta-a', 'eval-pregunta-b', 'eval-pregunta-c', 'eval-pregunta-d'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('eval-pregunta-correcta').value = '';
  abrirModal('modal-eval-pregunta');
}

export function abrirEditarPreguntaPorId(id) {
  const p = getPreguntaById(id); if (!p) return;
  ensureModalPregunta();
  $('eval-pregunta-titulo').textContent = '✏️ Editar pregunta';
  $('eval-pregunta-id').value = p.id;
  const tipoSel = $('eval-pregunta-tipo');
  tipoSel.innerHTML = (DB.tiposCapacitacion || []).map(t => `<option>${t}</option>`).join('');
  tipoSel.value = p.tipoCapacitacion;
  $('eval-pregunta-enunciado').value = p.enunciado;
  $('eval-pregunta-a').value = p.opcionA;
  $('eval-pregunta-b').value = p.opcionB;
  $('eval-pregunta-c').value = p.opcionC;
  $('eval-pregunta-d').value = p.opcionD;
  $('eval-pregunta-correcta').value = p.correcta;
  abrirModal('modal-eval-pregunta');
}

export function guardarPregunta() {
  const id = $('eval-pregunta-id').value;
  const tipo = ($('eval-pregunta-tipo') || { value: '' }).value;
  const enunciado = cleanText(($('eval-pregunta-enunciado') || { value: '' }).value);
  const a = cleanText(($('eval-pregunta-a') || { value: '' }).value);
  const b = cleanText(($('eval-pregunta-b') || { value: '' }).value);
  const c = cleanText(($('eval-pregunta-c') || { value: '' }).value);
  const d = cleanText(($('eval-pregunta-d') || { value: '' }).value);
  const correcta = ($('eval-pregunta-correcta') || { value: '' }).value;
  if (!tipo || !enunciado || !a || !b || !c || !d || !correcta) { toast('⚠️ Completá todos los campos'); return; }

  const p = id ? getPreguntaById(id) : { id: Date.now() };
  if (!p) { toast('⚠️ No se encontró la pregunta'); return; }
  p.tipoCapacitacion = tipo;
  p.enunciado = enunciado;
  p.opcionA = a; p.opcionB = b; p.opcionC = c; p.opcionD = d;
  p.correcta = correcta;
  if (id) { p.editadoPor = currentUser?.nombre || ''; p.editadoEn = new Date().toISOString(); }
  if (!id) { if (!DB.preguntasEvaluacion) DB.preguntasEvaluacion = []; DB.preguntasEvaluacion.push(p); }

  supaSync('preguntasEvaluacion', p);
  cerrarModal('modal-eval-pregunta');
  renderBancoPreguntas();
  toast(id ? '✅ Pregunta actualizada' : '✅ Pregunta agregada');
}

export function eliminarPreguntaPorId(id) {
  const p = getPreguntaById(id); if (!p) return;
  if (!confirm('¿Eliminar esta pregunta del banco?')) return;
  p.anulado = true;
  supaSync('preguntasEvaluacion', p);
  renderBancoPreguntas();
  toast('✅ Pregunta eliminada');
}

// ========== PLANTILLAS ==========

function sembrarPlantillasFaltantes() {
  const existentes = new Set((DB.plantillasEvaluacion || []).map(pl => pl.tipoCapacitacion));
  (DB.tiposCapacitacion || []).forEach((t, i) => {
    if (existentes.has(t)) return;
    const pl = { id: Date.now() + i, tipoCapacitacion: t, preguntasIds: [], notaMinima: 70, plazoHoras: 48 };
    if (!DB.plantillasEvaluacion) DB.plantillasEvaluacion = [];
    DB.plantillasEvaluacion.push(pl);
    supaSync('plantillasEvaluacion', pl);
  });
}

export function renderPlantillas() {
  sembrarPlantillasFaltantes();
  const cont = $('grilla-plantillas'); if (!cont) return;
  const plantillas = (DB.plantillasEvaluacion || []).filter(p => !p.anulado);
  cont.innerHTML = plantillas.map(pl => `
    <div style="background:white;border:1px solid var(--borde);border-radius:var(--radio-lg);padding:14px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${pl.tipoCapacitacion}</div>
      <div style="font-size:12px;color:var(--texto-suave);margin-bottom:4px;">${(pl.preguntasIds || []).length} pregunta(s) incluidas</div>
      <div style="font-size:12px;color:var(--texto-suave);margin-bottom:10px;">Nota mínima: ${pl.notaMinima}% · Plazo: ${pl.plazoHoras}hs</div>
      <button class="btn btn-secondary btn-xs" data-action="editar" data-id="${pl.id}">✏️ Editar</button>
    </div>`).join('');
  cont.onclick = (e) => {
    const btn = e.target.closest('button[data-action="editar"]'); if (!btn) return;
    abrirEditarPlantillaPorId(btn.dataset.id);
  };
}

function ensureModalPlantilla() {
  if ($('modal-eval-plantilla')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-eval-plantilla';
  m.innerHTML = [
    '<div class="modal" style="max-width:560px;">',
      '<div class="modal-header"><h3 id="eval-plantilla-titulo">✏️ Editar plantilla</h3><button class="btn-close" onclick="cerrarModal(\'modal-eval-plantilla\')">×</button></div>',
      '<div class="modal-body" style="max-height:60vh;overflow-y:auto;">',
        '<input type="hidden" id="eval-plantilla-id">',
        '<div class="form-group"><label>Nota mínima para aprobar (%)</label><input type="number" id="eval-plantilla-nota" min="0" max="100" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '<div class="form-group" style="margin-top:8px;"><label>Plazo para responder (horas)</label><input type="number" id="eval-plantilla-plazo" min="1" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '<div class="form-group" style="margin-top:10px;"><label>Preguntas incluidas</label><div id="eval-plantilla-preguntas" style="display:flex;flex-direction:column;gap:4px;font-size:12px;"></div></div>',
      '</div>',
      '<div class="modal-footer">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-eval-plantilla\')">Cancelar</button>',
        '<button class="btn btn-primary" onclick="guardarPlantilla()">Guardar</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

export function abrirEditarPlantillaPorId(id) {
  const pl = getPlantillaById(id); if (!pl) return;
  ensureModalPlantilla();
  $('eval-plantilla-titulo').textContent = `✏️ Plantilla — ${pl.tipoCapacitacion}`;
  $('eval-plantilla-id').value = pl.id;
  $('eval-plantilla-nota').value = pl.notaMinima;
  $('eval-plantilla-plazo').value = pl.plazoHoras;
  const cont = $('eval-plantilla-preguntas');
  const preguntas = (DB.preguntasEvaluacion || []).filter(p => !p.anulado && p.tipoCapacitacion === pl.tipoCapacitacion);
  const incluidas = (pl.preguntasIds || []).map(String);
  cont.innerHTML = preguntas.length
    ? preguntas.map(p => `<label><input type="checkbox" value="${p.id}"${incluidas.includes(String(p.id)) ? ' checked' : ''}> ${p.enunciado}</label>`).join('')
    : '<span class="text-muted">Sin preguntas cargadas en el Banco para este tipo todavía.</span>';
  abrirModal('modal-eval-plantilla');
}

export function guardarPlantilla() {
  const id = $('eval-plantilla-id').value;
  const pl = getPlantillaById(id); if (!pl) { toast('⚠️ No se encontró la plantilla'); return; }
  pl.notaMinima = parseInt(($('eval-plantilla-nota') || { value: '70' }).value, 10) || 70;
  pl.plazoHoras = parseInt(($('eval-plantilla-plazo') || { value: '48' }).value, 10) || 48;
  const checks = Array.from(document.querySelectorAll('#eval-plantilla-preguntas input[type="checkbox"]:checked'));
  // Truncar cada id de pregunta a 9 dígitos: es el mismo valor que va a
  // terminar en preguntas_evaluacion.id_local vía supaSync, y la función
  // de Vercel busca las preguntas por ese id_local — si acá quedara sin
  // truncar (por ejemplo una pregunta recién creada en esta sesión, con
  // id = Date.now() de 13 dígitos), no matchearía hasta un refresh.
  pl.preguntasIds = checks.map(c => idLocalTrunc(c.value));

  supaSync('plantillasEvaluacion', pl);
  cerrarModal('modal-eval-plantilla');
  renderPlantillas();
  toast('✅ Plantilla actualizada');
}

// ========== ENVÍO ==========

function ensureModalLink() {
  if ($('modal-eval-link')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-eval-link';
  m.innerHTML = [
    '<div class="modal" style="max-width:480px;">',
      '<div class="modal-header"><h3>📧 Evaluación creada</h3><button class="btn-close" onclick="cerrarModal(\'modal-eval-link\')">×</button></div>',
      '<div class="modal-body">',
        '<p style="font-size:13px;margin-bottom:10px;">Copiá este link y enviáselo al asociado (por ahora, a mano):</p>',
        '<div style="display:flex;gap:6px;"><input type="text" id="eval-link-valor" readonly style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;"><button class="btn btn-secondary btn-sm" onclick="copiarLinkEvaluacion()">Copiar</button></div>',
      '</div>',
      '<div class="modal-footer"><button class="btn btn-primary" onclick="cerrarModal(\'modal-eval-link\')">Listo</button></div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

function mostrarLinkEvaluacion(evaluacion) {
  ensureModalLink();
  $('eval-link-valor').value = `${location.origin}/evaluacion?token=${evaluacion.token}`;
  abrirModal('modal-eval-link');
}

export function copiarLinkEvaluacion() {
  const input = $('eval-link-valor'); if (!input) return;
  navigator.clipboard.writeText(input.value)
    .then(() => toast('📋 Link copiado'))
    .catch(() => toast('⚠️ No se pudo copiar, seleccioná y copiá manualmente'));
}

export function enviarEvaluacionPorId(capId) {
  const cap = (DB.capacitaciones || []).find(c => String(c.id) === String(capId));
  if (!cap) { toast('⚠️ No se encontró la capacitación'); return; }
  const plantilla = (DB.plantillasEvaluacion || []).find(p => !p.anulado && p.tipoCapacitacion === cap.tipo);
  if (!plantilla || !(plantilla.preguntasIds || []).length) {
    toast('⚠️ La plantilla no tiene preguntas configuradas. Cargalas en el sub-tab Banco antes de enviar.');
    return;
  }

  const nueva = {
    id: Date.now(),
    capacitacionIdLocal: idLocalTrunc(cap.id),
    legajoIdLocal: cap.nroSocio,
    nroSocio: cap.nroSocio,
    nombreAsociado: cap.nombreAsociado,
    tipoCapacitacion: cap.tipo,
    plantillaIdLocal: idLocalTrunc(plantilla.id),
    token: crypto.randomUUID(),
    fechaEnvio: new Date().toISOString(),
    fechaLimite: new Date(Date.now() + (plantilla.plazoHoras || 48) * 3600 * 1000).toISOString(),
    estado: 'Enviada',
  };
  if (!DB.evaluacionesEnviadas) DB.evaluacionesEnviadas = [];
  DB.evaluacionesEnviadas.push(nueva);
  supaSync('evaluacionesEnviadas', nueva);
  mostrarLinkEvaluacion(nueva);
  toast(`✅ Evaluación creada para ${cap.nombreAsociado}`);
}

// ========== ENVIADAS ==========

export function chequearVencidas() {
  const ahora = new Date();
  (DB.evaluacionesEnviadas || []).filter(e => !e.anulado && e.estado === 'Enviada' && new Date(e.fechaLimite) < ahora).forEach(e => {
    e.estado = 'Vencida';
    supaSync('evaluacionesEnviadas', e);
  });
}

function poblarSelectTipoEnviadas() {
  const sel = $('cf-eval-tipo'); if (!sel || sel.options.length > 1) return;
  sel.innerHTML = '<option value="">Todos los tipos</option>' + (DB.tiposCapacitacion || []).map(t => `<option>${t}</option>`).join('');
}

export function renderEvaluacionesEnviadas(lista) {
  poblarSelectTipoEnviadas();
  const tbody = $('tbody-eval-enviadas'); if (!tbody) return;
  const rows = lista || (DB.evaluacionesEnviadas || []).filter(e => !e.anulado);
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">📧</div><p>Sin evaluaciones enviadas</p></div></td></tr>'; return; }
  tbody.innerHTML = rows.map(e => {
    let btns = `<button data-action="ver" data-id="${e.id}" style="font-size:11px;padding:3px 8px;border:none;border-radius:4px;background:#e2e8f0;color:#374151;cursor:pointer;">👁 Ver</button>`;
    if (e.estado === 'Vencida') btns += ` <button data-action="reenviar" data-id="${e.id}" style="font-size:11px;padding:3px 8px;border:none;border-radius:4px;background:#7c3aed;color:white;cursor:pointer;">🔄 Reenviar</button>`;
    btns += ` <button data-action="anular" data-id="${e.id}" style="font-size:11px;padding:3px 8px;border:none;border-radius:4px;background:#dc2626;color:white;cursor:pointer;">❌</button>`;
    return `<tr>
      <td style="font-size:12px;">${e.tipoCapacitacion.replace('Capacitación de Ingreso: ', '')}</td>
      <td style="font-weight:500;">${e.nombreAsociado}</td>
      <td style="font-size:12px;">${new Date(e.fechaEnvio).toLocaleDateString('es-AR')}</td>
      <td style="font-size:12px;">${new Date(e.fechaLimite).toLocaleDateString('es-AR')}</td>
      <td><span class="badge ${e.estado === 'Respondida' ? 'badge-verde' : e.estado === 'Vencida' ? 'badge-rojo' : 'badge-azul'}">${e.estado}</span></td>
      <td style="text-align:center;">${e.puntaje != null ? e.puntaje + '%' : '—'}</td>
      <td style="font-size:12px;">${e.resultado || '—'}</td>
      <td><div style="display:flex;flex-wrap:wrap;gap:2px;">${btns}</div></td>
    </tr>`;
  }).join('');
  tbody.onclick = (ev) => {
    const btn = ev.target.closest('button[data-action]'); if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'ver') verDetalleEvaluacionPorId(id);
    else if (action === 'reenviar') reenviarEvaluacionPorId(id);
    else if (action === 'anular') anularEvaluacionPorId(id);
  };
}

export function filtrarEvaluacionesEnviadas() {
  const estado = ($('cf-eval-estado') || { value: '' }).value;
  const tipo = ($('cf-eval-tipo') || { value: '' }).value;
  const anio = ($('cf-eval-anio') || { value: '' }).value;
  renderEvaluacionesEnviadas((DB.evaluacionesEnviadas || []).filter(e => !e.anulado
    && (!estado || e.estado === estado)
    && (!tipo || e.tipoCapacitacion === tipo)
    && (!anio || (e.fechaEnvio || '').startsWith(anio))));
}

function ensureModalDetalleEval() {
  if ($('modal-eval-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-eval-detalle';
  m.innerHTML = [
    '<div class="modal" style="max-width:640px;">',
      '<div class="modal-header"><h3>👁 Detalle de la evaluación</h3><button class="btn-close" onclick="cerrarModal(\'modal-eval-detalle\')">×</button></div>',
      '<div class="modal-body" style="max-height:65vh;overflow-y:auto;"><div id="eval-detalle-body"></div></div>',
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal(\'modal-eval-detalle\')">Cerrar</button></div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

export function verDetalleEvaluacionPorId(id) {
  const e = getEvaluacionById(id); if (!e) return;
  ensureModalDetalleEval();
  const body = $('eval-detalle-body');
  const cabecera = `<div style="margin-bottom:12px;font-size:13px;">
    <div><strong>${e.nombreAsociado}</strong> (N°${e.nroSocio}) — ${e.tipoCapacitacion}</div>
    <div style="color:var(--texto-suave);">Enviada: ${new Date(e.fechaEnvio).toLocaleString('es-AR')} · Plazo: ${new Date(e.fechaLimite).toLocaleString('es-AR')} · Estado: ${e.estado}</div>
    ${e.puntaje != null ? `<div style="margin-top:4px;">Puntaje: <strong>${e.puntaje}%</strong> — ${e.resultado}</div>` : ''}
  </div>`;

  // El id de e puede venir sin truncar (Date.now() de esta misma sesión,
  // sin recargar) o ya truncado (cargado de Supabase) — se comparan las
  // dos formas contra evaluacionIdLocal, que la función de Vercel siempre
  // guarda ya truncado (lo lee directo de la fila real en la base).
  const respuestas = (DB.respuestasEvaluacion || []).filter(r => !r.anulado
    && (String(r.evaluacionIdLocal) === String(e.id) || String(r.evaluacionIdLocal) === idLocalTrunc(e.id)));
  if (!respuestas.length) {
    body.innerHTML = cabecera + '<p class="text-muted">Todavía no respondió.</p>';
    abrirModal('modal-eval-detalle');
    return;
  }
  const preguntasHtml = respuestas.map(r => {
    const p = getPreguntaById(r.preguntaIdLocal);
    if (!p) return '';
    const opciones = { A: p.opcionA, B: p.opcionB, C: p.opcionC, D: p.opcionD };
    return `<div style="border:1px solid var(--borde);border-radius:8px;padding:10px;margin-bottom:8px;">
      <div style="font-weight:500;font-size:13px;margin-bottom:6px;">${p.enunciado}</div>
      ${Object.entries(opciones).map(([letra, texto]) => {
        const esRespuesta = r.respuesta === letra;
        const esCorrecta = p.correcta === letra;
        let estilo = '';
        if (esCorrecta) estilo = 'color:var(--verde);font-weight:600;';
        else if (esRespuesta) estilo = 'color:var(--rojo);font-weight:600;';
        return `<div style="font-size:12px;${estilo}">${esRespuesta ? '👉 ' : ''}${letra}) ${texto}${esCorrecta ? ' ✅' : ''}</div>`;
      }).join('')}
      <div style="margin-top:4px;font-size:11px;color:${r.correcta ? 'var(--verde)' : 'var(--rojo)'};">${r.correcta ? '✅ Correcta' : '❌ Incorrecta'}</div>
    </div>`;
  }).join('');
  body.innerHTML = cabecera + preguntasHtml;
  abrirModal('modal-eval-detalle');
}

export function reenviarEvaluacionPorId(id) {
  const e = getEvaluacionById(id); if (!e) return;
  if (e.estado !== 'Vencida') { toast('⚠️ Solo se puede reenviar una evaluación Vencida'); return; }
  const pl = (DB.plantillasEvaluacion || []).find(p => !p.anulado && p.tipoCapacitacion === e.tipoCapacitacion);
  const plazoHoras = pl ? pl.plazoHoras : 48;

  const nueva = {
    id: Date.now(),
    capacitacionIdLocal: e.capacitacionIdLocal,
    legajoIdLocal: e.legajoIdLocal,
    nroSocio: e.nroSocio,
    nombreAsociado: e.nombreAsociado,
    tipoCapacitacion: e.tipoCapacitacion,
    plantillaIdLocal: pl ? idLocalTrunc(pl.id) : e.plantillaIdLocal,
    token: crypto.randomUUID(),
    fechaEnvio: new Date().toISOString(),
    fechaLimite: new Date(Date.now() + plazoHoras * 3600 * 1000).toISOString(),
    estado: 'Enviada',
  };
  DB.evaluacionesEnviadas.push(nueva);
  supaSync('evaluacionesEnviadas', nueva);
  e.anulado = true;
  supaSync('evaluacionesEnviadas', e);
  renderEvaluacionesEnviadas();
  mostrarLinkEvaluacion(nueva);
  toast('✅ Evaluación reenviada');
}

export function anularEvaluacionPorId(id) {
  const e = getEvaluacionById(id); if (!e) return;
  if (!confirm('¿Anular esta evaluación enviada?')) return;
  e.anulado = true;
  supaSync('evaluacionesEnviadas', e);
  renderEvaluacionesEnviadas();
  toast('✅ Evaluación anulada');
}

// ========== NO RESPONDIERON ==========

export function renderNoRespondieron() {
  const tbody = $('tbody-eval-norespondieron'); if (!tbody) return;
  const activos = (DB.legajos || []).filter(l => l.estado === 'Activo');
  const filas = activos.map(l => {
    const propias = (DB.evaluacionesEnviadas || []).filter(e => !e.anulado && String(e.nroSocio) === String(l.nro));
    const enviadas = propias.length;
    const respondidas = propias.filter(e => e.estado === 'Respondida').length;
    const tasa = enviadas ? Math.round(respondidas / enviadas * 100) : 0;
    return { l, enviadas, respondidas, tasa };
  }).filter(f => f.enviadas > 0).sort((a, b) => a.tasa - b.tasa).slice(0, 10);

  const riesgo = t => t < 50 ? 'Alto' : t < 80 ? 'Medio' : 'Bajo';
  const badge = t => t < 50 ? 'badge-rojo' : t < 80 ? 'badge-acento' : 'badge-verde';

  tbody.innerHTML = filas.map(f => `<tr>
    <td style="font-weight:500;">${f.l.nombre}</td>
    <td style="font-size:12px;">${f.l.servicio || '—'}</td>
    <td style="font-size:12px;">${f.l.supervisor || '—'}</td>
    <td style="text-align:center;">${f.enviadas}</td>
    <td style="text-align:center;">${f.respondidas}</td>
    <td style="text-align:center;"><span class="badge ${badge(f.tasa)}">${f.tasa}%</span></td>
    <td><span class="badge ${badge(f.tasa)}">${riesgo(f.tasa)}</span></td>
  </tr>`).join('') || `<tr><td colspan="7"><div class="empty-state"><div class="icon">🎉</div><p>Todos responden sus evaluaciones</p></div></td></tr>`;
}

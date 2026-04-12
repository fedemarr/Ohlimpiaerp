import { DB, LOCALIDADES_BA } from '@shared/state.js';
import { $, toTitleCase, cleanText, validarCampos, hoyStr, badge } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// ========== ESTADO INTERNO ==========

let _candTab = 'activos';

// ========== HELPERS ==========

export function getCandById(id) {
  return (DB.candidatos || []).find(c => c.id == id);
}

export function getIdxById(id) {
  return (DB.candidatos || []).findIndex(c => c.id == id);
}

// ========== TABS ==========

export function tabCandidatos(tab) {
  _candTab = tab;
  ['activos', 'historico'].forEach(t => {
    const btn = $('tab-cand-' + t);
    if (btn) {
      btn.style.background = t === tab ? '#1e3a8a' : '#f1f5f9';
      btn.style.color = t === tab ? 'white' : '#64748b';
    }
  });
  renderCandidatos();
}

// ========== RENDER ==========

function bindTbodyEvents(tbody) {
  if (!tbody) return;
  tbody.onclick = function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'citar') abrirCitarPorId(id);
    else if (action === 'resultado') abrirResultadoPorId(id);
    else if (action === 'aprobar') aprobarCandidatoPorId(id);
    else if (action === 'rechazar') rechazarCandidatoPorId(id);
    else if (action === 'psico') pasarAPsicoPorId(id);
    else if (action === 'editar') editarCandidatoPorId(id);
  };
  tbody.onchange = function (e) {
    const sel = e.target.closest('select[data-action="asistencia"]');
    if (!sel) return;
    e.stopPropagation();
    registrarAsistencia(sel.dataset.id, sel.value);
  };
}

export function renderCandidatos(lista) {
  const todos = DB.candidatos || [];

  // Modo legacy: recibe lista filtrada directamente
  if (lista) {
    const tbody = $('tbody-candidatos');
    if (tbody) { tbody.innerHTML = lista.map(c => renderFilaCand(c)).join(''); bindTbodyEvents(tbody); }
    return;
  }

  const buscar = (($('cand-buscar') || {}).value || '').toLowerCase();
  const fZona = (($('cand-filtro-zona') || {}).value || '');
  const fEstado = (($('cand-filtro-estado') || {}).value || '');

  const estadosHist = ['Rechazado', 'Psicotécnico'];
  const activos = todos.filter(c => !estadosHist.includes(c.estado));
  const hist = todos.filter(c => estadosHist.includes(c.estado));
  let lista2 = _candTab === 'historico' ? hist : activos;

  if (buscar) lista2 = lista2.filter(c => (c.nombre || '').toLowerCase().includes(buscar) || (c.dni || '').includes(buscar));
  if (fZona) lista2 = lista2.filter(c => c.zona === fZona);
  if (fEstado) lista2 = lista2.filter(c => c.estado === fEstado);

  // Stats
  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-c-sincitar', activos.filter(c => c.estado === 'Sin citar').length);
  ss('st-c-citados', activos.filter(c => c.estado === 'Citado').length);
  ss('st-c-entrevistados', activos.filter(c => c.estado === 'Entrevistado').length);
  ss('st-c-aprobados', activos.filter(c => c.estado === 'Aprobado').length);

  // Poblar filtro zonas
  const zSel = $('cand-filtro-zona');
  if (zSel && zSel.options.length <= 1) {
    [...new Set(todos.map(c => c.zona).filter(Boolean))].sort().forEach(z => {
      const o = document.createElement('option');
      o.value = z; o.textContent = z;
      zSel.appendChild(o);
    });
  }

  const tbody = $('tbody-candidatos');
  if (!tbody) return;
  if (!lista2.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8;">Sin candidatos</td></tr>';
    return;
  }
  tbody.innerHTML = lista2.map(c => renderFilaCand(c)).join('');
  bindTbodyEvents(tbody);
}

function renderFilaCand(c) {
  const ec = { 'Sin citar': '#64748b', 'Citado': '#2563eb', 'Entrevistado': '#d97706', 'Aprobado': '#16a34a', 'Rechazado': '#dc2626', 'Psicotécnico': '#7c3aed' }[c.estado] || '#64748b';
  const cid = c.id;
  let btns = '';

  if (_candTab === 'activos') {
    const btnStyle = 'font-size:11px;padding:3px 8px;border:none;border-radius:4px;cursor:pointer;margin-right:2px;';
    if (c.estado === 'Sin citar')
      btns += '<button data-action="citar" data-id="' + cid + '" style="' + btnStyle + 'background:#2563eb;color:white;">📅 Citar</button>';
    else if (c.estado === 'Citado')
      btns += '<button data-action="resultado" data-id="' + cid + '" style="' + btnStyle + 'background:#d97706;color:white;">📋 Resultado</button>';
    else if (c.estado === 'Entrevistado') {
      btns += '<button data-action="aprobar" data-id="' + cid + '" style="' + btnStyle + 'background:#16a34a;color:white;">✅ Aprobar</button>';
      btns += '<button data-action="rechazar" data-id="' + cid + '" style="' + btnStyle + 'background:#dc2626;color:white;">❌ Rechazar</button>';
    } else if (c.estado === 'Aprobado')
      btns += '<button data-action="psico" data-id="' + cid + '" style="' + btnStyle + 'background:#7c3aed;color:white;">🧠 Psico</button>';
    btns += '<button data-action="editar" data-id="' + cid + '" style="' + btnStyle + 'background:#e2e8f0;color:#374151;">✏️</button>';
  }

  return '<tr style="border-bottom:1px solid #e2e8f0;">'
    + '<td style="padding:8px 12px;font-size:13px;"><strong>' + c.nombre + '</strong></td>'
    + '<td style="padding:8px;font-size:12px;color:#64748b;">' + (c.dni || '—') + '</td>'
    + '<td style="padding:8px;font-size:12px;">' + (c.tel || '—') + '</td>'
    + '<td style="padding:8px;font-size:12px;">' + (c.zona || '—') + '</td>'
    + '<td style="padding:8px;font-size:12px;">' + (c.medio || '—') + '</td>'
    + '<td style="padding:8px;text-align:center;font-size:12px;">' + (c.fecha ? '<strong>' + c.fecha + '</strong>' : '<span style="color:#cbd5e1;">—</span>') + '</td>'
    + '<td style="padding:8px;text-align:center;font-size:12px;">' + (c.hora || '—') + '</td>'
    + '<td style="padding:6px;text-align:center;">' + (c.estado === 'Citado'
      ? '<select data-action="asistencia" data-id="' + cid + '" style="font-size:12px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;">'
        + '<option value="-"' + (c.asistio === '-' || !c.asistio ? ' selected' : '') + '>— Sin registrar</option>'
        + '<option value="Sí"' + (c.asistio === 'Sí' ? ' selected' : '') + '>✅ Sí asistió</option>'
        + '<option value="No"' + (c.asistio === 'No' ? ' selected' : '') + '>❌ No asistió</option>'
        + '</select>'
      : (c.asistio === 'Sí' ? '✅' : c.asistio === 'No' ? '❌' : '—')) + '</td>'
    + '<td style="padding:8px;text-align:center;"><span style="font-size:11px;font-weight:600;color:' + ec + '">' + c.estado + '</span></td>'
    + '<td style="padding:8px;font-size:12px;color:#dc2626;">' + (c.motivoRechazo || '—') + '</td>'
    + '<td style="padding:8px;text-align:center;">' + btns + '</td>'
    + '</tr>';
}

// ========== FILTROS ==========

export function filtrarCandidatos() {
  const b = [
    ($('buscar-cand') || { value: '' }).value,
    ($('buscador-global') || { value: '' }).value,
  ].find(v => v) || '';
  const busq = b.toLowerCase();
  const zona = ($('cf-cand-zona') || { value: '' }).value;
  const estado = ($('cf-cand-estado') || { value: '' }).value;
  const medio = ($('cf-cand-medio') || { value: '' }).value;
  const rrhh = ($('cf-cand-rrhh') || { value: '' }).value;
  const asistio = ($('cf-cand-asistio') || { value: '' }).value;
  const tel = ($('cf-cand-tel') || { value: '' }).value.toLowerCase();
  const fecha = ($('cf-cand-fecha') || { value: '' }).value.toLowerCase();

  renderCandidatos(DB.candidatos.filter(c =>
    (!busq || c.nombre.toLowerCase().includes(busq) || c.dni.includes(busq)) &&
    (!zona || c.zona === zona) &&
    (!estado || c.estado === estado) &&
    (!medio || c.medio === medio) &&
    (!rrhh || c.rrhh === rrhh) &&
    (!asistio || c.asistio === asistio) &&
    (!tel || (c.tel || '').includes(tel)) &&
    (!fecha || (c.fecha || '').includes(fecha))
  ));
}

export function poblarFiltrosColumnasCandidatos() {
  const fillCol = (id, items) => {
    const el = $(id);
    if (!el) return;
    const ph = el.options[0]?.outerHTML || '<option value=""></option>';
    el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join('');
  };
  const nicksRRHH = [
    ...DB.usuarios.filter(u => ['RRHH', 'Administrador total'].includes(u.perfil)).map(u => u.nickname || u.nombre.split(' ')[0]),
    ...DB.rrhh.filter(n => !DB.usuarios.find(u => (u.nickname || u.nombre.split(' ')[0]) === n)),
    'Agente IA Ohlimpia',
  ];
  fillCol('cf-cand-zona', DB.zonas);
  fillCol('cf-cand-estado', DB.candidatos.map(c => c.estado));
  fillCol('cf-cand-medio', DB.medios);
  fillCol('cf-cand-rrhh', nicksRRHH);
}

// ========== ZONA / ESTADO ==========

export function onChangeZonaCand() {
  const zona = $('c-zona');
  const loc = $('c-localidad');
  if (!zona || !loc) return;
  if (zona.value === 'CABA') {
    loc.innerHTML = '<option value="">— CABA —</option>';
    loc.disabled = true; loc.style.opacity = '0.6';
  } else if (zona.value === 'Buenos Aires') {
    loc.disabled = false; loc.style.opacity = '1';
    loc.innerHTML = '<option value="">Seleccionar...</option>' + LOCALIDADES_BA.map(l => '<option>' + l + '</option>').join('');
  } else {
    loc.innerHTML = '<option value="">Seleccionar zona primero</option>';
    loc.disabled = true; loc.style.opacity = '0.6';
  }
}

export function onChangeEstadoCand() {
  const estado = ($('c-estado-i') || {}).value || '';
  const citaRow = $('cita-campos-row');
  if (citaRow) citaRow.style.display = estado === 'Citado' ? 'flex' : 'none';
  const fechaEl = $('c-fecha');
  if (fechaEl) fechaEl.required = (estado === 'Citado');
}

// ========== CRUD ==========

export function abrirNuevoCandidato() {
  ['c-nombre', 'c-dni', 'c-tel', 'c-obs', 'c-rrhh'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  const zEl = $('c-zona'); if (zEl) { zEl.value = ''; onChangeZonaCand(); }
  const mEl = $('c-medio'); if (mEl) mEl.value = '';
  const tit = $('modal-cand-titulo'); if (tit) tit.textContent = 'Nuevo candidato';
  const modal = $('modal-candidato'); if (modal) delete modal.dataset.editIdx;
  onChangeEstadoCand();
  abrirModal('modal-candidato');
}

export function guardarCandidato() {
  if (!validarCampos([{ id: 'c-nombre', label: 'Nombre' }, { id: 'c-tel', label: 'Teléfono' }, { id: 'c-zona', label: 'Zona' }], toast)) return;

  const nombre = toTitleCase($('c-nombre').value);
  const dni = cleanText($('c-dni').value);
  const tel = cleanText($('c-tel').value);
  const zona = cleanText($('c-zona').value);
  const locEl = $('c-localidad');
  const localidad = zona === 'CABA' ? 'CABA' : (locEl ? cleanText(locEl.value) : '');
  const medio = cleanText(($('c-medio') || {}).value || '');
  const rrhh = cleanText(($('c-rrhh') || {}).value || '');
  const obs = cleanText(($('c-obs') || {}).value || '');
  const estado = cleanText(($('c-estado-i') || {}).value || '');
  const fecha = cleanText(($('c-fecha') || {}).value || '');
  const hora = cleanText(($('c-hora') || {}).value || '');

  if (estado === 'Citado') {
    if (!fecha) { toast('⚠️ Ingresá la fecha de la cita'); $('c-fecha').focus(); return; }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (new Date(fecha) < hoy) { toast('⚠️ La fecha de la cita no puede ser anterior a hoy'); $('c-fecha').focus(); return; }
    if (!hora) { toast('⚠️ Ingresá la hora de la cita'); $('c-hora').focus(); return; }
    if (!rrhh) { toast('⚠️ Ingresá quién citó al candidato'); $('c-rrhh').focus(); return; }
  }

  const modal = $('modal-candidato');
  const editId = modal && modal.dataset && modal.dataset.editId;

  if (editId) {
    const c = getCandById(editId);
    if (!c) { toast('⚠️ Candidato no encontrado'); return; }
    Object.assign(c, {
      nombre, dni, tel, zona, localidad, medio, rrhh, obs,
      estado: estado || c.estado,
      fecha: fecha ? new Date(fecha).toLocaleDateString('es-AR') : c.fecha,
      hora: hora || c.hora,
    });
    supaSync('candidatos', c);
    delete modal.dataset.editId;
    toast('✓ Candidato actualizado');
  } else {
    const nuevo = {
      id: Date.now(), nombre, dni, tel, zona, localidad, medio, rrhh, obs,
      estado: estado || 'Sin citar',
      asistio: '—', fecha: '', hora: '',
    };
    DB.candidatos.push(nuevo);
    supaSync('candidatos', nuevo);
    toast('✓ Candidato guardado');
  }
  cerrarModal('modal-candidato');
  renderCandidatos();
}

function editarCandidato(id) {
  const c = getCandById(id); if (!c) return;
  const set = (elId, v) => { const el = $(elId); if (el) el.value = v || ''; };
  set('c-nombre', c.nombre);
  set('c-dni', c.dni);
  set('c-tel', c.tel);
  set('c-rrhh', c.rrhh);
  set('c-obs', c.obs);
  set('c-medio', c.medio);
  set('c-estado-i', c.estado);
  onChangeEstadoCand();
  if (c.fecha && c.fecha.includes('/')) {
    const parts = c.fecha.split('/');
    if (parts.length === 3) set('c-fecha', parts[2] + '-' + parts[1] + '-' + parts[0]);
  } else {
    set('c-fecha', c.fecha);
  }
  set('c-hora', c.hora);
  const zEl = $('c-zona');
  if (zEl) { zEl.value = c.zona || ''; onChangeZonaCand(); }
  const lEl = $('c-localidad');
  if (lEl && c.localidad) lEl.value = c.localidad;
  const tit = $('modal-cand-titulo');
  if (tit) tit.textContent = 'Editar candidato — ' + c.nombre;
  const modal = $('modal-candidato');
  if (modal) modal.dataset.editId = c.id;
  abrirModal('modal-candidato');
}

export function editarCandidatoPorId(id) {
  editarCandidato(id);
}

// ========== CITAS ==========

export function abrirCitarPorId(id) {
  const c = getCandById(id);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  $('citar-idx').value = id;
  $('citar-nombre').textContent = c.nombre;
  $('citar-fecha').value = '';
  $('citar-hora').value = '';
  $('citar-fecha').min = hoyStr();
  abrirModal('modal-citar-cand');
}

export function guardarCita() {
  const c = getCandById($('citar-idx').value);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  const fecha = $('citar-fecha').value;
  const hora = $('citar-hora').value;
  if (!fecha) { toast('⚠️ Ingresá la fecha'); return; }
  if (!hora) { toast('⚠️ Ingresá la hora'); return; }
  c.fecha = new Date(fecha).toLocaleDateString('es-AR');
  c.hora = hora;
  c.estado = 'Citado';
  supaSync('candidatos', c);
  cerrarModal('modal-citar-cand');
  renderCandidatos();
  toast('📅 Cita registrada para ' + c.nombre);
}

// ========== RESULTADO ENTREVISTA ==========

export function abrirResultadoPorId(id) {
  const c = getCandById(id);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  $('resultado-idx').value = id;
  $('resultado-nombre').textContent = c.nombre + ' — Cita: ' + (c.fecha || '—') + ' ' + (c.hora || '');
  document.querySelectorAll('input[name="asistio-radio"]').forEach(r => { r.checked = false; });
  $('resultado-entrevista-row').style.display = 'none';
  $('resultado-valor').value = '';
  $('resultado-obs').value = '';
  document.querySelectorAll('input[name="asistio-radio"]').forEach(r => {
    r.onchange = function () {
      $('resultado-entrevista-row').style.display = this.value === 'Sí' ? 'block' : 'none';
    };
  });
  abrirModal('modal-resultado-cand');
}

export function guardarResultadoEntrevista() {
  const c = getCandById($('resultado-idx').value);
  if (!c) { toast('⚠️ Error: candidato no encontrado'); return; }
  const asistio = document.querySelector('input[name="asistio-radio"]:checked');
  if (!asistio) { toast('⚠️ Indicá si asistió o no'); return; }
  c.asistio = asistio.value;
  if (asistio.value === 'Sí') {
    const res = $('resultado-valor').value;
    if (!res) { toast('⚠️ Seleccioná el resultado de la entrevista'); return; }
    if (res === 'Rechazado') {
      c.estado = 'Rechazado';
      c.motivoRechazo = cleanText($('resultado-obs').value);
    } else {
      c.estado = 'Entrevistado';
      c.obsEntrevista = cleanText($('resultado-obs').value);
    }
  } else {
    c.estado = 'Sin citar';
    c.fecha = '';
    c.hora = '';
    toast('ℹ️ No asistió — vuelve a Sin citar');
  }
  supaSync('candidatos', c);
  cerrarModal('modal-resultado-cand');
  renderCandidatos();
  toast('✓ Resultado registrado');
}

// ========== ACCIONES DE ESTADO ==========

export function aprobarCandidatoPorId(id) {
  const c = getCandById(id); if (!c) return;
  c.estado = 'Aprobado';
  supaSync('candidatos', c);
  renderCandidatos();
  toast('✅ ' + c.nombre + ' aprobado');
}

export function rechazarCandidatoPorId(id) {
  const motivo = prompt('Motivo del rechazo:'); if (motivo === null) return;
  if (!motivo.trim()) { toast('⚠️ Ingresá el motivo'); return; }
  const c = getCandById(id); if (!c) return;
  c.estado = 'Rechazado';
  c.motivoRechazo = motivo.trim();
  supaSync('candidatos', c);
  renderCandidatos();
  toast('❌ Candidato rechazado');
}

export function pasarAPsicoPorId(id) {
  const c = getCandById(id); if (!c) return;
  if ((DB.psicos || []).find(p => p.candidatoId === c.id)) { toast('⚠️ Ya está en Psicotécnico'); return; }
  const p = {
    id: Date.now(), candidatoId: c.id, nombre: c.nombre, dni: c.dni, zona: c.zona, tel: c.tel, rrhh: c.rrhh,
    psicotecnico: 'Pendiente', prelaboral: 'Pendiente', antecedentes: 'No requerido', libretaSanitaria: 'No requerido',
    requiereAntecedentes: false, requiereLibreta: false, estado: 'En proceso',
    fecha: new Date().toLocaleDateString('es-AR'), obs: '',
  };
  if (!DB.psicos) DB.psicos = [];
  DB.psicos.push(p);
  c.estado = 'Psicotécnico';
  supaSync('candidatos', c);
  supaSync('psicos', p);
  renderCandidatos();
  toast('🧠 ' + c.nombre + ' enviado a Psicotécnico');
}

export function registrarAsistencia(id, valor) {
  const c = getCandById(id); if (!c) return;
  c.asistio = valor;
  if (valor === 'Sí') {
    c.estado = 'Entrevistado';
  } else if (valor === 'No') {
    c.estado = 'Sin citar';
    c.fecha = '';
    c.hora = '';
  }
  supaSync('candidatos', c);
  renderCandidatos();
  if (valor === 'Sí') toast('✅ Asistió — ahora podés Aprobar o Rechazar');
  else if (valor === 'No') toast('❌ No asistió — vuelve a Sin citar');
}

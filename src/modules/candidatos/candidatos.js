import { DB, LOCALIDADES_BA, currentUser } from '@shared/state.js';
import { $, toTitleCase, cleanText, validarCampos, hoyStr, badge } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// ========== ESTADO INTERNO ==========

let _candTab = 'activos';

// ========== HELPERS ==========

const ESTADO_DISPLAY = {
  'Psicotecnico': 'Psicotécnico',
};

function formatearFechaISO(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

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

  const buscar = (
    (($('cand-buscar') || {}).value)
    || (($('buscador-global') || {}).value)
    || ''
  ).toLowerCase();
  const fZona = (($('cand-filtro-zona') || {}).value || '');
  const fEstado = (($('cand-filtro-estado') || {}).value || '');

  const estadosHist = ['Rechazado', 'Psicotecnico'];
  const activos = todos.filter(c => !estadosHist.includes(c.estado));
  const hist = todos.filter(c => estadosHist.includes(c.estado));
  let lista2 = _candTab === 'historico' ? hist : activos;

  if (buscar) lista2 = lista2.filter(c => {
    const nombreCompleto = ((c.apellido || '') + ' ' + (c.nombre || '')).toLowerCase();
    return nombreCompleto.includes(buscar) || (c.dni || '').includes(buscar);
  });
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
  const ec = { 'Sin citar': '#64748b', 'Citado': '#2563eb', 'Entrevistado': '#d97706', 'Aprobado': '#16a34a', 'Rechazado': '#dc2626', 'Psicotecnico': '#7c3aed' }[c.estado] || '#64748b';
  const cid = c.id;
  const nombreCompleto = (c.apellido || '') + (c.apellido && c.nombre ? ', ' : '') + (c.nombre || '');
  const fechaDisplay = formatearFechaISO(c.fechaCita);
  const estadoDisplay = ESTADO_DISPLAY[c.estado] || c.estado;
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
    + '<td style="padding:8px 12px;font-size:13px;"><strong>' + nombreCompleto + '</strong></td>'
    + '<td style="padding:8px;font-size:12px;color:#64748b;">' + (c.dni || '—') + '</td>'
    + '<td style="padding:8px;font-size:12px;">' + (c.tel || '—') + '</td>'
    + '<td style="padding:8px;font-size:12px;">' + (c.zona || '—') + '</td>'
    + '<td style="padding:8px;font-size:12px;">' + (c.medio || '—') + '</td>'
    + '<td style="padding:8px;text-align:center;font-size:12px;">' + (fechaDisplay ? '<strong>' + fechaDisplay + '</strong>' : '<span style="color:#cbd5e1;">—</span>') + '</td>'
    + '<td style="padding:8px;text-align:center;font-size:12px;">' + (c.horaCita || '—') + '</td>'
    + '<td style="padding:6px;text-align:center;">' + (c.estado === 'Citado'
      ? '<select data-action="asistencia" data-id="' + cid + '" style="font-size:12px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;">'
        + '<option value=""' + (!c.asistio ? ' selected' : '') + '>— Sin registrar</option>'
        + '<option value="si"' + (c.asistio === 'si' ? ' selected' : '') + '>✅ Sí asistió</option>'
        + '<option value="no"' + (c.asistio === 'no' ? ' selected' : '') + '>❌ No asistió</option>'
        + '</select>'
      : (c.asistio === 'si' ? '✅' : c.asistio === 'no' ? '❌' : '—')) + '</td>'
    + '<td style="padding:8px;text-align:center;"><span style="font-size:11px;font-weight:600;color:' + ec + '">' + estadoDisplay + '</span></td>'
    + '<td style="padding:8px;font-size:12px;color:#dc2626;">' + (c.motivoRechazo || '—') + '</td>'
    + '<td style="padding:8px;text-align:center;">' + btns + '</td>'
    + '</tr>';
}

// ========== FILTROS ==========

export function filtrarCandidatos() {
  renderCandidatos();
}

export function poblarFiltrosColumnasCandidatos() {
  const el = $('cand-filtro-zona');
  if (!el) return;
  const ph = el.options[0]?.outerHTML || '<option value="">Todas las zonas</option>';
  el.innerHTML = ph + [...new Set(DB.zonas)].filter(Boolean).map(z => `<option>${z}</option>`).join('');
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

function poblarSelectRRHHCandidato() {
  const sel = $('c-rrhh');
  if (!sel) return;
  const lista = (DB.personalRrhh || []).filter(p => !p.anulado);
  const opts = ['<option value="">Seleccionar...</option>']
    .concat(lista.map(p => `<option value="${p.id}">${(p.apellido ? p.apellido + ', ' : '') + p.nombre}</option>`));
  sel.innerHTML = opts.join('');
}

export function abrirNuevoCandidato() {
  ['c-apellido', 'c-nombre', 'c-dni', 'c-cuit', 'c-fecnac', 'c-tel', 'c-email', 'c-calle', 'c-piso',
   'c-obs', 'c-nombre-referido', 'c-fecha', 'c-hora'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  ['c-zona', 'c-medio', 'c-estado-civil', 'c-genero', 'c-estado-i', 'c-rrhh'].forEach(id => {
    const el = $(id); if (el) el.selectedIndex = 0;
  });
  poblarSelectRRHHCandidato();
  onChangeZonaCand();
  const tit = $('modal-cand-titulo'); if (tit) tit.textContent = 'Nuevo candidato';
  const modal = $('modal-candidato'); if (modal) delete modal.dataset.editId;
  onChangeEstadoCand();
  abrirModal('modal-candidato');
}

export function guardarCandidato() {
  if (!validarCampos([
    { id: 'c-apellido', label: 'Apellido' },
    { id: 'c-nombre', label: 'Nombre' },
    { id: 'c-dni', label: 'DNI' },
    { id: 'c-tel', label: 'Teléfono' },
    { id: 'c-calle', label: 'Calle y número' },
    { id: 'c-zona', label: 'Provincia' },
  ], toast)) return;

  const apellido = toTitleCase(($('c-apellido') || {}).value || '');
  const nombre = toTitleCase($('c-nombre').value);
  const dni = cleanText($('c-dni').value);
  const cuit = cleanText(($('c-cuit') || {}).value || '');
  const fecNac = ($('c-fecnac') || {}).value || null;
  const estadoCivil = ($('c-estado-civil') || {}).value || '';
  const genero = ($('c-genero') || {}).value || null;
  const tel = cleanText($('c-tel').value);
  const email = cleanText(($('c-email') || {}).value || '');
  const calle = cleanText(($('c-calle') || {}).value || '');
  const piso = cleanText(($('c-piso') || {}).value || '');
  const zona = cleanText($('c-zona').value);
  const locEl = $('c-localidad');
  const localidad = zona === 'CABA' ? 'CABA' : (locEl ? cleanText(locEl.value) : '');
  const medio = cleanText(($('c-medio') || {}).value || '');
  const nombreReferido = cleanText(($('c-nombre-referido') || {}).value || '');
  const rrhhIdRaw = ($('c-rrhh') || {}).value || '';
  const rrhhIdNum = parseInt(rrhhIdRaw, 10);
  const rrhhId = Number.isNaN(rrhhIdNum) ? null : rrhhIdNum;
  const obs = cleanText(($('c-obs') || {}).value || '');
  const estado = cleanText(($('c-estado-i') || {}).value || '');
  const fechaCita = ($('c-fecha') || {}).value || null;
  const horaCita = ($('c-hora') || {}).value || null;

  if (estado === 'Citado') {
    if (!fechaCita) { toast('⚠️ Ingresá la fecha de la cita'); $('c-fecha').focus(); return; }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (new Date(fechaCita) < hoy) { toast('⚠️ La fecha de la cita no puede ser anterior a hoy'); $('c-fecha').focus(); return; }
    if (!horaCita) { toast('⚠️ Ingresá la hora de la cita'); $('c-hora').focus(); return; }
    if (!rrhhId) { toast('⚠️ Seleccioná quién citó al candidato'); $('c-rrhh').focus(); return; }
  }

  const modal = $('modal-candidato');
  const editId = modal && modal.dataset && modal.dataset.editId;

  if (editId) {
    const c = getCandById(editId);
    if (!c) { toast('⚠️ Candidato no encontrado'); return; }
    Object.assign(c, {
      apellido, nombre, dni, cuit, fecNac, estadoCivil, genero,
      tel, email, calle, piso, zona, localidad,
      medio, nombreReferido, rrhhId, obs,
      estado: estado || c.estado,
      fechaCita: fechaCita || c.fechaCita || null,
      horaCita: horaCita || c.horaCita || null,
    });
    supaSync('candidatos', c);
    delete modal.dataset.editId;
    toast('✓ Candidato actualizado');
  } else {
    const creadoPor = currentUser ? (currentUser.nickname || currentUser.nombre) : null;
    const nuevo = {
      id: Date.now(),
      apellido, nombre, dni, cuit, fecNac, estadoCivil, genero,
      tel, email, calle, piso, zona, localidad,
      medio, nombreReferido, rrhhId, obs,
      estado: estado || 'Sin citar',
      asistio: null,
      fechaCita: fechaCita || null,
      horaCita: horaCita || null,
      creadoPor,
    };
    DB.candidatos.push(nuevo);
    supaSync('candidatos', nuevo);

    // Crear turno si tiene fecha y hora
    if (fechaCita && horaCita) {
      const responsable = (DB.personalRrhh || []).find(p => p.id === rrhhId);
      const turno = {
        id: Date.now() + 1,
        candidatoId: nuevo.id,
        nombre: apellido + ' ' + nombre,
        fecha: fechaCita,
        hora: horaCita,
        estado: 'Confirmado',
        responsable: responsable ? responsable.nombre : '',
      };
      if (!DB.turnos) DB.turnos = [];
      DB.turnos.push(turno);
      supaSync('turnos', turno);
    }
    toast('✓ Candidato guardado');
  }
  cerrarModal('modal-candidato');
  renderCandidatos();
}

function editarCandidato(id) {
  const c = getCandById(id); if (!c) return;
  poblarSelectRRHHCandidato();
  const set = (elId, v) => { const el = $(elId); if (el) el.value = v != null ? v : ''; };
  set('c-apellido', c.apellido);
  set('c-nombre', c.nombre);
  set('c-dni', c.dni);
  set('c-cuit', c.cuit);
  set('c-fecnac', c.fecNac);
  set('c-tel', c.tel);
  set('c-email', c.email);
  set('c-calle', c.calle);
  set('c-piso', c.piso);
  set('c-rrhh', c.rrhhId != null ? String(c.rrhhId) : '');
  set('c-obs', c.obs);
  set('c-medio', c.medio);
  set('c-nombre-referido', c.nombreReferido);
  const ecEl = $('c-estado-civil');
  if (ecEl) ecEl.value = c.estadoCivil || '';
  const genEl = $('c-genero');
  if (genEl) genEl.value = c.genero || '';
  set('c-estado-i', c.estado);
  onChangeEstadoCand();
  set('c-fecha', c.fechaCita);
  set('c-hora', c.horaCita);
  const zEl = $('c-zona');
  if (zEl) { zEl.value = c.zona || ''; onChangeZonaCand(); }
  const lEl = $('c-localidad');
  if (lEl && c.localidad) lEl.value = c.localidad;
  const tit = $('modal-cand-titulo');
  if (tit) tit.textContent = 'Editar candidato — ' + (c.apellido || '') + (c.apellido && c.nombre ? ', ' : '') + (c.nombre || '');
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
  $('citar-nombre').textContent = (c.apellido ? c.apellido + ', ' : '') + c.nombre;
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
  c.fechaCita = fecha;
  c.horaCita = hora;
  c.estado = 'Citado';
  supaSync('candidatos', c);

  // Crear turno en el calendario
  const turno = {
    id: Date.now(),
    candidatoId: c.id,
    nombre: (c.apellido ? c.apellido + ' ' : '') + c.nombre,
    fecha: fecha,
    hora: hora,
    estado: 'Confirmado',
    responsable: (DB.personalRrhh || []).find(p => p.id === c.rrhhId)?.nombre || '',
  };
  if (!DB.turnos) DB.turnos = [];
  DB.turnos.push(turno);
  supaSync('turnos', turno);

  cerrarModal('modal-citar-cand');
  renderCandidatos();
  toast('📅 Cita registrada para ' + ((c.apellido ? c.apellido + ', ' : '') + c.nombre));
}

// ========== RESULTADO ENTREVISTA ==========

export function abrirResultadoPorId(id) {
  const c = getCandById(id);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  $('resultado-idx').value = id;
  $('resultado-nombre').textContent = ((c.apellido ? c.apellido + ', ' : '') + c.nombre) + ' — Cita: ' + (formatearFechaISO(c.fechaCita) || '—') + ' ' + (c.horaCita || '');
  document.querySelectorAll('input[name="asistio-radio"]').forEach(r => { r.checked = false; });
  $('resultado-entrevista-row').style.display = 'none';
  $('resultado-valor').value = '';
  $('resultado-obs').value = '';
  document.querySelectorAll('input[name="asistio-radio"]').forEach(r => {
    r.onchange = function () {
      $('resultado-entrevista-row').style.display = this.value === 'si' ? 'block' : 'none';
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
  if (c.asistio === 'si') {
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
    c.fechaCita = null;
    c.horaCita = null;
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
    id: Date.now(), candidatoId: c.id, nombre: (c.apellido ? c.apellido + ' ' : '') + c.nombre, dni: c.dni, zona: c.zona, tel: c.tel, rrhh: (DB.personalRrhh || []).find(p => p.id === c.rrhhId)?.nombre || '',
    psicotecnico: 'Pendiente', prelaboral: 'Pendiente', antecedentes: 'No requerido', libretaSanitaria: 'No requerido',
    requiereAntecedentes: false, requiereLibreta: false, estado: 'En proceso',
    fecha: new Date().toLocaleDateString('es-AR'), obs: '',
  };
  if (!DB.psicos) DB.psicos = [];
  DB.psicos.push(p);
  c.estado = 'Psicotecnico';
  supaSync('candidatos', c);
  supaSync('psicos', p);
  renderCandidatos();
  toast('🧠 ' + c.nombre + ' enviado a Psicotécnico');
}

export function registrarAsistencia(id, valor) {
  const c = getCandById(id); if (!c) return;
  c.asistio = (valor === 'si' || valor === 'no') ? valor : null;
  if (valor === 'si') {
    c.estado = 'Entrevistado';
  } else if (valor === 'no') {
    c.estado = 'Sin citar';
    c.fechaCita = null;
    c.horaCita = null;
  }
  supaSync('candidatos', c);
  renderCandidatos();
  if (valor === 'si') toast('✅ Asistió — ahora podés Aprobar o Rechazar');
  else if (valor === 'no') toast('❌ No asistió — vuelve a Sin citar');
}

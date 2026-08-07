import { DB, LOCALIDADES_BA, BARRIOS_CABA, PARTIDOS_LOCALIDADES, LOCALIDAD_A_PARTIDO, currentUser } from '@shared/state.js';
import { $, toTitleCase, cleanText, validarCampos, badge, hoyStr } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError } from '@shared/supabase.js';

// ========== ESTADO INTERNO ==========

let _candTab = 'activos';

// ========== HELPERS ==========

const ESTADO_DISPLAY = {
  'Psicotecnico': 'Psicotécnico',
};

// Estados de salida alternativos a "Rechazado" (ticket Histórico). Agregados
// al enum estado_candidato (sql/v063) — RRHH los elige a mano desde "Dar de
// baja" (ver abrirBajaCandidatoPorId más abajo), no hay regla automática que
// los derive, así que el sistema no infiere nada: sólo ofrece las 4 opciones
// y guarda el detalle en motivoRechazo (mismo campo que ya se mostraba en la
// columna "Motivo" para Rechazado).
const ESTADOS_BAJA = ['Baja', 'Caducado', 'MT Social', 'MT con deuda'];

// Categorías del motivo — sólo aplican al estado "Baja" puntual (ticket
// "Histórico 2"): Caducado/MT Social/MT con deuda ya son categorías en sí
// mismas, no necesitan esta sub-clasificación. CHECK en sql/v064 en vez de
// enum nuevo — agregar una opción a futuro es un ALTER TABLE simple.
const TIPOS_MOTIVO_BAJA = ['Consiguió trabajo', 'Rechazó propuesta', 'No se presentó a instancia del proceso', 'Otro'];

// id_local se trunca a 9 dígitos al persistir (supaSync) y, al releer
// desde Supabase, _toCamel reemplaza candidato.id por ese id_local
// (src/shared/supabase.js). Cualquier referencia cruzada (turno →
// candidato) armada con el id "vivo" de Date.now() (13 dígitos, sin
// truncar) deja de matchear apenas se recarga la página — bug real
// confirmado contra datos de producción (turnos.candidato_id con tres
// formatos distintos según el alta: '', el id de 13 dígitos sin
// truncar, o el id serial de Supabase). Se normaliza acá para que la
// referencia sobreviva a un reload sin importar el origen.
function idLocalCand(id) {
  return String(id).slice(-9);
}

// Traduce el último error real de Supabase (guardado por supaSync) a un
// mensaje específico cuando se puede identificar la causa — "reintentá"
// no sirve de nada si el problema es un DNI duplicado (no se arregla
// reintentando) o la sesión sin permiso (hay que volver a loguearse).
// Si no se reconoce el error, cae al mensaje genérico de siempre. Esto
// salió de un caso real reportado por RRHH (04/08/2026): el toast
// genérico de "no se pudo guardar" ya avisa que algo falló (antes
// desaparecía en silencio), pero no decía por qué ni qué hacer.
function mensajeErrorGuardado(generico) {
  const err = getLastSupaSyncError();
  if (!err) return generico;
  const msg = (err.message || '').toLowerCase();
  if (err.code === '23505' || msg.includes('duplicate key')) {
    if (msg.includes('dni')) return '⚠️ Ya existe un candidato con ese DNI en el sistema (puede haberlo cargado otra persona) — revisá antes de reintentar, no se puede repetir el mismo DNI.';
    return '⚠️ Ya existe un registro con ese dato — revisá antes de reintentar (reintentar tal cual no lo va a resolver).';
  }
  if (err.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return '⚠️ Tu sesión no tiene permiso para guardar ahora — cerrá sesión, volvé a entrar, y si sigue avisá a sistemas.';
  }
  return generico;
}

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
    else if (action === 'dar-baja') abrirBajaCandidatoPorId(id);
    else if (action === 'ver-detalle') abrirDetalleCandidatoPorId(id);
    else if (action === 'desmarcar-asistencia') desmarcarAsistenciaPorId(id);
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

  const estadosHist = ['Rechazado', 'Psicotecnico', ...ESTADOS_BAJA];
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
  const ec = { 'Sin citar': '#64748b', 'Citado': '#2563eb', 'Entrevistado': '#d97706', 'Aprobado': '#16a34a', 'Rechazado': '#dc2626', 'Psicotecnico': '#7c3aed', 'Baja': '#64748b', 'Caducado': '#b45309', 'MT Social': '#0891b2', 'MT con deuda': '#be123c' }[c.estado] || '#64748b';
  const cid = c.id;
  const nombreCompleto = (c.apellido || '') + (c.apellido && c.nombre ? ', ' : '') + (c.nombre || '');
  const fechaDisplay = formatearFechaISO(c.fechaCita);
  const estadoDisplay = ESTADO_DISPLAY[c.estado] || c.estado;
  const btnStyle = 'font-size:11px;padding:3px 8px;border:none;border-radius:4px;cursor:pointer;margin-right:2px;';
  let btns = '<button data-action="ver-detalle" data-id="' + cid + '" style="' + btnStyle + 'background:#e0e7ff;color:#3730a3;">👁️ Ver</button>';

  if (_candTab === 'activos') {
    if (c.estado === 'Sin citar')
      btns += '<button data-action="citar" data-id="' + cid + '" style="' + btnStyle + 'background:#2563eb;color:white;">📅 Citar</button>';
    else if (c.estado === 'Citado')
      btns += '<button data-action="resultado" data-id="' + cid + '" style="' + btnStyle + 'background:#d97706;color:white;">📋 Resultado</button>';
    else if (c.estado === 'Entrevistado') {
      btns += '<button data-action="aprobar" data-id="' + cid + '" style="' + btnStyle + 'background:#16a34a;color:white;">✅ Aprobar</button>';
      btns += '<button data-action="rechazar" data-id="' + cid + '" style="' + btnStyle + 'background:#dc2626;color:white;">❌ Rechazar</button>';
      // Sólo aparece en este estado (justo después de marcar "Sí asistió",
      // antes de Aprobar/Rechazar) — corrige un click errado sin tener que
      // deshacer pasos posteriores del proceso.
      btns += '<button data-action="desmarcar-asistencia" data-id="' + cid + '" style="' + btnStyle + 'background:#fef3c7;color:#92400e;" title="La asistencia se marcó por error">↩️ Desmarcar asistencia</button>';
    } else if (c.estado === 'Aprobado')
      btns += '<button data-action="psico" data-id="' + cid + '" style="' + btnStyle + 'background:#7c3aed;color:white;">🧠 Psico</button>';
    btns += '<button data-action="editar" data-id="' + cid + '" style="' + btnStyle + 'background:#e2e8f0;color:#374151;">✏️</button>';
    // Salida del proceso por un motivo distinto al rechazo en entrevista
    // (Baja, Caducado, MT Social, MT con deuda) — disponible en cualquier
    // estado activo, no sólo en Entrevistado como Rechazar.
    btns += '<button data-action="dar-baja" data-id="' + cid + '" style="' + btnStyle + 'background:#f1f5f9;color:#475569;" title="Baja / Caducado / MT Social / MT con deuda">📁 Baja</button>';
  }

  // Columna "Motivo": para Baja se muestra el tipo + fecha (ticket "Histórico
  // 2") en vez del texto libre crudo — el detalle aclaratorio (motivoRechazo)
  // queda como tooltip al pasar el mouse, así no satura la tabla ni rompe el
  // layout con textos largos. Para los demás estados sigue igual que antes.
  let motivoColor = '#dc2626';
  let motivoCell = c.motivoRechazo || '—';
  if (c.estado === 'Baja' && c.tipoMotivoBaja) {
    motivoColor = '#475569';
    const fechaBajaDisplay = formatearFechaISO(c.fechaBaja);
    const tooltip = c.motivoRechazo ? c.motivoRechazo.replace(/"/g, '&quot;') : '';
    motivoCell = '<span title="' + tooltip + '">🏷️ ' + c.tipoMotivoBaja + (fechaBajaDisplay ? ' · ' + fechaBajaDisplay : '') + '</span>';
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
    + '<td style="padding:8px;font-size:12px;color:' + motivoColor + ';">' + motivoCell + '</td>'
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

// Zonas de residencia del conurbano (Norte/Sur/Oeste) — comparten el mismo
// listado de partidos de LOCALIDADES_BA. No se particiona ese listado por
// zona (no nos pidieron esa granularidad y hacerlo a ojo arriesga clasificar
// mal un partido limítrofe) — el usuario elige zona operativa y partido
// por separado, cada uno con su propio criterio.
const ZONAS_CONURBANO = ['Zona Norte', 'Zona Sur', 'Zona Oeste'];

// Todas las localidades del conurbano juntas (los 41 partidos), orden
// alfabético — permite elegir la Localidad directamente sin tener que
// saber antes a qué Partido pertenece; onChangeLocalidadCand() completa
// el Partido solo a partir de eso (LOCALIDAD_A_PARTIDO). El camino
// inverso (elegir Partido primero) sigue andando igual — angosta las
// opciones de Localidad a solo las de ese partido.
const TODAS_LAS_LOCALIDADES = Object.keys(LOCALIDAD_A_PARTIDO).sort((a, b) => a.localeCompare(b, 'es'));

// CABA no tiene partidos (Localidad = barrio directamente); Norte/Sur/Oeste
// sí — ahí se puede elegir Partido primero (angosta Localidad a las de ese
// partido) o Localidad directamente (completa el Partido solo).
export function onChangeZonaCand() {
  const zona = $('c-zona');
  const part = $('c-partido');
  const loc = $('c-localidad');
  if (!zona || !part || !loc) return;
  if (zona.value === 'CABA') {
    part.innerHTML = '<option value="">No aplica (CABA)</option>';
    part.disabled = true; part.style.opacity = '0.6';
    loc.disabled = false; loc.style.opacity = '1';
    loc.innerHTML = '<option value="">Seleccionar barrio...</option>' + BARRIOS_CABA.map(b => '<option>' + b + '</option>').join('');
  } else if (ZONAS_CONURBANO.includes(zona.value)) {
    part.disabled = false; part.style.opacity = '1';
    part.innerHTML = '<option value="">Seleccionar...</option>' + LOCALIDADES_BA.map(l => '<option>' + l + '</option>').join('');
    loc.disabled = false; loc.style.opacity = '1';
    loc.innerHTML = '<option value="">Seleccionar...</option>' + TODAS_LAS_LOCALIDADES.map(l => '<option>' + l + '</option>').join('');
  } else {
    part.innerHTML = '<option value="">Seleccionar zona primero</option>';
    part.disabled = true; part.style.opacity = '0.6';
    loc.innerHTML = '<option value="">Seleccionar zona primero</option>';
    loc.disabled = true; loc.style.opacity = '0.6';
  }
}

// Elegiste la Localidad directamente (sin pasar por Partido primero) —
// autocompleta el Partido a partir de LOCALIDAD_A_PARTIDO. Se asigna por
// .value, no dispara el onchange de Partido, así que no re-angosta ni
// resetea la Localidad recién elegida.
export function onChangeLocalidadCand() {
  const loc = $('c-localidad');
  const part = $('c-partido');
  if (!loc || !part || part.disabled) return; // CABA: no hay partido que completar
  const partido = LOCALIDAD_A_PARTIDO[loc.value];
  if (partido) part.value = partido;
}

export function onChangePartidoCand() {
  const part = $('c-partido');
  const loc = $('c-localidad');
  if (!part || !loc) return;
  const localidades = PARTIDOS_LOCALIDADES[part.value];
  // Sin partido elegido (volvió a "Seleccionar..."): vuelve a mostrar
  // todas las localidades del conurbano, no las deshabilita — se puede
  // elegir la Localidad directamente sin pasar por Partido.
  loc.disabled = false; loc.style.opacity = '1';
  loc.innerHTML = '<option value="">Seleccionar...</option>' + (localidades || TODAS_LAS_LOCALIDADES).map(l => '<option>' + l + '</option>').join('');
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
  ['c-zona', 'c-medio', 'c-estado-civil', 'c-genero', 'c-nacionalidad', 'c-estado-i', 'c-rrhh', 'c-dispo-horaria'].forEach(id => {
    const el = $(id); if (el) el.selectedIndex = 0;
  });
  poblarSelectRRHHCandidato();
  onChangeZonaCand();
  const tit = $('modal-cand-titulo'); if (tit) tit.textContent = 'Nuevo candidato';
  const modal = $('modal-candidato'); if (modal) delete modal.dataset.editId;
  onChangeEstadoCand();
  abrirModal('modal-candidato');
}

// Si se corrige el DNI de un candidato después de que ya avanzó a
// psicotécnico/preocupacional/documentación/alta pendiente, esos
// registros son snapshots (no referencias vivas) y quedan con el DNI
// viejo — el matching por DNI usado en toda esa cadena (ver CLAUDE.md
// "Conciliación entre etapas por candidatoId truncado", y el fix de
// precarga de Altas de esta sesión) deja de encontrar al candidato
// real. Se actualiza el DNI en cascada en las 4 colecciones que lo
// copian del candidato original.
function propagarCambioDniCandidato(dniAnterior, dniNuevo) {
  const colecciones = ['psicos', 'preocupacionales', 'documentacionIngreso', 'catAltPendientes'];
  for (const key of colecciones) {
    for (const x of (DB[key] || [])) {
      if (x.dni === dniAnterior) {
        x.dni = dniNuevo;
        supaSync(key, x);
      }
    }
  }
}

export async function guardarCandidato() {
  if (!validarCampos([
    { id: 'c-apellido', label: 'Apellido' },
    { id: 'c-nombre', label: 'Nombre' },
    { id: 'c-dni', label: 'DNI' },
    { id: 'c-tel', label: 'Teléfono' },
    { id: 'c-calle', label: 'Calle y número' },
    { id: 'c-zona', label: 'Zona de residencia' },
  ], toast)) return;

  const apellido = toTitleCase(($('c-apellido') || {}).value || '');
  const nombre = toTitleCase($('c-nombre').value);
  const dni = cleanText($('c-dni').value);
  const cuit = cleanText(($('c-cuit') || {}).value || '');
  const fecNac = ($('c-fecnac') || {}).value || null;
  const estadoCivil = ($('c-estado-civil') || {}).value || '';
  const genero = ($('c-genero') || {}).value || null;
  const nacionalidad = ($('c-nacionalidad') || {}).value || null;
  const tel = cleanText($('c-tel').value);
  const email = cleanText(($('c-email') || {}).value || '');
  const calle = cleanText(($('c-calle') || {}).value || '');
  const piso = cleanText(($('c-piso') || {}).value || '');
  const zona = cleanText($('c-zona').value);
  const partEl = $('c-partido');
  const partido = (partEl && !partEl.disabled) ? cleanText(partEl.value) : '';
  const locEl = $('c-localidad');
  const localidad = locEl ? cleanText(locEl.value) : '';
  const medio = cleanText(($('c-medio') || {}).value || '');
  const disponibilidadHoraria = cleanText(($('c-dispo-horaria') || {}).value || '');
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
    // Sin validación de "no anterior a hoy" (ticket "Fecha de citación") —
    // a propósito se usa también para cargar candidatos que ya fueron
    // citados/entrevistados con fecha pasada (carga de datos históricos),
    // no solo para agendar una cita nueva a futuro.
    if (!horaCita) { toast('⚠️ Ingresá la hora de la cita'); $('c-hora').focus(); return; }
    if (!rrhhId) { toast('⚠️ Seleccioná quién citó al candidato'); $('c-rrhh').focus(); return; }
  }

  const modal = $('modal-candidato');
  const editId = modal && modal.dataset && modal.dataset.editId;

  // Validación de formato DNI (6-8 dígitos solo números)
  if (!/^\d{6,8}$/.test(dni)) {
    toast('⚠️ El DNI debe tener entre 6 y 8 dígitos numéricos');
    $('c-dni').focus();
    return;
  }
  // Validación de unicidad de DNI (excluye al candidato en edición)
  const dniDuplicado = (DB.candidatos || []).some(c =>
    c.dni === dni && String(c.id) !== String(editId || '')
  );
  if (dniDuplicado) {
    toast('⚠️ Ya existe un candidato con ese DNI');
    $('c-dni').focus();
    return;
  }

  if (editId) {
    const c = getCandById(editId);
    if (!c) { toast('⚠️ Candidato no encontrado'); return; }
    const dniAnterior = c.dni;
    const snapshot = { ...c };
    Object.assign(c, {
      apellido, nombre, dni, cuit, fecNac, estadoCivil, genero, nacionalidad,
      tel, email, calle, piso, zona, partido, localidad, disponibilidadHoraria,
      medio, nombreReferido, rrhhId, obs,
      estado: estado || c.estado,
      fechaCita: fechaCita || c.fechaCita || null,
      horaCita: horaCita || c.horaCita || null,
    });
    const ok = await supaSync('candidatos', c);
    if (!ok) {
      // No se pudo guardar en Supabase — revertir el cambio local para
      // que la pantalla no muestre un dato que en realidad no persistió
      // (antes se aplicaba igual y "desaparecía" recién al recargar).
      Object.assign(c, snapshot);
      toast(mensajeErrorGuardado('⚠️ No se pudo guardar el candidato en el servidor — reintentá o avisá a sistemas'));
      return;
    }
    if (dniAnterior && dni !== dniAnterior) propagarCambioDniCandidato(dniAnterior, dni);
    delete modal.dataset.editId;
    toast('✓ Candidato actualizado');
  } else {
    const creadoPor = currentUser ? (currentUser.nickname || currentUser.nombre) : null;
    const nuevo = {
      id: Date.now(),
      apellido, nombre, dni, cuit, fecNac, estadoCivil, genero, nacionalidad,
      tel, email, calle, piso, zona, partido, localidad, disponibilidadHoraria,
      medio, nombreReferido, rrhhId, obs,
      estado: estado || 'Sin citar',
      asistio: null,
      fechaCita: fechaCita || null,
      horaCita: horaCita || null,
      creadoPor,
    };
    const okCand = await supaSync('candidatos', nuevo);
    if (!okCand) {
      toast(mensajeErrorGuardado('⚠️ No se pudo guardar el candidato en el servidor — reintentá o avisá a sistemas'));
      return;
    }
    DB.candidatos.push(nuevo);

    // Crear turno si tiene fecha y hora
    if (fechaCita && horaCita) {
      const responsable = (DB.personalRrhh || []).find(p => p.id === rrhhId);
      const turno = {
        id: Date.now() + 1,
        candidatoId: idLocalCand(nuevo.id),
        nombre: apellido + ' ' + nombre,
        fecha: fechaCita,
        hora: horaCita,
        estado: 'Confirmado',
        responsable: responsable ? responsable.nombre : '',
      };
      if (!DB.turnos) DB.turnos = [];
      DB.turnos.push(turno);
      const okTurno = await supaSync('turnos', turno);
      if (!okTurno) toast(mensajeErrorGuardado('⚠️ El candidato se guardó, pero no se pudo registrar el turno — cargalo desde "Citar"'));
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
  set('c-dispo-horaria', c.disponibilidadHoraria);
  set('c-nombre-referido', c.nombreReferido);
  const ecEl = $('c-estado-civil');
  if (ecEl) ecEl.value = c.estadoCivil || '';
  const genEl = $('c-genero');
  if (genEl) genEl.value = c.genero || '';
  const nacEl = $('c-nacionalidad');
  if (nacEl) nacEl.value = c.nacionalidad || '';
  set('c-estado-i', c.estado);
  onChangeEstadoCand();
  set('c-fecha', c.fechaCita);
  set('c-hora', c.horaCita);
  const zEl = $('c-zona');
  if (zEl) { zEl.value = c.zona || ''; onChangeZonaCand(); }
  const partEl = $('c-partido');
  const lEl = $('c-localidad');
  if (partEl && !partEl.disabled) {
    if (c.partido) {
      // Candidato ya cargado con el dato nuevo: precarga Partido y, a
      // partir de ahí, la Localidad real dentro de ese partido.
      partEl.value = c.partido;
      onChangePartidoCand();
      if (lEl && c.localidad) lEl.value = c.localidad;
    } else if (PARTIDOS_LOCALIDADES[c.localidad]) {
      // Compatibilidad con candidatos cargados antes de este cambio: el
      // select viejo guardaba el nombre del PARTIDO en c.localidad (bajo
      // el label "Localidad"). Si el valor guardado matchea un partido
      // conocido, precargamos el Partido desde ahí — la Localidad real
      // queda en blanco porque no hay forma de inferirla, hay que
      // cargarla de nuevo.
      partEl.value = c.localidad;
      onChangePartidoCand();
    }
  } else if (lEl && c.localidad) {
    // CABA: Localidad = barrio directo, sin partido de por medio.
    lEl.value = c.localidad;
  }
  const tit = $('modal-cand-titulo');
  if (tit) tit.textContent = 'Editar candidato — ' + (c.apellido || '') + (c.apellido && c.nombre ? ', ' : '') + (c.nombre || '');
  const modal = $('modal-candidato');
  if (modal) modal.dataset.editId = c.id;
  abrirModal('modal-candidato');
}

export function editarCandidatoPorId(id) {
  editarCandidato(id);
}

// ========== VER DETALLE (solo lectura) ==========
// Muestra todos los datos cargados (CUIT, fecha nac., género, email,
// domicilio, etc.) sin tener que abrir "Editar" — esos campos ya se
// guardan bien (vienen del formulario público o de carga manual), pero
// antes no se veían en ningún lado de la pantalla de Candidatos.

function crearHTMLModalVerCandidato() {
  return [
    '<div class="modal" style="max-width:640px;">',
      '<div class="modal-header"><h3 id="ver-cand-titulo">Candidato</h3><button class="btn-close" onclick="cerrarModal(\'modal-ver-candidato\')">×</button></div>',
      '<div class="modal-body"><div id="ver-cand-body" class="info-grid"></div></div>',
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal(\'modal-ver-candidato\')">Cerrar</button></div>',
    '</div>',
  ].join('');
}

export function abrirDetalleCandidatoPorId(id) {
  const c = getCandById(id);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  if (!$('modal-ver-candidato')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-ver-candidato';
    m.innerHTML = crearHTMLModalVerCandidato();
    document.body.appendChild(m);
  }
  const nombreCompleto = (c.apellido ? c.apellido + ', ' : '') + (c.nombre || '');
  $('ver-cand-titulo').textContent = nombreCompleto;
  const item = (key, val) => '<div class="info-item"><div class="key">' + key + '</div><div class="val">' + (val || '—') + '</div></div>';
  $('ver-cand-body').innerHTML =
    item('DNI', c.dni) +
    item('CUIT', c.cuit) +
    item('Fecha de nacimiento', formatearFechaISO(c.fecNac)) +
    item('Estado civil', c.estadoCivil) +
    item('Género', c.genero) +
    item('Nacionalidad', c.nacionalidad) +
    item('Teléfono', c.tel) +
    item('Email', c.email) +
    item('Domicilio', ((c.calle || '') + (c.piso ? ' ' + c.piso : '')).trim()) +
    item('Zona de residencia', c.zona) +
    item('Partido', c.partido) +
    item('Localidad', c.localidad) +
    item('Disponibilidad horaria', c.disponibilidadHoraria) +
    item('Medio de contacto', c.medio) +
    item('Referido por', c.nombreReferido) +
    item('Estado', ESTADO_DISPLAY[c.estado] || c.estado) +
    (c.estado === 'Baja' ? item('Motivo de baja', c.tipoMotivoBaja + (c.fechaBaja ? ' — ' + formatearFechaISO(c.fechaBaja) : '')) : '') +
    (c.estado === 'Baja' && c.motivoRechazo ? item('Detalle del motivo', c.motivoRechazo) : '') +
    item('Observaciones', c.obs);
  abrirModal('modal-ver-candidato');
}

// ========== CITAS ==========

export function abrirCitarPorId(id) {
  const c = getCandById(id);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  $('citar-idx').value = id;
  $('citar-nombre').textContent = (c.apellido ? c.apellido + ', ' : '') + c.nombre;
  $('citar-fecha').value = '';
  $('citar-hora').value = '';
  // Sin min: la fecha de citación puede ser pasada (ticket "Fecha de
  // citación") — se usa también para cargar candidatos que ya fueron
  // citados/entrevistados antes de tener el sistema al día, no solo para
  // agendar una cita nueva a futuro.
  abrirModal('modal-citar-cand');
}

export async function guardarCita() {
  const c = getCandById($('citar-idx').value);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  const fecha = $('citar-fecha').value;
  const hora = $('citar-hora').value;
  if (!fecha) { toast('⚠️ Ingresá la fecha'); return; }
  if (!hora) { toast('⚠️ Ingresá la hora'); return; }
  const snapshot = { fechaCita: c.fechaCita, horaCita: c.horaCita, estado: c.estado };
  c.fechaCita = fecha;
  c.horaCita = hora;
  c.estado = 'Citado';
  const ok = await supaSync('candidatos', c);
  if (!ok) {
    Object.assign(c, snapshot);
    toast(mensajeErrorGuardado('⚠️ No se pudo guardar la cita en el servidor — reintentá o avisá a sistemas'));
    return;
  }

  // Crear turno en el calendario
  const turno = {
    id: Date.now(),
    candidatoId: idLocalCand(c.id),
    nombre: (c.apellido ? c.apellido + ' ' : '') + c.nombre,
    fecha: fecha,
    hora: hora,
    estado: 'Confirmado',
    responsable: (DB.personalRrhh || []).find(p => p.id === c.rrhhId)?.nombre || '',
  };
  if (!DB.turnos) DB.turnos = [];
  DB.turnos.push(turno);
  const okTurno = await supaSync('turnos', turno);
  if (!okTurno) toast('⚠️ La cita se guardó en el candidato, pero no se pudo registrar en el calendario');

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

export async function guardarResultadoEntrevista() {
  const c = getCandById($('resultado-idx').value);
  if (!c) { toast('⚠️ Error: candidato no encontrado'); return; }
  const asistio = document.querySelector('input[name="asistio-radio"]:checked');
  if (!asistio) { toast('⚠️ Indicá si asistió o no'); return; }
  const snapshot = { asistio: c.asistio, estado: c.estado, motivoRechazo: c.motivoRechazo, obsEntrevista: c.obsEntrevista, fechaCita: c.fechaCita, horaCita: c.horaCita };
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
  }
  const ok = await supaSync('candidatos', c);
  if (!ok) {
    Object.assign(c, snapshot);
    toast(mensajeErrorGuardado('⚠️ No se pudo guardar el resultado en el servidor — reintentá o avisá a sistemas'));
    return;
  }
  cerrarModal('modal-resultado-cand');
  renderCandidatos();
  if (c.asistio === 'no') toast('ℹ️ No asistió — vuelve a Sin citar');
  else toast('✓ Resultado registrado');
}

// ========== ACCIONES DE ESTADO ==========

export async function aprobarCandidatoPorId(id) {
  const c = getCandById(id); if (!c) return;
  const estadoAnterior = c.estado;
  c.estado = 'Aprobado';
  const ok = await supaSync('candidatos', c);
  if (!ok) {
    c.estado = estadoAnterior;
    toast(mensajeErrorGuardado('⚠️ No se pudo aprobar en el servidor — reintentá o avisá a sistemas'));
    return;
  }
  renderCandidatos();
  toast('✅ ' + c.nombre + ' aprobado');
}

export function rechazarCandidatoPorId(id) {
  abrirModalInput({ titulo: 'Rechazar candidato', etiqueta: 'Motivo del rechazo' }, async (motivo) => {
    const c = getCandById(id); if (!c) return;
    const estadoAnterior = c.estado, motivoAnterior = c.motivoRechazo;
    c.estado = 'Rechazado';
    c.motivoRechazo = motivo;
    const ok = await supaSync('candidatos', c);
    if (!ok) {
      c.estado = estadoAnterior; c.motivoRechazo = motivoAnterior;
      toast(mensajeErrorGuardado('⚠️ No se pudo rechazar en el servidor — reintentá o avisá a sistemas'));
      return;
    }
    renderCandidatos();
    toast('❌ Candidato rechazado');
  });
}

export async function pasarAPsicoPorId(id) {
  const c = getCandById(id); if (!c) return;
  // Match por DNI, no por candidatoId — mismo criterio ya establecido en
  // este proyecto para conciliar entre etapas (ver CLAUDE.md, "Conciliación
  // entre etapas por candidatoId truncado"): candidatoId puede truncarse
  // o no según el alta y deja de matchear tras un reload; el DNI es el
  // dato estable entre etapas.
  if ((DB.psicos || []).find(p => p.dni && p.dni === c.dni)) { toast('⚠️ Ya está en Psicotécnico'); return; }
  const p = {
    id: Date.now(), candidatoId: idLocalCand(c.id), nombre: (c.apellido ? c.apellido + ' ' : '') + c.nombre, dni: c.dni, zona: c.zona, tel: c.tel, rrhh: (DB.personalRrhh || []).find(p => p.id === c.rrhhId)?.nombre || '',
    psicotecnico: 'Pendiente', prelaboral: 'Pendiente', antecedentes: 'No requerido', libretaSanitaria: 'No requerido',
    requiereAntecedentes: false, requiereLibreta: false, estado: 'En proceso',
    fecha: new Date().toLocaleDateString('es-AR'), obs: '',
  };
  const okPsico = await supaSync('psicos', p);
  if (!okPsico) { toast(mensajeErrorGuardado('⚠️ No se pudo enviar a Psicotécnico — reintentá o avisá a sistemas')); return; }
  if (!DB.psicos) DB.psicos = [];
  DB.psicos.push(p);
  const estadoAnterior = c.estado;
  c.estado = 'Psicotecnico';
  const okCand = await supaSync('candidatos', c);
  if (!okCand) {
    // El registro de psicotécnico ya quedó creado — no se revierte para
    // no perder ese trabajo, pero el candidato queda con estado
    // desincronizado hasta reintentar (mejor avisar que fallar en silencio).
    c.estado = estadoAnterior;
    toast(mensajeErrorGuardado('⚠️ Se creó el registro de Psicotécnico pero no se pudo actualizar el estado del candidato — reintentá'));
    renderCandidatos();
    return;
  }
  renderCandidatos();
  toast('🧠 ' + c.nombre + ' enviado a Psicotécnico');
}

export async function registrarAsistencia(id, valor) {
  const c = getCandById(id); if (!c) return;
  const snapshot = { asistio: c.asistio, estado: c.estado, fechaCita: c.fechaCita, horaCita: c.horaCita };
  c.asistio = (valor === 'si' || valor === 'no') ? valor : null;
  if (valor === 'si') {
    c.estado = 'Entrevistado';
  } else if (valor === 'no') {
    c.estado = 'Sin citar';
    c.fechaCita = null;
    c.horaCita = null;
  }
  const ok = await supaSync('candidatos', c);
  if (!ok) {
    Object.assign(c, snapshot);
    renderCandidatos();
    toast(mensajeErrorGuardado('⚠️ No se pudo registrar la asistencia en el servidor — reintentá o avisá a sistemas'));
    return;
  }
  renderCandidatos();
  if (valor === 'si') toast('✅ Asistió — ahora podés Aprobar o Rechazar');
  else if (valor === 'no') toast('❌ No asistió — vuelve a Sin citar');
}

// Revierte una asistencia marcada por error (ticket RRHH 04/08/2026).
// Deshace exactamente lo que hizo registrarAsistencia(id,'si') — vuelve
// asistio a null y estado a 'Citado' — y nada más: no toca fechaCita,
// horaCita, motivoRechazo, obs ni ningún otro dato del candidato. Sólo
// se ofrece desde 'Entrevistado' (ver renderFilaCand): si el candidato
// ya avanzó a Aprobado/Rechazado/Psicotécnico, deshacer la asistencia
// dejaría esos pasos posteriores en un estado inconsistente, así que no
// se expone ahí — hay que rechazarlo o revertir esos pasos primero.
export async function desmarcarAsistenciaPorId(id) {
  const c = getCandById(id); if (!c) return;
  if (c.estado !== 'Entrevistado') { toast('⚠️ Sólo se puede desmarcar justo después de registrar la asistencia, antes de Aprobar/Rechazar'); return; }
  const nombreCompleto = (c.apellido ? c.apellido + ', ' : '') + (c.nombre || '');
  if (!confirm('¿Desmarcar la asistencia de ' + nombreCompleto + '? Vuelve a "Citado" para poder registrarla de nuevo.')) return;

  const snapshot = { asistio: c.asistio, estado: c.estado };
  c.asistio = null;
  c.estado = 'Citado';
  const ok = await supaSync('candidatos', c);
  if (!ok) {
    Object.assign(c, snapshot);
    renderCandidatos();
    toast(mensajeErrorGuardado('⚠️ No se pudo desmarcar la asistencia en el servidor — reintentá o avisá a sistemas'));
    return;
  }
  renderCandidatos();
  toast('↩️ Asistencia desmarcada — ' + nombreCompleto + ' vuelve a "Citado"');
}

// ========== DAR DE BAJA (Baja / Caducado / MT Social / MT con deuda) ==========
// Modal dinámico (mismo patrón que "Ver detalle" más arriba) — RRHH elige a
// mano cuál de los 4 estados aplica, no hay cálculo automático (ver
// ESTADOS_BAJA arriba).

function crearHTMLModalBajaCand() {
  return [
    '<div class="modal" style="max-width:420px;">',
      '<div class="modal-header"><h3>Dar de baja</h3><button class="btn-close" onclick="cerrarModal(\'modal-baja-cand\')">×</button></div>',
      '<div class="modal-body">',
        '<input type="hidden" id="baja-cand-id">',
        '<div id="baja-cand-nombre" style="font-weight:600;margin-bottom:10px;"></div>',
        '<div class="form-group"><label>Estado</label><select id="baja-cand-estado" onchange="onChangeEstadoBajaCand()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
          ESTADOS_BAJA.map(e => '<option>' + e + '</option>').join(''),
        '</select></div>',
        // Sólo se muestra para estado "Baja" (ver onChangeEstadoBajaCand) —
        // Caducado/MT Social/MT con deuda ya son la categoría en sí.
        '<div id="baja-cand-tipo-row" style="display:none;">',
          '<div class="form-group" style="margin-top:8px;"><label>Tipo de motivo</label><select id="baja-cand-tipo" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option>',
            TIPOS_MOTIVO_BAJA.map(t => '<option>' + t + '</option>').join(''),
          '</select></div>',
          '<div class="form-group" style="margin-top:8px;"><label>Fecha</label><input type="date" id="baja-cand-fecha" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;"></div>',
        '</div>',
        '<div class="form-group" style="margin-top:8px;"><label>Motivo / detalle</label><textarea id="baja-cand-motivo" rows="3" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;"></textarea></div>',
      '</div>',
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal(\'modal-baja-cand\')">Cancelar</button><button class="btn btn-danger" onclick="confirmarBajaCandidato()">Confirmar</button></div>',
    '</div>',
  ].join('');
}

export function onChangeEstadoBajaCand() {
  const sel = $('baja-cand-estado');
  const row = $('baja-cand-tipo-row');
  if (!sel || !row) return;
  row.style.display = sel.value === 'Baja' ? 'block' : 'none';
}

export function abrirBajaCandidatoPorId(id) {
  const c = getCandById(id);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  if (!$('modal-baja-cand')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-baja-cand';
    m.innerHTML = crearHTMLModalBajaCand();
    document.body.appendChild(m);
  }
  $('baja-cand-id').value = id;
  $('baja-cand-nombre').textContent = (c.apellido ? c.apellido + ', ' : '') + (c.nombre || '');
  $('baja-cand-estado').selectedIndex = 0;
  $('baja-cand-tipo').value = c.tipoMotivoBaja || '';
  $('baja-cand-fecha').value = c.fechaBaja || hoyStr();
  $('baja-cand-motivo').value = '';
  onChangeEstadoBajaCand();
  abrirModal('modal-baja-cand');
}

export async function confirmarBajaCandidato() {
  const c = getCandById($('baja-cand-id').value);
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  const estadoNuevo = $('baja-cand-estado').value;
  const motivo = cleanText($('baja-cand-motivo').value || '');

  let tipoMotivoBaja = null;
  let fechaBaja = null;
  if (estadoNuevo === 'Baja') {
    tipoMotivoBaja = $('baja-cand-tipo').value || '';
    if (!tipoMotivoBaja) { toast('⚠️ Seleccioná el tipo de motivo'); return; }
    fechaBaja = $('baja-cand-fecha').value || '';
    if (!fechaBaja) { toast('⚠️ Ingresá la fecha'); return; }
  }

  const snapshot = { estado: c.estado, motivoRechazo: c.motivoRechazo, tipoMotivoBaja: c.tipoMotivoBaja, fechaBaja: c.fechaBaja };
  c.estado = estadoNuevo;
  c.motivoRechazo = motivo;
  c.tipoMotivoBaja = tipoMotivoBaja;
  c.fechaBaja = fechaBaja;
  const ok = await supaSync('candidatos', c);
  if (!ok) {
    Object.assign(c, snapshot);
    toast(mensajeErrorGuardado('⚠️ No se pudo dar de baja en el servidor — reintentá o avisá a sistemas'));
    return;
  }
  cerrarModal('modal-baja-cand');
  renderCandidatos();
  toast('📁 Candidato pasado a "' + estadoNuevo + '"');
}

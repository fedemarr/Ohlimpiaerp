// Módulo Sanciones v1 — modal "Nueva sanción" (niveles 0-2 esta
// tanda) + Tabs Pendientes / Activas / Historial. Reemplaza el ABM
// plano que vivía en legacy.js (sin niveles tipados, sin flujo de
// aprobación, con el botón "+ Nueva sanción" roto — apuntaba a un
// modal que no existía en el DOM).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { subirAdjunto } from '@shared/adjuntos.js';
import {
  getSancionById, crearSancionNivel0, crearYEjecutarNivel1, revertirNivel1,
  crearBorradorNivel2, elevarNivel2, aprobarPrimeraInstancia, aprobarSegundaInstancia,
  rechazarSancion, ejecutarNivel2, idLocalTrunc,
} from './flujo.js';
import { getVersionInfraccionVigente } from './catalogo.js';
import { calcularAntecedentesDisciplinarios } from './escalada.js';
import { gerenteResponsable, esGerenteRRHH, esSupervisor, esRRHHoAdmin } from './permisos.js';
import { abrirRegistrarDescargo } from './descargo.js';

// toISOString() es UTC — entre las 21:00 y medianoche en Argentina
// precargaba el modal con la fecha de mañana.
function hoyISOLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORIAS_INFRACCION = ['Ausencias e Impuntualidad', 'Incumplimiento de Tareas y Normas', 'Conductas y Comportamiento'];
const NOMBRES_NIVEL = { 0: 'Llamado verbal (informal)', 1: 'Observación', 2: 'Apercibimiento' };
const ESTADO_BADGE = {
  'Borrador': 'badge-gris',
  'Pendiente aprobación 1': 'badge-acento',
  'Pendiente aprobación 2': 'badge-acento',
  'Pendiente descargo': 'badge-acento',
  'Descargo recibido': 'badge-acento',
  'Ejecutada': 'badge-verde',
  'Revertida por Gerente': 'badge-gris',
  'Rechazada': 'badge-rojo',
};

function esAdministrativo(legajo) {
  return (legajo?.servicio || '').trim().toUpperCase() === 'ADMINISTRATIVO';
}

function gerenteResponsableDeSancion(s) {
  return gerenteResponsable({ servicio: s.servicio, sector: s.areaAdministrativa });
}

function btn(label, fn, color) {
  return `<button class="btn btn-xs" style="${color ? `background:${color};color:white;` : ''}" onclick="${fn}">${label}</button>`;
}

function filaSancion(s, { acciones = [] } = {}) {
  return `<tr>
    <td>${s.nombreSancionado}<div style="font-size:11px;color:var(--texto-suave);">N° ${s.nroSocio}</div></td>
    <td><span class="badge badge-azul">${s.tipoSancionado}</span></td>
    <td style="text-align:center;"><span class="badge">${s.nivel} - ${NOMBRES_NIVEL[s.nivel] || s.nombreNivel}</span></td>
    <td style="font-size:12px;">${s.nombreInfraccion}</td>
    <td style="font-size:12px;">${(s.fechaIniciacion || '').slice(0, 10)}</td>
    <td style="text-align:center;"><span class="badge ${ESTADO_BADGE[s.estado] || 'badge-gris'}">${s.estado}</span></td>
    <td style="white-space:nowrap;">${acciones.join(' ')}</td>
  </tr>`;
}

function accionesParaSancion(s) {
  const nombre = currentUser?.nombre;
  const acciones = [];
  if (s.estado === 'Borrador' && s.propuestaPorLegajo === nombre) {
    acciones.push(btn('📤 Elevar', `elevarNivel2PorId('${s.id}')`, '#1b4fa8'));
  }
  if (s.estado === 'Ejecutada' && s.nivel === 1 && gerenteResponsableDeSancion(s) === nombre) {
    acciones.push(btn('↩️ Revertir', `abrirRevertirNivel1('${s.id}')`, '#dc2626'));
  }
  if (s.estado === 'Pendiente aprobación 1' && gerenteResponsableDeSancion(s) === nombre) {
    acciones.push(btn('✅ Aprobar', `aprobarPrimeraInstanciaPorId('${s.id}')`, '#16a34a'));
    acciones.push(btn('❌ Rechazar', `abrirRechazarSancion('${s.id}')`, '#dc2626'));
  }
  if (s.estado === 'Pendiente aprobación 2' && esGerenteRRHH(nombre)) {
    acciones.push(btn('✅ Aprobar', `aprobarSegundaInstanciaPorId('${s.id}')`, '#16a34a'));
    acciones.push(btn('❌ Rechazar', `abrirRechazarSancion('${s.id}')`, '#dc2626'));
  }
  if (s.estado === 'Pendiente descargo' && esRRHHoAdmin()) {
    acciones.push(btn('📝 Descargo', `abrirRegistrarDescargo('${s.id}')`, '#1b4fa8'));
  }
  if (s.estado === 'Descargo recibido' && esRRHHoAdmin()) {
    acciones.push(btn('▶️ Ejecutar', `ejecutarNivel2PorId('${s.id}')`, '#16a34a'));
  }
  acciones.push(btn('👁', `abrirDetalleSancion('${s.id}')`));
  return acciones;
}

// ========== TAB PENDIENTES ==========

export function renderPendientesSanciones() {
  const nombre = currentUser?.nombre;
  const todas = (DB.sancionesDisciplinarias || []).filter(s => !s.anulado);
  const enProceso = todas.filter(s => !['Ejecutada', 'Rechazada', 'Revertida por Gerente'].includes(s.estado));

  let bandeja = [];
  if (esSupervisor()) bandeja.push(...enProceso.filter(s => s.propuestaPorLegajo === nombre));
  bandeja.push(...todas.filter(s => s.estado === 'Ejecutada' && s.nivel === 1 && gerenteResponsableDeSancion(s) === nombre));
  bandeja.push(...enProceso.filter(s => s.estado === 'Pendiente aprobación 1' && gerenteResponsableDeSancion(s) === nombre));
  bandeja.push(...enProceso.filter(s => s.estado === 'Pendiente aprobación 2' && esGerenteRRHH(nombre)));
  bandeja.push(...enProceso.filter(s => ['Pendiente descargo', 'Descargo recibido'].includes(s.estado) && esGerenteRRHH(nombre)));
  if (esRRHHoAdmin()) bandeja.push(...enProceso, ...todas.filter(s => s.estado === 'Ejecutada' && s.nivel === 1));
  bandeja = [...new Map(bandeja.map(s => [s.id, s])).values()];

  const q = ($('sanc-pend-buscar') || {}).value?.toLowerCase() || '';
  const fNivel = ($('sanc-pend-nivel') || {}).value || '';
  if (q) bandeja = bandeja.filter(s => s.nombreSancionado.toLowerCase().includes(q));
  if (fNivel) bandeja = bandeja.filter(s => String(s.nivel) === fNivel);
  bandeja.sort((a, b) => new Date(a.fechaIniciacion) - new Date(b.fechaIniciacion));

  const tbody = $('tbody-sanc-pendientes');
  if (!tbody) return;
  tbody.innerHTML = bandeja.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:32px;opacity:.5;">No hay sanciones pendientes</td></tr>'
    : bandeja.map(s => filaSancion(s, { acciones: accionesParaSancion(s) })).join('');
}

export function filtrarPendientesSanciones() { renderPendientesSanciones(); }

// ========== TAB ACTIVAS ==========

export function renderActivasSanciones() {
  let filas = (DB.sancionesDisciplinarias || []).filter(s => !s.anulado && s.estado === 'Ejecutada');
  const q = ($('sanc-act-buscar') || {}).value?.toLowerCase() || '';
  if (q) filas = filas.filter(s => s.nombreSancionado.toLowerCase().includes(q));
  filas.sort((a, b) => new Date(b.fechaIniciacion) - new Date(a.fechaIniciacion));

  const tbody = $('tbody-sanc-activas');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:32px;opacity:.5;">Sin sanciones activas</td></tr>'
    : filas.map(s => filaSancion(s, { acciones: accionesParaSancion(s) })).join('');
}

export function filtrarActivasSanciones() { renderActivasSanciones(); }

// ========== TAB HISTORIAL ==========

export function renderHistorialSanciones() {
  let filas = (DB.sancionesDisciplinarias || []).filter(s => !s.anulado);
  const q = ($('sanc-hist-buscar') || {}).value?.toLowerCase() || '';
  const fNivel = ($('sanc-hist-nivel') || {}).value || '';
  const fEstado = ($('sanc-hist-estado') || {}).value || '';
  const fAnio = ($('sanc-hist-anio') || {}).value || '';
  if (q) filas = filas.filter(s => s.nombreSancionado.toLowerCase().includes(q));
  if (fNivel) filas = filas.filter(s => String(s.nivel) === fNivel);
  if (fEstado) filas = filas.filter(s => s.estado === fEstado);
  if (fAnio) filas = filas.filter(s => new Date(s.fechaIniciacion).getFullYear() === parseInt(fAnio));
  filas.sort((a, b) => new Date(b.fechaIniciacion) - new Date(a.fechaIniciacion));

  const tbody = $('tbody-sanc-historial');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:32px;opacity:.5;">Sin sanciones registradas</td></tr>'
    : filas.map(s => filaSancion(s, { acciones: [btn('👁', `abrirDetalleSancion('${s.id}')`)] })).join('');
}

export function filtrarHistorialSanciones() { renderHistorialSanciones(); }

export async function exportarSancionesExcel() {
  const filas = (DB.sancionesDisciplinarias || []).filter(s => !s.anulado);
  if (!filas.length) { toast('⚠️ No hay datos para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(s => ({
    Sancionado: s.nombreSancionado, 'N° Socio': s.nroSocio, Tipo: s.tipoSancionado,
    Nivel: s.nivel, Infracción: s.nombreInfraccion, 'Fecha hecho': s.fechaHecho,
    'Fecha inicio': (s.fechaIniciacion || '').slice(0, 10), Estado: s.estado,
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Sanciones');
  XLSX.writeFile(libro, `sanciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ========== MODAL — NUEVA SANCIÓN ==========

function ensureModalNuevaSancion() {
  if ($('modal-sanc-nueva')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-sanc-nueva';
  m.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-header"><h3>⚠️ Nueva sanción</h3><button class="btn-close" onclick="cerrarModal('modal-sanc-nueva')">×</button></div>
      <div class="modal-body">
        <div class="form-section">Sancionado</div>
        <div class="form-group"><label>Sancionado *</label>
          <input type="text" id="ns-sancionado" list="dl-ns-sancionado" oninput="seleccionarSancionadoModal()">
          <datalist id="dl-ns-sancionado"></datalist>
        </div>
        <div id="ns-info-sancionado" style="display:flex;flex-direction:column;gap:4px;font-size:13px;background:var(--fondo);border-radius:var(--radio);padding:12px;margin:8px 0 12px;"></div>

        <div class="form-section">Infracción</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Categoría *</label>
            <select id="ns-categoria" onchange="cambiarCategoriaModal()">${CATEGORIAS_INFRACCION.map(c => `<option>${c}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>Infracción específica *</label><select id="ns-infraccion" onchange="cambiarInfraccionModal()"></select></div>
        </div>
        <div id="ns-info-infraccion" style="font-size:12.5px;color:var(--texto-suave);margin-bottom:10px;"></div>

        <div class="form-section">Detalle del hecho</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Fecha del hecho *</label><input type="date" id="ns-fecha-hecho"></div>
          <div class="form-group"><label>Fecha de detección *</label><input type="date" id="ns-fecha-deteccion"></div>
        </div>
        <div class="form-group"><label>Descripción del hecho *</label><textarea id="ns-descripcion" rows="3"></textarea></div>
        <div class="form-group"><label>Evidencia (opcional)</label><input type="file" id="ns-adjuntos" multiple accept="application/pdf,image/jpeg,image/png"></div>

        <div class="form-section">Sanción propuesta</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Nivel propuesto *</label>
            <select id="ns-nivel" onchange="recalcularNuevaSancion()">
              <option value="0">0 - Llamado verbal (informal)</option>
              <option value="1">1 - Observación</option>
              <option value="2">2 - Apercibimiento</option>
            </select>
          </div>
          <div class="form-group"><label>Antecedentes del sancionado</label><div id="ns-antecedentes" style="padding:8px 0;font-size:12.5px;"></div></div>
        </div>
        <div id="ns-avisos" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
        <div class="form-group"><label>Justificación (si el nivel difiere de lo sugerido)</label><textarea id="ns-justificacion" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-sanc-nueva')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarNuevaSancion()">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function legajoPorMatch(texto) {
  const match = (texto || '').match(/\(N°(\d+)\)\s*$/);
  if (!match) return null;
  return (DB.legajos || []).find(l => String(l.nro) === match[1]) || null;
}

function pintarInfoSancionado(legajo) {
  const admin = esAdministrativo(legajo);
  $('ns-info-sancionado').innerHTML = `
    <div><strong>${legajo.nombre}</strong> — N° ${legajo.nro}</div>
    <div>${admin ? 'Administrativo · ' + (legajo.sector || '—') : 'Operativo · ' + (legajo.servicio || '—')}</div>
    <div>Supervisor/responsable: ${legajo.supervisor || '—'}</div>
  `;
}

export function seleccionarSancionadoModal() {
  const legajo = legajoPorMatch($('ns-sancionado').value);
  if (!legajo) { $('ns-info-sancionado').innerHTML = ''; $('ns-antecedentes').innerHTML = ''; return; }
  pintarInfoSancionado(legajo);
  const ant = calcularAntecedentesDisciplinarios(legajo.nro);
  $('ns-antecedentes').innerHTML = `Total: ${ant.total} — Observaciones: ${ant.observaciones}, Apercibimientos: ${ant.apercibimientos}${ant.riesgoEscalada !== 'Normal' ? ` — <span style="color:var(--rojo);font-weight:600;">${ant.riesgoEscalada}</span>` : ''}`;
  recalcularNuevaSancion();
}

function poblarInfraccionesPorCategoria() {
  const categoria = $('ns-categoria').value;
  const infracciones = (DB.catalogoInfracciones || []).filter(i => !i.anulado && i.activa && i.categoria === categoria);
  $('ns-infraccion').innerHTML = infracciones.map(i => `<option value="${i.id}">${i.codigo} — ${i.nombre}</option>`).join('');
  cambiarInfraccionModal();
}

export function cambiarCategoriaModal() { poblarInfraccionesPorCategoria(); }

export function cambiarInfraccionModal() { recalcularNuevaSancion(); }

export function recalcularNuevaSancion() {
  const infraccionId = $('ns-infraccion').value;
  const hoy = new Date().toISOString().slice(0, 10);
  const version = infraccionId ? getVersionInfraccionVigente(infraccionId, hoy) : null;
  const nivelPropuesto = parseInt($('ns-nivel').value, 10);

  if (version) {
    $('ns-info-infraccion').innerHTML = `Gravedad: <strong>${version.gravedad}</strong> — Sugerido 1ra vez: ${NOMBRES_NIVEL[version.sancionSugeridaPrimeraVez] || version.sancionSugeridaPrimeraVez} / reiteración: ${NOMBRES_NIVEL[version.sancionSugeridaReiteracion] || version.sancionSugeridaReiteracion}`;
  } else {
    $('ns-info-infraccion').innerHTML = '';
  }

  const avisos = [];
  const legajo = legajoPorMatch($('ns-sancionado').value);
  if (legajo) {
    const ant = calcularAntecedentesDisciplinarios(legajo.nro);
    if (ant.apercibimientos >= 3 && nivelPropuesto === 2) {
      avisos.push(`⚠️ Este sancionado tiene ${ant.apercibimientos} apercibimientos previos. Considerá si corresponde escalar (sumario para suspensión — todavía no disponible en el sistema, gestionar manualmente con RRHH/Consejo).`);
    }
  }
  if (version && nivelPropuesto !== version.sancionSugeridaPrimeraVez && nivelPropuesto !== version.sancionSugeridaReiteracion) {
    avisos.push('ℹ️ El nivel propuesto difiere de lo sugerido por el catálogo — completá la justificación.');
  }
  $('ns-avisos').innerHTML = avisos.map(a => `<div style="padding:8px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;font-size:12.5px;">${a}</div>`).join('');
}

export function abrirNuevaSancion() {
  ensureModalNuevaSancion();
  $('ns-sancionado').value = '';
  $('dl-ns-sancionado').innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo').map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  $('ns-info-sancionado').innerHTML = '';
  $('ns-categoria').value = CATEGORIAS_INFRACCION[0];
  poblarInfraccionesPorCategoria();
  $('ns-fecha-hecho').value = hoyISOLocal();
  $('ns-fecha-deteccion').value = hoyISOLocal();
  $('ns-descripcion').value = '';
  $('ns-adjuntos').value = '';
  $('ns-nivel').value = '1';
  $('ns-antecedentes').innerHTML = '';
  $('ns-justificacion').value = '';
  $('ns-avisos').innerHTML = '';
  abrirModal('modal-sanc-nueva');
}

async function subirEvidenciaSiCorresponde(legajo) {
  const archivos = Array.from($('ns-adjuntos')?.files || []);
  if (!archivos.length) return;
  if (!legajo?.dni) { toast('⚠️ El legajo no tiene DNI cargado — no se pudo subir la evidencia'); return; }
  for (const file of archivos) {
    try { await subirAdjunto({ dni: legajo.dni, etapa: 'sanciones', tipo: 'evidencia-sancion', file }); }
    catch (e) { toast('⚠️ No se pudo subir un adjunto: ' + e.message); }
  }
}

export async function confirmarNuevaSancion() {
  const legajo = legajoPorMatch($('ns-sancionado').value);
  if (!legajo) { toast('⚠️ Elegí un sancionado de la lista'); return; }
  if (legajo.estado !== 'Activo') { toast('❌ El asociado ya no está activo. No se puede sancionar.'); return; }
  const infraccionIdLocal = $('ns-infraccion').value;
  if (!infraccionIdLocal) { toast('⚠️ Elegí la infracción'); return; }
  const fechaHecho = $('ns-fecha-hecho').value;
  if (!fechaHecho) { toast('⚠️ Ingresá la fecha del hecho'); return; }
  const fechaDeteccion = $('ns-fecha-deteccion').value;
  if (!fechaDeteccion) { toast('⚠️ Ingresá la fecha de detección'); return; }
  const descripcionHecho = ($('ns-descripcion').value || '').trim();
  if (!descripcionHecho) { toast('⚠️ Ingresá la descripción del hecho'); return; }
  const nivel = parseInt($('ns-nivel').value, 10);

  const treintaDiasAtras = new Date(); treintaDiasAtras.setDate(treintaDiasAtras.getDate() - 30);
  if (new Date(fechaHecho + 'T00:00:00') < treintaDiasAtras) {
    if (!confirm('⚠️ Esta sanción es retroactiva (hecho de hace más de 30 días). ¿Confirmás cargarla igual?')) return;
  }

  const yaActivaHoy = (DB.sancionesDisciplinarias || []).some(s =>
    !s.anulado && String(s.legajoIdLocal) === String(legajo.nro) &&
    String(s.infraccionIdLocal) === idLocalTrunc(infraccionIdLocal) &&
    (s.fechaHecho || '').slice(0, 10) === fechaHecho
  );
  if (yaActivaHoy && !confirm('⚠️ Ya existe una sanción por la misma infracción a este asociado en esa fecha. ¿Confirmás igual?')) return;

  await subirEvidenciaSiCorresponde(legajo);

  const payload = { protagonista: legajo, infraccionIdLocal, fechaHecho, fechaDeteccion, descripcionHecho, generadoPor: currentUser?.nombre || '' };
  if (nivel === 0) await crearSancionNivel0(payload);
  else if (nivel === 1) await crearYEjecutarNivel1(payload);
  else await crearBorradorNivel2(payload);

  cerrarModal('modal-sanc-nueva');
  renderPendientesSanciones();
}

// ========== ACCIONES DE FILA ==========

export function elevarNivel2PorId(idLocal) { elevarNivel2(idLocal).then(renderPendientesSanciones); }
export function aprobarPrimeraInstanciaPorId(idLocal) { aprobarPrimeraInstancia(idLocal).then(renderPendientesSanciones); }
export function aprobarSegundaInstanciaPorId(idLocal) { aprobarSegundaInstancia(idLocal).then(renderPendientesSanciones); }
export function ejecutarNivel2PorId(idLocal) { ejecutarNivel2(idLocal).then(() => { renderPendientesSanciones(); renderActivasSanciones(); }); }

export function abrirRechazarSancion(idLocal) {
  abrirModalInput({ titulo: 'Rechazar sanción', etiqueta: 'Motivo del rechazo (obligatorio)' }, (motivo) => {
    rechazarSancion(idLocal, motivo).then(renderPendientesSanciones);
  });
}

export function abrirRevertirNivel1(idLocal) {
  abrirModalInput({ titulo: 'Revertir Observación', etiqueta: 'Motivo de la reversión (obligatorio)' }, (motivo) => {
    revertirNivel1(idLocal, motivo).then(renderPendientesSanciones);
  });
}

// ========== MODAL DE DETALLE ==========

function ensureModalDetalleSancion() {
  if ($('modal-sanc-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-sanc-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header"><h3>⚠️ Detalle de la sanción</h3><button class="btn-close" onclick="cerrarModal('modal-sanc-detalle')">×</button></div>
      <div class="modal-body" id="sd-detalle-cuerpo"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-sanc-detalle')">Cerrar</button>
        <button class="btn btn-primary" id="sd-btn-imprimir">🖨 Imprimir</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleSancion(idLocal) {
  const s = getSancionById(idLocal);
  if (!s) return;
  ensureModalDetalleSancion();
  const eventos = (DB.sancionEventos || []).filter(e => e.sancionIdLocal === String(s.id).slice(-9)).sort((a, b) => new Date(a.ejecutadoEn) - new Date(b.ejecutadoEn));
  const descargo = (DB.sancionDescargos || []).find(d => d.sancionIdLocal === String(s.id).slice(-9));
  $('sd-detalle-cuerpo').innerHTML = `
    <div class="info-item"><div class="key">Sancionado</div><div class="val">${s.nombreSancionado} — N° ${s.nroSocio} (${s.tipoSancionado})</div></div>
    <div class="info-item"><div class="key">Nivel</div><div class="val">${s.nivel} - ${s.nombreNivel}</div></div>
    <div class="info-item"><div class="key">Infracción</div><div class="val">${s.nombreInfraccion} (${s.categoriaInfraccion}, ${s.gravedad})</div></div>
    <div class="info-item"><div class="key">Hecho</div><div class="val">${s.fechaHecho} — ${s.descripcionHecho}</div></div>
    <div class="info-item"><div class="key">Detección</div><div class="val">${s.fechaDeteccion || '—'}</div></div>
    <div class="info-item"><div class="key">Estado</div><div class="val"><span class="badge ${ESTADO_BADGE[s.estado] || 'badge-gris'}">${s.estado}</span></div></div>
    ${s.motivoRechazo ? `<div class="info-item"><div class="key">Motivo</div><div class="val">${s.motivoRechazo}</div></div>` : ''}
    ${descargo ? `<div class="info-item"><div class="key">Descargo</div><div class="val">${descargo.descripcion} (${descargo.medio})</div></div>` : ''}
    <div class="form-section">Historial</div>
    ${eventos.map(e => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--borde);">${(e.ejecutadoEn || '').slice(0, 16).replace('T', ' ')} — ${e.ejecutadoPor}: ${e.estadoDesde ? e.estadoDesde + ' → ' : ''}${e.estadoHasta}${e.observaciones ? ' (' + e.observaciones + ')' : ''}</div>`).join('') || '<p style="opacity:.5;">Sin eventos registrados</p>'}
  `;
  $('sd-btn-imprimir').onclick = () => imprimirSancion(s.id);
  abrirModal('modal-sanc-detalle');
}

// ========== IMPRIMIR ==========

function fmtFechaImpresion(iso) {
  if (!iso) return '—';
  const d = String(iso).slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

export function imprimirSancion(idLocal) {
  const s = getSancionById(idLocal);
  if (!s) return;
  const w = window.open('', '_blank', 'width=800,height=700');
  if (!w) return;
  const nro = String(s.id).slice(-9);
  const firmaBloque = (titulo) => `
    <div class="firma-block">
      <div style="font-weight:700;margin-bottom:6px;">${titulo}</div>
      <div>Firma: <span class="firma-line"></span></div>
      <div>Aclaración: <span class="firma-line"></span></div>
      <div>Fecha: <span class="firma-line"></span></div>
    </div>`;
  const aprobaciones = [
    s.aprobadaPorLegajo ? `<div class="item"><div class="key">Aprobación 1</div><div class="val">${s.aprobadaPorLegajo} — ${fmtFechaImpresion(s.fechaAprobacion)}</div></div>` : '',
    s.aprobacionSecundariaLegajo ? `<div class="item"><div class="key">Aprobación 2 (RRHH)</div><div class="val">${s.aprobacionSecundariaLegajo} — ${fmtFechaImpresion(s.fechaAprobacionSecundaria)}</div></div>` : '',
  ].join('');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sanción — ${s.nombreSancionado}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:13px;padding:32px;max-width:720px;margin:0 auto;color:#222;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #0f2d6b;margin-bottom:16px;}
  .logo{font-size:24px;font-weight:800;color:#0f2d6b;letter-spacing:.5px;}
  h1{font-size:20px;margin:6px 0 2px;}
  h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1b4fa8;border-bottom:1px solid #1b4fa8;padding-bottom:4px;margin:18px 0 10px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;}
  .item .key{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;}
  .item .val{font-size:13px;font-weight:600;}
  .descripcion{line-height:1.5;margin-top:8px;}
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:56px;padding-top:16px;border-top:2px solid #333;}
  .firma-line{display:inline-block;width:130px;height:16px;border-bottom:1px solid #333;vertical-align:bottom;}
</style></head><body>
  <div class="header">
    <div><div class="logo">Cooperativa Ohlimpia</div><div style="font-size:12px;color:#666;margin-top:2px;">Sanción disciplinaria — N° ${nro}</div></div>
    <div style="text-align:right;font-size:12px;color:#666;">${new Date().toLocaleDateString('es-AR')}</div>
  </div>
  <h1>${s.nombreNivel}</h1>
  <h2>Sancionado</h2>
  <div class="grid">
    <div class="item"><div class="key">Nombre</div><div class="val">${s.nombreSancionado}</div></div>
    <div class="item"><div class="key">N° de socio</div><div class="val">${s.nroSocio || '—'}</div></div>
    <div class="item"><div class="key">Tipo</div><div class="val">${s.tipoSancionado || '—'}</div></div>
    <div class="item"><div class="key">Servicio</div><div class="val">${s.servicio || '—'}</div></div>
    <div class="item"><div class="key">Supervisor</div><div class="val">${s.supervisor || '—'}</div></div>
  </div>
  <h2>Infracción</h2>
  <div class="grid">
    <div class="item"><div class="key">Infracción</div><div class="val">${s.nombreInfraccion || '—'}</div></div>
    <div class="item"><div class="key">Categoría</div><div class="val">${s.categoriaInfraccion || '—'}</div></div>
    <div class="item"><div class="key">Gravedad</div><div class="val">${s.gravedad || '—'}</div></div>
    <div class="item"><div class="key">Nivel</div><div class="val">${s.nivel} — ${s.nombreNivel}</div></div>
  </div>
  <h2>Detalle del hecho</h2>
  <div class="grid">
    <div class="item"><div class="key">Fecha del hecho</div><div class="val">${fmtFechaImpresion(s.fechaHecho)}</div></div>
    <div class="item"><div class="key">Fecha de detección</div><div class="val">${fmtFechaImpresion(s.fechaDeteccion)}</div></div>
  </div>
  <div class="descripcion">${s.descripcionHecho || '—'}</div>
  <h2>Proceso</h2>
  <div class="grid">
    <div class="item"><div class="key">Estado</div><div class="val">${s.estado}</div></div>
    <div class="item"><div class="key">Propuesta por</div><div class="val">${s.propuestaPorLegajo || '—'}</div></div>
    <div class="item"><div class="key">Fecha de iniciación</div><div class="val">${fmtFechaImpresion(s.fechaIniciacion)}</div></div>
    ${aprobaciones}
  </div>
  ${s.descargoIdLocal ? `<div style="margin-top:16px;border:1px solid #888;padding:12px;border-radius:4px;"><strong>Descargo presentado</strong><div style="margin-top:4px;">Registrado en el sistema — N° ${s.descargoIdLocal}</div></div>` : ''}
  ${s.motivoRechazo ? `<div style="margin-top:16px;"><strong>Motivo (${s.estado}):</strong> ${s.motivoRechazo}</div>` : ''}
  <div class="firmas">
    ${firmaBloque('Sancionado')}
    ${firmaBloque(s.supervisor || 'Responsable')}
  </div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

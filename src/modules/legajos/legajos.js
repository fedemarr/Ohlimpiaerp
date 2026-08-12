import { DB, currentUser } from '@shared/state.js';
import { $, avatarEl, badge, fillSelect, cbuValido } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, supaDel, getLastSupaSyncError } from '@shared/supabase.js';
import { TALLES_POR_PRENDA } from '@modules/uniformes/catalogos.js';
import { calcularFechaAltaObraSocial, formatearMesAnio } from '@shared/obraSocial.js';
import { listarAdjuntos, obtenerUrlFirmada, subirAdjunto, borrarAdjunto, MAX_SIZE, TIPO_LEGIBLE } from '@shared/adjuntos.js';
import { calcularEstadoVencimiento } from '../documentacion/documentacion.js';
import { crearNotificacion } from '@shared/notificaciones.js';

// Tema 2 del relevamiento (MODULO_MONOTRIBUTO.md §4): "sin archivo:
// etiqueta roja + notificación a RRHH/Administración" (MiPyME) y mismo
// esquema para CUIT inactivo. Se notifica a cada persona de DB.rrhh —
// mismo catálogo que ya usa el resto del sistema para "a quién le toca
// RRHH" (altas.js, calendario.js). Solo se llama en una transición real
// (ver guardarEdicionLegajo/confirmarImportMonotributo), no en cada
// guardado, para no generar notificaciones repetidas de algo que ya se
// sabía.
function _notificarRRHH(legajo, mensaje) {
  (DB.rrhh || []).forEach(nombre => {
    crearNotificacion({ tipo: 'legajo_monotributo_pendiente', entidadTipo: 'legajo', entidadIdLocal: String(legajo.nro), destinatarioNombre: nombre, mensaje });
  });
}

// Busca, para un DNI, la documentación de ingreso más reciente que tenga
// vencimiento de antecedentes cargado (puede no haber ninguna si el legajo
// se importó por CSV o es muy viejo).
function _antecedentesDelLegajo(dni) {
  const docs = (DB.documentacionIngreso || []).filter(d => d.dni === dni && d.antecVencimiento);
  return docs.length ? docs[docs.length - 1] : null;
}

// legajo.ingreso se guarda en formato argentino DD/MM/AAAA (display), no
// ISO — hay que convertirlo antes de pasarlo a calcularFechaAltaObraSocial().
function _ingresoAISO(l) {
  const m = (l.ingreso || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mes, y] = m;
  return y + '-' + mes.padStart(2, '0') + '-' + d.padStart(2, '0');
}

// "Mes de alta" de obra social para el listado — se calcula siempre desde
// legajo.ingreso (nunca falta, es obligatorio), no desde
// obraSocialInicioTramite (puede estar vacío en legajos viejos o
// importados por CSV) — así la columna se ve completa para todos.
function _mesAltaObraSocial(l) {
  return formatearMesAnio(calcularFechaAltaObraSocial(_ingresoAISO(l)));
}

// ========== ESTADO INTERNO ==========

let legajoActualNro = null;

// ========== SELECCIÓN MÚLTIPLE ==========
// Selección persiste entre filtros (Set de N° socio). "Seleccionar todo"
// opera solo sobre lo que está visible en la tabla en ese momento — para
// saber qué está visible sin depender del DOM, se guarda la última lista
// que renderLegajos() efectivamente pintó.
let selectedLegajos = new Set();
let _ultimaListaLegajos = [];

export function toggleLegajoSelection(nro, checked) {
  if (checked) selectedLegajos.add(String(nro));
  else selectedLegajos.delete(String(nro));
  actualizarCheckboxSeleccionarTodo();
}

export function toggleAllLegajosSelection(checked) {
  _ultimaListaLegajos.forEach(l => {
    if (checked) selectedLegajos.add(String(l.nro));
    else selectedLegajos.delete(String(l.nro));
  });
  renderLegajos(_ultimaListaLegajos);
}

function actualizarCheckboxSeleccionarTodo() {
  const cb = $('select-all-legajos');
  if (!cb) return;
  const visibles = _ultimaListaLegajos.length;
  const seleccionadosVisibles = _ultimaListaLegajos.filter(l => selectedLegajos.has(String(l.nro))).length;
  cb.checked = visibles > 0 && seleccionadosVisibles === visibles;
  cb.indeterminate = seleccionadosVisibles > 0 && seleccionadosVisibles < visibles;
}

// "Ver seleccionados": filtra la tabla a solo los legajos tildados,
// reusando el mismo render — no inventa una vista/modal nueva. Si más
// adelante hace falta otra acción (exportar, imprimir en lote, etc.),
// es un pedido aparte.
export function viewSelectedLegajos() {
  if (!selectedLegajos.size) { toast('⚠️ No hay legajos seleccionados'); return; }
  renderLegajos(DB.legajos.filter(l => selectedLegajos.has(String(l.nro))));
}

// ========== HELPER — PERÍODO DE PRUEBA ==========

export function calcularPrueba(l) {
  const ingreso = new Date(l.fechaIngresoPrueba);
  const hoy = new Date();
  const diasTotales = l.periodoPrueba * 30;
  const diasPasados = Math.floor((hoy - ingreso) / (1000 * 60 * 60 * 24));
  const pct = Math.min(100, Math.round(diasPasados / diasTotales * 100));
  const enPrueba = diasPasados < diasTotales;
  return { pct, diasPasados, diasTotales, enPrueba };
}

// ========== RENDER TABLA ==========

export function renderLegajos(lista) {
  const rows = lista || DB.legajos;
  _ultimaListaLegajos = rows;
  const tbody = $('tbody-legajos');
  if (!tbody) return;
  tbody.innerHTML = rows.map(l => {
    const pr = calcularPrueba(l);
    const pruebaEl = pr.enPrueba
      ? `<div class="prueba-bar"><div style="font-size:11px;font-weight:500;color:${pr.pct > 80 ? 'var(--rojo)' : pr.pct > 50 ? 'var(--naranja)' : 'var(--azul)'};">Día ${pr.diasPasados}/${pr.diasTotales}</div><div class="prueba-bar-track"><div class="prueba-bar-fill${pr.pct > 80 ? ' danger' : pr.pct > 50 ? ' warn' : ''}" style="width:${pr.pct}%;"></div></div></div>`
      : `<span class="badge badge-verde">Completado</span>`;
    const adjLegal = l.adjuntosLegal && l.adjuntosLegal.length ? `<span class="chip">📎 ${l.adjuntosLegal.length}</span>` : '';
    const docAntec = _antecedentesDelLegajo(l.dni);
    const estAntec = docAntec ? calcularEstadoVencimiento(docAntec.antecVencimiento) : null;
    const antecEl = estAntec
      ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${estAntec.bg};color:${estAntec.color};">${estAntec.texto}</span>`
      : '<span class="text-muted">—</span>';
    return `<tr onclick="verLegajo(${l.nro})">
      <td style="text-align:center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="legajo-checkbox" ${selectedLegajos.has(String(l.nro)) ? 'checked' : ''} onchange="toggleLegajoSelection(${l.nro}, this.checked)">
      </td>
      <td style="font-family:'DM Mono',monospace;font-weight:700;color:var(--azul);">${l.nro}</td>
      <td><div style="display:flex;align-items:center;gap:10px;">${avatarEl(l.nombre)}<div style="font-weight:500;">${l.nombre}</div></div></td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;">${l.dni}</td>
      <td><span class="chip">${l.funcion}</span></td>
      <td style="font-size:12px;">${l.servicio}</td>
      <td style="font-size:12px;">${l.supervisor}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${l.ingreso}</td>
      <td>${pruebaEl}</td>
      <td>${badge(l.estado)}${!l.cbu ? '<span class="badge badge-acento" style="font-size:10px;margin-left:4px;" title="CBU no cargado">🏦 Sin CBU</span>' : ''}</td>
      <td>${l.estadoLegal ? badge(l.estadoLegal) + '<br>' + adjLegal : '<span class="text-muted">—</span>'}</td>
      <td>${antecEl}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${l.fechaBaja || '—'}</td>
      <td style="font-size:12px;color:${l.fechaReincorp ? 'var(--verde)' : 'var(--texto-muy-suave)'};">${l.fechaReincorp || '—'}</td>
      <td>${l.estadoMedico ? `<span class="badge badge-naranja" style="font-size:10px;">🏥 ${l.estadoMedico.split(' ')[0]}</span>` : ''}${badge(l.seguro === 'Completo' ? 'Completo' : 'Pendiente')}</td>
      <td style="font-size:12px;">${l.obraSocial || '<span class="text-muted">—</span>'}</td>
      <td style="font-size:12px;" onclick="event.stopPropagation();">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;" title="${l.altaObraSocialFecha ? 'Tildado el ' + new Date(l.altaObraSocialFecha).toLocaleDateString('es-AR') : 'Corresponde a partir de ' + _mesAltaObraSocial(l)}">
          <input type="checkbox" ${l.altaObraSocial ? 'checked' : ''} onchange="toggleAltaObraSocial(${l.nro}, this.checked)">
          ${_mesAltaObraSocial(l) || '<span class="text-muted">—</span>'}
        </label>
      </td>
      <td style="font-size:10px;white-space:nowrap;">
        ${l.mipymeEstado === 'TRAMITADO' ? '<span class="badge badge-verde" style="font-size:9px;">MiPyME OK</span>' : '<span class="badge badge-rojo" style="font-size:9px;" title="Sin certificado MiPyME tramitado">MiPyME pend.</span>'}
        ${l.cuitEstado === 'INACTIVO' ? '<br><span class="badge badge-rojo" style="font-size:9px;">CUIT inactivo</span>' : ''}
      </td>
      <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();verLegajo(${l.nro})">Ver legajo</button></td>
    </tr>`;
  }).join('');
  actualizarCheckboxSeleccionarTodo();
}

// Checkbox "Mes de alta OS" del listado — persiste que RRHH efectivamente
// tramitó el alta de obra social, con marca de tiempo (sql/v068). Revierte
// el checkbox visualmente si el guardado falla, mismo patrón que el resto
// de los toggles ya endurecidos este mes (candidatos.js, preocupacional.js).
export async function toggleAltaObraSocial(nro, checked) {
  const l = DB.legajos.find(x => x.nro === nro);
  if (!l) return;
  const snapshot = { altaObraSocial: l.altaObraSocial, altaObraSocialFecha: l.altaObraSocialFecha };
  l.altaObraSocial = checked;
  l.altaObraSocialFecha = checked ? new Date().toISOString() : null;
  const ok = await supaSync('legajos', l);
  if (!ok) {
    Object.assign(l, snapshot);
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo guardar' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    renderLegajos();
    return;
  }
  renderLegajos();
  toast(checked ? '✓ Alta de obra social registrada — ' + l.nombre : '↩️ Alta de obra social destildada — ' + l.nombre);
}

// ========== FILTROS ==========

export function filtrarLegajos() {
  const nro = ($('cf-leg-nro') || { value: '' }).value.toLowerCase();
  const nombre = ($('cf-leg-nombre') || { value: '' }).value.toLowerCase();
  const dni = ($('cf-dni') || { value: '' }).value.toLowerCase();
  const funcion = ($('cf-funcion') || { value: '' }).value;
  const serv = ($('cf-leg-serv') || { value: '' }).value.toLowerCase();
  const sup = ($('cf-leg-sup') || { value: '' }).value.toLowerCase();
  const ingreso = ($('cf-leg-ingreso') || { value: '' }).value.toLowerCase();
  const estado = ($('cf-estado') || { value: '' }).value;
  const estLegal = ($('cf-estado-legal') || { value: '' }).value;
  const baja = ($('cf-leg-baja') || { value: '' }).value.toLowerCase();
  const reincorp = ($('cf-leg-reincorp') || { value: '' }).value.toLowerCase();
  const seguro = ($('cf-leg-seguro') || { value: '' }).value;
  const bg = ($('buscador-global') || { value: '' }).value.toLowerCase();
  const busq = nombre || bg;
  const prueba = ($('cf-leg-prueba') || { value: '' }).value;
  const mono = ($('cf-leg-mono') || { value: '' }).value;

  renderLegajos(DB.legajos.filter(l => {
    const pr = calcularPrueba(l);
    return (
      (!nro || String(l.nro).includes(nro)) &&
      (!busq || l.nombre.toLowerCase().includes(busq) || l.dni.includes(busq) || String(l.nro).includes(busq)) &&
      (!dni || l.dni.includes(dni)) &&
      (!funcion || l.funcion.toLowerCase().includes(funcion.toLowerCase())) &&
      (!serv || l.servicio.toLowerCase().includes(serv)) &&
      (!sup || l.supervisor.toLowerCase().includes(sup)) &&
      (!ingreso || l.ingreso.includes(ingreso)) &&
      (!prueba || (prueba === 'en' ? pr.enPrueba : !pr.enPrueba)) &&
      (!estado || l.estado === estado) &&
      (!estLegal || l.estadoLegal === estLegal) &&
      (!baja || (l.fechaBaja || '').includes(baja)) &&
      (!reincorp || (l.fechaReincorp || '').includes(reincorp)) &&
      (!seguro || l.seguro === seguro) &&
      (!mono || (mono === 'mipyme' ? l.mipymeEstado !== 'TRAMITADO' : l.cuitEstado === 'INACTIVO'))
    );
  }));
}

// ========== VER DETALLE ==========

export function verLegajo(nro) {
  legajoActualNro = nro;
  const l = DB.legajos.find(x => x.nro === nro);
  if (!l) return;
  const pr = calcularPrueba(l);
  $('legajo-title').textContent = `Legajo N° ${l.nro} — ${l.nombre}`;

  // Campos actualizados a los nombres nuevos de la reescritura de
  // Reasignaciones (nroSocio/servicioOrigen/etc. en vez de nro/servOrig/etc.,
  // y 'Aprobada ejecutada' en vez de 'Aprobado') — quedaron desactualizados
  // acá cuando se reescribió ese módulo.
  const reasDelAsoc = (DB.reasignaciones || []).filter(r => String(r.nroSocio) === String(l.nro) && r.estado === 'Aprobada ejecutada');
  const capsDelAsoc = (DB.capacitaciones || []).filter(c => !c.anulado && String(c.legajoIdLocal) === String(l.nro))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const sancionesDelAsoc = (DB.sancionesDisciplinarias || []).filter(s => !s.anulado && String(s.legajoIdLocal) === String(l.nro))
    .sort((a, b) => new Date(b.fechaIniciacion) - new Date(a.fechaIniciacion));
  // Tema 9 del relevamiento (10/08): "una NC vinculada a un asociado
  // genera el movimiento en la solapa Sanciones de su legajo" — no crea
  // una sanción real (eso sigue siendo el módulo Sanciones con su propio
  // flujo de niveles/aprobaciones), se muestra la NC vinculada acá.
  const ncsDelAsoc = (DB.noConformidades || []).filter(nc => String(nc.asociadoNroSocio) === String(l.nro))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  // Tab "⚖️ Legal": solo lectura y solo visible para RRHH/Admin — es el
  // reemplazo de la fuga de confidencialidad que era mostrar
  // l.estadoLegal como badge/banner para cualquier perfil (ver delta
  // de Situaciones Legales v1.1). No se propaga más a l.estadoLegal
  // desde ese módulo; los legajos viejos que ya lo tenían seteado
  // siguen mostrándolo tal cual (no se retro-corrige el histórico).
  const puedeVerLegal = ['RRHH', 'Administrador total'].includes(currentUser?.perfil);
  const casosLegalesDelAsoc = puedeVerLegal
    ? (DB.casosLegales || []).filter(c => String(c.nroSocio) === String(l.nro))
      .sort((a, b) => new Date(b.id) - new Date(a.id))
    : [];

  // Tab "🏥 Historial médico": mismo criterio de acceso que el
  // módulo Enfermos y Accidentes (MENU/PERFILES: Admin/RRHH/Operaciones)
  // — nunca muestra el diagnóstico CIE-10 acá, solo tipo/fechas/estado
  // (diseño §3.9/§9.2 — confidencialidad del diagnóstico).
  const puedeVerMedico = ['Administrador total', 'RRHH', 'Operaciones'].includes(currentUser?.perfil);
  const casosMedicosDelAsoc = puedeVerMedico
    ? (DB.casosEnfermosAccidentes || []).filter(c => !c.anulado && String(c.nroSocio) === String(l.nro))
      .sort((a, b) => new Date(b.id) - new Date(a.id))
    : [];

  const descUniDelAsoc = (DB.descuentosUniformePendientes || []).filter(d => !d.anulado && String(d.legajoIdLocal) === String(l.nro))
    .sort((a, b) => new Date(b.fechaGenerado) - new Date(a.fechaGenerado));

  // Tab "💰 Cuenta corriente" (tema 1 del relevamiento 10/08): junta
  // adelantos aprobados (formales e informales), préstamos con su plan de
  // cuotas y las cuotas de uniformes ya calculadas arriba — es la MISMA
  // fuente que va a leer Liquidación (tema 5) para descontar del retiro,
  // así que se arma agregando las tablas reales, sin crear una tabla nueva.
  // Visible solo para los perfiles que manejan plata del asociado.
  const puedeVerCC = ['Administrador total', 'RRHH', 'Finanzas'].includes(currentUser?.perfil);
  // Tema 2 del relevamiento (MODULO_MONOTRIBUTO.md §4): la clave fiscal
  // (ARCA) solo la ve RRHH/Administrador total. Nota real: esto NO es
  // "encriptado" en el sentido que pedía el ticket — no hay forma segura
  // de encriptar client-side sin exponer la clave de desencriptado en el
  // propio bundle, así que lo que sí se implementa es el control de
  // visibilidad por rol (lo enforceable acá); guardarla realmente
  // encriptada requeriría una función server-side, que no existe en este
  // proyecto (sin backend propio, todo pega directo a Supabase).
  const puedeVerClaveFiscal = ['Administrador total', 'RRHH'].includes(currentUser?.perfil);
  const monoDelLegajo = (DB.monotributos || []).find(m => String(m.nroSocio) === String(l.nro) || m.nombre === l.nombre);
  const adelantosDelAsoc = puedeVerCC ? [
    ...(DB.planillasAdelantos || []).flatMap(p => (p.items || [])
      .filter(i => String(i.nroSocio) === String(l.nro) && i.estado === 'Aprobado')
      .map(i => ({ ...i, tipo: 'Adelanto formal', fecha: p.fechaResolucion || p.fechaEnvio || p.fechaCreacion || '' }))),
    ...(DB.adelantosInformales || [])
      .filter(a => String(a.nroSocio) === String(l.nro) && a.estado === 'Aprobado')
      .map(a => ({ ...a, tipo: 'Adelanto informal', fecha: a.fechaResolucion || a.fecha || '' })),
  ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')) : [];
  const prestamosDelAsoc = puedeVerCC
    ? (DB.prestamos || []).filter(p => String(p.nroSocio) === String(l.nro))
      .sort((a, b) => (b.fechaOtorgamiento || '').localeCompare(a.fechaOtorgamiento || ''))
    : [];

  // Tab "📋 Documentación": vencimientos de antecedentes/libreta/curso que
  // ya se cargan en el módulo Documentación (documentacionIngreso, por
  // DNI) — acá solo se agregan y se muestran con el mismo semáforo de
  // alerta previa al vencimiento que usa ese módulo.
  const docsDelAsoc = (DB.documentacionIngreso || []).filter(d => !d.anulado && d.dni === l.dni)
    .sort((a, b) => (b.id || 0) - (a.id || 0));

  $('legajo-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
      ${avatarEl(l.nombre, 56)}
      <div><div style="font-size:17px;font-weight:600;">${l.nombre}</div>
      <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;">${badge(l.estado)}<span class="chip">${l.funcion}</span>${l.estadoLegal ? badge(l.estadoLegal) : ''}<span class="chip">N° ${l.nro}</span></div></div>
    </div>
    ${pr.enPrueba ? `<div class="alerta alerta-warn" style="margin-bottom:14px;"><strong>Período de prueba:</strong> Día ${pr.diasPasados} de ${pr.diasTotales} (${pr.pct}% completado — ${pr.diasTotales - pr.diasPasados} días restantes)</div>` : ''}
    ${!l.cbu ? `<div class="alerta alerta-warn" style="margin-bottom:14px;"><strong>🏦 Falta el CBU:</strong> ${l.nombre} no tiene CBU cargado. Completalo desde "Editar legajo" o usá "🏦 Importar CBU desde archivo" en el listado.</div>` : ''}
    ${l.estadoLegal ? `<div class="alerta alerta-danger" style="margin-bottom:14px;"><strong>⚖️ Situación legal activa:</strong> ${l.estadoLegal}</div>` : ''}
    <div class="tabs">
      <button class="tab-btn active" onclick="tabLeg(0,this)">Datos personales</button>
      <button class="tab-btn" onclick="tabLeg(1,this)">Operativo</button>
      <button class="tab-btn" onclick="tabLeg(2,this)">Movimientos ${reasDelAsoc.length > 0 ? `<span class="badge badge-azul" style="font-size:10px;margin-left:4px;">${reasDelAsoc.length}</span>` : ''}</button>
      <button class="tab-btn" onclick="tabLeg(3,this)">Historial completo</button>
      <button class="tab-btn" onclick="tabLeg(4,this)">📎 Adjuntos</button>
      <button class="tab-btn" onclick="tabLeg(5,this)">🎓 Capacitaciones</button>
      <button class="tab-btn" onclick="tabLeg(6,this)">⚠️ Antecedentes ${(sancionesDelAsoc.length + ncsDelAsoc.length) > 0 ? `<span class="badge badge-rojo" style="font-size:10px;margin-left:4px;">${sancionesDelAsoc.length + ncsDelAsoc.length}</span>` : ''}</button>
      ${puedeVerLegal ? `<button class="tab-btn" onclick="tabLeg(7,this)">⚖️ Legal ${casosLegalesDelAsoc.length > 0 ? `<span class="badge badge-naranja" style="font-size:10px;margin-left:4px;">${casosLegalesDelAsoc.length}</span>` : ''}</button>` : ''}
      ${puedeVerMedico ? `<button class="tab-btn" onclick="tabLeg(8,this)">🏥 Historial médico ${casosMedicosDelAsoc.some(c => c.estado === 'Abierto') ? '<span class="badge badge-rojo" style="font-size:10px;margin-left:4px;">En tratamiento</span>' : ''}</button>` : ''}
      ${puedeVerCC ? `<button class="tab-btn" onclick="tabLeg(9,this)">💰 Cuenta corriente ${(adelantosDelAsoc.length + prestamosDelAsoc.filter(p => p.estado === 'Activo').length + descUniDelAsoc.filter(d => d.estado !== 'Terminado' && d.estado !== 'Cancelado').length) > 0 ? `<span class="badge badge-azul" style="font-size:10px;margin-left:4px;">${adelantosDelAsoc.length + prestamosDelAsoc.filter(p => p.estado === 'Activo').length + descUniDelAsoc.filter(d => d.estado !== 'Terminado' && d.estado !== 'Cancelado').length}</span>` : ''}</button>` : ''}
      <button class="tab-btn" onclick="tabLeg(10,this)">📋 Documentación ${docsDelAsoc.some(d => calcularEstadoVencimiento(d.antecVencimiento)?.texto.includes('🔴') || calcularEstadoVencimiento(d.libretaVencimiento)?.texto.includes('🔴')) ? '<span class="badge badge-rojo" style="font-size:10px;margin-left:4px;">Vencido</span>' : ''}</button>
    </div>
    <div id="leg-tab-0" class="tab-content active"><div class="info-grid">
      <div class="info-item"><div class="key">DNI</div><div class="val">${l.dni}</div></div>
      <div class="info-item"><div class="key">CUIT</div><div class="val">${l.cuit || '—'}
        ${l.cuitEstado ? ` <span class="badge ${l.cuitEstado === 'ACTIVO' ? 'badge-verde' : l.cuitEstado === 'INACTIVO' ? 'badge-rojo' : 'badge-naranja'}" style="font-size:9px;">${l.cuitEstado}</span>` : ''}
        ${l.cuitFechaVerificacion ? `<div style="font-size:10px;color:var(--texto-muy-suave);">Verificado ${l.cuitFechaVerificacion}</div>` : ''}
      </div></div>
      <div class="info-item"><div class="key">Clave fiscal (ARCA)</div><div class="val">${puedeVerClaveFiscal ? (l.claveFiscal || '—') : (l.claveFiscal ? '••••••••' : '—')}
        ${l.claveFiscalFechaActualizacion ? `<div style="font-size:10px;color:var(--texto-muy-suave);">Actualizada ${l.claveFiscalFechaActualizacion}</div>` : ''}
      </div></div>
      <div class="info-item"><div class="key">N° INAES</div><div class="val">${l.inaes || l.nro}</div></div>
      <div class="info-item"><div class="key">Certificado MiPyME</div><div class="val">${l.mipymeEstado === 'TRAMITADO' ? '<span class="badge badge-verde" style="font-size:10px;">TRAMITADO</span>' : '<span class="badge badge-rojo" style="font-size:10px;">⚠️ MiPyME PENDIENTE</span>'}</div></div>
      ${monoDelLegajo ? `<div class="info-item"><div class="key">Adherentes (monotributo)</div><div class="val">${monoDelLegajo.adherentesCantidad || 0}${monoDelLegajo.adherentesMonto ? ' — $' + monoDelLegajo.adherentesMonto.toLocaleString('es-AR') : ''}</div></div>` : ''}
      <div class="info-item"><div class="key">Estado civil</div><div class="val">${l.estadoCivil || '—'}</div></div>
      <div class="info-item"><div class="key">Nacionalidad</div><div class="val">${l.nac || '—'}</div></div>
      <div class="info-item"><div class="key">Localidad</div><div class="val">${l.localidad || '—'}</div></div>
      <div class="info-item"><div class="key">Celular</div><div class="val">${l.tel || '—'}</div></div>
      <div class="info-item"><div class="key">Mail</div><div class="val">${l.mail || '—'}</div></div>
      <div class="info-item"><div class="key">Banco</div><div class="val">${l.banco || '—'}</div></div>
      <div class="info-item"><div class="key">CBU</div><div class="val" style="font-family:'DM Mono',monospace;font-size:12px;">${l.cbu || '<span style="font-family:inherit;color:var(--naranja);font-weight:600;">Sin CBU</span>'}</div></div>
    </div></div>
    <div id="leg-tab-1" class="tab-content"><div class="info-grid">
      <div class="info-item"><div class="key">Función</div><div class="val">${l.funcion}</div></div>
      <div class="info-item"><div class="key">Servicio actual</div><div class="val" style="font-weight:600;color:var(--azul);">${l.servicio}</div></div>
      <div class="info-item"><div class="key">Supervisor</div><div class="val">${l.supervisor}</div></div>
      <div class="info-item"><div class="key">Ingreso</div><div class="val">${l.ingreso}</div></div>
      <div class="info-item"><div class="key">Período prueba</div><div class="val">${l.periodoPrueba} meses</div></div>
      <div class="info-item"><div class="key">Fecha baja</div><div class="val">${l.fechaBaja || '—'}</div></div>
      <div class="info-item"><div class="key">Estado legal</div><div class="val">${l.estadoLegal ? badge(l.estadoLegal) : 'Sin situación legal'}</div></div>
      <div class="info-item"><div class="key">Seguro</div><div class="val">${badge(l.seguro === 'Completo' ? 'Completo' : 'Pendiente')}</div></div>
      <div class="info-item"><div class="key">Ambo / Calzado</div><div class="val">${l.ambo || '—'} / ${l.calzado || '—'}</div></div>
      <div class="info-item"><div class="key">Uniforme (chomba/grafa/buzo/campera/gorra)</div><div class="val">${['chomba', 'grafa', 'buzo', 'campera', 'gorra'].map(k => (l.tallesUniforme || {})[k] || '—').join(' / ')}</div></div>
    </div>
    <div style="margin-top:16px;">
      <div class="form-section">💸 Descuentos por uniforme</div>
      ${descUniDelAsoc.length === 0 ? '<p style="opacity:.6;font-size:12.5px;">Sin descuentos pendientes ni aplicados</p>' : `
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${descUniDelAsoc.map(d => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:8px 12px;font-size:12.5px;">
              <div>
                <div>${d.motivoGeneracion || '—'}</div>
                <div style="color:var(--texto-suave);font-size:11px;">${(d.fechaGenerado || '').slice(0, 10)} · $${(d.montoTotal || 0).toLocaleString('es-AR')} en ${d.cuotasTotales} cuota(s), ${d.cuotasCobradas}/${d.cuotasTotales} cobradas</div>
              </div>
              <span class="badge ${d.estado === 'Terminado' ? 'badge-verde' : d.estado === 'Cancelado' ? 'badge-gris' : 'badge-acento'}">${d.estado}</span>
            </div>`).join('')}
        </div>`}
    </div>
    </div>
    <div id="leg-tab-2" class="tab-content">
      ${reasDelAsoc.length === 0 ? `
        <div class="empty-state"><div class="icon">🔄</div><p>Sin movimientos registrados</p></div>` : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${reasDelAsoc.map(r => `
            <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                <div>
                  <div style="font-size:13px;font-weight:600;">
                    <span style="color:var(--texto-suave);">${r.servicioOrigen}</span>
                    <span style="margin:0 8px;color:var(--azul);">→</span>
                    <span style="color:var(--azul);">${r.servicioDestino}</span>
                  </div>
                  <div style="font-size:11px;color:var(--texto-suave);margin-top:4px;">${r.supervisorOrigen} → ${r.supervisorDestino}</div>
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:2px;">${r.descripcion || ''}</div>
                </div>
                <div style="text-align:right;">
                  <div><span class="chip" style="font-size:10px;">${r.motivo}</span></div>
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:4px;">${r.fechaEfectiva}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>`}
    </div>
    <div id="leg-tab-3" class="tab-content"><div class="timeline">
      <div class="tl-item"><div class="tl-dot"></div><div class="tl-content"><h4>Alta como asociado</h4><p>${l.ingreso} — ${l.servicio}</p></div></div>
      ${reasDelAsoc.map(r => `<div class="tl-item"><div class="tl-dot" style="background:var(--azul-medio);"></div><div class="tl-content"><h4>Reasignación: ${r.servicioOrigen} → ${r.servicioDestino}</h4><p>${r.fechaEfectiva} · ${r.motivo}</p></div></div>`).join('')}
      ${sancionesDelAsoc.map(s => `<div class="tl-item"><div class="tl-dot" style="background:var(--naranja);"></div><div class="tl-content"><h4>${s.nivel === 0 ? 'Registro informal' : 'Sanción nivel ' + s.nivel + ' — ' + s.nombreNivel}: ${s.nombreInfraccion}</h4><p>${s.fechaHecho} · ${s.estado}</p></div></div>`).join('')}
      ${ncsDelAsoc.map(nc => `<div class="tl-item"><div class="tl-dot" style="background:var(--naranja);"></div><div class="tl-content"><h4>No conformidad ${nc.nro}</h4><p>${nc.fecha} · ${nc.estado}${nc.firmada ? ' · ✍️ Firmada' : ''}</p></div></div>`).join('')}
      ${puedeVerCC ? adelantosDelAsoc.map(a => `<div class="tl-item"><div class="tl-dot" style="background:var(--verde);"></div><div class="tl-content"><h4>${a.tipo}: $${(a.monto || 0).toLocaleString('es-AR')}</h4><p>${a.fecha || '—'}</p></div></div>`).join('') : ''}
      ${puedeVerCC ? prestamosDelAsoc.map(p => `<div class="tl-item"><div class="tl-dot" style="background:var(--verde);"></div><div class="tl-content"><h4>Préstamo otorgado: $${(p.monto || 0).toLocaleString('es-AR')} en ${p.cuotas} cuotas</h4><p>${p.fechaOtorgamiento || '—'} · ${p.estado}</p></div></div>`).join('') : ''}
      ${l.estadoLegal ? `<div class="tl-item"><div class="tl-dot rojo"></div><div class="tl-content"><h4>Situación legal: ${l.estadoLegal}</h4><p>Registrada en el sistema</p></div></div>` : ''}
      ${l.fechaBaja ? `<div class="tl-item"><div class="tl-dot rojo"></div><div class="tl-content"><h4>Baja registrada</h4><p>${l.fechaBaja}</p></div></div>` : ''}
      ${l.fechaReincorp ? `<div class="tl-item"><div class="tl-dot" style="background:var(--verde);"></div><div class="tl-content"><h4>Reincorporación</h4><p>${l.fechaReincorp}${l.legajoAnteriorNro ? ' · Legajo anterior N° ' + l.legajoAnteriorNro : ''}</p></div></div>` : ''}
    </div></div>
    <div id="leg-tab-4" class="tab-content"><div id="leg-adjuntos-lista" style="color:var(--texto-suave);">Cargando…</div></div>
    <div id="leg-tab-5" class="tab-content">
      ${capsDelAsoc.length === 0 ? '<div class="empty-state"><div class="icon">🎓</div><p>Sin capacitaciones registradas</p></div>' : `
        <div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#1e3a8a;color:white;">
            <th style="padding:8px;text-align:left;">Fecha</th>
            <th style="padding:8px;text-align:left;">Tipo</th>
            <th style="padding:8px;text-align:left;">Instructor</th>
            <th style="padding:8px;text-align:center;">Estado</th>
            <th style="padding:8px;text-align:center;">Resultado</th>
            <th style="padding:8px;text-align:center;">Puntaje</th>
          </tr></thead>
          <tbody>${capsDelAsoc.map(c => `<tr>
            <td style="padding:6px 8px;">${(c.fecha || '').split('-').reverse().join('/')}</td>
            <td style="padding:6px 8px;">${c.tipo}</td>
            <td style="padding:6px 8px;">${c.instructor}</td>
            <td style="padding:6px 8px;text-align:center;">${badge(c.estado)}</td>
            <td style="padding:6px 8px;text-align:center;">${c.resultado || '—'}</td>
            <td style="padding:6px 8px;text-align:center;">${c.puntaje != null ? c.puntaje : '—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`}
    </div>
    <div id="leg-tab-6" class="tab-content">
      ${(sancionesDelAsoc.length + ncsDelAsoc.length) === 0 ? '<div class="empty-state"><div class="icon">✅</div><p>Sin antecedentes disciplinarios</p></div>' : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${sancionesDelAsoc.map(s => `
            <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                <div>
                  <div style="font-size:13px;font-weight:600;">
                    ${s.nivel === 0 ? '<span class="chip">Registro informal</span>' : `Nivel ${s.nivel} — ${s.nombreNivel}`}
                  </div>
                  <div style="font-size:12px;color:var(--texto-suave);margin-top:2px;">${s.nombreInfraccion}</div>
                </div>
                <div style="text-align:right;">
                  <span class="chip" style="font-size:10px;">${s.estado}</span>
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:4px;">${s.fechaHecho}</div>
                </div>
              </div>
            </div>`).join('')}
          ${ncsDelAsoc.map(nc => `
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:var(--radio);padding:10px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                <div>
                  <div style="font-size:13px;font-weight:600;">📋 No conformidad ${nc.nro}</div>
                  <div style="font-size:12px;color:var(--texto-suave);margin-top:2px;">${nc.causaRaiz || nc.tratamiento || 'Sin causa raíz cargada'}</div>
                </div>
                <div style="text-align:right;">
                  <span class="chip" style="font-size:10px;">${nc.estado}${nc.firmada ? ' · ✍️ Firmada' : ''}</span>
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:4px;">${nc.fecha}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>`}
    </div>
    ${puedeVerLegal ? `
    <div id="leg-tab-7" class="tab-content">
      ${casosLegalesDelAsoc.length === 0 ? '<div class="empty-state"><div class="icon">✅</div><p>Sin situaciones legales registradas</p></div>' : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${casosLegalesDelAsoc.map(c => `
            <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                <div>
                  <div style="font-size:13px;font-weight:600;">${c.tipoReclamo || 'Situación legal'}</div>
                  <div style="font-size:12px;color:var(--texto-suave);margin-top:2px;">${c.estado}${c.estado === 'Cerrado' && c.resultado ? ' — ' + c.resultado : ''}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:4px;">${c.fechaInicio}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>`}
    </div>` : ''}
    ${puedeVerMedico ? `
    <div id="leg-tab-8" class="tab-content">
      ${casosMedicosDelAsoc.length === 0 ? '<div class="empty-state"><div class="icon">✅</div><p>Sin casos médicos registrados</p></div>' : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${casosMedicosDelAsoc.map(c => `
            <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                <div>
                  <div style="font-size:13px;font-weight:600;">${c.tipoCaso}${c.subtipo ? ' — ' + c.subtipo : ''}</div>
                  <div style="font-size:12px;color:var(--texto-suave);margin-top:2px;">${c.estado}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:4px;">${c.fechaInicio}${c.fechaAltaEfectiva ? ' al ' + c.fechaAltaEfectiva : ''}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>`}
    </div>` : ''}
    ${puedeVerCC ? `
    <div id="leg-tab-9" class="tab-content">
      <div class="form-section">💵 Adelantos</div>
      ${adelantosDelAsoc.length === 0 ? '<p style="opacity:.6;font-size:12.5px;">Sin adelantos aprobados</p>' : `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
          ${adelantosDelAsoc.map(a => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:8px 12px;font-size:12.5px;">
              <div><span class="chip" style="font-size:10px;">${a.tipo}</span> <span style="color:var(--texto-suave);margin-left:6px;">${a.fecha || '—'}</span></div>
              <div style="font-weight:700;color:var(--verde);">$${(a.monto || 0).toLocaleString('es-AR')}</div>
            </div>`).join('')}
        </div>`}
      <div class="form-section">🏦 Préstamos</div>
      ${prestamosDelAsoc.length === 0 ? '<p style="opacity:.6;font-size:12.5px;">Sin préstamos</p>' : `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
          ${prestamosDelAsoc.map(p => {
            const pagado = (p.pagos || []).reduce((s, x) => s + (x.monto || 0), 0);
            const cuotasPagadas = (p.pagos || []).length;
            return `
            <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:8px 12px;font-size:12.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>${p.fechaOtorgamiento || '—'} · ${cuotasPagadas}/${p.cuotas} cuotas de $${(p.montoCuota || 0).toLocaleString('es-AR')}</div>
                <span class="badge ${p.estado === 'Pagado' ? 'badge-verde' : p.estado === 'Cancelado' ? 'badge-gris' : 'badge-acento'}">${p.estado}</span>
              </div>
              <div style="color:var(--texto-suave);font-size:11px;margin-top:2px;">Otorgado $${(p.monto || 0).toLocaleString('es-AR')} · Pagado $${pagado.toLocaleString('es-AR')} · Saldo $${Math.max((p.monto || 0) - pagado, 0).toLocaleString('es-AR')}</div>
            </div>`;
          }).join('')}
        </div>`}
      <div class="form-section">👕 Cuotas de uniforme</div>
      ${descUniDelAsoc.length === 0 ? '<p style="opacity:.6;font-size:12.5px;">Sin descuentos pendientes ni aplicados</p>' : `
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${descUniDelAsoc.map(d => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:8px 12px;font-size:12.5px;">
              <div>
                <div>${d.motivoGeneracion || '—'}</div>
                <div style="color:var(--texto-suave);font-size:11px;">${(d.fechaGenerado || '').slice(0, 10)} · $${(d.montoTotal || 0).toLocaleString('es-AR')} en ${d.cuotasTotales} cuota(s), ${d.cuotasCobradas}/${d.cuotasTotales} cobradas</div>
              </div>
              <span class="badge ${d.estado === 'Terminado' ? 'badge-verde' : d.estado === 'Cancelado' ? 'badge-gris' : 'badge-acento'}">${d.estado}</span>
            </div>`).join('')}
        </div>`}
      <p style="margin-top:14px;font-size:11px;color:var(--texto-muy-suave);">Retenciones: se suman acá cuando esté el módulo Retenciones (tema 4 del relevamiento).</p>
    </div>` : ''}
    <div id="leg-tab-10" class="tab-content">
      ${docsDelAsoc.length === 0 ? '<div class="empty-state"><div class="icon">📋</div><p>Sin documentación de ingreso registrada para este DNI</p></div>' : docsDelAsoc.map(d => {
        const items = [
          { label: 'Antecedentes penales', venc: d.antecVencimiento },
          d.libretaAplica ? { label: 'Libreta sanitaria', venc: d.libretaVencimiento } : null,
          d.cursoTiene ? { label: 'Curso/capacitación', venc: d.cursoVencimiento } : null,
        ].filter(Boolean);
        return `
        <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px;margin-bottom:10px;">
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${items.map(it => {
              const est = calcularEstadoVencimiento(it.venc);
              return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;">
                <span>${it.label}</span>
                ${est ? `<span style="background:${est.bg};color:${est.color};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;">${est.texto}</span>` : '<span style="color:var(--texto-muy-suave);font-size:11px;">Sin vencimiento cargado</span>'}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
      ${puedeVerCC ? `
      <div class="form-section">🏭 Certificado MiPyME</div>
      <p style="font-size:11px;color:var(--texto-suave);margin:0 0 6px;">Vence el 30/04 de cada año (renovación automática de ARCA si la cooperativa está al día).</p>
      <div id="leg-mipyme-box">
        <div id="leg-mipyme-lista" style="margin-bottom:6px;">Cargando…</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="file" id="leg-mipyme-file" accept="application/pdf,image/jpeg,image/png" style="display:none;" onchange="seleccionarArchivoMipymeLegajo()">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('leg-mipyme-file').click()">📤 Subir certificado</button>
        </div>
      </div>` : ''}
      <div class="form-section">📎 Archivos adjuntos</div>
      <p style="font-size:11px;color:var(--texto-suave);">Ver también la solapa "📎 Adjuntos" para el detalle de cada archivo escaneado.</p>
    </div>
  `;
  abrirModal('modal-legajo');
  cargarAdjuntosLegajo(l.dni);
  if (puedeVerCC) cargarAdjuntoMipymeLegajo(l.dni);
}

// ========== CERTIFICADO MiPyME (tema 2 del relevamiento — MODULO_MONOTRIBUTO.md §4) ==========
// Misma infraestructura que el 'proceso' de Candidatos: tabla `adjuntos`
// + bucket privado, tipo 'certificado-mipyme' (sql/v080). Con archivo:
// TRAMITADO; sin archivo: PENDIENTE (badge rojo, visible arriba en la
// tab Datos personales vía l.mipymeEstado — pero el estado real de
// "hay archivo o no" se decide acá, no en el select manual, así que se
// sincroniza l.mipymeEstado al subir/eliminar).
async function cargarAdjuntoMipymeLegajo(dni) {
  const cont = $('leg-mipyme-lista');
  if (!cont) return;
  const lista = await listarAdjuntos({ dni, etapa: 'legajos', tipo: 'certificado-mipyme' });
  cont.innerHTML = lista.length === 0
    ? '<span style="color:var(--texto-muy-suave);font-size:12px;">Sin certificado cargado</span>'
    : lista.map(a => `
      <div style="display:flex;align-items:center;gap:8px;background:var(--fondo);border:1px solid var(--borde);border-radius:6px;padding:6px 10px;margin-bottom:4px;">
        <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ${a.nombreArchivo || 'Archivo'}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="verAdjuntoLegajo('${a.url}')">👁️ Ver</button>
        <button type="button" class="btn btn-sm" style="background:#fee2e2;color:#991b1b;" onclick="eliminarAdjuntoMipymeLegajo('${a.id}','${dni}')">🗑️</button>
      </div>`).join('');
}
export async function seleccionarArchivoMipymeLegajo() {
  const input = $('leg-mipyme-file');
  const file = input?.files?.[0];
  if (!file) return;
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  if (file.size > MAX_SIZE) { toast('⚠️ El archivo supera el límite de 10 MB'); if (input) input.value = ''; return; }
  try {
    await subirAdjunto({ dni: l.dni, etapa: 'legajos', tipo: 'certificado-mipyme', file });
    l.mipymeEstado = 'TRAMITADO';
    supaSync('legajos', l);
    toast('📄 Certificado MiPyME subido');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Error al subir el archivo'));
  } finally {
    if (input) input.value = '';
  }
  cargarAdjuntoMipymeLegajo(l.dni);
}
export async function eliminarAdjuntoMipymeLegajo(id, dni) {
  if (!confirm('¿Eliminar el certificado MiPyME?')) return;
  const ok = await borrarAdjunto(id);
  const l = DB.legajos.find(x => x.dni === dni);
  if (ok && l) { l.mipymeEstado = 'PENDIENTE'; supaSync('legajos', l); }
  toast(ok ? '🗑️ Certificado eliminado' : '⚠️ No se pudo eliminar');
  cargarAdjuntoMipymeLegajo(dni);
}

// ========== ADJUNTOS (todo lo cargado durante el proceso de ingreso) ==========

async function cargarAdjuntosLegajo(dni) {
  const cont = $('leg-adjuntos-lista');
  if (!cont) return;
  const adjuntos = await listarAdjuntos({ dni });
  if (!adjuntos.length) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">📎</div><p>Sin adjuntos cargados</p></div>';
    return;
  }
  cont.innerHTML = adjuntos.map(a => `
    <div style="display:flex;align-items:center;gap:10px;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 14px;margin-bottom:8px;">
      <span class="chip">${TIPO_LEGIBLE[a.tipo] || a.tipo}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">${a.nombreArchivo || 'Archivo'}</span>
      <span style="font-size:11px;color:var(--texto-muy-suave);">${a.subidoEn ? new Date(a.subidoEn).toLocaleDateString('es-AR') : ''}</span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="verAdjuntoLegajo('${a.url}')">👁️ Ver</button>
    </div>
  `).join('');
}

export async function verAdjuntoLegajo(path) {
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

// ========== TABS DETALLE ==========

export function tabLeg(idx, btn) {
  document.querySelectorAll('#legajo-body .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#legajo-body .tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const tab = $('leg-tab-' + idx);
  if (tab) tab.classList.add('active');
}

// ========== EDITAR ==========

// Sectores administrativos hardcodeados (mismo catálogo que hoy vive en
// legacy.js como DB.sectoresAdmin) — reexportado para que src/modules/
// vacaciones/ lo reuse sin duplicar la lista.
export const SECTORES_ADMIN = [
  'Consejo de Administración', 'Coord. General', 'Coord. RRHH',
  'Coord. Operaciones y Planeamiento', 'Coord. Calidad',
  'Coord. Logística y Distribución', 'Coord. Marketing y Ventas',
  'Coord. Administración y Finanzas',
];

// Muestra/oculta la sección de campos de Vacaciones según si el
// servicio cargado es 'ADMINISTRATIVO' (mismo criterio que ya usa el
// resto del proyecto para distinguir administrativos de operarios).
export function toggleSeccionVacacionesLegajo() {
  const servicio = ($('edit-servicio') || { value: '' }).value.trim().toUpperCase();
  const sec = $('edit-admin-vac-section');
  if (sec) sec.style.display = servicio === 'ADMINISTRATIVO' ? 'block' : 'none';
}

export function editarLegajoActual() {
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  $('editar-legajo-title').textContent = `Editar — ${l.nombre}`;
  const p = l.nombre.split(' ');
  $('edit-apellido').value = p[0] || '';
  $('edit-nombre').value = p.slice(1).join(' ') || '';
  $('edit-dni').value = l.dni;
  $('edit-cuit').value = l.cuit || '';
  if ($('edit-clave-fiscal')) $('edit-clave-fiscal').value = l.claveFiscal || '';
  if ($('edit-inaes')) $('edit-inaes').value = l.inaes || l.nro;
  if ($('edit-cuit-estado')) $('edit-cuit-estado').value = l.cuitEstado || '';
  if ($('edit-mipyme-estado')) $('edit-mipyme-estado').value = l.mipymeEstado || 'PENDIENTE';
  $('edit-tel').value = l.tel || '';
  $('edit-mail').value = l.mail || '';
  $('edit-banco').value = l.banco || '';
  if ($('edit-cbu')) $('edit-cbu').value = l.cbu || '';
  $('edit-localidad').value = l.localidad || '';
  $('edit-nac').value = l.nac || '';
  $('edit-servicio').value = l.servicio;
  $('edit-supervisor').value = l.supervisor;
  $('edit-estado').value = l.estado;
  $('edit-calzado').value = l.calzado || '';
  // Chomba/Grafa(pantalón)/Buzo/Campera/Gorra (ticket "Uniforme" 08/2026)
  // — viven en l.tallesUniforme (jsonb), clave en minúscula. Igual que
  // edit-funcion/edit-sector, las opciones se pueblan acá con
  // TALLES_POR_PRENDA en vez de quedar fijas en el HTML, para no
  // mantener 2 listas de talles por prenda en el proyecto.
  const tu = l.tallesUniforme || {};
  [['edit-talle-chomba', 'Chomba', 'chomba'], ['edit-talle-grafa', 'Grafa', 'grafa'], ['edit-talle-buzo', 'Buzo', 'buzo'],
   ['edit-talle-campera', 'Campera', 'campera'], ['edit-talle-gorra', 'Gorra', 'gorra']].forEach(([id, prenda, key]) => {
    fillSelect(id, TALLES_POR_PRENDA[prenda]);
    const el = $(id); if (el) el.value = tu[key] || '';
  });
  const fechaBajaEl = $('edit-fecha-baja');
  if (fechaBajaEl) fechaBajaEl.value = l.fechaBaja ? l.fechaBaja.split('/').reverse().join('-') : '';
  const estLegalEl = $('edit-estado-legal');
  if (estLegalEl) estLegalEl.value = l.estadoLegal || '';
  fillSelect('edit-funcion', DB.categorias);
  const ef = $('edit-funcion');
  for (let i = 0; i < ef.options.length; i++) {
    if (ef.options[i].text === l.funcion) { ef.selectedIndex = i; break; }
  }
  fillSelect('edit-sector', SECTORES_ADMIN);
  if ($('edit-sector')) $('edit-sector').value = l.sector || '';
  if ($('edit-dias-vac')) $('edit-dias-vac').value = l.diasVacacionesAnuales || 0;
  const jefe = l.jefeDirectoLegajoIdLocal ? DB.legajos.find(x => String(x.nro) === String(l.jefeDirectoLegajoIdLocal)) : null;
  if ($('edit-jefe-directo')) $('edit-jefe-directo').value = jefe ? `${jefe.nombre} (N°${jefe.nro})` : '';
  const dlJefe = $('dl-edit-jefe-directo');
  if (dlJefe) dlJefe.innerHTML = DB.legajos.filter(x => x.estado === 'Activo' && x.nro !== l.nro).map(x => `<option value="${x.nombre} (N°${x.nro})">`).join('');
  toggleSeccionVacacionesLegajo();
  cerrarModal('modal-legajo');
  abrirModal('modal-editar-legajo');
}

export function guardarEdicionLegajo() {
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  const a = $('edit-apellido').value.trim();
  const n = $('edit-nombre').value.trim();
  if (!a || !n) { toast('Nombre y apellido obligatorios'); return; }
  const dni = $('edit-dni').value.trim();
  if (dni && !/^\d{6,8}$/.test(dni)) {
    toast('⚠️ El DNI debe tener entre 6 y 8 dígitos numéricos');
    $('edit-dni').focus();
    return;
  }
  const dniDuplicado = dni && DB.legajos.some(x => x.dni === dni && x.nro !== legajoActualNro);
  if (dniDuplicado) {
    toast('⚠️ Ya existe un legajo con ese DNI');
    $('edit-dni').focus();
    return;
  }
  const estadoPrevio = l.estado;
  l.nombre = `${a} ${n}`;
  l.dni = dni;
  l.cuit = $('edit-cuit').value;
  const claveFiscalNueva = ($('edit-clave-fiscal') || { value: l.claveFiscal || '' }).value;
  // Tema 2 §4: "SIN historial de claves, CON fecha de última
  // actualización visible" — solo se pisa la fecha si el valor realmente
  // cambió (si el campo quedó igual, no es una "actualización").
  if (claveFiscalNueva !== l.claveFiscal) l.claveFiscalFechaActualizacion = new Date().toISOString().slice(0, 10);
  l.claveFiscal = claveFiscalNueva;
  // Tema 2 §4: N° INAES ES el número de legajo/asociado — se autocompleta
  // si quedó vacío, no se inventa nada (es el mismo dato que ya tiene el
  // legajo).
  l.inaes = ($('edit-inaes') || { value: l.inaes || '' }).value.trim() || String(l.nro);
  if ($('edit-cuit-estado')) {
    const cuitEstadoNuevo = $('edit-cuit-estado').value || null;
    if (cuitEstadoNuevo !== l.cuitEstado) {
      l.cuitFechaVerificacion = new Date().toISOString().slice(0, 10);
      if (cuitEstadoNuevo === 'INACTIVO' && l.cuitEstado !== 'INACTIVO') {
        _notificarRRHH(l, `⚠️ CUIT inactivo: ${l.nombre} (N° ${l.nro}) — revisar estado ante ARCA.`);
      }
    }
    l.cuitEstado = cuitEstadoNuevo;
  }
  if ($('edit-mipyme-estado')) {
    const mipymeNuevo = $('edit-mipyme-estado').value || null;
    if (mipymeNuevo !== 'TRAMITADO' && l.mipymeEstado === 'TRAMITADO') {
      _notificarRRHH(l, `⚠️ MiPyME pendiente: ${l.nombre} (N° ${l.nro}) quedó sin certificado tramitado.`);
    }
    l.mipymeEstado = mipymeNuevo;
  }
  l.tel = $('edit-tel').value;
  l.mail = $('edit-mail').value;
  l.banco = $('edit-banco').value;
  const cbu = ($('edit-cbu') || { value: '' }).value;
  if (cbu && !cbuValido(cbu)) {
    toast('⚠️ El CBU debe tener exactamente 22 dígitos numéricos');
    return;
  }
  l.cbu = cbu;
  l.localidad = $('edit-localidad').value;
  l.nac = $('edit-nac').value;
  l.funcion = $('edit-funcion').value;
  l.servicio = $('edit-servicio').value;
  l.supervisor = $('edit-supervisor').value;
  l.estado = $('edit-estado').value;
  l.calzado = parseInt($('edit-calzado').value) || l.calzado;
  l.ambo = $('edit-ambo').value;
  // Chomba/Grafa(pantalón)/Buzo/Campera/Gorra — a diferencia de
  // confirmarAlta() (altas.js), acá SÍ puede haber un valor previo
  // (edición de un legajo ya cargado): un select vacío borra la clave en
  // vez de dejarla con el dato viejo colgado.
  l.tallesUniforme = { ...(l.tallesUniforme || {}) };
  [['edit-talle-chomba', 'chomba'], ['edit-talle-grafa', 'grafa'], ['edit-talle-buzo', 'buzo'],
   ['edit-talle-campera', 'campera'], ['edit-talle-gorra', 'gorra']].forEach(([id, key]) => {
    const v = ($(id) || { value: '' }).value;
    if (v) l.tallesUniforme[key] = v;
    else delete l.tallesUniforme[key];
  });
  l.seguro = $('edit-seguro').value === 'Completo' ? 'Completo' : 'Pendiente';
  const fb = $('edit-fecha-baja');
  if (fb && fb.value) { l.fechaBaja = new Date(fb.value).toLocaleDateString('es-AR'); }
  const el = $('edit-estado-legal');
  if (el) l.estadoLegal = el.value || '';
  if (l.servicio.trim().toUpperCase() === 'ADMINISTRATIVO') {
    l.sector = ($('edit-sector') || { value: '' }).value || '';
    l.diasVacacionesAnuales = parseInt(($('edit-dias-vac') || { value: 0 }).value) || 0;
    const jefeTexto = ($('edit-jefe-directo') || { value: '' }).value;
    const jefeMatch = jefeTexto.match(/\(N°(\d+)\)\s*$/);
    l.jefeDirectoLegajoIdLocal = jefeMatch ? jefeMatch[1] : '';
  }
  supaSync('legajos', l);
  // Uniformes: si el legajo pasó a Baja en esta edición, dispara la
  // orden automática de devolución de uniformes sin cargo (política
  // A.11 §13). Indirección por window para no crear un import cruzado
  // entre módulos (mismo criterio que el hook de Altas).
  if (estadoPrevio !== 'Baja' && l.estado === 'Baja' && window.generarOrdenDevolucionUniformes) {
    // l.fechaBaja se guarda como DD/MM/AAAA (formato argentino) — la
    // tabla devoluciones_por_baja espera fecha ISO (date de Postgres).
    const fechaBajaISO = l.fechaBaja
      ? l.fechaBaja.split('/').reverse().join('-')
      : new Date().toISOString().slice(0, 10);
    window.generarOrdenDevolucionUniformes(l, fechaBajaISO);
  }
  cerrarModal('modal-editar-legajo');
  renderLegajos();
  toast('✓ Legajo actualizado');
}

// ========== ELIMINAR ==========
// Borrado real (no "dar de baja" — eso ya existe vía Editar → Estado y es
// la acción correcta para un asociado que deja la cooperativa; esto es
// para sacar del sistema un legajo que no debería existir, ej. un error
// de carga o un duplicado del importador CSV). Pide confirmación con
// nombre y N° de socio de por medio porque no tiene vuelta atrás.
//
// No borra en cascada reasignaciones/capacitaciones/sanciones/casos
// legales o médicos/adjuntos vinculados por dni o N° de socio — quedan
// huérfanos (referencian un legajo que ya no existe) pero no rompen nada
// porque esos módulos ya toleran no encontrar el legajo. Si hace falta
// una limpieza completa en cascada, es un pedido aparte.
export async function eliminarLegajoActual() {
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  if (!confirm(
    '¿Eliminar definitivamente el legajo N° ' + l.nro + ' — ' + l.nombre + ' (DNI ' + l.dni + ')?\n\n'
    + 'Esto borra el legajo del sistema, no es lo mismo que dar de baja. No se puede deshacer.\n'
    + 'Si lo que querés es registrar que dejó la cooperativa, cancelá esto y usá "Editar → Estado: Baja" en su lugar.'
  )) return;

  const idLocal = String(l.nro);
  const ok = await supaDel('legajos', idLocal);
  if (!ok) {
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo eliminar en el servidor' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá o avisá a sistemas');
    return;
  }
  const idx = DB.legajos.findIndex(x => x.nro === legajoActualNro);
  if (idx >= 0) DB.legajos.splice(idx, 1);
  legajoActualNro = null;
  cerrarModal('modal-legajo');
  renderLegajos();
  toast('🗑️ Legajo eliminado');
}

// ========== IMPRIMIR ==========

export function imprimirLegajo() {
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  const w = window.open('', '_blank', 'width=800,height=700');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Legajo N° ${l.nro}</title>
  <style>body{font-family:Arial,sans-serif;font-size:13px;padding:32px;max-width:720px;margin:0 auto;}h1{font-size:20px;margin-bottom:4px;}h2{font-size:13px;font-weight:700;border-bottom:2px solid #1b4fa8;color:#1b4fa8;padding-bottom:4px;margin:18px 0 10px;}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;}.item .key{font-size:10px;color:#888;text-transform:uppercase;}.item .val{font-size:13px;font-weight:500;}.header{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0f2d6b;}.logo{font-size:22px;font-weight:800;color:#0f2d6b;}.firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px;border-top:1px solid #ccc;padding-top:14px;text-align:center;font-size:11px;color:#666;}</style></head><body>
  <div class="header"><div><div class="logo">Cooperativa Ohlimpia</div><div style="font-size:12px;color:#666;">Legajo N° ${l.nro}</div></div><div style="text-align:right;font-size:12px;color:#666;">${new Date().toLocaleDateString('es-AR')}</div></div>
  <h2>Datos personales</h2><div class="grid">
  <div class="item"><div class="key">Nombre</div><div class="val">${l.nombre}</div></div>
  <div class="item"><div class="key">DNI</div><div class="val">${l.dni}</div></div>
  <div class="item"><div class="key">CUIT</div><div class="val">${l.cuit || '—'}</div></div>
  <div class="item"><div class="key">Estado civil</div><div class="val">${l.estadoCivil || '—'}</div></div>
  <div class="item"><div class="key">Nacionalidad</div><div class="val">${l.nac || '—'}</div></div>
  <div class="item"><div class="key">Localidad</div><div class="val">${l.localidad || '—'}</div></div>
  <div class="item"><div class="key">Celular</div><div class="val">${l.tel || '—'}</div></div>
  <div class="item"><div class="key">Mail</div><div class="val">${l.mail || '—'}</div></div></div>
  <h2>Operativo</h2><div class="grid">
  <div class="item"><div class="key">Función</div><div class="val">${l.funcion}</div></div>
  <div class="item"><div class="key">Servicio</div><div class="val">${l.servicio}</div></div>
  <div class="item"><div class="key">Supervisor</div><div class="val">${l.supervisor}</div></div>
  <div class="item"><div class="key">Fecha ingreso</div><div class="val">${l.ingreso}</div></div>
  <div class="item"><div class="key">Estado</div><div class="val">${l.estado}</div></div>
  <div class="item"><div class="key">Fecha baja</div><div class="val">${l.fechaBaja || '—'}</div></div></div>
  <div class="firmas"><div>Firma del asociado</div><div>RRHH — Cooperativa Ohlimpia</div></div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

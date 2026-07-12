// Situaciones Legales v1.1 — Tab Activos: tabla + modal "Nuevo caso" +
// modal detalle (con timeline de novedades) + modal agregar novedad +
// modal cerrar caso. Reemplaza el ABM plano de legacy.js — mismo
// tratamiento que Sanciones/Categorías esta sesión: reemplazar en vez
// de parchar un modal con campos que ya no se podían ni leer.

import { DB } from '@shared/state.js';
import { $, fillDL } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import {
  getCasoById, crearCaso, agregarNovedad, novedadesDeCaso, cerrarCaso, supervisorActual,
} from './flujo.js';
import { subirAdjuntoLegal, listarAdjuntosDeCaso, obtenerUrlFirmadaLegal } from './adjuntos_legal.js';

const TIPOS_RECLAMO = ['Despido', 'Indemnización', 'Salarios adeudados', 'Accidente/enfermedad', 'Otro'];
const TIPOS_NOVEDAD = ['Audiencia', 'Presentación escrito', 'Notificación', 'Sentencia', 'Reunión', 'Otro'];
const ESTADO_BADGE = {
  'Pre-legal': 'badge-gris', 'Carta documento recibida': 'badge-acento', 'Carta documento contestada': 'badge-acento',
  'Conciliación SECLO': 'badge-azul', 'Conciliación interna': 'badge-azul', 'Estado judicial': 'badge-rojo',
  'Cerrado': 'badge-verde',
};

function badge(estado) {
  return `<span class="badge ${ESTADO_BADGE[estado] || 'badge-gris'}">${estado}</span>`;
}

// ========== TAB ACTIVOS ==========

function filaCaso(c) {
  const adjuntos = listarAdjuntosDeCaso(c.id);
  return `<tr>
    <td style="font-weight:500;">${c.asociado}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${c.nroSocio}</td>
    <td>${badge(c.estado)}</td>
    <td style="font-size:12px;">${c.abogado || '—'}</td>
    <td style="font-size:12px;">${c.estudio || '—'}</td>
    <td style="font-size:12px;">${supervisorActual(c)}</td>
    <td style="font-size:12px;">${c.servicio || '—'}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${c.fechaInicio}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${c.ultimaNovedad || '—'}</td>
    <td style="text-align:center;">${adjuntos.length ? `📎 ${adjuntos.length}` : '<span class="text-muted">—</span>'}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="abrirDetalleCasoLegal('${c.id}')">Ver</button></td>
  </tr>`;
}

export function renderCasosActivos() {
  const todos = (DB.casosLegales || []).filter(c => c.estado !== 'Cerrado');
  const st = {
    activos: todos.length,
    concil: todos.filter(c => (c.estado || '').includes('Conciliación')).length,
    juicios: todos.filter(c => c.estado === 'Estado judicial').length,
    abogados: new Set(todos.map(c => c.abogado).filter(Boolean)).length,
  };
  if ($('st-legal-activos')) $('st-legal-activos').textContent = st.activos;
  if ($('st-legal-concil')) $('st-legal-concil').textContent = st.concil;
  if ($('st-legal-juicios')) $('st-legal-juicios').textContent = st.juicios;
  if ($('st-legal-abogados')) $('st-legal-abogados').textContent = st.abogados;

  const q = ($('buscar-legal') || {}).value?.toLowerCase() || '';
  const fEstado = ($('f-est-legal') || {}).value || '';
  let filas = todos;
  if (q) filas = filas.filter(c => c.asociado.toLowerCase().includes(q) || (c.abogado || '').toLowerCase().includes(q));
  if (fEstado) filas = filas.filter(c => c.estado === fEstado);
  filas.sort((a, b) => new Date(b.id) - new Date(a.id));

  const tbody = $('tbody-legal');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="11" style="text-align:center;padding:32px;opacity:.5;">Sin casos activos</td></tr>'
    : filas.map(filaCaso).join('');
}

export function filtrarCasosActivos() { renderCasosActivos(); }

// ========== MODAL — NUEVO CASO ==========

function ensureModalNuevoCaso() {
  if ($('modal-legal')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-legal';
  m.innerHTML = `
    <div class="modal" style="max-width:820px;">
      <div class="modal-header"><h3>⚖️ Nuevo caso legal</h3><button class="btn-close" onclick="cerrarModal('modal-legal')">×</button></div>
      <div class="modal-body">
        <div class="form-grid gap-12">
          <div class="form-section">Datos del caso</div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Asociado *</label><input type="text" id="leg-asociado" list="dl-asoc-leg" placeholder="Buscar por nombre o N° socio" oninput="seleccionarAsociadoLegal()"><datalist id="dl-asoc-leg"></datalist></div>
            <div class="form-group"><label>Estado legal *</label><select id="leg-estado"></select></div>
          </div>
          <div id="leg-info-asociado" style="font-size:12.5px;color:var(--texto-suave);margin-bottom:6px;"></div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Fecha de inicio</label><input type="date" id="leg-fecha"></div>
            <div class="form-group"><label>Servicio donde trabajaba</label><input type="text" id="leg-servicio" list="dl-serv-legal"><datalist id="dl-serv-legal"></datalist></div>
          </div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Tipo de reclamo *</label><select id="leg-tipo-reclamo">${TIPOS_RECLAMO.map(t => `<option>${t}</option>`).join('')}</select></div>
            <div class="form-group"><label>Monto reclamado</label><input type="number" id="leg-monto-reclamado" min="0" step="0.01"></div>
          </div>

          <div class="form-section">Abogados y estudios</div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Abogado de la parte actora</label><input type="text" id="leg-abogado" placeholder="Nombre del abogado actor"></div>
            <div class="form-group"><label>Estudio jurídico (actor)</label><input type="text" id="leg-estudio" placeholder="Nombre del estudio"></div>
          </div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Nuestro abogado / representante</label><input type="text" id="leg-nuestro-abogado"></div>
            <div class="form-group"><label>Nuestro estudio jurídico</label><input type="text" id="leg-nuestro-estudio"></div>
          </div>

          <div class="form-section">Contexto</div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>¿Relación con otros casos?</label><input type="text" id="leg-relacion" placeholder="Ej: mismo abogado que caso N° 12, familiar de..."></div>
            <div class="form-group"><label>Tipo de cliente</label><input type="text" id="leg-tipo-cliente" placeholder="Ej: supermercado, club, hospital..."></div>
          </div>
          <div class="form-group"><label>Fecha próxima instancia (si se sabe)</label><input type="date" id="leg-proxima-instancia"></div>
          <div class="form-group"><label>Descripción del caso / motivo</label><textarea id="leg-descripcion" rows="3" placeholder="Describí brevemente el motivo y el contexto del caso..."></textarea></div>
          <div class="form-group"><label>Adjuntos (cartas documento, escritos)</label><input type="file" id="leg-adjuntos" multiple accept="application/pdf,image/jpeg,image/png"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-legal')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarNuevoCasoLegal()">Registrar caso legal</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function legajoPorMatch(texto) {
  const match = (texto || '').match(/\(N°(\d+)\)\s*$/);
  if (!match) return null;
  return (DB.legajos || []).find(l => String(l.nro) === match[1]) || null;
}

export function seleccionarAsociadoLegal() {
  const legajo = legajoPorMatch($('leg-asociado').value);
  if (!legajo) { $('leg-info-asociado').innerHTML = ''; return; }
  $('leg-info-asociado').innerHTML = `N° ${legajo.nro} — ${legajo.servicio || '—'} · Supervisor: ${legajo.supervisor || '—'}`;
  if (!$('leg-servicio').value) $('leg-servicio').value = legajo.servicio || '';
}

export function abrirNuevoCasoLegal() {
  ensureModalNuevoCaso();
  $('dl-asoc-leg').innerHTML = (DB.legajos || []).map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  fillDL('dl-serv-legal', window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : (DB.servicios || []));
  $('leg-estado').innerHTML = (DB.estadosLegales || []).filter(e => e !== 'Cerrado').map(e => `<option>${e}</option>`).join('');
  $('leg-asociado').value = '';
  $('leg-info-asociado').innerHTML = '';
  $('leg-estado').value = 'Pre-legal';
  $('leg-fecha').value = new Date().toISOString().slice(0, 10);
  $('leg-servicio').value = '';
  $('leg-tipo-reclamo').value = TIPOS_RECLAMO[0];
  $('leg-monto-reclamado').value = '';
  $('leg-abogado').value = '';
  $('leg-estudio').value = '';
  $('leg-nuestro-abogado').value = '';
  $('leg-nuestro-estudio').value = '';
  $('leg-relacion').value = '';
  $('leg-tipo-cliente').value = '';
  $('leg-proxima-instancia').value = '';
  $('leg-descripcion').value = '';
  $('leg-adjuntos').value = '';
  abrirModal('modal-legal');
}

export async function confirmarNuevoCasoLegal() {
  const asociado = ($('leg-asociado').value || '').trim();
  if (!asociado) { toast('⚠️ Seleccioná el asociado'); return; }
  const legajo = legajoPorMatch(asociado);
  const estado = $('leg-estado').value;
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const fechaInicioISO = $('leg-fecha').value || fechaHoy;

  const caso = await crearCaso({
    asociado, nroSocio: legajo ? String(legajo.nro) : '—', estado,
    abogado: $('leg-abogado').value.trim(), estudio: $('leg-estudio').value.trim(),
    abogadoCooperativa: $('leg-nuestro-abogado').value.trim(), estudioCooperativa: $('leg-nuestro-estudio').value.trim(),
    supervisorAlAlta: legajo?.supervisor || '', servicio: $('leg-servicio').value.trim(),
    fechaInicio: fechaInicioISO.split('-').reverse().join('/'),
    tipoReclamo: $('leg-tipo-reclamo').value, tipoCliente: $('leg-tipo-cliente').value.trim(),
    montoReclamado: parseFloat($('leg-monto-reclamado').value) || null,
    descripcion: $('leg-descripcion').value.trim(), relacionOtrosCasos: $('leg-relacion').value.trim(),
    fechaProximaInstancia: $('leg-proxima-instancia').value || null,
  });

  const archivos = Array.from($('leg-adjuntos')?.files || []);
  for (const file of archivos) {
    try { await subirAdjuntoLegal({ casoIdLocal: caso.id, file }); }
    catch (e) { toast('⚠️ No se pudo subir un adjunto: ' + e.message); }
  }

  cerrarModal('modal-legal');
  renderCasosActivos();
  toast('✅ Caso legal registrado');
}

// ========== MODAL — DETALLE (info + timeline + acciones) ==========

function ensureModalDetalleCaso() {
  if ($('modal-legal-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-legal-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3 id="ld-titulo">⚖️ Caso legal</h3><button class="btn-close" onclick="cerrarModal('modal-legal-detalle')">×</button></div>
      <div class="modal-body" id="ld-cuerpo"></div>
      <div class="modal-footer" id="ld-acciones">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-legal-detalle')">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleCasoLegal(casoIdLocal) {
  const c = getCasoById(casoIdLocal);
  if (!c) return;
  ensureModalDetalleCaso();
  $('ld-titulo').textContent = `⚖️ ${c.asociado}`;
  const novedades = novedadesDeCaso(c.id);
  const adjuntos = listarAdjuntosDeCaso(c.id);

  $('ld-cuerpo').innerHTML = `
    <div class="info-grid" style="margin-bottom:16px;">
      <div class="info-item"><div class="key">Estado</div><div class="val">${badge(c.estado)}</div></div>
      <div class="info-item"><div class="key">N° Socio</div><div class="val">${c.nroSocio}</div></div>
      <div class="info-item"><div class="key">Tipo de reclamo</div><div class="val">${c.tipoReclamo || '—'}</div></div>
      <div class="info-item"><div class="key">Monto reclamado</div><div class="val">${c.montoReclamado ? '$' + Number(c.montoReclamado).toLocaleString('es-AR') : '—'}</div></div>
      <div class="info-item"><div class="key">Abogado actor</div><div class="val">${c.abogado || '—'} ${c.estudio ? '(' + c.estudio + ')' : ''}</div></div>
      <div class="info-item"><div class="key">Nuestro abogado</div><div class="val">${c.abogadoCooperativa || '—'} ${c.estudioCooperativa ? '(' + c.estudioCooperativa + ')' : ''}</div></div>
      <div class="info-item"><div class="key">Supervisor actual</div><div class="val">${supervisorActual(c)}</div></div>
      <div class="info-item"><div class="key">Servicio</div><div class="val">${c.servicio || '—'}</div></div>
      <div class="info-item"><div class="key">Fecha inicio</div><div class="val">${c.fechaInicio}</div></div>
      <div class="info-item"><div class="key">Próxima instancia</div><div class="val">${c.fechaProximaInstancia || '—'}</div></div>
      <div class="info-item"><div class="key">Tipo de cliente</div><div class="val">${c.tipoCliente || '—'}</div></div>
      <div class="info-item"><div class="key">Relación con otros casos</div><div class="val">${c.relacionOtrosCasos || '—'}</div></div>
    </div>
    ${c.descripcion ? `<div class="form-section" style="margin-bottom:6px;">Descripción</div><p style="font-size:13px;margin:0 0 14px;">${c.descripcion}</p>` : ''}
    ${c.estado === 'Cerrado' ? `
      <div class="alerta alerta-info" style="margin-bottom:14px;">
        <strong>Cerrado — ${c.resultado || '—'}</strong> el ${c.fechaCierre || '—'} por ${c.cerradoPor || '—'}.
        ${c.montoFinal ? ` Monto final: $${Number(c.montoFinal).toLocaleString('es-AR')}.` : ''}
        ${c.observacionesCierre ? `<br>${c.observacionesCierre}` : ''}
      </div>` : ''}

    <div class="form-section" style="margin-bottom:10px;">📎 Documentos adjuntos</div>
    ${adjuntos.length === 0 ? '<p class="text-muted">Sin documentos adjuntos</p>' : adjuntos.map(a => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--fondo);border-radius:var(--radio);border:1px solid var(--borde);margin-bottom:5px;cursor:pointer;" onclick="abrirAdjuntoLegal('${a.id}')">
        📎 <span style="font-size:13px;">${a.nombreArchivo}</span>
      </div>`).join('')}
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin:6px 0 16px;" class="btn btn-ghost btn-sm">
      <input type="file" accept="application/pdf,image/jpeg,image/png" style="display:none;" onchange="subirAdjuntoDetalleLegal('${c.id}',this)">
      📎 Adjuntar documento
    </label>

    <div class="form-section" style="margin-bottom:10px;">🕐 Novedades</div>
    <div class="timeline">
      ${novedades.length === 0 ? '<p class="text-muted">Sin novedades registradas</p>' : novedades.map(n => `
        <div class="tl-item"><div class="tl-dot"></div><div class="tl-content">
          <h4>${n.tipoEvento} — ${n.fechaEvento}</h4>
          <p>${n.descripcion}</p>
          <p style="font-size:11px;color:var(--texto-muy-suave);">Cargado por ${n.cargadaPor}</p>
        </div></div>`).join('')}
    </div>
  `;

  $('ld-acciones').innerHTML = `
    ${c.estado !== 'Cerrado' ? `
      <button class="btn btn-secondary" onclick="abrirAgregarNovedad('${c.id}')">+ Agregar novedad</button>
      <button class="btn btn-primary" onclick="abrirCerrarCasoLegal('${c.id}')">🏁 Cerrar caso</button>
    ` : ''}
    <button class="btn btn-secondary" onclick="cerrarModal('modal-legal-detalle')">Cerrar</button>
  `;
  abrirModal('modal-legal-detalle');
}

export async function subirAdjuntoDetalleLegal(casoIdLocal, input) {
  if (!input.files.length) return;
  try {
    await subirAdjuntoLegal({ casoIdLocal, file: input.files[0] });
    toast('✅ Documento adjuntado');
    abrirDetalleCasoLegal(casoIdLocal);
    renderCasosActivos();
  } catch (e) {
    toast('⚠️ No se pudo subir el documento: ' + e.message);
  }
}

export async function abrirAdjuntoLegal(adjuntoId) {
  const a = (DB.casosLegalesAdjuntos || []).find(x => String(x.id) === String(adjuntoId));
  if (!a) return;
  const url = await obtenerUrlFirmadaLegal(a.url);
  if (url) window.open(url, '_blank');
  else toast('⚠️ No se pudo generar el link de descarga');
}

// ========== MODAL — AGREGAR NOVEDAD ==========

let _casoNovedadId = null;

function ensureModalNovedad() {
  if ($('modal-legal-novedad')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-legal-novedad';
  m.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header"><h3>+ Agregar novedad</h3><button class="btn-close" onclick="cerrarModal('modal-legal-novedad')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Fecha del evento *</label><input type="date" id="nov-fecha"></div>
        <div class="form-group"><label>Tipo *</label><select id="nov-tipo">${TIPOS_NOVEDAD.map(t => `<option>${t}</option>`).join('')}</select></div>
        <div class="form-group"><label>Descripción *</label><textarea id="nov-descripcion" rows="3"></textarea></div>
        <div class="form-group"><label>Adjuntos (opcional)</label><input type="file" id="nov-adjuntos" multiple accept="application/pdf,image/jpeg,image/png"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-legal-novedad')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarAgregarNovedad()">Guardar novedad</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirAgregarNovedad(casoIdLocal) {
  _casoNovedadId = casoIdLocal;
  ensureModalNovedad();
  $('nov-fecha').value = new Date().toISOString().slice(0, 10);
  $('nov-tipo').value = TIPOS_NOVEDAD[0];
  $('nov-descripcion').value = '';
  $('nov-adjuntos').value = '';
  abrirModal('modal-legal-novedad');
}

export async function confirmarAgregarNovedad() {
  const fechaEvento = $('nov-fecha').value;
  const tipoEvento = $('nov-tipo').value;
  const descripcion = ($('nov-descripcion').value || '').trim();
  if (!fechaEvento) { toast('⚠️ Ingresá la fecha del evento'); return; }
  if (!descripcion) { toast('⚠️ Ingresá la descripción'); return; }

  const archivos = Array.from($('nov-adjuntos')?.files || []);
  const adjuntosSubidos = [];
  for (const file of archivos) {
    try {
      const a = await subirAdjuntoLegal({ casoIdLocal: _casoNovedadId, file });
      adjuntosSubidos.push({ nombre: a.nombreArchivo, id: a.id });
    } catch (e) {
      toast('⚠️ No se pudo subir un adjunto: ' + e.message);
    }
  }

  await agregarNovedad({ casoIdLocal: _casoNovedadId, fechaEvento, tipoEvento, descripcion, adjuntosSubidos });
  cerrarModal('modal-legal-novedad');
  abrirDetalleCasoLegal(_casoNovedadId);
  renderCasosActivos();
  toast('✅ Novedad agregada');
}

// ========== MODAL — CERRAR CASO ==========

let _casoCierreId = null;
const RESULTADOS_CIERRE = ['Ganado', 'Perdido', 'Conciliado', 'Archivado sin resolución'];

function ensureModalCierre() {
  if ($('modal-legal-cierre')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-legal-cierre';
  m.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header"><h3>🏁 Cerrar caso</h3><button class="btn-close" onclick="cerrarModal('modal-legal-cierre')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Fecha de cierre *</label><input type="date" id="cierre-fecha"></div>
        <div class="form-group"><label>Resultado *</label>
          ${RESULTADOS_CIERRE.map(r => `<label style="display:block;font-weight:400;margin-bottom:4px;"><input type="radio" name="cierre-resultado" value="${r}"> ${r}</label>`).join('')}
        </div>
        <div class="form-group"><label>Monto final (si aplica)</label><input type="number" id="cierre-monto" min="0" step="0.01"></div>
        <div class="form-group"><label>Observaciones de cierre *</label><textarea id="cierre-obs" rows="3"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-legal-cierre')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarCerrarCasoLegal()">Cerrar caso</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCerrarCasoLegal(casoIdLocal) {
  _casoCierreId = casoIdLocal;
  ensureModalCierre();
  $('cierre-fecha').value = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('input[name="cierre-resultado"]').forEach(r => { r.checked = false; });
  $('cierre-monto').value = '';
  $('cierre-obs').value = '';
  abrirModal('modal-legal-cierre');
}

export async function confirmarCerrarCasoLegal() {
  const fechaCierre = $('cierre-fecha').value;
  const resultado = document.querySelector('input[name="cierre-resultado"]:checked')?.value;
  const observacionesCierre = ($('cierre-obs').value || '').trim();
  if (!fechaCierre) { toast('⚠️ Ingresá la fecha de cierre'); return; }
  if (!resultado) { toast('⚠️ Elegí el resultado'); return; }
  if (!observacionesCierre) { toast('⚠️ Las observaciones de cierre son obligatorias'); return; }
  if (!confirm(`¿Confirmás cerrar este caso como "${resultado}"? Pasa al histórico.`)) return;

  await cerrarCaso({
    casoIdLocal: _casoCierreId, fechaCierre, resultado,
    montoFinal: parseFloat($('cierre-monto').value) || null, observacionesCierre,
  });
  cerrarModal('modal-legal-cierre');
  cerrarModal('modal-legal-detalle');
  renderCasosActivos();
  toast('✅ Caso cerrado — pasó al histórico');
}

// Enfermos y Accidentes v1 — Tabs 1 y 2 (Enfermedades/Accidentes
// activos) + modal "Abrir nuevo caso" + modal detalle + modal cerrar
// caso. Reemplaza el ABM de legacy.js (modal con 13 campos donde
// guardarEnfermo solo persistía 4, mismo bug de llaves que Legal).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { abrirCaso, cerrarCaso, getCasoById, casoAbiertoDeLegajo } from './flujo.js';
import { esAdministrativo, congelarValorHora, getCategoriaById } from './categoria_helper.js';
import { puedeVerDiagnostico } from './permisos.js';
import { certificadosDeCaso, abrirCargarCertificado } from './certificados.js';
import { retirosDeCaso, abrirGestionarRetiro } from './retiros.js';
import { marcarArt42Convertido } from './puente_art42.js';

const SUBTIPOS_ENFERMEDAD = ['Enfermedad común', 'Enfermedad profesional'];
const SUBTIPOS_ACCIDENTE = ['Accidente laboral', 'Accidente in itinere', 'Accidente no laboral'];
const ESTADO_BADGE = {
  'Abierto': 'badge-rojo', 'Cerrado por alta médica': 'badge-verde',
  'Cerrado por decisión RRHH': 'badge-gris', 'Anulado': 'badge-gris',
};
const CERT_BADGE = { 'Pendiente': 'badge-acento', 'Aprobado': 'badge-verde', 'Observado': 'badge-naranja', 'Rechazado': 'badge-rojo' };

function diasTranscurridos(fechaInicio) {
  const d = Math.floor((Date.now() - new Date(fechaInicio + 'T00:00:00').getTime()) / 86400000);
  return d >= 0 ? d : 0;
}

function ultimoCertificadoBadge(casoId) {
  const certs = certificadosDeCaso(casoId);
  if (!certs.length) return '<span class="badge badge-gris">Sin certificado</span>';
  const c = certs[0];
  return `<span class="badge ${CERT_BADGE[c.estadoValidacion] || 'badge-gris'}">${c.estadoValidacion}</span>`;
}

function ultimaCargaMensual(casoId) {
  const retiros = retirosDeCaso(casoId);
  return retiros.length ? retiros[0].periodo : '—';
}

function filaCaso(c) {
  return `<tr>
    <td style="font-weight:500;">${c.nombreAsociado}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${c.nroSocio}</td>
    <td style="font-size:12px;">${c.tipoAsociado === 'Administrativo' ? (c.area || '—') : (c.servicio || '—')}</td>
    <td style="font-size:12px;">${c.supervisor || '—'}</td>
    <td style="font-size:12px;">${c.subtipo || '—'}</td>
    <td style="font-size:12px;">${c.fechaInicio}</td>
    <td style="text-align:center;">${diasTranscurridos(c.fechaInicio)}</td>
    <td style="text-align:center;">${ultimoCertificadoBadge(c.id)}</td>
    <td style="font-size:12px;">${c.fechaAltaPrevista || '—'}</td>
    <td style="font-size:12px;">${ultimaCargaMensual(c.id)}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="abrirDetalleCasoEnfermos('${c.id}')">👁 Ver</button></td>
  </tr>`;
}

function casosPorTipo(tipoCaso) {
  return (DB.casosEnfermosAccidentes || []).filter(c => !c.anulado && c.estado === 'Abierto' && c.tipoCaso === tipoCaso);
}

function aplicarFiltros(filas, prefijo) {
  const q = ($(prefijo + '-buscar') || {}).value?.toLowerCase() || '';
  const serv = ($(prefijo + '-servicio') || {}).value?.toLowerCase() || '';
  const sup = ($(prefijo + '-supervisor') || {}).value?.toLowerCase() || '';
  const subtipo = ($(prefijo + '-subtipo') || {}).value || '';
  if (q) filas = filas.filter(c => c.nombreAsociado.toLowerCase().includes(q));
  if (serv) filas = filas.filter(c => (c.servicio || c.area || '').toLowerCase().includes(serv));
  if (sup) filas = filas.filter(c => (c.supervisor || '').toLowerCase().includes(sup));
  if (subtipo) filas = filas.filter(c => c.subtipo === subtipo);
  return filas;
}

export function renderEnfermedades() {
  const tbody = $('tbody-enf-enfermedades');
  if (!tbody) return;
  const filas = aplicarFiltros(casosPorTipo('Enfermedad'), 'enf-enf');
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="11" style="text-align:center;padding:32px;opacity:.5;">Sin enfermedades activas</td></tr>'
    : filas.map(filaCaso).join('');
}
export function filtrarEnfermedades() { renderEnfermedades(); }

export function renderAccidentes() {
  const tbody = $('tbody-enf-accidentes');
  if (!tbody) return;
  const filas = aplicarFiltros(casosPorTipo('Accidente'), 'enf-acc');
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="11" style="text-align:center;padding:32px;opacity:.5;">Sin accidentes activos</td></tr>'
    : filas.map(filaCaso).join('');
}
export function filtrarAccidentes() { renderAccidentes(); }

// ========== MODAL — ABRIR NUEVO CASO ==========

let _art42IdPendiente = null;

function ensureModalNuevoCaso() {
  if ($('modal-enf-nuevo')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-enf-nuevo';
  m.innerHTML = `
    <div class="modal" style="max-width:820px;">
      <div class="modal-header"><h3>🏥 Abrir nuevo caso</h3><button class="btn-close" onclick="cerrarModal('modal-enf-nuevo')">×</button></div>
      <div class="modal-body">
        <div class="form-section">Asociado</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Asociado *</label><input type="text" id="nc-asociado" list="dl-asoc-enf" oninput="seleccionarAsociadoEnfermos()"><datalist id="dl-asoc-enf"></datalist></div>
          <div class="form-group" id="nc-grupo-categoria" style="display:none;"><label>Categoría base *</label><select id="nc-categoria" onchange="recalcularValorHoraModal()"></select></div>
        </div>
        <div id="nc-info-asociado" style="font-size:12.5px;color:var(--texto-suave);margin-bottom:8px;"></div>

        <div class="form-section">Datos del caso</div>
        <div class="form-group">
          <label><input type="radio" name="nc-tipo-caso" value="Enfermedad" checked onchange="cambiarTipoCasoModal()"> Enfermedad</label>
          <label style="margin-left:16px;"><input type="radio" name="nc-tipo-caso" value="Accidente" onchange="cambiarTipoCasoModal()"> Accidente</label>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Subtipo *</label><select id="nc-subtipo"></select></div>
          <div class="form-group"><label>Fecha de inicio *</label><input type="date" id="nc-fecha-inicio" onchange="recalcularValorHoraModal()"></div>
        </div>
        <div class="form-group"><label>Fecha alta prevista</label><input type="date" id="nc-fecha-alta-prevista"></div>
        <div class="form-group"><label>Descripción</label><textarea id="nc-descripcion" rows="2"></textarea></div>

        <div id="nc-seccion-enfermedad">
          <div class="form-section">Enfermedad</div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Diagnóstico (referencia)</label><input type="text" id="nc-enf-diagnostico"></div>
            <div class="form-group"><label>Especialidad</label><input type="text" id="nc-enf-especialidad"></div>
          </div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Médico tratante</label><input type="text" id="nc-enf-medico"></div>
            <div class="form-group"><label>Kinesiólogo</label><input type="text" id="nc-enf-kinesiologo"></div>
          </div>
          <div class="form-group"><label>Contacto del asociado</label><input type="text" id="nc-enf-contacto" placeholder="Teléfono"></div>
        </div>

        <div id="nc-seccion-accidente" style="display:none;">
          <div class="form-section">Accidente</div>
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Fecha y hora del accidente *</label><input type="datetime-local" id="nc-acc-fecha-hora"></div>
            <div class="form-group"><label>Lugar *</label><input type="text" id="nc-acc-lugar"></div>
          </div>
          <div class="form-group"><label>Testigos</label><textarea id="nc-acc-testigos" rows="2"></textarea></div>
          <div class="form-group"><label>Descripción del hecho *</label><textarea id="nc-acc-descripcion" rows="2"></textarea></div>
        </div>

        <div class="form-section">Valor hora</div>
        <div id="nc-valor-info" style="font-size:13px;background:var(--fondo);border-radius:var(--radio);padding:10px 14px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-enf-nuevo')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarNuevoCasoEnfermos()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function poblarSubtipos() {
  const tipo = document.querySelector('input[name="nc-tipo-caso"]:checked')?.value || 'Enfermedad';
  const opciones = tipo === 'Enfermedad' ? SUBTIPOS_ENFERMEDAD : SUBTIPOS_ACCIDENTE;
  $('nc-subtipo').innerHTML = opciones.map(o => `<option>${o}</option>`).join('');
}

export function cambiarTipoCasoModal() {
  const tipo = document.querySelector('input[name="nc-tipo-caso"]:checked')?.value || 'Enfermedad';
  $('nc-seccion-enfermedad').style.display = tipo === 'Enfermedad' ? 'block' : 'none';
  $('nc-seccion-accidente').style.display = tipo === 'Accidente' ? 'block' : 'none';
  poblarSubtipos();
}

function legajoPorMatch(texto) {
  const match = (texto || '').match(/\(N°(\d+)\)\s*$/);
  if (!match) return null;
  return (DB.legajos || []).find(l => String(l.nro) === match[1]) || null;
}

let _legajoSeleccionado = null;

export function seleccionarAsociadoEnfermos() {
  const legajo = legajoPorMatch($('nc-asociado').value);
  _legajoSeleccionado = legajo;
  if (!legajo) { $('nc-info-asociado').innerHTML = ''; $('nc-grupo-categoria').style.display = 'none'; return; }

  const admin = esAdministrativo(legajo);
  const casoAbierto = casoAbiertoDeLegajo(legajo.nro);
  $('nc-info-asociado').innerHTML = `
    N° ${legajo.nro} — ${admin ? 'Administrativo · ' + (legajo.sector || '—') : 'Operativo · ' + (legajo.servicio || '—')}
    ${!admin ? ' · Supervisor: ' + (legajo.supervisor || '—') : ''}
    ${casoAbierto ? '<br><span style="color:var(--rojo);font-weight:600;">⚠️ Ya tiene un caso abierto — cerralo antes de abrir uno nuevo.</span>' : ''}
  `;
  $('nc-grupo-categoria').style.display = admin ? 'none' : 'block';
  if (!admin) {
    const activas = (DB.categoriasBase || []).filter(c => !c.anulado && c.activa);
    $('nc-categoria').innerHTML = activas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    if (legajo.categoriaIdLocal) $('nc-categoria').value = legajo.categoriaIdLocal;
  }
  recalcularValorHoraModal();
}

export function recalcularValorHoraModal() {
  const legajo = _legajoSeleccionado;
  if (!legajo) { $('nc-valor-info').innerHTML = 'Elegí un asociado primero.'; return; }
  const admin = esAdministrativo(legajo);
  if (admin) {
    $('nc-valor-info').innerHTML = '⚠️ Cálculo pendiente — clarificar con Gabi (asociado administrativo).';
    return;
  }
  const categoriaIdLocal = $('nc-categoria').value;
  const fechaInicio = $('nc-fecha-inicio').value;
  if (!categoriaIdLocal || !fechaInicio) { $('nc-valor-info').innerHTML = 'Elegí categoría y fecha de inicio para ver el valor hora.'; return; }
  const congelado = congelarValorHora(legajo, categoriaIdLocal, fechaInicio);
  if (!congelado) {
    const cat = getCategoriaById(categoriaIdLocal);
    $('nc-valor-info').innerHTML = `❌ No hay valor hora vigente para "${cat?.nombre || ''}" en "${legajo.servicio}". Cargalo en el módulo Categorías antes de continuar.`;
    return;
  }
  $('nc-valor-info').innerHTML = `✅ Valor hora vigente: <strong>$${Number(congelado.valorHoraCongelado).toLocaleString('es-AR')}</strong> — se congela en el caso al guardar.`;
}

// prefill opcional: { legajoNro, fechaInicio, art42IdParaConvertir }
export function abrirNuevoCasoEnfermos(prefill) {
  ensureModalNuevoCaso();
  _legajoSeleccionado = null;
  _art42IdPendiente = prefill?.art42IdParaConvertir || null;
  $('dl-asoc-enf').innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo').map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  const legajoPrefill = prefill?.legajoNro ? (DB.legajos || []).find(l => String(l.nro) === String(prefill.legajoNro)) : null;
  $('nc-asociado').value = legajoPrefill ? `${legajoPrefill.nombre} (N°${legajoPrefill.nro})` : '';
  $('nc-info-asociado').innerHTML = '';
  $('nc-grupo-categoria').style.display = 'none';
  document.querySelector('input[name="nc-tipo-caso"][value="Enfermedad"]').checked = true;
  cambiarTipoCasoModal();
  $('nc-fecha-inicio').value = prefill?.fechaInicio
    ? new Date(prefill.fechaInicio.split('/').reverse().join('-')).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  $('nc-fecha-alta-prevista').value = '';
  $('nc-descripcion').value = '';
  ['nc-enf-diagnostico', 'nc-enf-especialidad', 'nc-enf-medico', 'nc-enf-kinesiologo', 'nc-enf-contacto',
    'nc-acc-lugar', 'nc-acc-testigos', 'nc-acc-descripcion',
  ].forEach(id => { $(id).value = ''; });
  $('nc-acc-fecha-hora').value = '';
  $('nc-valor-info').innerHTML = '';
  if (legajoPrefill) seleccionarAsociadoEnfermos();
  abrirModal('modal-enf-nuevo');
}

export async function confirmarNuevoCasoEnfermos() {
  const legajo = _legajoSeleccionado;
  if (!legajo) { toast('⚠️ Elegí el asociado'); return; }
  const tipoCaso = document.querySelector('input[name="nc-tipo-caso"]:checked')?.value;
  const subtipo = $('nc-subtipo').value;
  const fechaInicio = $('nc-fecha-inicio').value;
  if (!fechaInicio) { toast('⚠️ Ingresá la fecha de inicio'); return; }

  const hace30dias = new Date(); hace30dias.setDate(hace30dias.getDate() - 30);
  if (new Date(fechaInicio + 'T00:00:00') < hace30dias) {
    if (!confirm('⚠️ La fecha de inicio es de hace más de 30 días. ¿Confirmás cargarla igual?')) return;
  }

  let datosEnfermedad = null, datosAccidente = null;
  if (tipoCaso === 'Enfermedad') {
    datosEnfermedad = {
      diagnostico: $('nc-enf-diagnostico').value.trim(), especialidad: $('nc-enf-especialidad').value.trim(),
      medicoTratante: $('nc-enf-medico').value.trim(), kinesiologo: $('nc-enf-kinesiologo').value.trim(),
      contacto: $('nc-enf-contacto').value.trim(),
    };
  } else {
    if (!$('nc-acc-fecha-hora').value || !$('nc-acc-lugar').value.trim() || !$('nc-acc-descripcion').value.trim()) {
      toast('⚠️ Completá fecha/hora, lugar y descripción del accidente'); return;
    }
    datosAccidente = {
      fechaHora: $('nc-acc-fecha-hora').value, lugar: $('nc-acc-lugar').value.trim(),
      testigos: $('nc-acc-testigos').value.trim(), descripcionHecho: $('nc-acc-descripcion').value.trim(),
    };
  }

  const categoriaIdLocal = esAdministrativo(legajo) ? null : $('nc-categoria').value;
  const resultado = await abrirCaso({
    legajo, categoriaIdLocal, tipoCaso, subtipo, fechaInicio,
    fechaAltaPrevista: $('nc-fecha-alta-prevista').value || null,
    observaciones: $('nc-descripcion').value.trim(),
    datosEnfermedad, datosAccidente,
  });

  if (resultado.error) { toast('⚠️ ' + resultado.error); return; }

  if (_art42IdPendiente) { marcarArt42Convertido(_art42IdPendiente); _art42IdPendiente = null; }

  cerrarModal('modal-enf-nuevo');
  renderEnfermedades();
  renderAccidentes();
  toast('✅ Caso abierto');
}

// ========== MODAL — DETALLE ==========

function ensureModalDetalle() {
  if ($('modal-enf-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-enf-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-header"><h3 id="ed-titulo">🏥 Caso</h3><button class="btn-close" onclick="cerrarModal('modal-enf-detalle')">×</button></div>
      <div class="modal-body" id="ed-cuerpo"></div>
      <div class="modal-footer" id="ed-acciones"><button class="btn btn-secondary" onclick="cerrarModal('modal-enf-detalle')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleCasoEnfermos(casoIdLocal) {
  const c = getCasoById(casoIdLocal);
  if (!c) return;
  ensureModalDetalle();
  $('ed-titulo').textContent = `${c.tipoCaso === 'Enfermedad' ? '🏥' : '⚠️'} ${c.nombreAsociado}`;

  const certs = certificadosDeCaso(c.id);
  const retiros = retirosDeCaso(c.id);
  const verDiag = puedeVerDiagnostico();

  let seccionTipo = '';
  if (c.tipoCaso === 'Enfermedad' && c.datosEnfermedad) {
    const d = c.datosEnfermedad;
    seccionTipo = `
      <div class="form-section">Enfermedad</div>
      <div class="info-grid" style="margin-bottom:10px;">
        <div class="info-item"><div class="key">Diagnóstico</div><div class="val">${verDiag ? (d.diagnostico || '—') : 'Diagnóstico no disponible'}</div></div>
        <div class="info-item"><div class="key">Especialidad</div><div class="val">${d.especialidad || '—'}</div></div>
        <div class="info-item"><div class="key">Médico tratante</div><div class="val">${d.medicoTratante || '—'}</div></div>
        <div class="info-item"><div class="key">Kinesiólogo</div><div class="val">${d.kinesiologo || '—'}</div></div>
      </div>`;
  } else if (c.tipoCaso === 'Accidente' && c.datosAccidente) {
    const d = c.datosAccidente;
    seccionTipo = `
      <div class="form-section">Accidente</div>
      <div class="info-grid" style="margin-bottom:10px;">
        <div class="info-item"><div class="key">Fecha y hora</div><div class="val">${(d.fechaHora || '').replace('T', ' ')}</div></div>
        <div class="info-item"><div class="key">Lugar</div><div class="val">${d.lugar || '—'}</div></div>
      </div>
      <p style="font-size:13px;"><strong>Hecho:</strong> ${d.descripcionHecho || '—'}</p>
      ${d.testigos ? `<p style="font-size:13px;"><strong>Testigos:</strong> ${d.testigos}</p>` : ''}`;
  }

  $('ed-cuerpo').innerHTML = `
    <div class="info-grid" style="margin-bottom:14px;">
      <div class="info-item"><div class="key">Estado</div><div class="val"><span class="badge ${ESTADO_BADGE[c.estado] || 'badge-gris'}">${c.estado}</span></div></div>
      <div class="info-item"><div class="key">Tipo / Subtipo</div><div class="val">${c.tipoCaso} — ${c.subtipo || '—'}</div></div>
      <div class="info-item"><div class="key">Asociado</div><div class="val">N° ${c.nroSocio} — ${c.tipoAsociado}</div></div>
      <div class="info-item"><div class="key">${c.tipoAsociado === 'Administrativo' ? 'Área' : 'Servicio'}</div><div class="val">${c.tipoAsociado === 'Administrativo' ? (c.area || '—') : (c.servicio || '—')}</div></div>
      <div class="info-item"><div class="key">Fecha inicio</div><div class="val">${c.fechaInicio}</div></div>
      <div class="info-item"><div class="key">Alta prevista</div><div class="val">${c.fechaAltaPrevista || '—'}</div></div>
      <div class="info-item"><div class="key">Valor hora congelado</div><div class="val">${c.pendienteAdministrativo ? 'Pendiente (administrativo)' : (c.valorHoraCongelado ? '$' + Number(c.valorHoraCongelado).toLocaleString('es-AR') : '—')}</div></div>
    </div>
    ${c.observaciones ? `<p style="font-size:13px;"><strong>Observaciones:</strong> ${c.observaciones}</p>` : ''}
    ${seccionTipo}
    ${c.estado !== 'Abierto' ? `
      <div class="alerta alerta-info" style="margin:10px 0;">
        <strong>${c.estado}</strong> el ${(c.fechaCierre || '').slice(0, 10)} por ${c.cerradoPor || '—'}.
        ${c.observacionesCierre ? `<br>${c.observacionesCierre}` : ''}
      </div>` : ''}

    <div class="form-section" style="margin-bottom:8px;">📄 Certificados médicos</div>
    ${certs.length === 0 ? '<p class="text-muted">Sin certificados cargados</p>' : certs.map(cert => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--fondo);border-radius:var(--radio);border:1px solid var(--borde);margin-bottom:5px;cursor:pointer;" onclick="abrirVerCertificado('${cert.id}')">
        <span style="font-size:13px;">${cert.tipoCertificado} — ${cert.fechaEmision}</span>
        <span class="badge ${CERT_BADGE[cert.estadoValidacion] || 'badge-gris'}">${cert.estadoValidacion}</span>
      </div>`).join('')}
    <button class="btn btn-secondary btn-sm" style="margin:6px 0 16px;" onclick="abrirCargarCertificado('${c.id}')">+ Cargar certificado</button>

    <div class="form-section" style="margin-bottom:8px;">💰 Retiros mensuales</div>
    ${c.pendienteAdministrativo ? '<p class="text-muted">Cálculo pendiente — clarificar con Gabi</p>' : (retiros.length === 0 ? '<p class="text-muted">Sin retiros generados</p>' : retiros.map(r => `
      <div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--fondo);border-radius:var(--radio);border:1px solid var(--borde);margin-bottom:5px;">
        <span style="font-size:13px;">${r.periodo} — ${r.horasAjustadas}hs</span>
        <span style="font-weight:600;">$${Number(r.montoRetiro).toLocaleString('es-AR')}</span>
      </div>`).join(''))}
    ${!c.pendienteAdministrativo ? `<button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="abrirGestionarRetiro('${c.id}')">+ Gestionar retiro mensual</button>` : ''}
  `;

  $('ed-acciones').innerHTML = `
    ${c.estado === 'Abierto' ? `<button class="btn btn-primary" onclick="abrirCerrarCasoEnfermos('${c.id}')">🏁 Cerrar caso</button>` : ''}
    <button class="btn btn-secondary" onclick="cerrarModal('modal-enf-detalle')">Cerrar</button>
  `;
  abrirModal('modal-enf-detalle');
}

// ========== MODAL — CERRAR CASO ==========

let _casoCierreId = null;

function ensureModalCierre() {
  if ($('modal-enf-cierre')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-enf-cierre';
  m.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header"><h3>🏁 Cerrar caso</h3><button class="btn-close" onclick="cerrarModal('modal-enf-cierre')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Motivo de cierre *</label>
          <label style="display:block;font-weight:400;"><input type="radio" name="cierre-enf-motivo" value="Alta médica" checked onchange="cambiarMotivoCierreModal()"> Alta médica</label>
          <label style="display:block;font-weight:400;"><input type="radio" name="cierre-enf-motivo" value="Decisión RRHH" onchange="cambiarMotivoCierreModal()"> Decisión del Gerente de RRHH</label>
        </div>
        <div id="cierre-enf-aviso-alta" class="alerta alerta-warn" style="font-size:12px;"></div>
        <div class="form-group"><label>Fecha de alta efectiva *</label><input type="date" id="cierre-enf-fecha"></div>
        <div class="form-group"><label>Observaciones</label><textarea id="cierre-enf-obs" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-enf-cierre')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarCerrarCasoEnfermos()">Cerrar caso</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function cambiarMotivoCierreModal() {
  const motivo = document.querySelector('input[name="cierre-enf-motivo"]:checked')?.value;
  const c = getCasoById(_casoCierreId);
  const tieneAlta = c && certificadosDeCaso(c.id).some(cert => cert.tipoCertificado === 'Alta');
  $('cierre-enf-aviso-alta').style.display = (motivo === 'Alta médica' && !tieneAlta) ? 'block' : 'none';
  $('cierre-enf-aviso-alta').textContent = 'Todavía no cargaste un certificado de alta para este caso — cargalo desde "+ Cargar certificado" en el detalle (tipo Alta) antes de confirmar.';
}

export function abrirCerrarCasoEnfermos(casoIdLocal) {
  _casoCierreId = casoIdLocal;
  ensureModalCierre();
  document.querySelector('input[name="cierre-enf-motivo"][value="Alta médica"]').checked = true;
  $('cierre-enf-fecha').value = new Date().toISOString().slice(0, 10);
  $('cierre-enf-obs').value = '';
  cambiarMotivoCierreModal();
  abrirModal('modal-enf-cierre');
}

export async function confirmarCerrarCasoEnfermos() {
  const motivoCierre = document.querySelector('input[name="cierre-enf-motivo"]:checked')?.value;
  const fechaAltaEfectiva = $('cierre-enf-fecha').value;
  const observaciones = ($('cierre-enf-obs').value || '').trim();
  if (!fechaAltaEfectiva) { toast('⚠️ Ingresá la fecha de alta efectiva'); return; }
  if (motivoCierre === 'Decisión RRHH' && !observaciones) { toast('⚠️ Las observaciones son obligatorias en cierre por decisión de RRHH'); return; }

  const caso = getCasoById(_casoCierreId);
  if (motivoCierre === 'Alta médica') {
    const tieneAlta = caso && certificadosDeCaso(caso.id).some(cert => cert.tipoCertificado === 'Alta');
    if (!tieneAlta) { toast('⚠️ Cargá el certificado de alta antes de cerrar por esta vía'); return; }
  }

  const resultado = await cerrarCaso({ casoIdLocal: _casoCierreId, motivoCierre, fechaAltaEfectiva, observacionesCierre: observaciones });
  if (resultado.error) { toast('⚠️ ' + resultado.error); return; }

  cerrarModal('modal-enf-cierre');
  cerrarModal('modal-enf-detalle');
  renderEnfermedades();
  renderAccidentes();
  toast('✅ Caso cerrado — pasó al histórico');
}

// Enfermos y Accidentes v1 — certificados médicos con validación
// ley 17132. Mismo criterio que adjuntos_legal.js (Situaciones
// Legales): un certificado tiene una sola foto (relación 1:1), pero
// una persona puede tener varios certificados a lo largo del tiempo
// (varios casos, o reemplazo de uno Observado) — se sube directo a
// Storage sin pasar por subirAdjunto() de @shared/adjuntos.js (esa
// función invalida el adjunto vigente anterior del mismo (dni,tipo),
// lo que pisaría certificados de casos anteriores).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { SUPA, supaSync } from '@shared/supabase.js';
import { obtenerUrlFirmada, MAX_SIZE, TIPOS_PERMITIDOS } from '@shared/adjuntos.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { getCasoById, idLocalTrunc } from './flujo.js';

const TIPOS_DOCUMENTO = ['DNI', 'Pasaporte', 'CI', 'LC', 'LE'];
const ESTADO_CERT_BADGE = { 'Pendiente': 'badge-acento', 'Aprobado': 'badge-verde', 'Observado': 'badge-naranja', 'Rechazado': 'badge-rojo' };

const BUCKET = 'ohlimpia-adjuntos';
export { obtenerUrlFirmada as obtenerUrlFirmadaCertificado };

function ext(filename) {
  const i = (filename || '').lastIndexOf('.');
  if (i < 0 || i === filename.length - 1) return 'bin';
  return filename.slice(i + 1).toLowerCase();
}

export function certificadosDeCaso(casoIdLocal) {
  return (DB.certificadosMedicos || [])
    .filter(c => !c.anulado && String(c.casoIdLocal) === idLocalTrunc(casoIdLocal))
    .sort((a, b) => new Date(b.presentadoEn) - new Date(a.presentadoEn));
}

export function getCertificadoById(id) {
  return (DB.certificadosMedicos || []).find(c => String(c.id) === String(id));
}

export async function subirCertificado({
  casoIdLocal, tipoCertificado = 'Incapacidad',
  medicoApellidoNombre, medicoProfesion, medicoMatricula, medicoDomicilio, medicoTelefono, medicoEmail,
  pacienteDocumentoTipo, pacienteDocumentoNro,
  diagnosticoCie10, fechaEmision, duracionIncapacidadDias, fechaIncapacidadDesde, fechaIncapacidadHasta,
  observacionesMedicas, file, medioPresentacion,
}) {
  const caso = getCasoById(casoIdLocal);
  if (!caso) throw new Error('No se encontró el caso');
  if (!medicoApellidoNombre || !medicoProfesion || !medicoMatricula || !medicoDomicilio) {
    throw new Error('Faltan datos obligatorios del médico (ley 17132): nombre, profesión, matrícula y domicilio');
  }
  if (!pacienteDocumentoNro) throw new Error('Falta el documento del asistido');
  if (!diagnosticoCie10) throw new Error('Falta el diagnóstico');
  if (!fechaEmision || !fechaIncapacidadDesde || !fechaIncapacidadHasta) throw new Error('Faltan fechas obligatorias');
  if (!file) throw new Error('Falta la foto del certificado');
  if (file.size > MAX_SIZE) throw new Error(`El archivo (${(file.size / 1024 / 1024).toFixed(1)} MB) supera el límite de 10 MB`);
  if (!TIPOS_PERMITIDOS.includes(file.type)) throw new Error('Formato no permitido. Solo PDF, JPG o PNG');

  const e = ext(file.name);
  const path = `enfermos/${idLocalTrunc(casoIdLocal)}/${crypto.randomUUID()}.${e}`;
  const { error: upErr } = await SUPA.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(`Error al subir el archivo: ${upErr.message}`);

  const nuevo = {
    id: Date.now(),
    casoIdLocal: idLocalTrunc(casoIdLocal),
    legajoIdLocal: caso.legajoIdLocal,
    tipoCertificado,
    medicoApellidoNombre, medicoProfesion, medicoMatricula, medicoDomicilio,
    medicoTelefono: medicoTelefono || '', medicoEmail: medicoEmail || '',
    pacienteNombre: caso.nombreAsociado,
    pacienteDocumentoTipo: pacienteDocumentoTipo || 'DNI', pacienteDocumentoNro,
    diagnosticoCie10, fechaEmision,
    duracionIncapacidadDias: parseInt(duracionIncapacidadDias, 10) || 0,
    fechaIncapacidadDesde, fechaIncapacidadHasta,
    observacionesMedicas: observacionesMedicas || '',
    adjuntoUrl: path,
    estadoValidacion: 'Pendiente',
    presentadoEn: new Date().toISOString(),
    presentadoPor: currentUser?.nombre || '',
    medioPresentacion: medioPresentacion || 'Presencial',
  };
  if (!DB.certificadosMedicos) DB.certificadosMedicos = [];
  DB.certificadosMedicos.push(nuevo);
  await supaSync('certificadosMedicos', nuevo);

  await crearNotificacion({
    tipo: 'enfermos_certificado_presentado', entidadTipo: 'certificado_medico', entidadIdLocal: nuevo.id,
    destinatarioNombre: 'RRHH',
    mensaje: `📄 ${caso.nombreAsociado} presentó un certificado médico — pendiente de validar.`,
  });

  return nuevo;
}

export async function validarCertificado({ certificadoIdLocal, decision, observaciones }) {
  const cert = getCertificadoById(certificadoIdLocal);
  if (!cert) throw new Error('No se encontró el certificado');
  if (!['Aprobado', 'Observado', 'Rechazado'].includes(decision)) throw new Error('Decisión inválida');
  if (decision !== 'Aprobado' && !observaciones) throw new Error('Las observaciones son obligatorias para Observar o Rechazar');

  cert.estadoValidacion = decision;
  cert.validadoPor = currentUser?.nombre || '';
  cert.fechaValidacion = new Date().toISOString();
  cert.observacionesValidacion = observaciones || '';
  await supaSync('certificadosMedicos', cert);

  const caso = getCasoById(cert.casoIdLocal);
  if (decision === 'Observado') {
    await crearNotificacion({
      tipo: 'enfermos_certificado_observado', entidadTipo: 'certificado_medico', entidadIdLocal: cert.id,
      destinatarioNombre: caso?.supervisor || 'RRHH',
      mensaje: `⚠️ El certificado de ${cert.pacienteNombre} quedó Observado — tiene 24hs más para presentar uno corregido. Motivo: ${observaciones}`,
    });
  } else if (decision === 'Rechazado') {
    await crearNotificacion({
      tipo: 'enfermos_certificado_rechazado', entidadTipo: 'certificado_medico', entidadIdLocal: cert.id,
      destinatarioNombre: caso?.supervisor || 'RRHH',
      mensaje: `❌ El certificado de ${cert.pacienteNombre} fue rechazado — la ausencia puede quedar injustificada. Motivo: ${observaciones}`,
    });
  }
  return cert;
}

// Batch al abrir el módulo (mismo patrón que chequearDescargosVencidos
// de Sanciones): casos abiertos hace más de 24hs sin certificado
// Aprobado/Pendiente presentado → alerta a RRHH. Idempotente: chequea
// si ya existe una notificación de este tipo para el caso antes de
// crear otra.
export async function chequearPlazo24hs() {
  const ahora = Date.now();
  const casos = (DB.casosEnfermosAccidentes || []).filter(c => !c.anulado && c.estado === 'Abierto');
  for (const caso of casos) {
    const inicioMs = new Date(caso.fechaIngresoModulo || caso.fechaInicio).getTime();
    if (isNaN(inicioMs) || ahora - inicioMs < 24 * 3600 * 1000) continue;
    const tieneCertificadoValido = certificadosDeCaso(caso.id).some(c => ['Pendiente', 'Aprobado'].includes(c.estadoValidacion));
    if (tieneCertificadoValido) continue;
    const yaAlertado = (DB.notificacionesSistema || []).some(n =>
      n.tipo === 'enfermos_certificado_vencido' && String(n.entidadIdLocal) === String(caso.id)
    );
    if (yaAlertado) continue;
    await crearNotificacion({
      tipo: 'enfermos_certificado_vencido', entidadTipo: 'caso_enfermos', entidadIdLocal: caso.id,
      destinatarioNombre: 'RRHH',
      mensaje: `⏰ ${caso.nombreAsociado} lleva más de 24hs sin presentar certificado médico.`,
    });
  }
}

// ========== TAB 4 — CERTIFICADOS ==========

function filaCertificado(c) {
  return `<tr>
    <td style="font-weight:500;">${c.pacienteNombre}</td>
    <td style="font-size:12px;">${c.tipoCertificado}</td>
    <td style="font-size:12px;">${c.medicoApellidoNombre}</td>
    <td style="font-size:12px;">${c.medicoMatricula}</td>
    <td style="font-size:12px;">${c.fechaEmision}</td>
    <td style="text-align:center;">${c.duracionIncapacidadDias}d</td>
    <td><span class="badge ${ESTADO_CERT_BADGE[c.estadoValidacion] || 'badge-gris'}">${c.estadoValidacion}</span></td>
    <td style="font-size:12px;">${c.validadoPor || '—'}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="abrirVerCertificado('${c.id}')">👁 Ver</button></td>
  </tr>`;
}

export function renderCertificados() {
  let filas = (DB.certificadosMedicos || []).filter(c => !c.anulado);

  const q = ($('cert-buscar') || {}).value?.toLowerCase() || '';
  const fEstado = ($('cert-filtro-estado') || {}).value || '';
  if (q) filas = filas.filter(c => c.pacienteNombre.toLowerCase().includes(q));
  if (fEstado) filas = filas.filter(c => c.estadoValidacion === fEstado);
  filas.sort((a, b) => new Date(b.presentadoEn) - new Date(a.presentadoEn));

  const tbody = $('tbody-enf-certificados');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:32px;opacity:.5;">Sin certificados cargados</td></tr>'
    : filas.map(filaCertificado).join('');
}

export function filtrarCertificados() { renderCertificados(); }

// ========== MODAL — CARGAR CERTIFICADO ==========

let _casoCertificadoId = null;

function ensureModalCertificado() {
  if ($('modal-enf-certificado')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-enf-certificado';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3>📄 Cargar certificado médico</h3><button class="btn-close" onclick="cerrarModal('modal-enf-certificado')">×</button></div>
      <div class="modal-body">
        <div class="form-section">Datos del médico (obligatorios — ley 17132)</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Apellido y nombre *</label><input type="text" id="cert-medico-nombre"></div>
          <div class="form-group"><label>Profesión *</label><input type="text" id="cert-medico-profesion" placeholder="Médico clínico, traumatólogo..."></div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Matrícula *</label><input type="text" id="cert-medico-matricula"></div>
          <div class="form-group"><label>Domicilio *</label><input type="text" id="cert-medico-domicilio"></div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Teléfono</label><input type="text" id="cert-medico-telefono"></div>
          <div class="form-group"><label>Email</label><input type="text" id="cert-medico-email"></div>
        </div>

        <div class="form-section">Datos del asistido</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Tipo de documento *</label><select id="cert-doc-tipo">${TIPOS_DOCUMENTO.map(t => `<option>${t}</option>`).join('')}</select></div>
          <div class="form-group"><label>N° de documento *</label><input type="text" id="cert-doc-nro"></div>
        </div>

        <div class="form-section">Contenido médico</div>
        <div class="form-group"><label>Diagnóstico (CIE-10) *</label><input type="text" id="cert-diagnostico" placeholder="Código y/o descripción"></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Fecha de emisión *</label><input type="date" id="cert-fecha-emision"></div>
          <div class="form-group"><label>Duración incapacidad (días) *</label><input type="number" id="cert-duracion" min="0"></div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Incapacidad desde *</label><input type="date" id="cert-desde"></div>
          <div class="form-group"><label>Incapacidad hasta *</label><input type="date" id="cert-hasta"></div>
        </div>
        <div class="form-group"><label>Observaciones médicas</label><textarea id="cert-obs-medicas" rows="2"></textarea></div>
        <div class="form-group"><label>Medio de presentación</label>
          <select id="cert-medio"><option>Presencial</option><option>WhatsApp</option><option>Email</option></select>
        </div>
        <div class="form-group"><label>Foto del certificado *</label><input type="file" id="cert-adjunto" accept="application/pdf,image/jpeg,image/png"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-enf-certificado')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarSubirCertificado()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCargarCertificado(casoIdLocal) {
  _casoCertificadoId = casoIdLocal;
  ensureModalCertificado();
  ['cert-medico-nombre', 'cert-medico-profesion', 'cert-medico-matricula', 'cert-medico-domicilio',
    'cert-medico-telefono', 'cert-medico-email', 'cert-doc-nro', 'cert-diagnostico', 'cert-obs-medicas',
  ].forEach(id => { $(id).value = ''; });
  $('cert-doc-tipo').value = 'DNI';
  $('cert-fecha-emision').value = new Date().toISOString().slice(0, 10);
  $('cert-duracion').value = '';
  $('cert-desde').value = '';
  $('cert-hasta').value = '';
  $('cert-medio').value = 'Presencial';
  $('cert-adjunto').value = '';
  abrirModal('modal-enf-certificado');
}

export async function confirmarSubirCertificado() {
  try {
    await subirCertificado({
      casoIdLocal: _casoCertificadoId,
      medicoApellidoNombre: $('cert-medico-nombre').value.trim(),
      medicoProfesion: $('cert-medico-profesion').value.trim(),
      medicoMatricula: $('cert-medico-matricula').value.trim(),
      medicoDomicilio: $('cert-medico-domicilio').value.trim(),
      medicoTelefono: $('cert-medico-telefono').value.trim(),
      medicoEmail: $('cert-medico-email').value.trim(),
      pacienteDocumentoTipo: $('cert-doc-tipo').value,
      pacienteDocumentoNro: $('cert-doc-nro').value.trim(),
      diagnosticoCie10: $('cert-diagnostico').value.trim(),
      fechaEmision: $('cert-fecha-emision').value,
      duracionIncapacidadDias: $('cert-duracion').value,
      fechaIncapacidadDesde: $('cert-desde').value,
      fechaIncapacidadHasta: $('cert-hasta').value,
      observacionesMedicas: $('cert-obs-medicas').value.trim(),
      medioPresentacion: $('cert-medio').value,
      file: $('cert-adjunto').files[0],
    });
    cerrarModal('modal-enf-certificado');
    renderCertificados();
    window.abrirDetalleCasoEnfermos && window.abrirDetalleCasoEnfermos(_casoCertificadoId);
    toast('✅ Certificado cargado — pendiente de validación');
  } catch (e) {
    toast('⚠️ ' + e.message);
  }
}

// ========== MODAL — VER / VALIDAR CERTIFICADO ==========

let _certificadoValidandoId = null;

function ensureModalVerCertificado() {
  if ($('modal-enf-ver-certificado')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-enf-ver-certificado';
  m.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header"><h3>📄 Certificado médico</h3><button class="btn-close" onclick="cerrarModal('modal-enf-ver-certificado')">×</button></div>
      <div class="modal-body" id="vc-cuerpo"></div>
      <div class="modal-footer" id="vc-acciones">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-enf-ver-certificado')">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export async function abrirVerCertificado(certificadoIdLocal) {
  const c = getCertificadoById(certificadoIdLocal);
  if (!c) return;
  _certificadoValidandoId = certificadoIdLocal;
  ensureModalVerCertificado();
  const url = await obtenerUrlFirmada(c.adjuntoUrl);
  $('vc-cuerpo').innerHTML = `
    <div class="info-grid" style="margin-bottom:14px;">
      <div class="info-item"><div class="key">Paciente</div><div class="val">${c.pacienteNombre} — ${c.pacienteDocumentoTipo} ${c.pacienteDocumentoNro}</div></div>
      <div class="info-item"><div class="key">Tipo</div><div class="val">${c.tipoCertificado}</div></div>
      <div class="info-item"><div class="key">Médico</div><div class="val">${c.medicoApellidoNombre} — ${c.medicoProfesion} (Mat. ${c.medicoMatricula})</div></div>
      <div class="info-item"><div class="key">Domicilio médico</div><div class="val">${c.medicoDomicilio}</div></div>
      <div class="info-item"><div class="key">Diagnóstico (CIE-10)</div><div class="val">${c.diagnosticoCie10}</div></div>
      <div class="info-item"><div class="key">Emisión</div><div class="val">${c.fechaEmision}</div></div>
      <div class="info-item"><div class="key">Incapacidad</div><div class="val">${c.fechaIncapacidadDesde} al ${c.fechaIncapacidadHasta} (${c.duracionIncapacidadDias} días)</div></div>
      <div class="info-item"><div class="key">Estado</div><div class="val"><span class="badge ${ESTADO_CERT_BADGE[c.estadoValidacion] || 'badge-gris'}">${c.estadoValidacion}</span></div></div>
    </div>
    ${c.observacionesMedicas ? `<p style="font-size:13px;"><strong>Obs. médicas:</strong> ${c.observacionesMedicas}</p>` : ''}
    ${c.observacionesValidacion ? `<p style="font-size:13px;"><strong>Obs. de validación:</strong> ${c.observacionesValidacion} (${c.validadoPor})</p>` : ''}
    ${url ? `<a href="${url}" target="_blank" class="btn btn-secondary btn-sm">📎 Ver foto del certificado</a>` : '<p class="text-muted">No se pudo generar el link del adjunto</p>'}
    ${c.estadoValidacion === 'Pendiente' ? `
      <div class="form-section" style="margin-top:14px;">Validar</div>
      <div class="form-group"><label>Observaciones (obligatorio si Observa o Rechaza)</label><textarea id="vc-obs" rows="2"></textarea></div>
    ` : ''}
  `;
  $('vc-acciones').innerHTML = c.estadoValidacion === 'Pendiente' ? `
    <button class="btn btn-secondary" onclick="cerrarModal('modal-enf-ver-certificado')">Cerrar</button>
    <button class="btn" style="background:#fef3c7;color:#92400e;" onclick="validarCertificadoPorId('Observado')">⚠️ Observar</button>
    <button class="btn" style="background:#fee2e2;color:#991b1b;" onclick="validarCertificadoPorId('Rechazado')">❌ Rechazar</button>
    <button class="btn btn-primary" onclick="validarCertificadoPorId('Aprobado')">✅ Aprobar</button>
  ` : '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-enf-ver-certificado\')">Cerrar</button>';
  abrirModal('modal-enf-ver-certificado');
}

export async function validarCertificadoPorId(decision) {
  const observaciones = ($('vc-obs')?.value || '').trim();
  try {
    await validarCertificado({ certificadoIdLocal: _certificadoValidandoId, decision, observaciones });
    cerrarModal('modal-enf-ver-certificado');
    renderCertificados();
    toast(decision === 'Aprobado' ? '✅ Certificado aprobado' : decision === 'Observado' ? '⚠️ Certificado observado' : '❌ Certificado rechazado');
  } catch (e) {
    toast('⚠️ ' + e.message);
  }
}

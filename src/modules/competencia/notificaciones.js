// Competencia Anual v2 — notificaciones reales del Tab "No participan"
// (reemplazan los toast() placeholder de la versión anterior por
// persistencia real: notificaciones_no_participan + la campana del
// sistema vía crearNotificacion()).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { esAdministrativo } from './movimientos.js';
import { calcularNoParticipantes, riesgoAltoDelAnio, renderTablaNoParticipan } from './no_participan.js';

function ensureModalNotificar() {
  if ($('modal-comp-notificar')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-notificar';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="cn-titulo">Notificar</h3><button class="btn-close" onclick="cerrarModal('modal-comp-notificar')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Mensaje</label><textarea id="cn-mensaje" rows="3"></textarea></div>
        <div id="cn-destinatarios" style="font-size:12px;color:var(--texto-suave);"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-comp-notificar')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarNotificacionPendiente()">📱 Enviar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

// { destinatarioTipo, operarios: [{ idLocal, nombre, nivelRiesgo }], destinatarios: [{ idLocal, nombre }] }
let _pendiente = null;

export function abrirNotificarAsociado(nroSocio) {
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(nroSocio));
  if (!legajo) { toast('⚠️ No se encontró el legajo'); return; }
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const dato = calcularNoParticipantes(anio).find(d => String(d.nro) === String(legajo.nro));
  _pendiente = {
    destinatarioTipo: 'Asociado',
    operarios: [{ idLocal: String(legajo.nro), nivelRiesgo: dato?.nivel || 'Medio' }],
    destinatarios: [{ idLocal: String(legajo.nro), nombre: legajo.nombre }],
  };
  ensureModalNotificar();
  $('cn-titulo').textContent = `Notificar a ${legajo.nombre}`;
  $('cn-mensaje').value = '¡Todavía podés sumar puntos! Respondé las evaluaciones pendientes y sumate a las capacitaciones del año.';
  $('cn-destinatarios').textContent = '';
  abrirModal('modal-comp-notificar');
}

export function abrirNotificarEquipoServicio(servicio, nroSocioAusente) {
  const compas = (DB.legajos || []).filter(l => l.estado === 'Activo' && !esAdministrativo(l) && l.servicio === servicio && String(l.nro) !== String(nroSocioAusente));
  if (!compas.length) { toast('⚠️ No hay compañeros en ese servicio para avisar'); return; }
  const ausente = (DB.legajos || []).find(l => String(l.nro) === String(nroSocioAusente));
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const dato = calcularNoParticipantes(anio).find(d => String(d.nro) === String(nroSocioAusente));
  _pendiente = {
    destinatarioTipo: 'CompanerosServicio',
    operarios: [{ idLocal: String(nroSocioAusente), nivelRiesgo: dato?.nivel || 'Medio' }],
    destinatarios: compas.map(c => ({ idLocal: String(c.nro), nombre: c.nombre })),
  };
  ensureModalNotificar();
  $('cn-titulo').textContent = `Notificar al equipo de ${servicio}`;
  $('cn-mensaje').value = `${ausente ? ausente.nombre : 'Tu compañero/a'} todavía no respondió las evaluaciones de este año — dale una mano para que no se quede afuera del torneo.`;
  $('cn-destinatarios').textContent = `Se notifica a ${compas.length} compañero(s) del servicio.`;
  abrirModal('modal-comp-notificar');
}

export function abrirNotificarGrupoSupervisor(nombreSupervisor) {
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const suGente = calcularNoParticipantes(anio).filter(d => d.supervisor === nombreSupervisor && (d.nivel === 'Alto' || d.nivel === 'Muy alto' || d.nivel === 'Medio'));
  if (!suGente.length) { toast('⚠️ No hay gente de ese supervisor con baja participación'); return; }
  const supervisorLegajo = (DB.legajos || []).find(l => l.estado === 'Activo' && l.nombre === nombreSupervisor);
  _pendiente = {
    destinatarioTipo: 'Supervisor',
    operarios: suGente.map(d => ({ idLocal: String(d.nro), nivelRiesgo: d.nivel })),
    destinatarios: [{ idLocal: supervisorLegajo ? String(supervisorLegajo.nro) : null, nombre: nombreSupervisor }],
  };
  ensureModalNotificar();
  $('cn-titulo').textContent = `Notificar a ${nombreSupervisor}`;
  $('cn-mensaje').value = `Tenés ${suGente.length} asociado(s) con baja participación en la Competencia Anual: ${suGente.map(d => d.nombre).join(', ')}.`;
  $('cn-destinatarios').textContent = '';
  abrirModal('modal-comp-notificar');
}

export function abrirNotificarMasivoRiesgoAlto() {
  const riesgo = riesgoAltoDelAnio();
  if (!riesgo.length) { toast('🎉 No hay nadie en riesgo Alto o Muy alto'); return; }
  _pendiente = {
    destinatarioTipo: 'Asociado',
    operarios: riesgo.map(d => ({ idLocal: String(d.nro), nivelRiesgo: d.nivel })),
    destinatarios: riesgo.map(d => ({ idLocal: String(d.nro), nombre: d.nombre })),
  };
  ensureModalNotificar();
  $('cn-titulo').textContent = `Notificar a ${riesgo.length} asociado(s) en riesgo`;
  $('cn-mensaje').value = '¡Todavía podés sumar puntos! Respondé las evaluaciones pendientes y sumate a las capacitaciones del año.';
  $('cn-destinatarios').textContent = `Se notifica individualmente a cada uno de los ${riesgo.length} asociados.`;
  abrirModal('modal-comp-notificar');
}

export async function confirmarNotificacionPendiente() {
  if (!_pendiente) return;
  const mensaje = ($('cn-mensaje').value || '').trim();
  if (!mensaje) { toast('⚠️ Escribí el mensaje'); return; }
  const anio = Number(($('comp-anio') || { value: String(new Date().getFullYear()) }).value);

  if (!DB.notificacionesNoParticipan) DB.notificacionesNoParticipan = [];

  // Un registro de auditoría por cada operario "protagonista" al que
  // se refiere el aviso (aunque el destinatario real sea el mismo, el
  // equipo, o el supervisor) — mismo criterio que usa el chequeo
  // automático de no_participan.js.
  for (const op of _pendiente.operarios) {
    const registro = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      operarioIdLocal: op.idLocal, nivelRiesgo: op.nivelRiesgo || 'Medio',
      destinatarioTipo: _pendiente.destinatarioTipo,
      destinatarioIdLocal: _pendiente.destinatarios.length === 1 ? _pendiente.destinatarios[0].idLocal : null,
      canal: 'Sistema', origen: 'Manual', mensaje,
      enviadoPor: currentUser?.nombre || '', anioCompetencia: anio,
    };
    DB.notificacionesNoParticipan.push(registro);
    await supaSync('notificacionesNoParticipan', registro);
  }

  for (const dest of _pendiente.destinatarios) {
    if (!dest.nombre) continue;
    await crearNotificacion({ tipo: 'competencia_no_participa', entidadTipo: 'competencia', entidadIdLocal: dest.idLocal || dest.nombre, destinatarioNombre: dest.nombre, mensaje });
  }

  cerrarModal('modal-comp-notificar');
  toast(`✅ Notificado a ${_pendiente.destinatarios.length} persona(s)`);
  _pendiente = null;
  renderTablaNoParticipan();
}

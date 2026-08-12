import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, supaDel, getLastSupaSyncError } from '@shared/supabase.js';
import { idLocalCand } from './candidatos.js';

// ========== CONFIGURACION ==========

const configAgente = {
  diasHabilitados: [1, 2, 3, 4, 5],
  horaDesde: '09:00',
  horaHasta: '17:00',
  duracion: 20,
  maxPorTurno: 2,
};

// ========== ESTADO ==========

let semanaOffset = 0;

// Turno en edición en el modal (agendar nuevo = { id: null } | ver/editar
// existente = { id }).
let _turnoModal = null;

// ========== HELPERS ==========

function getLunesDeSemana(offset) {
  const hoy = new Date();
  const dia = hoy.getDay();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1) + offset * 7);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function getTurnos() {
  return DB.turnos || [];
}

// Responsables de entrevistas (RRHH + admins) — mismo criterio que usaba
// el filtro global `cal-responsable`, extraído a un helper para poder
// alimentar también el select propio del modal (el modal no depende del
// filtro: en creación toma el valor del filtro como default, pero después
// cada turno guarda SU responsable).
function getResponsables() {
  return [
    ...DB.usuarios.filter(function (u) { return ['RRHH', 'Administrador total'].includes(u.perfil); }).map(function (u) { return u.nickname || u.nombre.split(' ')[0]; }),
    ...DB.rrhh.filter(function (n) { return !DB.usuarios.find(function (u) { return (u.nickname || u.nombre.split(' ')[0]) === n; }); }),
  ];
}

// Franjas horarias de la grilla según la config del agente.
function getFranjas() {
  const franjas = [];
  const [hD, mD] = configAgente.horaDesde.split(':').map(Number);
  const [hH, mH] = configAgente.horaHasta.split(':').map(Number);
  let cur = hD * 60 + mD;
  const fin = hH * 60 + mH;
  while (cur < fin) {
    const h = Math.floor(cur / 60).toString().padStart(2, '0');
    const m = (cur % 60).toString().padStart(2, '0');
    franjas.push(h + ':' + m);
    cur += configAgente.duracion;
  }
  return franjas;
}

// Puebla el select de hora del modal con las franjas de la grilla. Si la
// hora actual del turno ya no es una franja (porque cambió la config de
// duración/horario), se agrega igual para no dejar el turno "flotando".
function poblarSelectHoraTurno(horaActual) {
  const sel = $('cal-turno-hora');
  if (!sel) return;
  const franjas = getFranjas();
  if (horaActual && !franjas.includes(horaActual)) franjas.push(horaActual);
  franjas.sort();
  sel.innerHTML = franjas.map(function (h) { return '<option value="' + h + '">' + h + '</option>'; }).join('');
}

function poblarSelectResponsableTurno() {
  const sel = $('cal-turno-responsable');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin asignar —</option>'
    + getResponsables().map(function (n) { return '<option>' + n + '</option>'; }).join('');
}

// Candidatos disponibles para vincular al turno. Se excluyen los que ya
// salieron del circuito de entrevistas (rechazados o de baja) para no
// llenar el select de gente que ya no se va a entrevistar.
function poblarSelectCandidatoTurno() {
  const sel = $('cal-turno-candidato');
  if (!sel) return;
  const estadosMuertos = ['Rechazado', 'Baja', 'Caducado', 'MT Social', 'MT con deuda'];
  const candidatos = (DB.candidatos || [])
    .filter(function (c) { return !estadosMuertos.includes(c.estado); })
    .sort(function (a, b) { return (a.apellido || a.nombre || '').localeCompare(b.apellido || b.nombre || '', 'es'); });
  sel.innerHTML = '<option value="">— Sin vínculo —</option>'
    + candidatos.map(function (c) {
      return '<option value="' + idLocalCand(c.id) + '">' + (c.apellido ? c.apellido + ', ' : '') + (c.nombre || '') + (c.dni ? ' — ' + c.dni : '') + '</option>';
    }).join('');
}

// Traduce el último error real de Supabase (guardado por supaSync) a un
// mensaje específico cuando se puede identificar la causa — mismo patrón
// que mensajeErrorGuardado() en candidatos.js, con mensajes propios de
// turnos.
function errorGuardarTurno(generico) {
  const err = getLastSupaSyncError();
  if (!err) return generico;
  const msg = (err.message || '').toLowerCase();
  if (err.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return '⚠️ Tu sesión no tiene permiso para guardar ahora — cerrá sesión, volvé a entrar, y si sigue avisá a sistemas.';
  }
  if (err.code === '23505' || msg.includes('duplicate key')) {
    return '⚠️ No se pudo guardar: ya existe un turno con esos datos en el servidor — recargá y revisá antes de reintentar.';
  }
  return generico;
}

// ========== NAVEGACION ==========

export function cambiarSemana(dir) { semanaOffset += dir; renderCalendario(); }
export function irHoy() { semanaOffset = 0; renderCalendario(); }

// ========== CONFIG ==========

export function actualizarConfigAgente() {
  var dias = [];
  var checks = document.querySelectorAll('#dias-habilitados input[type="checkbox"]');
  checks.forEach(function (cb) { if (cb.checked) dias.push(parseInt(cb.value)); });
  configAgente.diasHabilitados = dias.length ? dias : [1, 2, 3, 4, 5];
  configAgente.horaDesde = ($('hora-desde') || { value: '09:00' }).value;
  configAgente.horaHasta = ($('hora-hasta') || { value: '17:00' }).value;
  configAgente.duracion = parseInt(($('duracion-turno') || { value: '20' }).value) || 20;
  configAgente.maxPorTurno = parseInt(($('max-por-turno') || { value: '2' }).value) || 2;
  renderCalendario();
}

export function poblarSelectResponsable() {
  var sel = $('cal-responsable');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Todos —</option>' + getResponsables().map(function (n) { return '<option>' + n + '</option>'; }).join('');
}

// ========== RENDER ==========

export function renderCalendario() {
  const lunes = getLunesDeSemana(semanaOffset);
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(d);
  }

  const opts = { day: 'numeric', month: 'short' };
  const lbl = $('semana-label');
  if (lbl) lbl.textContent = dias[0].toLocaleDateString('es-AR', opts) + ' — ' + dias[6].toLocaleDateString('es-AR', opts) + ' ' + dias[0].getFullYear();

  // Generar franjas horarias
  const franjas = getFranjas();

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const allTurnos = getTurnos();
  const dur = configAgente.duracion;

  // Calcula en qué franja cae una hora arbitraria
  function horaAFranja(h) {
    var p = h.split(':').map(Number);
    var m = p[0] * 60 + (p[1] || 0);
    var f = Math.floor(m / dur) * dur;
    return String(Math.floor(f / 60)).padStart(2, '0') + ':' + String(f % 60).padStart(2, '0');
  }

  // Header
  let html = '<div class="cal-header" style="grid-template-columns:60px repeat(7,1fr);">'
    + '<div class="cal-header-cell"></div>';
  dias.forEach(function (d) {
    const esHoy = d.getTime() === hoy.getTime();
    html += '<div class="cal-header-cell' + (esHoy ? ' hoy' : '') + '">'
      + diasNombres[d.getDay()] + '<br>'
      + '<span style="font-size:14px;font-weight:700;color:' + (esHoy ? 'var(--azul)' : 'var(--texto)') + ';">' + d.getDate() + '</span>'
      + '</div>';
  });
  html += '</div>';

  // Filas por franja
  franjas.forEach(function (hora) {
    html += '<div class="cal-row" style="grid-template-columns:60px repeat(7,1fr);">'
      + '<div class="cal-time">' + hora + '</div>';
    dias.forEach(function (d) {
      const diaSemana = d.getDay();
      const habilitado = configAgente.diasHabilitados.includes(diaSemana);
      const esHoy = d.getTime() === hoy.getTime();
      const fechaStr = d.toISOString().split('T')[0];
      const turnos = allTurnos.filter(function (t) {
        return t.fecha === fechaStr && horaAFranja(t.hora) === hora && t.estado !== 'Cancelado';
      });
      const lleno = turnos.length >= configAgente.maxPorTurno;

      if (!habilitado) {
        html += '<div class="cal-cell bloqueado" title="Día no habilitado"></div>';
      } else {
        html += '<div class="cal-cell' + (esHoy ? ' hoy' : '') + '" data-action="agendar" data-fecha="' + fechaStr + '" data-hora="' + hora + '" style="cursor:pointer;">';
        turnos.forEach(function (t) {
          // Confirmado = rojo (ocupado), Pendiente (u otro estado vivo) = azul.
          // El slot realmente libre (sin turno) usa "libre" (verde), más abajo.
          var cls = t.estado === 'Confirmado' ? 'completo' : 'ocupado';
          html += '<div class="cal-slot ' + cls + '" title="' + t.nombre + ' — ' + t.estado + '" data-action="ver-turno" data-turno-id="' + t.id + '">' + (t.nombre || '').split(' ')[0] + '</div>';
        });
        if (!lleno) {
          html += '<div class="cal-slot libre" style="opacity:.5;border:1px dashed var(--verde);">+ Libre</div>';
        }
        html += '</div>';
      }
    });
    html += '</div>';
  });

  var cal = $('calendario-entrevistas');
  if (cal) {
    cal.innerHTML = '<div class="cal-grid" style="display:block;">' + html + '</div>';
    cal.onclick = function (e) {
      var turnoEl = e.target.closest('[data-action="ver-turno"]');
      if (turnoEl) {
        verTurno(turnoEl.dataset.turnoId);
        return;
      }
      var celda = e.target.closest('[data-action="agendar"]');
      if (celda) agendarTurno(celda.dataset.fecha, celda.dataset.hora);
    };
  }

  // Resumen semanal
  var res = $('resumen-semanal');
  if (res) {
    var semTurnos = allTurnos.filter(function (t) {
      var d = new Date(t.fecha);
      return d >= dias[0] && d <= dias[6] && t.estado !== 'Cancelado';
    });
    var conf = semTurnos.filter(function (t) { return t.estado === 'Confirmado'; }).length;
    var pend = semTurnos.filter(function (t) { return t.estado === 'Pendiente'; }).length;
    var slotsTotal = franjas.length * configAgente.diasHabilitados.length * configAgente.maxPorTurno;
    var libres = Math.max(0, slotsTotal - semTurnos.length);
    res.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">'
      + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--texto-suave);font-size:12px;">Turnos esta semana</span><strong>' + semTurnos.length + '</strong></div>'
      + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--azul);font-size:12px;">Confirmados</span><strong style="color:var(--azul);">' + conf + '</strong></div>'
      + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--naranja);font-size:12px;">Pendientes</span><strong style="color:var(--naranja);">' + pend + '</strong></div>'
      + '<div style="border-top:1px solid var(--borde);margin:4px 0;"></div>'
      + '<div style="font-size:11px;color:var(--texto-muy-suave);">Slots libres: ' + libres + ' de ' + slotsTotal + '</div>'
      + '</div>';
  }
}

// ========== MODAL AGENDAR / EDITAR TURNO ==========
// Modal propio (patrón ensureModal de los módulos migrados) que se
// reutiliza para agendar (nuevo) y para ver/editar (existente, con el
// valor precargado). Campos: fecha + hora + entrevistador + candidato
// vinculado + nombre + estado (solo edición) + observación. El título,
// los campos precargados y el botón Eliminar distinguen un modo del otro.

function ensureModalCalTurno() {
  if ($('modal-cal-turno')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cal-turno';
  m.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header"><h3 id="cal-turno-titulo">Agendar turno</h3><button class="btn-close" onclick="cerrarModal('modal-cal-turno')">×</button></div>
      <div class="modal-body">
        <div class="form-grid form-grid-2" style="margin-bottom:12px;">
          <div class="form-group"><label>Fecha *</label><input type="date" id="cal-turno-fecha"></div>
          <div class="form-group"><label>Hora *</label><select id="cal-turno-hora"></select></div>
        </div>
        <div class="form-grid form-grid-2" style="margin-bottom:12px;">
          <div class="form-group"><label>Entrevistador</label><select id="cal-turno-responsable"><option value="">— Sin asignar —</option></select></div>
          <div class="form-group"><label>Candidato vinculado</label><select id="cal-turno-candidato" onchange="vincularCandidatoTurno(this)"><option value="">— Sin vínculo —</option></select></div>
        </div>
        <div class="form-group" style="margin-bottom:12px;"><label>Nombre del candidato *</label><input type="text" id="cal-turno-nombre" maxlength="120" placeholder="Nombre del candidato"></div>
        <div class="form-group" id="cal-turno-estado-group" style="margin-bottom:12px;display:none;"><label>Estado</label><select id="cal-turno-estado"><option value="Pendiente">Pendiente</option><option value="Confirmado">Confirmado</option></select></div>
        <div class="form-group"><label>Observación <span style="font-weight:400;color:var(--texto-muy-suave);">(opcional)</span></label><textarea id="cal-turno-observacion" rows="3" maxlength="300" placeholder="Nota asociada a la entrevista…"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" id="cal-turno-eliminar" style="display:none;margin-right:auto;" onclick="eliminarCalTurno()">🗑️ Eliminar</button>
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cal-turno')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarCalTurno()">💾 Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

// ========== AGENDAR ==========

export function agendarTurno(fecha, hora) {
  // Verificar que no esté lleno
  var turnos = getTurnos().filter(function (t) {
    return t.fecha === fecha && t.hora === hora && t.estado !== 'Cancelado';
  });
  if (turnos.length >= configAgente.maxPorTurno) {
    toast('⚠️ Ese horario ya está completo');
    return;
  }

  ensureModalCalTurno();
  poblarSelectHoraTurno(hora);
  poblarSelectResponsableTurno();
  poblarSelectCandidatoTurno();
  // Default del entrevistador: el valor actual del filtro global (si es un
  // responsable válido) — después cada turno guarda el suyo propio.
  const responsables = getResponsables();
  const respDefault = ($('cal-responsable') || { value: '' }).value;
  $('cal-turno-titulo').textContent = 'Agendar entrevista ' + hora + ' del ' + fecha;
  $('cal-turno-fecha').value = fecha;
  $('cal-turno-hora').value = hora;
  $('cal-turno-responsable').value = responsables.includes(respDefault) ? respDefault : '';
  $('cal-turno-candidato').value = '';
  $('cal-turno-nombre').value = '';
  $('cal-turno-estado-group').style.display = 'none';
  $('cal-turno-estado').value = 'Pendiente';
  $('cal-turno-observacion').value = '';
  $('cal-turno-eliminar').style.display = 'none';
  _turnoModal = { id: null };
  abrirModal('modal-cal-turno');
  setTimeout(() => $('cal-turno-nombre')?.focus(), 50);
}

// ========== VER / GESTIONAR TURNO ==========

function verTurno(turnoId) {
  var t = getTurnos().find(function (x) { return String(x.id) === String(turnoId); });
  if (!t) return;

  ensureModalCalTurno();
  poblarSelectHoraTurno(t.hora);
  poblarSelectResponsableTurno();
  poblarSelectCandidatoTurno();
  $('cal-turno-titulo').textContent = 'Editar entrevista — ' + (t.nombre || '');
  $('cal-turno-fecha').value = t.fecha || '';
  $('cal-turno-hora').value = t.hora || '';
  $('cal-turno-responsable').value = t.responsable || '';
  // Normaliza el candidato vinculado al mismo formato que el select
  // (id truncado a 9 dígitos) — el candidato_id puede venir en 3 formatos
  // distintos según el alta (ver idLocalCand en candidatos.js).
  $('cal-turno-candidato').value = t.candidatoId ? idLocalCand(t.candidatoId) : '';
  $('cal-turno-nombre').value = t.nombre || '';
  $('cal-turno-estado-group').style.display = 'flex';
  $('cal-turno-estado').value = t.estado === 'Confirmado' ? 'Confirmado' : 'Pendiente';
  $('cal-turno-observacion').value = t.observacion || '';
  $('cal-turno-eliminar').style.display = 'inline-block';
  _turnoModal = { id: t.id };
  abrirModal('modal-cal-turno');
}

// ========== GUARDAR / ELIMINAR TURNO ==========

export async function confirmarCalTurno() {
  if (_turnoModal == null) { cerrarModal('modal-cal-turno'); return; }
  const nombre = ($('cal-turno-nombre').value || '').trim();
  const fecha = ($('cal-turno-fecha').value || '').trim();
  const hora = ($('cal-turno-hora').value || '').trim();
  const responsable = ($('cal-turno-responsable').value || '').trim();
  const candidatoId = ($('cal-turno-candidato').value || '').trim();
  const observacion = ($('cal-turno-observacion').value || '').trim() || null;

  if (!nombre) { toast('⚠️ Completá el nombre del candidato'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(new Date(fecha + 'T00:00:00').getTime())) {
    toast('⚠️ Elegí una fecha válida');
    return;
  }
  const diaSemana = new Date(fecha + 'T00:00:00').getDay();
  if (!configAgente.diasHabilitados.includes(diaSemana)) {
    toast('⚠️ Ese día no está habilitado para entrevistas');
    return;
  }
  if (!getFranjas().includes(hora)) { toast('⚠️ Elegí una hora válida'); return; }

  // Capacidad del slot destino — excluye el propio turno cuando es edición
  // (mover un turno a un slot en el que ya estaba no puede bloquearse).
  const ocupados = getTurnos().filter(function (x) {
    return x.fecha === fecha && x.hora === hora && x.estado !== 'Cancelado' && String(x.id) !== String(_turnoModal.id);
  });
  if (ocupados.length >= configAgente.maxPorTurno) {
    toast('⚠️ Ese horario ya está completo');
    return;
  }

  if (_turnoModal.id == null) {
    var turno = {
      id: Date.now(),
      candidatoId: candidatoId || '',
      nombre: nombre,
      fecha: fecha,
      hora: hora,
      estado: 'Pendiente',
      responsable: responsable,
      observacion: observacion,
    };
    if (!DB.turnos) DB.turnos = [];
    DB.turnos.push(turno);
    const ok = await supaSync('turnos', turno);
    if (!ok) {
      DB.turnos = DB.turnos.filter(function (x) { return String(x.id) !== String(turno.id); });
      toast(errorGuardarTurno('⚠️ No se pudo agendar la entrevista — reintentá o avisá a sistemas'));
      return;
    }
    toast('✓ Entrevista agendada para ' + nombre + ' el ' + fecha + ' a las ' + hora);
  } else {
    const t = getTurnos().find(function (x) { return String(x.id) === String(_turnoModal.id); });
    if (!t) { cerrarModal('modal-cal-turno'); return; }
    const snapshot = { fecha: t.fecha, hora: t.hora, nombre: t.nombre, estado: t.estado, responsable: t.responsable, candidatoId: t.candidatoId, observacion: t.observacion };
    t.fecha = fecha;
    t.hora = hora;
    t.nombre = nombre;
    t.estado = ($('cal-turno-estado').value || 'Pendiente');
    t.responsable = responsable;
    t.candidatoId = candidatoId || '';
    t.observacion = observacion;
    const ok = await supaSync('turnos', t);
    if (!ok) {
      Object.assign(t, snapshot);
      toast(errorGuardarTurno('⚠️ No se pudo actualizar la entrevista — reintentá o avisá a sistemas'));
      return;
    }
    toast('✓ Entrevista actualizada');
  }
  _turnoModal = null;
  cerrarModal('modal-cal-turno');
  renderCalendario();
}

export async function eliminarCalTurno() {
  if (_turnoModal == null || _turnoModal.id == null) return;
  const t = getTurnos().find(function (x) { return String(x.id) === String(_turnoModal.id); });
  if (t && confirm('¿Eliminar este turno?')) {
    t.estado = 'Cancelado';
    const ok = await supaSync('turnos', t);
    if (!ok) toast(errorGuardarTurno('⚠️ No se pudo cancelar el turno — reintentá o avisá a sistemas'));
    else toast('✓ Turno cancelado');
  }
  _turnoModal = null;
  cerrarModal('modal-cal-turno');
  renderCalendario();
}

// ========== VINCULAR CANDIDATO ==========

// Al elegir un candidato del select, autocompleta el nombre (texto libre
// sigue permitido — los turnos viejos y los no registrados no tienen
// candidato vinculado).
export function vincularCandidatoTurno(sel) {
  const id = (sel || {}).value;
  if (!id) return;
  const c = (DB.candidatos || []).find(function (x) { return String(idLocalCand(x.id)) === String(id); });
  if (!c) return;
  $('cal-turno-nombre').value = (c.apellido ? c.apellido + ' ' : '') + (c.nombre || '');
}

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModalInput } from '@shared/ui.js';
import { supaSync, supaDel } from '@shared/supabase.js';

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
  var nicksRRHH = [
    ...DB.usuarios.filter(function (u) { return ['RRHH', 'Administrador total'].includes(u.perfil); }).map(function (u) { return u.nickname || u.nombre.split(' ')[0]; }),
    ...DB.rrhh.filter(function (n) { return !DB.usuarios.find(function (u) { return (u.nickname || u.nombre.split(' ')[0]) === n; }); }),
  ];
  sel.innerHTML = '<option value="">— Todos —</option>' + nicksRRHH.map(function (n) { return '<option>' + n + '</option>'; }).join('');
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

  abrirModalInput({ titulo: 'Agendar turno ' + hora + ' del ' + fecha, etiqueta: 'Nombre del candidato' }, function (nombre) {
    var responsable = ($('cal-responsable') || { value: '' }).value;

    var turno = {
      id: Date.now(),
      candidatoId: '',
      nombre: nombre,
      fecha: fecha,
      hora: hora,
      estado: 'Pendiente',
      responsable: responsable,
    };

    if (!DB.turnos) DB.turnos = [];
    DB.turnos.push(turno);
    supaSync('turnos', turno);
    renderCalendario();
    toast('✓ Turno agendado para ' + nombre + ' el ' + fecha + ' a las ' + hora);
  });
}

// ========== VER / GESTIONAR TURNO ==========

function verTurno(turnoId) {
  var t = getTurnos().find(function (x) { return x.id == turnoId; });
  if (!t) return;

  var nuevoEstado = t.estado === 'Pendiente' ? 'Confirmado' : 'Pendiente';
  var accion = confirm(
    'Turno: ' + t.nombre + '\n'
    + 'Fecha: ' + t.fecha + ' ' + t.hora + '\n'
    + 'Estado: ' + t.estado + '\n\n'
    + '¿Cambiar a ' + nuevoEstado + '?\n'
    + '(Cancelar para eliminar el turno)'
  );

  if (accion) {
    t.estado = nuevoEstado;
    supaSync('turnos', t);
    toast('✓ Turno ' + nuevoEstado.toLowerCase());
  } else {
    var eliminar = confirm('¿Eliminar este turno?');
    if (eliminar) {
      t.estado = 'Cancelado';
      supaSync('turnos', t);
      toast('✓ Turno cancelado');
    }
  }
  renderCalendario();
}

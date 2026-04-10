import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

// ========== CONFIGURACION ==========

const configAgente = {
  diasHabilitados: [1, 2, 3, 4, 5],
  horaDesde: '09:00',
  horaHasta: '17:00',
  duracion: 20,
  maxPorTurno: 2,
};

// ========== DATOS MOCK ==========

const turnosAgendados = [
  { fecha: '2026-04-07', hora: '10:00', candidato: 'Lima Romina Paola', estado: 'confirmado' },
  { fecha: '2026-04-07', hora: '10:20', candidato: 'Aranda Pablo', estado: 'confirmado' },
  { fecha: '2026-04-07', hora: '10:40', candidato: 'Cuba Tiare Lucia', estado: 'pendiente' },
  { fecha: '2026-04-08', hora: '09:00', candidato: 'Gomez Carlos Eduardo', estado: 'confirmado' },
  { fecha: '2026-04-09', hora: '11:00', candidato: 'Spinella Matias', estado: 'confirmado' },
];

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

// ========== NAVEGACION ==========

export function cambiarSemana(dir) { semanaOffset += dir; renderCalendario(); }
export function irHoy() { semanaOffset = 0; renderCalendario(); }

// ========== CONFIG ==========

export function actualizarConfigAgente() {
  const dias = [];
  document.querySelectorAll('#dias-habilitados input:checked').forEach(cb => dias.push(parseInt(cb.value)));
  configAgente.diasHabilitados = dias;
  configAgente.horaDesde = ($('hora-desde') || { value: '09:00' }).value;
  configAgente.horaHasta = ($('hora-hasta') || { value: '17:00' }).value;
  configAgente.duracion = parseInt(($('duracion-turno') || { value: '20' }).value) || 20;
  configAgente.maxPorTurno = parseInt(($('max-turno') || { value: '2' }).value) || 2;
  renderCalendario();
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
  if (lbl) lbl.textContent = `${dias[0].toLocaleDateString('es-AR', opts)} — ${dias[6].toLocaleDateString('es-AR', opts)} ${dias[0].getFullYear()}`;

  // Generar franjas horarias
  const franjas = [];
  const [hD, mD] = configAgente.horaDesde.split(':').map(Number);
  const [hH, mH] = configAgente.horaHasta.split(':').map(Number);
  let cur = hD * 60 + mD;
  const fin = hH * 60 + mH;
  while (cur < fin) {
    const h = Math.floor(cur / 60).toString().padStart(2, '0');
    const m = (cur % 60).toString().padStart(2, '0');
    franjas.push(`${h}:${m}`);
    cur += configAgente.duracion;
  }

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Header
  let html = `<div class="cal-header" style="grid-template-columns:60px repeat(7,1fr);">
    <div class="cal-header-cell"></div>`;
  dias.forEach(d => {
    const esHoy = d.getTime() === hoy.getTime();
    html += `<div class="cal-header-cell${esHoy ? ' hoy' : ''}">
      ${diasNombres[d.getDay()]}<br>
      <span style="font-size:14px;font-weight:700;color:${esHoy ? 'var(--azul)' : 'var(--texto)'};">${d.getDate()}</span>
    </div>`;
  });
  html += '</div>';

  // Filas por franja
  franjas.forEach(hora => {
    html += `<div class="cal-row" style="grid-template-columns:60px repeat(7,1fr);">
      <div class="cal-time">${hora}</div>`;
    dias.forEach(d => {
      const diaSemana = d.getDay();
      const habilitado = configAgente.diasHabilitados.includes(diaSemana);
      const esHoy = d.getTime() === hoy.getTime();
      const fechaStr = d.toISOString().split('T')[0];
      const turnos = turnosAgendados.filter(t => t.fecha === fechaStr && t.hora === hora);
      const lleno = turnos.length >= configAgente.maxPorTurno;

      if (!habilitado) {
        html += `<div class="cal-cell bloqueado" title="Día no habilitado"></div>`;
      } else {
        html += `<div class="cal-cell${esHoy ? ' hoy' : ''}" onclick="agendarTurno('${fechaStr}','${hora}')">`;
        turnos.forEach(t => {
          const cls = t.estado === 'confirmado' ? 'ocupado' : 'libre';
          html += `<div class="cal-slot ${cls}" title="${t.candidato}">${t.candidato.split(' ')[0]}</div>`;
        });
        if (!lleno && turnos.length < configAgente.maxPorTurno) {
          html += `<div class="cal-slot libre" style="opacity:.5;border:1px dashed var(--verde);">+ Libre</div>`;
        }
        html += '</div>';
      }
    });
    html += '</div>';
  });

  const cal = $('calendario-entrevistas');
  if (cal) cal.innerHTML = `<div class="cal-grid" style="display:block;">${html}</div>`;

  // Resumen semanal
  const res = $('resumen-semanal');
  if (res) {
    const semTurnos = turnosAgendados.filter(t => {
      const d = new Date(t.fecha);
      return d >= dias[0] && d <= dias[6];
    });
    const conf = semTurnos.filter(t => t.estado === 'confirmado').length;
    const pend = semTurnos.filter(t => t.estado === 'pendiente').length;
    res.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Turnos esta semana</span><strong>${semTurnos.length}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--azul);font-size:12px;">Confirmados</span><strong style="color:var(--azul);">${conf}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--acento);font-size:12px;">Pendientes</span><strong style="color:#7a6000;">${pend}</strong></div>
        <div class="divider" style="margin:4px 0;"></div>
        <div style="font-size:11px;color:var(--texto-muy-suave);">Slots libres disponibles según config.: ${Math.max(0, franjas.length * configAgente.diasHabilitados.length * configAgente.maxPorTurno - semTurnos.length)}</div>
      </div>`;
  }
}

// ========== AGENDAR ==========

export function agendarTurno(fecha, hora) {
  const nombre = prompt(`Agendar turno ${hora} del ${fecha}\n\nNombre del candidato (o dejá en blanco para cancelar):`);
  if (!nombre) return;
  turnosAgendados.push({ fecha, hora, candidato: nombre, estado: 'pendiente' });
  renderCalendario();
  toast(`✓ Turno agendado para ${nombre} el ${fecha} a las ${hora}`);
}

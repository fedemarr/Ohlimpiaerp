// Ohlimpia — Página pública de agendamiento de entrevista.
// Candidato elige turno desde un link (Template 2 de WhatsApp).
// No importa el cliente de Supabase: solo habla con /api/agendar-turno.

import './styles/main.css';
import './styles/postularme.css';

import { $, toTitleCase, cleanText, validarCampos } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

const DIAS_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
let turnoElegido = null; // { fecha, hora }

// ========== INIT ==========

function init() {
  const params = new URLSearchParams(window.location.search);
  const dni = params.get('dni');
  const nombre = params.get('nombre');

  if (dni) $('ae-dni').value = dni;
  if (nombre) {
    const parts = nombre.split(' ');
    if (parts.length >= 2) {
      $('ae-nombre').value = toTitleCase(parts.slice(0, Math.ceil(parts.length / 2)).join(' '));
      $('ae-apellido').value = toTitleCase(parts.slice(Math.ceil(parts.length / 2)).join(' '));
    } else {
      $('ae-nombre').value = toTitleCase(nombre);
    }
  }

  if (dni) $('ae-dni').value = dni;

  $('ae-info').textContent = dni
    ? 'Completá tus datos y elegí el turno que te quede mejor.'
    : 'Elegí el día y horario que te venga mejor para tu entrevista.';

  $('ae-btn-confirmar').onclick = confirmarTurno;
  cargarTurnos();
}

// ========== TURNOS ==========

function formatearDia(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  return DIAS_NOMBRES[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

async function cargarTurnos() {
  const estadoEl = $('ae-turnos-estado');
  const gridEl = $('ae-turnos-grid');
  try {
    const resp = await fetch('/api/agendar-turno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disponibilidad', dias: 14 }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error al cargar horarios');

    const slots = [];
    const config = data.config || {};
    const franjas = data.franjas || [];
    const ocupados = data.ocupados || {};
    const desde = data.desde;
    const hasta = data.hasta;
    const diasHab = config.diasHabilitados || [1, 2, 3, 4, 5];
    const max = config.maxPorFranja || 2;

    // Generar slots disponibles
    for (let i = 0; i <= 30; i++) {
      const d = new Date(desde + 'T00:00:00');
      d.setDate(d.getDate() + i);
      if (d > new Date(hasta + 'T00:00:00')) break;
      if (!diasHab.includes(d.getDay())) continue;
      const fechaStr = d.toISOString().split('T')[0];
      franjas.forEach(hora => {
        const key = fechaStr + '|' + hora;
        const ocupadosSlot = ocupados[key] || 0;
        if (ocupadosSlot < max) slots.push({ fecha: fechaStr, hora });
      });
    }

    if (!slots.length) {
      estadoEl.textContent = 'No hay horarios disponibles por ahora — intentá de nuevo más tarde.';
      return;
    }
    estadoEl.textContent = '';

    const porDia = {};
    slots.forEach(s => {
      if (!porDia[s.fecha]) porDia[s.fecha] = [];
      porDia[s.fecha].push(s.hora);
    });

    gridEl.innerHTML = Object.keys(porDia).sort().map(fecha =>
      '<div class="pm-turnos-dia">' + formatearDia(fecha) + '</div>'
      + '<div class="pm-turnos-chips">'
      + porDia[fecha].map(hora =>
        '<button type="button" class="pm-chip" data-fecha="' + fecha + '" data-hora="' + hora + '">' + hora + '</button>'
      ).join('')
      + '</div>'
    ).join('');

    gridEl.onclick = e => {
      const btn = e.target.closest('.pm-chip');
      if (!btn) return;
      elegirTurno(btn.dataset.fecha, btn.dataset.hora);
    };
  } catch (e) {
    estadoEl.textContent = 'No se pudieron cargar los horarios — intentá de nuevo en unos minutos.';
  }
}

function elegirTurno(fecha, hora) {
  turnoElegido = { fecha, hora };

  // Highlight visual
  $('ae-turnos-grid').querySelectorAll('.pm-chip').forEach(c => c.classList.remove('pm-chip-elegido'));
  const chip = $('ae-turnos-grid').querySelector('[data-fecha="' + fecha + '"][data-hora="' + hora + '"]');
  if (chip) chip.classList.add('pm-chip-elegido');

  const el = $('ae-turno-elegido');
  el.style.display = 'flex';
  el.innerHTML = '<span>📅 ' + formatearDia(fecha) + ' a las ' + hora + '</span>';

  $('ae-step-datos').style.display = 'block';
  $('ae-btn-confirmar').style.display = 'flex';
}

// ========== CONFIRMAR ==========

async function confirmarTurno() {
  if (!turnoElegido) { toast('⚠️ Elegí un turno primero'); return; }

  if (!validarCampos([
    { id: 'ae-apellido', label: 'Apellido' },
    { id: 'ae-nombre', label: 'Nombre' },
    { id: 'ae-dni', label: 'DNI' },
  ], toast)) return;

  const dni = cleanText($('ae-dni').value);
  if (!/^\d{6,8}$/.test(dni)) {
    toast('⚠️ El DNI debe tener entre 6 y 8 dígitos numéricos');
    $('ae-dni').focus();
    return;
  }

  const btn = $('ae-btn-confirmar');
  btn.disabled = true;
  btn.textContent = 'Confirmando...';

  try {
    const resp = await fetch('/api/agendar-turno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reservar',
        nombre: toTitleCase($('ae-nombre').value),
        apellido: toTitleCase($('ae-apellido').value),
        dni,
        telefono: cleanText($('ae-tel').value),
        email: cleanText($('ae-email').value),
        observaciones: cleanText($('ae-obs').value),
        fecha: turnoElegido.fecha,
        hora: turnoElegido.hora,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      toast('⚠️ ' + (data.error || 'No se pudo agendar el turno'));
      btn.disabled = false;
      btn.textContent = '✅ Confirmar turno';
      return;
    }

    // Éxito — mostrar confirmación
    $('ae-form-wrap').style.display = 'none';
    $('ae-exito').style.display = 'block';
    $('ae-exito-detalle').innerHTML =
      '<strong>📅 ' + formatearDia(turnoElegido.fecha) + '</strong> a las <strong>' + turnoElegido.hora + '</strong>';
  } catch (e) {
    toast('⚠️ Error de conexión — probá de nuevo en unos minutos');
    btn.disabled = false;
    btn.textContent = '✅ Confirmar turno';
  }
}

init();

// Ohlimpia — Formulario público de postulación (sin login).
// No importa el cliente de Supabase: solo habla con las funciones
// serverless propias (/api/turnos-disponibles y /api/postular), que son las
// únicas con permiso de escritura/lectura en candidatos/turnos.

import './styles/main.css';
import './styles/postularme.css';

import { LOCALIDADES_BA, BARRIOS_CABA } from '@shared/state.js';
import { $, toTitleCase, cleanText, validarCampos } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

let turnoElegido = null; // { fecha, hora }

// ========== PROVINCIA / LOCALIDAD ==========

function onChangeZona() {
  const zona = $('pm-zona');
  const loc = $('pm-localidad');
  if (zona.value === 'CABA') {
    loc.disabled = false;
    loc.innerHTML = '<option value="">Seleccionar barrio...</option>' + BARRIOS_CABA.map(b => '<option>' + b + '</option>').join('');
  } else if (zona.value === 'Buenos Aires') {
    loc.disabled = false;
    loc.innerHTML = '<option value="">Seleccionar...</option>' + LOCALIDADES_BA.map(l => '<option>' + l + '</option>').join('');
  } else {
    loc.innerHTML = '<option value="">Seleccioná la provincia primero</option>';
    loc.disabled = true;
  }
}

// ========== TURNOS ==========

const DIAS_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatearDia(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  return DIAS_NOMBRES[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

async function cargarTurnos() {
  const estadoEl = $('pm-turnos-estado');
  const gridEl = $('pm-turnos-grid');
  try {
    const resp = await fetch('/api/turnos-disponibles');
    const data = await resp.json();
    if (!resp.ok || !data.slots) throw new Error(data.error || 'Error al cargar horarios');

    if (!data.slots.length) {
      estadoEl.textContent = 'No hay horarios disponibles por ahora — enviá tu postulación igual y te contactamos.';
      return;
    }
    estadoEl.textContent = '';

    const porDia = {};
    data.slots.forEach(s => {
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
    estadoEl.textContent = 'No se pudieron cargar los horarios — enviá tu postulación igual y te contactamos.';
  }
}

function elegirTurno(fecha, hora) {
  turnoElegido = { fecha, hora };
  const el = $('pm-turno-elegido');
  el.style.display = 'flex';
  el.innerHTML = '<span>📅 Turno elegido: ' + formatearDia(fecha) + ' a las ' + hora + '</span><button type="button" id="pm-quitar-turno">Quitar</button>';
  $('pm-quitar-turno').onclick = () => {
    turnoElegido = null;
    el.style.display = 'none';
  };
}

// ========== ENVÍO ==========

async function enviarPostulacion(e) {
  e.preventDefault();

  if (!validarCampos([
    { id: 'pm-apellido', label: 'Apellido' },
    { id: 'pm-nombre', label: 'Nombre' },
    { id: 'pm-dni', label: 'DNI' },
    { id: 'pm-tel', label: 'Teléfono' },
    { id: 'pm-calle', label: 'Calle y número' },
    { id: 'pm-zona', label: 'Provincia' },
  ], toast)) return;

  const dni = cleanText($('pm-dni').value);
  if (!/^\d{6,8}$/.test(dni)) {
    toast('⚠️ El DNI debe tener entre 6 y 8 dígitos numéricos');
    $('pm-dni').focus();
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const payload = {
    apellido: toTitleCase($('pm-apellido').value),
    nombre: toTitleCase($('pm-nombre').value),
    dni,
    cuit: cleanText($('pm-cuit').value),
    fecNac: $('pm-fecnac').value,
    estadoCivil: $('pm-estado-civil').value,
    tel: cleanText($('pm-tel').value),
    email: cleanText($('pm-email').value),
    calle: cleanText($('pm-calle').value),
    piso: cleanText($('pm-piso').value),
    zona: $('pm-zona').value,
    localidad: $('pm-localidad').value,
    nacionalidad: $('pm-nacionalidad').value,
    genero: $('pm-genero').value,
    fecha: turnoElegido ? turnoElegido.fecha : null,
    hora: turnoElegido ? turnoElegido.hora : null,
    hp_3x9: $('pm-hp-3x9').value, // honeypot
  };

  try {
    const resp = await fetch('/api/postular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      toast('⚠️ ' + (data.error || 'No se pudo enviar la postulación'));
      btn.disabled = false;
      btn.textContent = 'Enviar postulación';
      return;
    }
    document.getElementById('form-postular').innerHTML =
      '<div style="text-align:center;padding:20px 0;">'
      + '<div style="font-size:32px;margin-bottom:10px;">✅</div>'
      + '<h3 style="margin-bottom:8px;">¡Postulación enviada!</h3>'
      + '<p style="color:var(--texto-suave);font-size:13px;">'
      + (data.citado ? 'Te esperamos en tu entrevista. También te vamos a contactar por teléfono.' : 'En breve nos vamos a poner en contacto para coordinar tu entrevista.')
      + '</p></div>';
  } catch (e) {
    toast('⚠️ Error de conexión — probá de nuevo en unos minutos');
    btn.disabled = false;
    btn.textContent = 'Enviar postulación';
  }
}

// ========== INIT ==========

$('pm-zona').onchange = onChangeZona;
$('form-postular').addEventListener('submit', enviarPostulacion);
cargarTurnos();

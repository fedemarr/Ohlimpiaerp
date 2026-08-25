// Ohlimpia — Formulario público de postulación (sin login).
// No importa el cliente de Supabase: solo habla con la función serverless
// propia (/api/postular), la única con permiso de escritura en candidatos.
//
// Sin agendamiento acá (ticket 25/08/2026): antes este mismo formulario
// dejaba elegir un turno de entrevista al postularse, pero llegan muchas
// postulaciones sin que todas ameriten entrevista todavía. Ahora este
// primer link solo carga datos y crea el candidato en estado
// 'Precandidato' (ver api/postular.js) — RRHH lo revisa desde la pantalla
// Candidatos → tab Precandidatos y, recién ahí, le manda por WhatsApp el
// link de /agendar-entrevista (candidatos.js → plantilla "link") para que
// elija día y hora. Ese segundo paso es el que lo pasa a 'Citado' y lo
// hace aparecer en Candidatos (agendar-turno.js → handleReservar).

import './styles/main.css';
import './styles/postularme.css';

import { LOCALIDADES_BA, BARRIOS_CABA } from '@shared/state.js';
import { $, toTitleCase, cleanText, validarCampos } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

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

// ========== ENVÍO ==========

async function enviarPostulacion(e) {
  e.preventDefault();

  if (!validarCampos([
    { id: 'pm-apellido', label: 'Apellido' },
    { id: 'pm-nombre', label: 'Nombre' },
    { id: 'pm-dni', label: 'DNI' },
    { id: 'pm-tel', label: 'Celular' },
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

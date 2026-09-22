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

import { LOCALIDADES_BA, BARRIOS_CABA, PARTIDOS_LOCALIDADES, LOCALIDAD_A_PARTIDO } from '@shared/state.js';
import { $, toTitleCase, cleanText, validarCampos } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { EMPRESA_NOMBRE } from '@shared/branding.js';

// Multi-empresa (mismo mecanismo que aplicarBranding() en branding.js,
// esta página vive fuera de la SPA principal así que no lo reutiliza
// directo): sin VITE_EMPRESA_NOMBRE configurada (Ohlimpia) queda igual
// que siempre.
if (EMPRESA_NOMBRE !== 'Ohlimpia') {
  document.title = document.title.replace('Ohlimpia', EMPRESA_NOMBRE);
  const marca = $('pm-marca');
  if (marca) marca.textContent = EMPRESA_NOMBRE;
}

// ========== PROVINCIA / PARTIDO / LOCALIDAD ==========
// Bug real (ticket "Formulario de solicitud de empleo", 22/09): el campo
// Localidad mostraba LOCALIDADES_BA — que pese al nombre es la lista de
// PARTIDOS de la provincia (ver el comentario en state.js) — así que
// "Merlo", "La Matanza", etc. eran en realidad partidos, no localidades.
// Mismo patrón que ya usa Candidatos (onChangeZonaCand/onChangePartidoCand/
// onChangeLocalidadCand, candidatos.js): LOCALIDADES_BA alimenta el
// selector de PARTIDO, y Localidad sale de PARTIDOS_LOCALIDADES (angostada
// al partido elegido, o todas juntas si todavía no se eligió partido).
// Elegir la Localidad directa autocompleta el Partido solo, vía
// LOCALIDAD_A_PARTIDO — no hace falta saber antes a qué partido pertenece.
const TODAS_LAS_LOCALIDADES = Object.keys(LOCALIDAD_A_PARTIDO).sort((a, b) => a.localeCompare(b, 'es'));

function onChangeZona() {
  const zona = $('pm-zona');
  const part = $('pm-partido');
  const loc = $('pm-localidad');
  if (zona.value === 'CABA') {
    part.innerHTML = '<option value="">No aplica (CABA)</option>';
    part.disabled = true;
    loc.disabled = false;
    loc.innerHTML = '<option value="">Seleccionar barrio...</option>' + BARRIOS_CABA.map(b => '<option>' + b + '</option>').join('');
  } else if (zona.value === 'Buenos Aires') {
    part.disabled = false;
    part.innerHTML = '<option value="">Seleccionar...</option>' + LOCALIDADES_BA.map(l => '<option>' + l + '</option>').join('');
    loc.disabled = false;
    loc.innerHTML = '<option value="">Seleccionar...</option>' + TODAS_LAS_LOCALIDADES.map(l => '<option>' + l + '</option>').join('');
  } else {
    part.innerHTML = '<option value="">Seleccioná la provincia primero</option>';
    part.disabled = true;
    loc.innerHTML = '<option value="">Seleccioná la provincia primero</option>';
    loc.disabled = true;
  }
}

// Elegiste el Partido: angosta Localidad a las de ese partido. Sin partido
// elegido (volvió a "Seleccionar..."), vuelve a mostrar todas juntas — se
// puede elegir la Localidad directa sin pasar por Partido.
function onChangePartido() {
  const part = $('pm-partido');
  const loc = $('pm-localidad');
  const localidades = PARTIDOS_LOCALIDADES[part.value];
  loc.disabled = false;
  loc.innerHTML = '<option value="">Seleccionar...</option>' + (localidades || TODAS_LAS_LOCALIDADES).map(l => '<option>' + l + '</option>').join('');
}

// Elegiste la Localidad directa: autocompleta el Partido. Se asigna por
// .value (no dispara el onchange de Partido), así no re-angosta ni resetea
// la Localidad recién elegida.
function onChangeLocalidad() {
  const part = $('pm-partido');
  const loc = $('pm-localidad');
  if (part.disabled) return; // CABA: no hay partido que completar
  const partido = LOCALIDAD_A_PARTIDO[loc.value];
  if (partido) part.value = partido;
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
    // CABA "no aplica" (el select queda disabled) — mismo criterio que el
    // formulario interno de Candidatos (ver partEl.disabled en candidatos.js).
    partido: $('pm-partido').disabled ? '' : cleanText($('pm-partido').value),
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
$('pm-partido').onchange = onChangePartido;
$('pm-localidad').onchange = onChangeLocalidad;
$('form-postular').addEventListener('submit', enviarPostulacion);

// Ohlimpia — Página pública de respuesta de evaluaciones (sin login).
// Mismo patrón que postularme.js: no importa el cliente de Supabase, solo
// habla con las funciones serverless propias (/api/evaluacion-preguntas y
// /api/evaluacion-responder), únicas con permiso de lectura/escritura
// sobre evaluaciones_enviadas/respuestas_evaluacion vía token.

import './styles/main.css';

import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

const token = new URLSearchParams(location.search).get('token');
let preguntasActuales = [];

function formatearFecha(iso) {
  return new Date(iso).toLocaleDateString('es-AR');
}

function mostrarEstado(msg) {
  $('eval-estado').textContent = msg;
  $('eval-estado').style.display = 'block';
}

function mostrarResultado(resultado, puntaje) {
  $('eval-estado').style.display = 'none';
  $('form-evaluacion').style.display = 'none';
  const el = $('eval-resultado');
  el.style.display = 'block';
  const aprobo = resultado === 'Aprobada';
  el.innerHTML = '<div style="font-size:32px;margin-bottom:10px;">' + (aprobo ? '✅' : '❌') + '</div>'
    + '<p><strong>' + (aprobo ? 'Aprobaste' : 'Desaprobaste') + ' con ' + puntaje + '%</strong></p>';
}

function mostrarFormulario(data) {
  $('eval-estado').style.display = 'none';
  preguntasActuales = data.preguntas;
  $('eval-cabecera').innerHTML = '<p style="font-size:13px;color:#5a6280;">' + data.tipo + '</p>'
    + '<p style="font-size:13px;">Respondé las siguientes preguntas y enviá antes de que venza el plazo.</p>';
  $('eval-preguntas').innerHTML = preguntasActuales.map((p, i) => '<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #dde2f0;">'
    + '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">' + (i + 1) + '. ' + p.enunciado + '</div>'
    + ['A', 'B', 'C', 'D'].map(letra => '<label style="display:block;font-size:13px;margin-bottom:4px;cursor:pointer;">'
      + '<input type="radio" name="p-' + p.idLocal + '" value="' + letra + '" required> ' + letra + ') ' + p.opciones[letra]
      + '</label>').join('')
    + '</div>').join('');
  $('form-evaluacion').style.display = 'block';
}

async function init() {
  if (!token) { mostrarEstado('❌ Link inválido. Verificá con RRHH.'); return; }
  try {
    const resp = await fetch('/api/evaluacion-preguntas?token=' + encodeURIComponent(token));
    const data = await resp.json();
    if (!resp.ok) { mostrarEstado('❌ ' + (data.error || 'Link inválido. Verificá con RRHH.')); return; }
    if (data.estado === 'Respondida') { mostrarResultado(data.resultado, data.puntaje); return; }
    if (data.estado === 'Vencida') { mostrarEstado('❌ Esta evaluación venció el ' + formatearFecha(data.fechaLimite) + '. Contactá a RRHH.'); return; }
    mostrarFormulario(data);
  } catch (e) {
    mostrarEstado('❌ No se pudo cargar la evaluación. Probá de nuevo en un rato.');
  }
}

async function enviarRespuestas(e) {
  e.preventDefault();
  const respuestas = preguntasActuales.map(p => {
    const marcada = document.querySelector('input[name="p-' + p.idLocal + '"]:checked');
    return { preguntaIdLocal: p.idLocal, respuesta: marcada ? marcada.value : null };
  });
  if (respuestas.some(r => !r.respuesta)) { toast('⚠️ Respondé todas las preguntas'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const resp = await fetch('/api/evaluacion-responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, respuestas }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      toast('⚠️ ' + (data.error || 'No se pudo enviar'));
      btn.disabled = false;
      btn.textContent = 'Enviar respuestas';
      return;
    }
    mostrarResultado(data.resultado, data.puntaje);
  } catch (err) {
    toast('⚠️ Error de conexión, probá de nuevo');
    btn.disabled = false;
    btn.textContent = 'Enviar respuestas';
  }
}

$('form-evaluacion').addEventListener('submit', enviarRespuestas);
init();

// AGENTE_TICKETS_OHLIMPIA.md, punto 6 — "Ohlimpia no ejecuta el agente. Lo
// dispara y espera el resultado." La interfaz hacia el resto del módulo es
// SIEMPRE dispararAgente(corrida): cambiar de simulación a real (o a
// Routine Cloud en vez de GitHub Issue) es cambiar esta función, nunca la
// UI que la llama.
//
// Decisión de disparo real (punto 6, "proponeme cuál conviene"): GitHub
// Issue + etiqueta + GitHub Action, no Routine Cloud. Motivo — un Issue
// deja un hilo público en el repo (auditoría gratis, calza con el punto
// 9.8), no depende de una API de Anthropic cuya forma exacta para este caso
// no está tan probada como `anthropics/claude-code-action`, y "un ticket =
// un issue = una branch = un PR" (punto 6) es el modelo natural de GitHub,
// no algo que haya que simular. La contra es que hay que configurar y
// probar en vivo el workflow (.github/workflows/agente-tickets.yml) —eso
// queda anotado en PENDIENTES_FEDE.md, no se pudo verificar end-to-end
// desde acá.
import { DB, currentUser } from '@shared/state.js';
import { supaSync, SUPA } from '@shared/supabase.js';
import { registrarAuditoriaAgente } from './auditoria.js';
import { aplicarCallback } from './estados.js';

// Punto 12.1: "responde el callback con datos de mentira a los 30
// segundos". Configurable solo para que los tests e2e no tengan que
// esperar 30s reales — en producción nunca se toca.
const SIMULACION_DELAY_MS = () => (typeof window !== 'undefined' && window.__AGENTE_SIM_DELAY_MS) || 30000;

function nuevoIdLocal(prefijo) {
  return (prefijo + Date.now() + Math.floor(Math.random() * 900 + 100)).slice(-9);
}

function nuevoTokenCallback() {
  const arr = new Uint8Array(24);
  (globalThis.crypto || window.crypto).getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Punto 6: "una branch y un PR por ticket" — una CorridaAgente por ticket.
export async function crearCorridaAgente(ticket, { modoSimulacion, nivelRiesgo }) {
  const ahora = new Date().toISOString();
  const corrida = {
    id: Date.now(),
    ticketIdLocal: String(ticket.id),
    ticketTitulo: ticket.titulo || '',
    ticketModulo: ticket.modulo || ticket.moduloLabel || '',
    nivelRiesgo,
    estado: 'ENVIADO',
    modoSimulacion: !!modoSimulacion,
    iniciadaPor: currentUser?.nombre || '',
    iniciadaEn: ahora,
    intentos: 0,
    archivosTocados: [],
    testsCorridos: 0,
    tieneMigracion: false,
    callbackToken: nuevoTokenCallback(),
    callbackTokenUsado: false,
    // Vencimiento generoso (4hs): un ticket real puede tardar bastante más
    // que la simulación de 30s — no tiene sentido que el token expire
    // mientras el agente todavía está trabajando.
    callbackTokenExpiraEn: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  };
  if (!DB.corridasAgente) DB.corridasAgente = [];
  DB.corridasAgente.push(corrida);
  const ok = await supaSync('corridasAgente', corrida);
  if (!ok) return null;
  await registrarAuditoriaAgente(corrida.id, 'envio', `Corrida creada para el ticket "${ticket.titulo}" (riesgo ${nivelRiesgo}, modo ${modoSimulacion ? 'simulación' : 'real'}).`);
  return corrida;
}

async function _guardarCorrida(corrida) {
  corrida.updatedAtLocal = Date.now(); // fuerza cambio de referencia para renders reactivos simples
  await supaSync('corridasAgente', corrida);
}

// Punto 6.3: "la corrida pasa a EN_PROCESO". A partir de acá, todo lo que
// pase lo cuenta el callback (real o simulado) — dispararAgente() no
// espera una respuesta síncrona del trabajo del agente, solo confirma que
// el disparo salió (o no).
export async function dispararAgente(corrida) {
  corrida.estado = 'EN_PROCESO';
  corrida.intentos = (corrida.intentos || 0) + 1;
  await _guardarCorrida(corrida);

  if (corrida.modoSimulacion) {
    await registrarAuditoriaAgente(corrida.id, 'envio', 'Disparo en modo SIMULACIÓN — no se tocó el repo ni se gastó nada.');
    _programarCallbackSimulado(corrida);
    return { ok: true, modo: 'simulacion' };
  }

  try {
    const session = (await SUPA.auth.getSession()).data.session;
    const resp = await fetch('/api/agente?accion=disparar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({
        corridaIdLocal: corrida.id,
        ticketTitulo: corrida.ticketTitulo,
        ticketModulo: corrida.ticketModulo,
        nivelRiesgo: corrida.nivelRiesgo,
        callbackToken: corrida.callbackToken,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) {
      corrida.estado = 'FALLIDO';
      corrida.error = data?.error || `No se pudo disparar el agente (HTTP ${resp.status}).`;
      corrida.finalizadaEn = new Date().toISOString();
      await _guardarCorrida(corrida);
      await registrarAuditoriaAgente(corrida.id, 'error', corrida.error);
      return { ok: false, error: corrida.error };
    }
    corrida.branch = data.branch || '';
    await _guardarCorrida(corrida);
    await registrarAuditoriaAgente(corrida.id, 'envio', `Issue de GitHub creado: ${data.issueUrl || '—'}`);
    return { ok: true, modo: 'real', issueUrl: data.issueUrl };
  } catch (e) {
    corrida.estado = 'FALLIDO';
    corrida.error = e.message || 'Error de red al disparar el agente.';
    corrida.finalizadaEn = new Date().toISOString();
    await _guardarCorrida(corrida);
    await registrarAuditoriaAgente(corrida.id, 'error', corrida.error);
    return { ok: false, error: corrida.error };
  }
}

// Genera un resultado de mentira para el modo simulación (punto 12.1). Se
// puede orientar el resultado con palabras en el título/módulo del ticket
// de prueba, para poder ensayar los 3 caminos (verde, con migración, tests
// en rojo) sin depender del azar:
//   - título/descripción con "migra"  -> simula que hay una migración
//   - título/descripción con "romp"/"fall" -> simula tests en rojo
//   - cualquier otro caso -> verde, sin migración
function _resultadoFalso(corrida) {
  const texto = `${corrida.ticketTitulo || ''}`.toLowerCase();
  if (/romp|fall/.test(texto)) {
    return {
      testsOk: false, testsCorridos: 6,
      error: '[SIMULADO] falló e2e/legajos-alta.spec.js — el modal no cierra tras guardar.',
      resumen: '[SIMULADO] El agente intentó el cambio pero los tests de e2e no pasaron.',
    };
  }
  if (/migra/.test(texto)) {
    return {
      testsOk: true, testsCorridos: 9, tieneMigracion: true,
      sqlMigracion: '-- [SIMULADO]\nALTER TABLE public.ejemplo ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;',
      migracionReversible: true, migracionFilasAfectadasEstimado: '0 (columna nueva)',
      resumen: '[SIMULADO] Se agregó el campo que pedía el ticket. Hace falta la columna nueva en la base.',
      queProbar: '[SIMULADO] Abrí el módulo correspondiente y verificá el campo nuevo.',
      archivosTocados: ['src/legacy.js', 'sql/v999_demo_simulado.sql'],
      branch: `agente/${corrida.ticketIdLocal}-simulado`,
      prUrl: 'https://github.com/fedemarr/Ohlimpiaerp/pull/0',
      prNumber: 0,
    };
  }
  return {
    testsOk: true, testsCorridos: 7, tieneMigracion: false,
    resumen: `[SIMULADO] Se resolvió "${corrida.ticketTitulo}" sin tocar la base de datos.`,
    queProbar: corrida.ticketModulo ? `[SIMULADO] Entrá a "${corrida.ticketModulo}" y probá el caso del ticket.` : '[SIMULADO] Probá el caso descrito en el ticket.',
    archivosTocados: ['src/legacy.js'],
    branch: `agente/${corrida.ticketIdLocal}-simulado`,
    prUrl: 'https://github.com/fedemarr/Ohlimpiaerp/pull/0',
    prNumber: 0,
  };
}

function _programarCallbackSimulado(corrida) {
  setTimeout(async () => {
    // Releer de DB.corridasAgente por si el estado cambió mientras esperaba
    // (ej. un "Reintentar" disparó una simulación nueva encima).
    const actual = (DB.corridasAgente || []).find((c) => c.id === corrida.id) || corrida;
    if (actual.estado !== 'EN_PROCESO') return;
    const payload = _resultadoFalso(actual);
    const actualizada = aplicarCallback(actual, payload);
    Object.assign(actual, actualizada);
    await _guardarCorrida(actual);
    await registrarAuditoriaAgente(actual.id, 'callback', `[SIMULADO] Callback recibido — estado: ${actual.estado}.`);
    // La simulación corre en la misma pestaña — no hace falta esperar al
    // polling de respaldo (que además solo arranca tras un login real, no
    // tras el atajo de test) para ver el resultado en pantalla.
    if (typeof window !== 'undefined' && typeof window.renderAgente === 'function') window.renderAgente();
  }, SIMULACION_DELAY_MS());
}

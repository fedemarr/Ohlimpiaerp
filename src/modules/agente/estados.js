// Máquina de estados de CorridaAgente (AGENTE_TICKETS_OHLIMPIA.md, punto 3).
// CERO imports a propósito: este archivo lo usa tanto el navegador
// (dispatcher.js, para el callback simulado) como la función serverless
// api/agente.js (runtime Node de Vercel, ?accion=callback) — cualquier import de
// '@shared/...' rompería en uno de los dos lados, así que la lógica de
// transición vive acá, aislada y pura, importada por ruta relativa desde
// los dos.
//
// Estado agregado a los del spec original: MIGRACION_APROBADA_PENDIENTE_APLICAR
// (ver comentario en sql/v172_agente_tickets.sql) — "aprobar" nunca ejecuta
// la migración sola, solo habilita a aplicarla a mano.

export const ESTADOS = [
  'ENVIADO', 'EN_PROCESO', 'TESTS_OK', 'ESPERANDO_APROBACION_SQL',
  'MIGRACION_APROBADA_PENDIENTE_APLICAR', 'DEPLOYADO', 'COMUNICADO',
  'TESTS_FALLARON', 'FALLIDO', 'RECHAZADO',
];

// Innegociable #2 (AGENTE_TICKETS_OHLIMPIA.md punto 9): "tests_corridos es 0
// se trata como fallo", aunque tests_ok venga en true — un comando de test
// que termina en verde sin correr nada es peor que no tener tests.
export function pasaLaBarreraDeTests({ testsOk, testsCorridos }) {
  const corridos = Number(testsCorridos) || 0;
  return corridos > 0 && !!testsOk;
}

// A partir del resultado que informa el agente (payload del callback),
// calcula el estado siguiente. No decide DEPLOYADO por su cuenta salvo que
// el propio payload diga que ya deployó (deployedByAgent) — en Fase 1, sin
// el pipeline de CI corriendo el deploy real, el estado por default para
// "verde sin migración" es TESTS_OK, no DEPLOYADO (ver PENDIENTES_FEDE.md:
// falta la barrera de CI que efectivamente dispare ese deploy).
export function calcularEstadoSiguiente(payload) {
  if (!pasaLaBarreraDeTests(payload)) return 'TESTS_FALLARON';
  if (payload.tieneMigracion) return 'ESPERANDO_APROBACION_SQL';
  return payload.deployedByAgent ? 'DEPLOYADO' : 'TESTS_OK';
}

// Aplica un payload de callback sobre una corrida existente y devuelve el
// objeto actualizado (no muta el original — más fácil de testear).
export function aplicarCallback(corrida, payload) {
  const estado = calcularEstadoSiguiente(payload);
  const ahora = new Date().toISOString();
  const hayMigracionAprobar = estado === 'ESPERANDO_APROBACION_SQL';
  const actualizado = {
    ...corrida,
    testsOk: !!payload.testsOk,
    testsCorridos: Number(payload.testsCorridos) || 0,
    tieneMigracion: hayMigracionAprobar,
    sqlMigracion: hayMigracionAprobar ? (payload.sqlMigracion || '') : null,
    migracionReversible: hayMigracionAprobar ? (payload.migracionReversible ?? null) : null,
    migracionFilasAfectadasEstimado: hayMigracionAprobar ? (payload.migracionFilasAfectadasEstimado || null) : null,
    resumen: payload.resumen || corrida.resumen || '',
    queProbar: payload.queProbar || corrida.queProbar || '',
    archivosTocados: Array.isArray(payload.archivosTocados) ? payload.archivosTocados : (corrida.archivosTocados || []),
    error: estado === 'TESTS_FALLARON' ? (payload.error || 'Los tests no pasaron.') : null,
    branch: payload.branch || corrida.branch || '',
    prUrl: payload.prUrl || corrida.prUrl || '',
    prNumber: payload.prNumber || corrida.prNumber || null,
    estado,
    finalizadaEn: (estado === 'TESTS_FALLARON' || estado === 'FALLIDO') ? ahora : (corrida.finalizadaEn || null),
    deployadoEn: estado === 'DEPLOYADO' ? ahora : (corrida.deployadoEn || null),
  };
  return actualizado;
}

// Tope de intentos (innegociable #6): al reintentar, si ya se agotaron los
// 2 intentos, la corrida queda FALLIDO sin volver a disparar.
export function puedeReintentar(corrida, maxIntentos = 2) {
  return (corrida.intentos || 0) < maxIntentos;
}

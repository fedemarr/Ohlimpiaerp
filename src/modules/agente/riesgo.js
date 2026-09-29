// AGENTE_TICKETS_OHLIMPIA.md, punto 5 — clasificación de riesgo por
// palabras clave + módulo, sin modelo ("simple está bien"). Funciones
// puras, sin DOM, para poder testear sin levantar el navegador.
//
// Si se equivoca "para arriba" (marca amarillo algo verde, o rojo algo
// amarillo) no es un bug — el propio spec lo dice: "yo decido igual". Por
// eso el orden de chequeo es rojo → amarillo → verde, nunca al revés.

function _normalizar(s) {
  return String(s || '').toLowerCase();
}

// Config real: se lee de DB.agenteModulosRojos / agentePalabrasClaveRojo /
// agentePalabrasClaveAmarillo (config_listas, editables en Configuración —
// ver src/modules/config_listas/). Se pasa como objeto en vez de leer DB
// directo acá para que esta función siga siendo pura y testeable.
export function clasificarRiesgoTicket(ticket, config) {
  const modulosRojos = (config?.modulosRojos || []).map(_normalizar);
  const palabrasRojo = (config?.palabrasRojo || []).map(_normalizar);
  const palabrasAmarillo = (config?.palabrasAmarillo || []).map(_normalizar);

  const modulo = _normalizar(ticket?.modulo);
  const texto = _normalizar(`${ticket?.titulo || ''} ${ticket?.descripcion || ''}`);

  if (modulo && modulosRojos.includes(modulo)) return 'rojo';
  if (palabrasRojo.some((p) => p && texto.includes(p))) return 'rojo';
  if (palabrasAmarillo.some((p) => p && texto.includes(p))) return 'amarillo';
  return 'verde';
}

export function puedeEnviarseAlAgente(nivelRiesgo) {
  return nivelRiesgo !== 'rojo';
}

// Motivo legible para el checkbox deshabilitado (punto 4: "el checkbox
// aparece deshabilitado con el motivo").
export function motivoBloqueoRiesgo(ticket, config) {
  const modulosRojos = (config?.modulosRojos || []).map(_normalizar);
  const modulo = _normalizar(ticket?.modulo);
  if (modulo && modulosRojos.includes(modulo)) {
    return `Módulo "${ticket.modulo}" está marcado como rojo en Configuración.`;
  }
  const palabrasRojo = config?.palabrasRojo || [];
  const texto = _normalizar(`${ticket?.titulo || ''} ${ticket?.descripcion || ''}`);
  const match = palabrasRojo.find((p) => p && texto.includes(_normalizar(p)));
  if (match) return `Contiene la palabra clave de riesgo "${match}".`;
  return 'Marcado como rojo.';
}

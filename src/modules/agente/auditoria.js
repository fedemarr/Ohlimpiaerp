// AGENTE_TICKETS_OHLIMPIA.md, innegociable #8: "Todo —envío, callback,
// merge, comunicación— al audit log". Tabla agente_audit_log (sql/v172),
// RLS restringida a DEVELOPER igual que corridas_agente.
import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';

function nuevoIdLocal() {
  return ('a' + Date.now() + Math.floor(Math.random() * 900 + 100)).slice(-9);
}

export async function registrarAuditoriaAgente(corridaIdLocal, tipo, detalle, actor) {
  const fila = {
    id: Date.now(),
    corridaIdLocal: corridaIdLocal != null ? String(corridaIdLocal) : null,
    tipo,
    detalle: detalle || '',
    actor: actor || currentUser?.nombre || '',
  };
  if (!DB.agenteAuditLog) DB.agenteAuditLog = [];
  DB.agenteAuditLog.push(fila);
  await supaSync('agenteAuditLog', fila);
  return fila;
}

export function auditoriaDeCorrida(corridaIdLocal) {
  // _toCamel descarta created_at (ver supabase.js) — se ordena por `id`
  // (Date.now() al crear), que sí sobrevive el viaje ida y vuelta a Supabase.
  return (DB.agenteAuditLog || [])
    .filter((a) => String(a.corridaIdLocal) === String(corridaIdLocal))
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}

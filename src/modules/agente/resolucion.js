// AGENTE_TICKETS_OHLIMPIA.md, punto 8 — texto de la resolución al grupo.
// "Sale a partir del ticket y del resumen del agente, no del diff": función
// pura, sin acceso a DB, para que sea fácil de testear y de ajustar el
// formato sin tocar el resto del módulo.

export function generarResolucion(ticket, corrida) {
  const numero = ticket?.numero || ticket?.id || '?';
  const queProbar = corrida?.queProbar
    || (ticket?.modulo ? `Entrá al módulo "${ticket.modulo}" y probá el caso descrito en el ticket.` : 'Probá el caso descrito en el ticket original.');
  return [
    `✅ Ticket #${numero} — Resuelto y publicado`,
    '',
    'Qué pasaba:',
    ticket?.descripcion || ticket?.titulo || '—',
    '',
    'Qué se hizo:',
    corrida?.resumen || '—',
    '',
    'Qué probar:',
    queProbar,
  ].join('\n');
}

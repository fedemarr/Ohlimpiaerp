// Supabase Realtime — helper mínimo y reusable (v041). Primera vez que se
// usa Realtime en el proyecto; POLITICAS_PROYECTO.md ya lo documenta como
// el patrón preferido, por eso queda genérico acá en vez de amarrado a un
// solo módulo, aunque hoy el único consumidor es src/modules/developer/.

import { SUPA, _toCamel } from '@shared/supabase.js';

// Se suscribe a los INSERT nuevos de una tabla. Devuelve el channel — hay
// que guardarlo y pasarlo a desuscribirse() al desloguear, si no la
// conexión de websocket queda abierta después del logout.
export function suscribirseAInserts(tabla, onInsert) {
  return SUPA.channel('realtime-' + tabla)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: tabla },
      payload => onInsert(_toCamel(payload.new)))
    .subscribe();
}

export function desuscribirse(channel) {
  if (channel) SUPA.removeChannel(channel);
}

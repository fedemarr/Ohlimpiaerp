// Cliente para /api/sugerir-reasignacion (Vercel serverless). La API key
// de Anthropic vive solo del lado del servidor — acá solo se manda el
// token de la sesión actual, mismo patrón que src/shared/iaDocumentos.js.

import { SUPA } from '@shared/supabase.js';

export async function sugerirServicioDestino(nroSocio) {
  const { data } = await SUPA.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sesión no válida — volvé a iniciar sesión');

  const resp = await fetch('/api/sugerir-reasignacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nroSocio }),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.error || 'Error al generar las sugerencias');
  return body.sugerencias || [];
}

// Cliente para /api/analizar-documento (Vercel serverless). La API key de
// Anthropic vive solo del lado del servidor — acá solo se manda el token de
// la sesión actual, nunca ningún secreto.

import { SUPA } from '@shared/supabase.js';

export async function analizarDocumentoPDF({ tipo, path }) {
  const { data } = await SUPA.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sesión no válida — volvé a iniciar sesión');

  const resp = await fetch('/api/analizar-documento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tipo, path }),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.error || 'Error al analizar el documento');
  return body;
}

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

// Compara el DNI que la IA detectó en el documento contra el DNI real del
// registro — para agarrar el caso de que a alguien le suban el certificado
// de otra persona por error. Devuelve un banner de aviso en HTML, o cadena
// vacía si coincide o si la IA no pudo leer el DNI del documento.
export function chequearIdentidadIA(r, dniReal) {
  if (!r || !r.dniDetectado) return '';
  const soloDigitosDetectado = r.dniDetectado.replace(/\D/g, '');
  const soloDigitosReal = (dniReal || '').replace(/\D/g, '');
  if (!soloDigitosDetectado || soloDigitosDetectado === soloDigitosReal) return '';
  return '<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;font-size:12px;">'
    + '⚠️ <strong>El DNI del documento no coincide con el registro.</strong> '
    + 'El documento dice DNI ' + r.dniDetectado + (r.nombreDetectado ? ' (' + r.nombreDetectado + ')' : '') + ', '
    + 'pero este registro es de DNI ' + (dniReal || '—') + '. Verificá que sea el archivo correcto antes de usar estos datos.'
    + '</div>';
}

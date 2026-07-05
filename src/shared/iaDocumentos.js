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

// Normaliza un nombre para comparar de forma tolerante (sin acentos, sin
// mayúsculas, sin orden fijo de apellido/nombre) — separa en palabras para
// no romper con "Pérez Juan" vs "Juan Perez".
// Saca los diacríticos (acentos) por rango de código Unicode (U+0300-U+036F,
// "combining diacritical marks") en vez de un regex literal, para no
// depender de pegar el carácter especial directo en el código fuente.
function _sinAcentos(s) {
  return (s || '')
    .normalize('NFD')
    .split('')
    .filter(ch => {
      const code = ch.codePointAt(0);
      return !(code >= 0x0300 && code <= 0x036f);
    })
    .join('');
}

function _tokensNombre(s) {
  return _sinAcentos(s)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Compara dos nombres de forma tolerante: alcanza con que la mitad de las
// palabras coincidan (ignora acentos, mayúsculas y orden). Si a alguno le
// falta texto para comparar, no lo marca como problema (falta de dato, no
// contradicción).
function _nombresCoinciden(a, b) {
  const tokensA = _tokensNombre(a);
  const tokensB = _tokensNombre(b);
  if (!tokensA.length || !tokensB.length) return true;
  const setB = new Set(tokensB);
  const coincidencias = tokensA.filter(t => setB.has(t)).length;
  return coincidencias >= Math.min(tokensA.length, tokensB.length) * 0.5;
}

// Compara el nombre y DNI que la IA detectó en el documento contra los datos
// reales del registro — para agarrar el caso de que a alguien le suban el
// certificado de otra persona por error. Devuelve un banner de aviso en
// HTML, o cadena vacía si todo coincide (o si la IA no pudo leer esos datos).
export function chequearIdentidadIA(r, dniReal, nombreReal) {
  if (!r) return '';
  const problemas = [];

  if (r.dniDetectado) {
    const soloDigitosDetectado = r.dniDetectado.replace(/\D/g, '');
    const soloDigitosReal = (dniReal || '').replace(/\D/g, '');
    if (soloDigitosDetectado && soloDigitosDetectado !== soloDigitosReal) {
      problemas.push('el DNI del documento (' + r.dniDetectado + ') no coincide con el registro (' + (dniReal || '—') + ')');
    }
  }

  if (r.nombreDetectado && nombreReal && !_nombresCoinciden(r.nombreDetectado, nombreReal)) {
    problemas.push('el nombre del documento (' + r.nombreDetectado + ') no parece coincidir con el registro (' + nombreReal + ')');
  }

  if (!problemas.length) return '';
  return '<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;font-size:12px;">'
    + '⚠️ <strong>Revisar identidad:</strong> ' + problemas.join('; ') + '. Verificá que sea el archivo correcto antes de usar estos datos.'
    + '</div>';
}

// Adjuntos de Reportes y Sugerencias (tickets) — v1.2
//
// Permite adjuntar archivos a una sugerencia: .md, Excel, PDF, Word, CSV,
// imágenes, etc. Los archivos se suben al bucket privado `ohlimpia-adjuntos`
// bajo `sugerencias/{sugerenciaIdLocal}/{uuid}.{ext}` y se registran en la
// tabla `sugerencia_adjuntos` (append-only, v087).
//
// NO reusa subirAdjunto() de @shared/adjuntos.js a propósito: esa función
// invalida (vigente=false) el adjunto anterior del mismo (dni, tipo) —
// pensada para "1 documento vigente por tipo". Un ticket necesita VARIOS
// archivos y pueden agregarse en cualquier momento. Tampoco restrinjo los
// MIME a solo PDF/JPG/PNG: acá se admiten tipos de ofimática y markdown.
// Límite de tamaño: 10 MB (mismo que el bucket).

import { SUPA, supaSync, _toCamel } from '@shared/supabase.js';
import { obtenerUrlFirmada } from '@shared/adjuntos.js';
import { DB, currentUser } from '@shared/state.js';

const BUCKET = 'ohlimpia-adjuntos';
export const MAX_SIZE = 10 * 1024 * 1024;

export { obtenerUrlFirmada as obtenerUrlFirmadaSugerencia };

function _ext(filename) {
  const i = (filename || '').lastIndexOf('.');
  if (i < 0 || i === filename.length - 1) return 'bin';
  return filename.slice(i + 1).toLowerCase();
}

export async function subirAdjuntoSugerencia({ sugerenciaIdLocal, file }) {
  if (!sugerenciaIdLocal) throw new Error('Falta la sugerencia');
  if (!file) throw new Error('No se seleccionó ningún archivo');
  if (file.size > MAX_SIZE) {
    throw new Error(`El archivo (${(file.size / 1024 / 1024).toFixed(1)} MB) supera el límite de 10 MB`);
  }

  const e = _ext(file.name);
  const path = `sugerencias/${sugerenciaIdLocal}/${crypto.randomUUID()}.${e}`;

  const { error: upErr } = await SUPA.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error(`Error al subir el archivo: ${upErr.message}`);

  const nuevo = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    sugerenciaIdLocal,
    url: path,
    nombreArchivo: file.name,
    tipoMime: file.type || 'application/octet-stream',
    tamano: file.size,
    subidoPor: currentUser?.nombre || '—',
    subidoEn: new Date().toISOString(),
    borrado: false,
  };
  if (!DB.sugerenciaAdjuntos) DB.sugerenciaAdjuntos = [];
  DB.sugerenciaAdjuntos.push(nuevo);
  await supaSync('sugerenciaAdjuntos', nuevo);
  return nuevo;
}

export function listarAdjuntosDeSugerencia(sugerenciaIdLocal) {
  const target = String(sugerenciaIdLocal);
  return (DB.sugerenciaAdjuntos || [])
    .filter(a => !a.borrado && String(a.sugerenciaIdLocal).slice(-9) === target.slice(-9))
    .sort((a, b) => new Date(b.subidoEn) - new Date(a.subidoEn));
}

export async function borrarAdjuntoSugerencia(adjuntoId) {
  const a = (DB.sugerenciaAdjuntos || []).find(x => String(x.id) === String(adjuntoId));
  if (!a) return false;
  a.borrado = true;
  await supaSync('sugerenciaAdjuntos', a);
  return true;
}

// Carga desde Supabase los adjuntos de una sugerencia (para el modal de detalle
// tras un reload, cuando DB todavía no los tiene frescos). No usado en el render
// actual (DB se llena con supaInit), pero queda disponible por si hace falta.
export async function fetchAdjuntosDeSugerencia(sugerenciaIdLocal) {
  const { data, error } = await SUPA.from('sugerencia_adjuntos')
    .select('*')
    .eq('sugerencia_id_local', String(sugerenciaIdLocal))
    .eq('borrado', false)
    .order('subido_en', { ascending: false });
  if (error) return [];
  return (data || []).map(row => {
    const r = _toCamel(row);
    r.id = row.id;
    return r;
  });
}

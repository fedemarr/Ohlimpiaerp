// Situaciones Legales v1.1 — adjuntos de casos legales.
//
// NO reusa subirAdjunto() de @shared/adjuntos.js a propósito: esa
// función invalida (vigente=false) el adjunto anterior del mismo
// (dni, tipo) — pensada para "1 documento vigente por tipo" (foto de
// DNI, apto médico). Un caso legal necesita VARIOS documentos por
// caso, y una persona puede tener VARIOS casos — usar subirAdjunto()
// tal cual pisaría en silencio los documentos de un caso anterior
// cada vez que se cargue uno nuevo. Se sube directo a Storage (mismo
// bucket, mismo patrón de path) y se registra en una tabla propia,
// append-only, sin invalidar nada.

import { SUPA, supaSync } from '@shared/supabase.js';
import { obtenerUrlFirmada, MAX_SIZE, TIPOS_PERMITIDOS } from '@shared/adjuntos.js';
import { DB, currentUser } from '@shared/state.js';

const BUCKET = 'ohlimpia-adjuntos';

export { obtenerUrlFirmada as obtenerUrlFirmadaLegal };

function ext(filename) {
  const i = (filename || '').lastIndexOf('.');
  if (i < 0 || i === filename.length - 1) return 'bin';
  return filename.slice(i + 1).toLowerCase();
}

export async function subirAdjuntoLegal({ casoIdLocal, novedadIdLocal = null, file }) {
  if (!casoIdLocal) throw new Error('Falta el caso');
  if (!file) throw new Error('No se seleccionó ningún archivo');
  if (file.size > MAX_SIZE) {
    throw new Error(`El archivo (${(file.size / 1024 / 1024).toFixed(1)} MB) supera el límite de 10 MB`);
  }
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    throw new Error('Formato no permitido. Solo PDF, JPG o PNG');
  }

  const e = ext(file.name);
  const path = `legal/${casoIdLocal}/${crypto.randomUUID()}.${e}`;

  const { error: upErr } = await SUPA.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(`Error al subir el archivo: ${upErr.message}`);

  const nuevo = {
    id: Date.now(),
    casoIdLocal, novedadIdLocal,
    url: path, nombreArchivo: file.name, tipoMime: file.type, tamano: file.size,
    subidoPor: currentUser?.nombre || '',
    subidoEn: new Date().toISOString(),
  };
  if (!DB.casosLegalesAdjuntos) DB.casosLegalesAdjuntos = [];
  DB.casosLegalesAdjuntos.push(nuevo);
  await supaSync('casosLegalesAdjuntos', nuevo);
  return nuevo;
}

export function listarAdjuntosDeCaso(casoIdLocal) {
  return (DB.casosLegalesAdjuntos || [])
    .filter(a => !a.borrado && String(a.casoIdLocal) === String(casoIdLocal))
    .sort((a, b) => new Date(b.subidoEn) - new Date(a.subidoEn));
}

export async function borrarAdjuntoLegal(adjuntoId) {
  const a = (DB.casosLegalesAdjuntos || []).find(x => String(x.id) === String(adjuntoId));
  if (!a) return false;
  a.borrado = true;
  await supaSync('casosLegalesAdjuntos', a);
  return true;
}

// src/shared/autosave.js
// Borrador local (localStorage) con debounce, reutilizable por cualquier
// módulo del ERP. Guarda el estado de un formulario ante cada cambio y
// permite restaurarlo al reabrir, para no perder la carga ante recarga /
// cierre de pestaña / bloqueo del navegador. No guarda archivos ni datos
// pesados: solo el estado de campos de formulario.
//
// API:
//   guardarBorrador(key, data[, ms])  → escribe con debounce (default 500ms)
//   guardarBorradorAhora(key, data)   → escribe inmediato (para blur/change)
//   leerBorrador(key)                 → devuelve el objeto guardado o null
//   limpiarBorrador(key)              → borra el borrador de esa clave
//   flushBorradoresPendientes()       → fuerza la escritura de lo pendiente

const PREFIJO = 'ohlimpia:draft:';
const _timers = {};
const _pendientes = {};

function _clave(key) { return PREFIJO + key; }

function _escribir(key) {
  const data = _pendientes[key];
  delete _timers[key];
  delete _pendientes[key];
  if (data === undefined) return;
  try {
    localStorage.setItem(_clave(key), JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    console.warn('Autosave: no se pudo guardar el borrador "' + key + '"', e.message);
  }
}

export function guardarBorrador(key, data, ms = 500) {
  if (!key) return;
  _pendientes[key] = data;
  clearTimeout(_timers[key]);
  _timers[key] = setTimeout(() => _escribir(key), ms);
}

export function guardarBorradorAhora(key, data) {
  if (!key) return;
  _pendientes[key] = data;
  _escribir(key);
}

export function leerBorrador(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(_clave(key));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && obj.data !== undefined && obj.data !== null ? obj.data : null;
  } catch (e) {
    return null;
  }
}

export function limpiarBorrador(key) {
  if (!key) return;
  clearTimeout(_timers[key]);
  delete _timers[key];
  delete _pendientes[key];
  try { localStorage.removeItem(_clave(key)); } catch (e) {}
}

export function flushBorradoresPendientes() {
  Object.keys(_timers).forEach((k) => {
    clearTimeout(_timers[k]);
    _escribir(k);
  });
}

// Último guardado ante cierre/recarga de la página (best effort, por si el
// debounce no llegó a correr). No bloquea la navegación.
if (typeof window !== 'undefined') {
  const flush = () => flushBorradoresPendientes();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}

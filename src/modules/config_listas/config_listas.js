// v167 — Persistencia de los catálogos parametrizables de Configuración.
//
// Por qué este módulo existe: en Configuración hay 28 listas editables
// (zonas, medios, categorías, tipos de cliente, etapas del CRM, ...). Todas
// vivían como arrays hardcodeados en state.js / legacy.js y los botones
// "Agregar" / "Eliminar" solo hacían push/splice sobre DB[clave] — nunca
// llamaban a supaSync. Resultado: al recargar la página volvía el array
// hardcodeado y todo lo agregado se perdía, con un toast de "✓ agregado"
// que hacía creer que sí se había guardado (tickets #193 y #194).
//
// El arreglo sigue el criterio que ya usa Reasignaciones para sus motivos
// y aprobadores (motivos_reasignacion / aprobadores_reasignacion, v021):
// una tabla de config con soft delete. Acá se generaliza a una sola tabla
// `config_listas` (clave, valor, color, orden, anulado) compartida por las
// 28 listas, en vez de 28 tablas.
//
// FLUJO
//   1. supaInit() llena DB.configListas con las filas de la tabla.
//   2. hidratarListas() (llamada desde main.js justo después) pisa cada
//      DB[clave] con lo persistido; si una clave no tiene filas, deja el
//      default de CATALOGO_LISTAS. El resto del ERP sigue leyendo
//      DB[clave] — un array plano de strings — sin enterarse de nada.
//   3. agregarValor() / eliminarValor() escriben la fila y actualizan el
//      array plano en memoria.
//
// NOTA — POR QUÉ NO USA supaSync
//   supaSync() deriva el id_local de `String(obj.id).slice(-9)`, que con
//   un id que no sea puramente numérico produce claves ininteligibles
//   ('cfg_tipcli_01' -> 'ipcli_01'). Estas filas necesitan un id_local
//   estable y legible, así que van con SUPA directo — mismo criterio que el
//   módulo accesos (ver el comentario de perfilAccesos en _SM).

import { DB } from '@shared/state.js';
import { SUPA } from '@shared/supabase.js';
import { CATALOGO_LISTAS, COLOR_ETAPAS_CRM } from './catalogo.js';

const TABLA = 'config_listas';

// id_local legible de 9 caracteres, único en la práctica: 'c' + los últimos
// 5 dígitos del timestamp + 3 dígitos aleatorios. El UNIQUE real está en
// (clave, valor) entre los no anulados — esto solo evita que dos altas en
// el mismo milisegundo se pisen.
function nuevoIdLocal() {
  return ('c' + Date.now() + Math.floor(Math.random() * 900 + 100)).slice(-9);
}

// ========== HIDRATAR ==========

// Pisa los DB[clave] con lo que hay persistido. Se llama UNA vez, después
// de supaInit(). Devuelve cuántas claves quedaron servidas desde Supabase
// (para el log de arranque, no es crítico).
export function hidratarListas() {
  const filas = DB.configListas || [];
  let desdeSupa = 0;
  for (const clave of Object.keys(CATALOGO_LISTAS)) {
    const DEFAULT = CATALOGO_LISTAS[clave];
    const propias = filas
      .filter(f => f.clave === clave && !f.anulado)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    if (propias.length) {
      DB[clave] = propias.map(f => f.valor);
      desdeSupa++;
    } else {
      // Sin filas para esta clave: se deja el default. Es el caso de una
      // base donde la tabla se acaba de crear y la semilla no corrió, y el
      // de una empresa cliente nueva. No se escribe nada en Supabase por
      // esto — la lista se materializa sola la primera vez que se agrega
      // algo desde Configuración.
      DB[clave] = [...DEFAULT];
    }
  }
  // DB.colorEtapasCRM es un objeto {etapa: color} paralelo a DB.etapasCRM —
  // lo lee renderCfgEtapasCRM() para pintar cada fila.
  if (!DB.colorEtapasCRM) DB.colorEtapasCRM = {};
  const etapas = filas.filter(f => f.clave === 'etapasCRM' && !f.anulado);
  for (const e of etapas) {
    if (e.color) DB.colorEtapasCRM[e.valor] = e.color;
  }
  for (const [etapa, color] of Object.entries(COLOR_ETAPAS_CRM)) {
    if (!DB.colorEtapasCRM[etapa]) DB.colorEtapasCRM[etapa] = color;
  }
  console.log('⚙️  Listas de configuración hidratadas:', desdeSupa, 'de', Object.keys(CATALOGO_LISTAS).length, 'desde Supabase');
  return desdeSupa;
}

// ========== HELPERS ==========

function filaViva(clave, valor) {
  return (DB.configListas || []).find(f => f.clave === clave && f.valor === valor && !f.anulado);
}

function proximoOrden(clave) {
  const ordenes = (DB.configListas || []).filter(f => f.clave === clave).map(f => f.orden || 0);
  return (ordenes.length ? Math.max(...ordenes) : 0) + 1;
}

function asegurarArreglo(clave) {
  if (!Array.isArray(DB[clave])) DB[clave] = CATALOGO_LISTAS[clave] ? [...CATALOGO_LISTAS[clave]] : [];
  return DB[clave];
}

const CLAVE_SOPORTA_COLOR = (clave) => clave === 'etapasCRM';

// ========== ESCRITURA ==========

// Agrega un valor a una lista. Devuelve { ok, motivo } para que el llamador
// pueda distinguir "ya existía" de un error real de Supabase (antes el
// toast de éxito se mostrara siempre, incluso si el guardado fallaba).
export async function agregarValor(clave, valor, color = null) {
  const val = String(valor || '').trim();
  if (!val) return { ok: false, motivo: 'vacio' };
  if (!CATALOGO_LISTAS[clave]) return { ok: false, motivo: 'clave_desconocida' };
  if (filaViva(clave, val)) return { ok: false, motivo: 'duplicado' };

  const fila = {
    id_local: nuevoIdLocal(),
    clave,
    valor: val,
    color: color || null,
    orden: proximoOrden(clave),
    anulado: false,
  };
  const { data, error } = await SUPA.from(TABLA).insert(fila).select().single();
  if (error) {
    console.warn('config_listas insert error:', clave, error.message);
    return { ok: false, motivo: 'error_supabase', detalle: error.message };
  }
  if (!DB.configListas) DB.configListas = [];
  DB.configListas.push(data);
  asegurarArreglo(clave).push(val);
  if (color && CLAVE_SOPORTA_COLOR(clave)) {
    if (!DB.colorEtapasCRM) DB.colorEtapasCRM = {};
    DB.colorEtapasCRM[val] = color;
  }
  return { ok: true };
}

// Soft delete del valor. Recibe el VALOR (no el índice): el índice en el
// array plano es frágil y el valor es la clave natural de la fila.
export async function eliminarValor(clave, valor) {
  const fila = filaViva(clave, valor);
  if (!fila) return { ok: false, motivo: 'no_existe' };
  const { error } = await SUPA.from(TABLA).update({ anulado: true }).eq('id_local', fila.id_local);
  if (error) {
    console.warn('config_listas update error:', clave, error.message);
    return { ok: false, motivo: 'error_supabase', detalle: error.message };
  }
  fila.anulado = true;
  const arr = asegurarArreglo(clave);
  const i = arr.indexOf(valor);
  if (i >= 0) arr.splice(i, 1);
  if (DB.colorEtapasCRM) delete DB.colorEtapasCRM[valor];
  return { ok: true };
}

// Cambia el color de una etapa del CRM (única lista con color).
export async function setColorEtapaCRM(etapa, color) {
  const fila = filaViva('etapasCRM', etapa);
  if (!DB.colorEtapasCRM) DB.colorEtapasCRM = {};
  DB.colorEtapasCRM[etapa] = color;
  if (!fila) return { ok: true, motivo: 'solo_memoria' };
  const { error } = await SUPA.from(TABLA).update({ color }).eq('id_local', fila.id_local);
  if (error) {
    console.warn('config_listas color error:', error.message);
    return { ok: false, motivo: 'error_supabase', detalle: error.message };
  }
  fila.color = color;
  return { ok: true };
}

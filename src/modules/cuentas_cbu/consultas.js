// Cuentas CBU v1 — Padrón de cuentas bancarias (ticket "Módulo cuentas
// bancarias", CUENTAS_BANCARIAS_para_Fede_2.md + mockup_cuentas_bancarias_3.html).
//
// FUENTE ÚNICA del CBU de cada asociado — mismo patrón que el padrón de
// categorías (src/modules/categorias/consultas.js + padron.js) con
// Legajos: el legajo LEE de acá, no guarda su propia copia editable.
//
// Una fila VIVA por asociado (no versionado por vigencia — a diferencia
// del padrón de categorías, acá no importa la cuenta que tenía en el
// pasado para calcular nada, solo la actual). id_local estable
// ('CBU' + legajoNro) para que supaSync() siempre actualice la misma fila
// en vez de crear una nueva en cada guardado. El historial de cambios va
// aparte, en cuentas_cbu_historial (append-only).

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { normalizarCbu } from '@shared/helpers.js';

// ========== VALIDACIÓN CBU (dígitos verificadores) ==========
// Algoritmo real de CBU argentino (módulo 10 con pesos), verificado en el
// mockup contra los 499 CBU reales del archivo de agosto: cero inválidos.

export function cbuChecksumValido(cbuCrudo) {
  const cbu = normalizarCbu(cbuCrudo);
  if (!/^\d{22}$/.test(cbu)) return false;
  const w1 = [7, 1, 3, 9, 7, 1, 3];
  let s = 0;
  for (let i = 0; i < 7; i++) s += parseInt(cbu[i], 10) * w1[i];
  if ((10 - s % 10) % 10 !== parseInt(cbu[7], 10)) return false;
  const w2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  s = 0;
  for (let j = 0; j < 13; j++) s += parseInt(cbu[8 + j], 10) * w2[j];
  return (10 - s % 10) % 10 === parseInt(cbu[21], 10);
}

// Bancos deducidos de los primeros 3 dígitos del CBU (realidad del padrón:
// BBVA ~79% · Macro ~21% · 1 excepción real en Provincia — el resto queda
// como "Otro banco (XXX)", nunca bloquea la carga).
const BANCOS_PREFIJO = {
  '007': 'Galicia', '011': 'Nación', '014': 'Bco. Provincia', '017': 'BBVA',
  '072': 'Santander', '285': 'Macro',
};
const BANCOS_ESPERADOS = ['017', '285']; // BBVA y Macro — cualquier otro es EXCEPCIÓN

export function deducirBanco(cbuCrudo) {
  const cbu = normalizarCbu(cbuCrudo);
  if (cbu.length < 3) return { nombre: '', prefijo: '', esExcepcion: false };
  const prefijo = cbu.slice(0, 3);
  return {
    nombre: BANCOS_PREFIJO[prefijo] || ('Otro banco (' + prefijo + ')'),
    prefijo,
    esExcepcion: !BANCOS_ESPERADOS.includes(prefijo),
  };
}

// ========== CONSULTA ==========

export function getCuentaCbu(legajoNro) {
  return (DB.cuentasCbu || []).find(c => !c.anulado && String(c.legajoNro) === String(legajoNro)) || null;
}

// Usado por Legajos (fuente única) — devuelve el CBU solo si la cuenta
// está ACTIVA, null en cualquier otro caso (nunca inventa un valor).
export function cbuVigenteLegajo(legajoNro) {
  const c = getCuentaCbu(legajoNro);
  return c && c.estado === 'ACTIVA' ? c.cbu : null;
}

function _idCuenta(legajoNro) { return 'CBU' + String(legajoNro); }
function _idHist() { return 'CBUHIST-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }

// ========== ESCRITURA ==========
//
// Crea o actualiza la fila viva de un asociado. Si cambia el CBU o el
// banco respecto de lo que había, registra un evento en el historial.
// Devuelve la fila guardada, o null si falló el guardado en el servidor.
export async function guardarCuentaCbu({ legajoNro, nombreAsociado, estado, cbu, alias, banco, cuitTitular, esTercero, vigenteDesde, tramiteBanco, tramiteFecha, tramitePor, tramiteObservaciones, motivo }) {
  if (!legajoNro || !estado) return null;
  if (!DB.cuentasCbu) DB.cuentasCbu = [];
  const previa = getCuentaCbu(legajoNro);
  const huboCambioCbu = estado === 'ACTIVA' && cbu && (!previa || normalizarCbu(previa.cbu) !== normalizarCbu(cbu) || previa.banco !== banco);

  const fila = {
    id: _idCuenta(legajoNro),
    legajoNro: String(legajoNro),
    nombreAsociado: nombreAsociado || previa?.nombreAsociado || '',
    estado,
    cbu: cbu ? normalizarCbu(cbu) : (previa?.cbu || ''),
    alias: alias ?? previa?.alias ?? '',
    banco: banco ?? previa?.banco ?? '',
    cuitTitular: cuitTitular ?? previa?.cuitTitular ?? '',
    esTercero: !!esTercero,
    vigenteDesde: vigenteDesde || previa?.vigenteDesde || null,
    tramiteBanco: tramiteBanco ?? previa?.tramiteBanco ?? '',
    tramiteFecha: tramiteFecha ?? previa?.tramiteFecha ?? null,
    tramitePor: tramitePor ?? previa?.tramitePor ?? '',
    tramiteObservaciones: tramiteObservaciones ?? previa?.tramiteObservaciones ?? '',
    motivo: motivo || '',
    cargadoPor: currentUser?.nombre || '',
    cargadoEn: new Date().toISOString(),
    anulado: false,
  };

  const ok = await supaSync('cuentasCbu', fila);
  if (!ok) return null;

  const idx = DB.cuentasCbu.findIndex(c => String(c.legajoNro) === String(legajoNro));
  if (idx >= 0) DB.cuentasCbu[idx] = fila; else DB.cuentasCbu.push(fila);

  if (huboCambioCbu) {
    const hist = {
      id: _idHist(),
      legajoNro: String(legajoNro),
      nombreAsociado: fila.nombreAsociado,
      cbuAnterior: previa?.cbu || '',
      cbuNuevo: fila.cbu,
      bancoAnterior: previa?.banco || '',
      bancoNuevo: fila.banco,
      motivo: motivo || (previa ? 'Cambio de cuenta' : 'Carga inicial'),
      cargadoPor: currentUser?.nombre || '',
      cargadoEn: new Date().toISOString(),
    };
    if (!DB.cuentasCbuHistorial) DB.cuentasCbuHistorial = [];
    DB.cuentasCbuHistorial.push(hist);
    await supaSync('cuentasCbuHistorial', hist);
  }

  return fila;
}

// Llamado por Altas al confirmar el alta de un asociado (ver altas.js) —
// "la fila nace sola, nadie tiene que acordarse de crearla" (.md §1). Si
// Altas ya recogió un CBU válido en su tab Capital, la cuenta arranca
// directamente ACTIVA (origen ALTA); si no, arranca SIN_CUENTA y cae en
// la bandeja de pendientes.
export async function crearFilaAltaCbu(legajoNro, nombreAsociado, { cbu, banco, cuitTitular } = {}) {
  if (getCuentaCbu(legajoNro)) return; // ya existe (no debería, pero por si el alta se reintenta)
  const cbuOk = cbu && cbuChecksumValido(cbu);
  await guardarCuentaCbu({
    legajoNro, nombreAsociado,
    estado: cbuOk ? 'ACTIVA' : 'SIN_CUENTA',
    cbu: cbuOk ? cbu : '',
    banco: cbuOk ? (banco || deducirBanco(cbu).nombre) : '',
    cuitTitular: cbuOk ? cuitTitular : '',
    vigenteDesde: cbuOk ? new Date().toISOString().slice(0, 10) : null,
    motivo: 'Alta de asociado',
  });
}

export function historialCuentaCbu(legajoNro) {
  return (DB.cuentasCbuHistorial || [])
    .filter(h => String(h.legajoNro) === String(legajoNro))
    .sort((a, b) => String(b.cargadoEn).localeCompare(String(a.cargadoEn)));
}

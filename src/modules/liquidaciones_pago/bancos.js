// Liquidaciones — Pago de retiros: formateadores de "hoja de copiado" por
// banco (LIQUIDACIONES_pago_archivos_para_Fede_2.md §3, relevado byte a
// byte contra el .prn real de BBVA y la plantilla real de Macro).
//
// IMPORTANTE — por qué "hoja de copiado" y no el archivo final del banco:
// los dos bancos exigen pasar por SU planilla con macro propia (es la que
// genera el archivo encriptado/.prn que acepta el portal). Este generador
// no reemplaza esa planilla — genera un Excel con las columnas EXACTAS de
// la planilla del banco, en el mismo orden, para pegar de una sola vez
// (Ctrl+A → Ctrl+C → Ctrl+V) y apretar el botón del banco. Por eso cada
// función de acá devuelve un array de arrays (filas de celdas) listo para
// convertir a .xlsx con todas las celdas como TEXTO — no importa
// "adivinar" un separador de columnas porque nunca se abre como .csv.
//
// Desacoplado a propósito (pedido del ticket): agregar un banco nuevo es
// sumar una función más acá, sin tocar pago.js (que solo arma los datos
// y elige la función según cuenta.banco).

import { normalizarCbu } from '@shared/helpers.js';

// ========== BBVA — planilla "Adaptación haberes" LFC03, Frances Net Cash ==========
//
// Columnas A-I: ID Empleado(18d) · Nombre(máx 36) · CBU(22d) · Importe
// (MCCC,DD con ceros a la izq.) · Año · Mes · Día (separados) · CUIL(11d)
// · Concepto. Límite de la planilla: 150 registros por archivo — se
// parte en bloques acá.
export const BBVA_LIMITE_POR_ARCHIVO = 150;

// "0000000646392,88" — 13 dígitos de parte entera con ceros a la
// izquierda, coma, 2 decimales. Se opera en centavos (entero) para no
// arrastrar error de punto flotante en el redondeo.
export function formatImporteBBVA(monto) {
  const centavos = Math.round((Number(monto) || 0) * 100);
  const enteros = Math.floor(Math.abs(centavos) / 100);
  const decimales = Math.abs(centavos) % 100;
  return String(enteros).padStart(13, '0') + ',' + String(decimales).padStart(2, '0');
}

export function formatIdEmpleadoBBVA(nroSocio) {
  return String(nroSocio || '').replace(/\D/g, '').padStart(18, '0');
}

export function formatCuil(cuit) {
  return String(cuit || '').replace(/\D/g, '').padStart(11, '0');
}

// items: [{ nroSocio, nombre, cbu, cuit, monto }]. fechaISO: 'YYYY-MM-DD'
// (fecha de acreditación elegida al confirmar la tanda). concepto:
// 'RETIROS' | 'ADELANTOS'.
export function filasHojaBBVA(items, fechaISO, concepto = 'RETIROS') {
  const [anio, mes, dia] = String(fechaISO).split('-');
  const header = ['ID Empleado', 'Nombre y apellido', 'CBU', 'Importe neto', 'Año', 'Mes', 'Día', 'CUIL', 'Concepto'];
  const filas = items.map(it => [
    formatIdEmpleadoBBVA(it.nroSocio),
    String(it.nombre || '').slice(0, 36),
    normalizarCbu(it.cbu),
    formatImporteBBVA(it.monto),
    anio, mes, dia,
    formatCuil(it.cuit),
    concepto,
  ]);
  return [header, ...filas];
}

// Bloques de 150 (BBVA_LIMITE_POR_ARCHIVO) — cada uno con su propio
// encabezado, listo para un archivo .xlsx propio.
export function bloquesHojaBBVA(items, fechaISO, concepto = 'RETIROS') {
  const bloques = [];
  for (let i = 0; i < items.length; i += BBVA_LIMITE_POR_ARCHIVO) {
    bloques.push(items.slice(i, i + BBVA_LIMITE_POR_ARCHIVO));
  }
  if (!bloques.length) bloques.push([]);
  return bloques.map(b => filasHojaBBVA(b, fechaISO, concepto));
}

// ========== MACRO — plantilla del banco (convenio 117176) ==========
//
// LEGAJO · CUIL · APELLIDO Y NOMBRE · CUENTA · CBU · IMPORTE ·
// COMPROBANTE. CUENTA no es un dato nuevo del padrón — se DERIVA del CBU
// (fórmula verificada contra 210/210 pares reales):
//   CUENTA = "4" + CBU[posiciones 5-7] + CBU[posiciones 11-21]
export function deducirCuentaMacro(cbuCrudo) {
  const cbu = normalizarCbu(cbuCrudo);
  if (cbu.length !== 22) return '';
  return '4' + cbu.slice(4, 7) + cbu.slice(10, 21);
}

function formatImporteMacro(monto) {
  // Sin spec byte-a-byte para Macro (a diferencia de BBVA, relevado del
  // .prn real) — se usa el mismo formato con coma decimal del resto del
  // sistema. Si Nati confirma que la plantilla necesita otro formato,
  // se ajusta acá sin tocar el resto del generador.
  return (Number(monto) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// items: [{ nroSocio, nombre, cbu, cuit, monto }]
export function filasHojaMacro(items) {
  const header = ['LEGAJO', 'CUIL', 'APELLIDO Y NOMBRE', 'CUENTA', 'CBU', 'IMPORTE', 'COMPROBANTE'];
  const filas = items.map(it => [
    String(it.nroSocio || ''),
    formatCuil(it.cuit),
    String(it.nombre || ''),
    deducirCuentaMacro(it.cbu),
    normalizarCbu(it.cbu),
    formatImporteMacro(it.monto),
    '', // Comprobante: lo completa el banco al procesar, no se genera acá
  ]);
  return [header, ...filas];
}

// ========== Clasificación por banco ==========
//
// Solo BBVA y Macro tienen hoja de copiado — el resto (hoy: 1 cuenta real
// en Provincia) sale en un listado aparte para pago manual, dentro del
// mismo lote (§3c del documento).
export function clasificarPorBanco(items) {
  const bbva = items.filter(it => it.banco === 'BBVA');
  const macro = items.filter(it => it.banco === 'Macro');
  const excepciones = items.filter(it => it.banco !== 'BBVA' && it.banco !== 'Macro');
  return { bbva, macro, excepciones };
}

// Monotributo v2 (MONOTRIBUTO_v2_mes_en_curso_para_Fede.md, punto 3) — "el
// lector de comprobantes: una pieza, usada en dos lugares". El comprobante es
// el ticket Telerecargas/pago24 de "Cobro de Servicios" a "ARCA MONOTRIBUTO
// FIS" (formato fijo). Se lee con la IA ya usada para otros documentos
// (api/analizar-documento.js, tipo nuevo 'comprobante-monotributo') y se
// matchea contra la cuota REAL calculada por calcularCuotaComponentes()
// (legacy.js, expuesta acá como window.calcularCuotaComponentes — es el
// motor validado contra 399 credenciales reales, no se reinventa una tabla
// de cuotas nueva).
//
// Todo cuadra → se tilda solo. Algo no cuadra → "en revisión", el sistema
// propone y Martina decide — nunca se tilda pagado=true por un comprobante
// que no cierra.
//
// Dos puntos de entrada, mismo motor:
//  - confirmarComprobanteBandeja: bandeja de pendientes → promueve a
//    `monotributos` (Padrón) + primer período en `mono_pagos_mes`.
//  - confirmarComprobantePagoMensual: tab Pago mensual → tilda una fila de
//    `mono_pagos_mes` que "Armar lista" ya había creado.

import { DB, currentUser } from '@shared/state.js';
import { SUPA, supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';
import { analizarDocumentoPDF } from '@shared/iaDocumentos.js';
import { normalizarCuit } from '@modules/proveedores/logica.js';

const BUCKET_MONO = 'ohlimpia-adjuntos';

// Selector de archivo ad-hoc (sin <input> fijo en el HTML) — se usa desde
// filas de tabla dinámicas (Pago mensual, Bandeja), donde no hay un modal
// con un id fijo para colgar el <input type=file>.
export function elegirArchivoComprobante(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,image/jpeg,image/png';
  input.onchange = () => { if (input.files[0]) callback(input.files[0]); };
  input.click();
}

function _mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 'MM/AAAA' (como lo lee la IA, formato del ticket) → 'YYYY-MM'. Tolera que
// ya venga en 'YYYY-MM' (por si el modelo alguna vez normaliza distinto).
export function normalizarPeriodoLeido(periodoTexto) {
  const s = String(periodoTexto || '').trim();
  const mmAaaa = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmAaaa) return `${mmAaaa[2]}-${mmAaaa[1].padStart(2, '0')}`;
  const yyyyMm = s.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyyMm) return `${yyyyMm[1]}-${yyyyMm[2].padStart(2, '0')}`;
  return '';
}

// Pura y testeable: NO llama a calcularCuotaComponentes ni a Supabase — el
// llamador (código de browser) calcula `cuotaEsperada` con el motor real
// (window.calcularCuotaComponentes) y se la pasa ya resuelta. Así este
// archivo se puede testear con Vitest sin mockear `window` ni la base.
export function matchComprobante(datosLeidos, esperado) {
  const cuitLeido = normalizarCuit(datosLeidos?.cuit);
  if (!cuitLeido) return { ok: false, motivo: 'No se pudo leer el CUIT del comprobante' };
  const cuitEsperado = normalizarCuit(esperado?.cuit);
  if (cuitEsperado && cuitLeido !== cuitEsperado) {
    return { ok: false, motivo: `El CUIT del comprobante (${cuitLeido}) no coincide con el de ${esperado.nombre || 'la persona'} (${cuitEsperado})` };
  }
  const periodoLeido = normalizarPeriodoLeido(datosLeidos?.periodo);
  if (!periodoLeido) return { ok: false, motivo: 'No se pudo leer el período del comprobante' };
  if (esperado?.periodoEsperado && periodoLeido !== esperado.periodoEsperado) {
    return { ok: false, motivo: `El período del comprobante (${datosLeidos.periodo}) no es el esperado (${esperado.periodoEsperado})` };
  }
  if (esperado?.cuotaEsperada == null) {
    return { ok: false, motivo: 'No se pudo calcular la cuota esperada para comparar (¿falta la tabla de categorías vigente?)' };
  }
  // Comparación en centavos (enteros) para no arrastrar errores de punto
  // flotante de un simple `Math.abs(a-b) > 0.01` (ej. 43941.41 - 43941.40
  // da 0.010000000000047748 en JS, que "> 0.01" — un redondeo legítimo de
  // un centavo terminaba marcado como que no cuadra).
  const importeLeido = Number(datosLeidos?.importe) || 0;
  const centavosLeidos = Math.round(importeLeido * 100);
  const centavosEsperados = Math.round(esperado.cuotaEsperada * 100);
  if (Math.abs(centavosLeidos - centavosEsperados) > 1) {
    return { ok: false, motivo: `El importe del comprobante ($${importeLeido.toLocaleString('es-AR')}) no coincide con la cuota vigente ($${esperado.cuotaEsperada.toLocaleString('es-AR')})` };
  }
  return { ok: true };
}

// Shape de una fila `monotributos` nueva a partir de los datos cargados en
// el alta (mono_tramites) — mismo shape que arma guardarMonotributo()
// (legacy.js) para la ficha manual, pura para poder testearla.
export function construirRegistroMonotributoDesdeTramite(tramite, legajo) {
  return {
    id: Date.now(),
    nombre: tramite.nombreAsociado || legajo?.nombre || '',
    nroSocio: String(legajo?.nro ?? tramite.legajoNro ?? ''),
    cuit: legajo?.cuit || '',
    categoria: tramite.categoria,
    fechaAlta: tramite.fechaInicioMt || new Date().toISOString().slice(0, 10),
    zona: tramite.zona || 'provincia',
    condicion: tramite.condicion || 'comun',
    jubilado: false,
    iibbAporta: !!tramite.iibbAporta,
    cur: 0,
    curManual: false,
    adherentesCantidad: tramite.adherentesCantidad || 0,
    estado: 'Al día',
    obs: '',
    historialCategorias: [],
  };
}

// Shape de una fila `mono_pagos_mes` a partir de un desglose ya calculado
// (calcularCuotaComponentes) + el resultado del match — pura.
export function construirFilaPagoMes({ persona, periodo, desglose, datosLeidos, comprobantePath, resultado }) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    periodo,
    nroSocio: persona.nroSocio || null,
    nombre: persona.nombre,
    impIntegradoCongelado: desglose.imp, sipaCongelado: desglose.sipa,
    obraSocialCongelado: desglose.os, iibbCongelado: desglose.iibb,
    condicionCongelada: persona.condicion || 'comun', categoriaCongelada: persona.categoria,
    curCongelado: desglose.total, adherentesMontoCongelado: 0, total: desglose.total,
    adherentesCantidadCongelada: persona.adherentesCantidad || 0,
    pagado: resultado.ok, metodoPago: resultado.ok ? 'Comprobante' : null,
    pagadoPor: resultado.ok ? (currentUser?.nombre || '') : null,
    pagadoEn: resultado.ok ? new Date().toISOString() : null,
    comprobantePath, comprobanteTransaccion: datosLeidos?.transaccion || '',
    comprobanteImporteLeido: Number(datosLeidos?.importe) || 0,
    comprobanteFechaPago: datosLeidos?.fechaPago || null,
    enRevision: !resultado.ok, enRevisionMotivo: resultado.ok ? null : resultado.motivo,
  };
}

async function _subirComprobante(nroSocioOKey, periodo, file) {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
  const path = `mono-comprobantes/${nroSocioOKey || 'sin-socio'}/${periodo}-${Date.now()}.${ext}`;
  const { error } = await SUPA.storage.from(BUCKET_MONO).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error('No se pudo subir el comprobante: ' + error.message);
  return path;
}

function _cuotaEsperada(persona) {
  if (typeof window.calcularCuotaComponentes !== 'function') return null;
  if (persona.curManual && persona.cur > 0) return persona.cur;
  return window.calcularCuotaComponentes(persona).total;
}

function _refrescarPantallasMono() {
  if (window.renderMonoPendientes) window.renderMonoPendientes();
  if (window.renderMonotributos) window.renderMonotributos();
  if (window.renderMonoPagos) window.renderMonoPagos();
}

// ── Punto de entrada 1: Bandeja de pendientes ──
// La persona todavía NO existe en el Padrón (monotributos) — si el
// comprobante matchea, esta función la crea ahí y registra el primer
// período pagado; si no matchea, deja constancia "en revisión" sin tocar
// el Padrón ni cerrar el trámite (la fila sigue en la bandeja).
export async function confirmarComprobanteBandeja(legajoNro, file) {
  const tramite = (DB.monoTramites || []).find(t => !t.anulado && String(t.legajoNro) === String(legajoNro));
  if (!tramite || !tramite.categoria) {
    toast('⚠️ Esta fila todavía no tiene los datos del monotributo cargados — completá el alta primero');
    return { ok: false };
  }
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(legajoNro));
  const persona = {
    nombre: tramite.nombreAsociado || legajo?.nombre || '',
    nroSocio: String(legajoNro),
    cuit: legajo?.cuit || '',
    categoria: tramite.categoria, zona: tramite.zona || 'provincia',
    condicion: tramite.condicion || 'comun', iibbAporta: !!tramite.iibbAporta,
    adherentesCantidad: tramite.adherentesCantidad || 0,
  };
  const periodo = _mesActual();

  let path;
  try { path = await _subirComprobante(legajoNro, periodo, file); }
  catch (e) { toast('⚠️ ' + e.message); return { ok: false }; }

  let datosLeidos;
  try { datosLeidos = await analizarDocumentoPDF({ tipo: 'comprobante-monotributo', path }); }
  catch (e) { toast('⚠️ ' + e.message); return { ok: false }; }

  const cuotaEsperada = _cuotaEsperada(persona);
  const resultado = matchComprobante(datosLeidos, { cuit: persona.cuit, nombre: persona.nombre, periodoEsperado: periodo, cuotaEsperada });
  const desglose = window.calcularCuotaComponentes ? window.calcularCuotaComponentes(persona) : { imp: 0, sipa: 0, os: 0, iibb: 0, total: 0 };
  const filaPago = construirFilaPagoMes({ persona, periodo, desglose, datosLeidos, comprobantePath: path, resultado });

  if (!DB.monoPagosMes) DB.monoPagosMes = [];
  DB.monoPagosMes.push(filaPago);
  await supaSync('monoPagosMes', filaPago);

  if (!resultado.ok) {
    toast('⚠️ El comprobante no coincide: ' + resultado.motivo + ' — revisalo en la pestaña "Pago mensual" (En revisión).');
    _refrescarPantallasMono();
    return { ok: false, motivo: resultado.motivo };
  }

  const registro = construirRegistroMonotributoDesdeTramite(tramite, legajo);
  DB.monotributos = DB.monotributos || [];
  DB.monotributos.push(registro);
  const okPadron = await supaSync('monotributos', registro);
  if (!okPadron) {
    DB.monotributos.pop();
    toast('⚠️ El comprobante matcheó pero no se pudo guardar el alta en el Padrón — reintentá');
    return { ok: false };
  }

  tramite.anulado = true;
  await supaSync('monoTramites', tramite);

  toast(`✅ ${registro.nombre} → monotributo ACTIVO. Comprobante de ${periodo} registrado — salió de la bandeja y entró al Padrón.`);
  _refrescarPantallasMono();
  return { ok: true };
}

// ── Punto de entrada 2: tab Pago mensual ──
// La persona YA existe en el Padrón y ya tiene una fila armada en
// mono_pagos_mes (por "Armar lista del mes") — esto solo la confirma.
export async function confirmarComprobantePagoMensual(pagoMesId, file) {
  const pago = (DB.monoPagosMes || []).find(p => String(p.id) === String(pagoMesId));
  if (!pago) { toast('⚠️ No se encontró la fila de pago'); return { ok: false }; }
  if (pago.pagado) { toast('⚠️ Esta fila ya está pagada'); return { ok: false }; }
  const persona = (DB.monotributos || []).find(r => (pago.nroSocio && String(r.nroSocio) === String(pago.nroSocio)) || r.nombre === pago.nombre);
  if (!persona) { toast('⚠️ No se encontró a esta persona en el Padrón'); return { ok: false }; }

  let path;
  try { path = await _subirComprobante(pago.nroSocio, pago.periodo, file); }
  catch (e) { toast('⚠️ ' + e.message); return { ok: false }; }

  let datosLeidos;
  try { datosLeidos = await analizarDocumentoPDF({ tipo: 'comprobante-monotributo', path }); }
  catch (e) { toast('⚠️ ' + e.message); return { ok: false }; }

  const cuotaEsperada = _cuotaEsperada(persona);
  const resultado = matchComprobante(datosLeidos, { cuit: persona.cuit, nombre: persona.nombre, periodoEsperado: pago.periodo, cuotaEsperada });

  pago.comprobantePath = path;
  pago.comprobanteTransaccion = datosLeidos?.transaccion || '';
  pago.comprobanteImporteLeido = Number(datosLeidos?.importe) || 0;
  pago.comprobanteFechaPago = datosLeidos?.fechaPago || null;
  pago.enRevision = !resultado.ok;
  pago.enRevisionMotivo = resultado.ok ? null : resultado.motivo;
  if (resultado.ok) {
    pago.pagado = true;
    pago.metodoPago = 'Comprobante';
    pago.pagadoPor = currentUser?.nombre || '';
    pago.pagadoEn = new Date().toISOString();
  }
  await supaSync('monoPagosMes', pago);

  toast(resultado.ok
    ? `✓ Comprobante de ${pago.nombre} leído: CUIT + importe + período OK → tildado.`
    : '⚠️ En revisión — ' + resultado.motivo + '. No se tildó nada.');
  if (window.renderMonoPagos) window.renderMonoPagos();
  return resultado;
}

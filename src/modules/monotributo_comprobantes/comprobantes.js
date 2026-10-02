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
// Mismo bucket que ya usa adjuntos.js ('ohlimpia-adjuntos') — obtenerUrlFirmada
// no depende de la tabla `adjuntos`, solo de un path dentro de ese bucket, así
// que sirve tal cual para los comprobantes (que no pasan por esa tabla).
import { obtenerUrlFirmada } from '@shared/adjuntos.js';

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

// Igual que elegirArchivoComprobante pero con `multiple` — la tanda entera
// de tickets de una vez (carga en lote, tab Pago mensual).
export function elegirVariosArchivosComprobante(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,image/jpeg,image/png';
  input.multiple = true;
  input.onchange = () => { if (input.files.length) callback(Array.from(input.files)); };
  input.click();
}

// Abre el comprobante ya subido — mismo patrón que el resto del sistema
// para "ver" un archivo del bucket privado (obtenerUrlFirmada + window.open),
// ver p.ej. verAdjuntoConstanciaMtAlta en altas.js.
export async function verComprobanteMono(path) {
  if (!path) { toast('⚠️ Este registro no tiene un comprobante adjunto'); return; }
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el comprobante'); return; }
  window.open(url, '_blank');
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
// `datosManual` ({categoria, zona, condicion, adherentesCantidad, iibbAporta})
// — MONOTRIBUTO_cierre_modulo_para_Fede_1.md §3: el botón tiene que estar
// disponible en CUALQUIER fila de la bandeja, no solo las que ya vinieron
// con la Constancia MT cargada. El comprobante de pago NUNCA trae la
// categoría impresa (solo CUIT/período/importe, ver api/analizar-documento.js
// 'comprobante-monotributo') y deducirla del importe es ambiguo — la tabla
// real tiene categorías distintas con la MISMA cuota bajo ciertas
// condiciones (ej. A/B/C dan el mismo total como "asociado cooperativa").
// Por eso, si la fila no tiene categoría, el llamador (bandeja.js) junta
// estos 4 datos con un mini-formulario ANTES de llegar acá — una sola vez,
// quedan guardados en el trámite para la próxima.
export async function confirmarComprobanteBandeja(legajoNro, file, datosManual = null) {
  let tramite = (DB.monoTramites || []).find(t => !t.anulado && String(t.legajoNro) === String(legajoNro));
  if ((!tramite || !tramite.categoria) && datosManual?.categoria) {
    const legajoPre = (DB.legajos || []).find(l => String(l.nro) === String(legajoNro));
    if (!tramite) {
      tramite = { id: 'MTR' + String(legajoNro), legajoNro: String(legajoNro), nombreAsociado: legajoPre?.nombre || '', anulado: false };
      DB.monoTramites = DB.monoTramites || [];
      DB.monoTramites.push(tramite);
    }
    // Misma regla de negocio que el resto del módulo: "asociado cooperativa"
    // es exclusivo de categoría A.
    let condicion = datosManual.condicion || 'comun';
    if (condicion === 'asociado_cooperativa' && datosManual.categoria !== 'A') condicion = 'comun';
    tramite.categoria = datosManual.categoria;
    tramite.zona = datosManual.zona || 'provincia';
    tramite.condicion = condicion;
    tramite.adherentesCantidad = datosManual.adherentesCantidad || 0;
    tramite.iibbAporta = !!datosManual.iibbAporta;
    await supaSync('monoTramites', tramite);
  }
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

  // Historial de cambios (MONOTRIBUTO_v2_mes_en_curso_para_Fede.md §2):
  // "el registro no se pierde: queda el evento en el tab Historial de
  // cambios" — mismo shape/tabla que ya usa la recategorización
  // automática (mono_cambios), con comprobantePath nuevo (v175) para que
  // el evento tenga el link al PDF. tipo='alta_bandeja' (v178): no es un
  // cambio de categoría, es un alta — antes/despues cuentan la historia
  // real en vez de simular catAnterior=catNueva.
  const cambioHist = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    nombre: registro.nombre, fecha: new Date().toLocaleDateString('es-AR'),
    tipo: 'alta_bandeja', antes: 'Bandeja de pendientes', despues: `Padrón — Cat. ${registro.categoria}`,
    catAnterior: registro.categoria, catNueva: registro.categoria,
    curAnterior: 0, curNuevo: desglose.total, proyeccionAnual: null,
    motivo: `Alta por bandeja → Padrón · N° socio ${registro.nroSocio} · comprobante ${datosLeidos?.transaccion || path}`,
    decidoPor: 'Sistema (comprobante verificado)', resultado: 'Aprobado',
    comprobantePath: path,
  };
  DB.monoCambios = DB.monoCambios || [];
  DB.monoCambios.unshift(cambioHist);
  await supaSync('monoCambios', cambioHist);

  toast(`✅ ${registro.nombre} → monotributo ACTIVO. Comprobante de ${periodo} registrado — salió de la bandeja y entró al Padrón.`);
  _refrescarPantallasMono();
  return { ok: true };
}

// ── Punto de entrada 2: tab Pago mensual ──
// La persona YA existe en el Padrón y ya tiene una fila armada en
// mono_pagos_mes (por "Armar lista del mes") — esto solo la confirma.

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §12. Texto compartido por el tilde
// manual (legacy.js) y por los dos caminos de comprobante (este archivo), para
// que el motivo se lea igual en todos lados.
const MONO_SIN_VERIFICAR_MOTIVO = 'ver MONOTRIBUTO_cierre_modulo_para_Fede_1.md §12';
export async function confirmarComprobantePagoMensual(pagoMesId, file) {
  const pago = (DB.monoPagosMes || []).find(p => String(p.id) === String(pagoMesId));
  if (!pago) { toast('⚠️ No se encontró la fila de pago'); return { ok: false }; }
  if (pago.pagado) { toast('⚠️ Esta fila ya está pagada'); return { ok: false }; }
  // MONOTRIBUTO_cierre_modulo_para_Fede_1.md §12: una fila del import viejo no
  // se confirma con un comprobante. El chequeo de CUIT/importe de abajo NO
  // alcanza como defensa: en producción hay 4 filas malas con el mismo
  // nro_socio 5581 (Sequeira Nicole), así que un solo pago con su ticket
  // matchea por CUIT y tilda varias filas distintas.
  if (window._pagoMesNombreSinVerificar?.(pago)) {
    toast(`🚫 "${pago.nombre || '(sin nombre)'}" es un registro del import viejo, no una persona real. Conciliarlo antes de confirmar el pago (ver MONOTRIBUTO_cierre_modulo_para_Fede_1.md §12).`);
    return { ok: false };
  }
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

// Fila "en revisión" para un comprobante que no se pudo asociar a NINGUNA
// fila de la lista del mes (CUIT no reconocido en el padrón, o reconocido
// pero sin una fila pendiente ese período) — se guarda igual, con
// nroSocio null, para que Martina lo vea en el panel "En revisión" en vez
// de perderse.
async function _registrarEnRevisionSinAsociar({ periodo, path, datosLeidos, motivo }) {
  const cuitLeido = normalizarCuit(datosLeidos?.cuit);
  const fila = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    periodo, nroSocio: null,
    nombre: cuitLeido ? `CUIT ${cuitLeido} (no reconocido)` : 'Comprobante ilegible',
    impIntegradoCongelado: null, sipaCongelado: null, obraSocialCongelado: null, iibbCongelado: null,
    condicionCongelada: null, categoriaCongelada: null, curCongelado: 0, adherentesMontoCongelado: 0, total: 0,
    pagado: false, metodoPago: null, pagadoPor: null, pagadoEn: null,
    comprobantePath: path, comprobanteTransaccion: datosLeidos?.transaccion || '',
    comprobanteImporteLeido: Number(datosLeidos?.importe) || 0, comprobanteFechaPago: datosLeidos?.fechaPago || null,
    enRevision: true, enRevisionMotivo: motivo,
  };
  if (!DB.monoPagosMes) DB.monoPagosMes = [];
  DB.monoPagosMes.push(fila);
  await supaSync('monoPagosMes', fila);
}

// MONOTRIBUTO_bug_lote_para_Fede.md (01/10): el CUIT real y actualizado
// vive en el LEGAJO — DB.monotributos (el Padrón) puede tener ese campo
// desactualizado o vacío para asociados que de todos modos están bien en
// la lista del mes (confirmado con Acevedo Mariana Isabel 4991: CUIT
// correcto en el legajo, ausente/distinto en el padrón). La carga
// individual nunca pisaba este bug porque no busca por CUIT — ya sabe de
// qué fila es. El lote SÍ necesita resolver "¿de quién es este CUIT?", así
// que tiene que usar la misma fuente confiable: el legajo primero, el
// padrón solo como respaldo si el legajo no tiene el dato.
function _cuitDeFilaPagoMes(fila) {
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(fila.nroSocio));
  if (legajo?.cuit) return normalizarCuit(legajo.cuit);
  const persona = (DB.monotributos || []).find(m => String(m.nroSocio) === String(fila.nroSocio) || m.nombre === fila.nombre);
  return normalizarCuit(persona?.cuit);
}

// Un N° de transacción ya aplicado a una fila PAGADA (de cualquier
// período — el mismo ticket re-subido semanas después tiene que
// detectarse igual) — MONOTRIBUTO_cierre_modulo_para_Fede_1.md §11.b.
function _transaccionYaAplicada(transaccion) {
  if (!transaccion) return null;
  return (DB.monoPagosMes || []).find(p => p.pagado && p.comprobanteTransaccion === transaccion) || null;
}

// §23: "el período lo decide el TICKET, no la ventana" — cada comprobante
// se aplica a la lista de SU período leído, nunca al que esté
// seleccionado en pantalla (caso real: Lautaro subió tickets de
// septiembre parado en octubre). `periodoVentana` solo se usa como
// fallback para el path de storage de los que ni período pudieron leer.
export async function confirmarComprobantesLotePagoMensual(files, periodoVentana, onProgress) {
  const resumen = { tildados: 0, enRevision: 0, yaAplicados: 0, porPeriodo: {} };
  const cuitsDeEstaTanda = new Set();
  const transaccionesDeEstaTanda = new Set();
  let procesados = 0;
  const avisar = () => { if (typeof onProgress === 'function') onProgress(procesados, files.length, resumen); };
  avisar();

  for (const file of files) {
    let path;
    try { path = await _subirComprobante('lote', periodoVentana, file); }
    catch (e) { resumen.enRevision++; await _registrarEnRevisionSinAsociar({ periodo: periodoVentana, path: null, motivo: 'No se pudo subir el archivo (' + e.message + ')' }); procesados++; avisar(); continue; }

    let datosLeidos;
    try { datosLeidos = await analizarDocumentoPDF({ tipo: 'comprobante-monotributo', path }); }
    catch (e) { resumen.enRevision++; await _registrarEnRevisionSinAsociar({ periodo: periodoVentana, path, motivo: 'No se pudo leer el PDF (' + e.message + ')' }); procesados++; avisar(); continue; }

    const cuitLeido = normalizarCuit(datosLeidos.cuit);
    if (!cuitLeido) {
      resumen.enRevision++;
      await _registrarEnRevisionSinAsociar({ periodo: periodoVentana, path, datosLeidos, motivo: 'No se pudo leer el CUIT del comprobante' });
      procesados++; avisar(); continue;
    }

    // Transacción ya aplicada a una fila PAGADA (de cualquier corrida
    // anterior) — ni entra a la cola de revisión, se avisa y se descarta.
    const transaccion = datosLeidos.transaccion || '';
    const yaAplicada = transaccion && _transaccionYaAplicada(transaccion);
    if (yaAplicada) {
      resumen.yaAplicados++;
      procesados++; avisar(); continue;
    }
    // Duplicado DENTRO de esta misma tanda, por N° de transacción (mismo
    // ticket subido dos veces en la misma corrida) — y, como red
    // adicional, por CUIT (dos tickets distintos de la misma persona en
    // el mismo lote casi seguro es un error de carga).
    if (transaccion && transaccionesDeEstaTanda.has(transaccion)) {
      resumen.enRevision++;
      await _registrarEnRevisionSinAsociar({ periodo: periodoVentana, path, datosLeidos, motivo: `Transacción ${transaccion} repetida en este lote — DUPLICADO del comprobante ya procesado en esta misma tanda` });
      procesados++; avisar(); continue;
    }
    if (cuitsDeEstaTanda.has(cuitLeido)) {
      resumen.enRevision++;
      await _registrarEnRevisionSinAsociar({ periodo: periodoVentana, path, datosLeidos, motivo: `CUIT ${cuitLeido} repetido en este lote — ya se procesó otro comprobante con el mismo CUIT en esta misma tanda` });
      procesados++; avisar(); continue;
    }
    if (transaccion) transaccionesDeEstaTanda.add(transaccion);
    cuitsDeEstaTanda.add(cuitLeido);

    const periodoLeido = normalizarPeriodoLeido(datosLeidos.periodo);
    if (!periodoLeido) {
      resumen.enRevision++;
      await _registrarEnRevisionSinAsociar({ periodo: periodoVentana, path, datosLeidos, motivo: 'Período ilegible en el comprobante' });
      procesados++; avisar(); continue;
    }
    // Chequeo extra: fecha de pago vs período del ticket contradiciéndose
    // groseramente (ej. pago ene-2026 con factura 10/2026) — probablemente
    // un ticket viejo rescaneado, no se asocia solo.
    if (datosLeidos.fechaPago && /^\d{4}-\d{2}/.test(datosLeidos.fechaPago)) {
      const mesPago = datosLeidos.fechaPago.slice(0, 7);
      const difMeses = Math.abs((parseInt(periodoLeido.slice(0, 4)) * 12 + parseInt(periodoLeido.slice(5, 7)))
        - (parseInt(mesPago.slice(0, 4)) * 12 + parseInt(mesPago.slice(5, 7))));
      if (difMeses >= 3) {
        resumen.enRevision++;
        await _registrarEnRevisionSinAsociar({ periodo: periodoLeido, path, datosLeidos, motivo: `La fecha de pago (${datosLeidos.fechaPago}) y el período del comprobante (${datosLeidos.periodo}) se contradicen — revisar a mano` });
        procesados++; avisar(); continue;
      }
    }

    const todasDelPeriodo = (DB.monoPagosMes || []).some(p => p.periodo === periodoLeido);
    if (!todasDelPeriodo) {
      resumen.enRevision++;
      await _registrarEnRevisionSinAsociar({ periodo: periodoLeido, path, datosLeidos, motivo: `La lista de ${periodoLeido} no está armada todavía` });
      procesados++; avisar(); continue;
    }

    // §12: las filas del import viejo no matchean ni por CUIT. Sin este filtro
    // el nro 5581 tiene 4 filas malas (todas con el CUIT de Sequeira Nicole) y
    // un solo pago con su comprobante las tildaba todas de a una.
    const filasSinVerificar = (DB.monoPagosMes || []).filter(
      p => p.periodo === periodoLeido && !p.pagado && p.nroSocio
        && window._pagoMesNombreSinVerificar?.(p) && _cuitDeFilaPagoMes(p) === cuitLeido);
    for (const _f of filasSinVerificar) {
      _f.enRevision = true;
      _f.enRevisionMotivo = `Registro del import viejo (sin nombre real) — el comprobante no se puede aplicar a esta fila. Conciliar contra la planilla. (${MONO_SIN_VERIFICAR_MOTIVO})`;
      await supaSync('monoPagosMes', _f);
    }

    const fila = (DB.monoPagosMes || []).find(p => p.periodo === periodoLeido && !p.pagado && p.nroSocio && _cuitDeFilaPagoMes(p) === cuitLeido);
    if (!fila) {
      resumen.enRevision++;
      await _registrarEnRevisionSinAsociar({
        periodo: periodoLeido, path, datosLeidos,
        motivo: filasSinVerificar.length
          ? `${filasSinVerificar.length} fila(s) del import viejo sin nombre real — ${MONO_SIN_VERIFICAR_MOTIVO}`
          : `CUIT ${cuitLeido} no está en la lista de ${periodoLeido}`,
      });
      procesados++; avisar(); continue;
    }

    // cuit:cuitLeido a propósito (no persona.cuit/monotributos.cuit): ya
    // matcheamos por CUIT del legajo para encontrar `fila` — si acá no
    // cuadra, tiene que ser por período o importe, nunca "CUIT no
    // reconocido" de vuelta (pedido explícito del reporte).
    const resultado = matchComprobante(datosLeidos, { cuit: cuitLeido, nombre: fila.nombre, periodoEsperado: periodoLeido, cuotaEsperada: fila.total });
    fila.comprobantePath = path;
    fila.comprobanteTransaccion = transaccion;
    fila.comprobanteImporteLeido = Number(datosLeidos.importe) || 0;
    fila.comprobanteFechaPago = datosLeidos.fechaPago || null;
    fila.enRevision = !resultado.ok;
    fila.enRevisionMotivo = resultado.ok ? null : resultado.motivo;
    if (resultado.ok) {
      fila.pagado = true;
      fila.metodoPago = 'Comprobante';
      fila.pagadoPor = currentUser?.nombre || '';
      fila.pagadoEn = new Date().toISOString();
      resumen.tildados++;
      resumen.porPeriodo[periodoLeido] = (resumen.porPeriodo[periodoLeido] || 0) + 1;
    } else {
      resumen.enRevision++;
    }
    await supaSync('monoPagosMes', fila);
    procesados++; avisar();
  }

  const periodosMezclados = Object.keys(resumen.porPeriodo);
  let msg = `✓ Lote procesado (${files.length} comprobante${files.length === 1 ? '' : 's'}): ${resumen.tildados} tildado(s), ${resumen.enRevision} en revisión`;
  if (resumen.yaAplicados) msg += `, ${resumen.yaAplicados} ya aplicado(s) antes (ignorado)`;
  msg += '.';
  if (periodosMezclados.length > 1) {
    msg += ' Aplicados a ' + periodosMezclados.map(p => `${resumen.porPeriodo[p]} → ${p}`).join(' · ') + '.';
  }
  toast(msg);
  if (window.renderMonoPagos) window.renderMonoPagos();
  try {
    const { crearNotificacion } = await import('@shared/notificaciones.js');
    (DB.rrhh || []).forEach(nombre => {
      crearNotificacion({
        tipo: 'mono_lote_procesado', entidadTipo: 'monotributo', entidadIdLocal: 'lote-' + Date.now(),
        destinatarioNombre: nombre, mensaje: `Lote de ${files.length} comprobantes de monotributo procesado: ${msg}`,
      });
    });
  } catch (e) { /* notificación best-effort, nunca bloquea el resultado del lote */ }
  return resumen;
}

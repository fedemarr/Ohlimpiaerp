// Importador de la planilla mensual de Ventas (SERVICIOS_ACTIVOS_*.csv)
// hacia Clientes + Objetivos reales — ticket 08/2026 (Fase 2 se cargó a
// mano una vez por script; esto es para que las próximas actualizaciones
// mensuales de precios/horas las suba directamente Fede/Ventas desde acá,
// sin depender de que alguien corra un script).
//
// Mismo patrón que los otros importadores del proyecto (candidatos
// histórico, legajos, servicios/supervisor): parser CSV propio, preview
// con validación antes de confirmar, reentrancia + progreso en el botón.
//
// DECISIÓN CLAVE (re-importación segura, no pisar trabajo manual de
// Comercial): en un código YA EXISTENTE, esta importación sólo actualiza
// los campos que vienen de la planilla de Ventas (precio/horas,
// dirección, jurisdicción, localidad, supervisor, tipo de servicio,
// productos). NUNCA toca en un update: estado, contrato, notas,
// periodoFact, fechaInicio, puestos, comisiones — esos son campos que
// Comercial carga/edita a mano en el modal de Objetivo y se perderían
// silenciosamente si una reimportación mensual los pisara. Sólo se
// setean con su valor derivado de la planilla la PRIMERA vez (alta).

import { DB, currentUser } from '@shared/state.js';
import { $, cleanText, toTitleCase } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError } from '@shared/supabase.js';

let _ciFilas = [];
let _ciImportando = false;

// ========== PARSER CSV (mismo criterio que el resto de importadores) ==========

function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroComillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else dentroComillas = false; }
      else campo += c;
    } else if (c === '"') dentroComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Excel exportado con acentos suele venir con mojibake (UTF-8 releído
// como Latin-1: "AutÃ³noma" en vez de "Autónoma"). Se revierte
// reinterpretando byte a byte — pero de forma segura: si el resultado
// da un carácter de reemplazo (texto que en realidad ya estaba bien),
// se devuelve el original sin tocar, para no romper dos veces un dato
// que alguien ya corrigió a mano en una versión anterior del archivo.
function arreglarMojibake(s) {
  if (!s) return s;
  const intento = Buffer_from_latin1_utf8(s);
  return intento.includes('�') ? s : intento;
}
// El navegador no tiene Buffer — se hace el mismo truco con TextDecoder.
function Buffer_from_latin1_utf8(s) {
  const bytes = Uint8Array.from([...s].map(ch => ch.charCodeAt(0) & 0xFF));
  try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
  catch { return s; }
}

function leerFilas(texto) {
  const filas = parseCSV(texto);
  if (!filas.length) return { headers: [], filas: [] };
  const headers = filas[0].map(h => arreglarMojibake(h.trim()));
  const datos = filas.slice(1)
    .filter(f => f.some(v => (v || '').trim() !== ''))
    .map(f => { const o = {}; headers.forEach((h, i) => { o[h] = arreglarMojibake((f[i] || '').trim()); }); return o; });
  return { headers, filas: datos };
}

function col(fila, regex) {
  const k = Object.keys(fila).find(h => regex.test(h));
  return k ? fila[k] : '';
}

function num(s) {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}
function normalizarModeloPrecio(m) {
  const s = (m || '').trim().toLowerCase();
  if (s === 'eft') return 'Por EFT';
  if (s === 'por horas') return 'Por horas variables';
  if (s === 'abono fijo') return 'Abono mensual fijo';
  return '';
}
function extraerFechaAlta(obs) {
  const m = (obs || '').match(/Alta (\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return '';
  return m[3] + '-' + m[2] + '-' + m[1];
}
function extraerPeriodoFact(obs) {
  const m = (obs || '').match(/Facturacion del [^;]+|Del 1 a fin de mes/i);
  return m ? m[0].trim() : '';
}
function esNombrePersonaReal(s) {
  // "ESTO ES TERCIARIZADO" (o variantes) en la columna Supervisor no es
  // un nombre real — mismo criterio que el importador Servicios→Supervisor.
  return !!s && !(/terc/i.test(s) && /zad/i.test(s));
}
function humanizar(token) {
  return (token || '').split('.').map(p => p ? p.charAt(0) + p.slice(1).toLowerCase() : p).join(' ');
}

// ========== ABRIR / SELECCIONAR ARCHIVO ==========

export function abrirImportadorComercial() {
  _ciFilas = [];
  const fileEl = $('imp-com-file'); if (fileEl) fileEl.value = '';
  const prevEl = $('imp-com-preview'); if (prevEl) prevEl.innerHTML = '';
  const resEl = $('imp-com-resumen'); if (resEl) resEl.textContent = '';
  const btn = $('btn-confirmar-importacion-com');
  if (btn) { btn.style.display = 'none'; btn.disabled = false; btn.textContent = '✅ Confirmar importación'; }
  abrirModal('modal-importar-comercial');
}

export function seleccionarArchivoImportacionComercial() {
  const input = $('imp-com-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const { filas } = leerFilas(String(e.target.result || ''));
    _ciFilas = filas.filter(f => (col(f, /^CLIENTE$/i) || '').toUpperCase() !== 'TOTAL');
    if (!_ciFilas.length) { toast('⚠️ El archivo está vacío o no se reconoció ninguna fila'); return; }
    renderPreviewImportacionComercial();
  };
  reader.readAsText(file, 'UTF-8');
}

// ========== CONSTRUCCIÓN (clientes agrupados + objetivos deduplicados) ==========

function construirClientesYObjetivos() {
  const porCliente = new Map();
  _ciFilas.forEach(f => {
    const token = (col(f, /^CLIENTE$/i) || '').toUpperCase().trim();
    if (!token) return;
    if (!porCliente.has(token)) porCliente.set(token, []);
    porCliente.get(token).push(f);
  });

  const clientes = [];
  for (const [token, filasCli] of porCliente) {
    const primera = filasCli[0];
    const dirsReales = new Set(filasCli.map(f => col(f, /DIRECCI/i)).filter(Boolean));
    const municipios = new Set(filasCli.map(f => col(f, /MUNICIPIO|BARRIO/i)).filter(Boolean));
    const emailsUnicos = [...new Set(filasCli.map(f => col(f, /^EMAIL ENV.O FACTURA$/i)).filter(Boolean))];
    const emailsCc = [...new Set(filasCli.map(f => col(f, /^EMAIL CC$/i)).filter(Boolean))];
    const obsPartes = [];
    if (dirsReales.size > 1) obsPartes.push('Cliente con múltiples sedes — ver dirección real en cada Objetivo.');
    if (emailsUnicos.length > 1) obsPartes.push('Emails de factura en la planilla: ' + emailsUnicos.join(' | '));
    if (emailsCc.length) obsPartes.push('Email(s) CC: ' + emailsCc.join(' | '));

    clientes.push({
      token,
      nombre: humanizar(token),
      razon: col(primera, /^RAZ.N SOCIAL$/i) || humanizar(token),
      cuit: col(primera, /^CUIT$/i) || '',
      direccion: dirsReales.size === 1 ? [...dirsReales][0] : '',
      mail: emailsUnicos[0] || '',
      condPago: col(primera, /^CONDICI.N DE PAGO$/i) || '',
      factPor: col(primera, /AGRUPACI/i) || '',
      productosEnFactura: col(primera, /PRODUCTOS PAGAN/i) || '',
      codigo: token,
      tipo: col(primera, /^TIPO DE CLIENTE$/i) || '',
      ciudad: municipios.size === 1 ? [...municipios][0] : '',
      obs: obsPartes.join(' | '),
    });
  }

  const ultimaAparicion = new Map();
  _ciFilas.forEach((f, i) => {
    const cod = (col(f, /^SERVICIO$/i) || '').toUpperCase().trim();
    if (cod) ultimaAparicion.set(cod, i);
  });

  const objetivos = [];
  const avisos = [];
  _ciFilas.forEach((f, i) => {
    const cod = (col(f, /^SERVICIO$/i) || '').toUpperCase().trim();
    if (!cod) return;
    if (ultimaAparicion.get(cod) !== i) {
      avisos.push(cod + ': código repetido en el archivo, se usa la última fila');
      return;
    }
    const clienteToken = (col(f, /^CLIENTE$/i) || '').toUpperCase().trim();
    const modeloPrecio = normalizarModeloPrecio(col(f, /MODELO DE PRECIO/i));
    if (!modeloPrecio) avisos.push(cod + ': modelo de precio "' + col(f, /MODELO DE PRECIO/i) + '" no reconocido, queda vacío');
    const supervisorRaw = col(f, /^SUPERVISOR$/i);
    const supervisor = esNombrePersonaReal(supervisorRaw) ? supervisorRaw : '';
    if (supervisorRaw && !supervisor) avisos.push(cod + ': supervisor "' + supervisorRaw + '" no es un nombre real, queda vacío');

    const obsRaw = col(f, /^OBSERVACIONES$/i);
    const valorHora = num(col(f, /VALOR HORA/i));
    const efts = num(col(f, /CANT HORAS/i));
    const valorAbono = modeloPrecio === 'Abono mensual fijo' ? num(col(f, /^FACT NETA JUL/i)) : null;

    objetivos.push({
      codigo: cod,
      clienteToken,
      nombre: humanizar(cod),
      tipo: col(f, /^TIPO de servicio/i) || '',
      dir: col(f, /DIRECCI/i) || '',
      jurisdiccion: col(f, /^PROVINCIA$/i) || '',
      localidad: col(f, /MUNICIPIO|BARRIO/i) || '',
      supervisorAsignado: supervisor,
      modeloPrecio,
      valor: valorAbono,
      valorHora: modeloPrecio === 'Abono mensual fijo' ? null : valorHora,
      efts: modeloPrecio === 'Abono mensual fijo' ? null : efts,
      productos: col(f, /PRODUCTOS PAGAN/i) || '',
      logProductos: (col(f, /PRODUCTOS PAGAN/i) || '') + (col(f, /REMITO PRODUCTOS/i) ? (' | Envía remito: ' + col(f, /REMITO PRODUCTOS/i)) : ''),
      // Sólo se usan al CREAR (ver nota arriba del archivo) — en un
      // update de un objetivo ya existente no se tocan.
      _soloAlCrear: {
        fechaInicio: extraerFechaAlta(obsRaw),
        periodoFact: extraerPeriodoFact(obsRaw),
        notas: obsRaw || '',
        contrato: 'Contrato firmado',
        estado: 'Operativo',
      },
    });
  });

  return { clientes, objetivos, avisos };
}

// ========== PREVIEW ==========

let _ciResultado = null;

function renderPreviewImportacionComercial() {
  const cont = $('imp-com-preview');
  if (!cont) return;
  _ciResultado = construirClientesYObjetivos();
  const { clientes, objetivos, avisos } = _ciResultado;

  const clientesExistentes = new Map((DB.clientes || []).map(c => [c.codigo, c]));
  const objetivosExistentes = new Map((DB.objetivos || []).map(o => [o.codigo, o]));

  let cliNuevos = 0, cliActualiza = 0, objNuevos = 0, objActualiza = 0;
  clientes.forEach(c => { if (clientesExistentes.has(c.codigo)) cliActualiza++; else cliNuevos++; });
  objetivos.forEach(o => { if (objetivosExistentes.has(o.codigo)) objActualiza++; else objNuevos++; });

  // Objetivos actualmente Operativos que YA NO aparecen en este archivo
  // — informativo, NO se dan de baja automático (puede ser un olvido de
  // la planilla, no una baja real).
  const codigosNuevos = new Set(objetivos.map(o => o.codigo));
  const desaparecidos = (DB.objetivos || []).filter(o => o.estado === 'Operativo' && !o.anulado && !codigosNuevos.has(o.codigo));

  const filasHtml = objetivos.map(o => {
    const existe = objetivosExistentes.has(o.codigo);
    const accion = existe ? 'actualiza precio/horas/dirección' : 'nuevo (Operativo)';
    return '<tr>'
      + '<td style="padding:4px 8px;font-size:11px;font-family:\'DM Mono\',monospace;">' + o.codigo + '</td>'
      + '<td style="padding:4px 8px;font-size:11px;">' + o.clienteToken + '</td>'
      + '<td style="padding:4px 8px;font-size:11px;">' + (o.modeloPrecio || '<span style="color:#dc2626;">sin reconocer</span>') + '</td>'
      + '<td style="padding:4px 8px;font-size:11px;">' + (o.supervisorAsignado || '—') + '</td>'
      + '<td style="padding:4px 8px;font-size:11px;">' + accion + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:11px;">Código servicio</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:11px;">Cliente</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:11px;">Modelo precio</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:11px;">Supervisor</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:11px;">Acción</th>'
    + '</tr></thead><tbody>' + filasHtml + '</tbody></table>';

  const resEl = $('imp-com-resumen');
  if (resEl) {
    resEl.innerHTML = '<strong>Clientes:</strong> ' + cliNuevos + ' nuevo(s), ' + cliActualiza + ' a actualizar. '
      + '<strong>Objetivos:</strong> ' + objNuevos + ' nuevo(s), ' + objActualiza + ' a actualizar (solo precio/horas/dirección/supervisor — no toca estado, contrato, notas, puestos ni comisiones ya cargados a mano).'
      + (desaparecidos.length ? '<br><span style="color:#d97706;">⚠️ ' + desaparecidos.length + ' servicio(s) Operativo(s) hoy NO aparecen en este archivo (¿de baja? revisar a mano): ' + desaparecidos.map(o => o.codigo).join(', ') + '</span>' : '')
      + (avisos.length ? '<br><span style="color:#b45309;">' + avisos.length + ' aviso(s): ' + avisos.slice(0, 8).join(' | ') + (avisos.length > 8 ? '…' : '') + '</span>' : '');
  }
  const btn = $('btn-confirmar-importacion-com');
  if (btn) btn.style.display = (clientes.length || objetivos.length) ? 'inline-flex' : 'none';
}

// ========== CONFIRMAR ==========

export async function confirmarImportacionComercial() {
  if (_ciImportando || !_ciResultado) return;
  const { clientes, objetivos } = _ciResultado;
  _ciImportando = true;
  const btn = $('btn-confirmar-importacion-com');
  const resEl = $('imp-com-resumen');
  const total = clientes.length + objetivos.length;
  let hecho = 0;
  const fallos = [];

  const clientesExistentes = new Map((DB.clientes || []).map(c => [c.codigo, c]));
  for (const c of clientes) {
    hecho++;
    if (btn) btn.textContent = 'Importando ' + hecho + ' / ' + total + '…';
    const existente = clientesExistentes.get(c.codigo);
    let registro;
    if (existente) {
      // Update: sólo campos que vienen de la planilla — no toca lo que
      // Comercial haya cargado a mano (docReq, contactos, responsable, etc.)
      Object.assign(existente, {
        razon: c.razon, cuit: c.cuit || existente.cuit,
        direccion: c.direccion || existente.direccion,
        mail: c.mail || existente.mail,
        condPago: c.condPago || existente.condPago,
        factPor: c.factPor || existente.factPor,
        productosEnFactura: c.productosEnFactura || existente.productosEnFactura,
        tipo: c.tipo || existente.tipo,
        ciudad: c.ciudad || existente.ciudad,
      });
      registro = existente;
    } else {
      registro = {
        id: Date.now() + hecho, codigo: c.codigo, nombre: c.nombre, razon: c.razon, cuit: c.cuit,
        direccion: c.direccion, mail: c.mail, estado: 'Activo', condPago: c.condPago, factPor: c.factPor,
        productosEnFactura: c.productosEnFactura, tipo: c.tipo, ciudad: c.ciudad, obs: c.obs,
        docReq: {}, contactos: [],
      };
    }
    const ok = await supaSync('clientes', registro);
    if (ok) { if (!existente) { if (!DB.clientes) DB.clientes = []; DB.clientes.push(registro); clientesExistentes.set(c.codigo, registro); } }
    else fallos.push('Cliente ' + c.codigo + ': ' + ((getLastSupaSyncError() || {}).message || 'error desconocido'));
  }

  const objetivosExistentes = new Map((DB.objetivos || []).map(o => [o.codigo, o]));
  for (const o of objetivos) {
    hecho++;
    if (btn) btn.textContent = 'Importando ' + hecho + ' / ' + total + '…';
    const cliente = clientesExistentes.get(o.clienteToken);
    if (!cliente) { fallos.push('Objetivo ' + o.codigo + ': no se encontró el cliente "' + o.clienteToken + '"'); continue; }
    const existente = objetivosExistentes.get(o.codigo);
    let registro;
    if (existente) {
      Object.assign(existente, {
        tipo: o.tipo || existente.tipo, dir: o.dir || existente.dir,
        jurisdiccion: o.jurisdiccion || existente.jurisdiccion, localidad: o.localidad || existente.localidad,
        supervisorAsignado: o.supervisorAsignado || existente.supervisorAsignado,
        modeloPrecio: o.modeloPrecio || existente.modeloPrecio,
        valor: o.valor ?? existente.valor, valorHora: o.valorHora ?? existente.valorHora, efts: o.efts ?? existente.efts,
        productos: o.productos || existente.productos, logProductos: o.logProductos || existente.logProductos,
        modificadoPor: (currentUser && currentUser.nombre) || '', modificadoEn: new Date().toISOString(),
      });
      registro = existente;
    } else {
      registro = {
        id: Date.now() + hecho, clienteIdLocal: String(cliente.id).slice(-9),
        codigo: o.codigo, nombre: o.nombre, tipo: o.tipo, dir: o.dir, jurisdiccion: o.jurisdiccion, localidad: o.localidad,
        supervisorAsignado: o.supervisorAsignado, modeloPrecio: o.modeloPrecio, valor: o.valor, valorHora: o.valorHora, efts: o.efts,
        productos: o.productos, logProductos: o.logProductos,
        fechaInicio: o._soloAlCrear.fechaInicio, periodoFact: o._soloAlCrear.periodoFact, notas: o._soloAlCrear.notas,
        contrato: o._soloAlCrear.contrato, estado: o._soloAlCrear.estado,
        comisiones: [], responsables: [], adjuntos: [], puestos: [], historialPrecios: [],
        cargadoPor: (currentUser && currentUser.nombre) || 'Import Comercial', fechaCarga: new Date().toLocaleDateString('es-AR'),
      };
    }
    const ok = await supaSync('objetivos', registro);
    if (ok) { if (!existente) { if (!DB.objetivos) DB.objetivos = []; DB.objetivos.push(registro); } }
    else fallos.push('Objetivo ' + o.codigo + ': ' + ((getLastSupaSyncError() || {}).message || 'error desconocido'));
  }

  if (window.renderClientes) window.renderClientes();
  if (window.renderObjetivos) window.renderObjetivos();
  if (window.poblarSelectsComercial) window.poblarSelectsComercial();

  _ciImportando = false;
  if (fallos.length) {
    toast('⚠️ Import terminado con ' + fallos.length + ' error(es)');
    if (resEl) resEl.innerHTML = (total - fallos.length) + ' guardado(s) correctamente.<br><span style="color:#dc2626;">' + fallos.length + ' con error:</span><br>' + fallos.map(x => '• ' + x).join('<br>');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar importación'; }
  } else {
    toast('✅ Importación comercial completa: ' + clientes.length + ' cliente(s), ' + objetivos.length + ' objetivo(s)');
    abrirImportadorComercial();
  }
}

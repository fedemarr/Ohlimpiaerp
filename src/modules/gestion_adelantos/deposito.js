// Gestión de Adelantos v1.2 (Finanzas — Depósito) — Tab "🏦 Depósito":
// PEDIDOS_ADELANTOS_para_Fede_2.md §4. Mismo motor de tandas que "Pago
// de retiros" (liquidaciones_pago/pago.js) — reusa SIN TOCAR los
// formateadores de hoja de copiado (bancos.js). Acá no hay split
// Operarios/Administrativos (volumen chico, no aplica ese ritual): una
// sola lista, tilde global + individual, SIN CBU no tildable, confirmar
// con 2 modos (hojas de copiado / depósito manual).
//
// Lotes propios (lotes_adelantos / lotes_adelantos_items, sql/v142) —
// no comparte tablas con Liquidaciones para no acoplar los dos módulos
// (su "tipo" de lote significa operarios/administrativos, acá no aplica).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getCuentaCbu } from '@modules/cuentas_cbu/consultas.js';
import { clasificarPorBanco, bloquesHojaBBVA, filasHojaMacro } from '@modules/liquidaciones_pago/bancos.js';
import { pagarFinanzasBulk, rechazarFinanzas } from '../adelantos_prestamos_shared/flujo.js';

function _fmt(n) { return '$' + Math.round(n || 0).toLocaleString('es-AR'); }
function _id(pref) { return pref + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function hoyISOLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ========== DATOS ==========

function _pedidosParaDepositar() {
  const adelantos = (DB.pedidosAdelantos || []).filter(p => !p.anulado && p.estado === 'Aprobada RRHH')
    .map(p => ({ ...p, tipo: 'Adelanto', nombreMostrar: p.nombreAsociado }));
  const prestamos = (DB.prestamos || []).filter(p => !p.anulado && p.estado === 'Aprobada RRHH')
    .map(p => ({ ...p, tipo: 'Préstamo', nombreMostrar: p.nombre }));
  return [...adelantos, ...prestamos].map(p => {
    const legajo = (DB.legajos || []).find(l => String(l.nro) === String(p.legajoIdLocal));
    const cuenta = p.legajoIdLocal ? getCuentaCbu(p.legajoIdLocal) : null;
    const tieneCbu = cuenta?.estado === 'ACTIVA';
    return {
      ...p,
      cuit: legajo?.cuit || '',
      banco: tieneCbu ? cuenta.banco : null,
      cbu: tieneCbu ? cuenta.cbu : null,
      tieneCbu,
    };
  }).sort((a, b) => new Date(a.fechaAprobacionRrhh) - new Date(b.fechaAprobacionRrhh));
}

// ========== SELECCIÓN (en memoria, por sesión — mismo criterio que Pago de retiros) ==========

const _seleccion = new Set(); // claves "tipo|id"
const _clave = p => `${p.tipo}|${p.id}`;

export function tildarDeposito(tipo, id, val) {
  const k = `${tipo}|${id}`;
  if (val) _seleccion.add(k); else _seleccion.delete(k);
  _actualizarBarra();
}

export function tildarTodosDeposito(val) {
  _pedidosParaDepositar().filter(p => p.tieneCbu).forEach(p => {
    if (val) _seleccion.add(_clave(p)); else _seleccion.delete(_clave(p));
  });
  renderDeposito();
}

function _seleccionActual() {
  const set = new Set(_seleccion);
  return _pedidosParaDepositar().filter(p => set.has(_clave(p)) && p.tieneCbu);
}

function _actualizarBarra() {
  const sel = _seleccionActual();
  const tot = sel.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const nEl = $('gdep-sel-n'), mEl = $('gdep-sel-m'), dEl = $('gdep-sel-det'), btn = $('btn-gdep-depositar');
  if (nEl) nEl.textContent = sel.length;
  if (mEl) mEl.textContent = _fmt(tot);
  if (dEl) {
    const porBanco = {};
    sel.forEach(p => { porBanco[p.banco] = (porBanco[p.banco] || 0) + 1; });
    dEl.textContent = sel.length ? Object.entries(porBanco).map(([b, n]) => n + ' ' + b).join(' · ') : '';
  }
  if (btn) btn.disabled = sel.length === 0;
}

// ========== RENDER ==========

function _filaDeposito(p) {
  const chk = p.tieneCbu
    ? `<input type="checkbox" class="cb-gdep" data-tipo="${p.tipo}" data-id="${p.id}" ${_seleccion.has(_clave(p)) ? 'checked' : ''} onchange="tildarDeposito('${p.tipo}','${p.id}',this.checked)">`
    : `<input type="checkbox" disabled title="Sin cuenta CBU activa">`;
  const banco = p.tieneCbu
    ? `<span class="badge badge-gris">${p.banco}</span>`
    : `<span class="badge badge-rojo">SIN CUENTA</span>`;
  const acciones = p.tieneCbu
    ? `<button class="btn btn-secondary btn-sm" onclick="abrirDepositoManualUno('${p.tipo}','${p.id}')">✍ Manual</button> <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;" onclick="abrirRechazarDeposito('${p.tipo}','${p.id}')">✗</button>`
    : `<span style="font-size:11px;color:var(--texto-suave);">Espera Cuentas CBU</span>`;
  return `<tr${!p.tieneCbu ? ' style="background:#fbf7f7;"' : ''}>
    <td style="text-align:center;">${chk}</td>
    <td style="font-size:12px;">${(p.fechaAprobacionRrhh || '').slice(0, 10)}</td>
    <td style="font-weight:500;">${p.nombreMostrar}</td>
    <td style="font-size:12px;">${p.tipo}</td>
    <td style="text-align:right;">$${Number(p.monto || 0).toLocaleString('es-AR')}</td>
    <td>${banco}</td>
    <td style="font-size:12px;">${p.aprobadoPorRrhh}</td>
    <td style="white-space:nowrap;">${acciones}</td>
  </tr>`;
}

export function renderDeposito() {
  const filas = _pedidosParaDepositar();
  const tbody = $('tbody-gadl-deposito');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin pedidos esperando depósito</td></tr>'
    : filas.map(_filaDeposito).join('');
  if ($('st-gadl-aprobados')) $('st-gadl-aprobados').textContent = filas.length;
  if ($('st-gadl-monto')) $('st-gadl-monto').textContent = _fmt(filas.reduce((s, p) => s + (Number(p.monto) || 0), 0));
  if ($('cb-gdep-all')) $('cb-gdep-all').checked = false;
  _actualizarBarra();
}

// ========== CONFIRMAR DEPÓSITO — 2 modos ==========

let _objetivoDeposito = null; // { sel: [pedidos], soloManual: bool }

export function abrirConfirmarDeposito() {
  const sel = _seleccionActual();
  if (!sel.length) { toast('⚠️ Seleccioná al menos un pedido'); return; }
  _objetivoDeposito = { sel, soloManual: false };
  ensureModalModoDeposito();
  const tot = sel.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  $('gdepm-resumen').innerHTML = `Vas a confirmar el depósito de <b>${sel.length} pedido${sel.length === 1 ? '' : 's'} · ${_fmt(tot)}</b>. Los dos modos crean el lote — ningún depósito queda sin registro.`;
  $('gdepm-opciones').style.display = '';
  $('gdepm-manual').style.display = 'none';
  abrirModal('modal-gadl-modo-deposito');
}

// "✍ Manual" por fila (PEDIDOS_ADELANTOS_para_Fede_2.md §4: el botón
// "Pagar" por fila pasa a abrir directo la confirmación de depósito
// manual para ese único pedido — no el elegir-entre-2-modos).
export function abrirDepositoManualUno(tipo, id) {
  const p = _pedidosParaDepositar().find(x => x.tipo === tipo && String(x.id) === String(id));
  if (!p) return;
  _objetivoDeposito = { sel: [p], soloManual: true };
  ensureModalModoDeposito();
  $('gdepm-resumen').innerHTML = `Depósito individual: <b>${p.nombreMostrar} · ${_fmt(p.monto)}</b>.`;
  $('gdepm-opciones').style.display = 'none';
  _mostrarCamposManual();
  abrirModal('modal-gadl-modo-deposito');
}

function ensureModalModoDeposito() {
  if ($('modal-gadl-modo-deposito')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-gadl-modo-deposito';
  m.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header"><h3>Confirmar depósito</h3><button class="btn-close" onclick="cerrarModal('modal-gadl-modo-deposito')">×</button></div>
      <div class="modal-body">
        <div class="alerta alerta-info" style="font-size:12.5px;" id="gdepm-resumen"></div>
        <div id="gdepm-opciones" style="display:flex;gap:12px;margin:10px 0;">
          <div style="flex:1;border:2px solid var(--borde-fuerte);border-radius:10px;padding:14px;cursor:pointer;text-align:center;" onclick="confirmarLoteAdelantos('archivos')">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px;">🗂 Con hojas de copiado</div>
            <div style="font-size:12px;color:var(--texto-suave);">Crea el lote ADELANTOS y genera las hojas BBVA / Macro (concepto ADELANTOS) para copiar y pegar en la planilla del banco.</div>
          </div>
          <div style="flex:1;border:2px solid var(--borde-fuerte);border-radius:10px;padding:14px;cursor:pointer;text-align:center;" onclick="mostrarCamposManualClick()">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px;">✍ Depósito manual</div>
            <div style="font-size:12px;color:var(--texto-suave);">Ya se transfirió (o se transfiere) directo en el portal del banco. Solo registra fecha y N° de comprobante — sin archivos.</div>
          </div>
        </div>
        <div id="gdepm-manual" style="display:none;margin-top:8px;">
          <div class="form-grid form-grid-2">
            <div class="form-group"><label>Fecha real del depósito *</label><input type="date" id="gdepm-fecha"></div>
            <div class="form-group"><label>N° de comprobante *</label><input type="text" id="gdepm-comprobante" placeholder="Ej: 003519874"></div>
          </div>
          <div style="text-align:right;"><button class="btn btn-primary" onclick="confirmarLoteAdelantos('manual')">Registrar depósito manual</button></div>
        </div>
        <div class="alerta alerta-warning" style="font-size:12px;">Esta acción marca los pedidos como DEPOSITADOS y genera los descuentos a aplicar en Liquidaciones — no tiene deshacer.</div>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function _mostrarCamposManual() {
  $('gdepm-manual').style.display = '';
  $('gdepm-fecha').value = hoyISOLocal();
  $('gdepm-comprobante').value = '';
}

export function mostrarCamposManualClick() { _mostrarCamposManual(); }

function _proximoNroLoteAdelantos() {
  const nums = (DB.lotesAdelantos || [])
    .map(l => (String(l.nroLote || '').match(/-(\d+)$/) || [])[1])
    .filter(Boolean).map(Number);
  const siguiente = (nums.length ? Math.max(...nums) : 0) + 1;
  return `ADEL-${String(siguiente).padStart(3, '0')}`;
}

export async function confirmarLoteAdelantos(modo) {
  const { sel } = _objetivoDeposito || {};
  if (!sel || !sel.length) return;
  let fechaDeposito, comprobante = null;
  if (modo === 'manual') {
    fechaDeposito = $('gdepm-fecha').value;
    comprobante = ($('gdepm-comprobante').value || '').trim();
    if (!fechaDeposito) { toast('⚠️ Elegí la fecha del depósito'); return; }
    if (!comprobante) { toast('⚠️ Falta el N° de comprobante'); return; }
  } else {
    fechaDeposito = hoyISOLocal();
  }

  const confirmadoPor = currentUser?.nombre || 'Finanzas';
  const total = sel.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const lote = {
    id: _id('LOTEADEL'),
    nroLote: _proximoNroLoteAdelantos(),
    periodo: hoyISOLocal().slice(0, 7),
    modo,
    cantidad: sel.length,
    total,
    fechaDeposito,
    comprobante,
    confirmadoPor,
    confirmadoEn: new Date().toISOString(),
    anulado: false,
  };
  const okLote = await supaSync('lotesAdelantos', lote);
  if (!okLote) { toast('⚠️ No se pudo crear el lote — reintentá'); return; }
  if (!DB.lotesAdelantos) DB.lotesAdelantos = [];
  DB.lotesAdelantos.push(lote);

  for (const p of sel) {
    const item = {
      id: _id('LOTEADELITEM'),
      loteIdLocal: lote.id.slice(-9),
      tipoPedido: p.tipo,
      pedidoIdLocal: String(p.id).slice(-9),
      legajoNro: p.legajoIdLocal || p.nroSocio,
      nombreAsociado: p.nombreMostrar,
      banco: p.banco, cbu: p.cbu, cuit: p.cuit,
      monto: p.monto,
      esExcepcion: p.banco !== 'BBVA' && p.banco !== 'Macro',
    };
    await supaSync('lotesAdelantosItems', item);
    if (!DB.lotesAdelantosItems) DB.lotesAdelantosItems = [];
    DB.lotesAdelantosItems.push(item);
  }

  // Marca los pedidos como DEPOSITADOS (Aprobada) — genera los
  // compromisos de descuento (generarCompromisosDescuento, ya wireado
  // en pagarFinanzas/flujo.js).
  const porTipo = { Adelanto: [], Préstamo: [] };
  sel.forEach(p => porTipo[p.tipo].push(p.id));
  if (porTipo.Adelanto.length) await pagarFinanzasBulk('Adelanto', porTipo.Adelanto);
  if (porTipo.Préstamo.length) await pagarFinanzasBulk('Préstamo', porTipo.Préstamo);

  _seleccion.clear();
  cerrarModal('modal-gadl-modo-deposito');
  renderDeposito();
  toast(modo === 'archivos'
    ? `✅ ${lote.nroLote} confirmado — hojas de copiado generadas. Los pedidos pasaron a DEPOSITADO.`
    : `✅ ${lote.nroLote} (MANUAL) registrado — fecha y comprobante guardados. DEPOSITADO.`);
  if (window.tabGestAdl) window.tabGestAdl('lotes');
}

// ========== RECHAZAR (vuelve a RRHH) — igual que antes ==========

let _rechazando = null;

function ensureModalRechazoDeposito() {
  if ($('modal-gadl-rechazo-dep')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-gadl-rechazo-dep';
  m.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header"><h3>❌ Rechazar y devolver a RRHH</h3><button class="btn-close" onclick="cerrarModal('modal-gadl-rechazo-dep')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Motivo del rechazo *</label><textarea id="gdep-motivo" rows="3" placeholder="Ej: el monto no coincide con lo acordado"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-gadl-rechazo-dep')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarRechazoDeposito()">Devolver a RRHH</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirRechazarDeposito(tipo, id) {
  _rechazando = { tipo, id };
  ensureModalRechazoDeposito();
  $('gdep-motivo').value = '';
  abrirModal('modal-gadl-rechazo-dep');
}

export async function confirmarRechazoDeposito() {
  const motivo = ($('gdep-motivo').value || '').trim();
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }
  const r = await rechazarFinanzas(_rechazando.tipo, _rechazando.id, motivo);
  if (r.error) { toast('⚠️ ' + r.error); return; }
  cerrarModal('modal-gadl-rechazo-dep');
  renderDeposito();
  toast('✅ Pedido devuelto a RRHH');
}

// ========== TAB LOTES ==========

function _itemsDelLote(loteIdLocal) {
  return (DB.lotesAdelantosItems || []).filter(it => it.loteIdLocal === loteIdLocal)
    .map(it => ({ nroSocio: it.legajoNro, nombre: it.nombreAsociado, banco: it.banco, cbu: it.cbu, cuit: it.cuit, monto: it.monto }));
}

export function renderLotesAdelantos() {
  const cont = $('gadl-lotes-cont');
  if (!cont) return;
  const lotes = [...(DB.lotesAdelantos || [])].filter(l => !l.anulado)
    .sort((a, b) => String(b.confirmadoEn).localeCompare(String(a.confirmadoEn)));
  if ($('st-gadl-lotes')) $('st-gadl-lotes').textContent = lotes.length;

  if (!lotes.length) {
    cont.innerHTML = '<p style="text-align:center;padding:24px;opacity:.5;">Todavía no se confirmó ningún lote de depósito.</p>';
    return;
  }
  const chipStyle = 'display:inline-block;background:var(--fondo);border:1px solid var(--borde);border-radius:7px;padding:5px 11px;font-size:11.5px;font-family:\'DM Mono\',monospace;margin:3px 6px 3px 0;color:var(--azul);cursor:pointer;';
  cont.innerHTML = lotes.map(lote => {
    const items = _itemsDelLote(lote.id.slice(-9));
    let archivos;
    if (lote.modo === 'archivos') {
      const { bbva, macro, excepciones } = clasificarPorBanco(items);
      const chips = [];
      const nBloques = bbva.length ? Math.ceil(bbva.length / 150) : 0;
      for (let b = 0; b < nBloques; b++) {
        chips.push(`<span style="${chipStyle}" onclick="descargarArchivoLoteAdelantos('${lote.id.slice(-9)}','bbva',${b})">⬇ copiado_BBVA_${lote.nroLote}-${b + 1}.xlsx (${Math.min(150, bbva.length - b * 150)})</span>`);
      }
      if (macro.length) chips.push(`<span style="${chipStyle}" onclick="descargarArchivoLoteAdelantos('${lote.id.slice(-9)}','macro',0)">⬇ copiado_MACRO_${lote.nroLote}.xlsx (${macro.length})</span>`);
      if (excepciones.length) chips.push(`<span style="${chipStyle}background:#fef3c7;" onclick="descargarExcepcionesLoteAdelantos('${lote.id.slice(-9)}')">📄 excepciones (${excepciones.length})</span>`);
      archivos = chips.join('') || '<span class="text-muted">Sin archivos (todos excepción manual)</span>';
    } else {
      archivos = `<span class="badge badge-naranja">MANUAL</span> Comprobante ${lote.comprobante} · ${(lote.fechaDeposito || '').split('-').reverse().join('/')}`;
    }
    return `<div style="border:1px solid var(--borde);border-radius:10px;padding:13px 16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <b>${lote.nroLote}</b> ${lote.modo === 'archivos' ? '<span class="badge badge-azul">HOJAS DE COPIADO</span>' : '<span class="badge badge-naranja">MANUAL</span>'}
        <span class="badge badge-verde">DEPOSITADO ${new Date(lote.confirmadoEn).toLocaleDateString('es-AR')}</span>
      </div>
      <div style="font-size:12px;color:var(--texto-suave);margin-bottom:6px;">${lote.cantidad} pedido(s) · ${_fmt(lote.total)} · confirmó ${lote.confirmadoPor}</div>
      <div>${archivos}</div>
    </div>`;
  }).join('');
}

async function _descargarXlsx(nombreArchivo, filas) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(filas);
  Object.keys(ws).forEach(addr => {
    if (addr[0] === '!') return;
    ws[addr].t = 's';
    ws[addr].z = '@';
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Copiado');
  XLSX.writeFile(wb, nombreArchivo);
}

export async function descargarArchivoLoteAdelantos(loteIdLocal, banco, bloqueIdx) {
  const lote = (DB.lotesAdelantos || []).find(l => l.id.slice(-9) === loteIdLocal);
  const items = _itemsDelLote(loteIdLocal).filter(it => it.banco === (banco === 'bbva' ? 'BBVA' : 'Macro'));
  if (banco === 'bbva') {
    const bloques = bloquesHojaBBVA(items, lote?.fechaDeposito || hoyISOLocal(), 'ADELANTOS');
    await _descargarXlsx(`copiado_BBVA_${lote?.nroLote || 'lote'}-${bloqueIdx + 1}.xlsx`, bloques[bloqueIdx] || []);
  } else {
    await _descargarXlsx(`copiado_MACRO_${lote?.nroLote || 'lote'}.xlsx`, filasHojaMacro(items));
  }
}

export async function descargarExcepcionesLoteAdelantos(loteIdLocal) {
  const lote = (DB.lotesAdelantos || []).find(l => l.id.slice(-9) === loteIdLocal);
  const items = _itemsDelLote(loteIdLocal).filter(it => it.banco !== 'BBVA' && it.banco !== 'Macro');
  const filas = [['N° socio', 'Nombre', 'Banco', 'CBU', 'CUIT', 'Importe'], ...items.map(it => [it.nroSocio, it.nombre, it.banco || '—', it.cbu || '—', it.cuit || '—', it.monto])];
  await _descargarXlsx(`excepciones_${lote?.nroLote || 'lote'}.xlsx`, filas);
}

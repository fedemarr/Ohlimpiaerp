// Liquidaciones — "💸 Pago de retiros" (LIQUIDACIONES_pago_archivos_para_Fede_2.md
// + mockup_pago_retiros.html). Tabs Operarios / Administrativos / Lotes de
// pago: tildar a quién pagar → Confirmar tanda → se crea un LOTE persistido
// (lotes_pago/lotes_pago_items) y quedan disponibles los archivos ("hoja de
// copiado") de cada banco para pegar en su planilla — ver bancos.js.
//
// Reutiliza SIN duplicar: window._getFilasConsolidadas(mes) (bruto/neto
// reales, ya validados) y window._registrarPagoAsociado(...) (mismo efecto
// que "Autorizar pago": marca DB.lqsPagos, cuenta corriente y consume
// cuotas automáticas) — ambos viven en legacy.js, expuestos a propósito
// para este módulo.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getCuentaCbu } from '@modules/cuentas_cbu/consultas.js';
import { clasificarPorBanco, bloquesHojaBBVA, filasHojaMacro } from './bancos.js';

function _mesActual() { return ($('lqs-mes-sel') || {}).value || new Date().toISOString().slice(0, 10).slice(0, 7); }
function _fmt(n) { return '$' + Math.round(n || 0).toLocaleString('es-AR'); }
function _id(pref) { return pref + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }

// Un asociado es "Administrativo" si viene de la Planilla Administración o
// de Suplementos (las 2 fuentes que alimentan la hoja RET-ADM del Excel
// actual) — todo lo demás (Servicios, Retenes, Mantenimiento) es "Operario"
// (hoja RET-OPE). Mismo criterio que ya separa esas fuentes en
// renderLiquidaciones() (legacy.js).
function _esAdministrativo(nombre) {
  return (DB.liqAdminPersonal || []).some(p => p.activo && p.nombre === nombre)
    || (DB.liqSuplemento || []).some(p => p.activo && p.nombre === nombre);
}

// Arma la fila de pago de cada asociado del período: bruto/neto reales
// (fuente única: _getFilasConsolidadas) + su cuenta bancaria vigente
// (fuente única: Cuentas CBU) + si ya está pagado este mes.
function _filasPago(mes) {
  const base = (window._getFilasConsolidadas ? window._getFilasConsolidadas(mes) : []);
  return base.map(f => {
    const legajo = (DB.legajos || []).find(l => l.nombre === f.nombre);
    const cuenta = legajo ? getCuentaCbu(legajo.nro) : null;
    const tieneCbu = cuenta?.estado === 'ACTIVA';
    const pagoInfo = DB.lqsPagos?.[mes]?.[f.nombre];
    return {
      nombre: f.nombre,
      nroSocio: legajo?.nro || '',
      servicio: legajo?.servicio || legajo?.funcion || '—',
      cuit: legajo?.cuit || '',
      bruto: f.bruto,
      neto: f.neto,
      tipo: _esAdministrativo(f.nombre) ? 'administrativos' : 'operarios',
      banco: tieneCbu ? cuenta.banco : null,
      cbu: tieneCbu ? cuenta.cbu : null,
      tieneCbu,
      pagado: !!pagoInfo?.pagado,
      montoPagado: pagoInfo?.monto || 0,
      fechaPagado: pagoInfo?.fecha || '',
    };
  });
}

// ========== SELECCIÓN (en memoria, por sesión — mismo criterio que
// DB.lqsListos, que tampoco persiste hoy) ==========
const _seleccion = new Set();

export function tildarPago(nombre, val) {
  if (val) _seleccion.add(nombre); else _seleccion.delete(nombre);
  _actualizarBarraPago();
}

export function marcarTodosPago(tipo, val) {
  const filas = _filasPago(_mesActual()).filter(f => f.tipo === tipo && f.tieneCbu && !f.pagado);
  filas.forEach(f => { if (val) _seleccion.add(f.nombre); else _seleccion.delete(f.nombre); });
  (tipo === 'operarios' ? renderPagoOperarios : renderPagoAdministrativos)();
}

function _seleccionDe(tipo) {
  return _filasPago(_mesActual()).filter(f => f.tipo === tipo && _seleccion.has(f.nombre) && f.tieneCbu && !f.pagado);
}

function _actualizarBarraPago() {
  const tab = _tabPagoActual;
  if (tab !== 'operarios' && tab !== 'administrativos') return;
  const sel = _seleccionDe(tab);
  const tot = sel.reduce((s, f) => s + f.neto, 0);
  const nEl = $('pago-sel-n'), mEl = $('pago-sel-m'), dEl = $('pago-sel-det'), btn = $('btn-confirmar-tanda');
  if (nEl) nEl.textContent = sel.length;
  if (mEl) mEl.textContent = _fmt(tot);
  if (dEl) {
    const porBanco = {};
    sel.forEach(f => { porBanco[f.banco] = (porBanco[f.banco] || 0) + 1; });
    dEl.textContent = sel.length ? '(' + Object.entries(porBanco).map(([b, n]) => n + ' ' + b).join(' · ') + ')' : '';
  }
  if (btn) btn.style.display = sel.length ? 'inline-flex' : 'none';
}

// ========== TABS ==========

let _tabPagoActual = 'operarios';

export function tabPago(tab, btn) {
  _tabPagoActual = tab;
  document.querySelectorAll('#lqs-tab-pago .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#lqs-tab-pago .tab-content').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#lqs-tab-pago .tab-btn[data-pago-tab="${tab}"]`)?.classList.add('active');
  $('pago-panel-' + tab)?.classList.add('active');
  if (tab === 'operarios') renderPagoOperarios();
  else if (tab === 'administrativos') renderPagoAdministrativos();
  else renderLotesPago();
  _actualizarBarraPago();
}

export function renderPagoRetiros() {
  tabPago(_tabPagoActual);
}

// Tab de NIVEL SUPERIOR de screen-liquidaciones: 📊 Resumen (legacy.js,
// tabla consolidada de siempre) vs 💸 Pago de retiros (este módulo).
export function tabLqs(tab, btn) {
  document.querySelectorAll('#screen-liquidaciones > .tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-liquidaciones > .tab-content').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-liquidaciones > .tabs .tab-btn[data-lqs-tab="${tab}"]`)?.classList.add('active');
  $('lqs-tab-' + tab)?.classList.add('active');
  if (tab === 'pago') renderPagoRetiros();
  else if (window.renderLiquidaciones) window.renderLiquidaciones();
}

// ========== RENDER TABLAS ==========

function _chipBanco(f) {
  if (!f.tieneCbu) return '<span class="badge badge-rojo">SIN CBU</span>';
  if (f.banco === 'BBVA') return '<span class="badge badge-azul">BBVA</span>';
  if (f.banco === 'Macro') return '<span class="badge badge-acento">MACRO</span>';
  return `<span class="badge badge-gris">${f.banco}</span> <span class="badge badge-naranja">EXCEPCIÓN</span>`;
}

function _renderTablaPago(tipo, tbodyId, chipNId) {
  const tbody = $(tbodyId);
  if (!tbody) return;
  const filas = _filasPago(_mesActual()).filter(f => f.tipo === tipo);
  const chip = $(chipNId);
  const pendientes = filas.filter(f => !f.pagado);
  if (chip) chip.textContent = pendientes.length;

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin datos para este período.</td></tr>`;
    return;
  }
  tbody.innerHTML = filas.map(f => {
    const estado = f.pagado
      ? `<span class="badge badge-verde">PAGADO ✓</span>`
      : f.tieneCbu
        ? `<span class="badge badge-gris">A PAGAR</span>`
        : `<span class="badge badge-rojo">RETENIDO — sin cuenta</span>`;
    const chk = (f.tieneCbu && !f.pagado)
      ? `<input type="checkbox" ${_seleccion.has(f.nombre) ? 'checked' : ''} onchange="tildarPago('${f.nombre.replace(/'/g, "\\'")}', this.checked)">`
      : '';
    return `<tr${!f.tieneCbu ? ' style="background:#fff8f7;"' : ''}>
      <td style="text-align:center;">${chk}</td>
      <td><div style="font-weight:600;">${f.nroSocio ? f.nroSocio + ' · ' : ''}${f.nombre}</div></td>
      <td style="font-size:11.5px;color:var(--texto-suave);">${f.servicio}</td>
      <td>${_chipBanco(f)}</td>
      <td style="text-align:right;font-weight:700;">${_fmt(f.pagado ? f.montoPagado : f.neto)}</td>
      <td>${estado}</td>
    </tr>`;
  }).join('');
}

export function renderPagoOperarios() { _renderTablaPago('operarios', 'tbody-pago-ope', 'chip-pago-ope'); _actualizarBarraPago(); }
export function renderPagoAdministrativos() { _renderTablaPago('administrativos', 'tbody-pago-adm', 'chip-pago-adm'); _actualizarBarraPago(); }

// ========== CONFIRMAR TANDA ==========

let _tandaTipo = null;

export function abrirConfirmarTanda() {
  const tipo = _tabPagoActual;
  const sel = _seleccionDe(tipo);
  if (!sel.length) { toast('No hay asociados tildados en este tab.'); return; }
  _tandaTipo = tipo;
  ensureModalTanda();
  const tot = sel.reduce((s, f) => s + f.neto, 0);
  const { bbva, macro, excepciones } = clasificarPorBanco(sel);
  $('tanda-resumen').innerHTML = `<b>${sel.length} asociado(s)</b> · <b>${_fmt(tot)}</b><br>
    ${bbva.length ? `· BBVA: hoja de copiado (${bbva.length}, bloques de 150)<br>` : ''}
    ${macro.length ? `· Macro: hoja de copiado (${macro.length})<br>` : ''}
    ${excepciones.length ? `· Excepciones — pago manual (${excepciones.length})` : ''}`;
  $('tanda-fecha').value = new Date().toISOString().slice(0, 10);
  $('tanda-concepto').value = 'RETIROS';
  abrirModal('modal-confirmar-tanda');
}
function ensureModalTanda() {
  if ($('modal-confirmar-tanda')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-confirmar-tanda';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>Confirmar tanda y generar archivos</h3><button class="btn-close" onclick="cerrarModal('modal-confirmar-tanda')">×</button></div>
      <div class="modal-body">
        <div id="tanda-resumen" style="font-size:13px;margin-bottom:14px;padding:10px 12px;background:var(--fondo);border-radius:var(--radio);"></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Fecha de acreditación *</label><input type="date" id="tanda-fecha"></div>
          <div class="form-group"><label>Concepto</label><select id="tanda-concepto"><option>RETIROS</option><option>ADELANTOS</option></select></div>
        </div>
        <div class="alerta alerta-warning" style="font-size:12px;">Esta acción marca a todos los tildados como PAGADOS y consume sus cuotas automáticas (uniforme/préstamo/retenciones) — no tiene deshacer. Los archivos quedan disponibles después en "Lotes de pago".</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-confirmar-tanda')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarTandaPago()">✅ Confirmar tanda</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function _proximoNroLote() {
  const anio = new Date().getFullYear();
  const nums = (DB.lotesPago || [])
    .map(l => (String(l.nroLote || '').match(/-(\d+)$/) || [])[1])
    .filter(Boolean).map(Number);
  const siguiente = (nums.length ? Math.max(...nums) : 0) + 1;
  return `LOTE-${anio}-${String(siguiente).padStart(3, '0')}`;
}

export async function confirmarTandaPago() {
  const tipo = _tandaTipo;
  const sel = _seleccionDe(tipo);
  if (!sel.length) { toast('No hay asociados tildados.'); return; }
  const fechaAcreditacion = $('tanda-fecha').value;
  const concepto = $('tanda-concepto').value;
  if (!fechaAcreditacion) { toast('⚠️ Elegí la fecha de acreditación'); return; }

  const mes = _mesActual();
  const fechaHoy = new Date().toLocaleDateString('es-AR');
  const confirmadoPor = currentUser?.nombre || 'Admin';
  const total = sel.reduce((s, f) => s + f.neto, 0);

  const lote = {
    id: _id('LOTE'),
    nroLote: _proximoNroLote(),
    periodo: mes,
    tipo,
    cantidad: sel.length,
    total,
    confirmadoPor,
    confirmadoEn: new Date().toISOString(),
    anulado: false,
  };
  const okLote = await supaSync('lotesPago', lote);
  if (!okLote) { toast('⚠️ No se pudo crear el lote — reintentá'); return; }
  if (!DB.lotesPago) DB.lotesPago = [];
  DB.lotesPago.push(lote);

  for (const f of sel) {
    const item = {
      id: _id('LOTEITEM'),
      loteIdLocal: lote.id.slice(-9),
      legajoNro: f.nroSocio,
      nombreAsociado: f.nombre,
      banco: f.banco,
      cbu: f.cbu,
      cuit: f.cuit,
      monto: f.neto,
      esExcepcion: f.banco !== 'BBVA' && f.banco !== 'Macro',
    };
    await supaSync('lotesPagoItems', item);
    if (!DB.lotesPagoItems) DB.lotesPagoItems = [];
    DB.lotesPagoItems.push(item);
    window._registrarPagoAsociado(mes, f.nombre, f.bruto, f.neto, fechaHoy, confirmadoPor, {
      loteIdLocal: lote.id.slice(-9), banco: f.banco, cbu: f.cbu,
    });
  }

  // Guardar fecha/concepto elegidos junto al lote para poder regenerar los
  // mismos archivos después ("re-descargables", nunca distintos).
  lote.fechaAcreditacion = fechaAcreditacion;
  lote.concepto = concepto;
  await supaSync('lotesPago', lote);

  cerrarModal('modal-confirmar-tanda');
  _seleccion.clear();
  toast(`✅ ${lote.nroLote} confirmado — ${sel.length} asociado(s) · ${_fmt(total)}`);
  window.renderLiquidaciones();
  tabPago(tipo);
  tabPago('lotes');
}

// ========== LOTES DE PAGO ==========

export function renderLotesPago() {
  const cont = $('lotes-pago-cont');
  if (!cont) return;
  const lotes = [...(DB.lotesPago || [])].filter(l => !l.anulado)
    .sort((a, b) => String(b.confirmadoEn).localeCompare(String(a.confirmadoEn)));
  const chip = $('chip-pago-lotes');
  if (chip) chip.textContent = lotes.length;

  if (!lotes.length) {
    cont.innerHTML = '<p style="text-align:center;padding:24px;opacity:.5;">Todavía no se confirmó ninguna tanda.</p>';
    return;
  }
  const chipArchivoStyle = 'display:inline-block;background:var(--fondo);border:1px solid var(--borde);border-radius:7px;padding:5px 11px;font-size:11.5px;font-family:\'DM Mono\',monospace;margin:3px 6px 3px 0;color:var(--azul);cursor:pointer;';
  cont.innerHTML = lotes.map(lote => {
    const items = (DB.lotesPagoItems || []).filter(it => it.loteIdLocal === lote.id.slice(-9));
    const { bbva, macro, excepciones } = clasificarPorBanco(items);
    const nBloquesBbva = bbva.length ? Math.ceil(bbva.length / 150) : 0;
    const archivos = [];
    for (let b = 0; b < nBloquesBbva; b++) {
      archivos.push(`<span style="${chipArchivoStyle}" onclick="descargarArchivoLote('${lote.id.slice(-9)}','bbva',${b})">⬇ copiado_BBVA_${lote.nroLote.split('-').pop()}-${b + 1}.xlsx (${Math.min(150, bbva.length - b * 150)})</span>`);
    }
    if (macro.length) archivos.push(`<span style="${chipArchivoStyle}" onclick="descargarArchivoLote('${lote.id.slice(-9)}','macro',0)">⬇ copiado_MACRO_${lote.nroLote.split('-').pop()}.xlsx (${macro.length})</span>`);
    if (excepciones.length) archivos.push(`<span style="${chipArchivoStyle}background:#fef3c7;" onclick="descargarExcepcionesLote('${lote.id.slice(-9)}')">📄 excepciones (${excepciones.length})</span>`);
    return `<div style="border:1px solid var(--borde);border-radius:10px;padding:13px 16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <b>${lote.nroLote} · ${lote.tipo === 'operarios' ? 'Operarios' : 'Administrativos'} · ${lote.periodo}</b>
        <span class="badge badge-verde">PAGADO ${new Date(lote.confirmadoEn).toLocaleDateString('es-AR')}</span>
      </div>
      <div style="font-size:12px;color:var(--texto-suave);margin-bottom:6px;">${lote.cantidad} asociados · ${_fmt(lote.total)} · confirmó ${lote.confirmadoPor} — archivos:</div>
      <div>${archivos.join('') || '<span class="text-muted">Sin archivos (todos excepción manual)</span>'}</div>
    </div>`;
  }).join('');
}

function _itemsDelLote(loteIdLocal) {
  return (DB.lotesPagoItems || []).filter(it => it.loteIdLocal === loteIdLocal)
    .map(it => ({ nroSocio: it.legajoNro, nombre: it.nombreAsociado, banco: it.banco, cbu: it.cbu, cuit: it.cuit, monto: it.monto }));
}

async function _descargarXlsx(nombreArchivo, filas) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(filas);
  // Todas las celdas como TEXTO (regla del banco: no puede perderse un
  // cero a la izquierda al copiar/pegar en la planilla del banco).
  Object.keys(ws).forEach(addr => {
    if (addr[0] === '!') return;
    ws[addr].t = 's';
    ws[addr].z = '@';
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Copiado');
  XLSX.writeFile(wb, nombreArchivo);
}

export async function descargarArchivoLote(loteIdLocal, banco, bloqueIdx) {
  const lote = (DB.lotesPago || []).find(l => l.id.slice(-9) === loteIdLocal);
  const items = _itemsDelLote(loteIdLocal).filter(it => it.banco === (banco === 'bbva' ? 'BBVA' : 'Macro'));
  if (banco === 'bbva') {
    const bloques = bloquesHojaBBVA(items, lote?.fechaAcreditacion || new Date().toISOString().slice(0, 10), lote?.concepto || 'RETIROS');
    await _descargarXlsx(`copiado_BBVA_${(lote?.nroLote || 'lote').split('-').pop()}-${bloqueIdx + 1}.xlsx`, bloques[bloqueIdx] || []);
  } else {
    await _descargarXlsx(`copiado_MACRO_${(lote?.nroLote || 'lote').split('-').pop()}.xlsx`, filasHojaMacro(items));
  }
}

export async function descargarExcepcionesLote(loteIdLocal) {
  const lote = (DB.lotesPago || []).find(l => l.id.slice(-9) === loteIdLocal);
  const items = _itemsDelLote(loteIdLocal).filter(it => it.banco !== 'BBVA' && it.banco !== 'Macro');
  const filas = [['N° socio', 'Nombre', 'Banco', 'CBU', 'CUIT', 'Importe'], ...items.map(it => [it.nroSocio, it.nombre, it.banco || '—', it.cbu || '—', it.cuit || '—', it.monto])];
  await _descargarXlsx(`excepciones_${(lote?.nroLote || 'lote')}.xlsx`, filas);
}

// Tareas Especiales — render (ticket "Módulo Tareas Especiales" 18/09).
// Pura lectura en vivo de las grillas — ver consultas.js para el
// modelo. La corrección de un dato SIEMPRE se hace en la grilla del
// servicio ("→ ver grilla"); acá no hay ningún input editable, salvo
// el parámetro de convenio (Configuración).

import { DB } from '@shared/state.js';
import { $, getDiasDelMes } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { getTareasEspecialesActivos, resumenTareaEspecialMes } from './consultas.js';
import { obtenerConvenioVigente, historialConvenio, guardarNuevoConvenio } from './config.js';

const _expandidos = new Set();
let _tabActual = 'planilla';

function _mesActualISO() { return new Date().toISOString().slice(0, 7); }
function _hoyISO() { return new Date().toISOString().slice(0, 10); }
function _fmtMonto(n) { return '$' + Math.round(n || 0).toLocaleString('es-AR'); }

function _poblarSelectorMes() {
  const sel = $('te-mes-sel');
  if (!sel || sel.options.length) return;
  const hoy = new Date();
  for (let i = -2; i <= 1; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

export function tabTareasEspeciales(tab, btn) {
  _tabActual = tab;
  document.querySelectorAll('#screen-tareas_especiales .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-tareas_especiales .tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  $('te-tab-' + tab)?.classList.add('active');
  renderTareasEspeciales();
}

export function toggleTareaEspecialDetalle(legajoNro) {
  if (_expandidos.has(legajoNro)) _expandidos.delete(legajoNro);
  else _expandidos.add(legajoNro);
  renderTareasEspeciales();
}

export function irAGrillaServicioTE(codigo, mes) {
  if (window.irAGrillaServicio) { window.irAGrillaServicio(codigo, mes); return; }
  window.navTo('liquidacion');
  setTimeout(() => {
    if (window.tabLiquidacion) window.tabLiquidacion('grillas');
    const sel = $('liq-mes-sel');
    if (sel) sel.value = mes;
    if (window.renderGrillasLiq) window.renderGrillasLiq();
    if (window.toggleGrilla) window.toggleGrilla(codigo);
  }, 30);
}

// ========== MODAL "VER PLANILLA" — un servicio, día por día ==========

export function verPlanillaServicioTE(legajoNro, codigo, mes) {
  const legajo = getTareasEspecialesActivos().find(l => l.nro === legajoNro) || (DB.legajos || []).find(l => l.nro === legajoNro);
  if (!legajo) return;
  const r = resumenTareaEspecialMes(legajo, mes);
  const sv = r.servicios.find(s => s.codigo === codigo);
  if (!sv) return;
  const dias = getDiasDelMes(mes);

  $('mp-tit').textContent = `${legajo.nro} · ${legajo.nombre} — ${sv.nombre}`;
  $('mp-sub').textContent = `Planilla de horas del asociado en este servicio · Supervisor: ${sv.supervisor} · solo lectura`;

  const chipTipo = sv.facturable ? '<span class="badge badge-verde">✅ Facturable</span>' : '<span class="badge badge-naranja">❌ No facturable</span>';
  const tira = dias.map(dia => {
    const info = sv.porDia[dia.iso];
    let cls = 'width:34px;border:1px solid var(--borde);border-radius:6px;text-align:center;font-size:10px;padding:3px 0;background:#fff;';
    let val = '<span style="color:#ccc;">·</span>';
    if (dia.esFinde) cls += 'background:#fffbe8;';
    if (dia.iso === _hoyISO()) cls += 'outline:2px solid #c96a00;outline-offset:-2px;';
    if (info) {
      const raw = String(info.raw).toUpperCase();
      if (raw === 'AI') { cls += 'background:#fbe0dc;'; val = '<b style="color:#b3261e;">AI</b>'; }
      else if (raw === 'AJ') { cls += 'background:#d7f0ee;'; val = '<b style="color:#0b6e66;">AJ</b>'; }
      else { val = `<b style="color:#1b4ea0;">${info.raw}</b>`; }
    }
    return `<div style="display:inline-block;${cls}"><div style="color:#99a;font-size:9px;">${dia.d}</div>${val}</div>`;
  }).join(' ');

  $('mp-body').innerHTML = `
    ${chipTipo} <span class="badge badge-azul">${sv.hsServicio} hs en el mes</span> <span class="badge badge-verde">💰 Cobra ${_fmtMonto(sv.hsServicio * r.valorHora)}</span>
    <span style="font-size:11px;color:var(--texto-suave);">(${sv.hsServicio} hs × ${_fmtMonto(r.valorHora)} — valor hora de su categoría)</span>
    <div style="display:flex;gap:3px;flex-wrap:wrap;margin:12px 0 8px;">${tira}</div>
    <div style="font-size:11.5px;color:var(--texto-suave);">Es la misma fila de la grilla del servicio, leída en vivo. AJ = ausencia justificada (paga, cuenta para el convenio) · AI = injustificada (0 hs, descuenta convenio). Para corregir: <a href="#" onclick="irAGrillaServicioTE('${codigo}','${mes}');return false;" style="color:var(--azul);">✏ en la grilla de ${sv.nombre}</a> (fuente única).</div>
  `;
  abrirModal('modal-te-planilla');
}

// ========== TAB PLANILLA ==========

function _filaChips(legajo, r) {
  const chips = [];
  if (legajo.estado !== 'Activo') chips.push('<span class="badge badge-rojo">BAJA</span> <span class="badge badge-gris">sin prorrateo — convenio completo</span>');
  if (r.diasAI > 0) chips.push(`<span class="badge badge-rojo">−${8 * r.diasAI} hs de convenio por ${r.diasAI} AI</span>`);
  if (r.ajHs > 0) chips.push(`<span class="badge badge-verde">incluye ${r.ajHs} hs AJ</span>`);
  return chips.join(' ');
}

function _celdaDia(d) {
  let style = 'width:26px;text-align:center;font-size:10px;padding:3px 1px;border:1px solid var(--borde);border-radius:4px;background:#fff;';
  let val = '<span style="color:#ccc;">·</span>';
  if (d.esFinde) style += 'background:#fffbe8;';
  if (d.esAI) { style += 'background:#fbe0dc;'; val = '<b style="color:#b3261e;">AI</b>'; }
  else if (d.esAJ) { style += 'background:#d7f0ee;'; val = `<b style="color:#0b6e66;">${d.total || 'AJ'}</b>`; }
  else if (d.total > 0) { val = `<b style="color:var(--azul);">${d.total}</b>`; }
  return `<td style="${style}"><div style="color:#99a;font-size:8.5px;">${d.d}</div>${val}</td>`;
}

function _detalleServicios(legajo, r, mes) {
  const filasServicio = r.servicios.map(sv => `
    <tr>
      <td><b class="link-azul" style="cursor:pointer;color:var(--azul);text-decoration:underline dotted;" onclick="verPlanillaServicioTE(${legajo.nro},'${sv.codigo}','${mes}')">${sv.nombre}</b></td>
      <td>${sv.supervisor}</td>
      <td>${sv.facturable ? '<span class="badge badge-verde">✅ Facturable</span>' : '<span class="badge badge-naranja">❌ No facturable</span>'}</td>
      <td style="text-align:right;">${sv.hsServicio} hs</td>
      <td><a href="#" onclick="event.stopPropagation();irAGrillaServicioTE('${sv.codigo}','${mes}');return false;" style="color:var(--azul);font-size:12px;">→ ver grilla</a></td>
    </tr>`).join('');
  const filaAJ = r.ajHs > 0 ? `<tr><td><b style="color:#0b6e66;">Ausencia justificada (AJ)</b></td><td colspan="2"><span class="badge badge-verde">AJ · paga y cuenta para el convenio, no se factura</span></td><td style="text-align:right;">${r.ajHs} hs</td><td></td></tr>` : '';
  const filaAI = r.diasAI > 0 ? `<tr><td><b style="color:#b3261e;">Ausencia injustificada (AI)</b></td><td colspan="2"><span class="badge badge-rojo">AI · 0 hs y descuenta 8 hs de convenio por día</span></td><td style="text-align:right;">${r.diasAI} día${r.diasAI === 1 ? '' : 's'}</td><td style="font-size:10.5px;color:var(--texto-suave);">convenio: ${r.convenioParam} − ${8 * r.diasAI} = ${r.convenioEfectivo}</td></tr>` : '';
  const filaComp = r.complemento > 0 ? `<tr><td><b style="color:#b25b00;">Complemento convenio ${r.convenioParam}</b></td><td colspan="2"><span class="badge badge-naranja">Convenio · no facturable · es lo único que viaja a Liquidaciones</span></td><td style="text-align:right;font-weight:700;color:#b25b00;">+${r.complemento} hs</td><td style="font-size:10.5px;color:var(--texto-suave);">${r.convenioEfectivo} − ${r.reales} reales</td></tr>` : '';
  return `
    <table style="width:100%;font-size:12.5px;">
      <thead><tr style="background:var(--fondo);"><th style="padding:5px 8px;text-align:left;">Servicio</th><th style="padding:5px 8px;text-align:left;">Supervisor</th><th style="padding:5px 8px;text-align:left;">Tipo hs</th><th style="padding:5px 8px;text-align:right;">Hs del mes</th><th></th></tr></thead>
      <tbody>${filasServicio}${filaAJ}${filaAI}${filaComp}</tbody>
    </table>
    <div style="font-size:11px;color:var(--texto-suave);margin-top:6px;">Las horas por servicio se leen de las grillas (solo lectura acá). Las reales llegan al retiro por las grillas; este módulo solo aporta el complemento.</div>`;
}

function _renderTabPlanilla(mes, datos) {
  const dias = getDiasDelMes(mes);

  const congelado = (DB.periodosLiq || []).find(p => p.periodo === mes)?.congelado;
  const chipPer = $('te-chip-periodo');
  if (chipPer) {
    chipPer.innerHTML = congelado
      ? '<span class="badge badge-gris">🔒 PERÍODO ANTERIOR — congelado, solo lectura</span>'
      : '<span class="badge badge-verde">● PERÍODO VIGENTE — carga en curso, se actualiza en vivo</span>';
  }

  const convenioVigente = obtenerConvenioVigente(mes + '-01');
  const elConv = $('te-convenio-txt');
  if (elConv) elConv.innerHTML = `Convenio: <b>${convenioVigente} hs</b> por asociado (parámetro de Configuración) <a href="#" onclick="abrirConfigConvenioTE();return false;" style="font-size:11px;color:var(--azul);margin-left:6px;">✏ editar</a>`;

  // Los <th> de días se insertan entre la 1ra columna (Asociado, fija) y
  // las columnas agregadas (Hs reales...) — mismo patrón que el mockup
  // (cab.insertBefore), reconstruido solo cuando cambia el mes.
  const filaCab = $('te-fila-cab');
  if (filaCab && filaCab.dataset.mes !== mes) {
    filaCab.querySelectorAll('.te-th-dia').forEach(th => th.remove());
    const ref = filaCab.children[1];
    dias.forEach(d => {
      const th = document.createElement('th');
      th.className = 'te-th-dia';
      th.style.cssText = `text-align:center;padding:4px 3px;font-size:9.5px;${d.esFinde ? 'background:#fff3b8;color:#7a5b00;' : ''}`;
      th.textContent = d.d;
      filaCab.insertBefore(th, ref);
    });
    filaCab.dataset.mes = mes;
  }

  const tbody = $('tbody-tareas-especiales');
  if (!tbody) return;
  if (!datos.length) {
    tbody.innerHTML = `<tr><td colspan="${dias.length + 7}" style="text-align:center;padding:32px;opacity:.5;">Sin activos con categoría "Tareas Especiales" en el padrón.</td></tr>`;
    return;
  }

  tbody.innerHTML = datos.map(({ legajo, r }) => {
    const expandido = _expandidos.has(legajo.nro);
    const chips = _filaChips(legajo, r);
    const filaPrincipal = `<tr class="fila-te" style="cursor:pointer;" onclick="toggleTareaEspecialDetalle(${legajo.nro})">
      <td style="position:sticky;left:0;background:#fff;z-index:1;padding:8px 6px;min-width:200px;">
        <span style="color:var(--azul);">${expandido ? '▼' : '▶'}</span> <b>${legajo.nro}</b> · ${legajo.nombre}
        ${chips ? `<div style="margin-top:3px;">${chips}</div>` : ''}
      </td>
      ${r.diasAgregados.map(_celdaDia).join('')}
      <td style="text-align:right;padding:8px 6px;"><b>${r.reales}</b></td>
      <td style="text-align:right;padding:8px 6px;">${r.convenioEfectivo}${r.convenioEfectivo !== r.convenioParam ? ' <span class="badge badge-rojo" style="font-size:9px;">AI</span>' : ''}</td>
      <td style="text-align:right;padding:8px 6px;${r.complemento ? 'color:#b25b00;font-weight:700;' : 'color:#bbb;'}">${r.complemento ? '+' + r.complemento : '0'}</td>
      <td style="text-align:right;padding:8px 6px;"><b>${r.hsACobrar}</b>${r.complemento ? ' <span class="badge badge-naranja" style="font-size:9px;">mínimo</span>' : ''}</td>
      <td style="text-align:right;padding:8px 6px;">${_fmtMonto(r.valorHora)}</td>
      <td style="text-align:right;padding:8px 6px;font-weight:700;color:var(--verde);">${_fmtMonto(r.totalMes)}</td>
    </tr>`;
    const filaDetalle = expandido
      ? `<tr style="background:#f8fafd;"><td></td><td colspan="${dias.length + 6}" style="padding:10px 14px;">${_detalleServicios(legajo, r, mes)}</td></tr>`
      : '';
    return filaPrincipal + filaDetalle;
  }).join('');
}

// ========== TAB RESUMEN DE PAGO ==========

function _renderTabResumenPago(mes, datos) {
  const tbody = $('tbody-te-pago');
  if (!tbody) return;
  if (!datos.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin activos con categoría "Tareas Especiales" en el padrón.</td></tr>`;
    return;
  }
  let tRe = 0, tCo = 0, tAc = 0, tTo = 0;
  tbody.innerHTML = datos.map(({ legajo, r }) => {
    tRe += r.reales; tCo += r.complemento; tAc += r.hsACobrar; tTo += r.totalMes;
    const queViaja = r.complemento > 0
      ? `<span style="color:#b25b00;font-weight:600;">Complemento ${_fmtMonto(r.totalComplemento)} (no facturable)</span>`
      : '<span style="color:var(--texto-suave);">nada — las reales ya van por las grillas</span>';
    return `<tr>
      <td><b>${legajo.nro}</b> · ${legajo.nombre}</td>
      <td>${legajo.estado === 'Activo' ? '<span class="badge badge-verde">ACTIVO</span>' : '<span class="badge badge-rojo">BAJA</span>'}</td>
      <td style="text-align:right;">${r.reales}</td>
      <td style="text-align:right;">${r.convenioEfectivo}</td>
      <td style="text-align:right;${r.complemento ? 'color:#b25b00;font-weight:700;' : 'color:#bbb;'}">${r.complemento ? '+' + r.complemento : '0'}</td>
      <td style="text-align:right;"><b>${r.hsACobrar}</b></td>
      <td style="text-align:right;font-weight:700;">${_fmtMonto(r.totalMes)}</td>
      <td style="font-size:11.5px;">${queViaja}</td>
    </tr>`;
  }).join('');
  if ($('te-pago-tot-re')) $('te-pago-tot-re').textContent = tRe.toLocaleString('es-AR');
  if ($('te-pago-tot-co')) $('te-pago-tot-co').textContent = '+' + tCo.toLocaleString('es-AR');
  if ($('te-pago-tot-ac')) $('te-pago-tot-ac').textContent = tAc.toLocaleString('es-AR');
  if ($('te-pago-tot-to')) $('te-pago-tot-to').textContent = _fmtMonto(tTo);
  if ($('te-pago-titulo')) $('te-pago-titulo').textContent = `📊 Resumen de pago — vista de control de Finanzas (${datos.length} asociado${datos.length === 1 ? '' : 's'})`;
}

// ========== RENDER PRINCIPAL + KPIs ==========

export function renderTareasEspeciales() {
  _poblarSelectorMes();
  const mes = $('te-mes-sel')?.value || _mesActualISO();

  const activos = getTareasEspecialesActivos();
  const datos = activos.map(legajo => ({ legajo, r: resumenTareaEspecialMes(legajo, mes) }));

  const totReales = datos.reduce((s, { r }) => s + r.reales, 0);
  const cobranMinimo = datos.filter(({ r }) => r.complemento > 0).length;
  const totComplementoHs = datos.reduce((s, { r }) => s + r.complemento, 0);
  const totComplementoMonto = datos.reduce((s, { r }) => s + r.totalComplemento, 0);

  if ($('kpi-te-activos')) $('kpi-te-activos').textContent = activos.length;
  if ($('kpi-te-reales')) $('kpi-te-reales').textContent = totReales.toLocaleString('es-AR') + ' hs';
  if ($('kpi-te-minimo')) $('kpi-te-minimo').textContent = cobranMinimo;
  if ($('kpi-te-comp')) $('kpi-te-comp').textContent = _fmtMonto(totComplementoMonto);
  if ($('kpi-te-comp-sub')) $('kpi-te-comp-sub').textContent = `${totComplementoHs} hs pagadas por convenio sin trabajar`;

  if (_tabActual === 'planilla') _renderTabPlanilla(mes, datos);
  else _renderTabResumenPago(mes, datos);
}

export function filtrarTareasEspeciales() { renderTareasEspeciales(); }

// ========== CONFIGURACIÓN DEL CONVENIO ==========

export function abrirConfigConvenioTE() {
  const vigente = obtenerConvenioVigente();
  if ($('tec-horas')) $('tec-horas').value = vigente;
  if ($('tec-tipo')) $('tec-tipo').value = 'corregir';
  if ($('tec-vigencia')) {
    const hoy = new Date();
    $('tec-vigencia').value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    $('tec-vigencia').style.display = 'none';
  }
  if ($('tec-motivo')) $('tec-motivo').value = '';
  _renderHistorialConvenio();
  abrirModal('modal-te-config');
}

export function cambiarTipoConvenioTE() {
  const esVigencia = $('tec-tipo')?.value === 'vigencia';
  if ($('tec-vigencia')) $('tec-vigencia').style.display = esVigencia ? '' : 'none';
}

function _renderHistorialConvenio() {
  const cont = $('tec-historial');
  if (!cont) return;
  const hist = historialConvenio();
  cont.innerHTML = hist.length
    ? hist.map(v => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--borde);">
        <b>${v.horasConvenio} hs</b> — desde ${v.vigenciaDesde}${v.vigenciaHasta ? ' hasta ' + v.vigenciaHasta : ' (vigente)'}
        <span style="color:var(--texto-suave);"> · ${v.cargadoPor || '—'}${v.motivo ? ' · ' + v.motivo : ''}</span>
      </div>`).join('')
    : '<div style="font-size:12px;color:var(--texto-suave);">Sin historial todavía.</div>';
}

export async function confirmarConvenioTE() {
  const horas = parseFloat(($('tec-horas') || {}).value);
  if (!horas || horas <= 0) { toast('⚠️ Ingresá una cantidad de horas válida'); return; }
  const tipoCambio = ($('tec-tipo') || {}).value || 'corregir';
  const vigenciaDesde = tipoCambio === 'vigencia' ? ($('tec-vigencia') || {}).value : new Date().toISOString().slice(0, 7) + '-01';
  const motivo = ($('tec-motivo') || {}).value.trim();
  if (tipoCambio === 'vigencia' && !vigenciaDesde) { toast('⚠️ Elegí la fecha de vigencia'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }
  try {
    await guardarNuevoConvenio({ tipoCambio, horas, vigenciaDesde, motivo });
    cerrarModal('modal-te-config');
    toast('✅ Convenio actualizado');
    renderTareasEspeciales();
  } catch (e) {
    toast('⚠️ ' + e.message);
  }
}

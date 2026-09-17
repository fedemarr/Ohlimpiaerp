// Retenes v2 — render (ticket "Módulo Retenes" 18/09). Pura lectura en
// vivo de las grillas de servicios — ver consultas.js para el modelo.
// La corrección de un dato SIEMPRE se hace en la grilla del servicio
// ("→ ver grilla"); acá no hay ningún input editable.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { getDiasDelMes } from '@shared/helpers.js';
import { getRetenesActivos, resumenRetenMes } from './consultas.js';

const _expandidos = new Set();

function _mesActualISO() { return new Date().toISOString().slice(0, 7); }
function _hoyISO() { return new Date().toISOString().slice(0, 10); }

function _poblarSelectorMes() {
  const sel = $('ret-mes-sel');
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

function _chipEstadoHoy(res) {
  if (res.estadoHoy.tipo === 'rechazo') return '<span class="badge badge-rojo">RECHAZÓ</span>';
  if (res.estadoHoy.tipo === 'servicio') return `<span class="badge" style="background:#d7f0ee;color:#0b6e66;">EN ${res.estadoHoy.servicio}</span>`;
  return '<span class="badge badge-gris">EN BASE</span>';
}

export function toggleRetenDetalle(legajoNro) {
  if (_expandidos.has(legajoNro)) _expandidos.delete(legajoNro);
  else _expandidos.add(legajoNro);
  renderRetenes();
}

export function irAGrillaServicio(codigo, mes) {
  window.navTo('liquidacion');
  setTimeout(() => {
    if (window.tabLiquidacion) window.tabLiquidacion('grillas');
    const sel = $('liq-mes-sel');
    if (sel) sel.value = mes;
    if (window.renderGrillasLiq) window.renderGrillasLiq();
    if (window.toggleGrilla) window.toggleGrilla(codigo);
  }, 30);
}

function _tiraDia(dia, info, hoyIso) {
  let style = 'display:inline-block;width:26px;border:1px solid var(--borde);border-radius:4px;text-align:center;font-size:9.5px;padding:1px 0;background:#fff;';
  let val = '<span style="color:var(--texto-muy-suave);">·</span>';
  if (dia.esFinde) style += 'background:#fdf3c9;';
  if (dia.iso === hoyIso) style += 'outline:2px solid #c96a00;outline-offset:-2px;';
  if (info) {
    if (String(info.raw).toUpperCase() === 'AI') {
      style += 'background:#fbe0dc;';
      val = '<b style="color:#b3261e;">RZ</b>';
    } else if (info.esNoFac) {
      style += 'background:#fdebd7;';
      val = `<b style="color:#b25b00;">${info.raw}</b>`;
    } else {
      style += 'background:#d7f0ee;';
      val = `<b style="color:#0b6e66;">${info.raw}</b>`;
    }
  }
  return `<div style="${style}"><div style="color:#aab;font-size:8.5px;">${dia.d}</div>${val}</div>`;
}

function _tiraServicio(dias, porDia, facturable, hoyIso) {
  return `<div style="display:flex;gap:2px;flex-wrap:wrap;margin:4px 0 2px;">${
    dias.map(dia => _tiraDia(dia, porDia[dia.iso] ? { ...porDia[dia.iso], esNoFac: !facturable } : null, hoyIso)).join('')
  }</div>`;
}

function _tiraTotal(dias, servicios, hoyIso) {
  return `<div style="display:flex;gap:2px;flex-wrap:wrap;margin:4px 0 2px;">${
    dias.map(dia => {
      let info = null;
      servicios.forEach(sv => {
        const d = sv.porDia[dia.iso];
        if (!d) return;
        if (String(d.raw).toUpperCase() === 'AI') { info = { raw: d.raw, esNoFac: false }; return; }
        if (!info) info = { raw: 0, esNoFac: !sv.facturable };
        if (typeof info.raw === 'number') info.raw += d.cobradas;
        if (!sv.facturable) info.esNoFac = true;
      });
      return _tiraDia(dia, info, hoyIso);
    }).join('')
  }</div>`;
}

function _detalleHtml(legajo, res, mes, hoyIso) {
  if (!res.servicios.length) {
    return '<div style="padding:12px 4px;color:var(--texto-suave);font-size:12.5px;">Sin horas cargadas en ninguna grilla este período.</div>';
  }
  const dias = getDiasDelMes(mes);
  const filas = res.servicios.map(sv => `
    <tr>
      <td style="padding:6px 8px;"><b style="color:var(--azul);">${sv.nombre}</b>${_tiraServicio(dias, sv.porDia, sv.facturable, hoyIso)}</td>
      <td style="padding:6px 8px;">${sv.facturable ? '<span class="badge badge-verde">✅ Facturable</span>' : '<span class="badge badge-naranja">❌ No facturable</span>'}</td>
      <td style="padding:6px 8px;font-size:12px;">${sv.supervisor}</td>
      <td style="padding:6px 8px;text-align:right;"><b>${sv.hsServicio}</b> hs</td>
      <td style="padding:6px 8px;"><a href="#" style="color:var(--azul);font-size:12px;" onclick="event.stopPropagation();irAGrillaServicio('${sv.codigo}','${mes}');return false;">→ ver grilla</a></td>
    </tr>`).join('');
  return `
    <table style="width:100%;font-size:12.5px;margin-bottom:4px;">
      <thead><tr style="background:var(--fondo);"><th style="padding:5px 8px;text-align:left;">Servicio</th><th style="padding:5px 8px;text-align:left;">Tipo HS</th><th style="padding:5px 8px;text-align:left;">Supervisor</th><th style="padding:5px 8px;text-align:right;">HS</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr style="background:var(--fondo);font-weight:700;">
        <td style="padding:6px 8px;"><b>Total por día — el mes de un vistazo</b>${_tiraTotal(dias, res.servicios, hoyIso)}</td>
        <td></td><td></td>
        <td style="padding:6px 8px;text-align:right;">${res.hsTotal} hs${res.hsNoFac ? `<div style="font-size:10px;font-weight:600;color:#b25b00;">${res.hsFac} fac · ${res.hsNoFac} no fac</div>` : ''}</td>
        <td></td>
      </tr></tfoot>
    </table>
    <div style="font-size:11px;color:var(--texto-suave);">Horas leídas de las grillas — solo lectura acá. Naranja = ❌ no facturable · RZ = rechazó ese día. La corrección se hace siempre en la grilla del servicio.</div>`;
}

export function renderRetenes() {
  _poblarSelectorMes();
  const mes = $('ret-mes-sel')?.value || _mesActualISO();
  const hoyIso = _hoyISO();

  const congelado = (DB.periodosLiq || []).find(p => p.periodo === mes)?.congelado;
  const chipPer = $('ret-chip-periodo');
  if (chipPer) {
    chipPer.innerHTML = congelado
      ? '<span class="badge badge-gris">🔒 PERÍODO ANTERIOR — congelado, solo lectura</span>'
      : '<span class="badge badge-verde">● PERÍODO VIGENTE — carga en curso, se actualiza en vivo</span>';
  }

  const retenes = getRetenesActivos();
  const datos = retenes.map(legajo => ({ legajo, res: resumenRetenMes(legajo, mes, hoyIso) }));

  let totFac = 0, totNoFac = 0, totRechazos = 0;
  const serviciosSet = new Set();
  datos.forEach(({ res }) => {
    totFac += res.hsFac; totNoFac += res.hsNoFac; totRechazos += res.rechazos;
    res.servicios.forEach(sv => serviciosSet.add(sv.codigo));
  });
  if ($('kpi-ret-activos')) $('kpi-ret-activos').textContent = retenes.length;
  if ($('kpi-ret-hs')) $('kpi-ret-hs').innerHTML = `${(totFac + totNoFac).toLocaleString('es-AR')} hs <span style="font-size:11px;font-weight:600;color:var(--texto-suave);">(${totFac} fac · <span style="color:#b25b00;">${totNoFac} no fac</span>)</span>`;
  if ($('kpi-ret-servicios')) $('kpi-ret-servicios').textContent = serviciosSet.size;
  if ($('kpi-ret-rechazos')) $('kpi-ret-rechazos').textContent = totRechazos;

  const tbody = $('tbody-retenes');
  if (!tbody) return;
  if (!datos.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin retenes activos — la lista se arma sola con quien tenga la categoría "Retén Hora Base" en Categorías → Asociados.</td></tr>`;
    return;
  }

  tbody.innerHTML = datos.map(({ legajo, res }) => {
    const expandido = _expandidos.has(legajo.nro);
    const filaPrincipal = `<tr class="fila-reten" style="cursor:pointer;" onclick="toggleRetenDetalle(${legajo.nro})">
      <td style="width:22px;color:var(--azul);padding:8px 6px;">${expandido ? '▼' : '▶'}</td>
      <td style="padding:8px 6px;"><b>${legajo.nro}</b> · ${legajo.nombre}</td>
      <td style="padding:8px 6px;"><span class="badge" style="background:#ece2f7;color:#6a3fa0;">RETÉN HORA BASE</span></td>
      <td style="padding:8px 6px;text-align:right;">${res.servicios.length}</td>
      <td style="padding:8px 6px;text-align:right;">${res.hsFac || '—'}</td>
      <td style="padding:8px 6px;text-align:right;${res.hsNoFac ? 'color:#b25b00;font-weight:700;' : ''}">${res.hsNoFac || '—'}</td>
      <td style="padding:8px 6px;text-align:right;"><b>${res.hsTotal} hs</b></td>
      <td style="padding:8px 6px;">${_chipEstadoHoy(res)}</td>
    </tr>`;
    const filaDetalle = expandido
      ? `<tr style="background:#f8fafd;"><td></td><td colspan="7" style="padding:10px 14px;">${_detalleHtml(legajo, res, mes, hoyIso)}</td></tr>`
      : '';
    return filaPrincipal + filaDetalle;
  }).join('');
}

export function filtrarRetenes() { renderRetenes(); }

// Módulo "Resumen de horas" (área Operaciones) — ticket
// RESUMEN_HORAS_para_Fede_1.md (Lautaro/Santiago) + mockup_resumen_horas_3.html.
//
// Vista de SOLO LECTURA — no carga ni corrige nada acá. Lee en vivo de
// las grillas de Liquidación de horas (DB.grillasLiq, fuente única desde
// el fix de v133) para que Central de Operaciones pueda revisar horas
// cargadas por los supervisores ANTES de pagar retiros y facturar.
//
// ALCANCE de esta entrega (acordado con el usuario 15/09): solo el tab
// "Resumen por asociado" + el botón "Confirmar período". El tab "Revisión
// de retiro" (circuito Anexo 075, con aprobaciones y pagos — YA NO es
// solo lectura) queda para una entrega aparte, con su propio diseño de
// esquema — no se construye acá.
//
// SUPUESTOS que tuve que asumir (marcados también en el código):
// 1. "Central de Operaciones" del documento = perfil 'Operaciones' de
//    este sistema (no existe un perfil separado con ese nombre).
// 2. El botón "Confirmar período" queda como un TOGGLE (confirmar /
//    anular confirmación), no una acción irreversible — para poder
//    corregir un error sin necesitar SQL manual. El documento lo describe
//    como "una sola decisión", pero no aclara si es reversible.
// 3. "Servicios sin carga real todavía" (el aviso de faltantes) se arma
//    con datos que YA existen (grilla inexistente, o con
//    origenGrilla==='auto' = nadie tipeó una hora real todavía) — es la
//    "detección visual de faltantes" que pide el ticket de chat, SIN
//    construir un motor de alertas nuevo (el .md dice explícitamente que
//    las alertas automáticas quedan para más adelante).
// 4. El retiro se calcula con valorHoraEfectivoAsoc (misma fuente que la
//    grilla, categoría vigente del padrón) — DISTINTO del cálculo viejo
//    de Liquidaciones/Finanzas (getCategoriaVH, sin vigencia). Son dos
//    números que hoy pueden no coincidir; no se tocó el módulo
//    Liquidaciones en esta entrega.

import { DB, currentUser } from '@shared/state.js';
import { $, getDiasDelMes, fmtDecimal } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError } from '@shared/supabase.js';
import { registroPadronVigente, obtenerValorHoraVigente, categoriaVigenteAsociado } from '@modules/categorias/consultas.js';
import { esMismoSupervisor } from '@modules/supervision/supervision.js';
import { nombresSupervisoresReales } from '@modules/servicios_supervisor/servicios_supervisor.js';

// ========== RÉPLICAS PURAS DE legacy.js ==========
// esHoraFacturableReal() y valorHoraEfectivoAsoc() viven en legacy.js sin
// exportar (no son ES modules). Se replican acá 1:1 en vez de depender de
// window.* porque legacy.js se carga con import() dinámico — más seguro
// no asumir su orden de carga desde un módulo migrado. Si el criterio
// cambia en legacy.js, hay que espejarlo acá también (están las líneas
// de referencia en cada comentario).

// legacy.js: esHoraFacturableReal (~línea 6519)
function _esHoraFacturableReal(asoc, fechaISO) {
  if (asoc.facturable?.[fechaISO] === false) return false;
  const eft = asoc.infoEFT?.[fechaISO];
  if (eft?.fueraEFT && eft.autorizado !== true) return false;
  return true;
}

// legacy.js: valorHoraEfectivoAsoc (~línea 6474) — "regla del más alto"
// entre la categoría base (padrón) y la alternativa aprobada.
function _valorHoraEfectivoAsoc(asoc, servicioNombre, fechaISO) {
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(asoc.nro));
  const regPadron = registroPadronVigente(asoc.nro, fechaISO);
  const catBaseId = regPadron ? regPadron.categoriaIdLocal : (legajo?.categoriaIdLocal || null);
  const vBase = catBaseId ? obtenerValorHoraVigente(catBaseId, servicioNombre, fechaISO) : null;
  const vAlt = (asoc.catAltEstado === 'Aprobada' && asoc.catAltIdLocal) ? obtenerValorHoraVigente(asoc.catAltIdLocal, servicioNombre, fechaISO) : null;
  if (!vBase && !vAlt) return null;
  if (vBase && vAlt) return (Number(vBase.valorHora) >= Number(vAlt.valorHora)) ? vBase : vAlt;
  return vBase || vAlt;
}

const TIPO_HORA_INFO = {
  facturable: { label: '✅ Facturable', clase: 'badge-verde' },
  no_facturable: { label: '❌ No facturable', clase: 'badge-naranja' },
  art42: { label: '💊 Art. 42', clase: 'badge-viol' },
  reten: { label: '🔄 Retén', clase: 'badge-azul' },
};
function _tipoHoraInfo(tipo) { return TIPO_HORA_INFO[tipo] || TIPO_HORA_INFO.facturable; }

// ========== ESTADO DE UI (expandido/colapsado) ==========

const _abiertos = new Set();   // 'asoc-<nro>' — fila de asociado expandida
const _diasAbiertos = new Set(); // 'dias-<nro>-<idxFila>' — tira de días expandida

function _mesResumen() {
  return $('rh-mes')?.value || new Date().toISOString().slice(0, 7);
}

// ========== ARMAR EL RESUMEN (lee de DB.grillasLiq, no guarda nada) ==========

function _construirResumen(mes) {
  const dias = getDiasDelMes(mes);
  const grillas = (DB.grillasLiq || []).filter(g => g.periodo === mes && !g.anulado);
  const porAsoc = new Map();

  grillas.forEach(g => {
    (g.asociados || []).forEach(asoc => {
      if (!asoc || asoc.nro == null) return;
      let hsFact = 0, hsNoFact = 0, totalPagar = 0;
      const porDia = {};
      dias.forEach(dia => {
        const raw = asoc.horas?.[dia.iso];
        if (raw === undefined || raw === null || raw === '') return;
        const esEspecial = typeof raw === 'string' && ['F', 'AJ', 'AI'].includes(raw);
        const h = esEspecial ? 0 : (parseFloat(raw) || 0);
        const esFact = _esHoraFacturableReal(asoc, dia.iso);
        if (esFact) hsFact += h; else hsNoFact += h;
        if (h) {
          const vh = _valorHoraEfectivoAsoc(asoc, g.nombre, dia.iso);
          totalPagar += h * (vh?.valorHora || 0);
        }
        porDia[dia.iso] = { valor: raw, facturable: esFact, especial: esEspecial };
      });

      const key = String(asoc.nro);
      if (!porAsoc.has(key)) porAsoc.set(key, { nro: asoc.nro, nombre: asoc.nombre, filas: [] });
      porAsoc.get(key).filas.push({
        servicioCodigo: g.objCodigo, servicioNombre: g.nombre, supervisor: g.supervisor || '',
        tipoHora: asoc.tipoHora || 'facturable', motivoTipo: asoc.motivoTipo || '',
        hsFact, hsNoFact, totalHs: hsFact + hsNoFact,
        totalPagar: Math.round(totalPagar), porDia,
        sinCargaReal: (g.origenGrilla || 'auto') !== 'manual',
      });
    });
  });

  const filasSinNombre = [];
  const asociados = Array.from(porAsoc.values()).map(a => {
    const cat = categoriaVigenteAsociado(a.nro, mes + '-01');
    return {
      ...a,
      categoria: cat ? (cat.codigo + ' · ' + cat.nombre) : null,
      servicios: new Set(a.filas.map(f => f.servicioCodigo)).size,
      hsFact: a.filas.reduce((s, f) => s + f.hsFact, 0),
      hsNoFact: a.filas.reduce((s, f) => s + f.hsNoFact, 0),
      totalHs: a.filas.reduce((s, f) => s + f.totalHs, 0),
      totalPagar: a.filas.reduce((s, f) => s + f.totalPagar, 0),
    };
  }).sort((x, y) => String(x.nombre || '').localeCompare(String(y.nombre || ''), 'es'));

  // Faltantes (supuesto 3 del encabezado): servicios operativos sin
  // ninguna grilla este período, o con grilla pero sin ninguna hora real
  // cargada todavía (origenGrilla sigue en 'auto').
  const objetivosOperativos = (DB.objetivos || []).filter(o => o.estado === 'Operativo');
  const faltantes = objetivosOperativos.map(o => {
    const g = grillas.find(x => x.objCodigo === o.codigo);
    if (!g) return { codigo: o.codigo, nombre: o.nombre, motivo: 'Sin grilla creada este período' };
    if ((g.origenGrilla || 'auto') !== 'manual') return { codigo: o.codigo, nombre: o.nombre, motivo: 'Grilla creada, sin ninguna hora real cargada' };
    return null;
  }).filter(Boolean);

  return { asociados, faltantes, void: filasSinNombre };
}

// ========== FILTROS ==========

function _pasaFiltro(asoc) {
  const q = ($('rh-buscar')?.value || '').toLowerCase().trim();
  const sup = $('rh-fil-sup')?.value || '';
  const tipo = $('rh-fil-tipo')?.value || '';
  if (q && !String(asoc.nro).includes(q) && !String(asoc.nombre || '').toLowerCase().includes(q)) return false;
  if (sup && !asoc.filas.some(f => esMismoSupervisor(f.supervisor, sup))) return false;
  if (tipo && !asoc.filas.some(f => f.tipoHora === tipo)) return false;
  return true;
}

// ========== POBLAR SELECTS ==========

export function poblarSelectsResumenHoras() {
  const selSup = $('rh-fil-sup');
  if (selSup) {
    const ph = selSup.options[0]?.outerHTML || '<option value="">Supervisor: todos</option>';
    selSup.innerHTML = ph + nombresSupervisoresReales().map(s => `<option>${s}</option>`).join('');
  }
  const mesEl = $('rh-mes');
  if (mesEl && !mesEl.value) mesEl.value = new Date().toISOString().slice(0, 7);
}

// ========== RENDER ==========

export function renderResumenHoras() {
  poblarSelectsResumenHoras();
  const mes = _mesResumen();
  const { asociados, faltantes } = _construirResumen(mes);
  const visibles = asociados.filter(_pasaFiltro);

  // KPIs
  const totalHsFact = visibles.reduce((s, a) => s + a.hsFact, 0);
  const totalHsNoFact = visibles.reduce((s, a) => s + a.hsNoFact, 0);
  const totalRetiro = visibles.reduce((s, a) => s + a.totalPagar, 0);
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set('kpi-rh-asociados', visibles.length);
  set('kpi-rh-hsfact', fmtDecimal(totalHsFact, 0));
  set('kpi-rh-hsnofact', fmtDecimal(totalHsNoFact, 0));
  set('kpi-rh-retiro', '$' + Math.round(totalRetiro).toLocaleString('es-AR'));
  set('kpi-rh-faltantes', faltantes.length);

  // Banner de faltantes
  const bannerFalt = $('rh-faltantes');
  if (bannerFalt) {
    if (!faltantes.length) {
      bannerFalt.innerHTML = '';
    } else {
      bannerFalt.innerHTML = `<div class="alerta alerta-warn">
        <b>⚠ ${faltantes.length} servicio${faltantes.length !== 1 ? 's' : ''} sin horas reales cargadas todavía este período:</b>
        ${faltantes.map(f => `<span class="badge badge-naranja" style="margin:2px 4px;" title="${f.motivo}">${f.codigo}</span>`).join('')}
      </div>`;
    }
  }

  // Estado del período (congelado / confirmado)
  const periodoRow = (DB.periodosLiq || []).find(p => p.periodo === mes) || null;
  const estadoEl = $('rh-estado-periodo');
  if (estadoEl) {
    estadoEl.innerHTML = periodoRow?.confirmado
      ? `<span class="badge badge-verde">✅ Período confirmado — ${periodoRow.confirmadoPor || ''} · ${(periodoRow.confirmadoEn || '').slice(0, 10)}</span>`
      : periodoRow?.congelado
        ? `<span class="badge badge-naranja">🔒 Congelado (Finanzas) — pendiente de confirmar</span>`
        : `<span class="badge badge-gris">Abierto — carga en curso</span>`;
  }
  const btnConfirmar = $('btn-rh-confirmar');
  if (btnConfirmar) {
    const puede = ['Administrador total', 'Operaciones'].includes(currentUser?.perfil);
    btnConfirmar.style.display = puede ? 'inline-flex' : 'none';
    btnConfirmar.textContent = periodoRow?.confirmado ? '↩️ Anular confirmación' : '✅ Confirmar período';
    btnConfirmar.className = 'btn ' + (periodoRow?.confirmado ? 'btn-secondary' : 'btn-primary');
  }

  const tbody = $('tbody-resumen-horas');
  if (!tbody) return;
  if (!visibles.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--texto-suave);">Sin horas cargadas para ${mes} con los filtros actuales</td></tr>`;
    return;
  }

  const filtroTipo = $('rh-fil-tipo')?.value || '';
  tbody.innerHTML = visibles.map(a => {
    const abierto = _abiertos.has('asoc-' + a.nro);
    const filasMostrar = filtroTipo ? a.filas.filter(f => f.tipoHora === filtroTipo) : a.filas;
    return `
      <tr style="cursor:pointer;" onclick="toggleFilaResumenHoras('${a.nro}')">
        <td style="width:24px;text-align:center;color:var(--azul);font-weight:700;">${abierto ? '▾' : '▸'}</td>
        <td><b>${a.nro}</b> · ${a.nombre || ''}</td>
        <td>${a.categoria ? a.categoria : '<span style="color:var(--rojo);">⚠ sin categoría</span>'}</td>
        <td style="text-align:right;">${a.servicios}</td>
        <td style="text-align:right;">${fmtDecimal(a.hsFact, 0)}</td>
        <td style="text-align:right;">${a.hsNoFact ? fmtDecimal(a.hsNoFact, 0) : '—'}</td>
        <td style="text-align:right;"><b>${fmtDecimal(a.totalHs, 0)}</b></td>
        <td style="text-align:right;font-weight:700;color:var(--verde);">$${a.totalPagar.toLocaleString('es-AR')}</td>
      </tr>
      <tr style="${abierto ? '' : 'display:none;'}background:var(--fondo);">
        <td colspan="8" style="padding:0 0 10px 40px;width:0;">
          <div style="width:0;min-width:100%;overflow-x:auto;">
          <table style="width:100%;font-size:12px;min-width:600px;">
            <thead><tr style="color:var(--texto-suave);">
              <th style="text-align:left;padding:4px 8px;">Servicio</th><th style="text-align:left;padding:4px 8px;">Supervisor</th>
              <th style="text-align:left;padding:4px 8px;">Tipo hs</th><th style="text-align:right;padding:4px 8px;">Hs</th>
              <th style="text-align:right;padding:4px 8px;">Retiro</th><th style="padding:4px 8px;"></th>
            </tr></thead>
            <tbody>
              ${filasMostrar.map((f, i) => {
                const info = _tipoHoraInfo(f.tipoHora);
                const diasId = 'dias-' + a.nro + '-' + i;
                const diasAbierto = _diasAbiertos.has(diasId);
                return `
                <tr style="cursor:pointer;" onclick="event.stopPropagation();toggleDiasResumenHoras('${diasId}')">
                  <td style="padding:4px 8px;"><b style="color:var(--azul);">${f.servicioNombre}</b> ${f.sinCargaReal ? '<span class="badge badge-naranja" style="font-size:9px;" title="Todavía en precarga automática, sin hora real cargada">⚠ sin carga real</span>' : ''}<br><span style="font-size:10px;color:var(--texto-suave);">▸ ver horas por día</span></td>
                  <td style="padding:4px 8px;">${f.supervisor || '—'}</td>
                  <td style="padding:4px 8px;"><span class="badge ${info.clase}">${info.label}</span>${f.motivoTipo ? ' <span style="font-size:10px;color:var(--texto-suave);">' + f.motivoTipo + '</span>' : ''}</td>
                  <td style="padding:4px 8px;text-align:right;">${fmtDecimal(f.totalHs, 0)}</td>
                  <td style="padding:4px 8px;text-align:right;font-weight:600;">$${f.totalPagar.toLocaleString('es-AR')}</td>
                  <td style="padding:4px 8px;"><span onclick="event.stopPropagation();navTo('liquidacion');toggleGrilla&&toggleGrilla('${f.servicioCodigo}')" style="font-size:10.5px;color:var(--azul);cursor:pointer;">✏ corregir en la grilla</span></td>
                </tr>
                <tr style="${diasAbierto ? '' : 'display:none;'}">
                  <td colspan="6" style="padding:6px 8px 10px;width:0;">
                    <div style="width:0;min-width:100%;display:flex;gap:3px;overflow-x:auto;padding:4px 0;">
                      ${getDiasDelMes(mes).map(dia => {
                        const info2 = f.porDia[dia.iso];
                        const val = info2 ? (info2.especial ? info2.valor : (parseFloat(info2.valor) || 0)) : null;
                        const nofac = info2 && !info2.facturable;
                        return `<div style="min-width:32px;text-align:center;font-size:10px;border:1px solid var(--borde);border-radius:5px;padding:3px 0;${dia.esFinde ? 'background:#fdf6e3;' : ''}${nofac ? 'background:#fdebd7;border-color:#f0d3a8;' : ''}">
                          <div style="color:var(--texto-suave);font-size:9px;">${dia.d}</div>
                          <div style="font-weight:700;${nofac ? 'color:#b25b00;' : 'color:var(--azul);'}${val ? '' : 'color:#ccc;font-weight:400;'}">${val || '·'}</div>
                        </div>`;
                      }).join('')}
                    </div>
                    <span style="font-size:11px;color:var(--texto-suave);">Horas por día leídas de la grilla — solo lectura acá. ${f.sinCargaReal ? 'En naranja: horas no facturables.' : ''}</span>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          </div>
          <span style="font-size:11px;color:var(--texto-suave);">La corrección SIEMPRE se hace en la grilla del servicio (fuente única) — este resumen refleja al instante.</span>
        </td>
      </tr>`;
  }).join('');
}

export function filtrarResumenHoras() { renderResumenHoras(); }

export function toggleFilaResumenHoras(nro) {
  const key = 'asoc-' + nro;
  if (_abiertos.has(key)) _abiertos.delete(key); else _abiertos.add(key);
  renderResumenHoras();
}

export function toggleDiasResumenHoras(diasId) {
  if (_diasAbiertos.has(diasId)) _diasAbiertos.delete(diasId); else _diasAbiertos.add(diasId);
  renderResumenHoras();
}

export function exportarResumenHorasCSV() {
  const mes = _mesResumen();
  const { asociados } = _construirResumen(mes);
  const visibles = asociados.filter(_pasaFiltro);
  const filas = [['N° Socio', 'Nombre', 'Categoría', 'Servicios', 'Hs facturables', 'Hs no facturables', 'Total hs', 'Retiro del período']];
  visibles.forEach(a => filas.push([a.nro, a.nombre || '', a.categoria || '', a.servicios, a.hsFact, a.hsNoFact, a.totalHs, a.totalPagar]));
  const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'resumen_horas_' + mes + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== CONFIRMAR PERÍODO ==========
// Reusa el MISMO cierre general de Liquidaciones (Finanzas) — ver
// _periodoCerradoLiq/toggleCongelarLiquidacion en legacy.js y
// sql/v134_periodos_liquidacion.sql. Confirmar implica dejar el período
// también congelado (si no lo estaba), tal como pide el documento
// ("congela todas las grillas; el candado de cada supervisor queda
// subordinado"). Implementado como TOGGLE — ver supuesto 2 en el
// encabezado del archivo.
export async function confirmarPeriodoResumen() {
  if (!['Administrador total', 'Operaciones'].includes(currentUser?.perfil)) {
    toast('⛔ Solo Central de Operaciones o Administración pueden confirmar el período');
    return;
  }
  const mes = _mesResumen();
  if (!DB.periodosLiq) DB.periodosLiq = [];
  const fila = DB.periodosLiq.find(p => p.periodo === mes) || null;
  const yaConfirmado = !!fila?.confirmado;

  const msg = yaConfirmado
    ? `¿Anular la confirmación de ${mes}? Vuelve a quedar pendiente de revisión (no se descongela solo).`
    : `¿Confirmar el período ${mes}?\n\nEsto da por buena la revisión: congela todas las grillas del período (si no lo estaban) y habilita las horas a FACTURAR y a LIQUIDAR. Se registra quién y cuándo.`;
  if (!confirm(msg)) return;

  const row = fila || { id: mes, periodo: mes, congelado: false, confirmado: false };
  const esNueva = !fila;
  row.confirmado = !yaConfirmado;
  row.confirmadoPor = currentUser?.nombre || '';
  row.confirmadoEn = new Date().toISOString();
  if (!yaConfirmado && !row.congelado) {
    row.congelado = true;
    row.congeladoPor = currentUser?.nombre || '';
    row.congeladoEn = new Date().toISOString();
  }
  if (esNueva) DB.periodosLiq.push(row);

  const ok = await supaSync('periodosLiq', row);
  if (!ok) {
    if (esNueva) DB.periodosLiq.splice(DB.periodosLiq.indexOf(row), 1);
    else row.confirmado = yaConfirmado;
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo guardar en el servidor' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    return;
  }
  toast(yaConfirmado ? '↩️ Confirmación anulada — ' + mes : '✅ Período ' + mes + ' confirmado — habilitado para facturar y liquidar');
  renderResumenHoras();
}

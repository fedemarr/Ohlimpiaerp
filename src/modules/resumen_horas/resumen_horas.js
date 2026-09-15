// Módulo "Resumen de horas" (área Operaciones) — ticket
// RESUMEN_HORAS_para_Fede_1.md (Lautaro/Santiago) + mockup_resumen_horas_3.html.
//
// Vista de SOLO LECTURA — no carga ni corrige nada acá. Lee en vivo de
// las grillas de Liquidación de horas (DB.grillasLiq, fuente única desde
// el fix de v133) para que Central de Operaciones pueda revisar horas
// cargadas por los supervisores ANTES de pagar retiros y facturar.
//
// 15/09: agregado el segundo tab, "Pedido de revisión de horas" (Anexo
// 075 digital) — ver RESUMEN_HORAS_para_Fede_1.md §2-3 y el tab
// "Revisión de retiro" de mockup_resumen_horas_3.html. A diferencia del
// tab de arriba, ESTE sí escribe datos (sql/v137_revisiones_retiro.sql,
// tablas revisionesRetiro/revisionesRetiroLineas) — es el circuito
// supervisor arma → Operaciones revisa → Finanzas paga, desacoplado del
// período ya pagado (nunca se toca una grilla desde acá).
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
import { $, getDiasDelMes, fmtDecimal, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError, SUPA } from '@shared/supabase.js';
import { registroPadronVigente, obtenerValorHoraVigente, categoriaVigenteAsociado, idLocalTrunc } from '@modules/categorias/consultas.js';
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

// ========================================================================
// TAB "PEDIDO DE REVISIÓN DE HORAS" (Anexo 075 digital) — 15/09
// ========================================================================
// Circuito de papel → digital: SUPERVISOR arma → CENTRAL DE OPERACIONES
// revisa (corresponde sí/no) → FINANZAS paga. El período ya pagado NO se
// toca nunca desde acá — el ajuste es un pago propio, referenciado al
// período reclamado (imputación), con su propia fecha de pago real
// (caja). Tablas: sql/v137_revisiones_retiro.sql.
//
// SUPUESTOS de esta entrega (no estaban 100% explícitos en el doc):
// 1. El estado 'Armada' del diagrama de papel y "en la bandeja de
//    revisión de Operaciones" son, en la práctica, el mismo momento (el
//    propio mockup lo dice: "la solicitud queda ARMADA y pasa a la
//    bandeja de revisión" en un solo paso) — se persiste directo como
//    'En revisión' al guardar, no hay una acción manual aparte de
//    "enviar" una vez armada.
// 2. "Central de Operaciones" = perfil 'Operaciones' (mismo criterio que
//    el resto de este módulo).
// 3. El "recibo/ficha" (retiro estimado del período actual, mostrado en
//    el buscador de asociado) reutiliza el mismo helper de Retenciones
//    (window._getFilasConsolidadas) que ya existe para ese fin —
//    puramente informativo, nunca se persiste.
// 4. Adjuntos: mismo patrón que Retenciones — subida directa al bucket
//    Storage 'ohlimpia-adjuntos', array liviano {nombre, path, subidoPor,
//    subidoEn} en la propia fila (sin la tabla genérica "adjuntos", que
//    es DNI-céntrica para el ingreso).
// 5. "Pendiente de facturar" (§3 del doc) se guarda como flag al
//    confirmarse el pago de una línea con tipo de hora Facturable — el
//    doc es explícito en que la bandeja que lo consume (facturación de
//    Finanzas) todavía no existe y no hay que construirla ahora.

const BUCKET_ADJUNTOS_RR = 'ohlimpia-adjuntos';
const ESTADO_BADGE_RR = {
  'En revisión': 'badge-naranja',
  'Aprobada - pago pendiente': 'badge-azul',
  'Rechazada': 'badge-rojo',
  'Pagada': 'badge-verde',
};

let _lineasRevision = [];
let _adjuntosRevision = [];

function _puedeArmarRevision() { return ['Administrador total', 'Supervisor'].includes(currentUser?.perfil); }
function _puedeRevisarRevision() { return ['Administrador total', 'Operaciones'].includes(currentUser?.perfil); }
function _puedePagarRevision() { return ['Administrador total', 'Finanzas'].includes(currentUser?.perfil); }

// ========== CAMBIO DE TAB ==========

export function tabResumenHoras(tab, btn) {
  document.querySelectorAll('#screen-resumen_horas .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-resumen_horas .tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const panel = $('rh-tab-' + tab);
  if (panel) panel.classList.add('active');
  if (tab === 'revision') renderRevisionesRetiro();
  else renderResumenHoras();
}

// ========== LISTADO ==========

export function renderRevisionesRetiro() {
  const btnNueva = $('btn-rh-nueva-revision');
  if (btnNueva) btnNueva.style.display = _puedeArmarRevision() ? 'inline-flex' : 'none';

  let rows = (DB.revisionesRetiro || []).filter(r => !r.anulado);
  if (currentUser?.perfil === 'Supervisor') rows = rows.filter(r => r.armadoPor === currentUser.nombre);
  rows = [...rows].sort((a, b) => String(b.armadoEn || '').localeCompare(String(a.armadoEn || '')));

  const abiertas = (DB.revisionesRetiro || []).filter(r => !r.anulado && ['En revisión', 'Aprobada - pago pendiente'].includes(r.estado)).length;
  const kpi = $('kpi-rh-revabiertas'); if (kpi) kpi.textContent = abiertas;
  const badge = $('badge-rh-revision');
  if (badge) { badge.style.display = abiertas ? 'inline-block' : 'none'; badge.textContent = abiertas; }

  const tbody = $('tbody-revision-retiro');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--texto-suave);">Sin solicitudes de revisión${currentUser?.perfil === 'Supervisor' ? ' armadas por vos' : ''} todavía.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const ref = idLocalTrunc(r.id);
    const lineas = (DB.revisionesRetiroLineas || []).filter(l => l.revisionIdLocal === ref);
    const detalle = lineas.map(l => `${l.cantidadHoras} hs ${l.servicioCodigo} (${l.periodo})`).join(' · ') || '—';
    let accion = '<span class="form-hint">—</span>';
    if (r.estado === 'En revisión' && _puedeRevisarRevision()) {
      accion = `<button class="btn btn-primary btn-xs" onclick="marcarCorrespondeRevisionRetiro('${r.id}',true)">Corresponde</button>
                 <button class="btn btn-secondary btn-xs" onclick="marcarCorrespondeRevisionRetiro('${r.id}',false)">No</button>`;
    } else if (r.estado === 'Aprobada - pago pendiente' && _puedePagarRevision()) {
      accion = `<button class="btn btn-primary btn-xs" onclick="abrirConfirmarPagoRevisionRetiro('${r.id}')">💵 Confirmar pago</button>`;
    } else if (r.estado === 'Rechazada' && r.motivoRechazo) {
      accion = `<span class="form-hint" title="${r.motivoRechazo}">Motivo: ${r.motivoRechazo}</span>`;
    } else if (r.estado === 'Pagada') {
      accion = `<span class="form-hint">${r.comprobantePago || ''} · ${r.confirmadoPagoPor || ''}</span>`;
    }
    return `<tr>
      <td><b>${r.nroSolicitud}</b></td>
      <td>${r.legajoNro ? r.legajoNro + ' · ' : ''}${r.nombreAsociado}</td>
      <td>${r.periodoReclamado}</td>
      <td style="font-size:11.5px;">${detalle}${r.observaciones ? '<br><span class="form-hint">' + r.observaciones + '</span>' : ''}</td>
      <td style="text-align:right;font-weight:700;">$${Math.round(r.montoTotal || 0).toLocaleString('es-AR')}</td>
      <td style="font-size:11.5px;">${r.armadoPor || '—'}</td>
      <td><span class="badge ${ESTADO_BADGE_RR[r.estado] || 'badge-gris'}">${(r.estado || '').toUpperCase()}</span></td>
      <td>${accion}</td>
    </tr>`;
  }).join('');
}

// ========== SERVICIOS / VALOR HORA SUGERIDO PARA UNA LÍNEA ==========

// Servicios donde la persona tuvo horas en el período (primero) + el
// resto del padrón de objetivos operativos (después) — "nunca texto
// libre", pide el doc.
function _serviciosParaLineaRevision(nroSocio, periodo) {
  const trabajados = new Set(
    (DB.grillasLiq || [])
      .filter(g => g.periodo === periodo && (g.asociados || []).some(a => String(a.nro) === String(nroSocio)))
      .map(g => g.objCodigo)
  );
  const operativos = (DB.objetivos || []).filter(o => o.estado === 'Operativo');
  const conPrioridad = operativos.map(o => ({ codigo: o.codigo, nombre: o.nombre, trabajado: trabajados.has(o.codigo) }));
  conPrioridad.sort((a, b) => (b.trabajado - a.trabajado) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return conPrioridad;
}

function _valorHoraSugeridoLinea(nroSocio, servicioCodigo, periodo) {
  if (!nroSocio || !servicioCodigo || !periodo) return 0;
  const servicioNombre = (DB.objetivos || []).find(o => o.codigo === servicioCodigo)?.nombre || servicioCodigo;
  const fechaISO = periodo + '-01';
  const vh = _valorHoraEfectivoAsoc({ nro: nroSocio }, servicioNombre, fechaISO);
  return vh?.valorHora || 0;
}

// ========== ADELANTOS DETECTADOS (solo lectura) ==========
// Mismo criterio que descuentosAutomaticosLegajo() (legacy.js) para el
// mes del período reclamado — replicado acá porque esa función vive en
// legacy.js sin exportar. Puramente informativo en esta ficha, nunca se
// declara a mano ni se resta del monto de la solicitud.
function _adelantoDetectado(nroSocio, periodo) {
  if (!nroSocio || !periodo) return null;
  const nroStr = String(nroSocio);
  let monto = 0, fecha = null;
  (DB.planillasAdelantos || []).forEach(p => {
    if (p.periodo !== periodo) return;
    (p.items || []).filter(i => i.estado === 'Aprobado' && String(i.nroSocio) === nroStr).forEach(i => {
      monto += i.monto || 0; fecha = fecha || p.fechaResolucion || p.fechaEnvio || p.fechaCreacion;
    });
  });
  (DB.adelantosInformales || []).filter(a => a.estado === 'Aprobado' && a.periodo === periodo && String(a.nroSocio) === nroStr).forEach(a => {
    monto += a.monto || 0; fecha = fecha || a.fecha;
  });
  return monto > 0 ? { monto, fecha } : null;
}

// ========== MODAL NUEVA SOLICITUD ==========

export function abrirNuevaRevisionRetiro() {
  if (!_puedeArmarRevision()) { toast('⛔ Solo el supervisor o Administración pueden armar una solicitud'); return; }
  _lineasRevision = [];
  _adjuntosRevision = [];
  const dl = $('dl-rr-nombre');
  if (dl) dl.innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo').map(l => `<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
  $('rr-nombre').value = '';
  $('rr-supervisor').value = '';
  $('rr-tipo-reclamo').value = 'Horas faltantes';
  $('rr-tipo-hora').value = 'facturable';
  $('rr-periodo').value = new Date().toISOString().slice(0, 7);
  $('rr-adelanto').value = '—';
  $('rr-observaciones').value = '';
  _renderLineasRevision();
  _renderAdjuntosRevision();
  abrirModal('modal-nueva-revision');
}

export function autocompletarRevisionRetiro() {
  const val = ($('rr-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => l.nombre === val);
  if (!leg) return;
  $('rr-supervisor').value = leg.supervisor || '—';
  onChangePeriodoRevisionRetiro();
}

export function onChangePeriodoRevisionRetiro() {
  const nombre = ($('rr-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => l.nombre === nombre);
  const periodo = ($('rr-periodo') || { value: '' }).value;
  const elAdelanto = $('rr-adelanto');
  if (elAdelanto) {
    if (!leg || !periodo) { elAdelanto.value = '—'; }
    else {
      const det = _adelantoDetectado(leg.nro, periodo);
      elAdelanto.value = det ? `SÍ — $${Math.round(det.monto).toLocaleString('es-AR')}${det.fecha ? ' · ' + det.fecha : ''}` : 'No se detectaron adelantos aprobados en ese período';
    }
  }
  // Las líneas ya cargadas quedan (puede reclamar meses distintos al de
  // cabecera), pero el servicio SUGERIDO de una línea NUEVA sí depende
  // del período recién elegido — no hace falta recalcular las viejas.
}

// ========== LÍNEAS DE DETALLE ==========

export function agregarLineaRevisionRetiro() {
  const nombre = ($('rr-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => l.nombre === nombre);
  if (!leg) { toast('⚠️ Elegí primero al asociado'); return; }
  const periodo = ($('rr-periodo') || { value: '' }).value || new Date().toISOString().slice(0, 7);
  const servicios = _serviciosParaLineaRevision(leg.nro, periodo);
  if (!servicios.length) { toast('⚠️ No hay servicios operativos cargados para elegir'); return; }
  const servicioCodigo = servicios[0].codigo;
  _lineasRevision.push({
    periodo, servicioCodigo,
    cantidadHoras: 0,
    valorHora: _valorHoraSugeridoLinea(leg.nro, servicioCodigo, periodo),
    monto: 0,
  });
  _renderLineasRevision();
}

export function quitarLineaRevisionRetiro(i) {
  _lineasRevision.splice(i, 1);
  _renderLineasRevision();
}

function _recalcularMontoLinea(l) {
  l.monto = Math.round((parseFloat(l.cantidadHoras) || 0) * (parseFloat(l.valorHora) || 0) * 100) / 100;
}

export function actualizarLineaRevisionRetiro(i, campo, valor) {
  const l = _lineasRevision[i];
  if (!l) return;
  const nombre = ($('rr-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(x => x.nombre === nombre);
  if (campo === 'periodo') {
    l.periodo = valor;
    if (leg) l.valorHora = _valorHoraSugeridoLinea(leg.nro, l.servicioCodigo, l.periodo);
  } else if (campo === 'servicioCodigo') {
    l.servicioCodigo = valor;
    if (leg) l.valorHora = _valorHoraSugeridoLinea(leg.nro, l.servicioCodigo, l.periodo);
  } else if (campo === 'cantidadHoras') {
    l.cantidadHoras = parseFloat(valor) || 0;
  } else if (campo === 'valorHora') {
    l.valorHora = parseFloat(valor) || 0;
  }
  _recalcularMontoLinea(l);
  _renderLineasRevision();
}

function _renderLineasRevision() {
  const tbody = $('rr-lineas-body');
  if (!tbody) return;
  const nombre = ($('rr-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => l.nombre === nombre);

  tbody.innerHTML = _lineasRevision.map((l, i) => {
    const servicios = leg ? _serviciosParaLineaRevision(leg.nro, l.periodo) : [];
    return `<tr>
      <td><input type="month" value="${l.periodo}" onchange="actualizarLineaRevisionRetiro(${i},'periodo',this.value)" style="width:120px;"></td>
      <td>
        <select onchange="actualizarLineaRevisionRetiro(${i},'servicioCodigo',this.value)">
          ${servicios.map(s => `<option value="${s.codigo}" ${s.codigo === l.servicioCodigo ? 'selected' : ''}>${s.trabajado ? '✓ ' : ''}${s.nombre} (${s.codigo})</option>`).join('')}
        </select>
      </td>
      <td><input type="number" min="0" step="0.5" value="${l.cantidadHoras || ''}" oninput="actualizarLineaRevisionRetiro(${i},'cantidadHoras',this.value)" style="width:70px;text-align:right;"></td>
      <td><input type="number" min="0" step="0.01" value="${l.valorHora || ''}" oninput="actualizarLineaRevisionRetiro(${i},'valorHora',this.value)" style="width:90px;text-align:right;" title="Sugerido de la categoría vigente — se puede corregir"></td>
      <td style="text-align:right;font-weight:700;">$${(l.monto || 0).toLocaleString('es-AR')}</td>
      <td><button type="button" class="btn btn-secondary btn-xs" onclick="quitarLineaRevisionRetiro(${i})">✕</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--texto-suave);padding:10px;">Sin líneas — agregá al menos una.</td></tr>';

  const total = _lineasRevision.reduce((s, l) => s + (l.monto || 0), 0);
  const elTotal = $('rr-total-preview');
  if (elTotal) elTotal.textContent = '$' + Math.round(total).toLocaleString('es-AR');
}

// ========== ADJUNTOS ==========

export function quitarAdjuntoRevisionRetiro(i) {
  _adjuntosRevision.splice(i, 1);
  _renderAdjuntosRevision();
}

function _renderAdjuntosRevision() {
  const cont = $('rr-adjuntos-lista');
  if (!cont) return;
  cont.innerHTML = _adjuntosRevision.map((a, i) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:3px 0;">
    <span>📎 ${a.nombre}</span><button type="button" data-quitar-adj-rr="${i}" style="background:none;border:none;color:var(--rojo);cursor:pointer;">✕</button>
  </div>`).join('');
  cont.querySelectorAll('button[data-quitar-adj-rr]').forEach(b => b.onclick = () => quitarAdjuntoRevisionRetiro(parseInt(b.dataset.quitarAdjRr)));
}

export async function agregarAdjuntoRevisionRetiro() {
  const input = $('rr-adjunto-file');
  const file = input?.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('⚠️ El archivo supera los 10 MB'); return; }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `revisiones-retiro/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await SUPA.storage.from(BUCKET_ADJUNTOS_RR).upload(path, file, { upsert: false, contentType: file.type });
  if (error) { toast('⚠️ No se pudo subir el adjunto: ' + error.message); return; }
  _adjuntosRevision.push({ nombre: file.name, path, subidoPor: currentUser?.nombre || '', subidoEn: new Date().toISOString() });
  input.value = '';
  _renderAdjuntosRevision();
  toast('📎 Adjunto agregado');
}

// ========== GUARDAR SOLICITUD ==========

function _proximoNroSolicitud() {
  const anio = new Date().getFullYear();
  const delAnio = (DB.revisionesRetiro || []).filter(r => (r.nroSolicitud || '').startsWith('SR-' + anio + '-'));
  const max = delAnio.reduce((m, r) => Math.max(m, parseInt((r.nroSolicitud || '').split('-')[2]) || 0), 0);
  return `SR-${anio}-${String(max + 1).padStart(4, '0')}`;
}

export async function guardarRevisionRetiro() {
  const nombre = cleanText(($('rr-nombre') || { value: '' }).value);
  const leg = (DB.legajos || []).find(l => l.nombre === nombre);
  if (!leg) { toast('⚠️ Elegí un asociado real del padrón'); return; }
  const tipoReclamo = ($('rr-tipo-reclamo') || { value: '' }).value;
  const tipoHora = ($('rr-tipo-hora') || { value: '' }).value;
  const periodoReclamado = ($('rr-periodo') || { value: '' }).value;
  if (!periodoReclamado) { toast('⚠️ Elegí el período reclamado'); return; }
  if (!_lineasRevision.length) { toast('⚠️ Agregá al menos una línea de detalle'); return; }
  if (_lineasRevision.some(l => !l.cantidadHoras || l.cantidadHoras <= 0)) { toast('⚠️ Hay líneas sin cantidad de horas'); return; }

  const montoTotal = _lineasRevision.reduce((s, l) => s + (l.monto || 0), 0);
  const nueva = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    nroSolicitud: _proximoNroSolicitud(),
    legajoNro: String(leg.nro),
    nombreAsociado: leg.nombre,
    supervisor: leg.supervisor || '',
    tipoReclamo, tipoHora, periodoReclamado,
    montoTotal,
    adelantoDetectado: _adelantoDetectado(leg.nro, periodoReclamado),
    adjuntos: _adjuntosRevision,
    observaciones: cleanText(($('rr-observaciones') || { value: '' }).value),
    // Ver supuesto 1 del encabezado: se guarda directo "En revisión", no
    // hay un estado 'Armada' intermedio persistido aparte.
    estado: 'En revisión',
    armadoPor: currentUser?.nombre || '',
    armadoEn: new Date().toISOString(),
    pendienteFacturar: false,
    anulado: false,
  };
  if (!DB.revisionesRetiro) DB.revisionesRetiro = [];
  DB.revisionesRetiro.push(nueva);
  const ok = await supaSync('revisionesRetiro', nueva);
  if (!ok) {
    DB.revisionesRetiro.pop();
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo guardar la solicitud' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    return;
  }
  const ref = idLocalTrunc(nueva.id);
  if (!DB.revisionesRetiroLineas) DB.revisionesRetiroLineas = [];
  for (const l of _lineasRevision) {
    const linea = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      revisionIdLocal: ref,
      periodo: l.periodo, servicioCodigo: l.servicioCodigo,
      cantidadHoras: l.cantidadHoras, valorHora: l.valorHora, monto: l.monto,
    };
    DB.revisionesRetiroLineas.push(linea);
    await supaSync('revisionesRetiroLineas', linea);
  }
  cerrarModal('modal-nueva-revision');
  toast('✅ Solicitud ' + nueva.nroSolicitud + ' enviada a revisión de Central de Operaciones');
  renderRevisionesRetiro();
}

// ========== FLUJO: REVISAR (Operaciones) ==========

export async function marcarCorrespondeRevisionRetiro(id, corresponde) {
  if (!_puedeRevisarRevision()) { toast('⛔ Solo Central de Operaciones o Administración pueden revisar'); return; }
  const r = (DB.revisionesRetiro || []).find(x => String(x.id) === String(id));
  if (!r) return;
  let motivo = '';
  if (!corresponde) {
    motivo = (prompt('Motivo del rechazo:') || '').trim();
    if (!motivo) { toast('⚠️ El rechazo necesita un motivo'); return; }
  } else if (!confirm(`¿Confirmar que "${r.nroSolicitud}" corresponde? Pasa a Finanzas como pago pendiente.`)) return;

  const prev = { ...r };
  r.estado = corresponde ? 'Aprobada - pago pendiente' : 'Rechazada';
  r.revisadoPor = currentUser?.nombre || '';
  r.revisadoEn = new Date().toISOString();
  if (!corresponde) r.motivoRechazo = motivo;

  const ok = await supaSync('revisionesRetiro', r);
  if (!ok) {
    Object.assign(r, prev);
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo guardar' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    return;
  }
  toast(corresponde ? '✅ Pasa a Finanzas como pago pendiente' : '✕ Rechazada — el supervisor va a ver el motivo');
  renderRevisionesRetiro();
}

// ========== FLUJO: CONFIRMAR PAGO (Finanzas) ==========

export function abrirConfirmarPagoRevisionRetiro(id) {
  if (!_puedePagarRevision()) { toast('⛔ Solo Finanzas o Administración pueden confirmar el pago'); return; }
  const r = (DB.revisionesRetiro || []).find(x => String(x.id) === String(id));
  if (!r) return;
  const modal = $('modal-pago-revision');
  if (modal) modal.dataset.revisionId = String(id);
  $('pr-titulo').textContent = r.nroSolicitud + ' · ' + r.nombreAsociado;
  $('pr-monto').textContent = '$' + Math.round(r.montoTotal || 0).toLocaleString('es-AR');
  $('pr-periodo').textContent = r.periodoReclamado;
  $('pr-fecha').value = new Date().toISOString().slice(0, 10);
  $('pr-comprobante').value = '';
  abrirModal('modal-pago-revision');
}

export async function confirmarPagoRevisionRetiro() {
  const modal = $('modal-pago-revision');
  const id = modal?.dataset?.revisionId;
  const r = (DB.revisionesRetiro || []).find(x => String(x.id) === String(id));
  if (!r) return;
  const fecha = ($('pr-fecha') || { value: '' }).value;
  const comprobante = cleanText(($('pr-comprobante') || { value: '' }).value);
  if (!fecha) { toast('⚠️ Ingresá la fecha real del pago'); return; }
  if (!comprobante) { toast('⚠️ Ingresá el N° de comprobante'); return; }

  const prev = { ...r };
  r.estado = 'Pagada';
  r.fechaPago = fecha;
  r.comprobantePago = comprobante;
  r.confirmadoPagoPor = currentUser?.nombre || '';
  r.confirmadoPagoEn = new Date().toISOString();
  // §3 del doc: si el tipo de hora es Facturable, esas horas nunca se le
  // facturaron al cliente — queda marcado para que el módulo de
  // facturación (todavía no existe) lo levante más adelante.
  r.pendienteFacturar = r.tipoHora === 'facturable';

  const ok = await supaSync('revisionesRetiro', r);
  if (!ok) {
    Object.assign(r, prev);
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo confirmar el pago' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    return;
  }
  cerrarModal('modal-pago-revision');
  toast('💵 Pago confirmado — ' + r.nroSolicitud);
  renderRevisionesRetiro();
}

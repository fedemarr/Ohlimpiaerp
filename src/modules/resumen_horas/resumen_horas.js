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
import { $, getDiasDelMes, fmtDecimal, parseNumeroAr, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError, SUPA } from '@shared/supabase.js';
import { registroPadronVigente, obtenerValorHoraVigente, categoriaVigenteAsociado, idLocalTrunc } from '@modules/categorias/consultas.js';
import { esMismoSupervisor } from '@modules/supervision/supervision.js';
import { nombresSupervisoresReales, getSupervisorDeCodigo } from '@modules/servicios_supervisor/servicios_supervisor.js';
import { complementosTareasEspecialesDelMes } from '@modules/tareas_especiales/consultas.js';

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
const _supervisoresAbiertos = new Set(); // banner de faltantes, agrupado por supervisor (ajustes 17/09)

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

  // Complemento convenio — Tareas Especiales (ticket "Módulo Tareas
  // Especiales" 18/09 §3b, regla simétrica a la de Liquidaciones): "el
  // complemento no es una hora trabajada" — NUNCA suma en las columnas
  // de horas (hsFact/hsNoFact/totalHs, que siguen siendo exactamente lo
  // que hay en las grillas), pero SÍ suma en el retiro del período (si
  // no lo incluyera, la columna mentiría por menos). Este resumen solo
  // LEE lo que Tareas Especiales ya calculó — no lo recalcula acá.
  const complementosTE = complementosTareasEspecialesDelMes(mes);

  const filasSinNombre = [];
  const asociados = Array.from(porAsoc.values()).map(a => {
    const cat = categoriaVigenteAsociado(a.nro, mes + '-01');
    const comp = complementosTE[a.nombre] || null;
    return {
      ...a,
      categoria: cat ? (cat.codigo + ' · ' + cat.nombre) : null,
      servicios: new Set(a.filas.map(f => f.servicioCodigo)).size,
      hsFact: a.filas.reduce((s, f) => s + f.hsFact, 0),
      hsNoFact: a.filas.reduce((s, f) => s + f.hsNoFact, 0),
      totalHs: a.filas.reduce((s, f) => s + f.totalHs, 0),
      totalPagar: a.filas.reduce((s, f) => s + f.totalPagar, 0) + (comp?.monto || 0),
      complementoTE: comp,
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

  // Banner de faltantes — agrupado por supervisor (ajuste 17/09: el
  // bloque plano con ~159 chips no se podía leer). Una fila por
  // supervisor, la que más debe primero; click despliega sus servicios.
  // Sin supervisor asignado queda como grupo aparte, al final.
  const bannerFalt = $('rh-faltantes');
  if (bannerFalt) {
    if (!faltantes.length) {
      bannerFalt.innerHTML = '';
    } else {
      const grupos = _agruparFaltantesPorSupervisor(faltantes);
      bannerFalt.innerHTML = `<div class="alerta alerta-warn" style="padding:0;overflow:hidden;">
        <div style="padding:11px 16px;font-weight:700;">⚠ ${faltantes.length} servicio${faltantes.length !== 1 ? 's' : ''} sin horas reales cargadas este período — por supervisor (el que más debe, primero)</div>
        ${grupos.map(g => {
          const key = g.supervisor || '__sin_supervisor__';
          const abierto = _supervisoresAbiertos.has(key);
          const label = g.supervisor || 'Sin supervisor asignado';
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-top:1px solid #f0e2b6;cursor:pointer;" onclick="toggleSupervisorFaltantesRH('${key}')">
              <span style="color:#b8912a;font-size:11px;width:12px;">${abierto ? '▼' : '▶'}</span>
              <b>${label}</b>
              <span style="margin-left:auto;"><span class="badge ${g.supervisor ? 'badge-naranja' : 'badge-rojo'}">${g.servicios.length} servicio${g.servicios.length === 1 ? '' : 's'} sin cargar</span></span>
            </div>
            ${abierto ? `<div style="padding:6px 16px 12px 38px;border-top:1px dashed #f0e2b6;background:#fffcf2;">
              ${g.servicios.map(s => `<span class="badge badge-gris" style="margin:3px 4px 0 0;" title="${s.motivo}">${s.codigo}</span>`).join('')}
            </div>` : ''}`;
        }).join('')}
      </div>`;
    }
  }

  // Alerta al confirmar: asociados con horas y sin categoría → retiro $0
  // (ajuste 17/09 §3 — que nadie congele un período con gente en cero
  // sin verlo. Sobre TODO el período, no solo lo filtrado en pantalla).
  const sinCategoria = asociados.filter(a => !a.categoria && (a.hsFact + a.hsNoFact) > 0).length;
  const chipSinCat = $('rh-chip-sincat');
  if (chipSinCat) {
    chipSinCat.style.display = sinCategoria ? 'inline-block' : 'none';
    chipSinCat.textContent = `⚠ ${sinCategoria} asociado${sinCategoria === 1 ? '' : 's'} con horas y sin categoría — su retiro es $0`;
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
        <td style="text-align:right;font-weight:700;color:var(--verde);">$${a.totalPagar.toLocaleString('es-AR')}${a.complementoTE ? `<div style="font-size:10px;font-weight:600;color:#b25b00;white-space:normal;">incluye complemento ${a.complementoTE.hs} hs (convenio ${a.complementoTE.convenioParam})</div>` : ''}</td>
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
          ${a.complementoTE ? `<div class="alerta alerta-warn" style="font-size:11.5px;margin-top:8px;">+${a.complementoTE.hs} hs complemento (no facturable) — lo calcula <a href="#" onclick="event.stopPropagation();navTo('tareas_especiales');return false;" style="color:#7a6000;font-weight:700;">Tareas Especiales</a>, viaja a Liquidaciones como fila propia.</div>` : ''}
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

// Agrupa la lista plana de faltantes por supervisor (getSupervisorDeCodigo,
// misma fuente central que usa Pedido de personal) — el que más servicios
// debe primero, "sin supervisor asignado" siempre al final (también es un
// dato para corregir, no solo un grupo más).
function _agruparFaltantesPorSupervisor(faltantes) {
  const grupos = new Map();
  faltantes.forEach(f => {
    const sup = getSupervisorDeCodigo(f.codigo) || '';
    if (!grupos.has(sup)) grupos.set(sup, []);
    grupos.get(sup).push(f);
  });
  const arr = [...grupos.entries()].map(([sup, servicios]) => ({ supervisor: sup || null, servicios }));
  arr.sort((a, b) => {
    if (!a.supervisor && !b.supervisor) return 0;
    if (!a.supervisor) return 1;
    if (!b.supervisor) return -1;
    return b.servicios.length - a.servicios.length;
  });
  return arr;
}

export function toggleSupervisorFaltantesRH(key) {
  if (_supervisoresAbiertos.has(key)) _supervisoresAbiertos.delete(key); else _supervisoresAbiertos.add(key);
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
    const detalle = lineas.map(l => `${fmtDecimal(l.cantidadHoras, 2)} hs ${l.servicioCodigo} (${l.periodo})`).join(' · ') || '—';
    // Ajuste 17/09 §1c: lo solicitado nunca se pisa — se muestra al lado
    // de lo ajustado, con quién y cuándo, para que el supervisor no
    // descubra después que le pagaron distinto sin explicación.
    const ajusteHtml = r.conAjuste ? `<div class="form-hint" style="color:#b25b00;">Solicitado: ${lineas.map(l => fmtDecimal(l.cantidadHoras, 2)).join('+')} hs · $${Math.round(lineas.reduce((s, l) => s + (l.monto || 0), 0)).toLocaleString('es-AR')} → <b>Ajustado: ${lineas.map(l => fmtDecimal(l.ajusteHoras ?? l.cantidadHoras, 2)).join('+')} hs · $${Math.round(r.montoTotal || 0).toLocaleString('es-AR')}</b> (${r.ajustadoPor || '—'}, ${(r.ajustadoEn || '').slice(0, 10)})</div>` : '';
    let accion = '<span class="form-hint">—</span>';
    if (r.estado === 'En revisión' && _puedeRevisarRevision()) {
      accion = `<button class="btn btn-primary btn-xs" onclick="abrirRevisarSolicitud('${r.id}')">Revisar</button>`;
    } else if (r.estado === 'Aprobada - pago pendiente' && _puedePagarRevision()) {
      accion = `<button class="btn btn-primary btn-xs" onclick="abrirConfirmarPagoRevisionRetiro('${r.id}')">💵 Confirmar pago</button>`;
    } else if (r.estado === 'Rechazada' && r.motivoRechazo) {
      accion = `<span class="form-hint" title="${r.motivoRechazo}">Motivo: ${r.motivoRechazo}</span>`;
    } else if (r.estado === 'Pagada') {
      accion = `<span class="form-hint">${r.comprobantePago || ''} · ${r.confirmadoPagoPor || ''}</span>`;
    }
    const estadoLabel = (r.estado === 'Aprobada - pago pendiente' && r.conAjuste) ? 'CORRESPONDE CON AJUSTE' : (r.estado || '').toUpperCase();
    const estadoBadge = (r.estado === 'Aprobada - pago pendiente' && r.conAjuste) ? 'badge-naranja' : (ESTADO_BADGE_RR[r.estado] || 'badge-gris');
    return `<tr>
      <td><b>${r.nroSolicitud}</b></td>
      <td>${r.legajoNro ? r.legajoNro + ' · ' : ''}${r.nombreAsociado}</td>
      <td>${r.periodoReclamado}</td>
      <td style="font-size:11.5px;">${detalle}${ajusteHtml}${r.observaciones ? '<br><span class="form-hint">' + r.observaciones + '</span>' : ''}</td>
      <td style="text-align:right;font-weight:700;">$${Math.round(r.montoTotal || 0).toLocaleString('es-AR')}</td>
      <td style="font-size:11.5px;">${r.armadoPor || '—'}</td>
      <td><span class="badge ${estadoBadge}">${estadoLabel}</span></td>
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

// Devuelve el valor hora sugerido JUNTO con la categoría de donde salió
// (ajuste 17/09 §1b): "elegir asociado + período reclamado → buscar su
// categoría vigente EN ESE PERÍODO (no la de hoy) → precargar el valor
// hora de esa categoría". fechaISO ya usaba periodo+'-01' (no hoy), así
// que la regla de fondo estaba bien — lo que faltaba era MOSTRAR de
// dónde salió (leyenda) y avisar si el revisor lo pisó (chip).
function _sugerenciaValorHoraLinea(nroSocio, servicioCodigo, periodo) {
  if (!nroSocio || !servicioCodigo || !periodo) return { valorHora: 0, categoria: null };
  const servicioNombre = (DB.objetivos || []).find(o => o.codigo === servicioCodigo)?.nombre || servicioCodigo;
  const fechaISO = periodo + '-01';
  const vh = _valorHoraEfectivoAsoc({ nro: nroSocio }, servicioNombre, fechaISO);
  const categoria = categoriaVigenteAsociado(nroSocio, fechaISO);
  return { valorHora: vh?.valorHora || 0, categoria };
}

function _mesLabelCorto(periodo) {
  if (!periodo) return '';
  const [y, m] = periodo.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }).toUpperCase().replace('.', '');
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
  const sug = _sugerenciaValorHoraLinea(leg.nro, servicioCodigo, periodo);
  _lineasRevision.push({
    periodo, servicioCodigo,
    cantidadHoras: 0,
    valorHora: sug.valorHora,
    valorHoraSugerido: sug.valorHora,
    categoriaSugerida: sug.categoria,
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

// campo 'periodo'/'servicioCodigo' (select/mes, cambio discreto): se
// vuelve a sugerir el valor hora y se re-renderiza toda la tabla. campo
// 'cantidadHoras'/'valorHora' (texto tipeado, ajuste 17/09 §1a): NUNCA
// se re-renderiza la fila completa mientras se tipea — regenerar el
// <input> en cada tecla le hace perder el foco/cursor al usuario, que es
// justo lo que este ajuste vino a arreglar. Solo se actualiza el monto y
// el aviso de "modificado" por DOM directo (_actualizarFilaLineaDOM).
export function actualizarLineaRevisionRetiro(i, campo, valor) {
  const l = _lineasRevision[i];
  if (!l) return;
  const nombre = ($('rr-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(x => x.nombre === nombre);
  if (campo === 'periodo' || campo === 'servicioCodigo') {
    l[campo] = valor;
    if (leg) {
      const sug = _sugerenciaValorHoraLinea(leg.nro, l.servicioCodigo, l.periodo);
      l.valorHora = sug.valorHora; l.valorHoraSugerido = sug.valorHora; l.categoriaSugerida = sug.categoria;
    }
    _recalcularMontoLinea(l);
    _renderLineasRevision();
    return;
  }
  if (campo === 'cantidadHoras') l.cantidadHoras = parseNumeroAr(valor);
  else if (campo === 'valorHora') l.valorHora = parseNumeroAr(valor);
  _recalcularMontoLinea(l);
  _actualizarFilaLineaDOM(i);
}

function _actualizarFilaLineaDOM(i) {
  const l = _lineasRevision[i];
  if (!l) return;
  const modificado = Math.abs((l.valorHora || 0) - (l.valorHoraSugerido || 0)) > 0.01;
  const inpVh = $('rr-vh-' + i);
  if (inpVh) {
    inpVh.style.background = modificado ? '#fff8ec' : '';
    inpVh.style.borderColor = modificado ? '#e8c48a' : '';
  }
  const warnEl = $('rr-vhwarn-' + i);
  if (warnEl) warnEl.innerHTML = modificado ? `⚠ valor modificado (cat.: $${fmtDecimal(l.valorHoraSugerido, 2)})` : '';
  const montoEl = $('rr-monto-' + i);
  if (montoEl) montoEl.textContent = '$' + (l.monto || 0).toLocaleString('es-AR');
  const elTotal = $('rr-total-preview');
  if (elTotal) elTotal.textContent = '$' + Math.round(_lineasRevision.reduce((s, x) => s + (x.monto || 0), 0)).toLocaleString('es-AR');
}

function _renderLineasRevision() {
  const tbody = $('rr-lineas-body');
  if (!tbody) return;
  const nombre = ($('rr-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => l.nombre === nombre);

  tbody.innerHTML = _lineasRevision.map((l, i) => {
    const servicios = leg ? _serviciosParaLineaRevision(leg.nro, l.periodo) : [];
    const modificado = Math.abs((l.valorHora || 0) - (l.valorHoraSugerido || 0)) > 0.01;
    const leyenda = l.categoriaSugerida
      ? `Categoría vigente en ${_mesLabelCorto(l.periodo)}: <b>${l.categoriaSugerida.codigo} · ${l.categoriaSugerida.nombre}</b>`
      : `<span style="color:var(--rojo);">Sin categoría vigente en ${_mesLabelCorto(l.periodo)} — no se pudo sugerir un valor hora</span>`;
    return `<tr>
      <td><input type="month" value="${l.periodo}" onchange="actualizarLineaRevisionRetiro(${i},'periodo',this.value)" style="width:120px;"></td>
      <td>
        <select onchange="actualizarLineaRevisionRetiro(${i},'servicioCodigo',this.value)">
          ${servicios.map(s => `<option value="${s.codigo}" ${s.codigo === l.servicioCodigo ? 'selected' : ''}>${s.trabajado ? '✓ ' : ''}${s.nombre} (${s.codigo})</option>`).join('')}
        </select>
        <div style="font-size:10.5px;color:var(--texto-suave);margin-top:2px;">${leyenda}</div>
      </td>
      <td><input type="text" inputmode="decimal" id="rr-hs-${i}" value="${l.cantidadHoras ? String(l.cantidadHoras).replace('.', ',') : ''}" placeholder="0" oninput="actualizarLineaRevisionRetiro(${i},'cantidadHoras',this.value)" style="width:70px;text-align:right;"></td>
      <td>
        <input type="text" inputmode="decimal" id="rr-vh-${i}" value="${l.valorHora ? fmtDecimal(l.valorHora, 2) : ''}" placeholder="—" oninput="actualizarLineaRevisionRetiro(${i},'valorHora',this.value)" style="width:100px;text-align:right;${modificado ? 'background:#fff8ec;border-color:#e8c48a;' : ''}" title="Sugerido de la categoría vigente en el período — se puede corregir">
        <div id="rr-vhwarn-${i}" style="font-size:10px;color:#b25b00;">${modificado ? `⚠ valor modificado (cat.: $${fmtDecimal(l.valorHoraSugerido, 2)})` : ''}</div>
      </td>
      <td style="text-align:right;font-weight:700;" id="rr-monto-${i}">$${(l.monto || 0).toLocaleString('es-AR')}</td>
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

// ========== FLUJO: REVISAR (Operaciones) — Corresponde / Corresponde
// con ajuste / No corresponde (ajuste 17/09 §1c) ==========
//
// "Lo original nunca se pisa": cantidadHoras/valorHora/monto de cada
// línea de revisiones_retiro_lineas siguen siendo lo que armó el
// supervisor. El ajuste (si lo hay) se guarda al lado, por línea
// (ajuste_horas/ajuste_valor_hora/ajuste_monto, sql/v143) — una
// solicitud puede tener varias líneas, cada una con su propio ajuste o
// sin ajuste. montoTotal SÍ se actualiza al total ajustado cuando hay
// ajuste (es lo que termina pagando Finanzas); el detalle "solicitado
// → ajustado" queda visible aparte, nunca se pierde.

let _revisandoId = null;
let _lineasAjuste = [];

export function abrirRevisarSolicitud(id) {
  if (!_puedeRevisarRevision()) { toast('⛔ Solo Central de Operaciones o Administración pueden revisar'); return; }
  const r = (DB.revisionesRetiro || []).find(x => String(x.id) === String(id));
  if (!r) return;
  _revisandoId = id;
  const ref = idLocalTrunc(r.id);
  const lineas = (DB.revisionesRetiroLineas || []).filter(l => l.revisionIdLocal === ref);
  _lineasAjuste = lineas.map(l => ({
    lineaId: l.id,
    servicioNombre: (DB.objetivos || []).find(o => o.codigo === l.servicioCodigo)?.nombre || l.servicioCodigo,
    periodo: l.periodo,
    hsSolicitado: l.cantidadHoras, vhSolicitado: l.valorHora, montoSolicitado: l.monto,
    hsAjuste: l.cantidadHoras, vhAjuste: l.valorHora,
  }));
  if ($('rev-titulo')) $('rev-titulo').textContent = r.nroSolicitud + ' · ' + r.nombreAsociado;
  if ($('rev-motivo')) $('rev-motivo').value = '';
  _renderLineasAjuste();
  abrirModal('modal-revisar-solicitud');
}

function _huboCambioAjuste() {
  return _lineasAjuste.some(l => Math.abs(l.hsAjuste - l.hsSolicitado) > 0.001 || Math.abs(l.vhAjuste - l.vhSolicitado) > 0.01);
}

function _actualizarBotonAjuste() {
  const btn = $('rev-btn-ajuste');
  if (btn) btn.disabled = !_huboCambioAjuste();
}

function _renderLineasAjuste() {
  const tbody = $('rev-lineas-body');
  if (!tbody) return;
  tbody.innerHTML = _lineasAjuste.map((l, i) => `
    <tr>
      <td style="font-size:12px;">${l.servicioNombre}<br><span style="color:var(--texto-suave);">${l.periodo}</span></td>
      <td style="text-align:right;">${fmtDecimal(l.hsSolicitado, 2)} hs</td>
      <td style="text-align:right;">$${fmtDecimal(l.vhSolicitado, 2)}</td>
      <td style="text-align:right;">$${Math.round(l.montoSolicitado || 0).toLocaleString('es-AR')}</td>
      <td><input type="text" inputmode="decimal" id="rev-hs-${i}" value="${String(l.hsAjuste).replace('.', ',')}" oninput="actualizarAjusteLinea(${i},'hs',this.value)" style="width:70px;text-align:right;padding:5px 6px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);"></td>
      <td><input type="text" inputmode="decimal" id="rev-vh-${i}" value="${fmtDecimal(l.vhAjuste, 2)}" oninput="actualizarAjusteLinea(${i},'vh',this.value)" style="width:90px;text-align:right;padding:5px 6px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);"></td>
      <td style="text-align:right;font-weight:700;" id="rev-monto-${i}">$${Math.round(l.hsAjuste * l.vhAjuste).toLocaleString('es-AR')}</td>
    </tr>`).join('');
  _actualizarBotonAjuste();
}

export function actualizarAjusteLinea(i, campo, valor) {
  const l = _lineasAjuste[i];
  if (!l) return;
  if (campo === 'hs') l.hsAjuste = parseNumeroAr(valor);
  else if (campo === 'vh') l.vhAjuste = parseNumeroAr(valor);
  const montoEl = $('rev-monto-' + i);
  if (montoEl) montoEl.textContent = '$' + Math.round(l.hsAjuste * l.vhAjuste).toLocaleString('es-AR');
  _actualizarBotonAjuste();
}

export async function decidirRevisionSolicitud(modo) {
  const r = (DB.revisionesRetiro || []).find(x => String(x.id) === String(_revisandoId));
  if (!r) return;
  const motivo = ($('rev-motivo') || { value: '' }).value.trim();
  if (modo === 'no' && !motivo) { toast('⚠️ El motivo es obligatorio para rechazar'); return; }
  if (modo === 'ajuste') {
    if (!motivo) { toast('⚠️ El motivo es obligatorio para ajustar'); return; }
    if (!_huboCambioAjuste()) { toast('⚠️ No cambiaste ningún valor — usá "Corresponde" si está bien tal cual'); return; }
  }

  const prev = { ...r };
  const ref = idLocalTrunc(r.id);
  const lineasReales = (DB.revisionesRetiroLineas || []).filter(l => l.revisionIdLocal === ref);
  const lineasPrevias = lineasReales.map(l => ({ ...l }));

  if (modo === 'no') {
    r.estado = 'Rechazada';
    r.motivoRechazo = motivo;
  } else {
    r.estado = 'Aprobada - pago pendiente';
    r.conAjuste = modo === 'ajuste';
    if (modo === 'ajuste') {
      r.ajustadoPor = currentUser?.nombre || '';
      r.ajustadoEn = new Date().toISOString();
      let nuevoTotal = 0;
      for (const l of _lineasAjuste) {
        const real = lineasReales.find(x => x.id === l.lineaId);
        if (!real) continue;
        real.ajusteHoras = l.hsAjuste;
        real.ajusteValorHora = l.vhAjuste;
        real.ajusteMonto = Math.round(l.hsAjuste * l.vhAjuste * 100) / 100;
        nuevoTotal += real.ajusteMonto;
      }
      r.montoTotal = nuevoTotal;
    }
  }
  r.revisadoPor = currentUser?.nombre || '';
  r.revisadoEn = new Date().toISOString();

  const ok = await supaSync('revisionesRetiro', r);
  if (!ok) {
    Object.assign(r, prev);
    lineasReales.forEach((l, i) => Object.assign(l, lineasPrevias[i]));
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo guardar' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    return;
  }
  if (modo === 'ajuste') {
    for (const l of lineasReales) await supaSync('revisionesRetiroLineas', l);
  }
  cerrarModal('modal-revisar-solicitud');
  toast(modo === 'no' ? '✕ Rechazada — el supervisor va a ver el motivo'
    : modo === 'ajuste' ? '⚠ Corresponde CON AJUSTE — el supervisor ve solicitado y ajustado, lado a lado'
      : '✅ Corresponde — pasa a Finanzas como pago pendiente');
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

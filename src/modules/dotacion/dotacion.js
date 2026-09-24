// Dotación (DOTACION_para_Fede.md + mockup_dotacion_1.html) — tablero de
// SOLO LECTURA para el Gerente de Operaciones. No es un padrón: no se
// carga nada acá, se lee legajos + categorías + licencias +
// prepedidos/pedidos que ya existen — por eso no puede desactualizarse,
// es una vista, no una copia.
//
// Los tres estados de un operario:
//   🟢 T (trabajando)   — tiene legajo.servicio cargado
//   🟡 A (en artículo)   — caso abierto en Enfermos y accidentes, o
//                          descanso/vacación aprobada vigente hoy
//   ⚪ S (sin servicio)  — activo sin legajo.servicio = LA BANCA
//
// Alcance "solo operarios" (doc): excluye administrativos (mismo check
// que ya usa Enfermos y Accidentes) y supervisores (por nombre contra
// DB.supervisores — no hay vínculo legajo↔supervisor por id, asunción
// documentada en el plan).
import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { esAdministrativo } from '../enfermos_accidentes/categoria_helper.js';
import { obtenerCategoriaLegajo } from '../categorias/consultas.js';
import { horasServicioMes } from '../gestion_horas/gestion_horas.js';
import { mesActualStr, mesDeFechaArg } from '../gestion_horas/calculo.js';
import { estadoVacante, avisoDotacionIncompleta, numeroPreTxt } from '../prepedidos/prepedidos.js';
import { numeroPedidoTxt } from '../pedidos/pedidos.js';

function normNombre(s) { return (s || '').trim().toLowerCase(); }

function esSupervisor(legajo) {
  const set = new Set((DB.supervisores || []).map(normNombre));
  return set.has(normNombre(legajo?.nombre));
}

export function esOperarioEnAlcance(legajo) {
  return legajo?.estado === 'Activo' && !esAdministrativo(legajo) && !esSupervisor(legajo);
}

export function operariosActivos() {
  return (DB.legajos || []).filter(esOperarioEnAlcance);
}

// Licencia vigente HOY — gana Enfermos y accidentes (caso 'Abierto') si
// hay, si no se busca en Descansos/Vacaciones aprobadas con hoy dentro
// de [fechaDesde, fechaHasta] (mismo criterio ad-hoc que ya usan esos
// módulos para detectar superposición).
function licenciaVigenteHoy(legajo) {
  const hoy = new Date();
  const nro = String(legajo.nro);
  const caso = (DB.casosEnfermosAccidentes || [])
    .filter(c => !c.anulado && c.estado === 'Abierto' && String(c.nroSocio) === nro)
    .sort((a, b) => String(b.fechaInicio || '').localeCompare(String(a.fechaInicio || '')))[0];
  if (caso) return { desde: caso.fechaInicio, origen: 'Enfermos y accidentes' };

  const vigenteEn = (arr) => (arr || []).find(r => {
    if (r.anulado || r.estado !== 'Aprobado') return false;
    if (String(r.nroSocio) !== nro) return false;
    if (!r.fechaDesde || !r.fechaHasta) return false;
    return new Date(r.fechaDesde) <= hoy && new Date(r.fechaHasta) >= hoy;
  });
  const desc = vigenteEn(DB.descansos);
  if (desc) return { desde: desc.fechaDesde, origen: 'Descansos' };
  const vac = vigenteEn(DB.vacaciones);
  if (vac) return { desde: vac.fechaDesde, origen: 'Vacaciones' };
  return null;
}

export function estadoOperario(legajo) {
  const lic = licenciaVigenteHoy(legajo);
  if (lic) return { tipo: 'A', ...lic };
  if ((legajo.servicio || '').trim()) return { tipo: 'T' };
  return { tipo: 'S' };
}

// ========== SERVICIOS CON DOTACIÓN INCOMPLETA (el otro lado del cruce) ==========

function refPedidoTxt(pre) {
  for (let i = 0; i < pre.vacantes.length; i++) {
    const est = estadoVacante(pre, i);
    if (est.estado === 'act') return `${numeroPedidoTxt(est.ped)} en búsqueda`;
    if (est.estado === 'pend') return `${numeroPreTxt(pre)} esperando decisión`;
  }
  return `${numeroPreTxt(pre)} esperando decisión`;
}

export function serviciosConDotacionIncompleta() {
  return (DB.objetivos || [])
    .filter(o => !o.anulado && o.estado !== 'Baja')
    .map(o => {
      const aviso = avisoDotacionIncompleta(o);
      return aviso ? { o, aviso, refTxt: refPedidoTxt(aviso.pre) } : null;
    })
    .filter(Boolean);
}

// ========== MOVIMIENTOS DEL MES ==========

function mesDeFechaFlexible(f) {
  if (!f) return null;
  return f.includes('/') ? mesDeFechaArg(f) : String(f).slice(0, 7);
}

export function movimientosDelMes(mes) {
  const m = mes || mesActualStr();
  const altas = (DB.legajos || []).filter(l => mesDeFechaFlexible(l.fechaIngresoPrueba) === m).length;
  const bajas = (DB.legajos || []).filter(l => l.estado === 'Baja' && mesDeFechaFlexible(l.fechaBaja) === m).length;
  return { altas, bajas };
}

// ========== RENDER ==========

function fmtHs(n) { return n ? Math.round(n).toLocaleString('es-AR') + ' hs' : '—'; }

function catChipHtml(cat) {
  return cat ? cat.nombre : '<span class="badge badge-rojo">⚠ sin categoría</span>';
}

function estadoChipHtml(est) {
  if (est.tipo === 'T') return '<span class="badge badge-verde">🟢 TRABAJANDO</span>';
  if (est.tipo === 'A') return `<span class="badge badge-acento">🟡 EN ARTÍCULO</span><div style="font-size:10.5px;color:var(--texto-suave);">desde ${est.desde || '—'} · ${est.origen}</div>`;
  return '<span class="badge badge-gris">⚪ SIN SERVICIO</span>';
}

export function renderDotacion() {
  const tbody = $('dot-tbody');
  if (!tbody) return;
  const mes = mesActualStr();
  const operarios = operariosActivos();

  const q = ($('dot-buscar')?.value || '').toLowerCase();
  const fCat = $('dot-cat')?.value || '';
  const fEst = $('dot-est')?.value || '';

  const totales = { trab: 0, art: 0, sin: 0 };
  const porCategoria = {};
  const filas = [];
  operarios.forEach(l => {
    const est = estadoOperario(l);
    if (est.tipo === 'T') totales.trab++; else if (est.tipo === 'A') totales.art++; else totales.sin++;
    const cat = obtenerCategoriaLegajo(l.nro, new Date().toISOString().slice(0, 10));
    const catNombre = cat?.nombre || '⚠ sin categoría';
    porCategoria[catNombre] = (porCategoria[catNombre] || 0) + 1;
    filas.push({ l, est, cat });
  });

  // KPIs
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('dot-k-act', operarios.length);
  set('dot-k-trab', totales.trab);
  set('dot-k-trab-s', `en ${totales.trab} asignaciones vigentes`);
  set('dot-k-art', totales.art);
  set('dot-k-sin', totales.sin);
  const mov = movimientosDelMes(mes);
  set('dot-k-mov', `+${mov.altas} / −${mov.bajas}`);

  // Barra por categoría
  const cats = $('dot-cats');
  if (cats) {
    cats.innerHTML = '<b>Por categoría:</b> ' + Object.keys(porCategoria).sort().map(c =>
      `<span class="badge ${c.includes('⚠') ? 'badge-rojo' : 'badge-azul'}" style="margin-right:6px;">${c}: ${porCategoria[c]}</span>`
    ).join('');
  }
  const selCat = $('dot-cat');
  if (selCat && selCat.options.length <= 1) {
    Object.keys(porCategoria).filter(c => !c.includes('⚠')).sort().forEach(c => {
      const op = document.createElement('option'); op.value = c; op.textContent = c; selCat.appendChild(op);
    });
  }

  // Tabla filtrada
  const visibles = filas.filter(({ l, est, cat }) => {
    if (q && !`${l.nro} ${l.nombre}`.toLowerCase().includes(q)) return false;
    if (fCat && (cat?.nombre || '') !== fCat) return false;
    if (fEst && est.tipo !== fEst) return false;
    return true;
  });
  tbody.innerHTML = visibles.map(({ l, est, cat }) => {
    const srv = (l.servicio || '').trim()
      ? `<div style="font-size:12.5px;"><b style="color:var(--azul);">${l.servicio}</b><div style="font-size:11px;color:var(--texto-suave);">${l.supervisor || '—'} · ${l.zona || '—'}</div></div>`
      : '<span style="color:var(--texto-suave);">—</span>';
    const acc = est.tipo === 'S'
      ? `<button class="btn btn-primary btn-sm" onclick="abrirModalReasDesde(${l.nro})">↔ Asignar</button>`
      : '';
    return `<tr><td><b>${l.nro}</b> · ${l.nombre}</td>`
      + `<td>${catChipHtml(cat)}</td>`
      + `<td>${estadoChipHtml(est)}</td>`
      + `<td>${srv}</td>`
      + `<td style="text-align:right;font-variant-numeric:tabular-nums;">${fmtHs(horasServicioMes(l.servicio, mes))}</td>`
      + `<td style="font-size:12px;color:var(--texto-suave);">${l.fechaIngresoPrueba || '—'}</td>`
      + `<td>${acc}</td></tr>`;
  }).join('');
  const cont = $('dot-hd-cont');
  if (cont) cont.textContent = `${visibles.length} de ${operarios.length} operarios`;

  // El cruce: banca + servicios con dotación incompleta
  const banca = $('dot-banca');
  if (banca) {
    const enBanca = filas.filter(({ est }) => est.tipo === 'S');
    banca.innerHTML = enBanca.length
      ? enBanca.map(({ l, cat }) => `<div class="fila" style="display:flex;align-items:center;gap:8px;padding:8px 13px;border-bottom:1px solid var(--borde);font-size:12.5px;flex-wrap:wrap;">`
        + `<b>${l.nro} · ${l.nombre}</b><span class="badge badge-azul">${cat?.nombre || '⚠'}</span>`
        + `<span style="font-size:11.5px;color:var(--texto-suave);">activo desde ${l.fechaIngresoPrueba || '—'}</span>`
        + `<span style="margin-left:auto;"><button class="btn btn-primary btn-sm" onclick="abrirModalReasDesde(${l.nro})">↔ Asignar</button></span></div>`).join('')
      : '<div style="padding:8px 13px;color:var(--texto-suave);font-size:12.5px;">Sin operarios en banca.</div>';
  }
  const falta = $('dot-falta');
  if (falta) {
    const incompletos = serviciosConDotacionIncompleta();
    falta.innerHTML = incompletos.length
      ? incompletos.map(({ o, aviso, refTxt }) => `<div class="fila" style="display:flex;align-items:center;gap:8px;padding:8px 13px;border-bottom:1px solid var(--borde);font-size:12.5px;flex-wrap:wrap;">`
        + `<b>${o.codigo}</b><span class="badge badge-gris">${o.localidad || '—'}</span>`
        + `<span class="badge badge-rojo">${aviso.cubiertas}/${aviso.total} cubierta</span>`
        + `<span style="margin-left:auto;font-size:11.5px;color:var(--texto-suave);">${refTxt}</span></div>`).join('')
      : '<div style="padding:8px 13px;color:var(--texto-suave);font-size:12.5px;">Sin servicios con dotación incompleta.</div>';
  }
}

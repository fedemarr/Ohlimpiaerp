// 📥 Bandeja de PREPEDIDOS (ALTA_CLIENTE_SERVICIO_para_Fede_1.md, bloque 5 +
// mockup_pedidos_personal_completo_2.html). El alta del servicio SIEMBRA el
// pedido de personal: cuando un servicio entra a "Pendiente asignación
// operativa" nace su prepedido con la dotación cargada en el alta
// ("Personal necesario", una vacante por persona), y la búsqueda de gente
// arranca en paralelo a la asignación del supervisor.
//
// Se persiste solo el encabezado + una foto de las vacantes (tabla
// prepedidos, sql/v152). El ESTADO de cada vacante se DERIVA de los
// registros vinculados — reasignaciones (Cubrir con interno) y pedidos
// (Incorporar) llevan prepedidoIdLocal + prepedidoVacante — para que haya
// una sola fuente de verdad: una reasignación rechazada/anulada o un pedido
// cancelado devuelven la vacante a "esperando decisión" sin mantener nada
// sincronizado a mano.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { formatearHorarioSemanal, diasMarcadosTexto } from '@shared/horarioDias.js';

const ESTADO_PENDIENTE = 'Pendiente asignación operativa';
const GERENTE_OPERACIONES = 'Ricardo Elicabe';
const REA_VIGENTES = ['Pendiente', 'Aprobada esperando fecha efectiva', 'Aprobada ejecutada'];

const idLocal = (x) => String(x).slice(-9);
export const numeroPreTxt = (pre) => `PRE-${pre.numero}`;

// ========== PERMISOS ==========

export function puedeVerPrepedidos() {
  return ['Administrador total', 'RRHH', 'Operaciones'].includes(currentUser?.perfil);
}
export function puedeDecidirPrepedidos() {
  return ['Administrador total', 'Operaciones'].includes(currentUser?.perfil) || currentUser?.nombre === GERENTE_OPERACIONES;
}

// ========== FECHAS ==========

// Acepta ISO (yyyy-mm-dd) o DD/MM/AAAA. Devuelve ISO o ''.
function aISO(f) {
  const s = String(f || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
function aDDMMAAAA(iso) {
  const p = aISO(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
}
function diasHasta(iso) {
  if (!iso) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + 'T00:00:00').getTime() - hoy.getTime()) / 86400000);
}

// ========== SIEMBRA ==========

function expandirVacantes(o) {
  const vac = [];
  (o.puestos || []).forEach(p => {
    const cant = Math.min(50, Math.max(0, parseInt(p.cantidad, 10) || 0));
    for (let i = 0; i < cant; i++) {
      vac.push({
        puesto: p.puesto || '', perfil: p.perfil || '',
        horarioDesde: p.horarioDesde || '', horarioHasta: p.horarioHasta || '',
        tipoHorario: p.tipoHorario || 'fijo', dias: { ...(p.dias || {}) }, obs: p.obs || '',
      });
    }
  });
  return vac;
}

export function prepedidoDeObjetivo(o) {
  if (!o) return null;
  const idl = idLocal(o.id);
  return (DB.prepedidos || []).find(p => String(p.objetivoIdLocal) === idl) || null;
}

function siguienteNumeroPre() {
  return Math.max(0, ...(DB.prepedidos || []).map(p => Number(p.numero) || 0)) + 1;
}

function nombresConPerfil(perfiles) {
  return (DB.usuarios || [])
    .filter(u => u.activo !== false && perfiles.includes(u.perfil) && u.nombre)
    .map(u => u.nombre);
}

// Dos niveles (doc §5): el alta avisa a TODOS (informativo); el prepedido
// pendiente avisa solo a Central de Operaciones (accionable).
function notificarNacimiento(pre, o) {
  const ent = idLocal(o.id);
  const accionables = new Set([GERENTE_OPERACIONES, ...nombresConPerfil(['Operaciones'])]);
  accionables.forEach(nombre => crearNotificacion({
    tipo: 'prepedido_pendiente', entidadTipo: 'prepedido', entidadIdLocal: idLocal(pre.id), destinatarioNombre: nombre,
    mensaje: `📥 ${numeroPreTxt(pre)} esperando decisión de dotación: ${o.nombre} (${o.codigo}) — ${pre.vacantes.length} vacante${pre.vacantes.length !== 1 ? 's' : ''}.`,
  }));
  const todos = new Set((DB.usuarios || []).filter(u => u.activo !== false && u.nombre).map(u => u.nombre));
  todos.forEach(nombre => {
    if (accionables.has(nombre) || nombre === currentUser?.nombre) return;
    crearNotificacion({
      tipo: 'objetivo_alta', entidadTipo: 'objetivo', entidadIdLocal: ent, destinatarioNombre: nombre,
      mensaje: `Alta de servicio: ${o.nombre} (${o.codigo}) quedó en Pendiente asignación.`,
    });
  });
}

// Idempotente: un prepedido por servicio. `notificar` solo en el alta real;
// el backfill de servicios que ya estaban pendientes es silencioso.
export function sembrarPrepedido(o, { notificar = false } = {}) {
  if (!o || o.anulado || o.estado !== ESTADO_PENDIENTE) return null;
  const existente = prepedidoDeObjetivo(o);
  if (existente) return existente;
  const vacantes = expandirVacantes(o);
  if (!vacantes.length) return null;
  const pre = {
    id: o.id, numero: siguienteNumeroPre(), objetivoIdLocal: idLocal(o.id),
    servicioCodigo: o.codigo, servicioNombre: o.nombre,
    fechaAlta: aISO(o.fechaCarga) || new Date().toISOString().slice(0, 10),
    creadoPor: o.cargadoPor || currentUser?.nombre || '', vacantes, anulado: false,
  };
  if (!DB.prepedidos) DB.prepedidos = [];
  DB.prepedidos.push(pre);
  supaSync('prepedidos', pre).then(ok => {
    if (!ok) console.warn('No se pudo guardar el prepedido', numeroPreTxt(pre));
  });
  if (notificar) notificarNacimiento(pre, o);
  return pre;
}

// Backfill/red de seguridad: todo servicio pendiente con dotación tiene su
// prepedido (cubre los que ya estaban pendientes antes de esta feature y
// las reactivaciones). Silencioso.
export function sincronizarPrepedidos() {
  let n = 0;
  (DB.objetivos || []).forEach(o => {
    if (o.estado === ESTADO_PENDIENTE && !o.anulado && !prepedidoDeObjetivo(o) && sembrarPrepedido(o)) n++;
  });
  return n;
}

// ========== ESTADO DERIVADO ==========

export function objetivoDePrepedido(pre) {
  return (DB.objetivos || []).find(o => idLocal(o.id) === String(pre.objetivoIdLocal)) || null;
}

function pedidoCubierto(p) {
  return typeof window.pedidoEstaCubierto === 'function' ? window.pedidoEstaCubierto(p) : p.estado === 'Cubierto';
}

// 'int' interno vigente · 'cub' pedido cubierto · 'act' en Activos ·
// 'pend' esperando decisión (con `borrador` si hay una reasignación a medio cargar).
export function estadoVacante(pre, idx) {
  const idl = idLocal(pre.id);
  const enVacante = (x) => String(x.prepedidoIdLocal) === idl && x.prepedidoVacante != null && Number(x.prepedidoVacante) === idx;
  const rea = (DB.reasignaciones || []).find(r => !r.anulado && enVacante(r) && REA_VIGENTES.includes(r.estado));
  if (rea) return { estado: 'int', rea };
  const ped = (DB.pedidos || []).find(p => enVacante(p) && p.estado !== 'Cancelado');
  if (ped) return { estado: pedidoCubierto(ped) ? 'cub' : 'act', ped };
  const borrador = (DB.reasignaciones || []).find(r => !r.anulado && enVacante(r) && r.estado === 'Borrador');
  return { estado: 'pend', borrador: borrador || null };
}

export function resumenPrepedido(pre) {
  const r = { total: pre.vacantes.length, int: 0, act: 0, cub: 0, pend: 0 };
  pre.vacantes.forEach((_, i) => { r[estadoVacante(pre, i).estado]++; });
  r.cubiertas = r.int + r.cub;
  return r;
}

// Un prepedido "vive" mientras su servicio no esté dado de baja.
function prepedidosVigentes() {
  return (DB.prepedidos || []).filter(pre => {
    if (pre.anulado) return false;
    const o = objetivoDePrepedido(pre);
    return o && !o.anulado && o.estado !== 'Baja';
  });
}
export function prepedidosEnBandeja() {
  return prepedidosVigentes().filter(pre => resumenPrepedido(pre).pend > 0);
}
export function prepedidosResueltos() {
  return prepedidosVigentes().filter(pre => resumenPrepedido(pre).pend === 0);
}
export function contarVacantesPendientes() {
  return prepedidosEnBandeja().reduce((s, pre) => s + resumenPrepedido(pre).pend, 0);
}

// Fecha desde la que corre el "tiempo de cobertura" de un pedido: el alta del
// servicio si nació de un prepedido, la carga del pedido si no.
export function fechaOrigenPedido(p) {
  if (p?.prepedidoIdLocal) {
    const pre = (DB.prepedidos || []).find(x => idLocal(x.id) === String(p.prepedidoIdLocal));
    if (pre?.fechaAlta) return aDDMMAAAA(pre.fechaAlta);
  }
  return p?.fecha;
}

export function chipOrigenPrepedido(x) {
  if (!x?.prepedidoIdLocal) return '';
  const pre = (DB.prepedidos || []).find(p => idLocal(p.id) === String(x.prepedidoIdLocal));
  return pre ? ` <span class="badge" style="background:#ede7f6;color:#5b21b6;font-size:9.5px;">desde ${numeroPreTxt(pre)}</span>` : '';
}

// Chip "dotación: n/m cubierta" del tab Pendiente asignación de Servicios.
export function chipDotacionObjetivo(o) {
  const pre = prepedidoDeObjetivo(o);
  if (!pre || pre.anulado) return '';
  const r = resumenPrepedido(pre);
  const ok = r.cubiertas >= r.total;
  return ` <span class="badge ${ok ? 'badge-verde' : 'badge-naranja'}" style="font-size:9.5px;" title="${numeroPreTxt(pre)}">dotación: ${r.cubiertas}/${r.total} cubierta</span>`;
}

// Para el aviso al activar: null si no hay nada que avisar.
export function avisoDotacionIncompleta(o) {
  const pre = prepedidoDeObjetivo(o);
  if (!pre || pre.anulado) return null;
  const r = resumenPrepedido(pre);
  const faltan = r.total - r.cubiertas;
  return faltan > 0 ? { faltan, ...r, pre } : null;
}

// ========== RENDER ==========

function vacanteHtml(pre, v, i, puedeDecidir) {
  const est = estadoVacante(pre, i);
  let der = '';
  const idq = `'${pre.id}'`;
  if (est.estado === 'pend') {
    if (est.borrador) {
      der += `<span class="badge badge-gris">reasignación en borrador</span> `;
      if (puedeDecidir) der += `<button class="btn btn-secondary btn-sm" onclick="abrirBorradorReasignacionPorId('${est.borrador.id}')">↔ Retomar borrador</button> `;
    } else {
      der += `<span class="badge badge-naranja">esperando decisión</span> `;
    }
    if (puedeDecidir) {
      der += `<button class="btn btn-sm" style="background:#7c3aed;color:#fff;border:none;" data-acc="cubrir" onclick="cubrirVacanteConInterno(${idq},${i})">↔ Cubrir con interno</button> `
        + `<button class="btn btn-primary btn-sm" data-acc="incorporar" onclick="incorporarVacante(${idq},${i})">🔎 Incorporar</button>`;
    } else {
      der += `<span style="font-size:11.5px;color:var(--texto-suave);">decide Operaciones</span>`;
    }
  } else if (est.estado === 'int') {
    der = `<span class="badge" style="background:#ede7f6;color:#5b21b6;">✔ CUBIERTA INTERNO</span> `
      + `<span style="font-size:12px;color:var(--texto-suave);">${est.rea.nombreAsociado || ''} · reasignación ${String(est.rea.estado).toLowerCase()} · se ve en Reasignaciones</span>`;
  } else if (est.estado === 'cub') {
    der = `<span class="badge badge-verde">✔ CUBIERTA</span> <span style="font-size:12px;color:var(--texto-suave);">PP-${est.ped.numero} · ${est.ped.nombreCandidato || 'ingreso'}</span>`;
  } else {
    der = `<span class="badge badge-azul">→ EN ACTIVOS como PP-${est.ped.numero}</span> `
      + `<span style="font-size:12px;color:var(--texto-suave);">RRHH inició la búsqueda</span>`;
  }
  const horario = v.horarioDesde || v.horarioHasta ? `${v.horarioDesde || '?'}–${v.horarioHasta || '?'}` : 'sin horario';
  return `<div class="pre-vac" data-vacante="${i}" data-estado="${est.estado}" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 14px;border-top:1px solid var(--borde);">
    <b style="min-width:110px;">${v.puesto || 'Puesto sin categoría'}</b>
    <span class="badge badge-azul">${horario}</span>
    <span class="badge badge-gris">${diasMarcadosTexto(v.dias)}</span>
    <span class="badge badge-gris">${v.tipoHorario === 'rotativo' ? 'Rotativo' : 'Fijo'}</span>
    ${v.perfil ? `<span style="font-size:11.5px;color:var(--texto-suave);">👤 ${v.perfil}</span>` : ''}
    ${v.obs ? `<span style="font-size:11.5px;color:var(--texto-suave);">📝 ${v.obs}</span>` : ''}
    <span style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${der}</span>
  </div>`;
}

function cabeceraPrepedido(pre, o, r) {
  const inicioISO = aISO(o.fechaInicio);
  const dias = diasHasta(inicioISO);
  let inicioChip = '';
  if (inicioISO) {
    const txt = dias >= 0 ? `arranca ${aDDMMAAAA(inicioISO)} — quedan ${dias} días` : `arrancó ${aDDMMAAAA(inicioISO)} — hace ${-dias} días`;
    inicioChip = `<span class="badge ${dias <= 10 ? 'badge-rojo' : 'badge-naranja'}">${txt}</span>`;
  }
  const idl = idLocal(o.id);
  const ubic = [o.dir, o.localidad, o.jurisdiccion].filter(Boolean).join(' · ') || '—';
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:var(--fondo);">
      <b>${numeroPreTxt(pre)} · ${o.nombre}</b>
      <span class="badge ${o.estado === 'Operativo' ? 'badge-verde' : 'badge-naranja'}">servicio ${o.estado === 'Operativo' ? 'OPERATIVO' : 'en PENDIENTE ASIGNACIÓN'}</span>
      <span class="badge badge-gris">alta ${aDDMMAAAA(pre.fechaAlta)}</span>
      ${inicioChip}
      <a href="#" onclick="verObjetivo('${idl}');return false;" style="font-size:12px;color:var(--azul);">👁 ficha del servicio</a>
      <span style="margin-left:auto;font-size:12px;color:var(--texto-suave);">dotación: ${r.total} puesto${r.total !== 1 ? 's' : ''}${o.efts ? ' · ' + o.efts + ' hs/mes' : ''} · <b>${r.cubiertas}/${r.total} cubierta</b></span>
    </div>
    <div style="padding:6px 14px;font-size:12px;color:var(--texto-suave);border-top:1px solid var(--borde);">
      🏷 ${o.tipo || '—'} · 📍 ${ubic} · 👤 Supervisor: ${o.supervisorAsignado || 'a designar'}
    </div>`;
}

export function actualizarBadgePrepedidos() {
  const btn = document.querySelector('#screen-pedidos .tab-btn[data-ped-tab="prepedidos"]');
  if (!btn) return;
  btn.style.display = puedeVerPrepedidos() ? '' : 'none';
  const n = puedeVerPrepedidos() ? contarVacantesPendientes() : 0;
  const b = $('prepedidos-tab-count');
  if (b) { b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }
}

export function renderPrepedidos() {
  sincronizarPrepedidos();
  actualizarBadgePrepedidos();
  const cont = $('prepedidos-body');
  if (!cont) return;
  if (!puedeVerPrepedidos()) {
    cont.innerHTML = '<p class="text-muted" style="padding:18px;">Esta bandeja es de Operaciones y RRHH.</p>';
    return;
  }
  const bandeja = prepedidosEnBandeja();
  if (!bandeja.length) {
    cont.innerHTML = '<div class="empty-state" style="padding:26px;text-align:center;"><div class="icon">📥</div><p>Bandeja vacía — no hay servicios nuevos esperando decisión de dotación ✓</p></div>';
    return;
  }
  const puedeDecidir = puedeDecidirPrepedidos();
  cont.innerHTML = bandeja.map(pre => {
    const o = objetivoDePrepedido(pre);
    const r = resumenPrepedido(pre);
    return `<div class="prebox" data-pre="${pre.id}" style="border:1px solid var(--borde);border-radius:var(--radio);margin:12px 14px;overflow:hidden;">
      ${cabeceraPrepedido(pre, o, r)}
      ${pre.vacantes.map((v, i) => vacanteHtml(pre, v, i, puedeDecidir)).join('')}
    </div>`;
  }).join('');
}

// Filas para la tab Historial de Pedidos (8 columnas, mismo orden).
export function filasHistorialPrepedidos({ buscar = '', resultado = '' } = {}) {
  if (!puedeVerPrepedidos()) return '';
  return prepedidosResueltos().map(pre => {
    const r = resumenPrepedido(pre);
    const todoInterno = r.int === r.total;
    return { pre, r, todoInterno };
  }).filter(({ pre, todoInterno }) => {
    if (resultado === 'Cancelado') return false;
    if (resultado === 'Cubierto' && !todoInterno) return false;
    const q = buscar.toLowerCase();
    return !q || `${pre.servicioNombre} ${pre.servicioCodigo} ${numeroPreTxt(pre)}`.toLowerCase().includes(q);
  }).map(({ pre, r, todoInterno }) => {
    const personas = pre.vacantes.map((_, i) => estadoVacante(pre, i)).filter(e => e.estado === 'int').map(e => e.rea.nombreAsociado).filter(Boolean);
    const pedidos = pre.vacantes.map((_, i) => estadoVacante(pre, i)).filter(e => e.ped).map(e => `PP-${e.ped.numero}`);
    const puestos = r.total === 1 ? (pre.vacantes[0].puesto || '1 vacante') : `${r.total} vacantes`;
    const resultadoHtml = todoInterno
      ? '<span class="badge" style="background:#ede7f6;color:#5b21b6;">CUBIERTO INTERNO</span> <span class="badge badge-gris" style="font-size:9.5px;">desde prepedido</span>'
      : `<span class="badge badge-azul">DECIDIDO</span> <span class="badge badge-gris" style="font-size:9.5px;">${r.int} interno${r.int !== 1 ? 's' : ''} · ${r.act + r.cub} a Activos</span>`;
    return `<tr>
      <td style="font-size:12px;color:var(--texto-suave);">${numeroPreTxt(pre)}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${aDDMMAAAA(pre.fechaAlta)} · ${pre.creadoPor || '—'}</td>
      <td style="font-weight:500;">${pre.servicioNombre} <small>servicio nuevo</small></td>
      <td><span class="chip">${puestos}</span></td>
      <td>${resultadoHtml}</td>
      <td style="font-size:12.5px;">${[...personas, ...pedidos].join(' · ') || '—'}</td>
      <td style="text-align:right;">—</td>
      <td style="font-size:12px;color:var(--texto-suave);">—</td>
    </tr>`;
  }).join('');
}

// ========== ACCIONES ==========

function preDeId(id) { return (DB.prepedidos || []).find(p => String(p.id) === String(id)); }

export function cubrirVacanteConInterno(preId, idx) {
  if (!puedeDecidirPrepedidos()) { toast('⛔ Solo Operaciones decide la dotación'); return; }
  const pre = preDeId(preId);
  const o = pre && objetivoDePrepedido(pre);
  if (!pre || !o) { toast('⚠️ No se encontró el prepedido'); return; }
  const v = pre.vacantes[idx];
  if (!v) return;
  if (estadoVacante(pre, idx).estado !== 'pend') { toast('Esta vacante ya tiene una decisión'); renderPrepedidos(); return; }
  if (typeof window.abrirReasignacionDesdePrepedido !== 'function') { toast('⚠️ Reasignaciones todavía no cargó, reintentá'); return; }
  window.abrirReasignacionDesdePrepedido({
    prepedidoIdLocal: idLocal(pre.id), prepedidoVacante: idx, etiqueta: numeroPreTxt(pre),
    servicioDestino: o.codigo, supervisorDestino: o.supervisorAsignado || '',
    descripcion: `Cubre la vacante "${v.puesto || 'sin categoría'}" (${v.horarioDesde || '?'}–${v.horarioHasta || '?'}) del servicio nuevo ${o.nombre}, prepedido ${numeroPreTxt(pre)}.`,
    puesto: v.puesto || '', horarioDesde: v.horarioDesde || null, horarioHasta: v.horarioHasta || null,
    dias: v.dias || null, tipoHorario: v.tipoHorario || null,
    direccion: [o.dir, o.localidad, o.jurisdiccion].filter(Boolean).join(' · ') || null,
    hsMes: o.efts || null, servicioNombre: o.nombre || '',
  });
}

export function incorporarVacante(preId, idx) {
  if (!puedeDecidirPrepedidos()) { toast('⛔ Solo Operaciones decide la dotación'); return; }
  const pre = preDeId(preId);
  const o = pre && objetivoDePrepedido(pre);
  if (!pre || !o) { toast('⚠️ No se encontró el prepedido'); return; }
  const v = pre.vacantes[idx];
  if (!v) return;
  // Idempotencia: doble click o dos usuarios a la vez no duplican el pedido.
  if (estadoVacante(pre, idx).estado !== 'pend') { toast('Esta vacante ya tiene una decisión'); renderPrepedidos(); return; }
  if (typeof window.crearPedidoDesdePrepedido !== 'function') { toast('⚠️ Pedidos todavía no cargó, reintentá'); return; }
  const inicioISO = aISO(o.fechaInicio);
  const dias = diasHasta(inicioISO);
  const horarioSemanal = { dias: { ...v.dias }, horarioDesde: v.horarioDesde, horarioHasta: v.horarioHasta, tipoHorario: v.tipoHorario };
  const pedido = window.crearPedidoDesdePrepedido({
    supervisor: o.supervisorAsignado || 'A designar',
    servicio: o.codigo,
    zona: o.localidad || o.jurisdiccion || '',
    puesto: v.puesto || '',
    cantidad: 1,
    fechaLimite: aDDMMAAAA(inicioISO),
    horarioSemanal,
    horario: formatearHorarioSemanal(horarioSemanal),
    urgencia: dias != null && dias <= 10 ? 'Alta' : 'Media',
    perfil: [],
    obs: [v.perfil ? `Perfil: ${v.perfil}` : '', v.obs].filter(Boolean).join(' · '),
    prepedidoIdLocal: idLocal(pre.id),
    prepedidoVacante: idx,
  }, numeroPreTxt(pre));
  nombresConPerfil(['RRHH']).forEach(nombre => crearNotificacion({
    tipo: 'pedido_desde_prepedido', entidadTipo: 'pedido', entidadIdLocal: idLocal(pedido.id), destinatarioNombre: nombre,
    mensaje: `Nuevo pedido PP-${pedido.numero} (${o.nombre}) desde ${numeroPreTxt(pre)}: ${v.puesto || 'vacante'} — RRHH inicia la búsqueda.`,
  }));
  renderPrepedidos();
  if (window.renderPedidosScreen) window.renderPedidosScreen();
  toast(`Vacante pasada a ACTIVOS como PP-${pedido.numero} ✓ — RRHH ya puede iniciar la búsqueda`);
}

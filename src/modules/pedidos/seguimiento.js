// Sub-módulo "Seguimiento" de Pedidos de personal — antes vivía en
// src/modules/seguimiento_seleccion/ como pantalla propia; el ticket
// "Pedidos de personal completo" (18/09) lo convierte en una TAB más de
// Pedidos (mockup_pedidos_personal_completo_2.html) con UN SOLO set de
// KPIs compartido — el bug real que motiva esto: "Seguimiento decía 0
// cubiertas y Pedidos 16 activos; 24 activos vs 9" porque cada pantalla
// calculaba sus propios números con criterios distintos (¿qué es
// "vencido"? ¿qué es "activo"?). Ahora se ACOPLA a pedidos.js a
// propósito (ya no hay dos módulos separados que evitar acoplar) para
// que haya una sola fuente de verdad: ESTADOS_ACTIVOS y pedidoVencido()
// se importan de ahí en vez de reimplementarse acá.
//
// PIPELINE DE SELECCIÓN (sin cambios de esta migración): Candidato →
// Etapa actual → Ingreso, leído en vivo de Psicotécnico / Preocupacional
// / Documentación de ingreso / Altas — ver la nota grande original en
// el módulo viejo (git log) para el detalle de "vacantes cubiertas" no
// es un campo tildado a mano, se recalcula contando altas completas +
// reasignaciones ejecutadas vinculadas al pedido.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { pedidosVisiblesParaUsuario, pedidoVencido, numeroPedidoTxt, ESTADOS_ACTIVOS, renderPedidosScreen } from './pedidos.js';

const ESTADOS_NO_CONTINUA = ['Rechazado', 'Baja', 'Caducado'];

function getPsicoDe(c) { return (DB.psicos || []).find(p => (p.candidatoId && p.candidatoId === c.id) || (p.dni && p.dni === c.dni)); }
function getPreocupDe(c) { return (DB.preocupacionales || []).find(p => (p.candidatoId && p.candidatoId === c.id) || (p.dni && p.dni === c.dni)); }
function getDocumDe(c) { return (DB.documentacionIngreso || []).find(p => (p.candidatoId && p.candidatoId === c.id) || (p.dni && p.dni === c.dni)); }
function getAltaPendienteDe(c) { return (DB.catAltPendientes || []).find(a => a.dni === c.dni); }
function getLegajoDe(c) { return (DB.legajos || []).find(l => l.dni === c.dni); }

// Zona del servicio: la ficha de Objetivos ya tiene Jurisdicción +
// Localidad — no se inventa una columna "zona" nueva y redundante.
function zonaDeServicio(codigoServicio) {
  const obj = (DB.objetivos || []).find(o => o.codigo === codigoServicio);
  return obj?.localidad || obj?.jurisdiccion || null;
}

const PASOS = ['entrevista', 'psico', 'preocup', 'documentacion', 'alta'];
const PASO_LABEL = { entrevista: 'Entrevista', psico: 'Psico', preocup: 'Preocup.', documentacion: 'Doc. ingreso', alta: 'Alta' };

function pipelineDe(c) {
  const legajo = getLegajoDe(c);
  if (legajo) return { completo: true, ingresoEfectivo: legajo.ingreso || null };

  if (ESTADOS_NO_CONTINUA.includes(c.estado)) {
    const docum = getDocumDe(c), preocup = getPreocupDe(c), psico = getPsicoDe(c);
    let etapaCaida = 'Entrevista';
    if (docum?.estado === 'Rechazado') etapaCaida = 'Documentación de ingreso';
    else if (preocup?.estado === 'Rechazado') etapaCaida = 'Preocupacional';
    else if (psico?.estado === 'Rechazado') etapaCaida = 'Psicotécnico';
    return { noContinua: true, etapaCaida, motivo: c.motivoRechazo || '' };
  }

  const psico = getPsicoDe(c), preocup = getPreocupDe(c), docum = getDocumDe(c), altaPend = getAltaPendienteDe(c);
  const pasos = PASOS.map(k => ({ key: k, estado: 'pend', manual: false }));
  const marcar = (key, estado, manual) => { const p = pasos.find(x => x.key === key); p.estado = estado; p.manual = !!manual; };

  marcar('entrevista', ['Aprobado', 'Psicotecnico'].includes(c.estado) ? 'ok' : 'cur');
  if (psico) {
    marcar('entrevista', 'ok');
    marcar('psico', psico.estado === 'Aprobado' ? 'ok' : 'cur', psico.origen === 'manual');
  }
  if (preocup) {
    marcar('psico', 'ok', psico?.origen === 'manual');
    marcar('preocup', preocup.estado === 'Aprobado' ? 'ok' : 'cur', preocup.origen === 'manual');
  }
  if (docum) {
    marcar('preocup', 'ok', preocup?.origen === 'manual');
    marcar('documentacion', docum.estado === 'Aprobado' ? 'ok' : 'cur', docum.origen === 'manual');
  }
  if (altaPend) {
    marcar('documentacion', 'ok', docum?.origen === 'manual');
    marcar('alta', 'cur');
  }
  const actual = pasos.find(p => p.estado === 'cur') || pasos.slice().reverse().find(p => p.estado === 'ok') || pasos[0];
  return { pasos, etapaActualKey: actual.key, manual: actual.manual };
}

function candidatosVinculadosA(pedido) {
  return (DB.candidatos || []).filter(c => c.pedidoVinculadoIdLocal && String(c.pedidoVinculadoIdLocal) === String(pedido.id));
}
function reasignacionesVinculadasA(pedido) {
  return (DB.reasignaciones || []).filter(r => r.pedidoVinculadoIdLocal && String(r.pedidoVinculadoIdLocal) === String(pedido.id));
}
function coberturaDePedido(pedido) {
  const candidatos = candidatosVinculadosA(pedido);
  const reasigCubren = reasignacionesVinculadasA(pedido).filter(r => r.estado === 'Aprobada ejecutada');
  const altasCompletas = candidatos.filter(c => !!getLegajoDe(c));
  const cubiertas = altasCompletas.length + reasigCubren.length;
  return { candidatos, reasigCubren, altasCompletas, cubiertas, total: pedido.cantidad || 1 };
}

// Estado calculado de ESTA vista — no toca pedido.estado (ese sigue
// siendo el campo real que gestiona la tab Activos/Historial). "Vencido"
// ahora usa el MISMO criterio parametrizable por urgencia que ya pinta
// de rojo la fila en la tabla de Activos (pedidoVencido, pedidos.js) —
// antes esta vista comparaba contra fechaLimite con su propia cuenta,
// lo que producía un "vencidos" distinto entre las dos pantallas.
function estadoCalculadoPedido(pedido, cobertura) {
  if (cobertura.cubiertas >= cobertura.total) return 'Cubierto';
  if (pedidoVencido(pedido)) return 'Vencido';
  const hayActivo = cobertura.candidatos.some(c => !ESTADOS_NO_CONTINUA.includes(c.estado) && !getLegajoDe(c));
  return hayActivo ? 'En proceso' : 'En búsqueda';
}

const ESTADO_CHIP = { 'En búsqueda': 'badge-azul', 'En proceso': 'badge-naranja', 'Cubierto': 'badge-verde', 'Vencido': 'badge-rojo' };

function filaDePedido(pedido) {
  const cobertura = coberturaDePedido(pedido);
  const estado = estadoCalculadoPedido(pedido, cobertura);
  const zona = zonaDeServicio(pedido.servicio);
  const historial = cobertura.candidatos
    .map(c => ({ c, pipe: pipelineDe(c) }))
    .filter(x => x.pipe.noContinua || x.pipe.completo);
  const activos = cobertura.candidatos
    .map(c => ({ c, pipe: pipelineDe(c) }))
    .filter(x => !x.pipe.noContinua && !x.pipe.completo);
  return { pedido, cobertura, estado, zona, historial, activos };
}

// Pedidos "vivos" para el seguimiento: los mismos que la tab Activos
// (Pendiente | En búsqueda) — un pedido Cubierto/Cancelado pasa a
// Historial y deja de rastrearse acá. Antes esta vista incluía CUALQUIER
// pedido no cancelado (incluidos los ya Cubiertos), otra causa de la
// discrepancia de contadores entre pantallas.
function pedidosVisiblesActivos() {
  return pedidosVisiblesParaUsuario(DB.pedidos || []).filter(p => ESTADOS_ACTIVOS.includes(p.estado));
}

// ========== KPIs UNIFICADOS (usados por el panel superior de las 3 tabs) ==========

function mesDeFechaAR(fecha) {
  const [dd, mm, aa] = String(fecha || '').split('/');
  return (dd && mm && aa) ? `${aa}-${mm.padStart(2, '0')}` : null;
}

export function calcularKpisSeguimiento() {
  const filas = pedidosVisiblesActivos().map(filaDePedido);
  const esteMes = new Date().toISOString().slice(0, 7);
  const vacantesBusqueda = filas.reduce((s, f) => s + Math.max(0, f.cobertura.total - f.cobertura.cubiertas - f.activos.length), 0);
  const conCandidatoProceso = filas.reduce((s, f) => s + f.activos.length, 0);
  const cubiertasEsteMes = filas.reduce((s, f) => {
    const altasMes = f.cobertura.altasCompletas.filter(c => mesDeFechaAR(getLegajoDe(c)?.ingreso) === esteMes).length;
    const reasigMes = f.cobertura.reasigCubren.filter(r => mesDeFechaAR(r.fechaEjecucion) === esteMes).length;
    return s + altasMes + reasigMes;
  }, 0);
  const vencidos = filas.filter(f => f.estado === 'Vencido').length;
  return { pedidosActivos: filas.length, vacantesBusqueda, conCandidatoProceso, cubiertasEsteMes, vencidos };
}

// ========== RENDER DE LA TAB ==========

let _expandido = new Set();

export function renderSeguimientoSeleccion() {
  const tbody = $('tbody-seg-sel'); if (!tbody) return;
  const filas = pedidosVisiblesActivos().map(filaDePedido);

  const q = ($('seg-buscar') || { value: '' }).value.toLowerCase();
  const fSup = ($('seg-filtro-sup') || { value: '' }).value;
  const fZona = ($('seg-filtro-zona') || { value: '' }).value;
  const fEstado = ($('seg-filtro-estado') || { value: '' }).value;
  const fEtapa = ($('seg-filtro-etapa') || { value: '' }).value;

  const filtradas = filas.filter(f => {
    if (q) {
      const enTexto = [numeroPedidoTxt(f.pedido), f.pedido.servicio, f.pedido.supervisor, ...f.activos.map(a => a.c.apellido + ' ' + a.c.nombre)]
        .join(' ').toLowerCase();
      if (!enTexto.includes(q)) return false;
    }
    if (fSup && f.pedido.supervisor !== fSup) return false;
    if (fZona && f.zona !== fZona) return false;
    if (fEstado && f.estado !== fEstado) return false;
    if (fEtapa && !f.activos.some(a => PASO_LABEL[a.pipe.etapaActualKey] === fEtapa)) return false;
    return true;
  });

  poblarFiltrosSeguimiento(filas);

  if (!filtradas.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin pedidos para mostrar con estos filtros.</td></tr>';
    return;
  }
  tbody.innerHTML = filtradas.map(f => filaHtml(f)).join('');
  tbody.querySelectorAll('[data-toggle-hist]').forEach(el => {
    el.onclick = () => { const id = el.dataset.toggleHist; if (_expandido.has(id)) _expandido.delete(id); else _expandido.add(id); renderSeguimientoSeleccion(); };
  });
  tbody.querySelectorAll('[data-ver-pedido]').forEach(el => {
    el.onclick = () => abrirDetallePedidoSeguimiento(el.dataset.verPedido);
  });
  tbody.querySelectorAll('[data-vincular-pedido]').forEach(el => {
    el.onclick = () => abrirVincularCandidato(el.dataset.vincularPedido);
  });
}

function poblarFiltrosSeguimiento(filas) {
  const selSup = $('seg-filtro-sup');
  if (selSup && !selSup.dataset.poblado) {
    const sups = [...new Set(filas.map(f => f.pedido.supervisor).filter(Boolean))].sort();
    selSup.innerHTML = '<option value="">Supervisor: todos</option>' + sups.map(s => `<option>${s}</option>`).join('');
    selSup.dataset.poblado = '1';
  }
  const selZona = $('seg-filtro-zona');
  if (selZona && !selZona.dataset.poblado) {
    const zonas = [...new Set(filas.map(f => f.zona).filter(Boolean))].sort();
    selZona.innerHTML = '<option value="">Zona: todas</option>' + zonas.map(z => `<option>${z}</option>`).join('');
    selZona.dataset.poblado = '1';
  }
}

export function filtrarSeguimientoSeleccion() { renderSeguimientoSeleccion(); }

function pipeHtml(pipe) {
  if (!pipe.pasos) return '';
  return `<div class="seg-pipe">` + pipe.pasos.map(p => `
    <div class="seg-paso seg-${p.estado}">
      <div class="seg-dot"></div>
      <div class="seg-lb">${PASO_LABEL[p.key]}${p.manual ? ' <span class="badge badge-gris" style="font-size:8px;padding:1px 4px;">MANUAL</span>' : ''}</div>
    </div>`).join('') + `</div>`;
}

function candidatoActivoHtml(a, avisaReemplazo) {
  const nombre = `${a.c.apellido}, ${a.c.nombre}`;
  const puedeCargarManual = a.pipe.etapaActualKey !== 'alta';
  return `<div class="seg-cand">
    <div><b>${nombre}</b><span class="seg-x"> DNI ${a.c.dni}${avisaReemplazo ? ' · reemplaza a un candidato que no continuó (ver historial ▸)' : ''}</span></div>
    ${pipeHtml(a.pipe)}
    ${puedeCargarManual ? `<button class="btn btn-xs btn-secondary" style="margin-top:4px;" onclick="abrirCargaManualEtapaSeguimiento('${a.c.id}')">✏️ Cargar etapa manual</button>` : ''}
  </div>`;
}

function filaHtml(f) {
  const p = f.pedido;
  const id = String(p.id);
  const tieneHistorial = f.historial.some(h => h.pipe.noContinua);
  const expandido = _expandido.has(id);
  const zonaHtml = f.zona ? f.zona : '<span style="color:#b3261e;">zona sin cargar ⚠</span>';

  const bloques = [];
  f.cobertura.altasCompletas.forEach(c => {
    bloques.push(`<div class="seg-vac"><div class="seg-cand">✔ ${c.apellido}, ${c.nombre} — <span class="badge badge-verde">INGRESÓ ${(getLegajoDe(c)?.ingreso || '').slice(0, 5)}</span>
      <div class="seg-x">Alta completa → escribió su registro en el padrón de categorías (origen ALTA)</div></div></div>`);
  });
  f.cobertura.reasigCubren.forEach(r => {
    bloques.push(`<div class="seg-vac"><div class="seg-cand">${r.nombreAsociado || r.nroSocio || '—'} — <span class="badge badge-viol">CUBIERTO POR REASIGNACIÓN</span>
      <div class="seg-x">Vino de ${r.servicioOrigen || '—'} vía Reasignaciones — sin pipeline de selección</div></div></div>`);
  });
  f.activos.forEach(a => {
    bloques.push(`<div class="seg-vac">${candidatoActivoHtml(a, tieneHistorial)}</div>`);
  });
  const faltantes = Math.max(0, f.cobertura.total - f.cobertura.cubiertas - f.activos.length);
  for (let i = 0; i < faltantes; i++) {
    bloques.push(`<div class="seg-vac"><span class="seg-x">Vacante: en búsqueda</span> <button class="btn btn-xs btn-primary" data-vincular-pedido="${id}">+ Vincular</button></div>`);
  }
  const colCandidatos = bloques.length ? bloques.join('') : '<span class="seg-x">Sin candidato asignado</span>';

  const filaHist = expandido ? `<tr class="seg-hist" id="hist-${id}"><td colspan="10">${historialHtml(f)}</td></tr>` : '';

  return `<tr>
    <td>${tieneHistorial ? `<span class="seg-flecha" data-toggle-hist="${id}">${expandido ? '▾' : '▸'}</span>` : ''}</td>
    <td class="seg-ped">${numeroPedidoTxt(p)}</td>
    <td class="seg-srv">${p.servicio}<small>${zonaHtml}</small></td>
    <td>${p.supervisor || '—'}</td>
    <td>${p.puesto || '—'}</td>
    <td><b>${f.cobertura.cubiertas} de ${f.cobertura.total}</b></td>
    <td style="${f.estado === 'Vencido' ? 'color:#b3261e;font-weight:700;' : ''}">${p.fechaLimite || '—'}</td>
    <td><span class="badge ${ESTADO_CHIP[f.estado] || 'badge-gris'}">${f.estado.toUpperCase()}</span></td>
    <td style="width:38%;">${colCandidatos}</td>
    <td><button class="btn btn-xs btn-secondary" data-ver-pedido="${id}">Ver</button></td>
  </tr>${filaHist}`;
}

function historialHtml(f) {
  if (!f.historial.length) return '<span class="seg-x">Sin historial todavía.</span>';
  const partes = f.historial.map(h => {
    if (h.pipe.completo) return `${h.c.apellido}, ${h.c.nombre} → <span class="badge badge-verde">CUBIERTA</span>`;
    return `${h.c.apellido}, ${h.c.nombre} → <span class="badge badge-rojo">NO CONTINUÓ</span> en ${h.pipe.etapaCaida}${h.pipe.motivo ? ' (' + h.pipe.motivo + ')' : ''}`;
  });
  return `<b>Historial del pedido ${numeroPedidoTxt(f.pedido)}:</b> ` + partes.join(' · ');
}

// ========== MODAL "VER" (detalle del pedido) ==========

export function abrirDetallePedidoSeguimiento(id) {
  const p = (DB.pedidos || []).find(x => String(x.id) === String(id));
  if (!p) return;
  const cobertura = coberturaDePedido(p);
  $('seg-ver-titulo').textContent = `Pedido ${numeroPedidoTxt(p)} — ${p.servicio} · ${cobertura.total} vacante${cobertura.total !== 1 ? 's' : ''}`;
  $('seg-ver-resumen').innerHTML = `<b>Supervisor:</b> ${p.supervisor || '—'} · <b>Puesto:</b> ${p.puesto || '—'} · <b>F. límite:</b> ${p.fechaLimite || '—'} ·
    <span class="badge ${ESTADO_CHIP[estadoCalculadoPedido(p, cobertura)] || 'badge-gris'}">${cobertura.cubiertas} DE ${cobertura.total} CUBIERTAS</span>`;
  const filas = [];
  cobertura.altasCompletas.forEach(c => filas.push(`<tr><td>${c.apellido}, ${c.nombre}</td><td><span class="badge badge-verde">ALTA COMPLETA</span></td><td>${getLegajoDe(c)?.ingreso || '—'} (efectivo)</td></tr>`));
  cobertura.reasigCubren.forEach(r => filas.push(`<tr><td>${r.nombreAsociado || '—'}</td><td><span class="badge badge-viol">REASIGNACIÓN</span></td><td>${r.fechaEjecucion || '—'} (efectivo)</td></tr>`));
  candidatosVinculadosA(p).filter(c => !getLegajoDe(c) && !ESTADOS_NO_CONTINUA.includes(c.estado)).forEach(c => {
    const pipe = pipelineDe(c);
    filas.push(`<tr><td>${c.apellido}, ${c.nombre}</td><td><span class="badge badge-naranja">${(PASO_LABEL[pipe.etapaActualKey] || '—').toUpperCase()}</span></td><td>— (en curso)</td></tr>`);
  });
  $('tbody-seg-ver').innerHTML = filas.length ? filas.join('') : '<tr><td colspan="3" style="text-align:center;color:var(--texto-muy-suave);">Sin candidatos vinculados todavía.</td></tr>';
  abrirModal('modal-seg-ver-pedido');
}

// ========== CARGA MANUAL DE UNA ETAPA (excepción) ==========

export function abrirCargaManualEtapaSeguimiento(candidatoId) {
  const c = (DB.candidatos || []).find(x => String(x.id) === String(candidatoId));
  if (!c) return;
  $('seg-man-cand-id').value = candidatoId;
  $('seg-man-titulo').textContent = `Cargar etapa manual — ${c.apellido}, ${c.nombre}`;
  $('seg-man-etapa').value = 'psico';
  $('seg-man-obs').value = '';
  abrirModal('modal-seg-manual');
}

export async function guardarCargaManualEtapaSeguimiento() {
  const candidatoId = $('seg-man-cand-id').value;
  const c = (DB.candidatos || []).find(x => String(x.id) === String(candidatoId));
  if (!c) { toast('⚠️ Candidato no encontrado'); return; }
  const etapa = $('seg-man-etapa').value;
  const obs = ($('seg-man-obs') || { value: '' }).value.trim();
  const base = {
    id: Date.now(), candidatoId: c.id, dni: c.dni, nombre: `${c.apellido}, ${c.nombre}`,
    estado: 'Aprobado', origen: 'manual', cargadoManualPor: currentUser?.nombre || '',
    motivoRechazo: obs ? `Cargado manual: ${obs}` : 'Cargado manual (hecho fuera del sistema)',
  };
  const TABLA = { psico: 'psicos', preocup: 'preocupacionales', documentacion: 'documentacionIngreso' }[etapa];
  if (!TABLA) { toast('⚠️ Elegí la etapa'); return; }
  const yaExiste = { psico: getPsicoDe(c), preocup: getPreocupDe(c), documentacion: getDocumDe(c) }[etapa];
  if (yaExiste) { toast('⚠️ Esa etapa ya tiene un registro para este candidato — editalo desde su módulo'); return; }
  if (!DB[TABLA]) DB[TABLA] = [];
  DB[TABLA].push(base);
  await supaSync(TABLA, base);
  cerrarModal('modal-seg-manual');
  renderPedidosScreen();
  toast(`✓ Etapa cargada como MANUAL — ${base.nombre}`);
}

// ========== "+VINCULAR" — candidato ↔ pedido (ticket §4) ==========
// Antes el único punto de entrada era el <select> del modal de
// Editar-candidato — no había forma de vincular DESDE Seguimiento
// mirando la vacante. Abre el picker real de Candidatos (nombre+DNI+
// zona+estado), avisa si el candidato ya está vinculado a otro pedido
// (sigue siendo elegible, es solo un aviso) y ofrece crear uno nuevo
// si no está en la lista. El dato vinculado (candidato.pedidoVinculadoIdLocal)
// es EL MISMO que ya lee/escribe el select del modal de Candidatos — una
// sola relación, dos ventanas (esta y la columna PEDIDO de Candidatos).
let _vincularPedidoId = null;

export function abrirVincularCandidato(pedidoId) {
  const p = (DB.pedidos || []).find(x => String(x.id) === String(pedidoId));
  if (!p) return;
  _vincularPedidoId = pedidoId;
  const t = $('vinc-pedido-titulo');
  if (t) t.textContent = `Vincular candidato — ${numeroPedidoTxt(p)} · ${p.servicio}`;
  const buscar = $('vinc-buscar'); if (buscar) buscar.value = '';
  renderListaVincularCandidatos();
  abrirModal('modal-ped-vincular');
}

// Elegibles: cualquiera que todavía esté "en carrera" (no cerrado ni de
// baja) — un candidato ya vinculado a OTRO pedido sigue apareciendo,
// solo con el aviso, tal como pide el ticket.
function candidatosVinculablesFiltrados() {
  const q = ($('vinc-buscar') || { value: '' }).value.toLowerCase();
  const elegibles = (DB.candidatos || []).filter(c => !ESTADOS_NO_CONTINUA.includes(c.estado) && c.estado !== 'Precandidato');
  if (!q) return elegibles;
  return elegibles.filter(c => `${c.apellido} ${c.nombre} ${c.dni}`.toLowerCase().includes(q));
}

export function filtrarVincularCandidatos() { renderListaVincularCandidatos(); }

function renderListaVincularCandidatos() {
  const cont = $('vinc-lista'); if (!cont) return;
  const lista = candidatosVinculablesFiltrados();
  if (!lista.length) { cont.innerHTML = '<p class="text-muted" style="padding:10px;">Sin candidatos para mostrar.</p>'; return; }
  cont.innerHTML = lista.map(c => {
    const otroPedido = c.pedidoVinculadoIdLocal && String(c.pedidoVinculadoIdLocal) !== String(_vincularPedidoId)
      ? (DB.pedidos || []).find(p => String(p.id) === String(c.pedidoVinculadoIdLocal)) : null;
    const chip = otroPedido
      ? `<span class="badge badge-naranja" style="font-size:10px;">⚠ ya vinculado a ${numeroPedidoTxt(otroPedido)}</span>`
      : `<span class="badge badge-verde" style="font-size:10px;">disponible</span>`;
    return `<div class="seg-vac" style="cursor:pointer;" data-elegir-cand="${c.id}">
      <b>${c.apellido}, ${c.nombre}</b> <span class="seg-x">DNI ${c.dni} · ${c.zona || 'sin zona'} · ${c.estado}</span> ${chip}
    </div>`;
  }).join('');
  cont.querySelectorAll('[data-elegir-cand]').forEach(el => { el.onclick = () => elegirCandidatoVincular(el.dataset.elegirCand); });
}

export async function elegirCandidatoVincular(candidatoId) {
  const c = (DB.candidatos || []).find(x => String(x.id) === String(candidatoId));
  const p = (DB.pedidos || []).find(x => String(x.id) === String(_vincularPedidoId));
  if (!c || !p) return;
  c.pedidoVinculadoIdLocal = p.id;
  await supaSync('candidatos', c);
  cerrarModal('modal-ped-vincular');
  renderPedidosScreen();
  if (window.renderCandidatos) window.renderCandidatos();
  toast(`✓ ${c.apellido}, ${c.nombre} vinculado a ${numeroPedidoTxt(p)}`);
}

// "¿No está en la lista? → Crearlo en Candidatos": no duplica el alta acá,
// linkea al módulo real (mismo patrón que ya usa el botón "+ Nuevo
// pedido" de esta pantalla, que abre Pedidos en vez de reinventar un form).
export function irACrearCandidatoDesdeVincular() {
  cerrarModal('modal-ped-vincular');
  if (window.navTo) window.navTo('candidatos');
  if (window.abrirNuevoCandidato) window.abrirNuevoCandidato();
}

// ========== EXPORTAR CSV ==========

export function exportarSeguimientoCSV() {
  const filas = pedidosVisiblesActivos().map(filaDePedido);
  const header = ['N° Pedido', 'Servicio', 'Zona', 'Supervisor', 'Puesto', 'Cubiertas', 'Total', 'F. límite', 'Estado'];
  const lineas = [header.join(',')];
  filas.forEach(f => {
    lineas.push([numeroPedidoTxt(f.pedido), `"${f.pedido.servicio}"`, `"${f.zona || 'sin cargar'}"`, `"${f.pedido.supervisor || ''}"`,
      `"${f.pedido.puesto || ''}"`, f.cobertura.cubiertas, f.cobertura.total, f.pedido.fechaLimite || '', f.estado].join(','));
  });
  const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `seguimiento_seleccion_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  toast('⬇️ CSV exportado');
}

// Módulo Seguimiento de selección — vista transversal de solo lectura
// (pedido de Jimena/RRHH, 14/09/2026, ver mockup_seguimiento_seleccion.html).
//
// NO reemplaza ninguna pantalla existente (Pedidos de personal,
// Candidatos, Psicotécnico, Preocupacional, Documentación de ingreso,
// Altas) — esas siguen siendo donde se gestiona cada etapa. Esta vista
// LEE de ahí y arma la cadena completa:
//   PEDIDO → VACANTE → CANDIDATO ASIGNADO → ETAPA ACTUAL → INGRESO
//
// PRERREQUISITO ENCONTRADO EN LA INVESTIGACIÓN (confirmado con el
// usuario antes de escribir esto): no existía NINGÚN vínculo entre un
// Candidato y el Pedido de personal que cubre — Candidatos ni siquiera
// tenía un campo de servicio. Se agregó candidato.pedidoVinculadoIdLocal
// (mismo patrón que ya usaba Reasignaciones con
// "Pedido de personal vinculado" — ver reasignaciones.js) como
// prerrequisito de esta vista (sql/v127).
//
// "Vacantes cubiertas" NO es un campo que alguien tilde a mano — hoy
// Pedidos de personal solo tiene un booleano global (confirmarCubierto()
// pone TODO el pedido en 'Cubierto' con un solo nombre, y
// ejecutarReasignacion() hace lo mismo) que no distingue "1 de 2". Acá
// se recalcula la cobertura real contando:
//   - candidatos vinculados a este pedido que ya tienen legajo (Alta
//     completa) → 1 vacante cada uno.
//   - reasignaciones vinculadas a este pedido con estado
//     'Aprobada ejecutada' → 1 vacante cada una (cobertura sin pipeline
//     de selección, agregado de integración del ticket §3.1).
// Los estados EN BÚSQUEDA/EN PROCESO/CUBIERTO/VENCIDO de ESTA vista se
// calculan solos a partir de esos números — no leen ni pisan
// pedido.estado (ese sigue siendo el booleano viejo que ya usa Pedidos
// de personal, no se toca para no romper esa pantalla).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// ========== HELPERS DE LECTURA (todo por DNI, con candidatoId como
// atajo cuando está — mismo criterio de conciliación que ya usa el
// resto del flujo de ingreso, ver CLAUDE.md "Conciliación entre etapas
// por candidatoId truncado") ==========

const numeroPedidoTxt = (p) => p?.numero ? `PP-${p.numero}` : '—';
const ESTADOS_NO_CONTINUA = ['Rechazado', 'Baja', 'Caducado'];

function getPsicoDe(c) { return (DB.psicos || []).find(p => (p.candidatoId && p.candidatoId === c.id) || (p.dni && p.dni === c.dni)); }
function getPreocupDe(c) { return (DB.preocupacionales || []).find(p => (p.candidatoId && p.candidatoId === c.id) || (p.dni && p.dni === c.dni)); }
function getDocumDe(c) { return (DB.documentacionIngreso || []).find(p => (p.candidatoId && p.candidatoId === c.id) || (p.dni && p.dni === c.dni)); }
function getAltaPendienteDe(c) { return (DB.catAltPendientes || []).find(a => a.dni === c.dni); }
function getLegajoDe(c) { return (DB.legajos || []).find(l => l.dni === c.dni); }

// Zona del servicio: la ficha de Objetivos YA tiene Jurisdicción +
// Localidad (CABA / Provincia de Buenos Aires + partido-barrio) — es el
// mismo dato que pide el ticket, no se inventa una columna "zona"
// nueva y redundante (ver nota en sql/v127). Cuando el servicio no
// tiene localidad cargada (el caso real que reporta el ticket), se
// devuelve null y la vista muestra "zona sin cargar".
function zonaDeServicio(codigoServicio) {
  const obj = (DB.objetivos || []).find(o => o.codigo === codigoServicio);
  return obj?.localidad || obj?.jurisdiccion || null;
}

const PASOS = ['entrevista', 'psico', 'preocup', 'documentacion', 'alta'];
const PASO_LABEL = { entrevista: 'Entrevista', psico: 'Psico', preocup: 'Preocup.', documentacion: 'Doc. ingreso', alta: 'Alta' };

// Devuelve el estado del candidato dentro del pipeline de selección.
// - completo: ya tiene legajo (Alta hecha) → INGRESÓ.
// - noContinua: rechazado/baja/caducado en cualquier etapa → historial.
// - si no, el mini-pipeline de 5 pasos con cuál está 'ok'/'cur'/pendiente
//   y si el paso actual se cargó MANUAL.
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

// Vacantes cubiertas del pedido — ver nota grande arriba del archivo.
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

// Estado calculado — SOLO esta vista, no toca pedido.estado (ver nota
// grande arriba). Regla del ticket §4: EN BÚSQUEDA → EN PROCESO →
// CUBIERTO | VENCIDO.
function estadoCalculadoPedido(pedido, cobertura) {
  if (cobertura.cubiertas >= cobertura.total) return 'Cubierto';
  const hoy = new Date();
  const [dd, mm, aa] = (pedido.fechaLimite || '').split('/');
  const limite = (dd && mm && aa) ? new Date(`${aa}-${mm}-${dd}`) : null;
  if (limite && hoy > limite) return 'Vencido';
  const hayActivo = cobertura.candidatos.some(c => !ESTADOS_NO_CONTINUA.includes(c.estado) && !getLegajoDe(c));
  return hayActivo ? 'En proceso' : 'En búsqueda';
}

const ESTADO_CHIP = { 'En búsqueda': 'badge-azul', 'En proceso': 'badge-naranja', 'Cubierto': 'badge-verde', 'Vencido': 'badge-rojo' };

// ========== FILA POR PEDIDO (view-model completo para el render) ==========

function filaDePedido(pedido) {
  const cobertura = coberturaDePedido(pedido);
  const estado = estadoCalculadoPedido(pedido, cobertura);
  const zona = zonaDeServicio(pedido.servicio);
  // Historial: todo vinculado que no sigue activo (rechazado/baja/caducado)
  // o cuyo legajo ya se dio de alta — se muestra en la fila expandible,
  // nunca se pierde aunque la vacante ya esté cubierta por otro candidato.
  const historial = cobertura.candidatos
    .map(c => ({ c, pipe: pipelineDe(c) }))
    .filter(x => x.pipe.noContinua || x.pipe.completo);
  const activos = cobertura.candidatos
    .map(c => ({ c, pipe: pipelineDe(c) }))
    .filter(x => !x.pipe.noContinua && !x.pipe.completo);
  return { pedido, cobertura, estado, zona, historial, activos };
}

function pedidosVisibles() {
  // Igual que Pedidos de personal: un supervisor solo ve los suyos.
  // Se reimplementa acá (no se importa pedidos.js) para no acoplar un
  // módulo de solo lectura a las internas de otro — mismo criterio de
  // "esMismoSupervisor" que ya usa el resto del proyecto.
  const todos = (DB.pedidos || []).filter(p => p.estado !== 'Cancelado');
  if (currentUser?.perfil !== 'Supervisor') return todos;
  return todos.filter(p =>
    p.supervisor === currentUser.nombre || p.supervisor === currentUser.funcion ||
    (DB.legajos || []).some(l => l.servicio === p.servicio && l.supervisor === currentUser.nombre)
  );
}

// ========== KPIs + FILTROS + RENDER ==========

let _expandido = new Set();

export function renderSeguimientoSeleccion() {
  const tbody = $('tbody-seg-sel'); if (!tbody) return;
  const filas = pedidosVisibles().map(filaDePedido);

  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('kpi-seg-activos', filas.length);
  ss('kpi-seg-busqueda', filas.reduce((s, f) => s + Math.max(0, f.cobertura.total - f.cobertura.cubiertas - f.activos.length), 0));
  ss('kpi-seg-proceso', filas.filter(f => f.estado === 'En proceso').length);
  const esteMes = new Date().toISOString().slice(0, 7);
  ss('kpi-seg-cubiertas-mes', filas.reduce((s, f) => s + f.cobertura.altasCompletas.filter(c => (getLegajoDe(c)?.ingreso || '').split('/').reverse().join('-').slice(0, 7) === esteMes).length, 0));
  ss('kpi-seg-vencidos', filas.filter(f => f.estado === 'Vencido').length);

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
  // "Cargar etapa manual" solo tiene sentido antes de Alta (una vez que
  // llega a Alta, esa pantalla ya tiene su propio flujo real).
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
  // La flecha de historial solo aparece cuando hay algo que contar: un
  // candidato que no continuó y cuya vacante se re-vinculó. Una
  // cobertura directa (alta sin drama, o por reasignación) no necesita
  // expandirse — ya se ve completa en la fila principal.
  const tieneHistorial = f.historial.some(h => h.pipe.noContinua);
  const expandido = _expandido.has(id);
  const zonaHtml = f.zona ? f.zona : '<span style="color:#b3261e;">zona sin cargar ⚠</span>';

  // Columna de candidatos/avance: altas completas (✔ INGRESÓ) + cobertura
  // por reasignación (chip violeta, sin pipeline) + activos en pipeline +
  // placeholders "en búsqueda" para las vacantes que todavía no tienen a
  // nadie vinculado.
  const bloques = [];
  f.cobertura.altasCompletas.forEach(c => {
    bloques.push(`<div class="seg-vac"><div class="seg-cand">✔ ${c.apellido}, ${c.nombre} — <span class="badge badge-verde">INGRESÓ ${(c.pipe?.ingresoEfectivo || getLegajoDe(c)?.ingreso || '').slice(0, 5)}</span>
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
  for (let i = 0; i < faltantes; i++) bloques.push(`<div class="seg-vac"><span class="seg-x">Vacante: en búsqueda</span></div>`);
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

// ========== CARGA MANUAL DE UNA ETAPA (excepción, ticket §3.3) ==========
// Jimena puede necesitar anotar una etapa hecha fuera del sistema. Crea
// el registro MÍNIMO real en la tabla de esa etapa (para que el resto
// del sistema —incluida esta vista— la vea como cualquier otra) pero
// marcado origen:'manual' + quién la cargó, así nunca se confunde con
// una etapa gestionada de verdad. No dispara la creación automática de
// la etapa siguiente (eso sí es una acción real con sus propios
// requisitos en cada módulo) — si corresponde avanzar, se hace desde
// Psicotécnico/Preocupacional/Documentación como cualquier caso.
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
  renderSeguimientoSeleccion();
  toast(`✓ Etapa cargada como MANUAL — ${base.nombre}`);
}
window.abrirCargaManualEtapaSeguimiento = abrirCargaManualEtapaSeguimiento;

// ========== EXPORTAR CSV ==========

export function exportarSeguimientoCSV() {
  const filas = pedidosVisibles().map(filaDePedido);
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

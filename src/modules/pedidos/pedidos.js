import { DB, currentUser } from '@shared/state.js';
import { $, avatarEl, badge, fillDL } from '@shared/helpers.js';
import { toast, cerrarModal, abrirModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { checklistDiasHtml, formatearHorarioSemanal } from '@shared/horarioDias.js';
import { getSupervisorDeCodigo, serviciosDeSupervisor } from '@modules/servicios_supervisor/index.js';

// Estado del checklist de días/horario del modal (los onchange inline
// escriben en scope global, mismo patrón que puestosObjTemp en legacy.js).
let horarioPedidoTemp = { dias: {}, horarioDesde: '', horarioHasta: '', tipoHorario: 'fijo' };
window.horarioPedidoTemp = horarioPedidoTemp;

// id del pedido en edición (null = alta nueva).
let _pedidoEditId = null;

// Tema 11 del relevamiento (10/08): un supervisor solo ve pedidos de SUS
// servicios activos, no los de toda la cooperativa. Mismo criterio que ya
// usa Liquidación de horas para "esSupervisor" (renderGrillasLiq en
// legacy.js): matchea por nombre de supervisor o por función, y también
// por si tiene algún legajo activo en ese servicio (cubre pedidos cuyo
// campo "servicio" coincide con uno de los suyos aunque el nombre de
// supervisor cargado no coincida exacto).
function pedidosVisiblesParaUsuario(lista) {
  if (currentUser?.perfil !== 'Supervisor') return lista;
  return lista.filter(p =>
    p.supervisor === currentUser.nombre ||
    p.supervisor === currentUser.funcion ||
    (DB.legajos || []).some(l => l.servicio === p.servicio && l.supervisor === currentUser.nombre)
  );
}

// ========== RENDER ==========

export function renderPedidos(lista) {
  const datos = pedidosVisiblesParaUsuario(lista || DB.pedidos);
  $('tbody-pedidos').innerHTML = datos.map(p => `<tr onclick="verDetallePedido(${p.id})">
    <td style="font-size:12px;color:var(--texto-suave);">${p.fecha}</td>
    <td style="font-weight:500;">${p.supervisor}</td>
    <td style="font-weight:500;">${p.servicio}</td>
    <td>${p.zona}</td>
    <td><span class="chip">${p.puesto}</span></td>
    <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${perfilChips(p)}</td>
    <td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${formatearHorarioSemanal(p.horarioSemanal) || p.horario || '—'}</td>
    <td>${badge(p.urgencia)}</td>
    <td>${badge(p.estado)}</td>
    <td>${p.candidato ? `<div style="display:flex;align-items:center;gap:6px;">${avatarEl(p.candidato, 24)}<span style="font-size:12px;">${p.candidato}</span></div>` : '<span class="text-muted">Sin asignar</span>'}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();verDetallePedido(${p.id})">Ver</button></td>
  </tr>`).join('');
}

function perfilChips(p) {
  const perfil = p.perfil || [];
  if (!perfil.length) return '<span class="text-muted">—</span>';
  return perfil.map(x => {
    const valor = Array.isArray(x.valor) ? x.valor.join(' · ') : x.valor;
    return `<span class="chip">${nombrePerfil(x.codigo)}: ${valor}</span>`;
  }).join(' ');
}

function nombrePerfil(codigo) {
  const a = (DB.perfilPersonalAtributos || []).find(x => x.codigo === codigo);
  return a ? a.nombre : codigo;
}

// ========== DETALLE ==========

export function verDetallePedido(id) {
  const p = DB.pedidos.find(x => String(x.id) === String(id));
  if (!p) return;
  const horarioTxt = formatearHorarioSemanal(p.horarioSemanal) || p.horario || '—';
  const body = `<div class="info-grid" style="margin-bottom:16px;">
    <div class="info-item"><div class="key">Servicio / Cliente</div><div class="val">${p.servicio}</div></div>
    <div class="info-item"><div class="key">Estado</div><div class="val">${badge(p.estado)}</div></div>
    <div class="info-item"><div class="key">Supervisor</div><div class="val">${p.supervisor}</div></div>
    <div class="info-item"><div class="key">Zona</div><div class="val">${p.zona}</div></div>
    <div class="info-item"><div class="key">Puesto</div><div class="val">${p.puesto}</div></div>
    <div class="info-item"><div class="key">Horario</div><div class="val">${horarioTxt}</div></div>
    <div class="info-item"><div class="key">Urgencia</div><div class="val">${badge(p.urgencia)}</div></div>
    <div class="info-item"><div class="key">Fecha del pedido</div><div class="val">${p.fecha}</div></div>
    <div class="info-item"><div class="key">Candidato asignado</div><div class="val">${p.candidato || 'Sin asignar'}</div></div>
  </div>
  ${perfilDetalle(p)}
  <div class="form-section" style="margin-bottom:8px;">Observaciones</div>
  <p style="font-size:13px;color:var(--texto-suave);">${p.obs || 'Sin observaciones'}</p>
  <button class="btn btn-primary" style="margin-top:12px;width:100%;" onclick="abrirEdicionPedido(${p.id})">✏️ Editar pedido</button>`;
  $('pedido-title').textContent = `📋 Pedido de personal — ${p.servicio}`;
  $('pedido-body').innerHTML = body;
  abrirModal('modal-ver-pedido');
}

// Abre el modal de alta precargado con los datos del pedido, en modo
// edición (update por id_local en vez de push).
export function abrirEdicionPedido(id) {
  const p = DB.pedidos.find(x => String(x.id) === String(id));
  if (!p) return;
  _pedidoEditId = p.id;
  $('pedido-modal-title').textContent = '✏️ Editar pedido de personal';
  $('p-supervisor').value = p.supervisor || '';
  $('p-servicio').value = p.servicio || '';
  $('p-zona').value = p.zona || '';
  $('p-puesto').value = p.puesto || '';
  $('p-urgencia').value = p.urgencia || 'Medio';
  $('p-obs').value = p.obs || '';
  renderPerfilInputs(p.perfil || []);
  renderHorarioPedido(p.horarioSemanal);
  onChangeSupervisorPedido();
  abrirModal('modal-pedido');
}

function perfilDetalle(p) {
  const perfil = p.perfil || [];
  if (!perfil.length) return '';
  return `<div class="form-section" style="margin-bottom:8px;">Perfil solicitado</div>
  <div class="info-grid" style="margin-bottom:16px;">
    ${perfil.map(x => {
      const valor = Array.isArray(x.valor) ? x.valor.join(', ') : x.valor;
      return `<div class="info-item"><div class="key">${nombrePerfil(x.codigo)}</div><div class="val">${valor}</div></div>`;
    }).join('')}
  </div>`;
}

// ========== FILTROS ==========

export function filtrarPedidos() {
  const fecha = ($('cf-ped-fecha') || { value: '' }).value.toLowerCase();
  const sup = ($('cf-ped-sup') || { value: '' }).value.toLowerCase();
  const serv = ($('cf-ped-serv') || { value: '' }).value.toLowerCase();
  const zona = ($('cf-ped-zona') || { value: '' }).value;
  const puesto = ($('cf-ped-puesto') || { value: '' }).value;
  const urg = ($('cf-ped-urg') || { value: '' }).value;
  const estado = ($('cf-ped-est') || { value: '' }).value;
  const cand = ($('cf-ped-cand') || { value: '' }).value.toLowerCase();
  const bg = ($('buscador-global') || { value: '' }).value.toLowerCase();
  const horario = ($('cf-ped-hor') || { value: '' }).value.toLowerCase();
  renderPedidos(DB.pedidos.filter(p =>
    (!fecha || p.fecha.includes(fecha)) &&
    (!sup || p.supervisor.toLowerCase().includes(sup)) &&
    (!serv || p.servicio.toLowerCase().includes(serv)) &&
    (!zona || p.zona === zona) &&
    (!puesto || p.puesto === puesto) &&
    (!horario || (formatearHorarioSemanal(p.horarioSemanal) || p.horario || '').toLowerCase().includes(horario)) &&
    (!urg || p.urgencia === urg) &&
    (!estado || p.estado === estado) &&
    (!cand || (p.candidato || '').toLowerCase().includes(cand)) &&
    (!bg || p.supervisor.toLowerCase().includes(bg) || p.servicio.toLowerCase().includes(bg))
  ));
}

// ========== ALTA ==========

export function guardarPedido() {
  const s = $('p-servicio').value.trim();
  if (!s) { toast('Ingresá el servicio'); return; }
  const datos = {
    supervisor: $('p-supervisor').value,
    servicio: s,
    zona: $('p-zona').value,
    puesto: $('p-puesto').value,
    horarioSemanal: { ...horarioPedidoTemp },
    horario: formatearHorarioSemanal(horarioPedidoTemp),
    urgencia: $('p-urgencia').value,
    perfil: recolectarPerfil(),
    obs: $('p-obs').value,
  };
  if (_pedidoEditId) {
    const p = DB.pedidos.find(x => String(x.id) === String(_pedidoEditId));
    if (!p) { toast('No se encontró el pedido'); return; }
    Object.assign(p, datos);
    _pedidoEditId = null;
    cerrarModal('modal-pedido');
    renderPedidos();
    supaSync('pedidos', p);
    toast('✓ Pedido actualizado');
    return;
  }
  DB.pedidos.push({
    id: Date.now(),
    fecha: new Date().toLocaleDateString('es-AR'),
    ...datos,
    estado: 'Pendiente',
    candidato: '',
  });
  cerrarModal('modal-pedido');
  renderPedidos();
  supaSync('pedidos', DB.pedidos[DB.pedidos.length - 1]);
  toast('✓ Pedido guardado');
}

// Renderiza el checklist de días + horario dentro de #p-horario. prefill:
// objeto horarioSemanal de un pedido existente (para edición) o null.
export function renderHorarioPedido(prefill) {
  const el = $('p-horario');
  if (!el) return;
  horarioPedidoTemp = {
    dias: { ...(prefill?.dias || {}) },
    horarioDesde: prefill?.horarioDesde || '',
    horarioHasta: prefill?.horarioHasta || '',
    tipoHorario: prefill?.tipoHorario || 'fijo',
  };
  window.horarioPedidoTemp = horarioPedidoTemp;
  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
      ${checklistDiasHtml(horarioPedidoTemp.dias, (d) => `horarioPedidoTemp.dias.${d}=this.checked`)}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
      <div class="form-group"><label>Desde</label><input type="time" value="${horarioPedidoTemp.horarioDesde}" style="padding:9px 12px;" onchange="horarioPedidoTemp.horarioDesde=this.value"></div>
      <div class="form-group"><label>Hasta</label><input type="time" value="${horarioPedidoTemp.horarioHasta}" style="padding:9px 12px;" onchange="horarioPedidoTemp.horarioHasta=this.value"></div>
      <div class="form-group"><label>Tipo de horario</label>
        <select style="padding:9px 12px;" onchange="horarioPedidoTemp.tipoHorario=this.value">
          <option value="fijo" ${(horarioPedidoTemp.tipoHorario || 'fijo') === 'fijo' ? 'selected' : ''}>Fijo</option>
          <option value="rotativo" ${horarioPedidoTemp.tipoHorario === 'rotativo' ? 'selected' : ''}>Rotativo</option>
        </select>
      </div>
    </div>`;
}

// Reinicia el estado del modal para un alta nueva (botón "+ Nuevo pedido").
export function resetModalPedido() {
  _pedidoEditId = null;
  $('pedido-modal-title').textContent = 'Nuevo pedido de personal';
  renderPerfilInputs([]);
  renderHorarioPedido(null);
}

// ========== MATCHER SERVICIO ↔ SUPERVISOR (08/2026) ==========

// Al cambiar el supervisor, filtra el datalist de servicios solo con los
// de ese supervisor (objetivos Operativos + servicios_supervisor). Limpia
// el servicio elegido si quedó fuera del filtro.
export function onChangeSupervisorPedido() {
  const sup = ($('p-supervisor') || {}).value || '';
  const servicios = sup
    ? serviciosDeSupervisor(sup)
    : (window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : []);
  fillDL('dl-serv', servicios);
  const servEl = $('p-servicio');
  if (servEl && sup && servEl.value && !servicios.includes(servEl.value)) servEl.value = '';
}

// Al escribir el servicio, autocompleta el supervisor a cargo (misma
// fuente que Altas/Reasignaciones: objetivo Operativo primero, luego
// servicios_supervisor).
export function onChangeServicioPedido() {
  const codigo = ($('p-servicio') || {}).value || '';
  const supEl = $('p-supervisor');
  if (!supEl || !codigo) return;
  const sup = getSupervisorDeCodigo(codigo);
  if (sup) supEl.value = sup;
}

// ========== PERFIL DEL PERSONAL (catálogo parametrizable, v073) ==========

// Renderiza los controles del perfil solicitado dentro de #p-perfil,
// leyendo los atributos activos de DB.perfilPersonalAtributos (orden).
// prefill: array [{codigo, valor}] con los valores guardados (edición).
export function renderPerfilInputs(prefill) {
  const cont = $('p-perfil');
  if (!cont) return;
  const pref = (prefill || []);
  const valorDe = (codigo) => pref.find(x => x.codigo === codigo);
  const atrs = (DB.perfilPersonalAtributos || [])
    .filter(a => a.activo !== false)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  cont.innerHTML = atrs.map(a => {
    const opciones = a.opciones || [];
    const pv = valorDe(a.codigo);
    if (a.tipo === 'multi') {
      const marcados = Array.isArray(pv?.valor) ? pv.valor : [];
      return `<div class="form-group">
        <label>${a.nombre}</label>
        <div style="display:flex;flex-direction:column;gap:4px;padding-top:2px;">
          ${opciones.map(o => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" data-perfil="${a.codigo}" value="${o}" ${marcados.includes(o) ? 'checked' : ''}> ${o}</label>`).join('')}
        </div>
      </div>`;
    }
    if (a.tipo === 'text') {
      return `<div class="form-group"><label>${a.nombre}</label><input type="text" id="perfil-${a.codigo}" value="${pv?.valor || ''}" placeholder="${a.nombre}"></div>`;
    }
    return `<div class="form-group"><label>${a.nombre}</label>
      <select id="perfil-${a.codigo}"><option value="">—</option>
        ${opciones.map(o => `<option ${pv?.valor === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

// Recolecta los valores elegidos → array [{codigo, valor}] que se persiste
// en pedidos.perfil. 'multi' agrupa los checkbox marcados como array.
export function recolectarPerfil() {
  const perfil = [];
  const atrs = (DB.perfilPersonalAtributos || []).filter(a => a.activo !== false);
  for (const a of atrs) {
    if (a.tipo === 'multi') {
      const marcados = [...document.querySelectorAll(`#p-perfil input[data-perfil="${a.codigo}"]:checked`)].map(c => c.value);
      if (marcados.length) perfil.push({ codigo: a.codigo, valor: marcados });
    } else {
      const el = $(`perfil-${a.codigo}`);
      const v = el && el.value ? el.value.trim() : '';
      if (v) perfil.push({ codigo: a.codigo, valor: v });
    }
  }
  return perfil;
}

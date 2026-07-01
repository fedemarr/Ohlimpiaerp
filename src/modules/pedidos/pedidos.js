import { DB } from '@shared/state.js';
import { $, avatarEl, badge } from '@shared/helpers.js';
import { toast, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// ========== RENDER ==========

export function renderPedidos(lista) {
  const datos = lista || DB.pedidos;
  $('tbody-pedidos').innerHTML = datos.map(p => `<tr onclick="toast('Pedido #${p.id} — ${p.servicio}')">
    <td style="font-size:12px;color:var(--texto-suave);">${p.fecha}</td>
    <td style="font-weight:500;">${p.supervisor}</td>
    <td style="font-weight:500;">${p.servicio}</td>
    <td>${p.zona}</td>
    <td><span class="chip">${p.puesto}</span></td>
    <td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.horario}</td>
    <td>${badge(p.urgencia)}</td>
    <td>${badge(p.estado)}</td>
    <td>${p.candidato ? `<div style="display:flex;align-items:center;gap:6px;">${avatarEl(p.candidato, 24)}<span style="font-size:12px;">${p.candidato}</span></div>` : '<span class="text-muted">Sin asignar</span>'}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();toast('Ver pedido #${p.id}')">Ver</button></td>
  </tr>`).join('');
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
    (!horario || (p.horario || '').toLowerCase().includes(horario)) &&
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
  DB.pedidos.push({
    id: Date.now(),
    fecha: new Date().toLocaleDateString('es-AR'),
    supervisor: $('p-supervisor').value,
    servicio: s,
    zona: $('p-zona').value,
    puesto: $('p-puesto').value,
    horario: $('p-horario').value,
    urgencia: $('p-urgencia').value,
    estado: 'Pendiente',
    candidato: '',
    obs: $('p-obs').value,
  });
  cerrarModal('modal-pedido');
  renderPedidos();
  supaSync('pedidos', DB.pedidos[DB.pedidos.length - 1]);
  toast('✓ Pedido guardado');
}

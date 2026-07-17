// Gestión de Adelantos v1.1 — Tab "📋 Historial": todos los pedidos
// (Adelantos + Préstamos combinados), filtros amplios, export Excel.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

const ESTADO_BADGE = {
  'Borrador': 'badge-gris', 'Enviada': 'badge-acento', 'Aprobada RRHH': 'badge-azul',
  'Aprobada': 'badge-verde', 'Rechazada RRHH': 'badge-rojo', 'Rechazada Finanzas': 'badge-rojo',
  'Cancelada': 'badge-gris',
};

function todosLosPedidos() {
  const adelantos = (DB.pedidosAdelantos || []).filter(p => !p.anulado).map(p => ({
    ...p, tipo: p.origen === 'Informal' ? 'Adelanto informal' : 'Adelanto', nombreMostrar: p.nombreAsociado,
  }));
  const prestamos = (DB.prestamos || []).filter(p => !p.anulado && p.fechaPedido).map(p => ({
    ...p, tipo: 'Préstamo', monto: p.monto ?? p.montoSolicitado, nombreMostrar: p.nombre,
  }));
  return [...adelantos, ...prestamos];
}

function filaHistorial(p) {
  return `<tr>
    <td style="font-size:12px;">${p.fechaPedido}</td>
    <td style="font-size:12px;">${p.tipo}</td>
    <td style="font-weight:500;">${p.nombreMostrar}</td>
    <td style="font-size:12px;">${p.supervisorNombre}</td>
    <td style="text-align:right;">$${Number(p.monto || 0).toLocaleString('es-AR')}</td>
    <td style="font-size:12px;">${p.tipo === 'Préstamo' ? (p.cuotas ?? p.cuotasSolicitadas ?? '—') : '—'}</td>
    <td><span class="badge ${ESTADO_BADGE[p.estado] || 'badge-gris'}">${p.estado}</span></td>
    <td style="font-size:11px;">${p.aprobadoPorRrhh || '—'} / ${p.pagadoPor || '—'}</td>
    <td style="font-size:11px;">${p.motivoRechazoRrhh || p.motivoRechazoFinanzas || '—'}</td>
    <td style="font-size:12px;">${(p.fechaPago || '').slice(0, 10) || '—'}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="abrirDetallePedidoAdelanto('${p.tipo === 'Préstamo' ? 'Préstamo' : 'Adelanto'}','${p.id}')">👁</button></td>
  </tr>`;
}

export function renderHistorialGestion() {
  let filas = todosLosPedidos();

  const q = ($('gadlh-buscar') || {}).value?.toLowerCase() || '';
  const tipo = ($('gadlh-tipo') || {}).value || '';
  const estado = ($('gadlh-estado') || {}).value || '';
  const supervisor = ($('gadlh-supervisor') || {}).value?.toLowerCase() || '';
  const desde = ($('gadlh-desde') || {}).value || '';
  const hasta = ($('gadlh-hasta') || {}).value || '';
  if (q) filas = filas.filter(p => p.nombreMostrar.toLowerCase().includes(q) || String(p.nroSocio || '').includes(q));
  if (tipo) filas = filas.filter(p => p.tipo === tipo);
  if (estado) filas = filas.filter(p => p.estado === estado);
  if (supervisor) filas = filas.filter(p => (p.supervisorNombre || '').toLowerCase().includes(supervisor));
  if (desde) filas = filas.filter(p => (p.fechaPedido || '') >= desde);
  if (hasta) filas = filas.filter(p => (p.fechaPedido || '') <= hasta);
  filas.sort((a, b) => new Date(b.id) - new Date(a.id));

  const tbody = $('tbody-gadl-historial');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="11" style="text-align:center;padding:32px;opacity:.5;">Sin pedidos</td></tr>'
    : filas.map(filaHistorial).join('');
}

export function filtrarHistorialGestion() { renderHistorialGestion(); }

export async function exportarHistorialGestionExcel() {
  const filas = todosLosPedidos();
  if (!filas.length) { toast('⚠️ No hay datos para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(p => ({
    Fecha: p.fechaPedido, Tipo: p.tipo, Asociado: p.nombreMostrar, 'N° Socio': p.nroSocio,
    Supervisor: p.supervisorNombre, Monto: p.monto, Cuotas: p.cuotas ?? p.cuotasSolicitadas ?? '',
    Estado: p.estado, 'Aprobado RRHH': p.aprobadoPorRrhh || '', 'Pagado por': p.pagadoPor || '',
    'Motivo rechazo': p.motivoRechazoRrhh || p.motivoRechazoFinanzas || '', 'Fecha de pago': (p.fechaPago || '').slice(0, 10),
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Historial');
  XLSX.writeFile(libro, `adelantos_prestamos_historial_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

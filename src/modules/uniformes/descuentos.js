// Uniformes v2 — compromisos de descuento (DISENO_uniformes.md §11.4,
// §13, política A.11 §1.4). Los descuentos NO se cobran acá — solo se
// registra el compromiso en descuentos_uniforme_pendientes, para que
// Liquidaciones (todavía no migrado) los descuente de a una cuota por
// retiro.
//
// TODO (cuando Liquidaciones migre): implementar
//   marcarCuotaCobrada(idLocal) — incrementa cuotasCobradas, marca
//   estado='Terminado' cuando cuotasCobradas === cuotasTotales.
// El contrato de datos ya está armado acá, solo falta el llamador real.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { idLocalTrunc, prendasDelPedido, getPedidoById } from './flujo.js';
import { crearNotificacion } from '@shared/notificaciones.js';

function sumarMeses(fechaISO, n) {
  const d = new Date(fechaISO);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// 4 cuotas fijas — llamado desde flujo.js en la transición 8->9.
export async function crearDescuentoPendiente(pedido, montoTotal, motivoGeneracion) {
  const hoy = new Date().toISOString().slice(0, 10);
  const d = {
    id: Date.now(),
    pedidoIdLocal: idLocalTrunc(pedido.id),
    legajoIdLocal: pedido.legajoIdLocal,
    montoTotal,
    cuotasTotales: 4,
    cuotasCobradas: 0,
    montoCuota: Math.round((montoTotal / 4) * 100) / 100,
    fechaGenerado: new Date().toISOString(),
    fechaPrimeraCuota: sumarMeses(hoy, 1),
    fechaUltimaCuota: sumarMeses(hoy, 4),
    estado: 'En curso',
    motivoGeneracion,
  };
  if (!DB.descuentosUniformePendientes) DB.descuentosUniformePendientes = [];
  DB.descuentosUniformePendientes.push(d);
  await supaSync('descuentosUniformePendientes', d);
  return d;
}

// Cuota única — llamado desde flujo.js (rrhhConfirmaCierre, prenda
// faltante) y desde devoluciones.js (baja con faltante).
export async function crearDescuentoPorFaltante(pedido, prendasFaltantes) {
  const prendas = prendasDelPedido(pedido.id);
  const montoTotal = prendas
    .filter(p => prendasFaltantes.includes(p.prenda))
    .reduce((s, p) => s + (p.precioUnitarioCongelado || 0) * p.cantidad, 0);
  if (montoTotal <= 0) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  const d = {
    id: Date.now() + 1,
    pedidoIdLocal: idLocalTrunc(pedido.id),
    legajoIdLocal: pedido.legajoIdLocal,
    montoTotal,
    cuotasTotales: 1,
    cuotasCobradas: 0,
    montoCuota: montoTotal,
    fechaGenerado: new Date().toISOString(),
    fechaPrimeraCuota: sumarMeses(hoy, 1),
    fechaUltimaCuota: sumarMeses(hoy, 1),
    estado: 'En curso',
    motivoGeneracion: `Uniforme viejo faltante: ${prendasFaltantes.join(', ')}`,
  };
  if (!DB.descuentosUniformePendientes) DB.descuentosUniformePendientes = [];
  DB.descuentosUniformePendientes.push(d);
  await supaSync('descuentosUniformePendientes', d);
  return d;
}

// Descuento por incumplimiento del plazo de 15 días (14 -> 15).
export async function aplicarDescuentoIncumplimiento(idLocal, motivo, monto) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Vencido') { toast('⚠️ Este pedido no está vencido'); return; }
  if (!monto || monto <= 0) { toast('⚠️ Ingresá un monto válido'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Descuento aplicado por incumplimiento';
  p.fechaDescuentoIncumplimiento = new Date().toISOString();
  p.descuentoAplicadoPor = currentUser?.nombre || '';
  p.descuentoIncumplimientoMotivo = (motivo || '').trim();
  p.descuentoIncumplimientoMonto = monto;
  await supaSync('pedidosUniformes', p);

  const hoy = new Date().toISOString().slice(0, 10);
  const d = {
    id: Date.now() + 2,
    pedidoIdLocal: idLocalTrunc(p.id),
    legajoIdLocal: p.legajoIdLocal,
    montoTotal: monto,
    cuotasTotales: 1,
    cuotasCobradas: 0,
    montoCuota: monto,
    fechaGenerado: new Date().toISOString(),
    fechaPrimeraCuota: sumarMeses(hoy, 1),
    fechaUltimaCuota: sumarMeses(hoy, 1),
    estado: 'En curso',
    motivoGeneracion: `Incumplimiento de plazo (15 días): ${(motivo || '').trim()}`,
  };
  if (!DB.descuentosUniformePendientes) DB.descuentosUniformePendientes = [];
  DB.descuentosUniformePendientes.push(d);
  await supaSync('descuentosUniformePendientes', d);

  await crearNotificacion({ tipo: 'uniforme_descuento_incumplimiento', entidadTipo: 'uniforme', entidadIdLocal: p.id, destinatarioNombre: p.supervisorAsignado, mensaje: `⚠️ Se aplicó un descuento a ${p.nombreOperario} por no devolver constancia/uniforme viejo a tiempo.` });
  toast('💸 Descuento aplicado');
}

// ========== TAB 3 — DESCUENTOS APLICADOS ==========

export function filtrarDescuentosUniformes() { renderDescuentosUniformes(); }

export function renderDescuentosUniformes() {
  let filas = (DB.descuentosUniformePendientes || []).filter(d => !d.anulado);
  const q = ($('uni-desc-buscar') || {}).value?.toLowerCase() || '';
  const fEstado = ($('uni-desc-estado') || {}).value || '';
  const fAnio = ($('uni-desc-anio') || {}).value || '';
  if (q) {
    filas = filas.filter(d => {
      const leg = (DB.legajos || []).find(l => String(l.nro) === String(d.legajoIdLocal));
      return (leg?.nombre || '').toLowerCase().includes(q);
    });
  }
  if (fEstado) filas = filas.filter(d => d.estado === fEstado);
  if (fAnio) filas = filas.filter(d => new Date(d.fechaGenerado).getFullYear() === parseInt(fAnio));
  filas.sort((a, b) => new Date(b.fechaGenerado) - new Date(a.fechaGenerado));

  const tbody = $('tbody-uni-descuentos');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:24px;opacity:.5;">Sin descuentos registrados</td></tr>'
    : filas.map(d => {
      const leg = (DB.legajos || []).find(l => String(l.nro) === String(d.legajoIdLocal));
      return `<tr>
        <td>${leg?.nombre || '—'}</td>
        <td>${d.motivoGeneracion || '—'}</td>
        <td style="text-align:right;">$${(d.montoTotal || 0).toLocaleString('es-AR')}</td>
        <td>${d.cuotasTotales}</td>
        <td>${d.cuotasCobradas}</td>
        <td>${d.cuotasTotales - d.cuotasCobradas}</td>
        <td><span class="badge ${d.estado === 'Terminado' ? 'badge-verde' : d.estado === 'Cancelado' ? 'badge-gris' : 'badge-acento'}">${d.estado}</span></td>
        <td>${(d.fechaGenerado || '').slice(0, 10)}</td>
      </tr>`;
    }).join('');
}

export async function exportarDescuentosUniformesExcel() {
  const filas = (DB.descuentosUniformePendientes || []).filter(d => !d.anulado);
  if (!filas.length) { toast('⚠️ No hay datos para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(d => {
    const leg = (DB.legajos || []).find(l => String(l.nro) === String(d.legajoIdLocal));
    return {
      Asociado: leg?.nombre || '', Motivo: d.motivoGeneracion || '',
      'Monto total': d.montoTotal, 'Cuotas totales': d.cuotasTotales,
      'Cuotas cobradas': d.cuotasCobradas, Estado: d.estado,
      'Fecha generado': (d.fechaGenerado || '').slice(0, 10),
    };
  });
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Descuentos uniformes');
  XLSX.writeFile(libro, `descuentos_uniformes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

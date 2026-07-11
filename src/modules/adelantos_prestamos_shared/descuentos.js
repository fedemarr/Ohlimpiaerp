// Pedidos de Adelantos + Gestión de Adelantos v1.1 — hook con
// Liquidaciones (Cambio 3 del delta). Cuando Finanzas paga un pedido,
// se genera el compromiso económico acá. Liquidaciones (todavía sin
// migrar) consumirá esta tabla cuando exista.

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';

function sumarMeses(periodoYYYYMM, n) {
  const [y, m] = periodoYYYYMM.split('-').map(Number);
  const fecha = new Date(y, m - 1 + n, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

// Adelanto: 1 fila. Préstamo: N filas, una por cuota, distribuidas en
// meses consecutivos empezando por el próximo período.
export async function generarCompromisosDescuento(pedido, tipo) {
  const nombreAsociado = tipo === 'Préstamo' ? pedido.nombre : pedido.nombreAsociado;
  const base = {
    tipoOrigen: tipo,
    origenIdLocal: String(pedido.id).slice(-9),
    legajoIdLocal: pedido.legajoIdLocal, nroSocio: pedido.nroSocio, nombreAsociado,
    estado: 'Pendiente',
    cargadoPor: currentUser?.nombre || '',
  };

  if (!DB.descuentosAdelantosPendientes) DB.descuentosAdelantosPendientes = [];

  if (tipo === 'Adelanto') {
    const nuevo = {
      ...base, id: Date.now(),
      monto: Number(pedido.monto), periodoDescuento: sumarMeses(pedido.periodo, 1),
      numeroCuota: null, cuotasTotales: null,
    };
    DB.descuentosAdelantosPendientes.push(nuevo);
    await supaSync('descuentosAdelantosPendientes', nuevo);
    return [nuevo];
  }

  const cuotas = parseInt(pedido.cuotas, 10) || 1;
  const montoCuota = Number(pedido.montoCuota) || Math.round(Number(pedido.monto) / cuotas);
  const nuevas = [];
  for (let i = 1; i <= cuotas; i++) {
    const nueva = {
      ...base, id: Date.now() + i,
      monto: montoCuota, periodoDescuento: sumarMeses(pedido.periodo, i),
      numeroCuota: i, cuotasTotales: cuotas,
    };
    DB.descuentosAdelantosPendientes.push(nueva);
    nuevas.push(nueva);
  }
  for (const n of nuevas) await supaSync('descuentosAdelantosPendientes', n);
  return nuevas;
}

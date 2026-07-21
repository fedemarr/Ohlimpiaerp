// Tests de la máquina de estados de Pedidos de Adelantos/Préstamos.
// Corre sin navegador (Vitest, environment: node) — supaSync/SUPA se
// mockean para no pegarle a Supabase real; toda la lógica bajo test es
// mutación de DB en memoria + las transiciones de estado.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DB } from '@shared/state.js';
import { resetDB, setUsuarioDeTest } from '../../test/testUtils.js';

vi.mock('@shared/supabase.js', () => ({
  supaSync: vi.fn(async () => true),
  SUPA: { from: () => ({ select: () => ({ data: [], error: null }) }) },
  _toCamel: (x) => x,
  _toSnake: (x) => x,
}));

const {
  crearPedidoAdelanto, crearPedidoPrestamo, elevarPedido, aprobarRRHH, rechazarRRHH,
  pagarFinanzas, rechazarFinanzas, reAprobarTrasRechazoFinanzas, devolverASupervisorTrasRechazoFinanzas,
  cancelarPedido, getPedidoById, getPrestamoById,
} = await import('./flujo.js');

const legajo = { nro: '145', nombre: 'Test Prueba', servicio: 'Objetivo Demo' };

beforeEach(() => {
  resetDB(['pedidosAdelantos', 'prestamos', 'pedidosAdelantosEventos', 'topesAdelantosVersiones', 'descuentosAdelantosPendientes', 'notificacionesSistema']);
  setUsuarioDeTest();
});

describe('Adelanto — ciclo de vida completo', () => {
  it('nace en Borrador y va pasando de estado en cada transición', async () => {
    const p = await crearPedidoAdelanto({ legajo, monto: 50000, fechaPedido: '2026-07-01' });
    expect(p.estado).toBe('Borrador');

    await elevarPedido('Adelanto', p.id);
    expect(getPedidoById(p.id).estado).toBe('Enviada');

    await aprobarRRHH('Adelanto', p.id);
    expect(getPedidoById(p.id).estado).toBe('Aprobada RRHH');

    const r = await pagarFinanzas('Adelanto', p.id);
    expect(r.pedido.estado).toBe('Aprobada');
    expect(r.pedido.pagadoPor).toBe('Test User');
  });

  it('no deja elevar dos veces (protege contra doble click)', async () => {
    const p = await crearPedidoAdelanto({ legajo, monto: 1000, fechaPedido: '2026-07-01' });
    await elevarPedido('Adelanto', p.id);
    const r = await elevarPedido('Adelanto', p.id);
    expect(r.error).toBeTruthy();
    expect(getPedidoById(p.id).estado).toBe('Enviada');
  });

  it('no deja pagar un pedido que todavía no aprobó RRHH', async () => {
    const p = await crearPedidoAdelanto({ legajo, monto: 1000, fechaPedido: '2026-07-01' });
    await elevarPedido('Adelanto', p.id);
    const r = await pagarFinanzas('Adelanto', p.id);
    expect(r.error).toBeTruthy();
    expect(getPedidoById(p.id).estado).toBe('Enviada');
  });

  it('rechazarRRHH exige motivo y deja el pedido en Rechazada RRHH', async () => {
    const p = await crearPedidoAdelanto({ legajo, monto: 1000, fechaPedido: '2026-07-01' });
    await elevarPedido('Adelanto', p.id);

    const sinMotivo = await rechazarRRHH('Adelanto', p.id, '');
    expect(sinMotivo.error).toBeTruthy();
    expect(getPedidoById(p.id).estado).toBe('Enviada');

    const r = await rechazarRRHH('Adelanto', p.id, 'Superó el tope sin justificación');
    expect(r.pedido.estado).toBe('Rechazada RRHH');
    expect(r.pedido.motivoRechazoRrhh).toBe('Superó el tope sin justificación');
  });

  it('marca superaTope cuando el monto excede el tope vigente', async () => {
    DB.topesAdelantosVersiones.push({ id: 1, montoTope: 30000, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false });
    const p = await crearPedidoAdelanto({ legajo, monto: 50000, fechaPedido: '2026-07-01' });
    expect(p.superaTope).toBe(true);
    expect(p.topeVigenteAlPedido).toBe(30000);
  });

  it('cancelarPedido solo funciona en Borrador', async () => {
    const p = await crearPedidoAdelanto({ legajo, monto: 1000, fechaPedido: '2026-07-01' });
    await elevarPedido('Adelanto', p.id);
    const r = await cancelarPedido('Adelanto', p.id);
    expect(r.error).toBeTruthy();
  });
});

describe('Préstamo — cuotas las define RRHH, no el supervisor', () => {
  it('nace sin cuotas ni monto de cuota (el supervisor solo carga el monto)', async () => {
    const p = await crearPedidoPrestamo({ legajo, montoSolicitado: 90000, fechaPedido: '2026-07-01' });
    expect(p.cuotasSolicitadas).toBeNull();
    expect(p.montoCuotaSolicitado).toBeNull();
    expect(p.estado).toBe('Borrador');
  });

  it('BUG ENCONTRADO ESCRIBIENDO ESTE TEST: aprobarRRHH sin definir cuotas ya no produce NaN, devuelve error', async () => {
    const p = await crearPedidoPrestamo({ legajo, montoSolicitado: 90000, fechaPedido: '2026-07-01' });
    await elevarPedido('Préstamo', p.id);
    // Antes del fix: esto dejaba p.montoCuota = NaN sin avisar nada.
    const r = await aprobarRRHH('Préstamo', p.id, {});
    expect(r.error).toBeTruthy();
    expect(getPrestamoById(p.id).estado).toBe('Enviada');
    expect(getPrestamoById(p.id).montoCuota).toBeNull();
  });

  it('aprobarRRHH con cuotas y monto definidos calcula montoCuota correctamente', async () => {
    const p = await crearPedidoPrestamo({ legajo, montoSolicitado: 90000, fechaPedido: '2026-07-01' });
    await elevarPedido('Préstamo', p.id);
    const r = await aprobarRRHH('Préstamo', p.id, { cuotasAprobadas: 6, montoAprobado: 90000 });
    expect(r.error).toBeUndefined();
    expect(r.pedido.estado).toBe('Aprobada RRHH');
    expect(r.pedido.cuotas).toBe(6);
    expect(r.pedido.montoCuota).toBe(15000);
  });

  it('ciclo completo hasta Pagado, con compromisos de descuento generados por cuota', async () => {
    const p = await crearPedidoPrestamo({ legajo, montoSolicitado: 60000, fechaPedido: '2026-07-01' });
    await elevarPedido('Préstamo', p.id);
    await aprobarRRHH('Préstamo', p.id, { cuotasAprobadas: 3, montoAprobado: 60000 });
    const r = await pagarFinanzas('Préstamo', p.id);
    expect(r.pedido.estado).toBe('Aprobada');
    expect(r.pedido.fechaOtorgamiento).toBeTruthy();
    expect(DB.descuentosAdelantosPendientes.length).toBe(3);
    expect(DB.descuentosAdelantosPendientes.every(d => d.monto === 20000)).toBe(true);
  });
});

describe('Rechazo de Finanzas — dos caminos para RRHH', () => {
  async function prestamoRechazadoPorFinanzas() {
    const p = await crearPedidoPrestamo({ legajo, montoSolicitado: 90000, fechaPedido: '2026-07-01' });
    await elevarPedido('Préstamo', p.id);
    await aprobarRRHH('Préstamo', p.id, { cuotasAprobadas: 6, montoAprobado: 90000 });
    const motivo = 'Necesitamos aprobación del área contable primero';
    const r = await rechazarFinanzas('Préstamo', p.id, motivo);
    return { id: p.id, motivo, pedido: r.pedido };
  }

  it('rechazarFinanzas exige motivo y solo aplica a Aprobada RRHH', async () => {
    const { pedido } = await prestamoRechazadoPorFinanzas();
    expect(pedido.estado).toBe('Rechazada Finanzas');
    const otraVez = await rechazarFinanzas('Préstamo', pedido.id, 'motivo');
    expect(otraVez.error).toBeTruthy();
  });

  it('Camino A — RRHH ajusta el monto y reenvía a Finanzas', async () => {
    const { id } = await prestamoRechazadoPorFinanzas();
    const r = await reAprobarTrasRechazoFinanzas('Préstamo', id, { montoAprobado: 70000, cuotasAprobadas: 5 });
    expect(r.pedido.estado).toBe('Aprobada RRHH');
    expect(r.pedido.monto).toBe(70000);
    expect(r.pedido.montoCuota).toBe(14000);
  });

  it('Camino B — RRHH devuelve el pedido al supervisor con motivo obligatorio', async () => {
    const { id } = await prestamoRechazadoPorFinanzas();

    const sinMotivo = await devolverASupervisorTrasRechazoFinanzas('Préstamo', id, '');
    expect(sinMotivo.error).toBeTruthy();
    expect(getPrestamoById(id).estado).toBe('Rechazada Finanzas');

    const r = await devolverASupervisorTrasRechazoFinanzas('Préstamo', id, 'Monto muy elevado, pedir menos');
    expect(r.pedido.estado).toBe('Rechazada RRHH');
    expect(r.pedido.motivoRechazoRrhh).toBe('Monto muy elevado, pedir menos');
  });

  it('devolverASupervisorTrasRechazoFinanzas no aplica a un pedido que no pasó por Finanzas', async () => {
    const p = await crearPedidoPrestamo({ legajo, montoSolicitado: 1000, fechaPedido: '2026-07-01' });
    const r = await devolverASupervisorTrasRechazoFinanzas('Préstamo', p.id, 'motivo');
    expect(r.error).toBeTruthy();
  });
});

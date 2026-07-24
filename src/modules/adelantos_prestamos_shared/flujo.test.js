// Tests de la máquina de estados de Pedidos de Adelantos/Préstamos.
// Corre sin navegador (Vitest, environment: node) — supaSync/SUPA se
// mockean para no pegarle a Supabase real; toda la lógica bajo test es
// mutación de DB en memoria + las transiciones de estado.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  pagarFinanzas, pagarFinanzasBulk, rechazarFinanzas, reAprobarTrasRechazoFinanzas, devolverASupervisorTrasRechazoFinanzas,
  cancelarPedido, getPedidoById, getPrestamoById,
} = await import('./flujo.js');

const legajo = { nro: '145', nombre: 'Test Prueba', servicio: 'Objetivo Demo' };

beforeEach(() => {
  resetDB(['pedidosAdelantos', 'prestamos', 'pedidosAdelantosEventos', 'topesAdelantosVersiones', 'descuentosAdelantosPendientes', 'notificacionesSistema']);
  setUsuarioDeTest();
});

describe('fechaPedido por defecto — riesgo de huso horario cerca de medianoche', () => {
  afterEach(() => vi.useRealTimers());

  it('BUG ENCONTRADO: un pedido creado a las 23:30 en Argentina quedaba fechado "mañana"', async () => {
    // Esta hora del sistema corre con TZ del entorno (America/Argentina/
    // Buenos_Aires en este proyecto) — 23:30 local es exactamente la
    // franja (21:00 a medianoche) donde toISOString() ya muestra el día
    // siguiente en UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 2, 15, 23, 30, 0)); // 15/03/2027 23:30 hora local
    const p = await crearPedidoAdelanto({ legajo, monto: 1000 }); // sin fechaPedido explícito
    expect(p.fechaPedido).toBe('2027-03-15');
  });
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

describe('pagarFinanzasBulk — pago en lote, un resultado por pedido', () => {
  it('devuelve un resultado exitoso por cada pedido pagable', async () => {
    const p1 = await crearPedidoAdelanto({ legajo, monto: 1000, fechaPedido: '2026-07-01' });
    const p2 = await crearPedidoAdelanto({ legajo, monto: 2000, fechaPedido: '2026-07-01' });
    p2.id = p1.id + 1; // ver comentario en el test siguiente (colisión de Date.now())
    for (const p of [p1, p2]) { await elevarPedido('Adelanto', p.id); await aprobarRRHH('Adelanto', p.id); }

    const resultados = await pagarFinanzasBulk('Adelanto', [p1.id, p2.id]);
    expect(resultados).toHaveLength(2);
    expect(resultados.every(r => !r.error)).toBe(true);
    expect(getPedidoById(p1.id).estado).toBe('Aprobada');
    expect(getPedidoById(p2.id).estado).toBe('Aprobada');
  });

  it('BUG ENCONTRADO: si un pedido del lote ya no está pagable, su resultado trae error en vez de fallar en silencio', async () => {
    const p1 = await crearPedidoAdelanto({ legajo, monto: 1000, fechaPedido: '2026-07-01' });
    const p2 = await crearPedidoAdelanto({ legajo, monto: 2000, fechaPedido: '2026-07-01' });
    p2.id = p1.id + 1; // crearPedidoAdelanto usa Date.now() como id — dos
    // pedidos creados en el mismo milisegundo (como acá, sin awaits de
    // por medio) pueden colisionar; se fuerza que sean distintos para
    // no testear un artefacto del test en vez de la lógica real.
    for (const p of [p1, p2]) { await elevarPedido('Adelanto', p.id); await aprobarRRHH('Adelanto', p.id); }
    // Simula que otra persona de Finanzas ya pagó p2 mientras el primero
    // tenía el checkbox tildado (misma UI, otra pestaña/sesión).
    await pagarFinanzas('Adelanto', p2.id);

    const resultados = await pagarFinanzasBulk('Adelanto', [p1.id, p2.id]);
    expect(resultados[0].error).toBeUndefined();
    expect(resultados[1].error).toBeTruthy();
    // deposito.js (pagarSeleccionadosDeposito) tiene que revisar esto
    // resultado por resultado — antes lo descartaba entero y siempre
    // mostraba éxito, aunque un pedido del lote no se pagara de verdad.
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

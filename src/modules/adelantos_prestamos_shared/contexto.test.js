// Tests del panel de contexto del asociado (Revisión RRHH). Cubre en
// particular el bug de huso horario encontrado en historialPropio: el
// "período actual" (YYYY-MM) se armaba con toISOString() (UTC), lo que
// cerca de fin de mes en Argentina podía correrse un mes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DB } from '@shared/state.js';
import { resetDB, setUsuarioDeTest } from '../../test/testUtils.js';

vi.mock('@shared/supabase.js', () => ({
  supaSync: vi.fn(async () => true),
  SUPA: { from: () => ({ select: () => ({ data: [], error: null }) }) },
  _toCamel: (x) => x,
  _toSnake: (x) => x,
}));

const { construirContextoAsociado } = await import('./contexto.js');

const legajo = { nro: '145', nombre: 'Test Prueba', ingreso: '01/01/2020', funcion: 'Operario A', servicio: 'Objetivo Demo', supervisor: 'Sup Demo' };

beforeEach(() => {
  resetDB(['pedidosAdelantos', 'prestamos', 'topesAdelantosVersiones', 'configuracionAdelantosPrestamos', 'sancionesDisciplinarias', 'casosEnfermosAccidentes']);
  setUsuarioDeTest();
});
afterEach(() => vi.useRealTimers());

describe('construirContextoAsociado', () => {
  it('cuenta antigüedad, historial y arma alertas sin datos previos', () => {
    const ctx = construirContextoAsociado(legajo, null);
    expect(ctx.asociado.nombre).toBe('Test Prueba');
    expect(ctx.asociado.antiguedadAnios).toBeGreaterThan(0);
    expect(ctx.historial.aprobados).toBe(0);
    expect(ctx.alertas.some(a => a.mensaje === 'Sin observaciones')).toBe(true);
  });

  it('agrega alerta cuando el pedido en revisión supera el tope vigente', () => {
    DB.topesAdelantosVersiones.push({ id: 1, montoTope: 30000, vigenciaDesde: '2020-01-01', vigenciaHasta: null, anulado: false });
    const ctx = construirContextoAsociado(legajo, { monto: 90000 });
    expect(ctx.alertas.some(a => a.mensaje.includes('SUPERA TOPE'))).toBe(true);
    expect(ctx.alertas.find(a => a.mensaje.includes('SUPERA TOPE')).nivel).toBe('danger'); // 3x el tope
  });

  it('BUG ENCONTRADO: "pedidos este mes" contaba mal cerca de fin de mes por huso horario', () => {
    vi.useFakeTimers();
    // 31/03/2027 23:30 hora local (Argentina) — en UTC ya es 1° de
    // abril. Un pedido de este mismo momento tiene que seguir contando
    // como "de marzo", no perderse por caer en el mes equivocado.
    vi.setSystemTime(new Date(2027, 2, 31, 23, 30, 0));
    DB.pedidosAdelantos.push({
      id: 1, legajoIdLocal: '145', anulado: false, estado: 'Enviada',
      periodo: '2027-03', monto: 5000,
    });
    const ctx = construirContextoAsociado(legajo, null);
    expect(ctx.historial.pedidosEsteMes).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { matchComprobante, normalizarPeriodoLeido, construirRegistroMonotributoDesdeTramite, construirFilaPagoMes } from './comprobantes.js';

describe('normalizarPeriodoLeido', () => {
  it('convierte MM/AAAA a YYYY-MM', () => {
    expect(normalizarPeriodoLeido('09/2026')).toBe('2026-09');
    expect(normalizarPeriodoLeido('9/2026')).toBe('2026-09');
  });
  it('tolera que ya venga en YYYY-MM', () => {
    expect(normalizarPeriodoLeido('2026-09')).toBe('2026-09');
  });
  it('devuelve vacío si no matchea ningún formato', () => {
    expect(normalizarPeriodoLeido('')).toBe('');
    expect(normalizarPeriodoLeido('cualquier cosa')).toBe('');
  });
});

describe('matchComprobante', () => {
  const esperadoBase = { cuit: '27317513254', nombre: 'Acevedo Aldana Ana Bella', periodoEsperado: '2026-08', cuotaEsperada: 43941.41 };
  const leidoOk = { cuit: '27317513254', periodo: '08/2026', importe: 43941.41, fechaPago: '2026-08-16', transaccion: '1569395643', confianza: 'alta' };

  it('todo cuadra → ok', () => {
    expect(matchComprobante(leidoOk, esperadoBase)).toEqual({ ok: true });
  });

  it('CUIT con guiones matchea igual (se normaliza)', () => {
    expect(matchComprobante({ ...leidoOk, cuit: '27-31751325-4' }, esperadoBase).ok).toBe(true);
  });

  it('CUIT distinto → no matchea', () => {
    const r = matchComprobante({ ...leidoOk, cuit: '20111222339' }, esperadoBase);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/CUIT/);
  });

  it('período distinto → no matchea', () => {
    const r = matchComprobante({ ...leidoOk, periodo: '09/2026' }, esperadoBase);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/período/i);
  });

  it('importe con diferencia de centavos por redondeo NO rechaza (tolerancia $0.01)', () => {
    expect(matchComprobante({ ...leidoOk, importe: 43941.4 }, esperadoBase).ok).toBe(true);
  });

  it('importe distinto de verdad (categoría equivocada, caso real "Acevedo Justina") → en revisión', () => {
    const r = matchComprobante({ ...leidoOk, importe: 43941.41 }, { ...esperadoBase, cuotaEsperada: 49527.18 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/importe/i);
  });

  it('sin cuota esperada calculable (falta tabla vigente) → no matchea, no revienta', () => {
    const r = matchComprobante(leidoOk, { ...esperadoBase, cuotaEsperada: null });
    expect(r.ok).toBe(false);
  });

  it('CUIT no legible en el comprobante → no matchea', () => {
    const r = matchComprobante({ ...leidoOk, cuit: '' }, esperadoBase);
    expect(r.ok).toBe(false);
  });
});

describe('construirRegistroMonotributoDesdeTramite', () => {
  const tramite = {
    legajoNro: '5593', nombreAsociado: 'Sosa Emanuel', categoria: 'A', zona: 'provincia',
    condicion: 'asociado_cooperativa', iibbAporta: false, adherentesCantidad: 0, fechaInicioMt: '2026-09-01',
  };
  const legajo = { nro: 5593, nombre: 'Sosa Emanuel', cuit: '20389944556' };

  it('arma el registro con los datos del trámite y el CUIT del legajo', () => {
    const r = construirRegistroMonotributoDesdeTramite(tramite, legajo);
    expect(r.nroSocio).toBe('5593');
    expect(r.cuit).toBe('20389944556');
    expect(r.categoria).toBe('A');
    expect(r.condicion).toBe('asociado_cooperativa');
    expect(r.estado).toBe('Al día');
    expect(r.curManual).toBe(false);
    expect(r.jubilado).toBe(false);
  });

  it('nace SIEMPRE con curManual=false — la cuota se calcula, nunca se hereda un valor manual del alta', () => {
    const r = construirRegistroMonotributoDesdeTramite(tramite, legajo);
    expect(r.cur).toBe(0);
  });
});

describe('construirFilaPagoMes', () => {
  const persona = { nroSocio: '5593', nombre: 'Sosa Emanuel', categoria: 'A', condicion: 'comun' };
  const desglose = { imp: 5585.77, sipa: 18246.86, os: 25694.55, iibb: 0, total: 49527.18 };

  it('resultado ok → pagado true, con auditoría de quién/cuándo', () => {
    const fila = construirFilaPagoMes({ persona, periodo: '2026-09', desglose, datosLeidos: { transaccion: 'T1', importe: 49527.18, fechaPago: '2026-09-05' }, comprobantePath: 'p', resultado: { ok: true } });
    expect(fila.pagado).toBe(true);
    expect(fila.enRevision).toBe(false);
    expect(fila.metodoPago).toBe('Comprobante');
    expect(fila.total).toBe(49527.18);
  });

  it('resultado no ok → en revisión, NADA se tilda pagado', () => {
    const fila = construirFilaPagoMes({ persona, periodo: '2026-09', desglose, datosLeidos: { transaccion: 'T1', importe: 1, fechaPago: '2026-09-05' }, comprobantePath: 'p', resultado: { ok: false, motivo: 'no cuadra' } });
    expect(fila.pagado).toBe(false);
    expect(fila.enRevision).toBe(true);
    expect(fila.enRevisionMotivo).toBe('no cuadra');
    expect(fila.pagadoEn).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { valorHoraPactado, mesDeInicio, planificarSemillas } from './valor_hora_inicio.js';

const suc = [
  { id: 's-zylsa', cliente_id: 'c1', codigo_objetivo: 'Zylsa', tipo_servicio: 'Limpieza' },
  { id: 's-hora', cliente_id: 'c2', codigo_objetivo: 'GYM.NUEVO', tipo_servicio: 'Limpieza' },
  { id: 's-viejo', cliente_id: 'c3', codigo_objetivo: 'VIEJO', tipo_servicio: 'Limpieza' },
];
const zylsa = { codigo: 'Zylsa', modelo_precio: 'Abono mensual fijo', valor: 924000, efts: 88, valor_hora: 0, fecha_inicio: '2026-09-16' };

describe('valorHoraPactado', () => {
  it('abono mensual fijo: deriva mensual / horas (Zylsa 924000 / 88)', () => {
    expect(valorHoraPactado(zylsa)).toBe(10500);
  });
  it('por EFT / horas variables: usa valor_hora', () => {
    expect(valorHoraPactado({ modelo_precio: 'Por EFT', valor_hora: 9733.61 })).toBe(9733.61);
    expect(valorHoraPactado({ modelo_precio: 'Por horas variables', valor_hora: '10600' })).toBe(10600);
  });
  it('sin dato suficiente devuelve null (no inventa un valor)', () => {
    expect(valorHoraPactado({ modelo_precio: 'Abono mensual fijo', valor: 500000, efts: null })).toBeNull();
    expect(valorHoraPactado({ modelo_precio: 'Por EFT', valor_hora: 0 })).toBeNull();
    expect(valorHoraPactado({ modelo_precio: 'Por EFT', valor_hora: null })).toBeNull();
  });
});

describe('mesDeInicio', () => {
  it('acepta ISO y D/M/AAAA', () => {
    expect(mesDeInicio('2026-09-16')).toBe('2026-09-01');
    expect(mesDeInicio('6/9/2026')).toBe('2026-09-01');
    expect(mesDeInicio('16/09/2026')).toBe('2026-09-01');
  });
  it('vacío o inválido → null', () => {
    expect(mesDeInicio('')).toBeNull();
    expect(mesDeInicio(null)).toBeNull();
    expect(mesDeInicio('septiembre')).toBeNull();
  });
});

describe('planificarSemillas', () => {
  const base = { suc, precios: [], mesActual: '2026-09-01' };

  it('Zylsa: siembra septiembre 2026 a $10.500 como negociado (mes en curso)', () => {
    const { filas, sinValorHora } = planificarSemillas({ ...base, objetivos: [zylsa] });
    expect(sinValorHora).toEqual([]);
    expect(filas).toEqual([{
      sucursal_id: 's-zylsa', codigo_objetivo: 'Zylsa', cliente_id: 'c1', mes: '2026-09-01',
      precio_hora: 10500, tipo: 'negociado', tipo_precio: 'hora', tipo_servicio: 'Limpieza', fuente: 'manual',
    }]);
  });

  it('inicio en un mes pasado: queda como real y en ESE mes', () => {
    const o = { codigo: 'GYM.NUEVO', modelo_precio: 'Por horas variables', valor_hora: 10600, fecha_inicio: '2026-02-01' };
    const { filas } = planificarSemillas({ ...base, objetivos: [o] });
    expect(filas).toHaveLength(1);
    expect(filas[0].mes).toBe('2026-02-01');
    expect(filas[0].tipo).toBe('real');
  });

  it('inicio en un mes futuro: negociado', () => {
    const o = { codigo: 'GYM.NUEVO', modelo_precio: 'Por EFT', valor_hora: 10000, fecha_inicio: '2026-11-03' };
    expect(planificarSemillas({ ...base, objetivos: [o] }).filas[0]).toMatchObject({ mes: '2026-11-01', tipo: 'negociado' });
  });

  it('sin valor hora: no siembra y lo informa (advertencia, no bloqueo)', () => {
    const o = { codigo: 'GYM.NUEVO', modelo_precio: 'Por EFT', valor_hora: 0, fecha_inicio: '2026-09-10' };
    const r = planificarSemillas({ ...base, objetivos: [o] });
    expect(r.filas).toEqual([]);
    expect(r.sinValorHora).toEqual([{ codigo: 'GYM.NUEVO', mes: '2026-09-01' }]);
  });

  it('no duplica: sucursal que ya tiene precios (aunque sea de otro mes) no se toca', () => {
    const r = planificarSemillas({ ...base, objetivos: [zylsa], precios: [{ sucursal_id: 's-zylsa', mes: '2026-09-01' }] });
    expect(r.filas).toEqual([]);
    const r2 = planificarSemillas({ ...base, objetivos: [zylsa], precios: [{ sucursal_id: 's-zylsa', mes: '2026-12-01' }] });
    expect(r2.filas).toEqual([]);
  });

  it('idempotente: correrlo de nuevo con lo sembrado no genera nada', () => {
    const { filas } = planificarSemillas({ ...base, objetivos: [zylsa] });
    expect(planificarSemillas({ ...base, objetivos: [zylsa], precios: filas }).filas).toEqual([]);
  });

  it('servicios sin sucursal o sin fecha de inicio se ignoran', () => {
    const sinSuc = { codigo: 'NO.EXISTE', modelo_precio: 'Por EFT', valor_hora: 9000, fecha_inicio: '2026-09-01' };
    const sinFecha = { codigo: 'GYM.NUEVO', modelo_precio: 'Por EFT', valor_hora: 9000, fecha_inicio: null };
    const r = planificarSemillas({ ...base, objetivos: [sinSuc, sinFecha] });
    expect(r).toEqual({ filas: [], sinValorHora: [] });
  });

  it('servicios con historia de precios (VIEJO) conviven con uno nuevo: solo el nuevo se siembra', () => {
    const viejo = { codigo: 'VIEJO', modelo_precio: 'Por EFT', valor_hora: 8000, fecha_inicio: '2025-03-01' };
    const r = planificarSemillas({ ...base, objetivos: [viejo, zylsa], precios: [{ sucursal_id: 's-viejo', mes: '2026-01-01' }] });
    expect(r.filas.map((f) => f.codigo_objetivo)).toEqual(['Zylsa']);
  });
});

// Tests de saldo.js — el propio módulo (y vacaciones.js) ya documentan
// que parsear fechas ISO sin hora explícita corre .getDay()/.getFullYear()
// por el huso horario (Argentina = UTC-3). Estos tests verifican si ese
// riesgo, ya resuelto en otras partes del código, sigue vivo acá.

import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '@shared/state.js';
import { resetDB } from '../../test/testUtils.js';
import {
  diasTomadosEnAnio, diasEnProcesoEnAnio, diasDisponibles, calcularAntiguedad,
  calcularDiasAsignadosPorAntiguedad, tieneSuperposicion,
} from './saldo.js';

beforeEach(() => {
  resetDB(['vacaciones', 'legajos']);
});

describe('calcularDiasAsignadosPorAntiguedad — escala oficial', () => {
  const legajoConAntiguedad = (años) => {
    const ingreso = new Date();
    ingreso.setFullYear(ingreso.getFullYear() - años);
    const dd = String(ingreso.getDate()).padStart(2, '0');
    const mm = String(ingreso.getMonth() + 1).padStart(2, '0');
    return { nro: '1', ingreso: `${dd}/${mm}/${ingreso.getFullYear()}` };
  };

  it('respeta el override manual (dias_vacaciones_anuales) por sobre la escala', () => {
    const l = { ...legajoConAntiguedad(1), diasVacacionesAnuales: 99 };
    expect(calcularDiasAsignadosPorAntiguedad(l)).toBe(99);
  });

  it('escala: 14 días hasta 5 años, 21 hasta 10, 28 hasta 20, 35 en adelante', () => {
    expect(calcularDiasAsignadosPorAntiguedad(legajoConAntiguedad(3))).toBe(14);
    expect(calcularDiasAsignadosPorAntiguedad(legajoConAntiguedad(7))).toBe(21);
    expect(calcularDiasAsignadosPorAntiguedad(legajoConAntiguedad(15))).toBe(28);
    expect(calcularDiasAsignadosPorAntiguedad(legajoConAntiguedad(25))).toBe(35);
  });

  it('menos de 6 meses: proporcional a días trabajados / 20', () => {
    // Fecha de referencia fija (no "hoy") para que el test no dependa
    // de en qué momento del año se corra: ingresó el 1/11, se mide al
    // 31/12 del mismo año -> 2 meses, bien por debajo del umbral de 0.5 años.
    const l = { nro: '1', ingreso: '01/11/2027' };
    const dias = calcularDiasAsignadosPorAntiguedad(l, new Date(2027, 11, 31));
    expect(dias).toBeGreaterThan(0);
    expect(dias).toBeLessThan(14);
  });
});

describe('Conteo de días por año — riesgo de huso horario en el límite del año', () => {
  it('una vacación que arranca el 1° de enero cuenta para ESE año, no para el anterior', () => {
    DB.vacaciones.push({
      legajoIdLocal: '1', estado: 'Aprobada', anulado: false,
      fechaDesde: '2027-01-01', fechaHasta: '2027-01-10', diasSolicitados: 10,
    });
    // Con new Date('2027-01-01') interpretado como UTC medianoche, en
    // Argentina (UTC-3) .getFullYear() puede devolver 2026 en vez de
    // 2027 — si este test falla, es EXACTAMENTE el bug de huso horario
    // que el propio proyecto ya documentó y arregló en otro lado
    // (vacaciones.js: "parsear con hora explícita").
    expect(diasTomadosEnAnio('1', 2027)).toBe(10);
    expect(diasTomadosEnAnio('1', 2026)).toBe(0);
  });

  it('una vacación en proceso que arranca el 1° de enero cuenta para ESE año', () => {
    DB.vacaciones.push({
      legajoIdLocal: '1', estado: 'Pendiente aprobación Gerente', anulado: false,
      fechaDesde: '2027-01-01', fechaHasta: '2027-01-05', diasSolicitados: 5,
    });
    expect(diasEnProcesoEnAnio('1', 2027)).toBe(5);
  });

  it('diasDisponibles resta lo tomado y lo en proceso del año correcto', () => {
    const legajo = { nro: '1', ingreso: '01/01/2020', diasVacacionesAnuales: 21 };
    DB.vacaciones.push(
      { legajoIdLocal: '1', estado: 'Aprobada', anulado: false, fechaDesde: '2027-02-01', fechaHasta: '2027-02-05', diasSolicitados: 5 },
      { legajoIdLocal: '1', estado: 'Pendiente aprobación Gerente', anulado: false, fechaDesde: '2027-06-01', fechaHasta: '2027-06-03', diasSolicitados: 3 },
    );
    expect(diasDisponibles(legajo, 2027)).toBe(21 - 5 - 3);
  });
});

describe('tieneSuperposicion', () => {
  it('detecta solapamiento de fechas con una vacación Aprobada', () => {
    DB.vacaciones.push({ legajoIdLocal: '2', estado: 'Aprobada', anulado: false, fechaDesde: '2027-03-10', fechaHasta: '2027-03-20' });
    expect(tieneSuperposicion('2', '2027-03-15', '2027-03-25')).toBe(true);
    expect(tieneSuperposicion('2', '2027-04-01', '2027-04-10')).toBe(false);
  });

  it('ignora vacaciones anuladas o rechazadas al chequear superposición', () => {
    DB.vacaciones.push({ legajoIdLocal: '2', estado: 'Rechazada por Gerente', anulado: false, fechaDesde: '2027-03-10', fechaHasta: '2027-03-20' });
    expect(tieneSuperposicion('2', '2027-03-15', '2027-03-18')).toBe(false);
  });
});

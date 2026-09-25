import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '@shared/state.js';
import {
  horasEntreHHMM, trabajaEseDia, horasPuestoMes, horasPuestosMes, horasPuestosDia,
  composicionMes, mesAnterior, mesSiguiente, rangoMeses, mesDeFechaArg,
} from './calculo.js';

// Septiembre 2026 no tiene feriados (verificado contra el mockup del
// ticket); octubre 2026 tiene el feriado del 12/10 (lunes) — mismo
// ejemplo que usa GESTION_HORAS_para_Fede.md: "8 hs L a V sin feriados da
// 176 en septiembre (22 hábiles) y 168 en octubre (21 hábiles)".
beforeEach(() => {
  DB.feriados = [{ fecha: '2026-10-12', nombre: 'Día del Respeto a la Diversidad Cultural', tipo: 'trasladable' }];
});

describe('horasEntreHHMM', () => {
  it('calcula la duración del turno', () => {
    expect(horasEntreHHMM('08:00', '14:00')).toBe(6);
    expect(horasEntreHHMM('06:00', '22:00')).toBe(16);
  });
  it('turno que cruza medianoche suma 24hs', () => {
    expect(horasEntreHHMM('22:00', '06:00')).toBe(8);
  });
  it('sin horario da 0, no inventa un valor', () => {
    expect(horasEntreHHMM('', '')).toBe(0);
    expect(horasEntreHHMM(null, '10:00')).toBe(0);
  });
});

describe('trabajaEseDia', () => {
  const lunesAviernes = { dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } };
  const franquera = { dias: { sabados: true, domingos: true, feriados: true } };
  it('respeta el día de semana del puesto', () => {
    expect(trabajaEseDia(lunesAviernes, 1, false)).toBe(true); // lunes
    expect(trabajaEseDia(lunesAviernes, 6, false)).toBe(false); // sábado
  });
  it('un feriado en día regular resta si el puesto NO tiene Fer', () => {
    expect(trabajaEseDia(lunesAviernes, 1, true)).toBe(false);
  });
  it('un feriado en día regular NO resta si el puesto tiene Fer', () => {
    const conFer = { dias: { ...lunesAviernes.dias, feriados: true } };
    expect(trabajaEseDia(conFer, 1, true)).toBe(true);
  });
  it('un feriado en un día que el puesto no trabaja no importa (ni llega a mirar Fer)', () => {
    expect(trabajaEseDia(franquera, 1, true)).toBe(false); // lunes no es su día
  });
});

describe('horasPuestoMes — caso real del documento', () => {
  const puestoLaV = { cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } };
  it('8 hs L a V sin feriados: 176 en septiembre 2026 (22 hábiles)', () => {
    expect(horasPuestoMes(puestoLaV, '2026-09')).toBe(176);
  });
  it('8 hs L a V sin feriados: 168 en octubre 2026 (21 hábiles, resta el feriado del 12)', () => {
    expect(horasPuestoMes(puestoLaV, '2026-10')).toBe(168);
  });
  it('el mismo puesto con Fer no pierde el feriado', () => {
    const conFer = { ...puestoLaV, dias: { ...puestoLaV.dias, feriados: true } };
    expect(horasPuestoMes(conFer, '2026-10')).toBe(176);
  });
  it('cantidad multiplica', () => {
    expect(horasPuestoMes({ ...puestoLaV, cantidad: 3 }, '2026-09')).toBe(528);
  });
});

describe('horasPuestosDia — GRILLAS_PROYECTADO_GESTION_HORAS_para_Fede.md Bug 1', () => {
  const puestoLaV = { cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } };
  it('un día que trabaja da la jornada real (no un total dividido)', () => {
    expect(horasPuestosDia([puestoLaV], '2026-10-05')).toBe(8); // lunes 5/10/2026
  });
  it('un día que no trabaja da 0', () => {
    expect(horasPuestosDia([puestoLaV], '2026-10-03')).toBe(0); // sábado
  });
  it('el feriado del 12/10 da 0 para el puesto sin Fer (la jornada real, no una fracción)', () => {
    expect(horasPuestosDia([puestoLaV], '2026-10-12')).toBe(0); // lunes feriado
  });
  it('con Fer, el feriado se trabaja igual', () => {
    const conFer = { ...puestoLaV, dias: { ...puestoLaV.dias, feriados: true } };
    expect(horasPuestosDia([conFer], '2026-10-12')).toBe(8);
  });
  it('suma varios puestos del mismo día', () => {
    const finde = { cantidad: 1, horarioDesde: '06:00', horarioHasta: '18:00', dias: { sabados: true } };
    expect(horasPuestosDia([puestoLaV, finde], '2026-10-03')).toBe(12); // solo el de finde trabaja el sábado
  });
});

describe('horasPuestosMes', () => {
  it('suma varios puestos', () => {
    const puestos = [
      { cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } },
      { cantidad: 1, horarioDesde: '06:00', horarioHasta: '18:00', dias: { sabados: true, domingos: true, feriados: true } },
    ];
    // franquera: sáb+dom de 12hs cada uno, sept 2026 tiene 4 sábados y 4 domingos... se valida contra el total, no un número mágico
    const total = horasPuestosMes(puestos, '2026-09');
    expect(total).toBeGreaterThan(176); // al menos lo del puesto L-V
  });
  it('array vacío da 0', () => {
    expect(horasPuestosMes([], '2026-09')).toBe(0);
  });
});

describe('composicionMes', () => {
  it('septiembre 2026: 22 hábiles, 0 feriados', () => {
    expect(composicionMes('2026-09')).toEqual({ habiles: 22, feriados: 0 });
  });
  it('octubre 2026: 21 hábiles (el 12 es feriado), 1 feriado', () => {
    expect(composicionMes('2026-10')).toEqual({ habiles: 21, feriados: 1 });
  });
});

describe('navegación de meses', () => {
  it('mesAnterior/mesSiguiente cruzan el año', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSiguiente('2026-12')).toBe('2027-01');
  });
  it('rangoMeses genera N meses consecutivos', () => {
    expect(rangoMeses('2026-07', 4)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });
});

describe('mesDeFechaArg', () => {
  it('DD/MM/AAAA a YYYY-MM', () => {
    expect(mesDeFechaArg('16/09/2026')).toBe('2026-09');
    expect(mesDeFechaArg('01/01/2027')).toBe('2027-01');
  });
  it('sin fecha da null', () => {
    expect(mesDeFechaArg('')).toBeNull();
    expect(mesDeFechaArg(null)).toBeNull();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '@shared/state.js';
import {
  esOperarioEnAlcance, operariosActivos, estadoOperario, movimientosDelMes,
  serviciosConDotacionIncompleta,
} from './dotacion.js';

// DOTACION_para_Fede.md: "solo operarios con sus categorías" — administrativos
// (legajo.servicio === 'ADMINISTRATIVO') y supervisores (por nombre, no hay
// vínculo por id) quedan afuera del tablero.
beforeEach(() => {
  DB.legajos = [];
  DB.supervisores = ['Dario Lage'];
  DB.categoriasBase = [{ id: '1', codigo: 'OPA', nombre: 'Operario A', activa: true, anulado: false }];
  DB.padronCategoriasAsociado = [];
  DB.casosEnfermosAccidentes = [];
  DB.descansos = [];
  DB.vacaciones = [];
  DB.objetivos = [];
  DB.prepedidos = [];
  DB.pedidos = [];
  DB.reasignaciones = [];
  DB.horasVigencias = [];
  DB.feriados = [];
});

describe('esOperarioEnAlcance', () => {
  it('un operario activo entra', () => {
    expect(esOperarioEnAlcance({ estado: 'Activo', servicio: 'CIBRA', nombre: 'Juan Perez' })).toBe(true);
  });
  it('un administrativo NO entra (legajo.servicio === ADMINISTRATIVO)', () => {
    expect(esOperarioEnAlcance({ estado: 'Activo', servicio: 'ADMINISTRATIVO', nombre: 'Ana Ruiz' })).toBe(false);
  });
  it('un supervisor (por nombre) NO entra', () => {
    expect(esOperarioEnAlcance({ estado: 'Activo', servicio: 'CIBRA', nombre: 'Dario Lage' })).toBe(false);
  });
  it('un legajo de baja NO entra', () => {
    expect(esOperarioEnAlcance({ estado: 'Baja', servicio: 'CIBRA', nombre: 'Juan Perez' })).toBe(false);
  });
});

describe('estadoOperario', () => {
  it('con servicio cargado y sin licencia → T (trabajando)', () => {
    expect(estadoOperario({ nro: 1, servicio: 'CIBRA' }).tipo).toBe('T');
  });
  it('sin servicio y sin licencia → S (sin servicio / banca)', () => {
    expect(estadoOperario({ nro: 2, servicio: '' }).tipo).toBe('S');
  });
  it('con caso ABIERTO en Enfermos y accidentes → A, gana aunque tenga servicio', () => {
    DB.casosEnfermosAccidentes = [{ nroSocio: '3', estado: 'Abierto', fechaInicio: '12/09/2026', anulado: false }];
    const est = estadoOperario({ nro: 3, servicio: 'CIBRA' });
    expect(est.tipo).toBe('A');
    expect(est.origen).toBe('Enfermos y accidentes');
    expect(est.desde).toBe('12/09/2026');
  });
  it('con descanso Aprobado vigente hoy → A', () => {
    const hoy = new Date();
    const desde = new Date(hoy); desde.setDate(desde.getDate() - 1);
    const hasta = new Date(hoy); hasta.setDate(hasta.getDate() + 1);
    DB.descansos = [{ nroSocio: '4', estado: 'Aprobado', fechaDesde: desde.toISOString().slice(0, 10), fechaHasta: hasta.toISOString().slice(0, 10), anulado: false }];
    const est = estadoOperario({ nro: 4, servicio: 'CIBRA' });
    expect(est.tipo).toBe('A');
    expect(est.origen).toBe('Descansos');
  });
  it('un descanso Aprobado ya vencido NO cuenta como vigente hoy', () => {
    DB.descansos = [{ nroSocio: '5', estado: 'Aprobado', fechaDesde: '2020-01-01', fechaHasta: '2020-01-14', anulado: false }];
    expect(estadoOperario({ nro: 5, servicio: 'CIBRA' }).tipo).toBe('T');
  });
});

describe('operariosActivos', () => {
  it('filtra activos, excluye administrativos y supervisores', () => {
    DB.legajos = [
      { nro: 1, estado: 'Activo', servicio: 'CIBRA', nombre: 'Juan Perez' },
      { nro: 2, estado: 'Activo', servicio: 'ADMINISTRATIVO', nombre: 'Ana Ruiz' },
      { nro: 3, estado: 'Activo', servicio: 'CIBRA', nombre: 'Dario Lage' },
      { nro: 4, estado: 'Baja', servicio: 'CIBRA', nombre: 'Ex Empleado' },
    ];
    const activos = operariosActivos();
    expect(activos.map(l => l.nro)).toEqual([1]);
  });
});

describe('movimientosDelMes', () => {
  it('cuenta altas (ISO) y bajas (DD/MM/AAAA) del mes pedido', () => {
    DB.legajos = [
      { nro: 1, estado: 'Activo', fechaIngresoPrueba: '2026-09-05' },
      { nro: 2, estado: 'Activo', fechaIngresoPrueba: '2026-09-20' },
      { nro: 3, estado: 'Activo', fechaIngresoPrueba: '2026-08-01' },
      { nro: 4, estado: 'Baja', fechaBaja: '10/09/2026' },
    ];
    const mov = movimientosDelMes('2026-09');
    expect(mov.altas).toBe(2);
    expect(mov.bajas).toBe(1);
  });
});

describe('serviciosConDotacionIncompleta', () => {
  it('un objetivo con una vacante pendiente aparece con su PRE-N', () => {
    DB.objetivos = [{ id: 1234567890, codigo: 'LOS.PINOS', estado: 'Operativo', anulado: false, localidad: 'Tigre' }];
    DB.prepedidos = [{ id: 1, objetivoIdLocal: '234567890', numero: 1, anulado: false, vacantes: [{}, {}] }];
    const incompletos = serviciosConDotacionIncompleta();
    expect(incompletos.length).toBe(1);
    expect(incompletos[0].o.codigo).toBe('LOS.PINOS');
    expect(incompletos[0].refTxt).toContain('PRE-1');
  });
  it('un objetivo totalmente cubierto no aparece', () => {
    DB.objetivos = [{ id: 1234567891, codigo: 'CUBIERTO', estado: 'Operativo', anulado: false }];
    DB.prepedidos = [];
    expect(serviciosConDotacionIncompleta()).toEqual([]);
  });
});

// Tests de las consultas puras de Categorías — en particular la lógica
// de prioridad "valor específico de servicio vs. valor general de la
// categoría" (v1.1, migración a valores por categoría×mes) que tiene
// que seguir funcionando igual para no romper a Enfermos y Accidentes,
// el único consumidor real del modelo viejo por servicio.

import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '@shared/state.js';
import { resetDB } from '../../test/testUtils.js';
import {
  getCategoriaById, obtenerValorHoraVigente, obtenerValorPlusVigente, calcularValorEfectivo,
} from './consultas.js';

beforeEach(() => {
  resetDB(['categoriasBase', 'valoresHoraCategoria', 'valoresPlus']);
});

describe('getCategoriaById', () => {
  it('matchea por id truncado a 9 dígitos, en cualquier dirección', () => {
    DB.categoriasBase.push({ id: '1234567890123', nombre: 'Operario A', anulado: false });
    expect(getCategoriaById('1234567890123')?.nombre).toBe('Operario A');
    // los últimos 9 dígitos del id completo también matchean (mismo id_local
    // que quedaría persistido tras un reload, ver idLocalTrunc)
    expect(getCategoriaById('567890123')?.nombre).toBe('Operario A');
  });

  it('ignora categorías anuladas', () => {
    DB.categoriasBase.push({ id: '1', nombre: 'Vieja', anulado: true });
    expect(getCategoriaById('1')).toBeNull();
  });
});

describe('obtenerValorHoraVigente — coexistencia categoría×mes (general) y categoría×servicio (histórico)', () => {
  it('un valor general (servicioNombre null) se devuelve sin importar qué servicio se consulte', () => {
    DB.valoresHoraCategoria.push({ id: 1, categoriaIdLocal: '1', servicioNombre: null, valorHora: 5000, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false });
    expect(obtenerValorHoraVigente('1', 'Cualquier Servicio', '2026-07-01')?.valorHora).toBe(5000);
    expect(obtenerValorHoraVigente('1', null, '2026-07-01')?.valorHora).toBe(5000);
  });

  it('un valor específico de servicio le gana al general cuando ambos están vigentes (protege a Enfermos y Accidentes)', () => {
    DB.valoresHoraCategoria.push(
      { id: 1, categoriaIdLocal: '1', servicioNombre: null, valorHora: 5000, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false },
      { id: 2, categoriaIdLocal: '1', servicioNombre: 'Hospital Alemán', valorHora: 5800, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false },
    );
    expect(obtenerValorHoraVigente('1', 'Hospital Alemán', '2026-07-01')?.valorHora).toBe(5800);
    // otro servicio sin dato específico propio cae al general
    expect(obtenerValorHoraVigente('1', 'Otro Cliente', '2026-07-01')?.valorHora).toBe(5000);
  });

  it('un valor específico de OTRO servicio no se filtra a una consulta distinta ni a la general', () => {
    DB.valoresHoraCategoria.push({ id: 1, categoriaIdLocal: '1', servicioNombre: 'Hospital Alemán', valorHora: 5800, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false });
    expect(obtenerValorHoraVigente('1', 'Otro Cliente', '2026-07-01')).toBeNull();
    expect(obtenerValorHoraVigente('1', null, '2026-07-01')).toBeNull();
  });

  it('respeta la vigencia (fecha fuera de rango no matchea)', () => {
    DB.valoresHoraCategoria.push({ id: 1, categoriaIdLocal: '1', servicioNombre: null, valorHora: 5000, vigenciaDesde: '2026-06-01', vigenciaHasta: '2026-06-30', anulado: false });
    expect(obtenerValorHoraVigente('1', null, '2026-05-15')).toBeNull();
    expect(obtenerValorHoraVigente('1', null, '2026-06-15')?.valorHora).toBe(5000);
    expect(obtenerValorHoraVigente('1', null, '2026-07-15')).toBeNull();
  });

  it('nunca devuelve un valor anulado', () => {
    DB.valoresHoraCategoria.push({ id: 1, categoriaIdLocal: '1', servicioNombre: null, valorHora: 5000, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: true });
    expect(obtenerValorHoraVigente('1', null, '2026-07-01')).toBeNull();
  });
});

describe('calcularValorEfectivo', () => {
  it('devuelve null (nunca 0) si no hay valor base vigente', () => {
    expect(calcularValorEfectivo('1', null, [], '2026-07-01')).toBeNull();
  });

  it('suma los plus vigentes y lista los que no tienen valor cargado', () => {
    DB.valoresHoraCategoria.push({ id: 1, categoriaIdLocal: '1', servicioNombre: null, valorHora: 5000, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false });
    DB.valoresPlus.push({ id: 10, plusIdLocal: 'p1', valorAdicional: 300, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false });

    const r = calcularValorEfectivo('1', null, ['p1', 'p2-sin-valor'], '2026-07-01');
    expect(r.valorBase).toBe(5000);
    expect(r.plusTotal).toBe(300);
    expect(r.valorEfectivo).toBe(5300);
    expect(r.referenciasIds.plusAplicados).toHaveLength(1);
    expect(r.referenciasIds.plusSinValor).toEqual(['p2-sin-valor']);
  });
});

describe('obtenerValorPlusVigente', () => {
  it('elige la versión más reciente cuando hay varias vigentes por error de carga', () => {
    DB.valoresPlus.push(
      { id: 1, plusIdLocal: 'p1', valorAdicional: 100, vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false },
      { id: 2, plusIdLocal: 'p1', valorAdicional: 200, vigenciaDesde: '2026-06-01', vigenciaHasta: null, anulado: false },
    );
    expect(obtenerValorPlusVigente('p1', '2026-07-01')?.valorAdicional).toBe(200);
  });
});

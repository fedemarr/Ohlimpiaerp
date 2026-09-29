import { describe, it, expect } from 'vitest';
import { pasaLaBarreraDeTests, calcularEstadoSiguiente, aplicarCallback, puedeReintentar } from './estados.js';

describe('pasaLaBarreraDeTests', () => {
  it('0 tests corridos es fallo aunque testsOk venga true (innegociable #2)', () => {
    expect(pasaLaBarreraDeTests({ testsOk: true, testsCorridos: 0 })).toBe(false);
  });
  it('testsCorridos ausente (undefined) también es fallo', () => {
    expect(pasaLaBarreraDeTests({ testsOk: true })).toBe(false);
  });
  it('testsOk false con tests corridos también es fallo', () => {
    expect(pasaLaBarreraDeTests({ testsOk: false, testsCorridos: 12 })).toBe(false);
  });
  it('testsOk true con tests corridos > 0 pasa', () => {
    expect(pasaLaBarreraDeTests({ testsOk: true, testsCorridos: 12 })).toBe(true);
  });
});

describe('calcularEstadoSiguiente', () => {
  it('sin migración y verde -> TESTS_OK (Fase 1, sin CI real que deploye)', () => {
    expect(calcularEstadoSiguiente({ testsOk: true, testsCorridos: 5, tieneMigracion: false })).toBe('TESTS_OK');
  });
  it('sin migración, verde y deployedByAgent -> DEPLOYADO', () => {
    expect(calcularEstadoSiguiente({ testsOk: true, testsCorridos: 5, tieneMigracion: false, deployedByAgent: true })).toBe('DEPLOYADO');
  });
  it('con migración y tests verdes -> ESPERANDO_APROBACION_SQL, no deploya solo', () => {
    expect(calcularEstadoSiguiente({ testsOk: true, testsCorridos: 5, tieneMigracion: true, deployedByAgent: true })).toBe('ESPERANDO_APROBACION_SQL');
  });
  it('tests en rojo -> TESTS_FALLARON, incluso con migración', () => {
    expect(calcularEstadoSiguiente({ testsOk: false, testsCorridos: 5, tieneMigracion: true })).toBe('TESTS_FALLARON');
  });
  it('0 tests corridos -> TESTS_FALLARON, incluso "verde"', () => {
    expect(calcularEstadoSiguiente({ testsOk: true, testsCorridos: 0, tieneMigracion: false })).toBe('TESTS_FALLARON');
  });
});

describe('aplicarCallback', () => {
  const corridaBase = { id: 1, estado: 'EN_PROCESO', intentos: 0, archivosTocados: [] };

  it('caso verde sin migración: guarda resumen/testsCorridos y pasa a TESTS_OK', () => {
    const r = aplicarCallback(corridaBase, {
      testsOk: true, testsCorridos: 8, tieneMigracion: false,
      resumen: 'Se corrigió el texto del botón', queProbar: 'Entrar a Legajos y mirar el botón',
      archivosTocados: ['src/legacy.js'], branch: 'agente/ticket-1', prUrl: 'https://github.com/x/y/pull/1', prNumber: 1,
    });
    expect(r.estado).toBe('TESTS_OK');
    expect(r.testsCorridos).toBe(8);
    expect(r.resumen).toContain('botón');
    expect(r.error).toBeNull();
    expect(r.prUrl).toBe('https://github.com/x/y/pull/1');
  });

  it('caso con migración: guarda el SQL y pasa a ESPERANDO_APROBACION_SQL', () => {
    const r = aplicarCallback(corridaBase, {
      testsOk: true, testsCorridos: 8, tieneMigracion: true,
      sqlMigracion: 'ALTER TABLE x ADD COLUMN y text;', migracionReversible: true,
      migracionFilasAfectadasEstimado: '0 (columna nueva)',
    });
    expect(r.estado).toBe('ESPERANDO_APROBACION_SQL');
    expect(r.sqlMigracion).toContain('ALTER TABLE');
    expect(r.migracionReversible).toBe(true);
  });

  it('caso tests en rojo: no guarda migración aunque el payload diga que hay, y setea error + finalizadaEn', () => {
    const r = aplicarCallback(corridaBase, {
      testsOk: false, testsCorridos: 3, tieneMigracion: true, sqlMigracion: 'DROP TABLE x;',
      error: 'Falló el test de liquidación de horas',
    });
    expect(r.estado).toBe('TESTS_FALLARON');
    expect(r.sqlMigracion).toBeNull();
    expect(r.error).toBe('Falló el test de liquidación de horas');
    expect(r.finalizadaEn).not.toBeNull();
  });

  it('no muta el objeto original', () => {
    const original = { ...corridaBase };
    aplicarCallback(corridaBase, { testsOk: true, testsCorridos: 5, tieneMigracion: false });
    expect(corridaBase).toEqual(original);
  });
});

describe('puedeReintentar', () => {
  it('con 0 o 1 intento puede reintentar (tope 2)', () => {
    expect(puedeReintentar({ intentos: 0 })).toBe(true);
    expect(puedeReintentar({ intentos: 1 })).toBe(true);
  });
  it('con 2 intentos ya no puede reintentar', () => {
    expect(puedeReintentar({ intentos: 2 })).toBe(false);
  });
});

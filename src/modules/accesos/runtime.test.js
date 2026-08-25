// Tests del runtime de la Matriz de Accesos (v098).
// La promesa central del modelo: efectivo = override usuario ?? plantilla
// perfil ?? fallback PERFILES.modulos — y los módulos fuera de la matriz
// NUNCA cambian de comportamiento aunque el perfil tenga filas en la tabla.

import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '@shared/state.js';
import { resetDB } from '../../test/testUtils.js';
import {
  nivelAcceso, puedeVer, puedeModificar, siguienteNivel,
  plantillaPerfil, overridesUsuario, enMatriz, perfilCubiertoPorMatriz,
  modulosEfectivos,
} from './runtime.js';

beforeEach(() => {
  resetDB(['perfilAccesos', 'usuarioAccesos']);
});

describe('siguienteNivel — ciclo M → L → —', () => {
  it('2→1→0→2', () => {
    expect(siguienteNivel(2)).toBe(1);
    expect(siguienteNivel(1)).toBe(0);
    expect(siguienteNivel(0)).toBe(2);
  });
});

describe('nivelAcceso — precedencia override > plantilla > fallback', () => {
  const seed = () => {
    DB.perfilAccesos = [
      { perfil: 'RRHH', moduloKey: 'liquidacion', nivel: 1 },
      { perfil: 'RRHH', moduloKey: 'monotributos', nivel: 2 },
      { perfil: 'Finanzas', moduloKey: 'reasignaciones', nivel: 0 },
    ];
    DB.usuarioAccesos = [
      { usuarioId: 'uuid-1', moduloKey: 'liquidacion', nivel: 2 },
      // override con nivel igual a la plantilla (caso raro pero válido)
      { usuarioId: 'uuid-2', moduloKey: 'monotributos', nivel: 2 },
    ];
  };

  it('usa el override del usuario si existe', () => {
    seed();
    // plantilla RRHH dice L(1), el usuario uuid-1 tiene M(2)
    expect(nivelAcceso('liquidacion', 'RRHH', 'uuid-1')).toBe(2);
  });

  it('sin override, usa la plantilla del perfil', () => {
    seed();
    expect(nivelAcceso('liquidacion', 'RRHH', 'uuid-2')).toBe(1);
    expect(nivelAcceso('monotributos', 'RRHH')).toBe(2);
  });

  it('nivel 0 explícito en la matriz oculta el módulo aunque PERFILES lo incluya', () => {
    seed();
    // Finanzas.modulos NO incluye reasignaciones hoy, pero la planilla
    // podría cambiar: lo importante es que 0 manda sobre cualquier cosa.
    DB.perfilAccesos.push({ perfil: 'RRHH', moduloKey: 'clientes', nivel: 0 });
    // RRHH.modulos tampoco incluye clientes — probamos con uno que SÍ está:
    DB.perfilAccesos.push({ perfil: 'Operaciones', moduloKey: 'vacaciones', nivel: 0 });
    // Operaciones.modulos incluye vacaciones → el fallback diría 2; la matriz gana.
    expect(nivelAcceso('vacaciones', 'Operaciones')).toBe(0);
  });

  it('módulo cubierto por la matriz sin fila para ese perfil → fallback PERFILES', () => {
    seed(); // no hay fila Finanzas/liquidacion
    expect(nivelAcceso('liquidacion', 'Finanzas')).toBe(2); // está en Finanzas.modulos
    expect(nivelAcceso('liquidacion', 'Comercial')).toBe(0); // no está
  });

  it('módulo FUERA de la matriz ignora overrides y plantillas — rige PERFILES', () => {
    seed();
    // candidatos no está en la planilla; un override huérfano no debe aplicarse
    DB.usuarioAccesos.push({ usuarioId: 'uuid-1', moduloKey: 'candidatos', nivel: 2 });
    expect(nivelAcceso('candidatos', 'RRHH', 'uuid-1')).toBe(2); // por PERFILES
    DB.perfilAccesos.push({ perfil: 'RRHH', moduloKey: 'candidatos', nivel: 0 });
    expect(nivelAcceso('candidatos', 'RRHH', 'uuid-1')).toBe(2); // sigue por PERFILES
    expect(nivelAcceso('candidatos', 'Supervisor', 'uuid-1')).toBe(0); // Supervisor no lo tiene
  });
});

describe('puedeVer / puedeModificar', () => {
  beforeEach(() => {
    DB.perfilAccesos = [{ perfil: 'RRHH', moduloKey: 'configuracion', nivel: 1 }];
  });

  it('inicio siempre visible', () => {
    expect(puedeVer('inicio', 'RRHH')).toBe(true);
  });

  it('L permite ver pero no modificar', () => {
    expect(puedeVer('configuracion', 'RRHH')).toBe(true);
    expect(puedeModificar('configuracion', 'RRHH')).toBe(false);
    expect(nivelAcceso('configuracion', 'RRHH')).toBe(1);
  });

  it('nivel 0 ni siquiera deja ver', () => {
    DB.perfilAccesos.push({ perfil: 'RRHH', moduloKey: 'crm', nivel: 0 });
    expect(puedeVer('crm', 'RRHH')).toBe(false);
  });
});

describe('helpers de vista', () => {
  it('plantillaPerfil y overridesUsuario solo traen lo suyo', () => {
    DB.perfilAccesos = [
      { perfil: 'RRHH', moduloKey: 'legajos', nivel: 2 },
      { perfil: 'Finanzas', moduloKey: 'cobros', nivel: 2 },
    ];
    DB.usuarioAccesos = [
      { usuarioId: 'a', moduloKey: 'legajos', nivel: 0 },
      { usuarioId: 'b', moduloKey: 'cobros', nivel: 1 },
    ];
    expect([...plantillaPerfil('RRHH').entries()]).toEqual([['legajos', 2]]);
    expect([...overridesUsuario('b').entries()]).toEqual([['cobros', 1]]);
    expect(overridesUsuario(null).size).toBe(0);
  });

  it('enMatriz y perfilCubiertoPorMatriz', () => {
    expect(enMatriz('liquidacion')).toBe(true);
    expect(enMatriz('candidatos')).toBe(false);
    DB.perfilAccesos = [{ perfil: 'DEVELOPER', moduloKey: 'legajos', nivel: 2 }];
    expect(perfilCubiertoPorMatriz('DEVELOPER')).toBe(true);
    expect(perfilCubiertoPorMatriz('Asociado')).toBe(false);
  });
});

describe('modulosEfectivos — REGLAS #1 y #4 (módulos dinámicos, default —)', () => {
  it('incluye toda la planilla en orden, sin duplicados', () => {
    const mods = modulosEfectivos();
    const keys = mods.map(m => m.key);
    expect(keys[0]).toBe('liq_admin'); // primer módulo de la planilla
    expect(new Set(keys).size).toBe(keys.length); // sin duplicados
    expect(mods.find(m => m.key === 'futuro_seguros')).toBeTruthy(); // futuros incluidos
  });

  it('agrega módulos del menú que no están en la planilla, bajo área OTROS', () => {
    const mods = modulosEfectivos();
    const candidatos = mods.find(m => m.key === 'candidatos');
    // candidatos está en el menú pero NO en la hoja MATRIZ PERFILES
    expect(candidatos).toBeTruthy();
    expect(candidatos.area).toBe('OTROS');
  });

  it('un módulo fuera de planilla y del perfil queda en nivel 0 — default —', () => {
    // Caso real de "módulo nuevo": key visible en la grilla (área OTROS)
    // pero que ningún fallback cubre salvo su dueño. mis_adelantos solo
    // vive en PERFILES.Asociado.
    const otros = modulosEfectivos().filter(m => m.area === 'OTROS').map(m => m.key);
    expect(otros.length).toBeGreaterThan(0);
    expect(nivelAcceso('mis_adelantos', 'RRHH')).toBe(0);
    expect(nivelAcceso('mis_adelantos', 'Asociado')).toBe(2); // su dueño sí
  });
});

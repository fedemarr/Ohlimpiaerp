import { describe, it, expect } from 'vitest';
import { _toSnake, _toCamel } from './supabase.js';
import src from './supabase.js?raw';

// Bug real (Altas de asociados): "Could not find the 'claveFiscal' column of
// 'legajos'". El diccionario de _toSnake es un object literal, y una clave
// repetida se PISA en silencio: una segunda `claveFiscal: 'claveFiscal'`
// (agregada en v097) anulaba a `claveFiscal: 'clave_fiscal'`, y el alta de
// cualquier legajo se rechazaba en PostgREST.
describe('mapeo camelCase ↔ snake_case', () => {
  it('claveFiscal viaja como clave_fiscal y vuelve como claveFiscal', () => {
    expect(_toSnake({ claveFiscal: 'abc' })).toEqual({ clave_fiscal: 'abc' });
    expect(_toCamel({ clave_fiscal: 'abc' })).toEqual({ claveFiscal: 'abc' });
  });

  it('ninguna clave de _toSnake/_toCamel está repetida con un valor distinto (la última pisaría a la primera)', () => {
    for (const fn of ['_toSnake', '_toCamel']) {
      const ini = src.indexOf('export function ' + fn);
      const fin = src.indexOf('\n}', ini);
      const visto = new Map();
      const conflictos = [];
      for (const m of src.slice(ini, fin).matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([^']*)'/g)) {
        if (visto.has(m[1]) && visto.get(m[1]) !== m[2]) conflictos.push(`${m[1]}: '${visto.get(m[1])}' vs '${m[2]}'`);
        else visto.set(m[1], m[2]);
      }
      expect(conflictos, `${fn} tiene claves duplicadas con valores distintos`).toEqual([]);
    }
  });
});

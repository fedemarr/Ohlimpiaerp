import { describe, it, expect } from 'vitest';
import { nombreClaveComparacion } from './helpers.js';

// Caso real "Luque Balmaceda" (22/09): candidatos guarda apellido/nombre por
// separado ("Balmaceda" + "Marcelo Daniel Luque", con un tab colado) y
// legajos guarda todo junto y en otro orden ("Luque Balmaceda Marcelo
// Daniel") — sin esta normalización, dos altas de la misma persona no se
// detectaban como "parecidas" entre Altas y Legajos.
describe('nombreClaveComparacion', () => {
  it('el caso real: mismo resultado sin importar el orden ni los espacios/tabs de más', () => {
    const deCandidatos = nombreClaveComparacion('Balmaceda \t' + ' ' + 'Marcelo Daniel Luque');
    const deLegajo = nombreClaveComparacion('Luque Balmaceda Marcelo Daniel');
    expect(deCandidatos).toBe(deLegajo);
    expect(deCandidatos).toBe('balmaceda daniel luque marcelo');
  });

  it('ignora may/min y acentos', () => {
    expect(nombreClaveComparacion('José María Pérez')).toBe(nombreClaveComparacion('JOSE MARIA PEREZ'));
  });

  it('nombres distintos dan claves distintas', () => {
    expect(nombreClaveComparacion('Juan Pérez')).not.toBe(nombreClaveComparacion('Juan Gómez'));
  });

  it('vacío o null no explota', () => {
    expect(nombreClaveComparacion('')).toBe('');
    expect(nombreClaveComparacion(null)).toBe('');
    expect(nombreClaveComparacion(undefined)).toBe('');
  });
});

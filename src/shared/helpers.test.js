// Ticket "Ver legajo abre a otra persona" (Riveros Bastias Carolina /
// Luque Balmaceda Marcelo): un DNI mal cargado matcheaba por casualidad
// con el DNI real de otra persona ya en Legajos, y el look-up "por DNI"
// abría ese legajo ajeno sin ningún aviso. personasComparables() es la
// señal de seguridad: ¿comparten al menos una palabra significativa?
import { describe, it, expect } from 'vitest';
import { personasComparables } from './helpers.js';

describe('personasComparables', () => {
  it('caso real del ticket: nombres sin ninguna palabra en común → false', () => {
    expect(personasComparables('Luque Balmaceda Marcelo Daniel', 'Riveros Bastias Carolina Del Valle')).toBe(false);
  });
  it('misma persona, mismo orden → true', () => {
    expect(personasComparables('Perez Juan', 'Perez Juan')).toBe(true);
  });
  it('mismo apellido, distinto orden de nombre/apellido entre módulos → true', () => {
    expect(personasComparables('Luque Balmaceda Marcelo Daniel', 'Marcelo Daniel Luque Balmaceda')).toBe(true);
  });
  it('comparte solo el apellido → true (sigue siendo una señal razonable, no exige el nombre completo)', () => {
    expect(personasComparables('Gonzalez Ana', 'Gonzalez Maria')).toBe(true);
  });
  it('acentos no rompen la comparación', () => {
    expect(personasComparables('María José Pérez', 'Maria Jose Perez')).toBe(true);
  });
  it('sin nombre para comparar de un lado no bloquea (no hay suficiente info para acusar nada)', () => {
    expect(personasComparables('', 'Perez Juan')).toBe(true);
    expect(personasComparables(null, undefined)).toBe(true);
  });
  it('un conector de 2 letras compartido ("de") no cuenta como coincidencia', () => {
    // Sin el filtro de longitud, "de" solo alcanzaría para dar un falso
    // positivo entre dos personas sin ningún apellido/nombre en común.
    expect(personasComparables('Juan de Vries', 'Ana de Souza')).toBe(false);
  });
});

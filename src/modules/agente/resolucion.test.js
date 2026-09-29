import { describe, it, expect } from 'vitest';
import { generarResolucion } from './resolucion.js';

describe('generarResolucion', () => {
  it('arma el formato de las 3 secciones con el resumen del agente', () => {
    const ticket = { id: 47, titulo: 'El botón no anda', descripcion: 'El botón de guardar no responde en Legajos', modulo: 'legajos' };
    const corrida = { resumen: 'Se corrigió el onclick del botón guardar.', queProbar: 'Entrar a Legajos, abrir un legajo y tocar Guardar.' };
    const texto = generarResolucion(ticket, corrida);
    expect(texto).toContain('✅ Ticket #47 — Resuelto y publicado');
    expect(texto).toContain('Qué pasaba:');
    expect(texto).toContain('El botón de guardar no responde en Legajos');
    expect(texto).toContain('Qué se hizo:');
    expect(texto).toContain('Se corrigió el onclick del botón guardar.');
    expect(texto).toContain('Qué probar:');
    expect(texto).toContain('Entrar a Legajos, abrir un legajo y tocar Guardar.');
  });

  it('sin queProbar explícito, arma uno genérico a partir del módulo', () => {
    const ticket = { id: 12, titulo: 'x', descripcion: 'x', modulo: 'candidatos' };
    const corrida = { resumen: 'Listo' };
    expect(generarResolucion(ticket, corrida)).toContain('candidatos');
  });

  it('sin descripcion usa el titulo para "Qué pasaba"', () => {
    const ticket = { id: 3, titulo: 'Título nomás', modulo: 'x' };
    const corrida = { resumen: 'y', queProbar: 'z' };
    expect(generarResolucion(ticket, corrida)).toContain('Título nomás');
  });
});

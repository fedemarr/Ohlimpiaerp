import { describe, it, expect } from 'vitest';
import { clasificarRiesgoTicket, puedeEnviarseAlAgente, motivoBloqueoRiesgo } from './riesgo.js';

const CONFIG = {
  modulosRojos: ['liquidacion', 'monotributo', 'cuentas_cbu', 'retenciones', 'supervision', 'migraciones', 'accesos', 'configuracion'],
  palabrasRojo: ['migración', 'liquidación', 'monotributo'],
  palabrasAmarillo: ['cálculo', 'validación', 'regla'],
};

describe('clasificarRiesgoTicket', () => {
  it('marca rojo si el módulo está en la lista de módulos rojos', () => {
    const t = { titulo: 'Arreglar un texto', descripcion: '', modulo: 'monotributo' };
    expect(clasificarRiesgoTicket(t, CONFIG)).toBe('rojo');
  });

  it('marca rojo si el título contiene una palabra clave de riesgo, aunque el módulo no esté en la lista', () => {
    const t = { titulo: 'Falta correr una migración en objetivos', descripcion: '', modulo: 'comercial' };
    expect(clasificarRiesgoTicket(t, CONFIG)).toBe('rojo');
  });

  it('el chequeo de módulo/palabra es case-insensitive', () => {
    const t = { titulo: 'Bug en MONOTRIBUTO', descripcion: '', modulo: 'Comercial' };
    expect(clasificarRiesgoTicket(t, CONFIG)).toBe('rojo');
  });

  it('marca amarillo si contiene una palabra de negocio no crítica', () => {
    const t = { titulo: 'La validación del formulario deja pasar un DNI vacío', descripcion: '', modulo: 'candidatos' };
    expect(clasificarRiesgoTicket(t, CONFIG)).toBe('amarillo');
  });

  it('marca verde para texto/estilos sin ninguna palabra clave', () => {
    const t = { titulo: 'El botón queda mal alineado en celular', descripcion: 'Se superpone con el texto', modulo: 'candidatos' };
    expect(clasificarRiesgoTicket(t, CONFIG)).toBe('verde');
  });

  it('rojo gana sobre amarillo si el texto tiene ambos tipos de palabra', () => {
    const t = { titulo: 'La validación de la liquidación está mal', descripcion: '', modulo: 'comercial' };
    expect(clasificarRiesgoTicket(t, CONFIG)).toBe('rojo');
  });

  it('sin config (undefined) no explota y da verde por default', () => {
    const t = { titulo: 'Algo', descripcion: '', modulo: 'x' };
    expect(clasificarRiesgoTicket(t, undefined)).toBe('verde');
  });

  it('ticket sin modulo ni descripcion no explota', () => {
    const t = { titulo: 'Sin más datos' };
    expect(clasificarRiesgoTicket(t, CONFIG)).toBe('verde');
  });
});

describe('puedeEnviarseAlAgente', () => {
  it('rojo no se puede enviar', () => { expect(puedeEnviarseAlAgente('rojo')).toBe(false); });
  it('amarillo sí se puede enviar', () => { expect(puedeEnviarseAlAgente('amarillo')).toBe(true); });
  it('verde sí se puede enviar', () => { expect(puedeEnviarseAlAgente('verde')).toBe(true); });
});

describe('motivoBloqueoRiesgo', () => {
  it('explica el módulo rojo', () => {
    const t = { titulo: 'x', modulo: 'liquidacion' };
    expect(motivoBloqueoRiesgo(t, CONFIG)).toMatch(/liquidacion/i);
  });
  it('explica la palabra clave si no es por módulo', () => {
    const t = { titulo: 'Hay que correr una migración', modulo: 'comercial' };
    expect(motivoBloqueoRiesgo(t, CONFIG)).toMatch(/migración/i);
  });
});

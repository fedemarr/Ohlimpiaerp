// v167 (tickets #193/#194) — la regresión que cubrían estos tests: los
// catálogos de Configuración eran arrays en memoria y los botones
// "Agregar"/"Eliminar" no llamaban a supaSync, así que lo agregado se perdía
// al refrescar. Estos tests fijan el comportamiento nuevo: hidratar desde
// `config_listas`, agregar/escribir, y eliminar con soft delete.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DB } from '@shared/state.js';
import { resetDB } from '../../test/testUtils.js';

// SUPA queda mockeado antes de importar el módulo: el módulo hace
// `SUPA.from(TABLA).insert(...)` al nivel de llamada, no al importar.
const selectSingle = vi.fn();
const updateEq = vi.fn();
const updatePayload = vi.fn();
const insert = vi.fn();
const selectFila = vi.fn();

vi.mock('@shared/supabase.js', () => ({
  SUPA: {
    from: () => ({
      insert: () => ({ select: () => ({ single: selectSingle }) }),
      update: (payload) => { updatePayload(payload); return { eq: updateEq }; },
      select: () => ({ eq: selectFila }),
    }),
  },
}));

const { hidratarListas, agregarValor, eliminarValor } = await import('./config_listas.js');
const { CATALOGO_LISTAS } = await import('./catalogo.js');

beforeEach(() => {
  resetDB(['configListas']);
  selectSingle.mockReset();
  updateEq.mockReset();
  updatePayload.mockReset();
  insert.mockReset();
  selectFila.mockReset();
  updateEq.mockResolvedValue({ error: null });
  // DB es un singleton compartido: sin rehidratar, el array plano de una
  // prueba se le escapa a la siguiente (el mismo bug de "datos que se
  // pegan entre pantallas" documentado en test/testUtils.js).
  hidratarListas();
});

const fila = (clave, valor, orden, extra = {}) => ({
  id_local: `x${clave}${orden}`, clave, valor, orden, anulado: false, color: null, ...extra,
});

describe('hidratarListas', () => {
  it('pisa DB[clave] con lo persistido, ordenado por `orden`', () => {
    DB.configListas = [
      fila('tiposCliente', 'Banco', 2),
      fila('tiposCliente', 'Coworking', 1),
    ];
    hidratarListas();
    expect(DB.tiposCliente).toEqual(['Coworking', 'Banco']);
  });

  it('cae al default cuando la clave todavía no tiene filas', () => {
    DB.configListas = [fila('zonas', 'Zona Sur', 1)];
    hidratarListas();
    expect(DB.zonas).toEqual(['Zona Sur']);
    // Sin filas → default del catálogo, y una COPIA (no el array del
    // catálogo compartido, que si no se mutaría entre tests).
    expect(DB.categorias).toEqual(CATALOGO_LISTAS.categorias);
    expect(DB.categorias).not.toBe(CATALOGO_LISTAS.categorias);
  });

  it('ignora las filas anuladas (soft delete)', () => {
    DB.configListas = [
      fila('medios', 'WhatsApp', 1),
      { ...fila('medios', 'Instagram', 2), anulado: true },
    ];
    hidratarListas();
    expect(DB.medios).toEqual(['WhatsApp']);
  });

  it('deja las 28 claves del catálogo definidas', () => {
    DB.configListas = [];
    hidratarListas();
    for (const clave of Object.keys(CATALOGO_LISTAS)) {
      expect(Array.isArray(DB[clave]), `falta ${clave}`).toBe(true);
      expect(DB[clave].length).toBeGreaterThan(0);
    }
  });

  it('arma DB.colorEtapasCRM desde la columna color de las etapas', () => {
    DB.configListas = [
      fila('etapasCRM', 'Prospecto', 1, { color: '#111111' }),
      fila('etapasCRM', 'Contrato', 2),
    ];
    hidratarListas();
    expect(DB.etapasCRM).toEqual(['Prospecto', 'Contrato']);
    expect(DB.colorEtapasCRM['Prospecto']).toBe('#111111');
    // Sin color propio → cae al default del catálogo, no queda undefined.
    expect(DB.colorEtapasCRM['Contrato']).toBe('var(--verde)');
  });
});

describe('agregarValor', () => {
  it('escribe la fila y agrega al array plano', async () => {
    selectSingle.mockResolvedValue({ data: fila('tiposCliente', 'Coworking', 99), error: null });
    const r = await agregarValor('tiposCliente', 'Coworking');
    expect(r.ok).toBe(true);
    expect(DB.tiposCliente).toContain('Coworking');
    expect(DB.configListas).toHaveLength(1);
  });

  it('rechaza duplicado sin tocar Supabase', async () => {
    DB.configListas = [fila('tiposCliente', 'Coworking', 1)];
    const r = await agregarValor('tiposCliente', 'Coworking');
    expect(r).toEqual({ ok: false, motivo: 'duplicado' });
    expect(selectSingle).not.toHaveBeenCalled();
  });
  it('rechaza vacío y clave desconocida', async () => {
    expect(await agregarValor('tiposCliente', '   ')).toEqual({ ok: false, motivo: 'vacio' });
    expect(await agregarValor('noExiste', 'x')).toEqual({ ok: false, motivo: 'clave_desconocida' });
  });

  it('NO agrega al array si Supabase falla (el toast de éxito mentía)', async () => {
    selectSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await agregarValor('tiposCliente', 'Coworking');
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('error_supabase');
    expect(DB.tiposCliente).not.toContain('Coworking');
  });

  it('guarda el color solo en la lista que lo soporta (etapasCRM)', async () => {
    selectSingle.mockResolvedValue({ data: fila('etapasCRM', 'Demo', 7, { color: '#abcdef' }), error: null });
    await agregarValor('etapasCRM', 'Demo', '#abcdef');
    expect(DB.colorEtapasCRM['Demo']).toBe('#abcdef');
  });
});

describe('eliminarValor', () => {
  it('hace soft delete y saca el valor del array plano', async () => {
    DB.configListas = [fila('tiposCliente', 'Coworking', 1), fila('tiposCliente', 'Banco', 2)];
    DB.tiposCliente = ['Coworking', 'Banco'];
    const r = await eliminarValor('tiposCliente', 'Coworking');
    expect(r.ok).toBe(true);
    expect(updatePayload).toHaveBeenCalledWith({ anulado: true });
    expect(updateEq).toHaveBeenCalledWith('id_local', 'xtiposCliente1');
    expect(DB.tiposCliente).toEqual(['Banco']);
    expect(DB.configListas[0].anulado).toBe(true);
  });

  it('no toca nada si el valor no existe', async () => {
    DB.configListas = [];
    const r = await eliminarValor('tiposCliente', 'No existe');
    expect(r).toEqual({ ok: false, motivo: 'no_existe' });
    expect(updatePayload).not.toHaveBeenCalled();
  });

  it('deja el array intacto si Supabase falla', async () => {
    DB.configListas = [fila('tiposCliente', 'Coworking', 1)];
    DB.tiposCliente = ['Coworking'];
    updateEq.mockResolvedValue({ error: { message: 'boom' } });
    const r = await eliminarValor('tiposCliente', 'Coworking');
    expect(r.ok).toBe(false);
    expect(DB.tiposCliente).toEqual(['Coworking']);
    expect(DB.configListas[0].anulado).toBe(false);
  });

  it('limpia el color de la etapa borrada', async () => {
    DB.configListas = [fila('etapasCRM', 'Demo', 1, { color: '#abcdef' })];
    DB.etapasCRM = ['Demo'];
    DB.colorEtapasCRM = { Demo: '#abcdef' };
    await eliminarValor('etapasCRM', 'Demo');
    expect(DB.colorEtapasCRM['Demo']).toBeUndefined();
  });
});

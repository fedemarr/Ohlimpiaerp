// GESTION_HORAS_carga_directa_para_Fede.md — la matriz muestra TODOS
// los servicios operativos (tengan regla o no) y "＋ Cargar regla" crea
// la vigencia inicial de un servicio que nunca tuvo ninguna. Estos
// tests cubren la lógica pura/DB (tieneRegla, vigencias) — el render
// de la matriz (chip "⚠ sin regla", celdas "—", KPI) se prueba en
// e2e/gestion-horas-carga-directa.spec.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DB } from '@shared/state.js';

vi.mock('@shared/supabase.js', () => ({
  supaSync: vi.fn(async () => true),
  SUPA: { from: () => ({ select: () => ({ data: [], error: null }) }) },
  _toCamel: (x) => x,
  _toSnake: (x) => x,
}));

const {
  tieneRegla, vigenciaParaMes, horasServicioMes, sincronizarVigenciasHoras,
  sembrarVigenciaHorasDesdeAlta, abrirNuevaVigenciaHoras,
} = await import('./gestion_horas.js');

beforeEach(() => {
  DB.horasVigencias = [];
  DB.objetivos = [];
  DB.feriados = [];
  DB.clientes = [];
});

describe('tieneRegla', () => {
  it('false para un servicio sin ninguna vigencia', () => {
    expect(tieneRegla('SIN.REGLA')).toBe(false);
  });
  it('true en cuanto tiene al menos una vigencia (aunque no rija el mes consultado)', async () => {
    await abrirNuevaVigenciaHoras('CON.REGLA', [], '2026-01', 'Test', 'motivo', 'manual');
    expect(tieneRegla('CON.REGLA')).toBe(true);
  });
});

describe('vigenciaParaMes / horasServicioMes — sin regla vs. mes anterior a la primera vigencia', () => {
  it('sin ninguna vigencia: vigenciaParaMes da null y horasServicioMes da 0', () => {
    expect(vigenciaParaMes('SIN.REGLA', '2026-09')).toBeNull();
    expect(horasServicioMes('SIN.REGLA', '2026-09')).toBe(0);
  });

  it('con vigencia desde octubre: septiembre (anterior) también da null, no la regla', async () => {
    const puesto = { puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } };
    await abrirNuevaVigenciaHoras('OBJ.1', [puesto], '2026-10', 'Test', 'Carga inicial manual', 'manual');
    expect(vigenciaParaMes('OBJ.1', '2026-09')).toBeNull();
    expect(vigenciaParaMes('OBJ.1', '2026-10')).toBeTruthy();
  });
});

describe('sincronizarVigenciasHoras — el sembrado automático NO cambia (solo servicios con Personal necesario)', () => {
  it('un servicio operativo SIN puestos en el alta no recibe backfill (queda "sin regla" a propósito)', () => {
    DB.objetivos = [{ id: 1, codigo: 'OBJ.SIN.PUESTOS', estado: 'Operativo', anulado: false, puestos: [] }];
    sincronizarVigenciasHoras();
    expect(tieneRegla('OBJ.SIN.PUESTOS')).toBe(false);
  });

  it('un servicio operativo CON puestos en el alta sigue sembrándose solo, como antes', () => {
    DB.objetivos = [{
      id: 2, codigo: 'OBJ.CON.PUESTOS', estado: 'Operativo', anulado: false,
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true } }],
    }];
    sincronizarVigenciasHoras();
    expect(tieneRegla('OBJ.CON.PUESTOS')).toBe(true);
  });
});

describe('abrirNuevaVigenciaHoras — carga inicial manual (origen "manual")', () => {
  it('crea la primera vigencia de un servicio sin ninguna, con el origen y motivo correctos', async () => {
    const puesto = { puesto: 'Franquero', cantidad: 1, horarioDesde: '06:00', horarioHasta: '22:00', tipoHorario: 'rotativo', dias: { sabados: true, domingos: true } };
    const v = await abrirNuevaVigenciaHoras('LOS.PINOS', [puesto], '2026-06', 'Comercial Test', 'Carga inicial manual', 'manual');
    expect(v.origen).toBe('manual');
    expect(v.vigenteDesde).toBe('2026-06');
    expect(tieneRegla('LOS.PINOS')).toBe(true);
    expect(horasServicioMes('LOS.PINOS', '2026-09')).toBeGreaterThan(0);
  });
});

describe('abrirNuevaVigenciaHoras — tipo de regla', () => {
  it('con tipoRegla "fija" guarda el banco mensual y deja los puestos vacíos', async () => {
    const v = await abrirNuevaVigenciaHoras('CHANGO.SARANDI', [], '2026-01', 'Test', 'Banco mensual', 'manual', 'fija', 1118);
    expect(v.tipoRegla).toBe('fija');
    expect(v.horasFijasMes).toBe(1118);
    expect(v.puestos).toEqual([]);
  });

  it('el tipo por defecto sigue siendo calendario (compatibilidad con las llamadas viejas)', async () => {
    const puesto = { puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } };
    const v = await abrirNuevaVigenciaHoras('OBJ.2', [puesto], '2026-01', 'Test', 'm', 'manual');
    expect(v.tipoRegla).toBe('calendario');
    expect(v.horasFijasMes).toBeNull();
  });

  it('un valor de tipo que no existe cae a "calendario" en vez de romper la fila', async () => {
    const v = await abrirNuevaVigenciaHoras('OBJ.3', [], '2026-01', 'Test', 'm', 'manual', 'inventado', 50);
    expect(v.tipoRegla).toBe('calendario');
    expect(v.horasFijasMes).toBeNull();
  });

  it('horasServicioMes devuelve el banco fijo igual en un mes con feriado y en uno sin feriado', async () => {
    DB.feriados = [{ fecha: '2026-10-12', nombre: 'Feriado', tipo: 'trasladable' }];
    await abrirNuevaVigenciaHoras('CHANGO.SARANDI', [], '2026-01', 'Test', 'Banco mensual', 'manual', 'fija', 1118);
    expect(horasServicioMes('CHANGO.SARANDI', '2026-09')).toBe(1118);
    expect(horasServicioMes('CHANGO.SARANDI', '2026-10')).toBe(1118); // con feriado
  });

  it('cerrar la vigente y abrir una nueva versión el tipo de la nueva manda', async () => {
    await abrirNuevaVigenciaHoras('OBJ.4', [], '2026-01', 'Test', 'Banco', 'manual', 'fija', 1000);
    await abrirNuevaVigenciaHoras('OBJ.4', [], '2026-07', 'Test', 'Nuevo banco', 'operaciones', 'fija', 1300);
    expect(horasServicioMes('OBJ.4', '2026-06')).toBe(1000);
    expect(horasServicioMes('OBJ.4', '2026-07')).toBe(1300);
    expect(vigenciaParaMes('OBJ.4', '2026-06').vigenteHasta).toBe('2026-06');
  });
});

// Gestión de horas v2 §2: el sembrado tiene que cubrir también los servicios
// de BANCO MENSUAL, que normalmente nunca cargaron "Personal necesario" y por
// eso hasta ahora quedaban sin regla. La fuente es Modelo de precio +
// Cantidad de horas de la ficha del servicio.
describe('sincronizarVigenciasHoras — sembrado de banco mensual fijo (v2)', () => {
  it('"Por EFT" con efts > 0 siembra una vigencia fija', () => {
    DB.objetivos = [{ id: 10, codigo: 'OBJ.EFT', estado: 'Operativo', anulado: false, modeloPrecio: 'Por EFT', efts: 1118, puestos: [] }];
    sincronizarVigenciasHoras();
    expect(tieneRegla('OBJ.EFT')).toBe(true);
    expect(horasServicioMes('OBJ.EFT', '2026-09')).toBe(1118);
    const v = DB.horasVigencias[0];
    expect(v.tipoRegla).toBe('fija');
    expect(v.horasFijasMes).toBe(1118);
    expect(v.origen).toBe('backfill');
  });

  it('"Abono mensual fijo" con efts > 0 también siembra fija', () => {
    DB.objetivos = [{ id: 11, codigo: 'OBJ.ABONO', estado: 'Operativo', anulado: false, modeloPrecio: 'Abono mensual fijo', efts: 640, puestos: [] }];
    sincronizarVigenciasHoras();
    expect(horasServicioMes('OBJ.ABONO', '2026-09')).toBe(640);
    expect(DB.horasVigencias[0].tipoRegla).toBe('fija');
  });

  it('"Por horas variables" NO se siembra como fija aunque tenga efts (ahí el efts es un promedio derivado, no un banco pactado)', () => {
    // El efts de "Por horas variables" se calcula del histórico de carga real,
    // así que sembrarlo fijaría un número que nadie pactó.
    DB.objetivos = [{ id: 12, codigo: 'OBJ.VARIABLES', estado: 'Operativo', anulado: false, modeloPrecio: 'Por horas variables', efts: 800, puestos: [] }];
    sincronizarVigenciasHoras();
    expect(tieneRegla('OBJ.VARIABLES')).toBe(false);
  });

  it('"Por EFT" con efts = 0 o ausente NO siembra nada (no hay número pactado que leer)', () => {
    DB.objetivos = [
      { id: 13, codigo: 'OBJ.EFT0', estado: 'Operativo', anulado: false, modeloPrecio: 'Por EFT', efts: 0, puestos: [] },
      { id: 14, codigo: 'OBJ.EFTNULL', estado: 'Operativo', anulado: false, modeloPrecio: 'Por EFT', puestos: [] },
    ];
    sincronizarVigenciasHoras();
    expect(tieneRegla('OBJ.EFT0')).toBe(false);
    expect(tieneRegla('OBJ.EFTNULL')).toBe(false);
    expect(DB.horasVigencias).toHaveLength(0);
  });

  it('sin modelo de precio y sin puestos tampoco siembra (sigue quedando "sin regla" a propósito)', () => {
    DB.objetivos = [{ id: 15, codigo: 'OBJ.NADA', estado: 'Operativo', anulado: false, efts: 500, puestos: [] }];
    sincronizarVigenciasHoras();
    expect(tieneRegla('OBJ.NADA')).toBe(false);
  });

  it('tiene PRECEDENCIA el banco fijo sobre los puestos: si el modelo es Por EFT manda el efts', () => {
    // Chango Sarandí tenía 12 puestos cargados en la ficha vieja (176 hs/mes
    // de calendario) pero su modelo de precio es "Por EFT" con 1.118 hs.
    // Sembrar calendario ahí mostraría 176 hs en un servicio que factura
    // 1.118: el banco pactado es el que manda.
    DB.objetivos = [{
      id: 16, codigo: 'OBJ.CONFLICTO', estado: 'Operativo', anulado: false,
      modeloPrecio: 'Por EFT', efts: 1118,
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    }];
    sincronizarVigenciasHoras();
    expect(horasServicioMes('OBJ.CONFLICTO', '2026-09')).toBe(1118);
    expect(DB.horasVigencias[0].puestos).toEqual([]);
  });

  it('sin modelo de precio pero CON puestos sigue sembrando calendario (no se rompe el flujo viejo)', () => {
    DB.objetivos = [{
      id: 17, codigo: 'OBJ.LEGADO', estado: 'Operativo', anulado: false,
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    }];
    sincronizarVigenciasHoras();
    expect(DB.horasVigencias[0].tipoRegla).toBe('calendario');
    expect(horasServicioMes('OBJ.LEGADO', '2026-09')).toBeGreaterThan(0);
  });

  it('es idempotente: correrlo dos veces no duplica la vigencia', () => {
    DB.objetivos = [{ id: 18, codigo: 'OBJ.IDEMP', estado: 'Operativo', anulado: false, modeloPrecio: 'Por EFT', efts: 500, puestos: [] }];
    sincronizarVigenciasHoras();
    sincronizarVigenciasHoras();
    sincronizarVigenciasHoras();
    expect(DB.horasVigencias).toHaveLength(1);
  });

  it('a un servicio dado de baja o anulado no le siembra nada', () => {
    DB.objetivos = [
      { id: 19, codigo: 'OBJ.BAJA', estado: 'Baja', anulado: false, modeloPrecio: 'Por EFT', efts: 900, puestos: [] },
      { id: 20, codigo: 'OBJ.ANULADO', estado: 'Operativo', anulado: true, modeloPrecio: 'Por EFT', efts: 900, puestos: [] },
    ];
    sincronizarVigenciasHoras();
    expect(tieneRegla('OBJ.BAJA')).toBe(false);
    expect(tieneRegla('OBJ.ANULADO')).toBe(false);
  });
});

describe('sembrarVigenciaHorasDesdeAlta — alta de un servicio nuevo (v2)', () => {
  it('un alta "Por EFT" con efts siembra la vigencia inicial fija con origen "alta"', () => {
    const v = sembrarVigenciaHorasDesdeAlta({ codigo: 'OBJ.ALTA.EFT', modeloPrecio: 'Por EFT', efts: 1118, fechaInicio: '01/09/2026' });
    expect(v.tipoRegla).toBe('fija');
    expect(v.horasFijasMes).toBe(1118);
    expect(v.origen).toBe('alta');
    expect(v.vigenteDesde).toBe('2026-09');
    expect(v.motivo).toContain('banco mensual');
  });

  it('un alta con Personal necesario sigue sembrando calendario con origen "alta"', () => {
    const v = sembrarVigenciaHorasDesdeAlta({
      codigo: 'OBJ.ALTA.CAL', fechaInicio: '01/09/2026',
      puestos: [{ puesto: 'Operario A', cantidad: 2, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    });
    expect(v.tipoRegla).toBe('calendario');
    expect(v.origen).toBe('alta');
    expect(v.puestos).toHaveLength(1);
    expect(v.puestos[0].cantidad).toBe(2);
  });

  it('si el servicio ya tiene vigencia, no siembra otra (no duplica)', () => {
    DB.horasVigencias = [{ id: 1, objCodigo: 'OBJ.ALTA.EFT', tipoRegla: 'calendario', puestos: [], vigenteDesde: '2026-01', vigenteHasta: null }];
    expect(sembrarVigenciaHorasDesdeAlta({ codigo: 'OBJ.ALTA.EFT', modeloPrecio: 'Por EFT', efts: 1118 })).toBeNull();
    expect(DB.horasVigencias).toHaveLength(1);
  });

  it('un alta sin modelo de precio ni puestos no siembra nada (devuelve null, no una regla vacía)', () => {
    expect(sembrarVigenciaHorasDesdeAlta({ codigo: 'OBJ.ALTA.VACIA' })).toBeNull();
    expect(DB.horasVigencias).toHaveLength(0);
  });
});

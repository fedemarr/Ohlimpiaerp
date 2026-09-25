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

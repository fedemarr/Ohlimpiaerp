// Ticket #195 — "la lista de asignación de supervisores no viene del módulo
// Supervisores".
//
// DB.supervisores alimentaba ~12 selects/datalists (Pedidos, Reasignaciones,
// Descansos, Capacitaciones, Liquidación, Dotación, Accesos) con una lista
// tipeada a mano en state.js, mientras el módulo Supervisores daba de alta
// contra la tabla supervisores_config. Nunca se cruzaron: Carballo Gisela
// Soledad está en la base desde el 25/09 y no aparecía en ningún select.
//
// Estos tests fijan la derivada catálogo → DB.supervisores y sus dos
// invariantes críticas: no pisar la semilla (histórico) y no resucitar un
// supervisor borrado del catálogo.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@shared/supabase.js', () => ({
  supaSync: vi.fn(),
  supaDel: vi.fn(async () => true),
  getLastSupaSyncError: vi.fn(() => null),
}));

vi.mock('@modules/servicios_supervisor/index.js', () => ({
  nombresSupervisoresReales: () => DB.supervisores || [],
}));

const { DB, SEMILLA_SUPERVISORES } = await import('@shared/state.js');
const { hidratarSupervisores, agregarSupervisorAlCatalogo, toggleActivoSupervisor } =
  await import('./supervisores.js');

const CATALOGO_BD = [
  ...SEMILLA_SUPERVISORES.map((nombre, i) => ({ id: i + 1, nombre, activo: true })),
  { id: 99, nombre: 'Carballo Gisela Soledad', activo: true },
];

beforeEach(() => {
  // toast() de @shared/ui.js escribe en #toast y agregarSupervisorAlCatalogo
  // lee #sup-cfg-nuevo: sin estos nodos, revientan.
  document.body.innerHTML = '<div id="toast"></div><input id="sup-cfg-nuevo" value="Nuevo Supervisor">';
  DB.supervisoresConfig = CATALOGO_BD.map(s => ({ ...s }));
  DB.supervisores = [...SEMILLA_SUPERVISORES];
});

describe('hidratarSupervisores', () => {
  it('trae al supervisor que está en el catálogo pero no en la semilla', () => {
    // Este es el caso real del ticket: la lista a mano tiene 15 nombres y
    // Gisela Carballo está en la base desde el 25/09.
    expect(SEMILLA_SUPERVISORES).not.toContain('Carballo Gisela Soledad');

    hidratarSupervisores();

    expect(DB.supervisores).toContain('Carballo Gisela Soledad');
    expect(DB.supervisores).toHaveLength(SEMILLA_SUPERVISORES.length + 1);
  });

  it('no pisa la semilla si el catálogo llega vacío', () => {
    // Sin este piso, un fallo de carga de supervisores_config vaciaría
    // todos los selects de supervisor del sistema.
    DB.supervisoresConfig = [];
    hidratarSupervisores();
    expect(DB.supervisores).toEqual([...SEMILLA_SUPERVISORES].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('deduplica: un nombre que está en la semilla y en el catálogo aparece una vez', () => {
    hidratarSupervisores();
    const conDosSupervisores = DB.supervisores.filter(n => n === 'Dario Lage');
    expect(conDosSupervisores).toHaveLength(1);
  });

  it('incluye los inactivos, para no perder el histórico de sus servicios', () => {
    // Los filtros de Liquidación y Descansos leen de acá: sacar un
    // supervisor desactivado los dejaría sin forma de consultarlo.
    DB.supervisoresConfig[0].activo = false;
    hidratarSupervisores();
    expect(DB.supervisores).toContain(SEMILLA_SUPERVISORES[0]);
  });

  it('es idempotente: llamarlo dos veces da el mismo resultado', () => {
    hidratarSupervisores();
    const uno = [...DB.supervisores];
    hidratarSupervisores();
    expect(DB.supervisores).toEqual(uno);
  });

  it('devuelve qué nombres agregó, para poder avisar en el toast', () => {
    expect(hidratarSupervisores().nuevos).toEqual(['Carballo Gisela Soledad']);
  });
});

describe('altas del catálogo', () => {
  it('agregar un supervisor al catálogo lo hace disponible sin refrescar', () => {
    // El bug era visible al instante: se daba de alta y el select de al lado
    // no lo offería hasta recargar.
    document.getElementById('sup-cfg-nuevo').value = 'Nuevo Supervisor';
    hidratarSupervisores();
    expect(DB.supervisores).not.toContain('Nuevo Supervisor');

    agregarSupervisorAlCatalogo();
    hidratarSupervisores();

    expect(DB.supervisores).toContain('Nuevo Supervisor');
  });

  it('desactivar un supervisor no lo saca de los filtros de histórico', () => {
    DB.supervisoresConfig = [{ id: 7, nombre: 'Santiago Ayala', activo: true }];
    hidratarSupervisores();
    toggleActivoSupervisor('7');

    expect(DB.supervisoresConfig[0].activo).toBe(false);
    expect(DB.supervisores).toContain('Santiago Ayala');
  });
});

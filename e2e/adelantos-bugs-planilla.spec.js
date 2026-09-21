import { test, expect } from '@playwright/test';

async function loginComoSupervisor(page, nombre) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async (nombre) => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre, perfil: 'Supervisor' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  }, nombre);
}

// ADELANTOS_bugs_para_Fede.md (18/09) — bug 2 (precarga trae servicios de
// baja / asociados sin asignación vigente) y bug 3 fix 1 (idempotencia
// del botón "Confirmar y elevar", causa real de los pedidos duplicados).
// Bug 1 (barra tapando la tabla) es puramente CSS — z-index + margin
// reservado, verificado a ojo en el navegador, no tiene assert útil acá.
// Bug 3 fix 2 (aviso "ya tiene adelanto elevado" también para el MISMO
// supervisor) ya estaba resuelto de una pasada anterior — cubierto por
// e2e/adelantos-planilla-deposito.spec.js.
test('Adelantos — planilla filtra servicios de baja/sin grilla y no duplica al hacer doble click en elevar', async ({ page }) => {
  await loginComoSupervisor(page, 'SUP BUGS TEST');
  const mes = new Date().toISOString().slice(0, 7);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');

    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(
      { codigo: 'OBJ-VIGENTE', nombre: 'Servicio Vigente', supervisorAsignado: 'SUP BUGS TEST', estado: 'Operativo', anulado: false },
      // Bug 2: servicio dado de baja — su gente NO debe aparecer en la planilla.
      { codigo: 'OBJ-BAJA', nombre: 'Servicio De Baja', supervisorAsignado: 'SUP BUGS TEST', estado: 'Baja', anulado: false },
    );

    DB.legajos = DB.legajos || [];
    DB.legajos.push(
      { nro: 991301, nombre: 'BUG PLANILLA VIGENTE', dni: '30991301', estado: 'Activo', servicio: 'OBJ-VIGENTE', supervisor: 'SUP BUGS TEST', funcion: 'Operario A', cuit: '20991301006' },
      { nro: 991302, nombre: 'BUG PLANILLA DE BAJA', dni: '30991302', estado: 'Activo', servicio: 'OBJ-BAJA', supervisor: 'SUP BUGS TEST', funcion: 'Operario A', cuit: '20991302001' },
      // Bug 2 (segundo caso): servicio operativo pero SIN fila en la
      // grilla de este período (asignación no vigente) — tampoco debe
      // aparecer, aunque el legajo esté Activo.
      { nro: 991303, nombre: 'BUG PLANILLA SIN GRILLA', dni: '30991303', estado: 'Activo', servicio: 'OBJ-VIGENTE', supervisor: 'SUP BUGS TEST', funcion: 'Operario A', cuit: '20991303003' },
    );

    const dia = mes + '-05';
    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-BUGSPLA-VIGENTE', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-VIGENTE', nombre: 'Servicio Vigente', supervisor: 'SUP BUGS TEST',
      asociados: [{ nro: 991301, nombre: 'BUG PLANILLA VIGENTE', tipoHora: 'facturable', horas: { [dia]: 8 }, estadoDia: { [dia]: 'ver' } }],
    });
    // El servicio de baja SÍ tiene una grilla vieja con el asociado (así
    // se prueba que el filtro real es por servicio OPERATIVO, no por
    // ausencia de grilla).
    DB.grillasLiq.push({
      id: 'GRL-BUGSPLA-BAJA', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-BAJA', nombre: 'Servicio De Baja', supervisor: 'SUP BUGS TEST',
      asociados: [{ nro: 991302, nombre: 'BUG PLANILLA DE BAJA', tipoHora: 'facturable', horas: { [dia]: 8 } }],
    });

    window.navTo('pedidos_adelantos');
  }, mes);

  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabPedAdl('planilla'));
  await page.waitForTimeout(200);

  const tbody = page.locator('#tbody-padl-planilla');
  await expect(tbody).toContainText('BUG PLANILLA VIGENTE');
  await expect(tbody).not.toContainText('BUG PLANILLA DE BAJA');
  await expect(tbody).not.toContainText('BUG PLANILLA SIN GRILLA');

  // --- Bug 3 fix 1: doble click en "Confirmar y elevar" no duplica ---
  await page.fill('#plamonto-991301', '50000');
  await page.evaluate(() => window.recalcPlanilla(991301));
  await page.click('#btn-padl-pla-elevar');
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-padl-resumen')).toBeVisible();

  // Dos clicks pegados, como el doble click real reportado — se invocan
  // los dos handlers sin esperar el primero (mismo efecto que dos clicks
  // del mouse antes de que responda la red) en vez de usar .click() dos
  // veces sobre el mismo botón: Playwright espera "enabled" antes de cada
  // click y el propio fix (deshabilitarlo al instante) hace que el
  // segundo .click() nunca encuentre el botón habilitado y cuelgue — la
  // llamada directa reproduce la carrera real sin pelearse con eso.
  await page.evaluate(() => { window.confirmarElevarPlanilla(); window.confirmarElevarPlanilla(); });
  await page.waitForTimeout(300);

  const pedidosDelLegajo = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.pedidosAdelantos || []).filter(p => String(p.legajoIdLocal) === '991301' && p.monto === 50000);
  });
  expect(pedidosDelLegajo.length).toBe(1);
});

import { test, expect } from '@playwright/test';
import { loginComoAdmin, inyectarLegajo } from './helpers.js';

// REUBICACION_SUMA_SERVICIO_para_Fede.md + mockup_cubrir_interno_v2_2.html.
// El módulo (antes "Reasignaciones", ahora "Reubicación" solo en el texto
// visible) se parte en dos modalidades: REUBICACIÓN (deja el servicio
// actual) y SUMA DE SERVICIO (lo mantiene y agrega uno nuevo). Ambas
// modalidades comparten un solo circuito de aprobación y un solo registro
// visible en 3 lugares: el propio módulo, Rotación por asociado y la
// vacante del prepedido.

async function seedServicioDestino(page, { codigo, nombre, supervisor }) {
  await page.evaluate(({ codigo, nombre, supervisor }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.objetivos = DB.objetivos || [];
      DB.objetivos.push({
        id: Date.now(), codigo, nombre, estado: 'Operativo', anulado: false,
        supervisorAsignado: supervisor, efts: 200,
        dir: 'Calle Destino 456', localidad: 'CABA', jurisdiccion: 'CABA',
        puestos: [{ cantidad: 1, puesto: 'Operario A', horarioDesde: '14:00', horarioHasta: '18:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true } }],
      });
      DB.motivosReasignacion = ['Necesidad operativa'];
    });
  }, { codigo, nombre, supervisor });
}

async function abrirModuloYNueva(page) {
  await page.evaluate(() => window.navTo('reasignaciones'));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.abrirNuevaReasignacion());
  await page.waitForTimeout(100);
}

test('Reubicación — el menú y el título del módulo dicen "Reubicación" (solo texto visible)', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('reasignaciones'));
  await expect(page.locator('#topbar-title, .topbar h2, h2#screen-title').first()).toContainText(/Reubicaci/);
});

test('Reubicación — exige elegir modalidad antes de elevar', async ({ page }) => {
  await loginComoAdmin(page);
  const leg = await inyectarLegajo(page, { servicio: 'ORIG.SERV', supervisor: 'Sup Origen', funcion: 'Operario A' });
  await seedServicioDestino(page, { codigo: 'DEST.SERV', nombre: 'Servicio Destino', supervisor: 'Sup Destino' });
  await abrirModuloYNueva(page);

  await page.fill('#reas-asociado', `${leg.nombre} (N°${leg.nro})`);
  await page.evaluate(() => window.autocompletarReas());
  await page.fill('#reas-serv-dest', 'DEST.SERV');
  await page.evaluate(() => window.onChangeServicioDestinoReas());
  await page.selectOption('#reas-motivo', 'Necesidad operativa');
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill('#reas-fecha', manana);
  await page.fill('#reas-desc', 'Prueba e2e sin modalidad');
  await page.selectOption('#reas-originada-por', 'RRHH');
  await page.check('#reas-consultado');
  await page.fill('#reas-consultado-por', 'Supervisor E2E');

  // Sin modalidad elegida, elevar debe fallar (no debe crear el registro).
  const antes = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.reasignaciones.length);
  await page.evaluate(() => window.guardarReasignacion('Pendiente'));
  await page.waitForTimeout(150);
  const despues = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.reasignaciones.length);
  expect(despues).toBe(antes);
  await expect(page.locator('#modal-reasignacion')).toBeVisible();
});

test('Reubicación — exige "asociado consultado" antes de elevar', async ({ page }) => {
  await loginComoAdmin(page);
  const leg = await inyectarLegajo(page, { servicio: 'ORIG.SERV2', supervisor: 'Sup Origen', funcion: 'Operario A' });
  await seedServicioDestino(page, { codigo: 'DEST.SERV2', nombre: 'Servicio Destino 2', supervisor: 'Sup Destino' });
  await abrirModuloYNueva(page);

  await page.fill('#reas-asociado', `${leg.nombre} (N°${leg.nro})`);
  await page.evaluate(() => window.autocompletarReas());
  await page.evaluate(() => window.setModoReas('reub'));
  await page.fill('#reas-serv-dest', 'DEST.SERV2');
  await page.evaluate(() => window.onChangeServicioDestinoReas());
  await page.selectOption('#reas-motivo', 'Necesidad operativa');
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill('#reas-fecha', manana);
  await page.fill('#reas-desc', 'Prueba e2e sin consultado');
  await page.selectOption('#reas-originada-por', 'RRHH');
  // Ojo: NO tildo #reas-consultado.

  const antes = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.reasignaciones.length);
  await page.evaluate(() => window.guardarReasignacion('Pendiente'));
  await page.waitForTimeout(150);
  const despues = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.reasignaciones.length);
  expect(despues).toBe(antes);
  await expect(page.locator('#modal-reasignacion')).toBeVisible();
});

test('Reubicación clásica — mueve el legajo al servicio nuevo y avisa al supervisor de origen', async ({ page }) => {
  await loginComoAdmin(page);
  const leg = await inyectarLegajo(page, { servicio: 'ORIG.REUB', supervisor: 'Sup Origen Reub', funcion: 'Operario A' });
  await seedServicioDestino(page, { codigo: 'DEST.REUB', nombre: 'Servicio Destino Reub', supervisor: 'Sup Destino Reub' });
  await abrirModuloYNueva(page);

  await page.fill('#reas-asociado', `${leg.nombre} (N°${leg.nro})`);
  await page.evaluate(() => window.autocompletarReas());
  await page.evaluate(() => window.setModoReas('reub'));
  await page.fill('#reas-serv-dest', 'DEST.REUB');
  await page.evaluate(() => window.onChangeServicioDestinoReas());
  await page.selectOption('#reas-motivo', 'Necesidad operativa');
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill('#reas-fecha', manana);
  await page.fill('#reas-desc', 'Reubicación e2e');
  await page.selectOption('#reas-originada-por', 'RRHH');
  await page.check('#reas-consultado');
  await page.fill('#reas-consultado-por', 'Supervisor E2E');
  await page.evaluate(() => window.guardarReasignacion('Pendiente'));
  await page.waitForTimeout(150);

  const id = await page.evaluate(async (nro) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.reasignaciones.find(r => String(r.nroSocio) === String(nro)).id;
  }, leg.nro);
  expect(id).toBeTruthy();

  // Ejecutar directo (simula fecha efectiva ya cumplida).
  await page.evaluate((id) => {
    return import('/src/modules/reasignaciones/reasignaciones.js').then(() => {});
  }, id);
  await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    const r = DB.reasignaciones.find(x => x.id === id);
    r.estado = 'Aprobada esperando fecha efectiva';
    r.fechaEfectiva = new Date().toISOString().slice(0, 10);
  }, id);
  await page.evaluate(async () => { const { chequearEjecucionesPendientes } = await import('/src/modules/reasignaciones/index.js'); chequearEjecucionesPendientes(); });
  await page.waitForTimeout(150);

  const legFinal = await page.evaluate(async (nro) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.legajos.find(l => String(l.nro) === String(nro));
  }, leg.nro);
  expect(legFinal.servicio).toBe('DEST.REUB');
  expect(legFinal.supervisor).toBe('Sup Destino Reub');

  const notif = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.notificacionesSistema || []).some(n => n.tipo === 'reubicacion_dotacion_origen' && n.destinatarioNombre === 'Sup Origen Reub');
  });
  expect(notif).toBeTruthy();
});

test('Suma de servicio — NO mueve el legajo de su servicio actual y no avisa "dotación incompleta"', async ({ page }) => {
  await loginComoAdmin(page);
  const leg = await inyectarLegajo(page, { servicio: 'ORIG.SUMA', supervisor: 'Sup Origen Suma', funcion: 'Operario A' });
  await seedServicioDestino(page, { codigo: 'DEST.SUMA', nombre: 'Servicio Destino Suma', supervisor: 'Sup Destino Suma' });
  await abrirModuloYNueva(page);

  await page.fill('#reas-asociado', `${leg.nombre} (N°${leg.nro})`);
  await page.evaluate(() => window.autocompletarReas());
  await page.evaluate(() => window.setModoReas('suma'));
  await page.fill('#reas-serv-dest', 'DEST.SUMA');
  await page.evaluate(() => window.onChangeServicioDestinoReas());
  await page.selectOption('#reas-motivo', 'Necesidad operativa');
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill('#reas-fecha', manana);
  await page.fill('#reas-desc', 'Suma de servicio e2e');
  await page.selectOption('#reas-originada-por', 'RRHH');
  await page.check('#reas-consultado');
  await page.fill('#reas-consultado-por', 'Supervisor E2E');
  await page.evaluate(() => window.guardarReasignacion('Pendiente'));
  await page.waitForTimeout(150);

  const id = await page.evaluate(async (nro) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.reasignaciones.find(r => String(r.nroSocio) === String(nro)).id;
  }, leg.nro);
  expect(id).toBeTruthy();

  const tipoGuardado = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.reasignaciones.find(x => x.id === id).tipo;
  }, id);
  expect(tipoGuardado).toBe('Suma de servicio');

  const notifAntes = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.notificacionesSistema?.length || 0);

  await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    const r = DB.reasignaciones.find(x => x.id === id);
    r.estado = 'Aprobada esperando fecha efectiva';
    r.fechaEfectiva = new Date().toISOString().slice(0, 10);
  }, id);
  await page.evaluate(async () => { const { chequearEjecucionesPendientes } = await import('/src/modules/reasignaciones/index.js'); chequearEjecucionesPendientes(); });
  await page.waitForTimeout(150);

  const legFinal = await page.evaluate(async (nro) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.legajos.find(l => String(l.nro) === String(nro));
  }, leg.nro);
  // Sigue en su servicio de siempre — Suma no lo mueve.
  expect(legFinal.servicio).toBe('ORIG.SUMA');
  expect(legFinal.supervisor).toBe('Sup Origen Suma');

  const notifDespues = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.notificacionesSistema?.length || 0);
  expect(notifDespues).toBe(notifAntes); // sin aviso de dotación incompleta

  // El historial del legajo queda con el movimiento, tageado como Suma.
  const mov = await page.evaluate(async (nro) => {
    const { DB } = await import('/src/shared/state.js');
    const l = DB.legajos.find(x => String(x.nro) === String(nro));
    return l.historialMovimientos?.[l.historialMovimientos.length - 1];
  }, leg.nro);
  expect(mov.tipo).toBe('Suma de servicio');
  expect(mov.servicioDestino).toBe('DEST.SUMA');
});

test('Chip de tipo visible en Pendientes/Histórico y en Rotación por asociado', async ({ page }) => {
  await loginComoAdmin(page);
  const leg = await inyectarLegajo(page, { servicio: 'ORIG.CHIP', supervisor: 'Sup Origen Chip', funcion: 'Operario A' });

  await page.evaluate(({ nro, nombre }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.reasignaciones.push({
        id: 990400001, nroSocio: String(nro), nombreAsociado: nombre,
        servicioOrigen: 'ORIG.CHIP', supervisorOrigen: 'Sup Origen Chip',
        servicioDestino: 'DEST.CHIP', supervisorDestino: 'Sup Destino Chip',
        tipo: 'Suma de servicio', consultadoAcepta: true, consultadoPor: 'Supervisor E2E',
        estado: 'Pendiente', anulado: false, fechaSolicitud: new Date().toISOString().slice(0, 10),
      });
    });
  }, { nro: leg.nro, nombre: leg.nombre });

  await page.evaluate(() => { window.navTo('reasignaciones'); window.tabReas('pendientes'); });
  await page.waitForTimeout(150);
  await expect(page.locator('#screen-reasignaciones')).toContainText('➕ SUMA');

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.reasignaciones.find(r => r.id === 990400001).estado = 'Aprobada ejecutada';
    window.tabReas('rotacion');
  });
  await page.waitForTimeout(150);
  await page.evaluate((nro) => window.abrirDetalleRotacionPorNro(nro), leg.nro);
  await page.waitForTimeout(150);
  await expect(page.locator('body')).toContainText('➕ SUMA');
});

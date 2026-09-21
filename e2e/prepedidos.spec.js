import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// ALTA_CLIENTE_SERVICIO_para_Fede_1.md, bloque 5 — 📥 Bandeja de Prepedidos.
// El alta del servicio (Pendiente asignación) siembra un prepedido idempotente
// con una vacante por persona; Operaciones decide por vacante (Cubrir con
// interno → Reasignaciones precargado / Incorporar → Activos); el estado de
// cada vacante se deriva de los registros vinculados.
test('Prepedidos — siembra idempotente, decisión por vacante, historial y chips', async ({ page }) => {
  await loginComoAdmin(page);

  const { preId } = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const inicio = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const o = {
      id: 990200111, codigo: 'GYM.PRETEST', nombre: 'GIMNASIO PRETEST', estado: 'Pendiente asignación operativa',
      anulado: false, tipo: 'Limpieza', dir: 'Av. Test 123', localidad: 'CABA', jurisdiccion: 'CABA',
      fechaInicio: inicio, fechaCarga: new Date().toISOString().slice(0, 10), cargadoPor: 'Comercial E2E', efts: 528,
      puestos: [
        { cantidad: 2, puesto: 'Operario/a', perfil: 'H 25-40', horarioDesde: '06:00', horarioHasta: '14:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true }, obs: 'turno mañana' },
        { cantidad: 1, puesto: 'Encargado A', perfil: '', horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true }, obs: '' },
      ],
    };
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(o);
    DB.legajos.push({ nro: 990201, nombre: 'INTERNO PRETEST', dni: '30990201', estado: 'Activo', servicio: 'OTRO.SERV', supervisor: 'SUP X', funcion: 'Operario/a', zona: 'CABA' });
    DB.motivosReasignacion = ['Necesidad operativa'];

    const pre = window.sembrarPrepedido(o, { notificar: false });
    window.sembrarPrepedido(o, { notificar: false }); // idempotente
    window.sincronizarPrepedidos();
    return { preId: String(pre.id), n: DB.prepedidos.filter(p => p.objetivoIdLocal === '990200111').length };
  });

  const nPre = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.prepedidos.filter(p => p.objetivoIdLocal === '990200111').length);
  expect(nPre).toBe(1);

  // --- Tab Prepedidos: 3 vacantes (2 + 1), datos del alta, badge y KPI ---
  await page.evaluate(() => { window.navTo('pedidos'); window.cambiarTabPedidos('prepedidos'); });
  await page.waitForTimeout(250);
  const box = page.locator('.prebox', { hasText: 'GIMNASIO PRETEST' });
  await expect(box).toContainText('servicio en PENDIENTE ASIGNACIÓN');
  await expect(box).toContainText('Av. Test 123');
  await expect(box).toContainText('528 hs/mes');
  await expect(box).toContainText('0/3 cubierta');
  await expect(box.locator('.pre-vac')).toHaveCount(3);
  await expect(box.locator('.pre-vac').first()).toContainText('Operario/a');
  await expect(box.locator('.pre-vac').first()).toContainText('06:00–14:00');
  await expect(box.locator('.pre-vac').first()).toContainText('H 25-40');
  await expect(page.locator('[data-ped-tab="prepedidos"]')).toBeVisible();
  await expect(page.locator('#kpi-prepedidos')).not.toHaveText('0');

  // --- Chip "dotación" en Servicios (Pendiente asignación) ---
  const chip = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return window.chipDotacionObjetivo(DB.objetivos.find(o => o.codigo === 'GYM.PRETEST'));
  });
  expect(chip).toContain('dotación: 0/3 cubierta');

  // --- Incorporar la vacante 0: pasa a Activos como pedido con chip de origen ---
  await box.locator('.pre-vac').nth(0).locator('[data-acc="incorporar"]').click();
  await page.waitForTimeout(250);
  await page.evaluate((id) => window.incorporarVacante(id, 0), preId); // doble click: no duplica
  const pedidos = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidos.filter(p => p.prepedidoIdLocal === id.slice(-9));
  }, preId);
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0].servicio).toBe('GYM.PRETEST');
  expect(pedidos[0].puesto).toBe('Operario/a');
  expect(pedidos[0].estado).toBe('Pendiente');
  await expect(box.locator('.pre-vac').nth(0)).toContainText('EN ACTIVOS como PP-');
  await page.evaluate(() => window.cambiarTabPedidos('activos'));
  await expect(page.locator('#tbody-pedidos')).toContainText('GYM.PRETEST');
  await expect(page.locator('#tbody-pedidos')).toContainText('desde PRE-');

  // --- Cubrir con interno la vacante 1: abre Reasignaciones precargado ---
  await page.evaluate(() => window.cambiarTabPedidos('prepedidos'));
  await page.waitForTimeout(200);
  await page.locator('.prebox', { hasText: 'GIMNASIO PRETEST' }).locator('.pre-vac').nth(1).locator('[data-acc="cubrir"]').click();
  await expect(page.locator('#modal-reasignacion')).toBeVisible();
  await expect(page.locator('#reas-serv-dest')).toHaveValue('GYM.PRETEST');
  await expect(page.locator('#reas-serv-dest')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#reas-modal-title')).toContainText('desde prepedido PRE-');
  await page.fill('#reas-asociado', 'INTERNO PRETEST (N°990201)');
  await page.evaluate(() => window.autocompletarReas());
  await page.selectOption('#reas-motivo', 'Necesidad operativa');
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill('#reas-fecha', manana);
  await page.evaluate(() => window.guardarReasignacion('Pendiente'));
  await page.waitForTimeout(250);

  const rea = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.reasignaciones.find(r => r.prepedidoIdLocal === id.slice(-9));
  }, preId);
  expect(rea).toBeTruthy();
  expect(rea.prepedidoVacante).toBe(1);
  expect(rea.servicioDestino).toBe('GYM.PRETEST');
  expect(rea.pedidoVinculadoIdLocal).toBeFalsy();
  await expect(page.locator('#modal-reasignacion')).not.toBeVisible();
  await page.evaluate(() => window.cambiarTabPedidos('prepedidos'));
  const vac1 = page.locator('.prebox', { hasText: 'GIMNASIO PRETEST' }).locator('.pre-vac').nth(1);
  await expect(vac1).toContainText('CUBIERTA INTERNO');
  await expect(vac1).toContainText('INTERNO PRETEST');
  await expect(page.locator('.prebox', { hasText: 'GIMNASIO PRETEST' })).toContainText('1/3 cubierta');

  // --- Una reasignación rechazada devuelve la vacante a "esperando decisión" ---
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.reasignaciones.find(r => r.prepedidoVacante === 1).estado = 'Rechazada';
    window.renderPrepedidos();
  });
  await expect(page.locator('.prebox', { hasText: 'GIMNASIO PRETEST' }).locator('.pre-vac').nth(1)).toContainText('esperando decisión');
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.reasignaciones.find(r => r.prepedidoVacante === 1).estado = 'Pendiente';
    window.renderPrepedidos();
  });

  // --- Activar con dotación incompleta: el aviso lo calcula (alerta, no bloqueo) ---
  const aviso = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const a = window.avisoDotacionIncompleta(DB.objetivos.find(o => o.codigo === 'GYM.PRETEST'));
    return { faltan: a.faltan, pend: a.pend, act: a.act };
  });
  expect(aviso).toEqual({ faltan: 2, pend: 1, act: 1 });

  // --- Todas decididas y no todas internas → sale de la bandeja a Historial ---
  await page.evaluate((id) => window.incorporarVacante(id, 2), preId);
  await page.waitForTimeout(200);
  await expect(page.locator('.prebox', { hasText: 'GIMNASIO PRETEST' })).toHaveCount(0);
  await page.evaluate(() => window.cambiarTabPedidos('historial'));
  await expect(page.locator('#tbody-pedidos-historial')).toContainText('GIMNASIO PRETEST');
  await expect(page.locator('#tbody-pedidos-historial')).toContainText('DECIDIDO');

  // --- Servicio con una sola vacante cubierta 100% con interno: CUBIERTO INTERNO ---
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const o = {
      id: 990200222, codigo: 'CONS.PRETEST', nombre: 'CONSORCIO PRETEST', estado: 'Pendiente asignación operativa', anulado: false,
      tipo: 'Limpieza', fechaInicio: '', fechaCarga: new Date().toISOString().slice(0, 10), cargadoPor: 'Comercial E2E',
      puestos: [{ cantidad: 1, puesto: 'Franquero', perfil: '', horarioDesde: '07:00', horarioHasta: '13:00', tipoHorario: 'fijo', dias: { sabados: true }, obs: '' }],
    };
    DB.objetivos.push(o);
    const pre = window.sembrarPrepedido(o);
    DB.reasignaciones.push({
      id: 990300001, nroSocio: '990201', nombreAsociado: 'INTERNO PRETEST', servicioOrigen: 'OTRO.SERV', servicioDestino: 'CONS.PRETEST',
      estado: 'Aprobada esperando fecha efectiva', anulado: false, prepedidoIdLocal: String(pre.id).slice(-9), prepedidoVacante: 0,
    });
    window.cambiarTabPedidos('historial');
  });
  await expect(page.locator('#tbody-pedidos-historial')).toContainText('CUBIERTO INTERNO');
  await expect(page.locator('#tbody-pedidos-historial')).toContainText('CONSORCIO PRETEST');
});

test('Prepedidos — la bandeja es de Operaciones y RRHH (Supervisor no la ve)', async ({ page }) => {
  await loginComoAdmin(page, 'Supervisor');
  await page.evaluate(() => { window.navTo('pedidos'); });
  await page.waitForTimeout(250);
  await expect(page.locator('[data-ped-tab="prepedidos"]')).toBeHidden();
  await expect(page.locator('#pedidos-kpis')).not.toContainText('Prepedidos');

  await loginComoAdmin(page, 'RRHH');
  await page.evaluate(() => { window.navTo('pedidos'); window.cambiarTabPedidos('prepedidos'); });
  await page.waitForTimeout(250);
  await expect(page.locator('[data-ped-tab="prepedidos"]')).toBeVisible();
});

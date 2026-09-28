import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

// PERIODOS_campanita_tercerizados_para_Fede.md — un servicio marcado
// "tercerizado" (la limpieza la hace un tercero, nadie carga pedido de
// productos) desaparece por completo del módulo: no suma en el total de
// servicios, no aparece en ningún filtro/grupo del modal "Estado de los
// pedidos", y la campanita "Recordar a los que faltan" no le manda un
// recordatorio a un "supervisor" que en realidad es texto libre tipo
// "ESTO ES TERCIARIZADO".

const MES = '2027-04';

async function irAPeriodos(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.navTo('pedido_productos'));
  await page.waitForTimeout(700);
  await page.locator('#pp-tab-btn-periodos').click();
  await page.waitForTimeout(200);
}

test('Un servicio marcado tercerizado desaparece del tab Períodos, del modal y de la campanita', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const per = { id: 990900001, mes, estado: 'abierto', cierreProgramado: '2027-04-30T17:00:00.000Z', recordatorioEnviado: false, anulado: false };
    DB.ppPeriodos = [per];

    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(
      { id: 990900010, codigo: 'E2E.NORMAL', nombre: 'Servicio Normal E2E', estado: 'Operativo', anulado: false, supervisorAsignado: 'Sup Real' },
      { id: 990900011, codigo: 'E2E.TERCERIZADO', nombre: 'Servicio Tercerizado E2E', estado: 'Operativo', anulado: false, supervisorAsignado: 'ESTO ES TERCIARIZADO', tercerizado: true },
    );

    const periodoIdLocal = String(per.id).slice(-9);
    DB.ppPedidos = [
      { id: 990900020, periodoIdLocal, servicioCodigo: 'E2E.NORMAL', facturacionNeta: 0, porcentajeTope: 0.06, estado: 'borrador', tipoPedido: 'mensual', supervisor: 'Sup Real', anulado: false },
      // Este ya existía ANTES de marcar el servicio como tercerizado (el
      // caso real del doc) — el fix tiene que esconderlo igual, sin
      // necesidad de borrar el pp_pedido viejo.
      { id: 990900021, periodoIdLocal, servicioCodigo: 'E2E.TERCERIZADO', facturacionNeta: 0, porcentajeTope: 0.06, estado: 'borrador', tipoPedido: 'mensual', supervisor: 'ESTO ES TERCIARIZADO', anulado: false },
    ];
    DB.notificacionesSistema = [];
  }, MES);

  await irAPeriodos(page);

  // --- El tab: el total de servicios del período es 1, no 2 ---
  await expect(page.locator('#pp-per-k-siniciar')).toHaveText('1');
  const fila = page.locator('#tbody-pp-periodos tr', { hasText: MES });
  await expect(fila).toContainText('0/1');

  // --- El modal: ni el servicio ni el "supervisor" trucho aparecen ---
  await fila.click();
  const modal = page.locator('#modal-pp-detalle-periodo');
  await expect(modal).toBeVisible();
  await expect(page.locator('#pp-det-sub')).toContainText('1 servicio(s)');
  await expect(modal).not.toContainText('ESTO ES TERCIARIZADO');
  await expect(modal).not.toContainText('Servicio Tercerizado E2E');
  await expect(modal.locator('.pp-kc', { hasText: 'Todos' })).toContainText('1');

  // --- La campanita solo cuenta al supervisor real ---
  const btn = page.locator('#pp-det-recordar');
  await expect(btn).toContainText('1 supervisor');

  page.once('dialog', d => d.accept());
  await page.evaluate(() => window.recordarFaltantesPeriodoPP());
  await page.waitForTimeout(150);
  const notifs = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.notificacionesSistema || []).map(n => n.destinatarioNombre);
  });
  expect(notifs).toContain('Sup Real');
  expect(notifs).not.toContain('ESTO ES TERCIARIZADO');
});

test('Al abrir un período nuevo (sin ninguno abierto todavía), un servicio tercerizado no recibe ningún pedido', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    // Sin ningún período 'abierto' — abrirPeriodoPP() activa el nuevo de
    // inmediato (mismo camino real que "activar el primer período").
    DB.ppPeriodos = [];
    DB.ppPedidos = [];
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(
      { id: 990900012, codigo: 'E2E.NORMAL2', nombre: 'Servicio Normal 2 E2E', estado: 'Operativo', anulado: false, supervisorAsignado: 'Sup Real 2' },
      { id: 990900013, codigo: 'E2E.TERCERIZADO2', nombre: 'Servicio Tercerizado 2 E2E', estado: 'Operativo', anulado: false, tercerizado: true },
    );
    window.navTo('pedido_productos');
  });
  await page.waitForTimeout(700);
  await page.locator('#pp-tab-btn-periodos').click();
  await page.waitForTimeout(200);

  await page.fill('#pp-periodo-nuevo', '2027-05');
  await page.fill('#pp-periodo-cierre', '2027-05-31T17:00');
  await page.evaluate(() => window.abrirPeriodoPP());
  await page.waitForTimeout(1500);

  const pedidos = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.ppPedidos || []).map(p => p.servicioCodigo);
  });
  expect(pedidos).toContain('E2E.NORMAL2');
  expect(pedidos).not.toContain('E2E.TERCERIZADO2');
});

import { test, expect } from '@playwright/test';

async function loginComo(page, perfil, nombre) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async ({ perfil, nombre }) => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre, perfil });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  }, { perfil, nombre });
}

// ADELANTOS_devuelto_por_RRHH_para_Fede.md — "Devolver al supervisor"
// tiene que DEVOLVER (corregible, Modelo B), no rechazar. Antes,
// devolverASupervisorTrasRechazoFinanzas terminaba en 'Rechazada RRHH'
// — el mismo estado final que "Rechazar", sin dejarle al supervisor
// ninguna forma de corregir y reelevar el mismo pedido.
test('RRHH devuelve un pedido al supervisor — queda Devuelto por RRHH (corregible), NO Rechazado', async ({ page }) => {
  await loginComo(page, 'RRHH', 'Nati RRHH');

  const pedidoId = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const id = Date.now();
    DB.pedidosAdelantos = DB.pedidosAdelantos || [];
    DB.pedidosAdelantos.push({
      id, legajoIdLocal: '999999', nroSocio: '999999', nombreAsociado: 'CORREA TEST',
      supervisorNombre: 'Administrador', origen: 'Formal', monto: 70000, periodo: '2026-09',
      fechaPedido: '2026-09-20', estado: 'Enviada', cargadoPor: 'Administrador', anulado: false,
    });
    window.navTo('gestion_adelantos');
    return id;
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabGestAdl('rrhh'));
  await page.waitForTimeout(150);

  await page.evaluate((id) => window.abrirRevisionRRHH('Adelanto', id), pedidoId);
  await expect(page.locator('#modal-gadl-revision')).toBeVisible();
  // Las "tres salidas" del doc siempre visibles, sea Enviada o devuelto por Finanzas.
  await expect(page.locator('#gr-acciones')).toContainText('Devolver al supervisor');
  await expect(page.locator('#gr-acciones')).toContainText('Rechazar');
  await expect(page.locator('#gr-acciones')).toContainText('Aprobar');

  await page.fill('#gr-motivo', 'Prueba');
  await page.evaluate(() => window.devolverPedidoASupervisor());
  await page.waitForTimeout(150);

  const pedido = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidosAdelantos.find(p => p.id === id);
  }, pedidoId);
  expect(pedido.estado).toBe('Devuelta RRHH');
  expect(pedido.estado).not.toBe('Rechazada RRHH');
  expect(pedido.motivoDevueltoRrhh).toBe('Prueba');
});

test('El supervisor ve el pedido devuelto, lo corrige y reeleva — mismo pedido, vuelve a Pendiente', async ({ page }) => {
  await loginComo(page, 'Operaciones', 'Administrador');

  const pedidoId = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const id = Date.now();
    DB.pedidosAdelantos = DB.pedidosAdelantos || [];
    DB.pedidosAdelantos.push({
      id, legajoIdLocal: '999999', nroSocio: '999999', nombreAsociado: 'CORREA TEST',
      supervisorNombre: 'Administrador', origen: 'Formal', monto: 70000, periodo: '2026-09',
      fechaPedido: '2026-09-20', estado: 'Devuelta RRHH', motivoDevueltoRrhh: 'Monto muy elevado, pedir menos',
      devueltoPorRrhh: 'Nati RRHH', cargadoPor: 'Administrador', anulado: false,
    });
    window.navTo('pedidos_adelantos');
    return id;
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabPedAdl('mios'));
  await page.waitForTimeout(150);

  const fila = page.locator('#tbody-padl-mios tr', { hasText: 'CORREA TEST' });
  await expect(fila).toContainText('Devuelto por RRHH');
  await fila.locator('button:has-text("Corregir y reelevar")').click();
  await expect(page.locator('#modal-padl-detalle')).toBeVisible();
  await expect(page.locator('#pd-cuerpo')).toContainText('Monto muy elevado, pedir menos');

  await page.fill('#pd-monto-corregido', '50000');
  await page.evaluate((id) => window.corregirYReelevarPedidoPorId('Adelanto', id), pedidoId);
  await page.waitForTimeout(150);

  const pedido = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidosAdelantos.find(p => p.id === id);
  }, pedidoId);
  expect(pedido.id).toBe(pedidoId); // mismo registro, no uno nuevo
  expect(pedido.estado).toBe('Enviada');
  expect(pedido.monto).toBe(50000);
});

test('RRHH puede Rechazar (final) un pedido que Finanzas ya había devuelto — antes no tenía esa salida', async ({ page }) => {
  await loginComo(page, 'RRHH', 'Nati RRHH');

  const pedidoId = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const id = Date.now();
    DB.pedidosAdelantos = DB.pedidosAdelantos || [];
    DB.pedidosAdelantos.push({
      id, legajoIdLocal: '999999', nroSocio: '999999', nombreAsociado: 'FIGUEREDO TEST',
      supervisorNombre: 'Administrador', origen: 'Formal', monto: 100000, periodo: '2026-09',
      fechaPedido: '2026-09-20', estado: 'Rechazada Finanzas', motivoRechazoFinanzas: 'Supera tope',
      cargadoPor: 'Administrador', anulado: false,
    });
    window.navTo('gestion_adelantos');
    return id;
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabGestAdl('rrhh'));
  await page.waitForTimeout(150);

  await page.evaluate((id) => window.abrirRevisionRRHH('Adelanto', id), pedidoId);
  await page.fill('#gr-motivo', 'No corresponde insistir');
  await page.evaluate(() => window.rechazarRevisionRRHH());
  await page.waitForTimeout(150);

  const pedido = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidosAdelantos.find(p => p.id === id);
  }, pedidoId);
  expect(pedido.estado).toBe('Rechazada RRHH');
  // ADELANTOS_devuelto_por_RRHH_para_Fede.md — bug menor "Figueredo — /
  // —": todo rechazo tiene que quedar firmado por quién lo hizo.
  expect(pedido.rechazadoPorRrhh).toBeTruthy();

  await page.evaluate(() => window.navTo('gestion_adelantos'));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.tabGestAdl('historial'));
  await page.waitForTimeout(150);
  const filaHist = page.locator('#tbody-gadl-historial tr', { hasText: 'FIGUEREDO TEST' });
  await expect(filaHist).not.toContainText('— / —');
  await expect(filaHist).toContainText('Nati RRHH');
});

import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket real "Del PP 29 al PP 31 no me permite tocar la opción de ver"
// (22/09). Causa: pedidos.id en Supabase es un uuid (con guiones) — el
// onclick interpolaba ${p.id} SIN comillas, así que con un uuid real
// ("cea8363a-...") el atributo quedaba con JS inválido y el navegador
// descartaba ese handler en silencio, sin ningún error visible para quien
// usa la app. No es un problema de esos 3 pedidos puntuales: afecta a
// CUALQUIER pedido cargado desde Supabase (es decir, después de cualquier
// reload/login — supaInit trae el id real de Postgres, no el Date.now()
// con el que nace en memoria al crearlo). Usa el UUID real de producción
// del PP 29 para que el test falle exactamente como falló en la vida real.
const ID_UUID_REAL_PP29 = 'cea8363a-dfe1-48e8-824c-8940b28618aa';

async function sembrarPedido(page, overrides) {
  return page.evaluate(async (overrides) => {
    const { DB } = await import('/src/shared/state.js');
    const p = {
      id: 'id-uuid-e2e', numero: 29, fecha: '21/9/2026', cargadoPor: 'Santiago Ayala',
      supervisor: 'Alejandro Cacciato', servicio: 'LOS.PINOS', zona: 'Zona Norte', puesto: 'Operario A',
      cantidad: 2, fechaLimite: '25-09-26', urgencia: 'Alta', perfil: [], obs: 'test', estado: 'Pendiente',
      ...overrides,
    };
    DB.pedidos = DB.pedidos || [];
    DB.pedidos.push(p);
    return p;
  }, overrides);
}

test('Pedidos activos — "Ver" abre el detalle aunque el id sea un uuid real de Supabase (PP 29)', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarPedido(page, { id: ID_UUID_REAL_PP29, numero: 29 });
  await page.evaluate(() => window.navTo('pedidos'));
  await page.waitForTimeout(200);

  const fila = page.locator('#tbody-pedidos tr', { hasText: 'PP-29' });
  await expect(fila).toBeVisible();
  await fila.locator('button:has-text("Ver")').click();

  await expect(page.locator('#modal-ver-pedido')).toHaveClass(/open/);
  await expect(page.locator('#pedido-title')).toContainText('PP-29');
  await expect(page.locator('#pedido-body')).toContainText('LOS.PINOS');
});

test('Pedidos activos — clickear la fila entera (no solo el botón) también abre el detalle con id uuid', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarPedido(page, { id: 'a1b2c3d4-1111-2222-3333-444455556666', numero: 30 });
  await page.evaluate(() => window.navTo('pedidos'));
  await page.waitForTimeout(200);

  await page.locator('#tbody-pedidos tr', { hasText: 'PP-30' }).click();
  await expect(page.locator('#modal-ver-pedido')).toHaveClass(/open/);
  await expect(page.locator('#pedido-title')).toContainText('PP-30');
});

test('Historial — "Ver" también abre con id uuid (pedido Cubierto)', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarPedido(page, {
    id: 'b2c3d4e5-2222-3333-4444-555566667777', numero: 31, estado: 'Cubierto',
    nombreCandidato: 'Test E2E', ingresoTipo: 'nuevo', fechaInicio: '22/9/2026',
  });
  await page.evaluate(() => { window.navTo('pedidos'); window.cambiarTabPedidos('historial'); });
  await page.waitForTimeout(200);

  await page.locator('#tbody-pedidos-historial tr', { hasText: 'PP-31' }).locator('button, td').first();
  await page.locator('#tbody-pedidos-historial tr', { hasText: 'PP-31' }).click();
  await expect(page.locator('#modal-ver-pedido')).toHaveClass(/open/);
  await expect(page.locator('#pedido-title')).toContainText('PP-31');
});

test('Desde el modal, "Editar" y "Tomar en búsqueda" también funcionan con id uuid', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await loginComoAdmin(page);
  const p = await sembrarPedido(page, { id: 'c3d4e5f6-3333-4444-5555-666677778888', numero: 32, estado: 'Pendiente' });
  await page.evaluate((id) => window.verDetallePedido(id), p.id);
  await expect(page.locator('#modal-ver-pedido')).toHaveClass(/open/);

  await page.click('#pedido-footer-extra button:has-text("En búsqueda")');
  await page.waitForTimeout(150);
  const estado = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidos.find(x => x.id === id).estado;
  }, p.id);
  expect(estado).toBe('En búsqueda');
});

test('Un pedido con datos inesperados no rompe el detalle de los demás', async ({ page }) => {
  await loginComoAdmin(page);
  // perfil malformado (no es array) para forzar una excepción real al abrir
  // SU detalle — perfilDetalle() espera un array y usa .length/.map. Antes
  // de este fix, verDetallePedido() no tenía try/catch: una excepción acá
  // dejaba el modal a medio pintar sin ningún aviso.
  const p33 = await sembrarPedido(page, { id: 'd4e5f6a7-4444-5555-6666-777788889999', numero: 33, perfil: 'no-es-un-array' });
  const p34 = await sembrarPedido(page, { id: 'e5f6a7b8-5555-6666-7777-888899990000', numero: 34 });
  await page.evaluate(() => window.navTo('pedidos'));
  await page.waitForTimeout(200);

  // Ambas filas se listan igual (el problema de 33 recién se nota al abrirlo).
  await expect(page.locator('#tbody-pedidos tr', { hasText: 'PP-33' })).toBeVisible();
  await expect(page.locator('#tbody-pedidos tr', { hasText: 'PP-34' })).toBeVisible();

  // Abrir el 33 no tira una excepción sin aviso: se loguea y se avisa.
  await page.evaluate((id) => window.verDetallePedido(id), p33.id);
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-ver-pedido')).not.toHaveClass(/open/);
  await expect(page.locator('.toast, #toast').first()).toContainText('No se pudo mostrar el detalle');

  // El 34 (sano) sigue abriendo normal después del error del 33.
  await page.evaluate((id) => window.verDetallePedido(id), p34.id);
  await expect(page.locator('#modal-ver-pedido')).toHaveClass(/open/);
  await expect(page.locator('#pedido-title')).toContainText('PP-34');
});

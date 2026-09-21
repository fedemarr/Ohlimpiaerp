import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Baja de cliente: modal con motivo obligatorio (antes window.prompt) y baja
// confirmada por el servidor. Un fallo de persistencia no toca la sesión ni
// deja la baja a medias en memoria.
async function sembrar(page) {
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const cid = 990500111;
    DB.clientes.push({ id: cid, nombre: 'CLI BAJA E2E', estado: 'Activo' });
    DB.objetivos.push({ id: 990500222, codigo: 'OB.BAJA.E2E', nombre: 'OB BAJA E2E', estado: 'Operativo', clienteId: cid, anulado: false });
    window.navTo('clientes');
  });
}
const estados = (page) => page.evaluate(async () => {
  const { DB } = await import('/src/shared/state.js');
  return { cli: DB.clientes.find(c => c.nombre === 'CLI BAJA E2E').estado, obj: DB.objetivos.find(o => o.codigo === 'OB.BAJA.E2E').estado };
});

test('Baja de cliente — modal con motivo obligatorio y sin prompt nativo', async ({ page }) => {
  await loginComoAdmin(page);
  let prompts = 0;
  page.on('dialog', async d => { prompts++; await d.dismiss(); });
  await sembrar(page);

  await page.evaluate(() => window.abrirBajaCliente('990500111'));
  await expect(page.locator('#modal-baja-cliente')).toBeVisible();
  await expect(page.locator('#baja-cli-aviso')).toContainText('1 servicio(s) activo(s)');

  // Motivo obligatorio: sin motivo no se da de baja y se explica en el modal.
  await page.click('#baja-cli-confirmar');
  await expect(page.locator('#baja-cli-error')).toBeVisible();
  expect(await estados(page)).toEqual({ cli: 'Activo', obj: 'Operativo' });
  expect(prompts).toBe(0);
});

test('Baja de cliente — si el servidor falla no cambia nada y la sesión sigue viva', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);
  await page.evaluate(() => window.abrirBajaCliente('990500111'));
  await page.fill('#baja-cli-motivo', 'Cierre de contrato');
  // En e2e no hay sesión autenticada: el guardado a Supabase es rechazado por
  // RLS, que es justamente el camino de error que queremos ver manejado.
  await page.click('#baja-cli-confirmar');
  await expect(page.locator('#toast, .toast').first()).toContainText('No se pudo dar de baja');
  expect(await estados(page)).toEqual({ cli: 'Activo', obj: 'Operativo' });
  // El modal sigue abierto, el botón vuelve a estar disponible y no hubo logout.
  await expect(page.locator('#modal-baja-cliente')).toBeVisible();
  await expect(page.locator('#baja-cli-confirmar')).toBeEnabled();
  await expect(page.locator('#login-screen')).toBeHidden();
});

test('Baja de cliente — con el servidor OK da de baja cliente y servicios, y el doble click no duplica la petición', async ({ page }) => {
  await loginComoAdmin(page);
  const escrituras = [];
  await page.route('**/rest/v1/**', async route => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    escrituras.push(req.method() + ' ' + new URL(req.url()).pathname);
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' });
  });
  await sembrar(page);
  await page.evaluate(() => window.abrirBajaCliente('990500111'));
  await page.fill('#baja-cli-motivo', 'Cierre de contrato');
  // Doble click rápido: la segunda petición se ignora mientras carga.
  await page.evaluate(() => { window.confirmarBajaCliente(); window.confirmarBajaCliente(); });
  await expect(page.locator('#modal-baja-cliente')).toBeHidden();
  expect(await estados(page)).toEqual({ cli: 'Inactivo', obj: 'Baja' });
  const clientes = escrituras.filter(e => e.includes('/clientes'));
  const objetivos = escrituras.filter(e => e.includes('/objetivos') && !e.includes('eventos'));
  expect(clientes).toHaveLength(1);
  expect(objetivos).toHaveLength(1);
  await expect(page.locator('#login-screen')).toBeHidden();
});

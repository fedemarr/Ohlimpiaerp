import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket real: el estado "Baja" de un cliente se veía en VERDE en vez de
// rojo. Causa raíz: BADGE_MAP (state.js) tenía la clave 'Baja' declarada
// dos veces en el mismo object literal — una para estado (rojo) y otra
// para urgencia de Pedidos de personal (verde, "prioridad baja" = OK) — la
// segunda pisaba a la primera (gana la última clave repetida), así que
// CUALQUIER badge('Baja') del proyecto salía verde. Clientes ahora usa su
// propio mapa (badgeEstadoCliente), desacoplado de Urgencia.

async function sembrarCliente(page, estado) {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  await page.evaluate(async ({ id, estado }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.clientes.push({ id, nombre: 'Cliente Badge Test ' + estado, razon: 'Razon Test', cuit: '30-1-1', tipo: 'Persona jurídica', estado, contactos: [] });
    window.renderClientes();
  }, { id, estado });
  return id;
}

test('Cliente en Baja (Inactivo) — el badge es ROJO, no verde', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('clientes'));
  await sembrarCliente(page, 'Inactivo');

  const fila = page.locator('#tbody-clientes tr', { hasText: 'Cliente Badge Test Inactivo' });
  const badgeEl = fila.locator('.badge');
  await expect(badgeEl).toHaveText('Baja');
  await expect(badgeEl).toHaveClass(/badge-rojo/);
  await expect(badgeEl).not.toHaveClass(/badge-verde/);
});

test('Cliente Activo — sigue en verde (no se rompió el caso que ya andaba bien)', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('clientes'));
  await sembrarCliente(page, 'Activo');

  const fila = page.locator('#tbody-clientes tr', { hasText: 'Cliente Badge Test Activo' });
  const badgeEl = fila.locator('.badge');
  await expect(badgeEl).toHaveText('Activo');
  await expect(badgeEl).toHaveClass(/badge-verde/);
});

test('Cliente en Borrador — se muestra como Pendiente, en naranja (ni verde ni rojo)', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('clientes'));
  await sembrarCliente(page, 'Borrador');

  const fila = page.locator('#tbody-clientes tr', { hasText: 'Cliente Badge Test Borrador' });
  const badgeEl = fila.locator('.badge');
  await expect(badgeEl).toHaveText('Pendiente');
  await expect(badgeEl).toHaveClass(/badge-naranja/);
});

test('Comparación robusta a mayúsculas/espacios — "inactivo" y " Inactivo " también dan rojo', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('clientes'));
  await sembrarCliente(page, 'inactivo');
  await sembrarCliente(page, ' Inactivo ');

  const filas = page.locator('#tbody-clientes tr', { hasText: 'Cliente Badge Test' });
  const badges = filas.locator('.badge');
  const count = await badges.count();
  for (let i = 0; i < count; i++) {
    await expect(badges.nth(i)).toHaveClass(/badge-rojo/);
    await expect(badges.nth(i)).toHaveText('Baja');
  }
});

test('El detalle del cliente (Ver) muestra el mismo badge rojo para Baja', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('clientes'));
  const id = await sembrarCliente(page, 'Inactivo');
  const idl = String(id).slice(-9);

  await page.evaluate((idl) => window.verCliente(idl), idl);
  await expect(page.locator('#modal-ver-pedido')).toHaveClass(/open/);
  const badgeEl = page.locator('#pedido-body .badge:has-text("Baja")');
  await expect(badgeEl).toHaveClass(/badge-rojo/);
});

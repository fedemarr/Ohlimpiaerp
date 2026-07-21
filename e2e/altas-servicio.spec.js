// Regresión del bug real: el select de Servicio en Altas filtraba por
// estado==='Activo', un valor que ningún objetivo tiene nunca (el real
// es 'Operativo') — el select quedaba siempre vacío y en cascada
// rompía Vacaciones y Pedidos de adelantos. También cubre el Sector,
// que tenía el problema equivalente (atado al campo equivocado).
import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

test('el selector de Servicio en Altas tiene opciones reales', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.abrirModalAlta());
  await expect(page.locator('#modal-alta-nuevo')).toBeVisible();
  await page.evaluate(() => window.tabAlta(2)); // tab "Operativo"

  const opciones = await page.locator('#alt-servicio option').count();
  expect(opciones, 'el select de Servicio quedó vacío (solo "— Sin asignar —")').toBeGreaterThan(1);
});

test('el campo Sector está siempre visible, sin depender de qué se eligió en Servicio', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.abrirModalAlta());
  await page.evaluate(() => window.tabAlta(2));

  // A propósito NO tocamos el select de Servicio acá — el bug real era
  // justamente que Sector solo aparecía si se elegía "Administrativo"
  // ahí, y nadie lo hacía porque la función administrativa se elige en
  // otro campo (Función), no en Servicio.
  await expect(page.locator('#alt-sector')).toBeVisible();
});

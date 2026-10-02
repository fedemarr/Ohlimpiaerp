import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §19: el tilde verde "Todos
// dentro de categoría" mentía cuando la proyección daba $0 para TODO el
// padrón por falta de retiros conectados (no porque de verdad estén bien).
// Causa raíz real encontrada (no se toca en este ticket, es de
// Liquidaciones): registrarPago() nunca persiste DB.lqsPagos — ver
// legacy.js. Acá solo se corrige el empty state para que sea honesto.

test('Fuera de categoría — sin ningún retiro conectado muestra "sin datos", no el tilde verde falso', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monotributos.push({ id: Date.now(), nombre: 'SIN RETIROS TEST', nroSocio: 995906, categoria: 'A', estado: 'Al día', zona: 'provincia', condicion: 'comun' });
      // Sin tocar DB.lqsPagos — exactamente el estado real de hoy.
    });
  });
  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('alerta', null); });
  await page.waitForTimeout(150);

  const body = page.locator('#mono-alerta-body');
  await expect(body).toContainText('Proyección sin datos');
  await expect(body).not.toContainText('Todos los asociados están dentro de su categoría');
});

test('Fuera de categoría — con al menos un retiro real conectado, "todos dentro" vuelve a ser el mensaje (cuando corresponde)', async ({ page }) => {
  await loginComoAdmin(page);
  const anio = new Date().getFullYear();
  await page.evaluate(({ anio }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monotributos.push({ id: Date.now(), nombre: 'CON RETIRO TEST', nroSocio: 995907, categoria: 'K', estado: 'Al día', zona: 'provincia', condicion: 'comun' });
      DB.lqsPagos = DB.lqsPagos || {};
      DB.lqsPagos[`${anio}-01`] = { 'CON RETIRO TEST': { pagado: true, monto: 100, fecha: '01/01' } };
    });
  }, { anio });
  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('alerta', null); });
  await page.waitForTimeout(150);

  const body = page.locator('#mono-alerta-body');
  // Categoría K (la más alta) con una proyección chica real → sigue dentro.
  await expect(body).toContainText('Todos los asociados están dentro de su categoría');
  await expect(body).not.toContainText('Proyección sin datos');
});

import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §10: título grande con el mes +
// chip de contexto — evita tildar pagos en el mes equivocado sin darse
// cuenta (mismo patrón que "GRILLAS — SEPTIEMBRE DE 2026" en Liquidación
// de horas). §4: el botón "Ver fuera de categoría" del Padrón se elimina
// (duplica el tab que está al lado).

function mesActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test('Pago mensual — título grande con el mes, chip "Mes en curso" y aviso al mirar otro mes', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(150);

  await expect(page.locator('#mono-pagos-mes-titulo')).toContainText('PAGO DE MONOTRIBUTOS');
  await expect(page.locator('#mono-pagos-mes-aviso')).toContainText('Mes en curso');
  await expect(page.locator('#mono-pagos-mes-volver')).toBeHidden();

  // Mirar un mes distinto al vigente — aparece el aviso y el link para volver.
  const otroMes = mesActualISO() <= '2026-01' ? '2026-12' : '2026-01';
  await page.fill('#mono-pagos-mes', otroMes);
  await page.evaluate(() => window.renderMonoPagos());
  await page.waitForTimeout(150);
  await expect(page.locator('#mono-pagos-mes-aviso')).toContainText('no es el mes en curso');
  await expect(page.locator('#mono-pagos-mes-volver')).toBeVisible();

  await page.click('#mono-pagos-mes-volver');
  await page.waitForTimeout(150);
  await expect(page.locator('#mono-pagos-mes-aviso')).toContainText('Mes en curso');
  await expect(page.locator('#mono-pagos-mes')).toHaveValue(mesActualISO());
});

test('Padrón — el botón "Ver fuera de categoría" ya no existe (duplicaba el tab de al lado)', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('padron', null); });
  await page.waitForTimeout(150);
  await expect(page.locator('#screen-monotributos')).not.toContainText('Ver fuera de categoría');
});

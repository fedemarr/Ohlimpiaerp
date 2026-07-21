// Regresión del bug real de esta sesión: la barra de 9 tabs del legajo
// se desbordaba ~38px del modal (sin flex-wrap) y, ya con flex-wrap,
// cada tab partía su propio texto en 2 líneas (sin white-space:nowrap).
// Confirmado con capturas reales antes de arreglarlo — este test evita
// que vuelva a pasar sin que nadie se dé cuenta.
import { test, expect } from '@playwright/test';
import { loginComoAdmin, inyectarLegajo } from './helpers.js';

test('el modal de legajo no desborda horizontalmente en ninguna de sus tabs', async ({ page }) => {
  await loginComoAdmin(page);
  const legajo = await inyectarLegajo(page);
  await page.evaluate((nro) => window.verLegajo(nro), legajo.nro);
  await expect(page.locator('#legajo-title')).toContainText(String(legajo.nro));

  const tabs = await page.locator('#legajo-body .tab-btn').all();
  expect(tabs.length).toBeGreaterThanOrEqual(4);

  for (let i = 0; i < tabs.length; i++) {
    await page.locator('#legajo-body .tab-btn').nth(i).click();
    const dims = await page.evaluate(() => {
      const modal = document.querySelector('#modal-legajo .modal');
      return { w: modal.offsetWidth, scrollW: modal.scrollWidth };
    });
    expect(dims.scrollW, `tab #${i} desborda el modal (scrollWidth ${dims.scrollW} > width ${dims.w})`).toBeLessThanOrEqual(dims.w);
  }
});

test('cada botón de tab mantiene su etiqueta en una sola línea', async ({ page }) => {
  await loginComoAdmin(page);
  const legajo = await inyectarLegajo(page);
  await page.evaluate((nro) => window.verLegajo(nro), legajo.nro);

  const lineas = await page.locator('#legajo-body .tab-btn').evaluateAll(
    (btns) => btns.map((b) => b.getClientRects().length)
  );
  for (const [i, n] of lineas.entries()) {
    expect(n, `tab #${i} quedó partida en ${n} líneas`).toBe(1);
  }
});

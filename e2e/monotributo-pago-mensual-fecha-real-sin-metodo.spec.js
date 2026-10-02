import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §15/§16: la columna "Método de
// pago" se elimina (el tilde manual pasa a decir "Manual" fijo, sin elegir
// nada) y la fecha que se muestra en "Pagado" es la fecha REAL del pago
// (elegida al tildar, o leída del comprobante) — nunca la de cuándo se
// cargó el registro en el sistema.

function mesActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test('Pago mensual — tilde manual: sin columna "Método de pago", pide fecha de pago (default hoy) y la muestra tal cual', async ({ page }) => {
  await loginComoAdmin(page);

  const periodo = mesActualISO();
  await page.evaluate((periodo) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({
        id: Date.now(), periodo, nroSocio: '995601', nombre: 'FECHA PAGO REAL TEST',
        total: 50000, impIntegradoCongelado: 5000, sipaCongelado: 18000, obraSocialCongelado: 25000, iibbCongelado: 2000,
        pagado: false, enRevision: false,
      });
    });
  }, periodo);

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(150);

  await expect(page.locator('#screen-monotributos')).not.toContainText('Método de pago');

  const fila = page.locator('#tbody-mono-pagos tr', { hasText: 'FECHA PAGO REAL TEST' });
  // Fecha elegida a propósito distinta de "hoy" para confirmar que se usa
  // tal cual, no la fecha de la carga.
  await fila.locator('input[type="date"]').fill('2026-09-05');
  await fila.locator('text=Tildar pagado').click();
  await page.waitForTimeout(150);

  const filaPagada = page.locator('#tbody-mono-pagos tr', { hasText: 'FECHA PAGO REAL TEST' });
  await expect(filaPagada).toContainText('✓ Pagado');
  await expect(filaPagada).toContainText('5/9/2026');

  const pago = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(p => p.nombre === 'FECHA PAGO REAL TEST');
  });
  expect(pago.metodoPago).toBe('Manual');
  expect(pago.comprobanteFechaPago).toBe('2026-09-05');
});

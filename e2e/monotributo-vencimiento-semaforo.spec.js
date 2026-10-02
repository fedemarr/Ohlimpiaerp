import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §17/§18 (pedido de Martina): el
// vencimiento del mes activa el semáforo de estado de pago y la campanita.

function mesActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fechaISO(diasDesdeHoy) {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return d.toISOString().slice(0, 10);
}

test('Pago mensual — semáforo IMPAGO/A PAGAR/PAGADO según el vencimiento del mes', async ({ page }) => {
  await loginComoAdmin(page);
  const periodo = mesActualISO();
  const vencidoAyer = fechaISO(-1);
  const vencenEn10 = fechaISO(10);

  await page.evaluate(({ periodo, vencidoAyer }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoVencimientos = DB.monoVencimientos || [];
      DB.monoVencimientos.push({ id: Date.now(), periodo, fecha: vencidoAyer });
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push(
        { id: Date.now() + 1, periodo, nroSocio: '995801', nombre: 'SEMAFORO IMPAGO TEST', total: 40000, pagado: false, enRevision: false },
        { id: Date.now() + 2, periodo, nroSocio: '995802', nombre: 'SEMAFORO PAGADO TEST', total: 40000, pagado: true, comprobanteFechaPago: vencidoAyer, pagadoPor: 'Test', pagadoEn: new Date().toISOString(), enRevision: false },
      );
    });
  }, { periodo, vencidoAyer });

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(150);

  // El input de vencimiento refleja lo guardado, y el chip dice vencida.
  await expect(page.locator('#mono-pagos-vencimiento')).toHaveValue(vencidoAyer);
  await expect(page.locator('#mono-pagos-vto-chip')).toContainText('VENCIDA');

  const filaImpago = page.locator('#tbody-mono-pagos tr', { hasText: 'SEMAFORO IMPAGO TEST' });
  await expect(filaImpago).toContainText('IMPAGO');

  const filaPagado = page.locator('#tbody-mono-pagos tr', { hasText: 'SEMAFORO PAGADO TEST' });
  await expect(filaPagado).toContainText('✓ PAGADO');
  // Pagado el mismo día del vencimiento (no posterior) → no es "fuera de término".
  await expect(filaPagado).not.toContainText('fuera de término');

  // IMPAGO va arriba de la lista (orden del §18).
  const orden = await page.evaluate(() => [...document.querySelectorAll('#tbody-mono-pagos tr td:first-child')].map(td => td.textContent));
  const idxImpago = orden.findIndex(t => t.includes('SEMAFORO IMPAGO TEST'));
  const idxPagado = orden.findIndex(t => t.includes('SEMAFORO PAGADO TEST'));
  expect(idxImpago).toBeLessThan(idxPagado);

  // Cambiar el vencimiento a futuro: el IMPAGO pasa a "A PAGAR · vence en N d".
  await page.fill('#mono-pagos-vencimiento', vencenEn10);
  await page.evaluate(() => window.onChangeVencimientoMonoPagos());
  await page.waitForTimeout(150);
  await expect(filaImpago).toContainText('A PAGAR');
  await expect(filaImpago).toContainText('vence en');
  await expect(page.locator('#mono-kpi-res-m')).toContainText('vence en');
});

test('Pago mensual — pagar DESPUÉS del vencimiento marca "fuera de término"', async ({ page }) => {
  await loginComoAdmin(page);
  const periodo = mesActualISO();
  const vencidoAyer = fechaISO(-1);
  const pagoDeHoy = fechaISO(0);

  await page.evaluate(({ periodo, vencidoAyer, pagoDeHoy }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoVencimientos = DB.monoVencimientos || [];
      DB.monoVencimientos.push({ id: Date.now(), periodo, fecha: vencidoAyer });
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({ id: Date.now() + 1, periodo, nroSocio: '995803', nombre: 'FUERA DE TERMINO TEST', total: 40000, pagado: true, comprobanteFechaPago: pagoDeHoy, pagadoPor: 'Test', pagadoEn: new Date().toISOString(), enRevision: false });
    });
  }, { periodo, vencidoAyer, pagoDeHoy });

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(150);

  const fila = page.locator('#tbody-mono-pagos tr', { hasText: 'FUERA DE TERMINO TEST' });
  await expect(fila).toContainText('fuera de término');
});

test('Bandeja de Pendientes — la fecha límite default ya apunta al vencimiento del mes', async ({ page }) => {
  await loginComoAdmin(page);
  const periodo = mesActualISO();
  const vencimiento = fechaISO(15);

  await page.evaluate(({ periodo, vencimiento }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoVencimientos = DB.monoVencimientos || [];
      DB.monoVencimientos.push({ id: Date.now(), periodo, fecha: vencimiento });
      DB.legajos.push({ nro: 995804, nombre: 'DEFAULT VENCIMIENTO BANDEJA', dni: '30995804', estado: 'Activo', ingreso: '01/09/2026' });
    });
  }, { periodo, vencimiento });

  await page.evaluate(() => window.navTo('monotributos'));
  await page.waitForTimeout(200);

  const fila = page.locator('#tbody-mono-pendientes tr', { hasText: 'DEFAULT VENCIMIENTO BANDEJA' });
  await expect(fila.locator('input[type="date"]')).toHaveValue(vencimiento);
});

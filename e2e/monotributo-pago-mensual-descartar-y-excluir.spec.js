import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §11.b/§12.b: las dos acciones
// "más peligrosas" de Pago mensual (antes el mismo DELETE físico detrás de
// un confirm() nativo, con texto a veces contradictorio) pasan a ser dos
// acciones distintas, cada una con modal propio y sin borrar nada.

function mesActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test('Pago mensual — "Descartar" en En revisión: no borra la fila, solo la marca y la saca de la cola', async ({ page }) => {
  await loginComoAdmin(page);
  const periodo = mesActualISO();

  await page.evaluate((periodo) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({
        id: Date.now(), periodo, nombre: 'CUIT 27317513254 (no reconocido)',
        comprobanteTransaccion: 'T-999', total: 0, pagado: false, enRevision: true, enRevisionMotivo: 'CUIT no está en la lista',
      });
    });
  }, periodo);

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(150);

  const filaRevision = page.locator('#tbody-mono-en-revision tr', { hasText: 'CUIT 27317513254' });
  await expect(filaRevision).toBeVisible();

  await filaRevision.locator('text=🗑️ Descartar').click();
  await expect(page.locator('#modal-descartar-comp')).toBeVisible();
  await expect(page.locator('#descartar-comp-detalle')).toContainText('T-999');
  await page.fill('#descartar-comp-motivo', 'Ticket duplicado, ya aplicado en otra fila');
  await page.locator('#modal-descartar-comp').getByRole('button', { name: 'Descartar' }).click();
  await page.waitForTimeout(150);

  // Sale de la cola "En revisión"...
  await expect(page.locator('#tbody-mono-en-revision')).not.toContainText('27317513254');

  // ...pero la fila NO se borró — queda como registro.
  const estado = await page.evaluate(async (periodo) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(p => p.periodo === periodo && p.comprobanteTransaccion === 'T-999');
  }, periodo);
  expect(estado).toBeTruthy();
  expect(estado.descartado).toBe(true);
  expect(estado.descartadoMotivo).toContain('duplicado');
});

test('Pago mensual — "Excluir del mes": pide motivo, no borra la fila, es reversible y queda en Historial de cambios', async ({ page }) => {
  await loginComoAdmin(page);
  const periodo = mesActualISO();

  await page.evaluate((periodo) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({
        id: Date.now(), periodo, nroSocio: '995701', nombre: 'EXCLUIR DEL MES TEST',
        total: 40000, pagado: false, enRevision: false,
      });
    });
  }, periodo);

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(150);

  const fila = page.locator('#tbody-mono-pagos tr', { hasText: 'EXCLUIR DEL MES TEST' });
  await fila.getByRole('button', { name: 'Excluir del mes' }).click();
  await expect(page.locator('#modal-excluir-mes')).toBeVisible();
  const btnConfirmar = page.locator('#modal-excluir-mes').getByRole('button', { name: 'Excluir del mes' });

  // Sin motivo no deja confirmar.
  await btnConfirmar.click();
  await expect(page.locator('#modal-excluir-mes')).toBeVisible();

  await page.fill('#excluir-mes-motivo', 'Pidió exclusión este mes por licencia');
  await btnConfirmar.click();
  await page.waitForTimeout(150);

  // Sale de la lista principal...
  await expect(page.locator('#tbody-mono-pagos')).not.toContainText('EXCLUIR DEL MES TEST');
  // ...y aparece el contador de excluidos.
  await expect(page.locator('#mono-excluidos-mes-link')).toBeVisible();
  await expect(page.locator('#mono-excluidos-mes-link')).toContainText('1');

  const estado = await page.evaluate(async (periodo) => {
    const { DB } = await import('/src/shared/state.js');
    return {
      pago: DB.monoPagosMes.find(p => p.periodo === periodo && p.nombre === 'EXCLUIR DEL MES TEST'),
      cambio: (DB.monoCambios || []).find(c => c.nombre === 'EXCLUIR DEL MES TEST'),
    };
  }, periodo);
  expect(estado.pago.excluidoMes).toBe(true);
  expect(estado.pago.excluidoMesMotivo).toContain('licencia');
  expect(estado.cambio).toBeTruthy();
  expect(estado.cambio.tipo).toBe('excluido_mes');

  // Restaurar desde el modal de excluidos — vuelve a la lista.
  await page.click('#mono-excluidos-mes-link');
  await expect(page.locator('#modal-excluidos-mes')).toBeVisible();
  await page.click('text=↩️ Restaurar');
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-mono-pagos')).toContainText('EXCLUIR DEL MES TEST');
});

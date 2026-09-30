import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_v2_mes_en_curso_para_Fede.md, punto 1: "el alta del
// monotributo nace en el wizard de Alta de asociado, tab Constancia MT".
// TODO alta pasa por la bandeja de Monotributos — completa o no.

async function mockSupabaseGenerico(page) {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

async function llenarAltaMinima(page, { dni, nombre }) {
  await page.evaluate(() => window.abrirModalAlta());
  await expect(page.locator('#modal-alta-nuevo')).toBeVisible();
  await page.evaluate(() => window.tabAlta(0));
  await page.fill('#alt-nombre', nombre);
  await page.fill('#alt-dni', dni);
  await page.fill('#alt-cuit', '20' + dni + '9');
  await page.fill('#alt-tel', '1100000000');
  await page.fill('#alt-fec-ingreso', '2026-09-22');
  await page.evaluate(() => window.tabAlta(1));
  await page.fill('#alt-direccion', 'Calle Falsa 123');
  await page.selectOption('#alt-zona', 'CABA');
  await page.evaluate(() => window.tabAlta(2));
  await page.selectOption('#alt-funcion', { index: 1 });
  await page.selectOption('#alt-categoria', { index: 1 });
  await page.evaluate(() => window.tabAlta(3));
  await page.fill('#alt-calzado', '42');
  await page.evaluate(() => window.tabAlta(4));
  await page.fill('#alt-integracion', '1000');
  await page.evaluate(() => window.tabAlta(5));
  await page.selectOption('#alt-seguro', 'Básico');
}

test('Alta con datos completos de monotributo → bandeja con chip "completos"', async ({ page }) => {
  await mockSupabaseGenerico(page);
  await loginComoAdmin(page);
  await llenarAltaMinima(page, { dni: '40991001', nombre: 'Alta Mono Completa' });

  await page.evaluate(() => window.tabAlta(7));
  await page.fill('#alt-mt-fecha-inicio', '2026-09-01');
  await page.selectOption('#alt-mt-categoria', 'A');
  await page.selectOption('#alt-mt-zona', 'provincia');
  await page.selectOption('#alt-mt-iibb', 'no');
  await page.selectOption('#alt-mt-condicion', 'comun');
  await page.evaluate(() => window.recalcMontoAltaMT());
  await expect(page.locator('#alt-mt-destino')).toContainText('Datos completos');

  await page.evaluate(() => window.confirmarAlta());
  await page.waitForTimeout(250);

  const tramite = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const legajo = DB.legajos.find(l => l.dni === '40991001');
    return (DB.monoTramites || []).find(t => String(t.legajoNro) === String(legajo?.nro));
  });
  expect(tramite).toBeTruthy();
  expect(tramite.categoria).toBe('A');
  expect(tramite.zona).toBe('provincia');
  expect(tramite.condicion).toBe('comun');
  expect(tramite.iibbAporta).toBe(false);
  expect(tramite.fechaInicioMt).toBe('2026-09-01');

  await page.evaluate(() => window.navTo('monotributos'));
  await page.waitForTimeout(200);
  const fila = page.locator('#tbody-mono-pendientes tr', { hasText: 'Alta Mono Completa' });
  await expect(fila).toContainText('✔ completos');
  await expect(fila).toContainText('Subir comprobante');
});

test('Alta SIN condición elegida → bandeja con chip "faltan: condición" (no bloquea el alta)', async ({ page }) => {
  await mockSupabaseGenerico(page);
  await loginComoAdmin(page);
  await llenarAltaMinima(page, { dni: '40991002', nombre: 'Alta Mono Incompleta' });

  await page.evaluate(() => window.tabAlta(7));
  await page.fill('#alt-mt-fecha-inicio', '2026-09-01');
  await page.selectOption('#alt-mt-categoria', 'A');
  await page.selectOption('#alt-mt-zona', 'provincia');
  await page.selectOption('#alt-mt-iibb', 'no');
  // condición queda sin elegir a propósito
  await page.evaluate(() => window.recalcMontoAltaMT());
  await expect(page.locator('#alt-mt-destino')).toContainText('Faltan');
  await expect(page.locator('#alt-mt-destino')).toContainText('condición');

  await page.evaluate(() => window.confirmarAlta());
  await page.waitForTimeout(250);

  await page.evaluate(() => window.navTo('monotributos'));
  await page.waitForTimeout(200);
  const fila = page.locator('#tbody-mono-pendientes tr', { hasText: 'Alta Mono Incompleta' });
  await expect(fila).toContainText('faltan: condición');
});

test('Asoc. cooperativa solo existe para categoría A — se deshabilita y limpia al cambiar de categoría', async ({ page }) => {
  await mockSupabaseGenerico(page);
  await loginComoAdmin(page);
  await page.evaluate(() => window.abrirModalAlta());
  await page.evaluate(() => window.tabAlta(7));

  await page.selectOption('#alt-mt-categoria', 'A');
  await page.evaluate(() => window.recalcMontoAltaMT());
  await expect(page.locator('#alt-mt-opt-coop')).toBeEnabled();

  await page.selectOption('#alt-mt-condicion', 'asociado_cooperativa');
  await page.selectOption('#alt-mt-categoria', 'B');
  await page.evaluate(() => window.recalcMontoAltaMT());
  await expect(page.locator('#alt-mt-opt-coop')).toBeDisabled();
  const condicionVal = await page.locator('#alt-mt-condicion').inputValue();
  expect(condicionVal).toBe('');
});

import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §7: "los dos botones están
// muertos". Investigado: el modal de Importar tabla ni existía en el DOM
// (abrirModal() sobre un id inexistente) y el viejo "Importar"/"Nueva
// vigencia" escribían en DB.monoTablas, cuya clave NUNCA tiene entrada en
// _SM (a propósito) — supaSync hacía early-return silencioso, nada
// persistía. Se reconstruye para escribir en DB.monoTablasOrg (mono_tablas),
// la tabla real que calcularCuotaComponentes() usa.

async function mockRest(page) {
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

test('Importar tabla ARCA: valida A-K completo y creciente, con preview antes de confirmar, y afecta cuotas reales', async ({ page }) => {
  await mockRest(page);
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('categorias', null); });
  await page.waitForTimeout(150);

  // "+ Nueva vigencia" ya no existe.
  await expect(page.locator('#screen-monotributos')).not.toContainText('+ Nueva vigencia');

  await page.click('text=⬆️ Importar tabla');
  await expect(page.locator('#modal-importar-tabla')).toBeVisible();
  await page.fill('#import-vigencia', '2027-03');

  // Falta la categoría K a propósito — el preview tiene que marcarlo y
  // dejar el botón de confirmar deshabilitado.
  const filasIncompletas = ['A\t12000000\t5600\t18300\t25700', 'B\t17600000\t10600\t20100\t25700'].join('\n');
  await page.fill('#import-tabla-raw', filasIncompletas);
  await page.click('text=👁 Previsualizar');
  await expect(page.locator('#import-preview')).toContainText('Faltan categorías');
  await expect(page.locator('#import-tabla-btn-confirmar')).toBeDisabled();

  // Ahora las 11 completas, montos crecientes.
  const filasCompletas = [
    'A\t12009410.45\t5585.77\t18246.86\t25694.55',
    'B\t17595182.74\t10612.98\t20071.55\t25694.55',
    'C\t24670494.31\t18246.86\t22078.71\t25694.55',
    'D\t30628651.43\t29790.79\t24286.58\t30535.56',
    'E\t36028231.33\t55857.73\t26715.24\t37238.48',
    'F\t45151659.41\t78573.20\t29386.76\t42824.25',
    'G\t53995798.87\t142995.76\t41141.46\t46175.72',
    'H\t81924660.37\t409623.31\t57598.04\t55485.33',
    'I\t91699761.90\t814591.79\t80637.26\t68518.81',
    'J\t105012519.20\t977510.14\t112892.16\t76897.46',
    'K\t126610838.75\t1368514.20\t158049.02\t87882.82',
  ].join('\n');
  await page.fill('#import-tabla-raw', filasCompletas);
  await page.click('text=👁 Previsualizar');
  await expect(page.locator('#import-preview')).toContainText('11 categorías detectadas');
  await expect(page.locator('#import-tabla-btn-confirmar')).toBeEnabled();

  await page.click('#import-tabla-btn-confirmar');
  await page.waitForTimeout(250);

  await expect(page.locator('#modal-importar-tabla')).toBeHidden();

  const resultado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const filaA = DB.monoTablasOrg.find(t => t.organismo === 'ARCA' && t.categoria === 'A' && t.vigenciaDesde === '2027-03-01');
    const persona = { categoria: 'A', condicion: 'comun', zona: 'provincia', iibbAporta: false, adherentesCantidad: 0 };
    const cuota = window.calcularCuotaComponentes(persona, '2027-03-01');
    const cambio = (DB.monoCambios || []).find(c => c.tipo === 'tabla_importada');
    return { filaA, totalCuota: cuota.total, cambio, vigenciaActual: window.getVigenciaActual ? null : undefined };
  });
  expect(resultado.filaA).toBeTruthy();
  expect(resultado.filaA.impuestoIntegrado).toBeCloseTo(5585.77, 1);
  // La cuota real para esa vigencia SALE de la tabla recién importada —
  // no es un número decorativo.
  expect(resultado.totalCuota).toBeCloseTo(5585.77 + 18246.86 + 25694.55, 1);
  expect(resultado.cambio).toBeTruthy();
  expect(resultado.cambio.despues).toContain('ARCA');
});

test('Importar tabla ARBA: aparece en el tab IIBB — Provincia', async ({ page }) => {
  await mockRest(page);
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('categorias', null); });
  await page.waitForTimeout(150);

  await page.click('text=⬆️ Importar tabla');
  await page.selectOption('#import-tabla-tipo', 'ARBA');
  await page.fill('#import-vigencia', '2027-03');
  const filas = ['A\t11505', 'B\t18720', 'C\t29260', 'D\t40685', 'E\t53850', 'F\t76250', 'G\t103490', 'H\t140000', 'I\t180000', 'J\t220000', 'K\t260000'].join('\n');
  await page.fill('#import-tabla-raw', filas);
  await page.click('text=👁 Previsualizar');
  await expect(page.locator('#import-tabla-btn-confirmar')).toBeEnabled();
  await page.click('#import-tabla-btn-confirmar');
  await page.waitForTimeout(250);

  await page.evaluate(() => { window.tabMonoIibb('ARBA'); });
  await page.waitForTimeout(150);
  await expect(page.locator('#mono-tabla-iibb-body')).toContainText('11.505');
});

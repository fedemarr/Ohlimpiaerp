import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// GESTION_HORAS_carga_directa_para_Fede.md: la matriz de Gestión de
// horas pasa a mostrar TODOS los servicios operativos (antes solo
// entraban los que ya tenían Personal necesario cargado en el alta —
// 4 de ~200). Los que no tienen regla aparecen con "⚠ sin regla" y
// celdas "—" (nunca "0"), y "＋ Cargar regla" crea la vigencia inicial
// directo desde la matriz, sin pasar por el alta ni por un import.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('Un servicio operativo sin Personal necesario aparece igual, con "⚠ sin regla" y celdas "—"', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990980001, codigo: 'HOR.SINREGLA.1', nombre: 'Servicio Sin Regla Test', estado: 'Operativo', anulado: false,
      puestos: [], // el ~200 histórico: operativo, pero nunca tuvo Personal necesario
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);

  const fila = page.locator('#hor-tbody tr', { hasText: 'HOR.SINREGLA.1' });
  await expect(fila).toContainText('⚠ sin regla');
  await expect(fila.locator('td.hor-hs').first()).toHaveText('—');
  await expect(page.locator('#hor-resumen')).toContainText('servicios sin regla');
});

test('"＋ Cargar regla" crea la vigencia inicial directo desde la matriz — sin pasar por el alta', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990980002, codigo: 'HOR.CARGADIRECTA.1', nombre: 'Servicio Carga Directa Test', estado: 'Operativo', anulado: false,
      puestos: [],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);

  await page.evaluate(() => window.toggleDetalleHoras('HOR.CARGADIRECTA.1'));
  await page.waitForTimeout(100);
  const det = page.locator('tr.hor-det');
  await expect(det).toContainText('todavía no tiene ninguna regla');
  await det.locator('button:has-text("＋ Cargar regla")').click();

  await expect(page.locator('#modal-vigencia-horas')).toBeVisible();
  await expect(page.locator('#hor-vig-titulo')).toContainText('＋ Cargar regla');
  await expect(page.locator('#hor-vig-motivo')).toHaveValue('Carga inicial manual');
  // Sin restricción de "solo futuro" — el select tiene que ofrecer
  // también meses pasados (el servicio ya viene operativo hace rato).
  const mesActual = new Date().toISOString().slice(0, 7);
  await expect(page.locator('#hor-vig-desde')).toHaveValue(mesActual);
  const opcionesPasadas = await page.locator('#hor-vig-desde option').count();
  expect(opcionesPasadas).toBeGreaterThan(6); // más que la ventana "solo futuro" de Nueva vigencia

  await page.evaluate(() => window.agregarPuestoHoras());
  await page.evaluate(() => {
    window.EDIT_PUESTOS[0].puesto = 'Operario A';
    window.EDIT_PUESTOS[0].cantidad = 1;
    window.EDIT_PUESTOS[0].horarioDesde = '08:00';
    window.EDIT_PUESTOS[0].horarioHasta = '16:00';
    window.EDIT_PUESTOS[0].dias = { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true };
    window.previewVigenciaHoras();
  });
  await page.click('button:has-text("Guardar regla inicial")');
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-vigencia-horas')).toBeHidden();

  const fila = page.locator('#hor-tbody tr', { hasText: 'HOR.CARGADIRECTA.1' });
  await expect(fila).not.toContainText('⚠ sin regla');
  // La ventana muestra 2 meses hacia atrás — la vigencia arranca en el
  // mes actual (índice 2), así que esa es la primera celda con número.
  await expect(fila.locator('td.hor-hs').nth(2)).not.toHaveText('—');

  const vigencia = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.horasVigencias.find(v => v.objCodigo === 'HOR.CARGADIRECTA.1');
  });
  expect(vigencia.origen).toBe('manual');
  expect(vigencia.motivo).toBe('Carga inicial manual');
});

test('Un servicio recién sembrado (backfill) muestra "—" en los meses anteriores a su primera vigencia, no "0"', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990980003, codigo: 'HOR.BACKFILLVENTANA.1', nombre: 'Servicio Backfill Ventana Test', estado: 'Operativo', anulado: false,
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);

  // El backfill siembra vigenteDesde = mes actual — las 2 columnas
  // anteriores (VENTANA_ATRAS) quedan sin vigencia: tienen que ser "—",
  // no "0" (antes de este ticket mostraban 0, un dato inventado).
  const fila = page.locator('#hor-tbody tr', { hasText: 'HOR.BACKFILLVENTANA.1' });
  const primeraCeldaHs = fila.locator('td.hor-hs').first();
  await expect(primeraCeldaHs).toHaveText('—');
});

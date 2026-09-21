import { test, expect } from '@playwright/test';
import { loginComoAdmin, inyectarLegajo } from './helpers.js';

// Legajos — baja con motivo obligatorio y documento de respaldo (carta
// documento). Escenario de referencia: socio 5248 · Pérez Sergio, exclusión.
// Storage y REST de Supabase se interceptan: acá se prueba la lógica de la
// pantalla, no el servidor.
async function preparar(page) {
  const subidas = [];
  await page.route('**/storage/v1/object/**', async route => {
    subidas.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"ohlimpia-adjuntos/x"}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'POST' && url.pathname.endsWith('/adjuntos')) {
      const b = JSON.parse(req.postData() || '{}');
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 1, ...b }) });
    }
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' });
  });
  await loginComoAdmin(page);
  const legajo = await inyectarLegajo(page, { nro: 5248, nombre: 'PEREZ Sergio Gustavo', dni: '20111222' });
  await page.evaluate((nro) => { window.verLegajo(nro); }, legajo.nro);
  await page.evaluate(() => window.editarLegajoActual());
  return { subidas };
}

test('Baja — el bloque de motivo/respaldo aparece solo con Estado = Baja', async ({ page }) => {
  await preparar(page);
  await expect(page.locator('#edit-baja-detalle')).toBeHidden();
  await page.selectOption('#edit-estado', 'Baja');
  await expect(page.locator('#edit-baja-detalle')).toBeVisible();
  await expect(page.locator('#edit-motivo-baja')).toBeVisible();
  await expect(page.locator('#edit-baja-archivo')).toBeVisible();
  await page.selectOption('#edit-estado', 'Activo');
  await expect(page.locator('#edit-baja-detalle')).toBeHidden();
});

test('Baja — sin motivo no se guarda; con motivo y CD se sube el archivo y se ve en el detalle', async ({ page }) => {
  const { subidas } = await preparar(page);
  await page.selectOption('#edit-estado', 'Baja');
  await page.selectOption('#edit-estado-legal', 'Exclusión');
  await page.fill('#edit-fecha-baja', '2026-09-16');

  // 1) Sin motivo: bloquea, no cambia el legajo ni sube nada.
  await page.evaluate(() => window.guardarEdicionLegajo());
  await expect(page.locator('.toast, #toast').first()).toContainText('motivo de la baja');
  expect(await page.evaluate(async () => (await import('/src/shared/state.js')).DB.legajos.find(l => l.nro === 5248).estado)).toBe('Activo');
  expect(subidas).toHaveLength(0);

  // 2) Archivo de tipo no permitido: bloquea.
  await page.fill('#edit-motivo-baja', 'Expulsión por Acta N° 526 (art. 13 inc. D y 15 inc. C y D)');
  await page.setInputFiles('#edit-baja-archivo', { name: 'nota.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('x') });
  await page.evaluate(() => window.guardarEdicionLegajo());
  await expect(page.locator('.toast, #toast').first()).toContainText('formato no permitido');
  expect(subidas).toHaveLength(0);

  // 3) Motivo + carta documento en PDF: sube, guarda motivo y estado.
  await page.setInputFiles('#edit-baja-archivo', { name: 'CD EXPULSION PEREZ.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.evaluate(() => window.guardarEdicionLegajo());
  await expect(page.locator('#modal-editar-legajo')).toBeHidden();
  expect(subidas).toHaveLength(1);
  expect(subidas[0]).toContain('/ohlimpia-adjuntos/20111222/');
  const l = await page.evaluate(async () => {
    const x = (await import('/src/shared/state.js')).DB.legajos.find(l => l.nro === 5248);
    return { estado: x.estado, motivo: x.motivoBaja, legal: x.estadoLegal };
  });
  expect(l).toEqual({ estado: 'Baja', motivo: 'Expulsión por Acta N° 526 (art. 13 inc. D y 15 inc. C y D)', legal: 'Exclusión' });

  // 4) El detalle muestra el motivo.
  await page.evaluate(() => window.verLegajo(5248));
  await expect(page.locator('#legajo-body')).toContainText('Motivo de la baja');
  await expect(page.locator('#legajo-body')).toContainText('Acta N° 526');
});

test('Baja — editar una baja ya registrada no exige volver a cargar el motivo', async ({ page }) => {
  await preparar(page);
  await page.evaluate(async () => {
    const l = (await import('/src/shared/state.js')).DB.legajos.find(x => x.nro === 5248);
    l.estado = 'Baja'; l.fechaBaja = '16/9/2026'; l.motivoBaja = '';
    window.editarLegajoActual();
  });
  await page.fill('#edit-tel', '1155555555');
  await page.evaluate(() => window.guardarEdicionLegajo());
  await expect(page.locator('#modal-editar-legajo')).toBeHidden();
});

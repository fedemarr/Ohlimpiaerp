import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §11/§23: detección de
// duplicados por N° de transacción (no solo por CUIT) y "el período lo
// decide el TICKET, no la ventana" — caso real: Lautaro subió tickets de
// septiembre con la pantalla parada en octubre.

async function mockInfra(page, { respuestasPorArchivo }) {
  await page.route('**/api/analizar-documento', (route) => {
    const body = respuestasPorArchivo.shift();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}
async function stubSesionYStorage(page) {
  await page.evaluate(async () => {
    const { SUPA } = await import('/src/shared/supabase.js');
    SUPA.auth.getSession = async () => ({ data: { session: { access_token: 'fake-token' } } });
    SUPA.storage.from = () => ({
      upload: async (path) => ({ data: { path }, error: null }),
      createSignedUrl: async (path) => ({ data: { signedUrl: 'https://fake-signed.test/' + path }, error: null }),
    });
  });
}
function mesActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAnteriorISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesMMAAAA(iso) {
  const [yy, mm] = iso.split('-');
  return `${mm}/${yy}`;
}

test('Lote — un N° de transacción ya aplicado a una fila pagada se ignora (no entra a revisión, no se tilda de nuevo)', async ({ page }) => {
  const periodo = mesActualISO();
  await mockInfra(page, { respuestasPorArchivo: [
    { cuit: '20995901005', periodo: mesMMAAAA(periodo), importe: 40000, fechaPago: '2026-09-05', transaccion: 'T-YA-APLICADA', confianza: 'alta' },
  ] });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  await page.evaluate(({ periodo }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      // Ya pagada en una corrida anterior, con esa misma transacción.
      DB.monoPagosMes.push({ id: 1, periodo, nroSocio: '995901', nombre: 'YA APLICADA TEST', total: 40000, pagado: true, comprobanteTransaccion: 'T-YA-APLICADA' });
      // Otra fila pendiente, NO debería tocarse por este comprobante repetido.
      DB.monoPagosMes.push({ id: 2, periodo, nroSocio: '995902', nombre: 'OTRA PERSONA TEST', total: 40000, pagado: false });
      DB.legajos.push({ nro: 995901, nombre: 'YA APLICADA TEST', cuit: '20995901005', estado: 'Activo' });
    });
  }, { periodo });

  const resumen = await page.evaluate(async (periodo) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const files = [new File(['a'], 'repetido.pdf', { type: 'application/pdf' })];
    return mod.confirmarComprobantesLotePagoMensual(files, periodo);
  }, periodo);

  expect(resumen.yaAplicados).toBe(1);
  expect(resumen.tildados).toBe(0);
  expect(resumen.enRevision).toBe(0);

  const otra = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(p => p.id === 2);
  });
  expect(otra.pagado).toBe(false);
});

test('Lote — el período lo decide el ticket: con la pantalla en un mes, un comprobante de OTRO mes ya armado se aplica igual a su propio período', async ({ page }) => {
  const periodoPantalla = mesActualISO();
  const periodoTicket = mesAnteriorISO();
  await mockInfra(page, { respuestasPorArchivo: [
    { cuit: '20995903005', periodo: mesMMAAAA(periodoTicket), importe: 40000, fechaPago: periodoTicket + '-05', transaccion: 'T-MES-VIEJO', confianza: 'alta' },
  ] });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  await page.evaluate(({ periodoTicket }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      // La lista de ESE mes anterior ya está armada, con la fila pendiente.
      DB.monoPagosMes.push({ id: 3, periodo: periodoTicket, nroSocio: '995903', nombre: 'MES VIEJO TEST', total: 40000, pagado: false });
      DB.legajos.push({ nro: 995903, nombre: 'MES VIEJO TEST', cuit: '20995903005', estado: 'Activo' });
    });
  }, { periodoTicket });

  // La pantalla está en el mes ACTUAL, pero se sube un ticket del mes anterior.
  const resumen = await page.evaluate(async (periodoPantalla) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const files = [new File(['a'], 'mes-viejo.pdf', { type: 'application/pdf' })];
    return mod.confirmarComprobantesLotePagoMensual(files, periodoPantalla);
  }, periodoPantalla);

  expect(resumen.tildados).toBe(1);
  expect(Object.keys(resumen.porPeriodo)).toContain(periodoTicket);

  const fila = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(p => p.id === 3);
  });
  expect(fila.pagado).toBe(true);
});

test('Lote — período sin lista armada queda en revisión con motivo específico (no se inventa una lista)', async ({ page }) => {
  const periodoPantalla = mesActualISO();
  const periodoSinArmar = '2020-01'; // no existe ninguna fila de ese período
  await mockInfra(page, { respuestasPorArchivo: [
    { cuit: '20995904005', periodo: mesMMAAAA(periodoSinArmar), importe: 40000, fechaPago: periodoSinArmar + '-05', transaccion: 'T-SIN-ARMAR', confianza: 'alta' },
  ] });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  const resumen = await page.evaluate(async (periodoPantalla) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const files = [new File(['a'], 'sin-armar.pdf', { type: 'application/pdf' })];
    return mod.confirmarComprobantesLotePagoMensual(files, periodoPantalla);
  }, periodoPantalla);

  expect(resumen.enRevision).toBe(1);
  const fila = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(p => (p.enRevisionMotivo || '').includes('no está armada'));
  });
  expect(fila).toBeTruthy();
});

test('Lote — progreso visible: el botón se deshabilita mientras procesa y se re-habilita al terminar', async ({ page }) => {
  const periodo = mesActualISO();
  await mockInfra(page, { respuestasPorArchivo: [
    { cuit: '20995905005', periodo: mesMMAAAA(periodo), importe: 40000, fechaPago: periodo + '-05', transaccion: 'T-PROGRESO', confianza: 'alta' },
  ] });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  await page.evaluate(({ periodo }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({ id: 5, periodo, nroSocio: '995905', nombre: 'PROGRESO TEST', total: 40000, pagado: false });
      DB.legajos.push({ nro: 995905, nombre: 'PROGRESO TEST', cuit: '20995905005', estado: 'Activo' });
    });
  }, { periodo });

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(150);

  // Simula el click real del botón (dispara elegirVariosArchivosComprobante
  // → file input nativo) con el filechooser de Playwright.
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#mono-lote-btn'),
  ]);
  await fileChooser.setFiles([{ name: 'progreso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') }]);

  await expect(page.locator('#mono-lote-btn')).toBeDisabled();
  await expect(page.locator('#mono-lote-progreso')).toBeVisible();

  await expect(page.locator('#mono-lote-btn')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#tbody-mono-pagos')).toContainText('✓ PAGADO');
});

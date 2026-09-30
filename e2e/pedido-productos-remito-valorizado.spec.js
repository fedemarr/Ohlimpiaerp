import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// REMITO_valorizado_para_Fede.md (30/09/2026, Lautaro): el remito de
// Entregas (Pedido de productos → Logística) pasa a ser VALORIZADO
// siempre (antes decía "sin precios" para todos los servicios, PAGAN y NO
// PAGAN por igual) — mismo criterio que la consignación de Tango que ya
// se entrega hoy: código de producto, precio, importe, cliente+CUIT,
// subtotal/impuesto informativo/total.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('El remito impreso muestra código, precio, importe, cliente+CUIT y los totales (ya no "sin precios")', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.clientes = DB.clientes || [];
    DB.clientes.push({ id: 7701, nombre: 'Chango Mas', cuit: '30-71497386-6' });
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 7710, codigo: 'E2E.REMITO.1', nombre: 'Chango Pergamino E2E', estado: 'Operativo', anulado: false,
      clienteId: 7701, localidad: 'Pergamino', supervisor: 'Lorena Unzain',
    });
    DB.ppProductos = DB.ppProductos || [];
    DB.ppProductos.push({ id: 7720, descripcion: '8M Express cera x 5 Lts.', codigoMonica: '1000210', anulado: false });
    DB.ppPrecios = DB.ppPrecios || [];
    // productoIdLocal/pedidoIdLocal usan el mismo criterio que _idTrunc()
    // real: String(id).slice(-9) — con ids cortos como estos, es el mismo
    // string sin ceros a la izquierda (a diferencia de un id_local real
    // truncado desde un Date.now() de 13 dígitos).
    DB.ppPrecios.push({ id: 7721, productoIdLocal: '7720', costoUnit: 100, vigenciaDesde: '2020-01-01', vigenciaHasta: null, anulado: false });
    DB.stockProductos = DB.stockProductos || [];
    DB.stockProductos.push({ productoIdLocal: '7720', cantidad: 20 });
    DB.ppPedidos = DB.ppPedidos || [];
    DB.ppPedidos.push({
      id: 7730, periodoIdLocal: '1', servicioCodigo: 'E2E.REMITO.1',
      estado: 'confirmado', tipoPedido: 'mensual', anulado: false,
    });
    DB.ppItems = DB.ppItems || [];
    DB.ppItems.push({
      id: 7740, pedidoIdLocal: '7730', productoIdLocal: '7720',
      cantSolicitada: 5, cantAutorizada: null, armado: true, anulado: false,
    });
  });

  // Arma directo (el checklist ya viene tildado en la fixture) y genera el
  // remito — el foco del test es la impresión valorizada, no el checklist.
  await page.evaluate(() => window.abrirArmadoPedidoPP('7730'));
  await page.evaluate(() => window.generarRemitoPP());
  await page.waitForTimeout(150);

  const remitoId = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.ppRemitos.find(r => r.servicioCodigo === 'E2E.REMITO.1')?.id;
  });
  expect(remitoId).toBeTruthy();

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.evaluate((id) => window.imprimirRemitoPP(id), remitoId),
  ]);
  await popup.waitForLoadState('domcontentloaded');

  const texto = await popup.locator('body').innerText();
  // Ya no dice "sin precios".
  expect(texto).not.toContain('Sin precios');
  expect(texto).toContain('Valorizado a precios de lista');
  // Código, cliente+CUIT.
  expect(texto).toContain('1000210');
  expect(texto).toContain('Chango Mas');
  expect(texto).toContain('30-71497386-6');
  // costo 100 × recargo default 30% = 130 de precio; 5 × 130 = 650 de importe.
  expect(texto).toContain('130,00');
  expect(texto).toContain('650,00');
  // Subtotal = Total (el IVA es informativo, ya incluido en el precio).
  expect(texto).toMatch(/Subtotal[\s\S]*650,00/);
  expect(texto).toMatch(/TOTAL \$[\s\S]*650,00/);

  await popup.close();
});

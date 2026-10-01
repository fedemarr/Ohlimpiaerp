import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// SERVICIO_LOGISTICA_v2_para_Fede.md + mockup_servicio_logistica_v2_2.html —
// tab Logística del modal "Editar servicio": la Facturación de productos
// pasa a HEREDARSE del cliente (antes había un select propio desincronizado
// — el bug real de "Ascensores dice SE FACTURA y el servicio muestra —"),
// la selección múltiple de ítems se reemplaza por 3 checkboxes de concepto
// (Productos es funcional: gobierna la entrada a Pedido de productos), los
// 3 textos libres viejos se reemplazan por una única Notas de logística, y
// el texto viejo sin repartir queda visible en un recuadro de migración.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

async function sembrarClienteYServicio(page, { clienteId, productosEnFactura, codigo, overrides = {} }) {
  return page.evaluate(({ clienteId, productosEnFactura, codigo, overrides }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      const cli = { id: clienteId, razon: 'Cliente Logistica Test', nombre: 'Cliente Logistica Test', cuit: '30-9-9', estado: 'Activo', ciudad: 'Recoleta', direccion: 'Av. Test 1', productosEnFactura, contactos: [] };
      DB.clientes.push(cli);
      const o = {
        id: Date.now(), codigo, nombre: 'Servicio Logistica Test', clienteId, clienteIdLocal: String(clienteId).slice(-9),
        estado: 'Operativo', anulado: false, tipo: 'Limpieza', localidad: 'Palermo', jurisdiccion: 'CABA',
        dir: 'Test 1', fechaInicio: '01/09/2026', modeloPrecio: 'Por horas variables', efts: 100, valorHora: 1000, valor: 100000,
        contrato: 'Sin contrato', puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true } }],
        heredado: {}, responsables: [], adjuntos: [],
        ...overrides,
      };
      DB.objetivos.push(o);
      return { cliente: cli, objetivo: o };
    });
  }, { clienteId, productosEnFactura, codigo, overrides });
}

async function abrirEditarServicio(page, codigo) {
  await page.evaluate((codigo) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      const o = DB.objetivos.find(x => x.codigo === codigo);
      window.navTo('objetivos');
      window.abrirModalObjetivo(String(o.id).slice(-9));
    });
  }, codigo);
  await page.click('#modal-objetivo .tab-btn:has-text("Logística")');
}

test('Bug Ascensores: la Facturación de productos se hereda sola del cliente — nunca "—" si el cliente ya lo tiene cargado', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  // Simula el caso real: un servicio YA EXISTENTE, cargado antes de este
  // campo (facturacionProductos nunca se guardó) — exactamente la
  // situación de Ascensores el día del reporte.
  await sembrarClienteYServicio(page, { clienteId: 991100001, productosEnFactura: 'SE FACTURA', codigo: 'SERV.ASC.E2E' });

  // 1) La ficha de detalle, SIN tocar nada, ya no muestra "—" — usa el
  // fallback al cliente (verObjetivo) en vez del viejo o.productos.
  const idl = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return String(DB.objetivos.find(x => x.codigo === 'SERV.ASC.E2E').id).slice(-9);
  });
  await page.evaluate((idl) => { window.navTo('objetivos'); window.verObjetivo(idl); }, idl);
  await expect(page.locator('#pedido-body')).toContainText('SE FACTURA (PAGAN)');
  await expect(page.locator('#pedido-body')).not.toContainText('Facturación de productos</div><div class="val">—');
  await page.evaluate(() => window.cerrarModal('modal-ver-pedido'));

  // 2) Al abrir "Editar servicio" el campo aparece HEREDADO y deshabilitado
  // (todavía no se re-guardó, por eso no tiene un valor propio cargado).
  await abrirEditarServicio(page, 'SERV.ASC.E2E');
  await expect(page.locator('#her-facturacion-productos')).toContainText('HEREDADO');
  await expect(page.locator('#obj-facturacion-productos')).toHaveJSProperty('disabled', true);

  // 3) Al guardar, aplicarHerenciasDeCliente copia el valor vivo del
  // cliente — de ahí en más el servicio ya tiene su propio registro.
  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(150);

  const o = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(x => x.codigo === 'SERV.ASC.E2E');
  });
  expect(o.facturacionProductos).toBe('SE FACTURA');
  expect(o.heredado['obj-facturacion-productos']).toBe(true);
});

test('"Hacer propio" guarda el override; "Volver a heredar" recupera el valor vivo del cliente', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarClienteYServicio(page, { clienteId: 991100002, productosEnFactura: 'SE FACTURA', codigo: 'SERV.PROPIO.E2E' });

  await abrirEditarServicio(page, 'SERV.PROPIO.E2E');
  await page.click('#her-facturacion-productos');
  await expect(page.locator('#her-facturacion-productos')).toContainText('PROPIO');
  await expect(page.locator('#obj-facturacion-productos')).toHaveJSProperty('disabled', false);
  await page.selectOption('#obj-facturacion-productos', 'NO SE FACTURA');
  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(150);

  let o = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(x => x.codigo === 'SERV.PROPIO.E2E');
  });
  expect(o.facturacionProductos).toBe('NO SE FACTURA');
  expect(o.heredado['obj-facturacion-productos']).toBe(false);

  // Reabrir: debe mostrar el override PROPIO, no el del cliente.
  await abrirEditarServicio(page, 'SERV.PROPIO.E2E');
  await expect(page.locator('#her-facturacion-productos')).toContainText('PROPIO');
  await expect(page.locator('#obj-facturacion-productos')).toHaveValue('NO SE FACTURA');

  await page.click('#obj-fact-prod-volver');
  await expect(page.locator('#her-facturacion-productos')).toContainText('HEREDADO');
  await expect(page.locator('#obj-facturacion-productos')).toHaveValue('SE FACTURA');
  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(150);

  o = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(x => x.codigo === 'SERV.PROPIO.E2E');
  });
  expect(o.facturacionProductos).toBe('SE FACTURA');
  expect(o.heredado['obj-facturacion-productos']).toBe(true);
});

test('Checkbox "Productos de limpieza" destildado: pasa a "no aplica", no entra a Pedido de productos', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarClienteYServicio(page, { clienteId: 991100003, productosEnFactura: 'SE FACTURA', codigo: 'SERV.SINPROD.E2E' });

  await abrirEditarServicio(page, 'SERV.SINPROD.E2E');
  await page.click('#obj-ck-productos'); // destildar
  await expect(page.locator('#obj-facturacion-productos')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#obj-facturacion-productos')).toContainText('NO LLEVA PRODUCTOS');
  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(150);

  const o = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(x => x.codigo === 'SERV.SINPROD.E2E');
  });
  expect(o.llevaProductos).toBe(false);
  expect(o.facturacionProductos).toBe(''); // estado derivado, nunca una 3ra opción cargada

  // No recibe pedido al abrir un período nuevo (mismo mecanismo que tercerizado).
  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.ppPeriodos = [];
      DB.ppPedidos = [];
      window.navTo('pedido_productos');
    });
  });
  await page.waitForTimeout(700);
  await page.locator('#pp-tab-btn-periodos').click();
  await page.waitForTimeout(200);
  await page.fill('#pp-periodo-nuevo', '2027-06');
  await page.fill('#pp-periodo-cierre', '2027-06-30T17:00');
  await page.evaluate(() => window.abrirPeriodoPP());
  await page.waitForTimeout(1500);

  const pedidos = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.ppPedidos || []).map(p => p.servicioCodigo);
  });
  expect(pedidos).not.toContain('SERV.SINPROD.E2E');
});

test('Recuadro de migración: texto viejo visible hasta confirmar — "marcar migrado" lo saca y queda en el historial', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarClienteYServicio(page, {
    clienteId: 991100004, productosEnFactura: 'SE FACTURA', codigo: 'SERV.LEGACY.E2E',
    overrides: { logProductos: 'SE FACTURA | Envía remito: SÍ', logElementos: '', logMaquinas: '' },
  });

  await abrirEditarServicio(page, 'SERV.LEGACY.E2E');
  await expect(page.locator('#obj-logistica-legacy')).toBeVisible();
  await expect(page.locator('#obj-logistica-legacy-txt')).toContainText('SE FACTURA');
  await expect(page.locator('#obj-logistica-legacy-txt')).toContainText('Envía remito');

  await page.click('text=✔ Ya repartido — marcar migrado');
  await page.waitForTimeout(150);
  await expect(page.locator('#obj-logistica-legacy')).toBeHidden();

  const { o, eventos } = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const obj = DB.objetivos.find(x => x.codigo === 'SERV.LEGACY.E2E');
    const idl = String(obj.id).slice(-9);
    return { o: obj, eventos: (DB.objetivoEventos || []).filter(e => e.objetivoIdLocal === idl) };
  });
  expect(o.logisticaMigrado).toBe(true);
  expect(o.logProductos).toBe('SE FACTURA | Envía remito: SÍ'); // nunca se borra el texto viejo
  expect(eventos.some(e => e.estadoHasta === 'logistica_migrado')).toBe(true);

  // Reabrir: el recuadro no vuelve a aparecer.
  await abrirEditarServicio(page, 'SERV.LEGACY.E2E');
  await expect(page.locator('#obj-logistica-legacy')).toBeHidden();
});

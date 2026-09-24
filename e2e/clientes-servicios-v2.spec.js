import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// CLIENTES_SERVICIOS_v2_para_Fede.md + ALTA_CLIENTE_SERVICIO_para_Fede_1.md
// + mockup_nuevo_cliente_v2_2.html + mockup_alta_cliente_servicio_3.html.
// Modal Nuevo cliente: 4 tabs → 3 (podas de campos, Coordinador de cuenta
// reemplaza a Responsable, Localidad pasa a desplegable). Modal Nuevo
// servicio: Localidad/Jurisdicción se unifican en un solo select, se
// extiende el patrón "Heredar del cliente" (chip HEREDADO/PROPIO) a más
// bloques, y Responsables del cliente pasa de carga libre a selección de
// los contactos ya cargados en el cliente. Flujo encadenado nuevo:
// Guardar cliente → "¿Cargar su primer servicio ahora?" → servicio con
// cliente fijo y herencias precargadas → loop "¿Otro servicio?".

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('Modal Nuevo cliente — 3 tabs, campos podados, Localidad es desplegable', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('clientes'); window.abrirModalCliente(); });
  await expect(page.locator('#modal-cliente')).toBeVisible();

  const tabs = page.locator('#modal-cliente .tab-btn');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveText('Datos generales');
  await expect(tabs.nth(1)).toHaveText('Contactos');
  await expect(tabs.nth(2)).toHaveText('Impositivo y facturación');

  // Campos eliminados (URL logo, Estado, Categoría ARCA, Ingresos brutos,
  // Jurisdicción IIBB, checkbox OC duplicado) ya no existen en el DOM.
  for (const id of ['cli-logo', 'cli-estado', 'cli-arca', 'cli-ib', 'cli-jur', 'doc-oc']) {
    await expect(page.locator('#' + id)).toHaveCount(0);
  }
  // Localidad / Ciudad pasó de texto libre a <select>.
  await expect(page.locator('#cli-ciudad')).toHaveCount(1);
  const tagName = await page.locator('#cli-ciudad').evaluate((el) => el.tagName);
  expect(tagName).toBe('SELECT');

  // Coordinador de cuenta reemplaza a Responsable.
  await expect(page.locator('#cli-coord-tipo')).toBeVisible();
  await expect(page.locator('#cli-coord')).toBeVisible();
  await expect(page.locator('#cli-responsable')).toHaveCount(0);
});

test('Guardar cliente nuevo — persiste Tipo de factura y Coordinador de cuenta; Localidad se guarda del select', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('clientes'); window.abrirModalCliente(); });
  await page.fill('#cli-razon', 'Cliente E2E SRL');
  await page.selectOption('#cli-ciudad', 'Palermo');
  await page.selectOption('#cli-coord-tipo', 'Interno');
  await page.fill('#cli-coord', 'Uballes Alvaro Jesus');
  // CUIT y Tipo de factura viven en el tab "Impositivo y facturación".
  await page.click('#modal-cliente .tab-btn:has-text("Impositivo y facturación")');
  await page.fill('#cli-cuit', '30-11111111-1');
  await page.selectOption('#cli-tipo-factura', 'B');
  await page.click('button:has-text("Guardar cliente")');
  await page.waitForTimeout(150);

  const cliente = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.clientes.find(c => c.cuit === '30-11111111-1');
  });
  expect(cliente).toBeTruthy();
  expect(cliente.estado).toBe('Activo'); // el alta activa al cliente, sin campo en el form
  expect(cliente.ciudad).toBe('Palermo');
  expect(cliente.tipoFactura).toBe('B');
  expect(cliente.coordinadorCuenta).toBe('Uballes Alvaro Jesus');
  expect(cliente.coordinadorCuentaTipo).toBe('Interno');
  expect(cliente.arca).toBeUndefined();
  expect(cliente.responsable).toBeUndefined();
});

test('Modal Nuevo servicio — Localidad unificada deriva la jurisdicción sola', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const cliente = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const c = { id: 990960001, razon: 'Cliente Servicio Test', nombre: 'Cliente Servicio Test', cuit: '30-1-1', estado: 'Activo', ciudad: 'Recoleta', direccion: 'Av. Test 100', coordinadorCuenta: 'Coordinador Test', coordinadorCuentaTipo: 'Interno', periodoFact: 'Del 1 al último del mes', reqOC: 'Sí', clausulaActualizacion: 'Paritarias', tipoContrato: 'Por hora', contactos: [] };
    DB.clientes.push(c);
    return c;
  });
  await page.evaluate(() => { window.navTo('objetivos'); window.abrirModalObjetivo(); });
  await page.selectOption('#obj-cliente', String(cliente.id));
  await page.evaluate(() => window.aplicarHerenciasDeCliente(990960001));
  await page.selectOption('#obj-localidad', 'Palermo'); // barrio CABA
  await page.fill('#obj-codigo', 'SERV.E2E.1');
  await page.fill('#obj-nombre', 'Servicio E2E 1');
  await page.fill('#obj-dir', 'Calle Test 123');
  await page.fill('#obj-fecha-inicio', '2026-10-01');

  // Los campos con chip de herencia arrancan HEREDADOS y disabled.
  await expect(page.locator('#her-periodo')).toContainText('HEREDADO');
  await expect(page.locator('#obj-periodo-fact')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#obj-periodo-fact')).toHaveValue('Del 1 al último del mes');
  await expect(page.locator('#obj-coordinador')).toHaveValue('Coordinador Test');

  // Pisar la cláusula la vuelve PROPIA y editable.
  await page.click('#her-clausula');
  await expect(page.locator('#her-clausula')).toContainText('PROPIA');
  await expect(page.locator('#obj-clausula-actualizacion')).toHaveJSProperty('disabled', false);

  // Puesto mínimo para pasar el checklist de campos.
  await page.evaluate(() => { window.agregarPuestoObj(); window.puestosObjTemp[0].puesto = 'Operario A'; window.puestosObjTemp[0].cantidad = 1; window.renderPuestosObj(); });
  await page.click('#modal-objetivo .tab-btn:has-text("Precio y contrato")');
  await page.evaluate(() => { document.getElementById('obj-modelo-precio').value = 'Por horas variables'; window.toggleModeloPrecio(); });
  await page.fill('#obj-efts', '100'); await page.fill('#obj-valor-hora', '1000');
  await page.selectOption('#obj-contrato', 'Sin contrato');
  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(150);

  const guardado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(o => o.codigo === 'SERV.E2E.1');
  });
  expect(guardado).toBeTruthy();
  expect(guardado.localidad).toBe('Palermo');
  expect(guardado.jurisdiccion).toBe('CABA'); // derivada sola, sin <select> propio
  expect(guardado.coordinadorCuenta).toBe('Coordinador Test'); // heredado, nunca se tocó
  expect(guardado.heredado['obj-clausula-actualizacion']).toBe(false); // se pisó
  expect(guardado.heredado['obj-coordinador']).toBe(true); // se dejó heredado
});

test('Responsables del cliente en el servicio — se ELIGEN de los contactos (checkbox), no se recargan', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const cliente = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const c = { id: 990960002, razon: 'Cliente Resp Test', nombre: 'Cliente Resp Test', cuit: '30-2-2', estado: 'Activo', ciudad: 'Caballito', direccion: 'Test 1', contactos: [{ nombre: 'Agustin Contacto', rol: 'Gerente', tel: '11-4444', mail: '', aSatisfacer: false }] };
    DB.clientes.push(c);
    return c;
  });
  await page.evaluate(() => { window.navTo('objetivos'); window.abrirModalObjetivo(); });
  await page.selectOption('#obj-cliente', String(cliente.id));
  await page.evaluate(() => { window.aplicarHerenciasDeCliente(990960002); window.renderRespObjetivoTemp(); });
  // Tab 0 (Datos del servicio).
  await page.selectOption('#obj-localidad', 'Palermo');
  await page.fill('#obj-codigo', 'SERV.E2E.2');
  await page.fill('#obj-nombre', 'Servicio E2E 2');
  await page.fill('#obj-dir', 'Test 2');
  await page.fill('#obj-fecha-inicio', '2026-10-01');
  await page.evaluate(() => { window.agregarPuestoObj(); window.puestosObjTemp[0].puesto = 'Operario A'; window.puestosObjTemp[0].cantidad = 1; window.renderPuestosObj(); });
  // Tab 1 (Precio y contrato).
  await page.click('#modal-objetivo .tab-btn:has-text("Precio y contrato")');
  await page.evaluate(() => { document.getElementById('obj-modelo-precio').value = 'Por horas variables'; window.toggleModeloPrecio(); });
  await page.fill('#obj-efts', '50'); await page.fill('#obj-valor-hora', '1000');
  await page.selectOption('#obj-contrato', 'Sin contrato');
  // Tab 2 (Responsables del cliente).
  await page.click('#modal-objetivo .tab-btn:has-text("Responsables del cliente")');
  const fila = page.locator('#resp-objetivo-lista');
  await expect(fila).toContainText('Agustin Contacto');
  await fila.locator('input[type="checkbox"]').first().check();
  await fila.locator('label:has-text("⭐ a satisfacer") input').check();

  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(150);

  const guardado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(o => o.codigo === 'SERV.E2E.2');
  });
  expect(guardado.responsables).toHaveLength(1);
  expect(guardado.responsables[0].nombre).toBe('Agustin Contacto');
  expect(guardado.responsables[0].aSatisfacer).toBe(true);
});

test('Alta encadenada — guardar cliente ofrece "cargar su primer servicio" con el cliente fijo, y guardar el servicio ofrece "otro servicio"', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('clientes'); window.abrirModalCliente(); });
  await page.fill('#cli-razon', 'Cliente Encadenado SRL');
  await page.selectOption('#cli-ciudad', 'Flores');
  await page.click('#modal-cliente .tab-btn:has-text("Impositivo y facturación")');
  await page.fill('#cli-cuit', '30-3-3');
  await page.click('button:has-text("Guardar cliente")');
  await page.waitForTimeout(150);

  await expect(page.locator('#modal-encadenado')).toBeVisible();
  // toTitleCase normaliza la razón social — no se afirma el casing exacto.
  await expect(page.locator('#enc-titulo')).toContainText('Encadenado');
  await page.click('#enc-btn-si');

  await expect(page.locator('#modal-objetivo')).toBeVisible();
  await expect(page.locator('#obj-cliente')).toHaveJSProperty('disabled', true); // cliente fijo, sin buscador
  const nombreClienteFijo = await page.evaluate(() => {
    const sel = document.getElementById('obj-cliente');
    return sel.options[sel.selectedIndex]?.text || '';
  });
  expect(nombreClienteFijo).toContain('Encadenado');

  await page.selectOption('#obj-localidad', 'Flores');
  await page.fill('#obj-codigo', 'SERV.ENC.1');
  await page.fill('#obj-nombre', 'Servicio Encadenado 1');
  await page.fill('#obj-dir', 'Test Encadenado 1');
  await page.fill('#obj-fecha-inicio', '2026-10-01');
  await page.evaluate(() => { window.agregarPuestoObj(); window.puestosObjTemp[0].puesto = 'Operario A'; window.puestosObjTemp[0].cantidad = 1; window.renderPuestosObj(); });
  await page.click('#modal-objetivo .tab-btn:has-text("Precio y contrato")');
  await page.evaluate(() => { document.getElementById('obj-modelo-precio').value = 'Por horas variables'; window.toggleModeloPrecio(); });
  await page.fill('#obj-efts', '80'); await page.fill('#obj-valor-hora', '1000');
  await page.selectOption('#obj-contrato', 'Sin contrato');
  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(150);

  await expect(page.locator('#modal-encadenado')).toBeVisible();
  await expect(page.locator('#enc-btn-si')).toContainText('OTRO servicio');
  await page.click('#enc-btn-despues');
  await expect(page.locator('#modal-encadenado')).toBeHidden();

  const servicio = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(o => o.codigo === 'SERV.ENC.1');
  });
  expect(servicio).toBeTruthy();
});

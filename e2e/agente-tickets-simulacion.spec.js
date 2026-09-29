import { test, expect } from '@playwright/test';

// AGENTE_TICKETS_OHLIMPIA.md, punto 12.1: "Modo simulación primero... crea
// la corrida y responde el callback con datos de mentira a los 30
// segundos." Acá se prueba con el delay acortado (window.__AGENTE_SIM_DELAY_MS)
// para no esperar 30s reales en cada corrida de la suite — la lógica que se
// ejercita es exactamente la misma (aplicarCallback en estados.js).

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[{}]' });
  });
}

async function loginComoDeveloper(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async () => {
    window.__AGENTE_SIM_DELAY_MS = 300; // en vez de 30000 — mismo código, mucho más rápido
    window.__AGENTE_POLL_MS = 500; // el polling de respaldo también corre rápido en el test
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Fede Test', perfil: 'DEVELOPER', id: 'fede-test-uuid' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

async function sembrar(page, { ticket, config }) {
  await page.evaluate(async ({ ticket, config }) => {
    const { DB } = await import('/src/shared/state.js');
    if (!DB.tickets) DB.tickets = [];
    DB.tickets.push(ticket);
    Object.assign(DB, config);
    if (!DB.corridasAgente) DB.corridasAgente = [];
  }, { ticket, config });
}

test.describe('Agente de tickets — modo simulación', () => {
  test('un ticket verde: seleccionar, enviar, y ver la corrida pasar a Tests OK', async ({ page }) => {
    await mockRestOk(page);
    await loginComoDeveloper(page);
    await sembrar(page, {
      ticket: { id: 111111111, titulo: 'El botón de guardar queda mal alineado', descripcion: 'Se ve corrido en celular', modulo: 'candidatos', autor: 'Lautaro', estado: 'abierto' },
      config: { agenteModulosRojos: ['liquidacion'], agentePalabrasClaveRojo: ['migración'], agentePalabrasClaveAmarillo: [] },
    });

    await page.evaluate(() => window.navTo('agente'));

    const card = page.locator('#agente-lista-tickets .card');
    await expect(card).toContainText('El botón de guardar queda mal alineado');
    await expect(card).toContainText('🟢 Verde');

    await card.locator('input[type="checkbox"]').check();
    await expect(page.locator('#agente-btn-enviar')).toHaveText('Enviar al agente (1)');

    await page.click('#agente-btn-enviar');
    await expect(page.locator('#agente-lista-corridas')).toContainText('En proceso');

    // El callback simulado llega a los 300ms (acortado); el polling de
    // respaldo de 500ms lo termina de reflejar en pantalla.
    await expect(page.locator('#agente-lista-corridas')).toContainText('Tests OK', { timeout: 5000 });
  });

  test('un ticket con módulo rojo no se puede seleccionar', async ({ page }) => {
    await mockRestOk(page);
    await loginComoDeveloper(page);
    await sembrar(page, {
      ticket: { id: 222222222, titulo: 'Corregir un cálculo', descripcion: '', modulo: 'liquidacion', autor: 'Lautaro', estado: 'abierto' },
      config: { agenteModulosRojos: ['liquidacion'], agentePalabrasClaveRojo: [], agentePalabrasClaveAmarillo: [] },
    });
    await page.evaluate(() => window.navTo('agente'));
    const card = page.locator('#agente-lista-tickets .card');
    await expect(card).toContainText('🔴 Rojo');
    await expect(card.locator('input[type="checkbox"]')).toBeDisabled();
    await expect(card).toContainText('🔒');
  });

  test('simulación con migración: pasa a Esperando aprobar SQL y el flujo de aprobación pide confirmar la aplicación manual', async ({ page }) => {
    await mockRestOk(page);
    await loginComoDeveloper(page);
    await sembrar(page, {
      ticket: { id: 333333333, titulo: 'Necesito migrar un campo nuevo', descripcion: '', modulo: 'comercial', autor: 'Lautaro', estado: 'abierto' },
      config: { agenteModulosRojos: [], agentePalabrasClaveRojo: [], agentePalabrasClaveAmarillo: [] },
    });
    await page.evaluate(() => window.navTo('agente'));
    await page.locator('#agente-lista-tickets .card input[type="checkbox"]').check();
    await page.click('#agente-btn-enviar');

    await expect(page.locator('#agente-lista-corridas')).toContainText('Esperando aprobar SQL', { timeout: 5000 });

    await page.click('#agente-lista-corridas .card');
    await expect(page.locator('#modal-agente-detalle')).toBeVisible();
    await expect(page.locator('#agente-det-migracion')).toContainText('SQL a aprobar');
    await expect(page.locator('#agente-det-migracion')).toContainText('ALTER TABLE');

    await page.click('text=✔ Aprobar');
    await expect(page.locator('#agente-det-migracion')).toContainText('Aprobaste este SQL');
    await expect(page.locator('#agente-det-migracion')).toContainText('el agente nunca la ejecuta solo');

    await page.click('text=Ya la apliqué — seguir');
    await expect(page.locator('#agente-det-resumen')).toContainText('Deployado');
  });

  test('simulación con falla: pasa a Tests en rojo y permite reintentar', async ({ page }) => {
    await mockRestOk(page);
    await loginComoDeveloper(page);
    await sembrar(page, {
      ticket: { id: 444444444, titulo: 'Esto se va a romper a propósito', descripcion: '', modulo: 'comercial', autor: 'Lautaro', estado: 'abierto' },
      config: { agenteModulosRojos: [], agentePalabrasClaveRojo: [], agentePalabrasClaveAmarillo: [] },
    });
    await page.evaluate(() => window.navTo('agente'));
    await page.locator('#agente-lista-tickets .card input[type="checkbox"]').check();
    await page.click('#agente-btn-enviar');

    await expect(page.locator('#agente-lista-corridas')).toContainText('Tests en rojo', { timeout: 5000 });
    await page.click('#agente-lista-corridas .card');
    await expect(page.locator('#agente-det-resumen')).toContainText('con errores');
    await expect(page.locator('#modal-agente-detalle')).toContainText('Reintentar');
  });
});

import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

async function mockRest(page) {
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

async function sembrarLegajo(page, nro, nombre) {
  await page.evaluate(({ nro, nombre }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro, nombre, cuit: '20' + nro + '05', estado: 'Activo', ingreso: '01/09/2026' });
    });
  }, { nro, nombre });
}

// Sembrada YA anulada (simula el caso real: la anulación pasó en una
// sesión anterior, ahora se abre la pantalla de cero).
async function sembrarCuentaAnulada(page, { legajoNro, nombreAsociado, estado }) {
  await page.evaluate((c) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.cuentasCbu = DB.cuentasCbu || [];
      DB.cuentasCbu.push({
        id: 'CBU' + c.legajoNro, legajoNro: String(c.legajoNro), nombreAsociado: c.nombreAsociado,
        estado: c.estado, cbu: '', alias: '', banco: '',
        cuitTitular: '', esTercero: false, vigenteDesde: null,
        tramiteBanco: 'BBVA', tramiteFecha: '2026-09-15', tramitePor: 'Alguien', tramiteObservaciones: '',
        motivo: '', cargadoPor: 'Test E2E', cargadoEn: new Date().toISOString(),
        anulado: true, anuladoPor: 'Fede', anuladoEn: new Date().toISOString(),
      });
    });
  }, { legajoNro, nombreAsociado, estado });
}

async function irACuentasCbu(page, tab) {
  await page.evaluate((tab) => { window.navTo('cuentas_cbu'); if (tab !== 'pendientes') window.tabCbu(tab, null); }, tab);
  await page.waitForTimeout(150);
}

// Reproduce el bug real (CUENTAS_BANCARIAS_anuladas_resembrado_para_Fede.md,
// Lautaro 1/10): "anulo la cuenta → el asociado sigue siendo un asociado
// activo sin CBU → el sembrado lo trae de vuelta a Pendientes". Caso real:
// 5562 Acuña Valentin y 3751 Tucciarone aparecían en Anuladas con su estado
// viejo (EN TRÁMITE) Y, a la vez, en Pendientes como "SIN CUENTA · sin
// iniciar" — fila nueva, resembrada.
test('CBU anulada: NO resiembra en Pendientes y NO cuenta en los KPIs — solo "Reactivar" la devuelve', async ({ page }) => {
  await mockRest(page);
  await loginComoAdmin(page);
  await sembrarLegajo(page, 995401, 'CBU Anulada Test');
  await sembrarCuentaAnulada(page, { legajoNro: 995401, nombreAsociado: 'CBU Anulada Test', estado: 'EN_TRAMITE' });

  await irACuentasCbu(page, 'pendientes');
  // El bug: esta fila NO debe aparecer acá (ni como SIN CUENTA ni de
  // ninguna otra forma) mientras la cuenta siga anulada.
  await expect(page.locator('#tbody-cbu-pendientes')).not.toContainText('CBU Anulada Test');
  // Tampoco infla el badge de la bandeja ni el KPI "Sin cuenta".
  await expect(page.locator('#kpi-cbu-sin')).toHaveText('0');

  // Sigue viéndose en Anuladas, con su estado real de antes de anularla.
  await irACuentasCbu(page, 'anuladas');
  const filaAnulada = page.locator('#tbody-cbu-anuladas tr', { hasText: 'CBU Anulada Test' });
  await expect(filaAnulada).toContainText('EN TRÁMITE');
  await expect(page.locator('.tab-btn[data-cbu-tab="anuladas"] #cbu-badge-anuladas')).toHaveText('1');

  // Reactivar es la ÚNICA vuelta atrás — reaparece en Pendientes con su
  // estado real (EN TRÁMITE), no "sin iniciar" de cero.
  await filaAnulada.locator('text=↩️ Reactivar').click();
  await page.waitForTimeout(150);

  await irACuentasCbu(page, 'pendientes');
  const filaReactivada = page.locator('#tbody-cbu-pendientes tr', { hasText: 'CBU Anulada Test' });
  await expect(filaReactivada).toContainText('EN TRÁMITE');
  await expect(page.locator('#kpi-cbu-tramite')).not.toHaveText('0');
});

// Caso SIN_CUENTA anulada (nunca llegó a iniciar trámite, pero alguien la
// anuló igual para sacarla de la bandeja) — mismo bug, variante más simple:
// como SIN_CUENTA ya era un estado "virtual" (sin fila real), antes de este
// fix la anulación ni siquiera tenía una fila real que detectar y el
// asociado quedaba imposible de excluir de Pendientes por este camino. Acá
// se prueba que, con el fix, SÍ queda una fila real (anularCuentaCbu exige
// una fila existente) y esa fila real alcanza para excluirlo.
test('CBU: eliminar una fila EN_TRAMITE y no volver a verla en Pendientes tras recargar la pantalla varias veces', async ({ page }) => {
  await mockRest(page);
  await loginComoAdmin(page);
  await sembrarLegajo(page, 995402, 'CBU Resiembra Test');
  await sembrarCuentaAnulada(page, { legajoNro: 995402, nombreAsociado: 'CBU Resiembra Test', estado: 'EN_TRAMITE' });

  // Simula "re-renders" repetidos (navegar afuera y volver) — si el bug
  // siguiera activo, cada render resembraría la fila de nuevo.
  for (let i = 0; i < 3; i++) {
    await irACuentasCbu(page, 'padron');
    await irACuentasCbu(page, 'pendientes');
  }
  await expect(page.locator('#tbody-cbu-pendientes')).not.toContainText('CBU Resiembra Test');
});

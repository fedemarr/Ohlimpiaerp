import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Sin esto, supaSync (SELECT por id_local → UPDATE/INSERT) pega contra el
// Supabase real sin sesión autenticada y RLS lo rechaza — anularCuentaCbu/
// reactivarCuentaCbu harían rollback silencioso del flag en memoria y el
// test fallaría por una razón ajena a lo que se quiere probar. Mismo
// mockInfra ya usado en monotributo-pago-mensual-lote-y-clickeable.spec.js.
async function mockRest(page) {
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

// Ticket "Cuentas CBU — eliminar (soft) + tab Anuladas + Reactivar" (30/09).
// anulado ya existía desde v138 y ya filtraba en todos los listados, pero
// nunca se seteaba a true — no había botón de bajá ni de vuelta. Acá se
// prueba el camino completo para los 2 casos reales: una cuenta ACTIVA
// (vive en Padrón) y una EN_TRAMITE (vive en Pendientes, con fila real en
// cuentas_cbu) — SIN_CUENTA es un estado virtual sin nada que eliminar.

async function sembrarLegajo(page, nro, nombre) {
  await page.evaluate(({ nro, nombre }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro, nombre, cuit: '20' + nro + '05', estado: 'Activo', ingreso: '01/09/2026' });
    });
  }, { nro, nombre });
}

async function sembrarCuenta(page, { legajoNro, nombreAsociado, estado, cbu, tramiteBanco, tramiteFecha }) {
  await page.evaluate((c) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.cuentasCbu = DB.cuentasCbu || [];
      DB.cuentasCbu.push({
        id: 'CBU' + c.legajoNro, legajoNro: String(c.legajoNro), nombreAsociado: c.nombreAsociado,
        estado: c.estado, cbu: c.cbu || '', alias: '', banco: c.cbu ? 'BBVA' : '',
        cuitTitular: '', esTercero: false, vigenteDesde: c.cbu ? '2026-09-01' : null,
        tramiteBanco: c.tramiteBanco || '', tramiteFecha: c.tramiteFecha || null, tramitePor: '', tramiteObservaciones: '',
        motivo: '', cargadoPor: 'Test E2E', cargadoEn: new Date().toISOString(), anulado: false,
      });
    });
  }, { legajoNro, nombreAsociado, estado, cbu, tramiteBanco, tramiteFecha });
}

async function cuenta(page, legajoNro) {
  return page.evaluate((nro) => {
    return import('/src/shared/state.js').then(({ DB }) => DB.cuentasCbu.find(c => String(c.legajoNro) === String(nro)));
  }, legajoNro);
}

async function irACuentasCbu(page, tab) {
  await page.evaluate((tab) => { window.navTo('cuentas_cbu'); if (tab !== 'pendientes') window.tabCbu(tab, null); }, tab);
  await page.waitForTimeout(150);
}

test('Eliminar una cuenta ACTIVA (Padrón) la manda a Anuladas sin perder los datos — Reactivar la devuelve al Padrón', async ({ page }) => {
  await mockRest(page);
  await loginComoAdmin(page);
  await sembrarLegajo(page, 995301, 'CBU Activa Test');
  await sembrarCuenta(page, { legajoNro: 995301, nombreAsociado: 'CBU Activa Test', estado: 'ACTIVA', cbu: '0170001234000099530105' });

  await irACuentasCbu(page, 'padron');
  await expect(page.locator('#tbody-cbu-padron')).toContainText('CBU Activa Test');

  page.once('dialog', d => d.accept());
  await page.click('#tbody-cbu-padron >> text=🗑️ Eliminar');
  await page.waitForTimeout(150);

  // Sigue en el tab Padrón (no te teletransporta a Pendientes) y la fila ya no está.
  await expect(page.locator('.tab-btn[data-cbu-tab="padron"]')).toHaveClass(/active/);
  await expect(page.locator('#tbody-cbu-padron')).not.toContainText('CBU Activa Test');

  let c = await cuenta(page, 995301);
  expect(c.anulado).toBe(true);
  expect(c.anuladoPor).toBeTruthy();
  expect(c.cbu).toBe('0170001234000099530105'); // no se pierde el dato

  await irACuentasCbu(page, 'anuladas');
  await expect(page.locator('#tbody-cbu-anuladas')).toContainText('CBU Activa Test');

  await page.click('#tbody-cbu-anuladas >> text=↩️ Reactivar');
  await page.waitForTimeout(150);

  c = await cuenta(page, 995301);
  expect(c.anulado).toBe(false);
  await expect(page.locator('#tbody-cbu-anuladas')).not.toContainText('CBU Activa Test');

  await irACuentasCbu(page, 'padron');
  await expect(page.locator('#tbody-cbu-padron')).toContainText('CBU Activa Test');
});

test('Eliminar una cuenta EN_TRAMITE (Pendientes) deja al asociado como SIN CUENTA — Reactivar la devuelve EN TRÁMITE', async ({ page }) => {
  await mockRest(page);
  await loginComoAdmin(page);
  await sembrarLegajo(page, 995302, 'CBU Tramite Test');
  await sembrarCuenta(page, { legajoNro: 995302, nombreAsociado: 'CBU Tramite Test', estado: 'EN_TRAMITE', tramiteBanco: 'BBVA', tramiteFecha: '2026-09-20' });

  await irACuentasCbu(page, 'pendientes');
  const fila = page.locator('#tbody-cbu-pendientes tr', { hasText: 'CBU Tramite Test' });
  await expect(fila).toContainText('EN TRÁMITE');
  await expect(fila).toContainText('🗑️ Eliminar');

  page.once('dialog', d => d.accept());
  await fila.locator('text=🗑️ Eliminar').click();
  await page.waitForTimeout(150);

  let c = await cuenta(page, 995302);
  expect(c.anulado).toBe(true);

  // FIX (CUENTAS_BANCARIAS_anuladas_resembrado_para_Fede.md, 01/10): el
  // legajo NO vuelve a aparecer en Pendientes — antes de este fix sí
  // reaparecía como "SIN CUENTA" (fila "resembrada"), que es exactamente
  // el bug real que reportó Lautaro (anular y resembrar en loop).
  await expect(page.locator('#tbody-cbu-pendientes')).not.toContainText('CBU Tramite Test');

  await irACuentasCbu(page, 'anuladas');
  const filaAnulada = page.locator('#tbody-cbu-anuladas tr', { hasText: 'CBU Tramite Test' });
  await expect(filaAnulada).toContainText('EN TRÁMITE'); // conserva el estado que tenía al eliminarla

  await filaAnulada.locator('text=↩️ Reactivar').click();
  await page.waitForTimeout(150);

  c = await cuenta(page, 995302);
  expect(c.anulado).toBe(false);

  await irACuentasCbu(page, 'pendientes');
  const filaFinal = page.locator('#tbody-cbu-pendientes tr', { hasText: 'CBU Tramite Test' });
  await expect(filaFinal).toContainText('EN TRÁMITE');
  await expect(filaFinal).toContainText('🗑️ Eliminar');
});

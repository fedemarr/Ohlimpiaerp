import { test, expect } from '@playwright/test';

async function loginComoAdmin(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async () => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Nati RRHH', perfil: 'Administrador total' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

// MONOTRIBUTO_bandeja_para_Fede.md: el alta siembra el trámite (bandeja
// derivada: activo sin monotributo en el Padrón), orden por horas en grillas,
// SIN INICIAR → EN TRÁMITE → ACTIVO con el modal precargado y bloqueado.
test('Monotributo — bandeja de pendientes: orden por horas, trámite y modal precargado', async ({ page }) => {
  await loginComoAdmin(page);
  const mes = new Date().toISOString().slice(0, 7);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    DB.legajos.push(
      { nro: 994101, nombre: 'BANDEJA SIN HORAS', dni: '30994101', estado: 'Activo', ingreso: '10/09/2026', cuit: '20-30994101-1', servicio: 'OBJ-BJ' },
      { nro: 994102, nombre: 'BANDEJA CON HORAS', dni: '30994102', estado: 'Activo', ingreso: '15/09/2026', cuit: '20-30994102-2', servicio: 'OBJ-BJ' },
      { nro: 994103, nombre: 'BANDEJA YA EN PADRON', dni: '30994103', estado: 'Activo', ingreso: '01/01/2026', cuit: '20-30994103-3', servicio: 'OBJ-BJ' },
      { nro: 994104, nombre: 'BANDEJA DE BAJA', dni: '30994104', estado: 'Baja', ingreso: '01/01/2026', cuit: '20-30994104-4', servicio: 'OBJ-BJ' },
    );
    DB.monotributos.push({ id: Date.now(), nombre: 'BANDEJA YA EN PADRON', nroSocio: 994103, categoria: 'A', estado: 'Al día', zona: 'provincia', condicion: 'comun' });
    DB.grillasLiq.push({
      id: 'GRL-BJ', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-BJ', nombre: 'Servicio BJ', supervisor: 'X',
      asociados: [{ nro: 994102, nombre: 'BANDEJA CON HORAS', tipoHora: 'facturable', horas: { [mes + '-03']: 8, [mes + '-04']: 8, [mes + '-05']: 'F' } }],
    });
    window.navTo('monotributos');
  }, mes);
  await page.waitForTimeout(250);

  const tbody = page.locator('#tbody-mono-pendientes');
  // Los que ya están en el Padrón y los dados de baja NO están en la bandeja.
  await expect(tbody).not.toContainText('YA EN PADRON');
  await expect(tbody).not.toContainText('DE BAJA');
  // Con horas va primero (aunque tenga menos días en bandeja) y grita el chip.
  const filas = tbody.locator('tr');
  await expect(filas.filter({ hasText: 'BANDEJA CON HORAS' })).toContainText('16 hs — va a liquidar sin monotributo');
  const orden = await page.evaluate(() => [...document.querySelectorAll('#tbody-mono-pendientes tr td:first-child')].map(td => td.textContent));
  expect(orden.findIndex(t => t.includes('CON HORAS'))).toBeLessThan(orden.findIndex(t => t.includes('SIN HORAS')));
  await expect(filas.filter({ hasText: 'BANDEJA SIN HORAS' })).toContainText('SIN INICIAR');
  await expect(page.locator('#kpi-mp-horas')).not.toHaveText('0');
  await expect(page.locator('#mono-badge-pendientes')).toBeVisible();

  // --- Iniciar trámite: EN TRÁMITE (quién + cuándo) y modal precargado/bloqueado ---
  await page.evaluate(() => window.iniciarTramiteMono('994101'));
  await page.waitForTimeout(200);
  await expect(page.locator('#modal-monotributo')).toBeVisible();
  await expect(page.locator('#mono-nombre')).toHaveValue('BANDEJA SIN HORAS');
  await expect(page.locator('#mono-cuit')).toHaveValue('20-30994101-1');
  await expect(page.locator('#mono-fechaAlta')).toHaveValue('2026-09-10');
  await expect(page.locator('#mono-nombre')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#mono-cuit')).toHaveJSProperty('readOnly', true);
  const tramite = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.monoTramites || []).find(t => t.legajoNro === '994101');
  });
  expect(tramite.tramitePor).toBe('Nati RRHH');
  await expect(tbody.locator('tr', { hasText: 'BANDEJA SIN HORAS' })).toContainText('EN TRÁMITE');
  await expect(tbody.locator('tr', { hasText: 'BANDEJA SIN HORAS' })).toContainText('Cargar monotributo');

  // --- Guardar: pasa a ACTIVO, sale de la bandeja y entra al Padrón ---
  await page.selectOption('#mono-categoria', 'A');
  await page.evaluate(() => window.guardarMonotributo());
  await page.waitForTimeout(200);
  const reg = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monotributos.find(r => r.nombre === 'BANDEJA SIN HORAS');
  });
  expect(reg).toBeTruthy();
  expect(String(reg.nroSocio)).toBe('994101'); // sale del alta, no del tipeo
  expect(reg.cuit).toBe('20-30994101-1');
  await expect(tbody).not.toContainText('BANDEJA SIN HORAS');

  // "+ Nuevo monotributista" sigue disponible y NO queda bloqueado.
  await page.evaluate(() => window.abrirModalNuevoMonotributo());
  await expect(page.locator('#mono-nombre')).toHaveJSProperty('readOnly', false);
});

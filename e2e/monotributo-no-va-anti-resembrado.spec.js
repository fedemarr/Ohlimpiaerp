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

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md, punto 1: la bandeja es derivada
// de DB.legajos (activo + sin monotributo en el Padrón) — sin una forma de
// decir "esto no corresponde", un registro de prueba o alguien que
// realmente no va a inscribirse queda zombie para siempre. "✕ No va a
// monotributo" marca el legajo (sin_monotributo) y es reversible: cargar de
// verdad el monotributo (guardarMonotributo) limpia la marca sola.
test('Monotributo — "No va a monotributo": saca de la bandeja, registra en historial y es reversible', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.legajos.push(
      { nro: 995201, nombre: 'NOVA PRUEBA', dni: '30995201', estado: 'Activo', ingreso: '10/09/2026', cuit: '20-30995201-1' },
      { nro: 995202, nombre: 'NOVA NO CORRESPONDE', dni: '30995202', estado: 'Activo', ingreso: '10/09/2026', cuit: '20-30995202-2' },
    );
    DB.monoTramites = DB.monoTramites || [];
    DB.monoTramites.push({ id: 'MTR995201', legajoNro: '995201', nombreAsociado: 'NOVA PRUEBA', anulado: false });
    window.navTo('monotributos');
  });
  await page.waitForTimeout(250);

  const tbody = page.locator('#tbody-mono-pendientes');
  await expect(tbody).toContainText('NOVA PRUEBA');
  await expect(tbody).toContainText('NOVA NO CORRESPONDE');

  // --- Caso 1: "Registro de prueba" — sale de la bandeja, SIN evento en historial, y se borra el trámite ---
  await page.evaluate(() => window.noVaMonotributoBandeja('995201'));
  await expect(page.locator('#modal-no-va-mono')).toBeVisible();
  await page.selectOption('#nvm-motivo', 'Registro de prueba');
  await page.evaluate(() => window.confirmarNoVaMonotributo());
  await page.waitForTimeout(200);
  await expect(tbody).not.toContainText('NOVA PRUEBA');

  const estado1 = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const l = DB.legajos.find(x => x.nro === 995201);
    const t = (DB.monoTramites || []).find(x => x.legajoNro === '995201');
    return { sinMonotributo: l.sinMonotributo, tramite: t, cambios: (DB.monoCambios || []).filter(c => c.nombre === 'NOVA PRUEBA').length };
  });
  expect(estado1.sinMonotributo).toBe(true);
  expect(estado1.tramite).toBeUndefined();
  expect(estado1.cambios).toBe(0);

  // --- Caso 2: "No corresponde monotributo" — sale de la bandeja CON evento en historial ---
  await page.evaluate(() => window.noVaMonotributoBandeja('995202'));
  await page.selectOption('#nvm-motivo', 'No corresponde monotributo');
  await page.fill('#nvm-detalle', 'Es socio honorario, no presta servicios');
  await page.evaluate(() => window.confirmarNoVaMonotributo());
  await page.waitForTimeout(200);
  await expect(tbody).not.toContainText('NOVA NO CORRESPONDE');

  const estado2 = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const l = DB.legajos.find(x => x.nro === 995202);
    const cambio = (DB.monoCambios || []).find(c => c.nombre === 'NOVA NO CORRESPONDE');
    return { sinMonotributo: l.sinMonotributo, motivo: l.sinMonotributoMotivo, cambio };
  });
  expect(estado2.sinMonotributo).toBe(true);
  expect(estado2.motivo).toContain('No corresponde monotributo');
  expect(estado2.cambio).toBeTruthy();
  expect(estado2.cambio.tipo).toBe('no_va_monotributo');
  expect(estado2.cambio.resultado).toBe('Aprobado');

  // El evento aparece en el tab Historial, filtrable por el nuevo tipo.
  await page.evaluate(() => window.tabMonotributos('historial', null));
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-mono-hist')).toContainText('NOVA NO CORRESPONDE');
  await page.selectOption('#mono-hist-tipo', 'no_va_monotributo');
  await expect(page.locator('#tbody-mono-hist')).toContainText('NOVA NO CORRESPONDE');
  await expect(page.locator('#tbody-mono-hist')).not.toContainText('NOVA PRUEBA');

  // --- Reversibilidad: cargar de verdad el monotributo limpia la marca ---
  await page.evaluate(() => window.abrirModalNuevoMonotributo(null, { nro: 995202, nombre: 'NOVA NO CORRESPONDE', cuit: '20-30995202-2', fechaAlta: '2026-09-10' }));
  await page.selectOption('#mono-categoria', 'A');
  await page.evaluate(() => window.guardarMonotributo());
  await page.waitForTimeout(200);
  const legReactivado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.legajos.find(x => x.nro === 995202);
  });
  expect(legReactivado.sinMonotributo).toBe(false);
});

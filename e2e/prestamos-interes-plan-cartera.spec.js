import { test, expect } from '@playwright/test';

async function loginComo(page, nombre, perfil) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  await cambiarRol(page, nombre, perfil);
  await page.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}
async function cambiarRol(page, nombre, perfil) {
  await page.evaluate(async ({ nombre, perfil }) => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre, perfil });
  }, { nombre, perfil });
}

// PRESTAMOS_para_Fede.md fases 1-3 (18/09): simulación en el pedido,
// tasa/cuotas al aprobar, plan generado, tab Préstamos (solo lectura).
// Supuesto confirmado: interés simple, total = capital × (1+tasa).
test('Préstamos — simulación con interés, plan generado al aprobar y cartera', async ({ page }) => {
  await loginComo(page, 'SUP INTERES TEST', 'Supervisor');
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.legajos.push({ nro: 992501, nombre: 'INTERES TEST UNO', dni: '30992501', estado: 'Activo', servicio: 'OBJ-INT-E2E', supervisor: 'SUP INTERES TEST', funcion: 'Operario A', cuit: '20992501001' });
    DB.objetivos.push({ codigo: 'OBJ-INT-E2E', nombre: 'Servicio Interés E2E', supervisorAsignado: 'SUP INTERES TEST', estado: 'Operativo', anulado: false });
    window.navTo('pedidos_adelantos');
  });
  await page.waitForTimeout(200);

  // --- Simulación en vivo (defaults: 10% y 6 cuotas) ---
  await page.evaluate(() => window.abrirNuevoPedidoAdelanto());
  await page.check('input[name="npa-tipo"][value="Préstamo"]');
  await page.fill('#npa-asociado', 'INTERES TEST UNO (N°992501)');
  await page.evaluate(() => window.seleccionarAsociadoPedido());
  await page.fill('#npa-monto-prestamo', '500000');
  await expect(page.locator('#npa-sim-tot')).toContainText('550.000');
  await expect(page.locator('#npa-sim-int')).toContainText('50.000');
  await expect(page.locator('#npa-sim-cuota')).toContainText('6 ×');
  await expect(page.locator('#npa-sim-cuota')).toContainText('91.667');

  await page.evaluate(() => window.confirmarNuevoPedido(true));
  const id = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.prestamos.find(p => p.nombre === 'INTERES TEST UNO')?.id;
  });
  expect(id).toBeTruthy();

  // --- RRHH aprueba: tasa y cuotas precargadas, plan generado ---
  await cambiarRol(page, 'Nati RRHH', 'RRHH');
  await page.evaluate(() => window.navTo('gestion_adelantos'));
  await page.evaluate(() => window.tabGestAdl('rrhh'));
  await page.evaluate((i) => window.abrirRevisionRRHH('Préstamo', i), id);
  await expect(page.locator('#gr-tasa-interes')).toHaveValue('10');
  await expect(page.locator('#gr-cuotas-aprobadas')).toHaveValue('6');
  await page.fill('#gr-cuotas-aprobadas', '4');
  await expect(page.locator('#gr-resumen-prestamo')).toContainText('550.000');
  await page.evaluate(() => window.aprobarRevisionRRHH());

  const p = await page.evaluate(async (i) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.prestamos.find(x => x.id === i);
  }, id);
  expect(p.estado).toBe('Aprobada RRHH');
  expect(p.monto).toBe(500000);            // capital: lo que se deposita
  expect(p.montoTotal).toBe(550000);       // capital + interés
  expect(p.planCuotas).toHaveLength(4);
  expect(p.planCuotas.reduce((s, c) => s + c.monto, 0)).toBe(550000); // el plan balancea exacto
  expect(p.planCuotas.every(c => c.estado === 'Pendiente')).toBe(true);

  // --- Tab Préstamos (Finanzas): cartera + ficha de solo lectura ---
  await cambiarRol(page, 'Lautaro Finanzas', 'Finanzas');
  await page.evaluate(() => window.tabGestAdl('prestamos'));
  await expect(page.locator('#tbody-pr-cartera')).toContainText('INTERES TEST UNO');
  await expect(page.locator('#tbody-pr-cartera')).toContainText('550.000');
  await expect(page.locator('#tbody-pr-cartera')).toContainText('ACTIVO 0/4');
  await expect(page.locator('#kpi-pr-activos')).toHaveText('1');
  await page.evaluate((i) => window.abrirFichaPrestamo(i), id);
  await expect(page.locator('#modal-pr-ficha')).toBeVisible();
  await expect(page.locator('#prf-cuerpo')).toContainText('Plan de cuotas');
  await expect(page.locator('#prf-cuerpo')).toContainText('PENDIENTE');
});

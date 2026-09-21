import { test, expect } from '@playwright/test';

async function loginComo(page, nombre, perfil) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
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

// PRESTAMOS_bug_para_Fede.md (18/09): un préstamo elevado por el
// supervisor no llegaba nunca a Revisión RRHH. Causa real: a la tabla
// prestamos le faltaban las columnas "servicio" y "cargado_por" que
// crearPedidoPrestamo() manda siempre — Postgrest rechazaba el insert
// COMPLETO y _guardar() no miraba el resultado, así que el pedido
// sobrevivía solo en la memoria de quien lo cargó (ver sql/v148 para
// el ALTER, y el fix de _guardar() en flujo.js para que un fallo así
// nunca vuelva a ser mudo). Esta prueba recorre el circuito completo
// tal como lo describe el .md: elevar → aparece en Revisión RRHH →
// aprobar sin cuotas frena → aprobar con 4 cuotas anda → el soft-warning
// de máx. cuotas no bloquea.
test('Préstamos — elevado llega a Revisión RRHH, no se aprueba sin cuotas, soft-warning de cuotas no bloquea', async ({ page }) => {
  await loginComo(page, 'SUP PRESTAMO TEST', 'Supervisor');

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.legajos = DB.legajos || [];
    DB.legajos.push({ nro: 992401, nombre: 'PRESTAMO TEST CARBALLO', dni: '30992401', estado: 'Activo', servicio: 'OBJ-PREST-E2E', supervisor: 'SUP PRESTAMO TEST', funcion: 'Operario A', cuit: '20992401001' });
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-PREST-E2E', nombre: 'Servicio Préstamo E2E', supervisorAsignado: 'SUP PRESTAMO TEST', estado: 'Operativo', anulado: false });
    window.navTo('pedidos_adelantos');
  });
  await page.waitForTimeout(200);

  // --- Cargar el préstamo como supervisor: solo pide monto, sin cuotas ---
  await page.evaluate(() => window.abrirNuevoPedidoAdelanto());
  await page.waitForTimeout(150);
  await page.check('input[name="npa-tipo"][value="Préstamo"]');
  await page.evaluate(() => window.cambiarTipoPedidoModal());
  await page.fill('#npa-asociado', 'PRESTAMO TEST CARBALLO (N°992401)');
  await page.evaluate(() => window.seleccionarAsociadoPedido());
  await page.fill('#npa-monto-prestamo', '400000');
  await expect(page.locator('#btn-npa-elevar')).toBeEnabled();
  // Se invoca la acción directamente (no .click()) para que Playwright
  // espere la cadena async completa (crearPedidoPrestamo + elevarPedido,
  // cada uno con su propio supaSync) — mismo criterio ya documentado en
  // e2e/adelantos-planilla-deposito.spec.js.
  await page.evaluate(() => window.confirmarNuevoPedido(true));
  await page.waitForTimeout(200);

  const pedidoId = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const p = DB.prestamos.find(x => x.nombre === 'PRESTAMO TEST CARBALLO');
    return p ? p.id : null;
  });
  expect(pedidoId).not.toBeNull();

  const estadoInicial = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.prestamos.find(p => p.id === id)?.estado;
  }, pedidoId);
  expect(estadoInicial).toBe('Enviada'); // "PENDIENTE" en Mis pedidos

  // --- RRHH: el préstamo SÍ aparece en Revisión (el bug era que no) ---
  await cambiarRol(page, 'Nati RRHH', 'RRHH');
  await page.evaluate(() => window.navTo('gestion_adelantos'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabGestAdl('rrhh'));
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-gadl-rrhh')).toContainText('PRESTAMO TEST CARBALLO');
  await expect(page.locator('#tbody-gadl-rrhh')).toContainText('Préstamo');

  await page.evaluate((id) => window.abrirRevisionRRHH('Préstamo', id), pedidoId);
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-gadl-revision')).toBeVisible();

  // --- Intentar aprobar SIN cuotas: debe frenar (regla corregida del .md) ---
  await page.fill('#gr-cuotas-aprobadas', '');
  await page.evaluate(() => window.aprobarRevisionRRHH());
  await page.waitForTimeout(150);
  const estadoSinCuotas = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.prestamos.find(p => p.id === id)?.estado;
  }, pedidoId);
  expect(estadoSinCuotas).toBe('Enviada'); // no avanzó

  // --- Soft-warning: 20 cuotas supera el máximo configurado, pero NO bloquea ---
  await page.fill('#gr-cuotas-aprobadas', '20');
  await page.waitForTimeout(100);
  await expect(page.locator('#gr-aviso-cuotas')).toBeVisible();
  await expect(page.locator('#gr-aviso-cuotas')).toContainText('supera el máximo');

  // --- Aprobar con 4 cuotas: anda ---
  await page.fill('#gr-cuotas-aprobadas', '4');
  await page.waitForTimeout(100);
  await expect(page.locator('#gr-aviso-cuotas')).toBeHidden();
  await page.evaluate(() => window.aprobarRevisionRRHH());
  await page.waitForTimeout(150);

  const [estadoFinal, cuotasFinal] = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    const p = DB.prestamos.find(x => x.id === id);
    return [p?.estado, p?.cuotas];
  }, pedidoId);
  expect(estadoFinal).toBe('Aprobada RRHH');
  expect(cuotasFinal).toBe(4);
});

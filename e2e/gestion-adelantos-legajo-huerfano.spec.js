import { test, expect } from '@playwright/test';

async function loginComoRRHH(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async () => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Nati RRHH', perfil: 'RRHH' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

// Ticket "Limpieza de Pedidos Duplicados/Prueba y Fix de Aprobación en
// RRHH": un pedido de adelanto cuyo legajo_id_local ya no existe en el
// padrón (legajo de prueba borrado, o dato corrupto) dejaba
// abrirRevisionRRHH() cortando en seco con un toast, SIN abrir el modal
// — RRHH no tenía forma de rechazar ni aprobar ese pedido, quedaba
// trabado para siempre en la cola. Casos reales encontrados en
// producción: "Martinez Federico"/"Recalde Axel" con legajo_id_local
// 146/148, que no existen en la tabla legajos (ver sql/v147).
test('Revisión RRHH — un pedido con legajo inexistente se puede abrir y rechazar (no queda trabado)', async ({ page }) => {
  await loginComoRRHH(page);

  const pedidoId = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const id = Date.now();
    DB.pedidosAdelantos = DB.pedidosAdelantos || [];
    DB.pedidosAdelantos.push({
      id, legajoIdLocal: '999999', nroSocio: '999999', nombreAsociado: 'HUERFANO TEST',
      supervisorNombre: 'Administrador', origen: 'Formal', monto: 50, periodo: '2026-07',
      fechaPedido: '2026-07-17', estado: 'Enviada', cargadoPor: 'Administrador', anulado: false,
    });
    window.navTo('gestion_adelantos');
    return id;
  });

  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabGestAdl('rrhh'));
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-gadl-rrhh')).toContainText('HUERFANO TEST');

  // Antes del fix esto no abría el modal (cortaba con un toast) — ahora
  // se abre igual, avisando que no hay legajo, pero con Rechazar disponible.
  await page.evaluate((id) => window.abrirRevisionRRHH('Adelanto', id), pedidoId);
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-gadl-revision')).toBeVisible();
  await expect(page.locator('#gr-cuerpo')).toContainText('No se encontró el legajo');
  await expect(page.locator('#gr-cuerpo')).not.toContainText('Contexto del asociado');

  await page.fill('#gr-motivo', 'Registro de prueba — legajo inexistente');
  await page.evaluate(() => window.rechazarRevisionRRHH());
  await page.waitForTimeout(150);

  const estadoFinal = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidosAdelantos.find(p => p.id === id)?.estado;
  }, pedidoId);
  expect(estadoFinal).toBe('Rechazada RRHH');
});

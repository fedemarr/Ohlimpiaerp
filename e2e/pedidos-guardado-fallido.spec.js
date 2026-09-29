import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket 29/09/2026 ("Pérdida de Datos al Recargar Página en Pre-Pedidos de
// Personal"): guardarPedido() y crearPedidoDesdePrepedido() eran
// fire-and-forget — no esperaban ni chequeaban el resultado de supaSync(),
// así que un rechazo real de PostgREST (pasó de verdad: la migración v158
// que agrega la columna `lineas` nunca se había aplicado en producción)
// dejaba el pedido SOLO en memoria. El toast decía "✓ guardado", la fila
// aparecía en la tabla, y desaparecía sin dejar rastro en el próximo
// refresh — exactamente el síntoma reportado.
//
// Este test simula ese mismo rechazo (INSERT a `pedidos` responde error,
// como si la columna no existiera) y prueba que ahora: no dice "guardado",
// el pedido NO queda ni siquiera en memoria, y el botón se re-habilita.

async function mockRestFallaPedidos(page) {
  await page.route('**/rest/v1/**', (route) => {
    const u = new URL(route.request().url());
    const method = route.request().method();
    // path exacto (no "pedidos_eventos" ni "pedidos_adelantos", que
    // contienen "pedidos" como substring).
    if (u.pathname === '/rest/v1/pedidos' && method === 'POST') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'lineas' column of 'pedidos' in the schema cache" }),
      });
    }
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('Guardar un pedido: si Supabase rechaza el insert, NO dice "guardado" y no deja el pedido fantasma en memoria', async ({ page }) => {
  await mockRestFallaPedidos(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ id: 990950002, codigo: 'FALLA.TEST', nombre: 'FALLA TEST', estado: 'Operativo', anulado: false, supervisorAsignado: 'Alejandro Cacciato', dir: 'Colombia 1340' });
  });
  await page.evaluate(() => { window.poblarSelects(); window.navTo('pedidos'); window.abrirNuevoPedido(); });
  await page.selectOption('#p-supervisor', 'Alejandro Cacciato');
  await page.evaluate(() => window.onChangeSupervisorPedido());
  await page.selectOption('#p-servicio', 'FALLA.TEST');
  await page.evaluate(() => window.onChangeServicioPedido());
  await page.evaluate(() => {
    window.lineasPedidoTemp[0] = { puesto: 'Operario A', cantidad: 1, dias: { lunes: true }, horarioDesde: '06:00', horarioHasta: '14:00', tipoHorario: 'fijo', perfil: [] };
    window.renderLineasPedido();
  });
  await page.fill('#p-fecha-limite', '25/09/2026');

  const cantidadAntes = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.pedidos.length);

  await page.click('#btn-guardar-pedido');

  // El toast tiene que avisar el error, nunca "guardado".
  await expect(page.locator('#toast')).toContainText('No se pudo guardar el pedido', { timeout: 5000 });
  await expect(page.locator('#toast')).not.toContainText('guardado');

  // El modal sigue abierto (no se cierra en el camino de error).
  await expect(page.locator('#modal-pedido')).toBeVisible();

  // El botón vuelve a estar habilitado (no queda trabado en "Guardando...").
  await expect(page.locator('#btn-guardar-pedido')).toBeEnabled();
  await expect(page.locator('#btn-guardar-pedido')).toHaveText('Guardar pedido');

  // Y lo más importante: no quedó ningún pedido fantasma en memoria — el
  // bug real era que SÍ quedaba, visible hasta el próximo refresh.
  const cantidadDespues = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.pedidos.length);
  expect(cantidadDespues).toBe(cantidadAntes);
});

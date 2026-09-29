import { test, expect } from '@playwright/test';
import { loginComoAdmin, inyectarLegajo } from './helpers.js';

// Ticket 29/09/2026 (mismo síntoma que pedidos/prepedidos, "no queda nada
// al recargar"): guardarReasignacion() era fire-and-forget. Causa raíz real
// confirmada contra producción: la migración v156 (columnas tipo /
// consultado_acepta / consultado_por en `reasignaciones`) nunca se había
// aplicado — la tabla tenía 0 filas en total desde que existe esta
// modalidad (23/09). "Cubrir con interno" desde Prepedidos parecía andar
// (la vacante se marcaba en pantalla) pero se perdía siempre al refrescar.

async function mockRestFallaReasignaciones(page) {
  await page.route('**/rest/v1/**', (route) => {
    const u = new URL(route.request().url());
    const method = route.request().method();
    if (u.pathname === '/rest/v1/reasignaciones' && method === 'POST') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'tipo' column of 'reasignaciones' in the schema cache" }),
      });
    }
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('Guardar una reasignación: si Supabase rechaza el insert, NO dice "elevada" y no deja el registro fantasma en memoria', async ({ page }) => {
  await mockRestFallaReasignaciones(page);
  await loginComoAdmin(page);
  const leg = await inyectarLegajo(page, { servicio: 'ORIG.FALLA', supervisor: 'Sup Origen Falla', funcion: 'Operario A' });
  await page.evaluate(({ codigo }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.objetivos = DB.objetivos || [];
      DB.objetivos.push({
        id: Date.now(), codigo, nombre: 'Servicio Destino Falla', estado: 'Operativo', anulado: false,
        supervisorAsignado: 'Sup Destino Falla', efts: 200,
        dir: 'Calle Falla 1', localidad: 'CABA', jurisdiccion: 'CABA',
        puestos: [{ cantidad: 1, puesto: 'Operario A', horarioDesde: '14:00', horarioHasta: '18:00', tipoHorario: 'fijo', dias: { lunes: true } }],
      });
      DB.motivosReasignacion = ['Necesidad operativa'];
    });
  }, { codigo: 'DEST.FALLA' });

  await page.evaluate(() => window.navTo('reasignaciones'));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.abrirNuevaReasignacion());
  await page.waitForTimeout(100);

  await page.fill('#reas-asociado', `${leg.nombre} (N°${leg.nro})`);
  await page.evaluate(() => window.autocompletarReas());
  await page.evaluate(() => window.setModoReas('reub'));
  await page.fill('#reas-serv-dest', 'DEST.FALLA');
  await page.evaluate(() => window.onChangeServicioDestinoReas());
  await page.selectOption('#reas-motivo', 'Necesidad operativa');
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill('#reas-fecha', manana);
  await page.fill('#reas-desc', 'Reubicación e2e falla');
  await page.selectOption('#reas-originada-por', 'RRHH');
  await page.check('#reas-consultado');
  await page.fill('#reas-consultado-por', 'Supervisor E2E');

  const cantidadAntes = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.reasignaciones.length);

  await page.click('button.reas-btn-guardar:has-text("Elevar")');

  await expect(page.locator('#toast')).toContainText('No se pudo guardar la reasignación', { timeout: 5000 });
  await expect(page.locator('#toast')).not.toContainText('elevada');
  await expect(page.locator('#modal-reasignacion')).toBeVisible();

  const cantidadDespues = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.reasignaciones.length);
  expect(cantidadDespues).toBe(cantidadAntes);

  // El legajo NO se movió — la falla de guardado no puede haber ejecutado
  // el cambio real (esto es "Pendiente", ejecutarReasignacion() ni corre).
  const legFinal = await page.evaluate(async (nro) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.legajos.find((l) => String(l.nro) === String(nro));
  }, leg.nro);
  expect(legFinal.servicio).toBe('ORIG.FALLA');
});

import { test, expect } from '@playwright/test';

// Ticket "Lista Supervisores" (30/09/2026, reporte de Gisela Carballo) —
// mismo síntoma y misma reportante que el ticket #195 ya resuelto una vez
// (ver comentario en src/modules/supervisores/supervisores.js): un
// supervisor dado de alta en el módulo Supervisores no aparecía en el
// select de "Asignar supervisor" de Servicios → Pendientes de asignación.
//
// Causa real: #195 unificó ~12 selects/datalists detrás de DB.supervisores,
// pero el de "Asignar/Cambiar supervisor" de un servicio quedó afuera —
// seguía leyendo legajos con función='Supervisor', una fuente distinta del
// catálogo real (DB.supervisoresConfig). Un supervisor de alta reciente,
// cargado SOLO en el catálogo (el caso normal, sin legajo propio), nunca
// aparecía ahí.

async function loginComoAdmin(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async () => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Admin E2E', perfil: 'Administrador total' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

test('un supervisor recién dado de alta en el catálogo aparece en "Asignar supervisor" de un servicio', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.objetivos = DB.objetivos || [];
      DB.objetivos.push({
        id: 993100001, codigo: 'SUP.LISTA.TEST', nombre: 'Cons. Supervisores Lista Test',
        estado: 'Pendiente asignación operativa', anulado: false,
      });
      // Alta de supervisor EXACTAMENTE como la hace el módulo Supervisores
      // (agregarSupervisorAlCatalogo) — sin ningún legajo propio, que es
      // el caso normal de un alta desde ese módulo.
      DB.supervisoresConfig = DB.supervisoresConfig || [];
      DB.supervisoresConfig.push({ id: 993100002, nombre: 'Carballo Gisela Soledad', activo: true });
      // Legajo de control: función Supervisor pero SIN estar en el
      // catálogo — no debería aparecer (si apareciera, confirmaría que el
      // select volvió a leer de legajos en vez del catálogo).
      DB.legajos = DB.legajos || [];
      DB.legajos.push({ nro: 993100003, nombre: 'Legajo Suelto Sin Catalogo', funcion: 'Supervisor', estado: 'Activo' });
    });
  });

  await page.evaluate(() => window.navTo('objetivos'));
  await page.evaluate((idLocal) => window.abrirAsignarSupervisor(idLocal), String(993100001).slice(-9));
  await expect(page.locator('#modal-sup-objetivo')).toHaveClass(/open/);

  const opciones = await page.locator('#sup-obj-select option').allTextContents();
  expect(opciones).toContain('Carballo Gisela Soledad');
  expect(opciones).not.toContain('Legajo Suelto Sin Catalogo');

  await page.selectOption('#sup-obj-select', 'Carballo Gisela Soledad');
  await page.locator('#modal-sup-objetivo button:has-text("Confirmar")').click();
  await page.waitForTimeout(200);

  const asignado = await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => DB.objetivos.find((o) => o.codigo === 'SUP.LISTA.TEST').supervisorAsignado);
  });
  expect(asignado).toBe('Carballo Gisela Soledad');
});

test('un supervisor DESACTIVADO del catálogo no aparece para asignar (mismo filtro que ya usa la recomendación IA)', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.objetivos = DB.objetivos || [];
      DB.objetivos.push({ id: 993100010, codigo: 'SUP.LISTA.TEST2', nombre: 'Otro Servicio Test', estado: 'Pendiente asignación operativa', anulado: false });
      DB.supervisoresConfig = DB.supervisoresConfig || [];
      DB.supervisoresConfig.push({ id: 993100011, nombre: 'Supervisor Inactivo Test', activo: false });
    });
  });
  await page.evaluate(() => window.navTo('objetivos'));
  await page.evaluate((idLocal) => window.abrirAsignarSupervisor(idLocal), String(993100010).slice(-9));
  const opciones = await page.locator('#sup-obj-select option').allTextContents();
  expect(opciones).not.toContain('Supervisor Inactivo Test');
});

import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// BANDEJA_AUDITOR_subtabs_para_Fede.md (30/09) + mockup_bandeja_auditor_subtabs.html:
// "Pasaron directo a Compras" deja de vivir en el medio de la pantalla
// principal del auditor y pasa a ser un subtab aparte, puramente
// informativo (solo lectura, sin acciones, sin sumar al contador). El
// contador rojo de la pestaña pasa a contar SOLO lo que cae en
// "Para revisar" (NO PAGAN en revisión).

const MES = '2027-07';

async function sembrar(page) {
  return page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const per = { id: 991600001, mes, estado: 'abierto', cierreProgramado: '2027-07-31T17:00:00.000Z', anulado: false };
    DB.ppPeriodos = [per];
    DB.objetivos = [...(DB.objetivos || []),
      { id: 991600010, codigo: 'E2E.AUD.NOPAGA', nombre: 'Servicio No Pagan Subtabs', estado: 'Operativo', anulado: false, clienteIdLocal: null, supervisorAsignado: 'Sup Revisar' },
      { id: 991600011, codigo: 'E2E.AUD.PAGA', nombre: 'Servicio Pagan Subtabs', estado: 'Operativo', anulado: false, clienteIdLocal: null, supervisorAsignado: 'Sup Paga' },
    ];
    const periodoIdLocal = String(per.id).slice(-9);
    DB.ppPedidos = [
      // "Para revisar": NO PAGAN, en revisión — es lo único que debe sumar al badge.
      { id: 991600020, periodoIdLocal, servicioCodigo: 'E2E.AUD.NOPAGA', estado: 'confirmado_revision', facturacionNeta: 0, porcentajeTope: 0.06, supervisor: 'Sup Revisar', anulado: false },
      // "Servicios que pagan": PAGAN, pasó directo a Compras — informativo.
      { id: 991600021, periodoIdLocal, servicioCodigo: 'E2E.AUD.PAGA', estado: 'confirmado', facturacionNeta: 1000000, porcentajeTope: 0.06, supervisor: 'Sup Paga', anulado: false, confirmadoEn: '2027-07-10T12:00:00.000Z' },
    ];
    DB.ppItems = DB.ppItems || [];
  }, MES);
}

async function irABandeja(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.navTo('pedido_productos'));
  await page.waitForTimeout(700);
  await page.locator('#pp-tab-btn-auditoria').click();
  await page.waitForTimeout(300);
}

test('La Bandeja del auditor abre con 2 subtabs — "Para revisar" por defecto, badge que cuenta SOLO eso', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);
  await irABandeja(page);
  await page.locator('#pp-aud-periodo-sel').selectOption('991600001');
  await page.waitForTimeout(300);

  // Default: "Para revisar" activo y visible, "Servicios que pagan" oculto.
  await expect(page.locator('.stab[data-asub="para_revisar"]')).toHaveClass(/act/);
  await expect(page.locator('.stab[data-asub="pagan"]')).not.toHaveClass(/act/);
  await expect(page.locator('#pp-auditoria-sub-para_revisar')).toBeVisible();
  await expect(page.locator('#pp-auditoria-sub-pagan')).toBeHidden();
  await expect(page.locator('#tbody-pp-auditoria')).toContainText('Servicio No Pagan Subtabs');

  // El badge de la pestaña cuenta SOLO "para revisar" (1), nunca el PAGAN.
  await expect(page.locator('#pp-badge-auditoria')).toHaveText('1');
  await expect(page.locator('#pp-badge-auditoria')).toBeVisible();

  // Cambiar a "Servicios que pagan": se ve esa lista, no acciones/onclick.
  await page.click('.stab[data-asub="pagan"]');
  await expect(page.locator('.stab[data-asub="pagan"]')).toHaveClass(/act/);
  await expect(page.locator('.stab[data-asub="para_revisar"]')).not.toHaveClass(/act/);
  await expect(page.locator('#pp-auditoria-sub-pagan')).toBeVisible();
  await expect(page.locator('#pp-auditoria-sub-para_revisar')).toBeHidden();
  await expect(page.locator('#tbody-pp-auditoria-directo')).toContainText('Servicio Pagan Subtabs');
  const filaPaga = page.locator('#tbody-pp-auditoria-directo tr', { hasText: 'Servicio Pagan Subtabs' });
  await expect(filaPaga).not.toHaveClass(/clk/);
  const tieneOnclick = await filaPaga.evaluate(tr => tr.hasAttribute('onclick'));
  expect(tieneOnclick).toBe(false);

  // El badge no cambia por mirar el subtab informativo.
  await expect(page.locator('#pp-badge-auditoria')).toHaveText('1');

  // Salir del módulo y volver: arranca de nuevo en "Para revisar" (no
  // se queda pegado en el subtab que se había dejado abierto).
  await page.evaluate(() => window.navTo('clientes'));
  await page.waitForTimeout(300);
  await irABandeja(page);
  await expect(page.locator('.stab[data-asub="para_revisar"]')).toHaveClass(/act/);
  await expect(page.locator('#pp-auditoria-sub-para_revisar')).toBeVisible();
});

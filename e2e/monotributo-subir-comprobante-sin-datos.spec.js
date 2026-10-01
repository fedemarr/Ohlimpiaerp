import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §3: "💲 Subir comprobante" tiene
// que estar disponible en CUALQUIER fila de la bandeja, no solo las que ya
// tienen la Constancia MT cargada (categoría/zona/condición conocidas). El
// comprobante de pago nunca trae la categoría impresa (investigado: solo
// CUIT/período/importe/fecha/transacción) y deducirla del importe es
// ambiguo (categorías distintas pueden dar la misma cuota bajo ciertas
// condiciones) — por eso, si falta, se pide con un mini-formulario de 4
// campos antes de leer el ticket.

function periodoActualMMAAAA() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function mockInfra(page, { analizarBody }) {
  await page.route('**/storage/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'k' }) }));
  await page.route('**/api/analizar-documento', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(analizarBody),
  }));
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

async function stubSesion(page) {
  await page.evaluate(async () => {
    const { SUPA } = await import('/src/shared/supabase.js');
    SUPA.auth.getSession = async () => ({ data: { session: { access_token: 'fake-token' } } });
  });
}

async function seedTablaArcaCategoriaB(page) {
  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoTablasOrg = DB.monoTablasOrg || [];
      DB.monoTablasOrg.push(
        { organismo: 'ARCA', categoria: 'B', vigenciaDesde: '2026-08-01', topeIngresosAnual: 17612543.74, impuestoIntegrado: 7623.49, sipa: 18246.86, obraSocial: 25694.55 },
      );
    });
  });
}

test('Bandeja — "Subir comprobante" en una fila SIN INICIAR pide los 4 datos mínimos y promueve al Padrón', async ({ page }) => {
  const periodo = periodoActualMMAAAA();
  const importeEsperadoCatB = 7623.49 + 18246.86 + 25694.55; // imp + sipa + os, comun, adherentes=0, sin IIBB
  await mockInfra(page, { analizarBody: { cuit: '20-995501-003', periodo, importe: importeEsperadoCatB, fechaPago: '2026-10-05', transaccion: 'T-SINDATOS-1', confianza: 'alta' } });
  await loginComoAdmin(page);
  await stubSesion(page);
  await seedTablaArcaCategoriaB(page);

  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro: 995501, nombre: 'SIN DATOS COMPROBANTE', dni: '30995501', estado: 'Activo', cuit: '20995501003', ingreso: '01/10/2026' });
      window.navTo('monotributos');
    });
  });
  await page.waitForTimeout(200);

  const tbody = page.locator('#tbody-mono-pendientes');
  const fila = tbody.locator('tr', { hasText: 'SIN DATOS COMPROBANTE' });
  await expect(fila).toContainText('SIN INICIAR');
  // El botón está disponible aunque no haya ningún dato cargado todavía.
  await expect(fila).toContainText('💲 Subir comprobante');

  await fila.locator('text=💲 Subir comprobante').click();
  await expect(page.locator('#modal-datos-rapidos-mono')).toBeVisible();

  await page.selectOption('#drm-categoria', 'B');
  await page.selectOption('#drm-zona', 'capital');
  await page.selectOption('#drm-condicion', 'comun');
  await page.fill('#drm-adherentes', '0');

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('text=Continuar → elegir comprobante'),
  ]);
  await fileChooser.setFiles({ name: 'comprobante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('contenido') });
  await page.waitForTimeout(300);

  const estado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return {
      enPadron: DB.monotributos.find(r => r.nroSocio === '995501'),
      tramite: DB.monoTramites.find(t => t.legajoNro === '995501'),
      cambio: (DB.monoCambios || []).find(c => c.nombre === 'SIN DATOS COMPROBANTE'),
    };
  });
  expect(estado.enPadron).toBeTruthy();
  expect(estado.enPadron.categoria).toBe('B');
  expect(estado.tramite.categoria).toBe('B');
  expect(estado.tramite.zona).toBe('capital');
  expect(estado.tramite.anulado).toBe(true);
  expect(estado.cambio).toBeTruthy();
  expect(estado.cambio.tipo).toBe('alta_bandeja');

  // Sale de la bandeja.
  await expect(tbody).not.toContainText('SIN DATOS COMPROBANTE');
});

// Regla de negocio existente (misma que el resto del módulo): "asociado
// cooperativa" es exclusivo de categoría A — si en el mini-formulario se
// elige otra categoría con esa condición, se normaliza a "comun" en vez de
// guardar una combinación inválida.
test('Mini-formulario: "asociado cooperativa" con categoría distinta de A se normaliza a "comun"', async ({ page }) => {
  await mockInfra(page, { analizarBody: { cuit: '20-995502-001', periodo: periodoActualMMAAAA(), importe: 0, fechaPago: '2026-10-05', transaccion: 'T-X', confianza: 'alta' } });
  await loginComoAdmin(page);
  await stubSesion(page);

  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro: 995502, nombre: 'Normaliza Condicion Test', dni: '30995502', estado: 'Activo', cuit: '20995502001', ingreso: '01/10/2026' });
    });
  });

  const resultado = await page.evaluate(async (nro) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' });
    await mod.confirmarComprobanteBandeja(nro, file, { categoria: 'D', zona: 'provincia', condicion: 'asociado_cooperativa', adherentesCantidad: 0, iibbAporta: false });
    const { DB } = await import('/src/shared/state.js');
    return DB.monoTramites.find(t => t.legajoNro === nro);
  }, '995502');

  expect(resultado.categoria).toBe('D');
  expect(resultado.condicion).toBe('comun'); // normalizado — D no es A
});

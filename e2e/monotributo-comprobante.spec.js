import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_v2_mes_en_curso_para_Fede.md, punto 3 — "el lector de
// comprobantes: una pieza, usada en dos lugares". Se mockea
// /api/analizar-documento (no hay forma de probar contra la IA real desde
// acá) y el storage de Supabase, pero se ejercita el código real de
// matchComprobante/confirmarComprobanteBandeja/confirmarComprobantePagoMensual
// tal cual corre en producción — igual que portal-asociado-login.spec.js
// hace con el endpoint de login.

function periodoActualMMAAAA() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Mismo cálculo que _mesActual() en comprobantes.js (fecha LOCAL, no UTC).
// toISOString() usa UTC — entre ~21:00 y 00:00 hora argentina ya cae en el
// mes siguiente en UTC y desalinea el período sembrado del que compara
// matchComprobante(), dando un falso negativo sin bug real de por medio.
function periodoActualYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

async function seedTablaArcaCategoriaA(page) {
  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoTablasOrg = DB.monoTablasOrg || [];
      DB.monoTablasOrg.push(
        { organismo: 'ARCA', categoria: 'A', vigenciaDesde: '2026-08-01', topeIngresosAnual: 12009410.45, impuestoIntegrado: 5585.77, sipa: 18246.86, obraSocial: 25694.55 },
      );
    });
  });
}

test('Bandeja — comprobante que matchea promueve al Padrón y registra el primer período pagado', async ({ page }) => {
  const periodo = periodoActualMMAAAA();
  await mockInfra(page, { analizarBody: { cuit: '20-994201-005', periodo, importe: 49527.18, fechaPago: '2026-09-05', transaccion: 'T-OK-1', confianza: 'alta' } });
  await loginComoAdmin(page);
  await stubSesion(page);
  await seedTablaArcaCategoriaA(page);

  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro: 994201, nombre: 'Comprobante Ok Test', dni: '30994201', estado: 'Activo', cuit: '20994201005', ingreso: '20/09/2026' });
      DB.monoTramites = DB.monoTramites || [];
      DB.monoTramites.push({
        id: 'MTR994201', legajoNro: '994201', nombreAsociado: 'Comprobante Ok Test', anulado: false,
        categoria: 'A', zona: 'provincia', condicion: 'comun', iibbAporta: false, adherentesCantidad: 0, fechaInicioMt: '2026-09-01',
      });
    });
  });

  const resultado = await page.evaluate(async (nro) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' });
    return mod.confirmarComprobanteBandeja(nro, file);
  }, '994201');
  expect(resultado.ok).toBe(true);

  const estado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return {
      enPadron: DB.monotributos.find(r => r.nroSocio === '994201'),
      tramite: DB.monoTramites.find(t => t.legajoNro === '994201'),
      pago: DB.monoPagosMes.find(p => p.nroSocio === '994201'),
    };
  });
  expect(estado.enPadron).toBeTruthy();
  expect(estado.enPadron.categoria).toBe('A');
  expect(estado.tramite.anulado).toBe(true); // sale de la bandeja
  expect(estado.pago).toBeTruthy();
  expect(estado.pago.pagado).toBe(true);
  expect(estado.pago.enRevision).toBe(false);
  expect(estado.pago.comprobanteTransaccion).toBe('T-OK-1');
});

test('Bandeja — comprobante con importe que NO cuadra queda "en revisión", nadie se tilda ni pasa al Padrón', async ({ page }) => {
  const periodo = periodoActualMMAAAA();
  // Importe de categoría A "asoc. cooperativa" ($43.941,41) para una persona
  // cargada como A "común" ($49.527,18) — mismo tipo de caso real que
  // "Acevedo Justina" del mockup: categoría/condición no coincide con el pago.
  await mockInfra(page, { analizarBody: { cuit: '20-994202-005', periodo, importe: 43941.41, fechaPago: '2026-09-05', transaccion: 'T-BAD-1', confianza: 'alta' } });
  await loginComoAdmin(page);
  await stubSesion(page);
  await seedTablaArcaCategoriaA(page);

  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro: 994202, nombre: 'Comprobante Mal Test', dni: '30994202', estado: 'Activo', cuit: '20994202005', ingreso: '20/09/2026' });
      DB.monoTramites = DB.monoTramites || [];
      DB.monoTramites.push({
        id: 'MTR994202', legajoNro: '994202', nombreAsociado: 'Comprobante Mal Test', anulado: false,
        categoria: 'A', zona: 'provincia', condicion: 'comun', iibbAporta: false, adherentesCantidad: 0, fechaInicioMt: '2026-09-01',
      });
    });
  });

  const resultado = await page.evaluate(async (nro) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' });
    return mod.confirmarComprobanteBandeja(nro, file);
  }, '994202');
  expect(resultado.ok).toBe(false);
  expect(resultado.motivo).toMatch(/importe/i);

  const estado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return {
      enPadron: DB.monotributos.find(r => r.nroSocio === '994202'),
      tramite: DB.monoTramites.find(t => t.legajoNro === '994202'),
      pago: DB.monoPagosMes.find(p => p.nroSocio === '994202'),
    };
  });
  expect(estado.enPadron).toBeFalsy(); // NO pasa al Padrón
  expect(estado.tramite.anulado).toBe(false); // sigue en la bandeja
  expect(estado.pago).toBeTruthy();
  expect(estado.pago.pagado).toBe(false);
  expect(estado.pago.enRevision).toBe(true);
});

test('Pago mensual — comprobante que matchea tilda la fila ya armada por "Armar lista"', async ({ page }) => {
  const periodo = periodoActualMMAAAA();
  const periodoYYYYMM = periodoActualYYYYMM();
  await mockInfra(page, { analizarBody: { cuit: '20-994203-005', periodo, importe: 49527.18, fechaPago: '2026-09-05', transaccion: 'T-PM-1', confianza: 'alta' } });
  await loginComoAdmin(page);
  await stubSesion(page);
  await seedTablaArcaCategoriaA(page);

  const pagoId = await page.evaluate(({ periodoYYYYMM }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monotributos.push({ id: Date.now(), nombre: 'Pago Mensual Test', nroSocio: '994203', cuit: '20994203005', categoria: 'A', zona: 'provincia', condicion: 'comun', iibbAporta: false, adherentesCantidad: 0, estado: 'Al día' });
      const id = Date.now() + 1;
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({ id, periodo: periodoYYYYMM, nroSocio: '994203', nombre: 'Pago Mensual Test', total: 49527.18, pagado: false });
      return id;
    });
  }, { periodoYYYYMM });

  const resultado = await page.evaluate(async (pagoId) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' });
    return mod.confirmarComprobantePagoMensual(pagoId, file);
  }, pagoId);
  expect(resultado.ok).toBe(true);

  const pago = await page.evaluate(async (pagoId) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(p => String(p.id) === String(pagoId));
  }, pagoId);
  expect(pago.pagado).toBe(true);
  expect(pago.metodoPago).toBe('Comprobante');
  expect(pago.comprobanteTransaccion).toBe('T-PM-1');
});

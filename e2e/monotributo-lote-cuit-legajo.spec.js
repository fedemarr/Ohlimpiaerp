import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_bug_lote_para_Fede.md (01/10/2026, Lautaro): "Subir ticket"
// por fila tomaba un comprobante que "Subir comprobantes (varios)" (lote)
// mandaba a "En revisión" con motivo "El CUIT no corresponde a ningún
// monotributista del padrón" — mismo PDF, mismo CUIT. Causa real: el lote
// buscaba el CUIT leído en DB.monotributos (el Padrón), que puede tener
// ese campo desactualizado para alguien que de todos modos está bien en
// la lista del mes — el individual nunca pisaba esto porque no busca por
// CUIT (ya sabe de qué fila es). Confirmado con un caso real: legajo con
// CUIT correcto, padrón con el campo vacío/distinto.

function periodoActualMMAAAA() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function periodoActualYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function mockInfra(page, { respuestasPorArchivo }) {
  await page.route('**/api/analizar-documento', (route) => {
    const body = respuestasPorArchivo.shift();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
}

async function stubSesionYStorage(page) {
  await page.evaluate(async () => {
    const { SUPA } = await import('/src/shared/supabase.js');
    SUPA.auth.getSession = async () => ({ data: { session: { access_token: 'fake-token' } } });
    SUPA.storage.from = () => ({
      upload: async (path) => ({ data: { path }, error: null }),
      createSignedUrl: async (path) => ({ data: { signedUrl: 'https://fake-signed.test/' + path }, error: null }),
    });
  });
}

test('El lote matchea por el CUIT del LEGAJO aunque el padrón (DB.monotributos) tenga el CUIT desactualizado — caso real Acevedo Mariana Isabel', async ({ page }) => {
  const periodo = periodoActualMMAAAA();
  const periodoYYYYMM = periodoActualYYYYMM();
  const cuitReal = '27347321708'; // el que lee el PDF — es el del LEGAJO
  await mockInfra(page, {
    respuestasPorArchivo: [
      { cuit: cuitReal, periodo, importe: 49527.18, fechaPago: '2026-10-01', transaccion: 'T-4991', confianza: 'alta' },
    ],
  });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  await page.evaluate(({ periodoYYYYMM, cuitReal }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro: 4991, nombre: 'Acevedo Mariana Isabel', cuit: cuitReal, estado: 'Activo' });
      // El padrón tiene el CUIT VACÍO (el caso real reportado) — si el lote
      // buscara acá, no encontraría a nadie.
      DB.monotributos.push({ id: 1, nombre: 'Acevedo Mariana Isabel', nroSocio: '4991', cuit: '', categoria: 'A', zona: 'provincia', condicion: 'comun', estado: 'Al día' });
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({ id: 991001, periodo: periodoYYYYMM, nroSocio: '4991', nombre: 'Acevedo Mariana Isabel', total: 49527.18, pagado: false });
    });
  }, { periodoYYYYMM, cuitReal });

  const resumen = await page.evaluate(async (periodoYYYYMM) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const file = new File(['a'], 'acevedo.pdf', { type: 'application/pdf' });
    return mod.confirmarComprobantesLotePagoMensual([file], periodoYYYYMM);
  }, periodoYYYYMM);
  expect(resumen.tildados).toBe(1);
  expect(resumen.enRevision).toBe(0);

  const fila = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(p => p.nroSocio === '4991');
  });
  expect(fila.pagado).toBe(true);
  expect(fila.comprobantePath).toBeTruthy();
});

test('Un CUIT repetido dentro del MISMO lote se marca como duplicado — no se procesa dos veces ni genera un "no está en la lista" confuso', async ({ page }) => {
  const periodo = periodoActualMMAAAA();
  const periodoYYYYMM = periodoActualYYYYMM();
  await mockInfra(page, {
    respuestasPorArchivo: [
      { cuit: '27317513254', periodo, importe: 49527.18, fechaPago: '2026-10-01', transaccion: 'T-DUP-1', confianza: 'alta' },
      { cuit: '27317513254', periodo, importe: 49527.18, fechaPago: '2026-10-01', transaccion: 'T-DUP-2', confianza: 'alta' },
    ],
  });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  await page.evaluate(({ periodoYYYYMM }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro: 5555, nombre: 'Duplicado Test', cuit: '27317513254', estado: 'Activo' });
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({ id: 991002, periodo: periodoYYYYMM, nroSocio: '5555', nombre: 'Duplicado Test', total: 49527.18, pagado: false });
    });
  }, { periodoYYYYMM });

  const resumen = await page.evaluate(async (periodoYYYYMM) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const files = [
      new File(['a'], 'uno.pdf', { type: 'application/pdf' }),
      new File(['b'], 'dos.pdf', { type: 'application/pdf' }),
    ];
    return mod.confirmarComprobantesLotePagoMensual(files, periodoYYYYMM);
  }, periodoYYYYMM);
  expect(resumen.tildados).toBe(1);
  expect(resumen.enRevision).toBe(1);

  const { fila, enRevisionNueva } = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return {
      fila: DB.monoPagosMes.find(p => p.nroSocio === '5555'),
      enRevisionNueva: DB.monoPagosMes.find(p => p.nroSocio === null && p.enRevisionMotivo?.includes('repetido')),
    };
  });
  expect(fila.pagado).toBe(true); // el primero se tilda normal
  expect(enRevisionNueva).toBeTruthy();
  expect(enRevisionNueva.enRevisionMotivo).toMatch(/repetido en este lote/i);
});

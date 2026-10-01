import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket "Pago mensual — carga en lote de comprobantes + comprobante
// clickeable en 3 lugares" (30/09/2026). Reusa el mismo lector de PDF que
// ya usa "Subir ticket" (confirmarComprobantePagoMensual,
// src/modules/monotributo_comprobantes/comprobantes.js) — acá se agrega
// el reparto por CUIT/período/importe contra TODA la lista del mes, y se
// verifica que el chip de comprobante abra el PDF real en los 3 lugares
// donde vive: la fila de Pago mensual, el panel "En revisión" y el
// historial de pagos de la ficha del monotributista.

function periodoActualMMAAAA() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Mismo cálculo que _mesActual() en comprobantes.js (fecha LOCAL, no UTC).
// new Date().toISOString().slice(0,7) usa UTC — entre ~21:00 y 00:00 hora
// argentina ya cayó en el día/mes siguiente en UTC, y desalinea el período
// que arma este test del que calcula la app real, dando falsos negativos
// sin que haya ningún bug de producción de por medio.
function periodoActualYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Mismo criterio que mockInfra/stubSesion en monotributo-comprobante.spec.js:
// las rutas se registran ANTES del login (el init de la app ya dispara
// REST reales apenas se hace goto('/')), y los stubs que necesitan el
// contexto de la página (SUPA.auth, SUPA.storage, window.open) se aplican
// DESPUÉS del login vía page.evaluate.
//
// Storage: no existe en el repo ningún test que mockee el endpoint real de
// Supabase Storage (`storage/v1/object/sign/...`), y su forma de respuesta
// depende de detalles internos del SDK (signedURL relativo vs absoluto)
// que no vale la pena adivinar. En vez de mockear HTTP crudo, se stubea
// `SUPA.storage.from(...)` directo — mismo tipo de sesión ya vista en el
// bloque `error` de matchComprobante: se prueba el código real de la app
// (obtenerUrlFirmada, _subirComprobante) contra un doble determinístico del
// cliente, no contra la red.
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
    window.__urlsAbiertas = [];
    window.open = (url) => { window.__urlsAbiertas.push(url); return { closed: false }; };
    SUPA.storage.from = () => ({
      upload: async (path) => ({ data: { path }, error: null }),
      createSignedUrl: async (path) => ({ data: { signedUrl: 'https://fake-signed.test/' + path }, error: null }),
    });
  });
}

test('Carga en lote: reparte por CUIT, tilda lo que cuadra y manda a "En revisión" lo que no', async ({ page }) => {
  const periodo = periodoActualMMAAAA();
  const periodoYYYYMM = periodoActualYYYYMM();
  const respuestasPorArchivo = [
    { cuit: '20-994301-005', periodo, importe: 49527.18, fechaPago: '2026-09-05', transaccion: 'T-LOTE-1', confianza: 'alta' },
    { cuit: '20-994302-005', periodo, importe: 1, fechaPago: '2026-09-05', transaccion: 'T-LOTE-2', confianza: 'alta' },
    { cuit: '27999999999', periodo, importe: 49527.18, fechaPago: '2026-09-05', transaccion: 'T-LOTE-3', confianza: 'alta' },
  ];
  await mockInfra(page, { respuestasPorArchivo });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  const [pagoIdOk, pagoIdMal] = await page.evaluate(({ periodoYYYYMM }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monotributos.push(
        { id: 1, nombre: 'Lote Ok Test', nroSocio: '994301', cuit: '20994301005', categoria: 'A', zona: 'provincia', condicion: 'comun', iibbAporta: false, adherentesCantidad: 0, estado: 'Al día' },
        { id: 2, nombre: 'Lote Mal Test', nroSocio: '994302', cuit: '20994302005', categoria: 'A', zona: 'provincia', condicion: 'comun', iibbAporta: false, adherentesCantidad: 0, estado: 'Al día' },
      );
      const idOk = Date.now(), idMal = Date.now() + 1;
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push(
        { id: idOk, periodo: periodoYYYYMM, nroSocio: '994301', nombre: 'Lote Ok Test', total: 49527.18, pagado: false },
        { id: idMal, periodo: periodoYYYYMM, nroSocio: '994302', nombre: 'Lote Mal Test', total: 49527.18, pagado: false },
      );
      return [idOk, idMal];
    });
  }, { periodoYYYYMM });

  // 3 comprobantes ya encolados en respuestasPorArchivo: uno cuadra perfecto
  // (994301), uno con CUIT que corresponde a otra persona pero el importe
  // no cierra (caso real "Acevedo Justina" del mockup), y uno con un CUIT
  // que no existe en el padrón (comprobante de otro servicio/persona).
  const resumen = await page.evaluate(async (periodoYYYYMM) => {
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const files = [
      new File(['a'], 'ok.pdf', { type: 'application/pdf' }),
      new File(['b'], 'mal.pdf', { type: 'application/pdf' }),
      new File(['c'], 'desconocido.pdf', { type: 'application/pdf' }),
    ];
    return mod.confirmarComprobantesLotePagoMensual(files, periodoYYYYMM);
  }, periodoYYYYMM);
  expect(resumen.tildados).toBe(1);
  expect(resumen.enRevision).toBe(2);

  const estado = await page.evaluate(async ({ pagoIdOk, pagoIdMal }) => {
    const { DB } = await import('/src/shared/state.js');
    return {
      ok: DB.monoPagosMes.find(p => String(p.id) === String(pagoIdOk)),
      mal: DB.monoPagosMes.find(p => String(p.id) === String(pagoIdMal)),
      desconocido: DB.monoPagosMes.find(p => (p.nombre || '').includes('27999999999')),
    };
  }, { pagoIdOk, pagoIdMal });
  expect(estado.ok.pagado).toBe(true);
  expect(estado.ok.comprobantePath).toBeTruthy();
  expect(estado.mal.pagado).toBe(false);
  expect(estado.mal.enRevision).toBe(true);
  expect(estado.mal.enRevisionMotivo).toMatch(/importe/i);
  expect(estado.desconocido).toBeTruthy();
  expect(estado.desconocido.enRevision).toBe(true);
  expect(estado.desconocido.nroSocio).toBeNull();

  // El panel "En revisión" de la UI refleja las 2 filas sin tocar la lista principal.
  await page.evaluate(() => window.navTo('monotributos'));
  await page.evaluate(() => window.tabMonotributos('pagos', null));
  await page.waitForTimeout(150);
  await expect(page.locator('#mono-en-revision-count')).toHaveText('2');
  await expect(page.locator('#mono-card-en-revision')).toBeVisible();
  await expect(page.locator('#tbody-mono-en-revision')).toContainText('Lote Mal Test');
  await expect(page.locator('#tbody-mono-en-revision')).toContainText('994302');
  await expect(page.locator('#tbody-mono-pagos')).not.toContainText('Lote Mal Test');
});

test('El chip de comprobante es clickeable en Pago mensual, en "En revisión" y en el historial de pagos de la ficha', async ({ page }) => {
  const periodoYYYYMM = periodoActualYYYYMM();
  await mockInfra(page, { respuestasPorArchivo: [] });
  await loginComoAdmin(page);
  await stubSesionYStorage(page);

  await page.evaluate(({ periodoYYYYMM }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monotributos.push({ id: 3, nombre: 'Chip Click Test', nroSocio: '994303', cuit: '20994303005', categoria: 'A', zona: 'provincia', condicion: 'comun', estado: 'Al día' });
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push(
        { id: 5001, periodo: periodoYYYYMM, nroSocio: '994303', nombre: 'Chip Click Test', total: 49527.18, pagado: true, comprobantePath: 'mono-comprobantes/994303/x.pdf' },
        { id: 5002, periodo: periodoYYYYMM, nroSocio: null, nombre: 'CUIT 27111111111 (no reconocido)', total: 0, pagado: false, enRevision: true, enRevisionMotivo: 'No corresponde a nadie', comprobantePath: 'mono-comprobantes/lote/y.pdf' },
      );
    });
  }, { periodoYYYYMM });

  await page.evaluate(() => window.navTo('monotributos'));
  await page.evaluate(() => window.tabMonotributos('pagos', null));
  await page.waitForTimeout(150);

  // 1) Fila de Pago mensual.
  await page.click('#tbody-mono-pagos >> text=📎 adjunto');
  await page.waitForTimeout(100);

  // 2) Panel "En revisión".
  await page.click('#tbody-mono-en-revision >> text=📎 ver');
  await page.waitForTimeout(100);

  // 3) Historial de pagos de la ficha (Padrón → 💰 pagos).
  await page.evaluate(() => window.tabMonotributos('padron', null));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.verHistorialPagosMono('3'));
  await expect(page.locator('#modal-hist-pagos-mono')).toBeVisible();
  await page.click('#hist-pagos-mono-lista >> text=📎 ver comprobante');
  await page.waitForTimeout(100);

  const urls = await page.evaluate(() => window.__urlsAbiertas);
  expect(urls.length).toBe(3);
  expect(urls[0]).toContain('994303/x.pdf');
  expect(urls[1]).toContain('lote/y.pdf');
  expect(urls[2]).toContain('994303/x.pdf');
});

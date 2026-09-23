import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket real: "Error al Eliminar Clientes/Servicios" — dar de baja un
// cliente tiraba el error crudo de Postgres ("duplicate key value violates
// unique constraint idx_clientes_codigo_unico") sin explicación. Investigado
// contra la base real: 0 códigos duplicados hoy, así que el disparador es
// una condición transitoria (una fila que la pantalla cree que existe con
// tal id_local mientras el servidor ya no la tiene con ese id_local, o
// viceversa) — no algo que se pueda "arreglar" borrando datos. El fix real
// tiene 3 partes:
//  1) confirmarBajaObjetivo() (baja de SERVICIO) era fire-and-forget, igual
//     que el bug ya conocido/arreglado de confirmarAlta(): no esperaba
//     supaSync ni revertía en memoria — un fallo del servidor dejaba el
//     servicio "Baja" solo en memoria mostrando "✓" de éxito.
//  2) Los mensajes de choque contra un índice único (23505) ahora se
//     traducen a algo accionable en vez del texto crudo de Postgres, tanto
//     en baja de cliente como de servicio.
//  3) Hallazgo colateral mientras se investigaba: crearClienteBorradorDesdeLead()
//     comparaba el id COMPLETO (Date.now()) guardado en lead.clienteBorradorId
//     contra c.id, que tras cualquier reload pasa a ser el id_local truncado
//     (_toCamel restaura "id" desde "id_local", ver supabase.js) — la
//     comparación nunca daba igual después de un reload y creaba un cliente
//     Borrador DUPLICADO cada vez que un lead volvía a pasar por "Ganado".

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

// Simula el 23505 que realmente tira Postgres — mismo texto que el ticket.
async function mockRestDuplicateKey(page, tabla) {
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (new URL(req.url()).pathname.includes('/' + tabla)) {
      return route.fulfill({
        status: 409, contentType: 'application/json',
        body: JSON.stringify({ code: '23505', message: `duplicate key value violates unique constraint "idx_${tabla}_codigo_unico"` }),
      });
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

async function sembrarObjetivo(page, overrides = {}) {
  return page.evaluate(async (overrides) => {
    const { DB } = await import('/src/shared/state.js');
    const o = {
      id: Date.now(), codigo: 'OBJ.BAJA.TEST', nombre: 'Servicio Baja Test', estado: 'Operativo',
      clienteId: null, anulado: false, ...overrides,
    };
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(o);
    return o;
  }, overrides);
}

test('Baja de servicio (objetivo) — se espera la confirmación del servidor antes de avisar éxito', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const o = await sembrarObjetivo(page);
  const idl = String(o.id).slice(-9);

  await page.evaluate((idl) => window.abrirBajaObjetivo(idl), idl);
  await expect(page.locator('#modal-baja-objetivo')).toBeVisible();
  await page.selectOption('#baja-obj-motivo', { index: 1 });
  await page.click('#modal-baja-objetivo button:has-text("Dar de baja")');

  await expect(page.locator('#modal-baja-objetivo')).toBeHidden();
  const estado = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(x => x.id === id).estado;
  }, o.id);
  expect(estado).toBe('Baja');
});

test('Baja de servicio — si el servidor falla, se revierte todo y el mensaje es claro (no el texto crudo de Postgres)', async ({ page }) => {
  await mockRestDuplicateKey(page, 'objetivos');
  await loginComoAdmin(page);
  const o = await sembrarObjetivo(page, { id: 990700001 });
  const idl = String(o.id).slice(-9);

  await page.evaluate((idl) => window.abrirBajaObjetivo(idl), idl);
  await page.selectOption('#baja-obj-motivo', { index: 1 });
  await page.click('#modal-baja-objetivo button:has-text("Dar de baja")');
  await page.waitForTimeout(200);

  // No se revierte a medias: el servicio sigue Operativo, como antes de tocar nada.
  const estado = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(x => x.id === id).estado;
  }, o.id);
  expect(estado).toBe('Operativo');

  const toastTxt = await page.locator('.toast, #toast').first().textContent();
  expect(toastTxt).toContain('pantalla haya quedado desactualizada');
  expect(toastTxt).not.toContain('idx_objetivos_codigo_unico'); // no el texto crudo de Postgres
  expect(toastTxt).not.toContain('duplicate key');

  // El modal sigue disponible para reintentar (no quedó bloqueado a medio guardar).
  await expect(page.locator('#modal-baja-objetivo')).toBeVisible();
  await expect(page.locator('#modal-baja-objetivo button:has-text("Dar de baja")')).toBeEnabled();
});

test('Baja de cliente — el mismo error de Postgres (23505) también se traduce a un mensaje claro', async ({ page }) => {
  await mockRestDuplicateKey(page, 'clientes');
  await loginComoAdmin(page);
  const cid = 990700002;
  await page.evaluate((cid) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.clientes.push({ id: cid, nombre: 'CLI BAJA TEST', codigo: 'CLI-BAJA-TEST', estado: 'Activo' });
    });
  }, cid);

  await page.evaluate((idl) => window.abrirBajaCliente(idl), String(cid).slice(-9));
  await page.fill('#baja-cli-motivo', 'Cierre de contrato');
  await page.click('#baja-cli-confirmar');
  await page.waitForTimeout(200);

  const toastTxt = await page.locator('.toast, #toast').first().textContent();
  expect(toastTxt).toContain('pantalla haya quedado desactualizada');
  expect(toastTxt).not.toContain('idx_clientes_codigo_unico');

  const estado = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.clientes.find(c => c.id === id).estado;
  }, cid);
  expect(estado).toBe('Activo'); // revertido, no quedó "Inactivo" a medias
});

test('CRM — ganar un lead ya reconciliado tras un reload no crea un cliente Borrador duplicado', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);

  // Simula EXACTAMENTE el estado post-reload: el cliente ya existe con su
  // id restaurado desde id_local (9 dígitos), y el lead sigue apuntando al
  // Date.now() COMPLETO original (13 dígitos) con el que se creó ese cliente.
  const idCompleto = 1758561234567;
  const idLocal = String(idCompleto).slice(-9);
  await page.evaluate(({ idCompleto, idLocal }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.clientes.push({ id: idLocal, nombre: 'Empresa Ya Creada SA', codigo: 'CLI-0099', estado: 'Borrador' });
      DB.leads = DB.leads || [];
      DB.leads.push({ id: 1, id_local: '1', empresa: 'Empresa Ya Creada SA', etapa: 'Contrato', clienteBorradorId: idCompleto, tipoCliente: 'Potencial' });
    });
  }, { idCompleto, idLocal });

  const cantesDeLlamar = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.clientes.length);
  await page.evaluate((idCompleto) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      const lead = DB.leads.find(l => l.clienteBorradorId === idCompleto);
      window.ofrecerCrearClienteDesdeLead(lead);
    });
  }, idCompleto);
  await page.waitForTimeout(150);

  const clientesDespues = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.clientes.length);
  expect(clientesDespues).toBe(cantesDeLlamar); // ni un cliente nuevo

  // El modal "híbrido" (completar ahora / después) se abrió igual, sobre el
  // cliente EXISTENTE — la reconciliación funciona, solo que sin duplicar.
  await expect(page.locator('#modal-hibrido-cliente')).toBeVisible();
  await expect(page.locator('#hc-texto')).toContainText('Empresa Ya Creada SA');
});

// Verifica el flujo completo del ticket "Uniforme" (Documentación de
// ingreso): cargar talles en Documentación -> aprobar -> el snapshot llega
// a cat_alt_pendientes.uniforme -> Altas precarga el tab Uniforme al abrir
// esa alta pendiente -> al confirmar, el legajo queda con tallesUniforme y
// se dispara el pedido a Logística (pedidosUniformes) con el kit completo
// (no solo Ambo/Zapatos). Cubre en el mismo test la cascada Partido ->
// Localidad de la solapa Domicilio (ticket "Corrección") porque comparten
// el mismo alta abierta.
import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Evita tocar Supabase real — cualquier tabla que toque este flujo
// (documentacion_ingreso, cat_alt_pendientes, legajos, adjuntos,
// pedidos_uniformes, pedido_uniforme_prendas) responde OK sin persistir.
async function mockSupabaseGenerico(page) {
  // Playwright: cuando 2 rutas matchean la misma URL, gana la registrada
  // ÚLTIMO — por eso el catch-all genérico va PRIMERO y el especial de
  // adjuntos (que necesita devolver algo no vacío) va DESPUÉS.
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/adjuntos**', (route) => {
    if (route.request().method() === 'GET') {
      // aprobarDocum() exige al menos 1 adjunto tipo 'antecedente' vigente.
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 1, dni: '40555666', etapa: 'documentacion', tipo: 'antecedente', url: 'x', nombre_archivo: 'x.pdf', vigente: true, borrado: false }]),
      });
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('Documentación → Uniforme se lleva a Altas y dispara el pedido a Logística completo', async ({ page }) => {
  await mockSupabaseGenerico(page);
  await loginComoAdmin(page);

  const DNI = '40555666';

  // 1) Inyectar un registro "En proceso" de Documentación (como si ya
  // hubiera pasado por Psico/Preocupacional) directo en DB, sin pasar por
  // toda la UI previa — foco del test es Documentación -> Altas.
  const docId = await page.evaluate(async (dni) => {
    const { DB } = await import('/src/shared/state.js');
    const d = {
      id: Date.now(), dni, nombre: 'Test E2E Uniforme', zona: 'CABA', tel: '1100000000',
      estado: 'En proceso',
    };
    DB.documentacionIngreso = DB.documentacionIngreso || [];
    DB.documentacionIngreso.push(d);
    return d.id;
  }, DNI);

  // 2) Abrir "Gestionar", marcar "Sin antecedentes" (habilita el botón
  // Aprobar — ver actualizarBotonesDocum()) y cargar Uniforme.
  await page.evaluate((id) => window.abrirGestionDocum(id), docId);
  await expect(page.locator('#modal-docum-gestion')).toBeVisible();
  await page.selectOption('#dc-antec-resultado', 'Sin antecedentes');
  await page.selectOption('#dc-uni-ambo', 'M');
  await page.fill('#dc-uni-calzado', '42');
  await page.selectOption('#dc-uni-chomba', 'L');
  await page.selectOption('#dc-uni-grafa', '44');
  await page.selectOption('#dc-uni-buzo', 'M');
  await page.selectOption('#dc-uni-campera', 'L');
  await page.selectOption('#dc-uni-gorra', 'Único');

  // 3) Guardar — guardarDocum() cierra el modal — reabrimos para confirmar
  // que lo que se tipeó efectivamente persistió y se precarga de nuevo.
  await page.click('#modal-docum-gestion button[onclick="guardarDocum()"]');
  await page.evaluate((id) => window.abrirGestionDocum(id), docId);
  await expect(page.locator('#dc-uni-chomba')).toHaveValue('L');
  await expect(page.locator('#dc-uni-grafa')).toHaveValue('44');

  // 4) Aprobar -> crea cat_alt_pendientes con el snapshot de uniforme.
  // aprobarDocum() es async (espera listarAdjuntos) y recién al final
  // cierra el modal — se usa eso como punto de sincronización en vez de
  // leer DB apenas resuelve el click (que solo dispara el evento, no
  // espera el handler async completo).
  await page.click('#modal-docum-gestion button[onclick="aprobarDocum()"]');
  await expect(page.locator('#modal-docum-gestion')).not.toBeVisible();
  const alta = await page.evaluate(async (dni) => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.catAltPendientes || []).find(a => a.dni === dni);
  }, DNI);
  expect(alta, 'no se creó el registro de alta pendiente').toBeTruthy();
  expect(alta.uniforme).toMatchObject({ ambo: 'M', calzado: '42', chomba: 'L', grafa: '44', buzo: 'M', campera: 'L', gorra: 'Único' });

  // 5) Abrir esa alta pendiente en Altas -> el tab Uniforme debe venir
  // precargado con lo cargado en Documentación (antes no se precargaba
  // NADA de ningún tab al reabrir).
  await page.evaluate((altaId) => window.abrirModalAlta(-1, altaId), alta.id);
  await expect(page.locator('#modal-alta-nuevo')).toBeVisible();
  await page.evaluate(() => window.tabAlta(3)); // tab Uniforme
  await expect(page.locator('#alt-ambo')).toHaveValue('M');
  await expect(page.locator('#alt-calzado')).toHaveValue('42');
  await expect(page.locator('#alt-talle-chomba')).toHaveValue('L');
  await expect(page.locator('#alt-talle-grafa')).toHaveValue('44');
  await expect(page.locator('#alt-talle-buzo')).toHaveValue('M');
  await expect(page.locator('#alt-talle-campera')).toHaveValue('L');
  await expect(page.locator('#alt-talle-gorra')).toHaveValue('Único');

  // 6) De paso, mientras la alta está abierta: cascada Partido -> Localidad
  // (ticket "Corrección") en la misma solapa Domicilio.
  await page.evaluate(() => window.tabAlta(1)); // tab Domicilio
  await page.selectOption('#alt-zona', 'Buenos Aires');
  await page.selectOption('#alt-partido', 'Quilmes');
  const localidadesQuilmes = await page.locator('#alt-localidad option').allTextContents();
  expect(localidadesQuilmes).toContain('Bernal');
  expect(localidadesQuilmes).not.toContain('Adrogué'); // localidad de otro partido (Almirante Brown)

  // 7) Completar el resto de los campos obligatorios y confirmar el alta.
  await page.evaluate(() => window.tabAlta(0));
  await page.fill('#alt-nombre', 'Test E2E Uniforme');
  await page.fill('#alt-dni', '40555666');
  await page.fill('#alt-cuit', '20405556669');
  await page.fill('#alt-tel', '1100000000');
  await page.fill('#alt-fec-ingreso', '2026-08-10');
  await page.evaluate(() => window.tabAlta(1));
  await page.fill('#alt-direccion', 'Calle Falsa 123');
  await page.evaluate(() => window.tabAlta(2));
  await page.selectOption('#alt-funcion', { index: 1 });
  await page.selectOption('#alt-categoria', { index: 1 });
  await page.evaluate(() => window.tabAlta(4));
  await page.fill('#alt-integracion', '1000');
  await page.evaluate(() => window.tabAlta(5));
  await page.selectOption('#alt-seguro', 'Básico');

  const legajosPrevios = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.legajos || []).length;
  });

  await page.evaluate(() => window.confirmarAlta());

  // crearEntregaUniformeDesdeAlta() (el hook a Logística) es async y
  // confirmarAlta() lo llama sin esperarlo (fire-and-forget, indirección
  // ya establecida — ver el comentario "no se toca ese archivo" en
  // uniformes.js) — hay que darle tiempo a que termine su propio loop
  // (7 prendas, cada una con su propio await supaSync) antes de leer
  // DB.pedidoUniformePrendas, si no se lee a mitad de camino.
  await page.waitForTimeout(3000);

  const resultado = await page.evaluate(async (nPrevios) => {
    const { DB } = await import('/src/shared/state.js');
    const legajo = (DB.legajos || [])[nPrevios]; // el recién agregado
    const pedido = (DB.pedidosUniformes || []).find(p => p.legajoIdLocal === String(legajo?.nro));
    const prendas = (DB.pedidoUniformePrendas || []).filter(p => pedido && p.pedidoIdLocal === String(pedido.id).slice(-9));
    return {
      legajoCreado: !!legajo,
      tallesUniforme: legajo?.tallesUniforme,
      ambo: legajo?.ambo,
      calzado: legajo?.calzado,
      pedidoCreado: !!pedido,
      prendas: prendas.map(p => p.prenda + ':' + p.talle).sort(),
    };
  }, legajosPrevios);

  expect(resultado.legajoCreado, 'no se creó el legajo al confirmar el alta').toBeTruthy();
  expect(resultado.ambo).toBe('M');
  expect(resultado.calzado).toBe(42);
  expect(resultado.tallesUniforme).toMatchObject({ chomba: 'L', grafa: '44', buzo: 'M', campera: 'L', gorra: 'Único' });
  expect(resultado.pedidoCreado, 'no se disparó el pedido a Logística (pedidosUniformes)').toBeTruthy();
  expect(resultado.prendas).toEqual(['Ambo:M', 'Buzo:M', 'Campera:L', 'Chomba:L', 'Gorra:Único', 'Grafa:44', 'Zapatos:42']);
});

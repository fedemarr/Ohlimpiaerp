// v167 — tickets #193 y #194: "cuando agrego una palabra a cualquiera de
// las listas de Configuración y le doy refresh, desaparece".
//
// Estos tests no necesitan login real: loginComoAdmin inyecta el estado y
// el stub de Supabase se hace por el mismo módulo ES que usa legacy.js
// (mismo patrón que helpers.js — los módulos son singletons por URL en el
// navegador). Lo que se verifica acá es el contrato de la pantalla, que es
// donde estaba el bug visible:
//
//   1. Eliminar un valor que lleva comilla/ampersand borra el correcto. El
//      onclick se armaba interpolando el índice del array dentro de un
//      string HTML; hoy es un listener delegado con el valor en el DOM.
//   2. Si la escritura a Supabase falla, se avisa — antes salía el mismo
//      toast de "✓ agregado" que cuando sí se guardaba, y por eso el
//      problema se reportaba como "desaparece al refrescar" en vez de
//      "no se está guardando".
//   3. Un valor duplicado no se agrega dos veces.

import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Doble comilla, comilla simple y ampersand: los tres casos que rompen un
// atributo HTML interpolado. (Sin tags HTML a propósito — el render de la
// lista no escapa el texto visible, y eso es un tema aparte.)
const VALOR_ODIOSO = 'Zona "El\'Nido" & Cía';

const toast = (page) => page.locator('#toast');

async function interceptarEscrituras(page, { fallar = false } = {}) {
  await page.evaluate(async ({ fallar }) => {
    const { SUPA } = await import('/src/shared/supabase.js');
    window.__escrituras = [];
    SUPA.from = (tabla) => ({
      insert: (payload) => {
        window.__escrituras.push({ tabla, op: 'insert', payload });
        if (fallar) return { select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) };
        return { select: () => ({ single: async () => ({ data: { ...payload, id: 1 }, error: null }) }) };
      },
      update: (payload) => ({
        eq: async (_col, _val) => {
          window.__escrituras.push({ tabla, op: 'update', payload });
          return { error: fallar ? { message: 'boom' } : null };
        },
      }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
  }, { fallar });
}

// Reemplaza el contenido de una lista por filas ya sembradas, como si
// estuvieran persistidas. DB es el singleton real de la app.
async function sembrarLista(page, clave, valores) {
  await page.evaluate(async ({ clave, valores }) => {
    const { DB } = await import('/src/shared/state.js');
    DB[clave] = [...valores];
    DB.configListas = valores.map((v, i) => ({
      id_local: 'seed' + i, clave, valor: v, orden: i + 1, anulado: false, color: null,
    }));
  }, { clave, valores });
}

const itemsDe = (page, elId) => page.evaluate(
  (id) => Array.from(document.querySelectorAll(`#${id} .config-item span:first-child`)).map(e => e.textContent),
  elId,
);

// renderConfiguracion() deja activa la tab "personal" al final, así que
// para tocar una lista de otra tab hay que abrirla explícitamente (si no,
// Playwright no ve el input: está en un .tab-content sin .active).
const abrirTab = (page, tab) => page.evaluate((t) => {
  document.querySelectorAll('#screen-configuracion .tab-content').forEach(x => x.classList.remove('active'));
  document.getElementById('cfg-tab-' + t).classList.add('active');
}, tab);

// Escribe el valor y dispara el botón "Agregar" del bloque. Se hace por
// evaluate y no con page.fill/page.click porque el input vive dentro de
// una tab-content que Playwright sigue viendo como no visible en este
// layout (el #screen se muestra con clases, no con display) — lo que
// importa es que corra el onclick real de index.html.
const agregarPorUI = async (page, valor) => {
  await page.evaluate((v) => {
    const input = document.getElementById('nuevo-tipo-cliente');
    input.value = v;
    input.closest('.config-add').querySelector('button').click();
  }, valor);
};

test.beforeEach(async ({ page }) => {
  await loginComoAdmin(page);
  await page.waitForFunction(() => typeof window.renderConfiguracion === 'function', { timeout: 20000 });
  await page.evaluate(() => window.navTo('configuracion'));
});

test('Configuración: eliminar un valor con comillas borra el correcto, no otro', async ({ page }) => {
  await interceptarEscrituras(page);
  await sembrarLista(page, 'zonas', ['CABA', VALOR_ODIOSO, 'Zona Sur']);
  await page.evaluate(() => window.renderConfiguracion());
  await abrirTab(page, 'geografia');

  // El texto con comillas tiene que aparecer literal en la fila.
  await expect(page.locator('#lista-zonas .config-item', { hasText: 'El\'Nido' })).toHaveCount(1);

  await page.locator('#lista-zonas .config-item', { hasText: 'El\'Nido' }).locator('button').click();

  const textos = await itemsDe(page, 'lista-zonas');
  expect(textos).toEqual(['CABA', 'Zona Sur']);

  const escritura = await page.evaluate(() => window.__escrituras);
  expect(escritura).toHaveLength(1);
  expect(escritura[0].tabla).toBe('config_listas');
  expect(escritura[0].op).toBe('update');
  expect(escritura[0].payload).toEqual({ anulado: true });
});

test('Configuración: si Supabase falla, se avisa y NO se agrega el valor', async ({ page }) => {
  await interceptarEscrituras(page, { fallar: true });
  await sembrarLista(page, 'tiposCliente', ['Hospital', 'Corporativo']);
  await page.evaluate(() => window.renderConfiguracion());
  await abrirTab(page, 'ventas-cfg');

  await agregarPorUI(page, 'Coworking');

  // El toast de éxito NO puede aparecer: ese era el motivo por el que el
  // bug se reportaba como "desaparece al refrescar" y no como "no guarda".
  await expect(toast(page)).toContainText('No se pudo guardar');
  await expect(toast(page)).not.toContainText('agregado');
  expect(await itemsDe(page, 'lista-tipos-cliente')).toEqual(['Hospital', 'Corporativo']);
});

test('Configuración: el valor sí se agrega cuando Supabase acepta', async ({ page }) => {
  await interceptarEscrituras(page);
  await sembrarLista(page, 'tiposCliente', ['Hospital', 'Corporativo']);
  await page.evaluate(() => window.renderConfiguracion());
  await abrirTab(page, 'ventas-cfg');

  await agregarPorUI(page, 'Coworking');

  await expect(toast(page)).toContainText('Coworking');
  expect(await itemsDe(page, 'lista-tipos-cliente')).toEqual(['Hospital', 'Corporativo', 'Coworking']);

  const escritura = await page.evaluate(() => window.__escrituras);
  expect(escritura).toHaveLength(1);
  expect(escritura[0].op).toBe('insert');
  expect(escritura[0].tabla).toBe('config_listas');
  expect(escritura[0].payload.clave).toBe('tiposCliente');
  expect(escritura[0].payload.valor).toBe('Coworking');
});

test('Configuración: un duplicado no se agrega dos veces', async ({ page }) => {
  await interceptarEscrituras(page);
  await sembrarLista(page, 'tiposCliente', ['Hospital', 'Corporativo']);
  await page.evaluate(() => window.renderConfiguracion());
  await abrirTab(page, 'ventas-cfg');

  await agregarPorUI(page, 'Hospital');

  await expect(toast(page)).toContainText('Ya existe');
  expect(await itemsDe(page, 'lista-tipos-cliente')).toEqual(['Hospital', 'Corporativo']);
  expect(await page.evaluate(() => window.__escrituras)).toHaveLength(0);
});

// El caso que faltaba: un valor con "<" en una lista de Comercial. El <span>
// visible no escapa (tema aparte), pero el botón tiene que llevar el valor
// crudo en un atributo escapado — antes se leía el textContent del span, que
// con tags devuelve otra cosa ("Coworking premium" en vez de
// "Coworking <b>premium</b>") y el borrado no encontraba la fila.
test('Configuración: valor con "<" se borra con el valor exacto, no con el texto parseado', async ({ page }) => {
  await interceptarEscrituras(page);
  const valor = 'Coworking <b>premium</b>';
  await sembrarLista(page, 'tiposCliente', ['Hospital', valor, 'Corporativo']);
  await page.evaluate(() => window.renderConfiguracion());
  await abrirTab(page, 'ventas-cfg');

  await expect(page.locator('#lista-tipos-cliente .config-item')).toHaveCount(3);

  await page.locator('#lista-tipos-cliente .config-item', { hasText: 'Coworking' }).locator('button').click();

  expect(await itemsDe(page, 'lista-tipos-cliente')).toEqual(['Hospital', 'Corporativo']);
  // Y que el update haya sido sobre la fila correcta (id_local 'seed1' =
  // el segundo valor sembrado), no sobre otra.
  const escritura = await page.evaluate(() => window.__escrituras);
  expect(escritura).toHaveLength(1);
  expect(escritura[0].payload).toEqual({ anulado: true });
});

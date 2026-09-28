import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket #178 (Jimena): "si pueden hacer que cuando se salga, lo que estamos
// redactando se mantenga por favor".
//
// El modal de Reportes y Sugerencias se crea dinámicamente la primera vez, así
// que el test lo abre con window.abrirModalSugerencia(). El borrador vive en
// localStorage bajo 'ohlimpia:draft:sugerencias:nueva' (helper compartido
// src/shared/autosave.js, mismo patrón que el formulario de Candidatos).
//
// Lo que se verifica acá es el circuito completo: escribir → salir → reabrir →
// el banner aparece → "Restaurar" devuelve el texto. El guardado real en la
// tabla `sugerencias` no se ejercita (requiere Supabase); lo que importa para
// el ticket es que NO se pierda lo redactado.

const CLAVE = 'ohlimpia:draft:sugerencias:nueva';

async function abrirModal(page) {
  await page.evaluate(() => window.abrirModalSugerencia());
  await expect(page.locator('#modal-sugerencia')).toBeVisible();
}

// El helper guarda con debounce de 500ms en eventos `input`; hay que dejar
// pasar el debounce antes de simular que el usuario "se va".
async function escribirYEsperar(page, titulo, desc) {
  await page.fill('#sugerencia-titulo', titulo);
  await page.fill('#sugerencia-desc', desc);
  await page.waitForTimeout(700);
}

test.beforeEach(async ({ page }) => {
  await loginComoAdmin(page);
  // localStorage es persistente entre tests del mismo contexto: Empezar
  // limpio, si no el banner del test anterior contamination a este.
  await page.evaluate((clave) => localStorage.removeItem(clave), CLAVE);
});

test('Sin nada escrito, el modal abre limpio y SIN banner de borrador', async ({ page }) => {
  await abrirModal(page);
  await expect(page.locator('#sugerencia-titulo')).toHaveValue('');
  await expect(page.locator('#sugerencia-desc')).toHaveValue('');
  await expect(page.locator('#sug-draft-banner')).toBeHidden();
});

test('Escribir, salir y reabrir: el banner ofrece devolver lo redactado', async ({ page }) => {
  await abrirModal(page);
  await escribirYEsperar(page, 'No se puede editar un cliente', 'Error al guardar los datos de contacto.');

  // "Se sale" del modal sin enviar.
  await page.evaluate(() => window.cerrarModal('modal-sugerencia'));
  await expect(page.locator('#modal-sugerencia')).toBeHidden();

  // Al reabrir arranca limpio, pero avisa que hay algo sin enviar.
  await abrirModal(page);
  await expect(page.locator('#sug-draft-banner')).toBeVisible();
  await expect(page.locator('#sug-draft-banner')).toContainText('Hay un reporte sin enviar');
  await expect(page.locator('#sugerencia-titulo')).toHaveValue('');
});

test('"Restaurar" devuelve el título, la descripción, el tipo y el módulo', async ({ page }) => {
  await abrirModal(page);
  await page.selectOption('#sugerencia-tipo', 'mejora');
  await page.selectOption('#sugerencia-modulo', 'clientes');
  await escribirYEsperar(page, 'Falta el botón de guardar', 'Está en el modal de edición de cliente.');

  await page.evaluate(() => window.cerrarModal('modal-sugerencia'));
  await abrirModal(page);
  await page.click('#sug-draft-restaurar');

  await expect(page.locator('#sugerencia-titulo')).toHaveValue('Falta el botón de guardar');
  await expect(page.locator('#sugerencia-desc')).toHaveValue('Está en el modal de edición de cliente.');
  await expect(page.locator('#sugerencia-tipo')).toHaveValue('mejora');
  await expect(page.locator('#sugerencia-modulo')).toHaveValue('clientes');
  await expect(page.locator('#sug-draft-banner')).toBeHidden();
});

test('"Descartar" borra el borrador y el modal vuelve a abrirse limpio', async ({ page }) => {
  await abrirModal(page);
  await escribirYEsperar(page, 'Titulo a descartar', 'Descripcion a descartar.');

  await page.evaluate(() => window.cerrarModal('modal-sugerencia'));
  await abrirModal(page);
  await expect(page.locator('#sug-draft-banner')).toBeVisible();

  await page.click('#sug-draft-descartar');
  await expect(page.locator('#sug-draft-banner')).toBeHidden();
  expect(await page.evaluate((clave) => localStorage.getItem(clave), CLAVE)).toBeNull();

  await page.evaluate(() => window.cerrarModal('modal-sugerencia'));
  await abrirModal(page);
  await expect(page.locator('#sug-draft-banner')).toBeHidden();
  await expect(page.locator('#sugerencia-titulo')).toHaveValue('');
});

test('Solo con espacios en blanco no se ofrece restaurar (no es una carga perdida)', async ({ page }) => {
  await abrirModal(page);
  await page.fill('#sugerencia-titulo', '   ');
  await page.fill('#sugerencia-desc', '\n  ');
  await page.waitForTimeout(700);

  await page.evaluate(() => window.cerrarModal('modal-sugerencia'));
  await abrirModal(page);
  await expect(page.locator('#sug-draft-banner')).toBeHidden();
  expect(await page.evaluate((clave) => localStorage.getItem(clave), CLAVE)).toBeNull();
});

test('El texto sobrevive a una recarga completa de la página', async ({ page }) => {
  await abrirModal(page);
  await escribirYEsperar(page, 'Persiste tras recargar', 'Esto se estaba redactando.');

  await page.reload();
  await page.waitForFunction(() => typeof window.abrirModalSugerencia === 'function', { timeout: 20000 });
  await abrirModal(page);

  await expect(page.locator('#sug-draft-banner')).toBeVisible();
  await page.click('#sug-draft-restaurar');
  await expect(page.locator('#sugerencia-titulo')).toHaveValue('Persiste tras recargar');
  await expect(page.locator('#sugerencia-desc')).toHaveValue('Esto se estaba redactando.');
});

import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket "agregar el dato de LOCALIDAD de cada candidato y permitir filtrar
// el listado por localidad" (Jimena): solo se podía filtrar por zona, que
// son 4 valores (CABA / Norte / Sur / Oeste) y no sirve para saber de qué
// lado viene la gente.
//
// La columna `localidad` YA existía en la tabla `candidatos` y se cargaba
// en el alta y en el importador histórico — verificado contra la base real
// (135 candidatos: 128 con localidad, 7 sin cargar; top Retiro 14, Campana
// 10, Barracas 8, José C. Paz 7). Lo que faltaba era mostrarla en el
// listado y poder filtrar. Por eso este ticket NO lleva migración: no hay
// que crear ninguna columna.
async function sembrarCandidatos(page) {
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push(
      { id: 991001001, apellido: 'RetiroUno', nombre: 'Test', dni: '41991001', estado: 'Entrevistado', zona: 'CABA', partido: '', localidad: 'Retiro' },
      { id: 991001002, apellido: 'CampanaUno', nombre: 'Test', dni: '41991002', estado: 'Entrevistado', zona: 'Zona Norte', partido: 'Campana', localidad: 'Campana' },
      { id: 991001003, apellido: 'PazUno', nombre: 'Test', dni: '41991003', estado: 'Entrevistado', zona: 'Zona Oeste', partido: 'General Rodríguez', localidad: 'José C. Paz' },
      { id: 991001004, apellido: 'SinLocalidad', nombre: 'Test', dni: '41991004', estado: 'Entrevistado', zona: 'Zona Sur', partido: 'La Matanza', localidad: '' },
    );
    window.navTo('candidatos');
  });
  await page.waitForTimeout(200);
}

test('La localidad se muestra en el listado, con el partido entre paréntesis', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  // Sin partido: solo la localidad.
  await expect(page.locator('#tbody-candidatos tr', { hasText: 'RetiroUno' })).toContainText('Retiro');
  // Con partido: "localidad (partido)" — en el conurbano la localidad sola
  // no ubica, por eso elpartydo acompaña.
  await expect(page.locator('#tbody-candidatos tr', { hasText: 'CampanaUno' })).toContainText('Campana (Campana)');
  await expect(page.locator('#tbody-candidatos tr', { hasText: 'PazUno' })).toContainText('José C. Paz (General Rodríguez)');
  // Sin localidad cargada: guion, no texto vacío.
  await expect(page.locator('#tbody-candidatos tr', { hasText: 'SinLocalidad' })).toContainText('—');
});

test('El filtro de localidad trae las localidades que existen en los candidatos', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  const sel = page.locator('#cand-filtro-localidad');
  // Dinámico desde los propios candidatos, no desde el catálogo de
  // Configuración: "Campana" y "Retiro" vienen de los candidatos.
  await expect(sel.locator('option', { hasText: 'Retiro' })).toHaveCount(1);
  await expect(sel.locator('option', { hasText: 'Campana' })).toHaveCount(1);
  await expect(sel.locator('option', { hasText: 'José C. Paz' })).toHaveCount(1);
  await expect(sel.locator('option[value=""]')).toHaveText('Todas las localidades');
});

test('Filtrar por localidad deja solo los de esa localidad', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await page.selectOption('#cand-filtro-localidad', 'Retiro');
  const tb = page.locator('#tbody-candidatos');
  await expect(tb).toContainText('RetiroUno');
  await expect(tb).not.toContainText('CampanaUno');
  await expect(tb).not.toContainText('PazUno');
  await expect(tb).not.toContainText('SinLocalidad');
});

test('El filtro de localidad convive con el de zona (AND, no lo reemplaza)', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);
  const tb = page.locator('#tbody-candidatos');

  // Localidad "Campana" sola: 1 persona, y es Zona Norte.
  await page.selectOption('#cand-filtro-localidad', 'Campana');
  await expect(tb).toContainText('CampanaUno');

  // Sumo zona: coincide → sigue viendo la misma.
  await page.selectOption('#cand-filtro-zona', 'Zona Norte');
  await expect(tb).toContainText('CampanaUno');

  // Cambio la zona a una que no corresponde a esa localidad: AND, vacío.
  await page.selectOption('#cand-filtro-zona', 'CABA');
  await expect(tb).not.toContainText('CampanaUno');

  // Quito la localidad, dejo la zona: vuelve a ver los de CABA.
  await page.selectOption('#cand-filtro-localidad', '');
  await expect(tb).toContainText('RetiroUno');
  await expect(tb).not.toContainText('CampanaUno');
});

test('"⚠ Sin localidad cargada" encuentra a los que hay que completar', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);
  const tb = page.locator('#tbody-candidatos');

  // Hay 7 de 135 sin localidad en la base real; sin esta opción no había
  // forma de encontrarlos desde la UI.
  const op = page.locator('#cand-filtro-localidad option', { hasText: 'Sin localidad cargada' });
  await expect(op).toHaveCount(1);
  await expect(op).toContainText('(');

  await page.selectOption('#cand-filtro-localidad', { label: await op.evaluate(el => el.textContent) });
  await expect(tb).toContainText('SinLocalidad');
  await expect(tb).not.toContainText('RetiroUno');
});

test('La selección de localidad sobrevive al repoblar y cae si la localidad ya no existe', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);
  const sel = page.locator('#cand-filtro-localidad');

  await page.selectOption('#cand-filtro-localidad', 'Retiro');
  // El select se repuebla en cada render (las localidades cambian según el
  // tab), pero no tiene que perder el filtro puesto.
  await page.evaluate(() => window.renderCandidatos());
  await expect(sel).toHaveValue('Retiro');
  await expect(page.locator('#tbody-candidatos')).toContainText('RetiroUno');

  // Si la localidad elegida desaparece del juego de valores, tiene que
  // volver a "todas" — no dejar un value fantasma que muestre una tabla
  // vacía sin explicación.
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.candidatos = DB.candidatos.filter(c => c.localidad !== 'Retiro');
    window.renderCandidatos();
  });
  await expect(sel).toHaveValue('');
  await expect(page.locator('#tbody-candidatos')).toContainText('CampanaUno');
});

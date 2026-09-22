import { test, expect } from '@playwright/test';

// Ticket "Formulario de solicitud de empleo" (22/09): el campo Localidad
// mostraba en realidad los PARTIDOS de la provincia (LOCALIDADES_BA, pese
// al nombre) — "Merlo", "La Matanza", etc. son partidos, no localidades.
// Mismo patrón de cascada que ya usa el formulario interno de Candidatos
// (Zona → Partido → Localidad, candidatos.js): acá se agrega el campo
// Partido y Localidad pasa a mostrar localidades reales (PARTIDOS_LOCALIDADES).
async function mockPostular(page, resultado = { ok: true }) {
  let ultimoPayload = null;
  await page.route('**/api/postular', async (route) => {
    ultimoPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resultado) });
  });
  return () => ultimoPayload;
}

test('Provincia de Buenos Aires — Partido muestra partidos reales y Localidad muestra localidades (no partidos)', async ({ page }) => {
  await mockPostular(page);
  await page.goto('/postularme.html');

  await page.selectOption('#pm-zona', 'Buenos Aires');
  const opcionesPartido = await page.locator('#pm-partido option').allTextContents();
  expect(opcionesPartido).toContain('Merlo');
  expect(opcionesPartido).toContain('La Matanza');

  // Localidad NO debe ofrecer "Merlo" ni "La Matanza" como si fueran
  // localidades (son partidos) — debe ofrecer localidades reales de adentro.
  const opcionesLocalidad = await page.locator('#pm-localidad option').allTextContents();
  expect(opcionesLocalidad).toContain('San Justo'); // localidad real del partido La Matanza
  expect(opcionesLocalidad).toContain('Mariano Acosta'); // localidad real del partido Merlo
  expect(opcionesLocalidad).not.toContain('La Matanza'); // "La Matanza" es el PARTIDO, no una localidad
});

test('Elegir Partido angosta Localidad a las de ese partido', async ({ page }) => {
  await mockPostular(page);
  await page.goto('/postularme.html');
  await page.selectOption('#pm-zona', 'Buenos Aires');
  await page.selectOption('#pm-partido', 'Merlo');

  const opcionesLocalidad = await page.locator('#pm-localidad option').allTextContents();
  expect(opcionesLocalidad).toEqual(expect.arrayContaining(['Merlo', 'San Antonio de Padua', 'Libertad', 'Mariano Acosta', 'Pontevedra']));
  expect(opcionesLocalidad).not.toContain('San Justo'); // localidad de otro partido (La Matanza)
});

test('Elegir la Localidad directo autocompleta el Partido solo', async ({ page }) => {
  await mockPostular(page);
  await page.goto('/postularme.html');
  await page.selectOption('#pm-zona', 'Buenos Aires');
  await page.selectOption('#pm-localidad', 'Mariano Acosta'); // localidad de Merlo, sin elegir Partido antes

  await expect(page.locator('#pm-partido')).toHaveValue('Merlo');
});

test('CABA — Partido no aplica y Localidad sigue mostrando barrios', async ({ page }) => {
  await mockPostular(page);
  await page.goto('/postularme.html');
  await page.selectOption('#pm-zona', 'CABA');

  await expect(page.locator('#pm-partido')).toBeDisabled();
  await expect(page.locator('#pm-partido')).toHaveValue('');
  const opcionesLocalidad = await page.locator('#pm-localidad option').allTextContents();
  expect(opcionesLocalidad).toContain('Palermo');
});

test('Al enviar, se manda la localidad real y el partido correspondiente al servidor', async ({ page }) => {
  const getPayload = await mockPostular(page);
  await page.goto('/postularme.html');

  await page.fill('#pm-apellido', 'Martínez Guillen');
  await page.fill('#pm-nombre', 'Jimena');
  await page.fill('#pm-dni', '40123456');
  await page.fill('#pm-tel', '1123456789');
  await page.fill('#pm-calle', 'Falsa 123');
  await page.selectOption('#pm-zona', 'Buenos Aires');
  await page.selectOption('#pm-partido', 'Merlo');
  await page.selectOption('#pm-localidad', 'Mariano Acosta');

  await page.click('button[type="submit"]');
  await expect(page.locator('text=¡Postulación enviada!')).toBeVisible();

  const payload = getPayload();
  expect(payload.partido).toBe('Merlo');
  expect(payload.localidad).toBe('Mariano Acosta');
});

test('CABA: se manda partido vacío (no aplica) y el barrio como localidad', async ({ page }) => {
  const getPayload = await mockPostular(page);
  await page.goto('/postularme.html');

  await page.fill('#pm-apellido', 'Pérez');
  await page.fill('#pm-nombre', 'Ana');
  await page.fill('#pm-dni', '40123457');
  await page.fill('#pm-tel', '1123456780');
  await page.fill('#pm-calle', 'Falsa 456');
  await page.selectOption('#pm-zona', 'CABA');
  await page.selectOption('#pm-localidad', 'Palermo');

  await page.click('button[type="submit"]');
  await expect(page.locator('text=¡Postulación enviada!')).toBeVisible();

  const payload = getPayload();
  expect(payload.partido).toBe('');
  expect(payload.localidad).toBe('Palermo');
});

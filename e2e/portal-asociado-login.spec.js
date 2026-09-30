import { test, expect } from '@playwright/test';

// Ticket 30/09/2026 — Portal Asociado roto en producción (signInAnonymously
// deshabilitado). Fix: api/portal-asociado-login.js valida nro+apellido con
// service_role del lado del servidor y devuelve un token de un solo uso
// que el cliente canjea con verifyOtp() — nunca se expone la key de
// servicio. Estos tests mockean la API y verifyOtp (no hay forma de
// probar contra Supabase real sin la cuenta técnica ya creada), pero
// ejercitan el código real de loginAsociado() tal cual corre en producción.

async function mockLoginApiOk(page) {
  await page.route('**/api/portal-asociado-login', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ok: true, tokenHash: 'fake-token-hash', tipoOtp: 'magiclink',
      legajo: { nro: 2, nombre: 'Peretti Juan Carlos', funcion: 'Operario', servicio: 'SERV.X', supervisor: 'Sup X' },
    }),
  }));
}

async function mockLoginApiError(page, mensaje, status = 401) {
  await page.route('**/api/portal-asociado-login', (route) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify({ error: mensaje }),
  }));
}

test('login exitoso: canjea el token con verifyOtp (nunca signInAnonymously) y entra al portal', async ({ page }) => {
  await mockLoginApiOk(page);
  await page.route('**/rest/v1/**', (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    : route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));

  await page.goto('/');
  await page.waitForSelector('#asoc-nro-socio', { timeout: 20000 });

  // Stub de verifyOtp — sin esto pegaría contra Supabase real con un token
  // falso. Confirma que loginAsociado() llama a ESTE método y no a
  // signInAnonymously (si llamara a signInAnonymously, este stub nunca se
  // ejecutaría y el test de abajo fallaría al no ver el mensaje de éxito).
  await page.evaluate(async () => {
    const { SUPA } = await import('/src/shared/supabase.js');
    SUPA.auth.verifyOtp = async ({ token_hash, type }) => {
      window.__verifyOtpLlamadoCon = { token_hash, type };
      return { data: { session: { access_token: 'fake' } }, error: null };
    };
    SUPA.auth.signInAnonymously = async () => { throw new Error('NO debería llamarse signInAnonymously nunca más'); };
  });

  await page.fill('#asoc-nro-socio', '2');
  await page.fill('#asoc-apellido', 'Peretti');
  await page.evaluate(() => window.loginAsociado());
  await page.waitForTimeout(500);

  const llamado = await page.evaluate(() => window.__verifyOtpLlamadoCon);
  expect(llamado).toEqual({ token_hash: 'fake-token-hash', type: 'magiclink' });

  await expect(page.locator('#app')).not.toHaveClass(/hidden/);
  await expect(page.locator('#sidebar-nombre')).toContainText('Peretti Juan Carlos');
});

test('nro/apellido que no matchean: el mensaje de error es el que devuelve el servidor, no uno inventado', async ({ page }) => {
  await mockLoginApiError(page, 'No encontramos un asociado activo con ese número de socio y ese apellido.');
  await page.goto('/');
  await page.waitForSelector('#asoc-nro-socio', { timeout: 20000 });
  await page.fill('#asoc-nro-socio', '999999');
  await page.fill('#asoc-apellido', 'Inexistente');
  await page.evaluate(() => window.loginAsociado());
  await page.waitForTimeout(300);
  await expect(page.locator('#asoc-login-error')).toBeVisible();
  await expect(page.locator('#asoc-login-error')).toHaveText('No encontramos un asociado activo con ese número de socio y ese apellido.');
});

test('si el servidor falla por un problema propio, el mensaje dice eso — NUNCA "número de socio incorrecto"', async ({ page }) => {
  await mockLoginApiError(page, 'No pudimos iniciar tu sesión en este momento — probá de nuevo en un rato.', 500);
  await page.goto('/');
  await page.waitForSelector('#asoc-nro-socio', { timeout: 20000 });
  // Datos de un asociado REAL y correcto — el fallo es del servidor, no del dato tipeado.
  await page.fill('#asoc-nro-socio', '2');
  await page.fill('#asoc-apellido', 'Peretti');
  await page.evaluate(() => window.loginAsociado());
  await page.waitForTimeout(300);
  const texto = await page.locator('#asoc-login-error').textContent();
  expect(texto).not.toContain('incorrecto');
  expect(texto).toContain('probá de nuevo');
});

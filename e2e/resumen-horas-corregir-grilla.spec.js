import { test, expect } from '@playwright/test';

// Bug reportado: en Resumen de horas, "✏ corregir en la grilla" navega a
// Liquidación de horas pero abre un servicio distinto al que se tocó.
//
// Causa raíz real: el botón llamaba a `toggleGrilla(...)`, una función que
// NUNCA existió en el código (ni window.toggleGrilla ni ningún
// `function toggleGrilla`) — el onclick tenía la guarda
// `toggleGrilla&&toggleGrilla(...)`, así que no pasaba nada. navTo
// igual navegaba, dejando la pantalla de Liquidación en lo que haya
// quedado de antes (otro servicio, u otro mes) — no era un bug de índices
// ni de closures, era una llamada a una función fantasma.
//
// Este test siembra DOS servicios con grilla en el mismo mes, abre el
// modal de detalle de UNO de ellos manualmente primero (para simular
// "quedó otro servicio abierto de antes"), y confirma que tocar
// "corregir en la grilla" del OTRO servicio, desde Resumen de horas,
// abre exactamente ese otro — no el que había quedado.

async function loginComo(page, nombre, perfil) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async ({ nombre, perfil }) => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre, perfil });
  }, { nombre, perfil });
  await page.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

test('"corregir en la grilla" abre el MISMO servicio que se tocó en Resumen de horas, no otro', async ({ page }) => {
  await loginComo(page, 'RH CG ADMIN', 'Administrador total');
  const mes = new Date().toISOString().slice(0, 7);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    DB.legajos = DB.legajos || [];
    DB.legajos.push(
      { nro: 992101, nombre: 'CG TEST UNO', dni: '30992101', estado: 'Activo', servicio: 'OBJ-CG-A', supervisor: 'Sup CG', funcion: 'Operario A', cuit: '20992101007' },
      { nro: 992102, nombre: 'CG TEST DOS', dni: '30992102', estado: 'Activo', servicio: 'OBJ-CG-B', supervisor: 'Sup CG', funcion: 'Operario A', cuit: '20992102007' },
    );
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(
      { codigo: 'OBJ-CG-A', nombre: 'Servicio Corregir Grilla A', supervisorAsignado: 'Sup CG', estado: 'Operativo', anulado: false },
      { codigo: 'OBJ-CG-B', nombre: 'Servicio Corregir Grilla B', supervisorAsignado: 'Sup CG', estado: 'Operativo', anulado: false },
    );
    const dia = mes + '-05';
    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push(
      { id: 'GRL-CG-A', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-CG-A', nombre: 'Servicio Corregir Grilla A', supervisor: 'Sup CG', origenGrilla: 'manual', asociados: [{ nro: 992101, nombre: 'CG TEST UNO', tipoHora: 'facturable', horas: { [dia]: 8 } }] },
      { id: 'GRL-CG-B', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-CG-B', nombre: 'Servicio Corregir Grilla B', supervisor: 'Sup CG', origenGrilla: 'manual', asociados: [{ nro: 992102, nombre: 'CG TEST DOS', tipoHora: 'facturable', horas: { [dia]: 8 } }] },
    );
  }, mes);

  // Simula "quedó otro servicio abierto de antes": abro el detalle de A
  // manualmente desde Liquidación, como si alguien lo hubiera mirado antes.
  await page.evaluate(() => { window.navTo('liquidacion'); window.abrirDetalleServicioGrilla('OBJ-CG-A'); window.cerrarDetalleServicioGrilla(); });

  // Ahora voy a Resumen de horas y toco "corregir en la grilla" del
  // servicio B — el que en teoría NO estaba abierto antes.
  await page.evaluate(() => window.navTo('resumen_horas'));
  await page.waitForTimeout(200);
  await page.click('text=CG TEST DOS'); // expande la fila del asociado del servicio B
  await page.waitForTimeout(200);
  await page.click('text=✏ corregir en la grilla');
  await page.waitForTimeout(200);

  // Tiene que haber navegado a Liquidación...
  await expect(page.locator('#screen-liquidacion')).toBeVisible();
  // ...con el modal de detalle abierto...
  await expect(page.locator('#modal-grilla-servicio')).toHaveClass(/open/);
  // ...mostrando el servicio B, no el A que había quedado abierto antes.
  await expect(page.locator('#mgs-nombre')).toContainText('Servicio Corregir Grilla B');
  await expect(page.locator('#mgs-nombre')).not.toContainText('Servicio Corregir Grilla A');

  // Y el mes de Liquidación quedó sincronizado con el que se estaba
  // mirando en Resumen de horas (no cayó al mes actual por default).
  const mesLiq = await page.locator('#liq-mes-sel').inputValue();
  expect(mesLiq).toBe(mes);
});

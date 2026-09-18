import { test, expect } from '@playwright/test';

async function loginComoAdmin(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  await page.evaluate(async () => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Test E2E', perfil: 'Administrador total' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

// GRILLAS_ajustes_v2_para_Fede.md (18/09) — los 6 puntos:
//   §1: la vista principal queda SIEMPRE plegada (solo lectura/control) y
//     el click en el servicio abre su propia pantalla (modal) con la
//     carga completa — ya no hay filas de detalle en el acordeón.
//   §2/§3/§4: la celda con observación se pinta amarilla ENTERA con texto
//     oscuro SIEMPRE (aunque esté verificada) y desaparece al borrar la obs.
//   §5: "Verificar hasta…" pide la fecha (HOY precargado, nunca a futuro),
//     no verifica días posteriores a la elegida.
//   §6: verificar/desverificar una celda individual con un click — ya
//     resuelto antes con el ícono ✓/○ de la esquina (no se tocó).
test('Grillas — pantalla propia por servicio + observación amarilla manda + Verificar hasta con fecha elegible', async ({ page }) => {
  await loginComoAdmin(page);
  const mes = new Date().toISOString().slice(0, 7);

  const { d5, d10, d15 } = await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    // 3 días HÁBILES (lun-vie) del mes, calculados en vivo — evita que un
    // día fijo (ej. "5") caiga sábado/domingo en otro mes y arrastre el
    // fondo amarillo del finde en vez del que se está probando acá.
    const [yy, mm] = mes.split('-').map(Number);
    const habiles = [];
    for (let dia = 1; dia <= 27 && habiles.length < 3; dia++) {
      const dow = new Date(yy, mm - 1, dia).getDay();
      if (dow >= 1 && dow <= 5) habiles.push(mes + '-' + String(dia).padStart(2, '0'));
    }
    const [d5, d10, d15] = habiles;

    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-GRL-E2E', nombre: 'Servicio Grillas E2E', supervisorAsignado: 'SUP GRL E2E', estado: 'Operativo', anulado: false });

    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-AJV2-E2E', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-GRL-E2E', nombre: 'Servicio Grillas E2E', supervisor: 'SUP GRL E2E',
      asociados: [{
        nro: 990201, nombre: 'GRL TEST UNO', tipoHora: 'facturable',
        horas: { [d5]: 8, [d10]: 8, [d15]: 8 },
        estadoDia: { [d5]: 'ver', [d10]: 'ver' }, // ya verificados, el 3ro pendiente
        observaciones: { [d5]: 'Llegó 2 hs tarde — avisó' }, // verificado CON observación
      }],
    });

    window.navTo('liquidacion');
    return { d5, d10, d15 };
  }, mes);

  await page.waitForTimeout(200);

  // --- §1: la vista principal NO tiene filas de asociado (siempre
  // plegada) — el click abre la pantalla propia del servicio (modal) ---
  await expect(page.locator('#tbody-servicios-compacta .liq-row-asociado')).toHaveCount(0);
  await page.evaluate(() => window.abrirDetalleServicioGrilla('OBJ-GRL-E2E'));
  await page.waitForTimeout(200);
  await expect(page.locator('#modal-grilla-servicio')).toBeVisible();
  await expect(page.locator('#mgs-nombre')).toContainText('Servicio Grillas E2E');
  await expect(page.locator('#tbody-grilla-servicio .liq-row-asociado')).toHaveCount(1);

  // --- §2/§4: la celda del día 5 (verificada + con observación) es
  // amarilla con texto oscuro, no blanca-sobre-blanco ---
  const celdaD5 = page.locator(`#tbody-grilla-servicio td[oncontextmenu*="'${d5}'"]`).first();
  await expect(celdaD5).toHaveAttribute('style', /#fff3b0/);
  const inputD5 = celdaD5.locator('input');
  await expect(inputD5).toHaveAttribute('style', /#1a1a2e/);
  // El input sigue mostrando el número (no desaparece sobre el amarillo).
  await expect(inputD5).toHaveValue('8');

  // --- §3: borrar la observación saca el amarillo al instante ---
  await page.evaluate(async (d5) => {
    const { DB } = await import('/src/shared/state.js');
    const g = DB.grillasLiq.find(x => x.id === 'GRL-AJV2-E2E');
    delete g.asociados[0].observaciones[d5];
    window.renderDetalleGrillaServicio('OBJ-GRL-E2E');
  }, d5);
  await page.waitForTimeout(150);
  const celdaD5SinObs = page.locator(`#tbody-grilla-servicio td[oncontextmenu*="'${d5}'"]`).first();
  await expect(celdaD5SinObs).not.toHaveAttribute('style', /#fff3b0/);
  // Sigue verificada (fondo azul oscuro), eso no lo tocó borrar la obs.
  await expect(celdaD5SinObs).toHaveAttribute('style', /#1b2a5e/);

  // --- §5: "Verificar hasta…" — HOY precargado, se puede retroceder ---
  let dialogMsg = '';
  page.once('dialog', async (dialog) => {
    dialogMsg = dialog.message();
    // Retrocedo la fecha al día 10 (no confirmo hasta hoy/día 15).
    const [, mm, dd] = d10.split('-');
    await dialog.accept(`${dd}/${mm}/${d10.split('-')[0]}`);
  });
  await page.evaluate(() => window.verificarServicioHastaHoy('GRL-AJV2-E2E'));
  await page.waitForTimeout(150);

  expect(dialogMsg).toContain('Verificar hasta');

  const estados = await page.evaluate(async ({ d10, d15 }) => {
    const { DB } = await import('/src/shared/state.js');
    const asoc = DB.grillasLiq.find(x => x.id === 'GRL-AJV2-E2E').asociados[0];
    return { d10: asoc.estadoDia[d10], d15: asoc.estadoDia[d15] };
  }, { d10, d15 });

  // El día 10 ya estaba verificado (no cambia), pero el día 15 —
  // pendiente, posterior a la fecha elegida — SIGUE sin verificar: el
  // "Verificar hasta" no debe verificar de más allá de lo que el
  // supervisor declaró.
  expect(estados.d10).toBe('ver');
  expect(estados.d15).toBeUndefined();

  // --- Rechaza una fecha futura ---
  page.once('dialog', async (dialog) => {
    const futuro = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const [yy, mm, dd] = futuro.split('-');
    await dialog.accept(`${dd}/${mm}/${yy}`);
  });
  await page.evaluate(() => window.verificarServicioHastaHoy('GRL-AJV2-E2E'));
  await page.waitForTimeout(150);
  const estadoD15Post = await page.evaluate(async (d15) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.grillasLiq.find(x => x.id === 'GRL-AJV2-E2E').asociados[0].estadoDia[d15];
  }, d15);
  expect(estadoD15Post).toBeUndefined(); // la fecha futura se rechazó, no verificó nada de más
});

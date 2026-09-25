import { test, expect } from '@playwright/test';

async function loginComoAdmin(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async () => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Test E2E', perfil: 'Administrador total' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

// GRILLAS_PROYECTADO_GESTION_HORAS_para_Fede.md: "el proyectado del
// servicio vive en Gestión de horas (regla × calendario) — la grilla lo
// CONSUME, no lo fabrica ni lo destruye."
//   Bug 1: la precarga de "Servicios del mes" dividía obj.efts entre los
//     días hábiles del mes en vez de leer la regla vigente día por día.
//   Bug 2: abrir/mirar una grilla la creaba vacía y pisaba el proyectado
//     a 0hs — "mirar no debe crear".
//   Mejora: chip "⏱ Pactado del mes" en el header del modal.

test('Bug 1 — "Servicios del mes" precarga la jornada REAL de Gestión de horas, no un total dividido', async ({ page }) => {
  await loginComoAdmin(page);
  const mes = new Date().toISOString().slice(0, 7);

  const esperado = await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const { horasPuestosMes } = await import('/src/modules/gestion_horas/calculo.js');
    const puestos = [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }];
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      codigo: 'OBJ-BUG1-E2E', nombre: 'Gimnasio Bug1 E2E', supervisorAsignado: 'SUP E2E', estado: 'Operativo', anulado: false,
      // A propósito un valor que NO puede coincidir con el cálculo real
      // (que ronda 160-176hs/mes según feriados): el bug viejo repartía
      // este número fijo entre los días hábiles y SIEMPRE reproducía el
      // mismo total, mes tras mes — si el fix funciona, la UI ignora este
      // dato y muestra el total real de la regla.
      efts: 999,
    });
    DB.horasVigencias = DB.horasVigencias || [];
    DB.horasVigencias.push({ id: Date.now(), objCodigo: 'OBJ-BUG1-E2E', puestos, vigenteDesde: '2026-01', vigenteHasta: null, usuario: 'Test', fecha: '01/01/2026', motivo: 'Carga inicial manual', origen: 'manual' });
    window.navTo('liquidacion');
    return horasPuestosMes(puestos, mes);
  }, mes);
  await page.waitForTimeout(200);

  const fila = page.locator('#tbody-servicios-compacta tr', { hasText: 'Gimnasio Bug1 E2E' });
  await expect(fila.locator('td:nth-last-child(5)')).toHaveText(`${Math.round(esperado)},00hs`);
  // El bug viejo mostraba SIEMPRE el efts fijo (999) sin importar el mes.
  await expect(fila.locator('td:nth-last-child(5)')).not.toContainText('999');
});

test('Bug 2 — abrir la grilla de un servicio sin operarios NO la crea, y "Servicios del mes" sigue con el proyectado', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const puestos = [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }];
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-BUG2-E2E', nombre: 'Servicio Bug2 E2E', supervisorAsignado: 'SUP E2E', estado: 'Operativo', anulado: false });
    DB.horasVigencias = DB.horasVigencias || [];
    DB.horasVigencias.push({ id: Date.now(), objCodigo: 'OBJ-BUG2-E2E', puestos, vigenteDesde: '2026-01', vigenteHasta: null, usuario: 'Test', fecha: '01/01/2026', motivo: 'Carga inicial manual', origen: 'manual' });
    // A propósito: SIN legajos asignados a este servicio (ningún operario).
    window.navTo('liquidacion');
  });
  await page.waitForTimeout(200);

  // Columna "Total hs" — quinta desde el final (Total hs, Valor hora,
  // Fact., A pagar $, Estado). Las de Fact./A pagar SÍ dan 0 legítimamente
  // (no hay nada facturado sin grilla) — lo que no puede dar 0 es el
  // proyectado del pactado.
  const filaAntes = page.locator('#tbody-servicios-compacta tr', { hasText: 'Servicio Bug2 E2E' });
  await expect(filaAntes.locator('td:nth-last-child(5)')).not.toHaveText('0hs');

  await page.evaluate(() => window.abrirDetalleServicioGrilla('OBJ-BUG2-E2E'));
  await page.waitForTimeout(200);
  await expect(page.locator('#modal-grilla-servicio')).toBeVisible();
  await expect(page.locator('#tbody-grilla-servicio')).toContainText('todavía no tiene operarios asignados');
  await expect(page.locator('#mgs-pactado')).toContainText('Pactado del mes');

  const grillaCreada = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return !!DB.grillasLiq.find(g => g.objCodigo === 'OBJ-BUG2-E2E');
  });
  expect(grillaCreada).toBe(false); // "mirar no debe crear"

  await page.evaluate(() => window.cerrarDetalleServicioGrilla());
  await page.waitForTimeout(150);

  // La fila del servicio SIGUE mostrando el proyectado del pactado — no 0hs.
  const filaDespues = page.locator('#tbody-servicios-compacta tr', { hasText: 'Servicio Bug2 E2E' });
  await expect(filaDespues.locator('td:nth-last-child(5)')).not.toHaveText('0hs');
});

test('Chip "Pactado del mes" — sin carga muestra el pactado solo; con carga compara pactado vs cargadas', async ({ page }) => {
  await loginComoAdmin(page);
  const mes = new Date().toISOString().slice(0, 7);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const puestos = [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }];
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-CHIP-E2E', nombre: 'Servicio Chip E2E', supervisorAsignado: 'SUP E2E', estado: 'Operativo', anulado: false });
    DB.horasVigencias = DB.horasVigencias || [];
    DB.horasVigencias.push({ id: Date.now(), objCodigo: 'OBJ-CHIP-E2E', puestos, vigenteDesde: '2026-01', vigenteHasta: null, usuario: 'Test', fecha: '01/01/2026', motivo: 'Carga inicial manual', origen: 'manual' });
    // Grilla YA existe, con un asociado y carga que NO coincide con el pactado.
    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-CHIP-E2E', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-CHIP-E2E', nombre: 'Servicio Chip E2E', supervisor: 'SUP E2E',
      asociados: [{ nro: 990301, nombre: 'CHIP TEST UNO', tipoHora: 'facturable', horas: { [mes + '-01']: 8 } }],
    });
    window.navTo('liquidacion');
  }, mes);
  await page.waitForTimeout(200);

  await page.evaluate(() => window.abrirDetalleServicioGrilla('OBJ-CHIP-E2E'));
  await page.waitForTimeout(200);
  await expect(page.locator('#mgs-pactado')).toContainText('Pactado');
  await expect(page.locator('#mgs-pactado')).toContainText('Cargadas');
});

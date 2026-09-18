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

test('Tareas Especiales — convenio 168hs (sin prorrateo, AI descuenta, AJ cuenta) + conexión a Liquidaciones y Resumen de horas', async ({ page }) => {
  await loginComoAdmin(page);
  const mes = new Date().toISOString().slice(0, 7);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');

    // Duarte: 5 días × 8hs = 40 reales + 2 AI → convenio 168−16=152,
    // complemento max(0,152−40)=112, cobra 152.
    // Benitez: 3 días × 8hs = 24 + 1 AJ de 10hs → reales 34 (incl. AJ),
    // sin AI → convenio 168, complemento 134, cobra 168.
    DB.legajos = DB.legajos || [];
    DB.legajos.push(
      { nro: 881101, nombre: 'TE TEST DUARTE', dni: '30881101', estado: 'Activo', servicio: 'OBJ-TE-1', supervisor: 'SUP TE', funcion: 'Tareas Especiales' },
      { nro: 881102, nombre: 'TE TEST BENITEZ', dni: '30881102', estado: 'Activo', servicio: 'OBJ-TE-1', supervisor: 'SUP TE', funcion: 'Tareas Especiales' },
    );
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-TE-1', nombre: 'Servicio Tareas Especiales E2E', supervisorAsignado: 'SUP TE', estado: 'Operativo', anulado: false });

    const d = n => mes + '-' + String(n).padStart(2, '0');
    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-TE-E2E', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-TE-1', nombre: 'Servicio Tareas Especiales E2E', supervisor: 'SUP TE',
      asociados: [
        { nro: 881101, nombre: 'TE TEST DUARTE', tipoHora: 'facturable', horas: { [d(1)]: 8, [d(2)]: 8, [d(3)]: 8, [d(4)]: 8, [d(5)]: 8, [d(8)]: 'AI', [d(9)]: 'AI' } },
        { nro: 881102, nombre: 'TE TEST BENITEZ', tipoHora: 'facturable', horas: { [d(1)]: 8, [d(2)]: 8, [d(3)]: 8, [d(10)]: 'AJ' }, horasAJ: { [d(10)]: 10 } },
      ],
    });

    // Categoría Tareas Especiales (CAT-008) + valor hora + padrón vigente
    // este mes para los dos.
    DB.categoriasBase = DB.categoriasBase || [];
    DB.categoriasBase.push({ id: 601, codigo: 'CAT-008', nombre: 'Tareas Especiales', anulado: false, activa: true });
    DB.padronCategoriasAsociado = DB.padronCategoriasAsociado || [];
    DB.padronCategoriasAsociado.push(
      { id: Date.now(), legajoNro: '881101', categoriaIdLocal: '601', vigenciaDesde: mes + '-01', vigenciaHasta: null, anulado: false },
      { id: Date.now() + 1, legajoNro: '881102', categoriaIdLocal: '601', vigenciaDesde: mes + '-01', vigenciaHasta: null, anulado: false },
    );
    DB.valoresHoraCategoria = DB.valoresHoraCategoria || [];
    DB.valoresHoraCategoria.push({ id: Date.now() + 2, categoriaIdLocal: '601', servicioNombre: null, valorHora: 1000, vigenciaDesde: mes + '-01', vigenciaHasta: null, anulado: false });

    // Convenio 168hs vigente (simula el seed de v144).
    DB.tareasEspecialesConvenioVersiones = DB.tareasEspecialesConvenioVersiones || [];
    DB.tareasEspecialesConvenioVersiones.push({ id: Date.now() + 3, horasConvenio: 168, vigenciaDesde: '2020-01-01', vigenciaHasta: null, anulado: false, cargadoPor: 'seed' });

    window.navTo('tareas_especiales');
  }, mes);

  await page.waitForTimeout(300);

  // --- Chip de período vigente ---
  await expect(page.locator('#te-chip-periodo')).toContainText('PERÍODO VIGENTE');

  // --- KPIs ---
  await expect(page.locator('#kpi-te-activos')).toHaveText('2');
  await expect(page.locator('#kpi-te-minimo')).toHaveText('2'); // los dos cobran mínimo (complemento > 0)

  // --- Fila Duarte: reales 40, convenio 152 (con chip AI), complemento +112, cobra 152 ---
  const filaDuarte = page.locator('.fila-te', { hasText: 'TE TEST DUARTE' });
  await expect(filaDuarte).toContainText('40');
  await expect(filaDuarte).toContainText('152');
  await expect(filaDuarte).toContainText('+112');
  await expect(filaDuarte).toContainText('−16 hs de convenio por 2 AI');

  // --- Fila Benitez: reales 34 (incl. AJ), convenio 168, complemento +134, cobra 168 ---
  const filaBenitez = page.locator('.fila-te', { hasText: 'TE TEST BENITEZ' });
  await expect(filaBenitez).toContainText('34');
  await expect(filaBenitez).toContainText('168');
  await expect(filaBenitez).toContainText('+134');
  await expect(filaBenitez).toContainText('incluye 10 hs AJ');

  // --- Tab Resumen de pago: totales de control ---
  await page.evaluate(() => window.tabTareasEspeciales('pago'));
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-te-pago')).toContainText('Complemento');
  await expect(page.locator('#tbody-te-pago')).toContainText('no facturable');

  // --- LA REGLA DE ORO: Liquidaciones recibe SOLO el complemento, no el total ---
  await page.evaluate(() => window.navTo('liquidacion'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabLqs && window.tabLqs('resumen'));
  await page.waitForTimeout(150);
  await page.evaluate((mes) => {
    const sel = document.getElementById('lqs-mes-sel');
    if (sel) sel.value = mes;
    window.renderLiquidaciones && window.renderLiquidaciones();
  }, mes);
  await page.waitForTimeout(200);

  // Duarte: bruto real esperado = (reales 40 + complemento 112) × $1000 = $152.000 — UNA sola fila
  const filasDuarteLiq = page.locator('#tbody-lqs tr', { hasText: 'TE TEST DUARTE' });
  await expect(filasDuarteLiq).toHaveCount(1);
  await expect(filasDuarteLiq).toContainText('152.000');

  const filasBenitezLiq = page.locator('#tbody-lqs tr', { hasText: 'TE TEST BENITEZ' });
  await expect(filasBenitezLiq).toHaveCount(1);
  await expect(filasBenitezLiq).toContainText('168.000');

  // --- Resumen de horas: el complemento NO suma en horas, SÍ en retiro ---
  await page.evaluate(() => window.navTo('resumen_horas'));
  await page.waitForTimeout(200);
  await page.evaluate((mes) => {
    const sel = document.getElementById('rh-mes');
    if (sel) sel.value = mes;
    window.filtrarResumenHoras && window.filtrarResumenHoras();
  }, mes);
  await page.waitForTimeout(200);

  const celdasDuarteRH = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#tbody-resumen-horas tr')].find(tr => tr.textContent.includes('TE TEST DUARTE'));
    if (!row) return null;
    const tds = [...row.children].map(td => td.textContent.trim());
    return tds; // [▸/▾, "nro · nombre", categoria, servicios, hsFact, hsNoFact, totalHs, retiro]
  });
  expect(celdasDuarteRH).not.toBeNull();
  // Total hs (col. índice 6) sigue siendo 40 (lo trabajado) — el
  // complemento NUNCA es una hora trabajada, no debe sumarse acá.
  expect(celdasDuarteRH[6]).toContain('40');
  expect(celdasDuarteRH[6]).not.toContain('152');
  // El retiro (col. índice 7) SÍ incluye el complemento, con su chip.
  expect(celdasDuarteRH[7]).toContain('152.000');
  expect(celdasDuarteRH[7]).toContain('incluye complemento 112 hs');
});

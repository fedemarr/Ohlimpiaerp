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

// PERIODO_FUTURO_bug_para_Fede.md: el chip de período tiene 3 estados
// (vigente / anterior / futuro), en período futuro el convenio no se calcula
// ("—"), y un complemento con horas pero sin valor hora avisa en vez de "$0".
test('Período futuro — chip de 3 estados, convenio en "—" y alerta de valor hora faltante', async ({ page }) => {
  await loginComoAdmin(page);
  const meses = await page.evaluate(() => {
    const f = (k) => { const h = new Date(); const d = new Date(h.getFullYear(), h.getMonth() + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    return { ant: f(-1), act: f(0), fut: f(1) };
  });

  await page.evaluate(async (m) => {
    const { DB } = await import('/src/shared/state.js');
    DB.legajos.push({ nro: 993701, nombre: 'FUT TEST UNO', dni: '30993701', estado: 'Activo', servicio: 'OBJ-FUT', supervisor: 'SUP', funcion: 'Tareas Especiales' });
    DB.categoriasBase = DB.categoriasBase || [];
    DB.categoriasBase.push({ id: 701, codigo: 'CAT-008', nombre: 'Tareas Especiales', anulado: false, activa: true });
    DB.padronCategoriasAsociado = DB.padronCategoriasAsociado || [];
    DB.padronCategoriasAsociado.push({ id: Date.now(), legajoNro: '993701', categoriaIdLocal: '701', vigenciaDesde: m.ant + '-01', vigenciaHasta: null, anulado: false });
    DB.tareasEspecialesConvenioVersiones = [{ id: Date.now() + 1, horasConvenio: 168, vigenciaDesde: '2020-01-01', vigenciaHasta: null, anulado: false, cargadoPor: 'seed' }];
    window.navTo('tareas_especiales');
  }, meses);
  await page.waitForTimeout(250);

  const elegirMes = async (mes) => {
    await page.evaluate((mes) => {
      const sel = document.getElementById('te-mes-sel');
      if (![...sel.options].some(o => o.value === mes)) { const o = document.createElement('option'); o.value = mes; o.textContent = mes; sel.appendChild(o); }
      sel.value = mes; window.renderTareasEspeciales();
    }, mes);
    await page.waitForTimeout(150);
  };

  // --- Mes actual: vigente; complemento con horas pero SIN valor hora → alerta, no $0 ---
  await expect(page.locator('#te-chip-periodo')).toContainText('PERÍODO VIGENTE');
  await expect(page.locator('#kpi-te-comp')).toContainText('sin valor hora');
  await expect(page.locator('#kpi-te-comp-sub')).toContainText('sin valor hora');
  await expect(page.locator('.fila-te', { hasText: 'FUT TEST UNO' })).toContainText('sin valor hora');

  // Con el valor hora cargado, el $ sale de hs × valor (168 × 1000).
  await page.evaluate(async (m) => {
    const { DB } = await import('/src/shared/state.js');
    DB.valoresHoraCategoria = DB.valoresHoraCategoria || [];
    DB.valoresHoraCategoria.push({ id: Date.now() + 2, categoriaIdLocal: '701', servicioNombre: null, valorHora: 1000, vigenciaDesde: m.ant + '-01', vigenciaHasta: null, anulado: false });
    window.renderTareasEspeciales();
  }, meses);
  await expect(page.locator('#kpi-te-comp')).toContainText('168.000');
  await expect(page.locator('#kpi-te-minimo')).toHaveText('1');

  // --- Mes anterior: 🔒 ---
  await elegirMes(meses.ant);
  await expect(page.locator('#te-chip-periodo')).toContainText('PERÍODO ANTERIOR');

  // --- Mes futuro: 📅, sin convenio, KPIs en "—" ---
  await elegirMes(meses.fut);
  await expect(page.locator('#te-chip-periodo')).toContainText('PERÍODO FUTURO');
  await expect(page.locator('#te-chip-periodo')).not.toContainText('VIGENTE');
  await expect(page.locator('#kpi-te-minimo')).toHaveText('—');
  await expect(page.locator('#kpi-te-comp')).toHaveText('—');
  await expect(page.locator('#kpi-te-comp-sub')).toContainText('Período futuro');
  const fila = page.locator('.fila-te', { hasText: 'FUT TEST UNO' });
  await expect(fila).not.toContainText('+168');
  await expect(fila).toContainText('—');
  // Y Liquidaciones no recibe complemento de un mes que no arrancó.
  const hook = await page.evaluate((mes) => window.complementosTareasEspecialesDelMes(mes), meses.fut);
  expect(Object.keys(hook)).toHaveLength(0);

  // --- Retenes: mismo componente ---
  await page.evaluate(() => window.navTo('retenes'));
  await page.waitForTimeout(200);
  await page.evaluate((mes) => {
    const sel = document.getElementById('ret-mes-sel');
    if (![...sel.options].some(o => o.value === mes)) { const o = document.createElement('option'); o.value = mes; o.textContent = mes; sel.appendChild(o); }
    sel.value = mes; window.renderRetenes();
  }, meses.fut);
  await expect(page.locator('#ret-chip-periodo')).toContainText('PERÍODO FUTURO');
});

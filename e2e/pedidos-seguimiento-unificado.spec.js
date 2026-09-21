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

// Ticket "Pedidos de personal completo" (18/09): Seguimiento de selección
// deja de ser pantalla propia y pasa a ser la tab "🔭 Seguimiento" de
// Pedidos de personal, con UN SOLO panel de KPIs para las 3 tabs — el bug
// real que motiva esto era que cada pantalla contaba distinto ("Seguimiento
// decía 0 cubiertas y Pedidos 16 activos; 24 activos vs 9"). Este test
// verifica: (1) los KPIs no cambian al cambiar de tab, (2) "+Vincular"
// desde Seguimiento escribe la MISMA relación que ya usaba el select de
// Candidatos (candidato.pedidoVinculadoIdLocal) y los KPIs reaccionan,
// (3) la columna PEDIDO + filtro de Candidatos leen ese mismo dato.
test('Pedidos + Seguimiento — KPIs unificados y +Vincular candidato', async ({ page }) => {
  await loginComoAdmin(page);

  const { pedidoId, candidatoId } = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');

    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-PED-E2E', nombre: 'Servicio Pedidos E2E', supervisorAsignado: 'SUP PED E2E', estado: 'Operativo', anulado: false, localidad: 'San Isidro' });

    const pedidoId = 990001;
    DB.pedidos = DB.pedidos || [];
    DB.pedidos.push({
      id: pedidoId, numero: 9001, fecha: '01/09/2026', cargadoPor: 'Test E2E', supervisor: 'SUP PED E2E',
      servicio: 'OBJ-PED-E2E', zona: 'Zona Norte', puesto: 'Operario/a', cantidad: 2, fechaLimite: '31/12/2099',
      urgencia: 'Media', perfil: [], obs: '', estado: 'En búsqueda',
    });

    const candidatoId = 990101;
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push({
      id: candidatoId, apellido: 'VINCTEST', nombre: 'Candidato Uno', dni: '30990101', tel: '',
      zona: 'Zona Norte', medio: '', estado: 'Aprobado', asistio: '', motivoRechazo: '',
    });

    window.navTo('pedidos');
    return { pedidoId, candidatoId };
  });

  await page.waitForTimeout(300);

  // --- KPIs unificados en la tab Activos (2 vacantes, 0 en proceso) ---
  const leerKpis = () => page.evaluate(() => {
    // La tarjeta "Prepedidos s/decisión" (solo Operaciones/RRHH/Admin) es la
    // primera: se ignora acá para que los índices sigan siendo los del ticket.
    const cards = [...document.querySelectorAll('#pedidos-kpis .stat-card')]
      .filter(c => !c.textContent.includes('Prepedidos'))
      .map(c => c.querySelector('.stat-valor').textContent.trim());
    return cards; // [activos, vacantesBusqueda, conCandidatoProceso, cubiertasMes, vencidos, tiempoPromedio]
  });

  let kpis = await leerKpis();
  expect(Number(kpis[1])).toBeGreaterThanOrEqual(2); // vacantes en búsqueda incluye las 2 de este pedido
  expect(Number(kpis[2])).toBe(0); // nadie en proceso todavía

  // --- Tab Seguimiento: MISMO panel de KPIs (no se recalcula distinto) ---
  await page.evaluate(() => window.cambiarTabPedidos('seguimiento'));
  await page.waitForTimeout(200);
  const kpisSeg = await leerKpis();
  expect(kpisSeg).toEqual(kpis);

  await expect(page.locator('#tbody-seg-sel')).toContainText('PP-9001');
  await expect(page.locator('#tbody-seg-sel')).toContainText('0 de 2');

  // --- "+Vincular" desde la vacante en búsqueda ---
  await page.evaluate((id) => window.abrirVincularCandidato(id), pedidoId);
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-ped-vincular')).toBeVisible();
  await expect(page.locator('#vinc-lista')).toContainText('VINCTEST');
  await expect(page.locator('#vinc-lista')).toContainText('disponible');

  await page.evaluate((id) => window.elegirCandidatoVincular(id), candidatoId);
  await page.waitForTimeout(150);

  const vinculado = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.candidatos.find(c => c.id === id)?.pedidoVinculadoIdLocal;
  }, candidatoId);
  expect(String(vinculado)).toBe(String(pedidoId));

  // --- Los KPIs reaccionan: una vacante menos en búsqueda, uno más "en proceso" ---
  await page.waitForTimeout(150);
  const kpisPost = await leerKpis();
  expect(Number(kpisPost[1])).toBe(Number(kpis[1]) - 1);
  expect(Number(kpisPost[2])).toBe(Number(kpis[2]) + 1);

  // Vuelvo a Activos: el panel sigue siendo el mismo (una sola fuente).
  await page.evaluate(() => window.cambiarTabPedidos('activos'));
  await page.waitForTimeout(150);
  expect(await leerKpis()).toEqual(kpisPost);

  // --- Candidatos: columna PEDIDO + filtro leen la MISMA relación ---
  await page.evaluate(() => window.navTo('candidatos'));
  await page.waitForTimeout(200);
  const filaCand = page.locator('#tbody-candidatos tr', { hasText: 'VINCTEST' });
  await expect(filaCand).toContainText('PP-9001');

  await page.selectOption('#cand-filtro-pedido', 'con');
  await page.waitForTimeout(150);
  await expect(page.locator('tbody#tbody-candidatos')).toContainText('VINCTEST');

  await page.selectOption('#cand-filtro-pedido', 'sin');
  await page.waitForTimeout(150);
  await expect(page.locator('tbody#tbody-candidatos')).not.toContainText('VINCTEST');
});

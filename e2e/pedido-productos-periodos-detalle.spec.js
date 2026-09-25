import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// PERIODOS_estado_pedidos_para_Fede.md (Lautaro, 25/09) +
// mockup_periodos_estado_pedidos_1.html — el tab Períodos NO se
// reestructura: la fila del mes se hace clickeable y abre un modal de SOLO
// LECTURA con el estado de los pedidos del período.
//
// Cubre: KPIs-filtro, agrupación por supervisor (los que más deben arriba),
// orden interno sin iniciar→borrador→en auditoría→confirmado, motivo leído de
// la bandeja del auditor, búsqueda, "Recordar a los que faltan", y el mismo
// modal para un período cerrado (foto final, sin botón de recordatorio).

const MES = '2027-03';

async function sembrar(page) {
  return page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const per = { id: 990500001, mes, estado: 'abierto', cierreProgramado: '2027-03-31T17:00:00.000Z', recordatorioEnviado: false, anulado: false };
    const cerrado = { id: 990500002, mes: '2027-02', estado: 'cerrado', cierreProgramado: '2027-02-28T17:00:00.000Z', recordatorioEnviado: true, anulado: false };
    DB.ppPeriodos = [per, cerrado];

    const srv = (codigo, nombre) => ({ id: 990600000 + codigo.length, codigo, nombre, estado: 'Operativo', anulado: false, clienteIdLocal: '', supervisorAsignado: '' });
    const servicios = ['E2E.S1', 'E2E.S2', 'E2E.S3', 'E2E.S4', 'E2E.S5', 'E2E.S6', 'E2E.S7', 'E2E.C1', 'E2E.C2'].map((c, i) => srv(c, 'Servicio E2E ' + (i + 1)));
    DB.objetivos = [...(DB.objetivos || []), ...servicios];

    let n = 0;
    const pedido = (estado, supervisor, conItems, periodoIdLocal) => {
      n += 1;
      const codigo = 'E2E.S' + n;
      return {
        id: 990700000 + n, periodoIdLocal: periodoIdLocal || String(per.id).slice(-9), servicioCodigo: codigo,
        facturacionNeta: 0, porcentajeTope: 0.06, estado, tipoPedido: 'mensual',
        supervisor, anulado: false,
        confirmadoEn: estado === 'confirmado_revision' ? '2027-03-10T14:38:00.000Z' : null,
        confirmadoPor: estado === 'confirmado_revision' ? 'Sup Uno' : null,
        autorizadoEn: estado === 'autorizado' ? '2027-03-11T09:00:00.000Z' : null,
        autorizadoPor: estado === 'autorizado' ? 'Auditor E2E' : null,
        _conItems: conItems,
      };
    };
    // Sup Tres es el que más debe (2 sin iniciar) → tiene que ir arriba.
    const idCerrado = String(cerrado.id).slice(-9);
    const pedidos = [
      pedido('borrador', 'Sup Uno', true),        // 1 borrador (con ítems)
      pedido('borrador', 'Sup Uno', false),       // 2 sin iniciar
      pedido('confirmado_revision', 'Sup Uno', true), // 3 en auditoría
      pedido('confirmado', 'Sup Dos', true),      // 4 confirmado
      pedido('autorizado', 'Sup Dos', true),      // 5 autorizado
      pedido('borrador', 'Sup Tres', false),      // 6 sin iniciar
      pedido('borrador', 'Sup Tres', false),      // 7 sin iniciar
      // Período cerrado: "quién confirmó a tiempo, quién entró por
      // auto-confirmación" — un confirmado y uno que nunca lo hizo.
      pedido('confirmado', 'Sup Dos', true, idCerrado),          // 8
      pedido('borrador', 'Sup Tres', false, idCerrado),         // 9 sin iniciar
    ];
    DB.ppPedidos = pedidos;
    DB.ppItems = [];
    pedidos.forEach(p => {
      if (!p._conItems) return;
      DB.ppItems.push({ id: 990800000 + p.id, pedidoIdLocal: String(p.id).slice(-9), productoIdLocal: '999999', cantSolicitada: 10, cantAutorizada: null, costoCongelado: 1000, anulado: false });
    });
    DB.notificacionesSistema = [];
    return { perId: String(per.id), cerradoId: String(cerrado.id) };
  }, MES);
}

// renderPedidoProductos() hace `chequearCierrePeriodosPP().then(() =>
// tabPP('catalogo'))` SIEMPRE, aunque no haya nada que cerrar (línea 309 de
// pedido_productos.js) → un tabPP('periodos') RIGHT después de navTo se
// pierde. Por eso se entra al tab clickeando el botón, como el usuario.
async function irAPeriodos(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.navTo('pedido_productos'));
  await page.waitForTimeout(700);
  await page.locator('#pp-tab-btn-periodos').click();
  await page.waitForTimeout(200);
}

test('Períodos — modal de estado por período: KPIs-filtro, grupos por supervisor, motivo y recordatorio', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);
  await irAPeriodos(page);

  // --- El tab queda como estaba: ahora con 5 KPIs y la fila clickeable ---
  // FIX: "Confirmados" = lo que ya pasó auditoría y está en Compras, o sea
  // confirmado POR EL SUPERVISOR (1) + autorizado POR EL AUDITOR (1) = 2. Antes
  // estadoDerivadoPedidoPP metía también en el verde lo que esperaba al
  // auditor; ahora 'En auditoría' va por separado y los KPI suman el total.
  await expect(page.locator('#pp-per-k-confirmados')).toHaveText('2');
  await expect(page.locator('#pp-per-k-borradores')).toHaveText('1');
  await expect(page.locator('#pp-per-k-siniciar')).toHaveText('3');
  await expect(page.locator('#pp-per-k-auditoria')).toHaveText('1');
  await expect(page.locator('#pp-per-k-observados')).toHaveText('0');
  // Los buckets son excluyentes: 2+1+3+1+0 = 7 del período.
  const filaAbierto = page.locator('#tbody-pp-periodos tr', { hasText: MES });
  await expect(filaAbierto).toContainText('2/7');
  // Debajo del verde, lo accionable desde este tab: lo trabado en auditoría.
  await expect(filaAbierto).toContainText('1 trabado');
  await expect(filaAbierto).toContainText('Ver estado');

  // El card "Observados" ahora también filtra (antes no tenía onclick).
  await page.locator('#pp-per-k-observados').click();
  await expect(page.locator('#tbody-pp-periodos tr', { hasText: MES })).toContainText('(filtrado)');
  await page.locator('#pp-per-k-observados').click();
  await expect(filaAbierto).not.toContainText('(filtrado)');

  // --- Click en la fila abre el modal de solo lectura ---
  await filaAbierto.click();
  const modal = page.locator('#modal-pp-detalle-periodo');
  await expect(modal).toBeVisible();
  await expect(page.locator('#pp-det-titulo')).toContainText(MES);
  await expect(page.locator('#pp-det-sub')).toContainText('7 servicio(s)');
  await expect(page.locator('#pp-det-sub')).toContainText('solo lectura');

  // --- KPIs del modal: excluyentes, suman el total ---
  const chip = (label) => modal.locator('.pp-kc', { hasText: label });
  await expect(chip('Todos')).toContainText('7');
  await expect(chip('Confirmado')).toContainText('2');
  await expect(chip('En auditoría')).toContainText('1');
  await expect(chip('Borrador')).toContainText('1');
  await expect(chip('Sin iniciar')).toContainText('3');
  // 'Autorizado' no es un bucket propio: va adentro de Confirmado, así que
  // el chip existe (para filtrar lo trabado) pero no infla el verde.
  await expect(chip('Observado')).toContainText('0');

  // --- Agrupado por supervisor, el que más debe arriba ---
  const grupos = modal.locator('#pp-det-grupos > div');
  await expect(grupos).toHaveCount(3);
  await expect(grupos.nth(0)).toContainText('Sup Tres');
  await expect(grupos.nth(0)).toContainText('2 sin iniciar');
  await expect(grupos.nth(1)).toContainText('Sup Uno');
  await expect(grupos.nth(1)).toContainText('1 sin iniciar');
  await expect(grupos.nth(2)).toContainText('Sup Dos');
  await expect(grupos.nth(2)).toContainText('al día');

  // Orden interno: sin iniciar → borrador → en auditoría.
  const filasUno = grupos.nth(1).locator('div').filter({ hasText: /Servicio E2E/ });
  await expect(filasUno.nth(0)).toContainText('sin productos cargados');
  await expect(filasUno.nth(1)).toContainText('BORRADOR');
  await expect(filasUno.nth(2)).toContainText('EN AUDITORÍA');
  // En auditoría muestra el motivo REAL de la bandeja del auditor.
  await expect(filasUno.nth(2)).toContainText('NO FACTURA PRODUCTOS');
  // El monto sale de los ítems (10 × $1.000).
  await expect(grupos.nth(1)).toContainText('$ 10.000,00');

  // El chip de la fila dice el estado REAL dentro de 'Confirmados': el pedido
  // que el auditor autorizó cuenta para el KPI verde, pero en la fila se lee
  // AUTORIZADO, con su fecha y el nombre de quien aprobó. (Dentro del bucket
  // el desempate es por nombre de servicio, así que va E2E.4 y después E2E.5.)
  const filasDos = grupos.nth(2).locator('div').filter({ hasText: /Servicio E2E/ });
  await expect(filasDos).toHaveCount(2);
  await expect(filasDos.nth(0)).toContainText('CONFIRMADO');
  await expect(filasDos.nth(1)).toContainText('AUTORIZADO');
  await expect(filasDos.nth(1)).toContainText('autorizado 11/3');
  await expect(filasDos.nth(1)).toContainText('Auditor E2E');

  // --- Los KPIs filtran ---
  const filasTodas = modal.locator('#pp-det-grupos > div > div').filter({ hasText: /Servicio E2E/ });
  await chip('Sin iniciar').click();
  await expect(grupos).toHaveCount(2);            // Tres (2) + Uno (1)
  await expect(grupos.nth(0)).toContainText('Sup Tres');
  await expect(grupos.nth(1)).toContainText('Sup Uno');
  await expect(filasTodas).toHaveCount(3);
  await chip('Sin iniciar').click();
  await expect(grupos).toHaveCount(3);
  await expect(filasTodas).toHaveCount(7);
  await chip('Confirmado').click();
  await expect(grupos).toHaveCount(1);
  await expect(grupos.nth(0)).toContainText('Sup Dos');
  await expect(filasTodas).toHaveCount(2);   // el confirmado + el autorizado
  await expect(modal.locator('#pp-det-grupos')).not.toContainText('Sin iniciar');
  await chip('Confirmado').click();

  // --- Búsqueda por supervisor ---
  await page.fill('#pp-det-q', 'sup dos');
  await expect(grupos).toHaveCount(1);
  await expect(grupos.nth(0)).toContainText('Sup Dos');
  await page.fill('#pp-det-q', 'Servicio E2E 1');
  await expect(grupos).toHaveCount(1);
  await expect(grupos.nth(0)).toContainText('Sup Uno');
  await page.fill('#pp-det-q', '');

  // --- "Recordar a los que faltan": campanita a cada supervisor con sin iniciar ---
  await expect(page.locator('#pp-det-recordar')).toBeVisible();
  await expect(page.locator('#pp-det-recordar')).toContainText('2 supervisor/es');
  // Manda notificaciones reales a la bandeja de toda la operación, así que
  // pide confirmación. Se registra el handler ANTES del click: con un
  // waitForEvent aparte, el click queda esperando al diálogo y deadlock.
  let mensajeDialogo = null;
  page.once('dialog', d => { mensajeDialogo = d.message(); d.dismiss(); });
  await page.locator('#pp-det-recordar').click();
  expect(mensajeDialogo).toContain('2 supervisor(es)');
  expect(mensajeDialogo).toContain('Sup Tres: 2 pedido(s) sin cargar');
  // Dismiss = no se manda nada.
  await expect.poll(async () => page.evaluate(async () => (await import('/src/shared/state.js')).DB.notificacionesSistema.length), { timeout: 5000 }).toBe(0);
  // Ahora sí, aceptado.
  page.once('dialog', d => d.accept());
  await page.locator('#pp-det-recordar').click();
  // crearNotificacion() hace un supaSync (ida a Supabase) por destinatario,
  // así que se espera por condición en vez de por un timeout fijo.
  await expect.poll(async () => page.evaluate(async () => (await import('/src/shared/state.js')).DB.notificacionesSistema.length), { timeout: 10000 }).toBe(2);
  const notis = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.notificacionesSistema);
  expect(notis).toHaveLength(2);
  expect(notis.map(n => n.destinatarioNombre).sort()).toEqual(['Sup Tres', 'Sup Uno']);
  expect(notis.every(n => n.tipo === 'pp_recordatorio_cierre')).toBe(true);
  expect(notis.every(n => n.mensaje.includes('sin pedido cargado todavía'))).toBe(true);
  await expect(page.locator('#toast')).toContainText('Campanita enviada a 2 supervisor');

  // --- Período cerrado: mismo modal, foto final, sin recordatorio ---
  await page.evaluate(() => window.cerrarDetallePeriodoPP());
  await expect(modal).not.toBeVisible();
  await page.locator('#tbody-pp-periodos tr', { hasText: '2027-02' }).click();
  await expect(modal).toBeVisible();
  await expect(page.locator('#pp-det-sub')).toContainText('período cerrado');
  await expect(page.locator('#pp-det-sub')).toContainText('foto final');
  await expect(page.locator('#pp-det-sub')).toContainText('2 servicio(s)');
  await expect(chip('Todos')).toContainText('2');
  await expect(chip('Confirmado')).toContainText('1');
  await expect(chip('Sin iniciar')).toContainText('1');
  // Foto final: los grupos en el mismo orden (el que debe, arriba).
  await expect(grupos).toHaveCount(2);
  await expect(grupos.nth(0)).toContainText('Sup Tres');
  await expect(grupos.nth(0)).toContainText('1 sin iniciar');
  await expect(grupos.nth(1)).toContainText('Sup Dos');
  // Período cerrado → no tiene sentido el empujón, no se muestra el botón.
  await expect(page.locator('#pp-det-recordar')).toBeHidden();
});

// Regression de un bug que el E2E de arriba destapó de paso:
// renderPedidoProductos() terminaba con
//   chequearCierrePeriodosPP().then(() => tabPP('catalogo'))
// SIEMPRE, aunque no hubiera nada que cerrar. Cada re-render de la pantalla
// (y navTo la dispara) devolvía al usuario a Catálogo y le cerraba el tab de
// Períodos que tenía abierto.
test('Períodos — el tab sobrevive a un re-render de la pantalla', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.navTo('pedido_productos'));
  await page.waitForTimeout(700);

  await page.locator('#pp-tab-btn-periodos').click();
  await expect(page.locator('#pp-tab-periodos')).toBeVisible();

  // Salir a otra pantalla y volver: el tab tiene que seguir en Períodos.
  await page.evaluate(() => window.navTo('gestion_horas'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.navTo('pedido_productos'));
  await page.waitForTimeout(700);
  await expect(page.locator('#pp-tab-periodos')).toBeVisible();
  await expect(page.locator('#pp-tab-catalogo')).not.toBeVisible();

  // Y el modal se sigue abriendo bien sobre el tab persistente.
  await page.locator('#tbody-pp-periodos tr', { hasText: MES }).click();
  await expect(page.locator('#modal-pp-detalle-periodo')).toBeVisible();
  await expect(page.locator('#pp-det-sub')).toContainText('7 servicio(s)');
});

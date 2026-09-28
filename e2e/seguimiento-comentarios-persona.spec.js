import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket #184 (Jimena): "dentro de la visualización de una persona en
// seguimiento tener la posibilidad de agregar un comentario (me serviría para
// dejar la clave fiscal y acceder cada que lo necesito)".
//
// Los comentarios viven en la tabla `candidato_comentarios` (v171) y se
// concilian por id_local del CANDIDATO, no por DNI. El test intercepta
// /rest/v1/** para no escribir en la base real: se verifica el circuito de
// pantalla (contador, modal, alta, borrado lógico) y el estado en DB.

const PEDIDO_ID = 990701;
const CANDIDATO_ID = 9907011;

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

async function sembrarPedidoConCandidato(page) {
  await page.evaluate(async ({ pedidoId, candidatoId }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-COM-E2E', nombre: 'Servicio Comentarios E2E', supervisorAsignado: 'SUP COM E2E', estado: 'Operativo', anulado: false, localidad: 'San Isidro' });
    DB.pedidos = DB.pedidos || [];
    DB.pedidos.push({
      id: pedidoId, numero: 9701, fecha: '01/09/2026', cargadoPor: 'Test E2E', supervisor: 'SUP COM E2E',
      servicio: 'OBJ-COM-E2E', zona: 'Zona Norte', puesto: 'Operario/a', cantidad: 1, fechaLimite: '31/12/2099',
      urgencia: 'Media', perfil: [], obs: '', estado: 'En búsqueda',
    });
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push({
      id: candidatoId, apellido: 'COMENTEST', nombre: 'Candidato', dni: '30990701', tel: '',
      zona: 'Zona Norte', medio: '', estado: 'Aprobado', asistio: '', motivoRechazo: '',
      pedidoVinculadoIdLocal: String(pedidoId),
    });
    DB.candidatoComentarios = DB.candidatoComentarios || [];
    window.navTo('pedidos');
  }, { pedidoId: PEDIDO_ID, candidatoId: CANDIDATO_ID });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.cambiarTabPedidos('seguimiento'));
  await page.waitForTimeout(200);
}

async function abrirDetalle(page) {
  await page.evaluate((id) => window.abrirDetallePedidoSeguimiento(id), PEDIDO_ID);
  await expect(page.locator('#modal-seg-ver-pedido')).toBeVisible();
}

test('La tabla de la persona tiene columna de comentarios y arranca en 0', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarPedidoConCandidato(page);
  await abrirDetalle(page);

  await expect(page.locator('#tbody-seg-ver')).toContainText('COMENTEST, Candidato');
  await expect(page.locator('#tbody-seg-ver button[onclick*="abrirComentariosCandidato"]')).toHaveText('💬 0');
});

test('Guardar un comentario lo muestra, incrementa el contador y lo deja en DB', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarPedidoConCandidato(page);
  await abrirDetalle(page);

  await page.click('#tbody-seg-ver button[onclick*="abrirComentariosCandidato"]');
  await expect(page.locator('#modal-seg-comentarios')).toBeVisible();
  await expect(page.locator('#seg-com-titulo')).toContainText('COMENTEST, Candidato');
  await expect(page.locator('#seg-com-lista')).toContainText('Todavía no hay comentarios');

  await page.fill('#seg-com-texto', 'Clave fiscal 27-30456789-4');
  await page.click('button[onclick="guardarComentarioCandidato()"]');

  await expect(page.locator('#seg-com-lista')).toContainText('Clave fiscal 27-30456789-4');
  await expect(page.locator('#seg-com-lista')).toContainText('Test E2E');
  // El textarea se limpia para poder cargar el siguiente sin borrar a mano.
  await expect(page.locator('#seg-com-texto')).toHaveValue('');

  const enDb = await page.evaluate(async (cid) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.candidatoComentarios.filter(x => String(x.candidatoIdLocal) === String(cid) && !x.anulado).length;
  }, CANDIDATO_ID);
  expect(enDb).toBe(1);

  // El contador de la tabla de atrás se actualiza sin cerrarle el modal.
  await page.evaluate(() => window.cerrarModal('modal-seg-comentarios'));
  await expect(page.locator('#tbody-seg-ver button[onclick*="abrirComentariosCandidato"]')).toHaveText('💬 1');
});

test('Varios comentarios se acumulan y se listan del más nuevo al más viejo', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarPedidoConCandidato(page);
  await page.evaluate(async (cid) => {
    const { DB } = await import('/src/shared/state.js');
    DB.candidatoComentarios.push(
      { id: 1, candidatoIdLocal: String(cid), comentario: 'Primer comentario', autor: 'RRHH', creadoEn: '2026-09-01T10:00:00Z', anulado: false },
      { id: 2, candidatoIdLocal: String(cid), comentario: 'Segundo comentario', autor: 'Supervisor', creadoEn: '2026-09-20T10:00:00Z', anulado: false },
    );
    window.renderSeguimientoSeleccion();
  }, CANDIDATO_ID);
  await abrirDetalle(page);

  const btn = page.locator('#tbody-seg-ver button[onclick*="abrirComentariosCandidato"]');
  await expect(btn).toHaveText('💬 2');
  await btn.click();

  const items = page.locator('#seg-com-lista > div');
  await expect(items).toHaveCount(2);
  // El más nuevo primero.
  await expect(items.nth(0)).toContainText('Segundo comentario');
  await expect(items.nth(1)).toContainText('Primer comentario');
});

test('Borrar es lógico: desaparece de la lista y el contador baja', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarPedidoConCandidato(page);
  await page.evaluate(async (cid) => {
    const { DB } = await import('/src/shared/state.js');
    DB.candidatoComentarios.push(
      { id: 1, candidatoIdLocal: String(cid), comentario: 'Se va a borrar', autor: 'RRHH', creadoEn: '2026-09-01T10:00:00Z', anulado: false },
    );
    window.renderSeguimientoSeleccion();
  }, CANDIDATO_ID);
  await abrirDetalle(page);

  page.once('dialog', d => d.accept());
  await page.click('#tbody-seg-ver button[onclick*="abrirComentariosCandidato"]');
  await expect(page.locator('#seg-com-lista')).toContainText('Se va a borrar');
  await page.click('#seg-com-lista button[onclick*="anularComentarioCandidato"]');

  await expect(page.locator('#seg-com-lista')).toContainText('Todavía no hay comentarios');

  const estado = await page.evaluate(async (cid) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.candidatoComentarios.filter(x => String(x.candidatoIdLocal) === String(cid)).map(x => x.anulado);
  }, CANDIDATO_ID);
  // Sigue en el array, pero marcado como anulado (auditoría).
  expect(estado).toEqual([true]);
});

test('No vacío: exigir escribir algo antes de guardar', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarPedidoConCandidato(page);
  await abrirDetalle(page);

  await page.click('#tbody-seg-ver button[onclick*="abrirComentariosCandidato"]');
  await page.fill('#seg-com-texto', '    ');
  await page.click('button[onclick="guardarComentarioCandidato()"]');
  await expect(page.locator('#seg-com-lista')).toContainText('Todavía no hay comentarios');

  const n = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return (DB.candidatoComentarios || []).length;
  });
  expect(n).toBe(0);
});

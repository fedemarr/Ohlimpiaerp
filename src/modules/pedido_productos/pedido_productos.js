// Módulo Pedido de Productos (Logística) — diseño Lautaro + Claude web,
// 11/07/2026 (docs/MODULO_PEDIDO_PRODUCTOS.md), sql/v085.
//
// Reemplaza la planilla Excel de pedido mensual de productos/insumos por
// servicio. Flujo de estados: borrador (supervisor) → cerrado_supervisor →
// en_auditoria (auditor ajusta) → autorizado → en_compra → entregado
// (Logística).
//
// "Auditor interno" no tiene perfil propio en el sistema todavía — la
// etapa de auditoría queda dentro del perfil Logística (ver comentario en
// PERFILES, state.js). No se inventó un perfil nuevo sin que lo pida el
// negocio.

import { DB, currentUser } from '@shared/state.js';
import { $, hoyStr } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getSupervisorDeCodigo, serviciosDeSupervisor } from '@modules/servicios_supervisor/servicios_supervisor.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { renderConsolidadoPP, renderSugerenciasPP, renderSimulacionPP, renderOrdenesPP, renderComparadorPreciosPP } from './compras.js';
import { renderEntregasPP } from './entregas.js';

const LABEL_TIPO_USO = {
  apertura: 'Apertura de servicio',
  tratamiento_piso: 'Tratamiento de piso',
  con_autorizacion: 'Con autorización',
  normal: 'Normal',
};
const COLOR_TIPO_USO = { apertura: '#f59e0b', tratamiento_piso: '#7c3aed', con_autorizacion: '#0ea5e9', normal: '#6b7280' };

function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
// FIX (ticket "Módulo productos" 31/08, punto 15): sin maximumFractionDigits
// explícito, Intl deja pasar hasta 3 decimales cuando el número los tiene
// (ej. de un cálculo de %) — "$ 173.150,477" en vez de "$ 173.150,48".
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// FIX 27/08 (en vivo, "Mis pedidos" vacío para Alejandro Cacciato):
// pedido.periodoIdLocal se guardaba como periodo.id COMPLETO (ej.
// "PPPER-1787748384331-6756"), pero supaSync trunca el id_local REAL de
// cualquier tabla a los últimos 9 caracteres (src/shared/supabase.js) —
// así que apenas la página recarga, _toCamel() reasigna periodo.id =
// periodo.idLocal (la versión truncada, "4331-6756" para este caso
// real). Comparar el id completo viejo contra el truncado nuevo nunca
// matcheaba — rompía "Mis pedidos" para TODOS los supervisores después
// de cualquier recarga, no solo para Cacciato. Se normalizan los dos
// lados de cada comparación a los mismos 9 caracteres, sin tocar los
// datos ya guardados (no hace falta backfill: "PPPER-...4331-6756"
// truncado a 9 da "4331-6756", igual que el id_local real del período).
const _idTrunc = (v) => String(v || '').slice(-9);

function getProductoPP(id) { return (DB.ppProductos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function getPedidoPP(id) { return (DB.ppPedidos || []).find(p => String(p.id) === String(id)); }
function getPeriodoPP(id) { return (DB.ppPeriodos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function getProveedorPP(id) { return (DB.proveedores || []).find(p => String(p.id) === String(id) && !p.anulado); }
function itemsDePedido(pedidoId) { return (DB.ppItems || []).filter(i => _idTrunc(i.pedidoIdLocal) === _idTrunc(pedidoId) && !i.anulado); }

function precioVigente(productoId, fechaISO = hoyStr()) {
  // FIX 27/08 (ticket "importar CSV no guarda precios"): mismo bug de
  // truncamiento que periodoIdLocal (ver _idTrunc arriba) pero acá con
  // productoIdLocal. Un producto CREADO junto con su precio (alta manual
  // o import de listado) guarda productoIdLocal = prod.id COMPLETO en
  // el momento de la creación; tras la primera recarga, prod.id pasa a
  // ser el id_local TRUNCADO (9 caracteres) — la comparación exacta
  // dejaba de encontrar el precio, aunque SÍ estaba guardado en la
  // base: el catálogo mostraba "sin precio" en rojo después de recargar.
  const precios = (DB.ppPrecios || []).filter(pr => _idTrunc(pr.productoIdLocal) === _idTrunc(productoId) && !pr.anulado);
  const vigente = precios.find(pr => pr.vigenciaDesde <= fechaISO && (!pr.vigenciaHasta || pr.vigenciaHasta >= fechaISO));
  return vigente ? Number(vigente.costoUnit) || 0 : 0;
}
function cantEfectiva(item) { return item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada; }
// Antes del cierre no hay costo_congelado todavía — se usa el precio
// vigente en vivo para que el semáforo se pueda ver mientras se carga.
function costoAplicable(item) { return item.costoCongelado > 0 ? item.costoCongelado : precioVigente(item.productoIdLocal); }

function totalPedidoPP(pedidoId) {
  return itemsDePedido(pedidoId).reduce((s, i) => s + cantEfectiva(i) * costoAplicable(i), 0);
}
function desglosePorCategoriaPP(pedidoId) {
  const grupos = { apertura: 0, tratamiento_piso: 0, con_autorizacion: 0, normal: 0 };
  itemsDePedido(pedidoId).forEach(i => {
    const prod = getProductoPP(i.productoIdLocal);
    const tipo = prod?.tipoUso || 'normal';
    grupos[tipo] = (grupos[tipo] || 0) + cantEfectiva(i) * costoAplicable(i);
  });
  return grupos;
}

// ========== REGLA COSTO ≠ RECARGO + PAGAN/NO PAGAN (ticket "Módulo
// productos" 31/08, punto 0 y 9) ==========
//
// PAGAN/NO PAGAN ("Cobro") vive en clientes.productos_en_factura ("SE
// FACTURA" / "NO SE FACTURA") — el alta del servicio (Comercial) lo carga
// a nivel CLIENTE, no hay override por objetivo individual. Sin dato
// cargado (vacío o null) se trata como NO PAGAN a propósito: es el lado
// seguro — un servicio sin este dato configurado NUNCA salta el filtro
// del auditor por default, se revisa igual (mismo criterio que "ante la
// duda, revisar" del punto 9).
function clienteDeObjetivoPP(objetivo) {
  if (!objetivo?.clienteIdLocal) return null;
  return (DB.clientes || []).find(c => String(c.idLocal || c.id_local) === String(objetivo.clienteIdLocal)) || null;
}
function esPaganPP(pedido) {
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  const cliente = obj ? clienteDeObjetivoPP(obj) : null;
  return cliente?.productosEnFactura === 'SE FACTURA';
}

// Recargo vigente del SERVICIO (tab 📈 Recargos, punto 7 — TODO: pendiente
// mockup el detalle final de esa pantalla, esto ya deja el enganche listo).
// Prioridad: margen propio del servicio (recargosServicio) → si no,
// recargo GENERAL vigente (recargoGeneral) → si no hay ninguno cargado
// todavía, 30% hardcodeado (mismo valor que ya usa el mockup como
// "general vigente hoy") para no romper el cálculo de P. VENTA REF.
// mientras el tab de Recargos no exista.
const RECARGO_GENERAL_DEFAULT = 0.30;
function recargoVigenteServicioPP(servicioCodigo) {
  const propio = (DB.recargosServicio || []).find(r => r.servicioCodigo === servicioCodigo && !r.anulado && !r.vigenciaHasta);
  if (propio) return Number(propio.pct) || 0;
  const general = (DB.recargosGeneral || []).filter(r => !r.anulado && !r.vigenciaHasta).sort((a, b) => (b.vigenciaDesde || '').localeCompare(a.vigenciaDesde || ''))[0];
  return general ? Number(general.pct) || 0 : RECARGO_GENERAL_DEFAULT;
}
function precioVentaPP(costo, servicioCodigo) {
  return costo * (1 + recargoVigenteServicioPP(servicioCodigo));
}

// Presupuesto del mes = facturación neta × % (por defecto 6%), a COSTO —
// mismo valor que antes se llamaba "tope". Devuelve 0 si no hay
// facturación cargada (no se puede calcular).
function presupuestoDelMesPP(pedido) {
  return (pedido.facturacionNeta || 0) * (pedido.porcentajeTope || 0.06);
}

// Motivo(s) por los que un pedido cae en la bandeja del auditor (punto 9).
// [] = pasa directo a Compras. Un pedido puede tener más de un motivo —
// se muestran todos, el semáforo/chip usa el primero para el color.
function motivosRevisionPP(pedido) {
  const motivos = [];
  const pagan = esPaganPP(pedido);
  if (!pagan) motivos.push({ codigo: 'no_factura', label: 'NO FACTURA PRODUCTOS', chip: 'c-gris' });

  const total = totalPedidoPP(pedido.id);
  const presupuesto = presupuestoDelMesPP(pedido);
  const excede = presupuesto > 0 && total > presupuesto;
  if (excede) motivos.push({ codigo: 'excede', label: 'EXCEDE PRESUPUESTO', chip: 'c-rojo', pct: (total / presupuesto * 100) });

  const conAutorizacion = itemsDePedido(pedido.id).some(i => {
    const prod = getProductoPP(i.productoIdLocal);
    return prod?.tipoUso === 'con_autorizacion' && cantEfectiva(i) > 0;
  });
  if (conAutorizacion) motivos.push({ codigo: 'con_autorizacion', label: 'CON AUTORIZACIÓN', chip: 'c-viol' });

  const periodo = getPeriodoPP(pedido.periodoIdLocal);
  if (periodo?.cierreProgramado && pedido.confirmadoEn && new Date(pedido.confirmadoEn) > new Date(periodo.cierreProgramado)) {
    motivos.push({ codigo: 'fuera_ventana', label: 'FUERA DE VENTANA', chip: 'c-nara' });
  }

  // TODO: pendiente mockup — "FUERA DE ESTÁNDAR" real (desvío contra el
  // historial del servicio Y su perfil de alta, con umbrales
  // parametrizables + detección de "primer pedido de este producto en
  // este servicio"). Falta definir con Lautaro: cuántos períodos de
  // historial promediar, el % de desvío que dispara la excepción, y
  // dónde vive el "perfil de alta" del servicio. No se inventa acá.

  return motivos;
}

function badgeTipoUsoPP(tipo) {
  return `<span class="badge" style="background:${COLOR_TIPO_USO[tipo] || '#6b7280'};color:white;">${LABEL_TIPO_USO[tipo] || tipo}</span>`;
}
// Estados (ticket "Módulo productos" 31/08, punto 7 — reemplaza el viejo
// "Cerrado (en cola)", que no le decía nada al supervisor):
//   BORRADOR              → el supervisor todavía está cargando
//   CONFIRMADO            → PAGAN + dentro del presupuesto + sin excepciones:
//                           pasó directo a Compras, sin auditor
//   CONFIRMADO · EN REVISIÓN → cae en la bandeja del auditor (ver
//                           motivoRevisionPP)
//   OBSERVADO POR AUDITOR → el auditor devolvió una propuesta; el
//                           supervisor la acepta o corrige y re-confirma
//   AUTORIZADO            → el auditor aprobó (con o sin ajuste) — mismo
//                           punto de entrada a Compras que CONFIRMADO
//   EN COMPRA / ENTREGADO → sin cambios
const ESTADOS_PEDIDO_PP = {
  borrador: ['#f59e0b', 'Borrador'],
  confirmado: ['#16a34a', 'Confirmado'],
  confirmado_revision: ['#7c3aed', 'Confirmado · en revisión'],
  observado: ['#e8590c', 'Observado por auditor'],
  autorizado: ['#16a34a', 'Autorizado'],
  en_compra: ['#2563eb', 'En compra'],
  entregado: ['#059669', 'Entregado'],
};
function badgeEstadoPedidoPP(estado) {
  const [color, label] = ESTADOS_PEDIDO_PP[estado] || ['#6b7280', estado];
  return `<span class="badge" style="background:${color};color:white;">${label}</span>`;
}
// FIX (probado en vivo, 31/08): con el estado 'habilitado' nuevo (punto
// 8.1 — el próximo período programado de antemano), esta función solo
// distinguía 'abierto' de "todo lo demás" y mostraba HABILITADO como
// "Cerrado" — confuso justo en el caso que el punto 8.1 quiere destacar.
const ESTADOS_PERIODO_PP = {
  abierto: ['#16a34a', 'Abierto'],
  habilitado: ['#2563eb', 'Habilitado'],
  cerrado: ['#6b7280', 'Cerrado'],
};
function badgeEstadoPeriodoPP(estado) {
  const [color, label] = ESTADOS_PERIODO_PP[estado] || ['#6b7280', estado];
  return `<span class="badge" style="background:${color};color:white;">${label}</span>`;
}

// Semáforo de 3 niveles + destino (ticket "Módulo productos" 31/08, punto
// 5 — antes solo tenía verde/rojo contra el "tope", y con facturación en
// 0 quedaba gris sin avisar nada del destino):
//   VERDE  → dentro del presupuesto, sin excepciones → directo a Compras
//   ÁMBAR  → >85% del presupuesto, O lleva productos CON AUTORIZACIÓN
//            (dentro del presupuesto igual) → al auditor, pero no por exceso
//   ROJO   → excede el presupuesto → al auditor
// NO PAGAN siempre va al auditor (ver motivosRevisionPP) aunque el
// semáforo dé verde por presupuesto — se muestra aparte, no tapa el color.
function renderSemaforoHTML(pedido) {
  const total = totalPedidoPP(pedido.id);
  const presupuesto = presupuestoDelMesPP(pedido);
  const pct = pedido.facturacionNeta > 0 ? (total / pedido.facturacionNeta * 100) : 0;
  const pctPresupuesto = presupuesto > 0 ? (total / presupuesto * 100) : 0;
  const motivos = motivosRevisionPP(pedido);
  const excede = motivos.some(m => m.codigo === 'excede');
  const conAutorizacion = motivos.some(m => m.codigo === 'con_autorizacion');
  const pagan = esPaganPP(pedido);

  let nivel = 'verde', color = '#16a34a';
  if (!pedido.facturacionNeta) { nivel = 'gris'; color = '#6b7280'; }
  else if (excede) { nivel = 'rojo'; color = '#dc2626'; }
  else if (pctPresupuesto > 85 || conAutorizacion) { nivel = 'ambar'; color = '#c96a10'; }

  const vaAlAuditor = !pagan || motivos.length > 0;
  const destino = vaAlAuditor
    ? '<span style="font-weight:700;">→ al confirmar pasa por el AUDITOR</span>' + (!pagan ? ' <span style="color:var(--texto-suave);">(servicio NO PAGAN)</span>' : '')
    : '<span style="font-weight:700;color:#16a34a;">→ al confirmar pasa DIRECTO a Compras</span>';

  const desglose = desglosePorCategoriaPP(pedido.id);
  const excesoEsperable = (desglose.apertura || 0) + (desglose.tratamiento_piso || 0);
  const filas = Object.keys(LABEL_TIPO_USO).map(k => `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding:2px 0;">
    <span>${LABEL_TIPO_USO[k]}</span><span>${_money(desglose[k] || 0)}</span>
  </div>`).join('');
  return `
    <div style="padding:12px 14px;border-radius:var(--radio);background:${color}18;border:1px solid ${color}55;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
        <strong style="color:${color};font-size:14px;">${_money(total)} ${pedido.facturacionNeta ? `(${pct.toFixed(1)}% de la facturación)` : ''}</strong>
        ${pedido.facturacionNeta
          ? `<span style="font-size:11.5px;color:var(--texto-suave);">Presupuesto del mes (${(pedido.porcentajeTope * 100).toFixed(0)}% s/ últ. facturación): ${_money(presupuesto)}</span>`
          : '<span style="font-size:11.5px;color:var(--rojo);">Sin facturación cargada — no se puede calcular el %</span>'}
      </div>
      <div style="font-size:11.5px;margin-bottom:6px;">${destino}</div>
      ${excede ? `<div style="font-size:11.5px;color:${color};margin-bottom:6px;">⚠️ Excede el presupuesto del mes${excesoEsperable > 0 ? ` — ${_money(excesoEsperable)} corresponden a Apertura/Tratamiento de piso (esperable)` : ''}.</div>` : ''}
      ${filas}
    </div>`;
}

// ========== PROVEEDORES DEMO — DESHABILITADO ==========
// Antes insertaba THAMES y DIVERSEY como datos demo cuando la tabla estaba vacía.
// Ya no se usa: los proveedores reales se gestionan desde el módulo Proveedores.
function _seedProveedoresDemo() {
  return;
}

// ========== PANTALLA PRINCIPAL / TABS ==========

export function renderPedidoProductos() {
  _seedProveedoresDemo();
  const esLogistica = ['Administrador total', 'Logística'].includes(currentUser?.perfil);
  const esSupervisor = currentUser?.perfil === 'Supervisor';
  ['pp-tab-btn-catalogo', 'pp-tab-btn-periodos', 'pp-tab-btn-auditoria', 'pp-tab-btn-compras'].forEach(id => {
    const el = $(id); if (el) el.style.display = esLogistica ? '' : 'none';
  });
  const btnMis = $('pp-tab-btn-mispedidos'); if (btnMis) btnMis.style.display = esSupervisor ? '' : 'none';
  poblarSelectsPeriodoPP();
  const tabInicial = (esSupervisor && !esLogistica) ? 'mispedidos' : 'catalogo';
  tabPP(tabInicial, $('pp-tab-btn-' + tabInicial));
  // Punto 8.2/8.3 del MD: chequeo al abrir, mismo patrón que
  // chequearAlertas24hs de Uniformes (sin cron real todavía) — cierra
  // solo el período si se pasó la hora programada y manda el
  // recordatorio 24hs antes. Re-renderiza lo que esté a la vista si algo
  // cambió, para no depender de F5 (punto 6).
  chequearCierrePeriodosPP().then(() => tabPP(tabInicial, null));
}

export function tabPP(tab, btn) {
  document.querySelectorAll('#screen-pedido_productos .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-pedido_productos .tab-btn').forEach(b => b.classList.remove('active'));
  const el = $('pp-tab-' + tab); if (el) el.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'catalogo') renderCatalogoPP();
  if (tab === 'periodos') renderPeriodosPP();
  if (tab === 'mispedidos') renderMisPedidosPP();
  if (tab === 'auditoria') renderAuditoriaPP();
  // Compras (puntos 6a/10) tiene 5 subtabs propias — arranca siempre por
  // Consolidado. Entregas (puntos 6b/11) es tab aparte, unidad servicio.
  if (tab === 'compras') subTabComprasPP('consolidado', null);
  if (tab === 'entregas') renderEntregasPP();
}

const RENDER_SUBTAB_COMPRAS = {
  consolidado: renderConsolidadoPP, sugerencias: renderSugerenciasPP, simulacion: renderSimulacionPP,
  ordenes: renderOrdenesPP, comparador: renderComparadorPreciosPP,
};
export function subTabComprasPP(sub, btn) {
  document.querySelectorAll('#pp-tab-compras .stab').forEach(b => b.classList.remove('act'));
  document.querySelectorAll('#pp-tab-compras .sub').forEach(s => s.classList.remove('act'));
  if (btn) btn.classList.add('act');
  else document.querySelector(`#pp-tab-compras .stab[data-sub="${sub}"]`)?.classList.add('act');
  $('pp-compras-sub-' + sub)?.classList.add('act');
  (RENDER_SUBTAB_COMPRAS[sub] || (() => {}))();
}

export function poblarSelectsPeriodoPP() {
  const periodos = (DB.ppPeriodos || []).filter(p => !p.anulado).sort((a, b) => b.mes.localeCompare(a.mes));
  // pp-sup-periodo-sel ya no existe (punto 8.1: el supervisor nunca elige
  // el mes) — "Mis pedidos" resuelve el período abierto solo, ver periodoAbiertoPP().
  ['pp-aud-periodo-sel', 'pp-compra-periodo-sel'].forEach(id => {
    const sel = $(id); if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = periodos.map(p => `<option value="${_idTrunc(p.id)}">${p.mes}${p.estado === 'cerrado' ? ' (cerrado)' : ''}</option>`).join('');
    if (actual && periodos.some(p => _idTrunc(p.id) === actual)) sel.value = actual;
  });
  _poblarFiltroProveedorPP();
}

function _poblarFiltroProveedorPP() {
  const sel = $('pp-cat-filtro-prov'); if (!sel) return;
  const actual = sel.value;
  const provs = (DB.proveedores || []).filter(p => !p.anulado).sort((a, b) => a.nombre.localeCompare(b.nombre));
  sel.innerHTML = '<option value="">Todos los proveedores</option>' + provs.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  if (actual && provs.some(p => String(p.id) === actual)) sel.value = actual;
}

// ========== CATÁLOGO ==========

export function renderCatalogoPP() {
  const tbody = $('tbody-pp-catalogo'); if (!tbody) return;
  const q = ($('pp-cat-buscar') || { value: '' }).value.toLowerCase();
  const filtroTipo = ($('pp-cat-filtro-tipo') || { value: '' }).value;
  const filtroProv = ($('pp-cat-filtro-prov') || { value: '' }).value;
  const rows = (DB.ppProductos || []).filter(p => !p.anulado)
    .filter(p => !q || p.descripcion.toLowerCase().includes(q) || (p.codigoMonica || '').toLowerCase().includes(q))
    .filter(p => !filtroTipo || p.tipoUso === filtroTipo)
    .filter(p => !filtroProv || String(p.proveedorIdLocal || '') === String(filtroProv))
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin productos en el catálogo.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const costo = precioVigente(p.id);
    const prov = p.proveedorIdLocal ? getProveedorPP(p.proveedorIdLocal) : null;
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);">${p.codigoMonica || '—'}</td>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${p.descripcion}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${prov ? `<span class="badge" style="background:#0ea5e9;color:white;font-size:10.5px;">${prov.nombre}</span>` : '<span style="color:var(--texto-suave);">—</span>'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeTipoUsoPP(p.tipoUso)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${costo ? _money(costo) : '<span style="color:var(--rojo);">sin precio</span>'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;white-space:nowrap;">
        <button class="btn btn-xs" onclick="abrirEditarProductoPP('${p.id}')">Editar</button>
        <button class="btn btn-xs" onclick="abrirNuevoPrecioPP('${p.id}')">💲 Precio</button>
        <button class="btn btn-xs btn-secondary" onclick="anularProductoPP('${p.id}')">Anular</button>
      </td>
    </tr>`;
  }).join('');
}

let _ppProductoEditandoId = null;
function _poblarSelectProveedorPP() {
  const sel = $('pp-prod-proveedor'); if (!sel) return;
  const provs = (DB.proveedores || []).filter(p => !p.anulado).sort((a, b) => a.nombre.localeCompare(b.nombre));
  sel.innerHTML = '<option value="">Sin proveedor</option>' + provs.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}
export function abrirNuevoProductoPP() {
  _ppProductoEditandoId = null;
  ensureModalProductoPP(); _poblarSelectProveedorPP();
  $('pp-prod-descripcion').value = ''; $('pp-prod-codigo').value = ''; $('pp-prod-tipo-uso').value = 'normal'; $('pp-prod-costo-inicial').value = ''; $('pp-prod-proveedor').value = '';
  $('pp-prod-modal-titulo').textContent = 'Nuevo producto';
  abrirModal('modal-pp-producto');
}
export function abrirEditarProductoPP(id) {
  const p = getProductoPP(id); if (!p) return;
  _ppProductoEditandoId = id;
  ensureModalProductoPP(); _poblarSelectProveedorPP();
  $('pp-prod-descripcion').value = p.descripcion; $('pp-prod-codigo').value = p.codigoMonica || ''; $('pp-prod-tipo-uso').value = p.tipoUso || 'normal';
  $('pp-prod-proveedor').value = p.proveedorIdLocal || '';
  $('pp-prod-costo-inicial').value = '';
  $('pp-prod-modal-titulo').textContent = 'Editar producto';
  abrirModal('modal-pp-producto');
}
function ensureModalProductoPP() {
  if ($('modal-pp-producto')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-producto';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3 id="pp-prod-modal-titulo">Nuevo producto</h3><button class="btn-close" onclick="cerrarModal('modal-pp-producto')">×</button></div>
      <div class="modal-body">
        <label style="font-size:12px;font-weight:600;">Descripción</label>
        <input type="text" id="pp-prod-descripcion" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
        <label style="font-size:12px;font-weight:600;">Código Mónica (opcional)</label>
        <input type="text" id="pp-prod-codigo" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
        <label style="font-size:12px;font-weight:600;">Tipo de uso</label>
        <select id="pp-prod-tipo-uso" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
          <option value="normal">Normal</option>
          <option value="apertura">Apertura de servicio</option>
          <option value="tratamiento_piso">Tratamiento de piso</option>
          <option value="con_autorizacion">Con autorización</option>
        </select>
        <label style="font-size:12px;font-weight:600;">Proveedor</label>
        <select id="pp-prod-proveedor" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
          <option value="">Sin proveedor</option>
        </select>
        <label style="font-size:12px;font-weight:600;">Costo unitario inicial (opcional, vigente desde hoy)</label>
        <input type="number" id="pp-prod-costo-inicial" min="0" step="0.01" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-producto')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarProductoPP()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export function guardarProductoPP() {
  const descripcion = ($('pp-prod-descripcion').value || '').trim();
  if (!descripcion) { toast('⚠️ Falta la descripción'); return; }
  const codigoMonica = ($('pp-prod-codigo').value || '').trim();
  const tipoUso = $('pp-prod-tipo-uso').value;
  const proveedorIdLocal = $('pp-prod-proveedor').value || null;
  const costoInicial = parseFloat($('pp-prod-costo-inicial').value) || 0;
  let prod;
  if (_ppProductoEditandoId) {
    prod = getProductoPP(_ppProductoEditandoId); if (!prod) return;
    prod.descripcion = descripcion; prod.codigoMonica = codigoMonica; prod.tipoUso = tipoUso; prod.proveedorIdLocal = proveedorIdLocal;
  } else {
    prod = { id: _id('PPP'), descripcion, codigoMonica, tipoUso, proveedorIdLocal, anulado: false };
    if (!DB.ppProductos) DB.ppProductos = [];
    DB.ppProductos.push(prod);
  }
  supaSync('ppProductos', prod);
  if (costoInicial > 0) {
    const precio = { id: _id('PPR'), productoIdLocal: _idTrunc(prod.id), costoUnit: costoInicial, vigenciaDesde: hoyStr(), vigenciaHasta: null, anulado: false };
    if (!DB.ppPrecios) DB.ppPrecios = [];
    DB.ppPrecios.push(precio);
    supaSync('ppPrecios', precio);
  }
  cerrarModal('modal-pp-producto');
  renderCatalogoPP();
  toast(`✓ ${descripcion} guardado`);
}
export function anularProductoPP(id) {
  const p = getProductoPP(id); if (!p) return;
  p.anulado = true;
  supaSync('ppProductos', p);
  renderCatalogoPP();
  toast(`${p.descripcion} anulado del catálogo`);
}

// ========== PRECIOS (vigencia temporal, A.6) ==========

let _ppPrecioProductoId = null;
export function abrirNuevoPrecioPP(productoId) {
  const prod = getProductoPP(productoId); if (!prod) return;
  _ppPrecioProductoId = productoId;
  ensureModalPrecioPP();
  renderModalPrecioPP();
  $('pp-precio-nuevo-monto').value = '';
  $('pp-precio-nuevo-desde').value = hoyStr();
  abrirModal('modal-pp-precio');
}
function ensureModalPrecioPP() {
  if ($('modal-pp-precio')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-precio';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3 id="pp-precio-titulo">Precios</h3><button class="btn-close" onclick="cerrarModal('modal-pp-precio')">×</button></div>
      <div class="modal-body">
        <div id="pp-precio-historial" style="margin-bottom:14px;max-height:220px;overflow-y:auto;"></div>
        <div style="border-top:1px solid var(--borde);padding-top:12px;">
          <strong style="font-size:12.5px;">Nuevo aumento (cierra el precio vigente y arranca uno nuevo — no toca el pasado)</strong>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <input type="number" id="pp-precio-nuevo-monto" placeholder="Costo unitario" min="0" step="0.01" style="flex:1;min-width:120px;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);">
            <input type="date" id="pp-precio-nuevo-desde" style="padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);">
            <button class="btn btn-primary btn-sm" onclick="guardarNuevoPrecioPP()">Agregar</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-precio')">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalPrecioPP() {
  const prod = getProductoPP(_ppPrecioProductoId); if (!prod) return;
  $('pp-precio-titulo').textContent = `Precios — ${prod.descripcion}`;
  const precios = (DB.ppPrecios || []).filter(p => _idTrunc(p.productoIdLocal) === _idTrunc(prod.id) && !p.anulado).sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
  if (!precios.length) { $('pp-precio-historial').innerHTML = '<p style="font-size:12px;color:var(--texto-suave);">Sin precios cargados todavía.</p>'; return; }
  $('pp-precio-historial').innerHTML = precios.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--borde);font-size:12.5px;">
      <span>${_money(p.costoUnit)} <span style="color:var(--texto-suave);">— desde ${p.vigenciaDesde}${p.vigenciaHasta ? ` hasta ${p.vigenciaHasta}` : ' (vigente)'}</span></span>
      <button class="btn btn-xs" onclick="corregirPrecioPP('${p.id}')">✏️ Corregir</button>
    </div>`).join('');
}
export function guardarNuevoPrecioPP() {
  const prod = getProductoPP(_ppPrecioProductoId); if (!prod) return;
  const monto = parseFloat($('pp-precio-nuevo-monto').value);
  const desde = $('pp-precio-nuevo-desde').value;
  if (!monto || monto <= 0) { toast('⚠️ Falta el costo unitario'); return; }
  if (!desde) { toast('⚠️ Falta la fecha de vigencia'); return; }
  const vigenteActual = (DB.ppPrecios || []).find(p => _idTrunc(p.productoIdLocal) === _idTrunc(prod.id) && !p.anulado && !p.vigenciaHasta);
  if (vigenteActual) {
    const diaAntes = new Date(desde + 'T12:00:00'); diaAntes.setDate(diaAntes.getDate() - 1);
    vigenteActual.vigenciaHasta = diaAntes.toISOString().slice(0, 10);
    supaSync('ppPrecios', vigenteActual);
  }
  const nuevo = { id: _id('PPR'), productoIdLocal: _idTrunc(prod.id), costoUnit: monto, vigenciaDesde: desde, vigenciaHasta: null, anulado: false };
  if (!DB.ppPrecios) DB.ppPrecios = [];
  DB.ppPrecios.push(nuevo);
  supaSync('ppPrecios', nuevo);
  renderModalPrecioPP();
  renderCatalogoPP();
  toast(`✓ Nuevo precio de ${prod.descripcion} desde ${desde}`);
}
export function corregirPrecioPP(precioId) {
  const precio = (DB.ppPrecios || []).find(p => String(p.id) === String(precioId)); if (!precio) return;
  const nuevoMonto = prompt('Corregir costo unitario (error de carga, no un aumento):', precio.costoUnit);
  if (nuevoMonto == null) return;
  const n = parseFloat(nuevoMonto);
  if (isNaN(n) || n < 0) { toast('⚠️ Valor inválido'); return; }
  precio.costoUnit = n;
  supaSync('ppPrecios', precio);
  renderModalPrecioPP();
  renderCatalogoPP();
  toast('✓ Precio corregido');
}

// ========== PERÍODOS ==========
//
// Punto 8 del MD (31/08): un solo período EN CARGA ("abierto") a la vez.
// El siguiente se puede habilitar de antemano pero nace 'habilitado' —
// no genera pedidos todavía, no aparece para los supervisores — y recién
// pasa a 'abierto' (activarPeriodoPP) cuando se cierra el actual, sea a
// mano o por el cierre programado. El supervisor nunca elige el mes: "Mis
// pedidos" siempre muestra el único período 'abierto' que puede haber.

// sin_iniciar / borrador / confirmado — derivado, no es un estado propio
// en la base: "sin iniciar" es un borrador sin ítems todavía. Alimenta el
// desglose de Períodos (punto 8.4) y el filtro rápido.
function estadoDerivadoPedidoPP(pedido) {
  if (pedido.estado !== 'borrador') return 'confirmado';
  return itemsDePedido(pedido.id).length ? 'borrador' : 'sin_iniciar';
}

let _filtroDesglosePeriodo = '';
export function filtrarDesglosePeriodoPP(valor) { _filtroDesglosePeriodo = _filtroDesglosePeriodo === valor ? '' : valor; renderPeriodosPP(); }

export function renderPeriodosPP() {
  const tbody = $('tbody-pp-periodos');
  const rows = (DB.ppPeriodos || []).filter(p => !p.anulado).sort((a, b) => b.mes.localeCompare(a.mes));
  const abierto = rows.find(p => p.estado === 'abierto');

  // KPIs del período abierto (punto 8.4: desglose sin iniciar/borrador/confirmados)
  if (abierto) {
    const pedidosAbierto = (DB.ppPedidos || []).filter(x => !x.anulado && _idTrunc(x.periodoIdLocal) === _idTrunc(abierto.id));
    const cont = { sin_iniciar: 0, borrador: 0, confirmado: 0 };
    pedidosAbierto.forEach(p => { cont[estadoDerivadoPedidoPP(p)]++; });
    const setKpi = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setKpi('pp-per-k-confirmados', cont.confirmado);
    setKpi('pp-per-k-borradores', cont.borrador);
    setKpi('pp-per-k-siniciar', cont.sin_iniciar);
    setKpi('pp-per-k-observados', pedidosAbierto.filter(p => p.estado === 'observado').length);
  }

  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin períodos habilitados todavía.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const pedidosDelPeriodo = (DB.ppPedidos || []).filter(x => !x.anulado && _idTrunc(x.periodoIdLocal) === _idTrunc(p.id));
    let filtrados = pedidosDelPeriodo;
    if (p.estado === 'abierto' && _filtroDesglosePeriodo) filtrados = pedidosDelPeriodo.filter(x => estadoDerivadoPedidoPP(x) === _filtroDesglosePeriodo);
    const confirmados = pedidosDelPeriodo.filter(x => estadoDerivadoPedidoPP(x) === 'confirmado').length;
    const cierreTxt = p.cierreProgramado ? new Date(p.cierreProgramado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:600;">${p.mes}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeEstadoPeriodoPP(p.estado)}${p.estado === 'habilitado' ? '<div style="font-size:10px;color:var(--texto-suave);">abre solo al cerrar el período actual</div>' : ''}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${cierreTxt}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${filtrados.length}${p.estado === 'abierto' && _filtroDesglosePeriodo ? ' <span style="color:var(--texto-suave);">(filtrado)</span>' : ''}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${confirmados}/${pedidosDelPeriodo.length}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        ${p.estado === 'abierto' ? `<button class="btn btn-xs btn-secondary" onclick="cerrarPeriodoPP('${p.id}')">Cerrar período</button>` : '—'}
      </td>
    </tr>`;
  }).join('');
}

export function abrirPeriodoPP() {
  const mes = ($('pp-periodo-nuevo') || { value: '' }).value;
  const cierreFecha = ($('pp-periodo-cierre') || { value: '' }).value; // datetime-local
  if (!mes) { toast('⚠️ Elegí el mes'); return; }
  if (!cierreFecha) { toast('⚠️ Elegí la fecha y hora de cierre de la ventana'); return; }
  if ((DB.ppPeriodos || []).some(p => p.mes === mes && !p.anulado)) { toast('⚠️ Ese período ya existe'); return; }

  // Un solo período EN CARGA a la vez: si ya hay uno 'abierto', el nuevo
  // nace 'habilitado' — activarPeriodoPP() lo abre solo cuando el actual cierra.
  const hayAbierto = (DB.ppPeriodos || []).some(p => !p.anulado && p.estado === 'abierto');
  const periodo = {
    id: _id('PPPER'), mes, estado: hayAbierto ? 'habilitado' : 'abierto',
    cierreProgramado: new Date(cierreFecha).toISOString(), recordatorioEnviado: false,
    abiertoPor: currentUser?.nombre || '', abiertoEn: new Date().toISOString(), cerradoEn: null, anulado: false,
  };
  if (!DB.ppPeriodos) DB.ppPeriodos = [];
  DB.ppPeriodos.push(periodo);
  supaSync('ppPeriodos', periodo);

  if ($('pp-periodo-nuevo')) $('pp-periodo-nuevo').value = '';
  if ($('pp-periodo-cierre')) $('pp-periodo-cierre').value = '';
  poblarSelectsPeriodoPP();
  if (hayAbierto) {
    renderPeriodosPP();
    toast(`✓ Período ${mes} HABILITADO — abre solo cuando cierre el período actual`);
  } else {
    activarPeriodoPP(periodo).then(() => renderPeriodosPP());
  }
}

// Genera un pedido en Borrador para cada servicio Operativo (§3 del
// diseño original) y deja el período como 'abierto'. Se separó de
// abrirPeriodoPP (punto 8.1) porque un período 'habilitado' de antemano
// recién genera sus pedidos cuando REALMENTE arranca — la facturación
// neta que se congela por pedido tiene que ser la de ese momento, no la
// de cuando se lo programó con semanas de anticipación.
async function activarPeriodoPP(periodo) {
  periodo.estado = 'abierto';
  await supaSync('ppPeriodos', periodo);
  const activos = (DB.objetivos || []).filter(o => o.estado === 'Operativo');
  let creados = 0;
  for (const o of activos) {
    const facturacionNeta = (typeof window !== 'undefined' && window.calcularFacturacionMensualObjetivo) ? (window.calcularFacturacionMensualObjetivo(o) || 0) : 0;
    const supervisor = o.supervisorAsignado || getSupervisorDeCodigo(o.codigo) || '';
    const pedido = {
      id: _id('PPPED'), periodoIdLocal: _idTrunc(periodo.id), servicioCodigo: o.codigo,
      facturacionNeta, porcentajeTope: 0.06, estado: 'borrador', tipoPedido: 'mensual',
      supervisor, anulado: false,
    };
    if (!DB.ppPedidos) DB.ppPedidos = [];
    DB.ppPedidos.push(pedido);
    await supaSync('ppPedidos', pedido);
    creados++;
  }
  toast(`✓ Período ${periodo.mes} ABIERTO — ${creados} pedido(s) de servicio creado(s)`);
  if (!activos.length) toast('⚠️ No hay servicios en estado Operativo en Objetivos — no se creó ningún pedido', 8000);
}

// Cierre (manual o automático — ver chequearCierrePeriodosPP). Punto 8.2 y
// 8.3: al cierre, los borradores SE CONFIRMAN AUTOMÁTICAMENTE tal como
// estén (misma regla de ruteo que un supervisor confirmando a mano — ver
// confirmarPedidoPP), con notificación a cada uno. El botón manual pide
// confirmación mostrando cuántos borradores va a confirmar y cuántos
// quedaron sin iniciar (punto 8.3 — "Agosto cerró 0/164 y nadie se enteró").
export async function cerrarPeriodoPP(id, { automatico = false } = {}) {
  const periodo = getPeriodoPP(id); if (!periodo) return;
  if (periodo.estado !== 'abierto') { toast('Ya está cerrado'); return; }
  const pedidos = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodo.id));
  const borradores = pedidos.filter(p => p.estado === 'borrador');
  const sinIniciar = borradores.filter(p => !itemsDePedido(p.id).length).length;

  if (!automatico) {
    const ok = confirm(`Cerrar el período ${periodo.mes}:\n\n• ${borradores.length} pedido(s) en borrador se van a CONFIRMAR automáticamente tal como estén (${sinIniciar} de ellos sin ningún producto cargado).\n• Cada supervisor recibe una notificación.\n\n¿Confirmás el cierre?`);
    if (!ok) return;
  }

  for (const p of borradores) {
    await confirmarPedidoPP(p.id, { silencioso: true, motivoNotif: 'cierre automático del período' });
  }
  periodo.estado = 'cerrado';
  periodo.cerradoEn = new Date().toISOString();
  await supaSync('ppPeriodos', periodo);

  // Activa el próximo período 'habilitado' (punto 8.1), si hay uno.
  const siguiente = (DB.ppPeriodos || []).filter(p => !p.anulado && p.estado === 'habilitado').sort((a, b) => a.mes.localeCompare(b.mes))[0];
  if (siguiente) await activarPeriodoPP(siguiente);

  poblarSelectsPeriodoPP();
  renderPeriodosPP();
  toast(`✓ Período ${periodo.mes} cerrado — ${borradores.length} borrador(es) confirmado(s) automáticamente`);
}

// Check-on-load (mismo patrón que chequearAlertas24hs de Uniformes):
// cierre automático si se pasó la fecha programada, y recordatorio único
// 24 hs antes a los supervisores con pedidos sin iniciar o en borrador.
export async function chequearCierrePeriodosPP() {
  const ahora = new Date();
  for (const periodo of (DB.ppPeriodos || [])) {
    if (periodo.anulado || periodo.estado !== 'abierto' || !periodo.cierreProgramado) continue;
    const cierre = new Date(periodo.cierreProgramado);
    if (ahora >= cierre) {
      await cerrarPeriodoPP(periodo.id, { automatico: true });
      continue;
    }
    const horasRestantes = (cierre - ahora) / 3_600_000;
    if (!periodo.recordatorioEnviado && horasRestantes > 0 && horasRestantes <= 24) {
      const pendientes = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodo.id) && p.estado === 'borrador');
      const supervisores = [...new Set(pendientes.map(p => p.supervisor).filter(Boolean))];
      for (const nombre of supervisores) {
        await crearNotificacion({
          tipo: 'pp_recordatorio_cierre', entidadTipo: 'pedido_productos', entidadIdLocal: _idTrunc(periodo.id),
          destinatarioNombre: nombre,
          mensaje: `⏰ La ventana de pedido de productos de ${periodo.mes} cierra en menos de 24 hs. Los borradores sin confirmar se confirman automáticamente tal como estén.`,
        });
      }
      periodo.recordatorioEnviado = true;
      await supaSync('ppPeriodos', periodo);
    }
  }
}

// ========== MIS PEDIDOS (Supervisor) ==========
//
// Punto 8.1: el supervisor nunca elige el mes — siempre es el único
// período 'abierto' que puede haber. El selector de período de este tab
// quedó de solo informativo (ver index.html).
function periodoAbiertoPP() { return (DB.ppPeriodos || []).find(p => !p.anulado && p.estado === 'abierto') || null; }

export function renderMisPedidosPP() {
  const tbody = $('tbody-pp-mispedidos'); if (!tbody) return;
  const labelPeriodo = $('pp-sup-periodo-label');
  const periodo = periodoAbiertoPP();
  if (labelPeriodo) labelPeriodo.textContent = periodo ? `Ventana ${periodo.mes} — ABIERTA` : 'No hay ninguna ventana abierta';
  if (!periodo) { tbody.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay ninguna ventana de pedido abierta en este momento.</td></tr>'; return; }
  // Unificado con serviciosDeSupervisor() (ticket "vinculación automática",
  // 26/08): antes solo miraba servicios_supervisor con === estricto, así
  // que un supervisor con objetivos pero sin fila en la tabla puente (o
  // con el nombre en otra capitalización) veía "sin servicios" aunque sí
  // tuviera. Mismo criterio ahora en los 3 módulos que filtran por "mis
  // servicios" (Liquidación de horas, Pedidos de personal, este).
  const misCodigos = new Set(serviciosDeSupervisor(currentUser?.nombre || ''));
  const rows = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodo.id) && misCodigos.has(p.servicioCodigo));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay servicios tuyos en este período. Si creés que es un error, pedile a RRHH que revise tu usuario en Configuración → Servicios.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
    const total = totalPedidoPP(p.id);
    const presupuesto = presupuestoDelMesPP(p);
    const pct = presupuesto > 0 ? (total / presupuesto * 100) : 0;
    const excede = presupuesto > 0 && total > presupuesto;
    const pagan = esPaganPP(p);
    const editable = ['borrador', 'observado'].includes(p.estado);
    return `<tr${excede ? ' style="background:var(--rojo-suave);"' : ''}>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${obj ? obj.nombre : p.servicioCodigo}<br><span style="font-size:10px;color:var(--texto-suave);">${p.servicioCodigo}</span></td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><span class="badge" style="background:${pagan ? '#16a34a' : '#6b7280'};color:white;">${pagan ? 'PAGAN' : 'NO PAGAN'}</span></td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeEstadoPedidoPP(p.estado)}${excede ? ' <span class="badge" style="background:#dc2626;color:white;">EXCEDE</span>' : ''}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(total)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;${excede ? 'color:var(--rojo);font-weight:600;' : ''}">${presupuesto > 0 ? pct.toFixed(1) + '%' : '—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;white-space:nowrap;">
        ${editable
          ? `<button class="btn btn-xs btn-primary" onclick="abrirCargaPedidoPP('${p.id}')">Cargar</button>`
          : `<button class="btn btn-xs" onclick="abrirCargaPedidoPP('${p.id}')">Ver</button>`}
      </td>
    </tr>`;
  }).join('');
}

// ========== "MES ANTERIOR" (punto 3) + REPETIR PEDIDO (punto 1, botón) ==========

function periodoAnteriorDePP(periodo) {
  if (!periodo) return null;
  return (DB.ppPeriodos || []).filter(p => !p.anulado && p.mes < periodo.mes).sort((a, b) => b.mes.localeCompare(a.mes))[0] || null;
}
function pedidoMesAnteriorPP(pedido) {
  const periodo = getPeriodoPP(pedido.periodoIdLocal);
  const anterior = periodoAnteriorDePP(periodo);
  if (!anterior) return null;
  return (DB.ppPedidos || []).find(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(anterior.id) && p.servicioCodigo === pedido.servicioCodigo) || null;
}
// productoId (truncado) → cantidad efectiva (autorizada si la hubo, si no
// solicitada) del mes anterior. Es la cantidad que REALMENTE se pidió/
// aprobó, no un valor teórico.
function cantidadesMesAnteriorPP(pedido) {
  const pedidoAnt = pedidoMesAnteriorPP(pedido);
  if (!pedidoAnt) return new Map();
  return new Map(itemsDePedido(pedidoAnt.id).map(i => [_idTrunc(i.productoIdLocal), cantEfectiva(i)]));
}

let _ppPedidoModalId = null;
let _ppCargaFiltro = { buscar: '', tipo: '', soloCargados: false };
export function abrirCargaPedidoPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido) return;
  _ppPedidoModalId = pedidoId;
  _ppCargaFiltro = { buscar: '', tipo: '', soloCargados: false };
  ensureModalCargaPP();
  renderModalCargaPP();
  abrirModal('modal-pp-carga');
}
// Punto 1 del MD: buscador + filtro de tipo de uso + tilde "solo lo
// cargado" (con contador), cabecera de la tabla fija al scrollear (el
// catálogo tiene 1.000+ productos — sin esto es imposible de usar).
function ensureModalCargaPP() {
  if ($('modal-pp-carga')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-carga';
  m.innerHTML = `
    <div class="modal" style="max-width:820px;">
      <div class="modal-header"><h3 id="pp-carga-titulo">Pedido de productos</h3><button class="btn-close" onclick="cerrarModal('modal-pp-carga')">×</button></div>
      <div class="modal-body">
        <div id="pp-carga-resumen" style="margin-bottom:14px;"></div>
        <div id="pp-carga-observado" style="display:none;margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="pp-carga-buscar" placeholder="🔍 Buscar por nombre o código..." oninput="filtrarCargaPedidoPP()" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);">
          <select id="pp-carga-filtro-tipo" onchange="filtrarCargaPedidoPP()" style="padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);">
            <option value="">Todos los tipos de uso</option>
            <option value="normal">Normal</option>
            <option value="apertura">Apertura de servicio</option>
            <option value="tratamiento_piso">Tratamiento de piso</option>
            <option value="con_autorizacion">Con autorización</option>
          </select>
          <label style="font-size:12.5px;display:flex;align-items:center;gap:5px;white-space:nowrap;">
            <input type="checkbox" id="pp-carga-solo-cargados" onchange="filtrarCargaPedidoPP()"> solo lo cargado
          </label>
          <span id="pp-carga-contador" style="font-size:11.5px;color:var(--texto-suave);white-space:nowrap;"></span>
        </div>
        <div style="max-height:420px;overflow-y:auto;position:relative;">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr style="background:#374151;color:white;">
              <th style="padding:6px 10px;text-align:left;position:sticky;top:0;background:#374151;z-index:1;">Producto</th>
              <th style="padding:6px 8px;text-align:center;position:sticky;top:0;background:#374151;z-index:1;">Tipo de uso</th>
              <th style="padding:6px 8px;text-align:right;position:sticky;top:0;background:#374151;z-index:1;">Costo unit.</th>
              <th style="padding:6px 8px;text-align:center;position:sticky;top:0;background:#374151;z-index:1;">Mes anterior</th>
              <th style="padding:6px 8px;text-align:center;width:110px;position:sticky;top:0;background:#374151;z-index:1;">Cantidad</th>
              <th style="padding:6px 8px;text-align:right;position:sticky;top:0;background:#374151;z-index:1;">Subtotal</th>
            </tr></thead>
            <tbody id="pp-carga-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="pp-carga-btn-repetir" onclick="repetirPedidoMesAnteriorPP()">↺ Repetir pedido del mes anterior</button>
        <button class="btn btn-secondary" id="pp-carga-btn-guardar" onclick="guardarBorradorPedidoPP()">💾 Guardar</button>
        <button class="btn btn-primary" id="pp-carga-btn-confirmar" onclick="confirmarPedidoPP()">✔ Confirmar pedido</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export function filtrarCargaPedidoPP() {
  _ppCargaFiltro = {
    buscar: (($('pp-carga-buscar') || {}).value || '').toLowerCase(),
    tipo: ($('pp-carga-filtro-tipo') || {}).value || '',
    soloCargados: !!($('pp-carga-solo-cargados') || {}).checked,
  };
  renderModalCargaPP();
}
function renderModalCargaPP() {
  const pedido = getPedidoPP(_ppPedidoModalId); if (!pedido) return;
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  const periodo = getPeriodoPP(pedido.periodoIdLocal);
  const editable = ['borrador', 'observado'].includes(pedido.estado);
  $('pp-carga-titulo').textContent = `${obj ? obj.nombre : pedido.servicioCodigo}${periodo ? ' — ' + periodo.mes : ''}`;

  // Punto 9: si el auditor devolvió el pedido con propuesta, se ve arriba
  // de todo — motivo + comentario obligatorios que cargó el auditor.
  const cajaObservado = $('pp-carga-observado');
  if (pedido.estado === 'observado') {
    cajaObservado.style.display = 'block';
    cajaObservado.innerHTML = `<div style="padding:10px 14px;border-radius:var(--radio);background:#fff3e0;border:1px solid #ffcc80;font-size:12.5px;">
      <b>↩ Devuelto por el auditor (${pedido.observadoPor || '—'}, ${pedido.observadoEn ? new Date(pedido.observadoEn).toLocaleDateString('es-AR') : ''})</b><br>
      Motivo: ${pedido.observadoMotivo || '—'}${pedido.observadoComentario ? ' — ' + pedido.observadoComentario : ''}
      <div style="margin-top:6px;"><button class="btn btn-xs btn-secondary" onclick="aceptarPropuestaAuditorPP()">Aceptar la propuesta del auditor</button> <span style="color:var(--texto-suave);">o corregí las cantidades abajo y volvé a confirmar</span></div>
    </div>`;
  } else {
    cajaObservado.style.display = 'none';
  }

  let productos = (DB.ppProductos || []).filter(p => !p.anulado);
  const items = itemsDePedido(pedido.id);
  const porProducto = new Map(items.map(i => [_idTrunc(i.productoIdLocal), i]));
  const cantsAnterior = cantidadesMesAnteriorPP(pedido);

  if (_ppCargaFiltro.buscar) productos = productos.filter(p => p.descripcion.toLowerCase().includes(_ppCargaFiltro.buscar) || (p.codigoMonica || '').toLowerCase().includes(_ppCargaFiltro.buscar));
  if (_ppCargaFiltro.tipo) productos = productos.filter(p => p.tipoUso === _ppCargaFiltro.tipo);
  if (_ppCargaFiltro.soloCargados) productos = productos.filter(p => (porProducto.get(_idTrunc(p.id))?.cantSolicitada || 0) > 0);
  productos.sort((a, b) => (a.tipoUso || '').localeCompare(b.tipoUso || '') || a.descripcion.localeCompare(b.descripcion));

  const totalCatalogo = (DB.ppProductos || []).filter(p => !p.anulado).length;
  const cantCargados = (DB.ppProductos || []).filter(p => !p.anulado && (porProducto.get(_idTrunc(p.id))?.cantSolicitada || 0) > 0).length;
  $('pp-carga-contador').textContent = `${cantCargados} de ${totalCatalogo} productos cargados`;

  $('pp-carga-tbody').innerHTML = productos.map(p => {
    const item = porProducto.get(_idTrunc(p.id));
    const costo = precioVigente(p.id);
    const cant = item ? item.cantSolicitada : 0;
    const subtotal = cant * costo;
    const mesAnt = cantsAnterior.get(_idTrunc(p.id));
    return `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${p.descripcion}${p.codigoMonica ? ` <span style="color:var(--texto-suave);font-size:10.5px;">(${p.codigoMonica})</span>` : ''}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">${badgeTipoUsoPP(p.tipoUso)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${costo ? _money(costo) : '<span style="color:var(--rojo);">sin precio</span>'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;color:var(--texto-suave);">${mesAnt != null ? mesAnt : '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">
        <input type="number" min="0" step="1" value="${cant || ''}" ${editable ? '' : 'disabled'} style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;text-align:center;"
          onchange="guardarItemPedidoPP('${pedido.id}','${p.id}',this.value)">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(subtotal)}</td>
    </tr>`;
  }).join('');
  $('pp-carga-resumen').innerHTML = renderSemaforoHTML(pedido);

  const btnRepetir = $('pp-carga-btn-repetir'), btnGuardar = $('pp-carga-btn-guardar'), btnConfirmar = $('pp-carga-btn-confirmar');
  if (btnRepetir) btnRepetir.style.display = editable ? '' : 'none';
  if (btnGuardar) btnGuardar.style.display = editable ? '' : 'none';
  if (btnConfirmar) btnConfirmar.style.display = editable ? '' : 'none';
}
export function guardarItemPedidoPP(pedidoId, productoId, valor) {
  const pedido = getPedidoPP(pedidoId); if (!pedido || !['borrador', 'observado'].includes(pedido.estado)) { toast('⚠️ Este pedido ya no se puede editar'); return; }
  _guardarItemPedidoInterno(pedidoId, productoId, parseFloat(valor) || 0);
  renderModalCargaPP();
}
// Escritura sin re-render — la usa guardarItemPedidoPP (1 ítem, 1 render)
// y repetirPedidoMesAnteriorPP (N ítems, 1 solo render al final).
function _guardarItemPedidoInterno(pedidoId, productoId, cant) {
  let item = (DB.ppItems || []).find(i => _idTrunc(i.pedidoIdLocal) === _idTrunc(pedidoId) && _idTrunc(i.productoIdLocal) === _idTrunc(productoId) && !i.anulado);
  if (!item) {
    if (cant <= 0) return;
    item = { id: _id('PPI'), pedidoIdLocal: _idTrunc(pedidoId), productoIdLocal: _idTrunc(productoId), cantSolicitada: cant, cantAutorizada: null, costoCongelado: 0, anulado: false };
    if (!DB.ppItems) DB.ppItems = [];
    DB.ppItems.push(item);
  } else {
    item.cantSolicitada = cant;
  }
  supaSync('ppItems', item);
}
// Botón "↺ Repetir pedido del mes anterior" (punto 1): carga las
// cantidades REALMENTE pedidas/aprobadas el mes pasado — el supervisor
// las revisa y ajusta desde ahí, no arranca de cero.
export function repetirPedidoMesAnteriorPP() {
  const pedido = getPedidoPP(_ppPedidoModalId); if (!pedido) return;
  const cants = cantidadesMesAnteriorPP(pedido);
  if (!cants.size) { toast('⚠️ No hay pedido del mes anterior para este servicio'); return; }
  for (const [productoIdTrunc, cant] of cants) _guardarItemPedidoInterno(pedido.id, productoIdTrunc, cant);
  renderModalCargaPP();
  toast(`✓ Se cargaron las cantidades de ${cants.size} producto(s) del mes anterior — revisá y ajustá`);
}
// "Aceptar la propuesta del auditor" (punto 9, dentro de OBSERVADO): pisa
// cantSolicitada con lo que el auditor había puesto en cantAutorizada.
export function aceptarPropuestaAuditorPP() {
  const pedido = getPedidoPP(_ppPedidoModalId); if (!pedido || pedido.estado !== 'observado') return;
  itemsDePedido(pedido.id).forEach(i => {
    if (i.cantAutorizada != null) { i.cantSolicitada = i.cantAutorizada; supaSync('ppItems', i); }
  });
  renderModalCargaPP();
  toast('✓ Propuesta del auditor aplicada — confirmá el pedido para re-enviarlo');
}
// "💾 Guardar" (punto 4): cada cambio ya se guarda solo al tipear
// (guardarItemPedidoPP) — este botón es la confirmación explícita de que
// "quedó guardado, seguís después" y cierra la ventana. No cambia el
// estado: sigue en BORRADOR (o OBSERVADO) para retomar cuando quieras.
export function guardarBorradorPedidoPP() {
  cerrarModal('modal-pp-carga');
  renderMisPedidosPP();
  toast('✓ Guardado como borrador — podés retomarlo cuando quieras');
}
// "✔ Confirmar pedido" (punto 4, reemplaza "Cerrar"): congela costos,
// aplica la regla de ruteo (punto 9 — PAGAN + dentro de presupuesto + sin
// excepciones → directo a Compras; si no, al auditor) y ya NO se edita
// (salvo que el auditor lo devuelva OBSERVADO). Reutilizada por el cierre
// automático de período (silencioso=true: sin toast/cierre de modal
// individual, la notificación cambia de texto).
export async function confirmarPedidoPP(pedidoId, { silencioso = false, motivoNotif = null } = {}) {
  const id = pedidoId || _ppPedidoModalId;
  const pedido = getPedidoPP(id); if (!pedido || !['borrador', 'observado'].includes(pedido.estado)) return;
  const periodo = getPeriodoPP(pedido.periodoIdLocal);
  if (periodo && periodo.estado === 'cerrado' && !silencioso) { toast('⚠️ El período ya está cerrado'); return; }
  const items = itemsDePedido(pedido.id);
  if (!items.length) {
    if (!silencioso) { toast('⚠️ Cargá al menos un producto antes de confirmar'); return; }
    // Cierre automático de período: un pedido sin iniciar igual se
    // confirma (punto 8.2 — "tal como estén"), aunque quede en $0.
  }
  // Se congela el costo vigente de cada ítem al confirmar (§4.5) — de acá
  // en adelante el total del pedido no se mueve aunque cambie el precio.
  for (const i of items) { i.costoCongelado = precioVigente(i.productoIdLocal); await supaSync('ppItems', i); }

  pedido.confirmadoPor = currentUser?.nombre || (silencioso ? 'Sistema (cierre automático)' : '');
  pedido.confirmadoEn = new Date().toISOString();
  const motivos = motivosRevisionPP(pedido);
  pedido.estado = motivos.length ? 'confirmado_revision' : 'confirmado';
  // Sale del estado OBSERVADO al re-confirmar: limpia la propuesta vieja
  // para que no quede colgada si este pedido se observa de nuevo más adelante.
  pedido.observadoPor = null; pedido.observadoEn = null; pedido.observadoMotivo = null; pedido.observadoComentario = null;
  await supaSync('ppPedidos', pedido);

  if (pedido.supervisor) {
    await crearNotificacion({
      tipo: 'pp_confirmado', entidadTipo: 'pedido_productos', entidadIdLocal: _idTrunc(pedido.id),
      destinatarioNombre: pedido.supervisor,
      mensaje: motivoNotif
        ? `El pedido de ${pedido.servicioCodigo} se confirmó automáticamente (${motivoNotif}).`
        : `Tu pedido de ${pedido.servicioCodigo} quedó ${pedido.estado === 'confirmado' ? 'CONFIRMADO — pasa directo a Compras' : 'CONFIRMADO — en revisión del auditor'}.`,
    });
  }

  if (!silencioso) {
    cerrarModal('modal-pp-carga');
    renderMisPedidosPP();
    toast(pedido.estado === 'confirmado' ? '✓ Pedido confirmado — pasa directo a Compras' : '✓ Pedido confirmado — pasa por revisión del auditor');
  }
}

// ========== BANDEJA DEL AUDITOR (punto 9 — antes "Auditoría", que en todo
// el resto del sistema es el registro de acciones, no esta pantalla) ==========
//
// Regla de qué cae acá (definida con Lautaro, punto 9.2):
//   - TODOS los pedidos NO PAGAN (costo de la cooperativa, se revisan
//     siempre, aun dentro del presupuesto).
//   - De los PAGAN, solo las excepciones (motivosRevisionPP): excede
//     presupuesto, con autorización, fuera de ventana, fuera de estándar.
//   - PAGAN sin ninguna excepción → confirmarPedidoPP() ya los mandó
//     directo a 'confirmado' — no pasan por acá, se listan aparte para
//     control ("Pasaron directo a Compras").

// Colores 1:1 con el mockup (chip c-gris/c-rojo/c-viol/c-nara/c-teal).
const COLOR_CHIP_MOTIVO = { 'c-gris': ['#eceef3', '#5a6478'], 'c-rojo': ['#fddede', '#a11c1c'], 'c-viol': ['#ece0fa', '#5b2ca0'], 'c-nara': ['#ffe8d6', '#a04a08'], 'c-teal': ['#d5f0f2', '#0b6470'] };
function chipsMotivosPP(pedido) {
  return motivosRevisionPP(pedido).map(m => {
    const [bg, fg] = COLOR_CHIP_MOTIVO[m.chip] || COLOR_CHIP_MOTIVO['c-gris'];
    return `<span class="badge" style="background:${bg};color:${fg};">${m.label}${m.pct ? ` <b>${m.pct.toFixed(0)}%</b>` : ''}</span>`;
  }).join(' ');
}

export function renderAuditoriaPP() {
  const tbodyPend = $('tbody-pp-auditoria');
  const periodoId = ($('pp-aud-periodo-sel') || { value: '' }).value;
  if (!periodoId) {
    if (tbodyPend) tbodyPend.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</td></tr>';
    return;
  }
  const todos = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId));

  const pendientes = todos.filter(p => ['confirmado_revision', 'observado'].includes(p.estado));
  if (tbodyPend) {
    tbodyPend.innerHTML = pendientes.length ? pendientes.map(p => {
      const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
      const total = totalPedidoPP(p.id);
      const presupuesto = presupuestoDelMesPP(p);
      const pct = presupuesto > 0 ? (total / presupuesto * 100) : 0;
      return `<tr class="clk" onclick="abrirAuditoriaPedidoPP('${p.id}')">
        <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${obj ? obj.nombre : p.servicioCodigo} ${badgeEstadoPedidoPP(p.estado)}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);">${p.supervisor || '—'}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);">${chipsMotivosPP(p)}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(presupuesto)}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(total)}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;${pct > 100 ? 'color:var(--rojo);font-weight:600;' : ''}">${presupuesto > 0 ? pct.toFixed(0) + '%' : '—'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">Nada pendiente de revisión en este período 🎉</td></tr>';
  }

  const directos = todos.filter(p => p.estado !== 'borrador' && !['confirmado_revision', 'observado'].includes(p.estado) && p.estado !== 'confirmado');
  const pasaronDirecto = todos.filter(p => p.estado === 'confirmado');
  const tbodyDirecto = $('tbody-pp-auditoria-directo');
  if (tbodyDirecto) {
    tbodyDirecto.innerHTML = pasaronDirecto.length ? pasaronDirecto.map(p => {
      const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
      return `<tr>
        <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${obj ? obj.nombre : p.servicioCodigo}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);color:var(--texto-suave);">${p.supervisor || '—'}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(presupuestoDelMesPP(p))}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(totalPedidoPP(p.id))}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);color:var(--texto-suave);font-size:11.5px;">${p.confirmadoEn ? new Date(p.confirmadoEn).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} · sin intervención del auditor</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--texto-muy-suave);">Ninguno todavía</td></tr>';
  }
}

let _ppAuditoriaModalId = null;
export function abrirAuditoriaPedidoPP(pedidoId) {
  _ppAuditoriaModalId = pedidoId;
  ensureModalAuditoriaPP();
  renderModalAuditoriaPP();
  abrirModal('modal-pp-auditoria');
}
function ensureModalAuditoriaPP() {
  if ($('modal-pp-auditoria')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-auditoria';
  m.innerHTML = `
    <div class="modal" style="max-width:820px;">
      <div class="modal-header"><h3 id="pp-aud-titulo">Revisión de pedido</h3><button class="btn-close" onclick="cerrarModal('modal-pp-auditoria')">×</button></div>
      <div class="modal-body">
        <div id="pp-aud-resumen" style="margin-bottom:14px;"></div>
        <div id="pp-aud-motivos" style="margin-bottom:14px;"></div>
        <div style="max-height:360px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr style="background:#374151;color:white;">
              <th style="padding:6px 10px;text-align:left;">Producto</th>
              <th style="padding:6px 8px;text-align:center;">Pedido</th>
              <th style="padding:6px 8px;text-align:center;width:110px;">Autorizado</th>
              <th style="padding:6px 8px;text-align:right;">Costo cong.</th>
              <th style="padding:6px 8px;text-align:right;">Subtotal</th>
            </tr></thead>
            <tbody id="pp-aud-tbody"></tbody>
          </table>
        </div>
        <div id="pp-aud-devolver-box" style="display:none;margin-top:14px;padding:12px 14px;border-radius:var(--radio);background:#fff3e0;border:1px solid #ffcc80;">
          <div style="font-weight:600;font-size:12.5px;margin-bottom:8px;">↩ Devolver con propuesta al supervisor</div>
          <label style="font-size:12px;">Motivo *</label>
          <select id="pp-aud-dev-motivo" style="width:100%;padding:6px 8px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 8px;">
            <option value="">— Seleccionar —</option>
            <option>EXCEDE PRESUPUESTO</option><option>CON AUTORIZACIÓN</option>
            <option>FUERA DE VENTANA</option><option>FUERA DE ESTÁNDAR</option><option>Otro</option>
          </select>
          <label style="font-size:12px;">Comentario *</label>
          <textarea id="pp-aud-dev-comentario" rows="2" style="width:100%;padding:6px 8px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;" placeholder="Ej: sacar 2 cajas de papel toalla — 108% del presupuesto"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="btn" style="background:#c96a10;color:white;" onclick="confirmarDevolverConPropuestaPP()">Confirmar devolución</button>
            <button class="btn btn-secondary" onclick="document.getElementById('pp-aud-devolver-box').style.display='none'">Cancelar</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-auditoria')">Cerrar</button>
        <button class="btn" style="background:#c96a10;color:white;" id="pp-aud-btn-devolver" onclick="document.getElementById('pp-aud-devolver-box').style.display='block'">↩ Devolver con propuesta</button>
        <button class="btn btn-primary" id="pp-aud-btn-autorizar" onclick="">✔ Aprobar pedido</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalAuditoriaPP() {
  const pedido = getPedidoPP(_ppAuditoriaModalId); if (!pedido) return;
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  const editable = ['confirmado_revision', 'observado'].includes(pedido.estado);
  $('pp-aud-titulo').textContent = `${obj ? obj.nombre : pedido.servicioCodigo} — supervisor: ${pedido.supervisor || '—'}`;
  $('pp-aud-motivos').innerHTML = chipsMotivosPP(pedido) || '<span style="color:var(--texto-suave);font-size:12px;">Sin excepciones — llegó acá por otro motivo (ver estado).</span>';
  const dev = $('pp-aud-devolver-box'); if (dev) dev.style.display = 'none';
  const items = itemsDePedido(pedido.id).map(i => ({ ...i, _prod: getProductoPP(i.productoIdLocal) })).filter(i => i._prod)
    .sort((a, b) => a._prod.descripcion.localeCompare(b._prod.descripcion));
  $('pp-aud-tbody').innerHTML = items.map(i => {
    const autorizada = i.cantAutorizada != null ? i.cantAutorizada : i.cantSolicitada;
    const subtotal = autorizada * (i.costoCongelado || 0);
    const ajustado = i.ajustadoPor ? `<div style="font-size:10px;color:var(--rojo);">antes: ${i.cantAntesAjuste} · ${i.ajustadoPor}</div>` : '';
    return `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${i._prod.descripcion}${ajustado}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">${i.cantSolicitada}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">
        <input type="number" min="0" step="1" value="${autorizada}" ${editable ? '' : 'disabled'} style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;text-align:center;"
          onchange="ajustarCantidadAuditoriaPP('${i.id}',this.value)">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(i.costoCongelado || 0)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(subtotal)}</td>
    </tr>`;
  }).join('');
  $('pp-aud-resumen').innerHTML = renderSemaforoHTML(pedido);
  const btnAutorizar = $('pp-aud-btn-autorizar'), btnDevolver = $('pp-aud-btn-devolver');
  if (btnAutorizar) { btnAutorizar.setAttribute('onclick', `aprobarPedidoPP('${pedido.id}')`); btnAutorizar.style.display = editable ? 'inline-flex' : 'none'; }
  if (btnDevolver) btnDevolver.style.display = editable ? 'inline-flex' : 'none';
}
export function ajustarCantidadAuditoriaPP(itemId, valor) {
  const item = (DB.ppItems || []).find(i => String(i.id) === String(itemId)); if (!item) return;
  const nuevo = parseFloat(valor) || 0;
  const anterior = item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada;
  if (nuevo === anterior) return;
  // No se pisa lo que pidió el supervisor — queda registrado el ajuste
  // completo del auditor (quién, cuándo, de cuánto a cuánto — A.7).
  item.cantAntesAjuste = anterior;
  item.cantAutorizada = nuevo;
  item.ajustadoPor = currentUser?.nombre || '';
  item.ajustadoEn = new Date().toISOString();
  supaSync('ppItems', item);
  renderModalAuditoriaPP();
}
// "✔ Aprobar pedido" (punto 9.4 — renombrado de "Autorizar compra": se
// confundía con los productos CON AUTORIZACIÓN). Con o sin ajuste directo
// — si hubo ajuste, notifica al supervisor lo que cambió.
export async function aprobarPedidoPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido) return;
  if (!['confirmado_revision', 'observado'].includes(pedido.estado)) { toast('⚠️ Este pedido no está pendiente de revisión'); return; }
  const items = itemsDePedido(pedidoId);
  const huboAjuste = items.some(i => i.cantAutorizada != null && i.cantAutorizada !== i.cantSolicitada);
  for (const i of items) { if (i.cantAutorizada == null) { i.cantAutorizada = i.cantSolicitada; await supaSync('ppItems', i); } }
  pedido.estado = 'autorizado';
  pedido.auditadoPor = currentUser?.nombre || '';
  pedido.auditadoEn = new Date().toISOString();
  pedido.autorizadoPor = currentUser?.nombre || '';
  pedido.autorizadoEn = new Date().toISOString();
  await supaSync('ppPedidos', pedido);
  if (pedido.supervisor) {
    await crearNotificacion({
      tipo: 'pp_aprobado', entidadTipo: 'pedido_productos', entidadIdLocal: _idTrunc(pedido.id),
      destinatarioNombre: pedido.supervisor,
      mensaje: huboAjuste
        ? `El auditor aprobó tu pedido de ${pedido.servicioCodigo} con un ajuste directo en las cantidades.`
        : `El auditor aprobó tu pedido de ${pedido.servicioCodigo}.`,
    });
  }
  cerrarModal('modal-pp-auditoria');
  renderAuditoriaPP();
  toast(`✓ Pedido de ${pedido.servicioCodigo} aprobado`);
}
// "↩ Devolver con propuesta" (punto 9.4): el auditor ya dejó las
// cantidades propuestas en cantAutorizada (ajustarCantidadAuditoriaPP) —
// acá solo falta motivo + comentario obligatorios. El pedido vuelve como
// OBSERVADO; el supervisor acepta la propuesta o corrige y re-confirma
// (ver confirmarPedidoPP/aceptarPropuestaAuditorPP).
export async function confirmarDevolverConPropuestaPP() {
  const pedido = getPedidoPP(_ppAuditoriaModalId); if (!pedido) return;
  const motivo = ($('pp-aud-dev-motivo') || {}).value || '';
  const comentario = (($('pp-aud-dev-comentario') || {}).value || '').trim();
  if (!motivo) { toast('⚠️ Elegí el motivo'); return; }
  if (!comentario) { toast('⚠️ El comentario es obligatorio'); return; }
  pedido.estado = 'observado';
  pedido.observadoPor = currentUser?.nombre || '';
  pedido.observadoEn = new Date().toISOString();
  pedido.observadoMotivo = motivo;
  pedido.observadoComentario = comentario;
  await supaSync('ppPedidos', pedido);
  if (pedido.supervisor) {
    await crearNotificacion({
      tipo: 'pp_observado', entidadTipo: 'pedido_productos', entidadIdLocal: _idTrunc(pedido.id),
      destinatarioNombre: pedido.supervisor,
      mensaje: `El auditor devolvió tu pedido de ${pedido.servicioCodigo} con una propuesta: ${motivo} — ${comentario}`,
    });
  }
  cerrarModal('modal-pp-auditoria');
  renderAuditoriaPP();
  toast(`↩ Pedido de ${pedido.servicioCodigo} devuelto al supervisor`);
}

// ========== COMPRA Y ENTREGA ==========

export function renderComprasPP() {
  const tbody = $('tbody-pp-compras'); if (!tbody) return;
  const periodoId = ($('pp-compra-periodo-sel') || { value: '' }).value;
  if (!periodoId) { tbody.innerHTML = '<tr><td colspan="4" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</td></tr>'; return; }
  // 'confirmado' = pasó directo (sin auditor) y 'autorizado' = lo aprobó
  // el auditor — desde Compras son el mismo punto de entrada (punto 9.2).
  const rows = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId) && ['confirmado', 'autorizado', 'en_compra', 'entregado'].includes(p.estado));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="4" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">Todavía no hay pedidos autorizados en este período.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
    const total = totalPedidoPP(p.id);
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${obj ? obj.nombre : p.servicioCodigo}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeEstadoPedidoPP(p.estado)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(total)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        ${['confirmado', 'autorizado'].includes(p.estado) ? `<button class="btn btn-xs btn-primary" onclick="marcarEnCompraPP('${p.id}')">Marcar en compra</button>` : ''}
        ${p.estado === 'en_compra' ? `<button class="btn btn-xs btn-primary" onclick="marcarEntregadoPP('${p.id}')">Marcar entregado</button>` : ''}
        ${p.estado === 'entregado' ? '✓ Entregado' : ''}
      </td>
    </tr>`;
  }).join('');
}
export function marcarEnCompraPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido || !['confirmado', 'autorizado'].includes(pedido.estado)) return;
  pedido.estado = 'en_compra'; pedido.enCompraEn = new Date().toISOString();
  supaSync('ppPedidos', pedido);
  renderComprasPP();
  toast('✓ Marcado en compra');
}
export async function marcarEntregadoPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido || pedido.estado !== 'en_compra') return;
  const items = (DB.ppItems || []).filter(it => String(it.pedidoIdLocal) === String(pedido.id));
  pedido.estado = 'entregado'; pedido.entregadoEn = new Date().toISOString();
  await supaSync('ppPedidos', pedido);
  // Genera ENTRADAS al stock unificado (v095)
  try {
    const { recibirPedidoProductosPP } = await import('@modules/uniformes/stock.js');
    await recibirPedidoProductosPP(pedido.id, items);
  } catch (_) { /* stock module no disponible, skip */ }
  renderComprasPP();
  toast('✓ Pedido entregado — stock actualizado');
}

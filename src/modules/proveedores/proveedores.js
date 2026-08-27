// Módulo Proveedores — maestro general del área Logística (v100).
// spec: mockup_proveedores_1.html · tabla: public.proveedores (extiende v094) + proveedor_contactos
//
// Vista Padrón (KPIs + tabla con filtros) y vista Ficha por proveedor
// (Datos / Catálogo o Actividad / Contactos / Compras por período).
// Alta y edición: solo perfiles con nivel 2 en la matriz de accesos
// ('proveedores') — Logística, Finanzas, Admin, GG, Dev.
//
// Datos que vienen de otros módulos (solo lectura):
//   · Catálogo/listas   → ppProductos + ppPrecios (Pedido de productos)
//   · Compras           → ppItems × ppPedidos × ppPeriodos
//   · Reparaciones      → maquinas_tickets (match por razón social, texto libre)

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { puedeModificar } from '@modules/accesos/runtime.js';
import {
  RUBROS_PROVEEDOR, CONDICIONES_ARCA, CONDICIONES_PAGO, FRECUENCIAS_PEDIDO,
  DIAS_LISTA_VIGENTE,
  validarCuit, validarMail, proximoCodigoProveedores,
  rubrosDe, tieneRubro,
  ultimaListaProveedor, estadoLista,
  comprasPorPeriodoProveedor, comprasAno,
  ticketsDeProveedor, maquinasAlquiladas,
  kpisProveedores,
} from './logica.js';

// ========== HELPERS ==========

function _id(pref) { return pref + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function _money2(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _hoyISO() { return new Date().toISOString().slice(0, 10); }

function _fmtFecha(fechaISO) {
  if (!fechaISO) return '—';
  const [y, m, d] = String(fechaISO).slice(0, 10).split('-');
  if (!y || !m || !d) return fechaISO;
  return `${d}/${m}/${y}`;
}

function _formatCuit(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (s || '');
}

const RUBRO_STYLE = {
  'PRODUCTOS':          ['#e4ecf7', '#2b4d80'],
  'REPARACIÓN MÁQUINAS': ['#fdeee0', '#9a4d07'],
  'ALQUILER MÁQUINAS':  ['#e8f6ec', '#1d6b3a'],
  'UNIFORMES':          ['#f3e8fb', '#6b2fa8'],
  'OTRO':               ['#eceef3', '#5a6478'],
};

function _rubroTag(rubro) {
  const [bg, fg] = RUBRO_STYLE[rubro] || RUBRO_STYLE['OTRO'];
  return `<span style="background:${bg};color:${fg};font-size:10px;font-weight:700;padding:1px 8px;border-radius:6px;margin-right:4px;display:inline-block;margin-bottom:2px;">${rubro}</span>`;
}

function _estadoChip(prov) {
  const inactivo = (prov.estado || 'activo') === 'inactivo';
  return inactivo
    ? '<span style="background:#eceef3;color:#5a6478;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">INACTIVO</span>'
    : '<span style="background:#d9f2e2;color:#156a3a;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">ACTIVO</span>';
}

// Chip de vigencia de lista (mockup: "AGO 2026 · vigente" / "JUN 2026 · hace 2 meses ⚠")
function _chipLista(info) {
  if (!info) return '<span style="color:var(--texto-suave);font-size:11.5px;">— sin lista</span>';
  const est = estadoLista(info);
  const mesAnio = info.fecha.slice(5, 7) + '/' + info.fecha.slice(0, 4);
  if (est === 'vigente') {
    return `<span style="background:#d9f2e2;color:#156a3a;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700;">${mesAnio} · vigente</span>`;
  }
  const meses = Math.floor(info.dias / 30);
  return `<span style="background:#fddede;color:#a11c1c;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700;">${mesAnio} · hace ${meses} ${meses === 1 ? 'mes' : 'meses'} ⚠</span>`;
}

function getProv(id) { return (DB.proveedores || []).find(p => String(p.id) === String(id) && !p.anulado); }
function _puedeEditar() { return puedeModificar('proveedores', currentUser?.perfil, currentUser?.id); }

let _provSeleccionado = null;

// ========== PADRÓN ==========

export function renderProveedores() {
  // Al entrar siempre volvemos al padrón (la ficha es una sub-vista).
  const padron = $('prov-vista-padron'); const ficha = $('prov-vista-ficha');
  if (!padron || !ficha) return;
  padron.style.display = ''; ficha.style.display = 'none';
  _provSeleccionado = null;

  const btnAlta = $('btn-prov-alta'); if (btnAlta) btnAlta.style.display = _puedeEditar() ? '' : 'none';

  const mesActual = _hoyISO().slice(0, 7);
  const k = kpisProveedores({
    proveedores: DB.proveedores || [],
    productos: DB.ppProductos || [],
    precios: DB.ppPrecios || [],
    items: DB.ppItems || [],
    pedidos: DB.ppPedidos || [],
    periodos: DB.ppPeriodos || [],
    mesActual,
    fechaRefISO: _hoyISO(),
  });
  const statsEl = $('prov-stats');
  if (statsEl) {
    statsEl.innerHTML = [
      ['Proveedores activos', k.activos],
      ['Con lista de productos', k.conCatalogo],
      ['Lista desactualizada', k.listaDesactualizada, k.listaDesactualizada > 0 ? 'color:var(--rojo);' : ''],
      ['Compras del mes (todos)', _money(k.comprasMes)],
    ].map(([l, v, extra]) => `
      <div class="stat-card">
        <div class="stat-value" style="${extra || ''}">${v}</div>
        <div class="stat-label">${l}</div>
      </div>`).join('');
  }
  filtrarProveedores();
}

export function filtrarProveedores() {
  const tbody = $('tbody-prov-padron'); if (!tbody) return;
  const q = (($('prov-buscar') || { value: '' }).value || '').toLowerCase().trim();
  const fRubro = ($('prov-filtro-rubro') || { value: '' }).value;
  const fEstado = ($('prov-filtro-estado') || { value: '' }).value;
  const anoActual = _hoyISO().slice(0, 4);

  const filas = (DB.proveedores || [])
    .filter(p => !p.anulado)
    .filter(p => !fEstado || (p.estado || 'activo') === fEstado)
    .filter(p => !fRubro || tieneRubro(p, fRubro))
    .filter(p => !q || [p.nombre, p.codigo, p.cuit].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es'));

  if (!filas.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--texto-suave);">No hay proveedores que coincidan con el filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(p => {
    const filasCompra = comprasPorPeriodoProveedor({
      items: DB.ppItems || [], productos: DB.ppProductos || [],
      pedidos: DB.ppPedidos || [], periodos: DB.ppPeriodos || [], precios: DB.ppPrecios || [],
      proveedorId: p.id, fechaRefISO: _hoyISO(),
    });
    const comprasAnoVal = comprasAno(filasCompra, anoActual);
    const esProductos = tieneRubro(p, 'PRODUCTOS');
    const infoLista = esProductos ? ultimaListaProveedor({ productos: DB.ppProductos || [], precios: DB.ppPrecios || [], proveedorId: p.id, fechaRefISO: _hoyISO() }) : null;
    const celdaLista = esProductos ? _chipLista(infoLista) : '<span style="color:var(--texto-suave);font-size:11.5px;">— no aplica</span>';
    const dirCorta = p.direccion ? ` <span style="color:var(--texto-suave);">(${p.direccion.split('(')[0].trim().slice(0, 28)})</span>` : '';
    return `<tr style="cursor:pointer;" onclick="verProveedor('${p.id}')">
      <td style="padding:8px 10px;"><b>${p.codigo || '—'}</b></td>
      <td style="padding:8px 10px;">${p.nombre}${dirCorta}</td>
      <td style="padding:8px 10px;color:var(--texto-suave);">${p.cuit ? _formatCuit(p.cuit) : '—'}</td>
      <td style="padding:8px 10px;">${rubrosDe(p).map(_rubroTag).join('') || '<span style="color:var(--texto-suave);">—</span>'}</td>
      <td style="padding:8px 10px;">${celdaLista}</td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap;">${_money(comprasAnoVal)}</td>
      <td style="padding:8px 10px;">${_estadoChip(p)}</td>
    </tr>`;
  }).join('');
}

// ========== FICHA ==========

export function verProveedor(id) {
  const prov = getProv(id); if (!prov) return;
  _provSeleccionado = id;
  $('prov-vista-padron').style.display = 'none';
  $('prov-vista-ficha').style.display = '';
  renderFichaProveedor();
  window.scrollTo(0, 0);
}

export function volverProveedores() {
  renderProveedores();
}

function _seccionActividadMaquinas(prov) {
  const tickets = ticketsDeProveedor(DB.maquinasTickets || [], prov.nombre);
  const alquiladas = maquinasAlquiladas(DB.maquinas || [], prov.nombre);
  const totalTickets = tickets.reduce((s, t) => s + (t.costoRepuestos || 0) + (t.costoProveedor || 0), 0);
  const abiertos = tickets.filter(t => t.etapa !== 'cerrado').length;
  return `
    <div class="card">
      <h3>Actividad (viene del módulo Máquinas)</h3>
      <p><strong>Tickets de reparación:</strong> ${tickets.length}${tickets.length ? ` (${tickets.length - abiertos} cerrados, ${abiertos} en curso)` : ''}</p>
      <p><strong>Total facturado:</strong> ${_money2(totalTickets)}</p>
      ${tieneRubro(prov, 'ALQUILER MÁQUINAS') ? `<p><strong>Máquinas alquiladas a este proveedor:</strong> ${alquiladas.length}</p>` : ''}
      <p style="color:var(--texto-suave);font-size:11.5px;margin-top:6px;">Matcheo por razón social exacta — Máquinas todavía no apunta al padrón por código PROV.</p>
    </div>`;
}

function _seccionCatalogo(prov) {
  const productos = (DB.ppProductos || []).filter(pr => !pr.anulado && String(pr.proveedorIdLocal || '') === String(prov.id));
  const info = ultimaListaProveedor({ productos: DB.ppProductos || [], precios: DB.ppPrecios || [], proveedorId: prov.id, fechaRefISO: _hoyISO() });
  return `
    <div class="card">
      <h3>Catálogo y listas de precios</h3>
      <p><strong>Productos activos en catálogo:</strong> ${productos.length}</p>
      <p><strong>Precio más reciente cargado:</strong> ${info ? `${_fmtFecha(info.fecha)} ${_chipLista(info)}` : '<span style="color:var(--texto-suave);">sin precios cargados</span>'}</p>
      <p style="color:var(--texto-suave);font-size:11.5px;margin-top:6px;">
        Los precios se cargan producto por producto en <strong>Pedido de productos → Catálogo</strong>.
        El registro de imports de listas (archivo, altas/actualizados) quedará acá cuando ese módulo incorpore el import masivo.
      </p>
    </div>`;
}

function _renderContactos(prov) {
  const contactos = (DB.proveedorContactos || []).filter(c => !c.anulado && String(c.proveedorIdLocal) === String(prov.id));
  const editable = _puedeEditar();
  const filas = contactos.map(c => `<tr>
      <td style="padding:6px 10px;">${c.nombre}</td>
      <td style="padding:6px 10px;"><span style="background:#dbe7ff;color:#1b3f9e;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700;">${c.rol || '—'}</span></td>
      <td style="padding:6px 10px;color:var(--texto-suave);">${c.celular || '—'}</td>
      <td style="padding:6px 10px;color:var(--texto-suave);">${c.mail || '—'}</td>
      ${editable ? `<td style="padding:6px 10px;text-align:right;">
        <button class="btn btn-secondary btn-sm" onclick="abrirModalProvContacto('${prov.id}','${c.id}')">✎</button>
        <button class="btn btn-secondary btn-sm" onclick="borrarProvContacto('${prov.id}','${c.id}')">🗑</button>
      </td>` : ''}
    </tr>`).join('');
  return `
    ${filas || '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--texto-suave);">Sin contactos cargados.</td></tr>'}`;
}

export function renderFichaProveedor() {
  const cont = $('prov-ficha-cont'); if (!cont) return;
  const prov = getProv(_provSeleccionado);
  if (!prov) { volverProveedores(); return; }

  const editable = _puedeEditar();
  const esProductos = tieneRubro(prov, 'PRODUCTOS');
  const esMaquinas = tieneRubro(prov, 'REPARACIÓN MÁQUINAS') || tieneRubro(prov, 'ALQUILER MÁQUINAS');

  const filasCompra = comprasPorPeriodoProveedor({
    items: DB.ppItems || [], productos: DB.ppProductos || [],
    pedidos: DB.ppPedidos || [], periodos: DB.ppPeriodos || [], precios: DB.ppPrecios || [],
    proveedorId: prov.id, fechaRefISO: _hoyISO(),
  });

  const datosIzq = `
    <div class="card">
      <h3>Datos</h3>
      <p><strong>Razón social:</strong> ${prov.nombre}</p>
      ${prov.cuit ? `<p><strong>CUIT:</strong> ${_formatCuit(prov.cuit)}${prov.condArca ? ` · <strong>Cond. ARCA:</strong> ${prov.condArca}` : ''}</p>` : ''}
      ${prov.direccion ? `<p><strong>Dirección:</strong> ${prov.direccion}</p>` : ''}
      ${(prov.mail || prov.telefono) ? `<p>${prov.mail ? `<strong>Mail:</strong> ${prov.mail}` : ''}${prov.mail && prov.telefono ? ' · ' : ''}${prov.telefono ? `<strong>Teléfono:</strong> ${prov.telefono}` : ''}</p>` : ''}
      ${(prov.condPago || prov.cbuAlias || prov.banco) ? `<p>${prov.condPago ? `<strong>Cond. de pago:</strong> ${prov.condPago}` : ''}${prov.cbuAlias || prov.banco ? ` · <strong>CBU/Alias:</strong> ${[prov.cbuAlias, prov.banco].filter(Boolean).join(' · ')}` : ''}</p>` : ''}
      ${(prov.frecuencia || prov.plazoEntregaDias != null) ? `<p>${prov.frecuencia ? `<strong>Frecuencia de pedido:</strong> ${prov.frecuencia}` : ''}${prov.frecuencia && prov.plazoEntregaDias != null ? ' · ' : ''}${prov.plazoEntregaDias != null ? `<strong>Plazo entrega:</strong> ${prov.plazoEntregaDias} días` : ''}</p>` : ''}
      ${prov.marcas ? `<p><strong>Marcas que distribuye:</strong> ${prov.marcas}</p>` : ''}
      ${prov.observaciones ? `<p><strong>Observaciones:</strong> <span style="color:var(--texto-suave);">${prov.observaciones}</span></p>` : ''}
      <p><strong>Alta:</strong> ${_fmtFecha(String(prov.createdAt || prov.created_at || '').slice(0, 10))}${prov.creadoPor ? ` · ${prov.creadoPor}` : ''}</p>
      <p><strong>Rubros:</strong> ${rubrosDe(prov).map(_rubroTag).join('') || '—'}</p>
      <p style="color:var(--texto-suave);font-size:11.5px;margin-top:6px;">Cuenta contable: se asignará con el futuro módulo contable (Pasivo → Proveedores → ${prov.codigo}).</p>
    </div>`;

  const datosDer = esProductos ? _seccionCatalogo(prov) : (esMaquinas ? _seccionActividadMaquinas(prov) : '');

  const tablaCompras = !filasCompra.length
    ? '<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--texto-suave);">Sin compras registradas (los borradores de supervisor no cuentan).</td></tr>'
    : filasCompra.map(f => {
      const pedidosDelMes = (DB.ppPedidos || []).filter(pd => {
        if (pd.anulado || pd.estado === 'borrador') return false;
        // FIX 27/08: mismo bug de truncamiento que logica.js/pedido_productos.js.
        const per = (DB.ppPeriodos || []).find(pp => String(pp.id).slice(-9) === String(pd.periodoIdLocal).slice(-9));
        return per && per.mes === f.mes;
      });
      // ¿Algún item de esos pedidos es de este proveedor? (para el conteo real)
      const nPedidos = pedidosDelMes.filter(pd =>
        (DB.ppItems || []).some(it => !it.anulado && String(it.pedidoIdLocal) === String(pd.id) &&
          String(((DB.ppProductos || []).find(pp => String(pp.id) === String(it.productoIdLocal)) || {}).proveedorIdLocal || '') === String(prov.id))
      ).length;
      return `<tr>
        <td style="padding:6px 10px;"><b>${f.mes}</b></td>
        <td style="padding:6px 10px;text-align:right;">${f.lineas}</td>
        <td style="padding:6px 10px;text-align:right;white-space:nowrap;">${_money2(f.total)}</td>
        <td style="padding:6px 10px;text-align:center;">${nPedidos}</td>
      </tr>`;
    }).join('');

  cont.innerHTML = `
    <div style="margin-bottom:12px;"><button class="btn btn-secondary" onclick="volverProveedores()">← Volver al padrón</button></div>
    <div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <h3 style="margin:0;font-size:17px;">${prov.codigo || '—'} · ${prov.nombre}</h3>
      ${rubrosDe(prov).map(_rubroTag).join('')}
      ${_estadoChip(prov)}
      <span style="margin-left:auto;display:flex;gap:8px;">
        ${editable ? `<button class="btn btn-primary" onclick="abrirModalProveedor('${prov.id}')">✎ Editar</button>
        ${prov.estado !== 'inactivo'
          ? `<button class="btn btn-danger" onclick="bajaProveedor('${prov.id}')">Dar de baja</button>`
          : `<button class="btn btn-primary" onclick="reactivarProveedor('${prov.id}')">Reactivar</button>`}` : ''}
      </span>
    </div>
    ${esProductos && (() => { const est = estadoLista(ultimaListaProveedor({ productos: DB.ppProductos || [], precios: DB.ppPrecios || [], proveedorId: prov.id, fechaRefISO: _hoyISO() })); return est === 'desactualizada'
      ? `<div class="alerta" style="background:#fff6e0;border:1px solid #eed49a;color:#7a5a10;border-radius:8px;padding:10px 14px;font-size:12.5px;margin-bottom:14px;">⚠ <b>Lista de precios desactualizada</b> — pedir lista vigente antes de la próxima compra (umbral: ${DIAS_LISTA_VIGENTE} días).</div>`
      : ''; })()}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;" id="prov-ficha-grid">
      ${datosIzq}
      ${datosDer}
    </div>
    <div class="card" style="margin-bottom:14px;">
      <h3>Contactos</h3>
      <div class="tabla-wrap"><table>
        <thead><tr><th style="text-align:left;padding:6px 10px;">Nombre</th><th style="text-align:left;padding:6px;">Rol</th><th style="text-align:left;padding:6px;">Celular</th><th style="text-align:left;padding:6px;">Mail</th>${editable ? '<th></th>' : ''}</tr></thead>
        <tbody>${_renderContactos(prov)}</tbody>
      </table></div>
      ${editable ? `<button class="btn btn-secondary" style="margin-top:10px;" onclick="abrirModalProvContacto('${prov.id}',null)">+ Agregar contacto</button>` : ''}
    </div>
    ${filasCompra.length ? `
    <div class="card">
      <h3>Compras por período (Pedido de productos)</h3>
      <div class="tabla-wrap"><table>
        <thead><tr><th style="text-align:left;padding:6px 10px;">Período</th><th style="text-align:right;padding:6px;">Líneas</th><th style="text-align:right;padding:6px;">Total (costo)</th><th style="text-align:center;padding:6px;">Pedidos</th></tr></thead>
        <tbody>${tablaCompras}</tbody>
      </table></div>
    </div>` : ''}
  `;
}

// ========== ALTA / EDICIÓN ==========

export function abrirModalProveedor(id) {
  if (!_puedeEditar()) { toast('⛔ No tenés permiso para modificar proveedores'); return; }
  const prov = id ? getProv(id) : null;
  $('prov-form-title').textContent = prov ? `Editar proveedor · ${prov.codigo}` : 'Alta de proveedor';
  $('prov-f-id').value = prov ? prov.id : '';
  $('prov-f-codigo-hint').textContent = prov ? prov.codigo : proximoCodigoProveedores(DB.proveedores || []);
  $('prov-f-nombre').value = prov?.nombre || '';
  $('prov-f-cuit').value = prov?.cuit ? _formatCuit(prov.cuit) : '';
  $('prov-f-arca').value = prov?.condArca || '';
  $('prov-f-direccion').value = prov?.direccion || '';
  $('prov-f-mail').value = prov?.mail || '';
  $('prov-f-tel').value = prov?.telefono || '';
  $('prov-f-pago').value = prov?.condPago || '';
  $('prov-f-cbu').value = prov?.cbuAlias || '';
  $('prov-f-banco').value = prov?.banco || '';
  $('prov-f-frec').value = prov?.frecuencia || '';
  $('prov-f-plazo').value = prov?.plazoEntregaDias ?? '';
  $('prov-f-estado').value = prov ? (prov.estado || 'activo') : 'activo';
  $('prov-f-marcas').value = prov?.marcas || '';
  $('prov-f-obs').value = prov?.observaciones || '';
  document.querySelectorAll('input[name="prov-rubro"]').forEach(cb => {
    cb.checked = prov ? tieneRubro(prov, cb.value) : false;
  });
  abrirModal('modal-prov-form');
}

export function guardarProveedor() {
  if (!_puedeEditar()) { toast('⛔ No tenés permiso para modificar proveedores'); return; }

  const g = id => ($(id) || { value: '' }).value.trim();
  const idViejo = $('prov-f-id').value;
  const nombre = g('prov-f-nombre');
  const cuit = g('prov-f-cuit');
  const mail = g('prov-f-mail');
  const plazoRaw = g('prov-f-plazo');

  if (!nombre) { toast('⚠️ La razón social es obligatoria'); return; }
  const dup = (DB.proveedores || []).find(p => !p.anulado &&
    String(p.id) !== String(idViejo) &&
    String(p.nombre || '').trim().toLowerCase() === nombre.toLowerCase());
  if (dup) { toast(`⚠️ Ya existe un proveedor con esa razón social (${dup.codigo})`); return; }
  if (!validarCuit(cuit)) { toast('⚠️ CUIT inválido — esperamos 11 dígitos con dígito verificador correcto'); return; }
  if (!validarMail(mail)) { toast('⚠️ El mail no parece válido'); return; }
  let plazo = null;
  if (plazoRaw !== '') {
    plazo = parseInt(plazoRaw, 10);
    if (isNaN(plazo) || plazo < 0) { toast('⚠️ El plazo de entrega debe ser un número de días ≥ 0'); return; }
  }

  const rubros = [...document.querySelectorAll('input[name="prov-rubro"]:checked')].map(cb => cb.value);

  let prov = idViejo ? getProv(idViejo) : null;
  const nuevo = !prov;
  if (nuevo) prov = { id: _id('PROV'), codigo: proximoCodigoProveedores(DB.proveedores || []), creadoPor: currentUser?.nombre || '', createdAt: new Date().toISOString(), anulado: false };
  Object.assign(prov, {
    nombre,
    cuit: cuit.replace(/\D/g, '') || null,
    condArca: g('prov-f-arca') || null,
    direccion: g('prov-f-direccion') || null,
    mail: mail || null,
    telefono: g('prov-f-tel') || null,
    condPago: g('prov-f-pago') || null,
    cbuAlias: g('prov-f-cbu') || null,
    banco: g('prov-f-banco') || null,
    frecuencia: g('prov-f-frec') || null,
    plazoEntregaDias: plazo,
    estado: g('prov-f-estado') || 'activo',
    marcas: g('prov-f-marcas') || null,
    observaciones: g('prov-f-obs') || null,
    rubros,
  });
  if (!DB.proveedores) DB.proveedores = [];
  if (nuevo) DB.proveedores.push(prov);
  supaSync('proveedores', prov);

  cerrarModal('modal-prov-form');
  toast(nuevo ? `✓ Proveedor ${prov.codigo} dado de alta` : '✓ Proveedor actualizado');
  if (_provSeleccionado === prov.id) renderFichaProveedor(); else renderProveedores();
}

export function bajaProveedor(id) {
  if (!_puedeEditar()) return;
  const prov = getProv(id); if (!prov) return;
  if (!window.confirm(`¿Dar de baja a "${prov.nombre}"? Deja de aparecer en los selects de Pedido de productos.`)) return;
  prov.estado = 'inactivo';
  supaSync('proveedores', prov);
  toast(`Proveedora/o "${prov.nombre}" dada/o de baja`);
  renderFichaProveedor();
}

export function reactivarProveedor(id) {
  if (!_puedeEditar()) return;
  const prov = getProv(id); if (!prov) return;
  prov.estado = 'activo';
  supaSync('proveedores', prov);
  toast(`"${prov.nombre}" reactivada/o`);
  renderFichaProveedor();
}

// ========== CONTACTOS ==========

const ROLES_CONTACTO = ['VENDEDOR', 'ADMINISTRACIÓN', 'ENTREGAS', 'TÉCNICO', 'DUEÑO', 'OTRO'];

export function poblarRolesProvContacto() {
  const sel = $('provc-rol'); if (!sel) return;
  sel.innerHTML = ROLES_CONTACTO.map(r => `<option value="${r}">${r}</option>`).join('');
}

export function abrirModalProvContacto(provId, contactoId) {
  if (!_puedeEditar()) { toast('⛔ No tenés permiso para modificar proveedores'); return; }
  if (!getProv(provId)) return;
  poblarRolesProvContacto();
  $('provc-id').value = contactoId || '';
  $('provc-prov-id').value = provId;
  let c = null;
  if (contactoId) {
    c = (DB.proveedorContactos || []).find(x => String(x.id) === String(contactoId));
    if (!c) return;
  }
  $('provc-title').textContent = c ? 'Editar contacto' : 'Nuevo contacto';
  $('provc-nombre').value = c?.nombre || '';
  $('provc-rol').value = c?.rol || 'VENDEDOR';
  $('provc-cel').value = c?.celular || '';
  $('provc-mail').value = c?.mail || '';
  abrirModal('modal-prov-contacto');
}

export function guardarProvContacto() {
  if (!_puedeEditar()) return;
  const provId = $('provc-prov-id').value;
  const contactoId = $('provc-id').value;
  const nombre = ($('provc-nombre') || { value: '' }).value.trim();
  const mail = ($('provc-mail') || { value: '' }).value.trim();
  if (!getProv(provId)) return;
  if (!nombre) { toast('⚠️ El nombre del contacto es obligatorio'); return; }
  if (!validarMail(mail)) { toast('⚠️ El mail no parece válido'); return; }

  let c = contactoId ? (DB.proveedorContactos || []).find(x => String(x.id) === String(contactoId)) : null;
  const nuevo = !c;
  if (nuevo) c = { id: _id('PRVC'), proveedorIdLocal: provId, anulado: false, creadoPor: currentUser?.nombre || '', createdAt: new Date().toISOString() };
  Object.assign(c, {
    nombre,
    rol: $('provc-rol').value || null,
    celular: ($('provc-cel') || { value: '' }).value.trim() || null,
    mail: mail || null,
  });
  if (!DB.proveedorContactos) DB.proveedorContactos = [];
  if (nuevo) DB.proveedorContactos.push(c);
  supaSync('proveedorContactos', c);

  cerrarModal('modal-prov-contacto');
  toast(nuevo ? '✓ Contacto agregado' : '✓ Contacto actualizado');
  renderFichaProveedor();
}

export function borrarProvContacto(provId, contactoId) {
  if (!_puedeEditar()) return;
  const c = (DB.proveedorContactos || []).find(x => String(x.id) === String(contactoId));
  if (!c) return;
  if (!window.confirm(`¿Eliminar el contacto "${c.nombre}"?`)) return;
  c.anulado = true;
  supaSync('proveedorContactos', c);
  toast('Contacto eliminado');
  renderFichaProveedor();
}

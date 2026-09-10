// Entregas (ticket "Módulo productos" 31/08, puntos 6b y 11 del
// checklist).
//
// RONDA 5 (10/09) — circuito real de Logística: la entrega del mes sale
// del STOCK EXISTENTE, no espera a ninguna compra. "Listo para armar" ya
// NO depende de que la OC del período haya llegado — depende de que haya
// pedido cargado; el stock se chequea por línea (alcanza / falta) pero no
// bloquea. Al ARMAR se descuenta el stock (salida con el servicio de
// destino); si no alcanza, armado parcial y el faltante queda en el
// remito. La compra es un circuito aparte (Compras → Reposición).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const _idTrunc = (v) => String(v || '').slice(-9);
function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function hoyStr() { return new Date().toISOString().slice(0, 10); }

function getPedidoPP(id) { return (DB.ppPedidos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function getProductoPP(id) { return (DB.ppProductos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function itemsDePedido(pedidoId) { return (DB.ppItems || []).filter(i => _idTrunc(i.pedidoIdLocal) === _idTrunc(pedidoId) && !i.anulado); }
function cantEfectiva(item) { return item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada; }

function _stockNivelProd(idTrunc) {
  const s = (DB.stockProductos || []).find(x => _idTrunc(x.productoIdLocal) === _idTrunc(idTrunc));
  return s ? (Number(s.cantidad) || 0) : 0;
}
// RONDA 5: "listo para armar" = tiene ítems cargados. Ya no espera a la
// OC — la entrega sale del stock existente. El stock se muestra por línea
// (alcanza / falta) pero no bloquea el armado (se puede armar parcial).
function pedidoListoParaArmar(pedido) {
  return itemsDePedido(pedido.id).length > 0;
}
// ¿El stock cubre TODO el pedido? (para el chip alcanza/falta del listado)
function stockCubrePedido(pedido) {
  return itemsDePedido(pedido.id).every(i => _stockNivelProd(_idTrunc(i.productoIdLocal)) >= cantEfectiva(i));
}
function itemsFaltantesStock(pedido) {
  return itemsDePedido(pedido.id)
    .map(i => ({ i, falta: cantEfectiva(i) - _stockNivelProd(_idTrunc(i.productoIdLocal)) }))
    .filter(x => x.falta > 0);
}
function remitoDePedido(pedidoId) {
  return (DB.ppRemitos || []).filter(r => !r.anulado && _idTrunc(r.pedidoIdLocal) === _idTrunc(pedidoId)).sort((a, b) => String(b.id).localeCompare(String(a.id)))[0] || null;
}

export function renderEntregasPP() {
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  const contListos = $('pp-entregas-listos'), contCurso = $('pp-entregas-curso'), contHechos = $('pp-entregas-hechos');
  if (!periodoId) {
    if (contListos) contListos.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</p>';
    return;
  }
  const pedidos = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId) && ['confirmado', 'autorizado', 'en_compra', 'entregado'].includes(p.estado));

  const listos = pedidos.filter(p => !remitoDePedido(p.id) && pedidoListoParaArmar(p));
  const enCurso = pedidos.map(p => ({ p, remito: remitoDePedido(p.id) })).filter(x => x.remito && ['armado', 'en_reparto'].includes(x.remito.estado));
  const entregados = pedidos.map(p => ({ p, remito: remitoDePedido(p.id) })).filter(x => x.remito && x.remito.estado === 'entregado').slice(0, 30);

  const obj = (codigo) => (DB.objetivos || []).find(o => o.codigo === codigo);

  if (contListos) contListos.innerHTML = listos.length ? listos.map(p => {
    const cubre = stockCubrePedido(p);
    const falt = itemsFaltantesStock(p);
    const chip = cubre
      ? '<span class="badge" style="background:#16a34a;color:white;font-size:10px;">STOCK ALCANZA</span>'
      : `<span class="badge" style="background:#dc2626;color:white;font-size:10px;">FALTA ${falt.length} ítem(s)</span>`;
    return `<div class="card" style="cursor:pointer;" onclick="abrirArmadoPedidoPP('${p.id}')">
      <b>${obj(p.servicioCodigo)?.nombre || p.servicioCodigo}</b> <span class="text-muted" style="font-size:11.5px;">${itemsDePedido(p.id).length} producto(s)</span> ${chip}
      <div style="margin-top:6px;"><button class="btn btn-primary btn-sm">${cubre ? 'Armar →' : 'Armar parcial →'}</button></div>
    </div>`;
  }).join('') : '<p style="padding:20px;color:var(--texto-muy-suave);">No hay pedidos aprobados para armar en este período.</p>';

  if (contCurso) contCurso.innerHTML = enCurso.length ? enCurso.map(({ p, remito }) => `
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;">
        <b>${obj(p.servicioCodigo)?.nombre || p.servicioCodigo}</b>
        <span class="badge" style="background:${remito.estado === 'armado' ? '#7c3aed' : '#2563eb'};color:white;margin-left:auto;">${remito.estado === 'armado' ? 'ARMADO' : 'EN REPARTO'}</span>
      </div>
      <div style="font-size:11.5px;color:var(--texto-suave);margin-top:4px;">${remito.numero} · ${remito.items.length} producto(s)${p.fechaLimiteEntrega ? ` · límite ${new Date(p.fechaLimiteEntrega).toLocaleDateString('es-AR')}` : ''}</div>
      <div style="margin-top:6px;">
        ${remito.estado === 'armado' ? `<button class="btn btn-secondary btn-sm" onclick="marcarEnRepartoPP('${remito.id}')">Marcar en reparto</button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="abrirEntregaFinalPP('${remito.id}')">Registrar entrega</button>
      </div>
    </div>`).join('') : '<p style="padding:20px;color:var(--texto-muy-suave);">Nada armado todavía.</p>';

  if (contHechos) contHechos.innerHTML = entregados.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px;">
    <thead><tr style="background:#374151;color:white;"><th style="padding:6px 10px;text-align:left;">Servicio</th><th style="padding:6px 8px;">Remito</th><th style="padding:6px 8px;">Entregado a</th><th style="padding:6px 8px;">Fecha</th></tr></thead>
    <tbody>${entregados.map(({ p, remito }) => `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${obj(p.servicioCodigo)?.nombre || p.servicioCodigo}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);">${remito.numero}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);">${remito.entregadoA || '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);color:var(--texto-suave);">${remito.entregadoEn ? new Date(remito.entregadoEn).toLocaleDateString('es-AR') : '—'}</td>
    </tr>`).join('')}</tbody></table>` : '<p style="padding:20px;color:var(--texto-muy-suave);">Sin entregas registradas todavía.</p>';

  renderHojaRecorridoPP();
}

// ========== ARMADO CON CHECKLIST → REMITO ==========

let _ppArmadoPedidoId = null;
export function abrirArmadoPedidoPP(pedidoId) {
  _ppArmadoPedidoId = pedidoId;
  ensureModalArmadoPP();
  renderModalArmadoPP();
  abrirModal('modal-pp-armado');
}
function ensureModalArmadoPP() {
  if ($('modal-pp-armado')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-armado';
  m.innerHTML = `
    <div class="modal" style="max-width:620px;">
      <div class="modal-header"><h3 id="pp-armado-titulo">Armado de pedido</h3><button class="btn-close" onclick="cerrarModal('modal-pp-armado')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Fecha límite de entrega (opcional — Hoja de recorrido)</label><input type="date" id="pp-armado-fecha-limite"></div>
        <div id="pp-armado-checklist" style="margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-armado')">Cancelar</button>
        <button class="btn btn-primary" onclick="generarRemitoPP()">✔ Completar armado y generar remito</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalArmadoPP() {
  const pedido = getPedidoPP(_ppArmadoPedidoId); if (!pedido) return;
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  $('pp-armado-titulo').textContent = `Armado — ${obj ? obj.nombre : pedido.servicioCodigo}`;
  $('pp-armado-fecha-limite').value = pedido.fechaLimiteEntrega ? pedido.fechaLimiteEntrega.slice(0, 10) : '';
  const items = itemsDePedido(pedido.id).map(i => ({ ...i, _prod: getProductoPP(i.productoIdLocal) })).filter(i => i._prod);
  $('pp-armado-checklist').innerHTML = items.map(i => {
    const pedidoCant = cantEfectiva(i);
    const stock = _stockNivelProd(_idTrunc(i.productoIdLocal));
    const arma = Math.min(pedidoCant, stock);
    const falta = pedidoCant - arma;
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12.8px;border-bottom:1px solid var(--borde);">
      <input type="checkbox" class="pp-armado-check" data-item="${i.id}" ${i.armado ? 'checked' : ''} onchange="marcarItemArmadoPP('${pedido.id}','${i.id}',this.checked)">
      <span style="flex:1;">${i._prod.descripcion} <span class="text-muted" style="font-size:10.5px;">stock ${stock}</span></span>
      <b>${arma}${falta > 0 ? ` <span style="color:var(--rojo);font-weight:700;">(faltan ${falta})</span>` : ''}</b>
    </label>`;
  }).join('');
}
export async function marcarItemArmadoPP(pedidoId, itemId, checked) {
  const item = (DB.ppItems || []).find(i => String(i.id) === String(itemId)); if (!item) return;
  item.armado = checked;
  await supaSync('ppItems', item);
}
function siguienteNumeroRemitoPP() {
  const nums = (DB.ppRemitos || []).map(r => { const m = /R-0*(\d+)/.exec(r.numero || ''); return m ? Number(m[1]) : 0; });
  return `R-${String(Math.max(0, ...nums) + 1).padStart(6, '0')}`;
}
export async function generarRemitoPP() {
  const pedido = getPedidoPP(_ppArmadoPedidoId); if (!pedido) return;
  const items = itemsDePedido(pedido.id);
  const faltan = items.filter(i => !i.armado);
  if (faltan.length) { toast(`⚠️ Faltan tildar ${faltan.length} producto(s) del checklist`); return; }

  const fechaLimite = ($('pp-armado-fecha-limite') || {}).value;
  if (fechaLimite) { pedido.fechaLimiteEntrega = fechaLimite; await supaSync('ppPedidos', pedido); }

  // RONDA 5: el armado SALE DEL STOCK. Por línea se arma min(pedido, stock);
  // si no alcanza, es armado parcial y el faltante queda en el remito
  // (alimenta la prioridad de la reposición y el rastro). La SALIDA de
  // stock se registra ACÁ (antes se hacía recién en la entrega final).
  const lineasArmadas = [];
  const faltantes = [];
  for (const i of items) {
    const prodTrunc = _idTrunc(i.productoIdLocal);
    const pedidoCant = cantEfectiva(i);
    const stock = _stockNivelProd(prodTrunc);
    const arma = Math.max(0, Math.min(pedidoCant, stock));
    const falta = pedidoCant - arma;
    if (arma > 0) lineasArmadas.push({ productoIdLocal: prodTrunc, descripcion: getProductoPP(i.productoIdLocal)?.descripcion || '', cantidad: arma });
    if (falta > 0) faltantes.push({ productoIdLocal: prodTrunc, cantidad: falta });
  }
  if (!lineasArmadas.length) { toast('⚠️ No hay stock de ninguno de los productos — no se puede armar nada todavía'); return; }

  const remito = {
    id: _id('PPREM'), numero: siguienteNumeroRemitoPP(), pedidoIdLocal: _idTrunc(pedido.id), servicioCodigo: pedido.servicioCodigo,
    items: lineasArmadas, faltantes,
    estado: 'armado', armadoPor: currentUser?.nombre || '', armadoEn: new Date().toISOString(),
    firmaCliente: false, anulado: false,
  };
  if (!DB.ppRemitos) DB.ppRemitos = [];
  DB.ppRemitos.push(remito);
  await supaSync('ppRemitos', remito);

  const { registrarMovimientoStockProducto } = await import('@modules/uniformes/stock.js');
  for (const l of lineasArmadas) {
    await registrarMovimientoStockProducto({
      tipo: 'salida', productoIdLocal: l.productoIdLocal, cantidad: l.cantidad, costoUnitario: 0,
      motivo: `Armado ${remito.numero} — ${pedido.servicioCodigo}`, refTipo: 'remito', refIdLocal: _idTrunc(remito.id),
    });
  }

  cerrarModal('modal-pp-armado');
  renderEntregasPP();
  toast(faltantes.length
    ? `✓ Remito ${remito.numero} — ARMADO PARCIAL (${faltantes.length} faltante(s) → reposición)`
    : `✓ Remito ${remito.numero} generado — salida de stock registrada`);
}

export async function marcarEnRepartoPP(remitoId) {
  const r = (DB.ppRemitos || []).find(x => _idTrunc(x.id) === _idTrunc(remitoId)); if (!r || r.estado !== 'armado') return;
  r.estado = 'en_reparto'; r.enRepartoEn = new Date().toISOString();
  await supaSync('ppRemitos', r);
  renderEntregasPP();
  toast(`✓ ${r.numero} en reparto`);
}

// ========== ENTREGA FINAL (firma/foto) ==========

let _ppEntregaRemitoId = null;
export function abrirEntregaFinalPP(remitoId) {
  _ppEntregaRemitoId = remitoId;
  ensureModalEntregaPP();
  const r = (DB.ppRemitos || []).find(x => _idTrunc(x.id) === _idTrunc(remitoId)); if (!r) return;
  const pedido = getPedidoPP(r.pedidoIdLocal);
  const obj = pedido ? (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo) : null;
  const cliente = obj?.clienteIdLocal ? (DB.clientes || []).find(c => String(c.idLocal || c.id_local) === String(obj.clienteIdLocal)) : null;
  const pagan = cliente?.productosEnFactura === 'SE FACTURA';
  $('pp-entrega-titulo').textContent = `Entrega — ${r.numero}`;
  $('pp-entrega-a').value = '';
  $('pp-entrega-foto').value = '';
  const boxFirma = $('pp-entrega-firma-box');
  if (boxFirma) boxFirma.style.display = pagan ? 'block' : 'none';
  const firmaCheck = $('pp-entrega-firma'); if (firmaCheck) firmaCheck.checked = false;
  $('pp-entrega-nota').textContent = pagan
    ? 'Servicio PAGAN: el remito firmado respalda la factura a precio venta — se necesita la firma.'
    : 'Servicio NO PAGAN: queda como constancia interna, el costo va al económico del servicio.';
  abrirModal('modal-pp-entrega');
}
function ensureModalEntregaPP() {
  if ($('modal-pp-entrega')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-entrega';
  m.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-header"><h3 id="pp-entrega-titulo">Entrega</h3><button class="btn-close" onclick="cerrarModal('modal-pp-entrega')">×</button></div>
      <div class="modal-body">
        <p id="pp-entrega-nota" style="font-size:12px;color:var(--texto-suave);"></p>
        <div class="form-group"><label>Quién recibió *</label><input type="text" id="pp-entrega-a"></div>
        <div class="form-group"><label>Foto del remito firmado</label><input type="file" id="pp-entrega-foto" accept="image/*"></div>
        <div class="form-group" id="pp-entrega-firma-box" style="display:none;"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="pp-entrega-firma"> El cliente firmó el remito</label></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-entrega')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarEntregaFinalPP()">✔ Confirmar entrega</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
// Confirma la entrega: sube la foto (si hay) y cierra el pedido como
// ENTREGADO. La SALIDA de stock ya se registró al ARMAR (ronda 5) — acá
// no se vuelve a tocar el stock para no descontar dos veces.
export async function confirmarEntregaFinalPP() {
  const r = (DB.ppRemitos || []).find(x => _idTrunc(x.id) === _idTrunc(_ppEntregaRemitoId)); if (!r) return;
  const entregadoA = ($('pp-entrega-a') || {}).value.trim();
  if (!entregadoA) { toast('⚠️ Falta quién recibió'); return; }
  const boxFirma = $('pp-entrega-firma-box');
  const requiereFirma = boxFirma && boxFirma.style.display !== 'none';
  const firmo = !!($('pp-entrega-firma') || {}).checked;
  if (requiereFirma && !firmo) { toast('⚠️ Este servicio PAGAN necesita la firma del cliente para respaldar la factura'); return; }

  const fileInput = $('pp-entrega-foto');
  const file = fileInput?.files?.[0];
  let fotoPath = null;
  if (file) {
    try {
      const { SUPA } = await import('@shared/supabase.js');
      const path = `pedido_productos/remitos/${_idTrunc(r.id)}/${Date.now()}_${file.name}`;
      const { error } = await SUPA.storage.from('ohlimpia-adjuntos').upload(path, file, { upsert: false, contentType: file.type });
      if (!error) fotoPath = path;
    } catch (e) { /* si falla la subida, la entrega igual se registra — no bloquea */ }
  }

  r.entregadoA = entregadoA; r.entregadoEn = new Date().toISOString(); r.fotoPath = fotoPath; r.firmaCliente = firmo; r.estado = 'entregado';
  await supaSync('ppRemitos', r);

  const pedido = getPedidoPP(r.pedidoIdLocal);
  if (pedido) { pedido.estado = 'entregado'; pedido.entregadoEn = new Date().toISOString(); await supaSync('ppPedidos', pedido); }

  cerrarModal('modal-pp-entrega');
  renderEntregasPP();
  toast(`✓ ${r.numero} entregado a ${entregadoA}`);
}

// ========== HOJA DE RECORRIDO ==========
//
// Salidas por zona (objetivo.localidad) con fecha límite por servicio —
// alerta si el límite está cerca o pasó y todavía no se entregó.

export function renderHojaRecorridoPP() {
  const cont = $('pp-hoja-recorrido'); if (!cont) return;
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  if (!periodoId) { cont.innerHTML = ''; return; }
  const pedidos = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId) && ['confirmado', 'autorizado', 'en_compra'].includes(p.estado));
  const conRemitoPendiente = pedidos.map(p => ({ p, remito: remitoDePedido(p.id) })).filter(x => x.remito && ['armado', 'en_reparto'].includes(x.remito.estado));
  if (!conRemitoPendiente.length) { cont.innerHTML = '<p style="padding:16px;color:var(--texto-muy-suave);">Sin salidas pendientes de reparto.</p>'; return; }

  const hoy = new Date();
  const porZona = new Map();
  for (const { p, remito } of conRemitoPendiente) {
    const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
    const zona = obj?.localidad || 'Sin zona';
    if (!porZona.has(zona)) porZona.set(zona, []);
    let alerta = '';
    if (p.fechaLimiteEntrega) {
      const dias = Math.round((new Date(p.fechaLimiteEntrega) - hoy) / 86400000);
      alerta = dias < 0 ? `<span style="color:var(--rojo);font-weight:700;">⚠ vencido hace ${-dias}d</span>` : dias <= 2 ? `<span style="color:var(--naranja);font-weight:700;">vence en ${dias}d</span>` : `vence en ${dias}d`;
    }
    porZona.get(zona).push({ p, remito, obj, alerta });
  }
  cont.innerHTML = [...porZona.entries()].map(([zona, filas]) => `
    <div class="card" style="margin-bottom:12px;">
      <div class="card-header"><h3>📍 ${zona} <span style="font-weight:400;color:var(--texto-suave);font-size:12px;">— ${filas.length} salida(s)</span></h3></div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <tbody>${filas.map(f => `<tr>
          <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${f.obj?.nombre || f.p.servicioCodigo}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);"><span class="badge" style="background:${f.remito.estado === 'armado' ? '#7c3aed' : '#2563eb'};color:white;">${f.remito.estado === 'armado' ? 'ARMADO' : 'EN REPARTO'}</span></td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);font-size:11.5px;">${f.alerta || '<span class="text-muted">sin fecha límite</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`).join('');
}

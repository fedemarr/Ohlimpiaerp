// Tab Margen de productos (ticket "Módulo productos" 31/08, punto 8/13) —
// conexión con el Económico. Dos lecturas por período, sin tablas nuevas:
// lee lo que ya dejaron Mis pedidos/Auditoría/Entregas.
//   PAGAN    → MARGEN: facturado (a precio venta) − entregado (a costo/PPP).
//   NO PAGAN → AHORRO: presupuesto del mes (6% a costo) vs entregado a costo.
// Helpers duplicados a propósito (no importados de pedido_productos.js —
// mismo motivo anti-circular que recargos.js).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';

const _idTrunc = (v) => String(v || '').slice(-9);
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function itemsDePedido(pedidoId) { return (DB.ppItems || []).filter(i => _idTrunc(i.pedidoIdLocal) === _idTrunc(pedidoId) && !i.anulado); }
function cantEfectiva(item) { return item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada; }
function presupuestoDelMesPP(pedido) { return (pedido.facturacionNeta || 0) * (pedido.porcentajeTope || 0.06); }

const RECARGO_GENERAL_DEFAULT = 0.30;
function recargoVigenteServicioPP(servicioCodigo) {
  const propio = (DB.ppRecargoServicio || []).find(r => r.servicioCodigo === servicioCodigo && !r.anulado && !r.vigenciaHasta);
  if (propio) return Number(propio.pct) || 0;
  const general = (DB.ppRecargoGeneral || []).filter(r => !r.anulado && !r.vigenciaHasta).sort((a, b) => (b.vigenciaDesde || '').localeCompare(a.vigenciaDesde || ''))[0];
  return general ? Number(general.pct) || 0 : RECARGO_GENERAL_DEFAULT;
}
function esPaganPedido(pedido) {
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  const cliente = obj?.clienteIdLocal ? (DB.clientes || []).find(c => String(c.idLocal || c.id_local) === String(obj.clienteIdLocal)) : null;
  return cliente?.productosEnFactura === 'SE FACTURA';
}
// Solo cuenta lo que ya salió de depósito (ENTREGADO) — antes de eso no
// impactó al servicio (mismo criterio que Entregas: "recién al ENTREGADO
// impacta el costo al servicio").
function costoEntregadoPedido(pedido) {
  return itemsDePedido(pedido.id).reduce((s, i) => s + cantEfectiva(i) * (i.costoCongelado || 0), 0);
}

export function renderMargenPP() {
  const periodoId = ($('pp-margen-periodo-sel') || {}).value;
  const contMargen = $('pp-margen-pagan'), contAhorro = $('pp-margen-nopagan');
  if (!periodoId) {
    if (contMargen) contMargen.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</p>';
    if (contAhorro) contAhorro.innerHTML = '';
    return;
  }
  const pedidos = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId) && p.estado === 'entregado');
  const obj = (codigo) => (DB.objetivos || []).find(o => o.codigo === codigo);

  // ---- PAGAN → MARGEN ----
  const pagan = pedidos.filter(esPaganPedido);
  if (contMargen) {
    if (!pagan.length) {
      contMargen.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">Sin servicios PAGAN entregados en este período todavía.</p>';
    } else {
      let totFact = 0, totCosto = 0;
      const filas = pagan.map(p => {
        const costo = costoEntregadoPedido(p);
        const recargo = recargoVigenteServicioPP(p.servicioCodigo);
        const facturado = costo * (1 + recargo);
        const margen = facturado - costo;
        const pctMargen = facturado > 0 ? (margen / facturado * 100) : 0;
        totFact += facturado; totCosto += costo;
        return { p, costo, facturado, margen, pctMargen };
      }).sort((a, b) => a.pctMargen - b.pctMargen);   // los de margen más bajo, primero — "salta a la vista"
      contMargen.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
          <div class="stat-card"><div class="stat-label">Facturado (precio venta)</div><div class="stat-valor">${_money(totFact)}</div></div>
          <div class="stat-card"><div class="stat-label">Entregado a costo (PPP)</div><div class="stat-valor">${_money(totCosto)}</div></div>
          <div class="stat-card verde"><div class="stat-label">Margen de productos</div><div class="stat-valor">${_money(totFact - totCosto)}</div></div>
        </div>
        <div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead><tr style="background:#374151;color:white;"><th style="padding:6px 10px;text-align:left;">Servicio</th><th style="padding:6px 8px;text-align:right;">Costo (PPP)</th><th style="padding:6px 8px;text-align:right;">Facturado</th><th style="padding:6px 8px;text-align:right;">Margen</th><th style="padding:6px 8px;text-align:right;">% margen</th></tr></thead>
          <tbody>${filas.map(f => `<tr${f.pctMargen < 15 ? ' style="background:var(--rojo-suave);"' : ''}>
            <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${obj(f.p.servicioCodigo)?.nombre || f.p.servicioCodigo}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(f.costo)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(f.facturado)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;font-weight:600;">${_money(f.margen)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;${f.pctMargen < 15 ? 'color:var(--rojo);font-weight:700;' : ''}">${f.pctMargen.toFixed(1)}%</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <p style="font-size:11px;color:var(--texto-muy-suave);">Filas en rojo: margen bajo 15% (umbral de referencia, sin definir con Lautaro todavía).</p>`;
    }
  }

  // ---- NO PAGAN → AHORRO ----
  const noPagan = pedidos.filter(p => !esPaganPedido(p));
  if (contAhorro) {
    if (!noPagan.length) {
      contAhorro.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">Sin servicios NO PAGAN entregados en este período todavía.</p>';
    } else {
      contAhorro.innerHTML = `<div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="background:#374151;color:white;"><th style="padding:6px 10px;text-align:left;">Servicio</th><th style="padding:6px 8px;text-align:right;">Presupuesto (costo)</th><th style="padding:6px 8px;text-align:right;">Entregado (costo)</th><th style="padding:6px 8px;">Consumo</th><th style="padding:6px 8px;text-align:right;">Ahorro</th></tr></thead>
        <tbody>${noPagan.map(p => {
          const presupuesto = presupuestoDelMesPP(p);
          const costo = costoEntregadoPedido(p);
          const pct = presupuesto > 0 ? Math.min(100, costo / presupuesto * 100) : 0;
          const ahorro = presupuesto - costo;
          const colorBarra = pct >= 95 ? 'var(--rojo)' : pct >= 80 ? 'var(--naranja)' : 'var(--verde)';
          return `<tr>
            <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${obj(p.servicioCodigo)?.nombre || p.servicioCodigo}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(presupuesto)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(costo)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);"><div style="background:var(--fondo);border-radius:4px;height:8px;width:100px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${colorBarra};"></div></div> <span style="font-size:10.5px;color:var(--texto-suave);">${pct.toFixed(0)}%</span></td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;font-weight:600;color:${ahorro < 0 ? 'var(--rojo)' : 'var(--verde)'};">${_money(ahorro)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p style="font-size:11px;color:var(--texto-muy-suave);">Un servicio pegado al 100% mes a mes es señal para revisar el consumo o el presupuesto. // TODO: pendiente mockup — la comparación mes a mes (¿pegado "siempre"?) todavía no está, esto es solo el período actual.</p>`;
    }
  }
}

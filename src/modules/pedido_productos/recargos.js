// Tab Recargos (ticket "Módulo productos" 31/08, punto 7/12). COSTO ≠
// RECARGO: el recargo es el margen de LOGÍSTICA y se define POR SERVICIO
// (no por producto) — un recargo GENERAL vigente + servicios con margen
// propio. PRECIO VENTA = costo × (1 + recargo del servicio), siempre
// calculado (ver precioVentaPP en pedido_productos.js), nunca cargado a mano.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
// Duplicada a propósito (no importada de pedido_productos.js): ese
// archivo necesita llamar a renderRecargosPP() para el cambio de tab —
// importar en el otro sentido acá sería una dependencia circular. Mismo
// criterio "sin dependencias circulares" que ya usa el proyecto
// (registerAuthCallbacks/registerNavCallbacks en auth.js/nav.js).
const RECARGO_GENERAL_DEFAULT = 0.30;
export function recargoVigenteServicioPP(servicioCodigo) {
  const propio = (DB.ppRecargoServicio || []).find(r => r.servicioCodigo === servicioCodigo && !r.anulado && !r.vigenciaHasta);
  if (propio) return { pct: Number(propio.pct) || 0, propio: true };
  const general = (DB.ppRecargoGeneral || []).filter(r => !r.anulado && !r.vigenciaHasta).sort((a, b) => (b.vigenciaDesde || '').localeCompare(a.vigenciaDesde || ''))[0];
  return { pct: general ? Number(general.pct) || 0 : RECARGO_GENERAL_DEFAULT, propio: false };
}
function mesActualStr() { return new Date().toISOString().slice(0, 7); }
function pctTxt(n) { return (Number(n) * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + '%'; }

function recargoGeneralVigente() {
  return (DB.ppRecargoGeneral || []).filter(r => !r.anulado && !r.vigenciaHasta).sort((a, b) => (b.vigenciaDesde || '').localeCompare(a.vigenciaDesde || ''))[0] || null;
}
// Servicios PAGAN: nace SOLO del padrón (objetivos Operativos cuyo
// cliente factura productos) — nunca una lista cargada aparte, así no se
// puede desincronizar de Comercial.
function serviciosPaganPP() {
  return (DB.objetivos || []).filter(o => {
    if (o.estado !== 'Operativo' || o.anulado) return false;
    const cliente = o.clienteIdLocal ? (DB.clientes || []).find(c => String(c.idLocal || c.id_local) === String(o.clienteIdLocal)) : null;
    return cliente?.productosEnFactura === 'SE FACTURA';
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function renderRecargosPP() {
  renderRecargoGeneralPP();
  renderRecargosServicioPP();
}

function renderRecargoGeneralPP() {
  const cont = $('pp-recargo-general'); if (!cont) return;
  const vigente = recargoGeneralVigente();
  const historial = (DB.ppRecargoGeneral || []).filter(r => !r.anulado).sort((a, b) => (b.vigenciaDesde || '').localeCompare(a.vigenciaDesde || ''));
  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div><div class="stat-label">Recargo GENERAL vigente</div><div class="stat-valor">${vigente ? pctTxt(vigente.pct) : '—'}</div></div>
      <div style="font-size:12px;color:var(--texto-suave);">${vigente ? `desde ${vigente.vigenciaDesde}` : 'sin cargar todavía'}</div>
      <button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="abrirNuevoRecargoGeneralPP()">Cargar nuevo</button>
    </div>
    ${historial.length > 1 ? `<div style="margin-top:10px;"><b style="font-size:11.5px;color:var(--texto-suave);">HISTORIAL</b>
      ${historial.map(r => `<div style="font-size:12px;padding:3px 0;">${pctTxt(r.pct)} — desde ${r.vigenciaDesde}${r.vigenciaHasta ? ' hasta ' + r.vigenciaHasta : ' (vigente)'} · ${r.cargadoPor || '—'}${r.motivo ? ' — ' + r.motivo : ''}</div>`).join('')}
    </div>` : ''}`;
}

let _ppRecargoServicioTemp = null;
export function abrirNuevoRecargoGeneralPP() {
  _ppRecargoServicioTemp = null;
  ensureModalRecargoPP();
  $('pp-recargo-titulo').textContent = 'Cargar recargo GENERAL';
  $('pp-recargo-pct').value = ''; $('pp-recargo-desde').value = mesActualStr(); $('pp-recargo-motivo').value = '';
  abrirModal('modal-pp-recargo');
}
export function abrirCargarRecargoPropioPP(servicioCodigo) {
  _ppRecargoServicioTemp = servicioCodigo;
  ensureModalRecargoPP();
  const obj = (DB.objetivos || []).find(o => o.codigo === servicioCodigo);
  $('pp-recargo-titulo').textContent = `Cargar recargo propio — ${obj ? obj.nombre : servicioCodigo}`;
  $('pp-recargo-pct').value = ''; $('pp-recargo-desde').value = mesActualStr(); $('pp-recargo-motivo').value = '';
  abrirModal('modal-pp-recargo');
}
function ensureModalRecargoPP() {
  if ($('modal-pp-recargo')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-recargo';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="pp-recargo-titulo">Cargar recargo</h3><button class="btn-close" onclick="cerrarModal('modal-pp-recargo')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>% de recargo *</label><input type="number" min="0" step="0.1" id="pp-recargo-pct" placeholder="Ej: 30"></div>
        <div class="form-group"><label>Vigente desde (mes) *</label><input type="month" id="pp-recargo-desde"></div>
        <div class="form-group"><label>Motivo</label><input type="text" id="pp-recargo-motivo"></div>
        <p style="font-size:11.5px;color:var(--texto-suave);">Lo ya facturado no se toca — el cambio rige desde el mes elegido hacia adelante.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-recargo')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarRecargoPP()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export async function guardarRecargoPP() {
  const pct = parseFloat(($('pp-recargo-pct') || {}).value);
  const desde = ($('pp-recargo-desde') || {}).value;
  const motivo = (($('pp-recargo-motivo') || {}).value || '').trim();
  if (isNaN(pct) || pct < 0) { toast('⚠️ Ingresá un % válido'); return; }
  if (!desde) { toast('⚠️ Falta el mes de vigencia'); return; }
  const esGeneral = !_ppRecargoServicioTemp;
  const tabla = esGeneral ? 'ppRecargoGeneral' : 'ppRecargoServicio';

  const anterior = esGeneral ? recargoGeneralVigente() : (DB.ppRecargoServicio || []).find(r => r.servicioCodigo === _ppRecargoServicioTemp && !r.anulado && !r.vigenciaHasta);
  if (anterior) {
    const cierre = new Date(desde + '-01T12:00:00'); cierre.setDate(cierre.getDate() - 1);
    anterior.vigenciaHasta = cierre.toISOString().slice(0, 7);
    await supaSync(tabla, anterior);
  }
  const nuevo = {
    id: _id(esGeneral ? 'PPRG' : 'PPRS'), pct: pct / 100, vigenciaDesde: desde, vigenciaHasta: null,
    cargadoPor: currentUser?.nombre || '', motivo, anulado: false,
    ...(esGeneral ? {} : { servicioCodigo: _ppRecargoServicioTemp }),
  };
  if (!DB[tabla]) DB[tabla] = [];
  DB[tabla].push(nuevo);
  await supaSync(tabla, nuevo);

  cerrarModal('modal-pp-recargo');
  renderRecargosPP();
  toast(`✓ Recargo ${esGeneral ? 'general' : 'propio'} guardado — ${pct}% desde ${desde}`);
}

function renderRecargosServicioPP() {
  const tbody = $('tbody-pp-recargos-servicio'); if (!tbody) return;
  const servicios = serviciosPaganPP();
  if (!servicios.length) { tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--texto-muy-suave);">Ningún servicio PAGAN en el padrón todavía.</td></tr>'; return; }
  tbody.innerHTML = servicios.map(o => {
    const r = recargoVigenteServicioPP(o.codigo);
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);">${o.nombre}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;${r.propio ? 'color:var(--azul);font-weight:700;' : 'color:var(--texto-suave);font-style:italic;'}">${pctTxt(r.pct)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${r.propio ? '<span class="badge" style="background:#1b3f9e;color:white;">propio</span>' : '<span class="badge" style="background:#eceef3;color:#5a6478;">heredado del general</span>'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><button class="btn btn-xs btn-secondary" onclick="abrirCargarRecargoPropioPP('${o.codigo}')">Cargar propio</button></td>
    </tr>`;
  }).join('');
}

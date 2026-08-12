// Descuentos por asociado — ticket "Descuentos por asociado (cuotas)".
// Descuentos financiados en cuotas con conceptos parametrizables
// (conceptos_descuento). La Liquidación (todavía en legacy.js) descuenta
// una cuota por período mientras el descuento esté "En curso" y tenga
// cuotas pendientes — mismo contrato que descuentos_uniforme_pendientes.
// Acá NO se cobra nada: se registra el compromiso y se muestra el
// avance; el consumo real lo hace autorizarPago() en legacy.js.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

export const idLocalTrunc = (id) => String(id).slice(-9);

export function getConceptoById(id) {
  const s = String(id || '');
  if (!s) return null;
  return (DB.conceptosDescuento || []).find(c =>
    String(c.idLocal || c.id) === s ||
    String(c.idLocal || c.id) === s.slice(-9));
}

export function getDescById(id) {
  return (DB.descuentos || []).find(d => String(d.id) === String(id));
}

function legajoDe(nro) {
  return (DB.legajos || []).find(l => String(l.nro) === String(nro));
}

function conceptoNombre(idLocal) {
  const c = (DB.conceptosDescuento || []).find(x => String(x.idLocal || x.id) === String(idLocal));
  return c?.nombre || '—';
}

function badgeEstado(e) {
  if (e === 'Terminado') return '<span class="badge badge-verde">Terminado</span>';
  if (e === 'Cancelado') return '<span class="badge badge-gris">Cancelado</span>';
  return '<span class="badge badge-acento">En curso</span>';
}

// ========== TAB 1 — DESCUENTOS ==========

export function filtrarDescuentos() { renderDescuentos(); }

function poblarFiltroConcepto() {
  const sel = $('desc-concepto-fil');
  if (!sel) return;
  const actual = sel.value;
  const conceptos = (DB.conceptosDescuento || []).filter(c => !c.anulado)
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  sel.innerHTML = '<option value="">Todos los conceptos</option>' + conceptos
    .map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  sel.value = actual;
}

export function renderDescuentos() {
  if (!DB.descuentos) DB.descuentos = [];
  poblarFiltroConcepto();
  let filas = (DB.descuentos || []).filter(d => !d.anulado);
  const q = ($('desc-buscar') || {}).value?.toLowerCase() || '';
  const fConcepto = ($('desc-concepto-fil') || {}).value || '';
  const fEstado = ($('desc-estado-fil') || {}).value || '';
  if (q) {
    filas = filas.filter(d => {
      const leg = legajoDe(d.legajoIdLocal);
      const texto = (leg?.nombre || '') + ' ' + (leg?.nro || '');
      return texto.toLowerCase().includes(q);
    });
  }
  if (fConcepto) filas = filas.filter(d => String(d.conceptoIdLocal) === idLocalTrunc(fConcepto));
  if (fEstado) filas = filas.filter(d => d.estado === fEstado);
  filas.sort((a, b) => new Date(b.fechaGenerado || 0) - new Date(a.fechaGenerado || 0));

  const tbody = $('tbody-descuentos');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:24px;opacity:.5;">Sin descuentos cargados</td></tr>'
    : filas.map(d => {
      const leg = legajoDe(d.legajoIdLocal);
      const pendientes = (d.cuotasTotales || 0) - (d.cuotasCobradas || 0);
      const activo = d.estado === 'En curso' && pendientes > 0;
      return `<tr>
        <td>${leg?.nombre || '—'}<div style="font-size:10px;opacity:.6;">Nº ${leg?.nro || d.legajoIdLocal}</div></td>
        <td>${conceptoNombre(d.conceptoIdLocal)}</td>
        <td style="text-align:right;">$${(d.montoTotal || 0).toLocaleString('es-AR')}</td>
        <td style="text-align:right;">$${(d.montoCuota || 0).toLocaleString('es-AR')}</td>
        <td>${d.cuotasTotales}</td>
        <td>${d.cuotasCobradas}</td>
        <td>${pendientes}</td>
        <td>${d.periodoInicio || '—'}</td>
        <td>${badgeEstado(d.estado)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="abrirEditarDescuento('${d.id}')">✏️</button>
          ${activo ? `<button class="btn btn-secondary btn-sm" onclick="marcarCuotaCobrada('${d.id}')" title="Registrar una cuota como cobrada">✔</button>` : ''}
          ${d.estado === 'En curso' ? `<button class="btn btn-secondary btn-sm" onclick="anularDescuento('${d.id}')" title="Anular descuento">🚫</button>` : ''}
        </td>
      </tr>`;
    }).join('');
}

export function abrirNuevoDescuento() {
  poblarSelectsDescuentoModal('');
  $('des-modal-titulo').textContent = 'Nuevo descuento por asociado';
  $('des-id').value = '';
  $('des-monto-total').value = '';
  $('des-cuotas').value = '1';
  $('des-monto-cuota').value = '';
  $('des-periodo-inicio').value = new Date().toISOString().slice(0, 7);
  $('des-observacion').value = '';
  recalcularMontoCuota();
  window.abrirModal('modal-nuevo-descuento');
}

export function abrirEditarDescuento(id) {
  const d = getDescById(id);
  if (!d) { toast('⚠️ No se encontró el descuento'); return; }
  poblarSelectsDescuentoModal(String(d.id));
  $('des-modal-titulo').textContent = 'Editar descuento';
  $('des-id').value = d.id;
  $('des-asociado').value = d.legajoIdLocal || '';
  $('des-concepto').value = d.conceptoIdLocal ? (getConceptoById(d.conceptoIdLocal)?.id || '') : '';
  $('des-monto-total').value = d.montoTotal ?? '';
  $('des-cuotas').value = d.cuotasTotales ?? 1;
  $('des-monto-cuota').value = d.montoCuota ?? '';
  $('des-periodo-inicio').value = d.periodoInicio || '';
  $('des-observacion').value = d.observacion || '';
  window.abrirModal('modal-nuevo-descuento');
}

function poblarSelectsDescuentoModal(idSeleccionado) {
  const asoc = $('des-asociado');
  if (asoc) {
    asoc.innerHTML = '<option value="">Seleccionar asociado...</option>' + (DB.legajos || [])
      .filter(l => l.nombre)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      .map(l => `<option value="${l.nro}">${l.nombre} — Nº ${l.nro}</option>`).join('');
  }
  const conc = $('des-concepto');
  if (conc) {
    const conceptos = (DB.conceptosDescuento || []).filter(c => !c.anulado)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    conc.innerHTML = '<option value="">Seleccionar concepto...</option>' + conceptos
      .map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  }
  if (idSeleccionado) {
    const d = getDescById(idSeleccionado);
    if (asoc && d) asoc.value = d.legajoIdLocal || '';
    if (conc && d?.conceptoIdLocal) {
      const c = getConceptoById(d.conceptoIdLocal);
      conc.value = c?.id || '';
    }
  }
}

export function recalcularMontoCuota() {
  const total = parseFloat($('des-monto-total')?.value) || 0;
  const cuotas = parseInt($('des-cuotas')?.value) || 1;
  $('des-monto-cuota').value = cuotas > 0 ? Math.round((total / cuotas) * 100) / 100 : '';
}

export async function guardarDescuento() {
  const legajoNro = $('des-asociado').value;
  const concepto = getConceptoById($('des-concepto').value);
  const montoTotal = parseFloat($('des-monto-total').value) || 0;
  const cuotas = parseInt($('des-cuotas').value) || 1;
  const montoCuota = parseFloat($('des-monto-cuota').value) || 0;
  const periodoInicio = $('des-periodo-inicio').value || null;
  const observacion = ($('des-observacion').value || '').trim();

  if (!legajoNro) { toast('⚠️ Seleccioná el asociado'); return; }
  if (!concepto) { toast('⚠️ Seleccioná el concepto'); return; }
  if (montoTotal <= 0) { toast('⚠️ Ingresá un monto total válido'); return; }
  if (cuotas < 1) { toast('⚠️ Las cuotas deben ser al menos 1'); return; }
  if (montoCuota <= 0) { toast('⚠️ Monto por cuota inválido'); return; }
  if (periodoInicio && !/^\d{4}-\d{2}$/.test(periodoInicio)) { toast('⚠️ Mes de inicio inválido'); return; }

  const idEditar = $('des-id').value;
  const d = idEditar ? getDescById(idEditar) : null;
  if (idEditar && !d) { toast('⚠️ No se encontró el descuento'); return; }

  const datos = {
    conceptoIdLocal: idLocalTrunc(concepto.id),
    legajoIdLocal: String(legajoNro),
    montoTotal,
    cuotasTotales: cuotas,
    cuotasCobradas: d?.cuotasCobradas || 0,
    montoCuota,
    periodoInicio,
    estado: d?.estado || 'En curso',
    fechaGenerado: d?.fechaGenerado || new Date().toISOString(),
    observacion,
  };

  if (d) Object.assign(d, datos);
  else {
    const nuevo = { id: Date.now(), ...datos };
    if (!DB.descuentos) DB.descuentos = [];
    DB.descuentos.push(nuevo);
  }
  const guardado = d || DB.descuentos[DB.descuentos.length - 1];
  await supaSync('descuentos', guardado);
  window.cerrarModal('modal-nuevo-descuento');
  renderDescuentos();
  toast(idEditar ? '✅ Descuento actualizado' : '✅ Descuento cargado — se descuenta en la próxima liquidación');
}

export async function marcarCuotaCobrada(id) {
  const d = getDescById(id);
  if (!d) { toast('⚠️ No se encontró el descuento'); return; }
  if (d.estado !== 'En curso' || (d.cuotasCobradas || 0) >= (d.cuotasTotales || 0)) { toast('⚠️ No quedan cuotas pendientes'); return; }
  d.cuotasCobradas = (d.cuotasCobradas || 0) + 1;
  if (d.cuotasCobradas >= d.cuotasTotales) d.estado = 'Terminado';
  await supaSync('descuentos', d);
  renderDescuentos();
  toast('✔ Cuota registrada como cobrada');
}

export async function anularDescuento(id) {
  const d = getDescById(id);
  if (!d) { toast('⚠️ No se encontró el descuento'); return; }
  if (!confirm('🚫 ¿Anular este descuento? Dejará de descontarse en las próximas liquidaciones.')) return;
  d.anulado = true;
  d.estado = 'Cancelado';
  await supaSync('descuentos', d);
  renderDescuentos();
  toast('🚫 Descuento anulado');
}

// ========== TAB 2 — CONCEPTOS ==========

export function renderConceptos() {
  const filas = (DB.conceptosDescuento || []).filter(c => !c.anulado)
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const tbody = $('tbody-conceptos-descuento');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="4" style="text-align:center;padding:24px;opacity:.5;">Sin conceptos — creá el primero con "+ Nuevo concepto"</td></tr>'
    : filas.map(c => `
      <tr>
        <td>${c.nombre}</td>
        <td>${c.cuotasMaximas || 1}</td>
        <td>${c.activo ? '<span class="badge badge-verde">Activo</span>' : '<span class="badge badge-gris">Inactivo</span>'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="abrirEditarConcepto('${c.id}')">✏️</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleConceptoActivo('${c.id}')">${c.activo ? '⏸' : '▶'}</button>
        </td>
      </tr>`).join('');
}

export function abrirNuevoConcepto() {
  $('dc-modal-titulo').textContent = 'Nuevo concepto de descuento';
  $('dc-id').value = '';
  $('dc-nombre').value = '';
  $('dc-cuotas-maximas').value = '1';
  window.abrirModal('modal-nuevo-concepto');
}

export function abrirEditarConcepto(id) {
  const c = (DB.conceptosDescuento || []).find(x => String(x.id) === String(id));
  if (!c) { toast('⚠️ No se encontró el concepto'); return; }
  $('dc-modal-titulo').textContent = 'Editar concepto';
  $('dc-id').value = c.id;
  $('dc-nombre').value = c.nombre || '';
  $('dc-cuotas-maximas').value = c.cuotasMaximas || 1;
  window.abrirModal('modal-nuevo-concepto');
}

export async function guardarConcepto() {
  const nombre = ($('dc-nombre').value || '').trim();
  const cuotasMaximas = parseInt($('dc-cuotas-maximas').value) || 1;
  if (!nombre) { toast('⚠️ Ingresá el nombre del concepto'); return; }
  if (cuotasMaximas < 1) { toast('⚠️ Las cuotas máximas deben ser al menos 1'); return; }

  const idEditar = $('dc-id').value;
  if (idEditar) {
    const c = (DB.conceptosDescuento || []).find(x => String(x.id) === String(idEditar));
    if (!c) { toast('⚠️ No se encontró el concepto'); return; }
    c.nombre = nombre;
    c.cuotasMaximas = cuotasMaximas;
    await supaSync('conceptosDescuento', c);
  } else {
    const c = { id: Date.now(), nombre, cuotasMaximas, activo: true };
    if (!DB.conceptosDescuento) DB.conceptosDescuento = [];
    DB.conceptosDescuento.push(c);
    await supaSync('conceptosDescuento', c);
  }
  window.cerrarModal('modal-nuevo-concepto');
  renderConceptos();
  renderDescuentos();
  toast('✅ Concepto guardado');
}

export async function toggleConceptoActivo(id) {
  const c = (DB.conceptosDescuento || []).find(x => String(x.id) === String(id));
  if (!c) { toast('⚠️ No se encontró el concepto'); return; }
  c.activo = !c.activo;
  await supaSync('conceptosDescuento', c);
  renderConceptos();
  renderDescuentos();
  toast(c.activo ? '▶ Concepto activado' : '⏸ Concepto desactivado');
}

// ========== TABS ==========

const RENDER_POR_TAB = {
  descuentos: renderDescuentos,
  conceptos: renderConceptos,
};

export function cambiarTabDescuentos(tab, btn) {
  document.querySelectorAll('#screen-descuentos .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-descuentos .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-descuentos .tab-btn[data-descuentos-tab="${tab}"]`)?.classList.add('active');
  $('descuentos-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

// Pedidos de Adelantos — Tab "📋 Pedido del período"
// (PEDIDOS_ADELANTOS_para_Fede_2.md §2 + mockup_pedidos_adelantos_2.html).
// Planilla precargada con el equipo del supervisor, agrupada por
// servicio — misma cadena usuario → persona → servicios asignados que
// ya usan Uniformes y Pedido de productos (operariosParaSolicitante).
// Solo carga tipo ADELANTO: los préstamos siguen entrando por "+ Nuevo
// pedido" individual (llevan cuotas, acá no aplican). Fila sin monto no
// viaja — el único campo editable es el monto.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { operariosParaSolicitante } from '@modules/uniformes/politica.js';
import { crearPedidoAdelanto, elevarPedido } from '../adelantos_prestamos_shared/flujo.js';
import { renderMisPedidos } from './pedidos.js';

function hoyISOLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function _mesActual() { return hoyISOLocal().slice(0, 7); }
function _mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function _fmt(n) { return n > 0 ? '$' + Number(n).toLocaleString('es-AR') : '—'; }

function _nombreServicio(codigo) {
  if (!codigo) return 'Sin servicio asignado';
  const obj = (DB.objetivos || []).find(o => o.codigo === codigo && !o.anulado);
  return obj?.nombre || codigo;
}

// ADELANTOS_bugs_para_Fede.md, bug 2 (18/09): operariosParaSolicitante()
// (compartida con Uniformes/Pedido de productos) solo filtra por
// legajo.estado==='Activo' — no chequea si el SERVICIO sigue operativo
// ni si el asociado tiene asignación vigente este período, así que
// traía servicios ya dados de baja (CENARD, DEPOSITO.SELECT,
// FO.HIT.PIRELLI...). No se toca esa función compartida (afectaría
// Uniformes/Pedido de productos sin pedirlo) — se filtra acá, localmente,
// contra la MISMA fuente que arma las grillas del período: si la grilla
// de este mes no tiene ese servicio/asociado, la planilla de adelantos
// tampoco lo muestra.
function _serviciosOperativosVigentes() {
  return new Set((DB.objetivos || []).filter(o => o.estado === 'Operativo' && !o.anulado).map(o => o.codigo));
}
function _asociadosConGrillaVigente(mes) {
  const nros = new Set();
  (DB.grillasLiq || []).filter(g => g.periodo === mes).forEach(g => {
    (g.asociados || []).forEach(a => { if (a.nro != null) nros.add(String(a.nro)); });
  });
  return nros;
}

// HS verificadas del período — mismo criterio que Liquidación de horas
// (estadoDia==='ver'), sumadas en TODAS las grillas donde la persona
// tenga horas cargadas este mes. Reutiliza diaEstaVerificado/
// horasCobradasDia de legacy.js (expuestos a propósito) para no
// duplicar la regla de negocio.
function _horasVerificadasMes(nombreAsociado, mes) {
  if (!window.diaEstaVerificado || !window.horasCobradasDia) return 0;
  let total = 0;
  (DB.grillasLiq || []).filter(g => g.periodo === mes).forEach(g => {
    const asoc = (g.asociados || []).find(a => a.nombre === nombreAsociado);
    if (!asoc) return;
    Object.keys(asoc.horas || {}).forEach(iso => {
      if (window.diaEstaVerificado(asoc, iso)) total += window.horasCobradasDia(asoc, iso);
    });
  });
  return total;
}

function _adelantoPeriodoAnterior(legajoNro, mesAnt) {
  const p = (DB.pedidosAdelantos || []).find(x => !x.anulado && String(x.legajoIdLocal) === String(legajoNro)
    && x.periodo === mesAnt && !['Cancelada', 'Rechazada RRHH'].includes(x.estado));
  return p ? Number(p.monto) || 0 : 0;
}

// Adelanto ya elevado/aprobado/depositado este período para el mismo
// legajo — desde CUALQUIER origen (otro supervisor, o el modal "+ Nuevo
// pedido" individual). Evita el doble adelanto entre servicios
// compartidos.
function _adelantoVigenteMismoPeriodo(legajoNro, mes) {
  return (DB.pedidosAdelantos || []).find(x => !x.anulado && String(x.legajoIdLocal) === String(legajoNro)
    && x.periodo === mes && ['Enviada', 'Aprobada RRHH', 'Aprobada'].includes(x.estado));
}

let _planilla = null; // { mes, mesAnt, grupos:[{codigo,nombre,legajos:[{legajo,hsVerif,prev,existente}]}] }

function _construirPlanilla() {
  const mes = _mesActual();
  const mesAnt = _mesAnterior(mes);
  const serviciosOperativos = _serviciosOperativosVigentes();
  const asociadosConGrilla = _asociadosConGrillaVigente(mes);
  const equipo = operariosParaSolicitante().filter(l =>
    serviciosOperativos.has(l.servicio) && asociadosConGrilla.has(String(l.nro)));
  const porServicio = new Map();
  equipo.forEach(l => {
    const cod = l.servicio || '';
    if (!porServicio.has(cod)) porServicio.set(cod, []);
    porServicio.get(cod).push(l);
  });
  const grupos = [...porServicio.entries()].map(([codigo, legajos]) => ({
    codigo, nombre: _nombreServicio(codigo),
    legajos: legajos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')).map(legajo => ({
      legajo,
      hsVerif: _horasVerificadasMes(legajo.nombre, mes),
      prev: _adelantoPeriodoAnterior(legajo.nro, mesAnt),
      existente: _adelantoVigenteMismoPeriodo(legajo.nro, mes),
    })),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  _planilla = { mes, mesAnt, grupos };
  return _planilla;
}

function _leerMonto(nro) {
  const inp = $('plamonto-' + nro);
  if (!inp) return 0;
  const v = (inp.value || '').replace(/[^0-9]/g, '');
  return v ? parseInt(v, 10) : 0;
}

function _avisosFila(fila, monto) {
  const avisos = [];
  if (fila.existente) {
    const mismoSup = fila.existente.supervisorNombre === (currentUser?.nombre || '');
    avisos.push(mismoSup
      ? `Ya tiene un adelanto elevado este período: $${Number(fila.existente.monto).toLocaleString('es-AR')}`
      : `Ya tiene un adelanto elevado/aprobado este período por otro supervisor: $${Number(fila.existente.monto).toLocaleString('es-AR')} (sup. ${fila.existente.supervisorNombre})`);
  }
  if (monto > 0 && fila.hsVerif === 0) avisos.push('Sin horas verificadas en el período');
  return avisos;
}

function _actualizarAvisosFila(fila) {
  const span = $('plawarn-' + fila.legajo.nro);
  if (!span) return;
  const monto = _leerMonto(fila.legajo.nro);
  const avisos = _avisosFila(fila, monto);
  span.innerHTML = avisos.map(a => `<span class="badge badge-rojo" style="display:block;margin:2px 0;white-space:normal;font-weight:500;">⚠ ${a}</span>`).join('');
}

function _todasLasFilas() {
  return (_planilla?.grupos || []).flatMap(g => g.legajos);
}

export function recalcPlanilla(nro) {
  if (nro) {
    const fila = _todasLasFilas().find(f => f.legajo.nro === nro);
    if (fila) _actualizarAvisosFila(fila);
  }
  let n = 0, tot = 0;
  _todasLasFilas().forEach(f => { const m = _leerMonto(f.legajo.nro); if (m > 0) { n++; tot += m; } });
  if ($('kpi-padl-pla-aso')) $('kpi-padl-pla-aso').textContent = n;
  if ($('kpi-padl-pla-tot')) $('kpi-padl-pla-tot').textContent = '$' + tot.toLocaleString('es-AR');
  if ($('padl-pla-bar-tot')) $('padl-pla-bar-tot').textContent = `${n} asociado${n === 1 ? '' : 's'} · $${tot.toLocaleString('es-AR')}`;
  if ($('padl-pla-bar-det')) $('padl-pla-bar-det').textContent = n > 0 ? 'Solo se elevan las filas con monto' : '';
  if ($('btn-padl-pla-elevar')) $('btn-padl-pla-elevar').disabled = n === 0;
}

export function renderPedidoPeriodo() {
  const { mes, grupos } = _construirPlanilla();
  if ($('padl-pla-titulo')) $('padl-pla-titulo').textContent = `Pedido del período — ${new Date(mes + '-01T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).toUpperCase()}`;
  if ($('kpi-padl-pla-equipo')) $('kpi-padl-pla-equipo').textContent = _todasLasFilas().length;

  const tbody = $('tbody-padl-planilla');
  if (!tbody) return;
  if (!grupos.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;opacity:.5;">No tenés asociados a cargo.</td></tr>';
    recalcPlanilla();
    return;
  }
  tbody.innerHTML = grupos.map(g => {
    const filaSrv = `<tr><td colspan="7" style="background:#eef2fa;font-weight:700;color:var(--azul);font-size:12.5px;padding:7px 10px;">🏷 ${g.nombre} <span style="font-weight:500;color:var(--texto-suave);font-size:12px;">· ${g.legajos.length} asociado${g.legajos.length === 1 ? '' : 's'}</span></td></tr>`;
    const filas = g.legajos.map(f => {
      const hsChip = f.hsVerif > 0 ? `<span class="badge badge-verde">${f.hsVerif} hs</span>` : `<span class="badge badge-gris">0 hs</span>`;
      return `<tr>
        <td>${f.legajo.nro}</td>
        <td>${f.legajo.nombre}</td>
        <td style="color:var(--texto-suave);font-size:12px;">${f.legajo.funcion || '—'}</td>
        <td style="text-align:right;">${hsChip}</td>
        <td style="text-align:right;color:var(--texto-suave);">${_fmt(f.prev)}</td>
        <td style="text-align:right;"><input type="text" inputmode="numeric" class="input-monto-planilla" id="plamonto-${f.legajo.nro}" placeholder="—" oninput="this.classList.remove('input-monto-prev');recalcPlanilla(${f.legajo.nro})"></td>
        <td><span id="plawarn-${f.legajo.nro}"></span></td>
      </tr>`;
    }).join('');
    return filaSrv + filas;
  }).join('');

  _todasLasFilas().forEach(_actualizarAvisosFila);
  recalcPlanilla();
}

export function traerMontosAnterior() {
  let traidos = 0;
  _todasLasFilas().forEach(f => {
    const inp = $('plamonto-' + f.legajo.nro);
    if (!inp) return;
    if (f.prev > 0 && !_leerMonto(f.legajo.nro)) {
      inp.value = f.prev.toLocaleString('es-AR');
      inp.classList.add('input-monto-prev');
      traidos++;
    }
  });
  recalcPlanilla();
  toast(`Se trajeron ${traidos} monto(s) del período anterior — revisalos y ajustá antes de elevar`);
}

// ========== RESUMEN + ELEVAR ==========

function _filasConMonto() {
  return _todasLasFilas().map(f => ({ fila: f, monto: _leerMonto(f.legajo.nro) })).filter(x => x.monto > 0);
}

export function abrirResumenPlanilla() {
  const filas = _filasConMonto();
  if (!filas.length) { toast('⚠️ Cargá el monto de al menos un asociado'); return; }
  ensureModalResumenPlanilla();
  let tot = 0, avisos = 0;
  const cuerpo = filas.map(({ fila, monto }) => {
    tot += monto;
    const a = _avisosFila(fila, monto);
    if (a.length) avisos++;
    return `<tr><td>${fila.legajo.nro} — ${fila.legajo.nombre}</td><td style="text-align:right;">$${monto.toLocaleString('es-AR')}</td><td>${a.length ? '<span class="badge badge-naranja">⚠ ' + a.length + '</span>' : '—'}</td></tr>`;
  }).join('');
  $('padl-resumen-body').innerHTML = `
    <table style="width:100%;font-size:13px;">
      <thead><tr><th style="text-align:left;padding:5px 0;">Asociado</th><th style="text-align:right;">Monto</th><th>Avisos</th></tr></thead>
      <tbody>${cuerpo}</tbody>
      <tfoot><tr style="font-weight:700;"><td style="padding-top:8px;">TOTAL — ${filas.length} asociado${filas.length === 1 ? '' : 's'}</td><td style="text-align:right;padding-top:8px;">$${tot.toLocaleString('es-AR')}</td><td></td></tr></tfoot>
    </table>
    ${avisos > 0 ? `<div class="alerta alerta-warning" style="font-size:12px;margin-top:10px;">⚠ Hay ${avisos} fila(s) con aviso. RRHH lo va a ver en la revisión.</div>` : ''}
  `;
  abrirModal('modal-padl-resumen');
}

function ensureModalResumenPlanilla() {
  if ($('modal-padl-resumen')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-padl-resumen';
  m.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header"><h3>Confirmar pedido del período</h3><button class="btn-close" onclick="cerrarModal('modal-padl-resumen')">×</button></div>
      <div class="modal-body">
        <div class="alerta alerta-info" style="font-size:12.5px;">Vas a elevar a RRHH el pedido de adelantos de este período. Solo viajan las filas con monto.</div>
        <div id="padl-resumen-body"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-padl-resumen')">Volver a revisar</button>
        <button id="btn-padl-confirmar-elevar" class="btn btn-primary" onclick="confirmarElevarPlanilla()">Confirmar y elevar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function guardarBorradorPlanilla() {
  // La planilla se recalcula en vivo desde las grillas/pedidos existentes
  // en cada visita — no hay "borrador" propio que persistir acá (a
  // diferencia del modal individual, que sí crea un registro en
  // Borrador). Guardar borrador == dejar los montos tipeados en pantalla.
  toast('Los montos quedan cargados en pantalla — "Guardar y elevar" cuando estés listo.');
}

// ADELANTOS_bugs_para_Fede.md, bug 3 fix 1 (18/09): "Guardar y elevar"
// seguía habilitado mientras guardaba — un segundo click (doble click
// real, o el típico "no vi que ya había tocado el botón") disparaba un
// segundo recorrido completo del for y duplicaba cada pedido. Guard de
// idempotencia + botón deshabilitado con "Enviando…" hasta la respuesta.
let _elevandoPlanilla = false;

export async function confirmarElevarPlanilla() {
  if (_elevandoPlanilla) return;
  const filas = _filasConMonto();
  if (!filas.length) return;
  _elevandoPlanilla = true;
  const btn = $('btn-padl-confirmar-elevar');
  const textoOriginal = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const fechaPedido = hoyISOLocal();
    for (const { fila, monto } of filas) {
      const avisos = _avisosFila(fila, monto);
      const pedido = await crearPedidoAdelanto({
        legajo: fila.legajo, monto, fechaPedido,
        observaciones: 'Cargado desde Pedido del período',
      });
      if (avisos.length) {
        pedido.avisos = avisos;
        const { supaSync } = await import('@shared/supabase.js');
        await supaSync('pedidosAdelantos', pedido);
      }
      await elevarPedido('Adelanto', pedido.id);
    }
    cerrarModal('modal-padl-resumen');
    toast(`✅ Pedido del período elevado a RRHH — ${filas.length} asociado(s)`);
    renderPedidoPeriodo();
    renderMisPedidos();
  } finally {
    _elevandoPlanilla = false;
    if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
  }
}

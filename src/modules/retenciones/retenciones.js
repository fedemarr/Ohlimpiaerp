// Módulo Retenciones — retenciones sobre haberes ("se retiene el retiro
// de un asociado", no confundir con retenciones impositivas AFIP).
//
// REDISEÑO v126 (ticket "Módulo Retenciones", basado en
// mockup_retenciones_3.html) — reemplaza el diseño anterior (v076:
// candidatos automáticos Art.42/Baja/Legal + reporte del supervisor).
// El ticket llegó con 2 supuestos incorrectos (dominio AFIP + "el módulo
// no existe") — se investigó, se confirmaron 3 decisiones con el usuario
// (todas "Recomendado" en el AskUserQuestion) y se rediseñó desde acá:
//   1. Se elimina el flujo de reporte del supervisor y los candidatos
//      automáticos genéricos — el mockup deja Retenciones 100% en manos
//      de RRHH/Finanzas (Supervisor mantiene el módulo en su menú pero
//      solo lectura, igual que Finanzas en Liquidaciones).
//   2. El alcance "Total" (retiene el retiro COMPLETO del período,
//      dinámico según horas ya cargadas) se implementa ahora, enganchado
//      a Liquidación de horas — no se difiere a una iteración futura.
//   3. "Aplicar como descuento → Uniformes" reutiliza el circuito real
//      que ya existe: confirmarCierreDevolucion() en
//      src/modules/uniformes/devoluciones.js crea filas en
//      DB.descuentosUniformePendientes, ya consumidas por
//      descuentosAutomaticosLegajo() en legacy.js — no se inventa un
//      circuito nuevo, se crea una fila con esa misma forma.
//
// CICLO DE VIDA
//   ACTIVA (recurrente: mientras siga Activa, CADA período nuevo desde
//           periodoDesde vuelve a retener — antes era un período exacto,
//           ahora es continuo, tal como pide el mockup)
//     → LIBERADA (todo o una parte — el resto sigue ACTIVA)
//         → PAGADA (al confirmar el pago; terminal)
//     → APLICADA (convierte el saldo en un descuento real; terminal)
//
// alcance:
//   'Total'   → retiene el BRUTO completo del período. NO se congela al
//               crear: descuentosAutomaticosLegajo()/_totalDescLegajo()
//               en legacy.js son quienes resuelven el monto contra el
//               bruto real de cada corrida y quienes persisten
//               montoAcumulado/periodosRetenidos recién cuando el pago
//               se autoriza de verdad (mismo criterio que ya usan las
//               cuotas de Uniformes/Préstamos: se consume al pagar, no
//               al calcular).
//   'Parcial' → tipoValor 'Monto' (fijo) o 'Porcentaje' del bruto — el
//               mismo campo/semántica que ya existía desde v076.
//
// Movimientos (DB.retencionesMovimientos): cada liberación o aplicación
// es una fila propia (tipo 'liberacion'|'aplicacion') — permite liberar o
// aplicar una PARTE del saldo sin perder el resto activo, y separa la
// auditoría de pago (fecha/comprobante/confirmadoPor) de la retención en
// sí. Simplificación deliberada respecto al mockup: no hay edición ni
// eliminación de una retención ya creada (el mockup tampoco las muestra
// como acción) — un alta errónea se corrige liberándola de inmediato con
// el motivo "Error de carga". Toda retención termina LIBERADA+PAGADA o
// APLICADA, nunca desaparece (cita textual del mockup).

import { DB, currentUser } from '@shared/state.js';
import { $, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, SUPA } from '@shared/supabase.js';
import { obtenerPrecioVigente } from '@modules/uniformes/precios.js';

const BUCKET_ADJUNTOS = 'ohlimpia-adjuntos';

const esSoloLectura = () => currentUser?.perfil === 'Supervisor';
const getRetencionById = (id) => (DB.retenciones || []).find(r => String(r.id) === String(id));
const getMovimientoById = (id) => (DB.retencionesMovimientos || []).find(m => String(m.id) === String(id));
const movimientosDe = (retencionId) => (DB.retencionesMovimientos || []).filter(m => !m.anulado && String(m.retencionIdLocal) === String(retencionId));
const legajoDe = (r) => (DB.legajos || []).find(l => String(l.nro) === String(r.nroSocio) || l.nombre === r.nombre);
const mesActualISO = () => new Date().toISOString().slice(0, 7);

// Lo efectivamente retenido acumulado menos lo ya liberado/aplicado.
function restanteDe(r) {
  const movs = movimientosDe(r.id).reduce((s, m) => s + (parseFloat(m.monto) || 0), 0);
  return Math.max(0, (parseFloat(r.montoAcumulado) || 0) - movs);
}

const MOTIVO_CHIP = {
  'Desvinculación — pendientes de devolución': 'badge-rojo',
  'Art. 42': 'badge-acento',
  'Sanción en proceso': 'badge-naranja',
  'Conflicto / legal': 'badge-azul',
  'Otro': 'badge-gris',
};

// ========== SUGERENCIA DEL SISTEMA (baja + devolución de Uniformes pendiente) ==========
// No persiste nada — se recalcula en cada render contra las órdenes de
// devolución de Uniformes todavía abiertas (RRHH no cerró la orden),
// dedupe por origenRef contra retenciones ya vivas para esa orden. El
// "Descartar" del mockup es una preferencia de sesión (no se persiste:
// es un aviso de bajo compromiso, no un dato de negocio).
const _descartadas = new Set();

export function sugerenciasRetencion() {
  const vigentes = (DB.retenciones || []).filter(r => !r.anulado && r.estado === 'Activa');
  const yaAbierta = (ordenId) => vigentes.some(r => String(r.origenRef) === String(ordenId));
  return (DB.devolucionesPorBaja || [])
    .filter(o => !o.anulado && o.estado === 'Pendiente devolución' && !yaAbierta(o.id) && !_descartadas.has(o.id))
    .map(o => {
      const valor = (o.prendasADevolver || []).reduce((s, p) => s + (obtenerPrecioVigente(p.prenda, null)?.precio || 0) * (p.cantidad || 0), 0);
      const cantPrendas = (o.prendasADevolver || []).reduce((s, p) => s + (p.cantidad || 0), 0);
      return { ordenId: o.id, nombre: o.nombreOperario, nroSocio: o.legajoIdLocal, fechaBaja: o.fechaBaja, cantPrendas, valor };
    });
}

function renderSugerenciasRetencion() {
  const cont = $('ret-sugerencias');
  if (!cont) return;
  if (esSoloLectura()) { cont.innerHTML = ''; return; }
  const sug = sugerenciasRetencion();
  if (!sug.length) { cont.innerHTML = ''; return; }
  cont.innerHTML = sug.map(s => `
    <div class="ret-sug" data-orden="${s.ordenId}" style="background:#fff8ec;border:1px dashed #dfa94f;border-radius:9px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12.5px;">
      <div>🤖 <b>Sugerencia del sistema:</b> <b>${s.nroSocio || '—'} · ${s.nombre}</b> tiene <b>baja el ${s.fechaBaja || '—'}</b> con
        <b>${s.cantPrendas} prenda${s.cantPrendas !== 1 ? 's' : ''} sin devolver</b> (orden de devolución de Uniformes abierta,
        valor $${s.valor.toLocaleString('es-AR')}). ¿Retener el último retiro hasta que devuelva?</div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button class="btn btn-primary btn-sm" data-sug-crear="${s.ordenId}">Crear retención</button>
        <button class="btn btn-secondary btn-sm" data-sug-descartar="${s.ordenId}">Descartar</button>
      </div>
    </div>`).join('');
  cont.querySelectorAll('button[data-sug-crear]').forEach(btn => {
    btn.onclick = () => crearRetencionDesdeSugerencia(parseInt(btn.dataset.sugCrear));
  });
  cont.querySelectorAll('button[data-sug-descartar]').forEach(btn => {
    btn.onclick = () => { _descartadas.add(parseInt(btn.dataset.sugDescartar)); renderSugerenciasRetencion(); };
  });
}

export function crearRetencionDesdeSugerencia(ordenId) {
  const orden = (DB.devolucionesPorBaja || []).find(o => o.id === ordenId);
  if (!orden) return;
  _abrirModalNuevaRetencion({
    nombre: orden.nombreOperario,
    nroSocio: orden.legajoIdLocal,
    motivoTipificado: 'Desvinculación — pendientes de devolución',
    alcance: 'Total',
    descripcion: `Baja con ${(orden.prendasADevolver || []).map(p => `${p.cantidad}x ${p.prenda}`).join(', ')} sin devolver (orden de devolución #${orden.id} de Uniformes).`,
    origenRef: String(ordenId),
  });
}

// ========== RENDER ==========

let _tabActual = 'activas';

export function cambiarTabRetencion(tab, btn) {
  _tabActual = tab;
  document.querySelectorAll('#screen-retenciones .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-retenciones .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-retenciones .tab-btn[data-ret-tab="${tab}"]`)?.classList.add('active');
  $('ret-tab-' + tab)?.classList.add('active');
  renderRetenciones();
}

export function renderRetenciones() {
  renderSugerenciasRetencion();

  const activas = (DB.retenciones || []).filter(r => !r.anulado && r.estado === 'Activa');
  const historial = (DB.retenciones || []).filter(r => !r.anulado && ['Pagada', 'Aplicada'].includes(r.estado));
  const liberaciones = (DB.retencionesMovimientos || []).filter(m => !m.anulado && m.tipo === 'liberacion');
  const mesActual = mesActualISO();
  const aplicadasMes = (DB.retencionesMovimientos || []).filter(m => !m.anulado && m.tipo === 'aplicacion' && (m.creadoEn || '').slice(0, 7) === mesActual);

  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('kpi-ret-activas', activas.length);
  ss('kpi-ret-acumulado', '$' + activas.reduce((s, r) => s + restanteDe(r), 0).toLocaleString('es-AR'));
  ss('kpi-ret-pendientes', liberaciones.filter(m => m.estadoPago === 'Pendiente').length);
  ss('kpi-ret-aplicadas', aplicadasMes.length);
  const badgePend = $('badge-ret-pendientes');
  if (badgePend) {
    const n = liberaciones.filter(m => m.estadoPago === 'Pendiente').length;
    badgePend.textContent = n ? n + ' pendiente' + (n !== 1 ? 's' : '') : 'al día';
    badgePend.className = 'badge ' + (n ? 'badge-rojo' : 'badge-verde');
    badgePend.style.fontSize = '10px';
  }

  if (_tabActual === 'activas') renderTabActivas(activas);
  else if (_tabActual === 'liberadas') renderTabLiberadas(liberaciones);
  else renderTabHistorial(historial);
}

function renderTabActivas(activas) {
  const tbody = $('tbody-ret-activas');
  if (!tbody) return;
  if (!activas.length) { tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin retenciones activas.</td></tr>'; return; }
  tbody.innerHTML = activas.map(r => {
    const leg = legajoDe(r);
    const sub = leg?.estado === 'Baja' ? `BAJA ${leg.fechaBaja || ''}` : (leg?.servicio || '');
    const chipCls = MOTIVO_CHIP[r.motivoTipificado] || 'badge-gris';
    const alcanceHtml = r.alcance === 'Total'
      ? '<span class="badge badge-gris">TOTAL</span>'
      : `<span class="badge badge-azul">PARCIAL · ${r.tipoValor === 'Porcentaje' ? (r.monto || 0) + '%' : '$' + (parseFloat(r.monto) || 0).toLocaleString('es-AR')}${r.tipoValor === 'Porcentaje' ? '' : '/mes'}</span>`;
    const nAdj = (r.adjuntos || []).length;
    return `<tr>
      <td style="padding:8px 10px;border:1px solid var(--borde);">
        <div style="font-weight:600;">${r.nroSocio || '—'} · ${r.nombre}</div>
        ${sub ? `<div style="font-size:11px;color:var(--texto-suave);">${sub}</div>` : ''}
      </td>
      <td style="padding:8px 10px;border:1px solid var(--borde);">
        <span class="badge ${chipCls}">${(r.motivoTipificado || '—').toUpperCase()}</span>
        ${r.motivo ? `<div style="font-size:11px;color:var(--texto-suave);margin-top:2px;max-width:220px;">${r.motivo}</div>` : ''}
      </td>
      <td style="padding:8px 10px;border:1px solid var(--borde);">${alcanceHtml}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);font-size:12px;">${r.periodoDesde || '—'}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);text-align:center;">${(r.periodosRetenidos || []).length}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);text-align:right;font-weight:700;">$${restanteDe(r).toLocaleString('es-AR')}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);font-size:11px;">
        ${r.creadoPor || '—'}<br><span style="color:var(--texto-suave);">${(r.creadoEn || '').slice(0, 10).split('-').reverse().join('/')}${nAdj ? ` · 📎 ${nAdj}` : ''}</span>
      </td>
      <td style="padding:8px 10px;border:1px solid var(--borde);white-space:nowrap;">
        ${esSoloLectura() ? '<span style="font-size:11px;color:var(--texto-muy-suave);">Solo lectura</span>' : `
        <button class="btn btn-xs" style="background:#dcfce7;color:#065f46;border:1px solid #9fdaba;" data-liberar="${r.id}">Liberar</button>
        <button class="btn btn-xs" style="background:#fdebd7;color:#b25b00;border:1px solid #f3c98a;" data-aplicar="${r.id}">Aplicar</button>`}
      </td>
    </tr>`;
  }).join('');
  if (esSoloLectura()) return;
  tbody.querySelectorAll('button[data-liberar]').forEach(b => b.onclick = () => abrirLiberarRetencion(b.dataset.liberar));
  tbody.querySelectorAll('button[data-aplicar]').forEach(b => b.onclick = () => abrirAplicarRetencion(b.dataset.aplicar));
}

function renderTabLiberadas(liberaciones) {
  const tbody = $('tbody-ret-liberadas');
  if (!tbody) return;
  const filas = [...liberaciones].sort((a, b) => new Date(b.creadoEn || 0) - new Date(a.creadoEn || 0));
  if (!filas.length) { tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin liberaciones registradas.</td></tr>'; return; }
  tbody.innerHTML = filas.map(m => {
    const r = getRetencionById(m.retencionIdLocal) || {};
    const fechaLib = (m.creadoEn || '').slice(0, 10).split('-').reverse().join('/');
    const desc = `${m.esTotal ? 'Total' : 'Parcial'} — ${m.motivo || '—'}<br><span style="font-size:11px;color:var(--texto-suave);">liberada ${fechaLib}</span>`;
    const estadoHtml = m.estadoPago === 'Pagada'
      ? `<span class="badge badge-verde">PAGADA · ${(m.fechaPago || '').split('-').reverse().join('/')}</span><br><span style="font-size:11px;color:var(--texto-suave);">comp. ${m.comprobante || '—'}</span>`
      : '<span class="badge badge-rojo">PENDIENTE DE PAGO</span>';
    const accionHtml = m.estadoPago === 'Pagada'
      ? `<span style="font-size:11px;color:var(--texto-suave);">conf. ${m.confirmadoPor || '—'}</span>`
      : esSoloLectura() ? '<span style="font-size:11px;color:var(--texto-muy-suave);">Solo lectura</span>'
      : `<button class="btn btn-xs" style="background:#dcfce7;color:#065f46;border:1px solid #9fdaba;" data-pago="${m.id}">✓ Confirmar pago</button>`;
    return `<tr>
      <td style="padding:8px 10px;border:1px solid var(--borde);font-weight:600;">${r.nroSocio || '—'} · ${r.nombre || '—'}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);font-size:12px;">${desc}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);text-align:right;font-weight:700;">$${(parseFloat(m.monto) || 0).toLocaleString('es-AR')}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);font-size:12px;">${m.creadoPor || '—'}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);text-align:center;">${estadoHtml}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);text-align:center;">${accionHtml}</td>
    </tr>`;
  }).join('');
  if (esSoloLectura()) return;
  tbody.querySelectorAll('button[data-pago]').forEach(b => b.onclick = () => abrirConfirmarPagoMovimiento(b.dataset.pago));
}

function renderTabHistorial(historial) {
  const tbody = $('tbody-ret-historial');
  if (!tbody) return;
  if (!historial.length) { tbody.innerHTML = '<tr><td colspan="5" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin retenciones resueltas todavía.</td></tr>'; return; }
  tbody.innerHTML = historial.map(r => {
    const chipCls = MOTIVO_CHIP[r.motivoTipificado] || 'badge-gris';
    const movs = movimientosDe(r.id);
    const ultima = movs.sort((a, b) => new Date(b.creadoEn || 0) - new Date(a.creadoEn || 0))[0];
    const hasta = ultima ? (ultima.creadoEn || '').slice(0, 7) : r.periodoDesde;
    const totalRet = Math.max(parseFloat(r.montoAcumulado) || 0, movs.reduce((s, m) => s + (parseFloat(m.monto) || 0), 0));
    const resolucionHtml = r.estado === 'Pagada'
      ? `<span class="badge badge-verde">LIBERADA Y PAGADA</span> <span style="font-size:11px;color:var(--texto-suave);">${(ultima?.fechaPago || '').split('-').reverse().join('/')}</span>`
      : `<span class="badge badge-naranja">APLICADA COMO DESCUENTO</span> <span style="font-size:11px;color:var(--texto-suave);">${ultima?.circuitoDestino || ''}</span>`;
    return `<tr>
      <td style="padding:8px 10px;border:1px solid var(--borde);font-weight:600;">${r.nroSocio || '—'} · ${r.nombre}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);"><span class="badge ${chipCls}">${(r.motivoTipificado || '—').toUpperCase()}</span></td>
      <td style="padding:8px 10px;border:1px solid var(--borde);font-size:12px;">${r.periodoDesde || '—'} → ${hasta || '—'}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);text-align:right;font-weight:700;">$${totalRet.toLocaleString('es-AR')}</td>
      <td style="padding:8px 10px;border:1px solid var(--borde);">${resolucionHtml}</td>
    </tr>`;
  }).join('');
}

export function poblarSelectsRetenciones() {
  const dl = $('dl-ret-nombre');
  if (dl) dl.innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo' || l.estado === 'Baja').map(l => `<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
  const sel = $('ret-motivo-tip');
  if (sel) {
    const ph = '<option value="">— Elegir motivo —</option>';
    sel.innerHTML = ph + (DB.motivosRetencion || []).filter(m => m.activo !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join('');
  }
}

export function autocompletarRetencion() {
  const val = ($('ret-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => l.nombre === val);
  if (!leg) return;
  if ($('ret-nroSocio')) $('ret-nroSocio').value = leg.nro;
  _actualizarPreviewRetiro(leg);
}

// Retiro estimado del período vigente — lee la consolidación real de
// Liquidación de horas (legacy.js, expuesta en window porque ese archivo
// no es un módulo ES separado) para mostrar la misma cifra que después va
// a resolver descuentosAutomaticosLegajo() de verdad. Puramente
// informativo: el monto NUNCA se congela acá (ver cabecera del archivo).
function _actualizarPreviewRetiro(leg) {
  const elServ = $('ret-servicio-estado');
  const elRetiro = $('ret-retiro-estimado');
  if (elServ) elServ.value = `${leg.servicio || '—'}${leg.estado === 'Baja' ? ' · BAJA ' + (leg.fechaBaja || '') : ''}`;
  if (!elRetiro) return;
  try {
    const mes = mesActualISO();
    const filas = window._getFilasConsolidadas ? window._getFilasConsolidadas(mes) : [];
    const fila = filas.find(f => f.nombre === leg.nombre);
    elRetiro.value = fila ? `${mes} · $${Math.round(fila.bruto).toLocaleString('es-AR')} (estimado hoy)` : `${mes} · sin horas cargadas todavía`;
  } catch (e) {
    elRetiro.value = '—';
  }
}

// ========== ALCANCE (radio Total/Parcial del modal Nueva) ==========

export function toggleAlcanceRetencion() {
  const total = document.querySelector('input[name="ret-alcance"]:checked')?.value !== 'Parcial';
  const bloque = $('ret-parcial-fields');
  if (bloque) bloque.style.display = total ? 'none' : 'grid';
}

// ========== ADJUNTOS (subida directa a Storage, sin la tabla genérica
// "adjuntos" — esa es DNI-céntrica para el ingreso, acá alcanza con un
// jsonb liviano en la propia retención) ==========

let _adjuntosPendientes = [];

export function quitarAdjuntoPendiente(i) {
  _adjuntosPendientes.splice(i, 1);
  _renderAdjuntosPendientes();
}

function _renderAdjuntosPendientes() {
  const cont = $('ret-adjuntos-lista');
  if (!cont) return;
  cont.innerHTML = _adjuntosPendientes.map((a, i) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:3px 0;">
    <span>📎 ${a.nombre}</span><button type="button" data-quitar-adj="${i}" style="background:none;border:none;color:var(--rojo);cursor:pointer;">✕</button>
  </div>`).join('');
  cont.querySelectorAll('button[data-quitar-adj]').forEach(b => b.onclick = () => quitarAdjuntoPendiente(parseInt(b.dataset.quitarAdj)));
}

export async function agregarAdjuntoRetencion() {
  const input = $('ret-adjunto-file');
  const file = input?.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('⚠️ El archivo supera los 10 MB'); return; }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `retenciones/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await SUPA.storage.from(BUCKET_ADJUNTOS).upload(path, file, { upsert: false, contentType: file.type });
  if (error) { toast('⚠️ No se pudo subir el adjunto: ' + error.message); return; }
  _adjuntosPendientes.push({ nombre: file.name, path, subidoPor: currentUser?.nombre || '', subidoEn: new Date().toISOString() });
  input.value = '';
  _renderAdjuntosPendientes();
  toast('📎 Adjunto agregado');
}

// ========== NUEVA RETENCIÓN ==========

function _abrirModalNuevaRetencion(prefill = {}) {
  poblarSelectsRetenciones();
  _adjuntosPendientes = [];
  _renderAdjuntosPendientes();
  $('ret-modal-title').textContent = 'Nueva retención';
  $('ret-nombre').value = prefill.nombre || '';
  $('ret-nroSocio').value = prefill.nroSocio || '';
  $('ret-motivo-tip').value = prefill.motivoTipificado || '';
  $('ret-periodo').value = mesActualISO();
  $('ret-motivo').value = prefill.descripcion || '';
  $('ret-monto').value = '';
  $('ret-tipo-valor').value = 'Monto';
  document.querySelectorAll('input[name="ret-alcance"]').forEach(r => { r.checked = (r.value === (prefill.alcance || 'Total')); });
  toggleAlcanceRetencion();
  const leg = legajoDe({ nombre: prefill.nombre, nroSocio: prefill.nroSocio });
  if (leg) _actualizarPreviewRetiro(leg);
  else { if ($('ret-servicio-estado')) $('ret-servicio-estado').value = ''; if ($('ret-retiro-estimado')) $('ret-retiro-estimado').value = ''; }
  const modal = $('modal-retencion');
  if (modal) modal.dataset.origenRef = prefill.origenRef || '';
  abrirModal('modal-retencion');
}

export function abrirNuevaRetencion() { _abrirModalNuevaRetencion(); }

export async function guardarNuevaRetencion() {
  const nombre = cleanText(($('ret-nombre') || { value: '' }).value);
  const nroSocio = cleanText(($('ret-nroSocio') || { value: '' }).value);
  const motivoTip = ($('ret-motivo-tip') || { value: '' }).value;
  const descripcion = cleanText(($('ret-motivo') || { value: '' }).value);
  const periodoDesde = ($('ret-periodo') || { value: '' }).value;
  if (!nombre) { toast('⚠️ Buscá y elegí el asociado'); return; }
  if (!motivoTip) { toast('⚠️ Elegí el motivo'); return; }
  if (!periodoDesde) { toast('⚠️ Elegí desde qué período'); return; }
  if (!descripcion) { toast('⚠️ Completá la descripción / contexto'); return; }

  const leg = (DB.legajos || []).find(l => l.nombre === nombre || (nroSocio && String(l.nro) === nroSocio));
  const alcance = document.querySelector('input[name="ret-alcance"]:checked')?.value || 'Total';
  const tipoValor = ($('ret-tipo-valor') || { value: 'Monto' }).value;
  const monto = parseFloat(($('ret-monto') || { value: '' }).value) || 0;
  if (alcance === 'Parcial' && monto <= 0) { toast('⚠️ Ingresá el monto fijo o el porcentaje'); return; }

  const modal = $('modal-retencion');
  const r = {
    id: Date.now(),
    nombre,
    nroSocio: nroSocio || (leg ? String(leg.nro) : null),
    legajoIdLocal: leg ? String(leg.nro) : (nroSocio || null),
    motivoTipificado: motivoTip,
    motivo: descripcion,
    alcance,
    tipoValor: alcance === 'Parcial' ? tipoValor : 'Monto',
    monto: alcance === 'Parcial' ? monto : 0,
    periodoDesde,
    estado: 'Activa',
    montoAcumulado: 0,
    periodosRetenidos: [],
    adjuntos: _adjuntosPendientes,
    origen: 'manual',
    origenRef: modal?.dataset?.origenRef || null,
    creadoPor: currentUser?.nombre || '',
    creadoEn: new Date().toISOString(),
    anulado: false,
  };
  if (!DB.retenciones) DB.retenciones = [];
  DB.retenciones.push(r);
  await supaSync('retenciones', r);
  if (modal) delete modal.dataset.origenRef;
  cerrarModal('modal-retencion');
  renderRetenciones();
  toast('✅ Retención creada — queda ACTIVA');
}

// ========== LIBERAR (total o parcial) ==========

let _retLiberandoId = null;

export function abrirLiberarRetencion(id) {
  const r = getRetencionById(id);
  if (!r) return;
  _retLiberandoId = id;
  const restante = restanteDe(r);
  $('ret-liberar-titulo').textContent = `Liberar retención — ${r.nroSocio || '—'} · ${r.nombre}`;
  $('ret-liberar-restante').textContent = '$' + restante.toLocaleString('es-AR');
  $('ret-liberar-todo-label').textContent = `Todo ($${restante.toLocaleString('es-AR')}) — la retención se cierra`;
  document.querySelectorAll('input[name="ret-liberar-tipo"]').forEach(rd => rd.checked = rd.value === 'todo');
  $('ret-liberar-parcial-monto').value = '';
  $('ret-liberar-motivo').value = '';
  abrirModal('modal-retencion-liberar');
}

export async function confirmarLiberarRetencion() {
  const r = getRetencionById(_retLiberandoId);
  if (!r) return;
  const restante = restanteDe(r);
  const esTodo = document.querySelector('input[name="ret-liberar-tipo"]:checked')?.value !== 'parcial';
  const motivo = cleanText(($('ret-liberar-motivo') || { value: '' }).value);
  if (!motivo) { toast('⚠️ Ingresá el motivo de la liberación'); return; }
  let monto = restante;
  if (!esTodo) {
    monto = parseFloat(($('ret-liberar-parcial-monto') || { value: '' }).value) || 0;
    if (monto <= 0 || monto > restante) { toast('⚠️ El monto parcial debe ser mayor a 0 y no puede superar lo retenido'); return; }
  }

  const mov = {
    id: Date.now(),
    retencionIdLocal: String(r.id),
    tipo: 'liberacion',
    monto,
    esTotal: esTodo,
    motivo,
    estadoPago: 'Pendiente',
    creadoPor: currentUser?.nombre || '',
    creadoEn: new Date().toISOString(),
    anulado: false,
  };
  if (!DB.retencionesMovimientos) DB.retencionesMovimientos = [];
  DB.retencionesMovimientos.push(mov);
  await supaSync('retencionesMovimientos', mov);

  if (esTodo) {
    r.estado = 'Liberada';
    r.editadoPor = currentUser?.nombre || '';
    r.editadoEn = new Date().toISOString();
    await supaSync('retenciones', r);
  }

  cerrarModal('modal-retencion-liberar');
  renderRetenciones();
  toast(esTodo ? '✅ Retención liberada — pasa a "Liberadas y pagos" como pendiente de pago' : '✅ Liberación parcial registrada — el resto sigue ACTIVA');
}

// ========== APLICAR COMO DESCUENTO ==========

let _retAplicandoId = null;

export function abrirAplicarRetencion(id) {
  const r = getRetencionById(id);
  if (!r) return;
  _retAplicandoId = id;
  const restante = restanteDe(r);
  $('ret-aplicar-titulo').textContent = `Aplicar como descuento — ${r.nroSocio || '—'} · ${r.nombre}`;
  $('ret-aplicar-monto').value = restante || '';
  $('ret-aplicar-monto').max = restante;
  $('ret-aplicar-circuito').value = 'Uniformes — devolución por baja';
  $('ret-aplicar-motivo').value = '';
  abrirModal('modal-retencion-aplicar');
}

export async function confirmarAplicarRetencion() {
  const r = getRetencionById(_retAplicandoId);
  if (!r) return;
  const restante = restanteDe(r);
  const montoAplicar = parseFloat(($('ret-aplicar-monto') || { value: '' }).value) || 0;
  const circuito = ($('ret-aplicar-circuito') || { value: '' }).value;
  const motivo = cleanText(($('ret-aplicar-motivo') || { value: '' }).value);
  if (montoAplicar <= 0 || montoAplicar > restante) { toast('⚠️ El monto a aplicar debe ser mayor a 0 y no puede superar lo retenido'); return; }
  if (!motivo) { toast('⚠️ Ingresá el motivo'); return; }

  let descuentoId = null;
  if (circuito === 'Uniformes — devolución por baja') {
    const hoy = new Date().toISOString().slice(0, 10);
    const d = {
      id: Date.now(),
      legajoIdLocal: r.legajoIdLocal || r.nroSocio,
      montoTotal: montoAplicar,
      cuotasTotales: 1,
      cuotasCobradas: 0,
      montoCuota: montoAplicar,
      fechaGenerado: new Date().toISOString(),
      fechaPrimeraCuota: hoy,
      fechaUltimaCuota: hoy,
      estado: 'En curso',
      motivoGeneracion: `Retención aplicada — ${motivo}`,
    };
    if (!DB.descuentosUniformePendientes) DB.descuentosUniformePendientes = [];
    DB.descuentosUniformePendientes.push(d);
    await supaSync('descuentosUniformePendientes', d);
    descuentoId = String(d.id);
  }

  const mov = {
    id: Date.now() + 1,
    retencionIdLocal: String(r.id),
    tipo: 'aplicacion',
    monto: montoAplicar,
    motivo,
    circuitoDestino: circuito,
    descuentoUniformeIdLocal: descuentoId,
    creadoPor: currentUser?.nombre || '',
    creadoEn: new Date().toISOString(),
    anulado: false,
  };
  if (!DB.retencionesMovimientos) DB.retencionesMovimientos = [];
  DB.retencionesMovimientos.push(mov);
  await supaSync('retencionesMovimientos', mov);

  // El resto (si queda) se libera automáticamente — mismo comportamiento
  // que muestra el mockup ("el resto se libera").
  const resto = restante - montoAplicar;
  if (resto > 0) {
    const movResto = {
      id: Date.now() + 2,
      retencionIdLocal: String(r.id),
      tipo: 'liberacion',
      monto: resto,
      esTotal: true,
      motivo: `Resto liberado automáticamente al aplicar $${montoAplicar.toLocaleString('es-AR')} como descuento.`,
      estadoPago: 'Pendiente',
      creadoPor: currentUser?.nombre || '',
      creadoEn: new Date().toISOString(),
      anulado: false,
    };
    DB.retencionesMovimientos.push(movResto);
    await supaSync('retencionesMovimientos', movResto);
  }

  r.estado = 'Aplicada';
  r.editadoPor = currentUser?.nombre || '';
  r.editadoEn = new Date().toISOString();
  await supaSync('retenciones', r);

  cerrarModal('modal-retencion-aplicar');
  renderRetenciones();
  toast('✅ Aplicada como descuento' + (resto > 0 ? ' — el resto se liberó, queda pendiente de pago' : ''));
}

// ========== CONFIRMAR PAGO (de una liberación) ==========

let _movConfirmandoId = null;

export function abrirConfirmarPagoMovimiento(id) {
  const m = getMovimientoById(id);
  if (!m) return;
  const r = getRetencionById(m.retencionIdLocal) || {};
  _movConfirmandoId = id;
  $('ret-pago-titulo').textContent = `✓ Confirmar pago — ${r.nroSocio || '—'} · ${r.nombre || ''}`;
  $('ret-pago-monto').textContent = '$' + (parseFloat(m.monto) || 0).toLocaleString('es-AR');
  $('ret-pago-fecha').value = new Date().toISOString().slice(0, 10);
  $('ret-pago-comprobante').value = '';
  $('ret-pago-obs').value = '';
  abrirModal('modal-retencion-pago');
}

// Registrada como filtro del buscador global (src/main.js) — no hay
// texto libre propio en este rediseño (el mockup no lo tiene), así que
// solo re-renderiza la tab actual.
export function filtrarRetenciones() { renderRetenciones(); }

export async function confirmarPagoMovimiento() {
  const m = getMovimientoById(_movConfirmandoId);
  if (!m) return;
  const fecha = ($('ret-pago-fecha') || { value: '' }).value;
  const comprobante = cleanText(($('ret-pago-comprobante') || { value: '' }).value);
  if (!fecha) { toast('⚠️ Ingresá la fecha de pago'); return; }
  if (!comprobante) { toast('⚠️ Ingresá el N° de comprobante'); return; }

  m.estadoPago = 'Pagada';
  m.fechaPago = fecha;
  m.comprobante = comprobante;
  m.observacionesPago = cleanText(($('ret-pago-obs') || { value: '' }).value);
  m.confirmadoPor = currentUser?.nombre || '';
  m.confirmadoEn = new Date().toISOString();
  await supaSync('retencionesMovimientos', m);

  // Si esta liberación cerraba el saldo completo, la retención pasa a
  // PAGADA (terminal) y se muestra en Historial.
  if (m.esTotal) {
    const r = getRetencionById(m.retencionIdLocal);
    if (r) { r.estado = 'Pagada'; await supaSync('retenciones', r); }
  }

  cerrarModal('modal-retencion-pago');
  renderRetenciones();
  toast('✅ Pago confirmado');
}

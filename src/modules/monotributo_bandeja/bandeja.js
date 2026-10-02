// Monotributo — 📥 Bandeja de Pendientes (MONOTRIBUTO_bandeja_para_Fede.md +
// MONOTRIBUTO_v2_mes_en_curso_para_Fede.md). Mismo patrón que Pendientes de
// CBU: el alta SIEMBRA el trámite. Es derivado, no una tabla que alguien
// tenga que llenar: pendiente = asociado ACTIVO sin monotributo en el
// Padrón. Por eso las altas nuevas caen solas y el backfill de los activos
// de hoy es automático. Sale de la bandeja cuando su monotributo pasa a
// ACTIVO, es decir cuando aparece en el Padrón (DB.monotributos).
//
// Monotributo v2 (pago a mes en curso): TODO alta pasa por acá con los
// datos de la Constancia MT (sembrados por altas.js,
// sembrarTramiteMonoDesdeAlta) — completos o no. Conviven en la misma fila
// `mono_tramites` (sql/v151 + v173) DOS informaciones distintas según de
// dónde vino la fila:
//  - Sin datos (categoria=null): el flujo VIEJO, sin constancia todavía —
//    SIN INICIAR / EN TRÁMITE, sin cambios (ver iniciarTramiteMono/
//    abrirMonoTramite/cerrarTramiteMono).
//  - Con datos (categoria set, aunque falten otros campos): el flujo NUEVO
//    — la acción es "💲 Subir comprobante" (confirmarComprobanteBandeja,
//    módulo monotributo_comprobantes), que si matchea promueve al Padrón.
// "Fecha límite" (el calendario de pagos fuera de tanda de Martina) es
// editable en CUALQUIER fila, tenga datos o no.
//
// El módulo Monotributos vive en legacy.js (sin migrar): este archivo solo
// aporta la bandeja y se engancha por window.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { supaSync, supaDel } from '@shared/supabase.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';

function _mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function _hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function _norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

// Mismo default que _vencimientoDefault() en legacy.js (Pago mensual) —
// día 20 del mes en curso, salvo que ya se haya guardado uno explícito
// para ese período en mono_vencimientos (DB.monoVencimientos, v182).
function _vencimientoMesActual() {
  const periodo = _mesActual();
  const v = (DB.monoVencimientos || []).find(x => x.periodo === periodo);
  if (v?.fecha) return v.fecha;
  const [yy, mm] = periodo.split('-');
  return `${yy}-${mm}-20`;
}

// Fecha de alta del legajo: viene como DD/MM/AAAA o ISO. Devuelve ISO o null.
function _fechaAltaISO(l) {
  const raw = String(l.ingreso || l.fechaIngreso || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function _diasDesde(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000));
}
function _fmtFecha(iso) { return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR') : '—'; }

function _enPadron() {
  const activos = (DB.monotributos || []).filter(r => r.estado !== 'Baja');
  return {
    porNro: new Set(activos.map(r => String(r.nroSocio || '')).filter(Boolean)),
    porNombre: new Set(activos.filter(r => !r.nroSocio).map(r => _norm(r.nombre))),
    cantidad: activos.length,
  };
}

function _tramiteDe(nro) {
  return (DB.monoTramites || []).find(t => !t.anulado && String(t.legajoNro) === String(nro)) || null;
}

// "Con datos" = vino de la Constancia MT del alta nueva (aunque falten
// campos). Distinto de "datos completos" (los 5 obligatorios del punto 2).
function _tieneDatos(t) { return !!(t && t.categoria); }
function _camposFaltantes(t) {
  const faltan = [];
  if (!t?.fechaInicioMt) faltan.push('fecha de inicio');
  if (!t?.categoria) faltan.push('categoría');
  if (!t?.zona) faltan.push('zona');
  if (t?.iibbAporta == null) faltan.push('IIBB');
  if (!t?.condicion) faltan.push('condición');
  return faltan;
}

// Semáforo de la fecha límite (mismo criterio que el mockup_monotributo_v2).
function _estadoLimite(fechaLimite) {
  if (!fechaLimite) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(fechaLimite + 'T00:00:00');
  const diff = Math.round((d - hoy) / 86400000);
  if (diff < 0) return { clase: 'badge-rojo', txt: `⚠ VENCIDA hace ${-diff} d` };
  if (diff === 0) return { clase: 'badge-naranja', txt: '⏰ vence HOY' };
  return { clase: 'badge-azul', txt: `faltan ${diff} d` };
}

// Filas de la bandeja, ordenadas por fecha límite ascendente (vencidas
// primero, sin fecha límite al final) — reemplaza el orden viejo por horas
// en grillas (Monotributo v2: se paga en el mes en curso, no depende de
// quién cargó horas ese período).
export function filasBandejaMono() {
  const padron = _enPadron();
  const filas = (DB.legajos || [])
    .filter(l => l.estado === 'Activo' && !l.sinMonotributo && !padron.porNro.has(String(l.nro)) && !padron.porNombre.has(_norm(l.nombre)))
    .map(l => {
      const t = _tramiteDe(l.nro);
      const altaISO = _fechaAltaISO(l);
      return {
        l, altaISO, dias: _diasDesde(altaISO),
        tramite: t, diasTramite: t?.tramiteFecha ? _diasDesde(t.tramiteFecha) : null,
      };
    });
  filas.sort((a, b) => {
    const la = a.tramite?.fechaLimite || null;
    const lb = b.tramite?.fechaLimite || null;
    if (la && lb) return la.localeCompare(lb);
    if (la) return -1;
    if (lb) return 1;
    return (b.dias ?? -1) - (a.dias ?? -1);
  });
  return filas;
}

export function renderMonoPendientes() {
  const filas = filasBandejaMono();
  const enTramite = filas.filter(f => f.tramite?.tramitePor && !_tieneDatos(f.tramite));
  const prom = enTramite.length ? Math.round(enTramite.reduce((s, f) => s + (f.diasTramite || 0), 0) / enTramite.length) : 0;
  const vencidasOHoy = filas.filter(f => {
    const e = _estadoLimite(f.tramite?.fechaLimite);
    return e && (e.clase === 'badge-rojo' || e.clase === 'badge-naranja');
  }).length;
  const conDatosIncompletos = filas.filter(f => _tieneDatos(f.tramite) && _camposFaltantes(f.tramite).length).length;

  if ($('kpi-mp-pend')) $('kpi-mp-pend').textContent = filas.length;
  if ($('kpi-mp-venc')) $('kpi-mp-venc').textContent = vencidasOHoy;
  if ($('kpi-mp-datos')) $('kpi-mp-datos').textContent = conDatosIncompletos;
  if ($('kpi-mp-tram')) $('kpi-mp-tram').textContent = enTramite.length ? `${enTramite.length} (${prom} d)` : '0';
  if ($('kpi-mp-padron')) $('kpi-mp-padron').textContent = _enPadron().cantidad;
  const badge = $('mono-badge-pendientes');
  if (badge) { badge.textContent = filas.length; badge.style.display = filas.length ? 'inline-block' : 'none'; }

  const tbody = $('tbody-mono-pendientes');
  if (!tbody) return;
  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;opacity:.5;">Bandeja vacía — todos los asociados activos tienen su monotributo ✓</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(f => {
    // MONOTRIBUTO_cierre_modulo_para_Fede_1.md §17: el default de la fecha
    // límite (pago fuera de tanda) ya apunta al vencimiento del mes en
    // curso en vez de quedar vacío — Martina la ajusta si hace falta. Es
    // solo el valor mostrado en el input; no se guarda nada hasta que ella
    // lo toque (actualizarFechaLimiteMono sigue disparando el guardado).
    const lim = f.tramite?.fechaLimite || _vencimientoMesActual();
    const semaforo = _estadoLimite(lim);
    const limiteHtml = `<input type="date" value="${lim}" style="font-size:11.5px;padding:2px 4px;" onchange="actualizarFechaLimiteMono('${f.l.nro}', this.value)">`
      + (semaforo ? `<div style="margin-top:2px;"><span class="badge ${semaforo.clase}" style="font-size:9.5px;">${semaforo.txt}</span></div>` : '');

    const tieneDatos = _tieneDatos(f.tramite);
    const faltan = tieneDatos ? _camposFaltantes(f.tramite) : [];
    const datosHtml = tieneDatos
      ? (faltan.length
          ? `<span class="badge badge-naranja" style="font-size:10px;">⚠ faltan: ${faltan.join(' · ')}</span>`
          : '<span class="badge badge-verde" style="font-size:10px;">✔ completos</span>')
      : '<span class="form-hint">—</span>';

    // MONOTRIBUTO_cierre_modulo_para_Fede_1.md §3: "💲 Subir comprobante" es
    // la puerta de salida al Padrón — tiene que estar en TODA fila, no solo
    // las que ya vinieron con la Constancia MT (datos completos). Si faltan
    // los datos, subirComprobanteMonoBandeja() pide los 4 imprescindibles
    // con un mini-formulario antes de leer el ticket (ver abrirDatosRapidosMono).
    const btnComprobante = `<button class="btn btn-sm" style="background:#1e7b34;color:#fff;border:none;" onclick="subirComprobanteMonoBandeja('${f.l.nro}')">💲 Subir comprobante</button>`;
    let estado, accion;
    if (tieneDatos) {
      estado = '<span class="badge badge-azul">Con datos — falta comprobante</span>';
      accion = btnComprobante + ` <button class="btn btn-sm btn-secondary" onclick="abrirMonoTramite('${f.l.nro}')" title="Corregir los datos del alta">✎ Completar datos</button>`;
    } else if (f.tramite?.tramitePor) {
      estado = `<span class="badge badge-azul">EN TRÁMITE</span> <span style="font-size:11.5px;color:var(--texto-suave);">${f.tramite.tramitePor || ''} · ${_fmtFecha(f.tramite.tramiteFecha)}${f.diasTramite != null ? ' · hace ' + f.diasTramite + ' d' : ''}</span>`;
      accion = btnComprobante + ` <button class="btn btn-sm btn-secondary" onclick="abrirMonoTramite('${f.l.nro}')">Cargar monotributo</button>`;
    } else {
      estado = '<span class="badge badge-rojo">SIN INICIAR</span>';
      accion = btnComprobante + ` <button class="btn btn-primary btn-sm" onclick="iniciarTramiteMono('${f.l.nro}')">Iniciar trámite</button>`;
    }
    accion += ` <button class="btn btn-sm btn-secondary" onclick="noVaMonotributoBandeja('${f.l.nro}')" title="No corresponde monotributo">✕</button>`;

    return `<tr>
      <td><b>${f.l.nro}</b> · ${f.l.nombre}</td>
      <td style="font-size:12px;">${f.l.cuit || '—'}</td>
      <td style="font-size:12px;">${_fmtFecha(f.altaISO)}</td>
      <td style="text-align:right;">${f.dias ?? '—'}</td>
      <td style="white-space:nowrap;">${limiteHtml}</td>
      <td>${datosHtml}</td>
      <td>${estado}</td>
      <td style="white-space:nowrap;">${accion}</td>
    </tr>`;
  }).join('');
}

// Fecha límite: calendario libre de Martina para pagos fuera de tanda — no
// bloquea nada, se puede editar en cualquier fila tenga o no datos.
export async function actualizarFechaLimiteMono(nro, valor) {
  let t = _tramiteDe(nro);
  if (!t) {
    const l = (DB.legajos || []).find(x => String(x.nro) === String(nro));
    t = { id: 'MTR' + String(nro), legajoNro: String(nro), nombreAsociado: l?.nombre || '', anulado: false };
    DB.monoTramites = DB.monoTramites || [];
    DB.monoTramites.push(t);
  }
  t.fechaLimite = valor || null;
  const ok = await supaSync('monoTramites', t);
  if (!ok) toast('⚠️ No se pudo guardar la fecha límite en el servidor');
  renderMonoPendientes();
}

// Abre el MISMO modal de "+ Nuevo monotributista" precargado desde el alta:
// nombre, CUIT y fecha vienen del legajo (una sola fuente de verdad) y quedan
// bloqueados; RRHH solo carga lo que sale del trámite.
export function abrirMonoTramite(nro) {
  const l = (DB.legajos || []).find(x => String(x.nro) === String(nro));
  if (!l) { toast('⚠️ No se encontró el legajo'); return; }
  window.abrirModalNuevoMonotributo(null, {
    nro: l.nro, nombre: l.nombre, cuit: l.cuit || '', fechaAlta: _fechaAltaISO(l) || _hoyISO(),
  });
}

// SIN INICIAR → EN TRÁMITE: guarda quién y cuándo, y abre el modal. Solo
// aplica al flujo viejo (sin datos de la Constancia MT nueva).
export async function iniciarTramiteMono(nro) {
  const l = (DB.legajos || []).find(x => String(x.nro) === String(nro));
  if (!l) return;
  if (!_tramiteDe(nro)) {
    const t = {
      id: 'MTR' + String(nro), legajoNro: String(nro), nombreAsociado: l.nombre,
      tramitePor: currentUser?.nombre || '', tramiteFecha: _hoyISO(), anulado: false,
    };
    if (!DB.monoTramites) DB.monoTramites = [];
    const idx = DB.monoTramites.findIndex(x => String(x.legajoNro) === String(nro));
    if (idx >= 0) DB.monoTramites[idx] = t; else DB.monoTramites.push(t);
    const ok = await supaSync('monoTramites', t);
    if (!ok) toast('⚠️ El trámite no se pudo guardar en el servidor — otros usuarios no van a ver que ya lo iniciaste.');
    renderMonoPendientes();
  }
  abrirMonoTramite(nro);
}

// Lo llama guardarMonotributo() (legacy.js) al guardar desde la bandeja: el
// asociado ya está en el Padrón, así que sale solo de la bandeja; acá se
// limpia el estado EN TRÁMITE.
export async function cerrarTramiteMono(nro) {
  const t = _tramiteDe(nro);
  if (t) { t.anulado = true; await supaSync('monoTramites', t); }
  renderMonoPendientes();
}

// Botón "💲 Subir comprobante" — Monotributo v2, punto 3. Import dinámico
// (mismo patrón que legacy.js usa para no acoplar módulos entre sí).
//
// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §3: el botón tiene que andar en
// CUALQUIER fila, tenga o no categoría cargada. El comprobante de pago
// nunca trae la categoría impresa (y deducirla del importe es ambiguo —
// investigado, A/B/C pueden dar la misma cuota bajo ciertas condiciones),
// así que si falta, se pide con un mini-formulario ANTES de elegir el
// archivo — una sola vez, confirmarComprobanteBandeja() lo guarda en el
// trámite para la próxima.
export function subirComprobanteMonoBandeja(legajoNro) {
  const t = _tramiteDe(legajoNro);
  if (_tieneDatos(t)) {
    _elegirYConfirmarComprobante(legajoNro);
  } else {
    abrirDatosRapidosMono(legajoNro);
  }
}

function _elegirYConfirmarComprobante(legajoNro, datosManual = null) {
  import('@modules/monotributo_comprobantes/comprobantes.js').then(({ elegirArchivoComprobante, confirmarComprobanteBandeja }) => {
    elegirArchivoComprobante(file => confirmarComprobanteBandeja(legajoNro, file, datosManual));
  });
}

const _CATEGORIAS_MONO = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

function _ensureModalDatosRapidosMono() {
  if ($('modal-datos-rapidos-mono')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-datos-rapidos-mono';
  m.innerHTML = '<div class="modal" style="max-width:440px;">'
    + '<div class="modal-header"><h3>💲 Subir comprobante</h3><button class="btn-close" onclick="cerrarModal(\'modal-datos-rapidos-mono\')">×</button></div>'
    + '<div class="modal-body">'
      + '<input type="hidden" id="drm-nro">'
      + '<div id="drm-nombre" style="font-weight:600;margin-bottom:8px;"></div>'
      + '<div style="font-size:12px;color:var(--texto-suave);margin-bottom:10px;">Todavía no hay categoría cargada para esta persona — completá estos datos para poder validar el comprobante contra la cuota que le corresponde. El resto del alta (fecha de inicio, etc.) se puede completar después.</div>'
      + '<div class="form-grid form-grid-2">'
        + '<div class="form-group"><label>Categoría *</label><select id="drm-categoria">' + _CATEGORIAS_MONO.map(c => `<option>${c}</option>`).join('') + '</select></div>'
        + '<div class="form-group"><label>Zona</label><select id="drm-zona"><option value="provincia">Provincia</option><option value="capital">Capital</option></select></div>'
      + '</div>'
      + '<div class="form-grid form-grid-2">'
        + '<div class="form-group"><label>Condición</label><select id="drm-condicion">'
          + '<option value="comun">Común</option><option value="asociado_cooperativa">Asociado cooperativa</option><option value="jubilado">Jubilado</option><option value="no_aportante">No aportante</option>'
        + '</select></div>'
        + '<div class="form-group"><label>Adherentes</label><input type="number" id="drm-adherentes" min="0" value="0"></div>'
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-top:4px;"><input type="checkbox" id="drm-iibb"> Aporta IIBB</label>'
    + '</div>'
    + '<div class="modal-footer">'
      + '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-datos-rapidos-mono\')">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="confirmarDatosRapidosMono()">Continuar → elegir comprobante</button>'
    + '</div>'
  + '</div>';
  document.body.appendChild(m);
}

function abrirDatosRapidosMono(nro) {
  const l = (DB.legajos || []).find(x => String(x.nro) === String(nro));
  if (!l) { toast('⚠️ No se encontró el legajo'); return; }
  _ensureModalDatosRapidosMono();
  $('drm-nro').value = nro;
  $('drm-nombre').textContent = `${l.nro} · ${l.nombre}`;
  $('drm-categoria').selectedIndex = 0;
  $('drm-zona').value = 'provincia';
  $('drm-condicion').value = 'comun';
  $('drm-adherentes').value = '0';
  $('drm-iibb').checked = false;
  abrirModal('modal-datos-rapidos-mono');
}

export function confirmarDatosRapidosMono() {
  const nro = $('drm-nro').value;
  const datosManual = {
    categoria: $('drm-categoria').value,
    zona: $('drm-zona').value,
    condicion: $('drm-condicion').value,
    adherentesCantidad: parseInt($('drm-adherentes').value, 10) || 0,
    iibbAporta: $('drm-iibb').checked,
  };
  cerrarModal('modal-datos-rapidos-mono');
  _elegirYConfirmarComprobante(nro, datosManual);
}

// ── Salida "✕ No va a monotributo" (MONOTRIBUTO_cierre_modulo_para_Fede_1.md
// punto 1) ──
// filasBandejaMono() es derivado de DB.legajos: sin esta marca, un legajo
// que NO corresponde que tenga monotributo (un registro de prueba, o
// alguien que de verdad no se va a inscribir) queda "zombie" para siempre
// — reaparece en cada render porque nunca va a entrar solo al Padrón.
// Reversible a propósito (sql/v179): guardarMonotributo() en legacy.js
// limpia la marca si ese nro de socio se vuelve a cargar de verdad.
const MOTIVOS_NO_VA_MONO = ['No corresponde monotributo', 'Registro de prueba'];

function _ensureModalNoVaMono() {
  if ($('modal-no-va-mono')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-no-va-mono';
  m.innerHTML = '<div class="modal" style="max-width:440px;">'
    + '<div class="modal-header"><h3>✕ No va a monotributo</h3><button class="btn-close" onclick="cerrarModal(\'modal-no-va-mono\')">×</button></div>'
    + '<div class="modal-body">'
      + '<input type="hidden" id="nvm-nro">'
      + '<div id="nvm-nombre" style="font-weight:600;margin-bottom:10px;"></div>'
      + '<div class="form-group"><label>Motivo</label>'
        + '<select id="nvm-motivo" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">'
          + MOTIVOS_NO_VA_MONO.map(mo => '<option>' + mo + '</option>').join('')
        + '</select></div>'
      + '<div class="form-group" style="margin-top:8px;"><label>Detalle (opcional)</label>'
        + '<textarea id="nvm-detalle" rows="3" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;"></textarea></div>'
      + '<div style="font-size:11.5px;color:var(--texto-suave);margin-top:6px;">Sale de la bandeja. Es reversible: si corresponde, volvé a cargarlo desde "+ Nuevo monotributista".</div>'
    + '</div>'
    + '<div class="modal-footer">'
      + '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-no-va-mono\')">Cancelar</button>'
      + '<button class="btn btn-danger" onclick="confirmarNoVaMonotributo()">Confirmar</button>'
    + '</div>'
  + '</div>';
  document.body.appendChild(m);
}

export function noVaMonotributoBandeja(nro) {
  const l = (DB.legajos || []).find(x => String(x.nro) === String(nro));
  if (!l) { toast('⚠️ No se encontró el legajo'); return; }
  _ensureModalNoVaMono();
  $('nvm-nro').value = nro;
  $('nvm-nombre').textContent = `${l.nro} · ${l.nombre}`;
  $('nvm-motivo').selectedIndex = 0;
  $('nvm-detalle').value = '';
  abrirModal('modal-no-va-mono');
}

export async function confirmarNoVaMonotributo() {
  const nro = $('nvm-nro').value;
  const l = (DB.legajos || []).find(x => String(x.nro) === String(nro));
  if (!l) { toast('⚠️ No se encontró el legajo'); return; }
  const motivo = $('nvm-motivo').value;
  const detalle = $('nvm-detalle').value.trim();

  l.sinMonotributo = true;
  l.sinMonotributoMotivo = motivo + (detalle ? ': ' + detalle : '');
  l.sinMonotributoEn = new Date().toISOString();
  l.sinMonotributoPor = currentUser?.nombre || 'Admin';
  // No bloquea ante una falla de guardado (mismo criterio que
  // actualizarFechaLimiteMono más arriba): la marca ya rige en esta sesión
  // y sale de la bandeja igual, solo se avisa si no llegó al servidor.
  const ok = await supaSync('legajos', l);
  if (!ok) toast('⚠️ No se pudo guardar la marca en el servidor — otros usuarios no van a verla todavía');

  if (motivo === 'Registro de prueba') {
    // Limpieza de datos de prueba: se borra el trámite si había uno
    // cargado. No deja evento en el historial — no fue una decisión real
    // sobre un monotributo, es basura de testeo.
    const t = _tramiteDe(nro);
    if (t) {
      await supaDel('monoTramites', t.id);
      DB.monoTramites = (DB.monoTramites || []).filter(x => x.id !== t.id);
    }
  } else {
    if (!DB.monoCambios) DB.monoCambios = [];
    const cambio = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      nombre: l.nombre, fecha: new Date().toLocaleDateString('es-AR'),
      tipo: 'no_va_monotributo',
      antes: 'Bandeja de pendientes', despues: 'Excluido — ' + motivo,
      curAnterior: 0, curNuevo: 0, proyeccionAnual: null,
      motivo: detalle || motivo, decidoPor: currentUser?.nombre || 'Admin', resultado: 'Aprobado',
    };
    DB.monoCambios.unshift(cambio);
    await supaSync('monoCambios', cambio);
  }

  cerrarModal('modal-no-va-mono');
  toast(`✅ ${l.nombre} salió de la bandeja de Monotributo.`);
  renderMonoPendientes();
}

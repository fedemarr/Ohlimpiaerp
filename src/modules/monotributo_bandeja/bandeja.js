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
import { supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';

function _mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function _hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function _norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

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
    .filter(l => l.estado === 'Activo' && !padron.porNro.has(String(l.nro)) && !padron.porNombre.has(_norm(l.nombre)))
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
    const lim = f.tramite?.fechaLimite || '';
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

    let estado, accion;
    if (tieneDatos) {
      estado = '<span class="badge badge-azul">Con datos — falta comprobante</span>';
      accion = `<button class="btn btn-sm" style="background:#1e7b34;color:#fff;border:none;" onclick="subirComprobanteMonoBandeja('${f.l.nro}')">💲 Subir comprobante</button>`
        + ` <button class="btn btn-sm btn-secondary" onclick="abrirMonoTramite('${f.l.nro}')" title="Corregir los datos del alta">✎ Completar datos</button>`;
    } else if (f.tramite?.tramitePor) {
      estado = `<span class="badge badge-azul">EN TRÁMITE</span> <span style="font-size:11.5px;color:var(--texto-suave);">${f.tramite.tramitePor || ''} · ${_fmtFecha(f.tramite.tramiteFecha)}${f.diasTramite != null ? ' · hace ' + f.diasTramite + ' d' : ''}</span>`;
      accion = `<button class="btn btn-sm" style="background:#1e7b34;color:#fff;border:none;" onclick="abrirMonoTramite('${f.l.nro}')">Cargar monotributo</button>`;
    } else {
      estado = '<span class="badge badge-rojo">SIN INICIAR</span>';
      accion = `<button class="btn btn-primary btn-sm" onclick="iniciarTramiteMono('${f.l.nro}')">Iniciar trámite</button>`;
    }

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
export function subirComprobanteMonoBandeja(legajoNro) {
  import('@modules/monotributo_comprobantes/comprobantes.js').then(({ elegirArchivoComprobante, confirmarComprobanteBandeja }) => {
    elegirArchivoComprobante(file => confirmarComprobanteBandeja(legajoNro, file));
  });
}

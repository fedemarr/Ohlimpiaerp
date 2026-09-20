// Monotributo — 📥 Bandeja de Pendientes (MONOTRIBUTO_bandeja_para_Fede.md +
// mockup_monotributo_bandeja.html). Mismo patrón que Pendientes de CBU: el
// alta SIEMBRA el trámite. Es derivado, no una tabla que alguien tenga que
// llenar: pendiente = asociado ACTIVO sin monotributo en el Padrón. Por eso
// las altas nuevas caen solas y el backfill de los activos de hoy es
// automático. Solo el estado EN TRÁMITE (quién + cuándo) se persiste
// (tabla mono_tramites, sql/v151). Sale de la bandeja cuando su monotributo
// pasa a ACTIVO, es decir cuando aparece en el Padrón (DB.monotributos).
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

// Horas cargadas en las grillas del período vigente, por N° de socio —
// misma regla de "horas cobradas" que Liquidación de horas (F/AI = 0, AJ paga).
function _horasEnGrillas(mes) {
  const porNro = {};
  (DB.grillasLiq || []).filter(g => g.periodo === mes).forEach(g => {
    (g.asociados || []).forEach(a => {
      if (a.nro == null) return;
      let hs = 0;
      Object.keys(a.horas || {}).forEach(iso => {
        hs += window.horasCobradasDia ? window.horasCobradasDia(a, iso) : (parseFloat(a.horas[iso]) || 0);
      });
      porNro[String(a.nro)] = (porNro[String(a.nro)] || 0) + hs;
    });
  });
  return porNro;
}

function _tramiteDe(nro) {
  return (DB.monoTramites || []).find(t => !t.anulado && String(t.legajoNro) === String(nro)) || null;
}

// Filas de la bandeja, ya ordenadas: primero los que tienen horas (más horas
// arriba) — "el que está por liquidar sin monotributo grita primero" — y
// después el resto por días en bandeja descendente.
export function filasBandejaMono() {
  const padron = _enPadron();
  const horas = _horasEnGrillas(_mesActual());
  const filas = (DB.legajos || [])
    .filter(l => l.estado === 'Activo' && !padron.porNro.has(String(l.nro)) && !padron.porNombre.has(_norm(l.nombre)))
    .map(l => {
      const t = _tramiteDe(l.nro);
      const altaISO = _fechaAltaISO(l);
      return {
        l, altaISO, dias: _diasDesde(altaISO), hs: Math.round((horas[String(l.nro)] || 0) * 10) / 10,
        tramite: t, diasTramite: t ? _diasDesde(t.tramiteFecha) : null,
      };
    });
  filas.sort((a, b) => ((b.hs > 0) - (a.hs > 0)) || (b.hs - a.hs) || ((b.dias ?? -1) - (a.dias ?? -1)));
  return filas;
}

export function renderMonoPendientes() {
  const filas = filasBandejaMono();
  const conHoras = filas.filter(f => f.hs > 0).length;
  const enTramite = filas.filter(f => f.tramite);
  const prom = enTramite.length ? Math.round(enTramite.reduce((s, f) => s + (f.diasTramite || 0), 0) / enTramite.length) : 0;

  if ($('kpi-mp-pend')) $('kpi-mp-pend').textContent = filas.length;
  if ($('kpi-mp-horas')) $('kpi-mp-horas').textContent = conHoras;
  if ($('kpi-mp-tram')) $('kpi-mp-tram').textContent = enTramite.length ? `${enTramite.length} (${prom} d)` : '0';
  if ($('kpi-mp-padron')) $('kpi-mp-padron').textContent = _enPadron().cantidad;
  const badge = $('mono-badge-pendientes');
  if (badge) { badge.textContent = filas.length; badge.style.display = filas.length ? 'inline-block' : 'none'; }

  const tbody = $('tbody-mono-pendientes');
  if (!tbody) return;
  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.5;">Bandeja vacía — todos los asociados activos tienen su monotributo ✓</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(f => {
    const hsChip = f.hs > 0
      ? `<span class="badge badge-naranja">⚠ ${f.hs} hs — va a liquidar sin monotributo</span>`
      : '<span class="badge badge-gris">0 hs</span>';
    const estado = f.tramite
      ? `<span class="badge badge-azul">EN TRÁMITE</span> <span style="font-size:11.5px;color:var(--texto-suave);">${f.tramite.tramitePor || ''} · ${_fmtFecha(f.tramite.tramiteFecha)}${f.diasTramite != null ? ' · hace ' + f.diasTramite + ' d' : ''}</span>`
      : '<span class="badge badge-rojo">SIN INICIAR</span>';
    const accion = f.tramite
      ? `<button class="btn btn-sm" style="background:#1e7b34;color:#fff;border:none;" onclick="abrirMonoTramite('${f.l.nro}')">Cargar monotributo</button>`
      : `<button class="btn btn-primary btn-sm" onclick="iniciarTramiteMono('${f.l.nro}')">Iniciar trámite</button>`;
    return `<tr>
      <td><b>${f.l.nro}</b> · ${f.l.nombre}</td>
      <td style="font-size:12px;">${f.l.cuit || '—'}</td>
      <td style="font-size:12px;">${_fmtFecha(f.altaISO)}</td>
      <td style="text-align:right;">${f.dias ?? '—'}</td>
      <td>${hsChip}</td>
      <td>${estado}</td>
      <td style="white-space:nowrap;">${accion}</td>
    </tr>`;
  }).join('');
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

// SIN INICIAR → EN TRÁMITE: guarda quién y cuándo, y abre el modal.
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

// Módulo Supervisión de Servicios — sql/v086, ticket 13/08/2026.
// El % de supervisión es una propiedad de la relación servicio-supervisión,
// con cascada de defaults: GENERAL (3%, Configuración) → CLIENTE (campo
// "% supervisión" del cliente) → SERVICIO (override puntual). Gana el más
// específico. El pago del supervisor sale por Liquidación Administración
// ("Adicional por supervisión" calculado + "Ajuste de nivelación" de
// Finanzas) — NUNCA se llama "comisión" (eso es de coordinadores de cuenta).
//
// Cada % se guarda como una VIGENCIA (nivel, alcance, %, vigente-desde,
// vigente-hasta, usuario, fecha, motivo). Cambiar un % nunca pisa el
// anterior: se cierra la vigencia abierta y se abre una nueva. La
// liquidación de cada mes usa el % vigente de ESE mes — los meses cerrados
// se reconstruyen exactos siempre.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const PCT_GENERAL_DEFAULT = 3;

export function mesActualStr() {
  return new Date().toISOString().slice(0, 7);
}
export function hoyStrArg() {
  return new Date().toLocaleDateString('es-AR');
}
function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return d.toISOString().slice(0, 7);
}
function mesSiguiente(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m, 1);
  return d.toISOString().slice(0, 7);
}
function fmtPct(p) {
  return (p != null ? p : 0).toFixed(2).replace('.', ',') + '%';
}

// ── Permisos ──
// El % y las vigencias los edita FINANZAS (+ Administrador total). El
// Gerente General "define los valores" pero la carga la hace Finanzas.
// El resto de los perfiles con acceso ve el módulo en solo lectura.
export function esEditorSupervision() {
  return ['Finanzas', 'Administrador total'].includes(currentUser?.perfil);
}

// ── Identificación estable de alcances ──
// Se usa el CÓDIGO de la entidad (estable entre reloads, a diferencia del
// id truncado a 9 dígitos al persistir) — mismo criterio de conciliación
// que el resto del sistema.
function alcanceServicio(o) {
  return o.codigo || String(o.id);
}
function alcanceCliente(c) {
  return c.codigo || String(c.id);
}
function clienteDeObjetivo(o) {
  return (DB.clientes || []).find(c => String(c.id) === String(o.clienteId));
}

// ── Vigencias ──
function vigenciasDe(nivel, alcance) {
  return (DB.supervisionVigencias || []).filter(v =>
    v.nivel === nivel && String(v.alcance) === String(alcance) && v.anulado !== true);
}
// La vigencia que regía en un mes dado para un (nivel, alcance). Si hay
// varias (nunca debería), gana la más reciente en vigente_desde.
export function vigenciaVigente(nivel, alcance, mes) {
  return vigenciasDe(nivel, alcance)
    .filter(v => (!v.vigenteDesde || v.vigenteDesde <= mes) && (!v.vigenteHasta || v.vigenteHasta >= mes))
    .sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''))[0] || null;
}
export function vigenciaAbierta(nivel, alcance) {
  return vigenciasDe(nivel, alcance).find(v => !v.vigenteHasta) || null;
}

// % GENERAL vigente para un mes (default 3 si nunca se tocó).
export function pctGeneralVigente(mes) {
  const v = vigenciaVigente('general', 'GENERAL', mes || mesActualStr());
  return v ? Number(v.pct) : PCT_GENERAL_DEFAULT;
}

// % efectivo de un objetivo para un mes: SERVICIO > CLIENTE > GENERAL.
// Devuelve {pct, origen: 'servicio'|'cliente'|'general'}.
export function pctEfectivoObjetivo(o, mes) {
  const m = mes || mesActualStr();
  const sv = vigenciaVigente('servicio', alcanceServicio(o), m);
  if (sv) return { pct: Number(sv.pct), origen: 'servicio' };
  const cli = clienteDeObjetivo(o);
  if (cli) {
    const cv = vigenciaVigente('cliente', alcanceCliente(cli), m);
    if (cv) return { pct: Number(cv.pct), origen: 'cliente' };
  }
  return { pct: pctGeneralVigente(m), origen: 'general' };
}

// % efectivo de un CLIENTE para un mes (para la fila-cliente del grid).
export function pctEfectivoCliente(cli, mes) {
  const m = mes || mesActualStr();
  const cv = vigenciaVigente('cliente', alcanceCliente(cli), m);
  if (cv) return { pct: Number(cv.pct), origen: 'cliente' };
  return { pct: pctGeneralVigente(m), origen: 'general' };
}

// Cierra la vigencia abierta de un (nivel, alcance) y abre una nueva que
// rige desde `desde`. Persiste ambas. Actualiza el espejo en la entidad
// (clientes/objetivos) para que las fichas de Comercial lean directo.
export function abrirNuevaVigencia(nivel, alcance, alcanceNombre, pct, desde, motivo) {
  const desdeFinal = desde || mesActualStr();
  const abierta = vigenciaAbierta(nivel, alcance);
  if (abierta) {
    abierta.vigenteHasta = mesAnterior(desdeFinal);
    abierta.updatedAt = new Date().toISOString();
    supaSync('supervisionVigencias', abierta);
  }
  const nueva = {
    id: Date.now(),
    nivel, alcance: String(alcance), alcanceNombre: alcanceNombre || '',
    pct: Math.round(Number(pct) * 100) / 100,
    vigenteDesde: desdeFinal, vigenteHasta: null,
    usuario: currentUser?.nombre || '', fecha: hoyStrArg(), motivo: motivo || '',
  };
  if (!DB.supervisionVigencias) DB.supervisionVigencias = [];
  DB.supervisionVigencias.push(nueva);
  supaSync('supervisionVigencias', nueva);

  // Espejo en la entidad de Comercial (dato vivo, edición solo acá).
  if (nivel === 'servicio') {
    const o = (DB.objetivos || []).find(x => String(alcanceServicio(x)) === String(alcance));
    if (o) { o.pctSupervision = nueva.pct; supaSync('objetivos', objetivoParaGuardar(o)); }
  } else if (nivel === 'cliente') {
    const c = (DB.clientes || []).find(x => String(alcanceCliente(x)) === String(alcance));
    if (c) { c.pctSupervision = nueva.pct; supaSync('clientes', c); }
  }
  return nueva;
}

// "Heredar": elimina el override del alcance — se cierra la vigencia y el
// campo de la entidad vuelve a null (cae al nivel menos específico).
export function heredarVigencia(nivel, alcance, motivo) {
  const abierta = vigenciaAbierta(nivel, alcance);
  if (abierta) {
    abierta.vigenteHasta = mesAnterior(mesActualStr());
    abierta.updatedAt = new Date().toISOString();
    supaSync('supervisionVigencias', abierta);
  }
  if (nivel === 'servicio') {
    const o = (DB.objetivos || []).find(x => String(alcanceServicio(x)) === String(alcance));
    if (o && o.pctSupervision != null) { o.pctSupervision = null; supaSync('objetivos', objetivoParaGuardar(o)); }
  } else if (nivel === 'cliente') {
    const c = (DB.clientes || []).find(x => String(alcanceCliente(x)) === String(alcance));
    if (c && c.pctSupervision != null) { c.pctSupervision = null; supaSync('clientes', c); }
  }
}

// Seed inicial: si no existe NINGUNA vigencia general, crea el 3% general
// (alta inicial del módulo) para que la cascada arranque con sentido.
export function asegurarVigenciaGeneralSeed() {
  if ((DB.supervisionVigencias || []).some(v => v.nivel === 'general' && v.anulado !== true)) return;
  const gen = {
    id: Date.now(),
    nivel: 'general', alcance: 'GENERAL', alcanceNombre: 'Todos los servicios',
    pct: PCT_GENERAL_DEFAULT, vigenteDesde: mesActualStr(), vigenteHasta: null,
    usuario: 'Sistema', fecha: hoyStrArg(), motivo: 'Alta inicial del módulo',
  };
  if (!DB.supervisionVigencias) DB.supervisionVigencias = [];
  DB.supervisionVigencias.push(gen);
  supaSync('supervisionVigencias', gen);
}

// ── Supervisores del objetivo ──
function supervisoresDelObjetivo(o) {
  return (o.supervisoresAsignados && o.supervisoresAsignados.length) ? o.supervisoresAsignados : (o.supervisorAsignado ? [o.supervisorAsignado] : []);
}

// Comparación de nombres tolerante al orden ("Cazenave Claudia" ==
// "Claudia Cazenave"): normaliza palabras ordenadas. No cubre diferencias
// de ortografía (Lorena Unzain vs Uzabain — dato, no código).
export function esMismoSupervisor(a, b) {
  const norm = n => String(n || '').toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');
  return norm(a) === norm(b);
}

// Servicios OPERATIVOS con supervisor asignado (la base del grid y del
// cálculo del adicional). Sin estado, sin supervisor → no cuentan.
export function serviciosSupervisadosActivos() {
  return (DB.objetivos || []).filter(o =>
    !o.anulado && o.estado === 'Operativo' && supervisoresDelObjetivo(o).length);
}

function netaMensual(o) {
  const fn = window.calcularFacturacionMensualObjetivo;
  if (typeof fn === 'function') return fn(o);
  if (o.modeloPrecio === 'Por EFT' || o.modeloPrecio === 'Por horas variables') {
    return (o.efts && o.valorHora) ? (o.efts * o.valorHora) : null;
  }
  return o.valor || 0;
}

// Adicional por supervisión de una persona en un mes: Σ sobre sus servicios
// de neta × % vigente / N supervisores del servicio. Es lo que Liquidación
// Administración muestra BLOQUEADO en la columna "Adicional por supervisión".
export function adicionalSupervisionDe(nombre, mes) {
  const m = mes || mesActualStr();
  let total = 0;
  serviciosSupervisadosActivos().forEach(o => {
    const sups = supervisoresDelObjetivo(o);
    if (!sups.some(s => esMismoSupervisor(s, nombre))) return;
    const neta = netaMensual(o);
    if (neta == null) return;
    const { pct } = pctEfectivoObjetivo(o, m);
    total += (neta * pct / 100) / sups.length;
  });
  return total;
}

// Detalle por servicio del adicional de una persona (drill-down).
export function detalleAdicionalSupervision(nombre, mes) {
  const m = mes || mesActualStr();
  const filas = [];
  serviciosSupervisadosActivos().forEach(o => {
    const sups = supervisoresDelObjetivo(o);
    if (!sups.some(s => esMismoSupervisor(s, nombre))) return;
    const neta = netaMensual(o);
    if (neta == null) return;
    const { pct, origen } = pctEfectivoObjetivo(o, m);
    filas.push({
      codigo: o.codigo, nombreServicio: o.nombre || o.codigo, cliente: clienteDeObjetivo(o)?.nombre || '',
      supervisores: sups.length, neta, pct, origen, monto: (neta * pct / 100) / sups.length,
    });
  });
  return filas.sort((a, b) => b.monto - a.monto);
}

// ── Utilidad para legacy.js ──
// objetivoParaGuardar vive en legacy; si no está todavía cargado, devolver
// el objetivo tal cual (sin los campos que legacy quita).
function objetivoParaGuardar(o) {
  if (typeof window.objetivoParaGuardar === 'function') return window.objetivoParaGuardar(o);
  const { responsables, adjuntos, historialPrecios, supervisor, clienteId, ...resto } = o;
  return resto;
}

// ── RENDER ──

let _supMesActual = null; // mes que muestra la grilla ("Rige desde")

export function renderSupervision() {
  asegurarVigenciaGeneralSeed();
  if (!_supMesActual) _supMesActual = mesActualStr();
  renderStatsSup();
  renderTablaSupervision();
  renderTablaReporteSup();
  renderHistorialSup();
  renderVistaLiqSup();
}

function renderStatsSup() {
  const servicios = serviciosSupervisadosActivos();
  const mes = _supMesActual;
  let costo = 0, fueraGeneral = 0;
  servicios.forEach(o => {
    const { pct, origen } = pctEfectivoObjetivo(o, mes);
    const neta = netaMensual(o);
    if (neta == null) return;
    costo += neta * pct / 100;
    if (origen !== 'general') fueraGeneral++;
  });
  if ($('sup-c-srv')) $('sup-c-srv').textContent = servicios.length;
  if ($('sup-c-costo')) $('sup-c-costo').textContent = '$' + Math.round(costo).toLocaleString('es-AR');
  if ($('sup-c-exc')) $('sup-c-exc').textContent = fueraGeneral;
  if ($('sup-mes-sel')) $('sup-mes-sel').value = mes;
}

function chipOrigen(origen) {
  const map = {
    general: ['gen', 'GENERAL'],
    cliente: ['cliC', 'CLIENTE'],
    servicio: ['srv', 'SERVICIO'],
  };
  const [cls, label] = map[origen] || ['gen', 'GENERAL'];
  return `<span class="chip sup-chip ${cls}">${label}</span>`;
}

export function renderTablaSupervision() {
  const tbody = $('tbody-supervision');
  if (!tbody) return;
  const mes = _supMesActual;
  const servicios = serviciosSupervisadosActivos();
  const porCliente = {};
  servicios.forEach(o => {
    const cli = clienteDeObjetivo(o);
    const key = cli ? String(cli.id) : 'sin-cliente';
    if (!porCliente[key]) porCliente[key] = { cli, srvs: [] };
    porCliente[key].srvs.push(o);
  });
  const edit = esEditorSupervision();

  let rows = '';
  Object.values(porCliente)
    .sort((a, b) => (a.cli?.nombre || '').localeCompare(b.cli?.nombre || ''))
    .forEach(g => {
      const efCli = g.cli ? pctEfectivoCliente(g.cli, mes) : null;
      const cliOverride = g.cli ? (vigenciaAbierta('cliente', alcanceCliente(g.cli)) || g.cli.pctSupervision != null) : false;
      const cliId = g.cli ? alcanceCliente(g.cli) : 'sin-cliente';
      rows += `<tr class="sup-cli">
        <td>▾ ${g.cli?.nombre || 'Sin cliente'}</td>
        <td class="sm">${g.srvs.length} servicio(s)</td>
        <td class="sm"></td>
        <td>${efCli ? `<input type="number" class="sup-pct" value="${efCli.pct.toFixed(2).replace('.', ',')}" step="0.5" min="0" max="100"
          onchange="setPctClienteSup('${cliId.replace(/'/g, "\\'")}', this.value)" ${edit ? '' : 'disabled'}>%` : '—'}</td>
        <td>${efCli ? chipOrigen(efCli.origen) : '—'}</td>
        <td class="sm">% del cliente — hereda a sus servicios</td>
        <td>${(edit && g.cli && cliOverride) ? `<span class="sup-heredar" onclick="heredarClienteSup('${cliId.replace(/'/g, "\\'")}')">heredar</span>` : ''}</td>
      </tr>`;
      g.srvs
        .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
        .forEach(o => {
          const { pct, origen } = pctEfectivoObjetivo(o, mes);
          const neta = netaMensual(o);
          const sup = (neta == null) ? null : Math.round(neta * pct / 100);
          const svcAlcance = alcanceServicio(o);
          const tieneOverride = vigenciaAbierta('servicio', svcAlcance) || o.pctSupervision != null;
          rows += `<tr>
            <td style="padding-left:34px;">${o.codigo || o.nombre || ''}</td>
            <td class="sm">${supervisoresDelObjetivo(o).join(', ') || '—'}</td>
            <td class="money">${neta != null ? Math.round(neta).toLocaleString('es-AR') : '<span class="sm">depende de horas</span>'}</td>
            <td><input type="number" class="sup-pct" value="${pct.toFixed(2).replace('.', ',')}" step="0.5" min="0" max="100"
              onchange="setPctServicioSup('${svcAlcance.replace(/'/g, "\\'")}', this.value)" ${edit ? '' : 'disabled'}>%</td>
            <td>${chipOrigen(origen)}</td>
            <td class="money">${sup != null ? sup.toLocaleString('es-AR') : '—'}</td>
            <td>
              ${(edit && tieneOverride) ? `<span class="sup-heredar" onclick="heredarServicioSup('${svcAlcance.replace(/'/g, "\\'")}')">heredar</span>` : ''}
              <button class="btn btn-xs" style="background:none;border:none;cursor:pointer;font-size:12px;" title="Historial de % de este servicio"
                onclick="abrirHistorialServicioSup('${svcAlcance.replace(/'/g, "\\'")}')">🕘</button>
            </td>
          </tr>`;
        });
    });
  if (!rows) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin servicios operativos con supervisor asignado.</td></tr>`;
    return;
  }
  const costoTotal = servicios.reduce((s, o) => {
    const neta = netaMensual(o);
    if (neta == null) return s;
    return s + neta * pctEfectivoObjetivo(o, mes).pct / 100;
  }, 0);
  rows += `<tr class="sup-tot"><td colspan="5">COSTO TOTAL DE SUPERVISIÓN DEL MES</td><td class="money">$${Math.round(costoTotal).toLocaleString('es-AR')}</td><td></td></tr>`;
  tbody.innerHTML = rows;
}

export function renderTablaReporteSup() {
  const tbody = $('tbody-sup-reporte');
  if (!tbody) return;
  const mes = _supMesActual;
  const porSup = {};
  serviciosSupervisadosActivos().forEach(o => {
    const sups = supervisoresDelObjetivo(o);
    const neta = netaMensual(o);
    if (neta == null) return;
    const { pct } = pctEfectivoObjetivo(o, mes);
    sups.forEach(nombre => {
      if (!porSup[nombre]) porSup[nombre] = { servicios: 0, neta: 0, adicional: 0 };
      porSup[nombre].servicios++;
      porSup[nombre].neta += neta / sups.length;
      porSup[nombre].adicional += (neta * pct / 100) / sups.length;
    });
  });
  const filas = Object.entries(porSup)
    .sort((a, b) => b[1].adicional - a[1].adicional)
    .map(([nombre, v]) => `<tr>
      <td class="sup-name">${nombre}</td>
      <td>${v.servicios}</td>
      <td class="money">${Math.round(v.neta).toLocaleString('es-AR')}</td>
      <td class="money green">${Math.round(v.adicional).toLocaleString('es-AR')}</td>
    </tr>`).join('');
  tbody.innerHTML = filas || `<tr><td colspan="4" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin datos</td></tr>`;
}

export function renderVistaLiqSup() {
  const tbody = $('tbody-sup-liq');
  if (!tbody) return;
  const mes = _supMesActual;
  const personal = (DB.liqAdminPersonal || []).filter(p => p.activo);
  const rows = personal.map(p => {
    const valPeriodo = getValoresPeriodo(DB.liqAdminValores, p.id, mes, { horasFijas: p.horasFijas || 200, valorHora: p.valorHora || 0 });
    const base = (valPeriodo.horasFijas || 0) * (valPeriodo.valorHora || 0);
    const adicional = adicionalSupervisionDe(p.nombre, mes);
    const ajuste = DB.liqAdminAjustes?.[mes]?.[p.id]?.ajuste || 0;
    return `<tr>
      <td class="sup-name">${p.nombre}</td>
      <td>${p.categoria || '—'}</td>
      <td class="money">${Math.round(valPeriodo.horasFijas).toLocaleString('es-AR')} × ${Math.round(valPeriodo.valorHora).toLocaleString('es-AR')} = ${Math.round(base).toLocaleString('es-AR')}</td>
      <td class="money">${Math.round(adicional).toLocaleString('es-AR')} <span class="sup-lock">🔒 auto</span></td>
      <td class="money">${ajuste ? (ajuste > 0 ? '+' : '') + Math.round(ajuste).toLocaleString('es-AR') : '—'}</td>
      <td class="money green">${Math.round(base + adicional + ajuste).toLocaleString('es-AR')}</td>
    </tr>`;
  }).join('');
  tbody.innerHTML = rows || `<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin personal administrativo.</td></tr>`;
}

export function renderHistorialSup() {
  // Registro de cambios (log cronológico descendente)
  const tbody = $('tbody-sup-historial');
  if (tbody) {
    const vigencias = (DB.supervisionVigencias || []).filter(v => v.anulado !== true)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''));
    const chip = (nivel) => nivel === 'general' ? '<span class="chip sup-chip gen">GENERAL</span>'
      : nivel === 'cliente' ? '<span class="chip sup-chip cliC">CLIENTE</span>'
      : '<span class="chip sup-chip srv">SERVICIO</span>';
    tbody.innerHTML = vigencias.map(v => {
      const previa = vigenciasDe(v.nivel, v.alcance)
        .filter(x => x.vigenteHasta === v.vigenteDesde || x.vigenteHasta === mesAnterior(v.vigenteDesde))
        .sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''))[0];
      const anterior = previa ? fmtPct(previa.pct) : '—';
      return `<tr>
        <td>${v.fecha || '—'}</td>
        <td>${v.usuario || '—'}</td>
        <td>${chip(v.nivel)}</td>
        <td>${v.alcanceNombre || v.alcance}</td>
        <td>${anterior}</td>
        <td>${fmtPct(v.pct)}</td>
        <td>${v.vigenteDesde || '—'}</td>
        <td>${v.motivo || '—'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin cambios registrados.</td></tr>`;
  }
  // Foto por mes — selector
  const sel = $('sup-foto-mes');
  if (sel && !sel.options.length) {
    const meses = new Set();
    (DB.supervisionVigencias || []).forEach(v => {
      if (v.vigenteDesde) meses.add(v.vigenteDesde);
      if (v.vigenteHasta) meses.add(v.vigenteHasta);
    });
    meses.add(mesActualStr());
    [...meses].sort().reverse().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      sel.appendChild(opt);
    });
  }
  renderFotoPorMes();
}

export function renderFotoPorMes() {
  const tbody = $('tbody-sup-foto');
  if (!tbody) return;
  const mes = $('sup-foto-mes')?.value || mesActualStr();
  tbody.innerHTML = serviciosSupervisadosActivos()
    .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
    .map(o => {
      const { pct, origen } = pctEfectivoObjetivo(o, mes);
      return `<tr><td>${o.codigo || ''}</td><td>${fmtPct(pct)}</td><td>${chipOrigen(origen)}</td></tr>`;
    }).join('') || `<tr><td colspan="3" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin servicios.</td></tr>`;
}

// ── EDICIÓN (modal de vigencia) ──

let _vigenciaPendiente = null; // {nivel, alcance, alcanceNombre, pct}

function ensureModalVigencia() {
  if ($('modal-sup-vigencia')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-sup-vigencia';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>Cambiar % de supervisión</h3><button class="btn-close" onclick="cerrarModal('modal-sup-vigencia')">×</button></div>
      <div class="modal-body">
        <div class="alerta alerta-info" style="font-size:12px;">El % anterior no se borra: se cierra la vigencia y se abre una nueva desde el mes que elijas. La liquidación de cada mes usa el % vigente de ESE mes.</div>
        <div class="form-section">Nuevo %</div>
        <input type="number" id="sup-vig-pct" step="0.5" min="0" max="100" style="width:110px;padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);font-size:14px;font-weight:700;">
        <div class="form-section" style="margin-top:14px;">Rige desde</div>
        <input type="month" id="sup-vig-desde" style="padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);font-size:13px;">
        <div class="form-section" style="margin-top:14px;">Motivo (obligatorio para auditar)</div>
        <input type="text" id="sup-vig-motivo" placeholder="Ej.: ajuste acordado por la empresa" style="width:100%;padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);font-size:13px;">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-sup-vigencia')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarVigenciaSup()">Guardar vigencia</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function abrirModalVigencia(nivel, alcance, alcanceNombre, pctActual, rigeDesde) {
  if (!esEditorSupervision()) { toast('⛔ Solo Finanzas puede editar el % de supervisión'); return; }
  _vigenciaPendiente = { nivel, alcance, alcanceNombre, pct: pctActual };
  ensureModalVigencia();
  $('sup-vig-pct').value = String(pctActual).replace('.', ',');
  $('sup-vig-desde').value = rigeDesde || mesActualStr();
  $('sup-vig-motivo').value = '';
  abrirModal('modal-sup-vigencia');
}

export function setPctClienteSup(alcance, valor) {
  const c = (DB.clientes || []).find(x => String(alcanceCliente(x)) === String(alcance));
  if (!c) return;
  const ef = pctEfectivoCliente(c, mesActualStr());
  abrirModalVigencia('cliente', alcance, c.nombre, ef.pct, mesActualStr());
}

export function setPctServicioSup(alcance, valor) {
  const o = (DB.objetivos || []).find(x => String(alcanceServicio(x)) === String(alcance));
  if (!o) return;
  const ef = pctEfectivoObjetivo(o, mesActualStr());
  abrirModalVigencia('servicio', alcance, o.codigo || o.nombre || '', ef.pct, mesActualStr());
}

export function confirmarVigenciaSup() {
  if (!_vigenciaPendiente) return;
  const pctValor = parseFloat(String($('sup-vig-pct').value || '').replace(',', '.'));
  const desde = $('sup-vig-desde').value || mesActualStr();
  const motivo = $('sup-vig-motivo').value.trim();
  if (isNaN(pctValor) || pctValor < 0) { toast('⚠️ Ingresá un % válido'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }
  // Meses liquidados no se tocan: no permitir vigencia que rija en el pasado.
  if (desde < mesActualStr()) { toast('⚠️ No podés hacer regir un % en meses anteriores al actual (meses liquidados no se tocan)'); return; }
  const { nivel, alcance, alcanceNombre } = _vigenciaPendiente;
  const gen = pctGeneralVigente(desde);
  // Si el valor es igual al que ya hereda del nivel menos específico, es
  // un "heredar" implícito: se limpia el override (misma lógica del mockup).
  let destino = nivel;
  let valorFinal = pctValor;
  let heredar = false;
  if (nivel === 'servicio') {
    const o = (DB.objetivos || []).find(x => String(alcanceServicio(x)) === String(alcance));
    const baseHeredada = o ? pctEfectivoObjetivo(o, desde) : null;
    // el override sólo "pisa" si difiere de lo que heredaría el servicio
    heredar = baseHeredada != null && Math.abs(baseHeredada.pct - pctValor) < 0.001 && !vigenciaAbierta('servicio', alcance);
  } else if (nivel === 'cliente') {
    heredar = Math.abs(gen - pctValor) < 0.001 && !vigenciaAbierta('cliente', alcance);
  }
  if (heredar) {
    heredarVigencia(destino, alcance, 'Igual al nivel general — hereda');
    toast(`✓ ${alcanceNombre || alcance} vuelve a heredar (${fmtPct(gen)})`);
  } else {
    abrirNuevaVigencia(destino, alcance, alcanceNombre, valorFinal, desde, motivo);
    toast(`✓ ${alcanceNombre || alcance}: ${fmtPct(valorFinal)} desde ${desde}`);
  }
  cerrarModal('modal-sup-vigencia');
  _vigenciaPendiente = null;
  renderSupervision();
}

export function heredarClienteSup(alcance) {
  if (!esEditorSupervision()) { toast('⛔ Solo Finanzas puede editar el % de supervisión'); return; }
  const c = (DB.clientes || []).find(x => String(alcanceCliente(x)) === String(alcance));
  if (!c) return;
  if (!confirm(`¿Quitar el % propio de ${c.nombre} para que vuelva a heredar el GENERAL?`)) return;
  heredarVigencia('cliente', alcance, 'Heredar del nivel general');
  toast(`✓ ${c.nombre} vuelve a heredar el general`);
  renderSupervision();
}

export function heredarServicioSup(alcance) {
  if (!esEditorSupervision()) { toast('⛔ Solo Finanzas puede editar el % de supervisión'); return; }
  const o = (DB.objetivos || []).find(x => String(alcanceServicio(x)) === String(alcance));
  if (!o) return;
  if (!confirm(`¿Quitar el % propio de ${o.codigo} para que vuelva a heredar (cliente o general)?`)) return;
  heredarVigencia('servicio', alcance, 'Heredar del nivel cliente/general');
  toast(`✓ ${o.codigo} vuelve a heredar`);
  renderSupervision();
}

export function abrirHistorialServicioSup(alcance) {
  const vigencias = vigenciasDe('servicio', alcance).sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''));
  const o = (DB.objetivos || []).find(x => String(alcanceServicio(x)) === String(alcance));
  const ef = o ? pctEfectivoObjetivo(o, mesActualStr()) : null;
  let html = `<div class="alerta alerta-info" style="font-size:12px;">Línea de tiempo de <strong>${o?.codigo || alcance}</strong> — hoy: <strong>${ef ? fmtPct(ef.pct) : '—'} (${ef?.origen || '—'})</strong></div>`;
  html += vigencias.map(v => `<div style="padding:8px;background:var(--fondo);border-radius:var(--radio);margin-bottom:5px;border:1px solid var(--borde);font-size:12px;">
    <div><strong>${fmtPct(v.pct)}</strong> · ${v.vigenteDesde} a ${v.vigenteHasta || 'hoy'}</div>
    <div style="color:var(--texto-suave);font-size:11px;">${v.usuario || '—'} · ${v.fecha || '—'} · ${v.motivo || ''}</div>
  </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin vigencias de % para este servicio.</p>';
  $('pedido-title').textContent = `🕘 Historial de % — ${o?.codigo || alcance}`;
  $('pedido-body').innerHTML = html;
  abrirModal('modal-ver-pedido');
}

// ── TAB ──

export function tabSupervision(i) {
  [0, 1, 2, 3].forEach(j => {
    const t = $('sup-tab-' + j);
    const p = $('sup-panel-' + j);
    if (t) t.classList.toggle('active', i === j);
    if (p) p.classList.toggle('active', i === j);
  });
  if (i === 0) renderTablaSupervision();
  if (i === 1) renderTablaReporteSup();
  if (i === 2) renderVistaLiqSup();
  if (i === 3) renderHistorialSup();
}

export function cambiarMesSup(valor) {
  _supMesActual = valor || mesActualStr();
  renderSupervision();
}

// getValoresPeriodo es de legacy; si no está, devolver el fallback.
function getValoresPeriodo(store, id, mes, fallback) {
  if (typeof window.getValoresPeriodo === 'function') return window.getValoresPeriodo(store, id, mes, fallback);
  const v = store?.[mes]?.[id];
  return v || fallback;
}

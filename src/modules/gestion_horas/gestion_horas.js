// Gestión de horas (GESTION_HORAS_para_Fede.md) — "el gemelo de Gestión
// de precios": Precios dice a cuánto la hora cada mes; este módulo dice
// cuántas horas cada mes. Facturación multiplica los dos.
//
// Lo pactado es una REGLA (puestos × horario × días × Fer), no un número
// — las horas del mes se CALCULAN de la regla contra el calendario real
// (feriados incluidos). Cambiar el contrato = nueva VIGENCIA desde un
// período, nunca se pisa la anterior — mismo patrón ya construido y
// probado en Supervisión de servicios (supervision_vigencias): cerrar la
// vigencia abierta, abrir una nueva, con usuario/fecha/motivo.
//
// Alcance de esta primera entrega (confirmado con el usuario): modelo +
// vigencias + cálculo real contra Feriados + matriz + modal de nueva
// vigencia. La precarga del PROYECTADO en las grillas de Liquidación de
// horas y la conexión automática a Prepedidos/alertas de reducción quedan
// para un ticket aparte (el "PROYECTADO" de las grillas hoy significa
// algo distinto — "día sin verificar todavía" — y mezclar los dos
// conceptos sin una revisión aparte es un riesgo real).
import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { checklistDiasHtml, diasMarcadosTexto } from '@shared/horarioDias.js';
import {
  horasPuestosMes, composicionMes, mesActualStr, mesAnterior, mesSiguiente,
  rangoMeses, mesLabel, mesDeFechaArg,
} from './calculo.js';

const VENTANA_ATRAS = 2, VENTANA_ADELANTE = 4; // 7 columnas — misma ventana que el mockup verificado del ticket

function hoyStrArg() { return new Date().toLocaleDateString('es-AR'); }
function fmt(n) { return Math.round(n).toLocaleString('es-AR'); }
// Código como alcance estable (mismo criterio que ya usa Supervisión —
// alcanceServicio = o.codigo || o.id — el código no cambia entre reloads,
// a diferencia del id truncado a 9 dígitos).
function alcanceServicio(o) { return o.codigo || String(o.id); }
function clienteDeObjetivo(o) { return (DB.clientes || []).find(c => String(c.id) === String(o.clienteId)); }
function periodoCongelado(mes) { return !!(DB.periodosLiq || []).find(p => p.periodo === mes)?.congelado; }

export function puedeEditarHoras() {
  return ['Administrador total', 'Operaciones', 'Comercial'].includes(currentUser?.perfil);
}

// ========== VIGENCIAS ==========

function vigenciasDe(objCodigo) {
  return (DB.horasVigencias || []).filter(v => v.objCodigo === objCodigo && v.anulado !== true);
}
// La vigencia que rige en un mes dado (mismo filtro que Supervisión:
// desde <= mes <= hasta, hasta null = sigue abierta).
export function vigenciaParaMes(objCodigo, mes) {
  return vigenciasDe(objCodigo)
    .filter(v => (!v.vigenteDesde || v.vigenteDesde <= mes) && (!v.vigenteHasta || v.vigenteHasta >= mes))
    .sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''))[0] || null;
}
function ultimaVigencia(objCodigo) {
  return vigenciasDe(objCodigo).slice().sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''))[0] || null;
}
// GESTION_HORAS_carga_directa_para_Fede.md: un servicio operativo sin
// NINGUNA vigencia todavía (el stock histórico de ~200 que nunca tuvo
// Personal necesario en el alta) — se distingue de "tiene regla pero
// este mes puntual cae antes de la primera vigencia", que también da
// vigenciaParaMes()===null pero acá NO cuenta como "sin regla".
export function tieneRegla(objCodigo) { return vigenciasDe(objCodigo).length > 0; }
export function horasServicioMes(objCodigo, mes) {
  const v = vigenciaParaMes(objCodigo, mes);
  return v ? horasPuestosMes(v.puestos, mes) : 0;
}

// Abre una nueva vigencia desde `desde`: cierra la abierta (vigenteHasta
// = mes anterior) y crea la nueva. Nunca pisa lo anterior — el historial
// completo queda en DB.horasVigencias.
export async function abrirNuevaVigenciaHoras(objCodigo, puestos, desde, usuario, motivo, origen) {
  const abierta = vigenciasDe(objCodigo).find(v => !v.vigenteHasta);
  if (abierta) {
    abierta.vigenteHasta = mesAnterior(desde);
    abierta.updatedAt = new Date().toISOString();
    await supaSync('horasVigencias', abierta);
  }
  const nueva = {
    id: Date.now(), objCodigo, puestos: JSON.parse(JSON.stringify(puestos || [])),
    vigenteDesde: desde, vigenteHasta: null,
    usuario: usuario || currentUser?.nombre || '', fecha: hoyStrArg(),
    motivo: motivo || '', origen: origen || 'operaciones',
  };
  if (!DB.horasVigencias) DB.horasVigencias = [];
  DB.horasVigencias.push(nueva);
  await supaSync('horasVigencias', nueva);
  return nueva;
}

// "El alta siembra la regla" (doc §3) — llamada desde legacy.js vía
// window binding (mismo patrón que window.sembrarPrepedido) apenas se
// guarda un servicio nuevo con Personal necesario cargado.
export function sembrarVigenciaHorasDesdeAlta(objetivo) {
  const objCodigo = alcanceServicio(objetivo);
  if (vigenciasDe(objCodigo).length) return null; // ya tiene vigencia, no duplicar
  if (!objetivo.puestos?.length) return null;
  const desde = mesDeFechaArg(objetivo.fechaInicio) || mesActualStr();
  const nueva = {
    id: Date.now(), objCodigo, puestos: JSON.parse(JSON.stringify(objetivo.puestos)),
    vigenteDesde: desde, vigenteHasta: null,
    usuario: objetivo.cargadoPor || '', fecha: hoyStrArg(),
    motivo: 'Alta del servicio — bloque Personal necesario', origen: 'alta',
  };
  if (!DB.horasVigencias) DB.horasVigencias = [];
  DB.horasVigencias.push(nueva);
  supaSync('horasVigencias', nueva);
  return nueva;
}

// Backfill (mismo patrón que sincronizarPrepedidos en prepedidos.js):
// todo servicio vigente sin ninguna vigencia todavía la recibe, sembrada
// desde su Personal necesario ACTUAL — así el módulo no arranca vacío
// para los servicios cargados antes de este ticket. Se llama en cada
// render(): idempotente, silenciosa, sin costo para lo que ya tiene.
export function sincronizarVigenciasHoras() {
  let n = 0;
  (DB.objetivos || []).forEach(o => {
    if (o.anulado || o.estado === 'Baja') return;
    if (!o.puestos?.length) return;
    const objCodigo = alcanceServicio(o);
    if (vigenciasDe(objCodigo).length) return;
    const nueva = {
      id: Date.now() + n, objCodigo, puestos: JSON.parse(JSON.stringify(o.puestos)),
      vigenteDesde: mesActualStr(), vigenteHasta: null,
      usuario: 'Sistema', fecha: hoyStrArg(),
      motivo: 'Backfill — vigencia inicial sembrada desde Personal necesario actual', origen: 'backfill',
    };
    DB.horasVigencias.push(nueva);
    supaSync('horasVigencias', nueva);
    n++;
  });
  return n;
}

// ========== MATRIZ ==========

let _expandidos = new Set();

// GESTION_HORAS_carga_directa_para_Fede.md §1: la matriz muestra TODOS
// los servicios OPERATIVOS, tengan regla o no — antes solo entraban los
// que ya tenían Personal necesario cargado en el alta (4 de ~200). El
// resto ya no desaparece en silencio: aparece con "⚠ sin regla" (ver
// tieneRegla()) hasta que alguien la carga con "＋ Cargar regla".
function serviciosVisibles() {
  return (DB.objetivos || []).filter(o => !o.anulado && o.estado === 'Operativo');
}
function ventanaMeses() {
  let desde = mesActualStr();
  for (let i = 0; i < VENTANA_ATRAS; i++) desde = mesAnterior(desde);
  return rangoMeses(desde, VENTANA_ATRAS + 1 + VENTANA_ADELANTE);
}
function reglaTxt(puestos) {
  return (puestos || []).map(p => {
    const ds = diasMarcadosTexto(p.dias) || '—';
    return `${p.cantidad || 1}× ${p.puesto || '—'} · ${p.horarioDesde || '?'}–${p.horarioHasta || '?'} · ${ds}${p.dias?.feriados ? ' +Fer' : ''}`;
  }).join(' · ');
}

export function renderGestionHoras() {
  sincronizarVigenciasHoras();
  const thead = $('hor-thead'), tbody = $('hor-tbody');
  if (!thead || !tbody) return;
  const meses = ventanaMeses();
  const hoy = mesActualStr();
  const q = ($('hor-buscar')?.value || '').toLowerCase();

  let h1 = '<tr><th class="svc" rowspan="2" style="text-align:left;">Servicio / Cliente</th>';
  let h2 = '<tr>';
  meses.forEach(m => {
    const comp = composicionMes(m);
    h1 += `<th colspan="2">${mesLabel(m)}<div style="font-weight:400;font-size:9.5px;color:var(--texto-suave);text-transform:none;letter-spacing:0;">${comp.habiles} háb${comp.feriados ? ' · ' + comp.feriados + ' fer' : ''}</div></th>`;
    h2 += '<th>HS</th><th>Δ</th>';
  });
  thead.innerHTML = h1 + '</tr>' + h2 + '</tr>';

  const todos = serviciosVisibles();
  const sinReglaTotal = todos.filter(o => !tieneRegla(alcanceServicio(o))).length;
  const servicios = todos.filter(o => {
    if (!q) return true;
    const cli = clienteDeObjetivo(o);
    return `${o.codigo} ${o.nombre} ${cli?.nombre || ''}`.toLowerCase().includes(q);
  });
  const totales = {};
  let filas = '';
  servicios.forEach(o => {
    const objCodigo = alcanceServicio(o);
    const cli = clienteDeObjetivo(o);
    const abierto = _expandidos.has(objCodigo);
    const sinRegla = !tieneRegla(objCodigo);
    filas += `<tr><td class="svc" style="cursor:pointer;" onclick="toggleDetalleHoras('${objCodigo}')">`
      + `<span style="margin-right:5px;color:var(--texto-suave);">${abierto ? '▼' : '▶'}</span>`
      + `<b style="color:var(--azul);">${o.codigo}</b>${sinRegla ? ' <span class="badge badge-naranja" style="font-size:9.5px;">⚠ sin regla</span>' : ''}`
      + `<div style="font-size:11px;color:var(--texto-suave);">${cli?.nombre || o.nombre || ''}</div></td>`;
    meses.forEach(m => {
      const v = vigenciaParaMes(objCodigo, m);
      // Sin vigencia para este mes (servicio sin regla, o mes anterior a
      // su primera vigencia): "—" — sin dato, no cero (doc §1 y §"orden
      // sugerido" 1: nada desaparece en silencio, pero tampoco se inventa
      // un cero que no existe).
      if (!v) {
        filas += `<td class="hor-hs" title="Sin regla vigente ese mes" style="text-align:right;color:var(--texto-suave);">—</td>`
          + `<td style="text-align:right;font-size:11px;color:var(--texto-suave);">—</td>`;
        return;
      }
      const hs = horasPuestosMes(v.puestos, m);
      totales[m] = (totales[m] || 0) + hs;
      const hsAnt = horasServicioMes(objCodigo, mesAnterior(m));
      const delta = hs - hsAnt;
      // 'alta'/'backfill'/'manual' son la vigencia INICIAL del servicio
      // (nunca un cambio de contrato) — no se marcan naranja como
      // "vigencia nueva este mes", ni siquiera la carga manual del stock
      // histórico (aunque se cargue "hoy", el servicio ya venía operativo).
      const esVigNueva = !!(v.vigenteDesde === m && !['alta', 'backfill', 'manual'].includes(v.origen));
      const clase = esVigNueva ? ' hor-vg' : (m > hoy ? ' hor-fut' : '');
      const deltaHtml = delta === 0
        ? '<span style="color:#c3c9d6;">=</span>'
        : (delta > 0 ? `<span style="color:var(--verde);font-weight:600;">+${fmt(delta)}</span>` : `<span style="color:var(--rojo);font-weight:600;">${fmt(delta)}</span>`);
      const titulo = reglaTxt(v.puestos) + (esVigNueva ? ' — ✎ vigencia nueva este mes' : '');
      filas += `<td class="hor-hs${clase}" title="${titulo.replace(/"/g, '&quot;')}" style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;">${fmt(hs)}${esVigNueva ? ' ✎' : ''}</td>`
        + `<td style="text-align:right;font-size:11px;">${deltaHtml}</td>`;
    });
    filas += '</tr>';
    if (abierto) filas += filaDetalleHoras(o, objCodigo, meses.length);
  });

  let filaTotal = `<tr class="hor-tot"><td class="svc">TOTAL (${servicios.length} servicios)</td>`;
  meses.forEach(m => {
    const t = totales[m] || 0;
    const tAnt = servicios.reduce((acc, o) => acc + horasServicioMes(alcanceServicio(o), mesAnterior(m)), 0);
    const d = t - tAnt;
    filaTotal += `<td style="text-align:right;">${fmt(t)}</td><td style="text-align:right;font-size:11px;">${d === 0 ? '=' : (d > 0 ? '+' : '') + fmt(d)}</td>`;
  });
  filaTotal += '</tr>';

  tbody.innerHTML = filas + filaTotal;
  const resumen = $('hor-resumen');
  if (resumen) {
    resumen.innerHTML = `${servicios.length} servicios · ${meses.length} meses a la vista`
      + (sinReglaTotal ? ` · <span class="badge badge-naranja" style="font-size:11px;">⚠ ${sinReglaTotal} servicios sin regla</span>` : '');
  }
}

function filaDetalleHoras(o, objCodigo, totalMeses) {
  const ult = ultimaVigencia(objCodigo);
  const puestosHtml = ult
    ? (ult.puestos || []).map(p => `<span class="chip" style="margin:0 6px 6px 0;display:inline-block;">`
      + `<b>${p.cantidad || 1}× ${p.puesto || '—'}</b> `
      + `<span class="badge badge-azul" style="font-size:10px;">${p.horarioDesde || '?'}–${p.horarioHasta || '?'}</span> `
      + `<span class="badge badge-gris" style="font-size:10px;">${diasMarcadosTexto(p.dias) || '—'}</span>`
      + `${p.dias?.feriados ? ' <span class="badge badge-acento" style="font-size:10px;">+Fer</span>' : ''}`
      + `</span>`).join('')
    : '<p class="text-muted" style="font-size:12px;">⚠ Este servicio operativo todavía no tiene ninguna regla de horas cargada.</p>';
  const historial = vigenciasDe(objCodigo).slice().sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || '')).map((v, i) => `
    <div style="border-left:3px solid ${i === 0 ? 'var(--verde)' : 'var(--borde-fuerte)'};padding:5px 12px;margin-bottom:6px;font-size:12px;${i === 0 ? 'background:var(--verde-claro);' : ''}">
      <b>Desde ${v.vigenteDesde}</b> — ${reglaTxt(v.puestos)}
      <div style="color:var(--texto-suave);font-size:11px;">${v.usuario || '—'} · ${v.fecha || ''} · ${v.motivo || ''}</div>
    </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin vigencias todavía.</p>';
  const btnEditar = puedeEditarHoras()
    ? (ult
      ? `<button class="btn btn-primary btn-sm" onclick="abrirVigenciaHoras('${objCodigo}')">✎ Nueva vigencia (modificar horas)</button>`
      : `<button class="btn btn-primary btn-sm" onclick="abrirVigenciaHoras('${objCodigo}')">＋ Cargar regla</button>`)
    : '';
  return `<tr class="hor-det"><td colspan="${1 + totalMeses * 2}">`
    + `<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">`
    + `<div style="flex:1;min-width:280px;"><div class="form-section">Regla vigente (última)</div>${puestosHtml}`
    + `<div style="margin-top:8px;">${btnEditar}</div></div>`
    + `<div style="flex:1;min-width:320px;"><div class="form-section">Historial de vigencias</div>${historial}</div>`
    + `</div></td></tr>`;
}

export function toggleDetalleHoras(objCodigo) {
  if (_expandidos.has(objCodigo)) _expandidos.delete(objCodigo); else _expandidos.add(objCodigo);
  renderGestionHoras();
}

// ========== MODAL "NUEVA VIGENCIA" ==========

let _vigObjCodigo = null;
// GESTION_HORAS_carga_directa_para_Fede.md §2: "＋ Cargar regla" abre el
// MISMO modal, pero creando la vigencia INICIAL de un servicio que
// todavía no tiene ninguna — sin restricción de "solo futuro" (el
// servicio puede llevar meses u años operativo) y con motivo/origen
// distintos para que el historial diga "Carga inicial manual" en vez de
// "Backfill" (ese lo pone el sistema solo; esto lo carga una persona).
let _vigEsCargaInicial = false;
let EDIT_PUESTOS = [];
// Bindeado a window: los onchange/oninput inline del editor de puestos
// (EDIT_PUESTOS[i].cantidad=..., mismo patrón que puestosObjTemp en
// legacy.js) corren en scope global.
window.EDIT_PUESTOS = EDIT_PUESTOS;

function ensureModalVigenciaHoras() {
  if ($('modal-vigencia-horas')) return;
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.id = 'modal-vigencia-horas';
  div.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-header"><h3 id="hor-vig-titulo">Nueva vigencia</h3><button class="btn-close" onclick="cerrarModal('modal-vigencia-horas')">×</button></div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Desde el período *</label><select id="hor-vig-desde" onchange="previewVigenciaHoras()"></select>
            <span class="form-hint" id="hor-vig-hint">Solo períodos futuros/vigentes — los ya liquidados quedan congelados.</span>
          </div>
          <div class="form-group"><label>Cargado por *</label><input type="text" id="hor-vig-quien" placeholder="Nombre"></div>
        </div>
        <div class="form-section">Puestos</div>
        <div id="hor-vig-puestos"></div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="agregarPuestoHoras()">+ Agregar puesto</button>
        <div class="alerta alerta-ok" id="hor-vig-preview" style="margin-top:12px;font-size:13px;">—</div>
        <div class="form-group" style="margin-top:10px;"><label>Motivo (obligatorio — queda en el historial)</label><input type="text" id="hor-vig-motivo" placeholder="Ej.: reducción de horas pedida por el cliente desde octubre"></div>
      </div>
      <div class="modal-footer">
        <span id="hor-vig-warn" style="margin-right:auto;font-size:12px;color:#b25b00;"></span>
        <button class="btn btn-secondary" onclick="cerrarModal('modal-vigencia-horas')">Cancelar</button>
        <button class="btn btn-primary" id="hor-vig-btn-guardar" onclick="guardarVigenciaHoras()">Guardar nueva vigencia</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

export function abrirVigenciaHoras(objCodigo) {
  if (!puedeEditarHoras()) { toast('⛔ Solo Operaciones y Comercial cargan vigencias de horas'); return; }
  _vigObjCodigo = objCodigo;
  const ult = ultimaVigencia(objCodigo);
  _vigEsCargaInicial = !ult;
  EDIT_PUESTOS.length = 0;
  EDIT_PUESTOS.push(...(ult?.puestos || []).map(p => ({ ...p, dias: { ...(p.dias || {}) } })));
  ensureModalVigenciaHoras();
  const o = (DB.objetivos || []).find(x => alcanceServicio(x) === objCodigo);
  $('hor-vig-titulo').textContent = _vigEsCargaInicial
    ? `＋ Cargar regla — ${o?.codigo || objCodigo}`
    : `✎ Nueva vigencia — ${o?.codigo || objCodigo}`;
  if ($('hor-vig-hint')) {
    $('hor-vig-hint').textContent = _vigEsCargaInicial
      ? 'Carga inicial: puede ser cualquier período no liquidado, pasado o futuro.'
      : 'Solo períodos futuros/vigentes — los ya liquidados quedan congelados.';
  }
  if ($('hor-vig-btn-guardar')) $('hor-vig-btn-guardar').textContent = _vigEsCargaInicial ? 'Guardar regla inicial' : 'Guardar nueva vigencia';
  poblarSelectPeriodoHoras();
  $('hor-vig-motivo').value = _vigEsCargaInicial ? 'Carga inicial manual' : '';
  $('hor-vig-quien').value = currentUser?.nombre || '';
  renderEditPuestosHoras();
  abrirModal('modal-vigencia-horas');
}

function poblarSelectPeriodoHoras() {
  const sel = $('hor-vig-desde'); if (!sel) return;
  const opciones = [];
  if (_vigEsCargaInicial) {
    // Sin "solo futuro": el servicio puede llevar tiempo operativo — se
    // ofrece un año hacia atrás y unos meses hacia adelante, arrancando
    // seleccionado en el mes actual (lo más simple para cargar "ahora").
    let m = mesActualStr();
    for (let i = 0; i < 12; i++) m = mesAnterior(m);
    for (let i = 0; i < 12 + 1 + VENTANA_ADELANTE; i++) {
      if (!periodoCongelado(m)) opciones.push(m);
      m = mesSiguiente(m);
    }
  } else {
    let m = mesSiguiente(mesActualStr()); // "solo futuro" (doc §4) — el mes en curso ya está en marcha
    for (let i = 0; i < 6 && opciones.length < 6; i++) {
      if (!periodoCongelado(m)) opciones.push(m);
      m = mesSiguiente(m);
    }
  }
  sel.innerHTML = opciones.map(mm => `<option value="${mm}"${_vigEsCargaInicial && mm === mesActualStr() ? ' selected' : ''}>${mesLabel(mm).toUpperCase()}</option>`).join('');
}

export function agregarPuestoHoras() {
  EDIT_PUESTOS.push({ puesto: '', cantidad: 1, horarioDesde: '', horarioHasta: '', tipoHorario: 'fijo', dias: {}, obs: '' });
  renderEditPuestosHoras();
}
export function quitarPuestoHoras(i) {
  EDIT_PUESTOS.splice(i, 1);
  renderEditPuestosHoras();
}
function renderEditPuestosHoras() {
  const cont = $('hor-vig-puestos'); if (!cont) return;
  const puestosCatalogo = [...new Set([...(DB.categorias || []), 'Runner', 'Franquero'])];
  cont.innerHTML = EDIT_PUESTOS.map((p, i) => `
    <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 12px;margin-bottom:8px;">
      <div style="display:grid;grid-template-columns:1.3fr 70px 95px 95px auto;gap:8px;align-items:end;">
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Puesto</label>
          <select style="padding:6px 8px;font-size:12px;" onchange="EDIT_PUESTOS[${i}].puesto=this.value;previewVigenciaHoras()">
            <option value="">— Elegir —</option>
            ${puestosCatalogo.map(c => `<option${c === p.puesto ? ' selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Cant.</label><input type="number" min="1" value="${p.cantidad || 1}" style="padding:6px 8px;font-size:12px;" oninput="EDIT_PUESTOS[${i}].cantidad=parseInt(this.value,10)||1;previewVigenciaHoras()"></div>
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Desde</label><input type="time" value="${p.horarioDesde || ''}" style="padding:6px 8px;font-size:12px;" onchange="EDIT_PUESTOS[${i}].horarioDesde=this.value;previewVigenciaHoras()"></div>
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Hasta</label><input type="time" value="${p.horarioHasta || ''}" style="padding:6px 8px;font-size:12px;" onchange="EDIT_PUESTOS[${i}].horarioHasta=this.value;previewVigenciaHoras()"></div>
        <button type="button" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;" onclick="quitarPuestoHoras(${i})">✕</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
        ${checklistDiasHtml(p.dias || {}, (d) => `EDIT_PUESTOS[${i}].dias.${d}=this.checked;previewVigenciaHoras()`)}
      </div>
    </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin puestos — agregá al menos uno.</p>';
  previewVigenciaHoras();
}

// Vista previa en vivo (doc §4): "pactado de octubre pasa de 504 a 336
// hs, −168" — calculado con el calendario real, ANTES de guardar nada.
export function previewVigenciaHoras() {
  const desde = $('hor-vig-desde')?.value;
  const prev = $('hor-vig-preview');
  if (!prev || !desde || !_vigObjCodigo) return;
  const actual = horasServicioMes(_vigObjCodigo, desde);
  const nuevo = horasPuestosMes(EDIT_PUESTOS, desde);
  const d = nuevo - actual;
  prev.innerHTML = `<b>${mesLabel(desde)}:</b> pactado pasa de <b>${fmt(actual)} hs</b> a <b>${fmt(nuevo)} hs</b> (${d >= 0 ? '+' : ''}${fmt(d)} hs) — calculado con el calendario real, feriados incluidos. Aplica de ese mes en adelante.`;
  const cantAntes = (ultimaVigencia(_vigObjCodigo)?.puestos || []).reduce((a, p) => a + (parseInt(p.cantidad, 10) || 0), 0);
  const cantAhora = EDIT_PUESTOS.reduce((a, p) => a + (parseInt(p.cantidad, 10) || 0), 0);
  const warn = $('hor-vig-warn');
  if (warn) warn.textContent = cantAhora > cantAntes
    ? '⚠ Suma puestos — puede necesitar sumar gente (revisar en Pedidos de personal).'
    : (cantAhora < cantAntes ? '⚠ Reduce dotación — revisar reasignaciones del personal que sobra.' : '');
}

export async function guardarVigenciaHoras() {
  const motivo = ($('hor-vig-motivo')?.value || '').trim();
  if (!motivo) { toast('El motivo es obligatorio — queda en el historial de vigencias.'); return; }
  if (!EDIT_PUESTOS.length || EDIT_PUESTOS.some(p => !p.puesto)) { toast('⚠️ Elegí el puesto en todas las líneas.'); return; }
  const desde = $('hor-vig-desde')?.value;
  if (!desde) { toast('⚠️ Elegí desde qué período.'); return; }
  const usuario = ($('hor-vig-quien')?.value || '').trim() || currentUser?.nombre || '';
  const cargaInicial = _vigEsCargaInicial;
  await abrirNuevaVigenciaHoras(_vigObjCodigo, EDIT_PUESTOS, desde, usuario, motivo, cargaInicial ? 'manual' : 'operaciones');
  cerrarModal('modal-vigencia-horas');
  _expandidos.add(_vigObjCodigo);
  renderGestionHoras();
  toast(cargaInicial
    ? `✓ Regla inicial cargada desde ${mesLabel(desde)} — la fila ya tiene números.`
    : `✓ Nueva vigencia guardada desde ${mesLabel(desde)} — la fila se recalculó de ese mes en adelante.`);
}

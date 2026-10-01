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
  horasPuestosMes, horasVigenciaMes, composicionMes, mesActualStr, mesAnterior, mesSiguiente,
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

// BUG CRÍTICO encontrado y corregido (30/09/2026): las vigencias se creaban
// con la propiedad `objCodigo`, pero `_toSnake()` (src/shared/supabase.js)
// ya tiene esa MISMA clave mapeada a `objetivo_codigo` para otra tabla
// (Liquidación de horas v1.1, v040, grillas_liq) — el diccionario es
// GLOBAL, no por tabla. Como la columna real de `horas_vigencias` es
// `obj_codigo` (no `objetivo_codigo`), CADA `supaSync('horasVigencias', ...)`
// fallaba en silencio (fire-and-forget, nadie chequeaba el resultado):
// confirmado con una consulta directa a producción — 0 filas en
// `horas_vigencias` a pesar de que `sincronizarVigenciasHoras()` corre en
// cada render y debería haber sembrado ~100+. La vigencia "vivía" solo en
// memoria (por eso la matriz/ficha se veían bien en la sesión) y se perdía
// entera al recargar. Se renombra a `horasObjCodigo` (mismo criterio ya
// usado para `monoTablas`→`monoTablasOrg` cuando chocó con otra clave) y se
// mapea `horasObjCodigo: 'obj_codigo'` en supabase.js — sin tocar la
// columna real ni la clave `objCodigo` que ya usa Liquidación de horas.
function vigenciasDe(objCodigo) {
  return (DB.horasVigencias || []).filter(v => v.horasObjCodigo === objCodigo && v.anulado !== true);
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
  return v ? horasVigenciaMes(v, mes) : 0;
}

// El alta de un servicio trae DOS fuentes de "cuántas horas" y la v2 las
// usa según el modelo de precio (ticket v2 §1/§2):
//  - Modelo de precio 'Por EFT' o 'Abono mensual fijo' + Cantidad de horas →
//    contrato de BANCO MENSUAL: un número plano que no tiene sentido
//    desglosado en puestos/horario/días (y que la fórmula por calendario
//    haría bailar mes a mes). Va como tipoRegla 'fija'.
//  - Sin modelo de precio, o 'Por horas variables' → la carga real es
//    "Personal necesario" (o.puestos): va como 'calendario'.
// Devuelve null si el alta no tiene NINGUNA de las dos (no hay nada que leer).
function reglaDesdeAlta(objetivo) {
  const esBancoFijo = ['Por EFT', 'Abono mensual fijo'].includes(objetivo?.modeloPrecio);
  const efts = Number(objetivo?.efts) || 0;
  if (esBancoFijo && efts > 0) {
    return { tipoRegla: 'fija', horasFijasMes: efts, puestos: [] };
  }
  if (objetivo?.puestos?.length) {
    return { tipoRegla: 'calendario', horasFijasMes: null, puestos: JSON.parse(JSON.stringify(objetivo.puestos)) };
  }
  return null;
}

// Abre una nueva vigencia desde `desde`: cierra la abierta (vigenteHasta
// = mes anterior) y crea la nueva. Nunca pisa lo anterior — el historial
// completo queda en DB.horasVigencias.
export async function abrirNuevaVigenciaHoras(objCodigo, puestos, desde, usuario, motivo, origen, tipoRegla = 'calendario', horasFijasMes = null) {
  const abierta = vigenciasDe(objCodigo).find(v => !v.vigenteHasta);
  if (abierta) {
    abierta.vigenteHasta = mesAnterior(desde);
    abierta.updatedAt = new Date().toISOString();
    await supaSync('horasVigencias', abierta);
  }
  const nueva = {
    id: Date.now(), horasObjCodigo: objCodigo, puestos: JSON.parse(JSON.stringify(puestos || [])),
    tipoRegla: tipoRegla === 'fija' ? 'fija' : 'calendario',
    horasFijasMes: tipoRegla === 'fija' ? (Number(horasFijasMes) || 0) : null,
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
// guarda un servicio nuevo. v2: se sembró de "Personal necesario" O del
// "Modelo de precio + Cantidad de horas" (banco mensual fijo), según lo
// que traiga el alta.
export function sembrarVigenciaHorasDesdeAlta(objetivo) {
  const objCodigo = alcanceServicio(objetivo);
  if (vigenciasDe(objCodigo).length) return null; // ya tiene vigencia, no duplicar
  const regla = reglaDesdeAlta(objetivo);
  if (!regla) return null;
  const desde = mesDeFechaArg(objetivo.fechaInicio) || mesActualStr();
  const nueva = {
    id: Date.now(), horasObjCodigo: objCodigo, puestos: regla.puestos,
    tipoRegla: regla.tipoRegla, horasFijasMes: regla.horasFijasMes,
    vigenteDesde: desde, vigenteHasta: null,
    usuario: objetivo.cargadoPor || '', fecha: hoyStrArg(),
    motivo: regla.tipoRegla === 'fija'
      ? 'Alta del servicio — banco mensual (modelo de precio + cantidad de horas)'
      : 'Alta del servicio — bloque Personal necesario',
    origen: 'alta',
  };
  if (!DB.horasVigencias) DB.horasVigencias = [];
  DB.horasVigencias.push(nueva);
  supaSync('horasVigencias', nueva);
  return nueva;
}

// Backfill masivo (mismo patrón que sincronizarPrepedidos en prepedidos.js):
// todo servicio vigente sin ninguna vigencia todavía la recibe, sembrada
// desde su alta — antes solo desde "Personal necesario", por eso los
// servicios de banco mensual (modelo Por EFT / Abono mensual fijo, que
// normalmente no cargan Personal necesario) quedaban sin regla. Se llama en
// cada render(): idempotente, silenciosa, sin costo para lo que ya tiene.
export function sincronizarVigenciasHoras() {
  let n = 0;
  (DB.objetivos || []).forEach(o => {
    if (o.anulado || o.estado === 'Baja') return;
    const regla = reglaDesdeAlta(o);
    if (!regla) return;
    const objCodigo = alcanceServicio(o);
    if (vigenciasDe(objCodigo).length) return;
    const nueva = {
      id: Date.now() + n, horasObjCodigo: objCodigo, puestos: regla.puestos,
      tipoRegla: regla.tipoRegla, horasFijasMes: regla.horasFijasMes,
      vigenteDesde: mesActualStr(), vigenteHasta: null,
      usuario: 'Sistema', fecha: hoyStrArg(),
      motivo: regla.tipoRegla === 'fija'
        ? 'Backfill — banco mensual sembrado desde Modelo de precio + Cantidad de horas del alta'
        : 'Backfill — vigencia inicial sembrada desde Personal necesario actual',
      origen: 'backfill',
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
// v2: una vigencia 'fija' no se describe con puestos (no los tiene) sino
// con su número de banco mensual. Todo lo que muestra o explica una
// vigencia (título de celda, detalle, historial) pasa por acá.
function vigenciaTxt(v) {
  if (!v) return '—';
  if (v.tipoRegla === 'fija') return `FT fija — ${fmt(v.horasFijasMes || 0)} hs/mes (banco mensual, no varía con el calendario)`;
  return reglaTxt(v.puestos) || 'Sin puestos cargados';
}

export function renderGestionHoras() {
  sincronizarVigenciasHoras();
  const thead = $('hor-thead'), tbody = $('hor-tbody');
  if (!thead || !tbody) return;
  const meses = ventanaMeses();
  const hoy = mesActualStr();
  const q = ($('hor-buscar')?.value || '').toLowerCase();

  // FIX (ticket "sticky header + alineación", 01/10/2026): el thead tiene 2
  // filas (meses arriba, HS/Δ abajo) — la regla genérica .tabla-wrap thead
  // th les daba top:0 a las DOS por igual, así que al scrollear la fila de
  // HS/Δ quedaba pintada ENCIMA de la de meses en la misma posición (no es
  // que el sticky fallara, es que una tapaba a la otra). Clases
  // hor-thead-r1/r2 para que el CSS scopeado (#screen-gestion_horas) les dé
  // un `top` distinto y las apile en vez de superponerlas — mismo patrón
  // que ya usa Gestión de precios (.mes-grp/.sub en main.css).
  let h1 = '<tr class="hor-thead-r1"><th class="svc" rowspan="2" style="text-align:left;">Servicio / Cliente</th>';
  let h2 = '<tr class="hor-thead-r2">';
  meses.forEach(m => {
    const comp = composicionMes(m);
    h1 += `<th colspan="2">${mesLabel(m)}<div style="font-weight:400;font-size:9.5px;color:var(--texto-suave);text-transform:none;letter-spacing:0;">${comp.habiles} háb${comp.feriados ? ' · ' + comp.feriados + ' fer' : ''}</div></th>`;
    // text-align:right a propósito: coincide con el align de las celdas de
    // datos (gestion_horas.js, hs/Δ más abajo) — antes el header heredaba
    // text-align:left de la regla genérica "thead th" y quedaba pegado a la
    // izquierda mientras los valores quedaban a la derecha.
    h2 += '<th style="text-align:right;">HS</th><th style="text-align:right;">Δ</th>';
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
      const hs = horasVigenciaMes(v, m);
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
      const titulo = vigenciaTxt(v) + (esVigNueva ? ' — ✎ vigencia nueva este mes' : '');
      const marcaFija = v.tipoRegla === 'fija' ? ' <span class="badge badge-azul" style="font-size:9px;">FT</span>' : '';
      filas += `<td class="hor-hs${clase}" title="${titulo.replace(/"/g, '&quot;')}" style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;">${fmt(hs)}${esVigNueva ? ' ✎' : ''}${marcaFija}</td>`
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
  // v2: si la última vigencia es FT fija no hay puestos que listar — se
  // muestra el número del banco mensual con su chip, que es la regla real.
  const esFijaUlt = ult?.tipoRegla === 'fija';
  const puestosHtml = esFijaUlt
    ? `<div style="background:var(--azul-claro);border:1px solid var(--azul);border-radius:var(--radio);padding:10px 12px;`
      + `font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">`
      + `<span><span class="badge badge-azul" style="font-size:10px;">FT FIJA</span> Banco de horas mensual — `
      + `no varía con feriados ni con los días hábiles del mes.</span>`
      + `<b style="font-size:17px;font-variant-numeric:tabular-nums;">${fmt(ult.horasFijasMes || 0)} hs/mes</b></div>`
    : (ult
      ? (ult.puestos || []).map(p => `<span class="chip" style="margin:0 6px 6px 0;display:inline-block;">`
        + `<b>${p.cantidad || 1}× ${p.puesto || '—'}</b> `
        + `<span class="badge badge-azul" style="font-size:10px;">${p.horarioDesde || '?'}–${p.horarioHasta || '?'}</span> `
        + `<span class="badge badge-gris" style="font-size:10px;">${diasMarcadosTexto(p.dias) || '—'}</span>`
        + `${p.dias?.feriados ? ' <span class="badge badge-acento" style="font-size:10px;">+Fer</span>' : ''}`
        + `</span>`).join('')
      : '<p class="text-muted" style="font-size:12px;">⚠ Este servicio operativo todavía no tiene ninguna regla de horas cargada.</p>');
  const historial = vigenciasDe(objCodigo).slice().sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || '')).map((v, i) => `
    <div style="border-left:3px solid ${i === 0 ? 'var(--verde)' : 'var(--borde-fuerte)'};padding:5px 12px;margin-bottom:6px;font-size:12px;${i === 0 ? 'background:var(--verde-claro);' : ''}">
      <b>Desde ${v.vigenteDesde}</b>${v.tipoRegla === 'fija' ? ' <span class="badge badge-azul" style="font-size:9px;">FT FIJA</span>' : ''} — ${vigenciaTxt(v)}
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

// Igual que toggleDetalleHoras pero ASEGURA el estado expandido (no lo
// invierte). Lo usa el chip "= Gestión de horas ↗" de la ficha del
// servicio: con un toggle, si la fila ya estaba abierta al volver, el chip
// la cerraba en vez de mostrarla.
export function expandirServicioHoras(objCodigo) {
  _expandidos.add(objCodigo);
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
// v2: estado del editor de la nueva vigencia. EDIT_TIPO decide si el mes se
// calcula por puestos×calendario ('calendario') o es un banco mensual plano
// ('fija', con EDIT_HORAS_FIJAS). Ambos van a window porque los handlers
// inline del modal (onchange/oninput) corren en scope global.
let EDIT_TIPO = 'calendario';
// Solo guarda el valor con el que se ABRIÓ el modal (para pre-llenar el
// input al editar una vigencia existente). No se lee del window en los
// handlers: EDIT_HORAS_FIJAS es un primitivo y quedaría desactualizado
// frente al input — el valor vivo se lee siempre de $('hor-vig-fijas').
let EDIT_HORAS_FIJAS = null;
window.EDIT_PUESTOS = EDIT_PUESTOS;
window.EDIT_TIPO = EDIT_TIPO;

// Mostrar/ocultar la sección de Puestos según el tipo elegido, y dejar el
// hint explicando la diferencia (los dos son reglas válidas, no es que una
// sea "menos correcta" — el banco mensual es lo que dice el contrato).
export function onChangeTipoReglaHoras() {
  EDIT_TIPO = $('hor-vig-tipo')?.value === 'fija' ? 'fija' : 'calendario';
  window.EDIT_TIPO = EDIT_TIPO;
  const esFija = EDIT_TIPO === 'fija';
  if ($('hor-vig-fija-row')) $('hor-vig-fija-row').style.display = esFija ? '' : 'none';
  if ($('hor-vig-seccion-puestos')) $('hor-vig-seccion-puestos').style.display = esFija ? 'none' : '';
  const hint = $('hor-vig-tipo-hint');
  if (hint) {
    hint.textContent = esFija
      ? 'Para contratos con banco de horas fijo por mes. Las horas no se calculan: se cargan.'
      : 'Para contratos con turnos y días definidos. Las horas salen de la regla contra el calendario real.';
  }
  previewVigenciaHoras();
}

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
        <div class="form-section">Tipo de regla *</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Cómo se calcula el mes</label>
            <select id="hor-vig-tipo" onchange="onChangeTipoReglaHoras()">
              <option value="calendario">Por puestos y calendario (puestos × horario × días × feriados)</option>
              <option value="fija">FT fija — banco de horas mensual (un número fijo, no varía)</option>
            </select>
            <span class="form-hint" id="hor-vig-tipo-hint"></span>
          </div>
          <div class="form-group" id="hor-vig-fija-row" style="display:none;"><label>Horas fijas del mes *</label>
            <input type="number" id="hor-vig-fijas" min="0" step="0.01" placeholder="Ej.: 1118" oninput="previewVigenciaHoras()">
            <span class="form-hint">El mismo número todos los meses, llueva o haya feriados.</span>
          </div>
        </div>
        <div id="hor-vig-seccion-puestos">
          <div class="form-section">Puestos</div>
          <div id="hor-vig-puestos"></div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="agregarPuestoHoras()">+ Agregar puesto</button>
        </div>
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
  // Precarga el tipo desde la vigencia vigente: si el servicio ya tiene un
  // banco mensual fijo, al abrir para modificarlo arranca en 'fija' con su
  // número (si arrancara en 'calendario' con la lista de puestos vacía, se
  // vería como si le hubieran borrado la regla).
  EDIT_TIPO = ult?.tipoRegla === 'fija' ? 'fija' : 'calendario';
  window.EDIT_TIPO = EDIT_TIPO;
  EDIT_HORAS_FIJAS = ult?.tipoRegla === 'fija' ? (ult.horasFijasMes || 0) : null;
  if ($('hor-vig-tipo')) $('hor-vig-tipo').value = EDIT_TIPO;
  if ($('hor-vig-fijas')) $('hor-vig-fijas').value = EDIT_HORAS_FIJAS ?? '';
  onChangeTipoReglaHoras();
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
  // Se calcula el "nuevo" con la misma función pura que usa la matriz, así
  // el preview no puede mentir: misma fórmula, mismo número.
  const esFija = EDIT_TIPO === 'fija';
  const fijas = Number($('hor-vig-fijas')?.value) || 0;
  const nuevo = esFija ? fijas : horasPuestosMes(EDIT_PUESTOS, desde);
  const d = nuevo - actual;
  prev.innerHTML = `<b>${mesLabel(desde)}:</b> pactado pasa de <b>${fmt(actual)} hs</b> a <b>${fmt(nuevo)} hs</b> (${d >= 0 ? '+' : ''}${fmt(d)} hs) — `
    + (esFija
      ? 'banco mensual fijo, no se recalcula con el calendario. Aplica de ese mes en adelante.'
      : 'calculado con el calendario real, feriados incluidos. Aplica de ese mes en adelante.');
  // El aviso de dotación solo tiene sentido con una regla por puestos: en
  // FT fija no hay desglose de gente, así que se apaga en vez de mentir.
  const warn = $('hor-vig-warn');
  if (!warn) return;
  if (esFija) { warn.textContent = ''; return; }
  const cantAntes = (ultimaVigencia(_vigObjCodigo)?.puestos || []).reduce((a, p) => a + (parseInt(p.cantidad, 10) || 0), 0);
  const cantAhora = EDIT_PUESTOS.reduce((a, p) => a + (parseInt(p.cantidad, 10) || 0), 0);
  warn.textContent = cantAhora > cantAntes
    ? '⚠ Suma puestos — puede necesitar sumar gente (revisar en Pedidos de personal).'
    : (cantAhora < cantAntes ? '⚠ Reduce dotación — revisar reasignaciones del personal que sobra.' : '');
}

export async function guardarVigenciaHoras() {
  const motivo = ($('hor-vig-motivo')?.value || '').trim();
  if (!motivo) { toast('El motivo es obligatorio — queda en el historial de vigencias.'); return; }
  const esFija = EDIT_TIPO === 'fija';
  // v2 §3: con FT fija NO hace falta ningún puesto (no hay desglose por
  // calcular) — solo el número del banco mensual. Con tipo calendario sigue
  // haciendo falta al menos una línea con horario/días, pero la CATEGORÍA
  // del puesto deja de ser obligatoria por fila: el cálculo depende de
  // cantidad/horario/días, no del texto de la categoría.
  if (esFija) {
    if (!(Number($('hor-vig-fijas')?.value) > 0)) { toast('⚠️ Cargá las horas fijas del mes (tiene que ser un número mayor a 0).'); return; }
  } else {
    if (!EDIT_PUESTOS.length) { toast('⚠️ Agregá al menos un puesto, o cambiá el tipo de regla a FT fija.'); return; }
    if (EDIT_PUESTOS.some(p => !p.horarioDesde || !p.horarioHasta)) { toast('⚠️ Completá el horario (desde/hasta) en todas las líneas.'); return; }
  }
  const desde = $('hor-vig-desde')?.value;
  if (!desde) { toast('⚠️ Elegí desde qué período.'); return; }
  const usuario = ($('hor-vig-quien')?.value || '').trim() || currentUser?.nombre || '';
  const cargaInicial = _vigEsCargaInicial;
  await abrirNuevaVigenciaHoras(
    _vigObjCodigo, esFija ? [] : EDIT_PUESTOS, desde, usuario, motivo,
    cargaInicial ? 'manual' : 'operaciones', EDIT_TIPO, Number($('hor-vig-fijas')?.value) || 0,
  );
  cerrarModal('modal-vigencia-horas');
  _expandidos.add(_vigObjCodigo);
  renderGestionHoras();
  toast(cargaInicial
    ? `✓ Regla inicial cargada desde ${mesLabel(desde)} — la fila ya tiene números.`
    : `✓ Nueva vigencia guardada desde ${mesLabel(desde)} — la fila se recalculó de ese mes en adelante.`);
}

// Cálculo de saldo de días de vacaciones — todo al vuelo, sin guardar nada
// (DISENO_vacaciones.md §11.4): saldo = asignados - Σ aprobadas del año -
// Σ en proceso del año (para el soft warning al elevar).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { SECTORES_ADMIN } from '@modules/legajos/index.js';
import { crearNotificacion } from '@shared/notificaciones.js';

const ESTADOS_EN_PROCESO = ['Pendiente aprobación Gerente', 'Pendiente aprobación Consejo'];

function vacacionesDelLegajo(legajoIdLocal) {
  return (DB.vacaciones || []).filter(v => !v.anulado && String(v.legajoIdLocal) === String(legajoIdLocal));
}

// 'Anulación rechazada por Consejo' funcionalmente sigue vigente (el
// Consejo mantuvo la vacación aprobada) — cuenta igual que 'Aprobada'
// para no liberar días que en la práctica siguen tomados.
export const ESTADOS_VIGENTES = ['Aprobada', 'Anulación rechazada por Consejo'];

export function diasTomadosEnAnio(legajoIdLocal, anio) {
  return vacacionesDelLegajo(legajoIdLocal)
    .filter(v => ESTADOS_VIGENTES.includes(v.estado) && new Date(v.fechaDesde).getFullYear() === anio)
    .reduce((s, v) => s + (v.diasSolicitados || 0), 0);
}

export function diasEnProcesoEnAnio(legajoIdLocal, anio) {
  return vacacionesDelLegajo(legajoIdLocal)
    .filter(v => ESTADOS_EN_PROCESO.includes(v.estado) && new Date(v.fechaDesde).getFullYear() === anio)
    .reduce((s, v) => s + (v.diasSolicitados || 0), 0);
}

export function diasDisponibles(legajo, anio) {
  const asignados = calcularDiasAsignadosPorAntiguedad(legajo);
  const tomados = diasTomadosEnAnio(legajo?.nro, anio);
  const enProceso = diasEnProcesoEnAnio(legajo?.nro, anio);
  return asignados - tomados - enProceso;
}

export function calcularAntiguedad(legajo) {
  if (!legajo?.ingreso) return '';
  const p = legajo.ingreso.split('/');
  if (p.length !== 3) return '';
  const años = Math.floor((new Date() - new Date(`${p[2]}-${p[1]}-${p[0]}`)) / (365.25 * 24 * 3600 * 1000));
  return años >= 0 ? `${años} año${años === 1 ? '' : 's'}` : '';
}

// Vacaciones v1.1 — DELTA_vacaciones_v1.1.md Cambio 5. Si el legajo tiene
// un override manual (dias_vacaciones_anuales > 0, cargado por RRHH para
// casos excepcionales) se respeta ese valor. Si no, se calcula por la
// escala oficial de antigüedad al 31/12 del año de referencia. El legajo
// guarda `ingreso` como texto DD/MM/AAAA (no fecha_ingreso ISO como
// asumía el pseudocódigo del delta) — se reusa el mismo parseo que ya
// usa calcularAntiguedad().
export function calcularDiasAsignadosPorAntiguedad(legajo, fechaReferencia = new Date()) {
  if (legajo?.diasVacacionesAnuales > 0) return legajo.diasVacacionesAnuales;
  if (!legajo?.ingreso) return 0;
  const p = legajo.ingreso.split('/');
  if (p.length !== 3) return 0;
  const fechaIngreso = new Date(`${p[2]}-${p[1]}-${p[0]}`);
  const finDeAnio = new Date(fechaReferencia.getFullYear(), 11, 31);
  const añosCompletos = (finDeAnio - fechaIngreso) / (365.25 * 24 * 3600 * 1000);

  if (añosCompletos < 0.5) {
    const diasTrabajados = Math.max(0, (finDeAnio - fechaIngreso) / (24 * 3600 * 1000));
    return Math.floor(diasTrabajados / 20);
  }
  if (añosCompletos <= 5) return 14;
  if (añosCompletos <= 10) return 21;
  if (añosCompletos <= 20) return 28;
  return 35;
}

// Superposición con otro legajo (jefe directo o reemplazante) en un rango
// de fechas — vacaciones Aprobada o en proceso.
export function tieneSuperposicion(legajoIdLocal, fechaDesde, fechaHasta) {
  const desde = new Date(fechaDesde), hasta = new Date(fechaHasta);
  return vacacionesDelLegajo(legajoIdLocal).some(v => {
    if (v.estado !== 'Aprobada' && !ESTADOS_EN_PROCESO.includes(v.estado)) return false;
    const vDesde = new Date(v.fechaDesde), vHasta = new Date(v.fechaHasta);
    return desde <= vHasta && hasta >= vDesde;
  });
}

// Vacaciones v1.1 — Cambio 4. Antes el aviso de superposición al elevar
// solo miraba al jefe directo (ver git blame de recalcularSolicitud en
// vacaciones.js); ahora se muda a la aprobación del Gerente y mira a
// TODO el sector. Se marca con esJefeDirecto los resultados que además
// coinciden con el jefe directo del solicitante, para el realce visual
// que pide el delta — el campo jefeDirectoLegajoIdLocal se sigue usando,
// pero ya no es la fuente principal de detección.
export function buscarSuperposicionesSector(vacacion, legajoSolicitante) {
  const desde = new Date(vacacion.fechaDesde), hasta = new Date(vacacion.fechaHasta);
  const jefeDirecto = legajoSolicitante?.jefeDirectoLegajoIdLocal;
  return (DB.vacaciones || [])
    .filter(v => !v.anulado
      && v.sector === vacacion.sector
      && String(v.legajoIdLocal) !== String(vacacion.legajoIdLocal)
      && (v.estado === 'Aprobada' || v.estado.startsWith('Pendiente'))
      && desde <= new Date(v.fechaHasta) && hasta >= new Date(v.fechaDesde))
    .map(v => ({ ...v, esJefeDirecto: jefeDirecto && String(v.legajoIdLocal) === String(jefeDirecto) }));
}

// ========== TAB 3 — PANORAMA DE SALDOS ==========

function filasSaldos() {
  const anio = new Date().getFullYear();
  return (DB.legajos || [])
    .filter(l => l.estado === 'Activo' && l.servicio?.trim().toUpperCase() === 'ADMINISTRATIVO')
    .map(l => {
      const asignados = calcularDiasAsignadosPorAntiguedad(l);
      const origen = l.diasVacacionesAnuales > 0 ? 'Manual' : 'Automático';
      const tomados = diasTomadosEnAnio(l.nro, anio);
      const enProceso = diasEnProcesoEnAnio(l.nro, anio);
      const disponibles = asignados - tomados;
      const alertas = [];
      const mesActual = new Date().getMonth(); // 0-indexed: 9=oct,10=nov,11=dic
      if (mesActual >= 9 && disponibles > 10) alertas.push('⚠️ Saldo alto sin tomar');
      if (!asignados) alertas.push('⚠️ Sin días asignados');
      if (asignados && disponibles === 0) alertas.push('✅ Ya tomó todos');
      return { legajo: l, anio, asignados, origen, tomados, enProceso, disponibles, alertas };
    });
}

export function poblarSelectSectorSaldos() {
  const el = $('vac-saldo-sector');
  if (el) el.innerHTML = '<option value="">Todos</option>' + SECTORES_ADMIN.map(s => `<option>${s}</option>`).join('');
}

export function filtrarPanoramaSaldos() { renderPanoramaSaldos(); }

export function renderPanoramaSaldos() {
  let filas = filasSaldos();
  const fSector = ($('vac-saldo-sector') || {}).value || '';
  const soloAlertas = ($('vac-saldo-solo-alertas') || {}).checked;
  if (fSector) filas = filas.filter(f => f.legajo.sector === fSector);
  if (soloAlertas) filas = filas.filter(f => f.alertas.length > 0);

  const tbody = $('tbody-vac-saldos');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:32px;opacity:.5;">Sin datos</td></tr>'
    : filas.map(f => `<tr>
        <td>${f.legajo.nombre}<div style="font-size:11px;color:var(--texto-suave);">N° ${f.legajo.nro}</div></td>
        <td><span class="chip">${f.legajo.sector || '—'}</span></td>
        <td>${calcularAntiguedad(f.legajo) || '—'}</td>
        <td>${f.asignados}</td>
        <td style="font-size:11px;color:var(--texto-suave);">${f.origen}</td>
        <td>${f.tomados}</td>
        <td>${f.enProceso}</td>
        <td><strong>${f.disponibles}</strong></td>
        <td>${f.alertas.join(' ') || '—'}</td>
      </tr>`).join('');
}

// Vacaciones v1.1 — Cambio 7 (simplificado: sin selector de período, ver
// Cambio 6 diferido). Notifica a cada administrativo activo su saldo del
// año calendario actual vía la campana del sistema (ya existe, solo se
// llama — mismo patrón que el resto del módulo).
export async function generarComunicacionesSaldo() {
  const anio = new Date().getFullYear();
  const administrativosActivos = (DB.legajos || []).filter(l => l.estado === 'Activo' && l.servicio?.trim().toUpperCase() === 'ADMINISTRATIVO');
  for (const legajo of administrativosActivos) {
    const saldo = diasDisponibles(legajo, anio);
    await crearNotificacion({
      tipo: 'vacacion_saldo_anual',
      entidadTipo: 'vacacion',
      entidadIdLocal: String(legajo.nro),
      destinatarioNombre: legajo.nombre,
      mensaje: `📢 Tu saldo de vacaciones ${anio} es de ${saldo} día(s) disponibles.`,
    });
  }
  return administrativosActivos.length;
}

export async function comunicarSaldos() {
  const cantidad = (DB.legajos || []).filter(l => l.estado === 'Activo' && l.servicio?.trim().toUpperCase() === 'ADMINISTRATIVO').length;
  if (!cantidad) { toast('⚠️ No hay administrativos activos para notificar'); return; }
  if (!confirm(`Se va a notificar el saldo de vacaciones ${new Date().getFullYear()} a ${cantidad} persona(s). ¿Confirmás?`)) return;
  const enviadas = await generarComunicacionesSaldo();
  toast(`✅ Se enviaron ${enviadas} comunicaciones de saldo`);
}

export async function exportarSaldosExcel() {
  const filas = filasSaldos();
  if (!filas.length) { toast('⚠️ No hay datos para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(f => ({
    Asociado: f.legajo.nombre, 'N° Socio': f.legajo.nro, Sector: f.legajo.sector || '',
    Antigüedad: calcularAntiguedad(f.legajo), 'Días asignados': f.asignados,
    'Días tomados': f.tomados, 'Días en proceso': f.enProceso, 'Días disponibles': f.disponibles,
    Alertas: f.alertas.join(' / '),
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Saldos vacaciones');
  XLSX.writeFile(libro, `saldos_vacaciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

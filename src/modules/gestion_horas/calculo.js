// Gestión de horas — cálculo puro (GESTION_HORAS_para_Fede.md §1-2).
// "Lo pactado es una REGLA, no un número": por puesto, cantidad × hs/día
// × días (L a D + Fer) × calendario real del mes. El flag "trabaja
// feriados" NO es un campo nuevo — es dias.feriados, el mismo checkbox
// "Fer." que ya renderiza checklistDiasHtml() en Personal necesario del
// alta (ver DIAS_SEMANA en @shared/horarioDias.js). No hubo que
// reconciliar nada: ya vive en el único lugar correcto (por puesto).
import { esFeriado, getDiasDelMes } from '@shared/helpers.js';

const DIA_KEY_POR_NUM = ['domingos', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabados'];

// Duración del turno en horas a partir de HH:MM–HH:MM. Turno que cruza
// medianoche (ej. 22:00–06:00) se resuelve sumando 24hs — mismo criterio
// que ya usan los cálculos de horas de Liquidación/Resumen de horas.
export function horasEntreHHMM(desde, hasta) {
  if (!desde || !hasta) return 0;
  const [h1, m1] = desde.split(':').map(Number);
  const [h2, m2] = hasta.split(':').map(Number);
  if ([h1, m1, h2, m2].some(n => Number.isNaN(n))) return 0;
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// ¿Este puesto trabaja el día `diaSemana` (0=domingo..6=sábado)? Si ese
// día calendario es feriado, solo cuenta si el puesto tiene el check
// "Fer." (dias.feriados) — un feriado que cae en un día que el puesto NI
// SIQUIERA trabaja habitualmente ya quedó afuera por el primer check, así
// que "Fer." solo importa para feriados que caen en un día regular suyo.
export function trabajaEseDia(puesto, diaSemana, esDiaFeriado) {
  const key = DIA_KEY_POR_NUM[diaSemana];
  if (!puesto?.dias?.[key]) return false;
  if (esDiaFeriado && !puesto.dias?.feriados) return false;
  return true;
}

// Horas de UN puesto en un mes ('YYYY-MM'), calculado contra el
// calendario real (helpers.getDiasDelMes, que ya lee DB.feriados).
export function horasPuestoMes(puesto, mesISO) {
  const horasDia = horasEntreHHMM(puesto?.horarioDesde, puesto?.horarioHasta);
  if (!horasDia) return 0;
  const cantidad = Math.max(0, parseInt(puesto?.cantidad, 10) || 0);
  if (!cantidad) return 0;
  let dias = 0;
  getDiasDelMes(mesISO).forEach(({ iso, esFeriado: fer }) => {
    const dow = new Date(iso + 'T12:00:00').getDay();
    if (trabajaEseDia(puesto, dow, fer)) dias++;
  });
  return dias * horasDia * cantidad;
}

// Horas de TODOS los puestos de una regla/vigencia en un mes.
export function horasPuestosMes(puestos, mesISO) {
  return (puestos || []).reduce((acc, p) => acc + horasPuestoMes(p, mesISO), 0);
}

// Composición del mes para el encabezado ("21 háb · 1 fer"): hábiles =
// lunes a viernes sin feriado; fer = feriados del mes (caigan donde caigan).
export function composicionMes(mesISO) {
  const dias = getDiasDelMes(mesISO);
  const habiles = dias.filter(d => !d.esFinde && !d.esFeriado).length;
  const feriados = dias.filter(d => d.esFeriado).length;
  return { habiles, feriados };
}

export function mesActualStr() {
  return new Date().toISOString().slice(0, 7);
}
export function mesAnterior(mesISO) {
  const [y, m] = mesISO.split('-').map(Number);
  return new Date(y, m - 2, 1).toISOString().slice(0, 7);
}
export function mesSiguiente(mesISO) {
  const [y, m] = mesISO.split('-').map(Number);
  return new Date(y, m, 1).toISOString().slice(0, 7);
}
// Rango de `cantidad` meses consecutivos arrancando en `desde`.
export function rangoMeses(desde, cantidad) {
  const out = [];
  let cur = desde;
  for (let i = 0; i < cantidad; i++) { out.push(cur); cur = mesSiguiente(cur); }
  return out;
}
export function mesLabel(mesISO) {
  const [y, m] = mesISO.split('-');
  return `${m}/${y}`;
}
// 'DD/MM/AAAA' (fechaInicio del objetivo) → 'YYYY-MM'. null si no matchea.
export function mesDeFechaArg(fechaDDMMAAAA) {
  if (!fechaDDMMAAAA) return null;
  const partes = String(fechaDDMMAAAA).split('/');
  if (partes.length !== 3) return null;
  const [, mm, yyyy] = partes;
  if (!yyyy || !mm) return null;
  return `${yyyy}-${mm.padStart(2, '0')}`;
}
export { esFeriado };

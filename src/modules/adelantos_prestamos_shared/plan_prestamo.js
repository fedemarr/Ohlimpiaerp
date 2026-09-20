// Plan de cuotas del préstamo — lógica pura (PRESTAMOS_para_Fede.md
// §4/§5/§7 + mockup_prestamos_2.html). Sin acceso a DB ni a Supabase:
// solo cálculo, así se puede testear y reutilizar desde Liquidaciones
// (legacy.js vía window) y desde la ficha de la cartera.
//
// Modelo de cuota: { numero, periodo 'YYYY-MM', monto,
//   estado: 'Pendiente' | 'Debitada' | 'Postergada',
//   postergadaA?, fechaDebito?, nueva? }
// Invariante que custodia el sistema: suma(cuotas PENDIENTES) = saldo,
// con saldo = montoTotal − suma(cuotas DEBITADAS).

export function mesSiguiente(periodoISO) {
  const [y, m] = periodoISO.split('-').map(Number);
  const d = new Date(y, m, 1); // m ya es "el mes siguiente" en índice 0
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function debitadoDelPlan(plan) {
  return (plan || []).filter(c => c.estado === 'Debitada').reduce((s, c) => s + Number(c.monto), 0);
}

export function saldoDelPrestamo(p) {
  return Number(p.montoTotal) - debitadoDelPlan(p.planCuotas);
}

export function pendientesDelPlan(plan) {
  return (plan || []).filter(c => c.estado === 'Pendiente').reduce((s, c) => s + Number(c.monto), 0);
}

// Diferencia entre lo pendiente y el saldo (0 = balanceado). >0 = por
// encima del saldo, <0 = por debajo.
export function diferenciaDePlan(p, plan) {
  return Math.round(pendientesDelPlan(plan) - saldoDelPrestamo({ ...p, planCuotas: plan }));
}

// Una cuota por mes: la primera PENDIENTE cuyo período ya llegó. Si el
// retiro de un mes no se pagó, esa cuota queda pendiente y vuelve a ser
// "la primera" el mes siguiente — se posterga sola sin acumular dos en
// el mismo retiro (§5 "se posterga sola al período siguiente").
export function cuotaVigenteParaPeriodo(p, mes) {
  if (!p || p.anulado || p.estado !== 'Aprobada' || !Array.isArray(p.planCuotas)) return null;
  return p.planCuotas.find(c => c.estado === 'Pendiente' && c.periodo <= mes) || null;
}

// Posterga la cuota `idx` (debe estar Pendiente): queda "Postergada → nuevo
// período" y se agrega una fila Pendiente al final del plan, con el mismo
// monto. El total no cambia (postergar no genera interés extra — supuesto
// confirmado).
export function postergarCuota(plan, idx) {
  const c = plan[idx];
  if (!c || c.estado !== 'Pendiente') return plan;
  let ultimo = '0000-00';
  plan.forEach(x => {
    const per = x.estado === 'Postergada' ? x.postergadaA : x.periodo;
    if (per > ultimo) ultimo = per;
  });
  const nuevoPer = mesSiguiente(ultimo);
  plan.push({ numero: plan.length + 1, periodo: nuevoPer, monto: c.monto, estado: 'Pendiente', nueva: true });
  c.estado = 'Postergada';
  c.postergadaA = nuevoPer;
  return plan;
}

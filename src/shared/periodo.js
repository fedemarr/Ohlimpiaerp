// Estado de un período (mes) respecto de HOY — PERIODO_FUTURO_bug_para_Fede.md.
// Son TRES estados, no dos: antes el chip solo distinguía "congelado" de
// "vigente", así que un mes que todavía no empezó (ej. octubre estando en
// septiembre) decía "PERÍODO VIGENTE". Es el mismo componente para todos los
// módulos con selector de mes (Tareas Especiales, Retenes, ...).
//
// mes: 'YYYY-MM'. congelado: el cierre general de Liquidaciones (Finanzas) —
// un período congelado es "anterior" aunque sea el mes en curso (foto final).

// Mes actual en hora LOCAL (toISOString() da UTC: después de las 21:00 en
// Argentina ya devolvía el mes siguiente a fin de mes).
export function mesActualLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function estadoPeriodo(mes, congelado = false) {
  const actual = mesActualLocal();
  if (mes > actual) return 'futuro';
  if (mes < actual || congelado) return 'anterior';
  return 'vigente';
}

export function chipPeriodoHtml(estado) {
  if (estado === 'futuro') return '<span class="badge badge-azul">📅 PERÍODO FUTURO — sin carga aún, solo lo proyectado</span>';
  if (estado === 'anterior') return '<span class="badge badge-gris">🔒 PERÍODO ANTERIOR — congelado, solo lectura</span>';
  return '<span class="badge badge-verde">● PERÍODO VIGENTE — carga en curso, se actualiza en vivo</span>';
}

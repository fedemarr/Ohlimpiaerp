// Cálculo del mes en que corresponde tramitar el alta de obra social.
//
// Regla de negocio (confirmada, ya en producción — no es una suposición
// nueva de este ticket): hay un desfasaje de 3 meses entre el ingreso del
// asociado y el mes en que se puede tramitar el alta de obra social. Ej.:
// ingresa en agosto → puede dar el alta en noviembre. Esta misma regla ya
// se usaba en recalcularInicioObraSocial() (altas.js, ticket de pólizas)
// para completar el campo "Inicio de trámite" del alta — se centraliza acá
// para no repetir el número mágico "3" en dos lugares y para que el
// listado de Legajos pueda mostrar el mes también en legajos viejos que
// nunca pasaron por ese campo del formulario.
//
// Si el desfasaje cambia algún día, se ajusta en un solo lugar.
export const OFFSET_MESES_ALTA_OBRA_SOCIAL = 3;

// fechaIngresoISO: 'YYYY-MM-DD' (input type=date) o cualquier string que
// Date() entienda. Devuelve un objeto Date (mediodía local, evita
// corrimientos de huso horario en el cálculo de mes) o null si la fecha
// de entrada no es válida.
export function calcularFechaAltaObraSocial(fechaIngresoISO) {
  if (!fechaIngresoISO) return null;
  const base = fechaIngresoISO.includes('T') ? fechaIngresoISO : fechaIngresoISO + 'T12:00:00';
  const d = new Date(base);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + OFFSET_MESES_ALTA_OBRA_SOCIAL);
  return d;
}

// Para inputs type="date" (YYYY-MM-DD) — usado en recalcularInicioObraSocial().
export function calcularFechaAltaObraSocialISO(fechaIngresoISO) {
  const d = calcularFechaAltaObraSocial(fechaIngresoISO);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

// "08/2026" — usado en la columna "Mes de alta" del listado de Legajos.
// Mes con dos dígitos (cero a la izquierda) + barra + año con cuatro
// dígitos. Se lee con getMonth()/getFullYear() (métodos LOCALES) sobre la
// fecha ya construida a mediodía local en calcularFechaAltaObraSocial(),
// así no hay corrimiento de día/mes por zona horaria. d vacío/null → ''.
export function formatearMesAnio(d) {
  if (!d) return '';
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

// Componente compartido de días de la semana + horario.
// Nació en Servicios (objetivos, legacy.js, "personal necesario") y lo
// reutiliza Pedidos de personal (v088) para persistir el horario semanal
// con el MISMO formato, de forma consistente entre módulos.
//
// Formato de horario (objeto único):
//   { dias:{lunes:bool,...,feriados:bool}, horarioDesde:'HH:MM',
//     horarioHasta:'HH:MM', tipoHorario:'fijo'|'rotativo' }

export const DIAS_SEMANA = [
  ['lunes', 'L'],
  ['martes', 'M'],
  ['miercoles', 'X'],
  ['jueves', 'J'],
  ['viernes', 'V'],
  ['sabados', 'S'],
  ['domingos', 'D'],
  ['feriados', 'Fer.'],
];

// Genera la fila de checkboxes de días. exprFn(dia, label) devuelve la
// expresión onchange inline (los onchange corren en scope global).
export function checklistDiasHtml(dias, exprFn) {
  return DIAS_SEMANA.map(([d, label]) =>
    `<label style="display:flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;"><input type="checkbox" ${dias?.[d] ? 'checked' : ''} onchange="${exprFn(d, label)}">${label}</label>`
  ).join('');
}

// Días marcados como texto corto, ej. "L, M, X, V" (o '—' si ninguno).
export function diasMarcadosTexto(dias) {
  const sel = DIAS_SEMANA.filter(([d]) => dias?.[d]).map(([, l]) => l);
  return sel.length ? sel.join(', ') : '—';
}

// Resumen legible para tablas/columna, ej.
// "L, M, X, V · 14:00 a 22:00 · Fijo". Acepta el objeto estructurado o un
// texto libre (retrocompat con pedidos antiguos que usan texto suelto).
export function formatearHorarioSemanal(h) {
  if (!h || typeof h === 'string') return h || '';
  const dias = diasMarcadosTexto(h.dias);
  const rango = h.horarioDesde || h.horarioHasta
    ? `${h.horarioDesde || '?'} a ${h.horarioHasta || '?'}`
    : '';
  const tipo = h.tipoHorario ? (h.tipoHorario === 'rotativo' ? 'Rotativo' : 'Fijo') : '';
  return [dias, rango, tipo].filter(Boolean).join(' · ');
}

// Sanciones v1 — cálculo de antecedentes disciplinarios (diseño §15.8).
// Acotado a esta tanda: cuenta por nivel y da un nivel de riesgo
// informativo. Las alertas automáticas a Gerencia/Consejo (umbrales de
// 3+/5+ apercibimientos) quedan para cuando el Consejo esté
// implementado — sin eso no hay a quién escalarle nada.

import { DB } from '@shared/state.js';

// Contador acumulativo histórico, sin caducidad (decisión ya tomada en
// el diseño §3.14 — "se puede revisar más adelante si Gabi decide
// agregar caducidad").
export function calcularAntecedentesDisciplinarios(legajoId) {
  const sanciones = (DB.sancionesDisciplinarias || []).filter(s =>
    String(s.legajoIdLocal) === String(legajoId) &&
    !s.anulado &&
    s.estado !== 'Rechazada' &&
    s.estado !== 'Revertida por Gerente' &&
    !s.sancionRevocadaPorApelacion
  );

  const apercibimientos = sanciones.filter(s => s.nivel === 2).length;
  let riesgoEscalada = 'Normal';
  if (apercibimientos >= 5) riesgoEscalada = 'Crítico — propuesta al Consejo';
  else if (apercibimientos >= 3) riesgoEscalada = 'Alto — evaluación obligatoria';
  else if (apercibimientos >= 2) riesgoEscalada = 'Medio — próximo apercibimiento sugerido';

  return {
    total: sanciones.length,
    verbal: sanciones.filter(s => s.nivel === 0).length,
    observaciones: sanciones.filter(s => s.nivel === 1).length,
    apercibimientos,
    suspensiones: sanciones.filter(s => s.nivel === 3).length,
    exclusiones: sanciones.filter(s => s.nivel === 4).length,
    riesgoEscalada,
  };
}

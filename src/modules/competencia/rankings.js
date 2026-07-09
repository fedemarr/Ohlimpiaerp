// Competencia Anual v2 — cálculo de rankings desde el ledger de
// movimientos (reemplaza generarDatosCompetencia()/calcularEquipos()/
// calcularSupervisores() de la versión anterior, que recorrían
// legajos/capacitaciones/evaluaciones en cada render).

import { DB } from '@shared/state.js';
import { esAdministrativo } from './movimientos.js';

const TREINTA_DIAS_MS = 30 * 24 * 3600 * 1000;

function mapaCodigoPorReglaId() {
  const m = new Map();
  (DB.reglasCompetencia || []).forEach(r => m.set(String(r.id), r.codigo));
  return m;
}

export function movimientosDelAnio(anio) {
  return (DB.movimientosPuntos || []).filter(m => !m.anulado && !m.revertido && String(m.anioCompetencia) === String(anio));
}

// Ranking denso: puntajes iguales comparten puesto, sin dejar hueco
// (DISENO_competencia_anual.md §3.9 — dos personas empatadas en 1° dejan
// que el siguiente puntaje distinto sea 3°, no 2°).
function asignarPuestoDenso(lista, campo) {
  lista.sort((a, b) => b[campo] - a[campo]);
  let puesto = 1;
  lista.forEach((item, i) => {
    if (i > 0 && lista[i - 1][campo] !== item[campo]) puesto = i + 1;
    item.puesto = puesto;
  });
  return lista;
}

export function calcularRankingIndividual(anio) {
  const movs = movimientosDelAnio(anio);
  const codigoPorRegla = mapaCodigoPorReglaId();
  const porDestinatario = {};

  movs.forEach(m => {
    const key = m.destinatarioIdLocal;
    if (!porDestinatario[key]) {
      porDestinatario[key] = {
        nro: key, nombre: m.nombreDestinatario, total: 0,
        ptsEvaluaciones: 0, ptsPresenciales: 0, ptsOtrasCap: 0,
        ptsFelicitaciones: 0, ptsEquipo: 0, ptsNegativos: 0,
        actividadReciente: false,
      };
    }
    const item = porDestinatario[key];
    item.total += m.puntosCongelados;
    const codigo = codigoPorRegla.get(String(m.reglaIdLocal));
    if (codigo === 'responder_evaluacion' || codigo === 'respuesta_correcta') item.ptsEvaluaciones += m.puntosCongelados;
    else if (codigo === 'capacitacion_presencial') item.ptsPresenciales += m.puntosCongelados;
    else if (codigo === 'capacitacion_servicio' || codigo === 'capacitacion_virtual') item.ptsOtrasCap += m.puntosCongelados;
    else if (codigo === 'felicitacion_cliente') item.ptsFelicitaciones += m.puntosCongelados;
    else if (codigo === 'participacion_equipo') item.ptsEquipo += m.puntosCongelados;
    if (m.puntosCongelados < 0) item.ptsNegativos += m.puntosCongelados;
    if (m.puntosCongelados > 0 && (Date.now() - new Date(m.fechaMovimiento).getTime()) < TREINTA_DIAS_MS) item.actividadReciente = true;
  });

  const ranking = Object.values(porDestinatario)
    .map(item => {
      const legajo = (DB.legajos || []).find(l => String(l.nro) === String(item.nro));
      if (!legajo || esAdministrativo(legajo)) return null;
      return { ...item, servicio: legajo.servicio || '', supervisor: legajo.supervisor || '', deBaja: legajo.estado === 'Baja' };
    })
    .filter(Boolean);

  return asignarPuestoDenso(ranking, 'total');
}

export function calcularRankingServicios(anio) {
  const movs = movimientosDelAnio(anio).filter(m => m.servicioAlMomento && m.servicioAlMomento.trim().toUpperCase() !== 'ADMINISTRATIVO');
  const codigoPorRegla = mapaCodigoPorReglaId();
  const porServicio = {};

  movs.forEach(m => {
    const key = m.servicioAlMomento;
    if (!porServicio[key]) porServicio[key] = { servicio: key, sumaPuntos: 0, ptsFelicitaciones: 0, participantes: new Set() };
    porServicio[key].sumaPuntos += m.puntosCongelados;
    if (codigoPorRegla.get(String(m.reglaIdLocal)) === 'felicitacion_cliente') porServicio[key].ptsFelicitaciones += m.puntosCongelados;
    if (m.puntosCongelados > 0) porServicio[key].participantes.add(m.destinatarioIdLocal);
  });

  const ranking = Object.values(porServicio).map(item => {
    const miembros = (DB.legajos || []).filter(l => l.estado === 'Activo' && !esAdministrativo(l) && l.servicio === item.servicio);
    const miembrosTotales = miembros.length || 1;
    const participantes = item.participantes.size;
    const promedioBase = item.sumaPuntos / miembrosTotales;
    const porcentajeParticipacion = participantes / miembrosTotales;
    return {
      servicio: item.servicio, miembros, miembrosTotales,
      participantes, porcentajeParticipacion: Math.round(porcentajeParticipacion * 100),
      sumaPuntos: item.sumaPuntos, totalPts: item.sumaPuntos,
      promedioBase: Math.round(promedioBase), ptsFelicitaciones: item.ptsFelicitaciones,
      supervisor: miembros[0]?.supervisor || '',
      puntajeOficial: Math.round(promedioBase * porcentajeParticipacion),
    };
  });

  return asignarPuestoDenso(ranking, 'puntajeOficial');
}

export function calcularRankingSupervisores(anio) {
  const movs = movimientosDelAnio(anio).filter(m => m.supervisorAlMomento);
  const porSupervisor = {};

  movs.forEach(m => {
    const key = m.supervisorAlMomento;
    if (!porSupervisor[key]) porSupervisor[key] = { supervisor: key, sumaPuntos: 0, participantes: new Set() };
    porSupervisor[key].sumaPuntos += m.puntosCongelados;
    if (m.puntosCongelados > 0) porSupervisor[key].participantes.add(m.destinatarioIdLocal);
  });

  const ranking = Object.values(porSupervisor).map(item => {
    const gente = (DB.legajos || []).filter(l => l.estado === 'Activo' && !esAdministrativo(l) && l.supervisor === item.supervisor);
    const totalGente = gente.length || 1;
    const participantes = item.participantes.size;
    const promedioBase = item.sumaPuntos / totalGente;
    const porcentajeParticipacion = participantes / totalGente;
    return {
      supervisor: item.supervisor, gente, totalGente: gente.length,
      servicios: [...new Set(gente.map(g => g.servicio).filter(Boolean))].length,
      sumaPuntos: item.sumaPuntos, totalPts: item.sumaPuntos,
      promedioBase: Math.round(promedioBase),
      participacion: Math.round(porcentajeParticipacion * 100),
      promedio: Math.round(promedioBase * porcentajeParticipacion),
      noParticipan: gente.filter(g => !item.participantes.has(String(g.nro))),
    };
  });

  return asignarPuestoDenso(ranking, 'promedio');
}

// Pedidos de Adelantos + Gestión de Adelantos v1.1 — panel de
// contexto del asociado para RRHH en Revisión (Cambio 7 del delta).
// Todas las alertas son informativas — nunca bloquean la aprobación,
// RRHH decide con la información completa.
//
// Sanciones y Enfermos exponen su API como ES modules, no como
// window.sancionesAPI/window.enfermosAccidentesAPI (el delta asumía
// globals que no existen) — se importa directo, mismo patrón que el
// resto de la sesión.

import { DB } from '@shared/state.js';
import { obtenerTopeVigente, obtenerUmbralAlertaPedidos } from './config.js';
import { calcularAntecedentesDisciplinarios } from '../sanciones/escalada.js';
import { casoAbiertoDeLegajo } from '../enfermos_accidentes/flujo.js';

function antiguedadAnios(fechaIngresoDDMMYYYY) {
  if (!fechaIngresoDDMMYYYY) return null;
  const [d, m, y] = fechaIngresoDDMMYYYY.split('/');
  const ingreso = new Date(`${y}-${m}-${d}T00:00:00`);
  if (isNaN(ingreso)) return null;
  return Math.floor((Date.now() - ingreso.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

// Mismo bug de huso horario que hoyISO() en flujo.js/config.js: extraer
// el período con toISOString() (UTC) podía correrse un mes cerca del
// fin de mes en Argentina — se arma el "YYYY-MM" en hora local.
function periodoLocal(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function historialPropio(legajoNro) {
  const hace6Meses = new Date(); hace6Meses.setMonth(hace6Meses.getMonth() - 6);
  const desde = periodoLocal(hace6Meses);

  const adelantos = (DB.pedidosAdelantos || []).filter(p => !p.anulado && String(p.legajoIdLocal) === String(legajoNro) && p.periodo >= desde);
  const prestamos = (DB.prestamos || []).filter(p => !p.anulado && String(p.legajoIdLocal) === String(legajoNro));

  const aprobados = adelantos.filter(p => p.estado === 'Aprobada').length;
  const rechazados = adelantos.filter(p => ['Rechazada RRHH', 'Rechazada Finanzas'].includes(p.estado)).length;
  const montoTotal = adelantos.filter(p => p.estado === 'Aprobada').reduce((s, p) => s + (Number(p.monto) || 0), 0);

  const prestamosActivos = prestamos.filter(p => p.estado === 'Aprobada' || p.estado === 'Activo');
  const totalMensualComprometido = prestamosActivos.reduce((s, p) => s + (Number(p.montoCuota) || 0), 0);

  const hoy = periodoLocal(new Date());
  const pedidosEsteMes = adelantos.filter(p => p.periodo === hoy && p.estado !== 'Cancelada').length
    + prestamos.filter(p => p.periodo === hoy && p.estado !== 'Cancelada').length;

  return { aprobados, rechazados, montoTotal, prestamosActivos: prestamosActivos.length, totalMensualComprometido, pedidosEsteMes };
}

export function construirContextoAsociado(legajo, pedidoEnRevision) {
  const historial = historialPropio(legajo.nro);
  const antecedentes = calcularAntecedentesDisciplinarios(legajo.nro);
  const casoMedico = casoAbiertoDeLegajo(legajo.nro);
  const umbral = obtenerUmbralAlertaPedidos();
  const tope = obtenerTopeVigente();

  const alertas = [];
  if (pedidoEnRevision?.monto && tope != null && Number(pedidoEnRevision.monto) > tope) {
    const factor = Number(pedidoEnRevision.monto) / tope;
    alertas.push({ nivel: factor > 2 ? 'danger' : 'warn', mensaje: `SUPERA TOPE VIGENTE de $${tope.toLocaleString('es-AR')}` });
  }
  if (historial.pedidosEsteMes >= umbral) {
    alertas.push({ nivel: 'warn', mensaje: `${historial.pedidosEsteMes} pedidos este mes` });
  }
  if (antecedentes.suspensiones > 0 || antecedentes.riesgoEscalada?.startsWith('Crítico')) {
    alertas.push({ nivel: 'danger', mensaje: 'Antecedentes disciplinarios graves — revisar' });
  }
  if (casoMedico) {
    alertas.push({ nivel: 'danger', mensaje: `En tratamiento médico activo (${casoMedico.tipoCaso}, desde ${casoMedico.fechaInicio})` });
  }
  if (alertas.length === 0) alertas.push({ nivel: 'info', mensaje: 'Sin observaciones' });

  return {
    asociado: {
      nombre: legajo.nombre, nro: legajo.nro, antiguedadAnios: antiguedadAnios(legajo.ingreso),
      funcion: legajo.funcion, servicio: legajo.servicio, supervisor: legajo.supervisor,
    },
    historial,
    sanciones: {
      total: antecedentes.total, apercibimientos: antecedentes.apercibimientos,
      suspensiones: antecedentes.suspensiones, riesgoEscalada: antecedentes.riesgoEscalada,
    },
    casoMedico: casoMedico ? { tipoCaso: casoMedico.tipoCaso, fechaInicio: casoMedico.fechaInicio, estado: casoMedico.estado } : null,
    alertas,
  };
}

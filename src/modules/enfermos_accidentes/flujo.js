// Enfermos y Accidentes v1 — el motor. Reemplaza guardarEnfermo() de
// legacy.js, que tenía el mismo bug de llaves que guardarLegal (el
// caso se perdía cuando el asociado matcheaba un legajo) y escribía
// leg.estadoMedico sin ningún control.

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { esAdministrativo, congelarValorHora, getCategoriaById } from './categoria_helper.js';

export const idLocalTrunc = (id) => String(id).slice(-9);

export function getCasoById(id) {
  return (DB.casosEnfermosAccidentes || []).find(c => String(c.id) === String(id));
}

export function casoAbiertoDeLegajo(legajoIdLocal) {
  return (DB.casosEnfermosAccidentes || []).find(c =>
    !c.anulado && c.estado === 'Abierto' && String(c.legajoIdLocal) === String(legajoIdLocal)
  );
}

async function registrarEventoCaso(caso, estadoDesde, estadoHasta, observaciones = '') {
  const ev = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    casoIdLocal: idLocalTrunc(caso.id),
    estadoDesde, estadoHasta,
    ejecutadoPor: currentUser?.nombre || '',
    ejecutadoEn: new Date().toISOString(),
    observaciones,
  };
  if (!DB.casoEventosEnfermos) DB.casoEventosEnfermos = [];
  DB.casoEventosEnfermos.push(ev);
  await supaSync('casoEventosEnfermos', ev);
}

// Devuelve { error: '...' } si no se puede abrir, o { caso } si se
// abrió correctamente — nunca lanza, para que el modal muestre el
// error sin romper el flujo (diseño §8.1/§11.2/§11.6).
export async function abrirCaso({
  legajo, categoriaIdLocal, tipoCaso, subtipo, fechaInicio, fechaAltaPrevista,
  observaciones, datosEnfermedad, datosAccidente,
}) {
  if (casoAbiertoDeLegajo(legajo.nro)) {
    return { error: `${legajo.nombre} ya tiene un caso abierto. Cerralo antes de abrir uno nuevo.` };
  }

  const administrativo = esAdministrativo(legajo);
  let congelado = { pendienteAdministrativo: false, valorHoraCongelado: null, valorHoraIdLocal: null };
  if (!administrativo) {
    if (!categoriaIdLocal) return { error: 'Elegí la categoría del asociado.' };
    congelado = congelarValorHora(legajo, categoriaIdLocal, fechaInicio);
    if (!congelado) {
      return { error: `No hay valor hora vigente para esa categoría en el servicio "${legajo.servicio}". Cargalo en el módulo Categorías antes de continuar.` };
    }
  }

  const nuevo = {
    id: Date.now(),
    legajoIdLocal: String(legajo.nro),
    nroSocio: String(legajo.nro),
    nombreAsociado: legajo.nombre,
    tipoAsociado: administrativo ? 'Administrativo' : 'Operativo',
    servicio: administrativo ? '' : (legajo.servicio || ''),
    supervisor: administrativo ? '' : (legajo.supervisor || ''),
    area: administrativo ? (legajo.sector || '') : '',
    tipoCaso, subtipo: subtipo || '',
    fechaInicio,
    fechaAltaPrevista: fechaAltaPrevista || null,
    fechaAltaEfectiva: null,
    categoriaIdLocal: administrativo ? null : idLocalTrunc(categoriaIdLocal),
    categoriaNombre: administrativo ? '' : (getCategoriaById(categoriaIdLocal)?.nombre || ''),
    servicioAlIngreso: congelado.servicioAlIngreso || '',
    valorHoraCongelado: congelado.valorHoraCongelado,
    valorHoraIdLocal: congelado.valorHoraIdLocal ? idLocalTrunc(congelado.valorHoraIdLocal) : null,
    pendienteAdministrativo: congelado.pendienteAdministrativo,
    estado: 'Abierto',
    datosEnfermedad: tipoCaso === 'Enfermedad' ? (datosEnfermedad || {}) : null,
    datosAccidente: tipoCaso === 'Accidente' ? (datosAccidente || {}) : null,
    observaciones: observaciones || '',
    cargadoPor: currentUser?.nombre || '',
  };
  if (!DB.casosEnfermosAccidentes) DB.casosEnfermosAccidentes = [];
  DB.casosEnfermosAccidentes.push(nuevo);
  await supaSync('casosEnfermosAccidentes', nuevo);
  await registrarEventoCaso(nuevo, null, 'Abierto');

  if (!administrativo) {
    legajo.categoriaIdLocal = idLocalTrunc(categoriaIdLocal);
  }
  legajo.enTratamiento = true;
  // Mantiene el badge no-confidencial "🏥 En tratamiento" que ya
  // muestra la tabla de Legajos (legajos.js:63) — a diferencia de
  // estadoLegal, este campo nunca contuvo diagnóstico, solo un
  // resumen de estado, y el propio diseño quiere que el supervisor
  // lo siga viendo (§3.9).
  legajo.estadoMedico = 'En tratamiento';
  await supaSync('legajos', legajo);

  if (!administrativo && legajo.supervisor) {
    await crearNotificacion({
      tipo: 'enfermos_caso_abierto', entidadTipo: 'caso_enfermos', entidadIdLocal: nuevo.id,
      destinatarioNombre: legajo.supervisor,
      mensaje: `🏥 Se registró un caso de ${tipoCaso.toLowerCase()} para ${legajo.nombre}.`,
    });
  }

  return { caso: nuevo };
}

export async function cerrarCaso({ casoIdLocal, motivoCierre, fechaAltaEfectiva, observacionesCierre }) {
  const caso = getCasoById(casoIdLocal);
  if (!caso) return { error: 'No se encontró el caso' };
  const estadoDesde = caso.estado;
  caso.estado = motivoCierre === 'Alta médica' ? 'Cerrado por alta médica' : 'Cerrado por decisión RRHH';
  caso.fechaAltaEfectiva = fechaAltaEfectiva;
  caso.fechaCierre = new Date().toISOString();
  caso.cerradoPor = currentUser?.nombre || '';
  caso.motivoCierre = motivoCierre;
  caso.observacionesCierre = observacionesCierre || '';
  await supaSync('casosEnfermosAccidentes', caso);
  await registrarEventoCaso(caso, estadoDesde, caso.estado, observacionesCierre);

  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(caso.legajoIdLocal));
  if (legajo) {
    legajo.enTratamiento = false;
    legajo.estadoMedico = '';
    await supaSync('legajos', legajo);
  }
  return { caso };
}

export async function anularCaso(casoIdLocal, motivo) {
  const caso = getCasoById(casoIdLocal);
  if (!caso) return { error: 'No se encontró el caso' };
  caso.anulado = true;
  caso.fechaAnulacion = new Date().toISOString();
  caso.anuladoPor = currentUser?.nombre || '';
  caso.motivoAnulacion = motivo || '';
  await supaSync('casosEnfermosAccidentes', caso);
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(caso.legajoIdLocal));
  if (legajo && caso.estado === 'Abierto') {
    legajo.enTratamiento = false;
    legajo.estadoMedico = '';
    await supaSync('legajos', legajo);
  }
  return { caso };
}

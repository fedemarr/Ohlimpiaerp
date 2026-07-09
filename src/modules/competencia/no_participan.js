// Competencia Anual v2 — Tab "No participan" (corazón funcional del
// módulo, DISENO_competencia_anual.md §9). 4 niveles de riesgo por %
// real de participación (evaluaciones respondidas + capacitaciones
// dictadas, sobre lo asignado en el año) — reemplaza la columna fija
// "🔴 Alto" que tenía la versión anterior.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { esAdministrativo } from './movimientos.js';

const NIVEL_BADGE = {
  'Muy alto': 'badge-rojo', 'Alto': 'badge-rojo', 'Medio': 'badge-acento', 'Bajo': 'badge-verde',
};
const NIVEL_ICONO = { 'Muy alto': '🔴', 'Alto': '🟠', 'Medio': '🟡', 'Bajo': '🟢' };

function nivelPorPorcentaje(pct) {
  if (pct <= 0) return 'Muy alto';
  if (pct < 30) return 'Alto';
  if (pct < 60) return 'Medio';
  return 'Bajo';
}

export function calcularNoParticipantes(anio) {
  const activos = (DB.legajos || []).filter(l => l.estado === 'Activo' && !esAdministrativo(l));
  const anioStr = String(anio);

  return activos.map(l => {
    const evalAsig = (DB.evaluacionesEnviadas || []).filter(e => !e.anulado && String(e.nroSocio) === String(l.nro) && (e.fechaEnvio || '').startsWith(anioStr));
    const evalResp = evalAsig.filter(e => e.estado === 'Respondida');
    const capsAsig = (DB.capacitaciones || []).filter(c => !c.anulado && String(c.nroSocio) === String(l.nro) && (c.fecha || '').startsWith(anioStr));
    // "Completada" mide compromiso (participó), no desempeño — cuenta
    // toda capacitación Dictada, apruebe o no.
    const capsComp = capsAsig.filter(c => c.estado === 'Dictada');

    const totalAsignado = evalAsig.length + capsAsig.length;
    const totalCompletado = evalResp.length + capsComp.length;
    const porcentaje = totalAsignado > 0 ? Math.round((totalCompletado / totalAsignado) * 100) : 0;
    const nivel = nivelPorPorcentaje(porcentaje);

    const movsPositivos = (DB.movimientosPuntos || []).filter(m => !m.anulado && !m.revertido && String(m.destinatarioIdLocal) === String(l.nro) && m.puntosCongelados > 0);
    const ultimoMov = movsPositivos.sort((a, b) => new Date(b.fechaMovimiento) - new Date(a.fechaMovimiento))[0];
    const diasSinActividad = ultimoMov ? Math.floor((Date.now() - new Date(ultimoMov.fechaMovimiento).getTime()) / (24 * 3600 * 1000)) : null;

    const notifs = (DB.notificacionesNoParticipan || []).filter(n => !n.anulado && String(n.operarioIdLocal) === String(l.nro)).sort((a, b) => new Date(b.fechaEnviado) - new Date(a.fechaEnviado));
    const ultimaNotificacion = notifs[0] || null;

    return {
      nro: l.nro, nombre: l.nombre, servicio: l.servicio || '', supervisor: l.supervisor || '',
      evalAsignadas: evalAsig.length, evalRespondidas: evalResp.length,
      capsAsignadas: capsAsig.length, capsCompletadas: capsComp.length,
      porcentaje, nivel, diasSinActividad, ultimaNotificacion,
    };
  }).sort((a, b) => a.porcentaje - b.porcentaje);
}

// Chequeo al abrir el módulo (sin cron real, mismo patrón que
// chequearAlertas24hs()/chequear15Dias() de Uniformes). Notifica al
// supervisor la PRIMERA vez que alguien de su equipo pasa a riesgo
// Alto/Muy alto en el año — la existencia de la fila de auditoría es
// el propio flag de "ya notificado", no hace falta booleano aparte.
export async function chequearRiesgoYNotificarSupervisores(anio) {
  const noParticipan = calcularNoParticipantes(anio).filter(d => d.nivel === 'Alto' || d.nivel === 'Muy alto');
  for (const d of noParticipan) {
    if (!d.supervisor) continue;
    const yaNotificado = (DB.notificacionesNoParticipan || []).some(n =>
      !n.anulado && n.destinatarioTipo === 'Supervisor' && n.origen === 'Automatico' &&
      String(n.operarioIdLocal) === String(d.nro) && String(n.anioCompetencia) === String(anio)
    );
    if (yaNotificado) continue;

    const supervisorLegajo = (DB.legajos || []).find(l => l.estado === 'Activo' && l.nombre === d.supervisor);
    const mensaje = `⚠️ ${d.nombre} (${d.servicio}) pasó a riesgo ${d.nivel} de participación en la Competencia Anual — ${d.porcentaje}% de lo asignado.`;

    const registro = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      operarioIdLocal: String(d.nro), nivelRiesgo: d.nivel,
      destinatarioTipo: 'Supervisor', destinatarioIdLocal: supervisorLegajo ? String(supervisorLegajo.nro) : null,
      canal: 'Sistema', origen: 'Automatico', mensaje,
      enviadoPor: 'Sistema', anioCompetencia: Number(anio),
    };
    if (!DB.notificacionesNoParticipan) DB.notificacionesNoParticipan = [];
    DB.notificacionesNoParticipan.push(registro);
    await supaSync('notificacionesNoParticipan', registro);

    if (d.supervisor) {
      await crearNotificacion({ tipo: 'competencia_alerta_supervisor', entidadTipo: 'competencia', entidadIdLocal: d.nro, destinatarioNombre: d.supervisor, mensaje });
    }
  }
}

// ========== RENDER TAB 4 ==========

export function renderTablaNoParticipan(anio) {
  const tbody = $('tbody-comp-nop');
  if (!tbody) return;
  const anioReal = anio || ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  let filas = calcularNoParticipantes(anioReal);

  const soloRiesgo = $('f-comp-nop-riesgo');
  const nivelesSel = soloRiesgo ? Array.from(soloRiesgo.selectedOptions).map(o => o.value) : ['Muy alto', 'Alto', 'Medio'];
  if (nivelesSel.length) filas = filas.filter(d => nivelesSel.includes(d.nivel));

  const stMuyAlto = filas.filter(d => d.nivel === 'Muy alto').length;
  const stAlto = filas.filter(d => d.nivel === 'Alto').length;
  const stMedio = filas.filter(d => d.nivel === 'Medio').length;
  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-comp-nop', String(stMuyAlto + stAlto));
  ss('st-comp-nop-muyalto', stMuyAlto);
  ss('st-comp-nop-alto', stAlto);
  ss('st-comp-nop-medio', stMedio);

  tbody.innerHTML = filas.map(d => `<tr>
    <td style="font-weight:500;">${d.nombre}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${d.nro}</td>
    <td style="font-size:12px;">${d.servicio || '—'}</td>
    <td style="font-size:12px;">${d.supervisor || '—'}</td>
    <td style="text-align:center;">${d.evalRespondidas}/${d.evalAsignadas}</td>
    <td style="text-align:center;">${d.capsCompletadas}/${d.capsAsignadas}</td>
    <td style="text-align:center;"><span class="badge ${NIVEL_BADGE[d.nivel]}">${d.porcentaje}%</span></td>
    <td style="text-align:center;font-size:12px;color:var(--texto-suave);">${d.diasSinActividad != null ? d.diasSinActividad + 'd' : '—'}</td>
    <td style="text-align:center;"><span class="badge ${NIVEL_BADGE[d.nivel]}">${NIVEL_ICONO[d.nivel]} ${d.nivel}</span></td>
    <td style="white-space:nowrap;">
      <button class="btn btn-xs" style="background:var(--azul-claro);color:var(--azul);border:1px solid var(--azul);" onclick="abrirNotificarAsociado('${d.nro}')">📱 Asociado</button>
      <button class="btn btn-xs btn-secondary" onclick="abrirNotificarEquipoServicio('${d.servicio}','${d.nro}')">👥 Equipo</button>
    </td>
  </tr>`).join('') || `<tr><td colspan="10"><div class="empty-state"><div class="icon">🎉</div><p>¡Todos participan! No hay asociados en riesgo.</p></div></td></tr>`;
}

export function filtrarCompNop() { renderTablaNoParticipan(); }

export function riesgoAltoDelAnio() {
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  return calcularNoParticipantes(anio).filter(d => d.nivel === 'Alto' || d.nivel === 'Muy alto');
}

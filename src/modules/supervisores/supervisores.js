// Módulo Supervisores — tema 7 del relevamiento (10/08), sql/v081.
// Catálogo de SUPERVISORES (personas): alta/baja y conteo de servicios.
// El % de supervisión NO vive acá (ticket 13/08/2026, sql/v086): es una
// propiedad de la relación servicio-supervisión, con cascada GENERAL →
// CLIENTE → SERVICIO, y se edita en "Supervisión de servicios"
// (src/modules/supervision/). Nunca se llama "comisión" — eso es de
// coordinadores de cuenta.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync, supaDel, getLastSupaSyncError } from '@shared/supabase.js';
import { nombresSupervisoresReales } from '@modules/servicios_supervisor/index.js';

function getSupervisorConfigById(id) {
  return (DB.supervisoresConfig || []).find(x => String(x.id) === String(id));
}

// Servicios OPERATIVOS que tiene asignados (multi-supervisor v081
// incluido). Duplicada a propósito (no importada de supervision.js, que
// no la exporta, ni de servicios_supervisor.js/legacy.js) — mismo
// criterio "sin dependencias circulares" que ya usa el proyecto.
//
// FIX (ticket "Lista de supervisores", 31/08): la cuenta usaba
// `(o.supervisoresAsignados || [o.supervisorAsignado])` — supervisoresAsignados
// por defecto es [] (array vacío, truthy en JS), así que el || nunca caía
// al fallback y CUALQUIER servicio sin co-supervisión explícita (la
// inmensa mayoría) quedaba afuera de la cuenta. Ahora chequea .length.
function serviciosDelSupervisor(nombre) {
  return (DB.objetivos || []).filter(o => o.estado === 'Operativo' && !o.anulado &&
    ((o.supervisoresAsignados && o.supervisoresAsignados.length) ? o.supervisoresAsignados : (o.supervisorAsignado ? [o.supervisorAsignado] : [])).includes(nombre));
}

export function renderSupervisores() {
  const tbody = $('tbody-supervisores');
  if (!tbody) return;
  const q = ($('sup-cfg-buscar') || { value: '' }).value.toLowerCase();
  const rows = (DB.supervisoresConfig || [])
    .filter(s => !q || s.nombre.toLowerCase().includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin supervisores en el catálogo.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(s => {
    const cantServicios = serviciosDelSupervisor(s.nombre).length;
    return `<tr style="opacity:${s.activo === false ? '.5' : '1'};">
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${s.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;font-size:12px;">${cantServicios}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
      <button class="btn btn-xs ${s.activo === false ? 'btn-secondary' : ''}" style="${s.activo !== false ? 'background:#fee2e2;color:#991b1b;' : ''}" onclick="toggleActivoSupervisor('${s.id}')">${s.activo === false ? 'Reactivar' : 'Desactivar'}</button>
      <button class="btn btn-xs" style="background:#fee2e2;color:#b91c1c;" title="Eliminar del catálogo" onclick="eliminarSupervisor('${s.id}')">🗑️</button>
    </td>
  </tr>`;
  }).join('');
}

export function toggleActivoSupervisor(id) {
  const s = getSupervisorConfigById(id); if (!s) return;
  s.activo = s.activo === false ? true : false;
  supaSync('supervisoresConfig', s);
  renderSupervisores();
  toast(s.activo ? `✓ ${s.nombre} reactivado` : `${s.nombre} desactivado`);
}

// Eliminar del catálogo (borrado real, no soft-delete). SUPUESTO DE
// NEGOCIO (sin regla previa escrita en el repo para este caso — ticket
// "Lista de supervisores", 31/08): con servicios activos asignados se
// bloquea el borrado y se sugiere "Desactivar" en su lugar — mismo
// criterio "conservador con personas" que ya usa el resto del ERP
// (legajos/personal_rrhh: soft-delete cuando hay vínculo/historial). Sin
// servicios, el borrado es real y pide confirmación (mismo patrón que
// eliminarServicioSupervisor en el módulo hermano).
export async function eliminarSupervisor(id) {
  const s = getSupervisorConfigById(id); if (!s) return;
  const cantServicios = serviciosDelSupervisor(s.nombre).length;
  if (cantServicios > 0) {
    toast(`⚠️ ${s.nombre} tiene ${cantServicios} servicio(s) asignado(s) — desactivalo en vez de eliminarlo, o reasigná esos servicios primero.`);
    return;
  }
  if (!confirm(`¿Eliminar a "${s.nombre}" del catálogo de supervisores? No tiene servicios asignados, pero esto no se puede deshacer.`)) return;
  // supaDel espera el id_local YA truncado (a diferencia de supaSync, que
  // lo deriva solo) — mismo cálculo que usa supaSync internamente.
  const ok = await supaDel('supervisoresConfig', String(s.id).slice(-9));
  if (!ok) {
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo eliminar' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    return;
  }
  const idx = (DB.supervisoresConfig || []).findIndex(x => String(x.id) === String(id));
  if (idx >= 0) DB.supervisoresConfig.splice(idx, 1);
  renderSupervisores();
  toast(`🗑️ ${s.nombre} eliminado del catálogo`);
}

// Agrega al catálogo un nombre de DB.supervisores que todavía no tenga
// fila propia. El % se decide en el módulo Supervisión de servicios.
export function agregarSupervisorAlCatalogo() {
  const nombre = ($('sup-cfg-nuevo') || { value: '' }).value.trim();
  if (!nombre) { toast('⚠️ Elegí un supervisor'); return; }
  if ((DB.supervisoresConfig || []).some(s => s.nombre === nombre)) { toast('⚠️ Ya está en el catálogo'); return; }
  const nuevo = { id: Date.now(), nombre, activo: true };
  if (!DB.supervisoresConfig) DB.supervisoresConfig = [];
  DB.supervisoresConfig.push(nuevo);
  supaSync('supervisoresConfig', nuevo);
  if ($('sup-cfg-nuevo')) $('sup-cfg-nuevo').value = '';
  renderSupervisores();
  toast(`✓ ${nombre} agregado al catálogo`);
}

// Sugiere DB.supervisores + los nombres que REALMENTE aparecen en
// objetivos/puente (nombresSupervisoresReales, mismo criterio unificado
// del ticket "Discrepancia de Servicios asignados a Supervisores", 31/08)
// — así se puede agregar al catálogo con la ortografía real (la que
// serviciosDelSupervisor() efectivamente sabe resolver), no solo con la
// lista vieja a mano.
export function poblarSelectNuevoSupervisor() {
  const dl = $('dl-sup-cfg-nuevo');
  if (!dl) return;
  const yaEnCatalogo = new Set((DB.supervisoresConfig || []).map(s => s.nombre));
  dl.innerHTML = nombresSupervisoresReales().filter(n => !yaEnCatalogo.has(n)).map(n => `<option value="${n}"></option>`).join('');
}

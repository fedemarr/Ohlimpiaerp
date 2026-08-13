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
import { supaSync } from '@shared/supabase.js';

function getSupervisorConfigById(id) {
  return (DB.supervisoresConfig || []).find(x => String(x.id) === String(id));
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
    const cantServicios = (DB.objetivos || []).filter(o => (o.supervisoresAsignados || [o.supervisorAsignado]).includes(s.nombre) && o.estado === 'Operativo').length;
    return `<tr style="opacity:${s.activo === false ? '.5' : '1'};">
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${s.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;font-size:12px;">${cantServicios}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
      <button class="btn btn-xs ${s.activo === false ? 'btn-secondary' : ''}" style="${s.activo !== false ? 'background:#fee2e2;color:#991b1b;' : ''}" onclick="toggleActivoSupervisor('${s.id}')">${s.activo === false ? 'Reactivar' : 'Desactivar'}</button>
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

export function poblarSelectNuevoSupervisor() {
  const dl = $('dl-sup-cfg-nuevo');
  if (!dl) return;
  const yaEnCatalogo = new Set((DB.supervisoresConfig || []).map(s => s.nombre));
  dl.innerHTML = (DB.supervisores || []).filter(n => !yaEnCatalogo.has(n)).map(n => `<option value="${n}"></option>`).join('');
}

// Módulo Supervisores — tema 7 del relevamiento (10/08), sql/v081.
// Catálogo con % de comisión propio por supervisor. Arranca en 3% para
// todos (mismo default que ya usaba el sistema implícitamente en ningún
// lado — hoy no existía ningún mecanismo de pago de comisión al
// supervisor, esto es nuevo), pero deja de estar hardcodeado: el % se
// puede modificar acá, y objetivos.js lo lee de acá para calcular /
// dividir la comisión cuando hay más de un supervisor en un servicio.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// % de comisión configurado para un supervisor por nombre. Si todavía
// no está en el catálogo (ej. supervisor nuevo recién agregado a
// DB.supervisores pero sin fila propia acá), 3% es el default histórico
// del sistema — no se inventa un número distinto.
export function pctComisionSupervisor(nombre) {
  const s = (DB.supervisoresConfig || []).find(x => x.nombre === nombre);
  if (s && s.activo !== false) return s.pctComision != null ? s.pctComision : 3;
  return 3;
}

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
    tbody.innerHTML = '<tr><td colspan="4" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin supervisores en el catálogo.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(s => {
    const cantServicios = (DB.objetivos || []).filter(o => (o.supervisoresAsignados || [o.supervisorAsignado]).includes(s.nombre) && o.estado === 'Operativo').length;
    return `<tr style="opacity:${s.activo === false ? '.5' : '1'};">
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${s.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
      <input type="number" value="${s.pctComision}" min="0" max="100" step="0.5" style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;text-align:center;"
        onchange="actualizarPctSupervisor('${s.id}',this.value)" ${s.activo === false ? 'disabled' : ''}>%
    </td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;font-size:12px;">${cantServicios}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
      <button class="btn btn-xs ${s.activo === false ? 'btn-secondary' : ''}" style="${s.activo !== false ? 'background:#fee2e2;color:#991b1b;' : ''}" onclick="toggleActivoSupervisor('${s.id}')">${s.activo === false ? 'Reactivar' : 'Desactivar'}</button>
    </td>
  </tr>`;
  }).join('');
}

export function actualizarPctSupervisor(id, valor) {
  const s = getSupervisorConfigById(id); if (!s) return;
  s.pctComision = parseFloat(valor) || 0;
  supaSync('supervisoresConfig', s);
  toast(`✓ ${s.nombre}: ${s.pctComision}% de comisión`);
}

export function toggleActivoSupervisor(id) {
  const s = getSupervisorConfigById(id); if (!s) return;
  s.activo = s.activo === false ? true : false;
  supaSync('supervisoresConfig', s);
  renderSupervisores();
  toast(s.activo ? `✓ ${s.nombre} reactivado` : `${s.nombre} desactivado`);
}

// Agrega al catálogo un nombre de DB.supervisores que todavía no tenga
// fila propia — con 3% default (no se inventa otro valor).
export function agregarSupervisorAlCatalogo() {
  const nombre = ($('sup-cfg-nuevo') || { value: '' }).value.trim();
  if (!nombre) { toast('⚠️ Elegí un supervisor'); return; }
  if ((DB.supervisoresConfig || []).some(s => s.nombre === nombre)) { toast('⚠️ Ya está en el catálogo'); return; }
  const nuevo = { id: Date.now(), nombre, pctComision: 3, activo: true };
  if (!DB.supervisoresConfig) DB.supervisoresConfig = [];
  DB.supervisoresConfig.push(nuevo);
  supaSync('supervisoresConfig', nuevo);
  if ($('sup-cfg-nuevo')) $('sup-cfg-nuevo').value = '';
  renderSupervisores();
  toast(`✓ ${nombre} agregado al catálogo con 3%`);
}

export function poblarSelectNuevoSupervisor() {
  const dl = $('dl-sup-cfg-nuevo');
  if (!dl) return;
  const yaEnCatalogo = new Set((DB.supervisoresConfig || []).map(s => s.nombre));
  dl.innerHTML = (DB.supervisores || []).filter(n => !yaEnCatalogo.has(n)).map(n => `<option value="${n}"></option>`).join('');
}

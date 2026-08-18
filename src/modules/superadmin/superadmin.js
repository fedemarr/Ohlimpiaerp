// Módulo Superadmin — registro de empresas clientes del sistema (venta de
// Ohlimpia ERP como producto a otras cooperativas/empresas), sql/v089.
//
// IMPORTANTE — esto NO es multi-tenant de datos. Cada empresa cliente
// tiene su PROPIO proyecto Supabase separado (aislamiento total, sin
// empresa_id compartido en ninguna tabla operativa). Esta pantalla es
// solo el registro/bookkeeping de qué empresas existen y qué módulos les
// vendiste — no controla en vivo lo que cada empresa ve en su propio
// deploy (eso se configura aparte, a mano, siguiendo el runbook de alta).
//
// modulosContratados se arma con las mismas keys que ya usa MENU
// (state.js) — una sola fuente de verdad de "qué módulos existen".

import { DB, MENU, currentUser } from '@shared/state.js';
import { $, hoyStr } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

function _id() { return 'EMP-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }

function getEmpresaById(id) {
  return (DB.empresasCliente || []).find(e => String(e.id) === String(id) && !e.anulado);
}

// Catálogo de módulos vendibles — todas las secciones de MENU excepto las
// de uso interno de Ohlimpia (Superadmin, Desarrollador) y los ítems
// deshabilitados (ej. "Máquinas", todavía sin construir).
const SECCIONES_NO_VENDIBLES = new Set(['Superadmin', 'Desarrollador']);
function seccionesVendiblesMenu() {
  return MENU.filter(sec => sec.section && !SECCIONES_NO_VENDIBLES.has(sec.section) && sec.items.some(i => !i.disabled));
}

const ESTADO_BADGE = { Activa: 'badge-verde', Inactiva: 'badge-gris', Prospecto: 'badge-acento' };

export function renderEmpresas() {
  const tbody = $('tbody-empresas');
  if (!tbody) return;
  const q = ($('emp-buscar') || { value: '' }).value.toLowerCase().trim();
  const rows = (DB.empresasCliente || []).filter(e => !e.anulado)
    .filter(e => !q || e.nombre.toLowerCase().includes(q) || (e.contacto || '').toLowerCase().includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  if ($('st-emp-total')) $('st-emp-total').textContent = (DB.empresasCliente || []).filter(e => !e.anulado).length;
  if ($('st-emp-activas')) $('st-emp-activas').textContent = (DB.empresasCliente || []).filter(e => !e.anulado && e.estado === 'Activa').length;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin empresas cargadas todavía. Usá "+ Nueva empresa".</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(e => {
    const modulos = e.modulosContratados || [];
    const chips = modulos.length
      ? modulos.slice(0, 6).map(k => {
          const item = MENU.flatMap(s => s.items).find(i => i.key === k);
          return `<span class="badge badge-azul" style="margin:1px;">${item ? item.icon + ' ' + item.label : k}</span>`;
        }).join('') + (modulos.length > 6 ? `<span class="badge" style="margin:1px;">+${modulos.length - 6}</span>` : '')
      : '<span style="color:var(--texto-muy-suave);font-size:11px;">Sin módulos asignados</span>';
    return `<tr>
      <td style="padding:8px 14px;border:1px solid var(--borde);">
        <div style="font-weight:600;">${e.nombre}</div>
        ${e.contacto ? `<div style="font-size:11px;color:var(--texto-suave);">${e.contacto}</div>` : ''}
      </td>
      <td style="padding:8px;border:1px solid var(--borde);text-align:center;"><span class="badge ${ESTADO_BADGE[e.estado] || 'badge-gris'}">${e.estado}</span></td>
      <td style="padding:8px;border:1px solid var(--borde);max-width:420px;">${chips}</td>
      <td style="padding:8px;border:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${e.fechaAlta || '—'}</td>
      <td style="padding:8px;border:1px solid var(--borde);text-align:center;white-space:nowrap;">
        <button class="btn btn-xs" onclick="abrirEditarEmpresa('${e.id}')">Editar</button>
        <button class="btn btn-xs btn-secondary" onclick="eliminarEmpresa('${e.id}')">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

let _empresaEditandoId = null;

export function abrirNuevaEmpresa() {
  _empresaEditandoId = null;
  ensureModalEmpresa();
  $('emp-nombre').value = '';
  $('emp-contacto').value = '';
  $('emp-estado').value = 'Prospecto';
  $('emp-supabase-url').value = '';
  $('emp-vercel-url').value = '';
  $('emp-notas').value = '';
  document.querySelectorAll('#emp-modulos-cont input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  $('emp-modal-titulo').textContent = 'Nueva empresa';
  abrirModal('modal-empresa');
}

export function abrirEditarEmpresa(id) {
  const e = getEmpresaById(id);
  if (!e) return;
  _empresaEditandoId = id;
  ensureModalEmpresa();
  $('emp-nombre').value = e.nombre;
  $('emp-contacto').value = e.contacto || '';
  $('emp-estado').value = e.estado || 'Activa';
  $('emp-supabase-url').value = e.supabaseUrl || '';
  $('emp-vercel-url').value = e.vercelUrl || '';
  $('emp-notas').value = e.notas || '';
  const seleccionados = new Set(e.modulosContratados || []);
  document.querySelectorAll('#emp-modulos-cont input[type="checkbox"]').forEach(cb => { cb.checked = seleccionados.has(cb.value); });
  $('emp-modal-titulo').textContent = `Editar — ${e.nombre}`;
  abrirModal('modal-empresa');
}

function ensureModalEmpresa() {
  if ($('modal-empresa')) return;
  const modulosHtml = seccionesVendiblesMenu().map(sec => {
    const items = sec.items.filter(i => !i.disabled).map(i => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:2px 0;cursor:pointer;">
        <input type="checkbox" value="${i.key}"> ${i.icon} ${i.label}
      </label>`).join('');
    return `<div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:var(--texto-suave);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">${sec.section}</div>
      ${items}
    </div>`;
  }).join('');

  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-empresa';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3 id="emp-modal-titulo">Nueva empresa</h3><button class="btn-close" onclick="cerrarModal('modal-empresa')">×</button></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:12px;font-weight:600;">Nombre de la empresa</label>
            <input type="text" id="emp-nombre" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;">Contacto (nombre/email/tel)</label>
            <input type="text" id="emp-contacto" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:12px;font-weight:600;">Estado</label>
            <select id="emp-estado" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;">
              <option value="Prospecto">Prospecto</option>
              <option value="Activa">Activa</option>
              <option value="Inactiva">Inactiva</option>
            </select>
          </div>
          <div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:12px;font-weight:600;">URL de su Supabase (informativo)</label>
            <input type="text" id="emp-supabase-url" placeholder="https://xxxx.supabase.co" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;">URL de su deploy (informativo)</label>
            <input type="text" id="emp-vercel-url" placeholder="https://empresa.vercel.app" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;">
          </div>
        </div>
        <label style="font-size:12px;font-weight:600;">Notas</label>
        <textarea id="emp-notas" rows="2" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 12px;"></textarea>

        <label style="font-size:12px;font-weight:600;">Módulos contratados</label>
        <div id="emp-modulos-cont" style="margin-top:6px;max-height:280px;overflow-y:auto;border:1px solid var(--borde);border-radius:var(--radio);padding:10px 14px;columns:2;column-gap:24px;">
          ${modulosHtml}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-empresa')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarEmpresa()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function guardarEmpresa() {
  const nombre = ($('emp-nombre').value || '').trim();
  if (!nombre) { toast('⚠️ Falta el nombre de la empresa'); return; }
  const modulosContratados = Array.from(document.querySelectorAll('#emp-modulos-cont input[type="checkbox"]:checked')).map(cb => cb.value);
  const datos = {
    nombre,
    contacto: ($('emp-contacto').value || '').trim(),
    estado: $('emp-estado').value,
    supabaseUrl: ($('emp-supabase-url').value || '').trim(),
    vercelUrl: ($('emp-vercel-url').value || '').trim(),
    notas: ($('emp-notas').value || '').trim(),
    modulosContratados,
  };

  let empresa;
  if (_empresaEditandoId) {
    empresa = getEmpresaById(_empresaEditandoId);
    if (!empresa) return;
    Object.assign(empresa, datos);
  } else {
    empresa = { id: _id(), ...datos, fechaAlta: hoyStr(), anulado: false };
    if (!DB.empresasCliente) DB.empresasCliente = [];
    DB.empresasCliente.push(empresa);
  }
  supaSync('empresasCliente', empresa);
  cerrarModal('modal-empresa');
  renderEmpresas();
  toast(`✓ ${nombre} guardada — ${modulosContratados.length} módulo(s) contratado(s)`);
}

export function eliminarEmpresa(id) {
  const e = getEmpresaById(id);
  if (!e) return;
  if (!confirm(`¿Eliminar "${e.nombre}" del registro? Esto no toca ningún dato operativo de esa empresa (viven en su propio Supabase) — solo borra este registro de Ohlimpia.`)) return;
  e.anulado = true;
  supaSync('empresasCliente', e);
  renderEmpresas();
  toast(`${e.nombre} eliminada del registro`);
}

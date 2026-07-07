// Campana de notificaciones del sistema — utilidad COMPARTIDA (no exclusiva
// de Vacaciones). No existía nada parecido en el proyecto: DISENO_vacaciones.md
// asumía una tabla `notificaciones_sistema` "ya creada en Reasignaciones",
// pero ahí solo era un comentario de una etapa nunca implementada (v021).
// Se construye de cero (tabla v029) para que cualquier módulo futuro
// (Reasignaciones, Sanciones, etc.) pueda sumarse sin rehacer nada.
//
// destinatario_nombre (no un id de auth) porque el mock de permisos de
// Vacaciones resuelve Gerente/Consejo por nombre, y currentUser.nombre ya
// está disponible tras el login — evita necesitar un join con usuarios.

import { DB, currentUser } from '@shared/state.js';
import { SUPA, supaSync, _toCamel } from '@shared/supabase.js';
import { $ } from '@shared/helpers.js';

export async function crearNotificacion({ tipo, entidadTipo = 'vacacion', entidadIdLocal, destinatarioNombre, mensaje }) {
  if (!destinatarioNombre) return;
  const n = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    tipo, entidadTipo, entidadIdLocal, destinatarioNombre, mensaje,
    leida: false, leidaEn: null,
  };
  if (!DB.notificacionesSistema) DB.notificacionesSistema = [];
  DB.notificacionesSistema.push(n);
  await supaSync('notificacionesSistema', n);
}

export async function fetchNotificacionesPendientes(nombre) {
  if (!nombre) return [];
  const { data, error } = await SUPA.from('notificaciones_sistema')
    .select('*').eq('destinatario_nombre', nombre).eq('leida', false)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map(row => _toCamel(row));
}

export async function marcarNotificacionLeida(idLocal) {
  const n = (DB.notificacionesSistema || []).find(x => String(x.id) === String(idLocal));
  if (!n) return;
  n.leida = true;
  n.leidaEn = new Date().toISOString();
  await supaSync('notificacionesSistema', n);
  n._local = true;
}

// ========== CAMPANA (UI) ==========

export function renderCampanaNotificaciones() {
  const nombre = currentUser?.nombre;
  const pendientes = (DB.notificacionesSistema || []).filter(n => n.destinatarioNombre === nombre && !n.leida);
  const badge = $('campana-badge');
  if (badge) {
    badge.textContent = pendientes.length;
    badge.style.display = pendientes.length ? 'inline-flex' : 'none';
  }
  const lista = $('campana-lista');
  if (lista) {
    lista.innerHTML = pendientes.length === 0
      ? '<div style="padding:16px;text-align:center;color:var(--texto-muy-suave);font-size:13px;">Sin notificaciones nuevas</div>'
      : pendientes.map(n => `
        <div style="padding:10px 14px;border-bottom:1px solid var(--borde);cursor:pointer;font-size:12.5px;" onclick="marcarNotifLeidaYRefrescar('${n.id}')">
          ${n.mensaje}
        </div>`).join('');
  }
}

export async function marcarNotifLeidaYRefrescar(idLocal) {
  await marcarNotificacionLeida(idLocal);
  renderCampanaNotificaciones();
}

export function toggleCampanaDropdown() {
  const dd = $('campana-dropdown');
  if (dd) dd.classList.toggle('open');
}

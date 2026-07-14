// Reportes y Sugerencias v1.1 — buzón interno accesible a todos los
// perfiles logueados (incluido Asociado). Botón flotante + pantalla +
// modal, migrados desde legacy.js. El feedback loop con el perfil
// DEVELOPER (tickets, respuesta, tiempo real) vive en
// src/modules/developer/ — acá solo se escribe/lee `DB.sugerencias`.

import { DB, MENU, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const TIPO_LABEL = { problema: '🐛 Problema', sugerencia: '💡 Sugerencia', mejora: '✨ Mejora', otro: '📝 Otro' };
const ESTADO_BADGE = { Pendiente: 'badge-gris', 'En revisión': 'badge-acento', Resuelto: 'badge-verde', Cerrado: 'badge-gris' };
const MODULO_GENERAL = 'general';
const MODULO_GENERAL_LABEL = '🌐 General';

// El selector de módulo se arma de MENU (siempre en sync con el menú real,
// no hay lista hardcodeada que se pueda desactualizar): `modulo` guarda la
// key técnica (ej. 'clientes'), `moduloLabel` el texto para mostrar (ej.
// "🏢 Clientes") — mismo patrón código+nombre que el resto del proyecto
// (ej. objetivo.codigo/objetivo.nombre). "General" va primero para cuando
// el reporte no es de ningún módulo puntual.
const _labelPorModulo = { [MODULO_GENERAL]: MODULO_GENERAL_LABEL };

function opcionesModuloHTML() {
  const general = `<option value="${MODULO_GENERAL}">${MODULO_GENERAL_LABEL} (no es de un módulo específico)</option>`;
  const grupos = MENU
    .filter(sec => sec.section && sec.items.some(i => !i.disabled))
    .map(sec => {
      const opts = sec.items.filter(i => !i.disabled).map(i => {
        _labelPorModulo[i.key] = `${i.icon} ${i.label}`;
        return `<option value="${i.key}">${i.icon} ${i.label}</option>`;
      }).join('');
      return `<optgroup label="${sec.section}">${opts}</optgroup>`;
    }).join('');
  return general + grupos;
}

// ========== BOTÓN FLOTANTE ==========
// Arranca oculto (display:none) — antes se inyectaba siempre visible,
// incluso antes de loguearse. mostrarBotonReporte()/ocultarBotonReporte()
// se enganchan a los callbacks de login/logout en main.js.
let _botonReporte = null;
function ensureBotonReporte() {
  if (_botonReporte) return _botonReporte;
  const btn = document.createElement('button');
  btn.id = 'btn-reporte-flotante';
  btn.innerHTML = '💬';
  btn.title = 'Reportar problema o sugerencia';
  btn.setAttribute('onclick', 'abrirModalSugerencia()');
  btn.style.cssText = 'position:fixed!important;bottom:24px!important;right:24px!important;z-index:99999!important;width:52px!important;height:52px!important;border-radius:50%!important;border:none!important;cursor:pointer!important;background:#1e3a8a!important;color:white!important;font-size:22px!important;box-shadow:0 4px 12px rgba(0,0,0,0.3)!important;align-items:center!important;justify-content:center!important;';
  btn.style.setProperty('display', 'none', 'important');
  document.body.appendChild(btn);
  _botonReporte = btn;
  return btn;
}
export function mostrarBotonReporte() {
  ensureBotonReporte().style.setProperty('display', 'flex', 'important');
}
export function ocultarBotonReporte() {
  if (_botonReporte) _botonReporte.style.setProperty('display', 'none', 'important');
}

// ========== MODAL DE CARGA ==========
export function abrirModalSugerencia() {
  let overlay = $('modal-sugerencia');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-sugerencia';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3>💬 Reportar problema o sugerencia</h3>
          <button class="btn-close" onclick="cerrarModal('modal-sugerencia')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid form-grid-2" style="margin-bottom:12px;">
            <div>
              <label style="font-weight:600;font-size:13px;">Tipo</label>
              <select id="sugerencia-tipo" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;">
                <option value="problema">🐛 Problema / Bug</option>
                <option value="sugerencia">💡 Sugerencia</option>
                <option value="mejora">✨ Mejora</option>
                <option value="otro">📝 Otro</option>
              </select>
            </div>
            <div>
              <label style="font-weight:600;font-size:13px;">Módulo</label>
              <select id="sugerencia-modulo" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;">
                ${opcionesModuloHTML()}
              </select>
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-weight:600;font-size:13px;">Título</label>
            <input type="text" id="sugerencia-titulo" maxlength="80" placeholder="Un resumen corto (ej: 'No se puede editar un cliente')" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;">
          </div>
          <div style="margin-bottom:4px;">
            <label style="font-weight:600;font-size:13px;">Descripción</label>
            <textarea id="sugerencia-desc" rows="5" placeholder="Describí el problema o tu sugerencia con el mayor detalle posible..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;resize:vertical;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="cerrarModal('modal-sugerencia')">Cancelar</button>
          <button class="btn btn-primary" id="btn-enviar-sugerencia" onclick="enviarSugerencia()">Enviar</button>
        </div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrarModal('modal-sugerencia'); });
    document.body.appendChild(overlay);
  }
  const titulo = $('sugerencia-titulo'); if (titulo) titulo.value = '';
  const desc = $('sugerencia-desc'); if (desc) desc.value = '';
  const modulo = $('sugerencia-modulo'); if (modulo) modulo.value = MODULO_GENERAL;
  abrirModal('modal-sugerencia');
}

export async function enviarSugerencia() {
  const tipo = $('sugerencia-tipo')?.value || '';
  const modulo = $('sugerencia-modulo')?.value || MODULO_GENERAL;
  const titulo = $('sugerencia-titulo')?.value?.trim() || '';
  const desc = $('sugerencia-desc')?.value?.trim() || '';
  if (!titulo) { toast('Poné un título corto para el reporte'); return; }
  if (!desc) { toast('Escribí una descripción'); return; }
  const registro = {
    id: Date.now(),
    fecha: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    usuario: currentUser?.nombre || 'Desconocido',
    tipo,
    modulo,
    moduloLabel: _labelPorModulo[modulo] || MODULO_GENERAL_LABEL,
    titulo,
    descripcion: desc,
    estado: 'Pendiente',
    respuestaDev: '',
  };
  const btn = $('btn-enviar-sugerencia');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  const ok = await supaSync('sugerencias', registro);
  if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
  if (!ok) {
    toast('⚠️ No se pudo enviar — revisá tu conexión e intentá de nuevo.');
    return;
  }
  DB.sugerencias.push(registro);
  cerrarModal('modal-sugerencia');
  toast('✅ Recibido — el equipo de desarrollo lo va a aplicar y modificar de manera eficiente. ¡Gracias por tu colaboración!');
  renderSugerencias();
}

// ========== PANTALLA ==========
export function filtrarSugerencias() {
  renderSugerencias();
}

export function renderSugerencias() {
  const filtroEstado = ($('sug-filtro-estado') || {}).value || '';
  const lista = (DB.sugerencias || []).filter(s => !filtroEstado || s.estado === filtroEstado);
  const tbody = $('tbody-sugerencias');
  if (tbody) {
    tbody.innerHTML = lista.length === 0
      ? '<tr><td colspan="7" style="text-align:center;padding:32px;opacity:.5;">No hay reportes ni sugerencias registradas</td></tr>'
      : lista.slice().reverse().map(s => `<tr>
          <td>${s.fecha}</td>
          <td>${s.usuario}</td>
          <td><span class="chip" style="font-size:11px;">${s.moduloLabel || _labelPorModulo[s.modulo] || MODULO_GENERAL_LABEL}</span></td>
          <td>${TIPO_LABEL[s.tipo] || s.tipo}</td>
          <td style="max-width:340px;">
            <div style="font-weight:600;">${s.titulo || '(sin título)'}</div>
            <div style="white-space:pre-wrap;color:var(--texto-suave);font-size:12px;margin-top:2px;">${s.descripcion}</div>
          </td>
          <td><span class="badge ${ESTADO_BADGE[s.estado] || 'badge-gris'}">${s.estado}</span></td>
          <td style="max-width:260px;white-space:pre-wrap;color:var(--texto-suave);">${s.respuestaDev || '—'}</td>
        </tr>`).join('');
  }
  const base = DB.sugerencias || [];
  const t = $('st-sug-total'); if (t) t.textContent = base.length;
  const sg = $('st-sug-sugerencias'); if (sg) sg.textContent = base.filter(s => s.tipo === 'sugerencia').length;
  const pr = $('st-sug-problemas'); if (pr) pr.textContent = base.filter(s => s.tipo === 'problema').length;
  const mj = $('st-sug-mejoras'); if (mj) mj.textContent = base.filter(s => s.tipo === 'mejora').length;
}

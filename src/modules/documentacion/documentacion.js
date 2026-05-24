import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// Render del listado de documentación de ingreso (esqueleto)
export function renderDocum() {
  const tbody = $('tbody-docum');
  if (!tbody) return;
  const lista = (DB.documentacionIngreso || []).filter(d => !d.anulado && d.estado === 'En proceso');
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Sin registros en documentación de ingreso todavía.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(d =>
    '<tr>'
    + '<td>' + (d.nombre || '') + '</td>'
    + '<td>' + (d.dni || '') + '</td>'
    + '<td>' + (d.zona || '') + '</td>'
    + '<td>' + (d.antecResultado || 'Pendiente') + '</td>'
    + '<td>' + (d.libretaAplica ? '✓' : '—') + '</td>'
    + '<td>' + (d.cursoTiene ? '✓' : '—') + '</td>'
    + '<td>' + (d.estado || 'En proceso') + '</td>'
    + '<td><button onclick="abrirGestionDocum(' + d.id + ')" style="font-size:11px;padding:3px 10px;background:#7c3aed;color:white;border:none;border-radius:4px;cursor:pointer;">⚙️ Gestionar</button></td>'
    + '</tr>'
  ).join('');
}

// HTML del modal de gestión de documentación (3 requisitos)
function crearHTMLModalDocum() {
  return [
    '<div class="modal" style="max-width:560px;">',
      '<div class="modal-header" style="background:#7c3aed;color:white;">',
        '<h3 style="color:white;">📄 Documentación — <span id="docum-gest-nombre"></span></h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-docum-gestion\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<input type="hidden" id="docum-gest-id">',
        // ── Sección Antecedentes (obligatorio) ──
        '<h4 style="margin:0 0 8px;color:#1e3a8a;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">📋 Antecedentes penales (obligatorio)</h4>',
        '<div class="form-group"><label>Resultado *</label>',
          '<select id="dc-antec-resultado" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
            '<option>Pendiente</option><option>Sin antecedentes</option><option>Con antecedentes</option>',
          '</select></div>',
        '<div class="form-grid form-grid-2">',
          '<div class="form-group"><label>Fecha del certificado</label>',
            '<input type="date" id="dc-antec-fecha" onchange="recalcularVencAntec()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
          '<div class="form-group"><label>Vence (auto, +6 meses)</label>',
            '<input type="date" id="dc-antec-vencimiento" readonly style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#f8fafc;"></div>',
        '</div>',
        // ── Sección Libreta sanitaria (condicional) ──
        '<h4 style="margin:16px 0 8px;color:#1e3a8a;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">📗 Libreta sanitaria</h4>',
        '<div class="form-group"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;">',
          '<input type="checkbox" id="dc-libreta-aplica" onchange="toggleSeccionLibreta()"> ¿Requiere libreta sanitaria?</label></div>',
        '<div id="dc-libreta-campos" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Zona</label>',
              '<input type="text" id="dc-libreta-zona" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
            '<div class="form-group"><label>Vencimiento</label>',
              '<input type="date" id="dc-libreta-vencimiento" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
          '</div>',
        '</div>',
        // ── Sección Curso de manipulación (condicional) ──
        '<h4 style="margin:16px 0 8px;color:#1e3a8a;border-bottom:2px solid #e2e8f0;padding-bottom:4px;">🍽️ Curso de manipulación de alimentos</h4>',
        '<div class="form-group"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;">',
          '<input type="checkbox" id="dc-curso-tiene" onchange="toggleSeccionCurso()"> ¿Tiene el curso?</label></div>',
        '<div id="dc-curso-campos" style="display:none;">',
          '<div class="form-group"><label>Vencimiento</label>',
            '<input type="date" id="dc-curso-vencimiento" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '</div>',
        // ── Observaciones ──
        '<div class="form-group" style="margin-top:16px;"><label>Observaciones</label>',
          '<textarea id="dc-obs" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;"></textarea></div>',
      '</div>',
      '<div class="modal-footer" style="display:flex;justify-content:space-between;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-docum-gestion\')">Cerrar</button>',
        '<button class="btn btn-primary" onclick="guardarDocum()">💾 Guardar</button>',
      '</div>',
    '</div>',
  ].join('');
}

// Buscar un registro de documentación por id (nunca id_local — lección del proyecto)
const getDocumById = (id) => (DB.documentacionIngreso || []).find(d => Number(d.id) === Number(id));

// Calcular el vencimiento de antecedentes: fecha del certificado + 6 meses
export function recalcularVencAntec() {
  const fechaEl = $('dc-antec-fecha');
  const vencEl = $('dc-antec-vencimiento');
  if (!fechaEl || !vencEl) return;
  const f = fechaEl.value;
  if (!f) { vencEl.value = ''; return; }
  const d = new Date(f + 'T00:00:00');
  d.setMonth(d.getMonth() + 6);
  // Formato YYYY-MM-DD para el input date
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  vencEl.value = yyyy + '-' + mm + '-' + dd;
}

// Mostrar/ocultar los campos de Libreta según el checkbox
export function toggleSeccionLibreta() {
  const aplica = ($('dc-libreta-aplica') || {}).checked;
  const campos = $('dc-libreta-campos');
  if (campos) campos.style.display = aplica ? 'block' : 'none';
}

// Mostrar/ocultar los campos de Curso según el checkbox
export function toggleSeccionCurso() {
  const tiene = ($('dc-curso-tiene') || {}).checked;
  const campos = $('dc-curso-campos');
  if (campos) campos.style.display = tiene ? 'block' : 'none';
}

// Abrir el modal de gestión, precargando el registro por id
export function abrirGestionDocum(id) {
  const d = getDocumById(id);
  if (!d) return;
  if (!$('docum-gest-id')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-docum-gestion';
    m.innerHTML = crearHTMLModalDocum();
    document.body.appendChild(m);
  }
  $('docum-gest-id').value = d.id;
  $('docum-gest-nombre').textContent = d.nombre || '';
  $('dc-antec-resultado').value = d.antecResultado || 'Pendiente';
  $('dc-antec-fecha').value = d.antecFecha || '';
  $('dc-antec-vencimiento').value = d.antecVencimiento || '';
  $('dc-libreta-aplica').checked = !!d.libretaAplica;
  $('dc-libreta-zona').value = d.libretaZona || '';
  $('dc-libreta-vencimiento').value = d.libretaVencimiento || '';
  $('dc-curso-tiene').checked = !!d.cursoTiene;
  $('dc-curso-vencimiento').value = d.cursoVencimiento || '';
  $('dc-obs').value = d.obs || '';
  toggleSeccionLibreta();
  toggleSeccionCurso();
  $('modal-docum-gestion').classList.add('open');
}

// Guardar la documentación (lee los 3 requisitos, persiste por id)
export function guardarDocum() {
  const id = parseInt($('docum-gest-id').value);
  const d = getDocumById(id);
  if (!d) return;
  // Antecedentes
  d.antecResultado = ($('dc-antec-resultado') || {}).value || 'Pendiente';
  d.antecFecha = ($('dc-antec-fecha') || {}).value || '';
  d.antecVencimiento = ($('dc-antec-vencimiento') || {}).value || '';
  // Libreta (solo si aplica; si no, se limpian)
  d.libretaAplica = ($('dc-libreta-aplica') || {}).checked || false;
  d.libretaZona = d.libretaAplica ? (($('dc-libreta-zona') || {}).value || '') : '';
  d.libretaVencimiento = d.libretaAplica ? (($('dc-libreta-vencimiento') || {}).value || '') : '';
  // Curso (solo si tiene; si no, se limpia)
  d.cursoTiene = ($('dc-curso-tiene') || {}).checked || false;
  d.cursoVencimiento = d.cursoTiene ? (($('dc-curso-vencimiento') || {}).value || '') : '';
  // Observaciones
  d.obs = ($('dc-obs') || {}).value || '';
  supaSync('documentacionIngreso', d);
  cerrarModal('modal-docum-gestion');
  renderDocum();
  toast('💾 Documentación guardada');
}

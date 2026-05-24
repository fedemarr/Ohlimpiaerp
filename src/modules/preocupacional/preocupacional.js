import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// Render del listado de pre-ocupacionales (esqueleto: tabla simple)
export function renderPreocup() {
  const tbody = $('tbody-preocup');
  if (!tbody) return;
  const lista = (DB.preocupacionales || []).filter(p => !p.anulado);
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Sin registros en pre-ocupacional todavía.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(p =>
    '<tr>'
    + '<td>' + (p.nombre || '') + '</td>'
    + '<td>' + (p.dni || '') + '</td>'
    + '<td>' + (p.zona || '') + '</td>'
    + '<td>' + (p.fechaTurno || '—') + '</td>'
    + '<td>' + (p.prestador || '—') + '</td>'
    + '<td>' + (p.resultado || 'Pendiente') + '</td>'
    + '<td>' + (p.estado || 'En proceso') + '</td>'
    + '<td><button onclick="abrirGestionPreocup(' + p.id + ')" style="font-size:11px;padding:3px 10px;background:#0891b2;color:white;border:none;border-radius:4px;cursor:pointer;">⚙️ Gestionar</button></td>'
    + '</tr>'
  ).join('');
}

// HTML del modal de gestión del pre-ocupacional (dinámico, se crea una vez)
function crearHTMLModalPreocup() {
  return [
    '<div class="modal" style="max-width:520px;">',
      '<div class="modal-header" style="background:#0891b2;color:white;">',
        '<h3 style="color:white;">🏥 Pre-ocupacional — <span id="preocup-gest-nombre"></span></h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-preocup-gestion\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<input type="hidden" id="preocup-gest-id">',
        '<div class="form-grid form-grid-2">',
          '<div class="form-group"><label>Prestador</label>',
            '<select id="pr-prestador" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
              '<option value="">—</option><option>MEDE</option><option>Grupo CMC</option><option>IDT</option>',
            '</select></div>',
          '<div class="form-group"><label>Fecha de turno</label>',
            '<input type="date" id="pr-fecha-turno" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
        '</div>',
        '<div class="form-group"><label>Resultado *</label>',
          '<select id="pr-resultado" onchange="actualizarMotivoPreocup()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
            '<option>Pendiente</option><option>APTO</option><option>APTO B</option><option>APTO C</option><option>APTO PENDIENTE</option><option>NO APTO</option>',
          '</select></div>',
        '<div id="pr-motivo-row" class="form-group" style="display:none;margin-top:8px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px;">',
          '<label style="color:#991b1b;font-weight:600;">⚠️ Motivo / observaciones del NO APTO *</label>',
          '<textarea id="pr-motivo" rows="2" style="width:100%;padding:8px;border:1px solid #fca5a5;border-radius:6px;font-size:13px;resize:vertical;margin-top:4px;" placeholder="Detallá el motivo (obligatorio para NO APTO)"></textarea>',
        '</div>',
        '<div class="form-group" style="margin-top:8px;"><label>Observaciones</label>',
          '<textarea id="pr-obs" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;"></textarea></div>',
      '</div>',
      '<div class="modal-footer" style="display:flex;justify-content:space-between;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-preocup-gestion\')">Cerrar</button>',
        '<button class="btn btn-primary" onclick="guardarPreocup()">💾 Guardar</button>',
      '</div>',
    '</div>',
  ].join('');
}

// Buscar un pre-ocupacional por id (no por índice — práctica correcta)
const getPreocupById = (id) => (DB.preocupacionales || []).find(p => Number(p.id) === Number(id));

// Mostrar/ocultar el textarea de motivo según el resultado
export function actualizarMotivoPreocup() {
  const res = ($('pr-resultado') || {}).value || '';
  const row = $('pr-motivo-row');
  if (row) row.style.display = (res === 'NO APTO') ? 'block' : 'none';
}

// Abrir el modal de gestión, precargando el registro por id
export function abrirGestionPreocup(id) {
  const p = getPreocupById(id);
  if (!p) return;
  // Crear el modal la primera vez (patrón dinámico, como el psicotécnico)
  if (!$('preocup-gest-id')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-preocup-gestion';
    m.innerHTML = crearHTMLModalPreocup();
    document.body.appendChild(m);
  }
  $('preocup-gest-id').value = p.id;
  $('preocup-gest-nombre').textContent = p.nombre || '';
  $('pr-prestador').value = p.prestador || '';
  $('pr-fecha-turno').value = p.fechaTurno || '';
  $('pr-resultado').value = p.resultado || 'Pendiente';
  $('pr-obs').value = p.obs || '';
  const moEl = $('pr-motivo');
  if (moEl) moEl.value = p.motivo || '';
  actualizarMotivoPreocup();
  $('modal-preocup-gestion').classList.add('open');
}

// Guardar el pre-ocupacional (lee campos, valida, persiste por id)
export function guardarPreocup() {
  const id = parseInt($('preocup-gest-id').value);
  const p = getPreocupById(id);
  if (!p) return;
  const resultado = ($('pr-resultado') || {}).value || 'Pendiente';
  // Motivo obligatorio si el resultado es NO APTO
  if (resultado === 'NO APTO') {
    const motivo = ($('pr-motivo') || {}).value || '';
    if (!motivo.trim()) {
      toast('⚠️ El motivo es obligatorio cuando el resultado es NO APTO');
      const mo = $('pr-motivo'); if (mo) mo.focus();
      return;
    }
    p.motivo = motivo.trim();
  }
  p.prestador = ($('pr-prestador') || {}).value || '';
  p.fechaTurno = ($('pr-fecha-turno') || {}).value || '';
  p.resultado = resultado;
  p.obs = ($('pr-obs') || {}).value || '';
  supaSync('preocupacionales', p);
  cerrarModal('modal-preocup-gestion');
  renderPreocup();
  toast('💾 Pre-ocupacional guardado');
}

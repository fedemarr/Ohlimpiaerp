import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { subirAdjunto, listarAdjuntos, obtenerUrlFirmada, borrarAdjunto } from '@shared/adjuntos.js';

let _preocupTab = 'activos';

// Cambiar de pestaña (En proceso / Histórico)
export function tabPreocup(tab) {
  _preocupTab = tab;
  const btnA = $('tab-preocup-activos');
  const btnH = $('tab-preocup-historico');
  if (btnA) { btnA.style.background = tab === 'activos' ? '#1e3a8a' : '#f1f5f9'; btnA.style.color = tab === 'activos' ? 'white' : '#64748b'; }
  if (btnH) { btnH.style.background = tab === 'historico' ? '#1e3a8a' : '#f1f5f9'; btnH.style.color = tab === 'historico' ? 'white' : '#64748b'; }
  renderPreocup();
}

// Render del listado de pre-ocupacionales (pestañas activos/histórico + indicadores)
export function renderPreocup() {
  const tbody = $('tbody-preocup');
  if (!tbody) return;
  const todos = (DB.preocupacionales || []).filter(p => !p.anulado);
  const activos = todos.filter(p => p.estado === 'En proceso');
  const historico = todos.filter(p => p.estado !== 'En proceso');

  // Indicadores
  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-pr-proceso', activos.length);
  ss('st-pr-aprobados', todos.filter(p => p.estado === 'Aprobado').length);
  ss('st-pr-rechazados', todos.filter(p => p.estado === 'Rechazado').length);

  const lista = _preocupTab === 'historico' ? historico : activos;
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">'
      + (_preocupTab === 'historico' ? 'Sin registros en histórico' : 'Sin candidatos en proceso')
      + '</td></tr>';
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
    + '<td>' + (p.estado === 'En proceso'
        ? '<button onclick="abrirGestionPreocup(\'' + p.id + '\')" style="font-size:11px;padding:3px 10px;background:#0891b2;color:white;border:none;border-radius:4px;cursor:pointer;">⚙️ Gestionar</button>'
        : (() => {
            const tieneDocVivo = (DB.documentacionIngreso || []).some(d =>
              p.dni && d.dni === p.dni &&
              (d.estado === 'En proceso' || d.estado === 'Aprobado') &&
              !d.anulado
            );
            return tieneDocVivo
              ? '<span style="font-size:11px;color:#94a3b8;">Cerrado</span>'
              : '<button onclick="revertirPreocup(\'' + p.id + '\')" style="font-size:11px;padding:3px 10px;background:#f59e0b;color:white;border:none;border-radius:4px;cursor:pointer;">↩️ Revertir</button>';
          })())
    + '</td>'
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
        '<div id="pr-adjunto-box" style="margin-top:12px;border:1px dashed #67e8f9;border-radius:8px;padding:12px;background:#ecfeff;">',
          '<label id="pr-adjunto-label" style="font-weight:600;color:#0e7490;">🏥 Apto médico</label>',
          '<div id="pr-adjunto-aviso" style="display:none;margin-top:8px;padding:8px 10px;border-radius:6px;font-size:12px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;"></div>',
          '<div id="pr-adjunto-lista" style="margin-top:8px;font-size:13px;color:#64748b;">Cargando…</div>',
          '<input type="file" id="pr-adjunto-file" accept="application/pdf,image/jpeg,image/png" style="display:none;" onchange="seleccionarArchivoPreocup()">',
          '<button type="button" class="btn btn-secondary" style="margin-top:8px;" onclick="document.getElementById(\'pr-adjunto-file\').click()">⬆️ Subir archivo</button>',
        '</div>',
      '</div>',
      '<div class="modal-footer" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-preocup-gestion\')">Cerrar</button>',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
          '<button class="btn btn-primary" onclick="guardarPreocup()">💾 Guardar</button>',
          '<button id="btn-aprobar-preocup" class="btn" style="background:#16a34a;color:white;display:none;" onclick="aprobarPreocup()">✅ Aprobar → Alta</button>',
          '<button id="btn-baja-preocup" class="btn" style="background:#dc2626;color:white;display:none;" onclick="bajaPreocup()">⛔ Dar de baja</button>',
        '</div>',
      '</div>',
    '</div>',
  ].join('');
}

// Buscar un pre-ocupacional por id (no por índice — práctica correcta)
const getPreocupById = (id) => (DB.preocupacionales || []).find(p => String(p.id) === String(id));

// Mostrar/ocultar el textarea de motivo según el resultado
export function actualizarMotivoPreocup() {
  const res = ($('pr-resultado') || {}).value || '';
  const avanza = ['APTO', 'APTO B', 'APTO C'].includes(res);
  const baja = res === 'NO APTO';
  const row = $('pr-motivo-row');
  if (row) row.style.display = baja ? 'block' : 'none';
  const btnAp = $('btn-aprobar-preocup');
  if (btnAp) btnAp.style.display = avanza ? 'inline-flex' : 'none';
  const btnBaja = $('btn-baja-preocup');
  if (btnBaja) btnBaja.style.display = baja ? 'inline-flex' : 'none';
  actualizarLabelYAvisoPreocup();
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
  cargarAdjuntoPreocup(p.dni);
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
  p.fechaTurno = ($('pr-fecha-turno') || {}).value || null;
  p.resultado = resultado;
  p.obs = ($('pr-obs') || {}).value || '';
  supaSync('preocupacionales', p);
  cerrarModal('modal-preocup-gestion');
  renderPreocup();
  toast('💾 Pre-ocupacional guardado');
}

// Aprobar: el pre-ocupacional avanza a Documentación de ingreso (APTO / APTO B / APTO C)
export async function aprobarPreocup() {
  const id = parseInt($('preocup-gest-id').value);
  const p = getPreocupById(id);
  if (!p) return;
  // El apto médico es obligatorio para aprobar (APTO / APTO B / APTO C).
  const aptos = await listarAdjuntos({ dni: p.dni, etapa: 'preocupacional', tipo: 'apto-medico' });
  if (!aptos.length) {
    toast('⚠️ Adjuntá el apto médico antes de aprobar');
    return;
  }
  // Setear los campos inline (sin cerrar el modal, a diferencia de guardarPreocup)
  p.prestador = ($('pr-prestador') || {}).value || '';
  p.fechaTurno = ($('pr-fecha-turno') || {}).value || null;
  p.resultado = ($('pr-resultado') || {}).value || 'Pendiente';
  p.obs = ($('pr-obs') || {}).value || '';
  p.estado = 'Aprobado';
  p.fechaAprobacion = new Date().toLocaleDateString('es-AR');
  supaSync('preocupacionales', p);
  // Crear el registro en Documentación de ingreso (el candidato pasa a documentación, no directo al Alta).
  // Guard de idempotencia: no crear una 2ª documentación si ya hay una viva para este DNI.
  const documVivoExistente = (DB.documentacionIngreso || []).some(d =>
    p.dni && d.dni === p.dni &&
    (d.estado === 'En proceso' || d.estado === 'Aprobado') &&
    !d.anulado
  );
  if (documVivoExistente) {
    toast('ℹ️ Ya existe una documentación de ingreso vigente para este candidato. No se creó una nueva.');
  } else {
    const docum = {
      id: Date.now(), psicoId: p.psicoId, candidatoId: p.candidatoId,
      nombre: p.nombre, dni: p.dni, zona: p.zona, tel: p.tel, rrhh: p.rrhh || '',
      antecResultado: 'Pendiente', estado: 'En proceso',
    };
    if (!DB.documentacionIngreso) DB.documentacionIngreso = [];
    DB.documentacionIngreso.push(docum);
    supaSync('documentacionIngreso', docum);
    toast('✅ ' + p.nombre + ' aprobado — enviado a Documentación de ingreso');
  }
  cerrarModal('modal-preocup-gestion');
  renderPreocup();
}

// Baja: NO APTO da de baja al candidato (molde de rechazarPsico)
export function bajaPreocup() {
  const id = parseInt($('preocup-gest-id').value);
  const p = getPreocupById(id);
  if (!p) return;
  const motivo = ($('pr-motivo') || {}).value || '';
  if (!motivo.trim()) {
    toast('⚠️ El motivo es obligatorio para dar de baja');
    const mo = $('pr-motivo'); if (mo) mo.focus();
    return;
  }
  p.prestador = ($('pr-prestador') || {}).value || '';
  p.fechaTurno = ($('pr-fecha-turno') || {}).value || null;
  p.resultado = 'NO APTO';
  p.motivo = motivo.trim();
  p.estado = 'Rechazado';
  p.fechaRechazo = new Date().toLocaleDateString('es-AR');
  supaSync('preocupacionales', p);
  // Dar de baja al candidato (molde de rechazarPsico)
  const cand = (DB.candidatos || []).find(c => p.dni && c.dni === p.dni);
  if (cand) {
    cand.estado = 'Rechazado';
    cand.motivoRechazo = 'Rechazado en Pre-ocupacional: ' + motivo.trim();
    supaSync('candidatos', cand);
  }
  cerrarModal('modal-preocup-gestion');
  renderPreocup();
  toast('⛔ ' + p.nombre + ' dado de baja');
}

// ========== ADJUNTOS (apto médico / constancia no apto) ==========

// Cache de los adjuntos del registro abierto, para recalcular el aviso
// visual cuando cambia el resultado sin volver a consultar la DB.
let _preocupAdjuntos = [];

// Tipo de adjunto según el resultado al momento de subir:
// NO APTO → constancia 'no-apto'; cualquier otro → 'apto-medico' (default permisivo).
function tipoEsperadoPreocup(res) {
  return res === 'NO APTO' ? 'no-apto' : 'apto-medico';
}

// Texto del label dinámico de la caja de adjuntos.
function labelTextPreocup(res) {
  if (['APTO', 'APTO B', 'APTO C'].includes(res)) return '🏥 Apto médico (obligatorio para aprobar)';
  if (res === 'NO APTO') return '📄 Constancia NO APTO (opcional)';
  return '🏥 Apto médico (opcional)';
}

// Actualiza el label dinámico y muestra el aviso visual si el archivo
// vigente no coincide con el resultado seleccionado (solo informativo).
function actualizarLabelYAvisoPreocup() {
  const res = ($('pr-resultado') || {}).value || '';
  const lab = $('pr-adjunto-label');
  if (lab) lab.textContent = labelTextPreocup(res);
  const aviso = $('pr-adjunto-aviso');
  if (!aviso) return;
  const esperado = tipoEsperadoPreocup(res);
  const hayMismatch = _preocupAdjuntos.some(a => a.tipo !== esperado);
  if (hayMismatch && res && res !== 'Pendiente') {
    aviso.style.display = 'block';
    aviso.textContent = '⚠️ El archivo cargado no coincide con el resultado actual. Revisá el adjunto.';
  } else {
    aviso.style.display = 'none';
  }
}

export async function cargarAdjuntoPreocup(dni) {
  const cont = $('pr-adjunto-lista');
  if (!cont) return;
  cont.innerHTML = 'Cargando…';
  _preocupAdjuntos = await listarAdjuntos({ dni, etapa: 'preocupacional' });
  if (!_preocupAdjuntos.length) {
    cont.innerHTML = '<span style="color:#94a3b8;">Sin archivo cargado</span>';
  } else {
    cont.innerHTML = _preocupAdjuntos.map(a =>
      '<div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;margin-top:4px;">'
      + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ' + (a.nombreArchivo || 'Archivo') + '</span>'
      + '<button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="verAdjuntoPreocup(\'' + a.url + '\')">👁️ Ver</button>'
      + '<button type="button" class="btn" style="background:#dc2626;color:white;padding:4px 8px;font-size:12px;" onclick="eliminarAdjuntoPreocup(\'' + a.id + '\',\'' + dni + '\')">🗑️</button>'
      + '</div>'
    ).join('');
  }
  actualizarLabelYAvisoPreocup();
}

export async function seleccionarArchivoPreocup() {
  const input = $('pr-adjunto-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const id = $('preocup-gest-id').value;
  const p = getPreocupById(id);
  if (!p) { toast('⚠️ No se encontró el registro'); return; }
  const res = ($('pr-resultado') || {}).value || '';
  const tipo = tipoEsperadoPreocup(res);
  const cont = $('pr-adjunto-lista');
  if (cont) cont.innerHTML = 'Subiendo…';
  try {
    await subirAdjunto({ dni: p.dni, etapa: 'preocupacional', tipo, file });
    toast('📎 Archivo subido');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Error al subir el archivo'));
  } finally {
    if (input) input.value = '';
  }
  cargarAdjuntoPreocup(p.dni);
}

export async function verAdjuntoPreocup(path) {
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

export async function eliminarAdjuntoPreocup(id, dni) {
  if (!confirm('¿Eliminar este archivo?')) return;
  const ok = await borrarAdjunto(id);
  toast(ok ? '🗑️ Archivo eliminado' : '⚠️ No se pudo eliminar');
  cargarAdjuntoPreocup(dni);
}

// Revertir un registro Aprobado/Rechazado: vuelve a "En proceso".
// Bloquea si ya existe documentación viva (En proceso o Aprobado).
// Si era rechazo, restaura el candidato a 'Psicotecnico'.
export function revertirPreocup(id) {
  const p = (DB.preocupacionales || []).find(x => String(x.id) === String(id));
  if (!p) return;

  // 1. Verificar si existe documentación viva
  const docVivo = (DB.documentacionIngreso || []).find(d =>
    p.dni && d.dni === p.dni &&
    (d.estado === 'En proceso' || d.estado === 'Aprobado') &&
    !d.anulado
  );
  if (docVivo) {
    toast('⛔ No se puede revertir: ' + p.nombre + ' ya avanzó a Documentación de ingreso. Revertí primero allá.', 5000);
    return;
  }

  // 2. Confirmación obligatoria
  const eraRechazo = p.estado === 'Rechazado';
  const msg = eraRechazo
    ? '¿Querés revertir el rechazo de ' + p.nombre + '?\n\nVa a volver a "En proceso" y el candidato dejará de estar marcado como "Rechazado".'
    : '¿Querés revertir la aprobación de ' + p.nombre + '?\n\nVa a volver a "En proceso".';
  if (!confirm(msg)) return;

  // 3. Restaurar candidato si era rechazo
  if (eraRechazo) {
    const cand = (DB.candidatos || []).find(c => p.dni && c.dni === p.dni);
    if (cand) {
      cand.estado = 'Psicotecnico';
      cand.motivoRechazo = '';
      supaSync('candidatos', cand);
    }
  }

  // 4. Limpiar campos de resolución y volver a "En proceso"
  p.estado = 'En proceso';
  p.fechaAprobacion = null;
  p.fechaRechazo = null;
  p.resultado = 'Pendiente';
  p.motivo = '';
  supaSync('preocupacionales', p);

  toast('↩️ ' + p.nombre + ' volvió a "En proceso".');
  renderPreocup();
}

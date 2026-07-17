import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { subirAdjunto, listarAdjuntos, obtenerUrlFirmada, borrarAdjunto } from '@shared/adjuntos.js';
import { analizarDocumentoPDF, chequearIdentidadIA } from '@shared/iaDocumentos.js';

// ========== ESTADO INTERNO ==========

let _psicoTab = 'activos';

// ========== HELPERS ==========

// Buscar un psicotécnico por id (no por índice — práctica correcta, consistente con preocup/docum)
const getPsicoById = (id) => (DB.psicos || []).find(p => String(p.id) === String(id));

// ========== TABS ==========

export function tabPsico(tab) {
  _psicoTab = tab;
  const btnA = $('tab-psico-activos');
  const btnH = $('tab-psico-historico');
  if (btnA) { btnA.style.background = tab === 'activos' ? '#1e3a8a' : '#f1f5f9'; btnA.style.color = tab === 'activos' ? 'white' : '#64748b'; }
  if (btnH) { btnH.style.background = tab === 'historico' ? '#1e3a8a' : '#f1f5f9'; btnH.style.color = tab === 'historico' ? 'white' : '#64748b'; }
  renderPsico();
}

// ========== RENDER ==========

function icon(val, requerida) {
  if (!requerida) return '<span style="color:#cbd5e1;font-size:12px;">—</span>';
  // Resultados del psicotécnico (5 niveles)
  if (val === 'Apto+')            return '<span style="color:#15803d;font-size:16px;" title="Apto+">⭐</span>';
  if (val === 'Apto')             return '<span style="color:#16a34a;font-size:16px;" title="Apto">✅</span>';
  if (val === 'Apto-')            return '<span style="color:#ca8a04;font-size:16px;" title="Apto-">✔️</span>';
  if (val === 'Apto condicional') return '<span style="color:#d97706;font-size:16px;" title="Apto condicional (en revisión)">⚠️</span>';
  if (val === 'No Apto')          return '<span style="color:#dc2626;font-size:16px;" title="No Apto">❌</span>';
  // Resultados de las otras etapas (prelaboral, antecedentes, libreta)
  if (val === 'Aprobado') return '<span style="color:#16a34a;font-size:16px;">✅</span>';
  if (val === 'Rechazado') return '<span style="color:#dc2626;font-size:16px;">❌</span>';
  return '<span style="color:#d97706;font-size:16px;">⏳</span>';
}

export function renderPsico(lista) {
  const todos = DB.psicos || [];
  const activos = todos.filter(p => p.estado === 'En proceso');
  const historico = todos.filter(p => p.estado !== 'En proceso');

  // Si recibe lista filtrada, usarla; si no, usar tab activo
  const listaFinal = lista || (_psicoTab === 'historico' ? historico : activos);

  // Stats
  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-ps-proceso', activos.filter(p => p.estado === 'En proceso').length);
  ss('st-ps-aprobados', todos.filter(p => p.estado === 'Aprobado').length);
  ss('st-ps-rechazados', todos.filter(p => p.estado === 'Rechazado').length);

  const tbody = $('tbody-psico');
  if (!tbody) return;

  if (!listaFinal.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8;">'
      + (_psicoTab === 'historico' ? 'Sin registros en histórico' : 'Sin candidatos en proceso')
      + '</td></tr>';
    return;
  }

  tbody.innerHTML = listaFinal.map(p => {
    const ec = p.estado === 'Aprobado' ? '#16a34a' : p.estado === 'Rechazado' ? '#dc2626' : '#d97706';
    return '<tr style="border-bottom:1px solid #e2e8f0;">'
      + '<td style="padding:8px 12px;font-size:13px;"><strong>' + p.nombre + '</strong></td>'
      + '<td style="padding:8px;font-size:12px;color:#64748b;">' + (p.dni || '—') + '</td>'
      + '<td style="padding:8px;font-size:12px;">' + (p.zona || '—') + '</td>'
      + '<td style="padding:8px;text-align:center;">' + icon(p.psicotecnico, true) + '</td>'
      + '<td style="padding:8px;text-align:center;font-size:11px;font-weight:600;color:' + ec + '">' + p.estado + '</td>'
      + '<td style="padding:8px;text-align:center;">'
        + (p.estado === 'En proceso'
          ? '<button onclick="abrirGestionPsico(\'' + p.id + '\')" style="font-size:11px;padding:3px 10px;background:#7c3aed;color:white;border:none;border-radius:4px;cursor:pointer;">⚙️ Gestionar</button>'
          : (() => {
              const preocupVivo = (DB.preocupacionales || []).some(x =>
                p.dni && x.dni === p.dni &&
                (x.estado === 'En proceso' || x.estado === 'Aprobado') &&
                !x.anulado
              );
              const motivoHtml = p.motivoRechazo
                ? '<div style="font-size:10px;color:#94a3b8;margin-bottom:3px;">Motivo: ' + p.motivoRechazo + '</div>'
                : '';
              return preocupVivo
                ? '<span style="font-size:11px;color:#94a3b8;font-style:italic;">' + (p.motivoRechazo ? 'Motivo: ' + p.motivoRechazo : 'Cerrado') + '</span>'
                : motivoHtml + '<button onclick="revertirPsico(\'' + p.id + '\')" style="font-size:11px;padding:3px 10px;background:#f59e0b;color:white;border:none;border-radius:4px;cursor:pointer;">↩️ Revertir</button>';
            })())
      + '</td>'
      + '</tr>';
  }).join('');
}

// ========== FILTROS ==========

export function filtrarPsico() {
  const buscar = (($('psico-buscar') || { value: '' }).value || (($('buscador-global') || { value: '' }).value)).toLowerCase();
  const zona = ($('psico-filtro-zona') || { value: '' }).value;
  const estado = ($('psico-filtro-estado') || { value: '' }).value;

  renderPsico(DB.psicos.filter(p =>
    (!buscar || (p.nombre || '').toLowerCase().includes(buscar) || (p.dni || '').includes(buscar)) &&
    (!zona || p.zona === zona) &&
    (!estado || p.estado === estado)
  ));
}

export function poblarFiltrosColumnasPsico() {
  const el = $('psico-filtro-zona');
  if (!el) return;
  const ph = el.options[0]?.outerHTML || '<option value="">Todas las zonas</option>';
  el.innerHTML = ph + [...new Set(DB.zonas)].filter(Boolean).map(z => `<option>${z}</option>`).join('');
}

// ========== CRUD LEGACY ==========

export function guardarPsico() {
  const n = $('ps-nombre').value.trim();
  if (!n) { toast('Ingresá el nombre'); return; }
  DB.psicos.push({
    id: Date.now(),
    nombre: n,
    dni: $('ps-dni').value,
    zona: $('ps-zona').value,
    rrhh: $('ps-rrhh').value,
    resultado: $('ps-resultado').value,
    preocup: $('ps-preocup').value,
    estado: $('ps-estado').value,
    fecha: new Date().toLocaleDateString('es-AR'),
    obs: $('ps-obs').value,
  });
  cerrarModal('modal-psico');
  renderPsico();
  supaSync('psicos', DB.psicos[DB.psicos.length - 1]);
  toast('✓ Evaluación registrada');
}

// ========== GESTION DE ETAPAS ==========

export function abrirGestionPsico(id) {
  const p = getPsicoById(id); if (!p) return;

  // Crear modal dinámicamente si no existe
  if (!$('psico-gest-idx')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-psico-gestion';
    m.innerHTML = crearHTMLModalPsico();
    document.body.appendChild(m);
  }

  $('psico-gest-idx').value = p.id;
  $('psico-gest-nombre').textContent = p.nombre;
  $('pg-psicotecnico').value = p.psicotecnico || 'Pendiente';
  $('pg-obs').value = p.obs || '';
  const moEl = $('pg-motivo-noapto');
  if (moEl) moEl.value = p.motivoRechazo || '';
  $('pg-aviso').style.display = 'none';

  // Resetear el panel de análisis de IA — si no, queda mostrando el
  // resultado del último candidato analizado en esta sesión del
  // navegador (el panel es un único elemento reutilizado para todos).
  _iaPsicoResultado = null;
  const iaPanel = $('pg-ia-resultado');
  if (iaPanel) { iaPanel.style.display = 'none'; iaPanel.innerHTML = ''; }
  const btnIa = $('btn-ia-psico');
  if (btnIa) { btnIa.disabled = false; btnIa.textContent = '🤖 Analizar con IA'; }

  actualizarBotonesAprobacion();
  $('modal-psico-gestion').classList.add('open');
  cargarAdjuntoPsico(p.dni);
}

function crearHTMLModalPsico() {
  return [
    '<div class="modal" style="max-width:560px;">',
      '<div class="modal-header" style="background:#7c3aed;color:white;">',
        '<h3 style="color:white;">🧠 Etapas — <span id="psico-gest-nombre"></span></h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-psico-gestion\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<input type="hidden" id="psico-gest-idx">',
        '<div class="form-grid form-grid-2">',
          '<div class="form-group"><label>🧠 Psicotécnico *</label>',
            '<select id="pg-psicotecnico" onchange="actualizarBotonesAprobacion()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
              '<option>Pendiente</option><option>Apto</option><option>Apto+</option><option>Apto-</option><option>Apto condicional</option><option>No Apto</option>',
            '</select></div>',
        '</div>',
        '<div id="pg-motivo-noapto-row" class="form-group" style="display:none;margin-top:8px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px;">',
          '<label style="color:#991b1b;font-weight:600;">⚠️ Motivo / observaciones del No Apto *</label>',
          '<textarea id="pg-motivo-noapto" rows="2" style="width:100%;padding:8px;border:1px solid #fca5a5;border-radius:6px;font-size:13px;resize:vertical;margin-top:4px;" placeholder="Detallá el motivo (obligatorio para No Apto)"></textarea>',
        '</div>',
        '<div class="form-group" style="margin-top:12px;"><label>Observaciones</label>',
          '<textarea id="pg-obs" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;"></textarea></div>',
        '<div id="pg-aviso" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:8px;"></div>',
        '<div id="pg-adjunto-box" style="margin-top:12px;border:1px dashed #c4b5fd;border-radius:8px;padding:12px;background:#faf5ff;">',
          '<label style="font-weight:600;color:#6d28d9;">📎 Informe psicotécnico (opcional)</label>',
          '<div id="pg-adjunto-lista" style="margin-top:8px;font-size:13px;color:#64748b;">Cargando…</div>',
          '<input type="file" id="pg-adjunto-file" accept="application/pdf,image/jpeg,image/png" style="display:none;" onchange="seleccionarArchivoPsico()">',
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">',
            '<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'pg-adjunto-file\').click()">⬆️ Subir archivo</button>',
            '<button type="button" id="btn-ia-psico" class="btn" style="background:#7c3aed;color:white;" onclick="analizarInformePsicoIA()">🤖 Analizar con IA</button>',
          '</div>',
          '<div id="pg-ia-resultado" style="display:none;margin-top:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:10px;font-size:12px;"></div>',
        '</div>',
      '</div>',
      '<div class="modal-footer" style="flex-wrap:wrap;gap:8px;justify-content:space-between;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-psico-gestion\')">Cerrar panel</button>',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
        '<button class="btn btn-primary" onclick="guardarEtapasPsico()">💾 Guardar etapas</button>',
        '<button id="btn-aprobar-psico" class="btn" style="background:#16a34a;color:white;display:none;" onclick="aprobarPsico()">✅ Aprobar → Pre-ocupacional</button>',
        '<button class="btn" style="background:#dc2626;color:white;" onclick="rechazarPsico()">❌ Rechazar</button>',
      '</div>',
    '</div>',
  ].join('');
}

// ========== ADJUNTOS (informe psicotécnico — opcional) ==========

export async function cargarAdjuntoPsico(dni) {
  const cont = $('pg-adjunto-lista');
  if (!cont) return;
  cont.innerHTML = 'Cargando…';
  const lista = await listarAdjuntos({ dni, etapa: 'psicotecnico', tipo: 'informe-psico' });
  if (!lista.length) {
    cont.innerHTML = '<span style="color:#94a3b8;">Sin archivo cargado</span>';
    return;
  }
  cont.innerHTML = lista.map(a =>
    '<div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">'
    + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ' + (a.nombreArchivo || 'Archivo') + '</span>'
    + '<button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="verAdjuntoPsico(\'' + a.url + '\')">👁️ Ver</button>'
    + '<button type="button" class="btn" style="background:#dc2626;color:white;padding:4px 8px;font-size:12px;" onclick="eliminarAdjuntoPsico(\'' + a.id + '\',\'' + dni + '\')">🗑️</button>'
    + '</div>'
  ).join('');
}

export async function seleccionarArchivoPsico() {
  const input = $('pg-adjunto-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const id = $('psico-gest-idx').value;
  const p = getPsicoById(id);
  if (!p) { toast('⚠️ No se encontró el registro'); return; }
  const cont = $('pg-adjunto-lista');
  if (cont) cont.innerHTML = 'Subiendo…';
  try {
    await subirAdjunto({ dni: p.dni, etapa: 'psicotecnico', tipo: 'informe-psico', file });
    toast('📎 Archivo subido');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Error al subir el archivo'));
  } finally {
    if (input) input.value = '';
  }
  cargarAdjuntoPsico(p.dni);
}

export async function verAdjuntoPsico(path) {
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

export async function eliminarAdjuntoPsico(id, dni) {
  if (!confirm('¿Eliminar este archivo?')) return;
  const ok = await borrarAdjunto(id);
  toast(ok ? '🗑️ Archivo eliminado' : '⚠️ No se pudo eliminar');
  cargarAdjuntoPsico(dni);
}

// ========== ANÁLISIS CON IA (informe psicotécnico) ==========
// La IA solo sugiere — nunca guarda ni aprueba sola. Alguien de RRHH revisa
// el panel y decide si aplica los datos con "Usar estos datos".

let _iaPsicoResultado = null;

export async function analizarInformePsicoIA() {
  const id = $('psico-gest-idx').value;
  const p = getPsicoById(id);
  if (!p) return;
  const adjuntos = await listarAdjuntos({ dni: p.dni, etapa: 'psicotecnico', tipo: 'informe-psico' });
  if (!adjuntos.length) { toast('⚠️ Subí el informe antes de analizarlo'); return; }
  const btn = $('btn-ia-psico');
  const panel = $('pg-ia-resultado');
  if (btn) { btn.disabled = true; btn.textContent = '🤖 Analizando…'; }
  if (panel) { panel.style.display = 'block'; panel.innerHTML = 'Leyendo el documento…'; }
  try {
    const r = await analizarDocumentoPDF({ tipo: 'informe-psico', path: adjuntos[0].url });
    _iaPsicoResultado = r;
    if (panel) {
      panel.innerHTML =
        '<div style="font-weight:600;color:#5b21b6;margin-bottom:6px;">🤖 La IA encontró:</div>'
        + '<div><strong>Resultado:</strong> ' + r.resultado + '</div>'
        + '<div><strong>Confianza:</strong> ' + r.confianza + '</div>'
        + (r.detalles ? '<div style="margin-top:4px;color:#5b21b6;">' + r.detalles + '</div>' : '')
        + chequearIdentidadIA(r, p.dni, p.nombre)
        + '<div style="margin-top:8px;display:flex;gap:8px;">'
        + '<button type="button" class="btn btn-sm" style="background:#7c3aed;color:white;" onclick="usarDatosIAInformePsico()">✓ Usar estos datos</button>'
        + '<button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById(\'pg-ia-resultado\').style.display=\'none\'">Descartar</button>'
        + '</div>';
    }
  } catch (e) {
    if (panel) panel.innerHTML = '⚠️ ' + (e.message || 'No se pudo analizar el documento');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Analizar con IA'; }
  }
}

// Aplica lo que encontró la IA al form — NO guarda solo.
export function usarDatosIAInformePsico() {
  if (!_iaPsicoResultado) return;
  const r = _iaPsicoResultado;
  const resultadosValidos = ['Apto', 'Apto+', 'Apto-', 'Apto condicional', 'No Apto'];
  if (resultadosValidos.includes(r.resultado)) {
    $('pg-psicotecnico').value = r.resultado;
    actualizarBotonesAprobacion();
  }
  const obsEl = $('pg-obs');
  if (obsEl && r.detalles) {
    const nota = '🤖 IA — ' + r.detalles;
    obsEl.value = obsEl.value ? (obsEl.value + '\n' + nota) : nota;
  }
  const panel = $('pg-ia-resultado');
  if (panel) panel.style.display = 'none';
  toast('✓ Datos de la IA aplicados — revisá y guardá');
}

export function actualizarBotonesAprobacion() {
  const psico = $('pg-psicotecnico').value;

  // El psicotécnico avanza si es Apto, Apto+ o Apto- (condicional queda en revision)
  const psicoApto = ['Apto', 'Apto+', 'Apto-'].includes(psico);
  const psicoNoApto = psico === 'No Apto';
  const motivoRow = $('pg-motivo-noapto-row');
  if (motivoRow) motivoRow.style.display = psicoNoApto ? 'block' : 'none';
  const todoOk = psicoApto;
  const hayRech = psicoNoApto;

  const btnApr = $('btn-aprobar-psico');
  const aviso = $('pg-aviso');
  if (btnApr) btnApr.style.display = todoOk ? 'inline-flex' : 'none';
  if (aviso) {
    if (todoOk) {
      aviso.style.display = 'block'; aviso.style.background = '#f0fdf4';
      aviso.style.border = '1px solid #86efac'; aviso.style.color = '#166534';
      aviso.textContent = '✅ Psicotécnico apto — podés enviar a Pre-ocupacional';
    } else if (hayRech) {
      aviso.style.display = 'block'; aviso.style.background = '#fef2f2';
      aviso.style.border = '1px solid #fca5a5'; aviso.style.color = '#991b1b';
      aviso.textContent = '❌ Psicotécnico No Apto — solo podés rechazar';
    } else {
      aviso.style.display = 'none';
    }
  }
}

// ========== GUARDAR ETAPAS ==========

export function guardarEtapasPsico() {
  const id = $('psico-gest-idx').value;
  const p = getPsicoById(id); if (!p) return;
  const psicoVal = $('pg-psicotecnico').value;
  // Motivo obligatorio si el psicotécnico es No Apto
  if (psicoVal === 'No Apto') {
    const motivo = ($('pg-motivo-noapto') || {}).value || '';
    if (!motivo.trim()) {
      toast('⚠️ El motivo es obligatorio cuando el psicotécnico es No Apto');
      const mo = $('pg-motivo-noapto'); if (mo) mo.focus();
      return;
    }
    p.motivoRechazo = motivo.trim();
  }
  p.psicotecnico = psicoVal;
  p.obs = $('pg-obs').value;
  supaSync('psicos', p);
  actualizarBotonesAprobacion();
  renderPsico();
  toast('💾 Etapas guardadas');
}

// ========== APROBAR ==========

export function aprobarPsico() {
  const id = $('psico-gest-idx').value;
  const p = getPsicoById(id); if (!p) return;
  guardarEtapasPsico();
  p.estado = 'Aprobado';
  p.fechaAprobacion = new Date().toLocaleDateString('es-AR');
  supaSync('psicos', p);
  // Crear registro en Pre-ocupacional (el candidato pasa al examen médico, no directo al Alta).
  // Guard de idempotencia: no crear un 2º preocup si ya hay uno vivo para este DNI.
  const preocupVivoExistente = (DB.preocupacionales || []).some(x =>
    p.dni && x.dni === p.dni &&
    (x.estado === 'En proceso' || x.estado === 'Aprobado') &&
    !x.anulado
  );
  if (preocupVivoExistente) {
    toast('ℹ️ Ya existe un pre-ocupacional vigente para este candidato. No se creó uno nuevo.');
  } else {
    const preocup = {
      id: Date.now(), psicoId: p.id, candidatoId: p.candidatoId,
      nombre: p.nombre, dni: p.dni, zona: p.zona, tel: p.tel, rrhh: p.rrhh || '',
      resultado: 'Pendiente', estado: 'En proceso',
    };
    if (!DB.preocupacionales) DB.preocupacionales = [];
    DB.preocupacionales.push(preocup);
    supaSync('preocupacionales', preocup);
    toast('✅ ' + p.nombre + ' aprobado — enviado a Pre-ocupacional');
  }
  cerrarModal('modal-psico-gestion');
  renderPsico();
}

// ========== RECHAZAR ==========

export function rechazarPsico() {
  const id = $('psico-gest-idx').value;
  const p = getPsicoById(id); if (!p) return;
  abrirModalInput({ titulo: 'Rechazar psicotécnico', etiqueta: 'Motivo del rechazo (obligatorio)' }, (motivo) => {
    guardarEtapasPsico();
    p.estado = 'Rechazado';
    p.motivoRechazo = motivo;
    p.fechaRechazo = new Date().toLocaleDateString('es-AR');
    supaSync('psicos', p);
    // Actualizar candidato original
    const cand = (DB.candidatos || []).find(c => p.dni && c.dni === p.dni);
    if (cand) {
      cand.estado = 'Rechazado';
      cand.motivoRechazo = 'Rechazado en Psicotécnico: ' + motivo;
      supaSync('candidatos', cand);
    }
    cerrarModal('modal-psico-gestion');
    renderPsico();
    toast('❌ ' + p.nombre + ' rechazado');
  });
}

// Revertir un registro Aprobado/Rechazado: vuelve a "En proceso".
// Bloquea si ya existe un pre-ocupacional vivo (En proceso o Aprobado).
// Si era rechazo, restaura el candidato a 'Psicotecnico'.
// Identifica por id (no por índice).
export function revertirPsico(id) {
  const p = (DB.psicos || []).find(x => String(x.id) === String(id));
  if (!p) return;

  // 1. Verificar si existe pre-ocupacional vivo
  const preocupVivo = (DB.preocupacionales || []).find(x =>
    p.dni && x.dni === p.dni &&
    (x.estado === 'En proceso' || x.estado === 'Aprobado') &&
    !x.anulado
  );
  if (preocupVivo) {
    toast('⛔ No se puede revertir: ' + p.nombre + ' ya avanzó a Pre-ocupacional. Revertí primero allá.', 5000);
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
  p.motivoRechazo = '';
  supaSync('psicos', p);

  toast('↩️ ' + p.nombre + ' volvió a "En proceso".');
  renderPsico();
}

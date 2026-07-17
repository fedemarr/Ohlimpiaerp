import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { subirAdjunto, listarAdjuntos, obtenerUrlFirmada, borrarAdjunto } from '@shared/adjuntos.js';
import { analizarDocumentoPDF, chequearIdentidadIA } from '@shared/iaDocumentos.js';

let _documTab = 'activos';

// Cambiar de pestaña (En proceso / Histórico)
export function tabDocum(tab) {
  _documTab = tab;
  const btnA = $('tab-docum-activos');
  const btnH = $('tab-docum-historico');
  if (btnA) { btnA.style.background = tab === 'activos' ? '#1e3a8a' : '#f1f5f9'; btnA.style.color = tab === 'activos' ? 'white' : '#64748b'; }
  if (btnH) { btnH.style.background = tab === 'historico' ? '#1e3a8a' : '#f1f5f9'; btnH.style.color = tab === 'historico' ? 'white' : '#64748b'; }
  renderDocum();
}

// ========== FILTROS ==========

export function filtrarDocum() {
  const buscar = (($('docum-buscar') || { value: '' }).value || (($('buscador-global') || { value: '' }).value)).toLowerCase();
  const zona = ($('docum-filtro-zona') || { value: '' }).value;
  const estado = ($('docum-filtro-estado') || { value: '' }).value;

  renderDocum((DB.documentacionIngreso || []).filter(d => !d.anulado).filter(d =>
    (!buscar || (d.nombre || '').toLowerCase().includes(buscar) || (d.dni || '').includes(buscar)) &&
    (!zona || d.zona === zona) &&
    (!estado || d.estado === estado)
  ));
}

export function poblarFiltrosColumnasDocum() {
  const el = $('docum-filtro-zona');
  if (!el) return;
  const ph = el.options[0]?.outerHTML || '<option value="">Todas las zonas</option>';
  el.innerHTML = ph + [...new Set(DB.zonas)].filter(Boolean).map(z => `<option>${z}</option>`).join('');
}

// Render del listado de documentación (pestañas activos/histórico + indicadores)
export function renderDocum(listaFiltrada) {
  const tbody = $('tbody-docum');
  if (!tbody) return;
  const todos = (DB.documentacionIngreso || []).filter(d => !d.anulado);
  const activos = todos.filter(d => d.estado === 'En proceso');
  const historico = todos.filter(d => d.estado !== 'En proceso');

  // Indicadores
  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-dc-proceso', activos.length);
  ss('st-dc-aprobados', todos.filter(d => d.estado === 'Aprobado').length);
  ss('st-dc-rechazados', todos.filter(d => d.estado === 'Rechazado').length);

  // Si recibe lista filtrada, usarla; si no, usar tab activo
  const lista = listaFiltrada || (_documTab === 'historico' ? historico : activos);
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">'
      + (_documTab === 'historico' ? 'Sin registros en histórico' : 'Sin candidatos en proceso')
      + '</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(d =>
    '<tr>'
    + '<td>' + (d.nombre || '') + '</td>'
    + '<td>' + (d.dni || '') + '</td>'
    + '<td>' + (d.zona || '') + '</td>'
    + '<td>' + (d.antecResultado || 'Pendiente')
      + (() => {
          const est = calcularEstadoVencimiento(d.antecVencimiento);
          return est
            ? '<br><span style="display:inline-block;margin-top:3px;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:' + est.bg + ';color:' + est.color + ';">' + est.texto + '</span>'
            : '';
        })()
      + '</td>'
    + '<td>' + (d.libretaAplica ? '✓' : '—') + '</td>'
    + '<td>' + (d.cursoTiene ? '✓' : '—') + '</td>'
    + '<td>' + (d.estado || 'En proceso') + '</td>'
    + '<td>' + (d.estado === 'En proceso'
        ? '<button onclick="abrirGestionDocum(\'' + d.id + '\')" style="font-size:11px;padding:3px 10px;background:#7c3aed;color:white;border:none;border-radius:4px;cursor:pointer;">⚙️ Gestionar</button>'
        : (() => {
            const tieneAlta = (DB.catAltPendientes || []).some(a =>
              d.dni && a.dni === d.dni && a.estado === 'Alta completada'
            );
            return tieneAlta
              ? '<span style="font-size:11px;color:#94a3b8;">Cerrado</span>'
              : '<button onclick="revertirDocum(\'' + d.id + '\')" style="font-size:11px;padding:3px 10px;background:#f59e0b;color:white;border:none;border-radius:4px;cursor:pointer;">↩️ Revertir</button>';
          })())
    + '</td>'
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
          '<select id="dc-antec-resultado" onchange="actualizarBotonesDocum()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
            '<option>Pendiente</option><option>Sin antecedentes</option><option>Con antecedentes</option>',
          '</select></div>',
        '<div id="dc-antec-excepcion-row" class="form-group" style="display:none;margin-top:8px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px;">',
          '<label style="color:#9a3412;font-weight:600;">🔓 Motivo de la excepción (si se habilita pese a tener antecedentes)</label>',
          '<textarea id="dc-antec-motivo-excepcion" rows="2" style="width:100%;padding:8px;border:1px solid #fdba74;border-radius:6px;font-size:13px;resize:vertical;margin-top:4px;" placeholder="Por qué se habilita el ingreso pese a los antecedentes"></textarea>',
        '</div>',
        '<div class="form-grid form-grid-2">',
          '<div class="form-group"><label>Fecha del certificado</label>',
            '<input type="date" id="dc-antec-fecha" onchange="recalcularVencAntec()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
          '<div class="form-group"><label>Vence (auto, +6 meses)</label>',
            '<input type="date" id="dc-antec-vencimiento" readonly style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#f8fafc;">',
            '<span id="dc-antec-vencimiento-badge" style="display:none;margin-top:4px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;"></span>',
          '</div>',
        '</div>',
        '<div id="dc-antec-adjunto-box" style="margin-top:10px;border:1px dashed #93c5fd;border-radius:8px;padding:12px;background:#eff6ff;">',
          '<label style="font-weight:600;color:#1e3a8a;">📎 Certificados de antecedentes (se conserva historial)</label>',
          '<div id="dc-antec-adjunto-lista" style="margin-top:8px;font-size:13px;color:#64748b;">Cargando…</div>',
          '<input type="file" id="dc-antec-adjunto-file" accept="application/pdf,image/jpeg,image/png" style="display:none;" onchange="seleccionarArchivoDocum()">',
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">',
            '<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'dc-antec-adjunto-file\').click()">⬆️ Subir certificado</button>',
            '<button type="button" id="btn-ia-antec" class="btn" style="background:#7c3aed;color:white;" onclick="analizarAntecedentesIA()">🤖 Analizar con IA</button>',
          '</div>',
          '<div id="dc-antec-ia-resultado" style="display:none;margin-top:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:10px;font-size:12px;"></div>',
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
      '<div class="modal-footer" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-docum-gestion\')">Cerrar</button>',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
          '<button class="btn btn-primary" onclick="guardarDocum()">💾 Guardar</button>',
          '<button id="btn-aprobar-docum" class="btn" style="background:#16a34a;color:white;display:none;" onclick="aprobarDocum()">✅ Aprobar → Alta</button>',
          '<button id="btn-excepcion-docum" class="btn" style="background:#ea580c;color:white;display:none;" onclick="excepcionDocum()">🔓 Habilitar excepción</button>',
          '<button id="btn-baja-docum" class="btn" style="background:#dc2626;color:white;display:none;" onclick="bajaDocum()">⛔ Dar de baja</button>',
        '</div>',
      '</div>',
    '</div>',
  ].join('');
}

// Buscar un registro de documentación por id (nunca id_local — lección del proyecto)
const getDocumById = (id) => (DB.documentacionIngreso || []).find(d => String(d.id) === String(id));

// Calcular estado visual del vencimiento de antecedentes (verde/amarillo/rojo)
// Devuelve null si no hay fecha; si no, { color, bg, texto } para pintar un badge.
// Se exporta porque Legajos también la usa para mostrar el vencimiento en la fila.
export function calcularEstadoVencimiento(fechaVencYMD) {
  if (!fechaVencYMD) return null;
  const venc = new Date(fechaVencYMD + 'T00:00:00');
  if (isNaN(venc.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
  if (diff < 0) {
    return { color: '#991b1b', bg: '#fef2f2', texto: '🔴 VENCIDO hace ' + Math.abs(diff) + ' días' };
  }
  if (diff <= 30) {
    return { color: '#9a3412', bg: '#fff7ed', texto: '🟡 Vence en ' + diff + ' día' + (diff === 1 ? '' : 's') };
  }
  const meses = Math.floor(diff / 30);
  return { color: '#166534', bg: '#f0fdf4', texto: '🟢 Vence en ' + meses + ' mes' + (meses === 1 ? '' : 'es') };
}

// Pintar el badge de vencimiento en el modal (usa el span dc-antec-vencimiento-badge)
function pintarBadgeVencModal() {
  const span = $('dc-antec-vencimiento-badge');
  if (!span) return;
  const vencEl = $('dc-antec-vencimiento');
  const est = calcularEstadoVencimiento(vencEl ? vencEl.value : '');
  if (!est) { span.style.display = 'none'; span.textContent = ''; return; }
  span.style.display = 'inline-block';
  span.style.background = est.bg;
  span.style.color = est.color;
  span.textContent = est.texto;
}

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
  pintarBadgeVencModal();
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
  actualizarBotonesDocum();
  pintarBadgeVencModal();

  // Resetear el panel de análisis de IA — si no, queda mostrando el
  // resultado del último candidato analizado en esta sesión del
  // navegador (el panel es un único elemento reutilizado para todos).
  _iaAntecResultado = null;
  const iaPanel = $('dc-antec-ia-resultado');
  if (iaPanel) { iaPanel.style.display = 'none'; iaPanel.innerHTML = ''; }
  const btnIa = $('btn-ia-antec');
  if (btnIa) { btnIa.disabled = false; btnIa.textContent = '🤖 Analizar con IA'; }

  $('modal-docum-gestion').classList.add('open');
  cargarAdjuntoDocum(d.dni);
}

// Guardar la documentación (lee los 3 requisitos, persiste por id)
export function guardarDocum() {
  const id = parseInt($('docum-gest-id').value);
  const d = getDocumById(id);
  if (!d) return;
  // Antecedentes
  d.antecResultado = ($('dc-antec-resultado') || {}).value || 'Pendiente';
  d.antecFecha = ($('dc-antec-fecha') || {}).value || null;
  d.antecVencimiento = ($('dc-antec-vencimiento') || {}).value || null;
  // Libreta (solo si aplica; si no, se limpian)
  d.libretaAplica = ($('dc-libreta-aplica') || {}).checked || false;
  d.libretaZona = d.libretaAplica ? (($('dc-libreta-zona') || {}).value || '') : '';
  d.libretaVencimiento = d.libretaAplica ? (($('dc-libreta-vencimiento') || {}).value || null) : null;
  // Curso (solo si tiene; si no, se limpia)
  d.cursoTiene = ($('dc-curso-tiene') || {}).checked || false;
  d.cursoVencimiento = d.cursoTiene ? (($('dc-curso-vencimiento') || {}).value || null) : null;
  // Observaciones
  d.obs = ($('dc-obs') || {}).value || '';
  supaSync('documentacionIngreso', d);
  cerrarModal('modal-docum-gestion');
  renderDocum();
  toast('💾 Documentación guardada');
}

// Mostrar/ocultar botones y motivo de excepción según el resultado de antecedentes
export function actualizarBotonesDocum() {
  const res = ($('dc-antec-resultado') || {}).value || '';
  const sinAntec = res === 'Sin antecedentes';
  const conAntec = res === 'Con antecedentes';
  const btnAp = $('btn-aprobar-docum');
  if (btnAp) btnAp.style.display = sinAntec ? 'inline-flex' : 'none';
  const btnExc = $('btn-excepcion-docum');
  if (btnExc) btnExc.style.display = conAntec ? 'inline-flex' : 'none';
  const btnBaja = $('btn-baja-docum');
  if (btnBaja) btnBaja.style.display = conAntec ? 'inline-flex' : 'none';
  const excRow = $('dc-antec-excepcion-row');
  if (excRow) excRow.style.display = conAntec ? 'block' : 'none';
}

// Construir el registro de Alta a partir de un registro de documentación (helper interno)
function _crearAltaDesdeDocum(d) {
  // Guard de idempotencia: no crear un 2º registro de alta si ya hay uno para este DNI.
  // cat_alt_pendientes NO tiene columna 'anulado'; estados: 'Pendiente de alta' / 'Alta completada'.
  const altaExistente = (DB.catAltPendientes || []).some(x =>
    d.dni && x.dni === d.dni &&
    (x.estado === 'Pendiente de alta' || x.estado === 'Alta completada')
  );
  if (altaExistente) {
    toast('ℹ️ Ya existe un alta para este candidato. No se creó una nueva.');
    return false;
  }
  const alta = {
    id: Date.now(), psicoId: d.psicoId, candidatoId: d.candidatoId,
    nombre: d.nombre, dni: d.dni, zona: d.zona, tel: d.tel, rrhh: d.rrhh || '',
    estado: 'Pendiente de alta', fecha: new Date().toLocaleDateString('es-AR'),
    identificacion: {}, domicilio: {}, operativo: {}, uniforme: {}, capital: {}, seguros: {},
  };
  if (!DB.catAltPendientes) DB.catAltPendientes = [];
  DB.catAltPendientes.push(alta);
  supaSync('catAltPendientes', alta);
  return true;
}

// Aprobar: Sin antecedentes → avanza al Alta
export async function aprobarDocum() {
  const id = parseInt($('docum-gest-id').value);
  const d = getDocumById(id);
  if (!d) return;
  // Obligatorio: al menos un certificado de antecedentes vigente antes de aprobar.
  const antec = await listarAdjuntos({ dni: d.dni, etapa: 'documentacion', tipo: 'antecedente' });
  if (!antec.length) {
    toast('⚠️ Adjuntá al menos un certificado de antecedentes antes de aprobar');
    return;
  }
  d.antecResultado = 'Sin antecedentes';
  d.antecFecha = ($('dc-antec-fecha') || {}).value || null;
  d.antecVencimiento = ($('dc-antec-vencimiento') || {}).value || null;
  d.estado = 'Aprobado';
  d.fechaAprobacion = new Date().toLocaleDateString('es-AR');
  supaSync('documentacionIngreso', d);
  const creada = _crearAltaDesdeDocum(d);
  cerrarModal('modal-docum-gestion');
  renderDocum();
  if (creada) toast('✅ ' + d.nombre + ' aprobado — enviado a Alta de asociados');
}

// Habilitar excepción: Con antecedentes pero pasa igual (queda registrado)
export function excepcionDocum() {
  const id = parseInt($('docum-gest-id').value);
  const d = getDocumById(id);
  if (!d) return;
  const motivo = ($('dc-antec-motivo-excepcion') || {}).value || '';
  if (!motivo.trim()) {
    toast('⚠️ El motivo de la excepción es obligatorio');
    const mo = $('dc-antec-motivo-excepcion'); if (mo) mo.focus();
    return;
  }
  d.antecResultado = 'Con antecedentes';
  d.antecExcepcion = true;
  d.antecMotivoExcepcion = motivo.trim();
  d.antecFecha = ($('dc-antec-fecha') || {}).value || null;
  d.antecVencimiento = ($('dc-antec-vencimiento') || {}).value || null;
  d.estado = 'Aprobado';
  d.fechaAprobacion = new Date().toLocaleDateString('es-AR');
  supaSync('documentacionIngreso', d);
  const creada = _crearAltaDesdeDocum(d);
  cerrarModal('modal-docum-gestion');
  renderDocum();
  if (creada) toast('🔓 ' + d.nombre + ' habilitado por excepción — enviado a Alta');
}

// Dar de baja: Con antecedentes → candidato Rechazado
export function bajaDocum() {
  const id = parseInt($('docum-gest-id').value);
  const d = getDocumById(id);
  if (!d) return;
  d.antecResultado = 'Con antecedentes';
  d.antecExcepcion = false;
  d.estado = 'Rechazado';
  d.motivo = 'Rechazado por antecedentes penales';
  d.fechaRechazo = new Date().toLocaleDateString('es-AR');
  supaSync('documentacionIngreso', d);
  const cand = (DB.candidatos || []).find(c => d.dni && c.dni === d.dni);
  if (cand) {
    cand.estado = 'Rechazado';
    cand.motivoRechazo = 'Rechazado por antecedentes penales';
    supaSync('candidatos', cand);
  }
  cerrarModal('modal-docum-gestion');
  renderDocum();
  toast('⛔ ' + d.nombre + ' dado de baja por antecedentes');
}

// ========== ADJUNTOS (certificados de antecedentes — historial) ==========

export async function cargarAdjuntoDocum(dni) {
  const cont = $('dc-antec-adjunto-lista');
  if (!cont) return;
  cont.innerHTML = 'Cargando…';
  const lista = await listarAdjuntos({ dni, etapa: 'documentacion', tipo: 'antecedente' });
  if (!lista.length) {
    cont.innerHTML = '<span style="color:#94a3b8;">Sin certificados cargados</span>';
    return;
  }
  cont.innerHTML = lista.map(a =>
    '<div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;margin-top:4px;">'
    + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ' + (a.nombreArchivo || 'Archivo') + '</span>'
    + '<button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="verAdjuntoDocum(\'' + a.url + '\')">👁️ Ver</button>'
    + '<button type="button" class="btn" style="background:#dc2626;color:white;padding:4px 8px;font-size:12px;" onclick="eliminarAdjuntoDocum(\'' + a.id + '\',\'' + dni + '\')">🗑️</button>'
    + '</div>'
  ).join('');
}

export async function seleccionarArchivoDocum() {
  const input = $('dc-antec-adjunto-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const id = $('docum-gest-id').value;
  const d = getDocumById(id);
  if (!d) { toast('⚠️ No se encontró el registro'); return; }
  // Vencimiento del adjunto = fecha del certificado + 6 meses (misma lógica del badge).
  // Si no hay fecha de certificado cargada, queda null (no obligamos a cargarla antes).
  const fechaCert = ($('dc-antec-fecha') || {}).value || '';
  let fechaVencimiento = null;
  if (fechaCert) {
    const fv = new Date(fechaCert + 'T00:00');
    fv.setMonth(fv.getMonth() + 6);
    fechaVencimiento = fv.toISOString().slice(0, 10);
  }
  const cont = $('dc-antec-adjunto-lista');
  if (cont) cont.innerHTML = 'Subiendo…';
  try {
    await subirAdjunto({ dni: d.dni, etapa: 'documentacion', tipo: 'antecedente', file, fechaVencimiento });
    toast('📎 Certificado subido');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Error al subir el archivo'));
  } finally {
    if (input) input.value = '';
  }
  cargarAdjuntoDocum(d.dni);
}

export async function verAdjuntoDocum(path) {
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

// ========== ANÁLISIS CON IA (antecedentes) ==========
// La IA solo sugiere — nunca guarda ni aprueba sola. Alguien de RRHH revisa
// el panel y decide si aplica los datos con "Usar estos datos".

let _iaAntecResultado = null;

export async function analizarAntecedentesIA() {
  const id = $('docum-gest-id').value;
  const d = getDocumById(id);
  if (!d) return;
  const adjuntos = await listarAdjuntos({ dni: d.dni, etapa: 'documentacion', tipo: 'antecedente' });
  if (!adjuntos.length) { toast('⚠️ Subí un certificado antes de analizarlo'); return; }
  const btn = $('btn-ia-antec');
  const panel = $('dc-antec-ia-resultado');
  if (btn) { btn.disabled = true; btn.textContent = '🤖 Analizando…'; }
  if (panel) { panel.style.display = 'block'; panel.innerHTML = 'Leyendo el documento…'; }
  try {
    const r = await analizarDocumentoPDF({ tipo: 'antecedente', path: adjuntos[0].url });
    _iaAntecResultado = r;
    if (panel) {
      panel.innerHTML =
        '<div style="font-weight:600;color:#5b21b6;margin-bottom:6px;">🤖 La IA encontró:</div>'
        + '<div><strong>Resultado:</strong> ' + r.resultado + '</div>'
        + '<div><strong>Fecha del certificado:</strong> ' + (r.fechaEmision || '—') + '</div>'
        + '<div><strong>Confianza:</strong> ' + r.confianza + '</div>'
        + (r.detalles ? '<div style="margin-top:4px;color:#5b21b6;">' + r.detalles + '</div>' : '')
        + chequearIdentidadIA(r, d.dni, d.nombre)
        + '<div style="margin-top:8px;display:flex;gap:8px;">'
        + '<button type="button" class="btn btn-sm" style="background:#7c3aed;color:white;" onclick="usarDatosIAAntec()">✓ Usar estos datos</button>'
        + '<button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById(\'dc-antec-ia-resultado\').style.display=\'none\'">Descartar</button>'
        + '</div>';
    }
  } catch (e) {
    if (panel) panel.innerHTML = '⚠️ ' + (e.message || 'No se pudo analizar el documento');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Analizar con IA'; }
  }
}

// Aplica lo que encontró la IA a los campos del form — NO guarda solo.
export function usarDatosIAAntec() {
  if (!_iaAntecResultado) return;
  const r = _iaAntecResultado;
  if (r.resultado === 'Sin antecedentes' || r.resultado === 'Con antecedentes') {
    $('dc-antec-resultado').value = r.resultado;
    actualizarBotonesDocum();
  }
  if (r.fechaEmision) {
    $('dc-antec-fecha').value = r.fechaEmision;
    recalcularVencAntec();
  }
  const panel = $('dc-antec-ia-resultado');
  if (panel) panel.style.display = 'none';
  toast('✓ Datos de la IA aplicados — revisá y guardá');
}

export async function eliminarAdjuntoDocum(id, dni) {
  if (!confirm('¿Eliminar este certificado?')) return;
  const ok = await borrarAdjunto(id);
  toast(ok ? '🗑️ Certificado eliminado' : '⚠️ No se pudo eliminar');
  cargarAdjuntoDocum(dni);
}

// Revertir un registro Aprobado/Rechazado: vuelve a "En proceso".
// Bloquea si el alta ya fue completada (hay legajo).
// Si había alta 'Pendiente de alta', la anula en cascada.
// Si era rechazo, restaura el candidato a 'Psicotecnico'.
export function revertirDocum(id) {
  const d = getDocumById(id);
  if (!d) return;

  // 1. Verificar si ya hay legajo (alta completada)
  const altaCompletada = (DB.catAltPendientes || []).find(a =>
    d.dni && a.dni === d.dni && a.estado === 'Alta completada'
  );
  if (altaCompletada) {
    toast('⛔ No se puede revertir: ' + d.nombre + ' ya fue dado de alta como asociado.', 5000);
    return;
  }

  // 2. Confirmación obligatoria, texto según aprobación o rechazo — aclara
  //    que revierte las 3 etapas (Psicotécnico, Pre-ocupacional y esta) juntas.
  const eraRechazo = d.estado === 'Rechazado';
  const msg = eraRechazo
    ? '¿Querés revertir el rechazo de ' + d.nombre + '?\n\nEsto revierte Psicotécnico, Pre-ocupacional y Documentación juntos — las 3 etapas van a volver a "En proceso" y se van a poder modificar de nuevo. El candidato dejará de estar marcado como "Rechazado".'
    : '¿Querés revertir la aprobación de ' + d.nombre + '?\n\nEsto revierte Psicotécnico, Pre-ocupacional y Documentación juntos — las 3 etapas van a volver a "En proceso" y se van a poder modificar de nuevo. Si ya había un alta pendiente, se anulará.';
  if (!confirm(msg)) return;

  // 3. Anular alta 'Pendiente de alta' si existe (soft delete)
  const altaPend = (DB.catAltPendientes || []).find(a =>
    d.dni && a.dni === d.dni && a.estado === 'Pendiente de alta'
  );
  if (altaPend) {
    altaPend.estado = 'Anulada';
    supaSync('catAltPendientes', altaPend);
  }

  // 4. Restaurar candidato si era rechazo
  if (eraRechazo) {
    const cand = (DB.candidatos || []).find(c => d.dni && c.dni === d.dni);
    if (cand) {
      cand.estado = 'Psicotecnico';
      cand.motivoRechazo = '';
      supaSync('candidatos', cand);
    }
  }

  // 5. Limpiar campos de resolución y volver a "En proceso"
  d.estado = 'En proceso';
  d.fechaAprobacion = null;
  d.fechaRechazo = null;
  d.antecExcepcion = false;
  d.antecMotivoExcepcion = '';
  d.motivo = '';
  supaSync('documentacionIngreso', d);

  // 6. Revertir en cascada Pre-ocupacional y Psicotécnico del mismo
  //    candidato, para poder modificar cualquiera de las 3 etapas de nuevo
  //    sin tener que entrar a revertirlas una por una en cada pantalla.
  const preocup = (DB.preocupacionales || []).find(x => d.dni && x.dni === d.dni && !x.anulado);
  if (preocup) {
    preocup.estado = 'En proceso';
    preocup.fechaAprobacion = null;
    preocup.fechaRechazo = null;
    preocup.motivo = '';
    supaSync('preocupacionales', preocup);
  }
  const psico = (DB.psicos || []).find(x => d.dni && x.dni === d.dni);
  if (psico) {
    psico.estado = 'En proceso';
    psico.fechaAprobacion = null;
    psico.fechaRechazo = null;
    psico.motivoRechazo = '';
    supaSync('psicos', psico);
  }

  toast('↩️ ' + d.nombre + ' volvió a "En proceso" en las 3 etapas (Psicotécnico, Pre-ocupacional y Documentación).');
  renderDocum();
}

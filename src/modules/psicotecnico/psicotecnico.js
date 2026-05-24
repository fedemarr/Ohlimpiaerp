import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// ========== ESTADO INTERNO ==========

let _psicoTab = 'activos';

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
  const estadosHistorico = ['Aprobado', 'Rechazado'];
  const activos = todos.filter(p => !estadosHistorico.includes(p.estado));
  const historico = todos.filter(p => estadosHistorico.includes(p.estado));

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
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8;">'
      + (_psicoTab === 'historico' ? 'Sin registros en histórico' : 'Sin candidatos en proceso')
      + '</td></tr>';
    return;
  }

  tbody.innerHTML = listaFinal.map(p => {
    const i = todos.indexOf(p);
    const ec = p.estado === 'Aprobado' ? '#16a34a' : p.estado === 'Rechazado' ? '#dc2626' : '#d97706';
    return '<tr style="border-bottom:1px solid #e2e8f0;">'
      + '<td style="padding:8px 12px;font-size:13px;"><strong>' + p.nombre + '</strong></td>'
      + '<td style="padding:8px;font-size:12px;color:#64748b;">' + (p.dni || '—') + '</td>'
      + '<td style="padding:8px;font-size:12px;">' + (p.zona || '—') + '</td>'
      + '<td style="padding:8px;text-align:center;">' + icon(p.psicotecnico, true) + '</td>'
      + '<td style="padding:8px;text-align:center;">' + icon(p.prelaboral, true) + '</td>'
      + '<td style="padding:8px;text-align:center;">' + icon(p.antecedentes, p.requiereAntecedentes) + '</td>'
      + '<td style="padding:8px;text-align:center;">' + icon(p.libretaSanitaria, p.requiereLibreta) + '</td>'
      + '<td style="padding:8px;text-align:center;font-size:11px;font-weight:600;color:' + ec + '">' + p.estado + '</td>'
      + '<td style="padding:8px;text-align:center;">'
        + (p.estado === 'En proceso'
          ? '<button onclick="abrirGestionPsico(' + i + ')" style="font-size:11px;padding:3px 10px;background:#7c3aed;color:white;border:none;border-radius:4px;cursor:pointer;">⚙️ Gestionar</button>'
          : '<span style="font-size:11px;color:#94a3b8;font-style:italic;">' + (p.motivoRechazo ? 'Motivo: ' + p.motivoRechazo : 'Cerrado') + '</span>')
      + '</td>'
      + '</tr>';
  }).join('');
}

// ========== FILTROS ==========

export function filtrarPsico() {
  const nombre = ($('cf-ps-nombre') || { value: '' }).value.toLowerCase();
  const dni = ($('cf-ps-dni') || { value: '' }).value.toLowerCase();
  const zona = ($('cf-ps-zona') || { value: '' }).value;
  const rrhh = ($('cf-ps-rrhh') || { value: '' }).value;
  const resultado = ($('cf-ps-resultado') || { value: '' }).value;
  const preocup = ($('cf-ps-preocup') || { value: '' }).value;
  const estado = ($('cf-ps-estado') || { value: '' }).value;
  const fecha = ($('cf-ps-fecha') || { value: '' }).value.toLowerCase();
  const bg = ($('buscador-global') || { value: '' }).value.toLowerCase();

  renderPsico(DB.psicos.filter(p =>
    (!nombre || p.nombre.toLowerCase().includes(nombre)) &&
    (!dni || p.dni.includes(dni)) &&
    (!zona || p.zona === zona) &&
    (!rrhh || p.rrhh === rrhh) &&
    (!resultado || p.resultado === resultado) &&
    (!preocup || p.preocup === preocup) &&
    (!estado || p.estado === estado) &&
    (!fecha || p.fecha.includes(fecha)) &&
    (!bg || p.nombre.toLowerCase().includes(bg) || p.dni.includes(bg))
  ));
}

export function poblarFiltrosColumnasPsico() {
  const fillCol = (id, items) => {
    const el = $(id);
    if (!el) return;
    const ph = el.options[0]?.outerHTML || '<option value=""></option>';
    el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join('');
  };
  const nicksRRHH = [
    ...DB.usuarios.filter(u => ['RRHH', 'Administrador total'].includes(u.perfil)).map(u => u.nickname || u.nombre.split(' ')[0]),
    ...DB.rrhh.filter(n => !DB.usuarios.find(u => (u.nickname || u.nombre.split(' ')[0]) === n)),
    'Agente IA Ohlimpia',
  ];
  fillCol('cf-ps-zona', DB.zonas);
  fillCol('cf-ps-rrhh', nicksRRHH);
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

export function abrirGestionPsico(i) {
  const p = DB.psicos[i]; if (!p) return;

  // Crear modal dinámicamente si no existe
  if (!$('psico-gest-idx')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-psico-gestion';
    m.innerHTML = crearHTMLModalPsico();
    document.body.appendChild(m);
  }

  $('psico-gest-idx').value = i;
  $('psico-gest-nombre').textContent = p.nombre;
  $('pg-psicotecnico').value = p.psicotecnico || 'Pendiente';
  $('pg-prelaboral').value = p.prelaboral || 'Pendiente';

  const reqAnt = p.requiereAntecedentes || false;
  const reqLib = p.requiereLibreta || false;
  $('pg-req-antecedentes').checked = reqAnt;
  $('pg-antecedentes').value = p.antecedentes || 'Pendiente';
  $('pg-antecedentes').disabled = !reqAnt;
  $('pg-antecedentes').style.opacity = reqAnt ? '1' : '0.5';
  $('pg-req-libreta').checked = reqLib;
  $('pg-libreta').value = p.libretaSanitaria || 'Pendiente';
  $('pg-libreta').disabled = !reqLib;
  $('pg-libreta').style.opacity = reqLib ? '1' : '0.5';
  $('pg-obs').value = p.obs || '';
  const moEl = $('pg-motivo-noapto');
  if (moEl) moEl.value = p.motivoRechazo || '';
  $('pg-aviso').style.display = 'none';

  actualizarBotonesAprobacion();
  $('modal-psico-gestion').classList.add('open');
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
        '<h4 style="font-size:13px;color:#374151;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Etapas obligatorias</h4>',
        '<div class="form-grid form-grid-2">',
          '<div class="form-group"><label>🧠 Psicotécnico *</label>',
            '<select id="pg-psicotecnico" onchange="actualizarBotonesAprobacion()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
              '<option>Pendiente</option><option>Apto</option><option>Apto+</option><option>Apto-</option><option>Apto condicional</option><option>No Apto</option>',
            '</select></div>',
          '<div class="form-group"><label>🏥 Prelaboral médico *</label>',
            '<select id="pg-prelaboral" onchange="actualizarBotonesAprobacion()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
              '<option>Pendiente</option><option>Aprobado</option><option>Rechazado</option>',
            '</select></div>',
        '</div>',
        '<div id="pg-motivo-noapto-row" class="form-group" style="display:none;margin-top:8px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px;">',
          '<label style="color:#991b1b;font-weight:600;">⚠️ Motivo / observaciones del No Apto *</label>',
          '<textarea id="pg-motivo-noapto" rows="2" style="width:100%;padding:8px;border:1px solid #fca5a5;border-radius:6px;font-size:13px;resize:vertical;margin-top:4px;" placeholder="Detallá el motivo (obligatorio para No Apto)"></textarea>',
        '</div>',
        '<h4 style="font-size:13px;color:#374151;margin:16px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Etapas opcionales</h4>',
        '<div class="form-grid form-grid-2">',
          '<div class="form-group">',
            '<label><input type="checkbox" id="pg-req-antecedentes" onchange="toggleEtapaOpcional(\'antecedentes\')"> 📋 Libre de antecedentes</label>',
            '<select id="pg-antecedentes" disabled onchange="actualizarBotonesAprobacion()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;opacity:0.5;margin-top:6px;">',
              '<option>Pendiente</option><option>Aprobado</option><option>Rechazado</option>',
            '</select></div>',
          '<div class="form-group">',
            '<label><input type="checkbox" id="pg-req-libreta" onchange="toggleEtapaOpcional(\'libreta\')"> 📗 Libreta sanitaria</label>',
            '<select id="pg-libreta" disabled onchange="actualizarBotonesAprobacion()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;opacity:0.5;margin-top:6px;">',
              '<option>Pendiente</option><option>Aprobado</option><option>Rechazado</option>',
            '</select></div>',
        '</div>',
        '<div class="form-group" style="margin-top:12px;"><label>Observaciones</label>',
          '<textarea id="pg-obs" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;resize:vertical;"></textarea></div>',
        '<div id="pg-aviso" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:8px;"></div>',
      '</div>',
      '<div class="modal-footer" style="flex-wrap:wrap;gap:8px;justify-content:space-between;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-psico-gestion\')">Cerrar panel</button>',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
        '<button class="btn btn-primary" onclick="guardarEtapasPsico()">💾 Guardar etapas</button>',
        '<button id="btn-aprobar-psico" class="btn" style="background:#16a34a;color:white;display:none;" onclick="aprobarPsico()">✅ Aprobar → Alta</button>',
        '<button class="btn" style="background:#dc2626;color:white;" onclick="rechazarPsico()">❌ Rechazar</button>',
      '</div>',
    '</div>',
  ].join('');
}

// ========== ETAPAS OPCIONALES ==========

export function toggleEtapaOpcional(etapa) {
  const chk = $('pg-req-' + etapa);
  const sel = $('pg-' + (etapa === 'antecedentes' ? 'antecedentes' : 'libreta'));
  if (sel) {
    sel.disabled = !chk.checked;
    sel.style.opacity = chk.checked ? '1' : '0.5';
    if (!chk.checked) sel.value = 'Pendiente';
  }
  actualizarBotonesAprobacion();
}

export function actualizarBotonesAprobacion() {
  const psico = $('pg-psicotecnico').value;
  const pre = $('pg-prelaboral').value;
  const reqAnt = $('pg-req-antecedentes').checked;
  const ant = $('pg-antecedentes').value;
  const reqLib = $('pg-req-libreta').checked;
  const lib = $('pg-libreta').value;

  // El psicotécnico avanza si es Apto, Apto+ o Apto- (condicional queda en revision)
  const psicoApto = ['Apto', 'Apto+', 'Apto-'].includes(psico);
  const psicoNoApto = psico === 'No Apto';
  const motivoRow = $('pg-motivo-noapto-row');
  if (motivoRow) motivoRow.style.display = psicoNoApto ? 'block' : 'none';
  const todoOk = psicoApto && pre === 'Aprobado'
    && (!reqAnt || ant === 'Aprobado')
    && (!reqLib || lib === 'Aprobado');
  const hayRech = psicoNoApto || pre === 'Rechazado'
    || (reqAnt && ant === 'Rechazado') || (reqLib && lib === 'Rechazado');

  const btnApr = $('btn-aprobar-psico');
  const aviso = $('pg-aviso');
  if (btnApr) btnApr.style.display = todoOk ? 'inline-flex' : 'none';
  if (aviso) {
    if (todoOk) {
      aviso.style.display = 'block'; aviso.style.background = '#f0fdf4';
      aviso.style.border = '1px solid #86efac'; aviso.style.color = '#166534';
      aviso.textContent = '✅ Todas las etapas aprobadas — podés enviar a Alta';
    } else if (hayRech) {
      aviso.style.display = 'block'; aviso.style.background = '#fef2f2';
      aviso.style.border = '1px solid #fca5a5'; aviso.style.color = '#991b1b';
      aviso.textContent = '❌ Hay etapas rechazadas — solo podés rechazar';
    } else {
      aviso.style.display = 'none';
    }
  }
}

// ========== GUARDAR ETAPAS ==========

export function guardarEtapasPsico() {
  const i = parseInt($('psico-gest-idx').value);
  const p = DB.psicos[i]; if (!p) return;
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
  p.prelaboral = $('pg-prelaboral').value;
  p.requiereAntecedentes = $('pg-req-antecedentes').checked;
  p.antecedentes = p.requiereAntecedentes ? $('pg-antecedentes').value : 'No requerido';
  p.requiereLibreta = $('pg-req-libreta').checked;
  p.libretaSanitaria = p.requiereLibreta ? $('pg-libreta').value : 'No requerido';
  p.obs = $('pg-obs').value;
  supaSync('psicos', p);
  actualizarBotonesAprobacion();
  renderPsico();
  toast('💾 Etapas guardadas');
}

// ========== APROBAR ==========

export function aprobarPsico() {
  const i = parseInt($('psico-gest-idx').value);
  const p = DB.psicos[i]; if (!p) return;
  guardarEtapasPsico();
  p.estado = 'Aprobado';
  p.fechaAprobacion = new Date().toLocaleDateString('es-AR');
  supaSync('psicos', p);
  // Crear registro en Pre-ocupacional (el candidato pasa al examen médico, no directo al Alta)
  const preocup = {
    id: Date.now(), psicoId: p.id, candidatoId: p.candidatoId,
    nombre: p.nombre, dni: p.dni, zona: p.zona, tel: p.tel, rrhh: p.rrhh || '',
    resultado: 'Pendiente', estado: 'En proceso',
  };
  if (!DB.preocupacionales) DB.preocupacionales = [];
  DB.preocupacionales.push(preocup);
  supaSync('preocupacionales', preocup);
  cerrarModal('modal-psico-gestion');
  renderPsico();
  toast('✅ ' + p.nombre + ' aprobado — enviado a Pre-ocupacional');
}

// ========== RECHAZAR ==========

export function rechazarPsico() {
  const i = parseInt($('psico-gest-idx').value);
  const p = DB.psicos[i]; if (!p) return;
  const motivo = prompt('Motivo del rechazo (obligatorio):');
  if (motivo === null) return;
  if (!motivo.trim()) { toast('⚠️ Ingresá el motivo'); return; }
  guardarEtapasPsico();
  p.estado = 'Rechazado';
  p.motivoRechazo = motivo.trim();
  p.fechaRechazo = new Date().toLocaleDateString('es-AR');
  supaSync('psicos', p);
  // Actualizar candidato original
  const cand = (DB.candidatos || []).find(c => c.id === p.candidatoId);
  if (cand) {
    cand.estado = 'Rechazado';
    cand.motivoRechazo = 'Rechazado en Psicotécnico: ' + motivo.trim();
    supaSync('candidatos', cand);
  }
  cerrarModal('modal-psico-gestion');
  renderPsico();
  toast('❌ ' + p.nombre + ' rechazado');
}

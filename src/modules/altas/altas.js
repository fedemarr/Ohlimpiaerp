import { DB, LOCALIDADES_BA, BARRIOS_CABA } from '@shared/state.js';
import { $, avatarEl, badge, cleanText, toTitleCase, validarCampos, fillSelect, applyTitleCase } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// ========== ESTADO INTERNO ==========

let _altaTabIdx = 0;
const ALTA_TABS = 7;
let _legajoAnteriorEncontrado = null;

// ========== RENDER ==========

export function renderAltas(lista) {
  const pendientes = lista || (DB.catAltPendientes || []).filter(a => a.estado === 'Pendiente de alta');
  const tbody = $('tbody-altas');
  if (!tbody) return;
  if (!pendientes.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="icon">✅</div><p>Sin candidatos pendientes de alta</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = pendientes.map(a => {
    const psicoIdx = (DB.psicos || []).findIndex(p => p.id === a.psicoId);
    return `<tr>
    <td><div style="display:flex;align-items:center;gap:10px;">${avatarEl(a.nombre)}<div><div style="font-weight:500;">${a.nombre}</div><div class="text-muted">DNI: ${a.dni}</div></div></div></td>
    <td><div style="display:flex;gap:4px;">${badge('Confirmado')} ${badge('Apto')}</div></td>
    <td>${badge('Pendiente')}</td>
    <td>${badge(a.estado)}</td>
    <td><span class="${a.rrhh === 'Agente IA Ohlimpia' ? 'badge badge-ia' : 'chip'}">${a.rrhh || '—'}</span></td>
    <td><button class="btn btn-primary btn-sm" onclick="abrirModalAlta(${psicoIdx}, ${a.id})">Registrar alta →</button></td>
  </tr>`;
  }).join('');
}

// ========== FILTROS ==========

export function filtrarAltas() {
  const nombre = ($('cf-alt-nombre') || { value: '' }).value.toLowerCase();
  const resp = ($('cf-alt-resp') || { value: '' }).value;
  const bg = ($('buscador-global') || { value: '' }).value.toLowerCase();
  renderAltas((DB.catAltPendientes || []).filter(a => a.estado === 'Pendiente de alta').filter(a =>
    (!nombre || a.nombre.toLowerCase().includes(nombre)) &&
    (!resp || a.rrhh === resp) &&
    (!bg || a.nombre.toLowerCase().includes(bg))
  ));
}

export function poblarFiltrosColumnasAltas() {
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
  fillCol('cf-alt-resp', nicksRRHH);
}

// ========== POBLAR SELECTS ==========

export function poblarSelectsAltas() {
  fillSelect('alt-funcion', DB.categorias, ['— Seleccionar —']);
  fillSelect('alt-categoria', DB.categorias, ['— Seleccionar —']);
  // Poblar servicios desde objetivos activos
  const servEl = $('alt-servicio');
  if (servEl) {
    const objetivos = (DB.objetivos || []).filter(o => o.estado === 'Activo');
    servEl.innerHTML = '<option value="">— Sin asignar —</option>'
      + objetivos.map(o => '<option value="' + o.codigo + '">' + o.codigo + '</option>').join('');
  }
}

export function onChangeServicioAlta() {
  const codigo = ($('alt-servicio') || {}).value || '';
  const supEl = $('alt-supervisor');
  if (!supEl) return;
  if (!codigo) { supEl.value = ''; return; }
  const obj = (DB.objetivos || []).find(o => o.codigo === codigo && o.estado === 'Activo');
  supEl.value = obj ? obj.supervisor : '';
}

// ========== ZONA ==========

export function onChangeZonaAlta() {
  const zona = $('alt-zona');
  const loc = $('alt-localidad');
  if (!zona || !loc) return;
  if (zona.value === 'CABA') {
    loc.disabled = false; loc.style.opacity = '1';
    loc.innerHTML = '<option value="">Seleccionar barrio...</option>' + BARRIOS_CABA.map(b => '<option>' + b + '</option>').join('');
  } else if (zona.value === 'Buenos Aires') {
    loc.disabled = false; loc.style.opacity = '1';
    loc.innerHTML = '<option value="">Seleccionar...</option>' + LOCALIDADES_BA.map(l => '<option>' + l + '</option>').join('');
  } else {
    loc.innerHTML = '<option value="">Seleccionar zona primero</option>';
    loc.disabled = true; loc.style.opacity = '0.6';
  }
}

// ========== MODAL DINÁMICO ==========

function ensureModal() {
  if ($('modal-alta-nuevo')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-alta-nuevo';
  m.innerHTML = crearHTMLModalAlta();
  document.body.appendChild(m);
}

function crearHTMLModalAlta() {
  return [
    '<div class="modal" style="max-width:700px;">',
      '<div class="modal-header" style="background:#059669;color:white;">',
        '<h3 style="color:white;">🏷️ Alta de asociado — <span id="alta-nombre-display"></span></h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-alta-nuevo\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<input type="hidden" id="alta-idx">',
        // Tabs
        '<div style="display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap;">',
          '<button onclick="tabAlta(0)" id="alta-tab-btn-0" style="padding:6px 12px;border:none;background:#059669;color:white;font-size:12px;border-radius:6px;cursor:pointer;">👤 Identificación</button>',
          '<button onclick="tabAlta(1)" id="alta-tab-btn-1" style="padding:6px 12px;border:none;background:#e2e8f0;color:#374151;font-size:12px;border-radius:6px;cursor:pointer;">🏠 Domicilio</button>',
          '<button onclick="tabAlta(2)" id="alta-tab-btn-2" style="padding:6px 12px;border:none;background:#e2e8f0;color:#374151;font-size:12px;border-radius:6px;cursor:pointer;">⚙️ Operativo</button>',
          '<button onclick="tabAlta(3)" id="alta-tab-btn-3" style="padding:6px 12px;border:none;background:#e2e8f0;color:#374151;font-size:12px;border-radius:6px;cursor:pointer;">👕 Uniforme</button>',
          '<button onclick="tabAlta(4)" id="alta-tab-btn-4" style="padding:6px 12px;border:none;background:#e2e8f0;color:#374151;font-size:12px;border-radius:6px;cursor:pointer;">💰 Capital</button>',
          '<button onclick="tabAlta(5)" id="alta-tab-btn-5" style="padding:6px 12px;border:none;background:#e2e8f0;color:#374151;font-size:12px;border-radius:6px;cursor:pointer;">🛡️ Seguros</button>',
          '<button onclick="tabAlta(6)" id="alta-tab-btn-6" style="padding:6px 12px;border:none;background:#e2e8f0;color:#374151;font-size:12px;border-radius:6px;cursor:pointer;">🏦 Cuentas bancarias</button>',
        '</div>',
        // Tab 0 — Identificación
        '<div id="alta-section-0">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group" style="grid-column:1/-1;"><label>Nombre completo *</label><input type="text" id="alt-nombre" onblur="applyTitleCase(\'alt-nombre\')"></div>',
            '<div class="form-group"><label>DNI *</label><input type="text" id="alt-dni"></div>',
            '<div class="form-group"><label>CUIT *</label><input type="text" id="alt-cuit" placeholder="XX-XXXXXXXX-X"></div>',
            '<div class="form-group"><label>Clave fiscal (AFIP)</label><input type="text" id="alt-clave-fiscal" placeholder="Opcional"></div>',
            '<div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="alt-fecnac"></div>',
            '<div class="form-group"><label>Nacionalidad</label><select id="alt-nac" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option>Argentina</option><option>Boliviana</option><option>Paraguaya</option><option>Peruana</option><option>Uruguaya</option><option>Chilena</option><option>Brasileña</option><option>Venezolana</option><option>Otra</option></select></div>',
            '<div class="form-group"><label>Estado civil</label><select id="alt-estado-civil" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option>Soltero/a</option><option>Casado/a</option><option>Divorciado/a</option><option>Viudo/a</option><option>Conviviente</option></select></div>',
            '<div class="form-group"><label>Género</label><select id="alt-genero" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">—</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></div>',
            '<div class="form-group"><label>Teléfono *</label><input type="text" id="alt-tel"></div>',
            '<div class="form-group"><label>Email</label><input type="email" id="alt-mail"></div>',
            '<div class="form-group"><label>Fecha de ingreso *</label><input type="date" id="alt-fec-ingreso"></div>',
            '<div class="form-group"><label><input type="checkbox" id="alt-reingresante" onchange="toggleReingresante()"> ¿Es reingresante?</label></div>',
            '<div class="form-group" id="alt-fec-egreso-row" style="display:none;grid-column:1/-1;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;">',
              '<label style="font-weight:600;color:#0369a1;">🔍 Buscar legajo anterior por DNI</label>',
              '<div style="display:flex;gap:8px;margin-top:6px;">',
                '<input type="text" id="alt-reingresante-dni" placeholder="DNI del reingresante" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
                '<button type="button" class="btn btn-secondary" onclick="buscarLegajoReingresante()">Buscar</button>',
              '</div>',
              '<div id="alt-reingresante-resultado" style="margin-top:8px;font-size:13px;"></div>',
            '</div>',
          '</div>',
        '</div>',
        // Tab 1 — Domicilio
        '<div id="alta-section-1" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group" style="grid-column:1/-1;"><label>Dirección *</label><input type="text" id="alt-direccion" onblur="applyTitleCase(\'alt-direccion\')"></div>',
            '<div class="form-group"><label>Provincia *</label><select id="alt-zona" onchange="onChangeZonaAlta()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option><option value="CABA">CABA</option><option value="Buenos Aires">Provincia de Buenos Aires</option></select></div>',
            '<div class="form-group"><label>Localidad</label><select id="alt-localidad" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar zona primero</option></select></div>',
          '</div>',
        '</div>',
        // Tab 2 — Operativo
        '<div id="alta-section-2" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Función *</label><select id="alt-funcion" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option></select></div>',
            '<div class="form-group"><label>Categoría *</label><select id="alt-categoria" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option></select></div>',
            '<div class="form-group"><label>Servicio</label><select id="alt-servicio" onchange="onChangeServicioAlta()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">— Sin asignar —</option></select></div>',
            '<div class="form-group"><label>Supervisor</label><input type="text" id="alt-supervisor" style="background:var(--fondo);" readonly placeholder="Se completa con el servicio"></div>',
            '<div class="form-group"><label>Período de prueba (meses)</label><input type="number" id="alt-periodo-prueba" value="6" min="1" max="12"></div>',
          '</div>',
        '</div>',
        // Tab 3 — Uniforme
        '<div id="alta-section-3" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Talle de ambo *</label><select id="alt-ambo" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option><option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>XXL</option></select></div>',
            '<div class="form-group"><label>Talle de calzado *</label><input type="number" id="alt-calzado" min="34" max="48"></div>',
          '</div>',
        '</div>',
        // Tab 4 — Capital
        '<div id="alta-section-4" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Integración inicial ($) *</label><input type="number" id="alt-integracion" min="0"></div>',
            '<div class="form-group"><label>Forma de pago</label><select id="alt-forma-pago" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option>Efectivo</option><option>Transferencia</option><option>Descuento de haberes</option></select></div>',
            '<div class="form-group"><label>N° INAES</label><input type="text" id="alt-inaes" placeholder="Opcional"></div>',
          '</div>',
        '</div>',
        // Tab 5 — Seguros
        '<div id="alta-section-5" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Seguro de vida *</label><select id="alt-seguro" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option><option>Completo</option><option>Básico</option><option>Sin seguro</option></select></div>',
            '<div class="form-group"><label>ART</label><input type="text" id="alt-art"></div>',
            '<div class="form-group"><label>Obra social</label><input type="text" id="alt-obra-social"></div>',
          '</div>',
        '</div>',
        // Tab 6 — Cuentas bancarias
        '<div id="alta-section-6" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Banco</label><input type="text" id="alt-banco"></div>',
            '<div class="form-group"><label>CBU</label><input type="text" id="alt-cbu"></div>',
          '</div>',
        '</div>',
      '</div>',
      // Footer
      '<div class="modal-footer" style="justify-content:space-between;">',
        '<div>',
          '<button onclick="tabAltaAnterior()" style="padding:6px 14px;border:1px solid #cbd5e1;background:white;border-radius:6px;cursor:pointer;font-size:12px;">← Anterior</button>',
          '<button onclick="tabAltaSiguiente()" style="padding:6px 14px;border:1px solid #cbd5e1;background:white;border-radius:6px;cursor:pointer;font-size:12px;margin-left:4px;">Siguiente →</button>',
        '</div>',
        '<div>',
          '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-alta-nuevo\')">Cancelar</button>',
          '<button class="btn" style="background:#059669;color:white;" onclick="confirmarAlta()">✅ Confirmar Alta</button>',
        '</div>',
      '</div>',
    '</div>',
  ].join('');
}

// ========== ABRIR MODAL ==========

export function abrirModalAlta(psicoIdx, altaId) {
  ensureModal();
  const p = psicoIdx >= 0 ? (DB.psicos || [])[psicoIdx] : null;
  const altaReg = altaId ? (DB.catAltPendientes || []).find(a => a.id === altaId) : null;
  const src = altaReg || p;

  // Limpiar todos los campos
  ['alt-nombre', 'alt-dni', 'alt-cuit', 'alt-clave-fiscal', 'alt-fecnac', 'alt-tel', 'alt-mail',
   'alt-fec-ingreso', 'alt-reingresante-dni', 'alt-direccion', 'alt-banco', 'alt-cbu',
   'alt-calzado', 'alt-integracion', 'alt-inaes', 'alt-art', 'alt-obra-social', 'alt-supervisor'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  const nacEl = $('alt-nac'); if (nacEl) nacEl.value = 'Argentina';
  const ppEl = $('alt-periodo-prueba'); if (ppEl) ppEl.value = '6';
  const reingEl = $('alt-reingresante'); if (reingEl) reingEl.checked = false;
  const egresoRow = $('alt-fec-egreso-row'); if (egresoRow) egresoRow.style.display = 'none';
  const resEl = $('alt-reingresante-resultado'); if (resEl) resEl.innerHTML = '';
  _legajoAnteriorEncontrado = null;

  // Resetear selects
  ['alt-estado-civil', 'alt-genero', 'alt-nac', 'alt-zona', 'alt-localidad', 'alt-funcion', 'alt-categoria',
   'alt-servicio', 'alt-ambo', 'alt-forma-pago', 'alt-seguro'].forEach(id => {
    const el = $(id); if (el) el.selectedIndex = 0;
  });

  // Poblar selects de función y categoría
  poblarSelectsAltas();

  // Pre-cargar datos si viene del flujo psicotécnico
  if (src) {
    $('alta-idx').value = psicoIdx >= 0 ? psicoIdx : '';
    if (altaId) $('modal-alta-nuevo').dataset.altaId = altaId;
    $('alta-nombre-display').textContent = src.nombre;

    // Rastrear candidato original para recuperar datos extra
    const cand = src.candidatoId
      ? (DB.candidatos || []).find(c => c.id == src.candidatoId)
      : null;

    // Tab 0 — Identificación
    const set = (id, v) => { const el = $(id); if (el && v) el.value = v; };
    set('alt-nombre', src.nombre);
    // DNI y tel: el candidato actual tiene prioridad sobre la snapshot (evita datos viejos)
    set('alt-dni', (cand && cand.dni) || src.dni);
    set('alt-tel', (cand && cand.tel) || src.tel);
    // CUIT, fecha nac, email, estado civil: solo existen en el candidato original
    set('alt-cuit', cand && cand.cuit);
    set('alt-fecnac', cand && cand.fecNac);
    set('alt-mail', cand && cand.email);
    const ecEl = $('alt-estado-civil');
    if (ecEl && cand && cand.estadoCivil) ecEl.value = cand.estadoCivil;
    // Direccion: combinar calle + piso del candidato
    const dirCand = cand ? (cand.calle || '') + (cand.piso ? ' ' + cand.piso : '') : '';
    set('alt-direccion', dirCand.trim());
    // Género y nacionalidad: selects, se precargan desde el candidato
    const genAltEl = $('alt-genero');
    if (genAltEl && cand && cand.genero) genAltEl.value = cand.genero;
    const nacAltEl = $('alt-nac');
    if (nacAltEl && cand && cand.nacionalidad) nacAltEl.value = cand.nacionalidad;

    // Tab 1 — Domicilio (zona y localidad del candidato)
    const zona = src.zona || (cand && cand.zona) || '';
    if (zona) {
      const zEl = $('alt-zona');
      if (zEl) { zEl.value = zona; onChangeZonaAlta(); }
      const localidad = cand && cand.localidad;
      if (localidad) {
        const lEl = $('alt-localidad');
        if (lEl) lEl.value = localidad;
      }
    }
  } else {
    $('alta-idx').value = '';
    delete $('modal-alta-nuevo').dataset.altaId;
    $('alta-nombre-display').textContent = 'Nuevo';
  }

  // Calcular integración desde SMVM vigente
  const sv = (DB.smvm || []).find(s => s.vigente);
  if (sv) {
    const integEl = $('alt-integracion'); if (integEl) integEl.value = Math.round(sv.valor * 0.05);
  }

  // Ir al primer tab
  tabAlta(0);
  abrirModal('modal-alta-nuevo');
}

// ========== TABS ==========

export function tabAlta(idx) {
  _altaTabIdx = idx;
  for (let i = 0; i < ALTA_TABS; i++) {
    const section = $('alta-section-' + i);
    const btn = $('alta-tab-btn-' + i);
    if (section) section.style.display = i === idx ? '' : 'none';
    if (btn) {
      btn.style.background = i === idx ? '#059669' : '#e2e8f0';
      btn.style.color = i === idx ? 'white' : '#374151';
    }
  }
}

export function tabAltaSiguiente() {
  if (_altaTabIdx < ALTA_TABS - 1) tabAlta(_altaTabIdx + 1);
}

export function tabAltaAnterior() {
  if (_altaTabIdx > 0) tabAlta(_altaTabIdx - 1);
}

// ========== TOGGLE REINGRESANTE ==========

export function toggleReingresante() {
  const chk = $('alt-reingresante');
  const row = $('alt-fec-egreso-row');
  if (row) row.style.display = chk && chk.checked ? '' : 'none';
  if (!chk || !chk.checked) {
    _legajoAnteriorEncontrado = null;
    const res = $('alt-reingresante-resultado'); if (res) res.innerHTML = '';
    const dniEl = $('alt-reingresante-dni'); if (dniEl) dniEl.value = '';
  }
}

// Busca por DNI (nunca por nombre — hay muchos nombres parecidos) entre
// TODOS los legajos históricos, sean actuales o de baja.
export function buscarLegajoReingresante() {
  const dni = cleanText(($('alt-reingresante-dni') || {}).value || '');
  const res = $('alt-reingresante-resultado');
  if (!res) return;
  if (!dni) { res.innerHTML = '<span style="color:#dc2626;">Ingresá un DNI para buscar</span>'; return; }

  const encontrados = (DB.legajos || []).filter(l => l.dni === dni);
  if (!encontrados.length) {
    _legajoAnteriorEncontrado = null;
    res.innerHTML = '<span style="color:#9a3412;">⚠️ No se encontró ningún legajo anterior con ese DNI</span>';
    return;
  }

  _legajoAnteriorEncontrado = encontrados[encontrados.length - 1];
  res.innerHTML = encontrados.map(l => `
    <div style="background:white;border:1px solid #bae6fd;border-radius:6px;padding:8px 10px;margin-top:4px;">
      <strong>N° ${l.nro}</strong> — ${l.nombre}<br>
      <span style="color:#64748b;">${l.funcion} · ${l.servicio} · Ingreso: ${l.ingreso}${l.fechaBaja ? ' · Baja: ' + l.fechaBaja : ' · (activo)'}</span>
    </div>
  `).join('');
}

// ========== CONFIRMAR ALTA ==========

export function confirmarAlta() {
  // Campos obligatorios por tab
  const tabs = [
    { tab: 0, campos: [
      { id: 'alt-nombre', label: 'Nombre' },
      { id: 'alt-dni', label: 'DNI' },
      { id: 'alt-cuit', label: 'CUIT' },
      { id: 'alt-tel', label: 'Teléfono' },
      { id: 'alt-fec-ingreso', label: 'Fecha de ingreso' },
    ]},
    { tab: 1, campos: [
      { id: 'alt-direccion', label: 'Dirección' },
      { id: 'alt-zona', label: 'Provincia' },
    ]},
    { tab: 2, campos: [
      { id: 'alt-funcion', label: 'Función' },
      { id: 'alt-categoria', label: 'Categoría' },
    ]},
    { tab: 3, campos: [
      { id: 'alt-ambo', label: 'Talle de ambo' },
      { id: 'alt-calzado', label: 'Talle de calzado' },
    ]},
    { tab: 4, campos: [
      { id: 'alt-integracion', label: 'Integración inicial' },
    ]},
    { tab: 5, campos: [
      { id: 'alt-seguro', label: 'Seguro de vida' },
    ]},
  ];
  for (const t of tabs) {
    tabAlta(t.tab);
    if (!validarCampos(t.campos, toast)) return;
  }
  tabAlta(0);

  const nombre = toTitleCase($('alt-nombre').value);
  const dni = cleanText($('alt-dni').value);
  const cuit = cleanText($('alt-cuit').value);
  const tel = cleanText($('alt-tel').value);
  const mail = cleanText(($('alt-mail') || {}).value || '');
  const estadoCivil = ($('alt-estado-civil') || {}).value || '';
  const nac = cleanText(($('alt-nac') || {}).value || 'Argentina');
  const genero = ($('alt-genero') || {}).value || '';
  const fechaIngreso = $('alt-fec-ingreso').value;
  const zona = ($('alt-zona') || {}).value || '';
  const localidad = ($('alt-localidad') || {}).value || '';
  const banco = cleanText(($('alt-banco') || {}).value || '');
  const funcion = ($('alt-funcion') || {}).value || '';
  const servicio = ($('alt-servicio') || {}).value || '— Sin asignar';
  const supervisor = ($('alt-supervisor') || {}).value || '— Sin asignar';
  const periodoPrueba = parseInt(($('alt-periodo-prueba') || {}).value) || 6;
  const calzado = parseInt(($('alt-calzado') || {}).value) || 0;
  const ambo = ($('alt-ambo') || {}).value || '';
  const seguro = ($('alt-seguro') || {}).value || 'Pendiente';
  // Campos agregados (v005): leer del modal para persistir en el legajo
  const direccion = cleanText(($('alt-direccion') || {}).value || '');
  const fecNac = ($('alt-fecnac') || {}).value || '';
  const cbu = cleanText(($('alt-cbu') || {}).value || '');
  const art = cleanText(($('alt-art') || {}).value || '');
  const obraSocial = cleanText(($('alt-obra-social') || {}).value || '');
  const formaPago = ($('alt-forma-pago') || {}).value || '';
  const integracion = parseInt(($('alt-integracion') || {}).value) || 0;
  const categoria = ($('alt-categoria') || {}).value || '';
  const claveFiscal = cleanText(($('alt-clave-fiscal') || {}).value || '');
  const inaes = cleanText(($('alt-inaes') || {}).value || '');

  // Guard de DNI duplicado (CLAUDE.md conocidos: no existía ninguna
  // validación acá, a diferencia de guardarEdicionLegajo). Un legajo
  // Activo con el mismo DNI siempre bloquea. Uno de baja solo bloquea si
  // no se vinculó como reingreso (checkbox + búsqueda por DNI arriba) —
  // el flujo de reingresante sigue creando un legajo nuevo a propósito,
  // así que ese caso puntual queda permitido.
  const legajosConMismoDni = (DB.legajos || []).filter(l => l.dni === dni);
  const activoConMismoDni = legajosConMismoDni.find(l => l.estado === 'Activo');
  if (activoConMismoDni) {
    toast(`⚠️ Ya existe un legajo activo (N° ${activoConMismoDni.nro} — ${activoConMismoDni.nombre}) con ese DNI`);
    tabAlta(0);
    return;
  }
  const bajaSinVincular = legajosConMismoDni.find(l => l.estado !== 'Activo' && (!_legajoAnteriorEncontrado || l.nro !== _legajoAnteriorEncontrado.nro));
  if (bajaSinVincular) {
    toast(`⚠️ Ya existe un legajo de baja (N° ${bajaSinVincular.nro} — ${bajaSinVincular.nombre}) con ese DNI. Si es un reingreso, tildá "¿Es reingresante?" y buscalo por DNI antes de confirmar.`);
    tabAlta(0);
    return;
  }

  // Generar número de socio (max + 1)
  const maxNro = (DB.legajos || []).reduce((m, l) => Math.max(m, l.nro || 0), 0);
  const nro = maxNro + 1;

  // Formatear fecha dd/mm/aaaa
  const fIngreso = fechaIngreso ? new Date(fechaIngreso).toLocaleDateString('es-AR') : '';

  const legajo = {
    nro,
    nombre,
    dni,
    funcion: funcion || 'Operario',
    servicio: servicio,
    supervisor: supervisor,
    ingreso: fIngreso,
    estado: 'Activo',
    estadoLegal: '',
    estadoMedico: '',
    fechaBaja: '',
    // Si es reingresante y se encontró su legajo anterior por DNI, la fecha
    // de esta alta ES la reincorporación, y se guarda el N° de legajo previo
    // para trazabilidad.
    fechaReincorp: _legajoAnteriorEncontrado ? fIngreso : '',
    legajoAnteriorNro: _legajoAnteriorEncontrado ? _legajoAnteriorEncontrado.nro : null,
    seguro,
    localidad,
    tel,
    mail,
    cuit,
    claveFiscal,
    inaes,
    estadoCivil,
    nac,
    genero,
    banco,
    calzado,
    ambo,
    periodoPrueba,
    fechaIngresoPrueba: fechaIngreso,
    adjuntosLegal: [],
    adjuntosMedico: [],
    direccion,
    fecNac,
    zona,
    cbu,
    art,
    obraSocial,
    formaPago,
    integracion,
    categoria,
  };

  DB.legajos.push(legajo);
  supaSync('legajos', legajo);

  // Uniformes: al dar de alta con talle de ambo/calzado cargado, se
  // genera sola una entrega "Pendiente" (por entregar) — Gabi no tiene
  // que volver a cargar algo que ya se supo en el alta. Indirección por
  // window para no crear un import cruzado entre módulos.
  if (window.crearEntregaUniformeDesdeAlta) window.crearEntregaUniformeDesdeAlta(legajo);

  // Actualizar estado del psicotécnico si viene de ahí
  const psicoIdx = parseInt(($('alta-idx') || {}).value);
  if (!isNaN(psicoIdx) && DB.psicos[psicoIdx]) {
    DB.psicos[psicoIdx].estado = 'Ingreso';
    supaSync('psicos', DB.psicos[psicoIdx]);
  }

  // Marcar registro de catAltPendientes como completado
  const modal = $('modal-alta-nuevo');
  const altaId = modal && modal.dataset.altaId ? parseInt(modal.dataset.altaId) : null;
  if (altaId) {
    const altaReg = (DB.catAltPendientes || []).find(a => a.id === altaId);
    if (altaReg) {
      // Deja copia histórica de lo que se cargó en cada tab del modal — antes
      // se descartaba y solo quedaba lo que terminó en el legajo.
      altaReg.identificacion = { nombre, dni, cuit, tel, mail, estadoCivil, nac, genero, fecNac, fechaIngreso: fIngreso };
      altaReg.domicilio = { direccion, zona, localidad };
      altaReg.operativo = { funcion, servicio, supervisor, periodoPrueba, categoria };
      altaReg.uniforme = { ambo, calzado };
      altaReg.capital = { integracion, formaPago };
      altaReg.seguros = { seguro, art, obraSocial };
      altaReg.cuentaBancaria = { banco, cbu };
      altaReg.estado = 'Alta completada';
      supaSync('catAltPendientes', altaReg);
    }
    delete modal.dataset.altaId;
  }

  cerrarModal('modal-alta-nuevo');
  renderAltas();
  toast('✅ Alta confirmada — Legajo N°' + nro + ' creado para ' + nombre);
}

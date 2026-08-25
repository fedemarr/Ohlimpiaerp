import { DB, LOCALIDADES_BA, BARRIOS_CABA, PARTIDOS_LOCALIDADES, LOCALIDAD_A_PARTIDO } from '@shared/state.js';
import { getSupervisorDeCodigo } from '@modules/servicios_supervisor/index.js';
import { $, avatarEl, badge, cleanText, toTitleCase, validarCampos, fillSelect, applyTitleCase, cbuValido } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { subirAdjunto, listarAdjuntos, obtenerUrlFirmada, borrarAdjunto, MAX_SIZE } from '@shared/adjuntos.js';
import { SECTORES_ADMIN } from '@modules/legajos/index.js';
import { TALLES_POR_PRENDA } from '@modules/uniformes/catalogos.js';
import { calcularFechaAltaObraSocialISO } from '@shared/obraSocial.js';

// ========== ESTADO INTERNO ==========

let _altaTabIdx = 0;
const ALTA_TABS = 8;
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
  // Función: se achica a solo estas 2 opciones (ticket Sistemas) — antes
  // compartía la lista completa de DB.categorias + Runner/Franquero.
  // Categoría se queda con el catálogo completo y ahora suma Runner y
  // Franquero (se mudan acá desde Función). Legajos ya cargados con un
  // valor de función viejo (p.ej. "Referente", "Encargado A") NO se
  // migran ni se pierden — es texto libre en Supabase, sin enum/CHECK —
  // solo cambia qué se puede elegir de acá en adelante.
  fillSelect('alt-funcion', ['Operario/a', 'Administrativo'], ['— Seleccionar —']);
  fillSelect('alt-categoria', [...DB.categorias, 'Runner', 'Franquero'], ['— Seleccionar —']);
  // Poblar servicios — mismo helper que usa el resto de los módulos
  // migrados (window.obtenerServiciosActivos, definido en src/legacy.js:
  // objetivos con estado 'Operativo' + fallback legacy DB.servicios).
  // Antes filtraba acá mismo por estado==='Activo', un valor que ningún
  // objetivo tiene nunca (el estado real del ciclo de vida es
  // 'Presupuestado' → 'Pendiente asignación operativa' → 'Operativo' →
  // 'Baja'), así que el select quedaba siempre vacío.
  const servEl = $('alt-servicio');
  if (servEl) {
    const codigos = window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : [];
    // "Administrativo" es un valor especial, no un objetivo de cliente —
    // se ofrece a mano acá para poder marcar personal administrativo
    // desde el alta (antes solo se podía tipear a mano en Editar legajo,
    // un paso extra que además destrababa recién ahí el campo Sector,
    // necesario para poder cargar vacaciones).
    servEl.innerHTML = '<option value="">— Sin asignar —</option>'
      + '<option value="Administrativo">Administrativo</option>'
      + codigos.map(c => '<option value="' + c + '">' + c + '</option>').join('');
  }
  fillSelect('alt-sector', SECTORES_ADMIN);
}

export function onChangeServicioAlta() {
  const codigo = ($('alt-servicio') || {}).value || '';
  const supEl = $('alt-supervisor');
  if (!supEl) return;
  if (!codigo || codigo === 'Administrativo') { supEl.value = ''; return; }
  // El helper central (servicios_supervisor.js) prioriza el objetivo
  // comercial Operativo (DB.objetivos, fuente autoritativa) y cae a
  // DB.serviciosSupervisor (Configuración → Servicios, sql/v067) cuando el
  // código todavía no tiene un objetivo real cargado.
  supEl.value = getSupervisorDeCodigo(codigo);
}

// ========== ZONA ==========

// Ticket "Corrección" (08/2026): el select "Localidad" mostraba
// LOCALIDADES_BA — que a pesar del nombre es la lista de los 41 PARTIDOS
// de la provincia (ver el comentario en state.js, arriba de
// PARTIDOS_LOCALIDADES) — mientras que "Partido" era un input de texto
// libre sin ninguna relación con eso. En los hechos: se estaba mostrando
// el partido adentro del campo Localidad, y Localidad (la ciudad/barrio
// real dentro del partido) no se pedía en ningún lado.
//
// Mismo cascade Zona → Partido → Localidad que ya se armó para Candidatos
// (candidatos.js, onChangeZonaCand/onChangePartidoCand/onChangeLocalidadCand)
// — se replica acá en vez de compartir función porque los ids de los
// campos son distintos (alt-* vs c-*) y el de Candidatos ya tiene su
// propia lógica de zonas de residencia (Norte/Sur/Oeste) que Altas no usa
// (acá "Provincia" es solo CABA / Buenos Aires).
const TODAS_LAS_LOCALIDADES_ALTA = Object.keys(LOCALIDAD_A_PARTIDO).sort((a, b) => a.localeCompare(b, 'es'));

export function onChangeZonaAlta() {
  const zona = $('alt-zona');
  const part = $('alt-partido');
  const loc = $('alt-localidad');
  if (!zona || !part || !loc) return;
  if (zona.value === 'CABA') {
    part.innerHTML = '<option value="">No aplica (CABA)</option>';
    part.disabled = true; part.style.opacity = '0.6';
    loc.disabled = false; loc.style.opacity = '1';
    loc.innerHTML = '<option value="">Seleccionar barrio...</option>' + BARRIOS_CABA.map(b => '<option>' + b + '</option>').join('');
  } else if (zona.value === 'Buenos Aires') {
    part.disabled = false; part.style.opacity = '1';
    part.innerHTML = '<option value="">Seleccionar...</option>' + LOCALIDADES_BA.map(l => '<option>' + l + '</option>').join('');
    loc.disabled = false; loc.style.opacity = '1';
    loc.innerHTML = '<option value="">Seleccionar...</option>' + TODAS_LAS_LOCALIDADES_ALTA.map(l => '<option>' + l + '</option>').join('');
  } else {
    part.innerHTML = '<option value="">Seleccionar zona primero</option>';
    part.disabled = true; part.style.opacity = '0.6';
    loc.innerHTML = '<option value="">Seleccionar zona primero</option>';
    loc.disabled = true; loc.style.opacity = '0.6';
  }
}

// Elegiste la Localidad directamente (sin pasar por Partido primero) —
// autocompleta el Partido a partir de LOCALIDAD_A_PARTIDO.
export function onChangeLocalidadAlta() {
  const loc = $('alt-localidad');
  const part = $('alt-partido');
  if (!loc || !part || part.disabled) return; // CABA: no hay partido que completar
  const partido = LOCALIDAD_A_PARTIDO[loc.value];
  if (partido) part.value = partido;
}

export function onChangePartidoAlta() {
  const part = $('alt-partido');
  const loc = $('alt-localidad');
  if (!part || !loc) return;
  const localidades = PARTIDOS_LOCALIDADES[part.value];
  // Sin partido elegido (volvió a "Seleccionar..."): vuelve a mostrar
  // todas las localidades del conurbano, no las deshabilita.
  loc.disabled = false; loc.style.opacity = '1';
  loc.innerHTML = '<option value="">Seleccionar...</option>' + (localidades || TODAS_LAS_LOCALIDADES_ALTA).map(l => '<option>' + l + '</option>').join('');
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
          '<button onclick="tabAlta(7)" id="alta-tab-btn-7" style="padding:6px 12px;border:none;background:#e2e8f0;color:#374151;font-size:12px;border-radius:6px;cursor:pointer;">📄 Constancia MT</button>',
        '</div>',
        // Tab 0 — Identificación
        '<div id="alta-section-0">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group" style="grid-column:1/-1;"><label>Nombre completo *</label><input type="text" id="alt-nombre" onblur="applyTitleCase(\'alt-nombre\')"></div>',
            '<div class="form-group"><label>DNI *</label><input type="text" id="alt-dni"></div>',
            '<div class="form-group"><label>CUIT *</label><input type="text" id="alt-cuit" placeholder="XX-XXXXXXXX-X"></div>',
            '<div class="form-group"><label>Clave fiscal (ARCA)</label><input type="text" id="alt-clave-fiscal" placeholder="Opcional"></div>',
            '<div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="alt-fecnac"></div>',
            '<div class="form-group"><label>Nacionalidad</label><select id="alt-nac" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option>Argentina</option><option>Boliviana</option><option>Paraguaya</option><option>Peruana</option><option>Uruguaya</option><option>Chilena</option><option>Brasileña</option><option>Venezolana</option><option>Otra</option></select></div>',
            '<div class="form-group"><label>Estado civil</label><select id="alt-estado-civil" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option>Soltero/a</option><option>Casado/a</option><option>Divorciado/a</option><option>Viudo/a</option><option>Conviviente</option></select></div>',
            '<div class="form-group"><label>Género</label><select id="alt-genero" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">—</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></div>',
            '<div class="form-group"><label>Teléfono *</label><input type="text" id="alt-tel"></div>',
            '<div class="form-group"><label>Email</label><input type="email" id="alt-mail"></div>',
            '<div class="form-group"><label>Fecha de ingreso *</label><input type="date" id="alt-fec-ingreso" onchange="recalcularInicioObraSocial()"></div>',
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
            '<div class="form-group"><label>Partido</label><select id="alt-partido" onchange="onChangePartidoAlta()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar zona primero</option></select></div>',
            '<div class="form-group"><label>Localidad</label><select id="alt-localidad" onchange="onChangeLocalidadAlta()" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar zona primero</option></select></div>',
            '<div class="form-group"><label>Código Postal</label><input type="text" id="alt-cod-postal" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"></div>',
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
            '<div class="form-group"><label>Sector <span style="font-weight:400;color:var(--texto-suave);">(personal administrativo)</span></label><select id="alt-sector" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">— No aplica —</option></select></div>',
          '</div>',
        '</div>',
        // Tab 3 — Uniforme
        '<div id="alta-section-3" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Talle de ambo *</label><select id="alt-ambo" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option>' + TALLES_POR_PRENDA.Ambo.map(t => '<option>' + t + '</option>').join('') + '</select></div>',
            '<div class="form-group"><label>Talle de calzado *</label><input type="number" id="alt-calzado" min="34" max="48"></div>',
          '</div>',
          // Chomba/Grafa(pantalón)/Buzo/Campera/Gorra (ticket "Uniforme"
          // 08/2026) — opcionales (a diferencia de ambo/calzado, que ya
          // eran obligatorios antes de este ticket y se dejan igual).
          // Talles vía TALLES_POR_PRENDA (uniformes/catalogos.js), mismo
          // catálogo que usa el módulo Uniformes — una sola fuente de
          // verdad en vez de repetir listas de talles acá.
          '<div class="form-grid form-grid-2" style="margin-top:8px;">',
            '<div class="form-group"><label>Talle de chomba</label><select id="alt-talle-chomba" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option>' + TALLES_POR_PRENDA.Chomba.map(t => '<option>' + t + '</option>').join('') + '</select></div>',
            '<div class="form-group"><label>Talle de pantalón (grafa)</label><select id="alt-talle-grafa" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option>' + TALLES_POR_PRENDA.Grafa.map(t => '<option>' + t + '</option>').join('') + '</select></div>',
            '<div class="form-group"><label>Talle de buzo</label><select id="alt-talle-buzo" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option>' + TALLES_POR_PRENDA.Buzo.map(t => '<option>' + t + '</option>').join('') + '</select></div>',
            '<div class="form-group"><label>Talle de campera</label><select id="alt-talle-campera" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option>' + TALLES_POR_PRENDA.Campera.map(t => '<option>' + t + '</option>').join('') + '</select></div>',
            '<div class="form-group"><label>Gorra</label><select id="alt-talle-gorra" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option>' + TALLES_POR_PRENDA.Gorra.map(t => '<option>' + t + '</option>').join('') + '</select></div>',
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
            '<div class="form-group"><label>Seguro de vida *</label><select id="alt-seguro" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;"><option value="">Seleccionar...</option><option>Completo</option><option>Básico</option></select></div>',
            '<div class="form-group"><label>Obra social</label><input type="text" id="alt-obra-social"></div>',
            '<div class="form-group"><label>Inicio de trámite (auto, ingreso +3 meses)</label><input type="date" id="alt-os-inicio"></div>',
          '</div>',
          // Pólizas: un asociado puede tener varias. Reemplaza el viejo
          // input único (que guardaba en legajo.art / columna art — se
          // mantiene esa columna solo por compatibilidad con legajos
          // existentes, ver confirmarAlta()). Cada fila se agrega/saca del
          // DOM directamente, sin manejar índices/contador — eliminarFilaPoliza
          // usa closest() sobre el propio botón clickeado.
          '<div class="form-group" style="margin-top:12px;">',
            '<label>Pólizas</label>',
            '<div id="alt-polizas-lista"></div>',
            '<button type="button" class="btn btn-secondary btn-sm" onclick="agregarFilaPoliza()" style="margin-top:6px;">+ Agregar póliza</button>',
          '</div>',
          // PDF de la póliza (documento único, distinto de la lista de N°/
          // vencimiento de arriba). Reutiliza el bucket privado + tabla
          // `adjuntos` (src/shared/adjuntos.js), etapa 'alta', tipo
          // 'poliza-seguro' (sql/v066). Se sube apenas se elige el archivo
          // (no espera a "Confirmar Alta"), igual que el resto de los
          // adjuntos del sistema — por eso alcanza con tener el DNI cargado
          // (tab 0), no hace falta que el legajo ya exista.
          '<div class="form-group" style="margin-top:12px;border:1px dashed #93c5fd;border-radius:8px;padding:12px;background:#eff6ff;">',
            '<label style="font-weight:600;color:#1e3a8a;">📎 Póliza de seguro (PDF)</label>',
            '<div id="alt-poliza-pdf-lista" style="margin-top:8px;font-size:13px;color:#64748b;">Sin PDF cargado</div>',
            '<input type="file" id="alt-poliza-pdf-file" accept="application/pdf" style="display:none;" onchange="seleccionarArchivoPolizaAlta()">',
            '<button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById(\'alt-poliza-pdf-file\').click()" style="margin-top:8px;">⬆️ Subir PDF de la póliza</button>',
          '</div>',
        '</div>',
        // Tab 6 — Cuentas bancarias
        '<div id="alta-section-6" style="display:none;">',
          '<div class="form-grid form-grid-2">',
            '<div class="form-group"><label>Banco</label><input type="text" id="alt-banco"></div>',
            '<div class="form-group"><label>CBU</label><input type="text" id="alt-cbu" maxlength="22" inputmode="numeric" placeholder="22 dígitos"></div>',
          '</div>',
        '</div>',
        // Tab 7 — Constancia MT (ticket "Constancia" 08/2026). Reutiliza el
        // bucket privado + tabla `adjuntos` (src/shared/adjuntos.js), etapa
        // 'alta', tipo 'monotributo' — ese tipo ya existía en el CHECK de
        // la tabla desde v011 ("Etapa alta, obligatorio") pero nunca se
        // había cableado en ningún lado del formulario: sin migración
        // nueva acá, sólo hacía falta esta pantalla.
        '<div id="alta-section-7" style="display:none;">',
          '<div style="border:1px dashed #93c5fd;border-radius:8px;padding:12px;background:#eff6ff;">',
            '<label style="font-weight:600;color:#1e3a8a;">📎 Constancia de alta de Monotributo (PDF)</label>',
            '<div id="alt-mt-adjunto-lista" style="margin-top:8px;font-size:13px;color:#64748b;">Sin PDF cargado</div>',
            '<input type="file" id="alt-mt-adjunto-file" accept="application/pdf" style="display:none;" onchange="seleccionarArchivoConstanciaMtAlta()">',
            '<button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById(\'alt-mt-adjunto-file\').click()" style="margin-top:8px;">⬆️ Subir constancia</button>',
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
          // Texto y acción se setean dinámicamente en tabAlta(): "Siguiente →"
          // en todas las tabs salvo la última, "✅ Confirmar Alta" recién ahí
          // (finaliza de verdad). Antes decía "Confirmar Alta" en todas las
          // tabs aunque clickearlo en cualquiera de ellas finalizaba el alta
          // directamente — daba la falsa impresión de que confirmar era
          // "otro paso más" durante una carga rápida.
          '<button class="btn" id="alta-btn-cta" style="background:#059669;color:white;">✅ Confirmar Alta</button>',
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
   'alt-fec-ingreso', 'alt-reingresante-dni', 'alt-direccion', 'alt-cod-postal',
   'alt-banco', 'alt-cbu', 'alt-calzado', 'alt-integracion', 'alt-inaes', 'alt-os-inicio',
   'alt-obra-social', 'alt-supervisor'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  // Pólizas: arranca con una fila vacía (no obliga a clickear "+" antes de
  // poder cargar la primera).
  const polizasCont = $('alt-polizas-lista');
  if (polizasCont) polizasCont.innerHTML = '';
  agregarFilaPoliza();
  const nacEl = $('alt-nac'); if (nacEl) nacEl.value = 'Argentina';
  const ppEl = $('alt-periodo-prueba'); if (ppEl) ppEl.value = '6';
  const reingEl = $('alt-reingresante'); if (reingEl) reingEl.checked = false;
  const egresoRow = $('alt-fec-egreso-row'); if (egresoRow) egresoRow.style.display = 'none';
  const resEl = $('alt-reingresante-resultado'); if (resEl) resEl.innerHTML = '';
  _legajoAnteriorEncontrado = null;

  // Resetear selects
  ['alt-estado-civil', 'alt-genero', 'alt-nac', 'alt-zona', 'alt-localidad', 'alt-funcion', 'alt-categoria',
   'alt-servicio', 'alt-sector', 'alt-ambo', 'alt-forma-pago', 'alt-seguro',
   'alt-talle-chomba', 'alt-talle-grafa', 'alt-talle-buzo', 'alt-talle-campera', 'alt-talle-gorra'].forEach(id => {
    const el = $(id); if (el) el.selectedIndex = 0;
  });
  // Partido/Localidad al estado "sin zona elegida todavía" — se
  // reconstruyen de nuevo más abajo si src trae una zona precargada.
  onChangeZonaAlta();
  // Poblar selects de función y categoría
  poblarSelectsAltas();

  // Pre-cargar datos si viene del flujo psicotécnico
  if (src) {
    $('alta-idx').value = psicoIdx >= 0 ? psicoIdx : '';
    if (altaId) $('modal-alta-nuevo').dataset.altaId = altaId;
    $('alta-nombre-display').textContent = src.nombre;

    // Rastrear candidato original para recuperar datos extra — se matchea
    // por DNI, no por candidatoId (mismo criterio ya usado en psico/
    // preocup/docum, ver CLAUDE.md "Conciliación entre etapas por
    // candidatoId truncado"): id_local trunca a 9 dígitos al persistir en
    // Supabase, mientras que candidatoId quedó guardado con el Date.now()
    // completo de 13 dígitos en catAltPendientes — tras un reload dejan de
    // matchear y la precarga se salteaba en silencio.
    const cand = src.dni
      ? (DB.candidatos || []).find(c => c.dni === src.dni)
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

    // Tab 1 — Domicilio (zona/partido/localidad del candidato) — mismo
    // criterio de precarga que editarCandidato() en candidatos.js.
    const zona = src.zona || (cand && cand.zona) || '';
    if (zona) {
      const zEl = $('alt-zona');
      if (zEl) { zEl.value = zona; onChangeZonaAlta(); }
      const partEl = $('alt-partido');
      const lEl = $('alt-localidad');
      if (partEl && !partEl.disabled) {
        if (cand && cand.partido) {
          partEl.value = cand.partido;
          onChangePartidoAlta();
          if (lEl && cand.localidad) lEl.value = cand.localidad;
        } else if (cand && PARTIDOS_LOCALIDADES[cand.localidad]) {
          // Compat con candidatos cargados antes del selector en cascada:
          // el valor guardado en "localidad" era en realidad el partido.
          partEl.value = cand.localidad;
          onChangePartidoAlta();
        }
      } else if (lEl && cand && cand.localidad) {
        // CABA: Localidad = barrio directo, sin partido de por medio.
        lEl.value = cand.localidad;
      }
    }

    // Tab 3 — Uniforme, cargado en Documentación de ingreso (ticket
    // "Uniforme" 08/2026) — altaReg.uniforme es el único snapshot de tab
    // que hoy se precarga al reabrir una alta pendiente (el resto,
    // identificacion/domicilio/operativo/capital/seguros, se sigue
    // completando desde cand como siempre, no desde el snapshot). altaReg
    // solo existe si se vino con altaId (no si src es un psico p suelto).
    const uniformePrevio = (altaReg && altaReg.uniforme) || {};
    [['alt-ambo', 'ambo'], ['alt-calzado', 'calzado'], ['alt-talle-chomba', 'chomba'], ['alt-talle-grafa', 'grafa'],
     ['alt-talle-buzo', 'buzo'], ['alt-talle-campera', 'campera'], ['alt-talle-gorra', 'gorra']].forEach(([id, key]) => {
      const el = $(id); if (el && uniformePrevio[key]) el.value = uniformePrevio[key];
    });
  } else {
    $('alta-idx').value = '';
    delete $('modal-alta-nuevo').dataset.altaId;
    $('alta-nombre-display').textContent = 'Nuevo';
  }

  // Póliza + Constancia MT (PDF): se buscan por el DNI que quedó cargado
  // arriba (mismo dni sea alta nueva o reapertura de una "Pendiente de
  // alta") — si ya se habían subido antes, aparecen de nuevo acá.
  const dniActual = ($('alt-dni') || {}).value || '';
  cargarAdjuntoPolizaAlta(dniActual);
  cargarAdjuntoConstanciaMtAlta(dniActual);

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
  // Botón principal del footer: "Siguiente" mientras queden tabs por
  // delante, "Confirmar Alta" (finaliza de verdad) solo en la última.
  const btnCta = $('alta-btn-cta');
  if (btnCta) {
    const esUltimoTab = idx === ALTA_TABS - 1;
    btnCta.textContent = esUltimoTab ? '✅ Confirmar Alta' : 'Siguiente →';
    btnCta.onclick = esUltimoTab ? confirmarAlta : tabAltaSiguiente;
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

// ========== PÓLIZAS (múltiples, filas dinámicas) ==========

// Agrega una fila de póliza al bloque de Seguros. Sin parámetros = fila
// vacía nueva (botón "+ Agregar póliza"); con parámetros se usa para
// precargar (no hay caso de uso hoy, pero deja la función reutilizable).
export function agregarFilaPoliza(numero, vencimiento) {
  const cont = $('alt-polizas-lista');
  if (!cont) return;
  const fila = document.createElement('div');
  fila.className = 'alt-poliza-fila';
  fila.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;';
  fila.innerHTML = [
    '<input type="text" class="alt-poliza-numero" placeholder="N° de póliza" value="' + (numero || '') + '" style="flex:2;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
    '<input type="date" class="alt-poliza-vencimiento" value="' + (vencimiento || '') + '" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">',
    '<button type="button" onclick="eliminarFilaPoliza(this)" style="padding:6px 10px;border:none;background:#fef2f2;color:#dc2626;border-radius:6px;cursor:pointer;font-size:13px;" title="Eliminar póliza">✕</button>',
  ].join('');
  cont.appendChild(fila);
}

// Saca la fila a la que pertenece el botón clickeado — no hace falta
// manejar un índice/contador de filas.
export function eliminarFilaPoliza(btn) {
  const fila = btn.closest ? btn.closest('.alt-poliza-fila') : null;
  if (fila) fila.remove();
}

// Junta las filas cargadas en un array [{numero, vencimiento}], descartando
// las que quedaron totalmente vacías (no hace falta que el usuario las
// borre a mano si no las llegó a usar).
function leerPolizas() {
  const filas = document.querySelectorAll('#alt-polizas-lista .alt-poliza-fila');
  return [...filas]
    .map(fila => ({
      numero: cleanText((fila.querySelector('.alt-poliza-numero') || {}).value || ''),
      vencimiento: (fila.querySelector('.alt-poliza-vencimiento') || {}).value || '',
    }))
    .filter(p => p.numero || p.vencimiento);
}

// ========== PÓLIZA DE SEGURO — PDF ==========
// Documento único por asociado (a diferencia de la lista de N°/vencimiento
// de arriba, que admite varias filas) — reutiliza el bucket privado + tabla
// `adjuntos` (src/shared/adjuntos.js), etapa 'alta', tipo 'poliza-seguro'
// (sql/v066). Subir uno nuevo invalida (vigente=false) el anterior — mismo
// comportamiento que el resto de los tipos no-historial en subirAdjunto,
// así que "reemplazar" es simplemente volver a subir.

async function cargarAdjuntoPolizaAlta(dni) {
  const cont = $('alt-poliza-pdf-lista');
  if (!cont) return;
  if (!dni) { cont.innerHTML = '<span style="color:#94a3b8;">Sin PDF cargado</span>'; return; }
  cont.innerHTML = 'Cargando…';
  const lista = await listarAdjuntos({ dni, etapa: 'alta', tipo: 'poliza-seguro' });
  if (!lista.length) {
    cont.innerHTML = '<span style="color:#94a3b8;">Sin PDF cargado</span>';
    return;
  }
  const a = lista[0];
  cont.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">'
    + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ' + (a.nombreArchivo || 'Archivo') + '</span>'
    + '<button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="verAdjuntoPolizaAlta(\'' + a.url + '\')">👁️ Ver</button>'
    + '<button type="button" class="btn" style="background:#dc2626;color:white;padding:4px 8px;font-size:12px;" onclick="eliminarAdjuntoPolizaAlta(\'' + a.id + '\',\'' + dni + '\')">🗑️</button>'
    + '</div>';
}

export async function seleccionarArchivoPolizaAlta() {
  const input = $('alt-poliza-pdf-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const dni = cleanText(($('alt-dni') || {}).value || '');
  if (!dni) {
    toast('⚠️ Ingresá el DNI del asociado (tab Identificación) antes de subir la póliza');
    if (input) input.value = '';
    return;
  }
  // Validación rápida en cliente (tipo + tamaño) antes de intentar subir —
  // subirAdjunto() la repite del lado seguro (no confiamos solo en el
  // accept="application/pdf" del input, que no bloquea nada por sí solo).
  if (file.type !== 'application/pdf') {
    toast('⚠️ Solo se acepta PDF');
    if (input) input.value = '';
    return;
  }
  if (file.size > MAX_SIZE) {
    toast('⚠️ El archivo (' + (file.size / 1024 / 1024).toFixed(1) + ' MB) supera el límite de 10 MB');
    if (input) input.value = '';
    return;
  }
  const cont = $('alt-poliza-pdf-lista');
  if (cont) cont.innerHTML = 'Subiendo…';
  try {
    await subirAdjunto({ dni, etapa: 'alta', tipo: 'poliza-seguro', file });
    toast('📎 Póliza subida');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Error al subir el archivo'));
  } finally {
    if (input) input.value = '';
  }
  cargarAdjuntoPolizaAlta(dni);
}

export async function verAdjuntoPolizaAlta(path) {
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

export async function eliminarAdjuntoPolizaAlta(id, dni) {
  if (!confirm('¿Eliminar el PDF de la póliza?')) return;
  const ok = await borrarAdjunto(id);
  toast(ok ? '🗑️ PDF eliminado' : '⚠️ No se pudo eliminar');
  cargarAdjuntoPolizaAlta(dni);
}

// ========== CONSTANCIA DE ALTA DE MONOTRIBUTO — PDF ==========
// Mismo patrón que la póliza de seguro (arriba): documento único por
// asociado, etapa 'alta', tipo 'monotributo' — ese tipo ya existía en el
// CHECK de `adjuntos` desde v011 (estaba pensado para esto exactamente,
// "Etapa alta, obligatorio") pero nunca se había cableado en el
// formulario. Subir uno nuevo invalida (vigente=false) el anterior, así
// que "reemplazar" es simplemente volver a subir.

async function cargarAdjuntoConstanciaMtAlta(dni) {
  const cont = $('alt-mt-adjunto-lista');
  if (!cont) return;
  if (!dni) { cont.innerHTML = '<span style="color:#94a3b8;">Sin PDF cargado</span>'; return; }
  cont.innerHTML = 'Cargando…';
  const lista = await listarAdjuntos({ dni, etapa: 'alta', tipo: 'monotributo' });
  if (!lista.length) {
    cont.innerHTML = '<span style="color:#94a3b8;">Sin PDF cargado</span>';
    return;
  }
  const a = lista[0];
  cont.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">'
    + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ' + (a.nombreArchivo || 'Archivo') + '</span>'
    + '<button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="verAdjuntoConstanciaMtAlta(\'' + a.url + '\')">👁️ Ver</button>'
    + '<button type="button" class="btn" style="background:#dc2626;color:white;padding:4px 8px;font-size:12px;" onclick="eliminarAdjuntoConstanciaMtAlta(\'' + a.id + '\',\'' + dni + '\')">🗑️</button>'
    + '</div>';
}

export async function seleccionarArchivoConstanciaMtAlta() {
  const input = $('alt-mt-adjunto-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const dni = cleanText(($('alt-dni') || {}).value || '');
  if (!dni) {
    toast('⚠️ Ingresá el DNI del asociado (tab Identificación) antes de subir la constancia');
    if (input) input.value = '';
    return;
  }
  // Validación rápida en cliente (tipo + tamaño) antes de intentar subir —
  // subirAdjunto() la repite del lado seguro (no confiamos solo en el
  // accept="application/pdf" del input, que no bloquea nada por sí solo).
  if (file.type !== 'application/pdf') {
    toast('⚠️ Solo se acepta PDF');
    if (input) input.value = '';
    return;
  }
  if (file.size > MAX_SIZE) {
    toast('⚠️ El archivo (' + (file.size / 1024 / 1024).toFixed(1) + ' MB) supera el límite de 10 MB');
    if (input) input.value = '';
    return;
  }
  const cont = $('alt-mt-adjunto-lista');
  if (cont) cont.innerHTML = 'Subiendo…';
  try {
    await subirAdjunto({ dni, etapa: 'alta', tipo: 'monotributo', file });
    toast('📎 Constancia de Monotributo subida');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Error al subir el archivo'));
  } finally {
    if (input) input.value = '';
  }
  cargarAdjuntoConstanciaMtAlta(dni);
}

export async function verAdjuntoConstanciaMtAlta(path) {
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

export async function eliminarAdjuntoConstanciaMtAlta(id, dni) {
  if (!confirm('¿Eliminar el PDF de la constancia de Monotributo?')) return;
  const ok = await borrarAdjunto(id);
  toast(ok ? '🗑️ PDF eliminado' : '⚠️ No se pudo eliminar');
  cargarAdjuntoConstanciaMtAlta(dni);
}

// ========== OBRA SOCIAL — INICIO DE TRÁMITE (auto, ingreso + desfase) ==========

// Mismo patrón que recalcularVencAntec()/recalcularVencLibreta() en el
// módulo Documentación de ingreso (aritmética con setMonth), pero acá el
// campo destino queda editable — se recalcula al cambiar la fecha de
// ingreso, y el usuario puede corregirlo a mano después si hace falta.
// El desfase en sí (+3 meses) vive centralizado en shared/obraSocial.js —
// también lo usa la columna "Mes de alta" del listado de Legajos.
export function recalcularInicioObraSocial() {
  const fechaEl = $('alt-fec-ingreso');
  const osEl = $('alt-os-inicio');
  if (!fechaEl || !osEl) return;
  const f = fechaEl.value;
  if (!f) { osEl.value = ''; return; }
  osEl.value = calcularFechaAltaObraSocialISO(f);
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

  // Pólizas duplicadas: dos filas con el mismo N° (no vacío) no tiene
  // sentido, seguramente sea un error de carga. Las filas vacías no llegan
  // acá — leerPolizas() ya las descarta.
  const numerosPoliza = leerPolizas().map(p => p.numero).filter(Boolean);
  const numeroRepetido = numerosPoliza.find((n, i) => numerosPoliza.indexOf(n) !== i);
  if (numeroRepetido) {
    toast(`⚠️ Hay más de una póliza cargada con el N° "${numeroRepetido}"`);
    tabAlta(5);
    return;
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
  const partido = cleanText(($('alt-partido') || {}).value || '');
  const codigoPostal = cleanText(($('alt-cod-postal') || {}).value || '');
  const banco = cleanText(($('alt-banco') || {}).value || '');
  const funcion = ($('alt-funcion') || {}).value || '';
  const servicio = ($('alt-servicio') || {}).value || '— Sin asignar';
  const supervisor = ($('alt-supervisor') || {}).value || '— Sin asignar';
  // Sector — campo independiente, siempre visible (no depende de qué se
  // haya elegido en Función/Servicio: "Auxiliar administrativo" o
  // "Coordinador de área" son valores de FUNCIÓN, no de servicio, así
  // que atarlo a servicio==='Administrativo' dejaba a la mayoría de las
  // altas administrativas sin sector igual). Opcional — si queda sin
  // elegir, se puede completar después desde Editar legajo.
  const sector = ($('alt-sector') || {}).value || '';
  const periodoPrueba = parseInt(($('alt-periodo-prueba') || {}).value) || 6;
  const calzado = parseInt(($('alt-calzado') || {}).value) || 0;
  const ambo = ($('alt-ambo') || {}).value || '';
  // Chomba/Grafa(pantalón)/Buzo/Campera/Gorra (ticket "Uniforme" 08/2026)
  // — opcionales, se guardan en legajo.tallesUniforme (jsonb) con clave
  // en minúscula, mismo formato que ya lee talleSugerido() en
  // uniformes/catalogos.js. Sólo se agrega la clave si el talle se
  // cargó — así un legajo viejo sin estos campos sigue viendo
  // tallesUniforme sin claves basura en blanco.
  const tallesUniforme = {};
  const talleChomba = ($('alt-talle-chomba') || {}).value || '';
  const talleGrafa = ($('alt-talle-grafa') || {}).value || '';
  const talleBuzo = ($('alt-talle-buzo') || {}).value || '';
  const talleCampera = ($('alt-talle-campera') || {}).value || '';
  const talleGorra = ($('alt-talle-gorra') || {}).value || '';
  if (talleChomba) tallesUniforme.chomba = talleChomba;
  if (talleGrafa) tallesUniforme.grafa = talleGrafa;
  if (talleBuzo) tallesUniforme.buzo = talleBuzo;
  if (talleCampera) tallesUniforme.campera = talleCampera;
  if (talleGorra) tallesUniforme.gorra = talleGorra;
  const seguro = ($('alt-seguro') || {}).value || 'Pendiente';
  // Campos agregados (v005): leer del modal para persistir en el legajo
  const direccion = cleanText(($('alt-direccion') || {}).value || '');
  const fecNac = ($('alt-fecnac') || {}).value || '';
  const cbu = cleanText(($('alt-cbu') || {}).value || '');
  const polizas = leerPolizas();
  const obraSocial = cleanText(($('alt-obra-social') || {}).value || '');
  const obraSocialInicioTramite = ($('alt-os-inicio') || {}).value || '';
  const formaPago = ($('alt-forma-pago') || {}).value || '';
  const integracion = parseInt(($('alt-integracion') || {}).value) || 0;
  const categoria = ($('alt-categoria') || {}).value || '';
  const claveFiscal = cleanText(($('alt-clave-fiscal') || {}).value || '');
  const inaes = cleanText(($('alt-inaes') || {}).value || '');

  // CBU (ticket "CBU" 08/2026): formato inválido bloquea y lleva a la tab
  // de cuentas bancarias — un CBU mal cargado es un dato incorrecto y se
  // propaga a liquidaciones/cobros. Faltante NO bloquea, solo avisa (puede
  // que el asociado todavía no tenga cuenta; se completa después desde el
  // legajo o con el importador masivo).
  if (cbu && !cbuValido(cbu)) {
    toast('⚠️ El CBU debe tener exactamente 22 dígitos numéricos');
    tabAlta(6);
    return;
  }
  if (!cbu) {
    toast('⚠️ El asociado no tiene CBU cargado — se puede completar después desde el legajo');
  }

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
    sector,
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
    partido,
    codigoPostal,
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
    // Sólo se manda la clave si hay al menos un talle cargado — no pisa
    // con {} un tallesUniforme que ya pueda existir en otro flujo (no
    // aplica hoy en altas nuevas, pero deja la puerta abierta sin
    // sorpresas si en el futuro se precarga desde otro lado).
    ...(Object.keys(tallesUniforme).length ? { tallesUniforme } : {}),
    periodoPrueba,
    fechaIngresoPrueba: fechaIngreso,
    adjuntosLegal: [],
    adjuntosMedico: [],
    direccion,
    fecNac,
    zona,
    cbu,
    // "art" (columna vieja, 1 sola póliza) ya no se completa desde altas
    // nuevas — reemplazada por "polizas" (jsonb, múltiples). Se deja la
    // columna en Supabase por compatibilidad con legajos existentes.
    polizas,
    obraSocial,
    obraSocialInicioTramite,
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
      altaReg.domicilio = { direccion, zona, localidad, partido, codigoPostal };
      altaReg.operativo = { funcion, servicio, supervisor, periodoPrueba, categoria };
      altaReg.uniforme = { ambo, calzado, ...tallesUniforme };
      altaReg.capital = { integracion, formaPago };
      altaReg.seguros = { seguro, polizas, obraSocial, obraSocialInicioTramite };
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

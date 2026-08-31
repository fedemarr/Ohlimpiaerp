// Tab "Acceso y perfiles" de Configuración (v098).
// Tres tarjetas:
//   1. Matriz de accesos por perfil (plantilla editable, click cicla M→L→—).
//   2. Accesos individuales por usuario (overrides sobre la plantilla).
//   3. Alta de usuario vía api/crear-usuario.js (Supabase Auth + service role).
//
// Las escrituras van con SUPA directo (upsert por unique key), NO supaSync:
// estas tablas tienen PK identity y unique(perfil,modulo_key) /
// unique(usuario_id,modulo_key), el esquema de id_local no aplica.

import { DB, PERFILES, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { SUPA } from '@shared/supabase.js';
import {
  MODULOS_ACCESOS, COLUMNAS_MATRIZ, MATRIZ_SEED,
} from './catalogo.js';
import {
  plantillaPerfil, overridesUsuario, nivelAcceso,
  etiquetaNivel, siguienteNivel, enMatriz, modulosEfectivos,
} from './runtime.js';

const escHtml = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ICONOS = { 2: '✏️', 1: '👁', 0: '·' };
const TITULOS = { 2: 'M — puede modificar', 1: 'L — solo lectura', 0: '— sin acceso' };

// Áreas colapsadas de la matriz (REGLAS #2). En memoria: al re-render se
// respeta lo que el usuario colapsó en esta sesión.
const _areasCerradas = new Set();

// ── helpers de vista ─────────────────────────────────────────────────────────

function _nivelPantalla(perfil, moduloKey) {
  const p = plantillaPerfil(perfil).get(moduloKey);
  if (p !== undefined) return p;
  const seed = MATRIZ_SEED[moduloKey] && MATRIZ_SEED[moduloKey][perfil];
  if (seed !== undefined) return seed;
  const def = PERFILES[perfil];
  return def && def.modulos.includes(moduloKey) ? 2 : 0;
}

function _matrizVacia() {
  return !(DB.perfilAccesos || []).length;
}

/** Filas <tr> de módulos agrupadas por área, con encabezados de área
 *  colapsables (REGLAS #2). `cols` genera las celdas de cada módulo. */
function _filasPorArea(modulos, cols) {
  const areas = [...new Set(modulos.map(m => m.area))];
  return areas.map(area => {
    const cerrada = _areasCerradas.has(area);
    const mods = modulos.filter(m => m.area === area);
    return `<tr class="acc-area-row" data-acc-area="${escHtml(area)}" title="Click para ${cerrada ? 'expandir' : 'colapsar'}" onclick="accToggleArea('${escHtml(area)}')">
        <td colspan="99" class="acc-area">${cerrada ? '▸' : '▾'} ${escHtml(area)}<span class="acc-area-n">${mods.length}</span></td>
      </tr>` +
      mods.map(m => `<tr data-acc-mod="${escHtml(area)}"${cerrada ? ' style="display:none;"' : ''}>
        ${cols(m)}
      </tr>`).join('');
  }).join('');
}

window.accToggleArea = function (area) {
  if (_areasCerradas.has(area)) _areasCerradas.delete(area);
  else _areasCerradas.add(area);
  renderMatriz();
};

// ── tarjeta 1: matriz de perfiles ────────────────────────────────────────────

export function renderMatriz() {
  const wrap = $('accesos-matriz-wrap');
  if (!wrap) return;

  const aviso = _matrizVacia() ? `
    <div class="acc-aviso">⚠️ La tabla <code>perfil_accesos</code> todavía no tiene filas en Supabase
    (ejecutar <code>sql/v098_matriz_accesos_perfiles.sql</code>). Se muestra la planilla como referencia;
    los cambios que hagas se guardan igual, celda por celda.</div>` : '';

  const head = `<th class="acc-mod">Módulo</th>` + COLUMNAS_MATRIZ.map(c =>
    `<th title="${escHtml(c.perfil)}" style="${_colActual(c.perfil)}">${escHtml(c.col)}</th>`).join('');

  const filas = _filasPorArea(modulosEfectivos(), m => {
    const celdas = COLUMNAS_MATRIZ.map(c => {
      const n = _nivelPantalla(c.perfil, m.key);
      return `<td><button type="button" class="acc-celda acc-n${n}"
        title="${TITULOS[n]} — ${escHtml(c.perfil)}"
        onclick="accCiclarPerfil('${escHtml(c.perfil)}','${m.key}')">${ICONOS[n]}</button></td>`;
    }).join('');
    return `<td class="acc-mod" title="${escHtml(m.nota || m.label)}">${escHtml(m.label)}</td>` + celdas;
  });

  wrap.innerHTML = aviso + `
    <div class="tabla-wrap" style="max-height:520px;overflow:auto;border:1px solid var(--borde);border-radius:var(--radio);">
      <table class="tabla acc-tabla">
        <thead><tr>${head}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="acc-leyenda">
      <span><button type="button" class="acc-celda acc-n2" tabindex="-1">✏️</button> Modificar</span>
      <span><button type="button" class="acc-celda acc-n1" tabindex="-1">👁</button> Solo lectura</span>
      <span><button type="button" class="acc-celda acc-n0" tabindex="-1">·</button> Sin acceso</span>
      <span class="form-hint">Click en una celda para ciclar M → L → —. Se guarda al instante.</span>
    </div>`;
}

function _colActual(perfil) {
  return currentUser && currentUser.perfil === perfil ? 'color:var(--acento);font-weight:700;' : '';
}

window.accCiclarPerfil = async function (perfil, moduloKey) {
  const nuevo = siguienteNivel(_nivelPantalla(perfil, moduloKey));
  try {
    const { error } = await SUPA.from('perfil_accesos')
      .upsert({ perfil, modulo_key: moduloKey, nivel: nuevo }, { onConflict: 'perfil,modulo_key' });
    if (error) throw error;
  } catch (e) {
    toast('✗ No se pudo guardar: ' + e.message);
    return;
  }
  const row = (DB.perfilAccesos || []).find(r => r.perfil === perfil && r.moduloKey === moduloKey);
  if (row) row.nivel = nuevo;
  else {
    if (!DB.perfilAccesos) DB.perfilAccesos = [];
    DB.perfilAccesos.push({ perfil, moduloKey, nivel: nuevo });
  }
  renderMatriz();
};

let _confirmarRestaurar = false;
window.accRestaurarPlanilla = async function () {
  const btn = $('acc-btn-restaurar');
  if (!_confirmarRestaurar) {
    _confirmarRestaurar = true;
    btn.textContent = '¿Seguro? Click de nuevo para restaurar';
    btn.classList.add('btn-danger');
    setTimeout(() => {
      _confirmarRestaurar = false;
      if (btn && btn.isConnected) { btn.textContent = '↺ Restaurar valores de la planilla'; btn.classList.remove('btn-danger'); }
    }, 4000);
    return;
  }
  _confirmarRestaurar = false;
  btn.textContent = 'Guardando…';
  const filas = [];
  for (const m of MODULOS_ACCESOS) {
    for (const c of COLUMNAS_MATRIZ) {
      filas.push({ perfil: c.perfil, modulo_key: m.key, nivel: MATRIZ_SEED[m.key][c.perfil] });
    }
  }
  try {
    const { error } = await SUPA.from('perfil_accesos')
      .upsert(filas, { onConflict: 'perfil,modulo_key' });
    if (error) throw error;
  } catch (e) {
    toast('✗ No se pudo restaurar: ' + e.message);
    renderMatriz();
    return;
  }
  for (const f of filas) {
    const row = (DB.perfilAccesos || []).find(r => r.perfil === f.perfil && r.moduloKey === f.moduloKey);
    if (row) row.nivel = f.nivel;
    else DB.perfilAccesos.push({ perfil: f.perfil, moduloKey: f.modulo_key, nivel: f.nivel });
  }
  toast(`✓ Matriz restaurada a los valores de la planilla (${filas.length} celdas)`);
  renderMatriz();
};

// ── tarjeta 2: accesos individuales por usuario ──────────────────────────────

let _usuarioSelId = null;

export function poblarSelectUsuariosAccesos() {
  const sel = $('acc-sel-usuario');
  if (!sel) return;
  const usuarios = (DB.usuarios || []).filter(u => u.activo !== false);
  if (!_usuarioSelId || !usuarios.some(u => String(u.id) === String(_usuarioSelId))) {
    _usuarioSelId = usuarios.length ? String(usuarios[0].id) : null;
  }
  sel.innerHTML = usuarios.map(u =>
    `<option value="${escHtml(u.id)}"${String(u.id) === String(_usuarioSelId) ? ' selected' : ''}>${escHtml(u.nombre || u.email)}${u.perfil ? ' — ' + escHtml(u.perfil) : ''}</option>`
  ).join('') || '<option value="">— Sin usuarios cargados —</option>';
  renderGrillaUsuario();
}

window.accSelUsuario = function () {
  _usuarioSelId = $('acc-sel-usuario').value || null;
  renderGrillaUsuario();
};

function _usuarioSeleccionado() {
  return (DB.usuarios || []).find(u => String(u.id) === String(_usuarioSelId)) || null;
}

export function renderGrillaUsuario() {
  const wrap = $('accesos-usuario-wrap');
  if (!wrap) return;
  const u = _usuarioSeleccionado();

  if (!u) {
    wrap.innerHTML = '<p class="form-hint">No hay usuarios para mostrar.</p>';
    return;
  }

  const ov = overridesUsuario(u.id);
  const nOverrides = ov.size;
  const plantilla = plantillaPerfil(u.perfil);

  const opcionesPerfil = Object.keys(PERFILES).map(p =>
    `<option${p === u.perfil ? ' selected' : ''}>${escHtml(p)}</option>`).join('');
  const opcionesFuncion = '<option value="">— Sin función —</option>' +
    (DB.funcionesUsuario || []).map(f =>
      `<option${f === u.funcion ? ' selected' : ''}>${escHtml(f)}</option>`).join('');

  const info = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <strong>${escHtml(u.nombre || u.email)}</strong>
      <span class="form-hint">${escHtml(u.email || '')}</span>
      <span style="flex:1"></span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="accAbrirResetPassword()">🔑 Resetear contraseña</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="accRestablecerUsuario()"
        ${nOverrides ? '' : 'disabled'}>↺ Restablecer a plantilla del perfil</button>
    </div>
    <div id="acc-reset-pass-box" style="display:none;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:12px;background:#fff7ed;border:1px solid #fdba74;border-radius:var(--radio);">
      <span class="form-hint" style="width:100%;">Nueva contraseña para <strong>${escHtml(u.nombre || u.email)}</strong> — copiala y pasásela antes de confirmar (no se puede volver a mostrar después):</span>
      <input type="text" id="acc-reset-pass-valor" class="input" readonly style="max-width:220px;font-family:'DM Mono',monospace;">
      <button type="button" class="btn btn-secondary btn-sm" onclick="accRegenPassReset()">🔄 Regenerar</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="accCopiarPassReset()">📋 Copiar</button>
      <button type="button" class="btn btn-primary btn-sm" id="acc-btn-confirmar-reset" onclick="accConfirmarResetPassword()">Confirmar reset</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="accCerrarResetPassword()">Cancelar</button>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;padding:12px;background:var(--fondo);border-radius:var(--radio);">
      <div>
        <label style="font-size:11px;color:var(--texto-suave);display:block;margin-bottom:3px;">Perfil</label>
        <select class="input" style="max-width:200px;" onchange="accSetUsuario('perfil',this.value)">${opcionesPerfil}</select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--texto-suave);display:block;margin-bottom:3px;">⭐ Función</label>
        <select class="input" style="max-width:220px;" onchange="accSetUsuario('funcion',this.value)">${opcionesFuncion}</select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--texto-suave);display:block;margin-bottom:3px;">Nickname</label>
        <input class="input" style="max-width:140px;" value="${escHtml(u.nickname || '')}" placeholder="Nick..."
          onchange="accSetUsuario('nickname',this.value)">
      </div>
    </div>
    ${nOverrides
      ? `<div style="margin-bottom:10px;"><span class="badge badge-naranja">${nOverrides} ajuste${nOverrides > 1 ? 's' : ''} individual${nOverrides > 1 ? 'es' : ''}</span>
         <span class="form-hint" style="margin-left:6px;">Lo no ajustado sigue a la plantilla del perfil.</span></div>`
      : '<div style="margin-bottom:10px;"><span class="form-hint">Usa exactamente la plantilla de su perfil — click en una celda para ajustar.</span></div>'}
    ${plantilla.size === 0 ? `<div class="acc-aviso">El perfil "${escHtml(u.perfil)}" no está cubierto por la matriz
      (perfil fuera de planilla o seed pendiente): la grilla muestra el comportamiento actual por fallback.</div>` : ''}`;

  const filas = _filasPorArea(modulosEfectivos(), m => {
    const efectivo = nivelAcceso(m.key, u.perfil, u.id);
    const ajustado = ov.has(m.key);
    const plant = plantilla.get(m.key);
    return `<td class="acc-mod" title="${escHtml(m.nota || m.label)}">${escHtml(m.label)}</td>
      <td><button type="button" class="acc-celda acc-n${efectivo}${ajustado ? ' acc-override' : ''}"
        title="${ajustado ? 'Ajuste individual — ' : ''}${TITULOS[efectivo]}"
        onclick="accCiclarUsuario('${m.key}')">${ICONOS[efectivo]}</button></td>
      <td class="acc-plantilla">${plant !== undefined ? ICONOS[plant] + ' plantilla' : (enMatriz(m.key) ? 'fallback' : '— default')}</td>
      <td>${ajustado ? '<span class="badge badge-naranja">ajustado</span>' : '<span class="form-hint">—</span>'}</td>`;
  });

  wrap.innerHTML = info + `
    <div class="tabla-wrap" style="max-height:420px;overflow:auto;border:1px solid var(--borde);border-radius:var(--radio);">
      <table class="tabla acc-tabla">
        <thead><tr><th class="acc-mod">Módulo</th><th>Efectivo (click ajusta)</th><th>Plantilla</th><th>Estado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

window.accCiclarUsuario = async function (moduloKey) {
  const u = _usuarioSeleccionado();
  if (!u || !u.id) { toast('Elegí un usuario con cuenta real'); return; }
  // Módulos "Otros" (fuera de la planilla) también admiten override
  // individual — no tienen plantilla de perfil, así que abajo "plant"
  // sale undefined y el ciclado se guarda siempre como override explícito.

  const efectivo = nivelAcceso(moduloKey, u.perfil, u.id);
  const plant = plantillaPerfil(u.perfil).get(moduloKey);
  const nuevo = siguienteNivel(efectivo);

  try {
    if (plant !== undefined && nuevo === plant) {
      // Vuelve al valor de plantilla → el override sobra, se borra.
      const { error } = await SUPA.from('usuario_accesos')
        .delete().match({ usuario_id: u.id, modulo_key: moduloKey });
      if (error) throw error;
      DB.usuarioAccesos = (DB.usuarioAccesos || []).filter(r =>
        !(String(r.usuarioId) === String(u.id) && r.moduloKey === moduloKey));
    } else {
      const { error } = await SUPA.from('usuario_accesos')
        .upsert({ usuario_id: u.id, modulo_key: moduloKey, nivel: nuevo },
          { onConflict: 'usuario_id,modulo_key' });
      if (error) throw error;
      const row = (DB.usuarioAccesos || []).find(r =>
        String(r.usuarioId) === String(u.id) && r.moduloKey === moduloKey);
      if (row) row.nivel = nuevo;
      else {
        if (!DB.usuarioAccesos) DB.usuarioAccesos = [];
        DB.usuarioAccesos.push({ usuarioId: u.id, moduloKey, nivel: nuevo });
      }
    }
  } catch (e) {
    toast('✗ No se pudo guardar: ' + e.message);
    return;
  }
  renderGrillaUsuario();
};

// ── resetear contraseña (no hay forma de "recuperar" la vieja — Supabase
// Auth sólo guarda el hash — así que esto genera una nueva) ────────────────

window.accAbrirResetPassword = function () {
  const box = $('acc-reset-pass-box');
  if (!box) return;
  box.style.display = 'flex';
  $('acc-reset-pass-valor').value = generarPass();
};
window.accCerrarResetPassword = function () {
  const box = $('acc-reset-pass-box');
  if (box) box.style.display = 'none';
};
window.accRegenPassReset = function () {
  $('acc-reset-pass-valor').value = generarPass();
};
window.accCopiarPassReset = function () {
  const val = $('acc-reset-pass-valor').value;
  if (!val) return;
  navigator.clipboard.writeText(val).then(
    () => toast('📋 Contraseña copiada'),
    () => toast('✗ No se pudo copiar — seleccioná y copiá a mano')
  );
};
window.accConfirmarResetPassword = async function () {
  const u = _usuarioSeleccionado();
  if (!u || !u.id) return;
  const nuevaPassword = $('acc-reset-pass-valor').value;
  if ((nuevaPassword || '').length < 8) { toast('La contraseña debe tener al menos 8 caracteres'); return; }

  const session = (await SUPA.auth.getSession()).data.session;
  if (!session) { toast('Tu sesión expiró — volvé a entrar'); return; }

  const btn = $('acc-btn-confirmar-reset');
  btn.disabled = true;
  btn.textContent = 'Reseteando…';
  try {
    const resp = await fetch('/api/resetear-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session.access_token, usuarioId: u.id, nuevaPassword }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error reseteando la contraseña');
    toast(`✓ Contraseña reseteada para ${data.nombre || data.email} — ya se la pasaste, esta pantalla no la vuelve a mostrar`);
    window.accCerrarResetPassword();
  } catch (e) {
    toast('✗ ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar reset';
  }
};

window.accRestablecerUsuario = async function () {
  const u = _usuarioSeleccionado();
  if (!u || !u.id) return;
  try {
    const { error } = await SUPA.from('usuario_accesos').delete().match({ usuario_id: u.id });
    if (error) throw error;
  } catch (e) {
    toast('✗ No se pudo restablecer: ' + e.message);
    return;
  }
  DB.usuarioAccesos = (DB.usuarioAccesos || []).filter(r => String(r.usuarioId) !== String(u.id));
  toast(`✓ ${u.nombre || u.email} vuelve a usar la plantilla de su perfil`);
  renderGrillaUsuario();
};

// Edición de datos del usuario (perfil / función / nickname) desde la card.
// Escribe directo en public.usuarios por id (RLS v013: solo Administrador
// total) — supaSync no aplica: la tabla es uuid, sin id_local.
window.accSetUsuario = async function (campo, valor) {
  const u = _usuarioSeleccionado();
  if (!u || !u.id) { toast('Elegí un usuario con cuenta real'); return; }
  valor = (valor || '').trim();
  if (!['perfil', 'funcion', 'nickname'].includes(campo)) return;
  if (campo === 'perfil' && !PERFILES[valor]) { toast('Perfil desconocido'); return; }

  try {
    const { error } = await SUPA.from('usuarios').update({ [campo]: valor || null }).eq('id', u.id);
    if (error) throw error;
  } catch (e) {
    toast('✗ No se pudo guardar: ' + e.message);
    renderGrillaUsuario();
    return;
  }
  u[campo] = valor || null;
  if (campo === 'perfil') {
    toast(`✓ ${u.nombre || u.email} ahora es ${valor}. El menú le cambia al volver a entrar.`, 4500);
    // Sus overrides quedan atados a módulos, no al perfil — pero la grilla
    // efectiva cambia porque la plantilla es la del perfil nuevo.
    renderGrillaUsuario();
  } else {
    toast(`✓ ${u.nombre || u.email}: ${campo} actualizado`);
  }
};

// ── tarjeta 3: alta de usuario ───────────────────────────────────────────────

export function poblarFormAltaUsuario() {
  const selPerfil = $('acc-nuevo-perfil');
  if (selPerfil && !selPerfil.options.length) {
    selPerfil.innerHTML = '<option value="">— Seleccionar perfil —</option>' +
      Object.keys(PERFILES).map(p => `<option${p === 'Asociado' ? ' disabled' : ''}>${escHtml(p)}</option>`).join('');
  }
  const selFunc = $('acc-nuevo-funcion');
  if (selFunc) {
    selFunc.innerHTML = '<option value="">— Sin función asignada —</option>' +
      (DB.funcionesUsuario || []).map(f => `<option>${escHtml(f)}</option>`).join('');
  }
  // Ticket "vinculación automática" (26/08): sugiere el nombre EXACTO ya
  // usado como supervisor en Objetivos/Configuración → Servicios, para
  // que el usuario nazca coincidiendo con esa fuente. No restringe (sigue
  // siendo texto libre, para RRHH/Finanzas/etc. que no están en la lista),
  // solo evita el typo/mayúscula que rompe "mis servicios" después.
  const dlSup = $('dl-acc-supervisores');
  if (dlSup) dlSup.innerHTML = (DB.supervisores || []).map(s => `<option value="${escHtml(s)}">`).join('');
  if (!$('acc-nuevo-pass').value) $('acc-nuevo-pass').value = generarPass();
}

function generarPass() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  const rnd = new Uint32Array(12);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < 12; i++) out += abc[rnd[i] % abc.length];
  return out;
}

window.accRegenPass = function () {
  $('acc-nuevo-pass').value = generarPass();
};

window.accAutoNick = function () {
  const nombre = $('acc-nuevo-nombre').value.trim();
  const nick = $('acc-nuevo-nickname');
  if (nick && !nick.dataset.manual) nick.value = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
};

window.accNickManual = function () {
  const nick = $('acc-nuevo-nickname');
  if (nick) nick.dataset.manual = '1';
};

window.accCrearUsuario = async function () {
  const nombre = $('acc-nuevo-nombre').value.trim();
  const email = $('acc-nuevo-email').value.trim().toLowerCase();
  const pass = $('acc-nuevo-pass').value;
  const perfil = $('acc-nuevo-perfil').value;
  const funcion = $('acc-nuevo-funcion').value;
  const nickname = $('acc-nuevo-nickname').value.trim();

  if (!nombre || !email || !perfil) { toast('Nombre, email y perfil son obligatorios'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Email inválido'); return; }
  if ((pass || '').length < 8) { toast('La contraseña debe tener al menos 8 caracteres'); return; }
  if ((DB.usuarios || []).some(u => (u.email || '').toLowerCase() === email)) {
    toast('Ya existe un usuario con ese email');
    return;
  }

  const session = (await SUPA.auth.getSession()).data.session;
  if (!session) { toast('Tu sesión expiró — volvé a entrar'); return; }

  const btn = $('acc-btn-crear-usuario');
  btn.disabled = true;
  btn.textContent = 'Creando…';
  try {
    const resp = await fetch('/api/crear-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: session.access_token,
        email, password: pass, nombre, perfil, funcion, nickname,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error creando el usuario');

    // El endpoint devuelve la fila de public.usuarios ya actualizada.
    if (data.usuario) {
      DB.usuarios = (DB.usuarios || []).filter(x => String(x.id) !== String(data.usuario.id));
      DB.usuarios.push(data.usuario);
    }
    toast(`✓ Usuario creado: ${email}`);
    ['acc-nuevo-nombre', 'acc-nuevo-email', 'acc-nuevo-nickname'].forEach(id => { $(id).value = ''; });
    $('acc-nuevo-pass').value = generarPass();
    _usuarioSelId = data.usuario ? String(data.usuario.id) : _usuarioSelId;
    poblarSelectUsuariosAccesos();
    poblarFormAltaUsuario();
  } catch (e) {
    toast('✗ ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear usuario';
  }
};

// ── entry point del tab ──────────────────────────────────────────────────────

export function renderTabAccesosPerfiles() {
  renderMatriz();
  poblarSelectUsuariosAccesos();
  poblarFormAltaUsuario();
}

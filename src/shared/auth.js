import { DB, setCurrentUser } from '@shared/state.js';
import { $, initials } from '@shared/helpers.js';
import { activarOrdenamiento } from '@shared/ui.js';

// Callbacks que se configuran desde fuera para evitar dependencias circulares.
// Se registran una vez con registerAuthCallbacks() al inicializar la app.
let _callbacks = {
  construirMenu: () => {},
  poblarSelects: () => {},
  navTo: () => {},
  poblarFiltrosColumnas: () => {},
  verificarAccionesVencidas: () => {},
};

export function registerAuthCallbacks(cbs) {
  Object.assign(_callbacks, cbs);
}

// ========== LOGIN ==========

export function doLogin() {
  const u = $('login-user').value.trim();
  const p = $('login-pass').value;
  const usr = DB.usuarios.find(x => x.email === u && x.pass === p && x.activo);
  if (!usr) { $('login-error').style.display = 'block'; return; }
  iniciarSesion(usr);
}

export function loginDemo(perfil) {
  const mapDemo = {
    admin: 'Administrador total',
    rrhh: 'RRHH',
    operaciones: 'Operaciones',
    finanzas: 'Finanzas',
    supervisor: 'Supervisor',
  };
  const usr = DB.usuarios.find(x => x.perfil === mapDemo[perfil]);
  if (usr) iniciarSesion(usr);
}

export function iniciarSesion(usr) {
  setCurrentUser(usr);
  $('login-screen').style.display = 'none';
  $('app').classList.remove('hidden');
  $('sidebar-avatar').textContent = initials(usr.nombre);
  $('sidebar-nombre').textContent = usr.nombre;
  $('sidebar-rol').textContent = usr.funcion ? `${usr.funcion} — ${usr.perfil}` : usr.perfil;
  _callbacks.construirMenu();
  _callbacks.poblarSelects();
  _callbacks.navTo('inicio');
  setTimeout(() => {
    activarOrdenamiento();
    _callbacks.poblarFiltrosColumnas();
    _callbacks.verificarAccionesVencidas();
  }, 300);
}

export function doLogout() {
  setCurrentUser(null);
  $('app').classList.add('hidden');
  $('login-screen').style.display = 'flex';
  $('login-error').style.display = 'none';
  $('login-user').value = '';
  $('login-pass').value = '';
}

// ========== PORTAL ASOCIADO ==========

export function loginAsociado() {
  const nro = parseInt($('asoc-nro-socio')?.value) || 0;
  const apellido = ($('asoc-apellido')?.value || '').trim().toLowerCase();
  if (!nro || !apellido) { $('asoc-login-error').style.display = 'block'; return; }
  const legajo = (DB.legajos || []).find(l =>
    l.nro === nro && l.nombre.toLowerCase().includes(apellido) && l.estado === 'Activo'
  );
  if (!legajo) { $('asoc-login-error').style.display = 'block'; return; }
  $('asoc-login-error').style.display = 'none';
  const usrAsoc = {
    id: 9000 + legajo.nro,
    nombre: legajo.nombre,
    email: '',
    perfil: 'Asociado',
    funcion: legajo.funcion,
    nroSocio: legajo.nro,
    servicio: legajo.servicio,
    supervisor: legajo.supervisor,
    activo: true,
    nickname: legajo.nombre.split(' ')[0],
  };
  iniciarSesion(usrAsoc);
}

// ========== LISTENER ENTER EN LOGIN ==========

export function initLoginKeydown() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && $('login-screen').style.display !== 'none') doLogin();
  });
}

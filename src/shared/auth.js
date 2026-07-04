import { DB, setCurrentUser } from '@shared/state.js';
import { $, initials } from '@shared/helpers.js';
import { activarOrdenamiento } from '@shared/ui.js';
import { SUPA } from '@shared/supabase.js';

// Callbacks que se configuran desde fuera para evitar dependencias circulares.
// Se registran una vez con registerAuthCallbacks() al inicializar la app.
let _callbacks = {
  construirMenu: () => {},
  poblarSelects: () => {},
  navTo: () => {},
  poblarFiltrosColumnas: () => {},
  verificarAccionesVencidas: () => {},
  cargarDatos: async () => {},
  iniciarPolling: () => {},
  detenerPolling: () => {},
};

export function registerAuthCallbacks(cbs) {
  Object.assign(_callbacks, cbs);
}

// ========== LOGIN ==========

async function perfilDesdeSesion(authUser) {
  const { data, error } = await SUPA.from('usuarios').select('*').eq('id', authUser.id).maybeSingle();
  if (error || !data) return null;
  return {
    id: authUser.id,
    nombre: data.nombre || authUser.email,
    email: authUser.email,
    perfil: data.perfil,
    funcion: data.funcion,
    nickname: data.nickname || (data.nombre || authUser.email).split(' ')[0],
    activo: data.activo,
  };
}

async function cargarListaUsuarios() {
  const { data, error } = await SUPA.from('usuarios').select('*');
  if (!error && data) DB.usuarios = data;
}

async function loginConCredenciales(email, password) {
  const { data, error } = await SUPA.auth.signInWithPassword({ email, password });
  if (error || !data?.user) { $('login-error').style.display = 'block'; return; }
  const usr = await perfilDesdeSesion(data.user);
  if (!usr || !usr.perfil || !usr.activo) {
    await SUPA.auth.signOut();
    $('login-error').style.display = 'block';
    return;
  }
  $('login-error').style.display = 'none';
  await iniciarSesion(usr);
}

export function doLogin() {
  const email = $('login-user').value.trim();
  const pass = $('login-pass').value;
  loginConCredenciales(email, pass);
}

// Restaura la sesión si Supabase ya tiene una activa (persistida en
// localStorage) — evita pedir login de nuevo en cada reload.
export async function restaurarSesion() {
  const { data } = await SUPA.auth.getSession();
  const authUser = data?.session?.user;
  if (!authUser) return false;
  const usr = await perfilDesdeSesion(authUser);
  if (!usr || !usr.perfil || !usr.activo) { await SUPA.auth.signOut(); return false; }
  await iniciarSesion(usr);
  return true;
}

export async function iniciarSesion(usr) {
  setCurrentUser(usr);
  await _callbacks.cargarDatos();
  await cargarListaUsuarios();
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
  // El portal asociado no necesita el chequeo de postulaciones nuevas.
  if (usr.perfil !== 'Asociado') _callbacks.iniciarPolling();
}

export async function doLogout() {
  await SUPA.auth.signOut();
  setCurrentUser(null);
  _callbacks.detenerPolling();
  $('app').classList.add('hidden');
  $('login-screen').style.display = 'flex';
  $('login-error').style.display = 'none';
  $('login-user').value = '';
  $('login-pass').value = '';
}

// ========== PORTAL ASOCIADO ==========

export async function loginAsociado() {
  const nro = parseInt($('asoc-nro-socio')?.value) || 0;
  const apellido = ($('asoc-apellido')?.value || '').trim().toLowerCase();
  if (!nro || !apellido) { $('asoc-login-error').style.display = 'block'; return; }

  // El portal asociado no tiene password propia — para poder leer legajos
  // bajo el RLS "solo autenticados" se abre una sesión anónima de Supabase
  // (requiere tener "Allow anonymous sign-ins" habilitado en el proyecto).
  const { data: sesion } = await SUPA.auth.getSession();
  if (!sesion?.session) {
    const { error } = await SUPA.auth.signInAnonymously();
    if (error) { $('asoc-login-error').style.display = 'block'; return; }
  }
  await _callbacks.cargarDatos();

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
  await iniciarSesion(usrAsoc);
}

// ========== LISTENER ENTER EN LOGIN ==========

export function initLoginKeydown() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && $('login-screen').style.display !== 'none') doLogin();
  });
}

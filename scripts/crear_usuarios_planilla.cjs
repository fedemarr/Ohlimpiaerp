// =============================================================================
// Alta masiva de usuarios de la planilla "USUARIOS → PERFIL" (ticket v098/v099)
//
//   DRY-RUN (por defecto, no toca nada):
//     node scripts\crear_usuarios_planilla.cjs
//
//   EJECUCIÓN REAL:
//     $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
//     node scripts\crear_usuarios_planilla.cjs --ejecutar
//
// Qué hace por cada usuario de la lista PLANILLA (abajo):
//   1. Si ya existe una cuenta auth con ese email → la salta (no rompe nada).
//   2. Si no existe → auth.admin.createUser con contraseña generada fuerte.
//   3. Completa la fila en public.usuarios (nombre, perfil, funcion,
//      nickname) — el trigger handle_new_user de v013 ya la creó vacía.
//   4. Al terminar escribe credenciales_usuarios_<fecha>.csv SOLO con los
//      creados nuevos, para pasarle a cada uno su acceso (NO versionar).
//
// Requiere: SUPABASE_SERVICE_ROLE_KEY (está en Vercel → Settings →
// Environment Variables). También la busca en un archivo .env local si existe.
// El dominio de email es @ohlimpia.coop (decisión del 24/08/2026).
// =============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOMINIO = 'ohlimpia.coop';
const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';

// ── La planilla ──────────────────────────────────────────────────────────────
// [nombre, nick (prefijo del mail), perfilDelSistema, funcion]
// Los 4 con * son los que venían "(crear usuario)" sin mail en la hoja
// (REGLAS #6): el nick lo inventamos siguiendo la convención de la hoja —
// confirmar con Gabi antes de comunicar credenciales.
const PLANILLA = [
  ['Juan Manuel Eliçabe',            'jmelicabe',        'Gerencia General',  null],
  ['Juan Carlos Peretti',            'jcperetti',        'Consejo Directivo', 'Presidente'],
  ['Natividad Guillén',              'nguillen',         'Finanzas',          'Tesorera'],
  ['Jorgelina Bianchi',              'jbianchi',         'Comercial',         'Secretaria del Consejo'],
  ['Ricardo Eliçabe',                'relicabe',         'Operaciones',       'Síndico'],
  ['Lautaro Eliçabe',                'lelicabe',         'Finanzas',          null],
  ['Cecilia Recalde',                'crecalde',         'Finanzas',          null],
  ['Junior Ayala',                   'jayala',           'Finanzas',          null],
  ['Gabriela Soledad Lucero',        'glucero',          'RRHH',              'Coordinadora'],
  ['Jimena Martínez Guillen',        'jmartinezguillen', 'RRHH',              null],
  ['Marina Iglesias Eliçabe',        'melicabe',         'RRHH',              null],
  ['Martina Ramirez',                'mramirez',         'RRHH',              null],
  ['Matilde Noceti',                 'mnoceti',          'RRHH',              null],
  ['Naara Rodriguez',                'nrodriguez',       'RRHH',              null],
  ['Richard Recalde',                'rrecalde',         'Logística',         'Coordinador'],
  ['Maximiliano Poncino *',          'mponcino',         'Logística',         null],
  ['Miguel Angel Pereyra *',         'mpereyra',         'Logística',         null],
  ['Lucas Ariel Sosa *',             'lsosa',            'Logística',         null],
  ['Alex Federico Ramirez Recalde *','aramirezrecalde',  'Logística',         null],
  ['Gina Martinez Guillen',          'gmartinezguillen', 'Comercial',         null],
  ['Álvaro Jesús Uballes',           'ajuballes',        'Comercial',         null],
  ['Polo Eliçabe',                   'pelicabe',         'Comercial',         null],
  ['Marcelo Gonzalez Moure',         'mgmoure',          'Auditor',           null],
  ['Alejandro Cacciato',             'acacciato',        'Supervisor',        null],
  ['Alfredo Arispe',                 'aarispe',          'Supervisor',        null],
  ['Alvaro Uballes',                 'auballes',         'Supervisor',        null],
  ['Claudia Cazenave',               'ccazenave',        'Supervisor',        null],
  ['Claudio González',               'cgonzalez',        'Supervisor',        null],
  ['Dario Lage',                     'dlage',            'Supervisor',        null],
  ['Lorena Unzain',                  'lunzain',          'Supervisor',        null],
  ['Matías Maidana',                 'mmaidana',         'Supervisor',        null],
  ['Fabio Benvenuto',                'fbenvenuto',       'Supervisor',        null],
  ['Patricia Scaglia',               'pscaglia',         'Supervisor',        null],
  ['Santiago Ayala',                 'sayala',           'Supervisor',        null],
  ['Fernando Lascano',               'flascano',         'Operaciones',       null],
  ['Federico Martinez',              'fmartinez',        'DEVELOPER',         null],
];
// La hoja titula "(37)" pero trae 36 filas — si falta alguien, agregarlo acá.

function generarPass() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(14);
  let out = '';
  for (let i = 0; i < 14; i++) out += abc[bytes[i] % abc.length];
  return out;
}

function cargarClave() {
  const idx = process.argv.indexOf('--key');
  if (idx > -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Última chance: un .env local (no versionado) con la clave adentro.
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const linea = fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/).find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
    if (linea) return linea.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function crearCliente(clave) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  const ejecutar = process.argv.includes('--ejecutar');
  const clave = cargarClave();
  if (!clave) {
    console.error('✗ Falta SUPABASE_SERVICE_ROLE_KEY.');
    console.error('  Opción 1:  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..." ; node scripts\\crear_usuarios_planilla.cjs --ejecutar');
    console.error('  Opción 2:  node scripts\\crear_usuarios_planilla.cjs --ejecutar --key "eyJ..."');
    console.error('  (la clave está en Vercel → tu proyecto → Settings → Environment Variables)');
    process.exit(1);
  }

  console.log(`Planilla: ${PLANILLA.length} usuarios · dominio @${DOMINIO}`);
  console.log(ejecutar ? 'MODO EJECUTAR — se van a crear cuentas reales.\n'
                       : 'DRY-RUN — no se crea nada. Agregá --ejecutar para aplicar.\n');

  const supa = await crearCliente(clave);

  // Usuarios auth existentes (para no chocar con cuentas ya creadas).
  const existentes = new Map();
  let pagina = 1;
  while (true) {
    const { data, error } = await supa.auth.admin.listUsers({ page: pagina, perPage: 500 });
    if (error) throw error;
    (data.users || []).forEach(u => existentes.set((u.email || '').toLowerCase(), u.id));
    if (!data.users || data.users.length < 500) break;
    pagina++;
  }
  console.log(`Cuentas auth existentes en el proyecto: ${existentes.size}\n`);

  const creados = [];
  const saltados = [];
  const errores = [];

  for (const [nombre, nick, perfil, funcion] of PLANILLA) {
    const email = `${nick}@${DOMINIO}`;
    const nombreLimpio = nombre.replace(/ \*$/, '');
    try {
      if (existentes.has(email)) {
        console.log(`↷ ${email} ya existe — actualizo datos`);
        saltados.push(email);
        if (ejecutar) {
          const { error } = await supa.from('usuarios')
            .update({ nombre: nombreLimpio, perfil, funcion, nickname: nick })
            .eq('id', existentes.get(email));
          if (error) throw error;
        }
        continue;
      }

      if (!ejecutar) {
        console.log(`+ ${nombreLimpio} <${email}> · ${perfil}${funcion ? ' · ' + funcion : ''}`);
        continue;
      }

      const password = generarPass();
      const { data: nuevo, error: errCrear } = await supa.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (errCrear || !nuevo?.user) throw new Error(errCreateMsg(errCrear));

      const { error: errUpd } = await supa.from('usuarios')
        .update({ nombre: nombreLimpio, perfil, funcion, nickname: nick })
        .eq('id', nuevo.user.id);
      if (errUpd) throw new Error('cuenta creada pero falló el update de usuarios: ' + errUpd.message);

      console.log(`✓ ${email} creado (${perfil})`);
      creados.push({ email, password, nombre: nombreLimpio, perfil });
    } catch (e) {
      console.error(`✗ ${nombreLimpio} <${email}>: ${e.message}`);
      errores.push({ email, error: e.message });
    }
  }

  console.log('\n──────── RESUMEN ────────');
  console.log(`Total planilla : ${PLANILLA.length}`);
  console.log(`Ya existían    : ${saltados.length}`);
  console.log(ejecutar ? `Creados nuevos : ${creados.length}` : 'A crear nuevos : ' + (PLANILLA.length - saltados.length));
  console.log(`Errores        : ${errores.length}`);

  if (ejecutar && creados.length) {
    const fecha = new Date().toISOString().slice(0, 10);
    const csvPath = path.join(__dirname, '..', `credenciales_usuarios_${fecha}.csv`);
    const lineas = ['nombre,email,password,perfil',
      ...creados.map(c => `${c.nombre},${c.email},${c.password},${c.perfil}`)];
    fs.writeFileSync(csvPath, lineas.join('\r\n'), 'utf8');
    console.log(`\n🔐 Credenciales de los NUEVOS: ${csvPath}`);
    console.log('   Pasarlas por canal seguro y borrar el archivo cuando todos entraron.');
    console.log('   NO commitearlo (ya está en .gitignore).');
  }

  if (errores.length) {
    console.log('\nErrores a revisar:');
    errores.forEach(e => console.log(`  ${e.email}: ${e.error}`));
    process.exit(2);
  }
}

function errCreateMsg(err) {
  if (!err) return 'createUser sin respuesta';
  if ((err.message || '').includes('already')) return 'el email ya está registrado';
  return err.message || JSON.stringify(err);
}

main();

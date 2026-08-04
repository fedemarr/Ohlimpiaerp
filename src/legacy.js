// ========== LEGACY — Funciones pendientes de migración ==========
// Este archivo se irá vaciando a medida que se migren módulos.
// No agregar código nuevo acá.

import { DB, PERFILES, MENU, BADGE_MAP, AREAS, LOCALIDADES_BA, currentUser, MODULOS_SISTEMA } from '@shared/state.js';
import { $, initials, avatarEl, badge, formatPeriodo, hoyStr, esFeriado, esFinde, getDiasDelMes, calcularDiasEntre, toTitleCase, cleanText, applyTitleCase, validarCampos, fillSelect, fillDL } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, activarOrdenamiento } from '@shared/ui.js';
import { supaSync, supaDel, supaInit } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { obtenerValorHoraVigente, getCategoriaById } from './modules/categorias/consultas.js';

// ========== ESTADO ==========

// Perfiles y accesos


// ========== HELPERS ==========

// Formatea un período DD/MM/AAAA → MM/AAAA (solo mes y año)



// ========== LOGIN ==========


// ========== MENÚ DINÁMICO SEGÚN PERFIL ==========

export function poblarSelects(){
  // Nicknames dinámicos de RRHH — toma de usuarios del sistema + array base
  const nicksRRHH=[
    ...DB.usuarios.filter(u=>['RRHH','Administrador total'].includes(u.perfil)).map(u=>u.nickname||u.nombre.split(' ')[0]),
    ...DB.rrhh.filter(n=>!DB.usuarios.find(u=>(u.nickname||u.nombre.split(' ')[0])===n)),
    'Agente IA Ohlimpia'
  ];
  fillSelect('c-medio',DB.medios);fillSelect('c-zona',DB.zonas);fillSelect('c-rrhh',nicksRRHH);
  fillSelect('c-dispo-horaria',DB.disponibilidadesHorarias);
  fillDL('dl-loc',DB.localidades);fillDL('dl-loc2',DB.localidades);
  fillSelect('p-supervisor',DB.supervisores,['— Seleccionar —']);fillSelect('p-zona',DB.zonas);fillSelect('p-puesto',DB.categorias);
  fillDL('dl-serv',obtenerServiciosActivos());fillDL('dl-serv2',obtenerServiciosActivos());fillDL('dl-serv3',obtenerServiciosActivos());
  fillSelect('ps-zona',DB.zonas);fillSelect('ps-rrhh',nicksRRHH);
  fillSelect('alta-zona',DB.zonas);fillSelect('alta-funcion',DB.categorias,['— Seleccionar —']);fillSelect('alta-categoria',DB.categorias,['— Seleccionar —']);
  fillDL('dl-sup2',DB.supervisores);fillDL('dl-sup3',DB.supervisores);
  fillDL('dl-asoc-leg',DB.legajos.map(l=>l.nombre+' (N°'+l.nro+')'));
  fillDL('dl-asoc-enf',DB.legajos.map(l=>l.nombre+' (N°'+l.nro+')'));
  fillSelect('f-zona-c',DB.zonas,['']);
  const sv=DB.smvm.find(s=>s.vigente);
  if(sv&&$('smvm-ingreso')){$('smvm-ingreso').value=sv.valor;$('integ-inicial').value=Math.round(sv.valor*.05);$('saldo-cap').value=Math.round(sv.valor*.95);}
  fillSelect('edit-funcion',DB.categorias);
  // Filtros de columna candidatos
  const fillCol=(id,items)=>{const el=$(id);if(!el)return;const ph=el.options[0]?.outerHTML||'<option value=""></option>';el.innerHTML=ph+[...new Set(items)].filter(Boolean).map(i=>`<option>${i}</option>`).join('');};
  fillCol('cf-cand-zona',DB.zonas);
  fillCol('cf-cand-estado',DB.candidatos.map(c=>c.estado));
  fillCol('cf-cand-medio',DB.medios);
  fillCol('cf-cand-rrhh',nicksRRHH);
  poblarSelectsCapacitaciones();
  // 2.1.1 (Delta Comercial v1.2): antes esto solo se poblaba como efecto
  // secundario de abrir un modal de Cliente/Objetivo — los filtros de la
  // pantalla (ej. cf-cli-tipo) quedaban vacíos si el usuario entraba
  // directo a Clientes después de loguearse sin haber abierto un modal.
  poblarSelectsComercial();
}

// ========== NAVEGACIÓN ==========


// ========== MODALES ==========

// ========== CANDIDATOS ==========
// renderCandidatos vieja eliminada

// ========== PEDIDOS ==========
// Migrado a src/modules/pedidos/ (2026-06-30)

// ========== PSICO ==========



// ========== ALTAS ==========

// ========== LEGAJOS + PERÍODO DE PRUEBA ==========




// ========== EDITAR LEGAJO ==========

// ========== IMPRIMIR ==========

// ========== LEGAL — migrado a src/modules/situaciones_legales/ ==========

// ========== ENFERMOS — migrado a src/modules/enfermos_accidentes/ ==========

// ========== CONFIGURACIÓN ==========
function renderConfiguracion(){
  ['zonas','medios','categorias'].forEach(k=>renderConfigLista(k,'lista-'+k));
  renderConfigLista('disponibilidadesHorarias','lista-disponibilidades-horarias');
  ['estadosLegales','tiposLegales','abogados'].forEach(k=>renderConfigLista(k,'lista-'+({estadosLegales:'estados-legales',tiposLegales:'tipos-legales',abogados:'abogados'}[k])));
  ['tiposMedicos','estadosMedicos','medicosCfg'].forEach(k=>renderConfigLista(k,'lista-'+({tiposMedicos:'tipos-medicos',estadosMedicos:'estados-medicos',medicosCfg:'medicos-cfg'}[k])));
  renderTablaPerfilesModulos();
  renderGrillaFuncionesUsuario();
  poblarSelectFuncionUsuario();
  if (window.renderConfigMotivosReas) window.renderConfigMotivosReas();
  if (window.renderConfigAprobadoresReas) window.renderConfigAprobadoresReas();
  renderConfigLista('movimientos','lista-movimientos');
  renderConfigComercial();
  if (window.renderPersonalRrhh) window.renderPersonalRrhh();
  cfgTab('personal', document.querySelector('#screen-configuracion .tab-btn'));
}

function cfgTab(nombre, btn){
  const screen=$('screen-configuracion');
  screen.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  screen.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const target=$('cfg-tab-'+nombre);
  if(target) target.classList.add('active');
  if(btn) btn.classList.add('active');
  if(nombre==='operaciones-cfg'){ renderMotivosEFT(); renderMotivosNF(); }
}

// ========== BUSCADOR GLOBAL ==========
function renderConfigLista(key,elId){
  const el=$(elId);if(!el)return;
  // El botón Eliminar debe re-renderizar el mismo elId que se le pasó a
  // esta función — antes reconstruía 'lista-'+key a mano, que sólo
  // coincide con elId cuando key es una sola palabra (zonas, medios,
  // categorias); con una key camelCase (ej. disponibilidadesHorarias) y
  // un elId con guiones (lista-disponibilidades-horarias) quedaban
  // desincronizados y el botón no volvía a pintar la lista.
  el.innerHTML=DB[key].map((item,i)=>`<div class="config-item"><span style="font-size:13px;">${item}</span><button class="btn btn-danger btn-xs" onclick="eliminarItem('${key}',${i},'${elId}')">Eliminar</button></div>`).join('');
}
function agregarItem(key,inputId,listId){
  const val=$(inputId).value.trim();if(!val)return;
  if(DB[key]&&DB[key].includes(val)){toast('Ya existe');return;}
  if(!DB[key])DB[key]=[];
  DB[key].push(val);$(inputId).value='';
  renderConfigLista(key,listId);poblarSelects();toast(`✓ "${val}" agregado`);
}
function eliminarItem(key,idx,listId){DB[key].splice(idx,1);renderConfigLista(key,listId);poblarSelects();}

function renderTablaUsuarios(){
  const el=$('tabla-usuarios');if(!el)return;
  el.innerHTML=DB.usuarios.map(u=>{
    const p=PERFILES[u.perfil];
    const mods=p?p.modulos.slice(0,4).join(', ')+(p.modulos.length>4?' +'+( p.modulos.length-4)+' más':''):'—';
    return `<tr>
      <td style="font-weight:500;">${u.nombre}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;">${u.email}</td>
      <td>${p?`<span class="badge ${p.color}">${u.perfil}</span>`:'—'}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${mods}</td>
      <td>${badge(u.activo?'Activo':'Baja')}</td>
      <td><button class="btn btn-secondary btn-xs" onclick="toast('Editar usuario ${u.nombre}')">Editar</button></td>
    </tr>`;
  }).join('');
}

function actualizarPermisosPreview(){
  const perfil=$('u-perfil').value;
  const el=$('permisos-preview');if(!el)return;
  const p=PERFILES[perfil];
  if(!p){el.innerHTML='<span style="color:var(--texto-muy-suave);">Seleccioná un perfil para ver los módulos con acceso</span>';return;}
  el.innerHTML=`<strong>Acceso:</strong> ${p.desc}<br><div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap;">${p.modulos.map(m=>`<span class="chip">${m}</span>`).join('')}</div>`;
}

function guardarUsuario(){
  const nombre=$('u-nombre').value.trim(),email=$('u-email').value.trim(),pass=$('u-pass').value,perfil=$('u-perfil').value;
  if(!nombre||!email||!pass||!perfil){toast('Completá todos los campos obligatorios');return;}
  const funcion=($('u-funcion')||{value:''}).value;
  DB.usuarios.push({id:Date.now(),nombre,email,pass,perfil,funcion,activo:true});
  cerrarModal('modal-usuario');
  renderTablaUsuarios();
  renderTablaPerfilesModulos();
  supaSync('usuarios', DB.usuarios[DB.usuarios.length-1]); toast('✓ Usuario creado');
}

function actualizarFuncionUsuario(userId, funcion){
  const u=DB.usuarios.find(x=>x.id===userId);
  if(u){
    u.funcion=funcion;
    toast(`✓ ${u.nombre}: función actualizada a "${funcion||'Sin función'}"`);
    // Actualizar aprobadores si la función está en la lista
    if(funcion&&DB.aprobadoresReas.includes(funcion)){
      toast(`✓ ${u.nombre} queda autorizado/a para aprobar reasignaciones como "${funcion}"`,4000);
    }
  }
}

// Render grilla de funciones en configuración
function renderGrillaFuncionesUsuario(){
  const el=$('grilla-funciones-usuario');if(!el)return;
  el.innerHTML=DB.funcionesUsuario.map((f,i)=>{
    const usrsConFuncion=DB.usuarios.filter(u=>u.funcion===f);
    return `<div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <span style="font-weight:600;font-size:13px;">⭐ ${f}</span>
        <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:12px;padding:0;" onclick="eliminarFuncionUsuario(${i})">✕</button>
      </div>
      ${usrsConFuncion.length>0
        ?`<div style="font-size:11px;color:var(--texto-suave);">${usrsConFuncion.map(u=>`<span class="chip" style="font-size:10px;">${u.nombre.split(' ')[0]}</span>`).join(' ')}</div>`
        :`<div style="font-size:11px;color:var(--texto-muy-suave);">Sin usuarios asignados</div>`}
    </div>`;
  }).join('')||'<p class="text-muted" style="grid-column:span 4;">Sin funciones definidas aún.</p>';
}

function agregarFuncionUsuario(){
  const val=($('nueva-funcion-usuario')||{value:''}).value.trim();
  if(!val){toast('Ingresá el nombre de la función');return;}
  if(DB.funcionesUsuario.includes(val)){toast('Ya existe esa función');return;}
  DB.funcionesUsuario.push(val);
  $('nueva-funcion-usuario').value='';
  renderGrillaFuncionesUsuario();
  poblarSelectFuncionUsuario();
  toast(`✓ Función "${val}" agregada`);
}

function eliminarFuncionUsuario(idx){
  const f=DB.funcionesUsuario[idx];
  // Verificar si hay usuarios con esa función
  const enUso=DB.usuarios.filter(u=>u.funcion===f);
  if(enUso.length>0){
    toast(`⚠️ No se puede eliminar — ${enUso.length} usuario${enUso.length>1?'s':''} tiene${enUso.length>1?'n':''} asignada esa función`);
    return;
  }
  DB.funcionesUsuario.splice(idx,1);
  renderGrillaFuncionesUsuario();
  poblarSelectFuncionUsuario();
  toast(`Función eliminada`);
}

function poblarSelectFuncionUsuario(){
  // Poblar select en modal de nuevo usuario
  const sel=$('u-funcion');
  if(sel){
    const ph=sel.options[0]?.outerHTML||'<option value="">— Sin función asignada —</option>';
    sel.innerHTML=ph+DB.funcionesUsuario.map(f=>`<option>${f}</option>`).join('');
  }
  // Actualizar aprobadores de reasignaciones con funciones disponibles
  const selAprob=$('nuevo-aprobador-reas');
  if(selAprob){
    // Mantener las opciones base + agregar funciones configuradas
    selAprob.innerHTML=`<option value="">— Seleccionar perfil o función —</option>
      <optgroup label="Perfiles del sistema">
        <option>Administrador total</option>
        <option>Gerente de Operaciones</option>
        <option>Gerente de RRHH</option>
      </optgroup>
      <optgroup label="Funciones de la organización">
        ${DB.funcionesUsuario.map(f=>`<option>${f}</option>`).join('')}
      </optgroup>`;
  }
}

// ========== SMVM ==========
function renderSMVM(){
  const el=$('lista-smvm');if(!el)return;
  el.innerHTML=[...DB.smvm].reverse().map(s=>`<div class="smvm-row">
    <div><div style="font-weight:500;font-size:13px;">${formatPeriodoSMVM(s.periodo)}</div><div class="text-muted">${s.resolucion}</div></div>
    <div style="display:flex;align-items:center;gap:10px;"><div class="valor">$${s.valor.toLocaleString('es-AR')}</div>${s.vigente?'<span class="vigente">VIGENTE</span>':''}</div>
  </div>`).join('');
}
function formatPeriodoSMVM(p){const[y,m]=p.split('-');return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(m)-1]+' '+y;}
function agregarSMVM(){
  const periodo=$('smvm-periodo').value,valor=parseFloat($('smvm-valor').value),resol=$('smvm-resol').value.trim();
  if(!periodo||!valor){toast('Completá período y valor');return;}
  DB.smvm.forEach(s=>s.vigente=false);DB.smvm.push({periodo,valor,resolucion:resol||'Sin resolución',vigente:true});
  $('smvm-periodo').value='';$('smvm-valor').value='';$('smvm-resol').value='';
  renderSMVM();poblarSelects();toast(`✓ SMVM $${valor.toLocaleString('es-AR')} guardado como vigente`);
}

// ========== AGENTE IA ==========
function activarAgente(){
  DB.candidatos.filter(c=>c.estado==='Sin citar').forEach(c=>{c.estado='Citado';c.rrhh='Agente IA Ohlimpia';});
  cerrarModal('modal-agente');renderCandidatos();toast('🤖 Agente IA activado — Iniciando contacto por WhatsApp...',5000);
}

// ========== ÁREAS DE PERSONAL ==========
// Estado de áreas — quién trabaja en cada área con permisos y nickname

function renderAreasPersonal(){
  Object.keys(AREAS).forEach(area=>{
    const el=$('area-'+area);if(!el)return;
    const items=AREAS[area];
    if(!items.length){ el.innerHTML=`<p class="text-muted" style="font-size:12px;padding:8px 0;">Sin personas asignadas</p>`; return; }
    el.innerHTML=items.map((p,i)=>`
      <div class="area-item">
        <span class="area-nick">${p.nickname}</span>
        <div>
          <div class="area-nombre">${p.nombre}</div>
          <div class="area-funcion">${p.funcion} · N°${p.nroSocio}</div>
        </div>
        <div class="area-toggle">
          <span style="font-size:10px;color:var(--texto-muy-suave);">${p.puedeModificar?'Puede modificar':'Solo lectura'}</span>
          <button class="toggle-sw ${p.puedeModificar?'on':''}" onclick="togglePermiso('${area}',${i})" title="Click para cambiar permiso"></button>
        </div>
        <button class="btn btn-danger btn-xs" onclick="eliminarPersonaArea('${area}',${i})">×</button>
      </div>`).join('');
  });
  // Poblar datalist con todos los asociados admin
  const dl=$('dl-asoc-admin');
  if(dl) dl.innerHTML=DB.legajos
    .filter(l=>l.estado==='Activo')
    .map(l=>`<option value="${l.nombre} (N°${l.nro} — ${l.funcion})">`).join('');
}

function buscarAsocParaArea(){
  const busq=($('buscar-asoc-area')||{value:''}).value.toLowerCase();
  const funcion=($('filtro-area-funcion')||{value:''}).value;
  const resultados=DB.legajos.filter(l=>{
    const matchB=!busq||l.nombre.toLowerCase().includes(busq)||String(l.nro).includes(busq);
    const matchF=!funcion||l.funcion.toLowerCase().includes(funcion.toLowerCase());
    return matchB && matchF && l.estado==='Activo';
  }).slice(0,12);
  const el=$('resultados-asoc-area');if(!el)return;
  el.innerHTML=resultados.map(l=>`
    <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 12px;cursor:pointer;"
         onclick="seleccionarAsocParaArea('${l.nombre}','${l.funcion}',${l.nro})"
         onmouseover="this.style.background='var(--azul-claro)'" onmouseout="this.style.background='var(--fondo)'">
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="avatar" style="width:28px;height:28px;font-size:11px;">${initials(l.nombre)}</div>
        <div>
          <div style="font-size:12px;font-weight:500;">${l.nombre}</div>
          <div style="font-size:10px;color:var(--texto-suave);">N°${l.nro} · ${l.funcion}</div>
        </div>
      </div>
    </div>`).join('');
}

function seleccionarAsocParaArea(nombre, funcion, nro){
  toast(`✓ Seleccionado: ${nombre} — completá el nickname y el área donde asignarlo`);
  // Rellenar campos visibles para facilitar
  ['rrhh','operaciones','finanzas','logistica','comercial'].forEach(area=>{
    const n=$('nombre-'+area); if(n) n.value=`${nombre} (N°${nro} — ${funcion})`;
  });
}

function agregarPersonaArea(area){
  const nick=($('nick-'+area)||{value:''}).value.trim();
  const nombreRaw=($('nombre-'+area)||{value:''}).value.trim();
  if(!nick||!nombreRaw){toast('Completá el nickname y el nombre del asociado');return;}
  // Parsear nombre del datalist
  const match=nombreRaw.match(/^(.+?)\s*\(N°(\d+)\s*—\s*(.+?)\)/);
  const nombre=match?match[1].trim():nombreRaw;
  const nro=match?parseInt(match[2]):0;
  const funcion=match?match[3].trim():'Administrativo';
  if(!AREAS[area]) AREAS[area]=[];
  // Verificar que no esté ya
  if(AREAS[area].find(p=>p.nombre===nombre)){toast('Esta persona ya está en el área');return;}
  AREAS[area].push({nombre,nickname:nick,funcion,nroSocio:nro,puedeModificar:false});
  $('nick-'+area).value=''; $('nombre-'+area).value='';
  renderAreasPersonal();
  // Actualizar la lista de RRHH en DB para que aparezca en citaciones
  if(area==='rrhh' && !DB.rrhh.includes(nick)) DB.rrhh.push(nick);
  poblarSelects();
  toast(`✓ ${nombre} (${nick}) agregado a ${area.charAt(0).toUpperCase()+area.slice(1)}`);
}

function togglePermiso(area,idx){
  AREAS[area][idx].puedeModificar=!AREAS[area][idx].puedeModificar;
  renderAreasPersonal();
  const p=AREAS[area][idx];
  toast(`${p.nombre}: ahora tiene ${p.puedeModificar?'permisos de modificación':'solo lectura'}`);
}

function eliminarPersonaArea(area,idx){
  AREAS[area].splice(idx,1);
  renderAreasPersonal();
  toast('Persona eliminada del área');
}

// ========== ORDENAMIENTO DE TABLAS — legacy helper ==========


// Activar ordenamiento en todas las tablas principales
// activarOrdenamiento está definida más abajo con implementación genérica

// ========== TABS CANDIDATOS ==========
// tabCandidatos vieja eliminada

// ========== CALENDARIO DE ENTREVISTAS ==========
// Turnos agendados: {fecha:'2026-04-07', hora:'10:00', candidato:'Lima Romina', estado:'confirmado'}







// ========== PERFILES DE MÓDULO — TABLA MATRICIAL ==========

// Permisos: 0 = sin acceso, 1 = solo lectura, 2 = puede modificar
// Se inicializa desde el perfil del usuario
function getPermisosIniciales(perfil){
  const p=PERFILES[perfil];
  if(!p) return {};
  const permisos={};
  MODULOS_SISTEMA.forEach(m=>{
    permisos[m.key]=p.modulos.includes(m.key)?2:0;
  });
  return permisos;
}

// Estado de permisos por usuario
let permisosUsuarios={};
function initPermisosUsuarios(){
  DB.usuarios.forEach(u=>{
    if(!permisosUsuarios[u.id]) permisosUsuarios[u.id]=getPermisosIniciales(u.perfil);
  });
}

function renderTablaPerfilesModulos(){
  initPermisosUsuarios();
  const thead=$('thead-perfiles');
  const tbody=$('tbody-perfiles');
  if(!thead||!tbody) return;

  // Header — columnas fijas + módulos (SIN botones globales de columna)
  thead.innerHTML=`<tr>
    <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:var(--texto-suave);background:#f8f9fd;border:1px solid var(--borde);min-width:180px;">Usuario / Asociado</th>
    <th style="padding:8px 10px;font-size:11px;font-weight:600;color:var(--texto-suave);background:#f8f9fd;border:1px solid var(--borde);min-width:80px;">Nickname</th>
    <th style="padding:8px 10px;font-size:11px;font-weight:600;color:var(--texto-suave);background:#f8f9fd;border:1px solid var(--borde);min-width:100px;">Perfil sistema</th>
    <th style="padding:8px 10px;font-size:11px;font-weight:600;color:var(--texto-suave);background:var(--acento-suave);border:1px solid #e6c84a;min-width:130px;">⭐ Función en la org.</th>
    ${MODULOS_SISTEMA.map(m=>`
      </th>`).join('')}
    <th style="padding:8px 10px;font-size:11px;font-weight:600;color:var(--texto-suave);background:#f8f9fd;border:1px solid var(--borde);text-align:center;min-width:130px;">Acciones</th>
  </tr>`;

  // Filas — una por usuario, con botones de asignar/quitar por fila
  tbody.innerHTML=DB.usuarios.map(u=>{
    const perms=permisosUsuarios[u.id]||{};
    const p=PERFILES[u.perfil];
    // Legajo vinculado
    const legajo=DB.legajos.find(l=>l.nombre.toLowerCase().includes(u.nombre.split(' ')[0].toLowerCase()));
    const nickname=u.nickname||u.nombre.split(' ')[0];
    return `<tr>
      <td style="padding:10px 14px;border:1px solid var(--borde);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="width:30px;height:30px;font-size:11px;">${initials(u.nombre)}</div>
          <div>
            <div style="font-weight:500;font-size:13px;">${u.nombre}</div>
            <div style="font-size:11px;color:var(--texto-muy-suave);">${u.email}</div>
            ${legajo?`<div style="font-size:10px;color:var(--azul);">📁 Legajo N°${legajo.nro} — ${legajo.funcion}</div>`:'<div style="font-size:10px;color:var(--texto-muy-suave);">Sin legajo vinculado</div>'}
          </div>
        </div>
      </td>
      <td style="padding:8px;border:1px solid var(--borde);text-align:center;">
        <input type="text" value="${nickname}"
          style="width:70px;padding:4px 6px;border:1px solid var(--borde-fuerte);border-radius:6px;font-size:12px;text-align:center;outline:none;"
          onchange="actualizarNickname(${u.id},this.value)"
          placeholder="Nick...">
      </td>
      <td style="padding:8px;border:1px solid var(--borde);text-align:center;">
        <span class="badge ${p?p.color:'badge-gris'}" style="font-size:10px;">${u.perfil.split(' ')[0]}</span>
      </td>
      <td style="padding:8px;border:1px solid var(--borde);background:var(--acento-suave);">
        <select style="width:100%;padding:4px 6px;border:1px solid #e6c84a;border-radius:6px;font-size:12px;font-family:inherit;outline:none;background:white;cursor:pointer;"
          onchange="actualizarFuncionUsuario(${u.id},this.value)">
          <option value="">— Sin función —</option>
          ${DB.funcionesUsuario.map(f=>`<option${u.funcion===f?' selected':''}>${f}</option>`).join('')}
        </select>
        ${u.funcion?`<div style="font-size:10px;color:#7a6000;margin-top:3px;text-align:center;">✓ ${u.funcion}</div>`:''}
      </td>
      ${MODULOS_SISTEMA.map(m=>{
        const nivel=perms[m.key]||0;
        const cls=nivel===2?'modificar':nivel===1?'lectura':'sin-acceso';
        const ico=nivel===2?'✏️':nivel===1?'👁':'—';
        const titulo=nivel===2?'Puede modificar — click para cambiar':nivel===1?'Solo lectura — click para cambiar':'Sin acceso — click para dar acceso';
        return `<td style="padding:4px;border:1px solid var(--borde);text-align:center;">
        </td>`;
      }).join('')}
      <td style="padding:6px 10px;border:1px solid var(--borde);text-align:center;">
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center;">
          <button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;font-size:10px;width:100%;" onclick="asignarTodosUsuario(${u.id},2)" title="Dar acceso completo a todos los módulos">✏️ Todos modificar</button>
          <button class="btn btn-xs" style="background:var(--azul-claro);color:var(--azul);border:1px solid #b8c8e8;font-size:10px;width:100%;" onclick="asignarTodosUsuario(${u.id},1)" title="Dar solo lectura en todos los módulos">👁 Todos lectura</button>
          <button class="btn btn-xs" style="background:var(--rojo-suave);color:var(--rojo);border:1px solid #f5c6c0;font-size:10px;width:100%;" onclick="asignarTodosUsuario(${u.id},0)" title="Quitar todos los accesos de este usuario">— Quitar todos</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function ciclarPermiso(userId, modulo){
  if(!permisosUsuarios[userId]) permisosUsuarios[userId]={};
  const actual=permisosUsuarios[userId][modulo]||0;
  permisosUsuarios[userId][modulo]=(actual+1)%3; // 0→1→2→0
  renderTablaPerfilesModulos();
  const niveles=['sin acceso','solo lectura','puede modificar'];
  const u=DB.usuarios.find(x=>x.id===userId);
  toast(`${u?.nombre} — ${modulo}: ${niveles[permisosUsuarios[userId][modulo]]}`);
}

function asignarColumna(modulo, nivel){
  DB.usuarios.forEach(u=>{
    if(!permisosUsuarios[u.id]) permisosUsuarios[u.id]={};
    permisosUsuarios[u.id][modulo]=nivel;
  });
  renderTablaPerfilesModulos();
  const niveles=['sin acceso','solo lectura','puede modificar'];
  toast(`✓ Módulo "${modulo}": todos los usuarios → ${niveles[nivel]}`);
}

function asignarTodosUsuario(userId, nivel){
  if(!permisosUsuarios[userId]) permisosUsuarios[userId]={};
  MODULOS_SISTEMA.forEach(m=>{ permisosUsuarios[userId][m.key]=nivel; });
  renderTablaPerfilesModulos();
  const u=DB.usuarios.find(x=>x.id===userId);
  const niveles=['sin acceso a ningún módulo','solo lectura en todos los módulos','acceso completo a todos los módulos'];
  toast(`✓ ${u?.nombre}: ${niveles[nivel]}`);
}

function actualizarNickname(userId, nick){
  const u=DB.usuarios.find(x=>x.id===userId);
  if(u){
    u.nickname=nick.trim();
    // Actualizar también en lista de RRHH si corresponde
    poblarSelects();
    toast(`✓ Nickname de ${u.nombre} actualizado a "${nick}"`);
  }
}

// Mantener compatibilidad con funciones que las llaman
function asignarTodosModulos(){ DB.usuarios.forEach(u=>asignarTodosUsuario(u.id,2)); }
function quitarTodosModulos(){
  if(!confirm('¿Seguro que querés quitar todos los accesos de todos los usuarios?')) return;
  DB.usuarios.forEach(u=>asignarTodosUsuario(u.id,0));
}


// Actualizar renderTablaUsuarios para apuntar a la nueva función
// renderTablaUsuarios — definida arriba, apunta a renderTablaPerfilesModulos

// ========== FILTRAR CANDIDATOS ACTUALIZADO ==========

// Poblar filtros de columna en candidatos


// ========== MÓDULO CAPACITACIONES ==========
DB.capacitaciones = [
  {id:1,nroSocio:'2557',asociado:'Juarez Romina Gisela',fecha:'23/01/2024',tipo:'Maquinarias: uso, manejo y mantenimiento',lugar:'Servicio',servicio:'JOSIMAR',instructor:'Miguel Pereyra',metodo:'',resultado:'',obs:''},
  {id:2,nroSocio:'2423',asociado:'Chaile Esteban Jose',fecha:'23/01/2024',tipo:'Maquinarias: uso, manejo y mantenimiento',lugar:'Servicio',servicio:'JOSIMAR',instructor:'Miguel Pereyra',metodo:'',resultado:'',obs:''},
  {id:3,nroSocio:'612',asociado:'Irrazabal Romina Gisela',fecha:'23/01/2024',tipo:'Maquinarias: uso, manejo y mantenimiento',lugar:'Servicio',servicio:'JOSIMAR',instructor:'Miguel Pereyra',metodo:'',resultado:'',obs:''},
  {id:4,nroSocio:'32',asociado:'Tolaba Maximiliano Ezequiel',fecha:'15/03/2024',tipo:'Capacitación de Ingreso: Cooperativismo',lugar:'Oficina Central',servicio:'MIGUELETES.2423',instructor:'Santiago Ayala',metodo:'Evaluación oral',resultado:'Aprobado',obs:'Ingreso nuevo'},
  {id:5,nroSocio:'32',asociado:'Tolaba Maximiliano Ezequiel',fecha:'15/03/2024',tipo:'Capacitación de Ingreso: Productos y maquinarias',lugar:'Servicio',servicio:'MIGUELETES.2423',instructor:'Patricia Scaglia',metodo:'Evaluación escrita',resultado:'Aprobado',obs:''},
  {id:6,nroSocio:'71',asociado:'Gomez Diego Alejandro',fecha:'10/06/2024',tipo:'Capacitación de Ingreso: Normativas de trabajo',lugar:'Oficina Central',servicio:'RETEN.GENERAL',instructor:'Marina Iglesias',metodo:'Evaluación oral',resultado:'Aprobado',obs:''},
];
DB.tiposCapacitacion = ['Capacitación de Ingreso: Cooperativismo','Capacitación de Ingreso: Productos y maquinarias','Capacitación de Ingreso: Normativas de trabajo','Maquinarias: uso, manejo y mantenimiento','Interpretación del Plan de trabajo en Servicio','Productos, herramientas y modalidades de limpieza','Liderazgo','Atención al Cliente'];
DB.instructores = ['Miguel Pereyra','Patricia Scaglia','Marina Iglesias','Gina Martinez','Santiago Ayala','Encargado','Referente','Supervisor'];
DB.metodosEval = ['Evaluación oral','Evaluación escrita','Auditoría proceso','Auditoría SOL','Auditoría sistema','Evolución de indicador','Informe del supervisor','Encuesta al asociado'];

function renderCapacitaciones(lista){
  const rows=lista||DB.capacitaciones;
  $('st-cap-total').textContent=DB.capacitaciones.length;
  const anioActual=new Date().getFullYear();
  const unicosAnio=new Set(DB.capacitaciones.filter(c=>c.fecha.includes(String(anioActual))).map(c=>c.asociado));
  $('st-cap-anio').textContent=unicosAnio.size;
  const conIngreso=new Set(DB.capacitaciones.filter(c=>c.tipo.includes('Ingreso')).map(c=>c.nroSocio));
  $('st-cap-pend').textContent=DB.legajos.filter(l=>l.estado==='Activo'&&!conIngreso.has(String(l.nro))).length;
  $('st-cap-sin').textContent=DB.legajos.filter(l=>l.estado==='Activo'&&!DB.capacitaciones.find(c=>c.nroSocio===String(l.nro))).length;
  const BRES={'Aprobado':'badge-verde','Desaprobado':'badge-rojo','Pendiente evaluación':'badge-acento'};
  $('tbody-capacitaciones').innerHTML=rows.map((c,i)=>`<tr>
    <td style="font-weight:500;">${c.asociado}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${c.nroSocio}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${c.fecha}</td>
    <td><span class="chip" style="font-size:11px;">${c.tipo}</span></td>
    <td style="font-size:12px;">${c.lugar}</td>
    <td style="font-size:12px;">${c.servicio||'—'}</td>
    <td style="font-size:12px;">${c.instructor}</td>
    <td style="font-size:12px;">${c.metodo||'—'}</td>
    <td>${c.resultado?`<span class="badge ${BRES[c.resultado]||'badge-gris'}">${c.resultado}</span>`:'<span class="text-muted">—</span>'}</td>
    <td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.obs||'—'}</td>
    <td>${(DB.materiales||[]).find(m=>m.capTipo===c.tipo)?`<a href="${(DB.materiales||[]).find(m=>m.capTipo===c.tipo).url}" target="_blank" class="btn btn-ghost btn-xs">📎 Ver</a>`:'<span class="text-muted">—</span>'}</td>
    <td><button class="btn btn-secondary btn-xs">✏️</button></td>
  </tr>`).join('')||`<tr><td colspan="11"><div class="empty-state"><div class="icon">🎓</div><p>Sin registros de capacitación</p></div></td></tr>`;
}
function filtrarCapacitaciones(){
  const nom=($('cf-cap-nombre')||{value:''}).value.toLowerCase();
  const nro=($('cf-cap-nro')||{value:''}).value;
  const fecha=($('cf-cap-fecha')||{value:''}).value;
  const tipo=($('cf-cap-tipo2')||{value:''}).value;
  const lugar=($('cf-cap-lugar')||{value:''}).value;
  const serv=($('cf-cap-serv')||{value:''}).value.toLowerCase();
  const inst=($('cf-cap-inst')||{value:''}).value;
  const metodo=($('cf-cap-metodo')||{value:''}).value;
  const res=($('cf-cap-res')||{value:''}).value;
  const anio=($('cf-cap-anio')||{value:''}).value;
  renderCapacitaciones(DB.capacitaciones.filter(c=>
    (!nom||c.asociado.toLowerCase().includes(nom))&&(!nro||c.nroSocio.includes(nro))&&
    (!fecha||c.fecha.includes(fecha))&&(!tipo||c.tipo===tipo)&&(!lugar||c.lugar===lugar)&&
    (!serv||c.servicio.toLowerCase().includes(serv))&&(!inst||c.instructor===inst)&&
    (!metodo||c.metodo===metodo)&&(!res||c.resultado===res)&&(!anio||c.fecha.includes(anio))
  ));
}
function guardarCapacitacion(){
  const asoc=$('cap-asociado').value.trim();
  if(!asoc||!$('cap-tipo').value){toast('Completá asociado y tipo');return;}
  const f=new Date($('cap-fecha').value);
  DB.capacitaciones.push({id:Date.now(),nroSocio:$('cap-nro-socio').value||'—',asociado:asoc.split('(')[0].trim(),fecha:f.toLocaleDateString('es-AR'),tipo:$('cap-tipo').value,lugar:$('cap-lugar').value,servicio:$('cap-servicio').value,instructor:$('cap-instructor').value,metodo:$('cap-metodo').value,resultado:$('cap-resultado').value,obs:$('cap-obs').value});
  cerrarModal('modal-capacitacion');renderCapacitaciones();supaSync('capacitaciones', DB.capacitaciones[DB.capacitaciones.length-1]); supaSync('capacitaciones', DB.capacitaciones[DB.capacitaciones.length-1]); toast('✓ Capacitación registrada');
}
function analizarCapacitacionesIA(){
  const porTipo={};
  DB.capacitaciones.forEach(c=>{porTipo[c.tipo]=(porTipo[c.tipo]||0)+1;});
  const masFrec=Object.entries(porTipo).sort((a,b)=>b[1]-a[1])[0];
  const pct=DB.capacitaciones.length?Math.round(DB.capacitaciones.filter(c=>c.resultado==='Aprobado').length/DB.capacitaciones.length*100):0;
  toast(`🤖 "${masFrec?masFrec[0]:'—'}" es la más frecuente (${masFrec?masFrec[1]:0} registros). Tasa de aprobación: ${pct}%`,6000);
}
function poblarSelectsCapacitaciones(){
  const fS=(id,items)=>{const el=$(id);if(!el)return;const ph=el.options[0]?.outerHTML||'';el.innerHTML=ph+items.map(i=>`<option>${i}</option>`).join('');};
  fS('cap-tipo',DB.tiposCapacitacion);fS('cf-cap-tipo',DB.tiposCapacitacion);fS('cf-cap-tipo2',DB.tiposCapacitacion);
  fS('cap-instructor',DB.instructores);fS('cf-cap-inst',DB.instructores);fS('cf-cap-metodo',DB.metodosEval);
  const fDL=(id,items)=>{const el=$(id);if(el)el.innerHTML=items.map(i=>`<option value="${i}">`).join('');};
  fDL('dl-serv-cap',obtenerServiciosActivos());
}

function buscarAsocCapacitacion(){
  const inp=$('cap-asociado');
  const res=$('cap-asoc-results');
  if(!inp||!res) return;
  const q=inp.value.toLowerCase().trim();
  if(q.length<2){res.style.display='none';res.innerHTML='';return;}
  const activos=(DB.legajos||[]).filter(l=>l.estado==='Activo');
  const matches=activos.filter(l=>l.nombre.toLowerCase().includes(q)||String(l.nro).includes(q)).slice(0,8);
  if(!matches.length){res.style.display='none';res.innerHTML='';return;}
  res.innerHTML=matches.map(l=>
    '<div data-nro="'+l.nro+'" data-nombre="'+l.nombre+'" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--borde);display:flex;justify-content:space-between;align-items:center;" onmouseenter="this.style.background=\'var(--azul-claro)\'" onmouseleave="this.style.background=\'white\'" onclick="seleccionarAsocCapacitacion(this)">'
      +'<span style="font-weight:500;">'+l.nombre+'</span>'
      +'<span style="font-size:11px;color:var(--texto-suave);font-family:\'DM Mono\',monospace;">N° '+l.nro+'</span>'
    +'</div>'
  ).join('');
  res.style.display='block';
}

function seleccionarAsocCapacitacion(el){
  const nombre=el.dataset.nombre;
  const nro=el.dataset.nro;
  const inp=$('cap-asociado');
  const nroEl=$('cap-nro-socio');
  const res=$('cap-asoc-results');
  if(inp) inp.value=nombre;
  if(nroEl) nroEl.value=nro;
  if(res){res.style.display='none';res.innerHTML='';}
  // Pre-cargar servicio del legajo
  const leg=(DB.legajos||[]).find(l=>l.nro===parseInt(nro));
  if(leg){
    const sEl=$('cap-servicio');if(sEl&&leg.servicio) sEl.value=leg.servicio;
  }
}

// ========== MÓDULO VACACIONES ==========
DB.sectoresAdmin=['Consejo de Administración','Coord. General','Coord. RRHH','Coord. Operaciones y Planeamiento','Coord. Calidad','Coord. Logística y Distribución','Coord. Marketing y Ventas','Coord. Administración y Finanzas'];
DB.vacAdmin=[
  {id:1,nroSocio:'2',asociado:'Peretti Juan Carlos',sector:'Consejo de Administración',anio:'2025',diasCorresp:28,planilla:'SI',diasSol:13,desde:'10/02/2026',hasta:'22/02/2026',pendientes:15,cumple:'SI',reemplaza:'',obs:''},
  {id:2,nroSocio:'38',asociado:'Recalde Samaniego Richard',sector:'Coord. Operaciones y Planeamiento',anio:'2025',diasCorresp:28,planilla:'SI',diasSol:7,desde:'02/02/2026',hasta:'08/02/2026',pendientes:21,cumple:'SI',reemplaza:'',obs:''},
  {id:3,nroSocio:'43',asociado:'Arispe Alfredo Julian',sector:'Coord. RRHH',anio:'2025',diasCorresp:28,planilla:'SI',diasSol:7,desde:'20/10/2025',hasta:'26/10/2025',pendientes:21,cumple:'SI',reemplaza:'',obs:''},
  {id:4,nroSocio:'22',asociado:'Recalde Samaniego Cecilia',sector:'Coord. Administración y Finanzas',anio:'2025',diasCorresp:21,planilla:'',diasSol:0,desde:'',hasta:'',pendientes:21,cumple:'',reemplaza:'',obs:''},
];
DB.vacOperativo=[
  {id:1,fechaSol:'13/12/2023',nroSocio:'2123',asociado:'Eliana López',supervisor:'Patricia',servicio:'Club Chicago',cantidad:'Dos semanas',anio:'2024',desde:'17/02/2024',hasta:'26/02/2024',retorno:'27/02/2024',cumple:'SI',formFisico:'Pendiente',reemplaza:'',estado:'Aprobado',obs:''},
  {id:2,fechaSol:'13/12/2023',nroSocio:'4662',asociado:'Vivas Cristian',supervisor:'Claudio',servicio:'Tecnópolis',cantidad:'Dos semanas',anio:'2024',desde:'07/02/2024',hasta:'21/02/2024',retorno:'22/02/2024',cumple:'SI',formFisico:'Entregado',reemplaza:'',estado:'Aprobado',obs:''},
  {id:3,fechaSol:'13/12/2023',nroSocio:'3365',asociado:'Lozano Erika',supervisor:'Claudio',servicio:'Tecnópolis',cantidad:'Una semana',anio:'2023',desde:'22/12/2023',hasta:'27/12/2023',retorno:'28/12/2023',cumple:'SI',formFisico:'Entregado',reemplaza:'',estado:'Aprobado',obs:''},
  {id:4,fechaSol:'14/12/2023',nroSocio:'3401',asociado:'Analia Nieva',supervisor:'Dario',servicio:'Newsan',cantidad:'Una semana',anio:'2024',desde:'22/01/2024',hasta:'28/01/2024',retorno:'29/01/2024',cumple:'SI',formFisico:'Pendiente',reemplaza:'',estado:'Pendiente',obs:''},
  {id:5,fechaSol:'14/12/2023',nroSocio:'4219',asociado:'Fernando Trejo',supervisor:'Santiago',servicio:'Reten',cantidad:'Dos semanas',anio:'2024',desde:'10/03/2024',hasta:'24/03/2024',retorno:'25/03/2024',cumple:'SI',formFisico:'Pendiente',reemplaza:'',estado:'Pendiente',obs:''},
];

function tabVacaciones(tab,btn){
  document.querySelectorAll('#screen-vacaciones .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-vacaciones .tab-btn').forEach(b=>b.classList.remove('active'));
  $('vac-tab-'+tab).classList.add('active');if(btn)btn.classList.add('active');
  if(tab==='calendario') renderCalendarioVacaciones();
}
function renderVacaciones(){
  renderVacAdmin();renderVacOp();
  const hoy=new Date();
  const parseF=f=>{if(!f)return null;const[dd,mm,yy]=f.split('/');return new Date(`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);};
  const enVac=[...DB.vacAdmin,...DB.vacOperativo].filter(v=>{const d=parseF(v.desde),h=parseF(v.hasta);return d&&h&&hoy>=d&&hoy<=h;}).length;
  $('st-vac-ahora').textContent=enVac;
  $('st-vac-pend').textContent=DB.vacOperativo.filter(v=>v.estado==='Pendiente').length;
  $('st-vac-aprobadas').textContent=DB.vacAdmin.filter(v=>v.diasSol>0).length+DB.vacOperativo.filter(v=>v.estado==='Aprobado').length;
  $('st-vac-dias').textContent=DB.vacAdmin.reduce((s,v)=>s+(v.pendientes||0),0);
}
function renderVacAdmin(lista){
  const rows=lista||DB.vacAdmin;
  const calcAntig=nro=>{const l=DB.legajos.find(x=>String(x.nro)===String(nro));if(!l||!l.ingreso)return'—';const[dd,mm,yy]=l.ingreso.split('/');const a=Math.floor((new Date()-new Date(`${yy}-${mm}-${dd}`))/(365.25*24*3600*1000));return`${a} años`;};
  $('tbody-vac-admin').innerHTML=rows.map((v,i)=>`<tr>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${v.nroSocio}</td>
    <td style="font-weight:500;">${v.asociado}</td>
    <td><span class="chip" style="font-size:10px;">${v.sector}</span></td>
    <td style="font-size:12px;text-align:center;">${calcAntig(v.nroSocio)}</td>
    <td style="font-size:16px;font-weight:700;text-align:center;color:var(--azul);">${v.diasCorresp}</td>
    <td style="text-align:center;">${v.planilla===''?'<span class="text-muted">—</span>':badge(v.planilla==='SI'?'Activo':'No asistió')}</td>
    <td style="font-size:14px;font-weight:700;text-align:center;">${v.diasSol||'—'}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${v.desde||'—'}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${v.hasta||'—'}</td>
    <td style="font-size:16px;font-weight:700;text-align:center;color:${v.pendientes>0?'var(--naranja)':'var(--verde)'};">${v.pendientes}</td>
    <td style="text-align:center;">${v.cumple===''?'<span class="text-muted">—</span>':badge(v.cumple==='SI'?'Activo':'No asistió')}</td>
    <td style="font-size:12px;">${v.reemplaza||'—'}</td>
    <td><button class="btn btn-secondary btn-xs" onclick="abrirEditarVacAdmin(${i})">✏️</button></td>
  </tr>`).join('')||`<tr><td colspan="13"><div class="empty-state"><div class="icon">🏖️</div><p>Sin registros de vacaciones</p></div></td></tr>`;
}
function filtrarVacAdmin(){
  const nro=($('cf-va-nro')||{value:''}).value;
  const nom=($('cf-va-nombre')||{value:''}).value.toLowerCase();
  const sec=($('cf-va-sector')||{value:''}).value;
  const plan=($('cf-va-planilla')||{value:''}).value;
  const cumple=($('cf-va-cumple')||{value:''}).value;
  const anio=($('cf-vac-anio-admin')||{value:''}).value;
  const ree=($('cf-va-reemplazo')||{value:''}).value.toLowerCase();
  renderVacAdmin(DB.vacAdmin.filter(v=>(!nro||String(v.nroSocio).includes(nro))&&(!nom||v.asociado.toLowerCase().includes(nom))&&(!sec||v.sector===sec)&&(!plan||v.planilla===plan)&&(!cumple||v.cumple===cumple)&&(!anio||v.anio===anio)&&(!ree||(v.reemplaza||'').toLowerCase().includes(ree))));
}
function guardarVacAdmin(){
  const asoc=$('va-asociado').value.trim();if(!asoc){toast('Ingresá el asociado');return;}
  const dS=parseInt($('va-dias-sol').value)||0, dC=parseInt($('va-dias-corresp').value)||14;
  const fmtF=v=>{if(!v)return'';const d=new Date(v);return d.toLocaleDateString('es-AR');};
  DB.vacAdmin.push({id:Date.now(),nroSocio:'—',asociado:asoc.split('(')[0].trim(),sector:$('va-sector').value,anio:$('va-anio').value,diasCorresp:dC,planilla:$('va-planilla').value,diasSol:dS,desde:fmtF($('va-desde').value),hasta:fmtF($('va-hasta').value),pendientes:dC-dS,cumple:$('va-cumple').value,reemplaza:$('va-reemplaza').value,obs:$('va-obs').value});
  cerrarModal('modal-vac-admin');renderVacaciones();supaSync('vacAdmin', DB.vacAdmin[DB.vacAdmin.length-1]); toast('✓ Vacaciones registradas');
}
function calcularVacAdmin(){
  const d=$('va-desde')?.value,h=$('va-hasta')?.value;
  if(d&&h){const dias=Math.round((new Date(h)-new Date(d))/(1000*3600*24));if($('va-dias-sol'))$('va-dias-sol').value=dias;const c=parseInt($('va-dias-corresp')?.value)||14;if($('va-pendientes'))$('va-pendientes').value=c-dias;}
}
function abrirEditarVacAdmin(i){toast('Editar vacación #'+i+' — disponible en próxima versión');}

function renderVacOp(lista){
  const rows=lista||DB.vacOperativo;
  $('tbody-vac-op').innerHTML=rows.map((v,i)=>`<tr>
    <td style="font-size:12px;color:var(--texto-suave);">${v.fechaSol}</td>
    <td style="font-weight:500;">${v.asociado}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${v.nroSocio}</td>
    <td style="font-size:12px;">${v.supervisor}</td>
    <td style="font-size:12px;">${v.servicio}</td>
    <td><span class="badge ${v.cantidad==='Dos semanas'?'badge-azul':'badge-acento'}">${v.cantidad}</span></td>
    <td style="font-size:12px;">${v.desde}</td><td style="font-size:12px;">${v.hasta}</td>
    <td style="font-size:12px;font-weight:500;">${v.retorno}</td>
    <td style="text-align:center;">${badge(v.cumple==='SI'?'Activo':'No asistió')}</td>
    <td style="text-align:center;">${badge(v.formFisico==='Entregado'?'Apto':'Pendiente')}</td>
    <td style="font-size:12px;">${v.reemplaza||'—'}</td>
    <td><span class="badge ${v.estado==='Aprobado'?'badge-verde':v.estado==='Rechazado'?'badge-rojo':'badge-acento'}">${v.estado}</span></td>
    <td style="display:flex;gap:3px;">
      <button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="cambiarEstadoVacOp(${i},'Aprobado')">✓</button>
      <button class="btn btn-xs" style="background:var(--rojo-suave);color:var(--rojo);border:1px solid #f5c6c0;" onclick="cambiarEstadoVacOp(${i},'Rechazado')">✕</button>
    </td>
  </tr>`).join('')||`<tr><td colspan="14"><div class="empty-state"><div class="icon">👷</div><p>Sin solicitudes de descanso</p></div></td></tr>`;
}
function filtrarVacOp(){
  const nom=($('cf-vo-nombre')||{value:''}).value.toLowerCase();
  const sup=($('cf-vo-sup')||{value:''}).value;
  const serv=($('cf-vo-serv')||{value:''}).value.toLowerCase();
  const cant=($('cf-vo-cant')||{value:''}).value;
  const cumple=($('cf-vo-cumple')||{value:''}).value;
  const form=($('cf-vo-form')||{value:''}).value;
  const ree=($('cf-vo-reemplazo')||{value:''}).value.toLowerCase();
  const estado=($('cf-vo-est')||{value:''}).value;
  const anio=($('cf-vo-anio')||{value:''}).value;
  renderVacOp(DB.vacOperativo.filter(v=>(!nom||v.asociado.toLowerCase().includes(nom))&&(!sup||v.supervisor===sup)&&(!serv||v.servicio.toLowerCase().includes(serv))&&(!cant||v.cantidad===cant)&&(!cumple||v.cumple===cumple)&&(!form||v.formFisico===form)&&(!ree||(v.reemplaza||'').toLowerCase().includes(ree))&&(!estado||v.estado===estado)&&(!anio||v.anio===anio)));
}
function cambiarEstadoVacOp(idx,estado){DB.vacOperativo[idx].estado=estado;renderVacOp();toast(`✓ ${DB.vacOperativo[idx].asociado}: ${estado}`);}
function guardarVacOp(){
  const asoc=$('vo-asociado').value.trim();if(!asoc){toast('Ingresá el asociado');return;}
  const fmtF=v=>{if(!v)return'';return new Date(v).toLocaleDateString('es-AR');};
  DB.vacOperativo.push({id:Date.now(),fechaSol:new Date().toLocaleDateString('es-AR'),nroSocio:$('vo-nro').value||'—',asociado:asoc.split('(')[0].trim(),supervisor:$('vo-supervisor').value,servicio:$('vo-servicio').value,cantidad:$('vo-cantidad').value,anio:$('vo-anio').value,desde:fmtF($('vo-desde').value),hasta:fmtF($('vo-hasta').value),retorno:fmtF($('vo-retorno').value),cumple:$('vo-cumple').value,formFisico:$('vo-form').value,reemplaza:$('vo-reemplaza').value,estado:'Pendiente',obs:$('vo-obs').value});
  cerrarModal('modal-vac-op');renderVacaciones();supaSync('vacOperativo', DB.vacOperativo[DB.vacOperativo.length-1]); toast('✓ Solicitud de descanso registrada');
}

let mesVacOffset=0;
function cambiarMesVac(dir){mesVacOffset+=dir;renderCalendarioVacaciones();}
function renderCalendarioVacaciones(){
  const hoy=new Date();
  const base=new Date(hoy.getFullYear(),hoy.getMonth()+mesVacOffset,1);
  const mes=base.getMonth(),anio=base.getFullYear();
  const diasEnMes=new Date(anio,mes+1,0).getDate();
  const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const lbl=$('mes-vac-label');if(lbl)lbl.textContent=`${meses[mes]} ${anio}`;
  const parseF=f=>{if(!f)return null;const[dd,mm,yy]=f.split('/');return new Date(`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);};
  const ausencias={};
  [...DB.vacAdmin,...DB.vacOperativo].forEach(v=>{
    const d=parseF(v.desde),h=parseF(v.hasta);if(!d||!h)return;
    for(let cur=new Date(d);cur<=h;cur.setDate(cur.getDate()+1)){
      if(cur.getMonth()===mes&&cur.getFullYear()===anio){
        const dia=cur.getDate();
        if(!ausencias[dia])ausencias[dia]=[];
        ausencias[dia].push(v.asociado.split(' ')[0]);
      }
    }
  });
  const personas=[...new Set(Object.values(ausencias).flat())].sort();
  const diasNom=['D','L','M','M','J','V','S'];
  if(!personas.length){
    $('calendario-vacaciones').innerHTML=`<div style="text-align:center;padding:40px;color:var(--texto-muy-suave);">Sin ausencias registradas en ${meses[mes]} ${anio}</div>`;
    return;
  }
  let html=`<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr>
    <th style="padding:6px 10px;background:#f8f9fd;border:1px solid var(--borde);text-align:left;min-width:110px;font-size:11px;">Persona</th>`;
  for(let d=1;d<=diasEnMes;d++){
    const dow=new Date(anio,mes,d).getDay();
    const esHoy=anio===hoy.getFullYear()&&mes===hoy.getMonth()&&d===hoy.getDate();
    const esFin=dow===0||dow===6;
    html+=`<th style="padding:3px 1px;text-align:center;font-size:10px;background:${esHoy?'var(--azul)':esFin?'var(--gris-suave)':'#f8f9fd'};color:${esHoy?'white':esFin?'var(--gris)':'var(--texto-suave)'};border:1px solid var(--borde);min-width:24px;"><div>${diasNom[dow]}</div><div style="font-weight:700;">${d}</div></th>`;
  }
  html+=`</tr></thead><tbody>`;
  personas.forEach(p=>{
    html+=`<tr><td style="padding:5px 10px;border:1px solid var(--borde);font-weight:500;">${p}</td>`;
    for(let d=1;d<=diasEnMes;d++){
      const ausente=ausencias[d]&&ausencias[d].includes(p);
      const dow=new Date(anio,mes,d).getDay();const esFin=dow===0||dow===6;
      html+=`<td style="border:1px solid var(--borde);text-align:center;background:${ausente?'var(--azul-medio)':esFin?'var(--gris-suave)':'white'};">${ausente?'<span style="font-size:10px;">🏖</span>':''}</td>`;
    }
    html+=`</tr>`;
  });
  html+=`</tbody></table>`;
  $('calendario-vacaciones').innerHTML=html;
}

function poblarSelectsVacaciones(){
  const fS=(id,items)=>{const el=$(id);if(!el)return;const ph=el.options[0]?.outerHTML||'';el.innerHTML=ph+items.map(i=>`<option>${i}</option>`).join('');};
  fS('va-sector',DB.sectoresAdmin);fS('cf-va-sector',DB.sectoresAdmin);fS('cf-vac-sector',DB.sectoresAdmin);
  fS('vo-supervisor',DB.supervisores);fS('cf-vo-sup',DB.supervisores);
  const fDL=(id,items)=>{const el=$(id);if(el)el.innerHTML=items.map(i=>`<option value="${i}">`).join('');};
  fDL('dl-asoc-va2',DB.legajos.map(l=>`${l.nombre} (N°${l.nro})`));
  fDL('dl-asoc-vo2',DB.legajos.map(l=>`${l.nombre} (N°${l.nro})`));
  fDL('dl-serv-vo',obtenerServiciosActivos());
}

function buscarAsocVac(prefix){
  var inp=$(prefix+'-asociado');
  var res=$(prefix+'-asoc-results');
  if(!inp||!res) return;
  var q=inp.value.toLowerCase().trim();
  if(q.length<2){res.style.display='none';res.innerHTML='';return;}
  var activos=(DB.legajos||[]).filter(function(l){return l.estado==='Activo';});
  var matches=activos.filter(function(l){return l.nombre.toLowerCase().includes(q)||String(l.nro).includes(q);}).slice(0,8);
  if(!matches.length){res.style.display='none';res.innerHTML='';return;}
  res.innerHTML=matches.map(function(l){
    return '<div data-nro="'+l.nro+'" data-nombre="'+l.nombre+'" data-servicio="'+(l.servicio||'')+'" data-supervisor="'+(l.supervisor||'')+'" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--borde);display:flex;justify-content:space-between;align-items:center;" onmouseenter="this.style.background=\'var(--azul-claro)\'" onmouseleave="this.style.background=\'white\'" onclick="seleccionarAsocVac(\''+prefix+'\',this)">'
      +'<span style="font-weight:500;">'+l.nombre+'</span>'
      +'<span style="font-size:11px;color:var(--texto-suave);font-family:\'DM Mono\',monospace;">N° '+l.nro+'</span>'
    +'</div>';
  }).join('');
  res.style.display='block';
}

function seleccionarAsocVac(prefix,el){
  var nombre=el.dataset.nombre;
  var nro=el.dataset.nro;
  var servicio=el.dataset.servicio;
  var supervisor=el.dataset.supervisor;
  var inp=$(prefix+'-asociado');
  var res=$(prefix+'-asoc-results');
  if(inp) inp.value=nombre;
  if(res){res.style.display='none';res.innerHTML='';}
  if(prefix==='va'){
    // Modal admin: calcular días y pre-cargar nro socio en hidden
    var nroEl=$('va-nro-socio');if(nroEl) nroEl.value=nro;
    // Calcular antigüedad → días correspondientes
    var leg=(DB.legajos||[]).find(function(l){return l.nro===parseInt(nro);});
    if(leg&&leg.ingreso){
      var p=leg.ingreso.split('/');
      var antig=Math.floor((new Date()-new Date(p[2]+'-'+p[1]+'-'+p[0]))/(365.25*24*3600*1000));
      var dias=antig>=20?35:antig>=15?28:antig>=10?21:14;
      var dcEl=$('va-dias-corresp');if(dcEl) dcEl.value=dias;
    }
  } else {
    // Modal operativo: pre-cargar nro, servicio, supervisor
    var nroOp=$('vo-nro');if(nroOp) nroOp.value=nro;
    var servEl=$('vo-servicio');if(servEl&&servicio) servEl.value=servicio;
    var supEl=$('vo-supervisor');if(supEl&&supervisor){
      for(var i=0;i<supEl.options.length;i++){if(supEl.options[i].text===supervisor){supEl.selectedIndex=i;break;}}
    }
  }
}

// ========== TABS CAPACITACIONES ==========
function tabCap(tab, btn){
  document.querySelectorAll('#screen-capacitaciones .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-capacitaciones .tab-btn').forEach(b=>b.classList.remove('active'));
  $('cap-tab-'+tab).classList.add('active');
  if(btn) btn.classList.add('active');
  if(tab==='estadisticas') renderStatsCapacitaciones();
  if(tab==='plan') { renderCalendarioPlan(); renderResumenPlan(); }
  if(tab==='repositorio') renderMateriales();
  if(tab==='evaluaciones') renderEvaluaciones();
}

// ========== REPOSITORIO DE MATERIALES ==========
DB.materiales = [
  {id:1,nombre:'Video: Uso correcto de maquinaria industrial',tipo:'Video',capTipo:'Maquinarias: uso, manejo y mantenimiento',url:'https://youtube.com/watch?v=ejemplo1',duracion:'20 minutos',desc:'Instructivo paso a paso del uso y mantenimiento diario de maquinaria de limpieza.',requiereEval:'Sí',fechaAlta:'10/01/2024'},
  {id:2,nombre:'Manual de cooperativismo — PDF',tipo:'PDF',capTipo:'Capacitación de Ingreso: Cooperativismo',url:'https://drive.google.com/ejemplo-manual',duracion:'Lectura 30 min',desc:'Manual completo sobre principios cooperativos y estatuto de Ohlimpia.',requiereEval:'Sí',fechaAlta:'01/02/2024'},
  {id:3,nombre:'Presentación normativas de trabajo',tipo:'PowerPoint',capTipo:'Capacitación de Ingreso: Normativas de trabajo',url:'https://drive.google.com/ejemplo-ppt',duracion:'45 minutos',desc:'Diapositivas de la capacitación presencial sobre normativas.',requiereEval:'No',fechaAlta:'15/03/2024'},
  {id:4,nombre:'Video: Atención al cliente en supermercados',tipo:'Video',capTipo:'Atención al Cliente',url:'https://youtube.com/watch?v=ejemplo4',duracion:'12 minutos',desc:'Situaciones reales y cómo actuar ante clientes en entorno de supermercado.',requiereEval:'Sí',fechaAlta:'20/05/2024'},
];

function renderMateriales(lista){
  const rows=lista||DB.materiales;
  const iconos={'Video':'🎬','PDF':'📄','PowerPoint':'📊','Documento Word':'📝','Link externo':'🔗'};
  const colores={'Video':'badge-rojo','PDF':'badge-naranja','PowerPoint':'badge-azul','Documento Word':'badge-azul','Link externo':'badge-gris'};
  $('grilla-materiales').innerHTML=rows.map(m=>`
    <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio-lg);padding:16px;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="font-size:28px;">${iconos[m.tipo]||'📎'}</div>
        <span class="badge ${colores[m.tipo]||'badge-gris'}" style="font-size:10px;">${m.tipo}</span>
      </div>
      <div style="font-weight:600;font-size:13px;">${m.nombre}</div>
      <div style="font-size:11px;color:var(--texto-suave);">${m.capTipo}</div>
      <div style="font-size:11px;color:var(--texto-muy-suave);">⏱ ${m.duracion}</div>
      <div style="font-size:11px;color:var(--texto-suave);flex:1;">${m.desc}</div>
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
        <a href="${m.url}" target="_blank" class="btn btn-primary btn-xs">▶ Abrir</a>
        ${m.requiereEval==='Sí'?'<span class="badge badge-acento" style="font-size:10px;">📝 Requiere evaluación</span>':''}
      </div>
    </div>`).join('')||'<p class="text-muted">Sin materiales cargados aún.</p>';
}

function filtrarMateriales(){
  const busq=($('buscar-material')||{value:''}).value.toLowerCase();
  const tipo=($('cf-mat-tipo')||{value:''}).value;
  const cap=($('cf-mat-cap')||{value:''}).value;
  renderMateriales(DB.materiales.filter(m=>
    (!busq||m.nombre.toLowerCase().includes(busq))&&
    (!tipo||m.tipo===tipo)&&
    (!cap||m.capTipo===cap)
  ));
}

function guardarMaterial(){
  const nombre=$('mat-nombre').value.trim();
  if(!nombre||!$('mat-url').value.trim()){toast('Completá nombre y URL');return;}
  DB.materiales.push({id:Date.now(),nombre,tipo:$('mat-tipo').value,capTipo:$('mat-cap-tipo').value,url:$('mat-url').value,duracion:$('mat-duracion').value,desc:$('mat-desc').value,requiereEval:$('mat-requiere-eval').value,fechaAlta:new Date().toLocaleDateString('es-AR')});
  cerrarModal('modal-material');renderMateriales();supaSync('materiales', DB.materiales[DB.materiales.length-1]); toast('✓ Material agregado al repositorio');
}

// ========== ESTADÍSTICAS AVANZADAS ==========
function renderStatsCapacitaciones(){
  const fTipo=($('f-stats-tipo')||{value:''}).value;
  const fServ=($('f-stats-serv')||{value:''}).value;

  // Cobertura por tipo de capacitación
  const cobTipo=$('stats-cobertura-tipo');
  if(cobTipo){
    const asociadosActivos=DB.legajos.filter(l=>l.estado==='Activo');
    cobTipo.innerHTML=DB.tiposCapacitacion.map(tipo=>{
      const capacitados=new Set(DB.capacitaciones.filter(c=>c.tipo===tipo).map(c=>c.nroSocio));
      const pct=asociadosActivos.length?Math.round(capacitados.size/asociadosActivos.length*100):0;
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px;">
          <span style="font-weight:500;">${tipo.replace('Capacitación de Ingreso: ','').substring(0,35)}</span>
          <span style="font-weight:700;color:${pct>=80?'var(--verde)':pct>=50?'var(--naranja)':'var(--rojo)'};">${capacitados.size}/${asociadosActivos.length} (${pct}%)</span>
        </div>
        <div style="height:8px;background:var(--borde);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${pct>=80?'var(--verde)':pct>=50?'var(--naranja)':'var(--rojo)'};border-radius:4px;transition:width .3s;"></div>
        </div>
      </div>`;
    }).join('');
  }

  // Cobertura por servicio (top 8)
  const cobServ=$('stats-cobertura-servicio');
  if(cobServ){
    const serviciosConLegajos=[...new Set(DB.legajos.filter(l=>l.estado==='Activo').map(l=>l.servicio))].filter(Boolean).slice(0,8);
    cobServ.innerHTML=serviciosConLegajos.map(serv=>{
      const asocEnServ=DB.legajos.filter(l=>l.estado==='Activo'&&l.servicio===serv);
      const capacitados=new Set(DB.capacitaciones.filter(c=>c.servicio===serv||asocEnServ.find(a=>String(a.nro)===c.nroSocio)).map(c=>c.nroSocio));
      const pct=asocEnServ.length?Math.round(capacitados.size/asocEnServ.length*100):0;
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px;">
          <span style="font-weight:500;">${serv}</span>
          <span style="color:${pct>=80?'var(--verde)':pct>=50?'var(--naranja)':'var(--rojo)'};">${capacitados.size}/${asocEnServ.length}</span>
        </div>
        <div style="height:6px;background:var(--borde);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${pct>=80?'var(--verde)':pct>=50?'var(--naranja)':'var(--rojo)'};border-radius:3px;"></div>
        </div>
      </div>`;
    }).join('');
  }

  // Tabla de pendientes
  const tbody=$('tbody-stats-pendientes');
  if(tbody){
    const activos=DB.legajos.filter(l=>l.estado==='Activo');
    const conPendientes=activos.map(l=>{
      const realizadas=new Set(DB.capacitaciones.filter(c=>c.nroSocio===String(l.nro)).map(c=>c.tipo));
      const pendientes=DB.tiposCapacitacion.filter(t=>!realizadas.has(t));
      return{...l,realizadas:[...realizadas],pendientes};
    }).filter(l=>l.pendientes.length>0)
      .filter(l=>(!fServ||l.servicio===fServ));

    const antig=l=>{if(!l.ingreso)return'';const[dd,mm,yy]=l.ingreso.split('/');const a=Math.floor((new Date()-new Date(`${yy}-${mm}-${dd}`))/(365.25*24*3600*1000));return`${a} años`;};
    const riesgo=l=>l.pendientes.length>=6?'badge-rojo':l.pendientes.length>=3?'badge-acento':'badge-verde';
    const riesgoTxt=l=>l.pendientes.length>=6?'Alto':l.pendientes.length>=3?'Medio':'Bajo';

    tbody.innerHTML=conPendientes.map(l=>`<tr>
      <td style="font-weight:500;">${l.nombre}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${l.nro}</td>
      <td style="font-size:12px;">${l.servicio}</td>
      <td style="font-size:12px;">${l.supervisor}</td>
      <td><div style="display:flex;flex-wrap:wrap;gap:3px;">${l.realizadas.map(t=>`<span class="chip" style="font-size:10px;">${t.replace('Capacitación de Ingreso: ','')}</span>`).join('')||'<span class="text-muted">Ninguna</span>'}</div></td>
      <td><span class="badge badge-rojo">${l.pendientes.length}</span></td>
      <td style="font-size:12px;">${antig(l)}</td>
    </tr>`).join('')||`<tr><td colspan="7"><div class="empty-state"><div class="icon">✅</div><p>Todos los asociados tienen sus capacitaciones al día</p></div></td></tr>`;
  }

  // Rotación
  const rotDiv=$('stats-rotacion');
  if(rotDiv){
    const conRotacion=DB.legajos.filter(l=>{
      const servicios=new Set(DB.capacitaciones.filter(c=>c.nroSocio===String(l.nro)).map(c=>c.servicio).filter(Boolean));
      return servicios.size>1;
    });
    if(!conRotacion.length){rotDiv.innerHTML='<p class="text-muted">Sin asociados con capacitaciones en múltiples servicios aún.</p>';return;}
    rotDiv.innerHTML=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${conRotacion.slice(0,9).map(l=>{
        const servicios=[...new Set(DB.capacitaciones.filter(c=>c.nroSocio===String(l.nro)).map(c=>c.servicio).filter(Boolean))];
        return`<div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px;">
          <div style="font-size:11px;color:var(--texto-suave);margin-top:4px;">${servicios.map(s=>`<span class="chip" style="font-size:10px;">${s}</span>`).join(' ')}</div>
        </div>`;
      }).join('')}
    </div>`;
  }
}

// ========== PLAN ANUAL ==========
DB.planCapacitaciones = []; // {id, fecha, asociado, nroSocio, tipo, modalidad, supervisor, estado, generadoPorIA}
let mesPlanOffset = 0;

function cambiarMesPlan(dir){ mesPlanOffset+=dir; renderCalendarioPlan(); }

function generarPlanIA(){
  const anio=parseInt($('plan-anio').value)||new Date().getFullYear();
  const prioridad=$('plan-prioridad')?.value||'';
  const modOfi=$('plan-mod-oficina')?.checked;
  const modServ=$('plan-mod-servicio')?.checked;
  const modMeet=$('plan-mod-meet')?.checked;
  const modVideo=$('plan-mod-video')?.checked;
  const maxSem=parseInt($('plan-max-semana')?.value)||2;

  // Limpiar plan anterior del año
  DB.planCapacitaciones=DB.planCapacitaciones.filter(p=>!p.generadoPorIA||!p.fecha.includes(String(anio)));

  const activos=DB.legajos.filter(l=>l.estado==='Activo');
  const modalidades=[];
  if(modVideo) modalidades.push('Video');
  if(modMeet) modalidades.push('Meet/Virtual');
  if(modServ) modalidades.push('En el servicio');
  if(modOfi) modalidades.push('Oficina Central');
  if(!modalidades.length){toast('Habilitá al menos una modalidad');return;}

  let semana=1, dia=1, mes=1;
  let countSemana=0;
  let nuevos=0;

  // Priorizar según configuración
  let lista=[...activos];
  if(prioridad.includes('ingresos')) lista.sort((a,b)=>{const fa=new Date(a.fechaIngresoPrueba||'2020'),fb=new Date(b.fechaIngresoPrueba||'2020');return fb-fa;});
  else if(prioridad.includes('ninguna')) lista.sort((a,b)=>{const ca=DB.capacitaciones.filter(c=>c.nroSocio===String(a.nro)).length;const cb=DB.capacitaciones.filter(c=>c.nroSocio===String(b.nro)).length;return ca-cb;});

  lista.forEach(l=>{
    const realizadas=new Set(DB.capacitaciones.filter(c=>c.nroSocio===String(l.nro)).map(c=>c.tipo));
    const pendientes=DB.tiposCapacitacion.filter(t=>!realizadas.has(t));
    pendientes.forEach(tipo=>{
      if(mes>12) return;
      const modalidad=modalidades[Math.floor(Math.random()*modalidades.length)];
      const fecha=`${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${anio}`;
      DB.planCapacitaciones.push({
        id:Date.now()+nuevos,fecha,asociado:l.nombre,nroSocio:String(l.nro),
        tipo,modalidad,supervisor:l.supervisor,estado:'Planificado',generadoPorIA:true
      });
      nuevos++;
      countSemana++;
      if(countSemana>=maxSem){ countSemana=0; dia+=7; if(dia>28){dia=1;mes++;}}
    });
  });

  renderCalendarioPlan();
  renderResumenPlan();
  toast(`🤖 Plan generado: ${nuevos} capacitaciones planificadas para ${anio}`,5000);
}

function renderResumenPlan(){
  const el=$('resumen-plan');if(!el)return;
  const anio=parseInt($('plan-anio')?.value)||new Date().getFullYear();
  const plan=DB.planCapacitaciones.filter(p=>p.fecha.includes(String(anio)));
  if(!plan.length){el.innerHTML='<p class="text-muted">Generá el plan para ver el resumen.</p>';return;}
  const porMod={};
  plan.forEach(p=>{porMod[p.modalidad]=(porMod[p.modalidad]||0)+1;});
  const asociados=new Set(plan.map(p=>p.nroSocio));
  el.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;"><span class="text-muted">Capacitaciones planificadas</span><strong>${plan.length}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span class="text-muted">Asociados involucrados</span><strong>${asociados.size}</strong></div>
      <div class="divider" style="margin:4px 0;"></div>
      ${Object.entries(porMod).map(([m,n])=>`<div style="display:flex;justify-content:space-between;font-size:12px;"><span>${m}</span><strong>${n}</strong></div>`).join('')}
      <div class="divider" style="margin:4px 0;"></div>
      <div style="font-size:11px;color:var(--texto-muy-suave);">El plan se actualiza automáticamente cuando se registran altas o bajas.</div>
    </div>`;
}

function renderCalendarioPlan(){
  const hoy=new Date();
  const base=new Date(hoy.getFullYear(),hoy.getMonth()+mesPlanOffset,1);
  const mes=base.getMonth(),anio=base.getFullYear();
  const diasEnMes=new Date(anio,mes+1,0).getDate();
  const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const lbl=$('mes-plan-label');if(lbl)lbl.textContent=`${meses[mes]} ${anio}`;

  const diasNom=['D','L','M','M','J','V','S'];
  const primerDia=new Date(anio,mes,1).getDay();
  const colMod={'Video':'var(--rojo)','Meet/Virtual':'var(--verde)','En el servicio':'var(--azul)','Oficina Central':'var(--naranja)'};

  let html=`<div style="padding:16px;"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">`;
  diasNom.forEach(d=>html+=`<div style="text-align:center;font-size:11px;font-weight:700;color:var(--texto-suave);padding:4px 0;">${d}</div>`);
  for(let i=0;i<primerDia;i++) html+=`<div></div>`;
  for(let d=1;d<=diasEnMes;d++){
    const fechaStr=`${String(d).padStart(2,'0')}/${String(mes+1).padStart(2,'0')}/${anio}`;
    const caps=DB.planCapacitaciones.filter(p=>p.fecha===fechaStr);
    const esHoy=anio===hoy.getFullYear()&&mes===hoy.getMonth()&&d===hoy.getDate();
    const dow=new Date(anio,mes,d).getDay();
    const esFin=dow===0||dow===6;
    html+=`<div style="min-height:64px;border:1px solid var(--borde);border-radius:8px;padding:4px;background:${esHoy?'var(--azul-claro)':esFin?'var(--gris-suave)':'white'};">
      <div style="font-size:11px;font-weight:${esHoy?'700':'500'};color:${esHoy?'var(--azul)':'var(--texto-suave)'};">${d}</div>
      ${caps.slice(0,3).map(c=>`<div style="font-size:9px;background:${colMod[c.modalidad]||'var(--azul)'};color:white;border-radius:3px;padding:1px 4px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.asociado} — ${c.tipo}">${c.asociado.split(' ')[0]} · ${c.tipo.split(':').pop().trim().substring(0,12)}</div>`).join('')}
      ${caps.length>3?`<div style="font-size:9px;color:var(--texto-muy-suave);margin-top:2px;">+${caps.length-3} más</div>`:''}
    </div>`;
  }
  html+=`</div>
    <div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap;">
      ${Object.entries(colMod).map(([m,c])=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:12px;height:12px;border-radius:3px;background:${c};"></div>${m}</div>`).join('')}
    </div>
  </div>`;
  const cal=$('calendario-plan');if(cal)cal.innerHTML=html;
}

function contactarAsociadosIA(){
  const pendientes=DB.planCapacitaciones.filter(p=>p.estado==='Planificado').slice(0,5);
  if(!pendientes.length){toast('Sin capacitaciones planificadas para coordinar');return;}
  pendientes.forEach(p=>p.estado='Coordinando...');
  renderCalendarioPlan();
  toast(`🤖 Agente IA iniciando coordinación: contactando ${pendientes.length} asociados y sus supervisores por WhatsApp...`,6000);
  setTimeout(()=>{pendientes.forEach(p=>p.estado='Confirmado');renderCalendarioPlan();toast('✓ Coordinación completada — asociados y supervisores notificados',5000);},3000);
}

// ========== EVALUACIONES ==========
DB.evaluaciones = [
  {id:1,cap:'Maquinarias: uso, manejo y mantenimiento',modalidad:'Video',preguntas:5,respondieron:8,totalEnviadas:15,aprobaron:6,puntosProm:72},
  {id:2,cap:'Capacitación de Ingreso: Cooperativismo',modalidad:'Oficina Central',preguntas:8,respondieron:12,totalEnviadas:14,aprobaron:11,puntosProm:85},
];

function renderEvaluaciones(){
  const tbody=$('tbody-evaluaciones');
  if(!tbody)return;
  tbody.innerHTML=DB.evaluaciones.map(e=>{
    const tasa=e.totalEnviadas?Math.round(e.respondieron/e.totalEnviadas*100):0;
    const tasaApro=e.respondieron?Math.round(e.aprobaron/e.respondieron*100):0;
    const noResp=e.totalEnviadas-e.respondieron;
    return`<tr>
      <td style="font-weight:500;">${e.cap}</td>
      <td><span class="chip">${e.modalidad}</span></td>
      <td style="text-align:center;">${e.preguntas}</td>
      <td style="text-align:center;"><strong style="color:var(--azul);">${e.respondieron}</strong>/${e.totalEnviadas} <span style="color:${tasa>=70?'var(--verde)':tasa>=50?'var(--naranja)':'var(--rojo)'};">(${tasa}%)</span></td>
      <td style="text-align:center;"><span style="color:${tasaApro>=70?'var(--verde)':tasaApro>=50?'var(--naranja)':'var(--rojo)'};">${tasaApro}%</span></td>
      <td style="text-align:center;"><span class="badge badge-rojo">${noResp}</span></td>
      <td style="text-align:center;">${e.puntosProm} pts</td>
      <td><button class="btn btn-secondary btn-xs" onclick="verDetalleEvaluacion(${e.id})">Ver</button></td>
    </tr>`;
  }).join('')||`<tr><td colspan="8"><div class="empty-state"><div class="icon">📝</div><p>Sin evaluaciones creadas aún</p></div></td></tr>`;

  // Tabla no respondieron
  const tbody2=$('tbody-no-respondieron');
  if(tbody2){
    const noResp=DB.legajos.filter(l=>l.estado==='Activo').map(l=>{
      const enviadas=DB.evaluaciones.reduce((s,e)=>s+e.totalEnviadas,0);
      const respondidas=DB.capacitaciones.filter(c=>c.nroSocio===String(l.nro)&&c.resultado).length;
      const tasa=enviadas?Math.round(respondidas/DB.evaluaciones.length*100):0;
      return{...l,enviadas:DB.evaluaciones.length,respondidas,tasa};
    }).filter(l=>l.tasa<50).sort((a,b)=>a.tasa-b.tasa).slice(0,10);

    const badge2=tasa=>tasa===0?'badge-rojo':tasa<30?'badge-naranja':'badge-acento';
    const riesgo=tasa=>tasa===0?'🔴 Muy alto':tasa<30?'🟠 Alto':'🟡 Medio';
    $('badge-no-resp').textContent=noResp.length;
    tbody2.innerHTML=noResp.map(l=>`<tr>
      <td style="font-weight:500;">${l.nombre}</td>
      <td style="font-size:12px;">${l.servicio}</td>
      <td style="font-size:12px;">${l.supervisor}</td>
      <td style="text-align:center;">${l.enviadas}</td>
      <td style="text-align:center;"><strong style="color:var(--rojo);">${l.respondidas}</strong></td>
      <td style="text-align:center;"><span class="badge ${badge2(l.tasa)}">${l.tasa}%</span></td>
      <td>${riesgo(l.tasa)}</td>
    </tr>`).join('')||`<tr><td colspan="7"><div class="empty-state"><div class="icon">🎉</div><p>Todos participan en las evaluaciones</p></div></td></tr>`;
  }
}
function guardarEvaluacion(){
  const cap=$('eval-cap')?.value;
  if(!cap){toast('Seleccioná una capacitación');return;}
  DB.evaluaciones.push({id:Date.now(),cap,modalidad:'Video',preguntas:3,respondieron:0,totalEnviadas:DB.legajos.filter(l=>l.estado==='Activo').length,aprobaron:0,puntosProm:0});
  cerrarModal('modal-evaluacion');renderEvaluaciones();supaSync('evaluaciones', DB.evaluaciones[DB.evaluaciones.length-1]); toast('✓ Evaluación creada y enviada a los asociados');
}
function agregarPregunta(){toast('Agregar pregunta — disponible en versión con Firebase');}
function verDetalleEvaluacion(id){toast('Ver detalle de evaluación #'+id+' — disponible en próxima versión');}

// Poblar selects de materiales y evaluaciones
function poblarSelectsMateriales(){
  const fS=(id,items)=>{const el=$(id);if(!el)return;const ph=el.options[0]?.outerHTML||'';el.innerHTML=ph+items.map(i=>`<option>${i}</option>`).join('');};
  fS('mat-cap-tipo',DB.tiposCapacitacion);fS('cf-mat-cap',DB.tiposCapacitacion);
  fS('eval-cap',DB.tiposCapacitacion);
  fS('f-stats-tipo',DB.tiposCapacitacion);
  fS('f-stats-serv',[...new Set(DB.legajos.map(l=>l.servicio).filter(Boolean))]);
  const evalMat=$('eval-material');
  if(evalMat){const ph=evalMat.options[0]?.outerHTML||'';evalMat.innerHTML=ph+DB.materiales.map(m=>`<option>${m.nombre}</option>`).join('');}
}

// MÓDULO COMPETENCIA ANUAL — migrado por completo a
// src/modules/competencia/ (rediseño v2, motor de puntos con ledger
// auditable, ver sql/v033_competencia_anual.sql). El código viejo que
// vivía acá (cálculo al vuelo, DB.reglasCompetencia como singleton
// hardcodeado) se eliminó: ya no estaba registrado en ningún
// screenConfig desde que se migró.

// ========== MÓDULO REASIGNACIONES ==========
// Migrado a src/modules/reasignaciones/ (2026-06-30)

// ========== MÓDULO COMERCIAL — Clientes y Objetivos/Servicios v1.1 ==========
// (v039, Etapas 1-3 del delta) — nombres reales de los Gerentes del handoff
// Comercial -> Operaciones (mismo patrón que MOCK_GERENTE_RRHH en
// descansos/permisos.js, acá ya no son placeholder: el propio documento de
// diseño los da).
const GERENTE_COMERCIAL = 'Jorgelina Bianchi';
const GERENTE_OPERACIONES = 'Ricardo Elicabe';
const GERENTE_RRHH_COMERCIAL = 'Gabriela Lucero'; // ídem descansos/permisos.js
function esGerenteOperaciones(){ return currentUser?.nombre===GERENTE_OPERACIONES || currentUser?.perfil==='Administrador total'; }
function esGerenteComercial(){ return currentUser?.nombre===GERENTE_COMERCIAL || currentUser?.perfil==='Administrador total'; }
function idLocalTrunc(id){ return String(id).slice(-9); }
function getClienteByIdLocal(idLocal){ return DB.clientes.find(c=>idLocalTrunc(c.id)===String(idLocal)); }
function getObjetivoByIdLocal(idLocal){ return DB.objetivos.find(o=>idLocalTrunc(o.id)===String(idLocal)); }

// Auditoría de transiciones de estado del objetivo (objetivo_eventos, v039).
function registrarEventoObjetivo(o,estadoDesde,estadoHasta,observaciones){
  if(!DB.objetivoEventos) DB.objetivoEventos=[];
  const ev={id:Date.now()+Math.floor(Math.random()*1000),objetivoIdLocal:idLocalTrunc(o.id),estadoDesde,estadoHasta,ejecutadoPor:currentUser?.nombre||'',ejecutadoRol:currentUser?.perfil||'',ejecutadoEn:new Date().toISOString(),observaciones:observaciones||''};
  DB.objetivoEventos.push(ev);
  supaSync('objetivoEventos', ev);
}

// Persistencia relacional de responsables/adjuntos (objetivo_responsables,
// objetivo_adjuntos v039) — desagrupados de los arrays embebidos del
// objetivo, que ya no viajan como columnas de la tabla objetivos.
function persistirRelacionadosObjetivo(o){
  const oidl=idLocalTrunc(o.id);
  (o.responsables||[]).forEach(r=>{
    if(!r.id) r.id=Date.now()+Math.floor(Math.random()*10000);
    // objetivo_responsables.telefono es el único lugar del esquema que
    // llama "telefono" a este dato — el resto de las tablas (candidatos,
    // psicos, legajos...) lo llaman "tel", igual que el campo JS `r.tel`
    // que se usa en toda la UI. Antes había un mapeo global tel→telefono
    // en _toSnake que "arreglaba" esta tabla rompiendo a todas las demás
    // (bug real en producción, 04/08/2026: candidatos dejó de poder
    // guardarse porque candidatos.tel se mandaba como "telefono", columna
    // que no existe ahí). Se saca del diccionario global y se traduce acá,
    // puntual, para la única tabla que de verdad lo necesita.
    const { tel, ...rSinTel } = r;
    supaSync('objetivoResponsables', {...rSinTel, telefono:tel, objetivoIdLocal:oidl});
  });
  (o.adjuntos||[]).forEach(a=>{
    if(!a.id) a.id=Date.now()+Math.floor(Math.random()*10000);
    supaSync('objetivoAdjuntos', {...a, objetivoIdLocal:oidl});
  });
}

// Fuente + fallback de códigos de servicio (Cambio 4). Reemplaza DB.servicios
// (deprecado, ver state.js) como fuente de datalists en los 9 módulos que lo
// consumían — la unión evita que legajos/datalists existentes queden
// huérfanos mientras Comercial carga objetivos reales.
function obtenerServiciosActivos(){
  const deObjetivos=DB.objetivos.filter(o=>o.estado==='Operativo'&&!o.anulado).map(o=>o.codigo);
  const legacySinObjetivo=(DB.servicios||[]).filter(s=>!DB.objetivos.some(o=>o.codigo===s&&!o.anulado));
  return [...new Set([...deObjetivos,...legacySinObjetivo])];
}
window.obtenerServiciosActivos=obtenerServiciosActivos;

DB.clientes = [
  {id:1,razon:'Walmart Argentina S.A.',nombre:'Chango Mas',tipo:'Cadena supermercados',cuit:'30-71546571-4',iva:'Responsable inscripto',arca:'Gran contribuyente',condPago:'30 días',formaPago:'Transferencia',codigoTango:'CLI-0001',estado:'Activo',ciudad:'CABA',direccion:'Maipú 255, CABA',logo:'',ingresosBrutos:'',jurisdiccionIibb:'',docReq:{seguros:true,monotributo:true,antecedentes:true,ddjjIva:false,pagoIva:false,remitoServicio:true,planillaHoras:true,oc:true},factPor:'Objetivo individual',periodoFact:'Del 1 al último del mes',productosEnFactura:'Factura separada',reqOC:'Sí — siempre',notasFact:'Indicar N° de OC en la factura.',contactos:[{nombre:'Héctor González',rol:'Gerente General de Operaciones',tel:'11-4567-8901',mail:'hgonzalez@walmart.com',aSatisfacer:true},{nombre:'Laura Pérez',rol:'Contacto de cobros',tel:'11-4567-8902',mail:'lperez@walmart.com',aSatisfacer:false}],obs:''},
  {id:2,razon:'Hospital Alemán',nombre:'Hospital Alemán',tipo:'Hospital',cuit:'30-64530892-1',iva:'Exento',arca:'Gran contribuyente',condPago:'60 días',formaPago:'Transferencia',codigoTango:'CLI-0002',estado:'Activo',ciudad:'CABA',direccion:'Av. Pueyrredón 1640, CABA',logo:'',ingresosBrutos:'',jurisdiccionIibb:'',docReq:{seguros:true,monotributo:true,antecedentes:true,ddjjIva:false,pagoIva:false,remitoServicio:false,planillaHoras:false,oc:false},factPor:'Objetivo individual',periodoFact:'Del 1 al último del mes',productosEnFactura:'Incluidos en el servicio',reqOC:'No',notasFact:'',contactos:[{nombre:'Carlos Rodríguez',rol:'Jefe de Servicios Generales',tel:'11-5678-9012',mail:'carlos.rodriguez@hospitalaleman.com',aSatisfacer:true}],obs:''},
];
DB.tiposServicio = ['Limpieza','Mantenimiento','Final de obra','Evento','Obra','Otro'];
DB.objetivos = [
  {id:1,clienteId:1,clienteIdLocal:idLocalTrunc(1),codigo:'CHANGO.BROWN',nombre:'Chango Mas Brown',tipo:'Limpieza',dir:'Av. Brown 4563, Lanús',ciudad:'Lanús',supervisorAsignado:'Matias Maidana',supervisor:'Matias Maidana',supervisorAsignadoPor:GERENTE_OPERACIONES,fechaAsignacionSupervisor:'01/03/2023',modeloPrecio:'Por EFT',valor:850000,valorHora:7083,efts:3,valorEft:283333,fechaInicio:'01/03/2023',fechaFin:'',contrato:'Contrato firmado',productos:'Factura separada',periodoFact:'Del 1 al último del mes',reqOC:'Sí — siempre',textoFactura:'Servicio de limpieza — Chango Mas Brown',estado:'Operativo',clausulaActualizacion:'Paritarias',responsables:[{nombre:'Roberto Silva',rol:'Encargado de seguridad',tel:'11-3456-7890',aSatisfacer:true}],historialPrecios:[{fecha:'01/03/2023',valor:600000,valorHora:5000,motivo:'Precio inicial',aprobadoPor:'Gerente Comercial',estado:'Vigente'},{fecha:'01/09/2023',valor:720000,valorHora:6000,motivo:'Ajuste paritarias 20%',aprobadoPor:'Gerente Comercial',estado:'Histórico'},{fecha:'01/03/2024',valor:850000,valorHora:7083,motivo:'Ajuste paritarias 18%',aprobadoPor:'Gerente Comercial',estado:'Vigente'}],adjuntos:[],notas:'',cargadoPor:'Jorgelina Bianchi',fechaCarga:'01/03/2023'},
  {id:2,clienteId:1,clienteIdLocal:idLocalTrunc(1),codigo:'CHANGO.CASEROS',nombre:'Chango Mas Caseros',tipo:'Limpieza',dir:'Av. San Martín 2341, Caseros',ciudad:'Caseros',supervisorAsignado:'Lorena Unzain',supervisor:'Lorena Unzain',supervisorAsignadoPor:GERENTE_OPERACIONES,fechaAsignacionSupervisor:'15/06/2023',modeloPrecio:'Por EFT',valor:620000,valorHora:5167,efts:2,valorEft:310000,fechaInicio:'15/06/2023',fechaFin:'',contrato:'Contrato firmado',productos:'Factura separada',periodoFact:'Del 1 al último del mes',reqOC:'Sí — siempre',textoFactura:'Servicio de limpieza — Chango Mas Caseros',estado:'Operativo',clausulaActualizacion:'Inflación mensual',responsables:[{nombre:'Ana Torres',rol:'Encargado de seguridad',tel:'11-2345-6789',aSatisfacer:true}],historialPrecios:[{fecha:'15/06/2023',valor:620000,valorHora:5167,motivo:'Precio inicial',aprobadoPor:'Gerente Comercial',estado:'Vigente'}],adjuntos:[],notas:'',cargadoPor:'Jorgelina Bianchi',fechaCarga:'15/06/2023'},
  {id:3,clienteId:2,clienteIdLocal:idLocalTrunc(2),codigo:'HTAL.ALEMAN.LIMP',nombre:'Hospital Alemán — Limpieza general',tipo:'Limpieza',dir:'Av. Pueyrredón 1640, CABA',ciudad:'CABA',supervisorAsignado:'Claudia Cazenave',supervisor:'Claudia Cazenave',supervisorAsignadoPor:GERENTE_OPERACIONES,fechaAsignacionSupervisor:'01/01/2024',modeloPrecio:'Abono mensual fijo',valor:1200000,valorHora:0,efts:0,valorEft:0,fechaInicio:'01/01/2024',fechaFin:'',contrato:'Contrato firmado',productos:'Incluidos en el servicio',periodoFact:'Del 1 al último del mes',reqOC:'No',textoFactura:'Servicio de limpieza y mantenimiento — Hospital Alemán',estado:'Operativo',clausulaActualizacion:'Índice trimestral',responsables:[{nombre:'Dr. Carlos Rodríguez',rol:'Jefe de Servicios Generales',tel:'11-5678-9012',aSatisfacer:true}],historialPrecios:[{fecha:'01/01/2024',valor:1200000,valorHora:0,motivo:'Precio inicial',aprobadoPor:'Gerente Comercial',estado:'Vigente'}],adjuntos:[],notas:'',cargadoPor:'Jorgelina Bianchi',fechaCarga:'01/01/2024'},
];
if(!DB.objetivoSupervisoresHistorial) DB.objetivoSupervisoresHistorial=[];
if(!DB.objetivoEventos) DB.objetivoEventos=[];

// Propuestas de modificación de precio — pendientes de aprobación del Gerente
// (módulo Precios, fuera de alcance de esta migración — se deja intacto)
// DELTA_comercial_gestion_precios_v1 — modelo con tramos (ver
// crearPropuestaPrecio). Semilla de demo: un aumento simple (1 tramo, ya
// enviado al cliente) y un aumento escalonado (2 tramos) recién cargado.
DB.propuestasPrecios = [
  {id:1,objetivoId:1,objetivoCod:'CHANGO.BROWN',objetivoNombre:'Chango Mas Brown',clienteId:1,clienteNombre:'Chango Mas',
    tipoModificacion:'Aumento',clausula:'Paritarias',motivo:'Aumento de paritarias UTEDYC Mar 2026',
    valorActual:850000,valorHoraActual:7083,valorPropuesto:1003000,valorHoraPropuesto:8358,pctAumento:18,
    niveles:{porParitaria:{pct:18,valor:1003000},propuestaOhlimpia:{pct:0,valor:0},yaAcordado:{pct:18,valor:1003000}},
    tipoConvalidar:'yaAcordado',
    tramos:[{id:101,pct:18,pctAcumulado:18,fechaVigencia:'01/05/2026',valor:1003000,valorHora:8358}],
    fechaVigencia:'01/05/2026',estado:'Enviada al cliente',
    autorizadaPor:'Jorgelina Bianchi',fechaAutorizacion:'29/03/2026',confirmadaPor:'',fechaConfirmacion:'',
    motivoRechazoGerente:'',motivoRechazoCliente:'',
    fechaPropuesta:'01/04/2026',proyeccionMeses:3,loteId:null,propuestaAnteriorId:null,origenParitaria:'',cargadoPor:'Jorgelina Bianchi'},
  {id:2,objetivoId:3,objetivoCod:'HTAL.ALEMAN.LIMP',objetivoNombre:'Hospital Alemán — Limpieza general',clienteId:2,clienteNombre:'Hospital Alemán',
    tipoModificacion:'Aumento',clausula:'Índice trimestral',motivo:'Ajuste IPC Q1 2026, escalonado en 2 tramos para suavizar el impacto',
    valorActual:1200000,valorHoraActual:0,valorPropuesto:1380000,valorHoraPropuesto:0,pctAumento:15,
    niveles:{porParitaria:{pct:0,valor:0},propuestaOhlimpia:{pct:15,valor:1380000},yaAcordado:{pct:0,valor:0}},
    tipoConvalidar:'propuestaOhlimpia',
    tramos:[
      {id:201,pct:7.5,pctAcumulado:7.5,fechaVigencia:'01/05/2026',valor:1290000,valorHora:0},
      {id:202,pct:7.5,pctAcumulado:15,fechaVigencia:'01/08/2026',valor:1380000,valorHora:0},
    ],
    fechaVigencia:'01/05/2026',estado:'Pendiente autorización gerente',
    autorizadaPor:'',fechaAutorizacion:'',confirmadaPor:'',fechaConfirmacion:'',
    motivoRechazoGerente:'',motivoRechazoCliente:'',
    fechaPropuesta:'02/04/2026',proyeccionMeses:6,loteId:null,propuestaAnteriorId:null,origenParitaria:'',cargadoPor:'Jorgelina Bianchi'},
];

// Cláusulas de actualización de precio
DB.clausulasActualizacion = ['Paritarias','Inflación mensual (IPC)','Índice trimestral','Índice semestral','Libre negociación','Sin cláusula'];

// CRM
// DELTA_crm_flujo_leads_v1 (30/07/2026): "Contrato" y "Cerrado ganado" eran
// dos etapas separadas (Contrato no era terminal) — el delta trata
// "Contrato (ganado)" como una sola cosa, así que se fusionan: "Contrato"
// pasa a ser la etapa terminal ganada (dispara fecha de cierre + auto-create
// de cliente en borrador). "Cerrado perdido" sigue siendo la otra terminal.
DB.etapasCRM = ['Prospecto','Primer contacto','Propuesta enviada','Negociación','Contrato','Cerrado perdido'];
DB.colorEtapasCRM = {'Prospecto':'#94a3b8','Primer contacto':'var(--azul)','Propuesta enviada':'#8b5cf6','Negociación':'var(--naranja)','Contrato':'var(--verde)','Cerrado perdido':'var(--rojo)'};
// Motivos de pérdida parametrizables (punto 2 del delta) — mismo patrón que
// el resto de las listas configurables de Comercial (agregarCfgComercial).
DB.motivosPerdidaCRM = ['Precio','Eligió competencia','Sin personal disponible para cubrir','No respondió','Otro'];
DB.leads = [
  {id:1,empresa:'Supermercados DIA',contacto:'Marta Vidal',tipo:'Limpieza',zona:'Buenos Aires',valor:450000,etapa:'Propuesta enviada',responsable:'Santiago Ayala',origen:'Referido',obs:'Interesados en cubrir 3 sucursales GBA Norte.',acciones:[{tipo:'Reunión',fecha:'15/03/2026',resp:'Santiago Ayala',estado:'Realizada',nota:'Reunión inicial positiva. Piden propuesta formal.'},{tipo:'Propuesta',fecha:'22/03/2026',resp:'Santiago Ayala',estado:'Realizada',nota:'Enviada propuesta por email.'},{tipo:'Llamada',fecha:'05/04/2026',resp:'Santiago Ayala',estado:'Pendiente',nota:'Seguimiento de propuesta enviada.'}]},
  {id:2,empresa:'Clínica Bazterrica',contacto:'Dr. Tomás Ruiz',tipo:'Limpieza',zona:'CABA',valor:800000,etapa:'Negociación',responsable:'Santiago Ayala',origen:'Vendedor externo',obs:'Clínica privada, alta exigencia de calidad.',acciones:[{tipo:'Visita',fecha:'10/03/2026',resp:'Santiago Ayala',estado:'Realizada',nota:'Visita técnica realizada. Buena predisposición.'},{tipo:'Propuesta',fecha:'17/03/2026',resp:'Santiago Ayala',estado:'Realizada',nota:'Propuesta enviada con presupuesto.'},{tipo:'Reunión',fecha:'28/03/2026',resp:'Santiago Ayala',estado:'Realizada',nota:'Negociando precio y condiciones.'},{tipo:'Llamada',fecha:'04/04/2026',resp:'Santiago Ayala',estado:'Pendiente',nota:'Cierre esperado esta semana.'}]},
  {id:3,empresa:'Municipalidad de Hurlingham',contacto:'Lic. García',tipo:'Limpieza',zona:'Buenos Aires',valor:600000,etapa:'Primer contacto',responsable:'Santiago Ayala',origen:'Licitación',obs:'Licitación pública municipal.',acciones:[{tipo:'Email',fecha:'01/04/2026',resp:'Santiago Ayala',estado:'Realizada',nota:'Enviada documentación para licitación.'}]},
];

// Reclamos
DB.tiposReclamo = ['Calidad del servicio','Falta de personal','Falta de insumos','Incidente de seguridad','Comunicación','Facturación','Otro'];
DB.reclamos = [
  {id:1,clienteId:1,objetivoCod:'CHANGO.BROWN',tipo:'Calidad del servicio',prioridad:'Alta',iniciador:'Cliente',desc:'El encargado reportó que el baño del sector norte no fue limpiado el día miércoles.',responsable:'Matias Maidana',estado:'En tratamiento',fecha:'28/03/2026',fechaCierre:'',generaNC:true,nc:'NC-2026-001',tratamiento:'Se habló con el operario responsable. Se realizó limpieza correctiva.'},
  {id:2,clienteId:2,objetivoCod:'HTAL.ALEMAN.LIMP',tipo:'Falta de personal',prioridad:'Urgente',iniciador:'Cliente',desc:'Faltó una persona sin aviso previo. Hospital sin cobertura en área UCI.',responsable:'Claudia Cazenave',estado:'Cerrado',fecha:'15/03/2026',fechaCierre:'16/03/2026',generaNC:true,nc:'NC-2026-002',tratamiento:'Se envió reemplazo de urgencia. Se implementó protocolo de ausencias.'},
];
DB.noConformidades = [
  {id:1,nro:'NC-2026-001',fecha:'28/03/2026',origen:'Reclamo externo',desc:'Incumplimiento de protocolo de limpieza en sector norte, Chango Mas Brown.',causaRaiz:'Falta de supervisión durante turno vespertino.',tratamiento:'Capacitación al operario + visita supervisora diaria por 2 semanas.',responsable:'Matias Maidana',fechaCierre:'',estado:'Abierta'},
  {id:2,nro:'NC-2026-002',fecha:'15/03/2026',origen:'Reclamo externo',desc:'Ausencia sin aviso en Hospital Alemán UCI.',causaRaiz:'El asociado no siguió el protocolo de comunicación de ausencias.',tratamiento:'Refuerzo del protocolo + sistema de cobertura de urgencia.',responsable:'Claudia Cazenave',fechaCierre:'20/03/2026',estado:'Cerrada'},
];

// Cobros
DB.facturas = [
  {id:1,clienteId:1,objetivoCod:'CHANGO.BROWN',nroFactura:'FA-0001-00045231',periodoDesde:'01/03/2026',periodoHasta:'31/03/2026',importe:850000,saldo:850000,fechaFactura:'31/03/2026',vencimiento:'05/04/2026',formaPago:'Transferencia',contactoCobro:'Laura Pérez',telefonoCobro:'11-4567-8902',horarioCobro:'Lun-Vie 9-17hs',ultimoContacto:'01/04/2026',proximaGestion:'05/04/2026',probCobro:85,estado:'Gestión activa',fechaPosibleCobro:'05/04/2026',acciones:[{tipo:'Llamada',fecha:'01/04/2026',estado:'Realizada',nota:'Confirmaron pago para el día 5.'}],notas:''},
  {id:2,clienteId:1,objetivoCod:'CHANGO.CASEROS',nroFactura:'FA-0001-00045232',periodoDesde:'01/03/2026',periodoHasta:'31/03/2026',importe:620000,saldo:620000,fechaFactura:'31/03/2026',vencimiento:'05/04/2026',formaPago:'Transferencia',contactoCobro:'Laura Pérez',telefonoCobro:'11-4567-8902',horarioCobro:'Lun-Vie 9-17hs',ultimoContacto:'01/04/2026',proximaGestion:'05/04/2026',probCobro:85,estado:'Gestión activa',fechaPosibleCobro:'05/04/2026',acciones:[],notas:''},
  {id:3,clienteId:2,objetivoCod:'HTAL.ALEMAN.LIMP',nroFactura:'FA-0001-00044890',periodoDesde:'01/03/2026',periodoHasta:'31/03/2026',importe:1200000,saldo:700000,fechaFactura:'31/03/2026',vencimiento:'20/03/2026',formaPago:'Transferencia',contactoCobro:'Carlos Rodríguez',telefonoCobro:'11-5678-9012',horarioCobro:'Lun-Vie 10-16hs',ultimoContacto:'25/03/2026',proximaGestion:'02/04/2026',probCobro:60,estado:'Impago',fechaPosibleCobro:'',acciones:[{tipo:'Llamada',fecha:'25/03/2026',estado:'Realizada',nota:'Piden extensión de plazo. Hablar con gerente.'},{tipo:'Email',fecha:'01/04/2026',estado:'Pendiente',nota:'Enviar nota de deuda formal.'}],notas:'Cobro parcial: $500.000 recibidos el 10/04 (REC-00012001, ver Cobros registrados). Saldo pendiente $700.000.'},
];

// Cobros registrados (recibos de Tango)
DB.cobros = [
  {id:1,clienteId:2,objetivoCod:'HTAL.ALEMAN.LIMP',nroFactura:'FA-0001-00043200',periodoDesde:'01/02/2026',periodoHasta:'28/02/2026',importeFacturado:1200000,importeCobrado:1200000,nroRecibo:'REC-00011890',fechaCobro:'15/03/2026',fechaAcreditacion:'18/03/2026',formaPago:'Transferencia'},
  {id:2,clienteId:1,objetivoCod:'CHANGO.BROWN',nroFactura:'FA-0001-00043100',periodoDesde:'01/02/2026',periodoHasta:'28/02/2026',importeFacturado:850000,importeCobrado:850000,nroRecibo:'REC-00011750',fechaCobro:'05/03/2026',fechaAcreditacion:'06/03/2026',formaPago:'Transferencia'},
  {id:3,clienteId:2,objetivoCod:'HTAL.ALEMAN.LIMP',nroFactura:'FA-0001-00044890',periodoDesde:'01/03/2026',periodoHasta:'31/03/2026',importeFacturado:1200000,importeCobrado:500000,nroRecibo:'REC-00012001',fechaCobro:'10/04/2026',fechaAcreditacion:'13/04/2026',formaPago:'Transferencia'},
];
DB.historialImportaciones = [];

// ========== COMISIONES (DELTA_comisiones_v1, 30/07/2026) ==========
// Cuenta corriente de comisiones por persona (interna de Legajos o
// externa). La asignación de quién cobra comisión vive en
// obj.comisiones[] (array por servicio, ver guardarObjetivo). Acá sólo
// van las colecciones propias del módulo: el mini-registro de externos
// (no están en Legajos), el libro mayor de devengos (una fila por
// factura×comisión) y el historial de pagos.
DB.comisionesExternos = []; // [{id,nombre,dni,tel,mail,activo}]
DB.comisionesDevengos = [];
DB.comisionesPagos = [];
// Tope de aviso (no bloqueo) de % de comisión acumulado por servicio —
// mismo patrón no-persistido que DB.adelantosConfig (vive en memoria,
// se resetea a este default en cada carga).
if(!DB.comisionesConfig) DB.comisionesConfig = { topeAlertaPct: 10 };

// ========== RENDER CLIENTES ==========
function renderClientes(lista){
  reconciliarClienteIdObjetivos();
  const base=(lista||DB.clientes).filter(c=>!c.anulado);
  const activos=DB.clientes.filter(c=>c.estado==='Activo'&&!c.anulado).length;
  const objActivos=DB.objetivos.filter(o=>o.estado==='Operativo'&&!o.anulado).length;
  $('st-cli-activos').textContent=activos;
  $('st-cli-obj').textContent=objActivos;
  $('st-cli-contratos').textContent=DB.objetivos.filter(o=>o.contrato==='Contrato firmado'&&o.estado==='Operativo'&&!o.anulado).length;
  $('st-cli-reclamos').textContent=DB.reclamos.filter(r=>r.estado==='Abierto'||r.estado==='En tratamiento').length;
  // Punto 4 del delta CRM v1: señal visible de clientes en borrador (auto-
  // create al ganar un lead) para que ninguno quede olvidado sin activar.
  if($('st-cli-borrador'))$('st-cli-borrador').textContent=DB.clientes.filter(c=>c.estado==='Borrador'&&!c.anulado).length;
  $('tbody-clientes').innerHTML=base.map((c)=>{
    const objCount=DB.objetivos.filter(o=>o.clienteId===c.id&&!o.anulado).length;
    const idl=idLocalTrunc(c.id);
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${c.logo?`<img src="${c.logo}" style="width:32px;height:32px;border-radius:6px;object-fit:contain;border:1px solid var(--borde);">`:`<div style="width:32px;height:32px;border-radius:6px;background:var(--azul-claro);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--azul);">${c.nombre[0]}</div>`}
          <div><div style="font-weight:600;">${c.nombre}</div><div style="font-size:11px;color:var(--texto-suave);">${c.razon}</div></div>
        </div>
      </td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;">${c.cuit}</td>
      <td><span class="chip" style="font-size:11px;">${c.tipo}</span></td>
      <td style="font-size:12px;">${c.iva}</td>
      <td style="text-align:center;font-weight:700;color:var(--azul);">${objCount}</td>
      <td style="font-size:12px;">${c.condPago}</td>
      <td style="font-size:12px;">${c.formaPago}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--texto-suave);">${c.codigo||'—'}</td>
      <td>${badge(c.estado==='Activo'?'Activo':c.estado==='Inactivo'?'Baja':'Pendiente')}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-xs" onclick="verCliente('${idl}')">Ver</button>
          <button class="btn btn-secondary btn-xs" onclick="abrirModalCliente('${idl}')">✏️</button>
          <button class="btn btn-primary btn-xs" onclick="nuevoObjetivoDesde(${c.id})">+ Servicio</button>
          ${c.estado!=='Inactivo'?`<button class="btn btn-danger btn-xs" onclick="abrirBajaCliente('${idl}')">🚫</button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('')||`<tr><td colspan="10"><div class="empty-state"><div class="icon">🏢</div><p>Sin clientes cargados</p></div></td></tr>`;
}
function filtrarClientes(){
  const nom=($('cf-cn-nombre')||{value:''}).value.toLowerCase();
  const cuit=($('cf-cn-cuit')||{value:''}).value;
  const est=($('cf-cli-estado')||{value:''}).value;
  const tipo=($('cf-cli-tipo')||{value:''}).value;
  const bg=($('buscar-cliente')||{value:''}).value.toLowerCase();
  renderClientes(DB.clientes.filter(c=>
    (!nom||c.nombre.toLowerCase().includes(nom)||c.razon.toLowerCase().includes(nom))&&
    (!cuit||c.cuit.includes(cuit))&&(!est||c.estado===est)&&(!tipo||c.tipo===tipo)&&
    (!bg||c.nombre.toLowerCase().includes(bg)||c.razon.toLowerCase().includes(bg))
  ));
}
function verCliente(idLocal){
  const c=getClienteByIdLocal(idLocal);
  if(!c) return;
  const objDelCliente=DB.objetivos.filter(o=>o.clienteId===c.id&&!o.anulado);
  const recDelCliente=DB.reclamos.filter(r=>r.clienteId===c.id);
  let html=`<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:18px;">
    <div style="width:48px;height:48px;border-radius:10px;background:var(--azul-claro);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--azul);">${c.nombre[0]}</div>
    <div><div style="font-size:17px;font-weight:700;">${c.nombre}</div><div style="font-size:12px;color:var(--texto-suave);">${c.razon} · CUIT: ${c.cuit}</div>
    <div style="display:flex;gap:6px;margin-top:6px;">${badge(c.estado==='Activo'?'Activo':c.estado==='Borrador'?'Pendiente':'Baja')}<span class="chip" style="font-size:11px;">${c.tipo}</span></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
    <div class="info-grid">
      <div class="info-item"><div class="key">Código interno</div><div class="val" style="font-family:'DM Mono',monospace;">${c.codigo||'—'}</div></div>
      <div class="info-item"><div class="key">Condición pago</div><div class="val">${c.condPago}</div></div>
      <div class="info-item"><div class="key">Forma de pago</div><div class="val">${c.formaPago}</div></div>
      <div class="info-item"><div class="key">Código Tango (ref. externa)</div><div class="val" style="font-family:'DM Mono',monospace;">${c.codigoTango||'—'}</div></div>
      <div class="info-item"><div class="key">Período facturación</div><div class="val">${c.periodoFact}</div></div>
      <div class="info-item"><div class="key">Tipo de contrato</div><div class="val">${c.tipoContrato||'—'}</div></div>
      <div class="info-item"><div class="key">Ingresos brutos</div><div class="val">${c.ingresosBrutos||'—'}</div></div>
      <div class="info-item"><div class="key">Jurisdicción IIBB</div><div class="val">${c.jurisdiccionIibb||'—'}</div></div>
      <div class="info-item"><div class="key">Responsable</div><div class="val">${c.responsable||'—'}${c.responsableTipo==='Externo'?' <span class="chip" style="font-size:10px;">Externo</span>'+(c.responsableContacto?' · '+c.responsableContacto:''):''}</div></div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Contactos clave</div>
      ${(c.contactos||[]).map(ct=>`<div style="padding:8px;background:var(--fondo);border-radius:var(--radio);margin-bottom:5px;border:1px solid var(--borde);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div><div style="font-weight:600;font-size:12px;">${ct.nombre}</div><div style="font-size:11px;color:var(--texto-suave);">${ct.rol||'—'}</div></div>
          ${ct.aSatisfacer?'<span class="badge badge-acento" style="font-size:10px;">⭐ A satisfacer</span>':''}
        </div>
        <div style="font-size:11px;margin-top:4px;display:flex;gap:10px;">
          ${ct.tel?`<a href="tel:${ct.tel}" style="color:var(--azul);">📞 ${ct.tel}</a>`:''}
          ${ct.mail?`<a href="mailto:${ct.mail}" style="color:var(--azul);">✉️ ${ct.mail}</a>`:''}
        </div>
      </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin contactos cargados</p>'}
    </div>
  </div>
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Servicios (${objDelCliente.length})</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
    ${objDelCliente.map(o=>`<span class="chip" style="font-size:11px;">📍 ${o.nombre} — $${(o.valor||0).toLocaleString('es-AR')} — ${o.estado}</span>`).join('')||'<span class="text-muted">Sin objetivos</span>'}
  </div>
  ${recDelCliente.length?`<div class="alerta alerta-danger" style="font-size:12px;"><strong>⚠️ ${recDelCliente.filter(r=>r.estado!=='Cerrado').length} reclamo(s) abierto(s)</strong></div>`:''}`;
  $('pedido-title').textContent=`🏢 ${c.nombre}`;
  $('pedido-body').innerHTML=html;
  abrirModal('modal-ver-pedido');
}
function nuevoObjetivoDesde(clienteId){
  abrirModalObjetivo();
  const sel=$('obj-cliente');
  if(sel){for(let i=0;i<sel.options.length;i++){if(sel.options[i].value==clienteId){sel.selectedIndex=i;break;}}}
}

// P.11 (Delta Comercial v1.2) — bindeado a window porque los oninput/onclick
// inline del modal (contactosClienteTemp[i].nombre=this.value, etc.) corren
// en scope global: sin esto, contactosClienteTemp (let de módulo) no existe
// para ellos y cada tecleo tira ReferenceError en silencio, dejando el
// contacto guardado vacío. La referencia del array nunca se reasigna (solo
// se muta in-place) para que este binding no quede desincronizado.
let contactosClienteTemp=[];
window.contactosClienteTemp=contactosClienteTemp;
let clienteEditIdLocal=null;
const CLI_CAMPOS_TEXTO=['cli-razon','cli-nombre','cli-tipo','cli-codigo','cli-cuit','cli-iva','cli-arca','cli-cond-pago','cli-forma-pago','cli-codigo-tango','cli-ciudad','cli-direccion','cli-responsable','cli-responsable-contacto','cli-logo','cli-obs','cli-tipo-contrato','cli-fact-por','cli-periodo-fact','cli-productos-fact','cli-req-oc','cli-notas-fact','cli-ib','cli-jur'];
const CLI_CAMPOS_DOC=['doc-seguros','doc-monotributo','doc-antecedentes','doc-ddjj-iva','doc-pago-iva','doc-remito-servicio','doc-planilla-horas','doc-oc'];
function abrirModalCliente(idLocal){
  poblarSelectsComercial();
  clienteEditIdLocal=idLocal||null;
  const c=idLocal?getClienteByIdLocal(idLocal):null;
  if($('cli-modal-title')) $('cli-modal-title').textContent=c?'🏢 Editar cliente':'🏢 Nuevo cliente';
  if(c){
    contactosClienteTemp.length=0;contactosClienteTemp.push(...(c.contactos||[]).map(ct=>({...ct})));
    $('cli-razon').value=c.razon||'';$('cli-nombre').value=c.nombre||'';
    if($('cli-tipo')) $('cli-tipo').value=c.tipo||'';
    $('cli-cuit').value=c.cuit||'';
    if($('cli-iva')) $('cli-iva').value=c.iva||'';
    if($('cli-arca')) $('cli-arca').value=c.arca||'';
    if($('cli-cond-pago')) $('cli-cond-pago').value=c.condPago||'';
    if($('cli-forma-pago')) $('cli-forma-pago').value=c.formaPago||'';
    if($('cli-responsable')) $('cli-responsable').value=c.responsable||'';
    if($('cli-responsable-tipo')) $('cli-responsable-tipo').value=c.responsableTipo||'Interno';
    if($('cli-responsable-contacto')) $('cli-responsable-contacto').value=c.responsableContacto||'';
    toggleResponsableClienteTipo();
    if($('cli-codigo')) $('cli-codigo').value=c.codigo||'—';
    $('cli-codigo-tango').value=c.codigoTango||'';
    if($('cli-estado')) $('cli-estado').value=c.estado||'Activo';
    $('cli-ciudad').value=c.ciudad||'';$('cli-direccion').value=c.direccion||'';
    $('cli-logo').value=c.logo||'';$('cli-obs').value=c.obs||'';
    if($('cli-tipo-contrato')) $('cli-tipo-contrato').value=c.tipoContrato||'';
    if($('cli-fact-por')) $('cli-fact-por').value=c.factPor||'';
    if($('cli-periodo-fact')) $('cli-periodo-fact').value=c.periodoFact||'';
    if($('cli-productos-fact')) $('cli-productos-fact').value=c.productosEnFactura||'';
    if($('cli-req-oc')) $('cli-req-oc').value=c.reqOC||'';
    $('cli-notas-fact').value=c.notasFact||'';
    if($('cli-ib')) $('cli-ib').value=c.ingresosBrutos||'';
    if($('cli-jur')) $('cli-jur').value=c.jurisdiccionIibb||'';
    const dr=c.docReq||{};
    if($('doc-seguros')) $('doc-seguros').checked=!!dr.seguros;
    if($('doc-monotributo')) $('doc-monotributo').checked=!!dr.monotributo;
    if($('doc-antecedentes')) $('doc-antecedentes').checked=!!dr.antecedentes;
    if($('doc-ddjj-iva')) $('doc-ddjj-iva').checked=!!dr.ddjjIva;
    if($('doc-pago-iva')) $('doc-pago-iva').checked=!!dr.pagoIva;
    if($('doc-remito-servicio')) $('doc-remito-servicio').checked=!!dr.remitoServicio;
    if($('doc-planilla-horas')) $('doc-planilla-horas').checked=!!dr.planillaHoras;
    if($('doc-oc')) $('doc-oc').checked=!!dr.oc;
  } else {
    contactosClienteTemp.length=0;
    CLI_CAMPOS_TEXTO.forEach(id=>{const el=$(id);if(el)el.value='';});
    CLI_CAMPOS_DOC.forEach(id=>{const el=$(id);if(el)el.checked=false;});
    if($('cli-estado')) $('cli-estado').value='Activo';
    if($('cli-responsable-tipo')) $('cli-responsable-tipo').value='Interno';
    toggleResponsableClienteTipo();
  }
  renderContactosClienteTemp();
  abrirModal('modal-cliente');
}
function agregarContactoCliente(){
  contactosClienteTemp.push({nombre:'',rol:'',tel:'',mail:'',aSatisfacer:false});
  renderContactosClienteTemp();
}
function renderContactosClienteTemp(){
  const el=$('contactos-cliente-lista');if(!el)return;
  el.innerHTML=contactosClienteTemp.map((ct,i)=>`
    <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 12px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:center;">
        <input type="text" placeholder="Nombre *" value="${ct.nombre}" style="${inputStyle}" oninput="contactosClienteTemp[${i}].nombre=this.value">
        <input type="text" placeholder="Rol (ej: Gerente de compras)" value="${ct.rol}" style="${inputStyle}" oninput="contactosClienteTemp[${i}].rol=this.value">
        <input type="text" placeholder="Teléfono" value="${ct.tel}" style="${inputStyle}" oninput="contactosClienteTemp[${i}].tel=this.value">
        <input type="text" placeholder="Email" value="${ct.mail}" style="${inputStyle}" oninput="contactosClienteTemp[${i}].mail=this.value">
        <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;" onclick="contactosClienteTemp.splice(${i},1);renderContactosClienteTemp()">✕</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:6px;cursor:pointer;">
        <input type="checkbox" ${ct.aSatisfacer?'checked':''} onchange="contactosClienteTemp[${i}].aSatisfacer=this.checked">
        ⭐ Marcar como "cliente a satisfacer"
      </label>
    </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin contactos aún — hacé click en "+ Agregar contacto"</p>';
}
const inputStyle='padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);font-size:12px;font-family:inherit;outline:none;width:100%;';

// V.1 (Delta Comercial v1.3) — identidad interna propia, desacoplada del
// Código Tango (evidencia: en la lista real convivían códigos formato
// interno "CLI-0001" con códigos crudos de Tango como "46" en el mismo
// campo). El código interno es la identidad del sistema; el Código Tango
// pasa a ser una referencia externa más (como el CUIT), sin exigencia de
// formato.
function generarCodigoCliente(){
  const nums=(DB.clientes||[]).map(c=>parseInt((c.codigo||'').replace('CLI-',''),10)).filter(n=>!isNaN(n));
  const max=nums.length?Math.max(...nums):0;
  return 'CLI-'+String(max+1).padStart(4,'0');
}
function toggleResponsableClienteTipo(){
  const externo=$('cli-responsable-tipo')?.value==='Externo';
  const row=$('cli-responsable-contacto-row');
  if(row) row.style.display=externo?'':'none';
  const inp=$('cli-responsable');
  if(inp) inp.placeholder=externo?'Nombre del responsable externo':'Buscar en Personal...';
}
function guardarCliente(){
  // P.1 (Delta Comercial v1.2) — normalización preventiva: el código de
  // cliente se usa para relacionar módulos, así que "cli001" y "CLI001"
  // tienen que ser el mismo código siempre (mayúscula fija), y los
  // nombres en formato título sin importar cómo los tipeó quien cargó.
  const razon=toTitleCase(cleanText($('cli-razon')?.value||''));
  if(!razon){toast('Ingresá la razón social');return;}
  const existente=clienteEditIdLocal?getClienteByIdLocal(clienteEditIdLocal):null;
  const datos={
    razon,nombre:toTitleCase(cleanText($('cli-nombre')?.value||''))||razon,
    tipo:$('cli-tipo')?.value,cuit:$('cli-cuit')?.value,
    iva:$('cli-iva')?.value,arca:$('cli-arca')?.value,
    condPago:$('cli-cond-pago')?.value,formaPago:$('cli-forma-pago')?.value,
    responsable:cleanText($('cli-responsable')?.value||''),
    responsableTipo:$('cli-responsable-tipo')?.value||'Interno',
    responsableContacto:cleanText($('cli-responsable-contacto')?.value||''),
    codigoTango:cleanText($('cli-codigo-tango')?.value||'').toUpperCase(),estado:$('cli-estado')?.value,
    ciudad:$('cli-ciudad')?.value,direccion:$('cli-direccion')?.value,
    logo:$('cli-logo')?.value,obs:$('cli-obs')?.value,
    ingresosBrutos:$('cli-ib')?.value||'',jurisdiccionIibb:$('cli-jur')?.value||'',
    docReq:{seguros:$('doc-seguros')?.checked,monotributo:$('doc-monotributo')?.checked,antecedentes:$('doc-antecedentes')?.checked,ddjjIva:$('doc-ddjj-iva')?.checked,pagoIva:$('doc-pago-iva')?.checked,remitoServicio:$('doc-remito-servicio')?.checked,planillaHoras:$('doc-planilla-horas')?.checked,oc:$('doc-oc')?.checked},
    tipoContrato:$('cli-tipo-contrato')?.value||'',
    factPor:$('cli-fact-por')?.value,periodoFact:$('cli-periodo-fact')?.value,
    productosEnFactura:$('cli-productos-fact')?.value,reqOC:$('cli-req-oc')?.value,
    notasFact:$('cli-notas-fact')?.value,
    contactos:[...contactosClienteTemp],
  };
  let cliente;
  if(existente){
    Object.assign(existente,datos);
    cliente=existente;
  } else {
    cliente={id:Date.now(),codigo:generarCodigoCliente(),...datos};
    DB.clientes.push(cliente);
  }
  cerrarModal('modal-cliente');renderClientes();poblarSelectsComercial();
  supaSync('clientes', cliente); toast(existente?'✓ Cliente actualizado':'✓ Cliente guardado');
}
function tabCliModal(idx,btn){
  document.querySelectorAll('#modal-cliente .tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#modal-cliente .tab-content').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');$('cli-tab-'+idx).classList.add('active');
}
function abrirBajaCliente(idLocal){
  const c=getClienteByIdLocal(idLocal);if(!c)return;
  const objActivos=DB.objetivos.filter(o=>o.clienteId===c.id&&!o.anulado&&o.estado!=='Baja');
  const aviso=objActivos.length?`Este cliente tiene ${objActivos.length} objetivo(s) activo(s). Dar de baja también dará de baja los objetivos. `:'';
  const motivo=prompt(aviso+'Motivo de la baja del cliente:');
  if(motivo===null) return;
  if(!motivo.trim()){toast('La baja requiere un motivo');return;}
  c.estado='Inactivo';
  supaSync('clientes', c);
  objActivos.forEach(o=>{
    const desde=o.estado;
    o.estado='Baja';o.fechaBaja=hoyStr();o.dadoDeBajaPor=currentUser?.nombre||'';o.motivoBaja='Baja de cliente: '+motivo.trim();
    supaSync('objetivos', objetivoParaGuardar(o));
    registrarEventoObjetivo(o,desde,'Baja','Baja de cliente: '+motivo.trim());
  });
  renderClientes();if(document.getElementById('screen-objetivos')?.classList.contains('active')) filtrarObjetivos();
  toast('✓ Cliente dado de baja');
}

// ========== RENDER OBJETIVOS ==========
let objTabActual='operativos';
const OBJ_TABS={presupuestados:'Presupuestado',pendientes:'Pendiente asignación operativa',operativos:'Operativo',baja:'Baja'};
function tabObjetivos(tab,btn){
  objTabActual=tab;
  document.querySelectorAll('#screen-objetivos .tab-btn[data-obj-tab]').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  filtrarObjetivos();
}
function badgeEstadoObjetivo(estado){
  const map={'Presupuestado':'badge-gris','Pendiente asignación operativa':'badge-naranja','Operativo':'badge-verde','Baja':'badge-rojo'};
  return `<span class="badge ${map[estado]||'badge-gris'}" style="font-size:10px;">${estado}</span>`;
}
function diasDesde(fechaISOoDDMMYYYY){
  if(!fechaISOoDDMMYYYY) return 0;
  let f;
  if(fechaISOoDDMMYYYY.includes('/')){const[dd,mm,yy]=fechaISOoDDMMYYYY.split('/');f=new Date(`${yy}-${mm}-${dd}`);}
  else f=new Date(fechaISOoDDMMYYYY);
  return Math.floor((Date.now()-f.getTime())/86400000);
}
function renderObjetivos(lista){
  reconciliarClienteIdObjetivos();
  reconciliarResponsablesObjetivos();
  const estadoTab=OBJ_TABS[objTabActual];
  const rows=(lista||DB.objetivos).filter(o=>!o.anulado&&(!estadoTab||o.estado===estadoTab));
  const todosActivos=DB.objetivos.filter(o=>o.estado==='Operativo'&&!o.anulado);
  const eftsTotal=todosActivos.reduce((s,o)=>s+(o.efts||0),0);
  const factTotal=todosActivos.reduce((s,o)=>s+(o.valor||0),0);
  const hoy=new Date();
  const vencen=todosActivos.filter(o=>{
    if(!o.fechaFin) return false;
    const[dd,mm,yy]=o.fechaFin.split('/');
    const f=new Date(`${yy}-${mm}-${dd}`);
    return f.getFullYear()===hoy.getFullYear()&&f.getMonth()===hoy.getMonth();
  }).length;
  if($('st-obj-activos')) $('st-obj-activos').textContent=todosActivos.length;
  if($('st-obj-efts')) $('st-obj-efts').textContent=eftsTotal.toFixed(1);
  if($('st-obj-fact')) $('st-obj-fact').textContent='$'+Math.round(factTotal/1000)+'k';
  if($('st-obj-vencen')) $('st-obj-vencen').textContent=vencen;
  const getCliente=id=>DB.clientes.find(c=>c.id===id);
  $('tbody-objetivos').innerHTML=rows.map((o)=>{
    const cli=getCliente(o.clienteId);
    const idl=idLocalTrunc(o.id);
    const modColor={'Abono mensual fijo':'badge-azul','Por EFT':'badge-verde','Por horas variables':'badge-acento'};
    const esperando7=o.estado==='Pendiente asignación operativa'&&diasDesde(o.fechaCarga)>=7;
    return `<tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--azul);">${o.codigo}</td>
      <td style="font-weight:500;">${o.nombre}${esperando7?' <span title="7+ días esperando asignación">🟠</span>':''}</td>
      <td style="font-size:12px;">${cli?cli.nombre:'—'}</td>
      <td><span class="chip" style="font-size:11px;">${o.tipo}</span></td>
      <td style="font-size:12px;color:var(--texto-suave);">${o.tipoSitio||'—'}</td>
      <td><span class="badge ${modColor[o.modeloPrecio]||'badge-gris'}" style="font-size:10px;">${(o.modeloPrecio||'').split('(')[0].trim()}</span></td>
      <td style="font-weight:700;color:var(--azul);">$${(o.valor||0).toLocaleString('es-AR')}</td>
      <td style="font-size:12px;">${o.supervisorAsignado||'—'}</td>
      <td>${badgeEstadoObjetivo(o.estado)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-xs" onclick="verObjetivo('${idl}')">Ver</button>
          <button class="btn btn-secondary btn-xs" onclick="abrirModalObjetivo('${idl}')">✏️</button>
          ${o.estado==='Pendiente asignación operativa'&&esGerenteOperaciones()?`<button class="btn btn-primary btn-xs" onclick="abrirAsignarSupervisor('${idl}')">Asignar supervisor</button>`:''}
          ${o.estado==='Operativo'&&esGerenteOperaciones()?`<button class="btn btn-secondary btn-xs" onclick="abrirCambiarSupervisor('${idl}')">🔄</button>`:''}
          ${o.estado!=='Baja'&&esGerenteComercial()?`<button class="btn btn-danger btn-xs" onclick="abrirBajaObjetivo('${idl}')">🚫</button>`:''}
          ${o.estado==='Baja'&&esGerenteComercial()?`<button class="btn btn-primary btn-xs" onclick="reactivarObjetivo('${idl}')">♻️ Reactivar</button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('')||`<tr><td colspan="10"><div class="empty-state"><div class="icon">📍</div><p>Sin servicios en este estado</p></div></td></tr>`;
}
function filtrarObjetivos(){
  const cod=($('cf-on-cod')||{value:''}).value.toLowerCase();
  const nom=($('cf-on-nombre')||{value:''}).value.toLowerCase();
  const cli=($('cf-obj-cliente')||{value:''}).value;
  const tipo=($('cf-obj-tipo')||{value:''}).value;
  const tipoSitio=($('cf-obj-tipo-sitio')||{value:''}).value;
  const bg=($('buscar-objetivo')||{value:''}).value.toLowerCase();
  const cliId=cli?DB.clientes.find(c=>c.nombre===cli)?.id:null;
  renderObjetivos(DB.objetivos.filter(o=>
    (!cod||o.codigo.toLowerCase().includes(cod))&&
    (!nom||o.nombre.toLowerCase().includes(nom))&&
    (!cliId||o.clienteId===cliId)&&(!tipo||o.tipo===tipo)&&(!tipoSitio||o.tipoSitio===tipoSitio)&&
    (!bg||o.nombre.toLowerCase().includes(bg)||o.codigo.toLowerCase().includes(bg))
  ));
}
function verObjetivo(idLocal){
  const o=getObjetivoByIdLocal(idLocal);
  if(!o) return;
  const cli=DB.clientes.find(c=>c.id===o.clienteId);
  const idl=idLocalTrunc(o.id);
  const historial=(DB.objetivoSupervisoresHistorial||[]).filter(h=>h.objetivoIdLocal===idl&&!h.anulado).sort((a,b)=>(b.vigenciaDesde||'').localeCompare(a.vigenciaDesde||''));
  // 2.2.7 (Delta Comercial v1.2): objetivoEventos ya se registraba en cada
  // cambio de estado (baja, reactivación, asignación de supervisor) pero
  // nunca se mostraba en ningún lado — quedaba escrito y nunca leído.
  const eventos=(DB.objetivoEventos||[]).filter(e=>e.objetivoIdLocal===idl).sort((a,b)=>(b.ejecutadoEn||'').localeCompare(a.ejecutadoEn||''));
  const html=`<div class="info-grid">
    <div class="info-item"><div class="key">Código</div><div class="val" style="font-family:'DM Mono',monospace;">${o.codigo}</div></div>
    <div class="info-item"><div class="key">Cliente</div><div class="val">${cli?.nombre||'—'}</div></div>
    <div class="info-item"><div class="key">Tipo servicio</div><div class="val">${o.tipo}</div></div>
    <div class="info-item"><div class="key">Tipo de sitio</div><div class="val">${o.tipoSitio||'—'}</div></div>
    <div class="info-item"><div class="key">Dirección</div><div class="val">${o.dir||'—'}</div></div>
    <div class="info-item"><div class="key">Estado</div><div class="val">${badgeEstadoObjetivo(o.estado)}</div></div>
    <div class="info-item"><div class="key">Supervisor asignado</div><div class="val">${o.supervisorAsignado||'— (pendiente Operaciones)'}</div></div>
    <div class="info-item"><div class="key">Jurisdicción</div><div class="val">${o.jurisdiccion||'—'}</div></div>
    <div class="info-item"><div class="key">Localidad</div><div class="val">${o.localidad||'—'}</div></div>
    <div class="info-item"><div class="key">Modelo precio</div><div class="val">${o.modeloPrecio}</div></div>
    ${o.efts?`<div class="info-item"><div class="key">Cantidad de horas</div><div class="val">${o.efts}hs/mes${o.valorHora?` — $${o.valorHora.toLocaleString('es-AR')}/hora`:''}</div></div>`:''}
    ${o.modeloPrecio==='Abono mensual fijo'
      ?`<div class="info-item"><div class="key">Valor mensual</div><div class="val" style="font-weight:700;color:var(--azul);">$${(o.valor||0).toLocaleString('es-AR')}</div></div>`
      :(()=>{
          const fact=calcularFacturacionMensualObjetivo(o);
          const esFirme=o.modeloPrecio==='Por EFT';
          const etiqueta=esFirme?'Monto a facturar por mes':'Monto estimado a facturar por mes';
          return fact!=null
            ?`<div class="info-item"><div class="key">${etiqueta}</div><div class="val" style="font-weight:700;color:${esFirme?'var(--azul)':'var(--verde)'};">$${fact.toLocaleString('es-AR')}${esFirme?'':' (estimado)'}</div></div>`
            :`<div class="info-item"><div class="key">${etiqueta}</div><div class="val">Depende de horas trabajadas (Liquidación de horas)</div></div>`;
        })()
    }
    <div class="info-item"><div class="key">Contrato</div><div class="val">${o.contrato}</div></div>
    <div class="info-item"><div class="key">Cláusula actualización</div><div class="val">${o.clausulaActualizacion||'—'}</div></div>
    <div class="info-item"><div class="key">Período facturación</div><div class="val">${o.periodoFact}</div></div>
    <div class="info-item"><div class="key">Requiere OC</div><div class="val">${o.reqOC}</div></div>
    <div class="info-item"><div class="key">Facturación de productos</div><div class="val">${o.productos||'—'}</div></div>
  </div>
  <div style="margin-top:14px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Personal necesario</div>
  ${(o.puestos||[]).length?o.puestos.map(p=>{
    const diasTxt=DIAS_PUESTO.filter(([d])=>p.dias?.[d]).map(([,l])=>l).join(', ')||'—';
    return `<div style="padding:8px;background:var(--fondo);border-radius:var(--radio);margin-bottom:5px;border:1px solid var(--borde);font-size:12px;">
    <strong>${p.cantidad||1}</strong> persona(s)${p.perfil?' — '+p.perfil:''} · ${p.horarioDesde||'?'} a ${p.horarioHasta||'?'} · ${diasTxt}
    ${p.obs?`<div style="color:var(--texto-suave);margin-top:2px;">${p.obs}</div>`:''}
  </div>`;}).join(''):'<p class="text-muted" style="font-size:12px;">Sin puestos cargados</p>'}
  <div style="margin-top:14px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Responsables del cliente</div>
  ${(o.responsables||[]).map(r=>`<div style="padding:8px;background:var(--fondo);border-radius:var(--radio);margin-bottom:5px;border:1px solid var(--borde);display:flex;justify-content:space-between;align-items:center;">
    <div><div style="font-weight:600;font-size:12px;">${r.nombre}</div><div style="font-size:11px;color:var(--texto-suave);">${r.rol||'—'}${r.tel?` · <a href="tel:${r.tel}" style="color:var(--azul);">📞 ${r.tel}</a>`:''}</div></div>
    <div style="display:flex;gap:4px;">${r.aSatisfacer?'<span class="badge badge-acento" style="font-size:10px;">⭐ A satisfacer</span>':''}${r.recibeFactura?'<span class="badge badge-azul" style="font-size:10px;">🧾 Recibe factura</span>':''}</div>
  </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin responsables cargados</p>'}
  ${(o.logProductos||o.logElementos||o.logMaquinas)?`<div style="margin-top:14px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Necesidad logística</div>
  <div class="info-grid">
    ${o.logProductos?`<div class="info-item"><div class="key">Productos</div><div class="val">${o.logProductos}</div></div>`:''}
    ${o.logElementos?`<div class="info-item"><div class="key">Elementos de limpieza</div><div class="val">${o.logElementos}</div></div>`:''}
    ${o.logMaquinas?`<div class="info-item"><div class="key">Máquinas</div><div class="val">${o.logMaquinas}</div></div>`:''}
  </div>`:''}
  ${o.notas?`<div class="alerta alerta-info" style="margin-top:12px;font-size:12px;"><strong>Notas:</strong> ${o.notas}</div>`:''}
  ${o.textoFactura?`<div class="alerta alerta-info" style="margin-top:12px;font-size:12px;"><strong>Texto en factura:</strong> ${o.textoFactura}</div>`:''}
  ${o.estado==='Baja'?`<div class="alerta alerta-danger" style="margin-top:12px;font-size:12px;"><strong>🚫 Dado de baja</strong> el ${o.fechaBaja} por ${o.dadoDeBajaPor}. Motivo: ${o.motivoBaja||'—'}</div>`:''}
  ${o.fechaReactivacion?`<div class="alerta alerta-info" style="margin-top:12px;font-size:12px;"><strong>♻️ Reactivado</strong> el ${o.fechaReactivacion} por ${o.reactivadoPor}.</div>`:''}
  <div style="margin-top:14px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Historial de supervisores</div>
  ${historial.length?historial.map(h=>`<div style="padding:6px 10px;background:var(--fondo);border-radius:var(--radio);margin-bottom:4px;font-size:12px;border:1px solid var(--borde);">
    <strong>${h.supervisorNombre}</strong> — ${h.vigenciaDesde} a ${h.vigenciaHasta||'hoy'} <span style="color:var(--texto-suave);">(asignado por ${h.asignadoPor})</span>
  </div>`).join(''):'<p class="text-muted" style="font-size:12px;">Sin historial todavía</p>'}
  <div style="margin-top:14px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Historial de estados</div>
  ${eventos.length?eventos.map(e=>`<div style="padding:6px 10px;background:var(--fondo);border-radius:var(--radio);margin-bottom:4px;font-size:12px;border:1px solid var(--borde);">
    <strong>${e.estadoDesde||'—'} → ${e.estadoHasta}</strong> <span style="color:var(--texto-suave);">— ${(e.ejecutadoEn||'').slice(0,10)} (${e.ejecutadoPor||'—'})</span>
    ${e.observaciones?`<div style="color:var(--texto-suave);">${e.observaciones}</div>`:''}
  </div>`).join(''):'<p class="text-muted" style="font-size:12px;">Sin eventos registrados</p>'}`;
  $('pedido-title').textContent=`📍 ${o.nombre}`;
  $('pedido-body').innerHTML=html;
  abrirModal('modal-ver-pedido');
}

// P.10 (Delta Comercial v1.2) — bindeado a window por la misma razón que
// contactosClienteTemp: los oninput/onclick inline del modal de objetivo
// (respObjetivoTemp[i].nombre=this.value, etc.) corren en scope global.
let respObjetivoTemp=[];
window.respObjetivoTemp=respObjetivoTemp;
function agregarRespObjetivo(){
  respObjetivoTemp.push({nombre:'',rol:'',tel:'',aSatisfacer:false});
  renderRespObjetivoTemp();
}
// Payload seguro para la tabla objetivos: sin los arrays que ahora viven en
// tablas relacionales propias (objetivo_responsables/objetivo_adjuntos) ni
// historialPrecios (Etapa 4, diferida) — enviarlos generaría un error
// silencioso de PostgREST por columna inexistente (mismo bug que se
// encontró y corrigió en guardarCliente()).
function objetivoParaGuardar(o){
  const {responsables,adjuntos,historialPrecios,supervisor,...resto}=o;
  return resto;
}
// 2.2.1 (Delta Comercial v1.2) — el modelo de precio del objetivo queda
// gobernado por el tipo de contrato del cliente (Por hora / Presupuesto
// fijo, 2.1.2). No se le ocultan opciones a Comercial (puede haber
// excepciones legítimas), pero se avisa cuál correspondería y
// guardarObjetivo() pide confirmación si no coincide, en vez de dejar
// los dos datos inconsistentes en silencio.
const MODELOS_PRECIO_POR_HORA=['Por EFT','Por horas variables'];
const MODELOS_PRECIO_PRESUPUESTO_FIJO=['Abono mensual fijo'];
// 2.2.3/2.2.1 (Delta Comercial v1.3) + DELTA_servicios_tipo_de_sitio_v1 —
// "monto a facturar por mes": se calcula siempre en el momento (nunca se
// guarda en el objetivo), así nunca queda desactualizado si cambia el
// valor hora vigente (paritaria). Para "Por EFT" y "Por horas variables"
// (o.efts ya es la cantidad de horas directa, ej. 200/500/1200 — no un
// factor de EFTs a multiplicar por 200): monto = horas × valor hora —
// firme en EFT, estimado en horas variables (las horas reales las define
// Liquidación de horas, fuera de este módulo; acá sólo se orienta). Para
// "Abono mensual fijo": el monto es el valor cargado directamente. Si
// falta cargar horas/valor hora en "Por horas variables" se devuelve
// null y el llamador aclara que depende de horas trabajadas, en vez de
// inventar un número.
function calcularFacturacionMensualObjetivo(o){
  if(o.modeloPrecio==='Por EFT'||o.modeloPrecio==='Por horas variables') return (o.efts&&o.valorHora)?(o.efts*o.valorHora):null;
  return o.valor||0;
}
function modelosPrecioEsperados(clienteId){
  const cli=DB.clientes.find(c=>c.id===clienteId);
  if(!cli||!cli.tipoContrato) return null;
  return cli.tipoContrato==='Por hora'?MODELOS_PRECIO_POR_HORA:MODELOS_PRECIO_PRESUPUESTO_FIJO;
}
// 2.2.4 (Delta Comercial v1.2) — mientras el objetivo está "Pendiente
// asignación operativa", los datos del servicio son de solo lectura;
// las únicas 2 excepciones editables son el EFT (obj-efts) y los
// Responsables del cliente (tab aparte, no se toca acá).
const OBJ_CAMPOS_BLOQUEABLES_PENDIENTE=['obj-cliente','obj-codigo','obj-nombre','obj-tipo','obj-dir','obj-jurisdiccion','obj-localidad','obj-fecha-inicio','obj-clausula-actualizacion','obj-modelo-precio','obj-valor','obj-valor-hora','obj-efts-fijo','obj-fecha-fin','obj-contrato','obj-notas-precio','obj-productos','obj-periodo-fact','obj-req-oc','obj-texto-factura','obj-log-productos','obj-log-elementos','obj-log-maquinas'];
function bloquearCamposObjetivoPendiente(bloquear){
  OBJ_CAMPOS_BLOQUEABLES_PENDIENTE.forEach(id=>{const el=$(id);if(el) el.disabled=bloquear;});
  const btnPuesto=$('obj-btn-agregar-puesto');if(btnPuesto) btnPuesto.disabled=bloquear;
  const aviso=$('obj-aviso-pendiente');if(aviso) aviso.style.display=bloquear?'block':'none';
}
// A.4 (Delta Comercial v1.3) — jurisdicción → localidad encadenados.
// DB.jurisdiccionesServicio es un objeto plano {jurisdicción:[localidades]}
// a propósito: agregar otra provincia a futuro es agregar una clave, sin
// tocar esta función.
function poblarLocalidadesServicio(valorActual){
  const selLoc=$('obj-localidad');if(!selLoc)return;
  const jurisdiccion=$('obj-jurisdiccion')?.value||'';
  const localidades=DB.jurisdiccionesServicio?.[jurisdiccion]||[];
  selLoc.innerHTML=localidades.length
    ?'<option value="">— Seleccionar —</option>'+localidades.map(l=>`<option${l===valorActual?' selected':''}>${l}</option>`).join('')
    :'<option value="">— Elegí jurisdicción primero —</option>';
}
// 2.4.1 (Delta Comercial v1.3) — herencia con sobrescritura: al elegir
// cliente en un servicio NUEVO, se copian período de facturación y
// Requiere OC como default editable (copia, no referencia en vivo — si
// después cambia el valor del cliente, los servicios ya creados no se
// alteran). Solo aplica a servicios nuevos: si ya existe, el servicio
// manda sobre lo suyo y no se pisa lo que Comercial ya cargó.
function heredarFacturacionDeCliente(clienteId){
  if(objetivoEditIdLocal) return;
  const cli=DB.clientes.find(c=>c.id===clienteId);
  if(!cli) return;
  if($('obj-periodo-fact')&&cli.periodoFact) $('obj-periodo-fact').value=cli.periodoFact;
  if($('obj-req-oc')&&cli.reqOC) $('obj-req-oc').value=cli.reqOC;
}
function poblarModeloPrecioSegunCliente(clienteId){
  const hint=$('obj-modelo-precio-hint');if(!hint)return;
  const esperados=modelosPrecioEsperados(clienteId);
  const cli=DB.clientes.find(c=>c.id===clienteId);
  hint.textContent=esperados?`Cliente con contrato "${cli.tipoContrato}" — modelo esperado: ${esperados.join(' o ')}.`:'';
}
let objetivoEditIdLocal=null;
function abrirModalObjetivo(idLocal){
  poblarSelectsComercial();
  objetivoEditIdLocal=idLocal||null;
  const o=idLocal?getObjetivoByIdLocal(idLocal):null;
  respObjetivoTemp.length=0;respObjetivoTemp.push(...(o?(o.responsables||[]).map(r=>({...r})):[]));
  adjuntosObjTemp.length=0;adjuntosObjTemp.push(...(o?(o.adjuntos||[]).map(a=>({...a})):[]));
  puestosObjTemp.length=0;puestosObjTemp.push(...(o?(o.puestos||[]).map(p=>({...p,dias:{...(p.dias||{})}})):[]));
  comisionesObjTemp.length=0;comisionesObjTemp.push(...(o?(o.comisiones||[]).map(c=>({...c,tramosPct:(c.tramosPct||[]).map(t=>({...t}))})):[]));
  const titulo=$('obj-modal-title');
  if(titulo) titulo.textContent=o?'📍 Editar servicio':'📍 Nuevo servicio';
  if(o){
    $('obj-cliente').value=o.clienteId;$('obj-codigo').value=o.codigo;
    $('obj-nombre').value=o.nombre;if($('obj-tipo'))$('obj-tipo').value=o.tipo||'';
    if($('obj-tipo-sitio'))$('obj-tipo-sitio').value=o.tipoSitio||'';
    $('obj-dir').value=o.dir||'';
    if($('obj-jurisdiccion')) $('obj-jurisdiccion').value=o.jurisdiccion||'';
    poblarLocalidadesServicio(o.localidad||'');
    if($('obj-fecha-inicio')&&o.fechaInicio){const[dd,mm,yy]=o.fechaInicio.split('/');$('obj-fecha-inicio').value=`${yy}-${mm}-${dd}`;}
    poblarModeloPrecioSegunCliente(o.clienteId);
    if($('obj-modelo-precio')) $('obj-modelo-precio').value=o.modeloPrecio||'';
    // DELTA_servicios_tipo_de_sitio_v1 — "Por horas variables" carga horas+
    // valor hora igual que "Por EFT" (antes se trataba como Abono fijo,
    // ver bug corregido en toggleModeloPrecio/recalcularPrecioObjetivo).
    const esHoras=o.modeloPrecio==='Por EFT'||o.modeloPrecio==='Por horas variables';
    $('obj-efts').value=esHoras?(o.efts||''):'';
    $('obj-valor-hora').value=esHoras?(o.valorHora||''):'';
    $('obj-valor').value=!esHoras?(o.valor||''):'';
    $('obj-efts-fijo').value=!esHoras?(o.efts||''):'';
    if($('obj-fecha-fin')&&o.fechaFin){const[dd,mm,yy]=o.fechaFin.split('/');$('obj-fecha-fin').value=`${yy}-${mm}-${dd}`;} else if($('obj-fecha-fin')) $('obj-fecha-fin').value='';
    if($('obj-contrato')) $('obj-contrato').value=o.contrato||'';
    if($('obj-productos')) $('obj-productos').value=o.productos||'';
    if($('obj-clausula-actualizacion')) $('obj-clausula-actualizacion').value=o.clausulaActualizacion||'';
    if($('obj-periodo-fact')) $('obj-periodo-fact').value=o.periodoFact||'';
    if($('obj-req-oc')) $('obj-req-oc').value=o.reqOC||'';
    $('obj-texto-factura').value=o.textoFactura||'';
    $('obj-notas-precio').value=o.notas||'';
    if($('obj-log-productos')) $('obj-log-productos').value=o.logProductos||'';
    if($('obj-log-elementos')) $('obj-log-elementos').value=o.logElementos||'';
    if($('obj-log-maquinas')) $('obj-log-maquinas').value=o.logMaquinas||'';
  } else {
    ['obj-cliente','obj-codigo','obj-nombre','obj-dir','obj-fecha-inicio','obj-valor','obj-efts','obj-efts-fijo','obj-valor-hora','obj-fecha-fin','obj-texto-factura','obj-notas-precio','obj-log-productos','obj-log-elementos','obj-log-maquinas'].forEach(id=>{const el=$(id);if(el)el.value='';});
    if($('obj-jurisdiccion')) $('obj-jurisdiccion').value='';
    if($('obj-tipo-sitio')) $('obj-tipo-sitio').value='';
    poblarLocalidadesServicio();
    poblarModeloPrecioSegunCliente(0);
  }
  if($('obj-paga-comision')) $('obj-paga-comision').checked=comisionesObjTemp.length>0;
  if($('obj-com-es-externo')) $('obj-com-es-externo').checked=false;
  if($('obj-com-tipo')) $('obj-com-tipo').value='Continuo';
  // Requerimiento de sincronización de Comisiones (04/08/2026): el
  // checklist de guardarObjetivo() exige jurisdicción/localidad/puestos
  // completos — en servicios ya existentes con esos datos incompletos
  // (frecuente en altas viejas), asignar una comisión y guardar el
  // servicio entero fallaba en silencio (toast de campos faltantes) y
  // la comisión nunca se persistía. Guardar comisiones es una acción
  // aparte que no depende del resto del checklist — sólo disponible
  // editando un servicio ya creado (uno nuevo se guarda con el alta).
  if($('obj-com-guardar-wrap')) $('obj-com-guardar-wrap').style.display=o?'block':'none';
  toggleComisionesObjetivo();toggleObjComExterno();toggleObjComPeriodos();
  renderRespObjetivoTemp();renderAdjuntosObj();renderPuestosObj();renderComisionesObjTemp();toggleModeloPrecio();
  bloquearCamposObjetivoPendiente(o?.estado==='Pendiente asignación operativa');
  abrirModal('modal-objetivo');
}
// ========== GUARDAR OBJETIVO ==========
function guardarObjetivo(){
  const cod=$('obj-codigo')?.value.trim(), nom=$('obj-nombre')?.value.trim();
  if(!cod||!nom){toast('Completá código y nombre del servicio');return;}
  const existente=objetivoEditIdLocal?getObjetivoByIdLocal(objetivoEditIdLocal):null;
  if(!existente){
    const dup=DB.objetivos.find(o=>o.codigo===cod&&!o.anulado);
    if(dup){toast('Ya existe un servicio con ese código');return;}
  }
  const clienteId=parseInt($('obj-cliente')?.value)||0;
  const contrato=$('obj-contrato')?.value;
  const modeloPrecio=$('obj-modelo-precio')?.value;
  // DELTA_servicios_tipo_de_sitio_v1 — hay TRES modelos, no dos. "Por EFT"
  // y "Por horas variables" cargan horas + valor hora por igual (la
  // diferencia es firme vs. estimado, no el campo que se carga); sólo
  // "Abono mensual fijo" carga el mensual directo y deriva la hora de
  // referencia. o.efts siempre termina siendo "cantidad de horas".
  const esHoras=modeloPrecio==='Por EFT'||modeloPrecio==='Por horas variables';
  const efts=esHoras?(parseFloat($('obj-efts')?.value)||0):(parseFloat($('obj-efts-fijo')?.value)||0);
  const valorHora=esHoras?(parseFloat($('obj-valor-hora')?.value)||0):0;
  const valor=esHoras?(efts*valorHora):(parseFloat($('obj-valor')?.value)||0);
  const datos={
    clienteId,clienteIdLocal:idLocalTrunc(clienteId),
    codigo:cod,nombre:nom,tipo:$('obj-tipo')?.value,tipoSitio:$('obj-tipo-sitio')?.value||'',
    dir:$('obj-dir')?.value,
    jurisdiccion:$('obj-jurisdiccion')?.value||'',localidad:$('obj-localidad')?.value||'',
    puestos:[...puestosObjTemp],
    comisiones:$('obj-paga-comision')?.checked?[...comisionesObjTemp]:[],
    modeloPrecio,valor,efts,valorHora,
    fechaInicio:$('obj-fecha-inicio')?.value?new Date($('obj-fecha-inicio').value).toLocaleDateString('es-AR'):'',
    fechaFin:$('obj-fecha-fin')?.value?new Date($('obj-fecha-fin').value).toLocaleDateString('es-AR'):'',
    contrato,
    clausulaActualizacion:$('obj-clausula-actualizacion')?.value||'',
    periodoFact:$('obj-periodo-fact')?.value,reqOC:$('obj-req-oc')?.value,
    textoFactura:$('obj-texto-factura')?.value,
    notas:$('obj-notas-precio')?.value||'',
    // 2.5.1 (Delta Comercial v1.3): "Facturación de productos" se movió
    // de la tab Precio a la tab Logística y cambió de opciones/nombre
    // (antes "productos", "Productos incluidos en precio").
    productos:$('obj-productos')?.value,
    logProductos:$('obj-log-productos')?.value||'',
    logElementos:$('obj-log-elementos')?.value||'',
    logMaquinas:$('obj-log-maquinas')?.value||'',
    responsables:[...respObjetivoTemp],
    adjuntos:[...adjuntosObjTemp],
  };
  // 2.2.2 (Delta Comercial v1.2/1.3) — checklist de campos mínimos antes
  // de guardar. No aplica mientras el servicio está "Pendiente asignación
  // operativa" (2.2.4): ahí casi todos los campos están bloqueados en el
  // modal, así que exigirlos completos impediría la única edición
  // permitida (EFT/responsables).
  if(!existente||existente.estado!=='Pendiente asignación operativa'){
    const faltantes=[];
    if(!datos.jurisdiccion) faltantes.push('Jurisdicción');
    if(!datos.localidad) faltantes.push('Localidad');
    if(!datos.dir) faltantes.push('Dirección');
    if(!datos.fechaInicio) faltantes.push('Fecha de inicio');
    if(!datos.puestos.length) faltantes.push('Personal necesario (agregá al menos un puesto)');
    if(!datos.modeloPrecio) faltantes.push('Modelo de precio');
    else if(esHoras){
      if(!efts||!valorHora) faltantes.push('Cantidad de horas y valor hora');
    } else if(!valor) faltantes.push('Valor mensual / presupuesto');
    if(faltantes.length){toast('⚠️ Faltan campos mínimos: '+faltantes.join(', '));return;}
  }
  // 2.2.1: el modelo de precio debería coincidir con el tipo de contrato
  // del cliente (2.1.2) — no se bloquea (puede haber excepciones), se
  // confirma explícitamente si no coincide.
  const modelosEsperados=modelosPrecioEsperados(clienteId);
  if(modelosEsperados&&!modelosEsperados.includes(datos.modeloPrecio)){
    const tipoContratoCliente=DB.clientes.find(c=>c.id===clienteId)?.tipoContrato;
    if(!confirm(`El cliente tiene contrato "${tipoContratoCliente}" — se esperaba un modelo de precio "${modelosEsperados.join(' o ')}", elegiste "${datos.modeloPrecio}".\n\n¿Confirmás igual?`)) return;
  }
  let objetivo;
  if(existente){
    // Comercial no puede reasignar supervisor ni estado desde este modal —
    // eso es del flujo de Operaciones (Cambio 5/11/12) o de Baja (Cambio 14).
    Object.assign(existente,datos);
    existente.modificadoPor=currentUser?.nombre||'';existente.modificadoEn=new Date().toISOString();
    objetivo=existente;
  } else {
    const estadoInicial=contrato==='Contrato firmado'?'Pendiente asignación operativa':'Presupuestado';
    objetivo={id:Date.now(),estado:estadoInicial,historialPrecios:[],cargadoPor:currentUser?.nombre||'',fechaCarga:hoyStr(),...datos};
    DB.objetivos.push(objetivo);
    if(estadoInicial==='Pendiente asignación operativa'){
      registrarEventoObjetivo(objetivo,null,estadoInicial,'Alta de objetivo con contrato firmado');
      crearNotificacion({tipo:'objetivo_pendiente_asignacion',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(objetivo.id),destinatarioNombre:GERENTE_OPERACIONES,mensaje:`Nuevo objetivo esperando asignación de supervisor: ${objetivo.nombre} (${objetivo.codigo}).`});
    } else {
      registrarEventoObjetivo(objetivo,null,estadoInicial,'Alta de objetivo — presupuestado');
    }
  }
  cerrarModal('modal-objetivo');renderObjetivos();poblarSelectsComercial();
  supaSync('objetivos', objetivoParaGuardar(objetivo));
  persistirRelacionadosObjetivo(objetivo);
  toast(existente?'✓ Servicio actualizado':'✓ Servicio guardado');
}
function tabObjModal(idx,btn){
  document.querySelectorAll('#modal-objetivo .tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#modal-objetivo .tab-content').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');$('obj-tab-'+idx).classList.add('active');
}
// A.2 (Delta Comercial v1.3) + DELTA_servicios_tipo_de_sitio_v1 — el
// modelo de precio define qué se carga y qué se calcula, son TRES
// modelos: "Por EFT" y "Por horas variables" cargan horas + valor hora
// por igual (fila "por hora"), el mensual se calcula y se muestra
// bloqueado — firme en EFT, estimado en horas variables (las etiquetas
// cambian, el cálculo es el mismo). "Abono mensual fijo" (fila "fijo")
// carga el mensual directo, la hora de referencia se calcula.
function toggleModeloPrecio(){
  const m=$('obj-modelo-precio')?.value||'';
  const esHoras=m==='Por EFT'||m==='Por horas variables';
  const esEstimado=m==='Por horas variables';
  const rowHora=$('obj-precio-por-hora-row'), rowFijo=$('obj-precio-fijo-row');
  if(rowHora) rowHora.style.display=esHoras?'grid':'none';
  if(rowFijo) rowFijo.style.display=esHoras?'none':'grid';
  const eftsLabel=$('obj-efts-label');
  if(eftsLabel) eftsLabel.textContent=esEstimado?'Cantidad de horas estimada *':'Cantidad de horas *';
  const calcLabel=$('obj-valor-calculado-label');
  if(calcLabel) calcLabel.textContent=esEstimado?'Monto estimado a facturar (calculado)':'Valor mensual (calculado)';
  const vencRow=$('obj-vencimiento-row');
  if(vencRow) vencRow.style.display=esEstimado?'grid':'none';
  recalcularPrecioObjetivo();
}
// Recalcula en vivo el campo bloqueado según el modelo — nunca se tipea,
// siempre se deriva de los campos base (2.2.1/2.2.3). "Por EFT" y "Por
// horas variables" comparten la misma cuenta (horas × valor hora); sólo
// cambia la etiqueta (ver toggleModeloPrecio), no la fórmula.
function recalcularPrecioObjetivo(){
  const m=$('obj-modelo-precio')?.value||'';
  if(m==='Por EFT'||m==='Por horas variables'){
    const horas=parseFloat($('obj-efts')?.value)||0;
    const valorHora=parseFloat($('obj-valor-hora')?.value)||0;
    const calc=$('obj-valor-calculado');
    if(calc) calc.value=(horas&&valorHora)?'$'+(horas*valorHora).toLocaleString('es-AR'):'—';
  } else {
    const valorMensual=parseFloat($('obj-valor')?.value)||0;
    const horas=parseFloat($('obj-efts-fijo')?.value)||0;
    const calc=$('obj-valor-hora-calculado');
    if(calc) calc.value=(valorMensual&&horas)?'$'+Math.round(valorMensual/horas).toLocaleString('es-AR')+'/hora':'—';
  }
}

// Adjuntos objetivo
// Mismo bindeo a window que respObjetivoTemp — el botón "✕" de la lista
// (adjuntosObjTemp.splice(i,1)) es inline y corre en scope global.
let adjuntosObjTemp=[];
window.adjuntosObjTemp=adjuntosObjTemp;
function agregarAdjuntoObj(){
  const nom=$('obj-adj-nombre')?.value.trim();
  const url=$('obj-adj-url')?.value.trim();
  if(!nom||!url){toast('Completá nombre y URL del documento');return;}
  adjuntosObjTemp.push({nombre:nom,url});
  $('obj-adj-nombre').value='';$('obj-adj-url').value='';
  renderAdjuntosObj();
}
function renderAdjuntosObj(){
  const el=$('obj-adjuntos-lista');if(!el)return;
  el.innerHTML=adjuntosObjTemp.map((a,i)=>`
    <div style="display:flex;align-items:center;gap:6px;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:5px 10px;">
      <span style="font-size:13px;">📎</span>
      <a href="${a.url}" target="_blank" style="font-size:12px;font-weight:500;color:var(--azul);">${a.nombre}</a>
      <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:12px;margin-left:4px;" onclick="adjuntosObjTemp.splice(${i},1);renderAdjuntosObj()">✕</button>
    </div>`).join('');
}

// A.3 (Delta Comercial v1.3) — personal necesario como tabla de puestos
// estructurada (antes texto libre). Cada puesto describe una NECESIDAD,
// no una persona concreta — la asignación real ocurre después en
// Operaciones/RRHH. Mismo bindeo a window que respObjetivoTemp/
// adjuntosObjTemp: los oninput/onclick inline de las filas corren en
// scope global.
const DIAS_PUESTO=[['lunes','L'],['martes','M'],['miercoles','X'],['jueves','J'],['viernes','V'],['sabados','S'],['domingos','D'],['feriados','Fer.']];
let puestosObjTemp=[];
window.puestosObjTemp=puestosObjTemp;
function agregarPuestoObj(){
  puestosObjTemp.push({cantidad:1,perfil:'',horarioDesde:'',horarioHasta:'',dias:{},obs:''});
  renderPuestosObj();
}
function renderPuestosObj(){
  const el=$('obj-puestos-lista');if(!el)return;
  el.innerHTML=puestosObjTemp.map((p,i)=>`
    <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 12px;margin-bottom:8px;">
      <div style="display:grid;grid-template-columns:90px 1fr 100px 100px auto;gap:8px;align-items:end;">
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Cantidad *</label><input type="number" min="1" value="${p.cantidad||''}" style="${inputStyle}" oninput="puestosObjTemp[${i}].cantidad=parseInt(this.value)||0"></div>
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Perfil (opcional)</label><input type="text" value="${p.perfil||''}" placeholder="Ej: H, 25 a 40 años" style="${inputStyle}" oninput="puestosObjTemp[${i}].perfil=this.value"></div>
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Desde</label><input type="time" value="${p.horarioDesde||''}" style="${inputStyle}" onchange="puestosObjTemp[${i}].horarioDesde=this.value"></div>
        <div class="form-group" style="margin:0;"><label style="font-size:10px;">Hasta</label><input type="time" value="${p.horarioHasta||''}" style="${inputStyle}" onchange="puestosObjTemp[${i}].horarioHasta=this.value"></div>
        <button type="button" style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;" onclick="puestosObjTemp.splice(${i},1);renderPuestosObj()">✕</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
        ${DIAS_PUESTO.map(([d,label])=>`<label style="display:flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;"><input type="checkbox" ${p.dias?.[d]?'checked':''} onchange="puestosObjTemp[${i}].dias.${d}=this.checked">${label}</label>`).join('')}
      </div>
      <div class="form-group" style="margin:6px 0 0;"><label style="font-size:10px;">Observación</label><input type="text" value="${p.obs||''}" placeholder="Notas de este puesto..." style="${inputStyle}" oninput="puestosObjTemp[${i}].obs=this.value"></div>
    </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin puestos cargados — hacé click en "+ Agregar puesto"</p>';
}

// ========== COMISIONES asignadas al servicio (DELTA_comisiones_v1) ==========
// La ASIGNACIÓN (quién cobra, tipo, períodos) se gestiona acá, en el
// alta/edición del servicio, y vive en obj.comisiones[]. El % nace acá
// con el % inicial (primer tramo de tramosPct); los CAMBIOS de % a
// futuro se gestionan desde el módulo de Comisiones, no se re-edita
// acá — "no se pisa, se agrega un tramo nuevo" (mismo criterio que
// precios). pctVigenteComision() se reusa también desde ese módulo.
let comisionesObjTemp=[];
window.comisionesObjTemp=comisionesObjTemp;

function toggleComisionesObjetivo(){
  const on=$('obj-paga-comision')?.checked;
  const wrap=$('obj-comisiones-wrap');
  if(wrap) wrap.style.display=on?'block':'none';
}
function toggleObjComExterno(){
  const esExt=$('obj-com-es-externo')?.checked;
  const inp=$('obj-com-persona'), sel=$('obj-com-persona-externo');
  if(inp) inp.style.display=esExt?'none':'block';
  if(sel){
    sel.style.display=esExt?'block':'none';
    if(esExt){
      const ph=sel.options[0]?.outerHTML||'<option value="">— Elegir persona externa —</option>';
      sel.innerHTML=ph+(DB.comisionesExternos||[]).filter(e=>e.activo).map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('');
    }
  }
}
function toggleObjComPeriodos(){
  const esTemporal=$('obj-com-tipo')?.value==='Temporal';
  const row=$('obj-com-periodos-row');
  if(row) row.style.display=esTemporal?'grid':'none';
}
// Último tramo con fechaVigencia <= fecha de referencia (mismo criterio
// que getMontoEnMes/aplicarTramosVencidos de Gestión de precios, pero
// genérico para el array tramosPct de una comisión).
function pctVigenteComision(comision,fechaDMY){
  const f=fechaDMY?_dmyPrecios(fechaDMY):new Date();
  let pct=0;
  (comision.tramosPct||[]).slice().sort((a,b)=>_dmyPrecios(a.fechaVigencia)-_dmyPrecios(b.fechaVigencia)).forEach(t=>{
    const tf=_dmyPrecios(t.fechaVigencia);
    if(tf&&tf<=f) pct=t.pct;
  });
  return pct;
}
function agregarComisionObjetivoTemp(){
  const esExterno=$('obj-com-es-externo')?.checked;
  const tipo=$('obj-com-tipo')?.value||'Continuo';
  const pct=parseFloat($('obj-com-pct')?.value)||0;
  const periodosTotal=tipo==='Temporal'?(parseInt($('obj-com-periodos')?.value)||0):null;
  if(!pct){toast('Ingresá el % inicial de la comisión');return;}
  if(tipo==='Temporal'&&!periodosTotal){toast('Ingresá la cantidad de períodos (comisión temporal)');return;}
  let personaTipo,personaRef,personaNombre;
  if(esExterno){
    const id=$('obj-com-persona-externo')?.value;
    const ext=(DB.comisionesExternos||[]).find(e=>String(e.id)===String(id));
    if(!ext){toast('Elegí una persona externa');return;}
    personaTipo='externo';personaRef=ext.id;personaNombre=ext.nombre;
  } else {
    const nombre=$('obj-com-persona')?.value.trim();
    const legajo=(DB.legajos||[]).find(l=>l.nombre===nombre&&l.estado==='Activo');
    if(!legajo){toast('Elegí un asociado activo de la lista (buscá por nombre, tal cual aparece en Legajos)');return;}
    personaTipo='interno';personaRef=legajo.nro;personaNombre=legajo.nombre;
  }
  if(comisionesObjTemp.some(c=>c.activa&&c.personaTipo===personaTipo&&String(c.personaRef)===String(personaRef)&&c.tipo===tipo)){
    toast('Esta persona ya tiene una comisión de este tipo asignada en este servicio');return;
  }
  const fechaHoy=new Date().toLocaleDateString('es-AR');
  comisionesObjTemp.push({
    id:Date.now()+Math.floor(Math.random()*1e6),
    personaTipo,personaRef,personaNombre,tipo,
    periodosTotal,periodosConsumidos:0,
    tramosPct:[{id:Date.now(),pct,fechaVigencia:fechaHoy}],
    activa:true,creadaPor:currentUser?.nombre||'',creadaEn:fechaHoy,
  });
  if($('obj-com-persona'))$('obj-com-persona').value='';
  if($('obj-com-persona-externo'))$('obj-com-persona-externo').value='';
  if($('obj-com-pct'))$('obj-com-pct').value='';
  if($('obj-com-periodos'))$('obj-com-periodos').value='';
  if($('obj-com-es-externo'))$('obj-com-es-externo').checked=false;
  toggleObjComExterno();
  renderComisionesObjTemp();
}
function eliminarComisionObjTemp(idx){
  comisionesObjTemp.splice(idx,1);
  renderComisionesObjTemp();
}
function renderComisionesObjTemp(){
  const el=$('obj-comisiones-lista');if(!el)return;
  const hoy=new Date().toLocaleDateString('es-AR');
  el.innerHTML=comisionesObjTemp.map((c,i)=>{
    const pct=pctVigenteComision(c,hoy);
    return `<div class="config-item">
      <span style="font-size:12px;">
        <strong>${c.personaNombre}</strong>${c.personaTipo==='externo'?' <span class="badge badge-gris" style="font-size:9px;">Externo</span>':''}
        — ${c.tipo==='Temporal'?`Temporal (${c.periodosConsumidos||0}/${c.periodosTotal} períodos)`:'Continuo'}
        — <strong>${pct}%</strong>
      </span>
      <button class="btn btn-danger btn-xs" type="button" onclick="eliminarComisionObjTemp(${i})">Quitar</button>
    </div>`;
  }).join('')||'<p class="text-muted" style="font-size:12px;">Sin comisiones cargadas</p>';
  const tope=DB.comisionesConfig?.topeAlertaPct??10;
  const sumaPct=comisionesObjTemp.filter(c=>c.activa).reduce((s,c)=>s+pctVigenteComision(c,hoy),0);
  const aviso=$('obj-com-tope-aviso');
  if(aviso){
    if(sumaPct>tope){aviso.style.display='block';aviso.textContent=`⚠️ Este servicio suma ${sumaPct}% de comisión (tope de aviso: ${tope}%).`;}
    else aviso.style.display='none';
  }
}
// Guarda SÓLO las comisiones de un servicio ya existente, sin pasar por
// el checklist de campos mínimos de guardarObjetivo() — un servicio
// viejo con jurisdicción/localidad/puestos incompletos no debería
// bloquear la asignación de un coordinador de cuenta.
function guardarComisionesObjetivo(){
  if(!objetivoEditIdLocal){toast('Guardá el servicio primero (con código y nombre) antes de asignar comisiones');return;}
  const existente=getObjetivoByIdLocal(objetivoEditIdLocal);
  if(!existente){toast('No se encontró el servicio');return;}
  existente.comisiones=$('obj-paga-comision')?.checked?[...comisionesObjTemp]:[];
  existente.modificadoPor=currentUser?.nombre||'';existente.modificadoEn=new Date().toISOString();
  supaSync('objetivos',existente);
  renderComisionesObjTemp();
  toast('✓ Comisiones guardadas');
}

// Roles de responsables en formulario (parametrizables)
function renderRespObjetivoTemp(){
  const el=$('resp-objetivo-lista');if(!el)return;
  const rolesOpts=DB.rolesResponsables.map(r=>`<option>${r}</option>`).join('');
  el.innerHTML=respObjetivoTemp.map((r,i)=>`
    <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 12px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:center;">
        <input type="text" placeholder="Nombre *" value="${r.nombre}" style="${inputStyle}" oninput="respObjetivoTemp[${i}].nombre=this.value">
        <select style="${inputStyle}" onchange="respObjetivoTemp[${i}].rol=this.value">
          <option value="">— Rol —</option>${rolesOpts}
          <option${r.rol&&!DB.rolesResponsables.includes(r.rol)?' selected':''}>Otro</option>
        </select>
        <input type="text" placeholder="Teléfono" value="${r.tel}" style="${inputStyle}" oninput="respObjetivoTemp[${i}].tel=this.value">
        <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:16px;" onclick="respObjetivoTemp.splice(${i},1);renderRespObjetivoTemp()">✕</button>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
          <input type="checkbox" ${r.aSatisfacer?'checked':''} onchange="respObjetivoTemp[${i}].aSatisfacer=this.checked">
          ⭐ "Cliente a satisfacer"
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
          <input type="checkbox" ${r.recibeFactura?'checked':''} onchange="respObjetivoTemp[${i}].recibeFactura=this.checked">
          🧾 Recibe la factura
        </label>
      </div>
    </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin responsables — hacé click en "+ Agregar"</p>';
}

// ========== HANDOFF COMERCIAL → OPERACIONES (Cambios 5, 11, 12, 14) ==========
// 2.2.5 (Delta Comercial v1.2): el supervisor a asignar/cambiar se elige de
// un dropdown poblado desde Legajos (funcion==='Supervisor', estado
// Activo), no de un prompt() con una lista de nombres hardcodeada en
// state.js (DB.supervisores) que podía quedar desactualizada.
function legajosSupervisoresActivos(){
  return (DB.legajos||[]).filter(l=>l.funcion==='Supervisor'&&l.estado==='Activo');
}
let _supObjetivoIdLocal=null;
function ensureModalSupervisorObjetivo(){
  if($('modal-sup-objetivo')) return;
  const m=document.createElement('div');
  m.className='modal-overlay';
  m.id='modal-sup-objetivo';
  m.innerHTML=`
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="sup-obj-titulo">Asignar supervisor</h3><button class="btn-close" onclick="cerrarModal('modal-sup-objetivo')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Supervisor</label>
          <select id="sup-obj-select" style="width:100%;padding:8px;border:1px solid var(--borde-fuerte);border-radius:6px;font-family:inherit;font-size:13px;"></select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-sup-objetivo')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarSupervisorObjetivo()">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function _poblarSelectSupervisorObjetivo(actual){
  const sel=$('sup-obj-select');if(!sel)return;
  const sups=legajosSupervisoresActivos();
  sel.innerHTML=sups.length
    ?'<option value="">— Seleccionar —</option>'+sups.map(l=>`<option value="${l.nombre}"${l.nombre===actual?' selected':''}>${l.nombre}</option>`).join('')
    :'<option value="">Sin legajos con función Supervisor activos</option>';
}
function abrirAsignarSupervisor(idLocal){
  const o=getObjetivoByIdLocal(idLocal);if(!o)return;
  if(!esGerenteOperaciones()){toast('Solo el Gerente de Operaciones puede asignar supervisor');return;}
  ensureModalSupervisorObjetivo();
  _supObjetivoIdLocal=idLocal;
  $('sup-obj-titulo').textContent=`Asignar supervisor a "${o.nombre}"`;
  _poblarSelectSupervisorObjetivo(null);
  abrirModal('modal-sup-objetivo');
}
function abrirCambiarSupervisor(idLocal){
  const o=getObjetivoByIdLocal(idLocal);if(!o)return;
  if(!esGerenteOperaciones()){toast('Solo el Gerente de Operaciones puede cambiar el supervisor');return;}
  ensureModalSupervisorObjetivo();
  _supObjetivoIdLocal=idLocal;
  $('sup-obj-titulo').textContent=`Cambiar supervisor de "${o.nombre}" (actual: ${o.supervisorAsignado||'—'})`;
  _poblarSelectSupervisorObjetivo(o.supervisorAsignado);
  abrirModal('modal-sup-objetivo');
}
function confirmarSupervisorObjetivo(){
  const o=getObjetivoByIdLocal(_supObjetivoIdLocal);if(!o)return;
  const elegido=$('sup-obj-select')?.value;
  if(!elegido){toast('Elegí un supervisor');return;}
  const esCambio=!!o.supervisorAsignado;
  const anterior=o.supervisorAsignado;
  if(esCambio){
    const abierto=(DB.objetivoSupervisoresHistorial||[]).find(h=>h.objetivoIdLocal===idLocalTrunc(o.id)&&!h.vigenciaHasta&&!h.anulado);
    if(abierto){abierto.vigenciaHasta=hoyStr();supaSync('objetivoSupervisoresHistorial', abierto);}
  }
  const estadoDesde=o.estado;
  o.supervisorAsignado=elegido;o.supervisor=o.supervisorAsignado;o.supervisorAsignadoPor=currentUser?.nombre||GERENTE_OPERACIONES;
  o.fechaAsignacionSupervisor=hoyStr();
  if(!esCambio) o.estado='Operativo';
  supaSync('objetivos', objetivoParaGuardar(o));
  const hist={id:Date.now(),objetivoIdLocal:idLocalTrunc(o.id),supervisorNombre:elegido,vigenciaDesde:hoyStr(),vigenciaHasta:null,asignadoPor:currentUser?.nombre||GERENTE_OPERACIONES,motivoCambio:esCambio?'Cambio de supervisor':'Asignación inicial'};
  DB.objetivoSupervisoresHistorial.push(hist);supaSync('objetivoSupervisoresHistorial', hist);
  if(esCambio){
    crearNotificacion({tipo:'objetivo_supervisor_cambiado',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:anterior,mensaje:`Dejaste de ser supervisor del objetivo ${o.nombre}.`});
    crearNotificacion({tipo:'objetivo_supervisor_cambiado',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:o.supervisorAsignado,mensaje:`Ahora sos supervisor del objetivo ${o.nombre} (${o.codigo}).`});
    crearNotificacion({tipo:'objetivo_supervisor_cambiado',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:o.cargadoPor,mensaje:`Cambio de supervisor en ${o.nombre}: ${anterior} → ${o.supervisorAsignado}.`});
  } else {
    registrarEventoObjetivo(o,estadoDesde,'Operativo','Supervisor asignado: '+o.supervisorAsignado);
    crearNotificacion({tipo:'objetivo_supervisor_asignado',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:o.cargadoPor,mensaje:`Se asignó supervisor (${o.supervisorAsignado}) al objetivo ${o.nombre}.`});
    crearNotificacion({tipo:'objetivo_supervisor_asignado',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:o.supervisorAsignado,mensaje:`Te asignaron el objetivo ${o.nombre} (${o.codigo}).`});
  }
  cerrarModal('modal-sup-objetivo');
  filtrarObjetivos();toast(esCambio?'✓ Supervisor actualizado':'✓ Supervisor asignado — servicio Operativo');
}
// 2.2.6 (Delta Comercial v1.2) — la razón de baja pasa de texto libre por
// prompt() a un motivo parametrizable (Configuración → Comercial) más un
// detalle libre opcional, igual que se hizo con el supervisor en 2.2.5.
let _bajaObjetivoIdLocal=null;
function ensureModalBajaObjetivo(){
  if($('modal-baja-objetivo')) return;
  const m=document.createElement('div');
  m.className='modal-overlay';
  m.id='modal-baja-objetivo';
  m.innerHTML=`
    <div class="modal" style="max-width:460px;">
      <div class="modal-header"><h3 id="baja-obj-titulo">Dar de baja objetivo</h3><button class="btn-close" onclick="cerrarModal('modal-baja-objetivo')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Motivo</label>
          <select id="baja-obj-motivo" style="width:100%;padding:8px;border:1px solid var(--borde-fuerte);border-radius:6px;font-family:inherit;font-size:13px;">
            <option value="">— Seleccionar —</option>${(DB.motivosBajaObjetivo||[]).map(m=>`<option>${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Detalle (opcional)</label>
          <textarea id="baja-obj-detalle" style="width:100%;padding:8px;border:1px solid var(--borde-fuerte);border-radius:6px;font-family:inherit;font-size:13px;" rows="3"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-baja-objetivo')">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmarBajaObjetivo()">Dar de baja</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function abrirBajaObjetivo(idLocal){
  const o=getObjetivoByIdLocal(idLocal);if(!o)return;
  if(!esGerenteComercial()){toast('Solo Comercial puede dar de baja un servicio');return;}
  ensureModalBajaObjetivo();
  _bajaObjetivoIdLocal=idLocal;
  $('baja-obj-titulo').textContent=`Dar de baja "${o.nombre}"`;
  $('baja-obj-motivo').value='';$('baja-obj-detalle').value='';
  abrirModal('modal-baja-objetivo');
}
function confirmarBajaObjetivo(){
  const o=getObjetivoByIdLocal(_bajaObjetivoIdLocal);if(!o)return;
  const razon=$('baja-obj-motivo')?.value||'';
  if(!razon){toast('Elegí un motivo');return;}
  const detalle=$('baja-obj-detalle')?.value.trim()||'';
  const motivoCompleto=razon+(detalle?' — '+detalle:'');
  const estadoDesde=o.estado;
  o.estado='Baja';o.fechaBaja=hoyStr();o.dadoDeBajaPor=currentUser?.nombre||'';
  o.motivoBajaRazon=razon;o.motivoBajaDetalle=detalle;o.motivoBaja=motivoCompleto;
  supaSync('objetivos', objetivoParaGuardar(o));
  registrarEventoObjetivo(o,estadoDesde,'Baja',motivoCompleto);
  const asocAsignados=(DB.legajos||[]).filter(l=>l.servicio===o.codigo&&l.estado==='Activo').map(l=>l.nombre);
  const detalleAsoc=asocAsignados.length?` Asociados asignados al servicio: ${asocAsignados.join(', ')}. Sugerencia: reasignar vía Reasignaciones.`:'';
  crearNotificacion({tipo:'objetivo_dado_de_baja',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:GERENTE_OPERACIONES,mensaje:`Se dio de baja el objetivo ${o.nombre} (${o.codigo}). Motivo: ${motivoCompleto}.${detalleAsoc}`});
  crearNotificacion({tipo:'objetivo_dado_de_baja',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:GERENTE_RRHH_COMERCIAL,mensaje:`Se dio de baja el objetivo ${o.nombre} (${o.codigo}). Motivo: ${motivoCompleto}.${detalleAsoc}`});
  cerrarModal('modal-baja-objetivo');
  filtrarObjetivos();toast('✓ Servicio dado de baja');
}
// 2.2.7 (Delta Comercial v1.2) — reactivar un servicio dado de baja NO
// pisa las condiciones/motivo de la baja anterior (o.fechaBaja/motivoBaja
// quedan como quedaron, son "la última baja registrada"): se abre un
// nuevo tramo de vigencia vía registrarEventoObjetivo() (mismo objetivoEventos
// que ya usan todas las transiciones de estado) y se agregan campos propios
// de la reactivación (fechaReactivacion/reactivadoPor), preservando el
// historial completo en vez de sobrescribirlo (política A.6).
function reactivarObjetivo(idLocal){
  const o=getObjetivoByIdLocal(idLocal);if(!o)return;
  if(!esGerenteComercial()){toast('Solo Comercial puede reactivar un servicio');return;}
  if(o.estado!=='Baja'){toast('El servicio no está dado de baja');return;}
  if(!confirm(`¿Reactivar "${o.nombre}"? Se preserva el historial de la baja anterior (${o.motivoBaja||'sin motivo registrado'}).`)) return;
  const estadoDesde=o.estado;
  const nuevoEstado=o.supervisorAsignado?'Operativo':'Pendiente asignación operativa';
  o.estado=nuevoEstado;o.fechaReactivacion=hoyStr();o.reactivadoPor=currentUser?.nombre||'';
  supaSync('objetivos', objetivoParaGuardar(o));
  registrarEventoObjetivo(o,estadoDesde,nuevoEstado,`Reactivación (baja anterior: ${o.motivoBaja||'sin motivo registrado'})`);
  crearNotificacion({tipo:'objetivo_reactivado',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:GERENTE_OPERACIONES,mensaje:`Se reactivó el objetivo ${o.nombre} (${o.codigo}).${nuevoEstado==='Pendiente asignación operativa'?' Necesita asignación de supervisor.':''}`});
  filtrarObjetivos();toast('✓ Servicio reactivado — '+nuevoEstado);
}
// Alerta de objetivos con 7+ días esperando asignación — se chequea al
// entrar al módulo (mismo criterio de "chequear al render" ya usado en
// otros módulos de esta sesión, ej. chequearPlazo24hs de Enfermos).
function chequearObjetivosDemorados(){
  const pendientes=DB.objetivos.filter(o=>o.estado==='Pendiente asignación operativa'&&!o.anulado&&diasDesde(o.fechaCarga)>=7);
  pendientes.forEach(o=>{
    const yaNotificado=(DB.notificacionesSistema||[]).some(n=>n.tipo==='objetivo_asignacion_demorada'&&n.entidadIdLocal===idLocalTrunc(o.id));
    if(yaNotificado) return;
    crearNotificacion({tipo:'objetivo_asignacion_demorada',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:GERENTE_OPERACIONES,mensaje:`El objetivo ${o.nombre} (${o.codigo}) lleva ${diasDesde(o.fechaCarga)} días esperando asignación de supervisor.`});
    crearNotificacion({tipo:'objetivo_asignacion_demorada',entidadTipo:'objetivo',entidadIdLocal:idLocalTrunc(o.id),destinatarioNombre:GERENTE_COMERCIAL,mensaje:`El objetivo ${o.nombre} (${o.codigo}) lleva ${diasDesde(o.fechaCarga)} días esperando asignación de supervisor.`});
  });
}
// ========== CRM ==========
// DELTA_crm_flujo_leads_v1 (30/07/2026), punto 2 — campos estructurados
// propios de cada etapa (para estadística), separados de la observación
// libre. "Prospecto" no tiene campos: es donde nace el lead (el origen se
// carga al crearlo). Se usa tanto en la ventana de cambio de etapa como en
// la carga retroactiva del modal "Nuevo lead" (punto 3) — mismo spec, dos
// lugares que lo consumen.
function crmCamposDeEtapa(etapa){
  switch(etapa){
    case 'Primer contacto': return [
      {id:'fecha',label:'Fecha del contacto',type:'date'},
      {id:'interlocutor',label:'Interlocutor (con quién se habló)',type:'text'},
    ];
    case 'Propuesta enviada': return [
      {id:'valorEtapa',label:'Valor propuesto ($/mes)',type:'number'},
      {id:'fecha',label:'Fecha de envío',type:'date'},
    ];
    case 'Negociación': return [
      {id:'valorEtapa',label:'Valor ofrecido ($/mes)',type:'number'},
      {id:'contraoferta',label:'Contraoferta del cliente ($/mes)',type:'number'},
    ];
    case 'Contrato': return [
      {id:'fecha',label:'Fecha de cierre',type:'date'},
      {id:'valorEtapa',label:'Valor de cierre ($/mes)',type:'number'},
    ];
    case 'Cerrado perdido': return [
      {id:'motivoPerdida',label:'Motivo de la pérdida',type:'select',opciones:()=>DB.motivosPerdidaCRM},
    ];
    default: return []; // Prospecto y etapas custom agregadas desde Configuración
  }
}
function crmCamposHtml(etapa,prefix){
  return crmCamposDeEtapa(etapa).map(c=>{
    const id=`${prefix}-${c.id}`;
    if(c.type==='select'){
      const opts=(typeof c.opciones==='function'?c.opciones():c.opciones)||[];
      return `<div class="form-group"><label>${c.label}</label><select id="${id}"><option value="">— Sin especificar —</option>${opts.map(o=>`<option>${o}</option>`).join('')}</select></div>`;
    }
    return `<div class="form-group"><label>${c.label}</label><input type="${c.type}" id="${id}"></div>`;
  }).join('');
}
function crmLeerCampos(etapa,prefix){
  const out={};
  crmCamposDeEtapa(etapa).forEach(c=>{
    const el=$(`${prefix}-${c.id}`);
    if(!el)return;
    let v=el.value;
    if(c.type==='date') v=v?new Date(v).toLocaleDateString('es-AR'):'';
    if(c.type==='number') v=v!==''?parseFloat(v):'';
    out[c.id]=v;
  });
  return out;
}
function _slugEtapa(e){
  // NFD separa la tilde de la letra base (ej. "ó" → "o" + acento combinante);
  // el filtro de abajo ya descarta cualquier no-alfanumérico, tildes incluidas.
  return e.normalize('NFD').replace(/[^a-zA-Z0-9]+/g,'').toLowerCase();
}

// ---------- Ventana de cambio de etapa (punto 1) ----------
// Avanzar un lead de etapa (arrastrando en el pipeline O con el botón de la
// Lista) SIEMPRE pasa por acá — no hay mutación silenciosa de l.etapa en
// ningún otro lado. Confirmar genera una acción "Cambio de etapa" en el
// historial (con los campos propios de la etapa que llegó) + deja agendada,
// opcionalmente, la próxima acción programada.
function ensureModalCambioEtapa(){
  if($('modal-cambio-etapa'))return;
  const m=document.createElement('div');
  m.className='modal-overlay';
  m.id='modal-cambio-etapa';
  m.innerHTML=`
    <div class="modal" style="max-width:600px;">
      <div class="modal-header"><h3 id="ce-titulo">🎯 Cambio de etapa</h3><button class="btn-close" onclick="cerrarModal('modal-cambio-etapa')">×</button></div>
      <div class="modal-body">
        <div id="ce-campos-etapa" class="form-grid form-grid-2 gap-12"></div>
        <div class="form-group"><label>Observación</label><textarea id="ce-obs"></textarea></div>
        <div class="form-section">Próxima acción programada (opcional)</div>
        <div class="form-grid form-grid-3">
          <div class="form-group"><label>Tipo de acción</label><select id="ce-prox-tipo">${DB.tiposAccionCRM.map(t=>`<option>${t}</option>`).join('')}</select></div>
          <div class="form-group"><label>Fecha</label><input type="date" id="ce-prox-fecha"></div>
          <div class="form-group"><label>Fecha límite (vencimiento)</label><input type="date" id="ce-prox-fechavenc"></div>
        </div>
        <div class="form-group"><label>Responsable de la próxima acción</label><select id="ce-prox-resp"></select></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cambio-etapa')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarCambioEtapa()">Confirmar avance</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
let _cambioEtapaPendiente=null;
function abrirModalCambioEtapa(leadIdx,etapaDestino){
  const l=DB.leads[leadIdx];if(!l)return;
  ensureModalCambioEtapa();
  _cambioEtapaPendiente={leadIdx,etapaDestino};
  $('ce-titulo').textContent=`🎯 ${l.empresa}: ${l.etapa} → ${etapaDestino}`;
  $('ce-campos-etapa').innerHTML=crmCamposHtml(etapaDestino,'ce')||'<p class="text-muted" style="font-size:12px;">Esta etapa no tiene campos propios.</p>';
  $('ce-obs').value='';
  if($('ce-prox-tipo'))$('ce-prox-tipo').value='Llamada';
  if($('ce-prox-fecha'))$('ce-prox-fecha').value='';
  if($('ce-prox-fechavenc'))$('ce-prox-fechavenc').value='';
  const respSel=$('ce-prox-resp');
  if(respSel){
    respSel.innerHTML='<option value="">— Elegir —</option>'+(DB.usuarios||[]).map(u=>`<option>${u.nombre}</option>`).join('');
    respSel.value=l.responsable||'';
  }
  abrirModal('modal-cambio-etapa');
}
function confirmarCambioEtapa(){
  if(!_cambioEtapaPendiente)return;
  const{leadIdx,etapaDestino}=_cambioEtapaPendiente;
  const l=DB.leads[leadIdx];if(!l)return;
  const etapaAnterior=l.etapa;
  const campos=crmLeerCampos(etapaDestino,'ce');
  const obs=$('ce-obs')?.value.trim()||'';
  const hoy=new Date().toLocaleDateString('es-AR');
  const accion={
    tipo:'Cambio de etapa',etapaDestino,
    fecha:campos.fecha||hoy,resp:currentUser?.nombre||l.responsable||'',
    estado:'Realizada',nota:obs,
    ...(campos.interlocutor?{interlocutor:campos.interlocutor}:{}),
    ...(campos.valorEtapa!==undefined&&campos.valorEtapa!==''?{valorEtapa:campos.valorEtapa}:{}),
    ...(campos.contraoferta!==undefined&&campos.contraoferta!==''?{contraoferta:campos.contraoferta}:{}),
    ...(campos.motivoPerdida?{motivoPerdida:campos.motivoPerdida}:{}),
  };
  if(!l.acciones)l.acciones=[];
  l.acciones.push(accion);
  // Punto 5 — no pisar: cada etapa deja su propio valor en su propia
  // acción (ya quedó arriba); l.valor es solo el espejo del más reciente
  // para que la Lista/Pipeline no tengan que recorrer todo el historial.
  if(campos.valorEtapa!==undefined&&campos.valorEtapa!==''&&!isNaN(campos.valorEtapa))l.valor=campos.valorEtapa;
  if(etapaDestino==='Cerrado perdido'&&campos.motivoPerdida)l.motivoPerdida=campos.motivoPerdida;

  const proxFecha=$('ce-prox-fecha')?.value;
  if(proxFecha){
    l.acciones.push({
      tipo:$('ce-prox-tipo')?.value,fecha:new Date(proxFecha).toLocaleDateString('es-AR'),
      fechaVenc:$('ce-prox-fechavenc')?.value?new Date($('ce-prox-fechavenc').value).toLocaleDateString('es-AR'):'',
      resp:$('ce-prox-resp')?.value||l.responsable||'',estado:'Pendiente',nota:'',
    });
  }

  l.etapa=etapaDestino;
  supaSync('leads',l);
  cerrarModal('modal-cambio-etapa');
  _cambioEtapaPendiente=null;
  renderCRM();renderLeads();
  toast(`✓ ${l.empresa}: ${etapaAnterior} → ${etapaDestino}`);

  // Punto 4 — ganar el lead dispara el auto-create del cliente en borrador.
  if(etapaDestino==='Contrato')ofrecerCrearClienteDesdeLead(l);
}

// ---------- Ganar el lead → cliente en borrador (punto 4, enfoque híbrido) ----------
// Delta v1.2 (2.4.2) + v1.3 (1.1, "puerta única de clientes"): al ganar el
// lead (etapa Contrato) nace el cliente en Borrador, pre-cargado con los
// datos del lead. El guard por clienteBorradorId evita duplicar el cliente
// si el lead vuelve a pasar por acá (ej. reconciliación tras recarga).
function crearClienteBorradorDesdeLead(lead){
  if(lead.clienteBorradorId){
    const existente=DB.clientes.find(c=>c.id===lead.clienteBorradorId);
    if(existente)return existente;
  }
  const cliente={
    id:Date.now(),codigo:generarCodigoCliente(),
    razon:lead.empresa,nombre:lead.empresa,
    tipo:'',cuit:'',iva:'',arca:'',
    condPago:'',formaPago:'',
    responsable:lead.responsable||'',responsableTipo:'Interno',responsableContacto:'',
    codigoTango:'',estado:'Borrador',
    ciudad:'',direccion:lead.zona||'',
    logo:'',obs:`Creado automáticamente al ganar el lead en CRM (origen: ${lead.origen||'—'}).${lead.obs?' '+lead.obs:''}`,
    ingresosBrutos:'',jurisdiccionIibb:'',
    docReq:{seguros:false,monotributo:false,antecedentes:false,ddjjIva:false,pagoIva:false,remitoServicio:false,planillaHoras:false,oc:false},
    tipoContrato:'',factPor:'',periodoFact:'',productosEnFactura:'',reqOC:'',notasFact:'',
    contactos:lead.contacto?[{nombre:lead.contacto,rol:'',tel:'',mail:'',aSatisfacer:true}]:[],
  };
  DB.clientes.push(cliente);
  supaSync('clientes',cliente);
  lead.clienteBorradorId=cliente.id;
  supaSync('leads',lead);
  return cliente;
}
function ensureModalHibridoCliente(){
  if($('modal-hibrido-cliente'))return;
  const m=document.createElement('div');
  m.className='modal-overlay';
  m.id='modal-hibrido-cliente';
  m.innerHTML=`
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>🏢 ¡Lead ganado!</h3></div>
      <div class="modal-body"><p style="font-size:13px;color:var(--texto-suave);" id="hc-texto"></p></div>
      <div class="modal-footer" style="justify-content:space-between;">
        <button class="btn btn-secondary" onclick="completarClienteBorradorDespues()">Completar después</button>
        <button class="btn btn-primary" onclick="completarClienteBorradorAhora()">Completar ahora</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
let _clienteBorradorPendienteIdLocal=null;
function ofrecerCrearClienteDesdeLead(lead){
  const cliente=crearClienteBorradorDesdeLead(lead);
  if(!cliente)return;
  ensureModalHibridoCliente();
  _clienteBorradorPendienteIdLocal=idLocalTrunc(cliente.id);
  $('hc-texto').textContent=`Se creó el cliente "${cliente.nombre}" en estado Borrador con los datos del lead. ¿Completás la ficha ahora, o lo dejás pendiente en el ABM de Clientes para completarlo después?`;
  abrirModal('modal-hibrido-cliente');
  renderClientes(); // refresca el contador de borradores pendientes por si está visible
}
function completarClienteBorradorAhora(){
  const idl=_clienteBorradorPendienteIdLocal;
  cerrarModal('modal-hibrido-cliente');
  if(!idl)return;
  window.navTo('clientes');
  abrirModalCliente(idl);
}
function completarClienteBorradorDespues(){
  cerrarModal('modal-hibrido-cliente');
  toast('✓ Cliente en borrador — completalo cuando quieras desde Clientes');
}

function tabCrm(tab,btn){
  document.querySelectorAll('#screen-crm .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-crm .tab-btn').forEach(b=>b.classList.remove('active'));
  $('crm-tab-'+tab).classList.add('active');if(btn)btn.classList.add('active');
  if(tab==='pipeline') renderPipeline();
  if(tab==='leads') renderLeads();
  if(tab==='acciones'){renderAcciones();alertarAccionesVencidasModulo('crm');}
  if(tab==='estadisticas') renderStatsCRM();
}
function renderCRM(){
  verificarAccionesVencidas();
  const activos=DB.leads.filter(l=>l.etapa!=='Contrato'&&l.etapa!=='Cerrado perdido');
  const ganados=DB.leads.filter(l=>l.etapa==='Contrato');
  const perdidos=DB.leads.filter(l=>l.etapa==='Cerrado perdido');
  const valorPipeline=activos.reduce((s,l)=>s+(l.valor||0),0);
  const accionesPend=DB.leads.flatMap(l=>l.acciones||[]).filter(a=>a.estado==='Pendiente'||a.estado==='Vencida').length;
  $('st-crm-leads').textContent=activos.length;
  $('st-crm-ganados').textContent=ganados.length;
  $('st-crm-perdidos').textContent=perdidos.length;
  $('st-crm-valor').textContent='$'+Math.round(valorPipeline/1000)+'k';
  $('st-crm-acciones').textContent=accionesPend;
  renderPipeline();
}

// PIPELINE CON DRAG & DROP — Punto 8
// P.8 (Delta Comercial v1.2, confirmado bug de render en DELTA_crm_flujo_
// leads_v1): a las tarjetas les faltaba el "<div ...>" de apertura — el
// template literal empezaba directo por los atributos, así que el browser
// mostraba ese texto crudo (style="...", ondragstart="...") en vez de
// interpretarlo como HTML. Además la tarjeta nunca mostró más que el
// avatar — sin empresa, contacto ni valor. Se corrige acá y se le agrega
// contenido real.
function renderPipeline(){
  const board=$('pipeline-board');if(!board)return;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  board.innerHTML=DB.etapasCRM.map(etapa=>{
    const leadsEtapa=DB.leads.filter(l=>l.etapa===etapa);
    const valorEtapa=leadsEtapa.reduce((s,l)=>s+(l.valor||0),0);
    const col=DB.colorEtapasCRM[etapa]||'var(--azul)';
    return `<div class="pipeline-col" data-etapa="${etapa}" style="width:220px;flex-shrink:0;"
        ondragover="event.preventDefault();this.style.outline='2px dashed var(--azul)'"
        ondragleave="this.style.outline=''"
        ondrop="dropLead(event,'${etapa}')">
      <div style="background:${col};color:white;border-radius:var(--radio-lg) var(--radio-lg) 0 0;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:700;font-size:13px;">${etapa}</span>
        <span style="background:rgba(255,255,255,.2);border-radius:20px;padding:2px 8px;font-size:11px;">${leadsEtapa.length}</span>
      </div>
      <div style="background:white;border:1px solid var(--borde);border-top:none;border-radius:0 0 var(--radio-lg) var(--radio-lg);padding:10px;min-height:160px;display:flex;flex-direction:column;gap:8px;">
        ${valorEtapa>0?`<div style="font-size:11px;font-weight:600;color:${col};text-align:right;margin-bottom:2px;">$${Math.round(valorEtapa/1000)}k</div>`:''}
        ${leadsEtapa.map(l=>{
          const proxAcc=(l.acciones||[]).find(a=>a.estado==='Pendiente'||a.estado==='Vencida');
          return `<div draggable="true"
               style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px;cursor:grab;"
               ondragstart="dragLead(event,${l.id})"
               onclick="verLead(${DB.leads.indexOf(l)})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
              <div style="font-weight:600;font-size:12px;">${l.empresa}</div>
              ${avatarEl(l.responsable,22)}
            </div>
            <div style="font-size:11px;color:var(--texto-suave);margin-top:2px;">${l.contacto||'—'}</div>
            <div style="font-size:12px;font-weight:700;color:var(--azul);margin-top:4px;">$${Math.round((l.valor||0)/1000)}k/mes</div>
            ${proxAcc?`<div style="font-size:10px;color:${proxAcc.estado==='Vencida'?'var(--rojo)':'var(--naranja)'};margin-top:4px;">${proxAcc.estado==='Vencida'?'⚠️ ':'⏰ '}${proxAcc.tipo} ${proxAcc.fecha}</div>`:''}
          </div>`;
        }).join('')||`<div style="text-align:center;padding:20px 0;font-size:12px;color:var(--texto-muy-suave);">Sin leads</div>`}
      </div>
    </div>`;
  }).join('');
}
let dragLeadId=null;
function dragLead(e,id){dragLeadId=id;e.dataTransfer.effectAllowed='move';}
// Punto 1 del delta: avanzar de etapa (arrastrando O con botón) SIEMPRE
// abre la ventana de cambio de etapa — nunca se muta en silencio. Si se
// suelta sobre la misma columna, o se cancela la ventana, no pasa nada:
// como nunca se tocó DB.leads, el próximo render deja la tarjeta donde
// estaba.
function dropLead(e,nuevaEtapa){
  e.preventDefault();
  document.querySelectorAll('.pipeline-col').forEach(c=>c.style.outline='');
  const lead=DB.leads.find(l=>l.id===dragLeadId);
  dragLeadId=null;
  if(!lead||lead.etapa===nuevaEtapa)return;
  abrirModalCambioEtapa(DB.leads.indexOf(lead),nuevaEtapa);
}

function renderLeads(lista){
  const rows=lista||DB.leads;
  const tbody=$('tbody-leads');if(!tbody)return;
  tbody.innerHTML=rows.map((l,i)=>{
    const ultimaAcc=(l.acciones||[]).filter(a=>a.estado==='Realizada').slice(-1)[0];
    const proxAcc=(l.acciones||[]).find(a=>a.estado==='Pendiente');
    const col=DB.colorEtapasCRM[l.etapa]||'#94a3b8';
    return `<tr>
      <td><div style="font-weight:500;">${l.empresa}</div><div style="font-size:11px;color:var(--texto-suave);">${l.contacto}</div></td>
      <td><span class="chip" style="font-size:11px;">${l.tipo}</span></td>
      <td style="font-size:12px;">${l.zona}</td>
      <td style="font-weight:700;color:var(--azul);">$${(l.valor/1000).toFixed(0)}k/mes</td>
      <td><span class="badge" style="background:${col};color:white;font-size:10px;">${l.etapa}</span></td>
      <td style="font-size:12px;">${l.responsable}</td>
      <td style="font-size:11px;color:var(--texto-suave);">${ultimaAcc?ultimaAcc.tipo+' — '+ultimaAcc.fecha:'—'}</td>
      <td style="font-size:11px;color:${proxAcc?'var(--naranja)':'var(--texto-muy-suave)'};">${proxAcc?proxAcc.tipo+' '+proxAcc.fecha:'—'}</td>
      <td>
        <div style="display:flex;gap:3px;">
          <button class="btn btn-secondary btn-xs" onclick="verLead(${i})">Ver</button>
          ${l.etapa!=='Contrato'&&l.etapa!=='Cerrado perdido'?`<button class="btn btn-primary btn-xs" onclick="avanzarEtapa(${i})" title="Avanzar de etapa">→</button>
          <button class="btn btn-danger btn-xs" onclick="marcarLeadPerdido(${i})" title="Marcar como perdido">✕</button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('')||`<tr><td colspan="9"><div class="empty-state"><div class="icon">🎯</div><p>Sin leads</p></div></td></tr>`;
}
function filtrarLeads(){
  const bg=($('buscar-lead')||{value:''}).value.toLowerCase();
  const et=($('cf-lead-etapa')||{value:''}).value;
  const resp=($('cf-lead-resp')||{value:''}).value;
  renderLeads(DB.leads.filter(l=>(!bg||l.empresa.toLowerCase().includes(bg))&&(!et||l.etapa===et)&&(!resp||l.responsable===resp)));
}
function renderAcciones(lista){
  verificarAccionesVencidas();
  const todasAcciones=DB.leads.flatMap(l=>(l.acciones||[]).map(a=>({...a,lead:l.empresa,leadIdx:DB.leads.indexOf(l)})));
  const rows=lista||todasAcciones;
  const tbody=$('tbody-acciones');if(!tbody)return;
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const estadoColor={'Pendiente':'badge-acento','Realizada':'badge-verde','Vencida':'badge-rojo'};
  // Actualizar header para incluir Fecha límite
  const thead=tbody.closest('table')?.querySelector('thead tr');
  if(thead&&!thead.querySelector('.th-fechalim')){
    const th=document.createElement('th');
    th.className='th-fechalim';th.textContent='Fecha límite';
    thead.insertBefore(th,thead.children[5]);
  }
  tbody.innerHTML=rows.map((a,i)=>{
    const esVencida=a.estado==='Vencida';
    const rowBg=esVencida?'background:rgba(229,62,62,.06);':'';
    // Días restantes para fecha límite
    let labelFechaVenc='—';
    if(a.fechaVenc&&a.estado==='Pendiente'){
      const[dd,mm,yy]=a.fechaVenc.split('/');
      const fv=new Date(`${yy}-${mm}-${dd}`);
      const dias=Math.ceil((fv-hoy)/(1000*3600*24));
      if(dias<0) labelFechaVenc=`<span style="color:var(--rojo);font-weight:700;">⚠️ Vencida hace ${Math.abs(dias)}d</span>`;
      else if(dias===0) labelFechaVenc=`<span style="color:var(--rojo);font-weight:700;">⚠️ Vence HOY</span>`;
      else if(dias<=3) labelFechaVenc=`<span style="color:var(--naranja);font-weight:600;">⚡ En ${dias}d</span>`;
      else labelFechaVenc=`<span style="font-size:11px;color:var(--texto-suave);">${a.fechaVenc}</span>`;
    } else if(a.fechaVenc){
      labelFechaVenc=`<span style="font-size:11px;color:var(--texto-muy-suave);">${a.fechaVenc}</span>`;
    }
    return `<tr style="${rowBg}">
      <td style="font-size:12px;">${a.fecha}</td>
      <td><span class="chip" style="font-size:11px;">${a.tipo}</span></td>
      <td style="font-weight:500;">${a.lead}</td>
      <td style="font-size:12px;max-width:180px;">${a.nota||'—'}</td>
      <td style="font-size:12px;">${a.resp||'—'}</td>
      <td>${labelFechaVenc}</td>
      <td>
        <span class="badge ${estadoColor[a.estado]||'badge-gris'}">${a.estado}</span>
        ${esVencida?`<div style="font-size:10px;color:var(--rojo);margin-top:3px;">¡Contactar urgente!</div>`:''}
      </td>
      <td>${a.estado==='Pendiente'||esVencida?
        `<button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="marcarAccionRealizada(${a.leadIdx},'${a.fecha}','${a.tipo}')">✓</button>`
        :'—'}</td>
    </tr>`;
  }).join('')||`<tr><td colspan="8"><div class="empty-state"><div class="icon">⚡</div><p>Sin acciones</p></div></td></tr>`;
}
function filtrarAcciones(){
  const est=($('cf-acc-estado')||{value:''}).value;
  const tipo=($('cf-acc-tipo')||{value:''}).value;
  const todasAcciones=DB.leads.flatMap(l=>(l.acciones||[]).map(a=>({...a,lead:l.empresa,leadIdx:DB.leads.indexOf(l)})));
  renderAcciones(todasAcciones.filter(a=>(!est||a.estado===est)&&(!tipo||a.tipo===tipo)));
}
function marcarAccionRealizada(leadIdx,fecha,tipo){
  const lead=DB.leads[leadIdx];
  const acc=lead?.acciones?.find(a=>a.fecha===fecha&&a.tipo===tipo);
  if(acc){acc.estado='Realizada';renderAcciones();toast('✓ Acción marcada como realizada');}
}
// Punto 1 del delta: avanzar (con este botón O arrastrando en el pipeline)
// SIEMPRE abre la ventana de cambio de etapa — nunca se muta en silencio.
// "Contrato" y "Cerrado perdido" son terminales: no hay "siguiente" natural
// desde ahí (evita el bug que tenía antes de re-ofrecer avanzar un lead ya
// ganado directo a "perdido" solo porque era el último ítem del array).
function avanzarEtapa(idx){
  const l=DB.leads[idx];
  const etapas=DB.etapasCRM;
  const i=etapas.indexOf(l.etapa);
  const siguiente=etapas[i+1];
  if(!siguiente||siguiente==='Cerrado perdido')return;
  abrirModalCambioEtapa(idx,siguiente);
}
function marcarLeadPerdido(idx){
  abrirModalCambioEtapa(idx,'Cerrado perdido');
}
function verLead(idx){
  const l=DB.leads[idx];
  const col=DB.colorEtapasCRM[l.etapa]||'var(--azul)';
  const html=`<div style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
      <div><div style="font-size:17px;font-weight:700;">${l.empresa}</div>
      <div style="font-size:12px;color:var(--texto-suave);">${l.contacto} · ${l.zona}</div></div>
      <span class="badge" style="background:${col};color:white;">${l.etapa}</span>
    </div>
  </div>
  <div class="info-grid" style="margin-bottom:14px;">
    <div class="info-item"><div class="key">Tipo</div><div class="val">${l.tipo}</div></div>
    <div class="info-item"><div class="key">Valor estimado</div><div class="val" style="font-weight:700;color:var(--azul);">$${(l.valor/1000).toFixed(0)}k/mes</div></div>
    <div class="info-item"><div class="key">Responsable</div><div class="val">${l.responsable}</div></div>
    <div class="info-item"><div class="key">Origen</div><div class="val">${l.origen}</div></div>
  </div>
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Historial de acciones</div>
  <div style="display:flex;flex-direction:column;gap:6px;">
    ${(l.acciones||[]).slice().reverse().map(a=>`<div style="padding:8px 12px;background:${a.estado==='Pendiente'?'var(--acento-suave)':'var(--fondo)'};border-radius:var(--radio);border:1px solid ${a.estado==='Pendiente'?'#e6c84a':'var(--borde)'};">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:600;font-size:12px;">${a.tipo}${a.etapaDestino?' → '+a.etapaDestino:''} <span style="font-weight:400;color:var(--texto-suave);">— ${a.fecha||'—'}</span></div>
        <span class="badge ${a.estado==='Pendiente'?'badge-acento':a.estado==='Vencida'?'badge-rojo':'badge-verde'}" style="font-size:10px;">${a.estado}</span>
      </div>
      ${a.resp?`<div style="font-size:11px;color:var(--texto-suave);margin-top:2px;">Responsable: ${a.resp}</div>`:''}
      ${_camposEtapaTexto(a)}
      ${a.nota?`<div style="font-size:12px;margin-top:4px;">${a.nota}</div>`:''}
      ${a.fechaVenc?`<div style="font-size:10px;color:var(--texto-muy-suave);margin-top:4px;">📅 Vence: ${a.fechaVenc}</div>`:''}
    </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin acciones</p>'}
  </div>`;
  $('pedido-title').textContent=`🎯 ${l.empresa}`;
  $('pedido-body').innerHTML=html;
  abrirModal('modal-ver-pedido');
}
// Formatea los campos estructurados propios de la etapa que haya guardado
// una acción de "Cambio de etapa" (punto 2 del delta) — usado en el
// historial del lead (verLead) y en Acciones.
function _camposEtapaTexto(a){
  const partes=[];
  if(a.interlocutor)partes.push(`Interlocutor: ${a.interlocutor}`);
  if(a.valorEtapa!==undefined&&a.valorEtapa!==null&&a.valorEtapa!=='')partes.push(`Valor: $${Number(a.valorEtapa).toLocaleString('es-AR')}/mes`);
  if(a.contraoferta!==undefined&&a.contraoferta!==null&&a.contraoferta!=='')partes.push(`Contraoferta del cliente: $${Number(a.contraoferta).toLocaleString('es-AR')}/mes`);
  if(a.motivoPerdida)partes.push(`Motivo: ${a.motivoPerdida}`);
  if(a.retroactivo)partes.push(`📝 Cargado retroactivamente`);
  return partes.length?`<div style="font-size:11px;color:var(--texto-suave);margin-top:2px;">${partes.join(' · ')}</div>`:'';
}
function renderStatsCRM(){
  const barras=(el,datos,total,col='var(--azul)')=>{if(!$(el))return;$(el).innerHTML=datos.map(([k,v])=>`<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span>${k}</span><strong>${v}</strong></div><div style="height:8px;background:var(--borde);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${total?Math.round(v/total*100):0}%;background:${col};border-radius:4px;"></div></div></div>`).join('');};
  const porEtapa=DB.etapasCRM.map(e=>[e,DB.leads.filter(l=>l.etapa===e).length]);
  barras('crm-stats-etapas',porEtapa,DB.leads.length);
  const resp=[...new Set(DB.leads.map(l=>l.responsable))];
  barras('crm-stats-resp',resp.map(r=>[r,DB.leads.filter(l=>l.responsable===r).length]),DB.leads.length);
  const tipos=[...new Set(DB.leads.map(l=>l.tipo))];
  barras('crm-stats-tipo',tipos.map(t=>[t,DB.leads.filter(l=>l.tipo===t).length]),DB.leads.length);
  const gan=DB.leads.filter(l=>l.etapa==='Contrato').length;
  const perd=DB.leads.filter(l=>l.etapa==='Cerrado perdido').length;
  const total=gan+perd;
  const tasa=total?Math.round(gan/total*100):0;
  const convEl=$('crm-stats-conv');
  if(convEl) convEl.innerHTML=`<div style="text-align:center;padding:20px;">
    <div style="font-size:48px;font-weight:800;color:${tasa>=50?'var(--verde)':'var(--naranja)'};">${tasa}%</div>
    <div style="font-size:13px;color:var(--texto-suave);margin-top:6px;">${gan} ganados de ${total} cerrados</div>
  </div>`;
}
// Punto 3 del delta: registrar un lead directo en una etapa avanzada
// (ej. ya hubo reunión y propuesta en la vida real antes de cargarlo acá).
// Recorre las etapas entre "Primer contacto" y la elegida (inclusive);
// cada una que tenga algún campo cargado en el bloque "retro-<slug>" deja
// su propia acción retroactiva — lo no completado queda vacío, no bloquea
// el guardado (ver actualizarHistoriaRetroLead, que arma esos bloques).
// El botón "+ Nuevo lead" abría el modal directo (abrirModal('modal-lead')),
// sin resetear nada — arrastraba valores de la carga anterior. Como la
// sección de historia retroactiva (punto 3) depende de la etapa elegida,
// hace falta arrancar en un estado conocido para que no quede desalineada.
function abrirNuevoLead(){
  if($('lead-etapa'))$('lead-etapa').value='Prospecto';
  actualizarHistoriaRetroLead();
  abrirModal('modal-lead');
}
function guardarLead(){
  const empresa=$('lead-empresa')?.value.trim();
  if(!empresa){toast('Ingresá la empresa');return;}
  const acc={tipo:$('lead-acc-tipo')?.value,fecha:$('lead-acc-fecha')?.value?new Date($('lead-acc-fecha').value).toLocaleDateString('es-AR'):'',fechaVenc:$('lead-acc-fechavenc')?.value?new Date($('lead-acc-fechavenc').value).toLocaleDateString('es-AR'):'',resp:$('lead-acc-resp')?.value,estado:'Pendiente',nota:''};

  const etapaElegida=$('lead-etapa')?.value||'Prospecto';
  const etapas=DB.etapasCRM;
  const idxElegida=etapas.indexOf(etapaElegida);
  const idxPrimerContacto=etapas.indexOf('Primer contacto');
  const accionesRetro=[];
  let valorRetroFinal;
  if(idxElegida>=idxPrimerContacto&&idxPrimerContacto>=0){
    etapas.slice(idxPrimerContacto,idxElegida+1).forEach(e=>{
      if(!crmCamposDeEtapa(e).length)return;
      const prefix='retro-'+_slugEtapa(e);
      const valores=crmLeerCampos(e,prefix);
      const tieneAlgo=Object.values(valores).some(v=>v!==''&&v!==undefined);
      if(!tieneAlgo)return;
      accionesRetro.push({
        tipo:'Cambio de etapa',etapaDestino:e,
        fecha:valores.fecha||'',resp:$('lead-responsable')?.value||'',
        estado:'Realizada',nota:'',retroactivo:true,
        ...(valores.interlocutor?{interlocutor:valores.interlocutor}:{}),
        ...(valores.valorEtapa!==undefined&&valores.valorEtapa!==''?{valorEtapa:valores.valorEtapa}:{}),
        ...(valores.contraoferta!==undefined&&valores.contraoferta!==''?{contraoferta:valores.contraoferta}:{}),
        ...(valores.motivoPerdida?{motivoPerdida:valores.motivoPerdida}:{}),
      });
      if(valores.valorEtapa!==undefined&&valores.valorEtapa!=='')valorRetroFinal=valores.valorEtapa;
    });
  }

  // Punto 5 — no pisar: si cargaron "Valor estimado" a mano se respeta ese
  // número; si no, el valor "actual" del lead arranca en el último valor
  // retroactivo cargado (el más avanzado en el tiempo).
  const valorManual=parseFloat($('lead-valor')?.value);
  const nuevo={
    id:Date.now(),empresa,contacto:$('lead-contacto')?.value,tipo:$('lead-tipo')?.value,zona:$('lead-zona')?.value,
    valor:!isNaN(valorManual)?valorManual:(valorRetroFinal||0),
    etapa:etapaElegida,responsable:$('lead-responsable')?.value,origen:$('lead-origen')?.value,obs:$('lead-obs')?.value,
    acciones:[...accionesRetro,...(acc.fecha?[acc]:[])],
  };
  DB.leads.push(nuevo);
  cerrarModal('modal-lead');renderCRM();construirMenu();supaSync('leads',nuevo);
  toast('✓ Lead guardado'+(accionesRetro.length?` — ${accionesRetro.length} etapa(s) retroactiva(s) registradas`:''));

  // Punto 4 — si ya nace ganado (carga retroactiva hasta Contrato), dispara
  // el mismo auto-create de cliente en borrador que el avance normal.
  if(etapaElegida==='Contrato')ofrecerCrearClienteDesdeLead(nuevo);
}
// Arma dinámicamente los bloques "retro-<slug>" del punto 3 según la etapa
// elegida en el select — se llama por onchange desde el modal Nuevo lead.
function actualizarHistoriaRetroLead(){
  const etapa=$('lead-etapa')?.value||'Prospecto';
  const cont=$('lead-historia-retro');
  if(!cont)return;
  const etapas=DB.etapasCRM;
  const idxElegida=etapas.indexOf(etapa);
  const idxPrimerContacto=etapas.indexOf('Primer contacto');
  if(idxElegida<idxPrimerContacto){cont.innerHTML='';return;}
  const recorrido=etapas.slice(idxPrimerContacto,idxElegida+1).filter(e=>crmCamposDeEtapa(e).length);
  if(!recorrido.length){cont.innerHTML='';return;}
  cont.innerHTML=`
    <div class="form-section">Historia retroactiva (opcional) — completá lo que sepas, salteá el resto</div>
    ${recorrido.map(e=>`
      <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px;">${e}</div>
        <div class="form-grid form-grid-2">${crmCamposHtml(e,'retro-'+_slugEtapa(e))}</div>
      </div>`).join('')}`;
}

// ========== RECLAMOS — Punto 9: stats con tiempo respuesta + IA ==========
function tabReclamos(tab,btn){
  document.querySelectorAll('#screen-reclamos .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-reclamos .tab-btn').forEach(b=>b.classList.remove('active'));
  $('rec-tab-'+tab).classList.add('active');if(btn)btn.classList.add('active');
  if(tab==='stats') renderStatsReclamos();
  if(tab==='nc') renderNC();
}
function renderReclamos(lista){
  const rows=lista||DB.reclamos;
  $('st-rec-abiertos').textContent=DB.reclamos.filter(r=>r.estado==='Abierto').length;
  $('st-rec-tratamiento').textContent=DB.reclamos.filter(r=>r.estado==='En tratamiento').length;
  $('st-rec-cerrados').textContent=DB.reclamos.filter(r=>r.estado==='Cerrado').length;
  $('st-rec-nc').textContent=DB.noConformidades.length;
  const getCliente=id=>DB.clientes.find(c=>c.id===id);
  const priCol={'Baja':'badge-gris','Media':'badge-acento','Alta':'badge-naranja','Urgente':'badge-rojo'};
  $('tbody-reclamos').innerHTML=rows.map((r,i)=>`<tr>
    <td style="font-size:12px;">${r.fecha}</td>
    <td><div style="font-weight:500;font-size:12px;">${getCliente(r.clienteId)?.nombre||'—'}</div><div style="font-size:10px;color:var(--texto-suave);">${r.objetivoCod}</div></td>
    <td><span class="chip" style="font-size:11px;">${r.tipo}</span></td>
    <td style="font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.desc}</td>
    <td style="font-size:12px;">${r.iniciador}</td>
    <td style="font-size:12px;">${r.responsable}</td>
    <td><span class="badge ${priCol[r.prioridad]||'badge-gris'}">${r.prioridad}</span></td>
    <td>${badge(r.estado==='Cerrado'?'Activo':r.estado==='En tratamiento'?'En proceso':'No asistió')}<span style="font-size:10px;display:block;">${r.estado}</span></td>
    <td style="font-size:11px;">${r.nc?`<span class="badge badge-azul">${r.nc}</span>`:'—'}</td>
    <td>
      <div style="display:flex;gap:3px;">
        ${r.estado!=='Cerrado'?`<button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="cerrarReclamo(${i})">✓</button>`:''}
        <button class="btn btn-secondary btn-xs" onclick="verReclamo(${i})">Ver</button>
      </div>
    </td>
  </tr>`).join('')||`<tr><td colspan="10"><div class="empty-state"><div class="icon">📣</div><p>Sin reclamos registrados</p></div></td></tr>`;
}
function filtrarReclamos(){
  const tipo=($('cf-rec-tipo')||{value:''}).value;
  const est=($('cf-rec-estado')||{value:''}).value;
  const bg=($('buscar-reclamo')||{value:''}).value.toLowerCase();
  renderReclamos(DB.reclamos.filter(r=>(!tipo||r.tipo===tipo)&&(!est||r.estado===est)&&(!bg||r.desc.toLowerCase().includes(bg)||r.objetivoCod.toLowerCase().includes(bg))));
}
function cerrarReclamo(idx){
  DB.reclamos[idx].estado='Cerrado';
  DB.reclamos[idx].fechaCierre=new Date().toLocaleDateString('es-AR');
  renderReclamos();construirMenu();toast('✓ Reclamo cerrado');
}
function verReclamo(idx){
  const r=DB.reclamos[idx];const cli=DB.clientes.find(c=>c.id===r.clienteId);
  const tiempoResp=r.fechaCierre?calcularDiasEntre(r.fecha,r.fechaCierre)+' días':'En curso';
  const html=`<div class="info-grid">
    <div class="info-item"><div class="key">Cliente</div><div class="val">${cli?.nombre||'—'}</div></div>
    <div class="info-item"><div class="key">Objetivo</div><div class="val">${r.objetivoCod}</div></div>
    <div class="info-item"><div class="key">Tipo</div><div class="val">${r.tipo}</div></div>
    <div class="info-item"><div class="key">Prioridad</div><div class="val">${r.prioridad}</div></div>
    <div class="info-item"><div class="key">Iniciado por</div><div class="val">${r.iniciador}</div></div>
    <div class="info-item"><div class="key">Responsable</div><div class="val">${r.responsable}</div></div>
    <div class="info-item"><div class="key">Estado</div><div class="val">${r.estado}</div></div>
    <div class="info-item"><div class="key">Tiempo de respuesta</div><div class="val" style="font-weight:600;color:var(--azul);">${tiempoResp}</div></div>
    ${r.nc?`<div class="info-item"><div class="key">NC vinculada</div><div class="val"><span class="badge badge-azul">${r.nc}</span></div></div>`:''}
  </div>
  <div style="margin-top:12px;"><strong>Descripción:</strong><p style="font-size:13px;color:var(--texto-suave);margin-top:4px;">${r.desc}</p></div>
  ${r.tratamiento?`<div style="margin-top:8px;"><strong>Tratamiento:</strong><p style="font-size:13px;color:var(--texto-suave);margin-top:4px;">${r.tratamiento}</p></div>`:''}`;
  $('pedido-title').textContent=`📣 Reclamo — ${cli?.nombre||'—'}`;
  $('pedido-body').innerHTML=html;
  abrirModal('modal-ver-pedido');
}
function guardarReclamo(){
  const desc=$('rec-desc')?.value.trim();if(!desc){toast('Ingresá la descripción');return;}
  const cliId=parseInt($('rec-cliente')?.value)||0;
  const generaNC=$('rec-genera-nc')?.value==='Sí';
  const nroNC=generaNC?'NC-'+new Date().getFullYear()+'-'+String(DB.noConformidades.length+1).padStart(3,'0'):'';
  const nuevo={id:Date.now(),clienteId:cliId,objetivoCod:$('rec-objetivo')?.value||'—',tipo:$('rec-tipo')?.value,prioridad:$('rec-prioridad')?.value,iniciador:$('rec-iniciador')?.value,desc,responsable:$('rec-responsable')?.value,estado:'Abierto',fecha:new Date().toLocaleDateString('es-AR'),fechaCierre:'',generaNC,nc:nroNC,tratamiento:''};
  DB.reclamos.push(nuevo);
  // 2.5.1 (Delta Comercial v1.2): la NC se vincula al reclamo por
  // reclamoId en vez de copiarle la descripción — antes quedaban dos
  // textos independientes que podían divergir si alguno se editaba.
  // renderNC() resuelve la descripción en vivo desde el reclamo vinculado.
  if(generaNC) DB.noConformidades.push({id:Date.now(),nro:nroNC,fecha:new Date().toLocaleDateString('es-AR'),origen:'Reclamo externo',reclamoId:nuevo.id,causaRaiz:'',tratamiento:'',responsable:nuevo.responsable,fechaCierre:'',estado:'Abierta'});
  supaSync('reclamos', DB.reclamos[DB.reclamos.length-1]); cerrarModal('modal-reclamo');renderReclamos();construirMenu();toast('✓ Reclamo registrado'+(generaNC?' — NC generada':''));
}
function analizarReclamosIA(){
  const porTipo={};DB.reclamos.forEach(r=>{porTipo[r.tipo]=(porTipo[r.tipo]||0)+1;});
  const masFrec=Object.entries(porTipo).sort((a,b)=>b[1]-a[1])[0];
  const cerrados=DB.reclamos.filter(r=>r.estado==='Cerrado'&&r.fechaCierre);
  const tiempoPromedio=cerrados.length?Math.round(cerrados.reduce((s,r)=>s+calcularDiasEntre(r.fecha,r.fechaCierre),0)/cerrados.length):0;
  const pctCerrado=DB.reclamos.length?Math.round(cerrados.length/DB.reclamos.length*100):0;
  toast(`🤖 Análisis IA: "${masFrec?masFrec[0]:'—'}" es el tipo más frecuente. Tiempo promedio de cierre: ${tiempoPromedio} días. Tasa resolución: ${pctCerrado}%. Principales factores: personal insuficiente (${Math.round(DB.reclamos.filter(r=>r.tipo==='Falta de personal').length/Math.max(DB.reclamos.length,1)*100)}%) y calidad del servicio (${Math.round(DB.reclamos.filter(r=>r.tipo==='Calidad del servicio').length/Math.max(DB.reclamos.length,1)*100)}%).`,8000);
}
function renderNC(){
  $('tbody-nc').innerHTML=DB.noConformidades.map((nc,i)=>{
    // 2.5.1: si la NC viene de un reclamo, la descripción se lee del
    // reclamo vinculado (no se duplica texto entre los dos registros).
    const reclamoVinculado=nc.reclamoId?DB.reclamos.find(r=>r.id===nc.reclamoId):null;
    const desc=reclamoVinculado?reclamoVinculado.desc:(nc.desc||'—');
    return `<tr>
    <td><span class="badge badge-azul">${nc.nro}</span></td>
    <td style="font-size:12px;">${nc.fecha}</td>
    <td style="font-size:12px;">${nc.origen}</td>
    <td style="font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${desc}</td>
    <td style="font-size:12px;">${nc.causaRaiz||'—'}</td>
    <td style="font-size:12px;">${nc.tratamiento||'—'}</td>
    <td style="font-size:12px;">${nc.responsable}</td>
    <td style="font-size:12px;">${nc.fechaCierre||'—'}</td>
    <td>${badge(nc.estado==='Cerrada'?'Activo':'Pendiente')}<span style="font-size:10px;display:block;">${nc.estado}</span></td>
    <td>${nc.estado==='Abierta'?`<button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="cerrarNC(${i})">✓</button>`:'—'}</td>
  </tr>`;
  }).join('')||`<tr><td colspan="10"><div class="empty-state"><div class="icon">📋</div><p>Sin no conformidades</p></div></td></tr>`;
}
function cerrarNC(idx){DB.noConformidades[idx].estado='Cerrada';DB.noConformidades[idx].fechaCierre=new Date().toLocaleDateString('es-AR');renderNC();toast('✓ NC cerrada');}
function renderStatsReclamos(){
  const barras=(el,datos,total,col='var(--rojo)')=>{if(!$(el))return;$(el).innerHTML=datos.map(([k,v])=>`<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span>${k}</span><strong>${v}</strong></div><div style="height:8px;background:var(--borde);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${total?Math.round(v/total*100):0}%;background:${col};border-radius:4px;"></div></div></div>`).join('');};
  const porTipo=DB.tiposReclamo.map(t=>[t,DB.reclamos.filter(r=>r.tipo===t).length]).filter(([,v])=>v>0);
  barras('rec-stats-tipo',porTipo,DB.reclamos.length);
  const porCli=DB.clientes.map(c=>[c.nombre,DB.reclamos.filter(r=>r.clienteId===c.id).length]).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  barras('rec-stats-cliente',porCli,DB.reclamos.length);
}

// ========== CONFIGURACIÓN VENTAS (ABMs) ==========
DB.condicionesIVA=['Responsable inscripto','Monotributista','Exento','Consumidor final','No responsable'];
DB.condicionesPago=['30 días','45 días','60 días','90 días','A 30/60 días','Contado','15 días','A 30/60/90 días'];
DB.formasPago=['Transferencia','Cheque físico','E-cheq','Transferencia programada','Efectivo'];
DB.modelosPrecio=['Abono mensual fijo','Por EFT','Por horas variables'];
DB.periodosFacturacion=['Del 1 al último del mes','Del 21 al 20','Del 26 al 25','Del 16 al 15','Otro'];
DB.rolesResponsables=['Gerente general','Gerente de operaciones','Gerente de sucursal','Jefe de seguridad','Jefe de servicios','Encargado','Contacto de cobros','Contacto de facturación','Otro'];
DB.tiposAccionCRM=['Llamada','Reunión','Email','Visita','Propuesta','Seguimiento','Demo','Prueba piloto'];
DB.tiposAccionCobro=['Llamada','Email','WhatsApp','Visita presencial','Nota de deuda','Carta documento','Negociación de plan'];

function renderCfgComercialLista(dbKey,elId){
  const el=$(elId);if(!el)return;
  const items=DB[dbKey]||[];
  el.innerHTML=items.map((item,i)=>`<div class="config-item">
    <span style="font-size:13px;">${item}</span>
    <button class="btn btn-danger btn-xs" onclick="eliminarCfgComercial('${dbKey}',${i},'${elId}')">Eliminar</button>
  </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin ítems cargados</p>';
}
function agregarCfgComercial(dbKey,inputId,elId){
  const val=$(inputId)?.value.trim();
  if(!val){toast('Ingresá el valor');return;}
  if(!DB[dbKey]) DB[dbKey]=[];
  if(DB[dbKey].includes(val)){toast('Ya existe');return;}
  DB[dbKey].push(val);
  $(inputId).value='';
  renderCfgComercialLista(dbKey,elId);
  poblarSelectsComercial();
  toast(`✓ "${val}" agregado`);
}
function eliminarCfgComercial(dbKey,idx,elId){
  DB[dbKey].splice(idx,1);
  renderCfgComercialLista(dbKey,elId);
  poblarSelectsComercial();
}
function agregarEtapaCRM(){
  const nombre=$('nueva-etapa-crm')?.value.trim();
  const color=$('color-etapa-crm')?.value||'#3b82f6';
  if(!nombre){toast('Ingresá el nombre de la etapa');return;}
  if(DB.etapasCRM.includes(nombre)){toast('Ya existe esa etapa');return;}
  // Insertar antes de Cerrado perdido (única etapa terminal que queda al
  // final del array — "Contrato" ya es terminal-ganada pero es una etapa
  // "normal" del recorrido, no hace falta insertar antes de ella).
  const idx=DB.etapasCRM.indexOf('Cerrado perdido');
  if(idx>=0) DB.etapasCRM.splice(idx,0,nombre);
  else DB.etapasCRM.push(nombre);
  DB.colorEtapasCRM[nombre]=color;
  $('nueva-etapa-crm').value='';
  renderCfgEtapasCRM();
  poblarSelectsComercial();
  toast(`✓ Etapa "${nombre}" agregada`);
}
function renderCfgEtapasCRM(){
  const el=$('lista-etapas-crm');if(!el)return;
  el.innerHTML=DB.etapasCRM.map((e,i)=>`<div class="config-item">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:14px;height:14px;border-radius:3px;background:${DB.colorEtapasCRM[e]||'var(--azul)'};flex-shrink:0;"></div>
      <span style="font-size:13px;">${e}</span>
    </div>
    <button class="btn btn-danger btn-xs" onclick="eliminarEtapaCRM(${i})">Eliminar</button>
  </div>`).join('');
}
function eliminarEtapaCRM(idx){
  const etapa=DB.etapasCRM[idx];
  if(DB.leads.some(l=>l.etapa===etapa)){toast(`⚠️ No se puede eliminar — hay leads en "${etapa}"`);return;}
  delete DB.colorEtapasCRM[etapa];
  DB.etapasCRM.splice(idx,1);
  renderCfgEtapasCRM();poblarSelectsComercial();renderCRM();
  toast(`Etapa "${etapa}" eliminada`);
}
function renderConfigComercial(){
  renderCfgComercialLista('tiposServicio','lista-tipos-servicio');
  renderCfgComercialLista('tiposCliente','lista-tipos-cliente');
  renderCfgComercialLista('tiposSitio','lista-tipos-sitio');
  renderCfgComercialLista('categoriasArca','lista-categorias-arca');
  renderCfgComercialLista('motivosBajaObjetivo','lista-motivos-baja-obj');
  renderCfgComercialLista('condicionesIVA','lista-cond-iva');
  renderCfgComercialLista('condicionesPago','lista-cond-pago');
  renderCfgComercialLista('formasPago','lista-formas-pago');
  renderCfgComercialLista('modelosPrecio','lista-modelos-precio');
  renderCfgComercialLista('periodosFacturacion','lista-periodos-fact');
  renderCfgComercialLista('rolesResponsables','lista-roles-resp');
  renderCfgEtapasCRM();
  renderCfgComercialLista('tiposAccionCRM','lista-acciones-crm');
  renderCfgComercialLista('motivosPerdidaCRM','lista-motivos-perdida-crm');
  renderCfgComercialLista('tiposReclamo','lista-tipos-reclamo-cfg');
}

// ========== POBLAR SELECTS VENTAS (actualizado) ==========
function reconciliarClienteIdObjetivos(){
  // Reconciliación post-reload (v039): objetivos.clienteId NO se persiste
  // (solo clienteIdLocal — este proyecto nunca usa el bigint identity como
  // clave de relación, ver nota en sql/v039). Al recargar desde Supabase,
  // objetivos.clienteId llega undefined; se lo restaura acá resolviendo
  // por clienteIdLocal, así el resto del código legacy que sigue leyendo
  // o.clienteId (Precios, CRM, Liquidación de horas) no se rompe.
  DB.objetivos.forEach(o=>{
    if(o.clienteId==null && o.clienteIdLocal){
      const cli=DB.clientes.find(c=>idLocalTrunc(c.id)===String(o.clienteIdLocal));
      if(cli) o.clienteId=cli.id;
    }
  });
}
// P.10 (Delta Comercial v1.2): responsables/adjuntos de un objetivo viven en
// tablas relacionales propias (objetivo_responsables/objetivo_adjuntos, ver
// persistirRelacionadosObjetivo) y objetivoParaGuardar los excluye de la
// tabla objetivos a propósito. Al recargar desde Supabase, o.responsables/
// o.adjuntos llegan undefined — mismo síntoma que clienteId, misma cura:
// se reconstruyen acá resolviendo por objetivoIdLocal.
function reconciliarResponsablesObjetivos(){
  DB.objetivos.forEach(o=>{
    const idl=idLocalTrunc(o.id);
    if((!o.responsables||!o.responsables.length)){
      const resp=(DB.objetivoResponsables||[]).filter(r=>String(r.objetivoIdLocal)===idl);
      if(resp.length) o.responsables=resp;
    }
    if((!o.adjuntos||!o.adjuntos.length)){
      const adj=(DB.objetivoAdjuntos||[]).filter(a=>String(a.objetivoIdLocal)===idl);
      if(adj.length) o.adjuntos=adj;
    }
  });
}
function poblarSelectsComercial(){
  reconciliarClienteIdObjetivos();
  reconciliarResponsablesObjetivos();

  const fS=(id,items)=>{const el=$(id);if(!el)return;const ph=el.options[0]?.outerHTML||'';el.innerHTML=ph+[...new Set(items)].filter(Boolean).map(i=>`<option value="${i}">${i}</option>`).join('');};
  const fSId=(id,items)=>{const el=$(id);if(!el)return;const ph=el.options[0]?.outerHTML||'';el.innerHTML=ph+items.map(i=>`<option value="${i.id}">${i.nombre}</option>`).join('');};

  // Clientes y objetivos
  fS('cli-tipo',DB.tiposCliente);
  fS('cf-cli-tipo',DB.tiposCliente);
  fS('cli-arca',DB.categoriasArca);
  fillDL('dl-cli-responsable',(DB.legajos||[]).filter(l=>l.estado==='Activo').map(l=>l.nombre));
  fillDL('dl-obj-comision-persona',(DB.legajos||[]).filter(l=>l.estado==='Activo').map(l=>l.nombre));
  fS('obj-jurisdiccion',Object.keys(DB.jurisdiccionesServicio||{}));
  fSId('obj-cliente',DB.clientes);
  fSId('rec-cliente',DB.clientes);
  fS('cf-obj-cliente',DB.clientes.map(c=>c.nombre));
  fS('cf-cob-cliente',DB.clientes.map(c=>c.nombre));
  fS('rec-objetivo',DB.objetivos.map(o=>o.codigo));
  fS('obj-clausula-actualizacion',DB.clausulasActualizacion);

  // Desde DB (parametrizables)
  fS('cli-iva',DB.condicionesIVA);
  fS('cli-cond-pago',DB.condicionesPago);
  fS('cli-forma-pago',DB.formasPago);
  fS('obj-tipo',DB.tiposServicio);
  fS('cf-obj-tipo',DB.tiposServicio);
  fS('obj-tipo-sitio',DB.tiposSitio);
  fS('cf-obj-tipo-sitio',DB.tiposSitio);
  fS('obj-modelo-precio',DB.modelosPrecio);
  const objPeriodo=$('obj-periodo-fact');
  if(objPeriodo){const ph='<option value="">Heredar del cliente</option>';objPeriodo.innerHTML=ph+DB.periodosFacturacion.map(p=>`<option>${p}</option>`).join('');}
  const cliPeriodo=$('cli-periodo-fact');
  if(cliPeriodo){const ph=cliPeriodo.options[0]?.outerHTML||'';cliPeriodo.innerHTML=ph+DB.periodosFacturacion.map(p=>`<option>${p}</option>`).join('');}

  // Reclamos
  fS('rec-tipo',DB.tiposReclamo);
  fS('cf-rec-tipo',DB.tiposReclamo);
  // 2.5.2 (Delta Comercial v1.2): igual que el supervisor de objetivo
  // (2.2.5), el responsable se elige entre legajos con función Supervisor
  // activos, no una lista hardcodeada (DB.supervisores) — se suman los
  // usuarios del sistema porque también pueden quedar como responsables.
  fS('rec-responsable',[...legajosSupervisoresActivos().map(l=>l.nombre),...(DB.usuarios||[]).map(u=>u.nombre)]);

  // CRM
  fS('lead-etapa',DB.etapasCRM);
  fS('cf-lead-etapa',DB.etapasCRM);
  fS('lead-tipo',DB.tiposServicio);
  const accTipo=$('lead-acc-tipo');
  if(accTipo){accTipo.innerHTML=DB.tiposAccionCRM.map(t=>`<option>${t}</option>`).join('');}
  const cfAccTipo=$('cf-acc-tipo');
  if(cfAccTipo){const ph=cfAccTipo.options[0]?.outerHTML||'';cfAccTipo.innerHTML=ph+DB.tiposAccionCRM.map(t=>`<option>${t}</option>`).join('');}

  const usrNombres=DB.usuarios?.map(u=>u.nombre)||[];
  fS('lead-responsable',usrNombres);
  fS('lead-acc-resp',usrNombres);
  fS('cf-lead-resp',usrNombres);
  fS('cf-acc-resp',usrNombres);

  const fDL=(id,items)=>{const el=$(id);if(el)el.innerHTML=items.map(i=>`<option value="${i}">`).join('');};
  fDL('dl-zonas-lead',DB.zonas||[]);

  // Cobros — selects de filtros
  fS('cf-cobrado-cliente',DB.clientes.map(c=>c.nombre));

  // Config ventas si está visible
  renderConfigComercial();
}

// ========== ACTUALIZAR renderConfiguracion para incluir comercial ==========
// ========== COBROS — con tabs, período prestación, importar Tango ==========
function tabCobros(tab,btn){
  document.querySelectorAll('#screen-cobros .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-cobros .tab-btn').forEach(b=>b.classList.remove('active'));
  $('cob-tab-'+tab).classList.add('active');
  if(btn) btn.classList.add('active');
  if(tab==='cobrados') renderCobrados();
  if(tab==='importar') renderHistorialImportaciones();
}

// C.5 (Delta Cobros/Tango v2) — vista principal: saldo por cliente, para
// priorizar a quién reclamar. Se deriva en vivo de DB.facturas (suma de
// saldo de las facturas pendientes de cada cliente) — no necesita guardarse
// aparte, matemáticamente coincide con la suma de todos los IMPORTE del
// cliente en Tango (C.2) porque las facturas ya saldadas aportan 0.
function renderSaldoPorCliente(pendientes){
  const el=$('saldo-por-cliente');
  if(!el)return;
  const porCliente=new Map();
  (pendientes||DB.facturas.filter(f=>f.estado!=='Cobrado')).forEach(f=>{
    const saldo=f.saldo!==undefined&&f.saldo!==null?f.saldo:f.importe;
    if(saldo<=0.01)return;
    const prev=porCliente.get(f.clienteId)||{saldo:0,facturas:0,alertas:0};
    prev.saldo+=saldo;prev.facturas++;
    if(f.alertaTangoNoConfirmo)prev.alertas++;
    porCliente.set(f.clienteId,prev);
  });
  const filas=[...porCliente.entries()]
    .map(([clienteId,d])=>({clienteId,...d,cliente:DB.clientes.find(c=>c.id===clienteId)}))
    .sort((a,b)=>b.saldo-a.saldo);
  if(!filas.length){el.innerHTML='<p class="text-muted" style="font-size:12px;">Sin saldos pendientes.</p>';return;}
  el.innerHTML=filas.map(f=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--fondo);border-radius:var(--radio);border:1px solid var(--borde);">
      <div onclick="filtrarPorCliente(${f.clienteId})" style="cursor:pointer;flex:1;" title="Ver el detalle de sus facturas más abajo">
        <div style="font-weight:600;font-size:12px;">${f.cliente?.nombre||'—'}</div>
        <div style="font-size:10px;color:var(--texto-suave);">${f.facturas} factura${f.facturas!==1?'s':''} pendiente${f.facturas!==1?'s':''}${f.alertas?` · <span style="color:var(--rojo);">⚠️ ${f.alertas} sin confirmar</span>`:''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-weight:700;font-size:14px;color:var(--rojo);">$${Math.round(f.saldo).toLocaleString('es-AR')}</div>
        <button class="btn btn-primary btn-xs" onclick="abrirGestionCliente(${f.clienteId})">💬 Gestionar</button>
      </div>
    </div>`).join('');
}

function filtrarPorCliente(clienteId){
  const cli=DB.clientes.find(c=>c.id===clienteId);
  if(!cli)return;
  if($('cf-cob-cliente'))$('cf-cob-cliente').value=cli.nombre;
  if($('buscar-cobro'))$('buscar-cobro').value='';
  if($('cf-cob-estado'))$('cf-cob-estado').value='';
  filtrarCobros();
  $('tbody-cobros')?.closest('.card')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderCobros(lista){
  _migrarAccionesFacturaACliente();
  const pendientes=DB.facturas.filter(f=>f.estado!=='Cobrado');
  const rows=lista||pendientes;
  const hoy=new Date();
  const saldoDe=f=>f.saldo!==undefined&&f.saldo!==null?f.saldo:f.importe;
  const deudaTotal=pendientes.reduce((s,f)=>s+saldoDe(f),0);
  const cobradoMes=(DB.cobros||[]).reduce((s,c)=>s+c.importeCobrado,0);
  const venMes=pendientes.filter(f=>{
    if(!f.vencimiento)return false;
    const[dd,mm,yy]=f.vencimiento.split('/');
    const d=new Date(`${yy}-${mm}-${dd}`);
    return d.getMonth()===hoy.getMonth()&&d.getFullYear()===hoy.getFullYear();
  }).reduce((s,f)=>s+saldoDe(f),0);
  if($('st-cob-deuda')) $('st-cob-deuda').textContent='$'+Math.round(deudaTotal/1000)+'k';
  if($('st-cob-mes')) $('st-cob-mes').textContent='$'+Math.round(venMes/1000)+'k';
  if($('st-cob-cobrado')) $('st-cob-cobrado').textContent='$'+Math.round(cobradoMes/1000)+'k';
  if($('st-cob-gestiones')) $('st-cob-gestiones').textContent=pendientes.filter(f=>f.proximaGestion).length;
  renderSaldoPorCliente(pendientes);

  const parseF=f=>{if(!f)return new Date();const[dd,mm,yy]=f.split('/');return new Date(`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);};
  const getCliente=id=>DB.clientes.find(c=>c.id===id);
  const estColor={'Gestión activa':'badge-acento','Impago':'badge-rojo','Incobrable':'badge-gris','Cobrada (pendiente Tango)':'badge-azul'};
  const tbody=$('tbody-cobros');
  if(!tbody)return;
  tbody.innerHTML=rows.map((f,i)=>{
    const cli=getCliente(f.clienteId);
    const venc=parseF(f.vencimiento);
    const diasAtraso=Math.max(0,Math.floor((hoy-venc)/(1000*3600*24)));
    const probColor=f.probCobro>=80?'var(--verde)':f.probCobro>=50?'var(--naranja)':'var(--rojo)';
    const realIdx=DB.facturas.indexOf(f);
    // DELTA_comisiones_v1 — objetivoCod/periodoDesde llegan '—'/vacíos en
    // facturas importadas de Tango (el export es a nivel cliente, sin
    // servicio ni período de prestación). Sin este dato el módulo de
    // Comisiones no puede vincular la factura a un servicio, así que acá
    // se pueden asignar a mano — dispara sincronizarComisionesFactura().
    const objetivosCliente=DB.objetivos.filter(o=>o.clienteId===f.clienteId);
    const selObjetivo=`<select style="font-size:11px;padding:2px 4px;border:1px solid var(--borde-fuerte);border-radius:5px;max-width:150px;" onchange="asignarObjetivoFactura(${realIdx},this.value)">
      <option value="—"${f.objetivoCod==='—'||!f.objetivoCod?' selected':''}>— Sin asignar —</option>
      ${objetivosCliente.map(o=>`<option value="${o.codigo}"${f.objetivoCod===o.codigo?' selected':''}>${o.codigo}</option>`).join('')}
    </select>`;
    let periodoInputVal='';
    if(f.periodoDesde){const[dd,mm,yy]=f.periodoDesde.split('/');periodoInputVal=`${yy}-${mm}`;}
    const selPeriodo=`<input type="month" value="${periodoInputVal}" style="font-size:11px;padding:2px 4px;border:1px solid var(--borde-fuerte);border-radius:5px;width:105px;" onchange="asignarPeriodoFactura(${realIdx},this.value)">`;
    // Gestión de cobranzas v1: la gestión vive a nivel cliente, no factura
    // — acá se toma la porción que aplica a ESTA factura (todas las del
    // cliente sin alcance puntual, más las que la listan explícitamente).
    const gestionesFactura=gestionesQueAplicanAFactura(f);
    const realizadasFactura=gestionesFactura.filter(g=>g.estado==='Realizada');
    const ultimaAcc=realizadasFactura[realizadasFactura.length-1];
    const pendientesFactura=gestionesFactura.filter(g=>g.estado==='Pendiente'&&g.fechaVenc).sort((a,b)=>parseF(a.fechaVenc)-parseF(b.fechaVenc));
    const proxGestion=pendientesFactura[0];
    const fechaInputVal=f.fechaPosibleCobro?f.fechaPosibleCobro.split('/').reverse().join('-'):'';
    return `<tr>
      <td style="font-weight:500;">${cli?.nombre||'—'}</td>
      <td>${selObjetivo}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;">${f.nroFactura}</td>
      <td>${selPeriodo}</td>
      <td style="font-weight:700;color:var(--azul);">$${f.importe.toLocaleString('es-AR')}</td>
      <td style="font-weight:700;color:${saldoDe(f)<f.importe?'var(--naranja)':'var(--rojo)'};" title="${saldoDe(f)<f.importe?'Pago parcial recibido':'Sin cobros aplicados'}">$${saldoDe(f).toLocaleString('es-AR')}</td>
      <td style="font-size:12px;">${f.fechaFactura||'—'}</td>
      <td style="font-size:12px;">${f.vencimiento}</td>
      <td style="text-align:center;font-weight:700;color:${diasAtraso>0?'var(--rojo)':'var(--verde)'};">${diasAtraso>0?'+'+diasAtraso+' días':'Al día'}</td>
      <td style="font-size:12px;">${f.formaPago}</td>
      <td><div style="font-size:12px;font-weight:500;">${f.contactoCobro}</div><div style="font-size:10px;color:var(--texto-suave);">${f.telefonoCobro}</div></td>
      <td style="font-size:11px;">${ultimaAcc?ultimaAcc.tipo+' '+ultimaAcc.fecha:'—'}</td>
      <td style="font-size:11px;color:var(--naranja);">${proxGestion?proxGestion.tipo+' '+proxGestion.fechaVenc:'—'}</td>
      <td style="background:var(--acento-suave);text-align:center;">
        <input type="date" value="${fechaInputVal}"
          style="border:1px solid #e6c84a;border-radius:6px;font-size:11px;padding:3px 6px;font-family:inherit;outline:none;background:white;"
          onchange="actualizarFechaCobro(${realIdx},this.value)">
      </td>
      <td style="text-align:center;">
        <div style="font-weight:700;font-size:13px;color:${probColor};">${f.probCobro}%</div>
        <div style="width:50px;height:4px;background:var(--borde);border-radius:2px;margin:3px auto 0;overflow:hidden;"><div style="height:100%;width:${f.probCobro}%;background:${probColor};"></div></div>
      </td>
      <td><span class="badge ${estColor[f.estado]||'badge-gris'}">${f.estado}</span>${f.alertaTangoNoConfirmo?`<div style="margin-top:4px;"><span class="badge badge-rojo" style="font-size:9px;" title="Pasó una importación de Tango y no confirmó este cobro — la marca se mantiene, pero conviene chequear con el cliente.">⚠️ Tango no confirmó</span></div>`:''}</td>
      <td><button class="btn btn-secondary btn-xs" onclick="abrirGestionCliente(${f.clienteId})" title="Gestiones de cobro de este cliente">📋 ${gestionesFactura.length}</button></td>
      <td>${f.estado==='Cobrada (pendiente Tango)'?'<span style="font-size:10px;color:var(--texto-suave);">⏳ Pendiente Tango</span>':`<button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="marcarCobrado(${realIdx})">✓</button>`}</td>
    </tr>`;
  }).join('')||`<tr><td colspan="18"><div class="empty-state"><div class="icon">💳</div><p>Sin facturas pendientes</p></div></td></tr>`;
}

function asignarObjetivoFactura(idx,cod){
  const f=DB.facturas[idx];if(!f)return;
  f.objetivoCod=cod||'—';
  supaSync('facturas',f);
  sincronizarComisionesFactura(f);
  renderCobros();
  toast(f.objetivoCod==='—'?'Servicio desasignado de la factura':`Factura vinculada a ${f.objetivoCod}`);
}
function asignarPeriodoFactura(idx,mesISO){
  const f=DB.facturas[idx];if(!f)return;
  if(!mesISO){f.periodoDesde='';f.periodoHasta='';}
  else{
    const[yy,mm]=mesISO.split('-');
    const ultimoDia=new Date(parseInt(yy),parseInt(mm),0).getDate();
    f.periodoDesde=`01/${mm}/${yy}`;
    f.periodoHasta=`${String(ultimoDia).padStart(2,'0')}/${mm}/${yy}`;
  }
  supaSync('facturas',f);
  sincronizarComisionesFactura(f);
  renderCobros();
}

// ========== MOTOR DE DEVENGO DE COMISIONES (DELTA_comisiones_v1) ==========
// Punto 3 del delta: la base de cálculo es SIEMPRE horas, nunca la
// factura de Tango (que puede mezclar horas+productos en renglones
// separados) — así los productos quedan afuera automáticamente.
// Punto 4: se devenga al facturar (objetivoCod+período asignados),
// se habilita para pago recién cuando esa factura queda 100% cobrada
// (f.estado==='Cobrado', la única transición que fija Tango como fuente
// de verdad — "marcada cobrada pendiente Tango" NO habilita todavía).
function periodoFacturaAMesLiq(factura){
  const pd=factura.periodoDesde||factura.fechaFactura;
  if(!pd)return'';
  const partes=pd.split('/');
  if(partes.length!==3)return'';
  const[,mm,yy]=partes;
  return`${yy}-${mm}`;
}
function calcularMontoBaseComision(obj,factura){
  const fFactura=_dmyPrecios(factura.fechaFactura||factura.periodoDesde);
  if(obj.modeloPrecio==='Abono mensual fijo'){
    let val=obj.valor||0;
    (obj.historialPrecios||[]).forEach(h=>{const f=_dmyPrecios(h.fecha);if(f&&fFactura&&f<=fFactura&&h.valor)val=h.valor;});
    return val;
  }
  // Por EFT / Por horas variables: horas facturables reales del período
  // (Liquidación de horas) × valor hora vigente a la fecha de la factura.
  const mesLiq=periodoFacturaAMesLiq(factura);
  if(!mesLiq)return 0;
  const grilla=(DB.grillasLiq||[]).find(g=>g.periodo===mesLiq&&g.objCodigo===obj.codigo);
  const horas=grilla?.totalHorasFacturables||0;
  let valorHora=obj.valorHora||0;
  (obj.historialPrecios||[]).forEach(h=>{const f=_dmyPrecios(h.fecha);if(f&&fFactura&&f<=fFactura&&h.valorHora)valorHora=h.valorHora;});
  return Math.round(horas*valorHora);
}
// Idempotente: nunca duplica un devengo para la misma comisión+factura —
// se puede llamar repetidas veces a medida que se completan datos
// (objetivo, período, horas cargadas) sin generar duplicados.
function generarDevengosFactura(factura){
  if(!factura||!factura.objetivoCod||factura.objetivoCod==='—')return;
  if(!factura.periodoDesde)return;
  const obj=DB.objetivos.find(o=>o.codigo===factura.objetivoCod);
  if(!obj||!(obj.comisiones||[]).length)return;
  const fechaRef=factura.fechaFactura||factura.periodoDesde;
  obj.comisiones.filter(c=>c.activa).forEach(com=>{
    if(com.tipo==='Temporal'&&com.periodosTotal!=null&&(com.periodosConsumidos||0)>=com.periodosTotal)return;
    const yaExiste=DB.comisionesDevengos.find(d=>d.comisionId===com.id&&d.facturaId===factura.id);
    if(yaExiste)return;
    const montoBase=calcularMontoBaseComision(obj,factura);
    if(!montoBase)return; // sin datos todavía (ej. horas sin cargar) — se reintenta en el próximo sync
    const pct=pctVigenteComision(com,fechaRef);
    if(!pct)return;
    const montoComision=Math.round(montoBase*pct/100);
    const cli=DB.clientes.find(c=>c.id===obj.clienteId);
    const nuevo={
      id:Date.now()+Math.floor(Math.random()*1e6),
      comisionId:com.id,objetivoId:obj.id,objetivoCod:obj.codigo,objetivoNombre:obj.nombre,
      clienteId:obj.clienteId,clienteNombre:cli?.nombre||'',
      personaTipo:com.personaTipo,personaRef:com.personaRef,personaNombre:com.personaNombre,
      facturaId:factura.id,nroFactura:factura.nroFactura,periodo:formatPeriodo(factura.periodoDesde,factura.periodoHasta),
      montoBase,pct,montoComision,
      estado:'Devengada',fechaDevengo:factura.fechaFactura||new Date().toLocaleDateString('es-AR'),
      fechaDisponible:'',fechaPago:'',montoPagado:0,saldo:montoComision,
    };
    DB.comisionesDevengos.push(nuevo);
    supaSync('comisionesDevengos',nuevo);
  });
}
// Idempotente: sólo actúa sobre devengos todavía 'Devengada' de esta
// factura — llamarla de más (ej. en cada import de Tango) no repite el
// consumo de períodos de las comisiones temporales.
function habilitarComisionesFactura(factura){
  const devengos=DB.comisionesDevengos.filter(d=>d.facturaId===factura.id&&d.estado==='Devengada');
  devengos.forEach(d=>{
    d.estado='Disponible';
    d.fechaDisponible=new Date().toLocaleDateString('es-AR');
    supaSync('comisionesDevengos',d);
    const obj=DB.objetivos.find(o=>o.id===d.objetivoId);
    const com=obj?.comisiones?.find(c=>c.id===d.comisionId);
    if(com&&com.tipo==='Temporal'){
      com.periodosConsumidos=(com.periodosConsumidos||0)+1;
      if(com.periodosTotal!=null&&com.periodosConsumidos>=com.periodosTotal)com.activa=false;
      supaSync('objetivos',obj);
    }
  });
}
function sincronizarComisionesFactura(factura){
  if(!factura)return;
  generarDevengosFactura(factura);
  if(factura.estado==='Cobrado')habilitarComisionesFactura(factura);
}

function renderCobrados(lista){
  const rows=lista||(DB.cobros||[]);
  const getCliente=id=>DB.clientes.find(c=>c.id===id);
  const tbody=$('tbody-cobrados');if(!tbody)return;
  tbody.innerHTML=rows.map(c=>{
    const cli=getCliente(c.clienteId);
    const periodo=formatPeriodo(c.periodoDesde,c.periodoHasta);
    return `<tr>
      <td style="font-weight:500;">${cli?.nombre||'—'}</td>
      <td style="font-size:11px;color:var(--texto-suave);">${c.objetivoCod}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;">${c.nroFactura}</td>
      <td style="font-size:11px;color:var(--texto-suave);">${periodo}</td>
      <td style="font-weight:700;color:var(--texto-suave);">$${c.importeFacturado.toLocaleString('es-AR')}</td>
      <td style="font-weight:700;color:var(--verde);">$${c.importeCobrado.toLocaleString('es-AR')}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--azul);">${c.nroRecibo}</td>
      <td style="font-size:12px;">${c.fechaCobro}</td>
      <td style="font-size:12px;font-weight:500;color:var(--azul);">${c.fechaAcreditacion||'—'}</td>
      <td style="font-size:12px;">${c.formaPago}</td>
      <td><button class="btn btn-secondary btn-xs" onclick="eliminarCobro('${c.id}')">🗑</button></td>
    </tr>`;
  }).join('')||`<tr><td colspan="11"><div class="empty-state"><div class="icon">✅</div><p>Sin cobros registrados</p></div></td></tr>`;
}

function eliminarCobro(id){
  const idx=DB.cobros.findIndex(c=>String(c.id)===String(id));
  if(idx===-1)return;
  const [c]=DB.cobros.splice(idx,1);
  supaDel('cobros',c.id);
  renderCobrados();toast('Cobro eliminado');
}

function filtrarCobrados(){
  const bg=($('buscar-cobrado')||{value:''}).value.toLowerCase();
  const cliNom=($('cf-cobrado-cliente')||{value:''}).value;
  const cliId=cliNom?DB.clientes.find(c=>c.nombre===cliNom)?.id:null;
  renderCobrados((DB.cobros||[]).filter(c=>(!bg||c.nroFactura.toLowerCase().includes(bg)||c.objetivoCod.toLowerCase().includes(bg))&&(!cliId||c.clienteId===cliId)));
}

function filtrarCobros(){
  const bg=($('buscar-cobro')||{value:''}).value.toLowerCase();
  const est=($('cf-cob-estado')||{value:''}).value;
  const cliNom=($('cf-cob-cliente')||{value:''}).value;
  const cliId=cliNom?DB.clientes.find(c=>c.nombre===cliNom)?.id:null;
  renderCobros(DB.facturas.filter(f=>f.estado!=='Cobrado').filter(f=>
    (!bg||f.nroFactura.toLowerCase().includes(bg)||f.objetivoCod.toLowerCase().includes(bg))&&
    (!est||f.estado===est)&&(!cliId||f.clienteId===cliId)
  ));
}

function actualizarFechaCobro(idx,fecha){
  if(!DB.facturas[idx])return;
  DB.facturas[idx].fechaPosibleCobro=fecha?new Date(fecha).toLocaleDateString('es-AR'):'';
  supaSync('facturas',DB.facturas[idx]);
  const dias=fecha?Math.round((new Date(fecha)-new Date())/(1000*3600*24)):0;
  toast(`✓ Fecha posible cobro: ${DB.facturas[idx].fechaPosibleCobro}${dias>0?' (en '+dias+' días)':dias<0?' (ya pasó)':' (hoy)'}`);
}

// 2.6/2.6.2 (Delta Comercial v1.2) — Tango es la única fuente de verdad de
// "Cobros registrados": la gestora ya NO puede escribir directo ahí. Al
// marcar una factura como cobrada acá, queda en un estado intermedio
// ("Cobrada (pendiente Tango)") y sigue en Facturas pendientes — recién
// pasa a Cobros registrados cuando la PRÓXIMA importación de la composición
// de Tango la confirme por nroFactura (ver confirmarImportacionTango() más abajo).
function marcarCobrado(idx){
  const f=DB.facturas[idx];if(!f)return;
  if(f.estado==='Cobrada (pendiente Tango)'){toast('Ya está marcada como cobrada, pendiente de confirmar con el próximo import de Tango');return;}
  f.estado='Cobrada (pendiente Tango)';
  f.marcadaCobradaPor=currentUser?.nombre||'';
  f.fechaMarcadaCobrada=new Date().toLocaleDateString('es-AR');
  supaSync('facturas',f);
  generarDevengosFactura(f); // el devengo no depende de la confirmación de Tango, la habilitación para pago sí
  renderCobros();toast(`✓ ${f.nroFactura} marcada como cobrada — queda pendiente de confirmar con el próximo import de Tango`);
}

function analizarCobrosIA(){
  const pendientes=DB.facturas.filter(f=>f.estado!=='Cobrado');
  const deuda=pendientes.reduce((s,f)=>s+f.importe,0);
  const probProm=pendientes.length?pendientes.reduce((s,f)=>s+f.probCobro,0)/pendientes.length:0;
  const proyeccion=Math.round(deuda*probProm/100);
  const conFecha=pendientes.filter(f=>f.fechaPosibleCobro);
  toast(`🤖 Deuda $${Math.round(deuda/1000)}k · Prob. promedio ${Math.round(probProm)}% · Proyección $${Math.round(proyeccion/1000)}k · ${conFecha.length} facturas con fecha posible cargada.`,7000);
}

// ========== GESTIÓN DE COBRANZAS — a nivel CLIENTE (Delta Cobros/Gestión de Cobranzas v1) ==========
// Principio rector del delta: la gestora no cobra facturas, cobra clientes
// — llama a un cliente y habla de todo lo que debe. La gestión (llamada,
// mail, etc.) se registra UNA vez por conversación y por defecto aplica a
// TODAS las facturas pendientes del cliente (facturasAplicadas:null); solo
// si la gestora tilda un subconjunto puntual queda una lista explícita de
// N° de factura. El historial vive en cliente.gestionesCobro (antes vivía
// repetido en cada f.acciones — absurdo si un cliente tiene 10 facturas).
//
// Ciclo de vida (punto 4): una gestión nace Pendiente (planificada, sin
// resultado todavía) o Realizada (ya se hizo, con resultado de una). Una
// Pendiente se REABRE cuando se ejecuta — se le carga el resultado y pasa
// a Realizada — o el sweep de verificarAccionesVencidas() la pasa a
// Vencida si venció la fecha límite sin completarse. Antes esto no existía
// (el formulario nacía y moría en el mismo paso, sin forma de volver).

// Migración única (datos de demo): las gestiones vivían por factura
// (f.acciones); se trasladan una sola vez a cliente.gestionesCobro la
// primera vez que se abre la pantalla, para no perder el historial mock
// ya cargado.
let _gestionClienteMigrada=false;
function _migrarAccionesFacturaACliente(){
  if(_gestionClienteMigrada)return;
  _gestionClienteMigrada=true;
  DB.facturas.forEach(f=>{
    if(!f.acciones||!f.acciones.length)return;
    const cli=DB.clientes.find(c=>c.id===f.clienteId);
    if(!cli)return;
    if(!cli.gestionesCobro)cli.gestionesCobro=[];
    f.acciones.forEach((a,i)=>{
      cli.gestionesCobro.push({
        id:Date.now()+cli.gestionesCobro.length*7+i,
        tipo:a.tipo,fecha:a.fecha,fechaVenc:a.fechaVenc||'',
        estado:a.estado==='Vencida'?'Vencida':a.estado==='Pendiente'?'Pendiente':'Realizada',
        resultado:a.nota||'',resp:currentUser?.nombre||'',
        facturasAplicadas:[f.nroFactura],
      });
    });
    f.acciones=[];
    supaSync('clientes',cli);
    supaSync('facturas',f);
  });
}

// Gestiones del cliente que aplican a una factura puntual (todas las que
// tienen facturasAplicadas:null, más las que la listan explícitamente) —
// usado para "Último contacto"/"Próxima gestión" en la tabla de facturas.
function gestionesQueAplicanAFactura(f){
  const cli=DB.clientes.find(c=>c.id===f.clienteId);
  if(!cli||!cli.gestionesCobro)return[];
  return cli.gestionesCobro.filter(g=>!g.facturasAplicadas||g.facturasAplicadas.includes(f.nroFactura));
}

function ensureModalGestionCliente(){
  if($('modal-gestion-cliente'))return;
  const m=document.createElement('div');
  m.className='modal-overlay';
  m.id='modal-gestion-cliente';
  m.innerHTML=`
    <div class="modal" style="max-width:760px;">
      <div class="modal-header"><h3 id="gc-titulo">💳 Gestiones de cobro</h3><button class="btn-close" onclick="cerrarModal('modal-gestion-cliente')">×</button></div>
      <div class="modal-body">
        <div class="info-grid" style="margin-bottom:14px;" id="gc-info-cliente"></div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:6px;">Facturas pendientes de este cliente</div>
        <div id="gc-facturas-lista" style="max-height:140px;overflow-y:auto;margin-bottom:14px;border:1px solid var(--borde);border-radius:var(--radio);"></div>

        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Historial de gestiones</div>
        <div id="gc-historial" style="max-height:220px;overflow-y:auto;margin-bottom:14px;display:flex;flex-direction:column;gap:6px;"></div>

        <div style="background:var(--fondo);border-radius:var(--radio);padding:12px;border:1px solid var(--borde);">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;">+ Registrar nueva gestión</div>
          <div class="form-grid form-grid-2" style="margin-bottom:8px;">
            <div class="form-group"><label>Tipo</label><select id="gc-tipo">${DB.tiposAccionCobro.map(t=>`<option>${t}</option>`).join('')}</select></div>
            <div class="form-group"><label>Estado</label><select id="gc-estado" onchange="toggleGcResultado()"><option>Realizada</option><option>Pendiente</option></select></div>
            <div class="form-group"><label>Fecha de la gestión</label><input type="date" id="gc-fecha"></div>
            <div class="form-group"><label>Fecha límite / próxima gestión</label><input type="date" id="gc-fechavenc" title="Si vence sin completarse pasa a Vencida y genera alerta"></div>
          </div>
          <div class="form-group" style="margin-bottom:8px;"><label id="gc-resultado-label">Resultado</label><textarea id="gc-resultado" placeholder="Qué dijo el cliente, acuerdo al que se llegó..."></textarea></div>
          <div style="margin-bottom:10px;">
            <label style="font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;">
              <input type="checkbox" id="gc-todas" checked onchange="toggleGcTodasFacturas()"> Aplica a todas las facturas pendientes
            </label>
            <div id="gc-checks-facturas" style="display:none;max-height:100px;overflow-y:auto;border:1px solid var(--borde);border-radius:var(--radio);padding:6px 10px;"></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="guardarGestionCliente()">Registrar gestión</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
}
let _gestionClienteAbiertaId=null;
function abrirGestionCliente(clienteId){
  _migrarAccionesFacturaACliente();
  const cli=DB.clientes.find(c=>c.id===clienteId);
  if(!cli)return;
  ensureModalGestionCliente();
  _gestionClienteAbiertaId=clienteId;
  const facturasPend=DB.facturas.filter(f=>f.clienteId===clienteId&&f.estado!=='Cobrado');
  const saldoDe=f=>f.saldo!==undefined&&f.saldo!==null?f.saldo:f.importe;
  const saldoTotal=facturasPend.reduce((s,f)=>s+saldoDe(f),0);

  $('gc-titulo').textContent=`💳 Gestiones de cobro — ${cli.nombre}`;
  $('gc-info-cliente').innerHTML=`
    <div class="info-item"><div class="key">Saldo total pendiente</div><div class="val" style="font-weight:700;color:var(--rojo);">$${Math.round(saldoTotal).toLocaleString('es-AR')}</div></div>
    <div class="info-item"><div class="key">Facturas pendientes</div><div class="val">${facturasPend.length}</div></div>
    <div class="info-item"><div class="key">Contacto de cobro</div><div class="val">${facturasPend[0]?.contactoCobro||'—'}</div></div>
    <div class="info-item"><div class="key">Teléfono</div><div class="val">${facturasPend[0]?.telefonoCobro||'—'}</div></div>`;
  $('gc-facturas-lista').innerHTML=facturasPend.length?facturasPend.map(f=>`
    <div style="display:flex;justify-content:space-between;padding:6px 10px;font-size:12px;border-bottom:1px solid var(--borde);">
      <span style="font-family:'DM Mono',monospace;">${f.nroFactura}</span>
      <span style="font-weight:600;color:var(--rojo);">$${Math.round(saldoDe(f)).toLocaleString('es-AR')}</span>
    </div>`).join(''):'<div style="padding:10px;font-size:12px;color:var(--texto-muy-suave);text-align:center;">Sin facturas pendientes</div>';
  $('gc-checks-facturas').innerHTML=facturasPend.map(f=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;cursor:pointer;">
      <input type="checkbox" class="gc-check-factura" value="${f.nroFactura}" checked> ${f.nroFactura} — $${Math.round(saldoDe(f)).toLocaleString('es-AR')}
    </label>`).join('')||'<p class="text-muted" style="font-size:11px;">Sin facturas pendientes</p>';

  if($('gc-todas'))$('gc-todas').checked=true;
  if($('gc-checks-facturas'))$('gc-checks-facturas').style.display='none';
  if($('gc-tipo'))$('gc-tipo').selectedIndex=0;
  if($('gc-estado'))$('gc-estado').value='Realizada';
  if($('gc-fecha'))$('gc-fecha').value=new Date().toISOString().slice(0,10);
  if($('gc-fechavenc'))$('gc-fechavenc').value='';
  if($('gc-resultado'))$('gc-resultado').value='';
  toggleGcResultado();

  renderHistorialGestionCliente(cli);
  abrirModal('modal-gestion-cliente');
}
function toggleGcTodasFacturas(){
  const todas=$('gc-todas')?.checked;
  if($('gc-checks-facturas'))$('gc-checks-facturas').style.display=todas?'none':'block';
}
function toggleGcResultado(){
  const estado=$('gc-estado')?.value;
  const ta=$('gc-resultado');
  if(!ta)return;
  ta.placeholder=estado==='Pendiente'
    ?'Opcional — qué se espera de este contacto (se completa cuando se ejecute la gestión)'
    :'Qué dijo el cliente, acuerdo al que se llegó...';
}
function renderHistorialGestionCliente(cli){
  const el=$('gc-historial');if(!el)return;
  const gestiones=(cli.gestionesCobro||[]).slice().reverse();
  el.innerHTML=gestiones.map(g=>{
    const estColor=g.estado==='Pendiente'?'badge-acento':g.estado==='Vencida'?'badge-rojo':'badge-verde';
    const bg=g.estado==='Pendiente'?'var(--acento-suave)':g.estado==='Vencida'?'rgba(229,62,62,.08)':'var(--fondo)';
    const alcance=g.facturasAplicadas?`Aplica a: ${g.facturasAplicadas.join(', ')}`:'Aplica a todas las facturas pendientes';
    const puedeCompletar=g.estado==='Pendiente'||g.estado==='Vencida';
    return `<div style="padding:8px 12px;background:${bg};border-radius:var(--radio);border:1px solid var(--borde);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:600;font-size:12px;">${g.tipo} <span style="font-weight:400;color:var(--texto-suave);">— ${g.fecha||'—'}</span></div>
        <span class="badge ${estColor}" style="font-size:10px;">${g.estado}</span>
      </div>
      <div style="font-size:10px;color:var(--texto-muy-suave);margin-top:2px;">${alcance}</div>
      ${g.resultado?`<div style="font-size:12px;margin-top:4px;">${g.resultado}</div>`:''}
      ${g.fechaVenc?`<div style="font-size:10px;color:${g.estado==='Vencida'?'var(--rojo)':'var(--texto-muy-suave)'};margin-top:4px;">📅 ${g.estado==='Vencida'?'Venció':'Vence'}: ${g.fechaVenc}</div>`:''}
      ${puedeCompletar?`
        <button class="btn btn-secondary btn-xs" style="margin-top:6px;" onclick="document.getElementById('gc-completar-${g.id}').style.display='block';this.style.display='none';">✓ Completar</button>
        <div id="gc-completar-${g.id}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px dashed var(--borde);">
          <textarea id="gc-completar-texto-${g.id}" placeholder="Resultado de la gestión..." style="width:100%;padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:6px;font-size:12px;font-family:inherit;outline:none;margin-bottom:6px;"></textarea>
          <button class="btn btn-primary btn-xs" onclick="confirmarCompletarGestion(${g.id})">Guardar resultado</button>
        </div>`:''}
    </div>`;
  }).join('')||'<p class="text-muted" style="font-size:12px;">Sin gestiones registradas</p>';
}
function guardarGestionCliente(){
  const clienteId=_gestionClienteAbiertaId;
  const cli=DB.clientes.find(c=>c.id===clienteId);
  if(!cli)return;
  const tipo=$('gc-tipo')?.value;
  const estado=$('gc-estado')?.value||'Realizada';
  const fecha=$('gc-fecha')?.value?new Date($('gc-fecha').value).toLocaleDateString('es-AR'):new Date().toLocaleDateString('es-AR');
  const fechaVenc=$('gc-fechavenc')?.value?new Date($('gc-fechavenc').value).toLocaleDateString('es-AR'):'';
  const resultado=$('gc-resultado')?.value.trim()||'';
  const todas=$('gc-todas')?.checked;
  let facturasAplicadas=null;
  if(!todas){
    facturasAplicadas=[...document.querySelectorAll('.gc-check-factura:checked')].map(el=>el.value);
    if(!facturasAplicadas.length){toast('Marcá al menos una factura, o tildá "Todas las facturas pendientes"');return;}
  }
  if(!cli.gestionesCobro)cli.gestionesCobro=[];
  cli.gestionesCobro.push({id:Date.now(),tipo,fecha,fechaVenc,estado,resultado,resp:currentUser?.nombre||'',facturasAplicadas});
  supaSync('clientes',cli);
  renderHistorialGestionCliente(cli);
  renderCobros();
  if($('gc-resultado'))$('gc-resultado').value='';
  if($('gc-fechavenc'))$('gc-fechavenc').value='';
  toast(`✓ Gestión registrada para ${cli.nombre}${estado==='Pendiente'&&fechaVenc?' · vence '+fechaVenc:''}`);
}
// Punto clave del delta: una gestión Pendiente (o ya Vencida) se REABRE acá
// para cargarle el resultado real y cerrarla — antes no existía forma de
// volver a una gestión planificada, el formulario nacía y moría en un paso.
function confirmarCompletarGestion(gestionId){
  const cli=DB.clientes.find(c=>c.id===_gestionClienteAbiertaId);
  if(!cli)return;
  const g=(cli.gestionesCobro||[]).find(x=>String(x.id)===String(gestionId));
  if(!g)return;
  const texto=$(`gc-completar-texto-${gestionId}`)?.value.trim()||'';
  if(texto)g.resultado=texto;
  g.estado='Realizada';
  g.fecha=new Date().toLocaleDateString('es-AR'); // la ejecución real es hoy
  supaSync('clientes',cli);
  renderHistorialGestionCliente(cli);
  renderCobros();
  toast('✓ Gestión completada');
}

// ========== IMPORTAR DESDE TANGO — Estado de cuenta (v2) ==========
// DELTA_comercial_cobros_tango_v2 (30/07/2026) — reemplaza el parser de v1
// (texto/PDF, posicional). Tango exporta a Excel: se pide guardado como
// CSV (ver nota de seguridad en analizarEstadoCuentaTango) con columnas
// nombradas — COD_CLI, RAZON_SOC, FECHA, T_COMP, N_COMP, FECHA_VTO,
// FECHA_APL, TCOMP_APL, NCOMP_APL, IMPORTE. Cada factura (T_COMP=FAC) es
// seguida por sus comprobantes aplicados (TCOMP_APL=REC/N·C/N·D/etc.).
//
// C.2 (validado al centavo contra el PDF real de Tango): IMPORTE ya viene
// con el signo correcto en TODAS las filas (facturas positivas, aplicados
// negativos) — el saldo de una factura, o de un cliente, es sencillamente
// la suma de sus IMPORTE. No hace falta lógica distinta por tipo de
// comprobante.
//
// C.9 — mecánica de reemplazo: cada import trae el histórico completo, así
// que los datos de Tango (facturas, saldos, recibos) se REEMPLAZAN; los
// datos propios de la gestión (marca "Cobrada (pendiente Tango)", próxima
// gestión, fecha posible de cobro, notas, historial de acciones) se
// PRESERVAN, enganchados por N° de factura. Cobros (recibos) se reconstruye
// entero en cada import — un recibo que ya no figura en el archivo nuevo se
// borra (mismo criterio: Tango es la única fuente de verdad).
//
// C.8 — reconciliación: si una factura marcada "Cobrada (pendiente Tango)"
// queda con saldo 0 en el nuevo import, se confirma (pasa a Cobrado). Si
// sigue con saldo, se mantiene la marca (el pago puede estar en camino)
// pero se prende f.alertaTangoNoConfirmo para avisar en la UI.

const TANGO_MONTO_RE_AR=/-?\(?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\)?/;

// Normaliza un monto en formato argentino de Excel/CSV: punto=miles,
// coma=decimal, paréntesis o "-" para negativo (export contable).
function _parsearMontoTangoCSV(s){
  if(s===undefined||s===null)return 0;
  let t=String(s).trim();
  if(!t)return 0;
  let neg=false;
  if(/^\(.*\)$/.test(t)){neg=true;t=t.slice(1,-1);}
  if(t.startsWith('-')){neg=true;t=t.slice(1);}
  t=t.replace(/\./g,'').replace(',','.');
  const n=parseFloat(t);
  if(isNaN(n))return 0;
  return neg?-n:n;
}

// COD_CLI SIEMPRE como texto (C.3): si se leyera como número se pierden
// los ceros a la izquierda (000003 → 3) y el matcheo por Código Tango da 0
// resultados. Acá además se normaliza a 6 dígitos por si el Excel de
// origen guardó la celda como número (Excel/CSV no recupera un cero que
// nunca se guardó, pero esto blinda contra variantes tipo "3" vs "000003"
// en el propio campo Código Tango del cliente).
function _normCodClienteTango(s){
  return String(s||'').trim().padStart(6,'0');
}

// Parser de una línea CSV respetando comillas (RAZON_SOC puede traer comas).
function _parsearLineaCSV(linea,delim){
  const campos=[];
  let actual='',enComillas=false;
  for(let i=0;i<linea.length;i++){
    const ch=linea[i];
    if(enComillas){
      if(ch==='"'){
        if(linea[i+1]==='"'){actual+='"';i++;}
        else enComillas=false;
      }else actual+=ch;
    }else{
      if(ch==='"')enComillas=true;
      else if(ch===delim){campos.push(actual);actual='';}
      else actual+=ch;
    }
  }
  campos.push(actual);
  return campos;
}

function parsearEstadoCuentaTango(csvTexto){
  const resultado={
    facturasNuevas:[],facturasActualizadas:[],recibosFinal:[],
    clientesSinMatchear:new Map(),otrosAplicados:{},filasNoReconocidas:0,totalFilas:0,error:'',
  };
  if(!csvTexto||!csvTexto.trim())return resultado;

  const texto=csvTexto.replace(/^﻿/,'');
  const lineas=texto.split(/\r\n|\n|\r/).filter(l=>l.trim().length>0);
  if(lineas.length<2){resultado.error='El archivo está vacío o no tiene filas de datos.';return resultado;}

  const cabecera=lineas[0];
  const delim=cabecera.split(';').length>cabecera.split(',').length?';':',';
  const headers=_parsearLineaCSV(cabecera,delim).map(h=>h.trim().toUpperCase());
  const idx=nombre=>headers.indexOf(nombre);
  const iCodCli=idx('COD_CLI'),iRazonSoc=idx('RAZON_SOC'),iFecha=idx('FECHA'),
    iTComp=idx('T_COMP'),iNComp=idx('N_COMP'),iFechaVto=idx('FECHA_VTO'),
    iFechaApl=idx('FECHA_APL'),iTCompApl=idx('TCOMP_APL'),iNCompApl=idx('NCOMP_APL'),
    iImporte=idx('IMPORTE');

  if(iCodCli===-1||iImporte===-1){
    resultado.error='El archivo no tiene las columnas esperadas (COD_CLI, IMPORTE, ...). ¿Es el export "Estado de cuenta total" de Tango, guardado como CSV?';
    return resultado;
  }

  let clienteCodActual=null,clienteActual=null,facturaActual=null;

  // Cierra la "factura actual": recién acá se decide si va a facturasNuevas
  // (saldo final>0) o facturasActualizadas — se difiere hasta este punto
  // porque las filas aplicadas que van llegando bajo la FAC siguen
  // ajustando su saldo (C.2: se suma IMPORTE con signo, sin distinguir tipo).
  const cerrarFacturaActual=()=>{
    if(!facturaActual)return;
    const existente=DB.facturas.find(f=>f.nroFactura===facturaActual.nroFactura);
    if(existente){
      const eraCobradaPendiente=existente.estado==='Cobrada (pendiente Tango)';
      const cerrada=facturaActual.saldo<=0.01;
      resultado.facturasActualizadas.push({
        nroFactura:facturaActual.nroFactura,
        saldoAnterior:existente.saldo??existente.importe,
        saldoNuevo:facturaActual.saldo,
        cerrada,
        alertaNoConfirmada:eraCobradaPendiente&&!cerrada,
      });
    }else if(facturaActual.saldo>0.01){
      resultado.facturasNuevas.push({
        nroFactura:facturaActual.nroFactura,clienteId:facturaActual.clienteId,
        importe:facturaActual.importe,saldo:facturaActual.saldo,
        fecha:facturaActual.fecha,vencimiento:facturaActual.vencimiento,objetivoCod:'—',
      });
    }
    facturaActual=null;
  };

  for(let li=1;li<lineas.length;li++){
    const campos=_parsearLineaCSV(lineas[li],delim);
    if(campos.every(c=>!c.trim()))continue;
    resultado.totalFilas++;

    const codCliRaw=(campos[iCodCli]||'').trim();
    if(!codCliRaw){resultado.filasNoReconocidas++;continue;}
    const codCli=_normCodClienteTango(codCliRaw);

    if(codCli!==clienteCodActual){
      cerrarFacturaActual();
      clienteCodActual=codCli;
      clienteActual=DB.clientes.find(c=>c.codigoTango&&_normCodClienteTango(c.codigoTango)===codCli)||null;
      if(!clienteActual)resultado.clientesSinMatchear.set(codCli,(campos[iRazonSoc]||'').trim());
    }
    if(!clienteActual)continue; // sin Código Tango cargado: ya reportado arriba

    const tComp=(campos[iTComp]||'').trim().toUpperCase();
    const tCompApl=(campos[iTCompApl]||'').trim().toUpperCase();
    if(!tComp&&!tCompApl)continue; // fila sin tipo (subtotal u otra ajena a este modelo)
    const importe=_parsearMontoTangoCSV(campos[iImporte]);

    if(tComp==='FAC'){
      cerrarFacturaActual();
      const nComp=(campos[iNComp]||'').trim();
      if(!nComp){resultado.filasNoReconocidas++;continue;}
      facturaActual={
        nroFactura:nComp,clienteId:clienteActual.id,
        importe,saldo:importe,
        fecha:(campos[iFecha]||'').trim(),vencimiento:(campos[iFechaVto]||'').trim(),
      };
      continue;
    }

    if(tCompApl){
      if(!facturaActual){resultado.filasNoReconocidas++;continue;}
      facturaActual.saldo+=importe;
      if(tCompApl==='REC'){
        const nCompApl=(campos[iNCompApl]||'').trim();
        resultado.recibosFinal.push({
          nroFactura:facturaActual.nroFactura,clienteId:facturaActual.clienteId,
          importeFacturado:facturaActual.importe,objetivoCod:'—',
          nroRecibo:nCompApl||`${facturaActual.nroFactura}-REC${resultado.recibosFinal.length+1}`,
          importe:Math.abs(importe),fecha:(campos[iFechaApl]||'').trim(),
        });
      }else{
        resultado.otrosAplicados[tCompApl]=(resultado.otrosAplicados[tCompApl]||0)+1;
      }
    }
  }
  cerrarFacturaActual();

  return resultado;
}

// Diff de Cobros contra lo que ya hay en DB.cobros, por nroRecibo — se usa
// tanto en la vista previa como al confirmar (C.9: Cobros se reconstruye
// entero en cada import).
function _diffCobrosTango(recibosFinal){
  const nuevosSet=new Set(recibosFinal.map(r=>r.nroRecibo));
  const existentesSet=new Set((DB.cobros||[]).map(c=>c.nroRecibo));
  return{
    nuevos:recibosFinal.filter(r=>!existentesSet.has(r.nroRecibo)),
    actualizados:recibosFinal.filter(r=>existentesSet.has(r.nroRecibo)),
    aEliminar:(DB.cobros||[]).filter(c=>!nuevosSet.has(c.nroRecibo)),
  };
}

let tangoImportPendiente=null;

function analizarEstadoCuentaTango(){
  const archivo=$('tango-archivo')?.files?.[0];
  if(!archivo){toast('Elegí el archivo CSV del Estado de cuenta de Tango');return;}
  const lector=new FileReader();
  lector.onload=()=>{
    const analisis=parsearEstadoCuentaTango(String(lector.result||''));
    tangoImportPendiente=analisis;
    const el=$('tango-analisis-resultado');
    const btnConfirmar=$('btn-confirmar-import-tango');
    if(analisis.error){
      if(el)el.innerHTML=`<div style="color:var(--rojo);font-size:12px;">⚠️ ${analisis.error}</div>`;
      if(btnConfirmar)btnConfirmar.disabled=true;
      return;
    }
    const diffCobros=_diffCobrosTango(analisis.recibosFinal);
    const totalCambios=analisis.facturasNuevas.length+analisis.facturasActualizadas.length
      +diffCobros.nuevos.length+diffCobros.aEliminar.length;
    const cerradasCant=analisis.facturasActualizadas.filter(f=>f.cerrada).length;
    const alertasCant=analisis.facturasActualizadas.filter(f=>f.alertaNoConfirmada).length;
    const otrosTxt=Object.entries(analisis.otrosAplicados).map(([t,n])=>`${n}× ${t}`).join(', ');
    const sinMatch=[...analisis.clientesSinMatchear.entries()];
    if(el)el.innerHTML=`
      <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
        <div style="color:var(--texto-suave);">${analisis.totalFilas} filas procesadas del archivo.</div>
        <div>📄 Facturas nuevas a Facturas pendientes: <strong>${analisis.facturasNuevas.length}</strong></div>
        <div>🔄 Facturas existentes con saldo actualizado: <strong>${analisis.facturasActualizadas.length}</strong>${cerradasCant?` (${cerradasCant} quedan totalmente cobradas)`:''}</div>
        ${alertasCant?`<div style="color:var(--rojo);">⚠️ ${alertasCant} factura(s) marcada(s) "Cobrada (pendiente Tango)" que Tango TODAVÍA no confirmó — se mantiene la marca, se avisa en la tabla.</div>`:''}
        <div>💰 Recibos: <strong>${diffCobros.nuevos.length} nuevo(s)</strong>, ${diffCobros.actualizados.length} sin cambios/actualizados${diffCobros.aEliminar.length?`, <span style="color:var(--rojo);">${diffCobros.aEliminar.length} van a dejar de figurar</span> (no están en este archivo)`:''}</div>
        ${otrosTxt?`<div style="color:var(--texto-suave);">↪️ Notas de crédito/débito y otros aplicados (ya suman al saldo, no generan línea en Cobros registrados): ${otrosTxt}</div>`:''}
        ${analisis.filasNoReconocidas?`<div style="color:var(--naranja);">⚠️ ${analisis.filasNoReconocidas} fila(s) no reconocida(s) — revisá que sea el export correcto.</div>`:''}
        ${sinMatch.length?`<div style="color:var(--rojo);">⚠️ ${sinMatch.length} cliente(s) sin Código Tango cargado en su ficha — sus comprobantes NO se importan hasta cargarlo:<br>${sinMatch.map(([cod,nom])=>`&nbsp;&nbsp;· ${cod} — ${nom}`).join('<br>')}</div>`:''}
        ${!totalCambios&&!sinMatch.length?`<div style="color:var(--texto-suave);">Nada nuevo para importar respecto de lo que ya había cargado.</div>`:''}
      </div>`;
    if(btnConfirmar)btnConfirmar.disabled=totalCambios===0;
  };
  lector.onerror=()=>toast('No se pudo leer el archivo');
  lector.readAsText(archivo,'utf-8');
}

function confirmarImportacionEstadoCuentaTango(){
  const analisis=tangoImportPendiente;
  if(!analisis||analisis.error){toast('Analizá un archivo válido antes de confirmar');return;}
  const diffCobros=_diffCobrosTango(analisis.recibosFinal);
  if(analisis.facturasNuevas.length+analisis.facturasActualizadas.length+diffCobros.nuevos.length+diffCobros.aEliminar.length===0){
    toast('No hay cambios para importar');return;
  }
  let confirmadasPendientesTango=0,alertasNoConfirmadas=0,nSeqFact=0,nSeqCobro=0;

  analisis.facturasNuevas.forEach(f=>{
    const cli=DB.clientes.find(c=>c.id===f.clienteId);
    const nueva={
      id:Date.now()+(nSeqFact++),
      clienteId:f.clienteId,objetivoCod:f.objetivoCod,nroFactura:f.nroFactura,
      periodoDesde:'',periodoHasta:'',importe:f.importe,saldo:f.saldo,
      fechaFactura:f.fecha,vencimiento:f.vencimiento||'',
      formaPago:'Pendiente',
      contactoCobro:cli?.contactos?.find(c=>!c.aSatisfacer)?.nombre||'—',
      telefonoCobro:cli?.contactos?.find(c=>!c.aSatisfacer)?.tel||'—',
      horarioCobro:'Lun-Vie 9-17hs',ultimoContacto:'',proximaGestion:'',probCobro:50,
      estado:'Impago',fechaPosibleCobro:'',acciones:[],notas:'Importado desde Tango',
      alertaTangoNoConfirmo:false,
    };
    DB.facturas.push(nueva);
    supaSync('facturas',nueva);
  });

  analisis.facturasActualizadas.forEach(u=>{
    const f=DB.facturas.find(x=>x.nroFactura===u.nroFactura);
    if(!f)return;
    f.saldo=u.saldoNuevo;
    // C.8: si la gestora ya la había marcado a mano como "Cobrada
    // (pendiente Tango)", este import confirma (saldo 0) o avisa (sigue
    // con saldo) — la marca NO se borra en ese segundo caso.
    if(u.cerrada){
      if(f.estado==='Cobrada (pendiente Tango)')confirmadasPendientesTango++;
      f.estado='Cobrado';
      f.alertaTangoNoConfirmo=false;
      sincronizarComisionesFactura(f);
    }else{
      f.alertaTangoNoConfirmo=!!u.alertaNoConfirmada;
      if(u.alertaNoConfirmada)alertasNoConfirmadas++;
    }
    supaSync('facturas',f);
  });

  // C.9: Cobros se reconstruye entero — se borra lo que ya no viene en el
  // archivo y se inserta/actualiza (por nroRecibo, reusando id si ya existía
  // para que el upsert en Supabase pise el mismo registro) lo que sí viene.
  diffCobros.aEliminar.forEach(c=>{
    const idx=DB.cobros.findIndex(x=>String(x.id)===String(c.id));
    if(idx!==-1)DB.cobros.splice(idx,1);
    supaDel('cobros',c.id);
  });
  analisis.recibosFinal.forEach(r=>{
    const fact=DB.facturas.find(f=>f.nroFactura===r.nroFactura);
    const existente=DB.cobros.find(c=>c.nroRecibo===r.nroRecibo);
    const datos={
      clienteId:r.clienteId,objetivoCod:fact?.objetivoCod||r.objetivoCod,
      nroFactura:r.nroFactura,periodoDesde:fact?.periodoDesde||'',periodoHasta:fact?.periodoHasta||'',
      importeFacturado:r.importeFacturado,importeCobrado:r.importe,
      nroRecibo:r.nroRecibo,fechaCobro:r.fecha,fechaAcreditacion:'',
      formaPago:fact?.formaPago||'—',
    };
    if(existente){
      Object.assign(existente,datos);
      supaSync('cobros',existente);
    }else{
      const nuevo={id:Date.now()+(nSeqCobro++),...datos};
      DB.cobros.push(nuevo);
      supaSync('cobros',nuevo);
    }
  });

  const historialNuevo={
    id:Date.now(),
    tipo:'Estado de cuenta Tango',fecha:new Date().toLocaleDateString('es-AR'),
    cantidad:analisis.facturasNuevas.length+analisis.facturasActualizadas.length+analisis.recibosFinal.length,
    detalle:`${analisis.facturasNuevas.length} facturas nuevas · ${analisis.facturasActualizadas.length} actualizadas · ${diffCobros.nuevos.length} recibos nuevos · ${diffCobros.aEliminar.length} recibos dados de baja`,
  };
  DB.historialImportaciones.push(historialNuevo);
  supaSync('historialImportaciones',historialNuevo);
  renderHistorialImportaciones();

  if($('tango-archivo'))$('tango-archivo').value='';
  if($('tango-analisis-resultado'))$('tango-analisis-resultado').innerHTML='';
  if($('btn-confirmar-import-tango'))$('btn-confirmar-import-tango').disabled=true;
  tangoImportPendiente=null;
  renderCobros();renderCobrados();
  toast(`✓ Estado de cuenta de Tango importado: ${analisis.facturasNuevas.length} facturas nuevas, ${analisis.facturasActualizadas.length} actualizadas, ${diffCobros.nuevos.length} recibos nuevos${confirmadasPendientesTango?`, ${confirmadasPendientesTango} confirmaron una gestión pendiente`:''}${alertasNoConfirmadas?`, ⚠️ ${alertasNoConfirmadas} sin confirmar`:''}`,8000);
}

function renderHistorialImportaciones(){
  const el=$('historial-importaciones');if(!el)return;
  const hist=DB.historialImportaciones||[];
  if(!hist.length){el.innerHTML='<p class="text-muted" style="font-size:13px;">Sin importaciones realizadas aún.</p>';return;}
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:6px;">
    ${hist.slice().reverse().slice(0,10).map(h=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--fondo);border-radius:var(--radio);border:1px solid var(--borde);">
        <div><strong style="font-size:12px;">${h.tipo}</strong><div style="font-size:11px;color:var(--texto-suave);">${h.detalle||`${h.cantidad} registro(s)`}</div></div>
        <div style="font-size:11px;color:var(--texto-suave);">${h.fecha}</div>
      </div>`).join('')}
  </div>`;
}

// ========== PANTALLA COMISIONES (DELTA_comisiones_v1) ==========
// Cuenta corriente de comisiones por persona (interna de Legajos o
// externa). No hay entidad "coordinador" propia: la lista de personas
// se deriva de obj.comisiones[] de todos los servicios (punto 1 del
// delta: cualquier asociado puede traer una venta). El detalle por
// persona (punto 6) muestra los devengos de más antiguo a más nuevo; el
// pago (punto 7) se aplica FIFO por defecto y admite modo manual, ambos
// con trazabilidad completa vía comisionesPagos[].aplicaciones.
function tabComisiones(tab,btn){
  document.querySelectorAll('#screen-comisiones .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-comisiones .tab-btn').forEach(b=>b.classList.remove('active'));
  const el=$('com-tab-'+tab);if(el)el.classList.add('active');
  if(btn)btn.classList.add('active');
  if(tab==='pagos')renderComisionesPagosHistorial();
  if(tab==='externos')renderComisionesExternos();
}
function getPersonasComisionUnicas(){
  const map=new Map();
  DB.objetivos.forEach(o=>(o.comisiones||[]).forEach(c=>{
    const key=c.personaTipo+':'+c.personaRef;
    if(!map.has(key))map.set(key,{personaTipo:c.personaTipo,personaRef:c.personaRef,personaNombre:c.personaNombre,comisionesActivas:0});
    if(c.activa)map.get(key).comisionesActivas++;
  }));
  return[...map.values()];
}
// Proyección del mes en curso — Requerimiento de sincronización
// (04/08/2026), puntos 2/3: conecta valor de venta (Precios/Servicios)
// y horas facturadas (Liquidación de horas) con el % del coordinador
// para mostrar de entrada cuánto le correspondería cobrar, aunque
// todavía no haya ninguna factura cobrada (el devengo real sólo nace
// de facturas, ver sincronizarComisionesFactura — esto es una
// estimación aparte, nunca se persiste como devengo).
function proyeccionComisionServicio(obj,comision){
  const hoy=new Date();
  const mesActual=hoy.toISOString().slice(0,7);
  const fechaHoyDMY=hoy.toLocaleDateString('es-AR');
  let horas=0,montoBase=0,origenHoras='Abono mensual fijo';
  if(obj.modeloPrecio==='Abono mensual fijo'){
    montoBase=obj.valor||0;
  } else {
    const grilla=(DB.grillasLiq||[]).find(g=>g.periodo===mesActual&&g.objCodigo===obj.codigo);
    if(grilla){horas=grilla.totalHorasFacturables||0;origenHoras='Horas facturables cargadas este mes';}
    else {horas=obj.efts||0;origenHoras='EFT / horas contratadas (sin grilla de este mes todavía)';}
    montoBase=Math.round(horas*(obj.valorHora||0));
  }
  const pct=pctVigenteComision(comision,fechaHoyDMY);
  return{periodo:mesActual,horas,montoBase,pct,montoProyectado:Math.round(montoBase*pct/100),origenHoras};
}
function resumenPersonaComision(tipo,ref){
  const devs=DB.comisionesDevengos.filter(d=>d.personaTipo===tipo&&String(d.personaRef)===String(ref));
  const devengado=devs.filter(d=>d.estado==='Devengada').reduce((s,d)=>s+d.montoComision,0);
  const disponible=devs.filter(d=>d.estado==='Disponible').reduce((s,d)=>s+d.saldo,0);
  const pagado=(DB.comisionesPagos||[]).filter(p=>p.personaTipo===tipo&&String(p.personaRef)===String(ref)).reduce((s,p)=>s+p.monto,0);
  let proyectado=0;
  DB.objetivos.forEach(o=>(o.comisiones||[]).forEach(c=>{
    if(c.activa&&c.personaTipo===tipo&&String(c.personaRef)===String(ref)) proyectado+=proyeccionComisionServicio(o,c).montoProyectado;
  }));
  return{devengado,disponible,pagado,proyectado};
}
function renderComisiones(){
  const bg=($('buscar-comision-persona')||{value:''}).value.toLowerCase();
  const filtroTipo=($('cf-com-tipo')||{value:''}).value;
  let personas=getPersonasComisionUnicas();
  if(filtroTipo)personas=personas.filter(p=>p.personaTipo===filtroTipo);
  if(bg)personas=personas.filter(p=>p.personaNombre.toLowerCase().includes(bg));
  let totalDisponible=0,totalDevengado=0,personasConSaldo=0;
  const hoy=new Date();
  const pagadoMes=(DB.comisionesPagos||[]).filter(p=>{
    const f=_dmyPrecios(p.fecha);return f&&f.getMonth()===hoy.getMonth()&&f.getFullYear()===hoy.getFullYear();
  }).reduce((s,p)=>s+p.monto,0);
  const tbody=$('tbody-comisiones-cuenta');
  if(tbody){
    tbody.innerHTML=personas.map(p=>{
      const r=resumenPersonaComision(p.personaTipo,p.personaRef);
      totalDisponible+=r.disponible;totalDevengado+=r.devengado;
      if(r.disponible>0.01)personasConSaldo++;
      return`<tr>
        <td style="font-weight:500;">${p.personaNombre}</td>
        <td>${p.personaTipo==='externo'?'<span class="badge badge-gris">Externo</span>':'<span class="badge badge-azul">Interno</span>'}</td>
        <td style="text-align:center;">${p.comisionesActivas}</td>
        <td style="color:var(--azul);" title="Estimado con las horas/valor de este mes — todavía no facturado">$${Math.round(r.proyectado).toLocaleString('es-AR')}</td>
        <td style="color:var(--naranja);">$${Math.round(r.devengado).toLocaleString('es-AR')}</td>
        <td style="font-weight:700;color:var(--rojo);">$${Math.round(r.disponible).toLocaleString('es-AR')}</td>
        <td style="color:var(--verde);">$${Math.round(r.pagado).toLocaleString('es-AR')}</td>
        <td><button class="btn btn-secondary btn-xs" onclick="abrirComisionPersona('${p.personaTipo}','${p.personaRef}')">Ver detalle</button></td>
      </tr>`;
    }).join('')||`<tr><td colspan="8"><div class="empty-state"><div class="icon">🤝</div><p>Sin personas con comisión asignada todavía</p></div></td></tr>`;
  }
  if($('st-com-disponible'))$('st-com-disponible').textContent='$'+Math.round(totalDisponible/1000)+'k';
  if($('st-com-devengado'))$('st-com-devengado').textContent='$'+Math.round(totalDevengado/1000)+'k';
  if($('st-com-pagado-mes'))$('st-com-pagado-mes').textContent='$'+Math.round(pagadoMes/1000)+'k';
  if($('st-com-personas'))$('st-com-personas').textContent=personasConSaldo;
}
function renderComisionesPagosHistorial(){
  const tbody=$('tbody-comisiones-pagos');if(!tbody)return;
  const pagos=(DB.comisionesPagos||[]).slice().sort((a,b)=>_dmyPrecios(b.fecha)-_dmyPrecios(a.fecha));
  tbody.innerHTML=pagos.map(p=>`<tr>
    <td style="font-size:12px;">${p.fecha}</td>
    <td style="font-weight:500;">${p.personaNombre}</td>
    <td style="font-weight:700;color:var(--verde);">$${Math.round(p.monto).toLocaleString('es-AR')}</td>
    <td><span class="badge ${p.modo==='FIFO'?'badge-azul':'badge-naranja'}">${p.modo}</span></td>
    <td style="font-size:12px;">${p.referencia||'—'}</td>
    <td style="font-size:12px;">${p.registradoPor||'—'}</td>
  </tr>`).join('')||`<tr><td colspan="6"><div class="empty-state"><div class="icon">💵</div><p>Sin pagos registrados</p></div></td></tr>`;
}

// ── Personas externas ──
function agregarComisionExterno(){
  const nombre=$('com-ext-nombre')?.value.trim();
  if(!nombre){toast('Ingresá el nombre');return;}
  const nuevo={id:Date.now(),nombre,dni:$('com-ext-dni')?.value.trim()||'',tel:$('com-ext-tel')?.value.trim()||'',mail:'',activo:true};
  DB.comisionesExternos.push(nuevo);
  supaSync('comisionesExternos',nuevo);
  $('com-ext-nombre').value='';$('com-ext-dni').value='';$('com-ext-tel').value='';
  renderComisionesExternos();
  toast('✓ Persona externa agregada');
}
function eliminarComisionExterno(id){
  const ext=(DB.comisionesExternos||[]).find(e=>String(e.id)===String(id));
  if(!ext)return;
  if(!confirm(`¿Dar de baja a ${ext.nombre} como persona externa? No se borra el historial de comisiones ya generado.`))return;
  ext.activo=false;
  supaSync('comisionesExternos',ext);
  renderComisionesExternos();
}
function renderComisionesExternos(){
  const el=$('lista-comisiones-externos');if(!el)return;
  const activos=(DB.comisionesExternos||[]).filter(e=>e.activo);
  el.innerHTML=activos.length?activos.map(e=>`<div class="config-item">
    <span style="font-size:13px;">${e.nombre}${e.dni?` — DNI ${e.dni}`:''}${e.tel?` — ${e.tel}`:''}</span>
    <button class="btn btn-danger btn-xs" onclick="eliminarComisionExterno(${e.id})">Eliminar</button>
  </div>`).join(''):'<p class="text-muted" style="font-size:12px;">Sin personas externas cargadas</p>';
}

// ── Detalle por persona + registrar pago (modal dinámico) ──
function ensureModalComisionPersona(){
  if($('modal-comision-persona'))return;
  const m=document.createElement('div');
  m.className='modal-overlay';
  m.id='modal-comision-persona';
  m.innerHTML=`
    <div class="modal" style="max-width:780px;">
      <div class="modal-header"><h3 id="cp-titulo">🤝 Estado de cuenta</h3><button class="btn-close" onclick="cerrarModal('modal-comision-persona')">×</button></div>
      <div class="modal-body">
        <div class="info-grid" style="margin-bottom:14px;" id="cp-info-resumen"></div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Proyección del mes en curso (estimado, todavía no facturado)</div>
        <div id="cp-proyeccion-lista" style="margin-bottom:14px;display:flex;flex-direction:column;gap:6px;"></div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Comisiones (de más antigua a más nueva)</div>
        <div id="cp-devengos-lista" style="max-height:280px;overflow-y:auto;margin-bottom:14px;display:flex;flex-direction:column;gap:6px;"></div>

        <div style="background:var(--fondo);border-radius:var(--radio);padding:12px;border:1px solid var(--borde);">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;">💵 Registrar pago</div>
          <div class="form-grid form-grid-3" style="margin-bottom:8px;">
            <div class="form-group"><label>Monto pagado *</label><input type="number" id="cp-pago-monto" placeholder="$"></div>
            <div class="form-group"><label>Fecha del pago</label><input type="date" id="cp-pago-fecha"></div>
            <div class="form-group"><label>Referencia (opcional)</label><input type="text" id="cp-pago-ref" placeholder="Transferencia, N° comprobante..."></div>
          </div>
          <label style="font-size:11px;display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer;">
            <input type="checkbox" id="cp-pago-avanzado" onchange="toggleModoAvanzadoPago()"> Modo avanzado — elegir a qué comisiones aplicar el pago
          </label>
          <div id="cp-pago-checks" style="display:none;max-height:140px;overflow-y:auto;border:1px solid var(--borde);border-radius:var(--radio);padding:6px 10px;margin-bottom:8px;"></div>
          <button class="btn btn-primary btn-sm" onclick="guardarPagoComision()">Registrar pago</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
}
let _comisionPersonaAbierta=null;
function abrirComisionPersona(tipo,ref){
  ensureModalComisionPersona();
  _comisionPersonaAbierta={tipo,ref};
  if($('cp-pago-monto'))$('cp-pago-monto').value='';
  if($('cp-pago-fecha'))$('cp-pago-fecha').value=new Date().toISOString().slice(0,10);
  if($('cp-pago-ref'))$('cp-pago-ref').value='';
  if($('cp-pago-avanzado'))$('cp-pago-avanzado').checked=false;
  renderDetalleComisionPersona();
  abrirModal('modal-comision-persona');
}
function renderDetalleComisionPersona(){
  if(!_comisionPersonaAbierta)return;
  const{tipo,ref}=_comisionPersonaAbierta;
  const devs=DB.comisionesDevengos.filter(d=>d.personaTipo===tipo&&String(d.personaRef)===String(ref))
    .slice().sort((a,b)=>_dmyPrecios(a.fechaDevengo)-_dmyPrecios(b.fechaDevengo));
  const nombre=devs[0]?.personaNombre||getPersonasComisionUnicas().find(p=>p.personaTipo===tipo&&String(p.personaRef)===String(ref))?.personaNombre||'—';
  const r=resumenPersonaComision(tipo,ref);
  if($('cp-titulo'))$('cp-titulo').textContent=`🤝 Estado de cuenta — ${nombre}`;
  if($('cp-info-resumen'))$('cp-info-resumen').innerHTML=`
    <div class="info-item"><div class="key">Disponible para pagar</div><div class="val" style="font-weight:700;color:var(--rojo);">$${Math.round(r.disponible).toLocaleString('es-AR')}</div></div>
    <div class="info-item"><div class="key">Devengado (sin cobrar aún)</div><div class="val" style="color:var(--naranja);">$${Math.round(r.devengado).toLocaleString('es-AR')}</div></div>
    <div class="info-item"><div class="key">Pagado histórico</div><div class="val" style="color:var(--verde);">$${Math.round(r.pagado).toLocaleString('es-AR')}</div></div>`;
  const comisionesActivas=[];
  DB.objetivos.forEach(o=>(o.comisiones||[]).forEach(c=>{
    if(c.activa&&c.personaTipo===tipo&&String(c.personaRef)===String(ref)) comisionesActivas.push({obj:o,comision:c});
  }));
  if($('cp-proyeccion-lista'))$('cp-proyeccion-lista').innerHTML=comisionesActivas.map(({obj,comision})=>{
    const p=proyeccionComisionServicio(obj,comision);
    return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#eff6ff;border-radius:var(--radio);border:1px solid #bfdbfe;font-size:12px;">
      <div>
        <strong>${obj.nombre}</strong> — ${comision.tipo}<br>
        <span style="color:var(--texto-suave);">${p.origenHoras}${p.horas?` — ${p.horas}hs`:''} · ${p.pct}% de $${Math.round(p.montoBase).toLocaleString('es-AR')}</span>
      </div>
      <div style="text-align:right;font-weight:700;color:var(--azul);">$${Math.round(p.montoProyectado).toLocaleString('es-AR')}</div>
    </div>`;
  }).join('')||'<p class="text-muted" style="font-size:12px;">Sin comisiones activas en ningún servicio</p>';
  const estColor={'Devengada':'badge-naranja','Disponible':'badge-rojo','Pagada':'badge-verde'};
  if($('cp-devengos-lista'))$('cp-devengos-lista').innerHTML=devs.map(d=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--fondo);border-radius:var(--radio);border:1px solid var(--borde);font-size:12px;">
      <div>
        <strong>${d.objetivoNombre||d.objetivoCod}</strong> — ${d.clienteNombre} — período ${d.periodo}<br>
        <span style="color:var(--texto-suave);">Factura ${d.nroFactura} · ${d.pct}% de $${Math.round(d.montoBase).toLocaleString('es-AR')}</span>
      </div>
      <div style="text-align:right;">
        <span class="badge ${estColor[d.estado]||'badge-gris'}" style="font-size:10px;">${d.estado}</span>
        <div style="font-weight:700;margin-top:2px;">$${Math.round(d.montoComision).toLocaleString('es-AR')}</div>
        ${d.montoPagado>0?`<div style="font-size:10px;color:var(--texto-suave);">Pagado $${Math.round(d.montoPagado).toLocaleString('es-AR')} · saldo $${Math.round(d.saldo).toLocaleString('es-AR')}</div>`:''}
      </div>
    </div>`).join('')||'<p class="text-muted" style="font-size:12px;">Sin comisiones registradas todavía</p>';
  toggleModoAvanzadoPago();
}
function toggleModoAvanzadoPago(){
  if(!_comisionPersonaAbierta)return;
  const avanzado=$('cp-pago-avanzado')?.checked;
  const wrap=$('cp-pago-checks');
  if(!wrap)return;
  wrap.style.display=avanzado?'block':'none';
  if(avanzado){
    const{tipo,ref}=_comisionPersonaAbierta;
    const disponibles=DB.comisionesDevengos.filter(d=>d.personaTipo===tipo&&String(d.personaRef)===String(ref)&&d.estado==='Disponible'&&d.saldo>0.01)
      .slice().sort((a,b)=>_dmyPrecios(a.fechaDisponible)-_dmyPrecios(b.fechaDisponible));
    wrap.innerHTML=disponibles.map(d=>`<label style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;cursor:pointer;">
      <input type="checkbox" class="cp-check-devengo" value="${d.id}"> ${d.objetivoCod} — período ${d.periodo} — saldo $${Math.round(d.saldo).toLocaleString('es-AR')}
    </label>`).join('')||'<p class="text-muted" style="font-size:11px;">Sin comisiones disponibles para pagar</p>';
  }
}
// Aplica el pago de lo más viejo a lo más nuevo (punto 7 del delta).
// Admite parciales: cada devengo se salda cuando su saldo llega a 0 y el
// remanente pasa al siguiente. Queda registrado en comisionesPagos con
// el detalle de aplicación (trazabilidad) sin importar el modo.
function aplicarPagoFIFO(tipo,ref,nombre,monto,fecha,referencia){
  const devengos=DB.comisionesDevengos.filter(d=>d.personaTipo===tipo&&String(d.personaRef)===String(ref)&&d.estado==='Disponible'&&d.saldo>0.01)
    .slice().sort((a,b)=>_dmyPrecios(a.fechaDisponible)-_dmyPrecios(b.fechaDisponible));
  let restante=monto;
  const aplicaciones=[];
  devengos.forEach(d=>{
    if(restante<=0.01)return;
    const aplicar=Math.min(d.saldo,restante);
    d.montoPagado=(d.montoPagado||0)+aplicar;
    d.saldo=Math.round((d.saldo-aplicar)*100)/100;
    restante=Math.round((restante-aplicar)*100)/100;
    if(d.saldo<=0.01){d.saldo=0;d.estado='Pagada';d.fechaPago=fecha;}
    aplicaciones.push({devengoId:d.id,montoAplicado:aplicar});
    supaSync('comisionesDevengos',d);
  });
  const pago={id:Date.now(),personaTipo:tipo,personaRef:ref,personaNombre:nombre,monto,fecha,referencia:referencia||'',modo:'FIFO',aplicaciones,registradoPor:currentUser?.nombre||'',registradoEn:new Date().toISOString()};
  DB.comisionesPagos.push(pago);
  supaSync('comisionesPagos',pago);
  return pago;
}
// Excepción al FIFO (ej. acuerdo especial de pagar primero un servicio
// puntual) — misma trazabilidad, elige el usuario qué comisiones saldar.
function aplicarPagoManual(tipo,ref,nombre,monto,fecha,referencia,devengoIds){
  const seleccion=devengoIds.map(id=>DB.comisionesDevengos.find(d=>String(d.id)===String(id))).filter(Boolean)
    .sort((a,b)=>_dmyPrecios(a.fechaDisponible)-_dmyPrecios(b.fechaDisponible));
  let restante=monto;
  const aplicaciones=[];
  seleccion.forEach(d=>{
    if(restante<=0.01)return;
    const aplicar=Math.min(d.saldo,restante);
    d.montoPagado=(d.montoPagado||0)+aplicar;
    d.saldo=Math.round((d.saldo-aplicar)*100)/100;
    restante=Math.round((restante-aplicar)*100)/100;
    if(d.saldo<=0.01){d.saldo=0;d.estado='Pagada';d.fechaPago=fecha;}
    aplicaciones.push({devengoId:d.id,montoAplicado:aplicar});
    supaSync('comisionesDevengos',d);
  });
  const pago={id:Date.now(),personaTipo:tipo,personaRef:ref,personaNombre:nombre,monto,fecha,referencia:referencia||'',modo:'Manual',aplicaciones,registradoPor:currentUser?.nombre||'',registradoEn:new Date().toISOString()};
  DB.comisionesPagos.push(pago);
  supaSync('comisionesPagos',pago);
  return pago;
}
function guardarPagoComision(){
  if(!_comisionPersonaAbierta)return;
  const{tipo,ref}=_comisionPersonaAbierta;
  const monto=parseFloat($('cp-pago-monto')?.value)||0;
  const fechaInput=$('cp-pago-fecha')?.value;
  const fecha=fechaInput?new Date(fechaInput).toLocaleDateString('es-AR'):new Date().toLocaleDateString('es-AR');
  const referencia=$('cp-pago-ref')?.value.trim()||'';
  if(!monto){toast('Ingresá el monto pagado');return;}
  const nombre=getPersonasComisionUnicas().find(p=>p.personaTipo===tipo&&String(p.personaRef)===String(ref))?.personaNombre||'';
  const avanzado=$('cp-pago-avanzado')?.checked;
  if(avanzado){
    const ids=[...document.querySelectorAll('.cp-check-devengo:checked')].map(c=>c.value);
    if(!ids.length){toast('Elegí al menos una comisión para aplicar el pago (modo avanzado)');return;}
    const saldoSeleccion=ids.reduce((s,id)=>{const d=DB.comisionesDevengos.find(x=>String(x.id)===String(id));return s+(d?.saldo||0);},0);
    if(monto>saldoSeleccion+0.01){toast(`El monto supera el saldo de las comisiones elegidas ($${Math.round(saldoSeleccion).toLocaleString('es-AR')})`);return;}
    aplicarPagoManual(tipo,ref,nombre,monto,fecha,referencia,ids);
  } else {
    const r=resumenPersonaComision(tipo,ref);
    if(monto>r.disponible+0.01){toast(`El monto supera el saldo disponible de esta persona ($${Math.round(r.disponible).toLocaleString('es-AR')})`);return;}
    aplicarPagoFIFO(tipo,ref,nombre,monto,fecha,referencia);
  }
  if($('cp-pago-monto'))$('cp-pago-monto').value='';
  if($('cp-pago-ref'))$('cp-pago-ref').value='';
  renderDetalleComisionPersona();
  renderComisiones();
  toast('✓ Pago registrado');
}

// ========== ABM CATEGORÍAS SINDICALES (Punto 1) ==========
// Las categorías del sindicato son los "rubros" del convenio
// Se cargan mirando la escala del sindicato
DB.categoriasSalariales = [
  {id:1, nombre:'Operario/a limpieza', codigo:'LIM', valorHoraActual:4800},
  {id:2, nombre:'Operario/a limpieza especializado/a', codigo:'LIME', valorHoraActual:5200},
  {id:3, nombre:'Encargado/a de turno', codigo:'ENC', valorHoraActual:5800},
  {id:4, nombre:'Supervisor/a', codigo:'SUP', valorHoraActual:7200},
  {id:5, nombre:'Coordinador/a de área', codigo:'COORD', valorHoraActual:9500},
  {id:6, nombre:'Administrativo/a', codigo:'ADM', valorHoraActual:6400},
];

function abrirModalCategoriaSind(){
  ['cat-sind-nombre','cat-sind-codigo','cat-sind-obs'].forEach(id=>{const el=$(id);if(el)el.value='';});
  $('cat-sind-title').textContent='Nueva categoría sindical';
  abrirModal('modal-categoria-sind');
}

function guardarCategoriaSind(){
  const nombre=$('cat-sind-nombre')?.value.trim();
  if(!nombre){toast('Ingresá el nombre de la categoría');return;}
  const nueva={
    id:Date.now(), nombre,
    codigo:$('cat-sind-codigo')?.value.trim()||'',
    valorHoraActual:0, obs:$('cat-sind-obs')?.value||'',
  };
  DB.categoriasSalariales.push(nueva);
  supaSync('categoriasSalariales', DB.categoriasSalariales[DB.categoriasSalariales.length-1]); cerrarModal('modal-categoria-sind');
  renderCategoriasSind();
  poblarSelectCategoriaLiq();
  recalcLiquidacion();
  toast(`✓ Categoría "${nombre}" agregada`);
}

function renderCategoriasSind(){
  const el=$('lista-categorias-sind');if(!el)return;
  el.innerHTML=DB.categoriasSalariales.map((c,i)=>`
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;border-bottom:1px solid var(--borde);font-size:12px;">
      <div style="flex:1;">
        <span style="font-weight:500;">${c.nombre}</span>
        ${c.codigo?`<span style="font-size:10px;color:var(--texto-suave);margin-left:6px;">[${c.codigo}]</span>`:''}
      </div>
      ${c.valorHoraActual?`<span style="font-size:11px;color:var(--azul);font-weight:600;">$${c.valorHoraActual.toLocaleString('es-AR')}/h</span>`:''}
      <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:13px;" onclick="eliminarCategoriaSind(${i})" title="Eliminar">✕</button>
    </div>`).join('')||'<p class="text-muted" style="padding:10px;font-size:12px;">Sin categorías — agregá las del sindicato</p>';
}

function eliminarCategoriaSind(idx){
  const cat=DB.categoriasSalariales[idx];
  DB.categoriasSalariales.splice(idx,1);
  renderCategoriasSind();poblarSelectCategoriaLiq();recalcLiquidacion();
  toast(`Categoría "${cat.nombre}" eliminada`);
}

// ========== MEJORAS A CONCEPTOS — FÓRMULAS FLEXIBLES (Punto 2) ==========

function poblarSelectCategoriaLiq(){
  const sel=$('liq-categoria-sel');if(!sel)return;
  sel.innerHTML=DB.categoriasSalariales.map((c,i)=>`<option value="${c.id}">${c.nombre}</option>`).join('');
}

function renderConceptosLiq(){
  const el=$('lista-conceptos-liq'); if(!el) return;
  const tipoColor={remunerativo:'badge-azul',no_remunerativo:'badge-gris'};
  const calcLabel={manual:'manual',pct_basico:'% básico',pct_remunerativos:'% rem.',pct_concepto:'% concepto',fijo:'fijo'};
  el.innerHTML=DB.conceptosLiq.sort((a,b)=>a.orden-b.orden).map((c,i)=>`
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;border-bottom:1px solid var(--borde);font-size:12px;">
      <div style="flex:1;">
        <span style="font-weight:500;">${c.nombre}</span>
        <span class="badge ${tipoColor[c.tipo]||'badge-gris'}" style="font-size:9px;margin-left:5px;">${c.tipo==='remunerativo'?'Rem.':'No rem.'}</span>
        ${c.calculo!=='manual'?`<span style="font-size:10px;color:var(--azul);margin-left:4px;">(${c.pct||0}% ${calcLabel[c.calculo]||''})</span>`:''}
      </div>
      <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:13px;" onclick="eliminarConceptoLiq(${i})">✕</button>
    </div>`).join('')||'<p class="text-muted" style="padding:10px;font-size:12px;">Sin conceptos</p>';
}

function renderDescuentosLiq(){
  const el=$('lista-descuentos-liq'); if(!el) return;
  const baseLabel={remunerativo:'s/rem.',no_remunerativo:'s/no rem.',todos:'s/bruto',basico:'s/básico',conceptos_especificos:'s/esp.'};
  el.innerHTML=DB.descuentosLiq.map((d,i)=>`
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;border-bottom:1px solid var(--borde);font-size:12px;">
      <div style="flex:1;">
        <span style="font-weight:500;">${d.nombre}</span>
        <span style="font-size:10px;color:var(--texto-suave);margin-left:4px;">(${baseLabel[d.aplica]||d.aplica})</span>
      </div>
      <span style="color:var(--rojo);font-weight:600;">-${d.pct}%</span>
      <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:13px;" onclick="eliminarDescuentoLiq(${i})">✕</button>
    </div>`).join('')||'<p class="text-muted" style="padding:10px;font-size:12px;">Sin descuentos</p>';
}

function renderMesesLiq(){
  const el=$('lista-meses-liq');if(!el)return;
  el.innerHTML=DB.liquidacionMeses.map((m,i)=>{
    const[y,mo]=m.split('-');
    const nombre=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo)-1]+' '+y;
    return `<div style="display:flex;align-items:center;gap:4px;background:var(--azul-claro);border:1px solid var(--azul);border-radius:20px;padding:3px 10px;font-size:11px;">
      <span>${nombre}</span>
      <button style="background:none;border:none;cursor:pointer;color:var(--rojo);font-size:11px;" onclick="eliminarMesLiq(${i})">✕</button>
    </div>`;
  }).join('');
}

function agregarMesLiq(){
  const val=$('liq-nuevo-mes')?.value;
  if(!val){toast('Seleccioná un mes');return;}
  if(DB.liquidacionMeses.includes(val)){toast('Ese mes ya está en la grilla');return;}
  DB.liquidacionMeses.push(val);
  DB.liquidacionMeses.sort();
  renderMesesLiq();
  recalcLiquidacion();
}

function eliminarMesLiq(idx){
  DB.liquidacionMeses.splice(idx,1);
  renderMesesLiq();recalcLiquidacion();
}

function eliminarConceptoLiq(idx){
  DB.conceptosLiq.splice(idx,1);
  renderConceptosLiq();recalcLiquidacion();
}

function eliminarDescuentoLiq(idx){
  DB.descuentosLiq.splice(idx,1);
  renderDescuentosLiq();recalcLiquidacion();
}

function recalcLiquidacion(){
  const horas=parseInt($('liq-horas')?.value)||200;
  const catId=parseInt($('liq-categoria-sel')?.value)||1;
  const meses=DB.liquidacionMeses;
  if(!meses.length){
    const tbody=$('liq-tbody'); if(tbody) tbody.innerHTML='<tr><td colspan="2" style="padding:20px;text-align:center;color:var(--texto-muy-suave);">Agregá meses para ver la grilla</td></tr>';
    return;
  }
  if(!DB.liquidacionValoresCat[catId]) DB.liquidacionValoresCat[catId]={};
  const vals=DB.liquidacionValoresCat[catId];
  const fmtMes=m=>{const[y,mo]=m.split('-');return['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo)-1]+' '+y};

  // Header
  const thead=$('liq-thead');
  if(thead) thead.innerHTML=`<tr style="background:#f0f4ff;">
    <th style="padding:10px 14px;border:1px solid var(--borde);text-align:left;min-width:200px;position:sticky;left:0;background:#f0f4ff;z-index:1;">Concepto</th>
    <th style="padding:10px 8px;border:1px solid var(--borde);text-align:center;min-width:70px;background:#e8ecf8;">Tipo</th>
    ${meses.map(m=>`<th style="padding:10px 8px;border:1px solid var(--borde);text-align:right;min-width:110px;">${fmtMes(m)}</th>`).join('')}
  </tr>`;

  const conceptos=DB.conceptosLiq.sort((a,b)=>a.orden-b.orden);

  // Paso 1: calcular manuales y fijos
  const valoresPorMes={};
  meses.forEach(m=>{valoresPorMes[m]={};});
  conceptos.forEach(c=>{
    meses.forEach(m=>{
      if(c.calculo==='fijo') valoresPorMes[m][c.id]=c.fijo||0;
      else if(c.calculo==='manual') valoresPorMes[m][c.id]=parseFloat(vals[m]?.[c.id]||0);
      else valoresPorMes[m][c.id]=0;
    });
  });

  // Paso 2: calcular fórmulas (dependen de valores del paso 1)
  conceptos.forEach(c=>{
    if(c.calculo==='manual'||c.calculo==='fijo') return;
    meses.forEach(m=>{
      const basico=valoresPorMes[m][1]||0;
      if(c.calculo==='pct_basico'){
        valoresPorMes[m][c.id]=Math.round(basico*c.pct/100);
      } else if(c.calculo==='pct_remunerativos'){
        const totalRem=conceptos.filter(x=>x.tipo==='remunerativo').reduce((s,x)=>s+(valoresPorMes[m][x.id]||0),0);
        valoresPorMes[m][c.id]=Math.round(totalRem*c.pct/100);
      } else if(c.calculo==='pct_concepto'&&c.baseConceptoId){
        valoresPorMes[m][c.id]=Math.round((valoresPorMes[m][c.baseConceptoId]||0)*c.pct/100);
      }
    });
  });

  // Totales por tipo
  const totalBruto={};const totalRemun={};const totalNoRemun={};
  meses.forEach(m=>{totalBruto[m]=0;totalRemun[m]=0;totalNoRemun[m]=0;});
  conceptos.forEach(c=>{
    meses.forEach(m=>{
      const v=valoresPorMes[m][c.id]||0;
      totalBruto[m]+=v;
      if(c.tipo==='remunerativo') totalRemun[m]+=v;
      else totalNoRemun[m]+=v;
    });
  });

  // Calcular descuentos con base flexible
  const totalDesc={};meses.forEach(m=>totalDesc[m]=0);
  const calcDescLabel={remunerativo:'s/rem.',no_remunerativo:'s/no rem.',todos:'s/bruto',basico:'s/básico',conceptos_especificos:'s/esp.'};
  const filaDescuentos=DB.descuentosLiq.map(d=>{
    const celdas=meses.map(m=>{
      let base=0;
      if(d.aplica==='remunerativo') base=totalRemun[m];
      else if(d.aplica==='no_remunerativo') base=totalNoRemun[m];
      else if(d.aplica==='todos') base=totalBruto[m];
      else if(d.aplica==='basico') base=valoresPorMes[m][1]||0;
      else if(d.aplica==='conceptos_especificos'&&d.conceptosEspecificos?.length)
        base=(d.conceptosEspecificos).reduce((s,cid)=>s+(valoresPorMes[m][cid]||0),0);
      const val=Math.round(base*d.pct/100);
      totalDesc[m]+=val;
      return `<td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:var(--rojo);font-size:12px;">${val>0?'-$'+val.toLocaleString('es-AR'):'—'}</td>`;
    }).join('');
    return `<tr style="background:#fff5f5;">
      <td style="padding:8px 14px;border:1px solid var(--borde);color:var(--rojo);position:sticky;left:0;background:#fff5f5;z-index:1;">
        ${d.nombre} <span style="font-size:10px;">(-${d.pct}% ${calcDescLabel[d.aplica]||''})</span>
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><span class="badge badge-rojo" style="font-size:9px;">Desc.</span></td>
      ${celdas}
    </tr>`;
  });

  // Filas de conceptos
  const calcDescConcLabel={pct_basico:'% básico',pct_remunerativos:'% rem.',pct_concepto:'% concepto',fijo:'Fijo'};
  const filaConceptos=conceptos.map(c=>{
    const bgRow=c.tipo==='no_remunerativo'?'background:#fffef0;':'';
    const esCalculado=c.calculo!=='manual';
    const celdas=meses.map(m=>{
      const v=valoresPorMes[m][c.id]||0;
      return `<td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">
        ${esCalculado
          ? `<span style="font-size:12px;font-weight:500;color:var(--texto-suave);">${v>0?'$'+v.toLocaleString('es-AR'):'—'}</span>`
          : `<input type="number" value="${v||''}" placeholder="0"
              style="width:100%;border:none;background:transparent;text-align:right;font-size:12px;font-family:inherit;outline:none;padding:0 2px;"
              onchange="setValorLiq(${catId},'${m}',${c.id},this.value)">`
        }
      </td>`;
    }).join('');
    return `<tr style="${bgRow}">
      <td style="padding:8px 14px;border:1px solid var(--borde);font-weight:500;position:sticky;left:0;${bgRow||'background:white;'}z-index:1;">
        ${c.nombre}
        ${esCalculado?`<span style="font-size:10px;color:var(--azul);display:block;">${c.pct||0}% — ${calcDescConcLabel[c.calculo]||''}</span>`:''}
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        <span class="badge ${c.tipo==='remunerativo'?'badge-azul':'badge-gris'}" style="font-size:9px;">${c.tipo==='remunerativo'?'Rem.':'No rem.'}</span>
      </td>
      ${celdas}
    </tr>`;
  });

  const tbody=$('liq-tbody');
  if(tbody) tbody.innerHTML=filaConceptos.join('')+filaDescuentos.join('');

  // TFOOT
  const tfoot=$('liq-tfoot');
  if(tfoot){
    const totalNeto={};meses.forEach(m=>totalNeto[m]=totalBruto[m]-totalDesc[m]);
    const valorHora={};meses.forEach(m=>valorHora[m]=horas>0?Math.round(totalNeto[m]/horas):0);
    const pctAumento={};
    meses.forEach((m,i)=>{
      if(i===0){pctAumento[m]='—';return;}
      const prev=totalNeto[meses[i-1]]; const cur=totalNeto[m];
      if(!prev){pctAumento[m]='—';return;}
      const pct=((cur-prev)/prev*100).toFixed(1);
      pctAumento[m]=`<span style="color:${pct>0?'var(--verde)':'var(--rojo)'};font-weight:700;">${pct>0?'+':''}${pct}%</span>`;
    });
    tfoot.innerHTML=`
      <tr style="background:var(--azul-claro);font-weight:700;">
        <td colspan="2" style="padding:10px 14px;border:1px solid var(--borde);position:sticky;left:0;background:var(--azul-claro);">📊 TOTAL BRUTO</td>
        ${meses.map(m=>`<td style="padding:10px 8px;border:1px solid var(--borde);text-align:right;color:var(--azul);">$${totalBruto[m].toLocaleString('es-AR')}</td>`).join('')}
      </tr>
      <tr style="background:#fff5f5;font-weight:700;">
        <td colspan="2" style="padding:10px 14px;border:1px solid var(--borde);position:sticky;left:0;background:#fff5f5;">➖ TOTAL DESCUENTOS</td>
        ${meses.map(m=>`<td style="padding:10px 8px;border:1px solid var(--borde);text-align:right;color:var(--rojo);">-$${totalDesc[m].toLocaleString('es-AR')}</td>`).join('')}
      </tr>
      <tr style="background:var(--verde-claro);font-weight:800;">
        <td colspan="2" style="padding:10px 14px;border:2px solid var(--verde);position:sticky;left:0;background:var(--verde-claro);">✅ TOTAL NETO</td>
        ${meses.map(m=>`<td style="padding:10px 8px;border:2px solid var(--verde);text-align:right;font-size:14px;color:var(--verde);">$${totalNeto[m].toLocaleString('es-AR')}</td>`).join('')}
      </tr>
      <tr style="background:#f8f0ff;">
        <td colspan="2" style="padding:10px 14px;border:1px solid var(--borde);position:sticky;left:0;background:#f8f0ff;">⏱️ VALOR HORA (÷${horas}hs)</td>
        ${meses.map(m=>`<td style="padding:10px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:#7c3aed;">$${valorHora[m].toLocaleString('es-AR')}</td>`).join('')}
      </tr>
      <tr style="background:#fffbea;">
        <td colspan="2" style="padding:10px 14px;border:1px solid var(--borde);position:sticky;left:0;background:#fffbea;">📈 % AUMENTO vs. MES ANTERIOR</td>
        ${meses.map(m=>`<td style="padding:10px 8px;border:1px solid var(--borde);text-align:right;">${pctAumento[m]}</td>`).join('')}
      </tr>`;
  }
}

function setValorLiq(catId, mes, conceptoId, valor){
  if(!DB.liquidacionValoresCat[catId]) DB.liquidacionValoresCat[catId]={};
  if(!DB.liquidacionValoresCat[catId][mes]) DB.liquidacionValoresCat[catId][mes]={};
  DB.liquidacionValoresCat[catId][mes][conceptoId]=parseFloat(valor)||0;
  // Recalcular totales sin re-renderizar para no perder el foco
  recalcTotalesLiq();
}

function recalcTotalesLiq(){
  // Actualizar solo tfoot y filas de descuentos sin re-renderizar toda la tabla
  recalcLiquidacion();
}

function abrirModalConcepto(){
  ['conc-nombre','conc-codigo','conc-obs'].forEach(id=>{const el=$(id);if(el)el.value='';});
  if($('conc-pct')) $('conc-pct').value='';
  if($('conc-fijo-val')) $('conc-fijo-val').value='';
  if($('conc-orden')) $('conc-orden').value=String(DB.conceptosLiq.length+1);
  if($('conc-calculo')) $('conc-calculo').value='manual';
  if($('conc-tipo')) $('conc-tipo').value='remunerativo';
  if($('conc-aplica-desc')) $('conc-aplica-desc').value='1';
  $('concepto-modal-title').textContent='Nuevo concepto salarial';
  toggleConceptoCalculo();
  abrirModal('modal-concepto-liq');
}

function toggleConceptoCalculo(){
  const cal=$('conc-calculo')?.value;
  const pctRow=$('conc-pct-row');
  const fijoRow=$('conc-fijo-row');
  const manualRow=$('conc-manual-row');
  const baseConceptoRow=$('conc-base-concepto-row');
  if(pctRow) pctRow.style.display=(cal==='pct_basico'||cal==='pct_remunerativos'||cal==='pct_concepto')?'block':'none';
  if(fijoRow) fijoRow.style.display=(cal==='fijo')?'block':'none';
  if(manualRow) manualRow.style.display=(cal==='manual')?'block':'none';
  if(baseConceptoRow) baseConceptoRow.style.display=(cal==='pct_concepto')?'block':'none';
  if(cal==='pct_concepto'){
    const sel=$('conc-base-concepto-sel');
    if(sel) sel.innerHTML='<option value="">— Seleccionar —</option>'+
      DB.conceptosLiq.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
  }
  actualizarPreviewFormula();
}

function actualizarPreviewFormula(){
  const cal=$('conc-calculo')?.value;
  const pct=$('conc-pct')?.value||'0';
  const prev=$('conc-formula-preview'); if(!prev) return;
  const labels={
    'pct_basico':`Fórmula: ${pct}% × Sueldo básico`,
    'pct_remunerativos':`Fórmula: ${pct}% × Suma de todos los remunerativos`,
    'pct_concepto':`Fórmula: ${pct}% × Concepto seleccionado`,
    'fijo':`Importe fijo: el mismo valor cada mes`,
    'manual':`Ingreso manual: cargás el valor mes a mes en la grilla`,
  };
  prev.textContent=labels[cal]||'';
}

function guardarConceptoLiq(){
  const nombre=$('conc-nombre')?.value.trim();
  if(!nombre){toast('Ingresá el nombre del concepto');return;}
  const calculo=$('conc-calculo')?.value||'manual';
  const pct=parseFloat($('conc-pct')?.value)||0;
  if((calculo==='pct_basico'||calculo==='pct_remunerativos'||calculo==='pct_concepto')&&!pct){
    toast('Ingresá el porcentaje para la fórmula');return;
  }
  DB.conceptosLiq.push({
    id:Date.now(), nombre, codigo:$('conc-codigo')?.value||'',
    tipo:$('conc-tipo')?.value||'remunerativo',
    calculo, pct,
    baseConceptoId:parseInt($('conc-base-concepto-sel')?.value)||0,
    fijo:parseFloat($('conc-fijo-val')?.value)||0,
    aplicaDesc:($('conc-aplica-desc')?.value)==='1',
    orden:parseInt($('conc-orden')?.value)||99,
    obs:$('conc-obs')?.value||'',
  });
  cerrarModal('modal-concepto-liq');
  renderConceptosLiq(); recalcLiquidacion();
  supaSync('conceptosLiq', DB.conceptosLiq[DB.conceptosLiq.length-1]); toast('✓ Concepto agregado');
}

function abrirModalDescuento(){
  ['desc-nombre','desc-codigo','desc-obs'].forEach(id=>{const el=$(id);if(el)el.value='';});
  if($('desc-pct')) $('desc-pct').value='';
  if($('desc-aplica')) $('desc-aplica').value='remunerativo';
  if($('desc-quien')) $('desc-quien').value='empleado';
  const specDiv=$('desc-conceptos-spec'); if(specDiv) specDiv.style.display='none';
  abrirModal('modal-descuento-liq');
}

function toggleDescuentoBase(){
  const val=$('desc-aplica')?.value;
  const specDiv=$('desc-conceptos-spec'); if(!specDiv) return;
  specDiv.style.display=(val==='conceptos_especificos')?'block':'none';
  if(val==='conceptos_especificos'){
    const chkDiv=$('desc-conceptos-checkboxes');
    if(chkDiv) chkDiv.innerHTML=DB.conceptosLiq.map(c=>`
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:4px 0;">
        <input type="checkbox" class="desc-conc-chk" value="${c.id}">
        <span>${c.nombre}</span>
        <span class="badge ${c.tipo==='remunerativo'?'badge-azul':'badge-gris'}" style="font-size:9px;">${c.tipo==='remunerativo'?'Rem.':'No rem.'}</span>
      </label>`).join('');
  }
}

function guardarDescuentoLiq(){
  const nombre=$('desc-nombre')?.value.trim();
  const pct=parseFloat($('desc-pct')?.value)||0;
  if(!nombre||!pct){toast('Ingresá nombre y porcentaje');return;}
  const aplica=$('desc-aplica')?.value||'remunerativo';
  const conceptosEspecificos=aplica==='conceptos_especificos'
    ? [...document.querySelectorAll('.desc-conc-chk:checked')].map(c=>parseInt(c.value))
    : [];
  DB.descuentosLiq.push({
    id:Date.now(), nombre, codigo:$('desc-codigo')?.value||'',
    pct, aplica, conceptosEspecificos,
    quien:$('desc-quien')?.value||'empleado',
    obs:$('desc-obs')?.value||'',
  });
  cerrarModal('modal-descuento-liq');
  renderDescuentosLiq(); recalcLiquidacion();
  supaSync('descuentosLiq', DB.descuentosLiq[DB.descuentosLiq.length-1]); toast('✓ Descuento agregado');
}

function exportarLiquidacionCSV(){
  const catId=parseInt($('liq-categoria-sel')?.value)||1;
  const cat=DB.categoriasSalariales.find(c=>c.id===catId);
  const horas=parseInt($('liq-horas')?.value)||200;
  const meses=DB.liquidacionMeses;
  const fmtMes=m=>{const[y,mo]=m.split('-');return['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo)-1]+' '+y};
  let csv=`Liquidación UTEDYC — ${cat?.nombre||''};;${meses.map(fmtMes).join(';')}\n`;
  DB.conceptosLiq.sort((a,b)=>a.orden-b.orden).forEach(c=>{
    const vals=DB.liquidacionValoresCat[catId]||{};
    const getBasico=mes=>parseFloat(vals[mes]?.[1]||0);
    csv+=`${c.nombre};${c.tipo==='remunerativo'?'Rem.':'No rem.'};${meses.map(m=>{
      if(c.calculo==='pct_basico') return Math.round(getBasico(m)*c.pct/100);
      if(c.calculo==='fijo') return c.fijo||0;
      return parseFloat(vals[m]?.[c.id]||0);
    }).join(';')}\n`;
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`liquidacion_utedyc_${catId}.csv`;a.click();
  toast('✓ Exportado como CSV');
}

// ========== GESTIÓN DE PRECIOS v1 (DELTA_comercial_gestion_precios_v1, 30/07/2026) ==========
// Rehecho de punta a punta (ver decisión A.11: sin datos reales que migrar,
// el modelo pasa de "un % y una fecha sueltos" a "una propuesta con uno o
// más tramos (fecha+%), con dirección aumento/rebaja, en circuito
// Secuencia A (el Gerente autoriza ANTES de ir al cliente, dos
// intervenciones)". Los ids de campo pp-pct-teorico/comercial/acordado se
// mantienen tal cual (son internos, no se ven) — lo que cambia es el
// nombre visible en el HTML (punto 2: "Por paritaria" / "Propuesta de
// Ohlimpia" / "Ya acordado con el cliente") y las claves con las que se
// guarda en niveles: porParitaria/propuestaOhlimpia/yaAcordado.
const PP_NIVEL_A_CLAVE={teorico:'porParitaria',comercial:'propuestaOhlimpia',acordado:'yaAcordado'};

function _dmyPrecios(f){
  if(!f)return null;
  const p=f.split('/');if(p.length!==3)return null;
  const[dd,mm,yy]=p;
  return new Date(`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
}

// Punto 4: cálculo NO acumulativo — cada tramo se calcula sobre el % que
// lleva acumulado hasta ese punto, aplicado siempre al valor ORIGINAL (sin
// interés compuesto). tramos: [{pct,fechaVigencia}] con pct incremental de
// cada tramo (5% + 5% = 10% acumulado en el segundo, no 5%*1.05).
function calcularValoresTramos(valorBase,valorHoraBase,tramos,tipoModificacion){
  let acumulado=0;
  const signo=tipoModificacion==='Rebaja'?-1:1;
  return tramos.map(t=>{
    acumulado+=(t.pct||0);
    const factor=1+signo*acumulado/100;
    return{
      id:t.id||Date.now()+Math.floor(Math.random()*1e6),
      pct:t.pct||0,pctAcumulado:acumulado,fechaVigencia:t.fechaVigencia||'',
      valor:Math.round((valorBase||0)*factor),
      valorHora:valorHoraBase?Math.round(valorHoraBase*factor):0,
    };
  });
}

// Punto 5 — el % siempre positivo; tipoModificacion da la dirección.
function crearPropuestaPrecio({obj,cli,tipoModificacion,tramos,tipoConvalidar,niveles,clausula,motivo,proyeccionMeses,loteId,propuestaAnteriorId,origenParitaria}){
  const tramosCalc=calcularValoresTramos(obj.valor,obj.valorHora,tramos,tipoModificacion);
  const ultimo=tramosCalc[tramosCalc.length-1];
  return{
    id:Date.now()+Math.floor(Math.random()*1e6),
    objetivoId:obj.id,objetivoCod:obj.codigo,objetivoNombre:obj.nombre,
    clienteId:obj.clienteId,clienteNombre:cli?.nombre||'—',
    tipoModificacion,clausula:clausula||'',motivo:motivo||'',
    valorActual:obj.valor,valorHoraActual:obj.valorHora||0,
    valorPropuesto:ultimo?.valor??obj.valor,valorHoraPropuesto:ultimo?.valorHora??0,
    pctAumento:ultimo?.pctAcumulado??0,
    niveles:niveles||null,tipoConvalidar:tipoConvalidar||'',
    tramos:tramosCalc,
    fechaVigencia:tramosCalc[0]?.fechaVigencia||'',
    estado:'Pendiente autorización gerente',
    autorizadaPor:'',fechaAutorizacion:'',confirmadaPor:'',fechaConfirmacion:'',
    motivoRechazoGerente:'',motivoRechazoCliente:'',
    fechaPropuesta:new Date().toLocaleDateString('es-AR'),
    proyeccionMeses:proyeccionMeses||3,
    loteId:loteId||null,propuestaAnteriorId:propuestaAnteriorId||null,
    origenParitaria:origenParitaria||'',cargadoPor:currentUser?.nombre||'',
  };
}

// ---------- Modal "Nueva propuesta" — 3 niveles + tramos ----------
function toggleTipoModificacionPP(){
  const esRebaja=$('pp-tipo-modificacion')?.value==='Rebaja';
  if($('pp-aviso-rebaja'))$('pp-aviso-rebaja').style.display=esRebaja?'block':'none';
  if($('pp-motivo-label'))$('pp-motivo-label').textContent=esRebaja?'Motivo de la rebaja *':'Notas de la negociación';
  calcularPP('teorico');calcularPP('comercial');calcularPP('acordado');
}
function calcularPP(nivel){
  const id=parseInt($('pp-objetivo')?.value)||0;
  const obj=DB.objetivos.find(o=>o.id===id);
  if(!obj) return;
  const signo=$('pp-tipo-modificacion')?.value==='Rebaja'?-1:1;
  ['teorico','comercial','acordado'].forEach(niv=>{
    const pct=parseFloat($(`pp-pct-${niv}`)?.value)||0;
    const valEl=$(`pp-val-${niv}`);const vhEl=$(`pp-vh-${niv}-lbl`);
    // B.2 (bug confirmado): antes, si el campo quedaba en 0/vacío, esta
    // función cortaba acá sin resetear valEl/vhEl — el último valor
    // calculado quedaba "fantasma" en pantalla. Ahora siempre se resetea.
    if(!pct){
      if(valEl)valEl.textContent='—';
      if(vhEl)vhEl.textContent='';
      return;
    }
    const nuevoValor=Math.round(obj.valor*(1+signo*pct/100));
    const nuevoVH=obj.valorHora?Math.round(obj.valorHora*(1+signo*pct/100)):0;
    if(valEl) valEl.textContent='$'+nuevoValor.toLocaleString('es-AR')+'/mes';
    if(vhEl) vhEl.textContent=nuevoVH?'Valor hora: $'+nuevoVH.toLocaleString('es-AR'):'';
  });
  sincronizarTramoUnicoPP();
  // Preview con el tipo seleccionado
  const tipoSel=$('pp-tipo-propuesta')?.value||'acordado';
  const pctSel=parseFloat($(`pp-pct-${tipoSel}`)?.value)||0;
  const prev=$('pp-proyeccion-preview');
  if(!prev)return;
  if(!pctSel){prev.innerHTML='';return;}
  const nuevoValor=Math.round(obj.valor*(1+signo*pctSel/100));
  const meses=parseInt($('pp-meses-proy')?.value)||3;
  const impacto=(nuevoValor-obj.valor)*meses;
  prev.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;">
    <div><div style="font-size:11px;color:var(--texto-suave);">Valor actual</div><div style="font-weight:700;font-size:14px;">$${Math.round(obj.valor/1000)}k/mes</div></div>
    <div><div style="font-size:11px;color:var(--texto-suave);">Nuevo valor (último tramo)</div><div style="font-weight:700;font-size:14px;color:var(--azul);">$${Math.round(nuevoValor/1000)}k/mes</div></div>
    <div><div style="font-size:11px;color:var(--texto-suave);">Impacto ${meses} meses</div><div style="font-weight:700;font-size:14px;color:${impacto>=0?'var(--verde)':'var(--rojo)'};">${impacto>=0?'+':'-'}$${Math.round(Math.abs(impacto)/1000)}k</div></div>
  </div>`;
}

// ---------- Cronograma de tramos (punto 4) ----------
let tramosPPTemp=[];
function totalPctSeleccionadoPP(){
  const tipoSel=$('pp-tipo-propuesta')?.value||'acordado';
  return parseFloat($(`pp-pct-${tipoSel}`)?.value)||0;
}
function agregarTramoPP(){
  tramosPPTemp.push({id:Date.now()+tramosPPTemp.length,pct:0,fechaVigencia:''});
  renderTramosPP();
}
function quitarTramoPP(id){
  if(tramosPPTemp.length<=1){toast('Tiene que haber al menos un tramo');return;}
  tramosPPTemp=tramosPPTemp.filter(t=>t.id!==id);
  renderTramosPP();
}
function actualizarTramoPP(id,campo,valor){
  const t=tramosPPTemp.find(x=>x.id===id);
  if(t)t[campo]=valor;
  chequearSumaTramosPP();
}
// Con un solo tramo (caso no escalonado, el más común) se mantiene
// sincronizado con el % total automáticamente. Con más de uno, el reparto
// es manual — solo se re-chequea que sigan sumando el total.
function sincronizarTramoUnicoPP(){
  if(tramosPPTemp.length===1){
    tramosPPTemp[0].pct=totalPctSeleccionadoPP();
    renderTramosPP();
  }else{
    chequearSumaTramosPP();
  }
}
function renderTramosPP(){
  const el=$('pp-tramos-lista');if(!el)return;
  el.innerHTML=tramosPPTemp.map((t,i)=>`
    <div style="display:grid;grid-template-columns:70px 1fr 1fr auto;gap:8px;align-items:center;">
      <span style="font-size:11px;color:var(--texto-suave);">Tramo ${i+1}</span>
      <input type="number" min="0" max="500" step="0.1" value="${t.pct||''}" placeholder="%" oninput="actualizarTramoPP(${t.id},'pct',parseFloat(this.value)||0)" style="padding:5px 8px;border:1px solid var(--borde-fuerte);border-radius:5px;font-size:12px;outline:none;">
      <input type="date" value="${t.fechaVigencia||''}" onchange="actualizarTramoPP(${t.id},'fechaVigencia',this.value)" style="padding:5px 8px;border:1px solid var(--borde-fuerte);border-radius:5px;font-size:12px;outline:none;">
      <button class="btn btn-secondary btn-xs" onclick="quitarTramoPP(${t.id})" title="Quitar tramo">✕</button>
    </div>`).join('');
  chequearSumaTramosPP();
}
function chequearSumaTramosPP(){
  const el=$('pp-tramos-check');if(!el)return false;
  const total=totalPctSeleccionadoPP();
  const suma=tramosPPTemp.reduce((s,t)=>s+(t.pct||0),0);
  const ok=Math.abs(suma-total)<0.05;
  el.innerHTML=ok
    ?`<span style="color:var(--verde);">✓ Los tramos suman ${suma.toFixed(1)}% — coincide con el total a convalidar</span>`
    :`<span style="color:var(--rojo);">⚠️ Los tramos suman ${suma.toFixed(1)}%, pero el total a convalidar es ${total.toFixed(1)}% — no cierra.</span>`;
  return ok;
}

function guardarPropuestaPrecio(){
  const id=parseInt($('pp-objetivo')?.value)||0;
  const obj=DB.objetivos.find(o=>o.id===id);
  if(!obj){toast('Seleccioná un objetivo');return;}
  const cli=DB.clientes.find(c=>c.id===obj.clienteId);
  const tipoModificacion=$('pp-tipo-modificacion')?.value||'Aumento';
  const tipoSel=$('pp-tipo-propuesta')?.value||'acordado';
  const pctFinal=totalPctSeleccionadoPP()||
    parseFloat($('pp-pct-acordado')?.value)||parseFloat($('pp-pct-comercial')?.value)||parseFloat($('pp-pct-teorico')?.value)||0;
  if(!pctFinal){toast('Completá al menos un nivel con % (siempre en positivo)');return;}
  if(!tramosPPTemp.length||tramosPPTemp.some(t=>!t.pct||!t.fechaVigencia)){toast('Completá % y fecha de vigencia en todos los tramos');return;}
  if(!chequearSumaTramosPP()){toast('Los tramos no suman el % total — revisá el cronograma');return;}
  const motivo=$('pp-motivo')?.value.trim()||'';
  if(tipoModificacion==='Rebaja'&&!motivo){toast('Una rebaja necesita motivo — es obligatorio');return;}

  const pctTeorico=parseFloat($('pp-pct-teorico')?.value)||0;
  const pctComercial=parseFloat($('pp-pct-comercial')?.value)||0;
  const pctAcordado=parseFloat($('pp-pct-acordado')?.value)||0;
  const signo=tipoModificacion==='Rebaja'?-1:1;
  const niveles={
    porParitaria:{pct:pctTeorico,valor:pctTeorico?Math.round(obj.valor*(1+signo*pctTeorico/100)):0},
    propuestaOhlimpia:{pct:pctComercial,valor:pctComercial?Math.round(obj.valor*(1+signo*pctComercial/100)):0},
    yaAcordado:{pct:pctAcordado,valor:pctAcordado?Math.round(obj.valor*(1+signo*pctAcordado/100)):0},
  };

  const propuesta=crearPropuestaPrecio({
    obj,cli,tipoModificacion,tramos:tramosPPTemp,
    tipoConvalidar:PP_NIVEL_A_CLAVE[tipoSel],niveles,
    clausula:$('pp-clausula')?.value||'',motivo,
    proyeccionMeses:parseInt($('pp-meses-proy')?.value)||3,
    propuestaAnteriorId:_propuestaAnteriorIdPP,
  });
  DB.propuestasPrecios.push(propuesta);
  supaSync('propuestasPrecios',propuesta);
  cerrarModal('modal-propuesta-precio');construirMenu();renderPrecios();
  toast(`✓ Propuesta enviada al Gerente para autorización — ${tipoModificacion} de ${pctFinal.toFixed(1)}% en ${tramosPPTemp.length} tramo${tramosPPTemp.length!==1?'s':''}`,6000);
}

// ---------- Motivo genérico (rechazos del circuito de precios) ----------
// Evita usar prompt() del navegador (ya hay varios usos legacy de prompt()
// documentados como pendientes de reemplazar — no se suma uno más acá).
let _motivoPrecioCallback=null;
function pedirMotivoPrecio(titulo,callback){
  _motivoPrecioCallback=callback;
  if($('mp-titulo'))$('mp-titulo').textContent=titulo;
  if($('mp-texto'))$('mp-texto').value='';
  abrirModal('modal-motivo-precio');
}
function confirmarMotivoPrecio(){
  const texto=$('mp-texto')?.value.trim();
  if(!texto){toast('El motivo es obligatorio');return;}
  cerrarModal('modal-motivo-precio');
  const cb=_motivoPrecioCallback;_motivoPrecioCallback=null;
  if(cb)cb(texto);
}

// ---------- Circuito de aprobación — Secuencia A (punto 1) ----------
// 1. Carga → Pendiente autorización gerente.
// 2. Gerente autoriza la SALIDA (antes de ir al cliente) o rechaza interno.
// 3. Se envía la carta (marcarEnviadaCliente).
// 4. El cliente responde: acepta → Gerente confirma el CIERRE (2ª
//    intervención) → Vigente; rechaza → Rechazada por el cliente, se puede
//    rearmar con un aumento más bajo (nueva fila, no se pisa la anterior).
function _esGerentePrecios(){
  return !!(currentUser&&(currentUser.perfil==='Administrador total'||
    currentUser.funcion==='Gerente'||currentUser.funcion==='Gerente General'||currentUser.funcion==='Coordinador/a'));
}
function autorizarSalidaPrecio(idx){
  if(!_esGerentePrecios()){toast('⛔ Solo el Gerente Comercial puede autorizar la salida al cliente');return;}
  const p=DB.propuestasPrecios[idx];if(!p)return;
  p.estado='Autorizada — lista para enviar';
  p.autorizadaPor=currentUser.nombre;p.fechaAutorizacion=new Date().toLocaleDateString('es-AR');
  supaSync('propuestasPrecios',p);
  construirMenu();renderPrecios();
  toast(`✓ Salida autorizada — ${p.objetivoNombre}, lista para enviarle la carta al cliente`);
}
function rechazarInternoPrecio(idx){
  if(!_esGerentePrecios()){toast('⛔ Solo el Gerente Comercial puede rechazar');return;}
  const p=DB.propuestasPrecios[idx];if(!p)return;
  pedirMotivoPrecio('Motivo del rechazo interno (antes de ir al cliente)',(motivo)=>{
    p.estado='Rechazada — interna';p.motivoRechazoGerente=motivo;
    supaSync('propuestasPrecios',p);
    construirMenu();renderPrecios();
    toast('Propuesta rechazada internamente — se puede rearmar');
  });
}
function marcarEnviadaCliente(idx){
  const p=DB.propuestasPrecios[idx];if(!p)return;
  p.estado='Enviada al cliente';
  supaSync('propuestasPrecios',p);
  renderPrecios();
  toast(`✓ Marcada como enviada al cliente — ${p.objetivoNombre}`);
}
function confirmarCierreCliente(idx){
  if(!_esGerentePrecios()){toast('⛔ Solo el Gerente Comercial puede confirmar el cierre');return;}
  const p=DB.propuestasPrecios[idx];if(!p)return;
  p.estado='Vigente';
  p.confirmadaPor=currentUser.nombre;p.fechaConfirmacion=new Date().toLocaleDateString('es-AR');
  aplicarPropuestaAlObjetivo(p);
  supaSync('propuestasPrecios',p);
  construirMenu();renderPrecios();renderObjetivos();
  toast(`✓ Cierre confirmado — ${p.objetivoNombre}, ${p.tramos.length>1?'primer tramo':'precio'} vigente desde ${p.fechaVigencia}`,6000);
}
function rechazoClientePrecio(idx){
  const p=DB.propuestasPrecios[idx];if(!p)return;
  pedirMotivoPrecio('Motivo del rechazo del cliente',(motivo)=>{
    p.estado='Rechazada por el cliente';p.motivoRechazoCliente=motivo;
    supaSync('propuestasPrecios',p);
    construirMenu();renderPrecios();
    toast('Registrado — se puede abrir una nueva ronda con un aumento más bajo');
  });
}
let _propuestaAnteriorIdPP=null;
function rearmarPropuesta(idx){
  const p=DB.propuestasPrecios[idx];if(!p)return;
  abrirModalPropuestaPrecio(p);
  toast('Propuesta anterior cargada como base — ajustá el % y volvé a enviar');
}
function autorizarLotePrecio(loteId){
  if(!_esGerentePrecios()){toast('⛔ Solo el Gerente Comercial puede autorizar');return;}
  let n=0;
  DB.propuestasPrecios.forEach(p=>{
    if(p.loteId===loteId&&p.estado==='Pendiente autorización gerente'){
      p.estado='Autorizada — lista para enviar';
      p.autorizadaPor=currentUser.nombre;p.fechaAutorizacion=new Date().toLocaleDateString('es-AR');
      supaSync('propuestasPrecios',p);
      n++;
    }
  });
  construirMenu();renderPrecios();
  toast(`✓ Lote autorizado — ${n} propuesta${n!==1?'s':''} lista${n!==1?'s':''} para enviar`);
}

// ---------- Aplicación de tramos al objetivo (punto 4) ----------
// Al confirmar el cierre, TODOS los tramos del paquete se cargan al
// historial del objetivo de una — pero eso no significa que se apliquen
// todos ya: cada uno entra solo en su fecha (aplicarTramosVencidos), sin
// otra confirmación manual. Historización pura: no se pisa nada, cada
// tramo queda como una entrada propia con su estado (Programado/Vigente/
// Histórico) recalculado cada vez que se visita la pantalla.
function aplicarPropuestaAlObjetivo(p){
  const obj=DB.objetivos.find(o=>o.id===p.objetivoId)||DB.objetivos.find(o=>o.codigo===p.objetivoCod);
  if(!obj)return;
  if(!obj.historialPrecios)obj.historialPrecios=[];
  p.tramos.forEach(t=>{
    obj.historialPrecios.push({
      fecha:t.fechaVigencia,valor:t.valor,valorHora:t.valorHora,
      motivo:p.motivo,aprobadoPor:p.confirmadaPor,estado:'Programado',
      propuestaId:p.id,tipoModificacion:p.tipoModificacion,
    });
  });
  supaSync('objetivos',objetivoParaGuardar(obj));
  aplicarTramosVencidos();
}
function aplicarTramosVencidos(){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  let aplicados=0;
  DB.objetivos.forEach(obj=>{
    const hist=obj.historialPrecios||[];
    if(!hist.length)return;
    const vencidos=hist.filter(h=>{const f=_dmyPrecios(h.fecha);return f&&f<=hoy;}).sort((a,b)=>_dmyPrecios(b.fecha)-_dmyPrecios(a.fecha));
    const vigente=vencidos[0]||null;
    hist.forEach(h=>{
      const f=_dmyPrecios(h.fecha);if(!f)return;
      h.estado=f>hoy?'Programado':(h===vigente?'Vigente':'Histórico');
    });
    if(vigente&&obj.valor!==vigente.valor){
      obj.valor=vigente.valor;
      obj.valorHora=vigente.valorHora||0;
      obj.valorEft=obj.efts?Math.round(vigente.valor/obj.efts):0;
      supaSync('objetivos',objetivoParaGuardar(obj));
      aplicados++;
    }
  });
  return aplicados;
}

// ---------- Carga masiva por cliente (punto 6) ----------
function abrirModalLotePrecios(){
  const sel=$('lote-cliente');
  if(sel){sel.innerHTML='<option value="">— Seleccionar cliente —</option>'+DB.clientes.filter(c=>c.estado==='Activo').map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');}
  if($('lote-pct-general'))$('lote-pct-general').value='';
  if($('lote-fecha-vig'))$('lote-fecha-vig').value='';
  if($('lote-motivo'))$('lote-motivo').value='';
  if($('lote-tipo-modificacion'))$('lote-tipo-modificacion').value='Aumento';
  if($('lote-servicios-lista'))$('lote-servicios-lista').innerHTML='<p class="text-muted" style="padding:10px;font-size:12px;">Elegí un cliente para ver sus servicios.</p>';
  if($('lote-aviso-rebaja'))$('lote-aviso-rebaja').style.display='none';
  abrirModal('modal-lote-precios');
}
function cargarServiciosLotePrecios(){
  const clienteId=parseInt($('lote-cliente')?.value)||0;
  const el=$('lote-servicios-lista');if(!el)return;
  const servicios=DB.objetivos.filter(o=>o.clienteId===clienteId&&o.estado==='Operativo'&&!o.anulado);
  if(!servicios.length){el.innerHTML='<p class="text-muted" style="padding:10px;font-size:12px;">Este cliente no tiene servicios operativos.</p>';return;}
  el.innerHTML=servicios.map(o=>`
    <div style="display:grid;grid-template-columns:auto 1fr 90px 100px 130px;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--borde);font-size:12px;">
      <input type="checkbox" class="lote-chk-servicio" data-obj-id="${o.id}" checked>
      <div><div style="font-weight:600;">${o.nombre}</div><div style="font-size:10px;color:var(--texto-suave);">$${(o.valor||0).toLocaleString('es-AR')}/mes</div></div>
      <input type="number" class="lote-pct-servicio" data-obj-id="${o.id}" min="0" max="500" step="0.1" value="0" oninput="recalcularFilaLote(${o.id})" style="padding:4px 6px;border:1px solid var(--borde-fuerte);border-radius:5px;font-size:11px;outline:none;">
      <span id="lote-valor-nuevo-${o.id}" style="font-weight:600;color:var(--azul);">—</span>
      <input type="date" class="lote-fecha-servicio" data-obj-id="${o.id}" style="padding:4px 6px;border:1px solid var(--borde-fuerte);border-radius:5px;font-size:11px;outline:none;">
    </div>`).join('');
  aplicarPctGeneralLote();
}
function aplicarPctGeneralLote(){
  const pctGeneral=parseFloat($('lote-pct-general')?.value)||0;
  const fechaGeneral=$('lote-fecha-vig')?.value||'';
  const esRebaja=$('lote-tipo-modificacion')?.value==='Rebaja';
  if($('lote-aviso-rebaja'))$('lote-aviso-rebaja').style.display=esRebaja?'block':'none';
  document.querySelectorAll('.lote-pct-servicio').forEach(inp=>{inp.value=pctGeneral;});
  document.querySelectorAll('.lote-fecha-servicio').forEach(inp=>{if(!inp.value)inp.value=fechaGeneral;});
  document.querySelectorAll('.lote-chk-servicio').forEach(chk=>recalcularFilaLote(parseInt(chk.dataset.objId)));
}
function recalcularFilaLote(objId){
  const obj=DB.objetivos.find(o=>o.id===objId);if(!obj)return;
  const pct=parseFloat(document.querySelector(`.lote-pct-servicio[data-obj-id="${objId}"]`)?.value)||0;
  const esRebaja=$('lote-tipo-modificacion')?.value==='Rebaja';
  const factor=1+(esRebaja?-1:1)*pct/100;
  const nuevo=Math.round((obj.valor||0)*factor);
  const lbl=$(`lote-valor-nuevo-${objId}`);
  if(lbl)lbl.textContent=pct?'$'+nuevo.toLocaleString('es-AR'):'—';
}
function guardarLotePrecios(){
  const clienteId=parseInt($('lote-cliente')?.value)||0;
  const cli=DB.clientes.find(c=>c.id===clienteId);
  if(!cli){toast('Elegí un cliente');return;}
  const tipoModificacion=$('lote-tipo-modificacion')?.value||'Aumento';
  const motivo=$('lote-motivo')?.value.trim()||'';
  if(tipoModificacion==='Rebaja'&&!motivo){toast('La rebaja necesita motivo — es obligatorio');return;}
  const loteId='lote-'+Date.now();
  let creadas=0;
  document.querySelectorAll('.lote-chk-servicio:checked').forEach(chk=>{
    const objId=parseInt(chk.dataset.objId);
    const obj=DB.objetivos.find(o=>o.id===objId);if(!obj)return;
    const pct=parseFloat(document.querySelector(`.lote-pct-servicio[data-obj-id="${objId}"]`)?.value)||0;
    const fecha=document.querySelector(`.lote-fecha-servicio[data-obj-id="${objId}"]`)?.value;
    if(!pct||!fecha)return; // se saltea lo que no esté completo — no se fuerza a completar todo el lote
    const fechaFmt=new Date(fecha).toLocaleDateString('es-AR');
    const signo=tipoModificacion==='Rebaja'?-1:1;
    const nivelUnico={pct,valor:Math.round(obj.valor*(1+signo*pct/100))};
    const propuesta=crearPropuestaPrecio({
      obj,cli,tipoModificacion,tramos:[{pct,fechaVigencia:fechaFmt}],
      tipoConvalidar:'propuestaOhlimpia',
      niveles:{porParitaria:{pct:0,valor:0},propuestaOhlimpia:nivelUnico,yaAcordado:{pct:0,valor:0}},
      clausula:'',motivo,proyeccionMeses:3,loteId,
    });
    DB.propuestasPrecios.push(propuesta);
    supaSync('propuestasPrecios',propuesta);
    creadas++;
  });
  if(!creadas){toast('No se generó ninguna propuesta — completá % y fecha en al menos un servicio');return;}
  cerrarModal('modal-lote-precios');
  construirMenu();renderPrecios();
  toast(`✓ ${creadas} propuesta${creadas!==1?'s':''} generada${creadas!==1?'s':''} para ${cli.nombre} — pendientes de autorización del Gerente. Podés autorizar todo el lote de una desde la tabla.`,7000);
}

// ========== DASHBOARD DE INICIO ==========

// (Duplicado sin guard de DB.categoriasSalariales eliminado — v040, Parte B. Pisaba en runtime al seed con codigo de la línea ~2617, dejando el badge de código del ABM de categorías sindicales siempre vacío.)

DB.paritarias = [
  {
    id:1, nombre:'Paritaria UTEDYC 2025 — 2do tramo', sindicato:'UTEDYC',
    fecha:'15/09/2025', vigencia:'01/10/2025', pctAumento:22,
    homologada:true, fechaHomologacion:'20/09/2025',
    estadoAplicacion:'Aplicada', obs:'Segundo tramo del acuerdo anual.',
    escala:[
      {categoria:'Operario/a limpieza',         valorAnterior:3934, valorNuevo:4800},
      {categoria:'Operario/a limpieza especializado/a', valorAnterior:4262, valorNuevo:5200},
      {categoria:'Encargado/a de turno',         valorAnterior:4754, valorNuevo:5800},
      {categoria:'Supervisor/a',                 valorAnterior:5901, valorNuevo:7200},
      {categoria:'Coordinador/a de área',        valorAnterior:7787, valorNuevo:9500},
      {categoria:'Administrativo/a',             valorAnterior:5245, valorNuevo:6400},
    ],
  },
];

function renderParitarias(){
  const pars = DB.paritarias||[];
  $('st-par-total').textContent = pars.length;
  $('st-par-homo').textContent  = pars.filter(p=>p.homologada).length;
  $('st-par-nohomo').textContent= pars.filter(p=>!p.homologada).length;
  $('st-par-aplicar').textContent=pars.filter(p=>p.homologada&&p.estadoAplicacion==='Sin aplicar').length;

  // Poblar selects de tabs
  const opts = pars.map(p=>`<option value="${p.id}">${p.nombre}${p.homologada?' ✅':' ⚠️'}</option>`).join('');
  ['cf-escala-par','cf-par-asoc','cf-par-cli','cf-par-proy'].forEach(id=>{
    const el=$(id); if(!el) return;
    el.innerHTML='<option value="">— Seleccionar paritaria —</option>'+opts;
  });

  const tbody=$('tbody-paritarias'); if(!tbody) return;
  const estColor={'Sin aplicar':'badge-acento','Aplicada':'badge-verde','Proyección':'badge-gris'};
  tbody.innerHTML = pars.map((p,i)=>`<tr>
    <td style="font-weight:600;">${p.nombre}</td>
    <td><span class="chip" style="font-size:11px;">${p.sindicato}</span></td>
    <td style="font-size:12px;">${p.fecha}</td>
    <td style="font-weight:700;color:var(--verde);">+${p.pctAumento}%</td>
    <td style="font-size:12px;font-weight:500;">${p.vigencia}</td>
    <td>
      ${p.homologada
        ? `<span class="badge badge-verde">✅ Homologada ${p.fechaHomologacion}</span>`
        : `<span class="badge badge-acento">⚠️ Sin homologar</span>`}
    </td>
    <td>
      ${p.homologada
        ? `<span class="badge badge-verde">✅ Puede aplicarse</span>`
        : `<span class="badge" style="background:#f5f0d0;color:#7a6000;">📊 Solo proyección</span>`}
    </td>
    <td style="font-size:12px;text-align:center;">${p.escala.length} categ.</td>
    <td><span class="badge ${estColor[p.estadoAplicacion]||'badge-gris'}">${p.estadoAplicacion}</span></td>
    <td>
      <div style="display:flex;gap:4px;">
        ${!p.homologada
          ? `<button class="btn btn-secondary btn-xs" onclick="homologarParitaria(${i})">✅ Homologar</button>`
          : ''}
        <button class="btn btn-secondary btn-xs" onclick="verParitaria(${i})">Ver</button>
      </div>
    </td>
  </tr>`).join('')||`<tr><td colspan="10"><div class="empty-state"><div class="icon">📜</div><p>Sin acuerdos cargados</p></div></td></tr>`;
}

function homologarParitaria(idx){
  DB.paritarias[idx].homologada = true;
  DB.paritarias[idx].fechaHomologacion = new Date().toLocaleDateString('es-AR');
  construirMenu(); renderParitarias();
  toast(`✅ Paritaria homologada — ahora puede aplicarse a asociados y clientes`);
}

function verParitaria(idx){
  const p = DB.paritarias[idx];
  const html=`<div class="info-grid" style="margin-bottom:14px;">
    <div class="info-item"><div class="key">Sindicato</div><div class="val">${p.sindicato}</div></div>
    <div class="info-item"><div class="key">Fecha</div><div class="val">${p.fecha}</div></div>
    <div class="info-item"><div class="key">% Aumento</div><div class="val" style="font-weight:700;color:var(--verde);">+${p.pctAumento}%</div></div>
    <div class="info-item"><div class="key">Vigencia</div><div class="val">${p.vigencia}</div></div>
    <div class="info-item"><div class="key">Homologada</div><div class="val">${p.homologada?'✅ Sí — '+p.fechaHomologacion:'⚠️ No'}</div></div>
    <div class="info-item"><div class="key">Estado aplicación</div><div class="val">${p.estadoAplicacion}</div></div>
  </div>
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);margin-bottom:8px;">Escala salarial</div>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Categoría</th>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Valor hora anterior</th>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Valor hora nuevo</th>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Diferencia</th>
    </tr></thead>
    <tbody>${p.escala.map(e=>`<tr>
    </tr>`).join('')}</tbody>
  </table>
  ${p.obs?`<div class="alerta alerta-info" style="margin-top:12px;font-size:12px;"><strong>Obs:</strong> ${p.obs}</div>`:''}`;
  $('pedido-title').textContent=`📜 ${p.nombre}`;
  $('pedido-body').innerHTML=html;
  abrirModal('modal-ver-pedido');
}

// Escala salarial tab
function renderEscalaSalarial(){
  const parId=parseInt($('cf-escala-par')?.value)||0;
  const el=$('escala-salarial-contenido'); if(!el) return;
  const par=parId?DB.paritarias.find(p=>p.id===parId):DB.paritarias[DB.paritarias.length-1];
  if(!par){el.innerHTML='<p class="text-muted">Seleccioná una paritaria.</p>';return;}
  el.innerHTML=`
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
      <span class="badge ${par.homologada?'badge-verde':'badge-acento'}" style="font-size:12px;">
        ${par.homologada?'✅ Homologada':'⚠️ Sin homologar — solo proyección'}
      </span>
      <span style="font-size:13px;color:var(--texto-suave);">Vigencia: <strong>${par.vigencia}</strong></span>
      <span style="font-size:13px;color:var(--verde);font-weight:700;">+${par.pctAumento}% general</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="padding:10px 14px;background:#f8f9fd;border:1px solid var(--borde);text-align:left;">Categoría</th>
        <th style="padding:10px 14px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Valor hora anterior</th>
        <th style="padding:10px 14px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Valor hora nuevo</th>
        <th style="padding:10px 14px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Diferencia</th>
        <th style="padding:10px 14px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">% real</th>
      </tr></thead>
      <tbody>${par.escala.map(e=>{
        const diff=e.valorNuevo-e.valorAnterior;
        const pctReal=Math.round(diff/e.valorAnterior*100);
        return `<tr>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

// Aplicar a asociados
function renderParAsociados(){
  const parId=parseInt($('cf-par-asoc')?.value)||0;
  const el=$('par-asoc-contenido'); if(!el) return;
  const warn=$('par-asoc-warning');
  const par=DB.paritarias.find(p=>p.id===parId);
  if(!par){el.innerHTML='<p class="text-muted" style="padding:8px;">Seleccioná una paritaria.</p>';if(warn)warn.style.display='none';return;}
  if(warn) warn.style.display=par.homologada?'none':'flex';

  el.innerHTML=`
    <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--texto-suave);">Seleccioná las categorías a las que querés aplicar el aumento:</span>
      <button class="btn btn-secondary btn-sm" onclick="seleccionarTodasCategorias(true)">Seleccionar todas</button>
      <button class="btn btn-secondary btn-sm" onclick="seleccionarTodasCategorias(false)">Deseleccionar</button>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
      <thead><tr>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);width:40px;"><input type="checkbox" id="chk-all-cat" onchange="seleccionarTodasCategorias(this.checked)"></th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);">Categoría</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Valor hora actual</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Nuevo valor hora</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">% aumento</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Ajuste manual %</th>
      </tr></thead>
      <tbody>
        ${par.escala.map((e,i)=>`<tr>
              oninput="recalcCatVH(${i},this.value,${e.valorAnterior})" id="pct-manual-cat-${i}">%
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="display:flex;gap:10px;align-items:center;">
      ${par.homologada
        ? `<button class="btn btn-primary" onclick="aplicarAumentoAsociados(${par.id})">✅ Aplicar aumento a categorías seleccionadas</button>`
        : `<button class="btn btn-secondary" onclick="proyectarAumentoAsociados(${par.id})">📊 Guardar como proyección</button>`}
      <span style="font-size:12px;color:var(--texto-suave);">${par.homologada?'El aumento se aplicará a todos los asociados de las categorías seleccionadas.':'Solo proyección — no modifica valores reales.'}</span>
    </div>`;
}

function recalcCatVH(idx, pct, base){
  const nuevo = Math.round(base*(1+parseFloat(pct||0)/100));
  const el=$(`nuevo-vh-cat-${idx}`);
  if(el) el.textContent='$'+nuevo.toLocaleString('es-AR');
}

function seleccionarTodasCategorias(val){
  document.querySelectorAll('.chk-categoria').forEach(c=>c.checked=val);
  const all=$('chk-all-cat'); if(all) all.checked=val;
}

function aplicarAumentoAsociados(parId){
  const par=DB.paritarias.find(p=>p.id===parId); if(!par) return;
  if(!par.homologada){toast('⚠️ La paritaria no está homologada. Solo podés proyectar.');return;}
  const seleccionadas=[...document.querySelectorAll('.chk-categoria:checked')].map(c=>parseInt(c.dataset.idx));
  if(!seleccionadas.length){toast('Seleccioná al menos una categoría');return;}
  let aplicados=0;
  seleccionadas.forEach(idx=>{
    const e=par.escala[idx]; if(!e) return;
    const pctEl=$(`pct-manual-cat-${idx}`);
    const pct=parseFloat(pctEl?.value||par.pctAumento);
    const nuevoVH=Math.round(e.valorAnterior*(1+pct/100));
    // Actualizar DB.categoriasSalariales
    const cat=DB.categoriasSalariales.find(c=>c.nombre===e.categoria);
    if(cat){cat.valorHoraActual=nuevoVH; cat.ultimaActualizacion=new Date().toLocaleDateString('es-AR');}
    // Actualizar en DB.legajos por función
    (DB.legajos||[]).forEach(l=>{
      if(l.funcion===e.categoria){
        if(!l.historialSalarial) l.historialSalarial=[];
        l.historialSalarial.push({fecha:new Date().toLocaleDateString('es-AR'),valorHora:nuevoVH,motivo:`Paritaria: ${par.nombre}`});
      }
    });
    aplicados++;
  });
  par.estadoAplicacion='Aplicada';
  construirMenu();renderParitarias();
  toast(`✅ Aumento aplicado a ${aplicados} categoría${aplicados!==1?'s':''} — ${(DB.legajos||[]).length} asociados actualizados`,5000);
}

function proyectarAumentoAsociados(parId){
  toast('📊 Proyección guardada — cuando la paritaria se homologue podrás aplicar el aumento real');
}

// Proponer a clientes
function renderParClientes(){
  const parId=parseInt($('cf-par-cli')?.value)||0;
  const el=$('par-cli-contenido'); if(!el) return;
  const warn=$('par-cli-warning');
  const par=DB.paritarias.find(p=>p.id===parId);
  if(!par){el.innerHTML='<p class="text-muted" style="padding:8px;">Seleccioná una paritaria.</p>';if(warn)warn.style.display='none';return;}
  if(warn) warn.style.display=par.homologada?'none':'flex';

  const objetivosActivos=DB.objetivos.filter(o=>o.estado==='Operativo');
  el.innerHTML=`
    <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--texto-suave);">Seleccioná los objetivos/clientes a los que querés proponer el aumento:</span>
      <button class="btn btn-secondary btn-sm" onclick="seleccionarTodosClientes(true)">Seleccionar todos</button>
      <button class="btn btn-secondary btn-sm" onclick="seleccionarTodosClientes(false)">Deseleccionar</button>
    </div>
    <div class="alerta alerta-info" style="margin-bottom:14px;font-size:12px;">
      El <strong>% base</strong> es el de la paritaria. Podés agregar un <strong>% de margen adicional</strong> por objetivo para cubrir costos operativos. Se generará una propuesta de precio individual que pasará por el flujo de aprobación del Gerente.
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <thead><tr>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);width:40px;"><input type="checkbox" id="chk-all-cli" onchange="seleccionarTodosClientes(this.checked)"></th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Objetivo</th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Cliente</th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Cláusula</th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Valor actual</th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:center;">% parit.</th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:center;">+ Margen %</th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:center;">% total</th>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Nuevo valor</th>
      </tr></thead>
      <tbody>
        ${objetivosActivos.map((o,i)=>{
          const cli=DB.clientes.find(c=>c.id===o.clienteId);
          const pctBase=par.pctAumento;
          const nuevoVal=Math.round(o.valor*(1+pctBase/100));
          return `<tr>
                style="width:55px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:5px;font-size:12px;text-align:right;"
                oninput="recalcClienteVH(${o.id},${o.valor},${pctBase})">%
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="generarPropuestasClientes(${par.id})">
        ${par.homologada?'📋 Generar propuestas para objetivos seleccionados':'📊 Generar propuestas como proyección'}
      </button>
      <span style="font-size:12px;color:var(--texto-suave);">
        ${par.homologada?'Se crearán propuestas de precio que pasarán por aprobación del Gerente.':'Se crearán propuestas marcadas como "proyección" hasta homologación.'}
      </span>
    </div>`;
}

function recalcClienteVH(objId, valorBase, pctBase){
  const margenEl=$(`margen-cli-${objId}`);
  const margen=parseFloat(margenEl?.value||0);
  const pctTotal=pctBase+margen;
  const nuevoVal=Math.round(valorBase*(1+pctTotal/100));
  const ptEl=$(`pct-total-cli-${objId}`);
  const nvEl=$(`nuevo-val-cli-${objId}`);
  if(ptEl) ptEl.textContent=`+${pctTotal.toFixed(1)}%`;
  if(nvEl) nvEl.textContent='$'+nuevoVal.toLocaleString('es-AR');
}

function seleccionarTodosClientes(val){
  document.querySelectorAll('.chk-cliente-par').forEach(c=>c.checked=val);
  const all=$('chk-all-cli'); if(all) all.checked=val;
}

function generarPropuestasClientes(parId){
  const par=DB.paritarias.find(p=>p.id===parId); if(!par) return;
  const seleccionados=[...document.querySelectorAll('.chk-cliente-par:checked')].map(c=>parseInt(c.dataset.objId));
  if(!seleccionados.length){toast('Seleccioná al menos un objetivo');return;}
  if(!DB.propuestasPrecios)DB.propuestasPrecios=[];
  let creadas=0;
  seleccionados.forEach(objId=>{
    const obj=DB.objetivos.find(o=>o.id===objId); if(!obj) return;
    const cli=DB.clientes.find(c=>c.id===obj.clienteId);
    const margenEl=$(`margen-cli-${objId}`);
    const margen=parseFloat(margenEl?.value||0);
    const pctTotal=par.pctAumento+margen;
    const nivelUnico={pct:pctTotal,valor:Math.round(obj.valor*(1+pctTotal/100))};
    const propuesta=crearPropuestaPrecio({
      obj,cli,tipoModificacion:'Aumento',
      tramos:[{pct:pctTotal,fechaVigencia:par.vigencia}],
      tipoConvalidar:'porParitaria',
      niveles:{porParitaria:nivelUnico,propuestaOhlimpia:{pct:0,valor:0},yaAcordado:{pct:0,valor:0}},
      clausula:par.sindicato,
      motivo:`Paritaria ${par.nombre} (+${par.pctAumento}% base${margen?` + ${margen}% margen`:''})`,
      proyeccionMeses:3,origenParitaria:par.nombre,
    });
    // Si la paritaria todavía no está homologada, la propuesta queda como
    // proyección informativa — no entra al circuito de autorización hasta
    // que se homologue (no hay, todavía, un paso automático que la migre;
    // se rearma a mano si hace falta).
    if(!par.homologada)propuesta.estado='Proyección — sin homologar';
    DB.propuestasPrecios.push(propuesta);
    supaSync('propuestasPrecios',propuesta);
    creadas++;
  });
  construirMenu();
  toast(`✅ ${creadas} propuesta${creadas!==1?'s':''} generada${creadas!==1?'s':''}${par.homologada?' — pendientes de autorización del Gerente':' — marcadas como proyección'}`,6000);
}

// Proyección financiera
function renderParProyeccion(){
  const parId=parseInt($('cf-par-proy')?.value)||0;
  const el=$('par-proy-contenido'); if(!el) return;
  const par=DB.paritarias.find(p=>p.id===parId);
  if(!par){el.innerHTML='<p class="text-muted" style="padding:8px;">Seleccioná una paritaria.</p>';return;}
  const objetivos=DB.objetivos.filter(o=>o.estado==='Operativo');
  const totalActual=objetivos.reduce((s,o)=>s+(o.valor||0),0);
  const totalNuevo=objetivos.reduce((s,o)=>s+Math.round((o.valor||0)*(1+par.pctAumento/100)),0);
  const impacto=totalNuevo-totalActual;
  const impacto12=impacto*12;
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
      <div class="stat-card azul"><div class="stat-label">Facturación actual</div><div class="stat-valor" style="font-size:16px;">$${Math.round(totalActual/1000)}k</div><div class="stat-sub">mensual</div></div>
      <div class="stat-card verde"><div class="stat-label">Con paritaria aplicada</div><div class="stat-valor" style="font-size:16px;">$${Math.round(totalNuevo/1000)}k</div><div class="stat-sub">mensual</div></div>
      <div class="stat-card acento"><div class="stat-label">Incremento mensual</div><div class="stat-valor" style="font-size:16px;">+$${Math.round(impacto/1000)}k</div><div class="stat-sub">si se traslada al cliente</div></div>
      <div class="stat-card rojo"><div class="stat-label">Impacto anual</div><div class="stat-valor" style="font-size:16px;">+$${Math.round(impacto12/1000)}k</div><div class="stat-sub">proyección 12 meses</div></div>
    </div>
    ${par.homologada?'':`<div class="alerta alerta-warning" style="margin-bottom:14px;">⚠️ Paritaria sin homologar — valores proyectados, no definitivos.</div>`}
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);">Objetivo</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);">Cliente</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Valor actual</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Con aumento (+${par.pctAumento}%)</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Diferencia mensual</th>
        <th style="padding:10px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Diferencia anual</th>
      </tr></thead>
      <tbody>${objetivos.map(o=>{
        const cli=DB.clientes.find(c=>c.id===o.clienteId);
        const nuevo=Math.round((o.valor||0)*(1+par.pctAumento/100));
        const diff=nuevo-(o.valor||0);
        return `<tr>
        </tr>`;
      }).join('')}
      <tr style="background:var(--azul-claro);font-weight:700;">
        <td colspan="2" style="padding:10px;border:1px solid var(--borde);">TOTAL</td>
        <td style="padding:10px;border:1px solid var(--borde);text-align:right;">$${totalActual.toLocaleString('es-AR')}</td>
        <td style="padding:10px;border:1px solid var(--borde);text-align:right;color:var(--azul);">$${totalNuevo.toLocaleString('es-AR')}</td>
        <td style="padding:10px;border:1px solid var(--borde);text-align:right;color:var(--verde);">+$${impacto.toLocaleString('es-AR')}</td>
        <td style="padding:10px;border:1px solid var(--borde);text-align:right;color:var(--verde);">+$${impacto12.toLocaleString('es-AR')}</td>
      </tr></tbody>
    </table>`;
}

// Modal nueva paritaria
function abrirModalParitaria(){
  const tbody=$('escala-modal-tabla'); if(!tbody) return;
  tbody.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Categoría</th>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Valor hora actual</th>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Nuevo valor hora</th>
      <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:right;">Ajuste manual</th>
    </tr></thead>
    <tbody>
      ${DB.categoriasSalariales.map((c,i)=>`<tr>
      </tr>`).join('')}
    </tbody>
  </table>`;
  abrirModal('modal-paritaria');
}

function actualizarEscalaModal(){
  const pct=parseFloat($('par-pct')?.value)||0;
  DB.categoriasSalariales.forEach((c,i)=>{
    const base=parseFloat($(`par-vh-actual-${i}`)?.value)||c.valorHoraActual;
    const override=parseFloat($(`par-vh-override-${i}`)?.value)||0;
    const nuevo=override||Math.round(base*(1+pct/100));
    const el=$(`par-vh-nuevo-${i}`);
    if(el) el.textContent='$'+nuevo.toLocaleString('es-AR');
  });
}

function overrideVHCat(idx){
  actualizarEscalaModal();
}

function guardarParitaria(){
  const nombre=$('par-nombre')?.value.trim();
  const sindicato=$('par-sindicato')?.value.trim();
  const pct=parseFloat($('par-pct')?.value)||0;
  if(!nombre||!sindicato||!pct){toast('Completá nombre, sindicato y % de aumento');return;}
  const homologada=($('par-homologada')?.value)==='1';
  const fechaVig=$('par-vigencia')?.value?new Date($('par-vigencia').value).toLocaleDateString('es-AR'):'';
  const escala=DB.categoriasSalariales.map((c,i)=>{
    const base=parseFloat($(`par-vh-actual-${i}`)?.value)||c.valorHoraActual;
    const override=parseFloat($(`par-vh-override-${i}`)?.value)||0;
    const nuevo=override||Math.round(base*(1+pct/100));
    return {categoria:c.nombre, valorAnterior:base, valorNuevo:nuevo};
  });
  DB.paritarias.push({
    id:Date.now(), nombre, sindicato, pct, pctAumento:pct,
    fecha:$('par-fecha')?.value?new Date($('par-fecha').value).toLocaleDateString('es-AR'):'',
    vigencia:fechaVig, homologada,
    fechaHomologacion:homologada?($('par-fecha-homo')?.value?new Date($('par-fecha-homo').value).toLocaleDateString('es-AR'):''):'',
    estadoAplicacion:'Sin aplicar', obs:$('par-obs')?.value||'', escala,
  });
  cerrarModal('modal-paritaria'); construirMenu(); supaSync('paritarias', DB.paritarias[DB.paritarias.length-1]); renderParitarias();
  toast(`✅ Paritaria "${nombre}" cargada${homologada?' — lista para aplicar':' — sin homologar, solo proyección'}`);
}

// ========== PUNTO 3: ACCIONES VENCIDAS EN CRM ==========
// Agregar fecha de vencimiento a acciones y detectar vencidas

function verificarAccionesVencidas(){
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  let vencidas=0;
  // CRM Leads
  (DB.leads||[]).forEach(l=>{
    (l.acciones||[]).forEach(a=>{
      if(a.estado==='Pendiente'&&a.fechaVenc){
        const [dd,mm,yy]=a.fechaVenc.split('/');
        const fv=new Date(`${yy}-${mm}-${dd}`);
        if(fv<hoy){a.estado='Vencida';vencidas++;}
      }
    });
  });
  // Cobros — gestión a nivel cliente (Delta Cobros/Gestión de Cobranzas v1)
  (DB.clientes||[]).forEach(c=>{
    (c.gestionesCobro||[]).forEach(g=>{
      if(g.estado==='Pendiente'&&g.fechaVenc){
        const [dd,mm,yy]=g.fechaVenc.split('/');
        const fv=new Date(`${yy}-${mm}-${dd}`);
        if(fv<hoy){g.estado='Vencida';vencidas++;}
      }
    });
  });
  // Reclamos — no tienen acciones propias por ahora
  if(vencidas>0){
    toast(`⚠️ ${vencidas} acción${vencidas!==1?'es':''} vencida${vencidas!==1?'s':''} en los CRM — revisá los módulos de CRM y Cobros`,7000);
  }
  return vencidas;
}

// Función para mostrar advertencia de acciones vencidas al abrir cada CRM
function alertarAccionesVencidasModulo(modulo){
  let accVencidas=[];
  if(modulo==='crm'){
    accVencidas=DB.leads.flatMap(l=>(l.acciones||[]).filter(a=>a.estado==='Vencida').map(a=>({empresa:l.empresa,...a})));
  } else if(modulo==='cobros'){
    accVencidas=DB.clientes.flatMap(c=>(c.gestionesCobro||[]).filter(g=>g.estado==='Vencida').map(g=>({empresa:c.nombre,...g})));
  }
  if(accVencidas.length>0){
    toast(`⚠️ ${accVencidas.length} acción${accVencidas.length!==1?'es':''} VENCIDA${accVencidas.length!==1?'s':''} — ${accVencidas.map(a=>a.empresa||a.factura).slice(0,3).join(', ')}${accVencidas.length>3?'...':''}. ¡Poné en contacto lo antes posible!`,8000);
  }
}

// ========== MÓDULO DE FERIADOS ==========
DB.feriados = [
  {id:1,fecha:'2026-01-01',nombre:'Año Nuevo',tipo:'Nacional inamovible',alt:''},
  {id:2,fecha:'2026-02-16',nombre:'Carnaval',tipo:'Nacional inamovible',alt:''},
  {id:3,fecha:'2026-02-17',nombre:'Carnaval',tipo:'Nacional inamovible',alt:''},
  {id:4,fecha:'2026-03-24',nombre:'Día Nacional de la Memoria',tipo:'Nacional inamovible',alt:''},
  {id:5,fecha:'2026-04-02',nombre:'Día del Veterano',tipo:'Nacional inamovible',alt:''},
  {id:6,fecha:'2026-04-03',nombre:'Viernes Santo',tipo:'Nacional inamovible',alt:''},
  {id:7,fecha:'2026-05-01',nombre:'Día del Trabajador',tipo:'Nacional inamovible',alt:''},
  {id:8,fecha:'2026-05-25',nombre:'Revolución de Mayo',tipo:'Nacional inamovible',alt:''},
  {id:9,fecha:'2026-06-15',nombre:'Paso a la Inmortalidad del Gral. Güemes',tipo:'Nacional inamovible',alt:''},
  {id:10,fecha:'2026-06-20',nombre:'Paso a la Inmortalidad del Gral. Belgrano',tipo:'Nacional inamovible',alt:''},
  {id:11,fecha:'2026-07-09',nombre:'Día de la Independencia',tipo:'Nacional inamovible',alt:''},
  {id:12,fecha:'2026-08-17',nombre:'Paso a la Inmortalidad del Gral. San Martín',tipo:'Nacional trasladable',alt:''},
  {id:13,fecha:'2026-10-12',nombre:'Día del Respeto a la Diversidad Cultural',tipo:'Nacional trasladable',alt:''},
  {id:14,fecha:'2026-11-20',nombre:'Día de la Soberanía Nacional',tipo:'Nacional trasladable',alt:''},
  {id:15,fecha:'2026-12-08',nombre:'Inmaculada Concepción de María',tipo:'Nacional inamovible',alt:''},
  {id:16,fecha:'2026-12-25',nombre:'Navidad',tipo:'Nacional inamovible',alt:''},
];

function renderFeriados(){
  const anio=parseInt($('cf-fer-anio')?.value)||2026;
  const feriados=DB.feriados.filter(f=>f.fecha.startsWith(String(anio)));
  const dias=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const tipoColor={'Nacional inamovible':'badge-rojo','Nacional trasladable':'badge-acento','Puente':'badge-gris','Especial empresa':'badge-azul'};
  const tbody=$('tbody-feriados'); if(!tbody) return;
  tbody.innerHTML=feriados.sort((a,b)=>a.fecha.localeCompare(b.fecha)).map((f)=>{
    const d=new Date(f.fecha+'T12:00:00');
    return `<tr>
      <td style="font-weight:600;font-family:'DM Mono',monospace;">${f.fecha.split('-').reverse().join('/')}</td>
      <td style="font-size:12px;">${dias[d.getDay()]}</td>
      <td style="font-weight:500;">${f.nombre}</td>
      <td><span class="badge ${tipoColor[f.tipo]||'badge-gris'}" style="font-size:10px;">${f.tipo}</span></td>
      <td style="font-size:12px;">${f.alt?f.alt.split('-').reverse().join('/'):'—'}</td>
      <td><button class="btn btn-danger btn-xs" onclick="eliminarFeriado(${f.id})">Eliminar</button></td>
    </tr>`;
  }).join('')||`<tr><td colspan="6"><div class="empty-state"><div class="icon">📅</div><p>Sin feriados para ${anio}</p></div></td></tr>`;
}
function cargarFeriadosArg(){toast('✓ Feriados de Argentina 2026 precargados. Podés agregar feriados especiales con el botón +');renderFeriados();}
function abrirModalFeriado(){['fer-fecha','fer-nombre','fer-alt'].forEach(id=>{const el=$(id);if(el)el.value='';});abrirModal('modal-feriado');}
function guardarFeriado(){
  const fecha=$('fer-fecha')?.value;const nombre=$('fer-nombre')?.value.trim();
  if(!fecha||!nombre){toast('Completá fecha y nombre');return;}
  const nuevo={id:Date.now(),fecha,nombre,tipo:$('fer-tipo')?.value||'Nacional inamovible',alt:$('fer-alt')?.value||''};
  DB.feriados.push(nuevo);
  cerrarModal('modal-feriado');supaSync('feriados', nuevo); renderFeriados();toast(`✓ Feriado "${nombre}" agregado`);
}
// El onclick de "Eliminar" era DB.feriados.splice(...) inline: DB es un
// binding de módulo, no existe en window, así que cada click tiraba
// ReferenceError en silencio y no borraba nada (ni local ni en Supabase).
// eliminarFeriado() además ahora sí persiste la baja con supaDel().
function eliminarFeriado(id){
  const f=DB.feriados.find(x=>x.id===id);if(!f)return;
  if(!confirm(`¿Eliminar el feriado "${f.nombre}" (${f.fecha.split('-').reverse().join('/')})?`))return;
  DB.feriados=DB.feriados.filter(x=>x.id!==id);
  supaDel('feriados', idLocalTrunc(id));
  renderFeriados();
  toast(`Feriado "${f.nombre}" eliminado`);
}

// ========== MÓDULO LIQUIDACIÓN DE HORAS ==========
DB.parametrosServicio={'CHANGO.BROWN':{diasSemana:[1,2,3,4,5,6],horasPorDia:8,trabajaFeriados:false,trabajaFinde:false},'CHANGO.CASEROS':{diasSemana:[1,2,3,4,5],horasPorDia:8,trabajaFeriados:false,trabajaFinde:false},'HTAL.ALEMAN.LIMP':{diasSemana:[1,2,3,4,5,6,0],horasPorDia:8,trabajaFeriados:true,trabajaFinde:true}};
DB.grillasLiq=[];DB.art42=[];DB.alertasLiquidacion=[];

function calcularHorasMes(mesISO,objCodigo){
  const params=DB.parametrosServicio[objCodigo]||{diasSemana:[1,2,3,4,5],horasPorDia:8,trabajaFeriados:false,trabajaFinde:false};
  const dias=getDiasDelMes(mesISO);let totalHoras=0;const diasTrabajados=[];
  dias.forEach(dia=>{const dow=new Date(dia.iso+'T12:00:00').getDay();const ok=params.diasSemana.includes(dow)&&(params.trabajaFeriados||!dia.esFeriado)&&(params.trabajaFinde||!dia.esFinde);if(ok){totalHoras+=params.horasPorDia;diasTrabajados.push(dia.iso);}});
  return{totalHoras,diasTrabajados,horasPorDia:params.horasPorDia};
}



function renderLiquidacion(){
  const mes=$('liq-mes-sel')?.value||(new Date().toISOString().slice(0,7));
  if($('liq-mes-sel')&&!$('liq-mes-sel').value) $('liq-mes-sel').value=mes;
  const grillasActivas=DB.grillasLiq.filter(g=>g.periodo===mes);
  $('st-liq-grillas').textContent=grillasActivas.length;
  $('st-liq-alertas').textContent=(DB.alertasLiquidacion||[]).filter(a=>!a.resuelta).length;
  $('st-liq-hsfact').textContent=grillasActivas.reduce((s,g)=>s+(g.totalHorasFacturables||0),0);
  $('st-liq-hsnofact').textContent=grillasActivas.reduce((s,g)=>s+(g.totalHorasNoFacturables||0),0);
  poblarSelectsLiquidacion();
  renderGrillasLiq();
}

function poblarSelectsLiquidacion(){
  // Filtro de supervisores en la vista compacta
  const selSup=$('liq-sup-fil');
  if(selSup){
    const ph='<option value="">Todos los supervisores</option>';
    selSup.innerHTML=ph+DB.supervisores.map(s=>`<option value="${s}">${s}</option>`).join('');
    // Si el usuario es supervisor, filtrar automáticamente sus servicios
    if(currentUser?.perfil==='Supervisor'){
      const nombre=currentUser.nombre;
      // Buscar el supervisor cuyo nombre coincide
      const supNombre=DB.supervisores.find(s=>nombre.toLowerCase().includes(s.toLowerCase().split(' ')[0]))||nombre;
      for(let i=0;i<selSup.options.length;i++){
        if(selSup.options[i].value===supNombre||selSup.options[i].value===currentUser.funcion){
          selSup.selectedIndex=i;break;
        }
      }
    }
  }
  // Selectores de modales
  const sel=$('ng-objetivo');
  if(sel){sel.innerHTML='<option value="">— Seleccionar objetivo —</option>'+DB.objetivos.map(o=>`<option value="${o.codigo}">${o.nombre}</option>`).join('');}
  const selSupNG=$('ng-supervisor');
  if(selSupNG){selSupNG.innerHTML='<option value="">— Supervisor —</option>'+DB.supervisores.map(s=>`<option>${s}</option>`).join('');}
  const dlAsoc=$('dl-asoc-a42');
  if(dlAsoc){dlAsoc.innerHTML=(DB.legajos||[]).map(l=>`<option value="${l.nombre} (N°${l.nro})">`).join('');}
  const selCat=$('a42-categoria');
  if(selCat){selCat.innerHTML=DB.categoriasSalariales.map(c=>`<option>${c.nombre}</option>`).join('');}
}

function getCategoriaVH(nombreCategoria){
  return DB.categoriasSalariales.find(c=>c.nombre===nombreCategoria)?.valorHoraActual||0;
}

// Validación (no bloqueante) de que exista valor-hora vigente cargado en el
// módulo Categorías para el operario + servicio — v040, Cambio 5 acotado.
// NO reemplaza getCategoriaVH/DB.categoriasSalariales (el cálculo real de
// Liquidación de horas sigue siendo ese, decisión explícita de esta
// migración) — solo alerta si a RRHH se le pasó cargar el valor real.
function validarValorHoraAsociado(legajoNro, objCodigo){
  const legajo = (DB.legajos||[]).find(l=>String(l.nro)===String(legajoNro));
  if(!legajo){ return; }
  if(!legajo.categoriaIdLocal){
    toast(`⚠️ ${legajo.nombre}: sin categoría asignada — cargala en Legajos.`);
    return;
  }
  const hoyISO = new Date().toISOString().slice(0,10);
  const vigente = obtenerValorHoraVigente(legajo.categoriaIdLocal, objCodigo, hoyISO);
  if(!vigente){
    toast(`⚠️ Sin valor hora vigente para la categoría de ${legajo.nombre} en ${objCodigo} — cargalo en Categorías antes de cerrar el mes.`);
  }
}

// ========== VALOR HORA EFECTIVO (DELTA_liquidacion_horas_v1) ==========
// A diferencia de getCategoriaVH/DB.categoriasSalariales (sin vigencia,
// solo dejado para no romper otras pantallas que aún lo usan), acá SÍ se
// conecta con el módulo Categorías real (categoriaIdLocal vigente por
// mes, ya en uso en producción con datos de paritaria). "Regla del más
// alto" (punto 4 del delta): compara la categoría de legajo contra la
// alternativa (solo si está Aprobada) y toma la de mayor valor — nunca
// se pisa la de legajo, solo se supera si corresponde. Devuelve null si
// falta vincular categoría o no hay valor cargado — nunca inventa un
// número (mismo criterio que obtenerValorHoraVigente).
function valorHoraEfectivoAsoc(asoc,servicioNombre,fechaISO){
  const legajo=(DB.legajos||[]).find(l=>String(l.nro)===String(asoc.nro));
  const vBase=legajo?.categoriaIdLocal?obtenerValorHoraVigente(legajo.categoriaIdLocal,servicioNombre,fechaISO):null;
  const vAlt=(asoc.catAltEstado==='Aprobada'&&asoc.catAltIdLocal)?obtenerValorHoraVigente(asoc.catAltIdLocal,servicioNombre,fechaISO):null;
  if(!vBase&&!vAlt) return null;
  if(vBase&&vAlt) return (Number(vBase.valorHora)>=Number(vAlt.valorHora))?vBase:vAlt;
  return vBase||vAlt;
}
// Fecha representativa del mes de la planilla para mostrar UN valor hora
// resumen en la columna (el cálculo real de "A pagar" es día a día, ver
// renderGrillasLiq, porque el valor puede cambiar a mitad de mes por
// paritaria). Si el mes ya pasó, usa el último día; si es el mes en
// curso (o futuro), usa hoy acotado a ese mes.
function fechaRepresentativaMes(mesISO){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const hoyISO=hoy.toISOString().slice(0,10);
  const [yy,mm]=mesISO.split('-');
  const ultimoDiaMes=new Date(parseInt(yy),parseInt(mm),0).toISOString().slice(0,10);
  return hoyISO<ultimoDiaMes?(hoyISO<`${yy}-${mm}-01`?`${yy}-${mm}-01`:hoyISO):ultimoDiaMes;
}
// Vincula la categoría del catálogo (módulo Categorías) al legajo — sin
// esto, Liquidación de horas no tiene de dónde sacar el valor hora
// (legajo.categoriaIdLocal no se carga desde ningún otro lado hoy salvo
// al abrir un caso en Enfermos y Accidentes).
function asignarCategoriaLegajo(nro,catIdLocal){
  const legajo=(DB.legajos||[]).find(l=>String(l.nro)===String(nro));
  if(!legajo||!catIdLocal) return;
  legajo.categoriaIdLocal=idLocalTrunc(catIdLocal);
  supaSync('legajos',legajo);
  renderGrillasLiq();
  toast('✓ Categoría vinculada — ya se usa para calcular valor hora y A pagar');
}
// DELTA_liquidacion_horas_v1, punto 6 — "facturable" para el total de
// horas (columna Fact., base de Comisiones) NO es lo mismo que
// asoc.facturable!==false. Una hora fuera del EFT sigue con
// asoc.facturable en true (confirmarAgregarAsoc sólo guarda el sello en
// infoEFT), pero si el cliente todavía no la reconoció (o el gerente la
// rechazó) es pérdida, no debe contar como facturable — "aprobado por
// el gerente NO vuelve facturable una hora, sólo el reconocimiento del
// cliente". Antes del delta, totalHorasFacturables ignoraba esto.
function esHoraFacturableReal(asoc,fechaISO){
  if(asoc.facturable?.[fechaISO]===false) return false;
  const eft=asoc.infoEFT?.[fechaISO];
  if(eft?.fueraEFT&&eft.autorizado!==true) return false;
  return true;
}
function badgeTipoAuth(tipo){
  if(tipo==='no_facturable') return `<span class="badge badge-rojo" style="font-size:10px;">❌ No facturable</span>`;
  if(tipo==='cat_alt') return `<span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:10px;">🔁 Cat. alternativa</span>`;
  return `<span class="badge" style="background:#fff3cd;color:#856404;font-size:10px;">⚠️ Fuera EFT</span>`;
}

function generarHorasPrecargas(mesISO,objCodigo){
  const params=DB.parametrosServicio[objCodigo]||{diasSemana:[1,2,3,4,5],horasPorDia:8,trabajaFeriados:false,trabajaFinde:false};
  const horas={};
  getDiasDelMes(mesISO).forEach(dia=>{
    const dow=new Date(dia.iso+'T12:00:00').getDay();
    if(params.diasSemana.includes(dow)&&(params.trabajaFeriados||!dia.esFeriado)&&(params.trabajaFinde||!dia.esFinde))
      horas[dia.iso]=params.horasPorDia;
  });
  return horas;
}

// Estado global de filas expandidas

// ═══════════════════════════════════════════════════════════
// MOTIVOS DE NO FACTURACIÓN — ABM
// ═══════════════════════════════════════════════════════════
if(!DB.motivosNoFact) DB.motivosNoFact = [
  {id:1, nombre:'Artículo 42',           codigo:'ART42', descripcion:'Licencia por enfermedad Art.42 del convenio', activo:true},
  {id:2, nombre:'Retén en base',         codigo:'RET-BASE', descripcion:'Asociado retén realizando guardia en base sin asistir al servicio', activo:true},
  {id:3, nombre:'Retén cubriendo',       codigo:'RET-COB', descripcion:'Asociado retén cubriendo ausencia en otro servicio', activo:true},
  {id:4, nombre:'Capacitación interna',  codigo:'CAP-INT', descripcion:'Asociado dictando capacitación a otros asociados', activo:true},
  {id:5, nombre:'Capacitación recibida', codigo:'CAP-REC', descripcion:'Asociado asistiendo a una capacitación', activo:true},
  {id:6, nombre:'Franquero',             codigo:'FRANQ', descripcion:'Día de franco del asociado franquero', activo:true},
  {id:7, nombre:'Licencia gremial',      codigo:'LIC-GREM', descripcion:'Ausencia por actividad sindical', activo:true},
];
let _mnfEditIdx = null;

function renderMotivosNFLiq(){
  // Render en el tab Conceptos de Liquidación
  const tbody = $('tbody-motivos-nf-liq');
  if(!tbody) return;
  const motivos = DB.motivosNoFact||[];
  if(!motivos.length){
    tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--texto-suave);">Sin motivos</td></tr>`;
    return;
  }
  tbody.innerHTML = motivos.map((m,i)=>`<tr>
    <td style="font-weight:500;font-size:12px;">${m.nombre}${m.descripcion?`<div style="font-size:11px;color:var(--texto-suave);">${m.descripcion}</div>`:''}</td>
    <td><span class="chip" style="font-size:10px;">${m.codigo}</span></td>
    <td><span class="badge ${m.activo?'badge-verde':'badge-gris'}" style="font-size:10px;">${m.activo?'Activo':'Inact.'}</span></td>
    <td style="display:flex;gap:3px;">
      <button class="btn btn-xs btn-secondary" onclick="editarMotivoNF(${i})">✏️</button>
      <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;font-size:10px;" onclick="toggleActivoNF(${i});renderMotivosNFLiq()">${m.activo?'✕':'✓'}</button>
    </td>
  </tr>`).join('');
}

function renderMotivosEFTLiq(){
  // Render en el tab Conceptos de Liquidación
  const tbody = $('tbody-motivos-eft-liq');
  if(!tbody) return;
  const motivos = DB.motivosFueraEFT||[];
  if(!motivos.length){
    tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--texto-suave);">Sin motivos</td></tr>`;
    return;
  }
  tbody.innerHTML = motivos.map((m,i)=>`<tr>
    <td style="font-weight:500;font-size:12px;">${m.nombre}${m.descripcion?`<div style="font-size:11px;color:var(--texto-suave);">${m.descripcion}</div>`:''}</td>
    <td><span class="chip" style="font-size:10px;">${m.codigo}</span></td>
    <td><span class="badge ${m.activo?'badge-verde':'badge-gris'}" style="font-size:10px;">${m.activo?'Activo':'Inact.'}</span></td>
    <td style="display:flex;gap:3px;">
      <button class="btn btn-xs btn-secondary" onclick="editarMotivoEFT(${i})">✏️</button>
      <button class="btn btn-xs" style="background:#fff3cd;color:#856404;border:1px solid #ffc107;font-size:10px;" onclick="toggleActivoEFT(${i});renderMotivosEFTLiq()">${m.activo?'✕':'✓'}</button>
    </td>
  </tr>`).join('');
}


function renderMotivosNF(){
  const tbody = $('tbody-motivos-nf');
  if(!tbody) return;
  const motivos = DB.motivosNoFact||[];
  if(!motivos.length){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">❌</div><p>Sin motivos configurados</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = motivos.map((m,i)=>`<tr>
    <td style="font-weight:500;">${m.nombre}</td>
    <td><span class="chip" style="font-size:11px;">${m.codigo}</span></td>
    <td style="font-size:12px;color:var(--texto-suave);">${m.descripcion||'—'}</td>
    <td><span class="badge ${m.activo?'badge-verde':'badge-gris'}">${m.activo?'Activo':'Inactivo'}</span></td>
    <td style="display:flex;gap:4px;">
      <button class="btn btn-xs btn-secondary" onclick="editarMotivoNF(${i})">✏️</button>
      <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;" onclick="toggleActivoNF(${i})">${m.activo?'Desactivar':'Activar'}</button>
    </td>
  </tr>`).join('');
}

function abrirModalMotivoNF(){
  _mnfEditIdx = null;
  $('motivo-nf-title').textContent = 'Nuevo motivo de no facturación';
  ['mnf-nombre','mnf-codigo','mnf-descripcion'].forEach(id=>{const el=$(id);if(el)el.value='';});
  abrirModal('modal-motivo-nf');
}

function editarMotivoNF(idx){
  const m = DB.motivosNoFact[idx];
  if(!m) return;
  _mnfEditIdx = idx;
  $('motivo-nf-title').textContent = 'Editar motivo';
  if($('mnf-nombre')) $('mnf-nombre').value = m.nombre;
  if($('mnf-codigo')) $('mnf-codigo').value = m.codigo;
  if($('mnf-descripcion')) $('mnf-descripcion').value = m.descripcion||'';
  abrirModal('modal-motivo-nf');
}

function guardarMotivoNF(){
  const nombre = $('mnf-nombre')?.value.trim();
  const codigo = ($('mnf-codigo')?.value||'').trim().toUpperCase();
  if(!nombre){toast('Ingresá el nombre del motivo');return;}
  if(_mnfEditIdx !== null){
    DB.motivosNoFact[_mnfEditIdx] = {...DB.motivosNoFact[_mnfEditIdx], nombre, codigo, descripcion:$('mnf-descripcion')?.value||''};
    supaSync('motivosNoFact', DB.motivosNoFact[_mnfEditIdx]); toast('✅ Motivo actualizado');
  } else {
    DB.motivosNoFact.push({id:Date.now(), nombre, codigo, descripcion:$('mnf-descripcion')?.value||'', activo:true});
    supaSync('motivosNoFact', DB.motivosNoFact[DB.motivosNoFact.length-1]); toast('✅ Motivo agregado');
  }
  cerrarModal('modal-motivo-nf');
  renderMotivosNF();
  poblarSelectMotivoNF(); // actualizar el select del modal de agregar asociado
}

function toggleActivoNF(idx){
  DB.motivosNoFact[idx].activo = !DB.motivosNoFact[idx].activo;
  renderMotivosNF();
}

function poblarSelectMotivoNF(){
  const sel = $('mag-motivo');
  if(!sel) return;
  const activos = (DB.motivosNoFact||[]).filter(m=>m.activo);
  sel.innerHTML = '<option value="">— Seleccionar motivo —</option>' +
    activos.map(m=>`<option value="${m.nombre}">${m.nombre}${m.codigo?' ('+m.codigo+')':''}</option>`).join('');
}

function toggleMotivoNoFact(){
  const val = $('mag-facturable')?.value;
  const blockNF  = $('mag-motivo-block');
  const blockEFT = $('mag-eft-block');
  if(val==='0'){
    if(blockNF)  blockNF.style.display  = 'block';
    if(blockEFT) blockEFT.style.display = 'none';
    poblarSelectMotivoNF();
  } else {
    if(blockNF)  blockNF.style.display  = 'none';
    if(blockEFT) blockEFT.style.display = 'block';
    // Resetear sub-bloque fuera EFT
    if($('mag-dentro-eft')) $('mag-dentro-eft').value = '1';
    if($('mag-fuera-eft-block')) $('mag-fuera-eft-block').style.display = 'none';
  }
}


// ═══════════════════════════════════════════════════════════
// SISTEMA DE AUTORIZACIONES — PENDIENTES E HISTORIAL
// Abarca: horas no facturables + horas fuera del EFT
// ═══════════════════════════════════════════════════════════
if(!DB.pendientesAuth)  DB.pendientesAuth  = [];
if(!DB.historialAuth)   DB.historialAuth   = [];

function registrarPendienteAuth(tipo, grillaId, asocIdx, detalle, solicitadoPor){
  // tipo: 'no_facturable' | 'fuera_eft' | 'cat_alt'
  const pend={
    id: Date.now() + Math.random(),
    tipo, grillaId, asocIdx, detalle, solicitadoPor,
    fecha: new Date().toLocaleDateString('es-AR'),
    estado: 'Pendiente',
  };
  DB.pendientesAuth.push(pend);
  supaSync('pendientesAuthLiq', {...pend, grillaId:idLocalTrunc(pend.grillaId)});
  construirMenu();
}

function renderPendientesAuth(){
  const tbody = $('tbody-pendientes-auth');
  if(!tbody) return;
  const esOps = ['Administrador total','Operaciones'].includes(currentUser?.perfil);
  const pendientes = (DB.pendientesAuth||[]).filter(p=>p.estado==='Pendiente');
  const counter = $('st-pendientes-auth-count');
  if(counter) counter.textContent = pendientes.length
    ? `${pendientes.length} pendiente${pendientes.length!==1?'s':''}`
    : 'Sin pendientes';
  if(!pendientes.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="icon">✅</div>
      <p>Sin pendientes de autorización</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = pendientes.map(p=>{
    const grilla = DB.grillasLiq.find(g=>g.id===p.grillaId);
    const asoc = grilla?.asociados?.[p.asocIdx];
    return `<tr>
      <td>${badgeTipoAuth(p.tipo)}</td>
      <td style="font-weight:500;font-size:12px;">${asoc?.nombre||'—'}</td>
      <td style="font-size:12px;">${grilla?.objCodigo||'—'}</td>
      <td style="font-size:12px;">${grilla?.periodo||'—'}</td>
      <td style="font-size:12px;max-width:220px;">${p.detalle}</td>
      <td style="font-size:12px;">${p.solicitadoPor}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${p.fecha}</td>
      <td>
        ${esOps ? `
          <div style="display:flex;gap:4px;">
            <button class="btn btn-xs" style="background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;"
              onclick="resolverAuth('${p.id}','Aprobada')">✓ Aprobar</button>
            <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;"
              onclick="resolverAuth('${p.id}','Rechazada')">✕ Rechazar</button>
          </div>` :
          '<span style="font-size:11px;color:var(--texto-suave);">Esperando Operaciones</span>'
        }
      </td>
    </tr>`;
  }).join('');
}

function resolverAuth(pendId, decision){
  const pend = DB.pendientesAuth.find(p=>p.id==pendId);
  if(!pend) return;
  pend.estado = decision;
  pend.resueltoPor = currentUser?.nombre||'Operaciones';
  pend.fechaResolucion = new Date().toLocaleDateString('es-AR');

  // Impactar en la grilla según la resolución
  const grilla = DB.grillasLiq.find(g=>g.id===pend.grillaId);
  const asoc = grilla?.asociados?.[pend.asocIdx];
  if(asoc){
    if(pend.tipo==='cat_alt'){
      // Categoría alternativa (punto 4 del delta): aprobar NUNCA pisa la
      // categoría de legajo — sólo habilita que compita por "el más
      // alto" en valorHoraEfectivoAsoc(). Rechazar limpia la propuesta
      // sin tocar nada de horas/facturable (a diferencia de los otros
      // dos tipos, acá NO corresponde borrar la fila del asociado).
      if(decision==='Aprobada'){
        asoc.catAltEstado='Aprobada';
        toast(`✅ Categoría alternativa "${asoc.catAltNombre}" aprobada — se usa si su valor es mayor al de la categoría de legajo`);
      } else {
        delete asoc.catAlt;delete asoc.catAltIdLocal;delete asoc.catAltNombre;
        delete asoc.catAltEstado;delete asoc.catAltFecha;delete asoc.catAltPor;
        toast('✕ Categoría alternativa rechazada');
      }
    } else if(decision==='Rechazada'){
      // Si se rechaza una no-facturable → se convierte en facturable
      // Si se rechaza fuera del EFT → se marca sin autorización
      if(pend.tipo==='no_facturable'){
        asoc.facturable = {};
        asoc.motivoNoFact = {};
        toast('✕ Rechazado — las horas quedan como facturables en la grilla');
      } else {
        // Marcar todas las horas fuera EFT como no autorizadas
        Object.keys(asoc.infoEFT||{}).forEach(dia=>{
          if(asoc.infoEFT[dia]?.fueraEFT) asoc.infoEFT[dia].autorizado = false;
        });
        toast('✕ Rechazado — horas fuera de EFT marcadas como no autorizadas');
      }
    } else {
      toast(`✅ Aprobado — ${pend.tipo==='no_facturable'?'horas no facturables':'horas fuera del EFT'} autorizadas`);
    }
  }

  supaSync('pendientesAuthLiq', {...pend, grillaId:idLocalTrunc(pend.grillaId)});
  if(grilla) supaSync('grillasLiq', grilla);

  // Mover de pendientes al historial (splice elimina de pendientes)
  const pendIdx = DB.pendientesAuth.findIndex(p=>p.id==pendId);
  if(pendIdx !== -1) DB.pendientesAuth.splice(pendIdx, 1);
  if(!DB.historialAuth) DB.historialAuth = [];
  const histEntry={...pend};
  DB.historialAuth.push(histEntry);
  supaSync('historialAuthLiq', {...histEntry, grillaId:idLocalTrunc(histEntry.grillaId)});

  construirMenu();
  renderPendientesAuth();
  renderHistorialAuth();
  renderGrillasLiq();
}

function renderHistorialAuth(){
  const tbody = $('tbody-historial-auth');
  if(!tbody) return;
  if(!DB.historialAuth.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="icon">📋</div>
      <p>Sin historial de autorizaciones</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = [...DB.historialAuth].reverse().map(p=>{
    const grilla = DB.grillasLiq.find(g=>g.id===p.grillaId);
    const asoc = grilla?.asociados?.[p.asocIdx];
    const tipoBadge = badgeTipoAuth(p.tipo);
    const estadoBadge = p.estado==='Aprobada'
      ? `<span class="badge badge-verde">✅ Aprobada</span>`
      : `<span class="badge badge-rojo">✕ Rechazada</span>`;
    return `<tr>
      <td style="font-size:12px;color:var(--texto-suave);">${p.fechaResolucion||'—'}</td>
      <td>${tipoBadge}</td>
      <td style="font-weight:500;font-size:12px;">${asoc?.nombre||p.detalle?.split(' — ')[0]||'—'}</td>
      <td style="font-size:12px;">${grilla?.objCodigo||'—'}</td>
      <td style="font-size:12px;">${grilla?.periodo||'—'}</td>
      <td style="font-size:12px;max-width:200px;">${p.detalle}</td>
      <td>${estadoBadge}</td>
      <td style="font-size:12px;">${p.resueltoPor||'—'}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${p.solicitadoPor||'—'}</td>
    </tr>`;
  }).join('');
}


if(!DB.motivosFueraEFT) DB.motivosFueraEFT = [
  {id:1, nombre:'Reemplazo de emergencia',     codigo:'REEMPL',  descripcion:'Cobertura urgente no planificada', activo:true},
  {id:2, nombre:'Evento especial del cliente', codigo:'EVENTO',  descripcion:'Limpieza o servicio extra por evento', activo:true},
  {id:3, nombre:'Solicitud extraordinaria',    codigo:'EXTRAORD',descripcion:'Pedido específico del cliente fuera del contrato', activo:true},
  {id:4, nombre:'Accidente o incidente',       codigo:'INCIDENT',descripcion:'Respuesta a un accidente o incidente en el servicio', activo:true},
  {id:5, nombre:'Mantenimiento correctivo',    codigo:'MANT',    descripcion:'Tareas de mantenimiento no contempladas en el EFT', activo:true},
];
let _meftEditIdx = null;

function renderMotivosEFT(){
  const tbody = $('tbody-motivos-eft');
  if(!tbody) return;
  const motivos = DB.motivosFueraEFT||[];
  if(!motivos.length){
    tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><div class="icon">⚠️</div><p>Sin motivos configurados</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = motivos.map((m,i)=>`<tr>
    <td style="font-weight:500;">${m.nombre}</td>
    <td><span class="chip" style="font-size:11px;">${m.codigo}</span></td>
    <td style="font-size:12px;color:var(--texto-suave);">${m.descripcion||'—'}</td>
    <td><span class="badge ${m.activo?'badge-verde':'badge-gris'}">${m.activo?'Activo':'Inactivo'}</span></td>
    <td style="display:flex;gap:4px;">
      <button class="btn btn-xs btn-secondary" onclick="editarMotivoEFT(${i})">✏️</button>
      <button class="btn btn-xs" style="background:#fff3cd;color:#856404;border:1px solid #ffc107;" onclick="toggleActivoEFT(${i})">${m.activo?'Desactivar':'Activar'}</button>
    </td>
  </tr>`).join('');
}

function abrirModalMotivoEFT(){
  _meftEditIdx = null;
  $('motivo-eft-title').textContent = 'Nuevo motivo fuera del EFT';
  ['meft-nombre','meft-codigo','meft-descripcion'].forEach(id=>{const el=$(id);if(el)el.value='';});
  abrirModal('modal-motivo-eft');
}

function editarMotivoEFT(idx){
  const m = DB.motivosFueraEFT[idx];
  if(!m) return;
  _meftEditIdx = idx;
  $('motivo-eft-title').textContent = 'Editar motivo EFT';
  if($('meft-nombre')) $('meft-nombre').value = m.nombre;
  if($('meft-codigo')) $('meft-codigo').value = m.codigo;
  if($('meft-descripcion')) $('meft-descripcion').value = m.descripcion||'';
  abrirModal('modal-motivo-eft');
}

function guardarMotivoEFT(){
  const nombre = $('meft-nombre')?.value.trim();
  const codigo = ($('meft-codigo')?.value||'').trim().toUpperCase();
  if(!nombre){toast('Ingresá el nombre del motivo');return;}
  if(_meftEditIdx !== null){
    DB.motivosFueraEFT[_meftEditIdx] = {...DB.motivosFueraEFT[_meftEditIdx], nombre, codigo, descripcion:$('meft-descripcion')?.value||''};
    supaSync('motivosFueraEFT', DB.motivosFueraEFT[_meftEditIdx]);
    toast('✅ Motivo actualizado');
  } else {
    DB.motivosFueraEFT.push({id:Date.now(), nombre, codigo, descripcion:$('meft-descripcion')?.value||'', activo:true});
    supaSync('motivosFueraEFT', DB.motivosFueraEFT[DB.motivosFueraEFT.length-1]);
    toast('✅ Motivo agregado');
  }
  cerrarModal('modal-motivo-eft');
  renderMotivosEFT();
  poblarSelectMotivoEFT();
}

function toggleActivoEFT(idx){
  DB.motivosFueraEFT[idx].activo = !DB.motivosFueraEFT[idx].activo;
  renderMotivosEFT();
}

function poblarSelectMotivoEFT(){
  const sel = $('mag-motivo-eft');
  if(!sel) return;
  const activos = (DB.motivosFueraEFT||[]).filter(m=>m.activo);
  sel.innerHTML = '<option value="">— Seleccionar motivo —</option>' +
    activos.map(m=>`<option value="${m.nombre}">${m.nombre}${m.codigo?' ('+m.codigo+')':''}</option>`).join('');
}

function toggleFueraEFT(){
  const val = $('mag-dentro-eft')?.value;
  const block = $('mag-fuera-eft-block');
  if(!block) return;
  if(val==='0'){
    block.style.display = 'block';
    poblarSelectMotivoEFT();
  } else {
    block.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
// VALIDACIÓN ART.42 — máximo 3 días
// ═══════════════════════════════════════════════════════════
function validarFechasArt42(){
  const motivo = $('mag-motivo')?.value||'';
  const esArt42 = motivo.toLowerCase().includes('42');
  const alerta  = $('mag-alerta-art42');
  const btnAgregar = document.querySelector('#modal-agregar-asoc-grilla .btn-primary');
  if(!esArt42){
    if(alerta) alerta.style.display='none';
    if(btnAgregar){btnAgregar.disabled=false;btnAgregar.style.opacity='';}
    return true;
  }
  const desde = $('mag-desde')?.value;
  const hasta  = $('mag-hasta')?.value;
  if(!desde||!hasta) return true;
  const d1 = new Date(desde+'T12:00:00');
  const d2 = new Date(hasta+'T12:00:00');
  const diffDias = Math.round((d2-d1)/(1000*60*60*24)) + 1;
  if(diffDias > 3){
    if(alerta) alerta.style.display = 'block';
    // Bloquear el botón Agregar
    if(btnAgregar){
      btnAgregar.disabled = true;
      btnAgregar.style.opacity = '0.4';
      btnAgregar.title = 'Art. 42: reducí el rango a 3 días o menos para continuar';
    }
    return false;
  }
  // Menos de 3 días — habilitar
  if(alerta) alerta.style.display = 'none';
  if(btnAgregar){btnAgregar.disabled=false;btnAgregar.style.opacity='';btnAgregar.title='';}
  return true;
}


const CATS_POR_TIPO = {
  operario: ['Operario/a limpieza','Operario/a limpieza especializado/a'],
  encargado: ['Encargado/a de turno','Encargado/a de turno especializado/a'],
  reten: ['Retén categoría A','Retén categoría B','Retén categoría C','Franquero/a','Franquero/a especializado/a'],
  supervisor: ['Supervisor/a','Coordinador/a de área'],
  administrativo: ['Administrativo/a','Auxiliar administrativo/a'],
};

function getCategoriasPorTipo(catActual){
  const c = (catActual||'').toLowerCase();
  if(c.includes('retén')||c.includes('reten')||c.includes('franquero')) return CATS_POR_TIPO.reten;
  if(c.includes('encargado')) return CATS_POR_TIPO.encargado;
  if(c.includes('supervisor')||c.includes('coordinador')) return CATS_POR_TIPO.supervisor;
  if(c.includes('administrativo')||c.includes('auxiliar')) return CATS_POR_TIPO.administrativo;
  return CATS_POR_TIPO.operario; // default
}

// ═══════════════════════════════════════════════════════════
// CATEGORÍA ALTERNATIVA (DELTA_liquidacion_horas_v1, punto 4)
// ═══════════════════════════════════════════════════════════
// Antes tenía su propio circuito paralelo de aprobación
// (catAltPendientesLiq/catAltHistorial) con una pantalla de "Cat.
// pendientes" que nunca llegó a tener HTML propio — quedaba huérfano,
// sólo se resolvía desde un modal disparado por el badge en la grilla.
// Ahora reusa el circuito real de "Autorizaciones pendientes"
// (registrarPendienteAuth/resolverAuth/notificarseAuth, tipo 'cat_alt')
// para que aparezca donde el Gerente de Operaciones ya mira todo lo
// demás. Además cambia de fondo: antes guardaba un NOMBRE de categoría
// (lista hardcodeada CATS_POR_TIPO) y al aprobar pisaba asoc.categoria;
// ahora guarda un categoriaIdLocal real del módulo Categorías y, al
// aprobar, NO pisa nada — sólo habilita que compita por "el valor más
// alto" contra la categoría de legajo (valorHoraEfectivoAsoc).
function solicitarCatAlt(grillaId, asocIdx, catIdLocal){
  if(!catIdLocal) return;
  const grilla = DB.grillasLiq.find(g=>g.id===grillaId);
  if(!grilla) return;
  const asoc = grilla.asociados[asocIdx];
  if(!asoc) return;
  const cat = getCategoriaById(catIdLocal);
  if(!cat) return;
  asoc.catAltIdLocal = idLocalTrunc(catIdLocal);
  asoc.catAltNombre = cat.nombre;
  asoc.catAltEstado = 'Pendiente';
  asoc.catAltFecha = new Date().toLocaleDateString('es-AR');
  asoc.catAltPor = currentUser?.nombre||'Supervisor';
  supaSync('grillasLiq', grilla);
  registrarPendienteAuth('cat_alt', grillaId, asocIdx, `Categoría alternativa propuesta: ${cat.nombre}`, asoc.catAltPor);
  renderGrillasLiq();
  toast(`⏳ Categoría alternativa "${cat.nombre}" propuesta — pendiente de aprobación de Operaciones`);
}

// ═══════════════════════════════════════════════════════════
// MODAL AGREGAR ASOCIADO CON CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════
let _magPendiente = null; // {grillaId, nombre, categoria, nro}

function agregarAsocDesdeSearch(grillaId, nombre, categoria, nro){
  const grilla = DB.grillasLiq.find(g=>g.id===grillaId);
  if(!grilla) return;
  if((grilla.asociados||[]).find(a=>a.nombre===nombre)){toast('Ya está en la grilla');return;}
  // Limpiar buscador
  const inp = document.getElementById('busq-asoc-'+grillaId);
  const res = document.getElementById('res-asoc-'+grillaId);
  if(inp) inp.value='';
  if(res){res.style.display='none';res.innerHTML='';}
  // Guardar pendiente y abrir modal de configuración
  _magPendiente = {grillaId, nombre, categoria, nro};
  $('mag-nombre-display').textContent = `Configurando ingreso de: ${nombre}`;
  // Presetear rango con el mes de la grilla — limitado al mes
  const [y,m] = grilla.periodo.split('-');
  const primerDia = `${y}-${m}-01`;
  const ultimoDia = new Date(parseInt(y), parseInt(m), 0);
  const ultimoDiaStr = `${y}-${m}-${String(ultimoDia.getDate()).padStart(2,'0')}`;
  // Por defecto: desde = primer día del mes, hasta = último día del mes
  // El supervisor ajusta el rango — el hasta NO se resetea automáticamente
  if($('mag-desde')){$('mag-desde').value=primerDia;$('mag-desde').min=primerDia;$('mag-desde').max=ultimoDiaStr;}
  if($('mag-hasta')){$('mag-hasta').value=ultimoDiaStr;$('mag-hasta').min=primerDia;$('mag-hasta').max=ultimoDiaStr;}
  if($('mag-horas')) $('mag-horas').value = '8';
  ['mag-lunes','mag-martes','mag-miercoles','mag-jueves','mag-viernes',
   'mag-lunes','mag-martes','mag-miercoles','mag-jueves','mag-viernes','mag-sabados','mag-domingos','mag-feriados'].forEach(id=>{
    const el=$(id); if(el) el.checked=true;
  });
  if($('mag-facturable')) $('mag-facturable').value = '1';
  if($('mag-motivo-block')) $('mag-motivo-block').style.display = 'none';
  if($('mag-motivo')) $('mag-motivo').value = '';
  if($('mag-eft-block')) $('mag-eft-block').style.display = 'block';
  if($('mag-dentro-eft')) $('mag-dentro-eft').value = '1';
  if($('mag-fuera-eft-block')) $('mag-fuera-eft-block').style.display = 'none';
  if($('mag-eft-autorizado')) $('mag-eft-autorizado').value = '';
  if($('mag-motivo-eft')) $('mag-motivo-eft').value = '';
  if($('mag-alerta-art42')) $('mag-alerta-art42').style.display = 'none';
  abrirModal('modal-agregar-asoc-grilla');
}

function confirmarAgregarAsoc(){
  if(!_magPendiente) return;
  const {grillaId, nombre, categoria, nro} = _magPendiente;
  const grilla = DB.grillasLiq.find(g=>g.id===grillaId);
  if(!grilla){cerrarModal('modal-agregar-asoc-grilla');return;}
  const desde     = $('mag-desde')?.value;
  const hasta     = $('mag-hasta')?.value;
  const horas     = parseFloat($('mag-horas')?.value)||8;
  const lunes     = $('mag-lunes')?.checked!==false;
  const martes    = $('mag-martes')?.checked!==false;
  const miercoles = $('mag-miercoles')?.checked!==false;
  const jueves    = $('mag-jueves')?.checked!==false;
  const viernes   = $('mag-viernes')?.checked!==false;
  const sabados   = $('mag-sabados')?.checked||false;
  const domingos  = $('mag-domingos')?.checked||false;
  const feriados  = $('mag-feriados')?.checked||false;
  const facturable = ($('mag-facturable')?.value)==='1';
  const motivo    = $('mag-motivo')?.value||'';
  const dentroEFT = ($('mag-dentro-eft')?.value||'1')==='1';
  const motivoEFT = $('mag-motivo-eft')?.value||'';
  const eftAutorizado = $('mag-eft-autorizado')?.value||'';

  if(!desde||!hasta){toast('Completá las fechas');return;}
  if(desde>hasta){toast('La fecha de inicio no puede ser posterior al final');return;}

  // Validar Art.42 — máx 3 días consecutivos
  if(!facturable && motivo.toLowerCase().includes('42')){
    const d1=new Date(desde+'T12:00:00'), d2=new Date(hasta+'T12:00:00');
    const diasRango = Math.round((d2-d1)/(1000*60*60*24))+1;
    if(diasRango>3){toast('Art. 42 tiene un máximo de 3 días consecutivos. Ajustá el rango de fechas.');return;}
  }

  // Validar no facturable requiere motivo
  if(!facturable && !motivo){toast('Seleccioná el motivo de no facturación');return;}

  // Validar fuera del EFT requiere motivo y estado autorización
  if(facturable && !dentroEFT){
    if(!eftAutorizado){toast('Indicá si las horas fuera del EFT están autorizadas por el cliente');return;}
    if(!motivoEFT){toast('Seleccioná el motivo de horas fuera del EFT');return;}
  }

  // Generar horas día a día
  const horasMap={}, factMap={}, motivoMap={}, eftMap={};
  const diasMes = getDiasDelMes(grilla.periodo);
  // Para Art.42: limitar a máximo 3 días efectivos
  const esArt42 = !facturable && motivo.toLowerCase().includes('42');
  let diasArt42Cargados = 0;
  diasMes.forEach(dia=>{
    if(dia.iso<desde||dia.iso>hasta) return;
    // Art.42: parar al llegar a 3 días cargados
    if(esArt42 && diasArt42Cargados >= 3) return;
    const dow=new Date(dia.iso+'T12:00:00').getDay();
    if(dow===1&&!lunes) return;
    if(dow===2&&!martes) return;
    if(dow===3&&!miercoles) return;
    if(dow===4&&!jueves) return;
    if(dow===5&&!viernes) return;
    if(dow===6&&!sabados) return;
    if(dow===0&&!domingos) return;
    if(dia.esFeriado&&!feriados) return;
    horasMap[dia.iso]=horas;
    if(esArt42) diasArt42Cargados++;
    if(!facturable){ factMap[dia.iso]=false; motivoMap[dia.iso]=motivo; }
    if(facturable&&!dentroEFT){
      eftMap[dia.iso]={fueraEFT:true, autorizado:eftAutorizado==='1', motivo:motivoEFT};
    }
  });

  // ── Validar EFT total del servicio ──
  const horasNuevas = Object.keys(horasMap).reduce((s,d)=>s+parseFloat(horasMap[d]||0),0);
  if(grilla.horasEFT){
    const horasActuales = (grilla.asociados||[]).reduce((s,a)=>s+Object.values(a.horas||{}).reduce((ss,h)=>ss+parseFloat(h||0),0),0);
    const totalConNuevas = horasActuales + horasNuevas;
    if(totalConNuevas > grilla.horasEFT){
      const exceso = Math.round(totalConNuevas - grilla.horasEFT);
      toast('⚠️ Atención: el servicio supera el EFT contratado en '+exceso+'hs. Las horas se cargan igual pero quedarán registradas como exceso de EFT.');
    }
  }

  if(!grilla.asociados) grilla.asociados=[];
  const asocIdx = grilla.asociados.length;
  // Determinar tipoHora según lo que eligió el supervisor
  const tipoHoraAsoc = !facturable
    ? (motivo.toLowerCase().includes('42') ? 'art42' : 'no_facturable')
    : (dentroEFT ? 'facturable' : 'facturable');

  grilla.asociados.push({
    nombre, categoria:categoria||'Operario/a limpieza', nro,
    horas:horasMap, facturable:factMap, motivoNoFact:motivoMap, infoEFT:eftMap,
    tipoHora:tipoHoraAsoc, motivoTipo:!facturable?motivo:(motivoEFT||''),
    rangoDesde:desde, rangoHasta:hasta,
    esExtra:false, esEnfermedad:false, esReten:false, esEspecial:false,
  });

  // Registrar pendiente de autorización si corresponde
  const diasCargados = Object.keys(horasMap).length;
  if(!facturable && motivo){
    registrarPendienteAuth(
      'no_facturable', grillaId, asocIdx,
      `${nombre} — ${diasCargados} día(s) — Motivo: ${motivo}`,
      currentUser?.nombre||'Supervisor'
    );
    toast(`✅ ${nombre} agregado — horas no facturables pendientes de autorización por Operaciones`);
  } else if(facturable && !dentroEFT && motivoEFT){
    registrarPendienteAuth(
      'fuera_eft', grillaId, asocIdx,
      `${nombre} — ${diasCargados} día(s) fuera EFT — ${motivoEFT} — ${eftAutorizado==='1'?'Con autorización cliente':'Sin autorización cliente'}`,
      currentUser?.nombre||'Supervisor'
    );
    toast(`✅ ${nombre} agregado — horas fuera del EFT pendientes de autorización por Operaciones`);
  } else {
    toast(`✅ ${nombre} agregado a la grilla`);
  }

  if(nro) validarValorHoraAsociado(nro, grilla.objCodigo);
  supaSync('grillasLiq', grilla);
  _magPendiente=null;
  cerrarModal('modal-agregar-asoc-grilla');
  renderGrillasLiq();
}


// tabLiquidacion
function tabLiquidacion(tab, btn){
  document.querySelectorAll('#screen-liquidacion .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-liquidacion .tab-btn').forEach(b=>b.classList.remove('active'));
  const el = $('liq-tab-'+tab); if(el) el.classList.add('active');
  if(btn) btn.classList.add('active');
  if(tab==='pendientes_auth'){ renderPendientesAuth(); renderHistorialAuth(); }
  if(tab==='mis_auth') renderMisAuth();
}

// ART 42
function renderLiqArt42(){
  const tbody = $('tbody-liq-art42'); if(!tbody) return;
  const filas = [];
  (DB.grillasLiq||[]).forEach(grilla=>{
    const obj = DB.objetivos.find(o=>o.codigo===grilla.objCodigo);
    (grilla.asociados||[]).forEach(asoc=>{
      const dias42 = Object.entries(asoc.motivoNoFact||{})
        .filter(([,m])=>String(m).toLowerCase().includes('42'))
        .map(([d])=>d).sort();
      if(!dias42.length || dias42.length > 3) return;
      const totalHs = dias42.reduce((s,d)=>s+parseFloat(asoc.horas?.[d]||0),0);
      const leg = (DB.legajos||[]).find(l=>l.nombre===asoc.nombre);
      filas.push({
        asociado:asoc.nombre, nroSocio:leg?.nro||'—',
        servicio:grilla.objCodigo, supervisor:obj?.supervisor||'—',
        periodo:grilla.periodo, categoria:asoc.categoria||'—',
        dias:dias42.length, totalHs,
        desde:dias42[0], hasta:dias42[dias42.length-1],
      });
    });
  });
  const fmt = iso=>iso?iso.split('-').reverse().join('/'):'—';
  if(!filasConsolidadas.length){
    tbody.innerHTML='<tr><td colspan="10"><div class="empty-state"><div class="icon">🏥</div><p>Sin asociados con Art. 42 (≤ 3 días)</p><p style="font-size:12px;color:var(--texto-suave);">Los casos de más de 3 días van a Enfermos y Accidentados</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(f=>'<tr><td style="font-weight:500;">'+f.asociado+'</td><td style="font-size:12px;font-family:monospace;">'+f.nroSocio+'</td><td style="font-size:12px;">'+f.servicio+'</td><td style="font-size:12px;">'+f.supervisor+'</td><td style="font-size:12px;">'+f.periodo+'</td><td style="font-size:12px;">'+fmt(f.desde)+'</td><td style="font-size:12px;">'+fmt(f.hasta)+'</td><td style="font-weight:700;color:var(--rojo);">'+f.dias+'d</td><td style="font-size:12px;">'+f.categoria+'</td><td style="font-weight:700;color:var(--azul);">'+f.totalHs+'hs</td></tr>').join('');
}

// ALERTAS EFT
if(!DB.alertasEFT) DB.alertasEFT = [];

function registrarAlertaEFT(grillaId, asocIdx, detalleMotivo, autorCliente){
  DB.alertasEFT.push({
    id:Date.now()+Math.random(), grillaId, asocIdx,
    fecha:new Date().toLocaleDateString('es-AR'),
    estado:'Pendiente', detalleMotivo, autorCliente,
    solicitadoPor:currentUser?.nombre||'Supervisor',
    resueltoPor:'', fechaResolucion:'',
  });
}

function renderAlertasEFT(){
  const tbody = $('tbody-alertas-eft'); if(!tbody) return;
  const esOps = ['Administrador total','Operaciones'].includes(currentUser?.perfil);
  const registros = [...(DB.alertasEFT||[])].reverse();
  const pendCount = registros.filter(r=>r.estado==='Pendiente').length;
  const stEl = $('st-alertas-eft-pend');
  if(stEl) stEl.textContent = pendCount ? pendCount+' pendiente'+(pendCount!==1?'s':'') : '';
  if(!registros.length){
    tbody.innerHTML='<tr><td colspan="10"><div class="empty-state"><div class="icon">⚠️</div><p>Sin alertas EFT registradas</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = registros.map(r=>{
    const grilla=DB.grillasLiq.find(g=>g.id===r.grillaId);
    const asoc=grilla?.asociados?.[r.asocIdx];
    const acciones = r.estado==='Pendiente'&&esOps?'<button class="btn btn-xs btn-primary" onclick="resolverAlertaEFT('+JSON.stringify(r.id)+',' + JSON.stringify('Aprobada')+')">✓</button><button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;margin-left:3px;" onclick="resolverAlertaEFT('+JSON.stringify(r.id)+','+JSON.stringify('Rechazada')+')">✕</button>':r.estado!=='Pendiente'?'<span style="font-size:11px;color:var(--texto-suave);">'+r.resueltoPor+'</span>':'<span style="font-size:11px;color:var(--texto-suave);">Esperando Ops.</span>';
    return '<tr style="'+(r.estado==='Pendiente'?'background:#fffbea;':'')+'"><td>'+badge+'</td><td style="font-size:12px;color:var(--texto-suave);">'+r.fecha+'</td><td style="font-weight:500;">'+(asoc?.nombre||'—')+'</td><td style="font-size:12px;">'+(grilla?.objCodigo||'—')+'</td><td style="font-size:12px;">'+(grilla?.periodo||'—')+'</td><td style="font-weight:700;color:var(--naranja);">'+(Object.keys(asoc?.infoEFT||{}).length)+'d</td><td style="font-size:12px;">'+(r.detalleMotivo||'—')+'</td><td style="font-size:12px;">'+(r.autorCliente==='1'?'✅ Sí':'⚠️ No')+'</td><td>'+acciones+'</td></tr>';
  }).join('');
}

function resolverAlertaEFT(id, decision){
  const r=DB.alertasEFT.find(a=>a.id==id); if(!r) return;
  r.estado=decision; r.resueltoPor=currentUser?.nombre||'Operaciones';
  r.fechaResolucion=new Date().toLocaleDateString('es-AR');
  if(decision==='Rechazada'){
    const grilla=DB.grillasLiq.find(g=>g.id===r.grillaId);
    const asoc=grilla?.asociados?.[r.asocIdx];
    if(asoc) asoc.infoEFT={};
  }
  renderAlertasEFT(); renderGrillasLiq();
  toast(decision==='Aprobada'?'✅ Aprobado':'✕ Rechazado — horas EFT removidas');
}

// RESUMEN DEL MES
function initResumenMes(){
  const sel=$('resumen-mes-sel');
  if(sel&&!sel.value) sel.value=new Date().toISOString().slice(0,7);
}

function renderResumenMes(){
  const mes=$('resumen-mes-sel')?.value||new Date().toISOString().slice(0,7);
  const grillas=(DB.grillasLiq||[]).filter(g=>g.periodo===mes);
  const pagar={}, facturar={};
  const tipos={facturable:0,noFacturable:0,fueraEFT:0,art42:0};
  grillas.forEach(grilla=>{
    const obj=DB.objetivos.find(o=>o.codigo===grilla.objCodigo);
    const cli=obj?(DB.clientes.find(c=>c.id===obj.clienteId)?.nombre||obj.clienteId):grilla.objCodigo;
    if(!pagar[grilla.objCodigo]) pagar[grilla.objCodigo]={nombre:obj?.nombre||grilla.objCodigo,cliente:cli,total:0};
    if(!facturar[cli]) facturar[cli]={total:0};
    (grilla.asociados||[]).forEach(asoc=>{
      Object.keys(asoc.horas||{}).forEach(dia=>{
        const h=parseFloat(asoc.horas[dia]||0); if(!h) return;
        pagar[grilla.objCodigo].total+=h*getCategoriaVH(asoc.categoria);
        const esA=String(asoc.motivoNoFact?.[dia]||'').toLowerCase().includes('42');
        const esN=asoc.facturable?.[dia]===false;
        const esE=asoc.infoEFT?.[dia]?.fueraEFT===true;
        if(esA) tipos.art42+=h;
        else if(esN) tipos.noFacturable+=h;
        else if(esE) tipos.fueraEFT+=h;
        else{tipos.facturable+=h;facturar[cli].total+=h;}
      });
    });
  });
  const fmt=n=>Math.round(n).toLocaleString('es-AR');
  const totalPagar=Object.values(pagar).reduce((s,v)=>s+v.total,0);
  const totalHs=Object.values(tipos).reduce((s,v)=>s+v,0);
  const c=$('resumen-mes-contenido'); if(!c) return;

  const rPagar=Object.entries(pagar).map(([cod,d])=>'<tr><td style="font-weight:500;">'+cod+'</td><td style="font-size:12px;color:var(--texto-suave);">'+d.cliente+'</td><td style="text-align:right;font-weight:700;color:var(--azul);">$'+fmt(d.total)+'</td></tr>').join('')||'<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--texto-suave);">Sin datos</td></tr>';
  const rFact=Object.entries(facturar).map(([cli,d])=>'<tr><td style="font-weight:500;">'+cli+'</td><td style="text-align:right;font-weight:700;color:var(--verde);">'+d.total+'hs</td></tr>').join('')||'<tr><td colspan="2" style="text-align:center;padding:16px;color:var(--texto-suave);">Sin datos</td></tr>';
  const tiposArr=[
    {label:'Facturables',    val:tipos.facturable,   color:'var(--verde)',   bg:'var(--verde-claro)'},
    {label:'No facturables', val:tipos.noFacturable, color:'var(--rojo)',    bg:'#fff5f5'},
    {label:'Fuera del EFT', val:tipos.fueraEFT,     color:'var(--naranja)', bg:'#fff8f0'},
    {label:'Art. 42',        val:tipos.art42,        color:'#8b5cf6',        bg:'#f5f3ff'},
  ];
  const rTipos=tiposArr.map(t=>{
    const p=totalHs?Math.round(t.val/totalHs*100):0;
    return '<div style="background:'+t.bg+';border-radius:8px;padding:10px 14px;margin-bottom:8px;"><div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="font-size:12px;font-weight:600;">'+t.label+'</span><span style="font-weight:700;color:'+t.color+';">'+t.val+'hs <span style="font-size:10px;opacity:.7;">('+p+'%)</span></span></div><div style="background:rgba(0,0,0,.08);border-radius:4px;height:6px;"><div style="background:'+t.color+';width:'+p+'%;height:6px;border-radius:4px;"></div></div></div>';
  }).join('');

  c.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">'
    +'<div class="card"><div class="card-header"><h3>💰 Total a pagar por servicio</h3></div>'
    +'<table style="width:100%;font-size:12px;"><thead><tr><th>Servicio</th><th>Cliente</th><th style="text-align:right;">Total $</th></tr></thead>'
    +'<tbody>'+rPagar+'</tbody><tfoot><tr style="background:var(--azul-claro);"><td colspan="2" style="font-weight:700;padding:6px 8px;">TOTAL</td>'
    +'<td style="text-align:right;font-weight:800;color:var(--azul);padding:6px 8px;">$'+fmt(totalPagar)+'</td></tr></tfoot></table></div>'
    +'<div class="card"><div class="card-header"><h3>🏢 Total a facturar por cliente</h3></div>'
    +'<table style="width:100%;font-size:12px;"><thead><tr><th>Cliente</th><th style="text-align:right;">Hs facturables</th></tr></thead>'
    +'<tbody>'+rFact+'</tbody><tfoot><tr style="background:var(--verde-claro);"><td style="font-weight:700;padding:6px 8px;">TOTAL</td>'
    +'<td style="text-align:right;font-weight:800;color:var(--verde);padding:6px 8px;">'+tipos.facturable+'hs</td></tr></tfoot></table></div>'
    +'<div class="card"><div class="card-header"><h3>📊 Distribución de horas</h3></div>'
    +'<div style="padding:12px;">'+rTipos+'<div style="text-align:right;font-size:12px;color:var(--texto-suave);border-top:1px solid var(--borde);padding-top:8px;">Total: <strong>'+totalHs+'hs</strong></div></div></div></div>';
}

// CATEGORÍAS PENDIENTES
if(!DB.catAltPendientesLiq) DB.catAltPendientesLiq=[];
if(!DB.catAltHistorial)  DB.catAltHistorial=[];
// Manejo de teclado en el buscador de asociados de la grilla


// Cuando cambia la fecha "desde" en el modal de agregar asociado
function onChangeMagDesde(){
  const desdeEl = $('mag-desde');
  const hastaEl = $('mag-hasta');
  if(!desdeEl||!hastaEl) return;
  const desde = desdeEl.value;
  if(!desde) return;
  // Solo ajustar el hasta si quedó ANTES del nuevo desde (incoherente)
  // En cualquier otro caso, respetar el hasta que eligió el supervisor
  if(hastaEl.value && hastaEl.value < desde){
    hastaEl.value = desde;
  }
  hastaEl.min = desde;
  validarFechasArt42();
}


// ── RENDER MIS AUTORIZACIONES (vista del supervisor) ──
function renderMisAuth(){
  const tbody = $('tbody-mis-auth');
  if(!tbody) return;
  const esSup = currentUser?.perfil === 'Supervisor';

  // El supervisor ve sus servicios; admin/operaciones ven todo
  const misServicios = esSup
    ? (DB.grillasLiq||[])
        .filter(g=>g.supervisor===currentUser.nombre||g.supervisor===currentUser.funcion)
        .map(g=>g.id)
    : (DB.grillasLiq||[]).map(g=>g.id);

  const pendActivos  = (DB.pendientesAuth||[]).filter(p=>misServicios.includes(p.grillaId));
  const histResuelto = (DB.historialAuth||[]).filter(p=>misServicios.includes(p.grillaId));
  const items = [...pendActivos, ...histResuelto];

  const pendCount = items.filter(p=>!p.supervisorNotificado).length;
  const counter = $('st-mis-auth-count');
  if(counter) counter.textContent = pendCount
    ? pendCount+' sin notificar'
    : 'Al día';

  if(!items.length){
    tbody.innerHTML=`<tr><td colspan="9"><div class="empty-state"><div class="icon">✅</div>
      <p>Sin novedades de autorización</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(p=>{
    const grilla = DB.grillasLiq.find(g=>g.id===p.grillaId);
    const asoc   = grilla?.asociados?.[p.asocIdx];

    const estadoBadge =
      p.estado==='Pendiente'
        ? '<span class="badge" style="background:#fef3c7;color:#92400e;">⏳ Pendiente</span>'
      : p.estado==='Aprobada'
        ? '<span class="badge badge-verde">✅ Aprobada</span>'
        : '<span class="badge badge-rojo">✕ Rechazada</span>';

    const tipoBadge = badgeTipoAuth(p.tipo);

    const accion = p.supervisorNotificado
      ? '<span style="font-size:11px;color:var(--verde);">✓ Notificado</span>'
      : p.estado !== 'Pendiente'
        ? `<button class="btn btn-xs btn-primary" onclick="notificarseAuth('${p.id}')">👁 Me notifiqué</button>`
        : '<span style="font-size:11px;color:var(--texto-suave);">Esperando Operaciones</span>';

    return `<tr style="${p.estado==='Rechazada'&&!p.supervisorNotificado?'background:#fff0f0;':''}">
      <td>${estadoBadge}</td>
      <td>${tipoBadge}</td>
      <td style="font-size:12px;font-weight:500;">${asoc?.nombre||'—'}</td>
      <td style="font-size:12px;">${grilla?.objCodigo||'—'}</td>
      <td style="font-size:12px;">${grilla?.periodo||'—'}</td>
      <td style="font-size:12px;max-width:200px;">${p.detalle}</td>
      <td style="font-size:12px;">${p.resueltoPor||'—'}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${p.fechaResolucion||'—'}</td>
      <td>${accion}</td>
    </tr>`;
  }).join('');
}

// ── SUPERVISOR SE NOTIFICA ──
function notificarseAuth(pendId){
  // Buscar en pendientes activos Y en historial (ya resueltos)
  const pend = (DB.pendientesAuth||[]).find(p=>String(p.id)===String(pendId))
            || (DB.historialAuth||[]).find(p=>String(p.id)===String(pendId));
  if(!pend) return;
  pend.supervisorNotificado = true;
  pend.fechaNotificacion = new Date().toLocaleDateString('es-AR');
  pend.notificadoPor = currentUser?.nombre||'Supervisor';

  // Si fue rechazada → eliminar la fila del asociado de la grilla
  // La categoría alternativa rechazada ya se limpió en resolverAuth() —
  // a diferencia de no_facturable/fuera_eft, NO corresponde borrar la
  // fila del asociado (sigue trabajando bajo su categoría de legajo).
  if(pend.estado==='Rechazada'&&pend.tipo!=='cat_alt'){
    const grilla = DB.grillasLiq.find(g=>g.id===pend.grillaId);
    if(grilla && grilla.asociados && grilla.asociados[pend.asocIdx]!==undefined){
      grilla.asociados.splice(pend.asocIdx, 1);
      // Actualizar los asocIdx de los pendientes que apuntan a posiciones posteriores
      (DB.pendientesAuth||[]).forEach(p=>{
        if(p.grillaId===pend.grillaId && p.asocIdx>pend.asocIdx) p.asocIdx--;
      });
      toast('🗑 Fila del asociado eliminada de la grilla por rechazo.');
      renderGrillasLiq();
    }
  } else {
    toast('✅ Notificación registrada.');
  }
  construirMenu();
  renderMisAuth();
}


// ══════════════════════════════════════════════════════════
// LIQUIDACIÓN ADMINISTRACIÓN
// ══════════════════════════════════════════════════════════

if(!DB.liqAdminPersonal) DB.liqAdminPersonal = [
  {id:1, nombre:'García Laura',     area:'RRHH',       categoria:'Jefa de RRHH',      horasFijas:200, valorHora:1750, activo:true},
  {id:2, nombre:'Maidana Matías',   area:'Operaciones',categoria:'Coordinador',        horasFijas:200, valorHora:1500, activo:true},
  {id:3, nombre:'Cazenave Claudia', area:'Operaciones',categoria:'Supervisora',        horasFijas:200, valorHora:1400, activo:true},
  {id:4, nombre:'Unzain Lorena',    area:'Operaciones',categoria:'Supervisora',        horasFijas:200, valorHora:1400, activo:true},
  {id:5, nombre:'Rodríguez Pablo',  area:'Finanzas',   categoria:'Contador/a',        horasFijas:200, valorHora:1600, activo:true},
];
// horasFijas: horas contractuales del mes (base de cálculo del sueldo)
// valorHora: pesos por hora según categoría (modificable)
// sueldo = horasFijas × valorHora (las ausencias NO descuentan)

if(!DB.liqAdminHoras) DB.liqAdminHoras = {};
// Estructura: DB.liqAdminHoras[periodo][personalId][fechaISO] = valor (número o F/AJ/AI)


// ── Tab del módulo Liquidación Administración ──
let _ladmTabActual = 'planilla';
function tabLiqAdmin(tab, btn){
  document.querySelectorAll('#screen-liq_admin .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-liq_admin .tab-btn').forEach(b=>b.classList.remove('active'));
  const el=$('ladm-tab-'+tab); if(el) el.classList.add('active');
  if(btn) btn.classList.add('active');
  _ladmTabActual = tab;
  if(tab==='planilla')    renderLiqAdmin();
  if(tab==='suplemento')  renderLiqSuplemento();
}

// Botón del topbar según tab activo
function accionLiqAdmin(){
  if(_ladmTabActual==='suplemento') abrirModalNuevoSuplemento();
  else abrirModalNuevoAdminLiq();
}

// ── DB Suplemento ──
if(!DB.liqSuplemento) DB.liqSuplemento = [];
// Estructura: [{id, nombre, area, funcion_extra, horasFijas, valorHora, activo}]
if(!DB.liqSuplementoHoras) DB.liqSuplementoHoras = {};
// DB.liqSuplementoHoras[periodo][id][fechaISO] = valor

// Historial de valores por período (horasFijas y valorHora)
// Estructura: DB.liqAdminValores[periodo][id] = {horasFijas, valorHora}
// Al modificar un mes, se guarda en ese período y se proyecta a futuros
if(!DB.liqAdminValores)     DB.liqAdminValores     = {};
if(!DB.liqSuplementoValores) DB.liqSuplementoValores = {};

// ── Render Liquidación Suplemento ──
function renderLiqSuplemento(){
  // Sincronizar selector de mes con el de planilla
  const selSup = $('lsup-mes-sel');
  const selAdm = $('ladm-mes-sel');
  if(selSup && selAdm){
    if(!selSup.options.length){
      Array.from(selAdm.options).forEach(o=>{
        const opt=document.createElement('option');
        opt.value=o.value; opt.textContent=o.textContent;
        if(o.selected) opt.selected=true;
        selSup.appendChild(opt);
      });
    }
    // Sincronizar valor
    if(selAdm.value) selSup.value=selAdm.value;
  }

  const mes = $('lsup-mes-sel')?.value || $('ladm-mes-sel')?.value || new Date().toISOString().slice(0,7);
  const dias = getDiasDelMes(mes);
  const dN = ['D','L','M','X','J','V','S'];
  const personal = (DB.liqSuplemento||[]).filter(p=>p.activo);

  const thead = $('thead-lsup');
  const tbody = $('tbody-lsup');
  if(!thead||!tbody) return;

  if(!DB.liqSuplementoHoras[mes]) DB.liqSuplementoHoras[mes]={};

  // Header
  thead.innerHTML = `<tr style="background:#374151;color:white;">
    <th style="padding:8px 14px;border:1px solid #6b7280;text-align:left;min-width:200px;position:sticky;left:0;background:#374151;z-index:3;">Nombre</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:100px;">Área</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:160px;">Función extra</th>
    ${dias.map(dia=>{
      const dow=new Date(dia.iso+'T12:00:00').getDay();
      const bg=dia.esFeriado?'background:#ffe4e6;color:#111;font-weight:800;':dia.esFinde?'background:#ffff00;color:#111;font-weight:700;':'';
      return`<th style="padding:4px 2px;border:1px solid #6b7280;text-align:center;min-width:30px;font-size:10px;${bg}">
        <div style="font-weight:800;">${dN[dow]}</div>
        <div>${dia.d}</div>
      </th>`;
    }).join('')}
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:70px;">Hs reg.</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:75px;">Hs fijas</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:80px;">Valor/h</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:110px;">Total suplemento</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:60px;"></th>
  </tr>`;

  if(!personal.length){
    tbody.innerHTML=`<tr><td colspan="100" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      Sin suplementos cargados. Usá el botón "+ Agregar" para registrar funciones extras.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = personal.map((p,pi)=>{
    if(!DB.liqSuplementoHoras[mes][p.id]) DB.liqSuplementoHoras[mes][p.id]={};
    const horasP = DB.liqSuplementoHoras[mes][p.id];
    const valSupPeriodo = getValoresPeriodo(DB.liqSuplementoValores, p.id, mes, {horasFijas:p.horasFijas||0, valorHora:p.valorHora||0});
    const hsSupMes  = valSupPeriodo.horasFijas;
    const vhSupMes  = valSupPeriodo.valorHora;
    let totalHsP=0;

    const celdas = dias.map(dia=>{
      const rawVal = horasP[dia.iso];
      const esEsp = ['F','AJ','AI'].includes(String(rawVal||'').toUpperCase());
      const h = esEsp?0:parseFloat(rawVal||0);
      const dispVal = esEsp?String(rawVal).toUpperCase():(h||'');
      if(h>0) totalHsP+=h;
      const bgCell=(h>0||esEsp)?(dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#ffff00;':''):'';
      const colorVal=esEsp&&rawVal==='F'?'color:#7c3aed;font-weight:700;'
        :esEsp&&rawVal==='AJ'?'color:#d97706;font-weight:700;'
        :esEsp?'color:#dc2626;font-weight:700;'
        :h>0?'color:var(--azul);font-weight:600;'
        :'color:var(--texto-muy-suave);';
      return`<td style="border:1px solid var(--borde);${bgCell}">
        <input type="text" value="${dispVal}"
          style="width:28px;${colorVal}border:none;background:transparent;text-align:center;font-size:11px;outline:none;padding:1px 0;text-transform:uppercase;"
          onclick="event.stopPropagation()"
          onchange="event.stopPropagation();setHoraSuplemento('${mes}',${p.id},'${dia.iso}',this.value.trim().toUpperCase())">
      </td>`;
    }).join('');

    return`<tr>
      <td style="padding:5px 12px;border:1px solid var(--borde);font-size:12px;font-weight:500;position:sticky;left:0;background:white;z-index:1;">${p.nombre}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${p.area||'—'}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);font-size:11px;color:var(--azul);font-weight:500;">${p.funcionExtra||'—'}</td>
      ${celdas}
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:var(--azul);">${totalHsP}hs</td>
      <td style="padding:2px 4px;border:1px solid var(--borde);text-align:right;">
        <input type="number" value="${hsSupMes}" min="0" step="1"
          style="width:50px;padding:2px 4px;border:1px solid var(--borde-fuerte);border-radius:4px;font-size:11px;text-align:right;outline:none;"
          onchange="actualizarHorasSuplemento('${mes}',${p.id},this.value)">
      </td>
      <td style="padding:2px 4px;border:1px solid var(--borde);text-align:right;">
        <input type="number" value="${vhSupMes}" min="0" step="50"
          style="width:65px;padding:2px 4px;border:1px solid var(--borde-fuerte);border-radius:4px;font-size:11px;text-align:right;outline:none;"
          onchange="actualizarValorHoraSuplemento('${mes}',${p.id},this.value)">
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--verde);">
        ${(hsSupMes*vhSupMes).toLocaleString('es-AR')}
        <div style="font-size:9px;color:var(--texto-suave);">${hsSupMes}hs × ${vhSupMes.toLocaleString('es-AR')}</div>
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);">
        <button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--rojo);"
          onclick="quitarSuplemento(${p.id})">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function syncPeriodoSuplemento(mes, id){
  const horas=DB.liqSuplementoHoras?.[mes]?.[id]||{};
  const valores=DB.liqSuplementoValores?.[mes]?.[id]||null;
  supaSync('liqSuplementoPeriodos', {
    id:idPersonaPeriodo(id,mes), personaIdLocal:idLocalTrunc(id), periodo:mes,
    horas, horasFijas:valores?.horasFijas??null, valorHora:valores?.valorHora??null,
  });
}
function setHoraSuplemento(mes, id, fechaISO, valor){
  if(!DB.liqSuplementoHoras[mes]) DB.liqSuplementoHoras[mes]={};
  if(!DB.liqSuplementoHoras[mes][id]) DB.liqSuplementoHoras[mes][id]={};
  const valStr=(valor||'').toString().trim().toUpperCase();
  DB.liqSuplementoHoras[mes][id][fechaISO]=['F','AJ','AI'].includes(valStr)?valStr:(parseFloat(valor)||0);
  syncPeriodoSuplemento(mes, id);
  renderLiqSuplemento();
}

function actualizarHorasSuplemento(mes, id, valor){
  const p=(DB.liqSuplemento||[]).find(x=>x.id===id);
  if(!p) return;
  const actual = getValoresPeriodo(DB.liqSuplementoValores, id, mes, {horasFijas:p.horasFijas||0, valorHora:p.valorHora||0});
  setValoresPeriodo(DB.liqSuplementoValores, id, mes, {horasFijas:parseFloat(valor)||0, valorHora:actual.valorHora});
  syncPeriodoSuplemento(mes, id);
  renderLiqSuplemento();
}

function actualizarValorHoraSuplemento(mes, id, valor){
  const p=(DB.liqSuplemento||[]).find(x=>x.id===id);
  if(!p) return;
  const actual = getValoresPeriodo(DB.liqSuplementoValores, id, mes, {horasFijas:p.horasFijas||0, valorHora:p.valorHora||0});
  setValoresPeriodo(DB.liqSuplementoValores, id, mes, {horasFijas:actual.horasFijas, valorHora:parseFloat(valor)||0});
  syncPeriodoSuplemento(mes, id);
  renderLiqSuplemento();
}

function quitarSuplemento(id){
  if(!confirm('¿Eliminar este suplemento?')) return;
  const idx=(DB.liqSuplemento||[]).findIndex(x=>x.id===id);
  if(idx!==-1){
    DB.liqSuplemento[idx].activo=false;
    supaSync('liqSuplemento', DB.liqSuplemento[idx]);
  }
  renderLiqSuplemento();
}

// ── Modal nuevo suplemento ──
function abrirModalNuevoSuplemento(){
  if($('nsup-nombre'))        $('nsup-nombre').value='';
  if($('nsup-area'))          $('nsup-area').value='';
  if($('nsup-funcion-extra')) $('nsup-funcion-extra').value='';
  if($('nsup-horas-fijas'))   $('nsup-horas-fijas').value='0';
  if($('nsup-valor-hora'))    $('nsup-valor-hora').value='';
  const dl=$('dl-nsup-nombre');
  if(dl) dl.innerHTML=(DB.liqAdminPersonal||[]).filter(p=>p.activo)
    .map(p=>`<option value="${p.nombre}">${p.nombre} — ${p.area||''}</option>`).join('');
  abrirModal('modal-nuevo-suplemento');
}

function confirmarNuevoSuplemento(){
  const nombre=$('nsup-nombre')?.value.trim();
  const funcionExtra=$('nsup-funcion-extra')?.value.trim();
  const horasFijas=parseFloat($('nsup-horas-fijas')?.value)||0;
  const valorHora=parseFloat($('nsup-valor-hora')?.value)||0;
  if(!nombre){toast('Ingresá el nombre');return;}
  if(!funcionExtra){toast('Ingresá la función extra');return;}
  if(!valorHora){toast('Ingresá el valor por hora');return;}
  const nuevo={
    id:Date.now(),
    nombre,
    area:$('nsup-area')?.value||'',
    funcionExtra,
    horasFijas,
    valorHora,
    activo:true,
  };
  DB.liqSuplemento.push(nuevo);
  supaSync('liqSuplemento', nuevo);
  cerrarModal('modal-nuevo-suplemento');
  toast('✅ Suplemento agregado');
  renderLiqSuplemento();
}


// ── Obtener valores de un empleado para un período dado ──
// Si no hay valores guardados para ese período, usa el más reciente anterior
// Si hay valores más nuevos (mes futuro modificado), NO los aplica hacia atrás
function getValoresPeriodo(db_valores, id, periodo, fallback){
  // Buscar valor exacto para el período
  if(db_valores[periodo]?.[id]) return db_valores[periodo][id];
  // Buscar el valor más reciente ANTERIOR al período
  const periodos = Object.keys(db_valores).filter(p=>p<=periodo).sort();
  for(let i=periodos.length-1; i>=0; i--){
    if(db_valores[periodos[i]]?.[id]) return db_valores[periodos[i]][id];
  }
  // Sin historial — usar fallback (valores del objeto persona)
  return fallback;
}

// ── Guardar valores para un período y proyectar a futuros ──
// Los meses anteriores NO se modifican
function setValoresPeriodo(db_valores, id, periodo, valores){
  if(!db_valores[periodo]) db_valores[periodo]={};
  db_valores[periodo][id] = {...valores};
  // La proyección a futuros es implícita: getValoresPeriodo hereda el último valor conocido
  // No sobreescribimos explícitamente meses futuros que ya tienen sus propios valores guardados
}

// v046 (persistencia Liq. Admin/Suplemento/Retenes/Mantenimiento) — estas
// tablas guardan una fila por (persona, período); supaSync deriva
// id_local de obj.id, así que hace falta un id estable por combinación
// persona+período (si no, todas las filas de una misma persona pisarían
// el mismo id_local y solo sobreviviría el último mes sincronizado).
function idPersonaPeriodo(personaId, periodo){
  let h=0; const s=String(personaId)+periodo;
  for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
  return 100000000 + (h % 900000000);
}
// v046 — supaInit() carga DB.liqAdminPeriodos/DB.liqSuplementoPeriodos/
// DB.retenHorasRows/DB.mantHorasRows como arrays PLANOS (una fila por
// persona+período). El resto del código de estos 4 módulos espera las
// estructuras anidadas de siempre (DB.liqAdminHoras[mes][id], etc.) — acá
// se reconstruyen a partir de esos arrays, resolviendo cada fila a su
// persona por id_local (mismo patrón que reconciliarClienteIdObjetivos
// para Comercial). Se llama una sola vez después de supaInit(), nunca en
// cada render (las filas cargadas no se actualizan en memoria durante la
// sesión, solo se sincronizan hacia Supabase — repetirlo pisaría
// ediciones hechas en vivo con la foto vieja del login).
function reconciliarPeriodosOperaciones(){
  const rebuild=(rows,personalArr,destHoras,destTipo,destValores)=>{
    (rows||[]).forEach(row=>{
      const persona=(personalArr||[]).find(p=>idLocalTrunc(p.id)===String(row.personaIdLocal));
      if(!persona||!row.periodo) return;
      const id=persona.id, periodo=row.periodo;
      if(row.horas && Object.keys(row.horas).length){
        if(!destHoras[periodo]) destHoras[periodo]={};
        destHoras[periodo][id]=row.horas;
      }
      if(destTipo && row.tipo){
        if(!destTipo[periodo]) destTipo[periodo]={};
        destTipo[periodo][id]=row.tipo;
      }
      if(destValores && (row.horasFijas!=null || row.valorHora!=null)){
        if(!destValores[periodo]) destValores[periodo]={};
        destValores[periodo][id]={horasFijas:row.horasFijas, valorHora:row.valorHora};
      }
    });
  };
  if(!DB.liqAdminHoras) DB.liqAdminHoras={};
  if(!DB.liqAdminTipo) DB.liqAdminTipo={};
  if(!DB.liqAdminValores) DB.liqAdminValores={};
  rebuild(DB.liqAdminPeriodos, DB.liqAdminPersonal, DB.liqAdminHoras, DB.liqAdminTipo, DB.liqAdminValores);

  if(!DB.liqSuplementoHoras) DB.liqSuplementoHoras={};
  if(!DB.liqSuplementoValores) DB.liqSuplementoValores={};
  rebuild(DB.liqSuplementoPeriodos, DB.liqSuplemento, DB.liqSuplementoHoras, null, DB.liqSuplementoValores);

  if(!DB.retenHoras) DB.retenHoras={};
  rebuild(DB.retenHorasRows, DB.retenes, DB.retenHoras, null, null);

  if(!DB.mantHoras) DB.mantHoras={};
  rebuild(DB.mantHorasRows, DB.mantPersonal, DB.mantHoras, null, null);
}
function syncPeriodoAdmin(mes, personalId){
  const horas=DB.liqAdminHoras?.[mes]?.[personalId]||{};
  const tipo=DB.liqAdminTipo?.[mes]?.[personalId]||'facturable';
  const valores=DB.liqAdminValores?.[mes]?.[personalId]||null;
  supaSync('liqAdminPeriodos', {
    id:idPersonaPeriodo(personalId,mes), personaIdLocal:idLocalTrunc(personalId), periodo:mes,
    horas, tipo, horasFijas:valores?.horasFijas??null, valorHora:valores?.valorHora??null,
  });
}
function renderLiqAdmin(){
  // Poblar el selector de mes PRIMERO (antes de leer el valor)
  const sel = $('ladm-mes-sel');
  if(sel && !sel.options.length){
    const hoy = new Date();
    for(let i=-2; i<=3; i++){
      const d = new Date(hoy.getFullYear(), hoy.getMonth()+i, 1);
      const val = d.toISOString().slice(0,7);
      const label = d.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      if(i===0) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  const mes = $('ladm-mes-sel')?.value || new Date().toISOString().slice(0,7);
  const dias = getDiasDelMes(mes);
  const dN = ['D','L','M','X','J','V','S'];
  const personal = (DB.liqAdminPersonal||[]).filter(p=>p.activo);

  // Stats
  if(!DB.liqAdminHoras[mes]) DB.liqAdminHoras[mes] = {};
  let totalHs=0, totalArt42=0, totalAusencias=0;
  personal.forEach(p=>{
    const horasP = DB.liqAdminHoras[mes][p.id]||{};
    dias.forEach(dia=>{
      const v = String(horasP[dia.iso]||'').toUpperCase();
      const h = parseFloat(horasP[dia.iso]||0);
      if(h>0) totalHs+=h;
      if(v==='AJ'||v==='AI') totalAusencias++;
    });
    // Contar Art42 (filas con tipoHora art42)
    if((DB.liqAdminTipo||{})[mes]?.[p.id]==='art42') totalArt42++;
  });
  if($('st-ladm-total')) $('st-ladm-total').textContent = personal.length;
  if($('st-ladm-hs'))    $('st-ladm-hs').textContent    = totalHs+'hs';
  if($('st-ladm-art42')) $('st-ladm-art42').textContent = totalArt42;
  if($('st-ladm-ausencias')) $('st-ladm-ausencias').textContent = totalAusencias;

  // Header
  const thead = $('thead-ladm');
  const tbody = $('tbody-ladm');
  if(!thead||!tbody) return;

  thead.innerHTML = `<tr style="background:#374151;color:white;">
    <th style="padding:8px 14px;border:1px solid #6b7280;text-align:left;min-width:200px;position:sticky;left:0;background:#374151;z-index:3;">Nombre</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:100px;">Área</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:120px;">Categoría</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:90px;text-align:center;">Tipo hs</th>
    ${dias.map(dia=>{
      const dow=new Date(dia.iso+'T12:00:00').getDay();
      const bg=dia.esFeriado?'background:#ffe4e6;color:#111;font-weight:800;':dia.esFinde?'background:#ffff00;color:#111;font-weight:700;':'';
      return`<th style="padding:4px 2px;border:1px solid #6b7280;text-align:center;min-width:30px;font-size:10px;${bg}">
        <div style="font-weight:800;">${dN[dow]}</div>
        <div>${dia.d}</div>
      </th>`;
    }).join('')}
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:70px;">Hs reg.</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:75px;">Hs fijas</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:80px;">Valor/h</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:110px;">Total a pagar</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:60px;"></th>
  </tr>`;

  if(!personal.length){
    tbody.innerHTML=`<tr><td colspan="100" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      Sin personal administrativo. Usá el botón "+ Agregar personal".
    </td></tr>`;
    return;
  }

  tbody.innerHTML = personal.map((p,pi)=>{
    if(!DB.liqAdminHoras[mes][p.id]) DB.liqAdminHoras[mes][p.id]={};
    const horasP = DB.liqAdminHoras[mes][p.id];
    if(!DB.liqAdminTipo) DB.liqAdminTipo={};
    if(!DB.liqAdminTipo[mes]) DB.liqAdminTipo[mes]={};
    const tipo = DB.liqAdminTipo[mes][p.id]||'facturable';
    // Obtener horasFijas y valorHora para este período
    const valPeriodo = getValoresPeriodo(DB.liqAdminValores, p.id, mes, {horasFijas:p.horasFijas||200, valorHora:p.valorHora||0});
    const horasFijasMes = valPeriodo.horasFijas;
    const valorHoraMes  = valPeriodo.valorHora;

    let totalHsP=0;
    const celdas = dias.map(dia=>{
      const rawVal = horasP[dia.iso];
      const esEsp = ['F','AJ','AI'].includes(String(rawVal||'').toUpperCase());
      const h = esEsp?0:parseFloat(rawVal||0);
      const dispVal = esEsp?String(rawVal).toUpperCase():(h||'');
      if(h>0) totalHsP+=h;
      const dow=new Date(dia.iso+'T12:00:00').getDay();
      const esLab=dow>=1&&dow<=5&&!dia.esFeriado;
      const bgCell=h>0||esEsp
        ?(dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#ffff00;':'')
        :'';
      const colorVal=esEsp&&rawVal==='F'?'color:#7c3aed;font-weight:700;'
        :esEsp&&rawVal==='AJ'?'color:#d97706;font-weight:700;'
        :esEsp?'color:#dc2626;font-weight:700;'
        :tipo==='art42'?'color:#7c3aed;font-weight:600;'
        :h>0?'color:var(--azul);font-weight:600;'
        :'color:var(--texto-muy-suave);';
      return`<td style="border:1px solid var(--borde);${bgCell}">
        <input type="text" value="${dispVal}"
          title="Ingresá horas, F=Franco, AJ=Aus.Justificada, AI=Aus.Injustificada"
          style="width:28px;${colorVal}border:none;background:transparent;text-align:center;font-size:11px;outline:none;padding:1px 0;text-transform:uppercase;"
          onclick="event.stopPropagation()"
          onchange="event.stopPropagation();setHoraAdmin('${mes}',${p.id},'${dia.iso}',this.value.trim().toUpperCase())">
      </td>`;
    }).join('');

    const tipoSelect=`<select style="width:100%;font-size:10px;padding:2px 3px;border:1px solid var(--borde-fuerte);border-radius:4px;outline:none;background:white;"
      onclick="event.stopPropagation()"
      onchange="event.stopPropagation();setTipoAdmin('${mes}',${p.id},this.value)">
      <option value="facturable" ${tipo==='facturable'?'selected':''}>✅ Normal</option>
      <option value="art42"      ${tipo==='art42'?'selected':''}>🏥 Art. 42</option>
    </select>`;

    return`<tr>
      <td style="padding:5px 12px;border:1px solid var(--borde);font-size:12px;font-weight:500;position:sticky;left:0;background:white;z-index:1;">${p.nombre}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${p.area||'—'}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);font-size:11px;">${p.categoria||'—'}</td>
      <td style="padding:2px 4px;border:1px solid var(--borde);">${tipoSelect}</td>
      ${celdas}
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:var(--azul);">${totalHsP}hs</td>
      <td style="padding:2px 4px;border:1px solid var(--borde);text-align:right;">
        <input type="number" value="${horasFijasMes}" min="1" max="300" step="1"
          title="Horas fijas contractuales del mes (solo modifica este mes y proyecta a futuro)"
          style="width:50px;padding:2px 4px;border:1px solid var(--borde-fuerte);border-radius:4px;font-size:11px;text-align:right;outline:none;"
          onchange="actualizarHorasAdmin('${mes}',${p.id},this.value)">
      </td>
      <td style="padding:2px 4px;border:1px solid var(--borde);text-align:right;">
        <input type="number" value="${valorHoraMes}" min="0" step="50"
          title="Valor por hora (solo modifica este mes y proyecta a futuro)"
          style="width:65px;padding:2px 4px;border:1px solid var(--borde-fuerte);border-radius:4px;font-size:11px;text-align:right;outline:none;"
          onchange="actualizarValorHoraAdmin('${mes}',${p.id},this.value)">
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--verde);">
        ${(horasFijasMes*valorHoraMes).toLocaleString('es-AR')}
        <div style="font-size:9px;color:var(--texto-suave);">${horasFijasMes}hs × ${valorHoraMes.toLocaleString('es-AR')}</div>
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);">
        <button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--rojo);"
          onclick="quitarPersonalAdmin(${p.id})">✕</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Editar celda de hora admin ──

// Actualizar horas fijas de un empleado admin
function actualizarHorasAdmin(mes, id, valor){
  const p = (DB.liqAdminPersonal||[]).find(x=>x.id===id);
  if(!p) return;
  const actual = getValoresPeriodo(DB.liqAdminValores, id, mes, {horasFijas:p.horasFijas||200, valorHora:p.valorHora||0});
  setValoresPeriodo(DB.liqAdminValores, id, mes, {horasFijas:parseFloat(valor)||0, valorHora:actual.valorHora});
  syncPeriodoAdmin(mes, id);
  renderLiqAdmin();
}

// Actualizar valor hora de un empleado admin
function actualizarValorHoraAdmin(mes, id, valor){
  const p = (DB.liqAdminPersonal||[]).find(x=>x.id===id);
  if(!p) return;
  const actual = getValoresPeriodo(DB.liqAdminValores, id, mes, {horasFijas:p.horasFijas||200, valorHora:p.valorHora||0});
  setValoresPeriodo(DB.liqAdminValores, id, mes, {horasFijas:actual.horasFijas, valorHora:parseFloat(valor)||0});
  syncPeriodoAdmin(mes, id);
  renderLiqAdmin();
}

function setHoraAdmin(mes, personalId, fechaISO, valor){
  if(!DB.liqAdminHoras[mes]) DB.liqAdminHoras[mes]={};
  if(!DB.liqAdminHoras[mes][personalId]) DB.liqAdminHoras[mes][personalId]={};
  const valStr = (valor||'').toString().trim().toUpperCase();
  const esEsp = ['F','AJ','AI'].includes(valStr);

  if(esEsp){
    DB.liqAdminHoras[mes][personalId][fechaISO] = valStr;
    syncPeriodoAdmin(mes, personalId);
    renderLiqAdmin(); return;
  }

  const nuevaHora = parseFloat(valor)||0;

  // Control Art.42: máximo 3 días laborables consecutivos
  if((DB.liqAdminTipo?.[mes]?.[personalId])==='art42' && nuevaHora>0){
    const esFer = iso=>(DB.feriados||[]).some(f=>f.fecha===iso);
    const esFind = iso=>{const d=new Date(iso+'T12:00:00').getDay();return d===0||d===6;};
    let cons=0, dCheck=new Date(fechaISO+'T12:00:00');
    dCheck.setDate(dCheck.getDate()-1);
    for(let i=0;i<60;i++){
      const iso=dCheck.toISOString().slice(0,10);
      if(esFer(iso)||esFind(iso)){dCheck.setDate(dCheck.getDate()-1);continue;}
      const h=parseFloat(DB.liqAdminHoras[mes][personalId][iso]||0);
      if(h>0){cons++;if(cons>=3){toast('⛔ Ya tiene 3 días consecutivos de Art.42. Reportar a Enfermos y Accidentados.');renderLiqAdmin();return;}}
      else break;
      dCheck.setDate(dCheck.getDate()-1);
    }
  }

  DB.liqAdminHoras[mes][personalId][fechaISO] = nuevaHora;
  syncPeriodoAdmin(mes, personalId);
  renderLiqAdmin();
}

// ── Cambiar tipo de hora ──
function setTipoAdmin(mes, personalId, tipo){
  if(!DB.liqAdminTipo) DB.liqAdminTipo={};
  if(!DB.liqAdminTipo[mes]) DB.liqAdminTipo[mes]={};
  DB.liqAdminTipo[mes][personalId] = tipo;
  syncPeriodoAdmin(mes, personalId);
  renderLiqAdmin();
}

// ── Quitar personal ──
function quitarPersonalAdmin(id){
  if(!confirm('¿Eliminar a esta persona de la planilla de administración?')) return;
  const idx = DB.liqAdminPersonal.findIndex(p=>p.id===id);
  if(idx!==-1){
    DB.liqAdminPersonal[idx].activo=false;
    supaSync('liqAdminPersonal', DB.liqAdminPersonal[idx]);
  }
  renderLiqAdmin();
}

// ── Modal agregar personal ──
function abrirModalNuevoAdminLiq(){
  if($('nadm-nombre'))       $('nadm-nombre').value='';
  if($('nadm-area'))         $('nadm-area').value='';
  if($('nadm-categoria'))    $('nadm-categoria').value='';
  if($('nadm-horas-fijas'))  $('nadm-horas-fijas').value='200';
  if($('nadm-valor-hora'))   $('nadm-valor-hora').value='';
  // Poblar datalist con legajos
  const dl=$('dl-nadm-nombre');
  if(dl) dl.innerHTML=(DB.legajos||[]).filter(l=>l.estado==='Activo')
    .map(l=>`<option value="${l.nombre}">${l.nombre} — ${l.funcion||''}</option>`).join('');
  abrirModal('modal-nuevo-admin-liq');
}

function confirmarNuevoAdminLiq(){
  const nombre=$('nadm-nombre')?.value.trim();
  const horasFijas=parseFloat($('nadm-horas-fijas')?.value)||200;
  const valorHora=parseFloat($('nadm-valor-hora')?.value)||0;
  if(!nombre){toast('Ingresá el nombre');return;}
  if(!valorHora){toast('Ingresá el valor por hora');return;}
  // Verificar que no esté ya en la planilla
  const yaExiste=(DB.liqAdminPersonal||[]).find(p=>p.nombre===nombre&&p.activo);
  if(yaExiste){toast('Esta persona ya está en la planilla');return;}
  const legajo=(DB.legajos||[]).find(l=>l.nombre===nombre);
  const nuevo={
    id:Date.now(),
    nombre,
    area:$('nadm-area')?.value||legajo?.area||'',
    categoria:$('nadm-categoria')?.value||legajo?.funcion||'',
    horasFijas,
    valorHora,
    activo:true,
  };
  DB.liqAdminPersonal.push(nuevo);
  supaSync('liqAdminPersonal', nuevo);
  cerrarModal('modal-nuevo-admin-liq');
  toast('✅ Personal agregado a la planilla de administración');
  renderLiqAdmin();
}


// ══════════════════════════════════════════════════════════
// LIQUIDACIONES — Resumen mensual completo
// ══════════════════════════════════════════════════════════

// DB de descuentos manuales por persona y período
// DB.lqsDescuentos[periodo][nombre] = {uniforme, sanciones, retConflicto, retEnfermedad, monotributo, adelantos}
if(!DB.lqsDescuentos)  DB.lqsDescuentos  = {};
if(!DB.lqsPagos)       DB.lqsPagos       = {};  // DB.lqsPagos[periodo][nombre] = {pagado:true, monto, fecha}
if(!DB.lqsCongelado)   DB.lqsCongelado   = {};  // DB.lqsCongelado[periodo] = true/false
if(!DB.lqsListos)      DB.lqsListos      = {};  // DB.lqsListos[periodo][nombre] = true/false
if(!DB.retenes) DB.retenes = [
  {id:1, nombre:'López Fabián',    nroSocio:'3112', categoriBase:'Operario/a limpieza', activo:true},
  {id:2, nombre:'Vera Claudia',    nroSocio:'2891', categoriBase:'Operario/a limpieza especializado/a', activo:true},
  {id:3, nombre:'Gimenez Roberto', nroSocio:'3204', categoriBase:'Operario/a limpieza', activo:true},
];
// DB.retenHoras[periodo][retenId][fechaISO] = {hs, catAlt} — catAlt opcional
if(!DB.retenHoras)  DB.retenHoras  = {};
// ── DB Adelantos ──
if(!DB.adelantosConfig) DB.adelantosConfig = {
  montoFijo: 30000,          // Monto fijo por defecto configurable por Finanzas
  alertaMonto: 50000,        // Monto que dispara alerta visual
  maxCuotas: 24,             // Máximo de cuotas permitidas para préstamos
  tablaCuotas: [3,6,9,12,18,24], // Opciones de cuotas disponibles
  motivosPrestamo: ['Refacción del hogar','Gastos médicos','Educación','Compra de vehículo','Deudas personales','Electrodomésticos','Emergencia familiar','Otros'],
};

// Planillas de adelantos formales
// DB.planillasAdelantos = [{id, periodo, supervisorNombre, estado:'Borrador'|'Enviada'|'Aprobada'|'Rechazada',
//   fechaCreacion, fechaEnvio, fechaResolucion, resueltoPor, obs,
//   items:[{nombre, nroSocio, monto, estado:'Pendiente'|'Aprobado'|'Rechazado', obs}]}]
if(!DB.planillasAdelantos) DB.planillasAdelantos = [];

// Adelantos informales
// DB.adelantosInformales = [{id, nombre, nroSocio, supervisorNombre, monto, fecha, periodo,
//   estado:'Pendiente'|'Aprobado'|'Rechazado', resueltoPor, fechaResolucion, obs}]
if(!DB.adelantosInformales) DB.adelantosInformales = [];

// Planillas informales — mismo esquema que formales
// DB.planillasInformales = [{id, periodo, supervisorNombre, estado:'Borrador'|'Enviada'|'Aprobada'|'Rechazada',
//   fechaCreacion, fechaEnvio, fechaResolucion, resueltoPor, notificado, fechaNotificacion, obs,
//   items:[{nombre, nroSocio, monto, estado:'Pendiente'|'Aprobado'|'Rechazado', obs}]}]
if(!DB.planillasInformales) DB.planillasInformales = [];

// Préstamos
// DB.prestamos = [{id, nombre, nroSocio, monto, cuotas, montoCuota, fechaOtorgamiento,
//   estado:'Activo'|'Cancelado'|'Pagado', pagos:[{fecha, monto, cuotaNro}], obs, aprobadoPor}]
if(!DB.prestamos) DB.prestamos = [];

// Solicitudes de préstamos del supervisor — mismo esquema que planillas
// DB.solicitudesPrestamos = [{id, periodo, supervisorNombre,
//   estado:'Borrador'|'Enviada'|'Aprobada'|'Rechazada',
//   fechaCreacion, fechaEnvio, fechaResolucion, resueltoPor, notificado,
//   fechaNotificacion, obs,
//   items:[{nombre, nroSocio, montoSolicitado, cuotasSolicitadas, montoCuota,
//           cuotasAprobadas, montoAprobado, estado:'Pendiente'|'Aprobado'|'Rechazado', obs}]}]
if(!DB.solicitudesPrestamos) DB.solicitudesPrestamos = [];

// ── DATOS DEMO CARGADOS ──
DB.legajos = [{nro:101,nombre:'Ramirez Claudia Beatriz',dni:'28441302',funcion:'Operario B',servicio:'HOSPITAL.CAMPANA',supervisor:'Claudia Cazenave',ingreso:'03/06/2019',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Campana',tel:'2264501234',mail:'',cuit:'27284413026',estadoCivil:'Casada',nac:'Argentina',banco:'Banco Nación',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2019-06-03',adjuntosLegal:[],adjuntosMedico:[]},{nro:102,nombre:'Villalba Sergio Fabian',dni:'31782045',funcion:'Operario B',servicio:'HOSPITAL.CAMPANA',supervisor:'Claudia Cazenave',ingreso:'15/08/2020',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Campana',tel:'2264598765',mail:'',cuit:'20317820451',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2020-08-15',adjuntosLegal:[],adjuntosMedico:[]},{nro:103,nombre:'Torres Ana Beatriz',dni:'35219804',funcion:'Referente',servicio:'HOSPITAL.CAMPANA',supervisor:'Claudia Cazenave',ingreso:'01/03/2021',estado:'Activo',estadoLegal:'',estadoMedico:'En tratamiento',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Campana',tel:'2264512300',mail:'',cuit:'27352198047',estadoCivil:'Casada',nac:'Argentina',banco:'Galicia',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2021-03-01',adjuntosLegal:[],adjuntosMedico:['certif_medico.pdf']},{nro:104,nombre:'Benitez Marcos Ruben',dni:'29854103',funcion:'Operario A',servicio:'HIT.LIBERTADOR.CEL',supervisor:'Alvaro Uballes',ingreso:'10/01/2018',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Palermo',tel:'1145239801',mail:'marcos.benitez@gmail.com',cuit:'20298541039',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:43,ambo:'XL',periodoPrueba:6,fechaIngresoPrueba:'2018-01-10',adjuntosLegal:[],adjuntosMedico:[]},{nro:105,nombre:'Quiroga Daniela Paz',dni:'38021567',funcion:'Operario B',servicio:'HIT.LIBERTADOR.CEL',supervisor:'Alvaro Uballes',ingreso:'05/05/2022',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Belgrano',tel:'1167438920',mail:'',cuit:'27380215672',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:38,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2022-05-05',adjuntosLegal:[],adjuntosMedico:[]},{nro:106,nombre:'Suarez Leonardo Pablo',dni:'33198745',funcion:'Encargado B',servicio:'HIT.LIBERTADOR.8614',supervisor:'Alvaro Uballes',ingreso:'20/07/2017',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Palermo',tel:'1154320987',mail:'lsuarez@gmail.com',cuit:'20331987458',estadoCivil:'Casado',nac:'Argentina',banco:'Santander',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2017-07-20',adjuntosLegal:[],adjuntosMedico:[]},{nro:107,nombre:'Morales Yanina Soledad',dni:'36540921',funcion:'Operario B',servicio:'HIT.LIBERTADOR.8614',supervisor:'Alvaro Uballes',ingreso:'12/03/2023',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Pendiente',localidad:'Recoleta',tel:'1178231045',mail:'',cuit:'27365409218',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2023-03-12',adjuntosLegal:[],adjuntosMedico:[]},{nro:108,nombre:'Fernandez Hugo Oscar',dni:'24789032',funcion:'Encargado A',servicio:'HACOAJ.TIGRE',supervisor:'Fabio Benvenuto',ingreso:'08/09/2014',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Tigre',tel:'1169854321',mail:'hfernandez@hotmail.com',cuit:'20247890327',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:43,ambo:'XL',periodoPrueba:6,fechaIngresoPrueba:'2014-09-08',adjuntosLegal:[],adjuntosMedico:[]},{nro:109,nombre:'Acosta Maria Gabriela',dni:'31045789',funcion:'Operario B',servicio:'HACOAJ.TIGRE',supervisor:'Fabio Benvenuto',ingreso:'14/02/2021',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'San Fernando',tel:'1143219870',mail:'',cuit:'27310457896',estadoCivil:'Casada',nac:'Argentina',banco:'',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2021-02-14',adjuntosLegal:[],adjuntosMedico:[]},{nro:110,nombre:'Lopez Sebastian Ariel',dni:'37654023',funcion:'Operario A',servicio:'HACOAJ.TIGRE',supervisor:'Fabio Benvenuto',ingreso:'22/10/2022',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Tigre',tel:'1156781234',mail:'',cuit:'20376540231',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:41,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2022-10-22',adjuntosLegal:[],adjuntosMedico:[]},{nro:111,nombre:'Castro Rosa Elena',dni:'22981034',funcion:'Encargado C',servicio:'LOS.PINOS',supervisor:'Matias Maidana',ingreso:'03/04/2013',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Lomas de Zamora',tel:'1134509876',mail:'rcastro@gmail.com',cuit:'27229810347',estadoCivil:'Casada',nac:'Argentina',banco:'ICBC',calzado:37,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2013-04-03',adjuntosLegal:[],adjuntosMedico:[]},{nro:112,nombre:'Gimenez Pablo Ariel',dni:'34102897',funcion:'Operario B',servicio:'LOS.PINOS',supervisor:'Matias Maidana',ingreso:'19/06/2021',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Lomas de Zamora',tel:'1167890123',mail:'',cuit:'20341028978',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2021-06-19',adjuntosLegal:[],adjuntosMedico:[]},{nro:113,nombre:'Rodriguez Maria Elena',dni:'29340178',funcion:'Operario A',servicio:'CENARD',supervisor:'Marcelo Moure',ingreso:'11/11/2016',estado:'Activo',estadoLegal:'',estadoMedico:'Activo — sin trabajar',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Palermo',tel:'1145670123',mail:'',cuit:'27293401786',estadoCivil:'Casada',nac:'Argentina',banco:'Galicia',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2016-11-11',adjuntosLegal:[],adjuntosMedico:['certif_medico.pdf','orden_medica.pdf']},{nro:114,nombre:'Ibañez Carlos Javier',dni:'32890145',funcion:'Operario B',servicio:'CENARD',supervisor:'Marcelo Moure',ingreso:'27/03/2020',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Belgrano',tel:'1123457890',mail:'',cuit:'20328901456',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:44,ambo:'XL',periodoPrueba:6,fechaIngresoPrueba:'2020-03-27',adjuntosLegal:[],adjuntosMedico:[]},{nro:115,nombre:'Paz Florencia Belen',dni:'40123089',funcion:'Operario B',servicio:'CENARD',supervisor:'Marcelo Moure',ingreso:'08/09/2023',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Pendiente',localidad:'Villa del Parque',tel:'1189012345',mail:'',cuit:'27401230897',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2023-09-08',adjuntosLegal:[],adjuntosMedico:[]},{nro:116,nombre:'Soria Jorge Luis',dni:'27654089',funcion:'Encargado A',servicio:'ANAC',supervisor:'Santiago Ayala',ingreso:'15/05/2015',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'San Justo',tel:'1156234789',mail:'jsoria@hotmail.com',cuit:'20276540897',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2015-05-15',adjuntosLegal:[],adjuntosMedico:[]},{nro:117,nombre:'Molina Estela Maris',dni:'23781092',funcion:'Operario A',servicio:'ANAC',supervisor:'Santiago Ayala',ingreso:'02/02/2012',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Caballito',tel:'1134987654',mail:'emolina@gmail.com',cuit:'27237810925',estadoCivil:'Casada',nac:'Argentina',banco:'Galicia',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2012-02-02',adjuntosLegal:[],adjuntosMedico:[]},{nro:118,nombre:'Herrera Nicolas Damian',dni:'38901234',funcion:'Operario B',servicio:'ANAC',supervisor:'Santiago Ayala',ingreso:'30/01/2024',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Pendiente',localidad:'Floresta',tel:'1190123456',mail:'',cuit:'20389012348',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:41,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2024-01-30',adjuntosLegal:[],adjuntosMedico:[]},{nro:119,nombre:'Vazquez Lorena Anabel',dni:'33012876',funcion:'Operario B',servicio:'NEWSAN.CAMPANA',supervisor:'Claudia Cazenave',ingreso:'06/07/2020',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Campana',tel:'2264523456',mail:'',cuit:'27330128762',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2020-07-06',adjuntosLegal:[],adjuntosMedico:[]},{nro:120,nombre:'Gutierrez Ramon Eduardo',dni:'26543109',funcion:'Referente',servicio:'NEWSAN.CAMPANA',supervisor:'Claudia Cazenave',ingreso:'18/04/2016',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Campana',tel:'2264534567',mail:'rgutierrez@hotmail.com',cuit:'20265431098',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2016-04-18',adjuntosLegal:[],adjuntosMedico:[]},{nro:121,nombre:'Medina Oscar Reinaldo',dni:'28120934',funcion:'Operario A',servicio:'SULFOQUIMICA',supervisor:'Alejandro Cacciato',ingreso:'09/03/2017',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Campana',tel:'2264545678',mail:'omedina@gmail.com',cuit:'20281209347',estadoCivil:'Casado',nac:'Argentina',banco:'Santander',calzado:43,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2017-03-09',adjuntosLegal:[],adjuntosMedico:[]},{nro:122,nombre:'Campos Sandra Noemi',dni:'31289043',funcion:'Operario B',servicio:'SULFOQUIMICA',supervisor:'Alejandro Cacciato',ingreso:'23/08/2021',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Campana',tel:'2264556789',mail:'',cuit:'27312890435',estadoCivil:'Casada',nac:'Argentina',banco:'',calzado:38,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2021-08-23',adjuntosLegal:[],adjuntosMedico:[]},{nro:123,nombre:'Rios Jorge Alberto',dni:'25432891',funcion:'Encargado B',servicio:'COTO.GARIN',supervisor:'Richard Recalde',ingreso:'14/10/2014',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Garín',tel:'3327501234',mail:'jrios@hotmail.com',cuit:'20254328918',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:43,ambo:'XL',periodoPrueba:6,fechaIngresoPrueba:'2014-10-14',adjuntosLegal:[],adjuntosMedico:[]},{nro:124,nombre:'Alvarez Cecilia Paola',dni:'36781023',funcion:'Operario B',servicio:'COTO.GARIN',supervisor:'Richard Recalde',ingreso:'05/11/2022',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Garín',tel:'3327512345',mail:'',cuit:'27367810237',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2022-11-05',adjuntosLegal:[],adjuntosMedico:[]},{nro:32,nombre:'Tolaba Maximiliano Ezequiel',dni:'32343528',funcion:'Referente',servicio:'MIGUELETES.2423',supervisor:'Alvaro Uballes',ingreso:'15/03/2018',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Lomas de Zamora',tel:'1123456789',mail:'',cuit:'20323435287',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:41,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2018-03-15',adjuntosLegal:[],adjuntosMedico:[]},{nro:125,nombre:'Paredes Karina Soledad',dni:'35902134',funcion:'Operario B',servicio:'MIGUELETES.2423',supervisor:'Alvaro Uballes',ingreso:'17/04/2022',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Barracas',tel:'1156789012',mail:'',cuit:'27359021347',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2022-04-17',adjuntosLegal:[],adjuntosMedico:[]},{nro:126,nombre:'Romero Gustavo Daniel',dni:'30891234',funcion:'Operario A',servicio:'TEKNOPOLIS',supervisor:'Lorena Unzain',ingreso:'01/12/2019',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'San Martín',tel:'1167891234',mail:'gromero@gmail.com',cuit:'20308912349',estadoCivil:'Casado',nac:'Argentina',banco:'Galicia',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2019-12-01',adjuntosLegal:[],adjuntosMedico:[]},{nro:127,nombre:'Ojeda Natalia Fernanda',dni:'38234091',funcion:'Operario B',servicio:'TEKNOPOLIS',supervisor:'Lorena Unzain',ingreso:'28/02/2023',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Pendiente',localidad:'Villa del Parque',tel:'1178901234',mail:'',cuit:'27382340917',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:38,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2023-02-28',adjuntosLegal:[],adjuntosMedico:[]},{nro:128,nombre:'Luna Hector Raul',dni:'27109823',funcion:'Encargado C',servicio:'TEKNOPOLIS',supervisor:'Lorena Unzain',ingreso:'10/06/2015',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'San Martín',tel:'1189012347',mail:'hluna@hotmail.com',cuit:'20271098237',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:43,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2015-06-10',adjuntosLegal:[],adjuntosMedico:[]},{nro:71,nombre:'Gomez Diego Alejandro',dni:'26148208',funcion:'Retén',servicio:'RETEN.GENERAL',supervisor:'Santiago Ayala',ingreso:'27/05/2022',estado:'Activo',estadoLegal:'',estadoMedico:'Activo — sin trabajar',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Tres de Febrero',tel:'1156072183',mail:'',cuit:'20261482089',estadoCivil:'Casado',nac:'Argentina',banco:'',calzado:43,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2022-05-27',adjuntosLegal:[],adjuntosMedico:['certif_medico.pdf']},{nro:129,nombre:'Peralta Walter Ezequiel',dni:'34567890',funcion:'Retén',servicio:'RETEN.GENERAL',supervisor:'Santiago Ayala',ingreso:'20/09/2021',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Caseros',tel:'1190123478',mail:'',cuit:'20345678901',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:42,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2021-09-20',adjuntosLegal:[],adjuntosMedico:[]},{nro:130,nombre:'Fleita Graciela Ines',dni:'25678901',funcion:'Retén',servicio:'RETEN.GENERAL',supervisor:'Dario Lage',ingreso:'14/03/2016',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Isidro Casanova',tel:'1101234567',mail:'',cuit:'27256789015',estadoCivil:'Casada',nac:'Argentina',banco:'Galicia',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2016-03-14',adjuntosLegal:[],adjuntosMedico:[]},{nro:131,nombre:'Juarez Diego Martin',dni:'40891234',funcion:'Retén',servicio:'RETEN.GENERAL',supervisor:'Dario Lage',ingreso:'07/07/2024',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Pendiente',localidad:'Laferrere',tel:'1112345678',mail:'',cuit:'20408912341',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:42,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2024-07-07',adjuntosLegal:[],adjuntosMedico:[]},{nro:132,nombre:'Cardozo Miriam Patricia',dni:'28903124',funcion:'Operario A',servicio:'GYM.RECOLETA',supervisor:'Alfredo Arispe',ingreso:'22/01/2018',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Recoleta',tel:'1123456780',mail:'mcardozo@gmail.com',cuit:'27289031248',estadoCivil:'Casada',nac:'Argentina',banco:'Santander',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2018-01-22',adjuntosLegal:[],adjuntosMedico:[]},{nro:133,nombre:'Gonzalez Fabian Horacio',dni:'31234567',funcion:'Operario B',servicio:'GYM.RECOLETA',supervisor:'Alfredo Arispe',ingreso:'13/09/2020',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Palermo',tel:'1134567890',mail:'',cuit:'20312345679',estadoCivil:'Casado',nac:'Argentina',banco:'',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2020-09-13',adjuntosLegal:[],adjuntosMedico:[]},{nro:2,nombre:'Peretti Juan Carlos',dni:'6263572',funcion:'Coordinador de área',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'01/02/2011',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Belgrano',tel:'1131543167',mail:'juanperetti_46@hotmail.com',cuit:'20062635720',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:43,ambo:'XL',periodoPrueba:6,fechaIngresoPrueba:'2011-02-01',adjuntosLegal:[],adjuntosMedico:[]},{nro:43,nombre:'Arispe Alfredo Julian',dni:'18348699',funcion:'Supervisor',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'11/03/2011',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Pompeya',tel:'1122751445',mail:'alfredoarispe@hotmail.com',cuit:'20183486994',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2011-03-11',adjuntosLegal:[],adjuntosMedico:[]},{nro:134,nombre:'Cabrera Silvia Adriana',dni:'24891034',funcion:'Auxiliar administrativo',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'05/08/2013',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Flores',tel:'1145678901',mail:'scabrera@ohlimpia.coop',cuit:'27248910347',estadoCivil:'Casada',nac:'Argentina',banco:'Galicia',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2013-08-05',adjuntosLegal:[],adjuntosMedico:[]},{nro:135,nombre:'Sandez Patricia Liliana',dni:'22109834',funcion:'Auxiliar administrativo',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'12/06/2012',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Caballito',tel:'1156789013',mail:'psandez@ohlimpia.coop',cuit:'27221098344',estadoCivil:'Casada',nac:'Argentina',banco:'Banco Nación',calzado:37,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2012-06-12',adjuntosLegal:[],adjuntosMedico:[]},{nro:136,nombre:'Ponce Fernando Leandro',dni:'35892013',funcion:'Auxiliar administrativo',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'20/03/2022',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Villa del Parque',tel:'1167890124',mail:'fponce@ohlimpia.coop',cuit:'20358920139',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2022-03-20',adjuntosLegal:[],adjuntosMedico:[]},{nro:137,nombre:'Ibarra Monica Beatriz',dni:'26781034',funcion:'Coordinador de área',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'07/11/2014',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Flores',tel:'1178901235',mail:'mibarra@ohlimpia.coop',cuit:'27267810346',estadoCivil:'Casada',nac:'Argentina',banco:'Santander',calzado:38,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2014-11-07',adjuntosLegal:[],adjuntosMedico:[]},{nro:138,nombre:'Vera Diego Ezequiel',dni:'39012345',funcion:'Auxiliar administrativo',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'15/01/2024',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Pendiente',localidad:'San Telmo',tel:'1189012346',mail:'dvera@ohlimpia.coop',cuit:'20390123456',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:41,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2024-01-15',adjuntosLegal:[],adjuntosMedico:[]},{nro:139,nombre:'Lemos Jimena Antonella',dni:'34201890',funcion:'Coordinador de área',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'10/04/2019',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Belgrano',tel:'1190123457',mail:'jlemos@ohlimpia.coop',cuit:'27342018906',estadoCivil:'Soltera',nac:'Argentina',banco:'Galicia',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2019-04-10',adjuntosLegal:[],adjuntosMedico:[]},{nro:140,nombre:'Naara Pizarro Valentina',dni:'37890123',funcion:'Auxiliar administrativo',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'03/08/2021',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Palermo',tel:'1101234568',mail:'npizarro@ohlimpia.coop',cuit:'27378901237',estadoCivil:'Soltera',nac:'Argentina',banco:'',calzado:37,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2021-08-03',adjuntosLegal:[],adjuntosMedico:[]},{nro:141,nombre:'Uballes Alvaro Sebastian',dni:'28012834',funcion:'Supervisor',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'14/02/2012',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Floresta',tel:'1112345679',mail:'auballes@ohlimpia.coop',cuit:'20280128347',estadoCivil:'Casado',nac:'Argentina',banco:'Banco Nación',calzado:43,ambo:'XL',periodoPrueba:6,fechaIngresoPrueba:'2012-02-14',adjuntosLegal:[],adjuntosMedico:[]},{nro:142,nombre:'Cacciato Alejandro Pablo',dni:'25678123',funcion:'Supervisor',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'22/05/2013',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Caballito',tel:'1123456791',mail:'acacciato@ohlimpia.coop',cuit:'20256781238',estadoCivil:'Casado',nac:'Argentina',banco:'Galicia',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2013-05-22',adjuntosLegal:[],adjuntosMedico:[]},{nro:143,nombre:'Gomez Valeria Ines',dni:'30123456',funcion:'Coordinador de área',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'09/07/2016',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Barracas',tel:'1134567891',mail:'vgomez@ohlimpia.coop',cuit:'27301234567',estadoCivil:'Casada',nac:'Argentina',banco:'Santander',calzado:37,ambo:'M',periodoPrueba:6,fechaIngresoPrueba:'2016-07-09',adjuntosLegal:[],adjuntosMedico:[]},{nro:144,nombre:'Herrera Gustavo Andres',dni:'33456789',funcion:'Auxiliar administrativo',servicio:'ADMINISTRATIVO',supervisor:'ADMINISTRATIVO',ingreso:'18/02/2020',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Completo',localidad:'Retiro',tel:'1145678902',mail:'gherrera@ohlimpia.coop',cuit:'20334567893',estadoCivil:'Soltero',nac:'Argentina',banco:'',calzado:43,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2020-02-18',adjuntosLegal:[],adjuntosMedico:[]},{nro:22,nombre:'Godoy Alicia Alejandra',dni:'25189767',funcion:'Operario',servicio:'—',supervisor:'—',ingreso:'28/08/2015',estado:'Baja',estadoLegal:'Estado judicial',estadoMedico:'',fechaBaja:'15/03/2024',fechaReincorp:'',seguro:'—',localidad:'Avellaneda',tel:'',mail:'',cuit:'',estadoCivil:'',nac:'',banco:'',calzado:38,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2015-08-28',adjuntosLegal:['carta_doc_1.pdf','escrito_judicial.pdf'],adjuntosMedico:[]},{nro:46,nombre:'Camacho Solis Katherine',dni:'93991411',funcion:'Operario',servicio:'CIBRA',supervisor:'Alejandro Cacciato',ingreso:'25/04/2014',estado:'Activo',estadoLegal:'Carta documento recibida',estadoMedico:'',fechaBaja:'',fechaReincorp:'',seguro:'Pendiente',localidad:'Tigre',tel:'1150581888',mail:'',cuit:'27939914116',estadoCivil:'Soltera',nac:'Peruana',banco:'',calzado:38,ambo:'S',periodoPrueba:6,fechaIngresoPrueba:'2014-04-25',adjuntosLegal:['carta_doc_1.pdf'],adjuntosMedico:[]},{nro:97,nombre:'Sanchez Ocas Segundo',dni:'94243288',funcion:'Operario',servicio:'LOS.PINOS',supervisor:'Alvaro Uballes',ingreso:'12/02/2016',estado:'Activo',estadoLegal:'',estadoMedico:'',fechaBaja:'05/06/2018',fechaReincorp:'14/01/2020',seguro:'Completo',localidad:'CABA',tel:'',mail:'',cuit:'20942432888',estadoCivil:'',nac:'',banco:'',calzado:42,ambo:'L',periodoPrueba:6,fechaIngresoPrueba:'2020-01-14',adjuntosLegal:[],adjuntosMedico:[]}];
// (Set B duplicado de DB.clientes eliminado — v039, Cambio 2. Ganaba en runtime sobre el esquema rico de la línea 1207 al ejecutarse después, sin guard, dejando la UI de Clientes con datos incompletos.)
DB.candidatos = [];
DB.pedidos = [{id:1,fecha:'09/10/2023',supervisor:'Claudia Cazenave',servicio:'HOSPITAL.CAMPANA',zona:'Buenos Aires',puesto:'Operario',horario:'22hs a 06hs nocturno 6×1',urgencia:'Alto',estado:'Cubierto',candidato:'Lima Romina',obs:''},{id:2,fecha:'27/11/2023',supervisor:'Alvaro Uballes',servicio:'HIT.LIBERTADOR.CEL',zona:'CABA',puesto:'Retén',horario:'Rotativos full time 6×1',urgencia:'Medio',estado:'Pendiente',candidato:'',obs:''},{id:3,fecha:'02/04/2026',supervisor:'Alejandro Cacciato',servicio:'SULFOQUIMICA',zona:'Buenos Aires',puesto:'Operario',horario:'L-V 14/22hs',urgencia:'Alto',estado:'Pendiente',candidato:'',obs:''},{id:4,fecha:'01/04/2026',supervisor:'Marcelo Moure',servicio:'CENARD',zona:'CABA',puesto:'Operario B',horario:'L-V 06/14hs',urgencia:'Medio',estado:'En proceso',candidato:'Sandoval Hugo',obs:''},{id:5,fecha:'03/04/2026',supervisor:'Fabio Benvenuto',servicio:'HACOAJ.TIGRE',zona:'Buenos Aires',puesto:'Encargado',horario:'Sábados y domingos 08/16hs',urgencia:'Alto',estado:'Pendiente',candidato:'',obs:'Temporada alta próxima'},{id:6,fecha:'28/03/2026',supervisor:'Lorena Unzain',servicio:'TEKNOPOLIS',zona:'Buenos Aires',puesto:'Operario B',horario:'L-V 14/22hs',urgencia:'Bajo',estado:'Pendiente',candidato:'',obs:''}];
DB.psicos = [];
DB.casosLegales = [{id:1,asociado:'Godoy Alicia Alejandra',nroSocio:22,estado:'Estado judicial',abogado:'Dr. Martínez Carlos',estudio:'Estudio Martínez & Asoc.',supervisor:'Matias Maidana',servicio:'COTO.SARANDI',fechaInicio:'15/01/2024',ultimaNovedad:'10/03/2024',adjuntos:['carta_doc_1.pdf','escrito_judicial.pdf']},{id:2,asociado:'Camacho Solis Katherine',nroSocio:46,estado:'Carta documento recibida',abogado:'Dr. García Luis',estudio:'Estudio García',supervisor:'Alejandro Cacciato',servicio:'CIBRA',fechaInicio:'20/03/2026',ultimaNovedad:'01/04/2026',adjuntos:['carta_doc_1.pdf']},{id:3,asociado:'Villalba Sergio Fabian',nroSocio:102,estado:'Conciliación SECLO',abogado:'Dr. Martínez Carlos',estudio:'Estudio Martínez & Asoc.',supervisor:'Claudia Cazenave',servicio:'HOSPITAL.CAMPANA',fechaInicio:'10/02/2026',ultimaNovedad:'02/04/2026',adjuntos:['acuerdo_seclo.pdf']}];
DB.enfermos = [{id:1,asociado:'Rodriguez Maria Elena',nroSocio:113,tipo:'Enfermedad inculpable',fechaHecho:'15/02/2026',dias:45,ultimoContacto:'28/03/2026',certif:'Presentado',estado:'Activo — sin trabajar',habilitado:'No — en reposo médico',adjuntos:['certif_medico.pdf','orden_medica.pdf']},{id:2,asociado:'Gomez Diego Alejandro',nroSocio:71,tipo:'Accidente laboral',fechaHecho:'01/03/2026',dias:32,ultimoContacto:'30/03/2026',certif:'Presentado',estado:'En tratamiento',habilitado:'No — en reposo médico',adjuntos:['certif_medico.pdf']},{id:3,asociado:'Torres Ana Beatriz',nroSocio:103,tipo:'Accidente in itinere',fechaHecho:'10/01/2026',dias:82,ultimoContacto:'02/04/2026',certif:'Presentado',estado:'En tratamiento',habilitado:'No — en reposo médico',adjuntos:['certif_medico.pdf','estudio_rx.pdf','kine_informe.pdf']},{id:4,asociado:'Fleita Graciela Ines',nroSocio:130,tipo:'Enfermedad inculpable',fechaHecho:'20/03/2026',dias:15,ultimoContacto:'04/04/2026',certif:'Pendiente',estado:'Reposo domiciliario',habilitado:'No — en reposo médico',adjuntos:[]}];


// ── DATOS OPERATIVOS ──

// Grillas de liquidación activas (mes actual)
// (Seed viejo con esquema items[]/horasNorm/horasExtra eliminado — v040, Parte B.
// Convivía con el esquema nuevo asociados[]/horas{fechaISO} que arma crearGrillaDesdeObj
// en el mismo array DB.grillasLiq, mezclando ambos esquemas en runtime. Ahora que
// grillasLiq persiste de verdad (v040), supaInit() puebla el array con datos reales
// antes de que este guard corra.)
if(!DB.grillasLiq) DB.grillasLiq = [];

// Retenes activos
if(!DB.retenes) DB.retenes = [];
if(DB.retenes.length===0){
  DB.retenes = [
    {id:1,periodo:'2026-03',supervisor:'Santiago Ayala',estado:'Borrador',fechaCreacion:'01/04/2026',
     items:[
       {nombre:'Gomez Diego Alejandro',nroSocio:71,diasTrabajados:0,obs:'De baja médica'},
       {nombre:'Peralta Walter Ezequiel',nroSocio:129,diasTrabajados:18,obs:''},
     ]},
    {id:2,periodo:'2026-03',supervisor:'Dario Lage',estado:'Enviada',fechaCreacion:'31/03/2026',fechaEnvio:'01/04/2026',
     items:[
       {nombre:'Fleita Graciela Ines',nroSocio:130,diasTrabajados:0,obs:'De baja médica desde 20/3'},
       {nombre:'Juarez Diego Martin',nroSocio:131,diasTrabajados:22,obs:''},
     ]},
  ];
}

// Monotributos — categorías actuales
// Nota: se sacó la semilla de datos de prueba (shape viejo, incompatible con
// el shape real que usa guardarMonotributo/renderMonotributos) ahora que la
// tabla persiste de verdad en Supabase (v017).
if(!DB.monotributos) DB.monotributos = [];

// Feriados del mes
if(!DB.feriados) DB.feriados = [];
if(DB.feriados.length===0){
  DB.feriados = [
    {id:1,fecha:'2026-03-23',nombre:'Feriado nacional — Día de la Memoria',tipo:'Nacional',obs:''},
    {id:2,fecha:'2026-04-02',nombre:'Día del Veterano de Malvinas',tipo:'Nacional',obs:''},
    {id:3,fecha:'2026-04-03',nombre:'Feriado puente',tipo:'Nacional',obs:''},
    {id:4,fecha:'2026-04-14',nombre:'Martes Santo',tipo:'Nacional',obs:'Semana Santa'},
    {id:5,fecha:'2026-04-17',nombre:'Viernes Santo',tipo:'Nacional',obs:'Semana Santa'},
  ];
}

// Planillas de adelantos — hay pedidos pendientes de aprobación
if(!DB.planillasAdelantos) DB.planillasAdelantos = [];
if(DB.planillasAdelantos.length===0){
  DB.planillasAdelantos = [
    {id:1,periodo:'2026-04',supervisorNombre:'Alvaro Uballes',estado:'Enviada',
     fechaCreacion:'01/04/2026',fechaEnvio:'02/04/2026',notificado:false,obs:'',
     items:[
       {nombre:'Benitez Marcos Ruben',nroSocio:104,monto:35000,estado:'Pendiente',obs:''},
       {nombre:'Quiroga Daniela Paz',nroSocio:105,monto:30000,estado:'Pendiente',obs:''},
     ]},
    {id:2,periodo:'2026-04',supervisorNombre:'Claudia Cazenave',estado:'Enviada',
     fechaCreacion:'02/04/2026',fechaEnvio:'02/04/2026',notificado:false,obs:'',
     items:[
       {nombre:'Ramirez Claudia Beatriz',nroSocio:101,monto:30000,estado:'Pendiente',obs:''},
       {nombre:'Gutierrez Ramon Eduardo',nroSocio:120,monto:35000,estado:'Pendiente',obs:''},
     ]},
    {id:3,periodo:'2026-03',supervisorNombre:'Marcelo Moure',estado:'Aprobada',
     fechaCreacion:'01/03/2026',fechaEnvio:'02/03/2026',fechaResolucion:'04/03/2026',
     resueltoPor:'Finanzas',depositado:true,fechaDeposito:'06/03/2026',depositadoPor:'Finanzas',
     notificado:true,fechaNotificacion:'07/03/2026',obs:'',
     items:[
       {nombre:'Ibañez Carlos Javier',nroSocio:114,monto:30000,estado:'Aprobado',obs:''},
       {nombre:'Paz Florencia Belen',nroSocio:115,monto:30000,estado:'Aprobado',obs:''},
     ]},
  ];
}

// Solicitudes de préstamos — una pendiente
if(!DB.solicitudesPrestamos) DB.solicitudesPrestamos = [];
if(DB.solicitudesPrestamos.length===0){
  DB.solicitudesPrestamos = [
    {id:1,periodo:'2026-04',supervisorNombre:'Santiago Ayala',estado:'Enviada',
     fechaCreacion:'03/04/2026',fechaEnvio:'03/04/2026',notificado:false,obs:'',
     items:[
       {nombre:'Soria Jorge Luis',nroSocio:116,montoSolicitado:150000,cuotasSolicitadas:12,montoCuota:12500,estado:'Pendiente',obs:'Refacción del hogar'},
     ]},
  ];
}



// ── DB Monotributos ──
if(!DB.monotributos) DB.monotributos = [];
// [{id, nombre, nroSocio, cuit, categoria, zona('capital'|'provincia'), obraSocial(bool),
//   cur(monto), fechaAlta, estado, historialCategorias:[{cat, desde, hasta}], obs}]

// Historial de cambios de categoría y CUR
// DB.monoCambios = [{id, nombre, fecha, catAnterior, catNueva, curAnterior, curNuevo,
//                   proyeccionAnual, motivo, decidoPor, resultado:'Aprobado'|'Rechazado'}]
if(!DB.monoCambios) DB.monoCambios = [];

// Tablas de categorías con vigencia
// Estructura: DB.monoTablas[vigencia] = [{cat, limiteAnual, curBase, curCapital, curConFamilia, curCapitalConFamilia}]
if(!DB.monoTablas) DB.monoTablas = {
  '2024-01': [
    {cat:'A', limiteAnual:2112000,  curBase:8685,  curCapital:10685, curConFamilia:13685, curCapitalConFamilia:15685},
    {cat:'B', limiteAnual:3168000,  curBase:9785,  curCapital:11985, curConFamilia:15985, curCapitalConFamilia:18185},
    {cat:'C', limiteAnual:4224000,  curBase:11285, curCapital:13885, curConFamilia:18285, curCapitalConFamilia:20885},
    {cat:'D', limiteAnual:5280000,  curBase:13285, curCapital:16385, curConFamilia:22385, curCapitalConFamilia:25485},
    {cat:'E', limiteAnual:6450000,  curBase:16885, curCapital:20885, curConFamilia:28585, curCapitalConFamilia:32585},
    {cat:'F', limiteAnual:8300000,  curBase:22385, curCapital:27785, curConFamilia:38185, curCapitalConFamilia:43585},
    {cat:'G', limiteAnual:10000000, curBase:28785, curCapital:35785, curConFamilia:49385, curCapitalConFamilia:56385},
    {cat:'H', limiteAnual:13250000, curBase:38485, curCapital:48185, curConFamilia:65785, curCapitalConFamilia:75485},
    {cat:'I', limiteAnual:16500000, curBase:51085, curCapital:64185, curConFamilia:87585, curCapitalConFamilia:100685},
    {cat:'J', limiteAnual:20000000, curBase:68485, curCapital:86185, curConFamilia:117385, curCapitalConFamilia:135085},
    {cat:'K', limiteAnual:24250000, curBase:98885, curCapital:124885, curConFamilia:169685, curCapitalConFamilia:195685},
  ]
};

// ── DB Uniformes ──
if(!DB.uniformes) DB.uniformes = [];
// [{id, nombre, nroSocio, fecha, talle, prendas:[{tipo,cantidad}], descuento, estado, obs}]

// ── DB Retenciones ──
if(!DB.retenciones) DB.retenciones = [];
// [{id, nombre, nroSocio, tipo:'conflicto'|'enfermedad'|'otra', periodo, monto, motivo, estado, fecha}]

if(!DB.mantPersonal) DB.mantPersonal = [
  {id:1, nombre:'Soria Guillermo', nroSocio:'3301', categoriBase:'Operario/a limpieza especializado/a', activo:true},
  {id:2, nombre:'Torres Daniela',  nroSocio:'3412', categoriBase:'Operario/a limpieza especializado/a', activo:true},
];
if(!DB.mantHoras) DB.mantHoras = {};
if(!DB.cuentaCorriente) DB.cuentaCorriente = {};  // DB.cuentaCorriente[nombre] = [{fecha, concepto, monto, tipo}]

function renderLiquidaciones(){
  // Determinar permisos PRIMERO antes de cualquier uso
  const esAdmin = ['Administrador total'].includes(currentUser?.perfil);
  const esSupervisor = currentUser?.perfil === 'Supervisor';
  const puedeEditar = esAdmin;
  const _mesSel = $('lqs-mes-sel')?.value || new Date().toISOString().slice(0,7);
  const congelado = DB.lqsCongelado?.[_mesSel] || false;

  // Poblar selector de mes
  const sel = $('lqs-mes-sel');
  // Mostrar badge de solo lectura para supervisores
  const badge = $('lqs-vista-badge');
  if(badge) badge.style.display = esSupervisor ? 'inline' : 'none';


  if(sel && !sel.options.length){
    const hoy = new Date();
    for(let i=-3; i<=3; i++){
      const d = new Date(hoy.getFullYear(), hoy.getMonth()+i, 1);
      const val = d.toISOString().slice(0,7);
      const label = d.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
      const opt = document.createElement('option');
      opt.value=val; opt.textContent=label;
      if(i===0) opt.selected=true;
      sel.appendChild(opt);
    }
  }

  const mes = $('lqs-mes-sel')?.value || new Date().toISOString().slice(0,7);
  if(!DB.lqsDescuentos[mes]) DB.lqsDescuentos[mes]={};

  // ── Recolectar todos los asociados de todas las fuentes ──
  const filas = [];

  // 1. Liquidación de horas (servicios) — filtrar por supervisor si corresponde
  let grillasDelMes = (DB.grillasLiq||[]).filter(g=>g.periodo===mes);
  if(esSupervisor){
    // Supervisor solo ve sus propios servicios
    grillasDelMes = grillasDelMes.filter(g=>
      g.supervisor===currentUser.nombre||g.supervisor===currentUser.funcion||
      (DB.objetivos||[]).find(o=>o.codigo===g.objCodigo&&(o.supervisor===currentUser.nombre||o.supervisor===currentUser.funcion))
    );
  }
  grillasDelMes.forEach(grilla=>{
    (grilla.asociados||[]).forEach(asoc=>{
      const dias = getDiasDelMes(mes);
      let hsTotal=0, hsExtra=0;
      dias.forEach(dia=>{
        const rawVal = asoc.horas?.[dia.iso];
        const h = parseFloat(rawVal||0);
        if(!isNaN(h) && h>0) hsTotal+=h;
      });
      const params = DB.parametrosServicio[grilla.objCodigo]||{horasPorDia:8, diasSemana:[1,2,3,4,5]};
      const diasLab = getDiasDelMes(mes).filter(d=>{
        const dow=new Date(d.iso+'T12:00:00').getDay();
        return params.diasSemana.includes(dow)&&!d.esFeriado;
      }).length;
      const hsNormales = diasLab * (params.horasPorDia||8);
      hsExtra = Math.max(0, hsTotal - hsNormales);
      const vh = getCategoriaVH(asoc.categoria||'');
      const bruto = Math.round(hsTotal * vh);
      filas.push({
        nombre: asoc.nombre,
        categoria: asoc.categoria||'—',
        area: grilla.objCodigo,
        fuente: 'Servicios',
        hsTotal,
        hsExtra: Math.round(hsExtra*10)/10,
        bruto,
        valorHora: vh,
      });
    });
  });

  // 2. Planilla Administración — solo visible para Admin, RRHH, Finanzas
  if(!esSupervisor)
  (DB.liqAdminPersonal||[]).filter(p=>p.activo).forEach(p=>{
    const valP = getValoresPeriodo(DB.liqAdminValores, p.id, mes, {horasFijas:p.horasFijas||200, valorHora:p.valorHora||0});
    const horasP = (DB.liqAdminHoras?.[mes]?.[p.id])||{};
    let hsReg=0;
    getDiasDelMes(mes).forEach(dia=>{
      const h=parseFloat(horasP[dia.iso]||0);
      if(h>0) hsReg+=h;
    });
    const bruto = Math.round((valP.horasFijas||0)*(valP.valorHora||0));
    filas.push({
      nombre: p.nombre,
      categoria: p.categoria||'—',
      area: p.area||'Admin',
      fuente: 'Administración',
      hsTotal: hsReg,
      hsExtra: 0,
      bruto,
      valorHora: valP.valorHora||0,
    });
  });

  // 3. Suplementos — solo visible para Admin, RRHH, Finanzas
  if(!esSupervisor)
  (DB.liqSuplemento||[]).filter(p=>p.activo).forEach(p=>{
    const valP = getValoresPeriodo(DB.liqSuplementoValores, p.id, mes, {horasFijas:p.horasFijas||0, valorHora:p.valorHora||0});
    const bruto = Math.round((valP.horasFijas||0)*(valP.valorHora||0));
    filas.push({
      nombre: p.nombre,
      categoria: p.categoria||p.funcionExtra||'Suplemento',
      area: p.area||'—',
      fuente: 'Suplemento',
      hsTotal: valP.horasFijas||0,
      hsExtra: 0,
      bruto,
      valorHora: valP.valorHora||0,
    });
  });


  // 4. Retenes — solo visible para Admin, RRHH, Finanzas, Operaciones
  if(!esSupervisor){
    const horasSvc = getHorasRetenDeServicios(mes);
    // Combinar retenes registrados + los que vienen solo de servicios
    const todosRetLiq = [...(DB.retenes||[]).filter(r=>r.activo)];
    Object.keys(horasSvc).forEach(nombre=>{
      if(!todosRetLiq.find(r=>r.nombre===nombre)){
        todosRetLiq.push({id:'svc_'+nombre.replace(/\s/g,'_'), nombre,
          categoriBase: horasSvc[nombre].categoria||'Operario/a limpieza', activo:true});
      }
    });
    todosRetLiq.forEach(r=>{
      const diasR = getDiasDelMes(mes);
      const HS_MINIMO = 200;
      let hsReales=0, rechazos=0;
      diasR.forEach(d=>{
        // Horas manuales en el módulo Retenes
        const vm = DB.retenHoras?.[mes]?.[r.id]?.[d.iso];
        const hm = parseFloat(vm?.hs||0);
        if(hm>0) hsReales+=hm;
        if(String(vm?.hs||'').toUpperCase()==='AI') rechazos++;
        // Horas del servicio (tipo retén)
        const hsSvcDia = horasSvc[r.nombre]?.horas?.[d.iso];
        const hsr = parseFloat(hsSvcDia||0);
        if(hsr>0) hsReales+=hsr;
        if(String(hsSvcDia||'').toUpperCase()==='AI') rechazos++;
      });
      const hsCobrar = Math.max(hsReales, HS_MINIMO - rechazos*8);
      const vh = getCategoriaVH(r.categoriBase||'');
      const bruto = Math.round(hsCobrar * vh);
      filas.push({
        nombre: r.nombre,
        categoria: r.categoriBase||'—',
        area: 'Retenes',
        fuente: 'Retén',
        hsTotal: hsCobrar,
        hsExtra: Math.max(0, hsReales - HS_MINIMO),
        bruto,
        valorHora: vh,
        detalleFuentes: [{fuente:'Retén', bruto, hs:hsCobrar, hsReales, rechazos}],
      });
    });
  }

  // 5. Mantenimiento — solo visible para Admin, RRHH, Finanzas, Operaciones
  if(!esSupervisor)
  (DB.mantPersonal||[]).filter(r=>r.activo).forEach(r=>{
    const diasM = getDiasDelMes(mes);
    const HS_MINIMO = 200;
    let hsReales=0, rechazos=0;
    diasM.forEach(d=>{
      const v = DB.mantHoras?.[mes]?.[r.id]?.[d.iso];
      const h = parseFloat(v?.hs||0);
      if(h>0) hsReales+=h;
      if(String(v?.hs||'').toUpperCase()==='AI') rechazos++;
    });
    const hsCobrar = Math.max(hsReales, HS_MINIMO - rechazos*8);
    const vh = getCategoriaVH(r.categoriBase||'');
    const bruto = Math.round(hsCobrar * vh);
    filas.push({
      nombre: r.nombre,
      categoria: r.categoriBase||'—',
      area: 'Mantenimiento',
      fuente: 'Mantenimiento',
      hsTotal: hsCobrar,
      hsExtra: Math.max(0, hsReales - HS_MINIMO),
      bruto,
      valorHora: vh,
      detalleFuentes: [{fuente:'Mantenimiento', bruto, hs:hsCobrar, hsReales, rechazos}],
    });
  });

  // ── Consolidar filas por nombre ──
  const filasMap = {};
  filas.forEach(f=>{
    if(!filasMap[f.nombre]){
      filasMap[f.nombre] = {
        nombre: f.nombre,
        categoria: f.categoria,
        area: f.area,
        fuentes: [f.fuente],
        hsTotal: f.hsTotal,
        hsExtra: f.hsExtra,
        bruto: f.bruto,
        detalleFuentes: [{fuente:f.fuente, bruto:f.bruto, hs:f.hsTotal}],
      };
    } else {
      // Mismo asociado en otra fuente — sumar
      const r = filasMap[f.nombre];
      r.fuentes.push(f.fuente);
      r.hsTotal += f.hsTotal;
      r.hsExtra += f.hsExtra;
      r.bruto   += f.bruto;
      r.detalleFuentes.push({fuente:f.fuente, bruto:f.bruto, hs:f.hsTotal});
    }
  });
  const filasConsolidadas = Object.values(filasMap);


  // 4. Retenes — solo visible para Admin, RRHH, Finanzas, Operaciones
  if(!esSupervisor){
    const horasSvc = getHorasRetenDeServicios(mes);
    // Combinar retenes registrados + los que vienen solo de servicios
    const todosRetLiq = [...(DB.retenes||[]).filter(r=>r.activo)];
    Object.keys(horasSvc).forEach(nombre=>{
      if(!todosRetLiq.find(r=>r.nombre===nombre)){
        todosRetLiq.push({id:'svc_'+nombre.replace(/\s/g,'_'), nombre,
          categoriBase: horasSvc[nombre].categoria||'Operario/a limpieza', activo:true});
      }
    });
    todosRetLiq.forEach(r=>{
      const diasR = getDiasDelMes(mes);
      const HS_MINIMO = 200;
      let hsReales=0, rechazos=0;
      diasR.forEach(d=>{
        // Horas manuales en el módulo Retenes
        const vm = DB.retenHoras?.[mes]?.[r.id]?.[d.iso];
        const hm = parseFloat(vm?.hs||0);
        if(hm>0) hsReales+=hm;
        if(String(vm?.hs||'').toUpperCase()==='AI') rechazos++;
        // Horas del servicio (tipo retén)
        const hsSvcDia = horasSvc[r.nombre]?.horas?.[d.iso];
        const hsr = parseFloat(hsSvcDia||0);
        if(hsr>0) hsReales+=hsr;
        if(String(hsSvcDia||'').toUpperCase()==='AI') rechazos++;
      });
      const hsCobrar = Math.max(hsReales, HS_MINIMO - rechazos*8);
      const vh = getCategoriaVH(r.categoriBase||'');
      const bruto = Math.round(hsCobrar * vh);
      filas.push({
        nombre: r.nombre,
        categoria: r.categoriBase||'—',
        area: 'Retenes',
        fuente: 'Retén',
        hsTotal: hsCobrar,
        hsExtra: Math.max(0, hsReales - HS_MINIMO),
        bruto,
        valorHora: vh,
        detalleFuentes: [{fuente:'Retén', bruto, hs:hsCobrar, hsReales, rechazos}],
      });
    });
  }
  // ── Calcular antigüedad, presentismo y descuentos por fila consolidada ──
  filasConsolidadas.forEach(f=>{
    const legajo = (DB.legajos||[]).find(l=>l.nombre===f.nombre);
    f.antiguedad = 0;
    if(legajo?.fechaIngreso){
      const ing = new Date(legajo.fechaIngreso.split('/').reverse().join('-')+'T12:00:00');
      const hoy = new Date();
      f.antiguedad = Math.floor((hoy-ing)/(1000*60*60*24*365));
    }
    // Presentismo: 3% del bruto total si no tuvo AI
    const tieneAI = getDiasDelMes(mes).some(d=>{
      const grillasNombre = (DB.grillasLiq||[]).filter(g=>g.periodo===mes);
      return grillasNombre.some(g=>(g.asociados||[]).some(a=>
        a.nombre===f.nombre && String(a.horas?.[d.iso]||'').toUpperCase()==='AI'
      ));
    });
    f.presentismo = tieneAI ? 0 : Math.round(f.bruto * 0.03);

    // Descuentos
    const desc = DB.lqsDescuentos[mes][f.nombre] || {};
    f.uniforme      = desc.uniforme    ||0;
    f.sanciones     = desc.sanciones   ||0;
    f.retConflicto  = desc.retConflicto||0;
    f.retEnfermedad = desc.retEnfermedad||0;
    f.monotributo   = desc.monotributo ||0;
    f.adelantos     = desc.adelantos   ||0;
    f.totalDesc = f.uniforme+f.sanciones+f.retConflicto+f.retEnfermedad+f.monotributo+f.adelantos;
    f.neto = Math.round(f.bruto + f.presentismo - f.totalDesc);
  });

  // ── Actualizar botones (ahora que filasConsolidadas está disponible) ──
  {
    const btnCongelar     = $('btn-congelar-lqs');
    const btnMarcarListo  = $('btn-marcar-listo-lqs');
    const btnAutorizarPago= $('btn-autorizar-pago-lqs');
    if(puedeEditar){
      const congeladoActual = DB.lqsCongelado?.[mes];
      const hayPagados = filasConsolidadas.some(f=>DB.lqsPagos?.[mes]?.[f.nombre]?.pagado);
      const hayListos  = filasConsolidadas.some(f=>DB.lqsListos?.[mes]?.[f.nombre]);
      if(btnCongelar){
        btnCongelar.textContent = congeladoActual ? '🔓 Descongelar mes' : '🔒 Congelar mes';
        btnCongelar.style.background = congeladoActual ? '#dc2626' : '#7c3aed';
        btnCongelar.style.display = 'inline-flex';
      }
      if(btnMarcarListo)    btnMarcarListo.style.display    = (!congeladoActual&&!hayPagados) ? 'inline-flex' : 'none';
      if(btnAutorizarPago)  btnAutorizarPago.style.display  = (congeladoActual&&hayListos&&!hayPagados) ? 'inline-flex' : 'none';
    } else {
      if(btnCongelar)      btnCongelar.style.display      = 'none';
      if(btnMarcarListo)   btnMarcarListo.style.display   = 'none';
      if(btnAutorizarPago) btnAutorizarPago.style.display = 'none';
    }
  }

  // ── Stats ──
  const totalBruto = filasConsolidadas.reduce((s,f)=>s+f.bruto,0);
  const totalDesc  = filasConsolidadas.reduce((s,f)=>s+f.totalDesc,0);
  const totalNeto  = filasConsolidadas.reduce((s,f)=>s+f.neto,0);
  if($('st-lqs-total')) $('st-lqs-total').textContent = filasConsolidadas.length;
  if($('st-lqs-bruto')) $('st-lqs-bruto').textContent = '$'+totalBruto.toLocaleString('es-AR');
  if($('st-lqs-desc'))  $('st-lqs-desc').textContent  = '$'+totalDesc.toLocaleString('es-AR');
  if($('st-lqs-neto'))  $('st-lqs-neto').textContent  = '$'+totalNeto.toLocaleString('es-AR');

  // ── Panel resumen neto ──
  const filasListas  = filasConsolidadas.filter(f=>DB.lqsListos?.[mes]?.[f.nombre]);
  const filasPagadas = filasConsolidadas.filter(f=>DB.lqsPagos?.[mes]?.[f.nombre]?.pagado);
  const totalAPagar  = filasListas.reduce((s,f)=>s+f.neto,0);
  const totalPagado  = filasPagadas.reduce((s,f)=>s+(DB.lqsPagos[mes][f.nombre].monto||0),0);
  if($('lqs-res-total'))        $('lqs-res-total').textContent        = '$'+totalNeto.toLocaleString('es-AR');
  if($('lqs-res-apagar'))       $('lqs-res-apagar').textContent       = '$'+totalAPagar.toLocaleString('es-AR');
  if($('lqs-res-apagar-count')) $('lqs-res-apagar-count').textContent = filasListas.length+' asociado'+(filasListas.length!==1?'s':'')+' marcado'+(filasListas.length!==1?'s':'');
  if($('lqs-res-pagado'))       $('lqs-res-pagado').textContent       = '$'+totalPagado.toLocaleString('es-AR');
  if($('lqs-res-pagado-count')) $('lqs-res-pagado-count').textContent = filasPagadas.length+' asociado'+(filasPagadas.length!==1?'s':'')+' pagado'+(filasPagadas.length!==1?'s':'');

  // ── Renderizar tabla ──
  const thead = $('thead-lqs');
  const tbody = $('tbody-lqs');
  if(!thead||!tbody) return;

  const thStyle = 'padding:8px 6px;border:1px solid #6b7280;font-size:10px;font-weight:600;text-align:center;white-space:nowrap;';
  const thLeft  = thStyle+'text-align:left;';

  thead.innerHTML = `<tr style="background:#374151;color:white;">
    <th style="${thLeft}min-width:180px;position:sticky;left:0;background:#374151;z-index:3;">Nombre</th>
    <th style="${thStyle}min-width:120px;">Categoría</th>
    <th style="${thStyle}min-width:90px;">Área/Servicio</th>

    <th style="${thStyle}min-width:60px;">Hs trab.</th>
    <th style="${thStyle}min-width:55px;">Hs extra</th>
    <th style="${thStyle}min-width:55px;">Antigüed.</th>
    <th style="${thStyle}min-width:70px;">Presentismo</th>
    <th style="${thStyle}min-width:100px;background:#1d4ed8;color:white;">Bruto</th>
    <th colspan="2" style="${thStyle}min-width:160px;background:#dc2626;color:white;">Descuentos</th>
    <th colspan="2" style="${thStyle}min-width:160px;background:#7c3aed;color:white;">Retenciones</th>
    <th colspan="2" style="${thStyle}min-width:160px;background:#6b7280;color:white;opacity:.7;">Próx. módulos</th>
    <th style="${thStyle}min-width:110px;background:#065f46;color:white;">NETO A PAGAR</th>
    <th style="${thStyle}min-width:120px;background:#14532d;color:white;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
        <span>Pagar</span>
        <div style="display:flex;gap:6px;margin-top:2px;">
          <button onclick="marcarTodosListo(true)" title="Tildar todos"
            style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;border-radius:4px;padding:1px 7px;cursor:pointer;font-size:13px;font-weight:700;">✓</button>
          <button onclick="marcarTodosListo(false)" title="Destildar todos"
            style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;border-radius:4px;padding:1px 7px;cursor:pointer;font-size:13px;font-weight:700;">✕</button>
        </div>
      </div>
    </th>

  </tr>
  <tr style="background:#4b5563;color:white;font-size:10px;">
    <th style="${thLeft}position:sticky;left:0;background:#4b5563;z-index:3;"></th>
    <th style="${thStyle}"></th>
    <th style="${thStyle}"></th>
    <th style="${thStyle}"></th>
    <th style="${thStyle}"></th>
    <th style="${thStyle}"></th>
    <th style="${thStyle}"></th>
    <th style="${thStyle}background:#1d4ed8;color:white;"></th>
    <th style="${thStyle}background:#b91c1c;color:white;">Uniforme</th>
    <th style="${thStyle}background:#b91c1c;color:white;">Sanciones</th>
    <th style="${thStyle}background:#6d28d9;color:white;">Ret.Conflicto</th>
    <th style="${thStyle}background:#6d28d9;color:white;">Ret.Enfermedad</th>
    <th style="${thStyle}background:#9ca3af;color:white;">Monotributo</th>
    <th style="${thStyle}background:#9ca3af;color:white;">Adelantos</th>
    <th style="${thStyle}background:#065f46;color:white;"></th>

    <th style="${thStyle}"></th>
  </tr>`;

  if(!filasConsolidadas.length){
    tbody.innerHTML=`<tr><td colspan="17" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      Sin datos para el período. Cargá horas en Liquidación de horas o en la Planilla de Administración.
    </td></tr>`;
    return;
  }

  const fmt = n => n>0?'$'+Math.round(n).toLocaleString('es-AR'):'—';
  const fmtDesc = (nombre, campo, val) => puedeEditar
    ? `<input type="number" value="${val||''}" min="0" step="100" placeholder="0"
        style="width:70px;padding:2px 4px;border:1px solid var(--borde-fuerte);border-radius:4px;font-size:11px;text-align:right;outline:none;"
        onchange="setDescuentoLqs('${mes}','${nombre}','${campo}',this.value)">`
    : `<span style="font-size:11px;color:${val>0?'white':'rgba(255,255,255,.4)'};">${val>0?'$'+Math.round(val).toLocaleString('es-AR'):'—'}</span>`;

  const fuenteColor = {'Servicios':'badge-azul','Administración':'badge-verde','Suplemento':'badge-acento','Retén':'badge-azul'};

  tbody.innerHTML = filasConsolidadas.map(f=>{
    const pagoInfo  = DB.lqsPagos?.[mes]?.[f.nombre];
    const listoInfo  = DB.lqsListos?.[mes]?.[f.nombre];
    return `<tr style="cursor:pointer;" onclick="verDetalleLqs('${f.nombre}','${mes}')" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background=''">
    <td style="padding:6px 10px;border:1px solid var(--borde);font-weight:500;font-size:12px;position:sticky;left:0;background:white;z-index:1;">${f.nombre} <span style="font-size:10px;color:var(--azul);">👁</span></td>
    <td style="padding:4px 6px;border:1px solid var(--borde);font-size:11px;">${f.categoria}</td>
    <td style="padding:4px 6px;border:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${f.area}</td>

    <td style="padding:4px 6px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--azul);">${f.hsTotal}hs</td>
    <td style="padding:4px 6px;border:1px solid var(--borde);text-align:right;color:${f.hsExtra>0?'var(--naranja)':'var(--texto-muy-suave)'};">${f.hsExtra>0?f.hsExtra+'hs':'—'}</td>
    <td style="padding:4px 6px;border:1px solid var(--borde);text-align:center;">${f.antiguedad>0?f.antiguedad+' año'+(f.antiguedad!==1?'s':''):'<1 año'}</td>
    <td style="padding:4px 6px;border:1px solid var(--borde);text-align:right;color:var(--verde);">${fmt(f.presentismo)}</td>
    <td style="padding:4px 6px;border:1px solid var(--borde);text-align:right;font-weight:700;color:white;background:#1e40af;">${fmt(f.bruto)}</td>
    <td style="padding:2px 4px;border:1px solid var(--borde);background:#fff0f0;">${fmtDesc(f.nombre,'uniforme',f.uniforme)}</td>
    <td style="padding:2px 4px;border:1px solid var(--borde);background:#fff0f0;">${fmtDesc(f.nombre,'sanciones',f.sanciones)}</td>
    <td style="padding:2px 4px;border:1px solid var(--borde);background:#f5f0ff;">${fmtDesc(f.nombre,'retConflicto',f.retConflicto)}</td>
    <td style="padding:2px 4px;border:1px solid var(--borde);background:#f5f0ff;">${fmtDesc(f.nombre,'retEnfermedad',f.retEnfermedad)}</td>
    <td style="padding:2px 4px;border:1px solid var(--borde);background:#f9fafb;opacity:.6;">${fmtDesc(f.nombre,'monotributo',f.monotributo)}</td>
    <td style="padding:2px 4px;border:1px solid var(--borde);background:#f9fafb;opacity:.6;">${fmtDesc(f.nombre,'adelantos',f.adelantos)}</td>
    <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;font-size:13px;color:white;background:#065f46;">${fmt(f.neto)}</td>
    <td style="padding:4px 6px;border:1px solid var(--borde);text-align:center;background:${pagoInfo?.pagado?'#dcfce7':listoInfo?'#dbeafe':'white'};">
      ${pagoInfo?.pagado
        ? `<div style="color:#065f46;font-weight:700;font-size:12px;">💰 $${Math.round(pagoInfo.monto).toLocaleString('es-AR')}</div>
           <div style="font-size:9px;color:#6b7280;">${pagoInfo.fecha}</div>`
        : puedeEditar
          ? `<div style="display:flex;align-items:center;justify-content:center;gap:8px;">
                 style="width:28px;height:28px;border-radius:50%;border:2px solid ${listoInfo?'#0369a1':'#d1d5db'};background:${listoInfo?'#0369a1':'white'};color:${listoInfo?'white':'#9ca3af'};cursor:pointer;font-size:14px;font-weight:700;line-height:1;">✓</button>
                 style="width:28px;height:28px;border-radius:50%;border:2px solid ${listoInfo?'#dc2626':'#d1d5db'};background:${listoInfo?'#fee2e2':'white'};color:${listoInfo?'#dc2626':'#9ca3af'};cursor:pointer;font-size:14px;font-weight:700;line-height:1;">✕</button>
             </div>`
          : listoInfo ? '<span style="color:#0369a1;font-weight:700;">✓</span>' : '—'
      }
    </td>

  </tr>`;
  }).join('');
}


// Ver la grilla de días de un asociado en un servicio específico

// Ver la grilla de días de un retén desde el detalle de liquidaciones
function verGrillaRetenDetalle(nombre, mes){
  const reten = (DB.retenes||[]).find(r=>r.nombre===nombre&&r.activo);
  if(!reten){ toast('No se encontró el retén '+nombre); return; }

  const dias = getDiasDelMes(mes);
  const dN = ['D','L','M','X','J','V','S'];
  const HS_MINIMO = 200;
  let hsReales=0, rechazos=0, totalMonto=0;

  // Fila de horas
  const headerCols = dias.map(dia=>{
    const dow = new Date(dia.iso+'T12:00:00').getDay();
    const bg = dia.esFeriado?'background:#ffe4e6;color:#111;':dia.esFinde?'background:#ffff00;color:#111;':'';
    return`<th style="padding:4px 2px;border:1px solid #6b7280;text-align:center;min-width:34px;font-size:10px;${bg}">
      <div style="font-weight:800;">${dN[dow]}</div>
      <div>${dia.d}</div>
    </th>`;
  }).join('');

  const filaHoras = dias.map(dia=>{
    const celda = DB.retenHoras?.[mes]?.[reten.id]?.[dia.iso]||{};
    const rawHs = celda.hs||'';
    const catAlt = celda.catAlt||'';
    const esEsp = ['F','AJ','AI'].includes(String(rawHs).toUpperCase());
    const h = esEsp?0:parseFloat(rawHs||0);
    const dispVal = esEsp?String(rawHs).toUpperCase():(h||'');
    if(h>0) hsReales+=h;
    if(String(rawHs).toUpperCase()==='AI') rechazos++;
    const dow = new Date(dia.iso+'T12:00:00').getDay();
    const bg = dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#fefce8;':'';
    const color = esEsp&&String(rawHs).toUpperCase()==='F'?'color:#7c3aed;font-weight:700'
      :esEsp&&String(rawHs).toUpperCase()==='AJ'?'color:#d97706;font-weight:700'
      :esEsp?'color:#dc2626;font-weight:700'
      :catAlt?'color:#7c3aed;font-weight:600'
      :h>0?'color:#1d4ed8;font-weight:600':'color:#d1d5db';
    return`<td style="padding:4px 2px;border:1px solid #e5e7eb;text-align:center;font-size:12px;${bg}${color}">
      ${dispVal}${h>0&&!esEsp?'hs':''}
      ${catAlt?`<div style="font-size:8px;color:#7c3aed;">${catAlt.substring(0,4)}</div>`:''}
    </td>`;
  }).join('');

  // Fila de montos
  const vh = getCategoriaVH(reten.categoriBase||'');
  const filaMonto = dias.map(dia=>{
    const celda = DB.retenHoras?.[mes]?.[reten.id]?.[dia.iso]||{};
    const rawHs = celda.hs||'';
    const catAlt = celda.catAlt||'';
    const esEsp = ['F','AJ','AI'].includes(String(rawHs).toUpperCase());
    const h = esEsp?0:parseFloat(rawHs||0);
    const vhDia = catAlt ? getCategoriaVH(catAlt) : vh;
    const m = h>0?Math.round(h*vhDia):0;
    if(m>0) totalMonto+=m;
    const dow = new Date(dia.iso+'T12:00:00').getDay();
    const bg = dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#fefce8;':'';
    return`<td style="padding:4px 2px;border:1px solid #e5e7eb;text-align:center;font-size:10px;${bg}color:${m>0?'#065f46':'#d1d5db'};">
      ${m>0?'$'+m.toLocaleString('es-AR'):'—'}
    </td>`;
  }).join('');

  const descRechazos = rechazos*8;
  const hsCobrar = Math.max(hsReales, HS_MINIMO - descRechazos);
  const totalFinal = Math.round(hsCobrar * vh);

  const grillaHTML = `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:13px;font-weight:700;color:#0369a1;">🔄 Planilla de retén — ${reten.categoriBase||'—'}</div>
        <div style="font-size:11px;color:var(--texto-suave);">$${vh.toLocaleString('es-AR')}/h base</div>
      </div>
      ${rechazos>0?`<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:8px 12px;font-size:12px;color:#dc2626;margin-bottom:8px;">
        ⚠️ <strong>${rechazos} rechazo${rechazos>1?'s':''}</strong> — descuento de ${descRechazos}hs del contrato
      </div>`:''}
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;font-size:12px;white-space:nowrap;">
          <thead>
            <tr style="background:#374151;color:white;">
              <th style="padding:6px 10px;border:1px solid #6b7280;text-align:left;min-width:80px;position:sticky;left:0;background:#374151;z-index:2;">Concepto</th>
              ${headerCols}
              <th style="padding:6px 8px;border:1px solid #6b7280;min-width:80px;text-align:right;background:#1d4ed8;color:white;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:5px 10px;border:1px solid #e5e7eb;font-weight:600;font-size:11px;position:sticky;left:0;background:white;z-index:1;">Horas</td>
              ${filaHoras}
              <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700;color:#1d4ed8;">${hsReales}hs reales</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td style="padding:5px 10px;border:1px solid #e5e7eb;font-weight:600;font-size:11px;position:sticky;left:0;background:#f9fafb;z-index:1;">Monto</td>
              ${filaMonto}
              <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700;color:#065f46;">$${totalMonto.toLocaleString('es-AR')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;font-size:12px;">
        <div style="background:#eff6ff;border-radius:8px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Hs reales</div>
          <div style="font-weight:700;color:#1d4ed8;">${hsReales}hs</div>
        </div>
        <div style="background:#${hsReales<HS_MINIMO?'fef3c7':'f0fdf4'};border-radius:8px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Hs a cobrar</div>
          <div style="font-weight:700;color:#${hsReales<HS_MINIMO?'92400e':'065f46'};">
            ${hsCobrar}hs ${hsReales<HS_MINIMO?'(mín. garantizado)':''}
          </div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Total a pagar</div>
          <div style="font-weight:700;color:#065f46;">$${totalFinal.toLocaleString('es-AR')}</div>
        </div>
      </div>
    </div>`;

  $('det-grilla-titulo').textContent = nombre + ' — Retén';
  $('det-grilla-periodo').textContent = new Date(mes+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  $('det-grilla-body').innerHTML = grillaHTML;
  abrirModal('modal-detalle-grilla-lqs');
}

function verGrillaServicioDetalle(nombre, mes, servicioDesc, detalleIdx){
  const grilla = (DB.grillasLiq||[]).find(g=>
    g.periodo===mes && (g.nombre===servicioDesc || g.objCodigo===servicioDesc)
  );
  if(!grilla){ toast('No se encontró la grilla de '+servicioDesc); return; }

  const asoc = (grilla.asociados||[]).find(a=>a.nombre===nombre);
  if(!asoc){ toast('No se encontró al asociado en esta grilla'); return; }

  const dias = getDiasDelMes(mes);
  const dN = ['D','L','M','X','J','V','S'];
  const vh = getCategoriaVH(asoc.categoria||'');
  let totalHs=0, totalMonto=0;

  // ── Construir grilla HORIZONTAL: cols = días, rows = Horas / Monto ──
  const headerCols = dias.map(dia=>{
    const dow = new Date(dia.iso+'T12:00:00').getDay();
    const bg = dia.esFeriado?'background:#ffe4e6;color:#111;':dia.esFinde?'background:#ffff00;color:#111;':'';
    return `<th style="padding:4px 3px;border:1px solid #6b7280;text-align:center;min-width:34px;font-size:10px;${bg}">
      <div style="font-weight:800;">${dN[dow]}</div>
      <div>${dia.d}</div>
      ${dia.esFeriado?'<div style="font-size:8px;">🎌</div>':''}
    </th>`;
  }).join('');

  // Fila de horas
  const filaHoras = dias.map(dia=>{
    const rawVal = asoc.horas?.[dia.iso];
    const esEsp = ['F','AJ','AI'].includes(String(rawVal||'').toUpperCase());
    const h = esEsp ? 0 : parseFloat(rawVal||0);
    const dispVal = esEsp ? String(rawVal).toUpperCase() : (h||'');
    if(h>0) totalHs+=h;
    const dow = new Date(dia.iso+'T12:00:00').getDay();
    const bg = dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#fefce8;':'';
    const color = esEsp&&rawVal==='F'?'color:#7c3aed;font-weight:700'
      : esEsp&&rawVal==='AJ'?'color:#d97706;font-weight:700'
      : esEsp?'color:#dc2626;font-weight:700'
      : h>0?'color:#1d4ed8;font-weight:600':'color:#d1d5db';
    return `<td style="padding:4px 3px;border:1px solid #e5e7eb;text-align:center;font-size:12px;${bg}${color}">
      ${dispVal}${h>0&&!esEsp?'hs':''}
    </td>`;
  }).join('');

  // Fila de montos
  const filaMonto = dias.map(dia=>{
    const rawVal = asoc.horas?.[dia.iso];
    const esEsp = ['F','AJ','AI'].includes(String(rawVal||'').toUpperCase());
    const h = esEsp ? 0 : parseFloat(rawVal||0);
    const m = h>0 ? Math.round(h*vh) : 0;
    if(m>0) totalMonto+=m;
    const dow = new Date(dia.iso+'T12:00:00').getDay();
    const bg = dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#fefce8;':'';
    return `<td style="padding:4px 3px;border:1px solid #e5e7eb;text-align:center;font-size:10px;${bg}color:${m>0?'#065f46':'#d1d5db'};">
      ${m>0?'$'+m.toLocaleString('es-AR'):'—'}
    </td>`;
  }).join('');

  const grillaHTML = `
    <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:13px;font-weight:700;color:#1e40af;">📅 ${servicioDesc}</div>
      <div style="font-size:12px;color:var(--texto-suave);">${asoc.categoria||'—'} · $${vh.toLocaleString('es-AR')}/h</div>
    </div>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;font-size:12px;white-space:nowrap;">
        <thead>
          <tr style="background:#374151;color:white;">
            <th style="padding:6px 10px;border:1px solid #6b7280;text-align:left;min-width:80px;position:sticky;left:0;background:#374151;z-index:2;">Concepto</th>
            ${headerCols}
            <th style="padding:6px 8px;border:1px solid #6b7280;min-width:80px;text-align:right;background:#1d4ed8;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:5px 10px;border:1px solid #e5e7eb;font-weight:600;font-size:11px;color:#374151;position:sticky;left:0;background:white;z-index:1;">Horas</td>
            ${filaHoras}
            <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700;color:#1d4ed8;">${totalHs}hs</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:5px 10px;border:1px solid #e5e7eb;font-weight:600;font-size:11px;color:#374151;position:sticky;left:0;background:#f9fafb;z-index:1;">Monto</td>
            ${filaMonto}
            <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700;color:#065f46;">$${totalMonto.toLocaleString('es-AR')}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  $('det-grilla-titulo').textContent = nombre + ' — ' + servicioDesc;
  $('det-grilla-periodo').textContent = new Date(mes+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  $('det-grilla-body').innerHTML = grillaHTML;
  abrirModal('modal-detalle-grilla-lqs');
}



// ── Registrar pago de un asociado ──
function registrarPago(periodo, nombre, monto){
  if(!confirm('¿Confirmar pago de $'+Math.round(monto).toLocaleString('es-AR')+' a '+nombre+'?')) return;
  if(!DB.lqsPagos[periodo]) DB.lqsPagos[periodo]={};
  DB.lqsPagos[periodo][nombre] = {
    pagado: true,
    monto: Math.round(monto),
    fecha: new Date().toLocaleDateString('es-AR'),
    registradoPor: currentUser?.nombre||'Admin',
  };
  toast('✅ Pago registrado — '+nombre+' $'+Math.round(monto).toLocaleString('es-AR'));
  renderLiquidaciones();
}

// ── Anular pago ──
function anularPago(periodo, nombre){
  if(!confirm('¿Anular el pago de '+nombre+'?')) return;
  if(DB.lqsPagos[periodo]?.[nombre]) delete DB.lqsPagos[periodo][nombre];
  toast('↩ Pago anulado — '+nombre);
  renderLiquidaciones();
}

// ── Congelar / Descongelar mes ──
function toggleCongelarLiquidacion(){
  const mes = $('lqs-mes-sel')?.value || new Date().toISOString().slice(0,7);
  const estaCongelado = DB.lqsCongelado?.[mes];
  if(!DB.lqsCongelado) DB.lqsCongelado={};

  if(estaCongelado){
    if(!confirm('¿Descongelar el período '+mes+'? Los supervisores podrán volver a modificar las grillas.')) return;
    DB.lqsCongelado[mes] = false;
    toast('🔓 Período '+mes+' descongelado — las grillas pueden modificarse nuevamente.');
  } else {
    if(!confirm('¿Congelar el período '+mes+'? No se podrán hacer modificaciones en las grillas hasta que lo descongeles.')) return;
    DB.lqsCongelado[mes] = true;
    toast('🔒 Período '+mes+' congelado — no se permiten modificaciones en las grillas.');
  }
  // Aplicar congelamiento a todas las grillas del período
  (DB.grillasLiq||[]).filter(g=>g.periodo===mes).forEach(g=>{
    g.estado = DB.lqsCongelado[mes] ? 'Cerrada' : 'Abierta';
  });
  renderLiquidaciones();
  renderGrillasLiq();
}


// ── Marcar/desmarcar individualmente ──
function marcarListoIndividual(periodo, nombre, estado){
  if(!DB.lqsListos[periodo]) DB.lqsListos[periodo]={};
  if(estado) DB.lqsListos[periodo][nombre]=true;
  else delete DB.lqsListos[periodo][nombre];
  renderLiquidaciones();
}

// ── Marcar/destildar todos (desde el header) ──
function marcarTodosListo(estado){
  const mes = $('lqs-mes-sel')?.value || new Date().toISOString().slice(0,7);
  if(!DB.lqsListos[mes]) DB.lqsListos[mes]={};
  const grillasDelMes=(DB.grillasLiq||[]).filter(g=>g.periodo===mes);
  const nombres=new Set();
  grillasDelMes.forEach(g=>(g.asociados||[]).forEach(a=>nombres.add(a.nombre)));
  (DB.liqAdminPersonal||[]).filter(p=>p.activo).forEach(p=>nombres.add(p.nombre));
  (DB.liqSuplemento||[]).filter(p=>p.activo).forEach(p=>nombres.add(p.nombre));
  if(estado) nombres.forEach(n=>{ DB.lqsListos[mes][n]=true; });
  else DB.lqsListos[mes]={};
  toast(estado?'✓ Todos marcados para pagar':'✕ Todos desmarcados');
  renderLiquidaciones();
}

// ── Autorizar pago (solo cuando el mes está congelado) ──
// Helper: obtener filas consolidadas del período (para autorizarPago)
function _getFilasConsolidadas(mes){
  const filas=[];
  const grillasDelMes=(DB.grillasLiq||[]).filter(g=>g.periodo===mes);
  grillasDelMes.forEach(grilla=>{
    (grilla.asociados||[]).forEach(asoc=>{
      let hs=0;
      getDiasDelMes(mes).forEach(d=>{const h=parseFloat(asoc.horas?.[d.iso]||0);if(h>0)hs+=h;});
      const vh=getCategoriaVH(asoc.categoria||'');
      const bruto=Math.round(hs*vh);
      const desc=DB.lqsDescuentos?.[mes]?.[asoc.nombre]||{};
      const totalDesc=Object.values(desc).reduce((s,v)=>s+parseFloat(v||0),0);
      const presentismo=Math.round(bruto*0.03);
      const neto=Math.round(bruto+presentismo-totalDesc);
      const existing=filas.find(f=>f.nombre===asoc.nombre);
      if(existing){existing.bruto+=bruto;existing.neto=Math.round(existing.bruto+presentismo-totalDesc);}
      else filas.push({nombre:asoc.nombre,bruto,neto});
    });
  });
  (DB.liqAdminPersonal||[]).filter(p=>p.activo).forEach(p=>{
    const val=getValoresPeriodo(DB.liqAdminValores,p.id,mes,{horasFijas:p.horasFijas||200,valorHora:p.valorHora||0});
    const bruto=Math.round((val.horasFijas||0)*(val.valorHora||0));
    const desc=DB.lqsDescuentos?.[mes]?.[p.nombre]||{};
    const totalDesc=Object.values(desc).reduce((s,v)=>s+parseFloat(v||0),0);
    const neto=Math.round(bruto*1.03-totalDesc);
    const existing=filas.find(f=>f.nombre===p.nombre);
    if(existing){existing.bruto+=bruto;existing.neto+=neto;}
    else filas.push({nombre:p.nombre,bruto,neto});
  });
  (DB.liqSuplemento||[]).filter(p=>p.activo).forEach(p=>{
    const val=getValoresPeriodo(DB.liqSuplementoValores,p.id,mes,{horasFijas:p.horasFijas||0,valorHora:p.valorHora||0});
    const bruto=Math.round((val.horasFijas||0)*(val.valorHora||0));
    const existing=filas.find(f=>f.nombre===p.nombre);
    if(existing){existing.bruto+=bruto;existing.neto+=bruto;}
    else filas.push({nombre:p.nombre,bruto,neto:bruto});
  });
  (DB.retenes||[]).filter(r=>r.activo).forEach(r=>{
    const diasR=getDiasDelMes(mes);
    const HS_MINIMO=200;
    let hsReales=0,rechazos=0;
    diasR.forEach(d=>{
      const v=DB.retenHoras?.[mes]?.[r.id]?.[d.iso];
      const h=parseFloat(v?.hs||0);if(h>0)hsReales+=h;
      if(String(v?.hs||'').toUpperCase()==='AI')rechazos++;
    });
    const hsCobrar=Math.max(hsReales,HS_MINIMO-rechazos*8);
    const bruto=Math.round(hsCobrar*getCategoriaVH(r.categoriBase||''));
    const desc=DB.lqsDescuentos?.[mes]?.[r.nombre]||{};
    const totalDesc=Object.values(desc).reduce((s,v)=>s+parseFloat(v||0),0);
    const neto=Math.round(bruto*1.03-totalDesc);
    const existing=filas.find(f=>f.nombre===r.nombre);
    if(existing){existing.bruto+=bruto;existing.neto+=neto;}
    else filas.push({nombre:r.nombre,bruto,neto});
  });
  // Mantenimiento
  (DB.mantPersonal||[]).filter(r=>r.activo).forEach(r=>{
    const diasM=getDiasDelMes(mes);
    const HS_MINIMO=200;
    let hsReales=0,rechazos=0;
    diasM.forEach(d=>{
      const v=DB.mantHoras?.[mes]?.[r.id]?.[d.iso];
      const h=parseFloat(v?.hs||0);if(h>0)hsReales+=h;
      if(String(v?.hs||'').toUpperCase()==='AI')rechazos++;
    });
    const hsCobrar=Math.max(hsReales,HS_MINIMO-rechazos*8);
    const bruto=Math.round(hsCobrar*getCategoriaVH(r.categoriBase||''));
    const desc=DB.lqsDescuentos?.[mes]?.[r.nombre]||{};
    const totalDesc=Object.values(desc).reduce((s,v)=>s+parseFloat(v||0),0);
    const neto=Math.round(bruto*1.03-totalDesc);
    const existing=filas.find(f=>f.nombre===r.nombre);
    if(existing){existing.bruto+=bruto;existing.neto+=neto;}
    else filas.push({nombre:r.nombre,bruto,neto});
  });
  return filas;
}


function autorizarPago(){
  const mes = $('lqs-mes-sel')?.value || new Date().toISOString().slice(0,7);
  if(!DB.lqsCongelado?.[mes]){
    toast('⚠️ El mes debe estar congelado antes de autorizar el pago');
    return;
  }
  const listos = Object.entries(DB.lqsListos?.[mes]||{}).filter(([n,v])=>v&&!DB.lqsPagos?.[mes]?.[n]?.pagado);
  if(!listos.length){ toast('No hay asociados marcados como listos para pagar'); return; }

  // Calcular total para la confirmación
  const filas = _getFilasConsolidadas(mes);
  const totalNeto = listos.reduce((s,[nombre])=>{
    const f=filas.find(x=>x.nombre===nombre);
    return s+(f?.neto||0);
  },0);

  if(!confirm('💰 Autorizar pago de '+listos.length+' asociados por $'+totalNeto.toLocaleString('es-AR')+'\n\nEsta acción es definitiva para este período.')) return;

  if(!DB.lqsPagos[mes]) DB.lqsPagos[mes]={};
  const fecha=new Date().toLocaleDateString('es-AR');
  const autorizadoPor=currentUser?.nombre||'Admin';
  listos.forEach(([nombre])=>{
    const f=filas.find(x=>x.nombre===nombre);
    const monto = Math.round(f?.neto||0);
    DB.lqsPagos[mes][nombre]={pagado:true, monto, fecha, registradoPor:autorizadoPor};
    // Limpiar el estado "listo" una vez pagado
    if(DB.lqsListos[mes]) delete DB.lqsListos[mes][nombre];
    // ── Registrar en cuenta corriente del asociado ──
    if(!DB.cuentaCorriente[nombre]) DB.cuentaCorriente[nombre]=[];
    DB.cuentaCorriente[nombre].push({
      fecha,
      tipo: 'Haber',
      concepto: 'Liquidación de sueldo — '+new Date(mes+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'}),
      monto,
      periodo: mes,
      registradoPor: autorizadoPor,
      estado: 'Acreditado',
    });
  });
  toast('💰 Pago autorizado — '+listos.length+' asociados · $'+totalNeto.toLocaleString('es-AR'));
  renderLiquidaciones();
}

function setDescuentoLqs(mes, nombre, campo, valor){
  if(!DB.lqsDescuentos[mes]) DB.lqsDescuentos[mes]={};
  if(!DB.lqsDescuentos[mes][nombre]) DB.lqsDescuentos[mes][nombre]={};
  DB.lqsDescuentos[mes][nombre][campo] = parseFloat(valor)||0;
  renderLiquidaciones();
}

function verDetalleLqs(nombre, mes){
  // Recolectar todas las fuentes de este asociado en este período
  const detalles = [];

  // 1. Grillas de servicios
  const grillasDelMes = (DB.grillasLiq||[]).filter(g=>g.periodo===mes);
  grillasDelMes.forEach(grilla=>{
    const asoc = (grilla.asociados||[]).find(a=>a.nombre===nombre);
    if(!asoc) return;
    const dias = getDiasDelMes(mes);
    let hs=0;
    dias.forEach(d=>{const h=parseFloat(asoc.horas?.[d.iso]||0);if(h>0)hs+=h;});
    detalles.push({
      fuente: 'Servicio',
      descripcion: grilla.nombre||grilla.objCodigo,
      categoria: asoc.categoria||'—',
      hs: Math.round(hs*10)/10,
      valorHora: getCategoriaVH(asoc.categoria||''),
      bruto: Math.round(hs * getCategoriaVH(asoc.categoria||'')),
    });
  });

  // 2. Planilla Administración
  const pAdmin = (DB.liqAdminPersonal||[]).find(p=>p.nombre===nombre&&p.activo);
  if(pAdmin){
    const val = getValoresPeriodo(DB.liqAdminValores, pAdmin.id, mes, {horasFijas:pAdmin.horasFijas||200, valorHora:pAdmin.valorHora||0});
    const horasP = DB.liqAdminHoras?.[mes]?.[pAdmin.id]||{};
    let hsReg=0;
    getDiasDelMes(mes).forEach(d=>{const h=parseFloat(horasP[d.iso]||0);if(h>0)hsReg+=h;});
    detalles.push({
      fuente: 'Administración',
      descripcion: pAdmin.area||'Administración',
      categoria: pAdmin.categoria||'—',
      hs: hsReg,
      horasFijas: val.horasFijas,
      valorHora: val.valorHora,
      bruto: Math.round(val.horasFijas * val.valorHora),
    });
  }

  // 3. Suplementos
  const suplementos = (DB.liqSuplemento||[]).filter(p=>p.nombre===nombre&&p.activo);
  suplementos.forEach(p=>{
    const val = getValoresPeriodo(DB.liqSuplementoValores, p.id, mes, {horasFijas:p.horasFijas||0, valorHora:p.valorHora||0});
    detalles.push({
      fuente: 'Suplemento',
      descripcion: p.funcionExtra||'Función extra',
      categoria: p.area||'—',
      hs: val.horasFijas,
      valorHora: val.valorHora,
      bruto: Math.round(val.horasFijas * val.valorHora),
    });
  });

  // 4. Retenes
  const reten = (DB.retenes||[]).find(r=>r.nombre===nombre&&r.activo);
  if(reten){
    const dias = getDiasDelMes(mes);
    const HS_MINIMO = 200;
    let hsReales=0, rechazos=0;
    dias.forEach(d=>{
      const v = DB.retenHoras?.[mes]?.[reten.id]?.[d.iso];
      const h = parseFloat(v?.hs||0);
      if(h>0) hsReales+=h;
      if(String(v?.hs||'').toUpperCase()==='AI') rechazos++;
    });
    const descRechazos = rechazos*8;
    const hsCobrar = Math.max(hsReales, HS_MINIMO - descRechazos);
    const vh = getCategoriaVH(reten.categoriBase||'');
    detalles.push({
      fuente: 'Retén',
      descripcion: 'Disponibilidad + coberturas',
      categoria: reten.categoriBase||'—',
      hs: hsCobrar,
      hsReales,
      rechazos,
      valorHora: vh,
      bruto: Math.round(hsCobrar * vh),
      horasFijas: HS_MINIMO,
    });
  }

  if(!detalles.length){ toast('Sin detalle disponible para '+nombre); return; }

  // Construir el modal
  const fuenteIcon = {Servicio:'🏢',Administración:'👔',Suplemento:'➕','Retén':'🔄','Mantenimiento':'🔧'};
  const fuenteColor2 = {Servicio:'#1e40af',Administración:'#065f46',Suplemento:'#7c3aed','Retén':'#0369a1','Mantenimiento':'#0369a1'};
  const totalBruto = detalles.reduce((s,d)=>s+d.bruto,0);

  const detalleHTML = detalles.map((d,di)=>{
    // Solo los servicios son clickeables para ver la grilla de días
    const esServicio = d.fuente === 'Servicio';
    const esReten = d.fuente === 'Retén';
    const esMant = d.fuente === 'Mantenimiento';
    const esClickeable = esServicio || esReten || esMant;
    const clickStyle = esClickeable ? 'cursor:pointer;' : '';
    const clickHandler = esMant ? `onclick="verGrillaMantDetalle('${nombre}','${mes}')"` : esReten ? `onclick="verGrillaRetenDetalle('${nombre}','${mes}')"` : esServicio ? `onclick="verGrillaServicioDetalle('${nombre}','${mes}','${d.descripcion.replace(/'/g,"\\'")}',${di})"` : '';
    const hint = esClickeable ? '<span style="font-size:10px;color:#93c5fd;margin-left:6px;">👁 Ver grilla de días</span>' : '';
    return `
    <div style="background:#f8f9fd;border:1px solid var(--borde);border-radius:10px;padding:14px 16px;margin-bottom:10px;${clickStyle}"
         ${clickHandler}
>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:18px;">${fuenteIcon[d.fuente]||'📋'}</span>
        <div>
          <div style="font-weight:700;font-size:14px;color:${fuenteColor2[d.fuente]||'#374151'};">${d.fuente}${hint}</div>
          <div style="font-size:12px;color:var(--texto-suave);">${d.descripcion}</div>
        </div>
        <div style="margin-left:auto;font-size:18px;font-weight:800;color:${fuenteColor2[d.fuente]||'#374151'};">
          $${d.bruto.toLocaleString('es-AR')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;">
        <div style="background:white;border-radius:6px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Categoría</div>
          <div style="font-weight:600;margin-top:2px;">${d.categoria}</div>
        </div>
        <div style="background:white;border-radius:6px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">${d.horasFijas!==undefined?'Hs fijas':'Hs registradas'}</div>
          <div style="font-weight:600;color:var(--azul);margin-top:2px;">${d.horasFijas!==undefined?d.horasFijas:d.hs}hs</div>
        </div>
        <div style="background:white;border-radius:6px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Valor/hora</div>
          <div style="font-weight:600;color:var(--verde);margin-top:2px;">$${(d.valorHora||0).toLocaleString('es-AR')}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Calcular descuentos del período para esta persona
  const desc = (DB.lqsDescuentos?.[mes]?.[nombre]) || {};
  const descItems = [
    {label:'Uniforme',      val:desc.uniforme     ||0, color:'#b91c1c'},
    {label:'Sanciones',     val:desc.sanciones    ||0, color:'#b91c1c'},
    {label:'Ret. Conflicto',val:desc.retConflicto ||0, color:'#6d28d9'},
    {label:'Ret. Enfermedad',val:desc.retEnfermedad||0, color:'#6d28d9'},
    {label:'Monotributo',   val:desc.monotributo  ||0, color:'#6b7280'},
    {label:'Adelantos',     val:desc.adelantos    ||0, color:'#6b7280'},
  ].filter(d=>d.val>0);

  const totalDesc = descItems.reduce((s,d)=>s+d.val,0);
  const neto = totalBruto - totalDesc;

  // Presentismo (3% si no tuvo AI)
  const tieneAI = detalles.some(d=>{
    if(d.fuente!=='Servicio') return false;
    const grilla=(DB.grillasLiq||[]).find(g=>g.periodo===mes&&(g.nombre===d.descripcion||g.objCodigo===d.descripcion));
    const asoc=(grilla?.asociados||[]).find(a=>a.nombre===nombre);
    return getDiasDelMes(mes).some(dia=>String(asoc?.horas?.[dia.iso]||'').toUpperCase()==='AI');
  });
  const presentismo = tieneAI ? 0 : Math.round(totalBruto * 0.03);

  // HTML de descuentos
  const descHTML = descItems.length > 0 ? `
    <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
      <div style="font-weight:600;font-size:12px;color:var(--rojo);margin-bottom:8px;">Descuentos y retenciones</div>
      ${descItems.map(d=>`
        </div>`).join('')}
    </div>` : '<div style="font-size:12px;color:var(--texto-suave);padding:8px 0;">Sin descuentos ni retenciones para este período.</div>';

  const descHTMLpresentismo = presentismo > 0 ? `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 16px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:var(--verde);font-weight:600;">+ Presentismo (3%)</span>
        <span style="font-weight:700;color:var(--verde);">+ $${presentismo.toLocaleString('es-AR')}</span>
      </div>
    </div>` : '';

  // Actualizar el modal de detalle
  const el = $('modal-detalle-lqs');
  if(el){
    $('det-lqs-nombre').textContent = nombre;
    $('det-lqs-periodo').textContent = new Date(mes+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
    $('det-lqs-body').innerHTML = detalleHTML;
    $('det-lqs-descuentos').innerHTML = descHTMLpresentismo + descHTML;
    $('det-lqs-total').textContent = '$'+(totalBruto+presentismo).toLocaleString('es-AR');
    $('det-lqs-desc').textContent = totalDesc > 0 ? '- $'+totalDesc.toLocaleString('es-AR') : '—';
    $('det-lqs-neto').textContent = '$'+(neto+presentismo).toLocaleString('es-AR');
    abrirModal('modal-detalle-lqs');
  }
}

function exportarLiquidacion(){
  toast('Exportación a Excel/PDF — próximamente disponible');
}


// ══════════════════════════════════════════════════════════
// MÓDULO RETENES
// ══════════════════════════════════════════════════════════

let _retTabActual = 'planilla';


// ── Carga rápida para retenes ──
let _crrPendiente = null; // {mes, retenId, nombre}

function abrirCargaRapidaReten(mes, retenId, nombre){
  _crrPendiente = {mes, retenId, nombre};
  if($('crr-nombre')) $('crr-nombre').textContent = nombre;

  // Setear fechas del mes
  const [y,m] = mes.split('-');
  const primerDia = mes+'-01';
  const ultimoDia = new Date(parseInt(y), parseInt(m), 0).toISOString().slice(0,10);
  if($('crr-desde')) $('crr-desde').value = primerDia;
  if($('crr-hasta')) $('crr-hasta').value = ultimoDia;
  if($('crr-horas')) $('crr-horas').value = '8';

  // Checkboxes días en true por defecto
  ['lunes','martes','miercoles','jueves','viernes'].forEach(d=>{
    const el=$('crr-'+d); if(el) el.checked=true;
  });
  ['sabados','domingos','feriados'].forEach(d=>{
    const el=$('crr-'+d); if(el) el.checked=false;
  });

  // Poblar select de categoría alternativa
  const selCat = $('crr-cat-alt');
  if(selCat){
    const cats = (DB.categoriasSind||[]).map(c=>c.nombre).filter(Boolean);
    selCat.innerHTML = '<option value="">— Sin alternativa (usa categoría base) —</option>' +
      cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }

  abrirModal('modal-carga-rapida-reten');
}

function confirmarCargaRapidaReten(){
  if(!_crrPendiente) return;
  const {mes, retenId, nombre} = _crrPendiente;

  const desde     = $('crr-desde')?.value;
  const hasta     = $('crr-hasta')?.value;
  const horas     = parseFloat($('crr-horas')?.value)||8;
  const lunes     = $('crr-lunes')?.checked !== false;
  const martes    = $('crr-martes')?.checked !== false;
  const miercoles = $('crr-miercoles')?.checked !== false;
  const jueves    = $('crr-jueves')?.checked !== false;
  const viernes   = $('crr-viernes')?.checked !== false;
  const sabados   = $('crr-sabados')?.checked || false;
  const domingos  = $('crr-domingos')?.checked || false;
  const inclFeriados = $('crr-feriados')?.checked || false;
  const catAlt    = $('crr-cat-alt')?.value || '';

  if(!desde||!hasta){toast('Completá las fechas');return;}
  if(horas<=0){toast('Ingresá las horas por día');return;}

  const diasActivos = [
    domingos?0:-1, lunes?1:-1, martes?2:-1, miercoles?3:-1,
    jueves?4:-1, viernes?5:-1, sabados?6:-1
  ].filter(d=>d>=0);

  if(!diasActivos.length){toast('Seleccioná al menos un día');return;}

  if(!DB.retenHoras[mes]) DB.retenHoras[mes]={};
  if(!DB.retenHoras[mes][retenId]) DB.retenHoras[mes][retenId]={};

  const feriados = (DB.feriados||[]).map(f=>f.fecha);
  const d1 = new Date(desde+'T12:00:00');
  const d2 = new Date(hasta+'T12:00:00');
  let count = 0;

  for(let d=new Date(d1); d<=d2; d.setDate(d.getDate()+1)){
    const iso = d.toISOString().slice(0,10);
    const dow = d.getDay();
    const esFeriado = feriados.includes(iso);
    if(esFeriado && !inclFeriados) continue;
    if(!diasActivos.includes(dow)) continue;
    DB.retenHoras[mes][retenId][iso] = {hs: horas, catAlt};
    count++;
  }

  syncPeriodoReten(mes, retenId);
  cerrarModal('modal-carga-rapida-reten');
  toast('⚡ '+count+' días cargados para '+nombre+(catAlt?' (cat. alternativa: '+catAlt+')':''));
  renderRetenes();
}


// ══════════════════════════════════════════════════════════
// MÓDULO MANTENIMIENTO
// ══════════════════════════════════════════════════════════

let _mantTabActual = 'planilla';

function tabMantenimiento(tab, btn){
  document.querySelectorAll('#screen-mantenimiento .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-mantenimiento .tab-btn').forEach(b=>b.classList.remove('active'));
  const el = $('mant-tab-'+tab); if(el) el.classList.add('active');
  if(btn) btn.classList.add('active');
  _mantTabActual = tab;
  if(tab==='planilla') renderMantenimiento();
  if(tab==='resumen')  renderMantResumen();
}

function renderMantenimiento(){
  // Asegurar que el tab activo esté visible
  const tabActivo = $('mant-tab-'+(_mantTabActual||'planilla'));
  if(tabActivo && !tabActivo.classList.contains('active')){
    tabActivo.classList.add('active');
    document.querySelectorAll('#screen-mantenimiento .tab-btn').forEach((b,i)=>{
      if(i===0&&(_mantTabActual||'planilla')==='planilla') b.classList.add('active');
      if(i===1&&_mantTabActual==='resumen') b.classList.add('active');
    });
  }
  const sel = $('mant-mes-sel');
  if(sel && !sel.options.length){
    const hoy = new Date();
    for(let i=-2;i<=3;i++){
      const d = new Date(hoy.getFullYear(), hoy.getMonth()+i, 1);
      const val = d.toISOString().slice(0,7);
      const label = d.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
      const opt = document.createElement('option');
      opt.value=val; opt.textContent=label;
      if(i===0) opt.selected=true;
      sel.appendChild(opt);
    }
  }
  const mes = $('mant-mes-sel')?.value || new Date().toISOString().slice(0,7);
  if(!DB.mantHoras[mes]) DB.mantHoras[mes]={};
  const personal = (DB.mantPersonal||[]).filter(r=>r.activo);
  const dias = getDiasDelMes(mes);
  const dN = ['D','L','M','X','J','V','S'];
  const HS_MINIMO = 200;

  let totalHs=0, cobranMinimo=0, rechazos=0;
  personal.forEach(r=>{
    let hsR=0;
    dias.forEach(d=>{
      const v = DB.mantHoras[mes][r.id]?.[d.iso];
      const h = parseFloat(v?.hs||0);
      if(h>0) hsR+=h;
      if(String(v?.hs||'').toUpperCase()==='AI') rechazos++;
    });
    totalHs+=hsR;
    if(hsR<HS_MINIMO) cobranMinimo++;
  });
  if($('st-mant-total'))   $('st-mant-total').textContent   = personal.length;
  if($('st-mant-hs'))      $('st-mant-hs').textContent      = totalHs+'hs';
  if($('st-mant-minimo'))  $('st-mant-minimo').textContent  = cobranMinimo;
  if($('st-mant-rechazos'))$('st-mant-rechazos').textContent= rechazos;

  const thead = $('thead-mant');
  const tbody = $('tbody-mant');
  if(!thead||!tbody) return;
  const cats = (DB.categoriasSind||[]).map(c=>c.nombre).filter(Boolean);

  thead.innerHTML = `<tr style="background:#374151;color:white;">
    <th style="padding:8px 14px;border:1px solid #6b7280;text-align:left;min-width:180px;position:sticky;left:0;background:#374151;z-index:3;">Técnico</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:180px;">Categoría base</th>
    ${dias.map(dia=>{
      const dow=new Date(dia.iso+'T12:00:00').getDay();
      const bg=dia.esFeriado?'background:#ffe4e6;color:#111;font-weight:800;':dia.esFinde?'background:#ffff00;color:#111;font-weight:700;':'';
      return`<th style="padding:4px 2px;border:1px solid #6b7280;text-align:center;min-width:32px;font-size:10px;${bg}">
        <div style="font-weight:800;">${dN[dow]}</div>
        <div>${dia.d}</div>
      </th>`;
    }).join('')}
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:70px;">Hs reales</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:75px;">Hs a cobrar</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:80px;">Valor/h</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:110px;background:#065f46;color:white;">Total a pagar</th>
  </tr>`;

  if(!personal.length){
    tbody.innerHTML=`<tr><td colspan="100" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      Sin técnicos activos. Usá el botón "+ Nuevo técnico".
    </td></tr>`;
    return;
  }

  tbody.innerHTML = personal.map(r=>{
    if(!DB.mantHoras[mes][r.id]) DB.mantHoras[mes][r.id]={};
    let hsReales=0, diasRechazados=0;
    const celdas = dias.map(dia=>{
      const celda = DB.mantHoras[mes][r.id][dia.iso]||{};
      const rawHs = celda.hs||'';
      const catAlt = celda.catAlt||'';
      const esEsp = ['F','AJ','AI'].includes(String(rawHs).toUpperCase());
      const h = esEsp?0:parseFloat(rawHs||0);
      if(h>0) hsReales+=h;
      if(String(rawHs).toUpperCase()==='AI') diasRechazados++;
      const dispVal = esEsp?String(rawHs).toUpperCase():(h||'');
      const dow = new Date(dia.iso+'T12:00:00').getDay();
      const bgCell = dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#fefce8;':'';
      const colorVal = esEsp&&String(rawHs).toUpperCase()==='F'?'color:#7c3aed;font-weight:700'
        :esEsp&&String(rawHs).toUpperCase()==='AJ'?'color:#d97706;font-weight:700'
        :esEsp?'color:#dc2626;font-weight:700'
        :catAlt?'color:#7c3aed;font-weight:600'
        :h>0?'color:#1d4ed8;font-weight:600':'color:#d1d5db';
      return`<td style="border:1px solid var(--borde);${bgCell}padding:1px;">
        <div style="display:flex;flex-direction:column;align-items:center;">
          <input type="text" value="${dispVal}"
            style="width:28px;${colorVal};border:none;background:transparent;text-align:center;font-size:11px;outline:none;padding:1px 0;text-transform:uppercase;"
            onchange="setHoraMant('${mes}',${r.id},'${dia.iso}',this.value)">
          ${catAlt?`<span style="font-size:8px;color:#7c3aed;line-height:1;">${catAlt.substring(0,4)}</span>`:''}
        </div>
      </td>`;
    }).join('');
    const hsCobrar = Math.max(hsReales, HS_MINIMO - diasRechazados*8);
    const vh = getCategoriaVH(r.categoriBase||'');
    const total = Math.round(hsCobrar * vh);
    return`<tr>
      <td style="padding:5px 12px;border:1px solid var(--borde);font-size:12px;font-weight:500;position:sticky;left:0;background:white;z-index:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <div>
            ${r.nombre}
            ${diasRechazados>0?`<span style="font-size:9px;background:#fee2e2;color:#dc2626;border-radius:4px;padding:1px 4px;margin-left:4px;">${diasRechazados} rechazo${diasRechazados>1?'s':''}</span>`:''}
          </div>
          <button title="Carga rápida" onclick="event.stopPropagation();abrirCargaRapidaMant('${mes}',${r.id},'${r.nombre}')"
            style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;white-space:nowrap;">⚡ Rápido</button>
        </div>
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);">
        <select style="font-size:11px;padding:2px;border:1px solid var(--borde-fuerte);border-radius:4px;width:100%;"
          onchange="setCatBaseMant(${r.id},this.value)">
          ${cats.map(c=>`<option value="${c}" ${c===r.categoriBase?'selected':''}>${c}</option>`).join('')}
        </select>
      </td>
      ${celdas}
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:${hsReales>=HS_MINIMO?'var(--verde)':'var(--naranja)'};">${hsReales}hs</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:#1d4ed8;">
        ${hsCobrar}hs${hsReales<HS_MINIMO?`<div style="font-size:9px;color:var(--naranja);">mín. garantizado</div>`:''}
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;">$${vh.toLocaleString('es-AR')}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:white;background:#065f46;">$${total.toLocaleString('es-AR')}</td>
    </tr>`;
  }).join('');
}

function syncPeriodoMant(mes, id){
  supaSync('mantHorasRows', {
    id:idPersonaPeriodo(id,mes), personaIdLocal:idLocalTrunc(id), periodo:mes,
    horas: DB.mantHoras?.[mes]?.[id]||{},
  });
}
function setHoraMant(mes, id, fechaISO, valor){
  if(!DB.mantHoras[mes]) DB.mantHoras[mes]={};
  if(!DB.mantHoras[mes][id]) DB.mantHoras[mes][id]={};
  const valStr=(valor||'').toString().trim().toUpperCase();
  const esEsp=['F','AJ','AI'].includes(valStr);
  DB.mantHoras[mes][id][fechaISO]={hs:esEsp?valStr:(parseFloat(valor)||0),catAlt:DB.mantHoras[mes][id][fechaISO]?.catAlt||''};
  syncPeriodoMant(mes, id);
  renderMantenimiento();
}

function setCatBaseMant(id, cat){
  const r=(DB.mantPersonal||[]).find(x=>x.id===id);
  if(r){r.categoriBase=cat;supaSync('mantPersonal', r);renderMantenimiento();}
}

function renderMantResumen(){
  const mes = $('mant-mes-sel')?.value || new Date().toISOString().slice(0,7);
  const personal = (DB.mantPersonal||[]).filter(r=>r.activo);
  const dias = getDiasDelMes(mes);
  const HS_MINIMO=200;
  const thead=$('thead-mant-resumen');
  const tbody=$('tbody-mant-resumen');
  if(!thead||!tbody) return;
  thead.innerHTML=`<tr style="background:#374151;color:white;">
    <th style="padding:8px 14px;border:1px solid #6b7280;text-align:left;">Técnico</th>
    <th style="padding:8px;border:1px solid #6b7280;">Categoría base</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Hs reales</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Rechazos</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Desc. rechazos</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Hs a cobrar</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Valor/h</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;background:#065f46;color:white;">Total a pagar</th>
  </tr>`;
  let grandTotal=0;
  tbody.innerHTML=personal.map(r=>{
    let hsReales=0,rechazos=0;
    dias.forEach(d=>{
      const v=DB.mantHoras[mes]?.[r.id]?.[d.iso];
      const h=parseFloat(v?.hs||0);if(h>0)hsReales+=h;
      if(String(v?.hs||'').toUpperCase()==='AI')rechazos++;
    });
    const descRechazos=rechazos*8;
    const hsCobrar=Math.max(hsReales,HS_MINIMO-descRechazos);
    const vh=getCategoriaVH(r.categoriBase||'');
    const total=Math.round(hsCobrar*vh);
    grandTotal+=total;
    const cobrandoMinimo=hsReales<HS_MINIMO;
    return`<tr>
      <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${r.nombre}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.categoriBase||'—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:${cobrandoMinimo?'var(--naranja)':'var(--verde)'};">${hsReales}hs</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:${rechazos>0?'var(--rojo)':'var(--texto-suave)'};">${rechazos>0?rechazos+'d':'—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:var(--rojo);">${descRechazos>0?'-'+descRechazos+'hs':'—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:#1d4ed8;">${hsCobrar}hs ${cobrandoMinimo?'<span style="font-size:9px;color:var(--naranja);">(mín)</span>':''}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">$${vh.toLocaleString('es-AR')}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:white;background:#065f46;">$${total.toLocaleString('es-AR')}</td>
    </tr>`;
  }).join('')+`<tr style="background:#f0fdf4;font-weight:800;">
    <td colspan="7" style="padding:8px 14px;border:1px solid var(--borde);text-align:right;font-size:13px;">TOTAL DEL MES</td>
    <td style="padding:8px 14px;border:1px solid var(--borde);text-align:right;font-size:15px;color:white;background:#065f46;">$${grandTotal.toLocaleString('es-AR')}</td>
  </tr>`;
}

function abrirModalNuevoMant(){
  if($('nmant-nombre')) $('nmant-nombre').value='';
  if($('nmant-nro'))    $('nmant-nro').value='';
  const selCat=$('nmant-cat-base');
  if(selCat){
    const cats=(DB.categoriasSind||[]).map(c=>c.nombre).filter(Boolean);
    selCat.innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }
  const dl=$('dl-nmant-nombre');
  if(dl) dl.innerHTML=(DB.legajos||[]).filter(l=>l.estado==='Activo')
    .map(l=>`<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
  abrirModal('modal-nuevo-mant');
}

function confirmarNuevoMant(){
  const nombre=$('nmant-nombre')?.value.trim();
  const nro=$('nmant-nro')?.value.trim();
  const cat=$('nmant-cat-base')?.value;
  if(!nombre){toast('Ingresá el nombre');return;}
  const yaExiste=(DB.mantPersonal||[]).find(r=>r.nombre===nombre&&r.activo);
  if(yaExiste){toast('Este técnico ya está activo');return;}
  const nuevo={id:Date.now(),nombre,nroSocio:nro,categoriBase:cat||'Operario/a limpieza especializado/a',activo:true};
  DB.mantPersonal.push(nuevo);
  supaSync('mantPersonal', nuevo);
  cerrarModal('modal-nuevo-mant');
  toast('✅ Técnico agregado — '+nombre);
  renderMantenimiento();
}

let _cmantPendiente = null;
function abrirCargaRapidaMant(mes, id, nombre){
  _cmantPendiente={mes,id,nombre};
  if($('cmant-nombre')) $('cmant-nombre').textContent=nombre;
  const [y,m]=mes.split('-');
  if($('cmant-desde')) $('cmant-desde').value=mes+'-01';
  if($('cmant-hasta')) $('cmant-hasta').value=new Date(parseInt(y),parseInt(m),0).toISOString().slice(0,10);
  if($('cmant-horas')) $('cmant-horas').value='8';
  ['lunes','martes','miercoles','jueves','viernes'].forEach(d=>{const el=$('cmant-'+d);if(el)el.checked=true;});
  ['sabados','domingos','feriados'].forEach(d=>{const el=$('cmant-'+d);if(el)el.checked=false;});
  const selCat=$('cmant-cat-alt');
  if(selCat){
    const cats=(DB.categoriasSind||[]).map(c=>c.nombre).filter(Boolean);
    selCat.innerHTML='<option value="">— Sin alternativa (usa categoría base) —</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }
  abrirModal('modal-carga-rapida-mant');
}

function confirmarCargaRapidaMant(){
  if(!_cmantPendiente) return;
  const {mes,id,nombre}=_cmantPendiente;
  const desde=$('cmant-desde')?.value;
  const hasta=$('cmant-hasta')?.value;
  const horas=parseFloat($('cmant-horas')?.value)||8;
  const diasActivos=[
    $('cmant-domingos')?.checked?0:-1,$('cmant-lunes')?.checked!==false?1:-1,
    $('cmant-martes')?.checked!==false?2:-1,$('cmant-miercoles')?.checked!==false?3:-1,
    $('cmant-jueves')?.checked!==false?4:-1,$('cmant-viernes')?.checked!==false?5:-1,
    $('cmant-sabados')?.checked?6:-1
  ].filter(d=>d>=0);
  const catAlt=$('cmant-cat-alt')?.value||'';
  if(!desde||!hasta){toast('Completá las fechas');return;}
  if(!diasActivos.length){toast('Seleccioná al menos un día');return;}
  if(!DB.mantHoras[mes]) DB.mantHoras[mes]={};
  if(!DB.mantHoras[mes][id]) DB.mantHoras[mes][id]={};
  const feriados=(DB.feriados||[]).map(f=>f.fecha);
  const d1=new Date(desde+'T12:00:00');
  const d2=new Date(hasta+'T12:00:00');
  let count=0;
  for(let d=new Date(d1);d<=d2;d.setDate(d.getDate()+1)){
    const iso=d.toISOString().slice(0,10);
    const dow=d.getDay();
    if(feriados.includes(iso)&&!$('cmant-feriados')?.checked) continue;
    if(!diasActivos.includes(dow)) continue;
    DB.mantHoras[mes][id][iso]={hs:horas,catAlt};
    count++;
  }
  syncPeriodoMant(mes, id);
  cerrarModal('modal-carga-rapida-mant');
  toast('⚡ '+count+' días cargados para '+nombre);
  renderMantenimiento();
}

// ── Grilla de días de mantenimiento desde liquidaciones ──
function verGrillaMantDetalle(nombre, mes){
  const tecnico=(DB.mantPersonal||[]).find(r=>r.nombre===nombre&&r.activo);
  if(!tecnico){toast('No se encontró el técnico '+nombre);return;}
  const dias=getDiasDelMes(mes);
  const dN=['D','L','M','X','J','V','S'];
  const HS_MINIMO=200;
  let hsReales=0,rechazos=0,totalMonto=0;
  const vh=getCategoriaVH(tecnico.categoriBase||'');

  const headerCols=dias.map(dia=>{
    const dow=new Date(dia.iso+'T12:00:00').getDay();
    const bg=dia.esFeriado?'background:#ffe4e6;color:#111;':dia.esFinde?'background:#ffff00;color:#111;':'';
    return`<th style="padding:4px 2px;border:1px solid #6b7280;text-align:center;min-width:34px;font-size:10px;${bg}">
      <div style="font-weight:800;">${dN[dow]}</div><div>${dia.d}</div></th>`;
  }).join('');

  const filaHoras=dias.map(dia=>{
    const celda=DB.mantHoras?.[mes]?.[tecnico.id]?.[dia.iso]||{};
    const rawHs=celda.hs||'';const catAlt=celda.catAlt||'';
    const esEsp=['F','AJ','AI'].includes(String(rawHs).toUpperCase());
    const h=esEsp?0:parseFloat(rawHs||0);
    const dispVal=esEsp?String(rawHs).toUpperCase():(h||'');
    if(h>0)hsReales+=h;
    if(String(rawHs).toUpperCase()==='AI')rechazos++;
    const dow=new Date(dia.iso+'T12:00:00').getDay();
    const bg=dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#fefce8;':'';
    const color=esEsp&&String(rawHs).toUpperCase()==='F'?'color:#7c3aed;font-weight:700'
      :esEsp&&String(rawHs).toUpperCase()==='AJ'?'color:#d97706;font-weight:700'
      :esEsp?'color:#dc2626;font-weight:700'
      :catAlt?'color:#7c3aed;font-weight:600':h>0?'color:#1d4ed8;font-weight:600':'color:#d1d5db';
    return`<td style="padding:4px 2px;border:1px solid #e5e7eb;text-align:center;font-size:12px;${bg}${color}">
      ${dispVal}${h>0&&!esEsp?'hs':''}
      ${catAlt?`<div style="font-size:8px;color:#7c3aed;">${catAlt.substring(0,4)}</div>`:''}
    </td>`;
  }).join('');

  const filaMonto=dias.map(dia=>{
    const celda=DB.mantHoras?.[mes]?.[tecnico.id]?.[dia.iso]||{};
    const rawHs=celda.hs||'';const catAlt=celda.catAlt||'';
    const esEsp=['F','AJ','AI'].includes(String(rawHs).toUpperCase());
    const h=esEsp?0:parseFloat(rawHs||0);
    const vhDia=catAlt?getCategoriaVH(catAlt):vh;
    const m=h>0?Math.round(h*vhDia):0;
    if(m>0)totalMonto+=m;
    const dow=new Date(dia.iso+'T12:00:00').getDay();
    const bg=dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#fefce8;':'';
    return`<td style="padding:4px 2px;border:1px solid #e5e7eb;text-align:center;font-size:10px;${bg}color:${m>0?'#065f46':'#d1d5db'};">
      ${m>0?'$'+m.toLocaleString('es-AR'):'—'}</td>`;
  }).join('');

  const descRechazos=rechazos*8;
  const hsCobrar=Math.max(hsReales,HS_MINIMO-descRechazos);
  const totalFinal=Math.round(hsCobrar*vh);

  const grillaHTML=`
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:700;color:#0369a1;">🔧 Planilla de mantenimiento — ${tecnico.categoriBase||'—'}</div>
        <div style="font-size:11px;color:var(--texto-suave);">$${vh.toLocaleString('es-AR')}/h base</div>
      </div>
      ${rechazos>0?`<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:8px 12px;font-size:12px;color:#dc2626;margin-bottom:8px;">
        ⚠️ <strong>${rechazos} rechazo${rechazos>1?'s':''}</strong> — descuento de ${descRechazos}hs del contrato</div>`:''}
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;font-size:12px;white-space:nowrap;">
          <thead><tr style="background:#374151;color:white;">
            <th style="padding:6px 10px;border:1px solid #6b7280;text-align:left;min-width:80px;position:sticky;left:0;background:#374151;z-index:2;">Concepto</th>
            ${headerCols}
            <th style="padding:6px 8px;border:1px solid #6b7280;min-width:80px;text-align:right;background:#1d4ed8;color:white;">Total</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style="padding:5px 10px;border:1px solid #e5e7eb;font-weight:600;font-size:11px;position:sticky;left:0;background:white;z-index:1;">Horas</td>
              ${filaHoras}
              <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700;color:#1d4ed8;">${hsReales}hs</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td style="padding:5px 10px;border:1px solid #e5e7eb;font-weight:600;font-size:11px;position:sticky;left:0;background:#f9fafb;z-index:1;">Monto</td>
              ${filaMonto}
              <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700;color:#065f46;">$${totalMonto.toLocaleString('es-AR')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;font-size:12px;">
        <div style="background:#eff6ff;border-radius:8px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Hs reales</div>
          <div style="font-weight:700;color:#1d4ed8;">${hsReales}hs</div>
        </div>
        <div style="background:#${hsReales<HS_MINIMO?'fef3c7':'f0fdf4'};border-radius:8px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Hs a cobrar</div>
          <div style="font-weight:700;color:#${hsReales<HS_MINIMO?'92400e':'065f46'};">${hsCobrar}hs ${hsReales<HS_MINIMO?'(mín)':''}</div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:8px;text-align:center;">
          <div style="color:var(--texto-suave);font-size:10px;">Total a pagar</div>
          <div style="font-weight:700;color:#065f46;">$${totalFinal.toLocaleString('es-AR')}</div>
        </div>
      </div>
    </div>`;

  $('det-grilla-titulo').textContent = nombre + ' — Mantenimiento';
  $('det-grilla-periodo').textContent = new Date(mes+'-02').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  $('det-grilla-body').innerHTML = grillaHTML;
  abrirModal('modal-detalle-grilla-lqs');
}

function tabRetenes(tab, btn){
  document.querySelectorAll('#screen-retenes .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-retenes .tab-btn').forEach(b=>b.classList.remove('active'));
  const el = $('ret-tab-'+tab); if(el) el.classList.add('active');
  if(btn) btn.classList.add('active');
  _retTabActual = tab;
  if(tab==='planilla') renderRetenes();
  if(tab==='resumen')  renderRetenResumen();
}


// ── Obtener horas de retén cargadas en grillas de servicios por asociado ──
// Retorna: {[nombre]: {[fechaISO]: horas}} para todos los asociados con tipo "reten"
function getHorasRetenDeServicios(mes){
  const resultado = {};
  const grillasDelMes = (DB.grillasLiq||[]).filter(g=>g.periodo===mes);
  grillasDelMes.forEach(grilla=>{
    (grilla.asociados||[]).forEach(asoc=>{
      if(asoc.tipoHora !== 'reten') return;
      if(!resultado[asoc.nombre]) resultado[asoc.nombre] = {nombre: asoc.nombre, categoria: asoc.categoria, horas:{}};
      const dias = getDiasDelMes(mes);
      dias.forEach(dia=>{
        const rawVal = asoc.horas?.[dia.iso];
        const esEsp = ['F','AJ','AI'].includes(String(rawVal||'').toUpperCase());
        const h = esEsp ? 0 : parseFloat(rawVal||0);
        if(h > 0){
          resultado[asoc.nombre].horas[dia.iso] = (resultado[asoc.nombre].horas[dia.iso]||0) + h;
        }
        if(String(rawVal||'').toUpperCase()==='AI'){
          resultado[asoc.nombre].horas[dia.iso] = 'AI'; // rechazo
        }
      });
    });
  });
  return resultado;
}

function renderRetenes(){
  // Asegurar tab activo
  const tabActivo = $('ret-tab-'+(_retTabActual||'planilla'));
  if(tabActivo && !tabActivo.classList.contains('active')){
    tabActivo.classList.add('active');
    document.querySelectorAll('#screen-retenes .tab-btn').forEach((b,i)=>{
      if(i===0&&(_retTabActual||'planilla')==='planilla') b.classList.add('active');
      if(i===1&&_retTabActual==='resumen') b.classList.add('active');
    });
  }
  const sel = $('ret-mes-sel');
  if(sel && !sel.options.length){
    const hoy = new Date();
    for(let i=-2;i<=3;i++){
      const d = new Date(hoy.getFullYear(), hoy.getMonth()+i, 1);
      const val = d.toISOString().slice(0,7);
      const label = d.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
      const opt = document.createElement('option');
      opt.value=val; opt.textContent=label;
      if(i===0) opt.selected=true;
      sel.appendChild(opt);
    }
  }
  const mes = $('ret-mes-sel')?.value || new Date().toISOString().slice(0,7);
  if(!DB.retenHoras[mes]) DB.retenHoras[mes]={};
  const dias = getDiasDelMes(mes);
  const dN = ['D','L','M','X','J','V','S'];
  const HS_MINIMO = 200;
  const cats = (DB.categoriasSind||[]).map(c=>c.nombre).filter(Boolean);

  // ── Obtener retenes de DB + los que vienen de grillas de servicios ──
  const horasDeServicio = getHorasRetenDeServicios(mes);

  // Combinar: retenes registrados en DB + asociados con tipo reten en servicios
  const retenesManuales = (DB.retenes||[]).filter(r=>r.activo);
  const nombresEnServicio = Object.keys(horasDeServicio);

  // Todos los retenes únicos (manual + servicio)
  const todosRetenes = [...retenesManuales];
  nombresEnServicio.forEach(nombre=>{
    if(!todosRetenes.find(r=>r.nombre===nombre)){
      // Agregar como retén temporal (viene solo de servicios)
      todosRetenes.push({
        id: 'svc_'+nombre.replace(/\s/g,'_'),
        nombre,
        nroSocio: '',
        categoriBase: horasDeServicio[nombre].categoria||'Operario/a limpieza',
        activo: true,
        soloServicio: true, // flag para indicar que viene de servicios
      });
    }
  });

  // Stats
  let totalHs=0, cobranMinimo=0, rechazos=0;
  todosRetenes.forEach(r=>{
    let hsR=0;
    dias.forEach(d=>{
      // Horas manuales
      const vm = DB.retenHoras[mes][r.id]?.[d.iso];
      const hm = parseFloat(vm?.hs||0);
      // Horas de servicio
      const hs = horasDeServicio[r.nombre]?.horas?.[d.iso];
      const hsr = parseFloat(hs||0);
      const h = hm + (isNaN(hsr)?0:hsr);
      if(h>0) hsR+=h;
      if(String(vm?.hs||'').toUpperCase()==='AI'||String(hs||'').toUpperCase()==='AI') rechazos++;
    });
    totalHs+=hsR;
    if(hsR<HS_MINIMO) cobranMinimo++;
  });
  if($('st-ret-total'))    $('st-ret-total').textContent    = todosRetenes.length;
  if($('st-ret-hs'))       $('st-ret-hs').textContent       = totalHs+'hs';
  if($('st-ret-minimo'))   $('st-ret-minimo').textContent   = cobranMinimo;
  if($('st-ret-rechazos')) $('st-ret-rechazos').textContent = rechazos;

  const thead = $('thead-ret');
  const tbody = $('tbody-ret');
  if(!thead||!tbody) return;

  thead.innerHTML = `<tr style="background:#374151;color:white;">
    <th style="padding:8px 14px;border:1px solid #6b7280;text-align:left;min-width:180px;position:sticky;left:0;background:#374151;z-index:3;">Retén</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:180px;">Categoría base</th>
    ${dias.map(dia=>{
      const dow=new Date(dia.iso+'T12:00:00').getDay();
      const bg=dia.esFeriado?'background:#ffe4e6;color:#111;font-weight:800;':dia.esFinde?'background:#ffff00;color:#111;font-weight:700;':'';
      return`<th style="padding:4px 2px;border:1px solid #6b7280;text-align:center;min-width:32px;font-size:10px;${bg}">
        <div>${dN[dow]}</div><div style="font-weight:800;">${dia.d}</div></th>`;
    }).join('')}
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:60px;">Hs serv.</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:60px;">Hs manual</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:75px;">Hs a cobrar</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:80px;">Valor/h</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:110px;background:#065f46;color:white;">Total a pagar</th>
  </tr>`;

  if(!todosRetenes.length){
    tbody.innerHTML=`<tr><td colspan="100" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      Sin retenes activos. Agregá un retén o asigná tipo "Retén" en una grilla de servicios.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = todosRetenes.map(r=>{
    if(!DB.retenHoras[mes][r.id]) DB.retenHoras[mes][r.id]={};
    let hsServicio=0, hsManual=0, diasRechazados=0;

    const celdas = dias.map(dia=>{
      // Horas del servicio (solo lectura, fondo verde claro)
      const hsvcVal = horasDeServicio[r.nombre]?.horas?.[dia.iso];
      const esRechSvc = String(hsvcVal||'').toUpperCase()==='AI';
      const hSvc = esRechSvc ? 0 : parseFloat(hsvcVal||0);
      if(hSvc>0) hsServicio+=hSvc;

      // Horas manuales (editables)
      const celda = DB.retenHoras[mes][r.id][dia.iso]||{};
      const rawHs = celda.hs||'';
      const catAlt = celda.catAlt||'';
      const esEsp = ['F','AJ','AI'].includes(String(rawHs).toUpperCase());
      const hMan = esEsp?0:parseFloat(rawHs||0);
      if(hMan>0) hsManual+=hMan;
      if(esRechSvc||String(rawHs).toUpperCase()==='AI') diasRechazados++;

      const dow = new Date(dia.iso+'T12:00:00').getDay();
      const bgBase = dia.esFeriado?'#ffe4e6':dia.esFinde?'#fefce8':'white';

      // Celda dividida: servicio (arriba, solo lectura) + manual (abajo, editable)
      const dispSvc = esRechSvc?'AI':hSvc>0?hSvc+'hs':'';
      const colorSvc = esRechSvc?'color:#dc2626;font-weight:700':hSvc>0?'color:#059669;font-weight:600':'color:#d1d5db';
      const dispMan = esEsp?String(rawHs).toUpperCase():(hMan||'');
      const colorMan = esEsp&&rawHs==='F'?'color:#7c3aed;font-weight:700'
        :esEsp&&rawHs==='AJ'?'color:#d97706;font-weight:700'
        :esEsp?'color:#dc2626;font-weight:700'
        :hMan>0?'color:#1d4ed8;font-weight:600':'color:#d1d5db';

      return`<td style="border:1px solid var(--borde);background:${bgBase};padding:1px;min-width:32px;">
        ${dispSvc?`<div style="font-size:10px;text-align:center;${colorSvc};border-bottom:1px dashed #d1fae5;padding:1px 0;" title="Cargado en servicio">${dispSvc}</div>`:''}
        <input type="text" value="${dispMan}"
          style="width:28px;${colorMan};border:none;background:transparent;text-align:center;font-size:11px;outline:none;padding:1px 0;text-transform:uppercase;display:block;margin:0 auto;"
          onchange="setHoraReten('${mes}','${r.id}','${dia.iso}',this.value)">
        ${catAlt?`<div style="font-size:8px;color:#7c3aed;text-align:center;">${catAlt.substring(0,3)}</div>`:''}
      </td>`;
    }).join('');

    const hsTotal = hsServicio + hsManual;
    const hsCobrar = Math.max(hsTotal, HS_MINIMO - diasRechazados*8);
    const vh = getCategoriaVH(r.categoriBase||'');
    const total = Math.round(hsCobrar * vh);

    return`<tr>
      <td style="padding:5px 12px;border:1px solid var(--borde);font-size:12px;font-weight:500;position:sticky;left:0;background:white;z-index:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <div>
            ${r.nombre}
            ${r.soloServicio?'<span style="font-size:9px;background:#dcfce7;color:#065f46;border-radius:4px;padding:1px 5px;margin-left:4px;">Desde servicio</span>':''}
            ${diasRechazados>0?`<span style="font-size:9px;background:#fee2e2;color:#dc2626;border-radius:4px;padding:1px 4px;margin-left:4px;">${diasRechazados} rechazo${diasRechazados>1?'s':''}</span>`:''}
          </div>
          ${!r.soloServicio?`<button title="Carga rápida" onclick="event.stopPropagation();abrirCargaRapidaReten('${mes}','${r.id}','${r.nombre}')"
            style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;white-space:nowrap;">⚡ Rápido</button>`:''}
        </div>
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);">
        <select style="font-size:11px;padding:2px;border:1px solid var(--borde-fuerte);border-radius:4px;width:100%;"
          onchange="setCatBaseReten(${typeof r.id==='string'?'"'+r.id+'"':r.id},this.value)" ${r.soloServicio?'disabled':''}>
          ${cats.map(c=>`<option value="${c}" ${c===r.categoriBase?'selected':''}>${c}</option>`).join('')}
        </select>
      </td>
      ${celdas}
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-size:11px;color:#059669;">${hsServicio>0?hsServicio+'hs':'—'}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-size:11px;color:#1d4ed8;">${hsManual>0?hsManual+'hs':'—'}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:#1d4ed8;">
        ${hsCobrar}hs${hsTotal<HS_MINIMO?`<div style="font-size:9px;color:var(--naranja);">mín. garantizado</div>`:''}
      </td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;">$${vh.toLocaleString('es-AR')}</td>
      <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:white;background:#065f46;">$${total.toLocaleString('es-AR')}</td>
    </tr>`;
  }).join('');
}


function syncPeriodoReten(mes, retenId){
  supaSync('retenHorasRows', {
    id:idPersonaPeriodo(retenId,mes), personaIdLocal:idLocalTrunc(retenId), periodo:mes,
    horas: DB.retenHoras?.[mes]?.[retenId]||{},
  });
}
function setHoraReten(mes, retenId, fechaISO, valor){
  if(!DB.retenHoras[mes]) DB.retenHoras[mes]={};
  if(!DB.retenHoras[mes][retenId]) DB.retenHoras[mes][retenId]={};
  const valStr = (valor||'').toString().trim().toUpperCase();
  const esEsp = ['F','AJ','AI'].includes(valStr);
  DB.retenHoras[mes][retenId][fechaISO] = {
    hs: esEsp ? valStr : (parseFloat(valor)||0),
    catAlt: DB.retenHoras[mes][retenId][fechaISO]?.catAlt||'',
  };
  syncPeriodoReten(mes, retenId);
  renderRetenes();
}

function setCatBaseReten(id, cat){
  const r=(DB.retenes||[]).find(x=>x.id===id);
  if(r){ r.categoriBase=cat; supaSync('retenes', r); renderRetenes(); }
}

// ── Resumen de pago ──
function renderRetenResumen(){
  const mes = $('ret-mes-sel')?.value || new Date().toISOString().slice(0,7);
  const horasSvcRes = getHorasRetenDeServicios(mes);
  const retenesBD = (DB.retenes||[]).filter(r=>r.activo);
  const retenes = [...retenesBD];
  Object.keys(horasSvcRes).forEach(nombre=>{
    if(!retenes.find(r=>r.nombre===nombre))
      retenes.push({id:'svc_'+nombre.replace(/\s/g,'_'), nombre,
        categoriBase:horasSvcRes[nombre].categoria||'Operario/a limpieza', activo:true, soloServicio:true});
  });
  const dias = getDiasDelMes(mes);
  const HS_MINIMO = 200;
  const thead = $('thead-ret-resumen');
  const tbody = $('tbody-ret-resumen');
  if(!thead||!tbody) return;

  thead.innerHTML = `<tr style="background:#374151;color:white;">
    <th style="padding:8px 14px;border:1px solid #6b7280;text-align:left;">Retén</th>
    <th style="padding:8px;border:1px solid #6b7280;">Categoría base</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Hs reales</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Rechazos</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Desc. rechazos</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Hs a cobrar</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Valor/h</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;background:#065f46;color:white;">Total a pagar</th>
  </tr>`;

  let grandTotal=0;
  tbody.innerHTML = retenes.map(r=>{
    let hsReales=0, rechazos=0;
    dias.forEach(d=>{
      const v=DB.retenHoras[mes]?.[r.id]?.[d.iso];
      const h=parseFloat(v?.hs||0);
      if(h>0) hsReales+=h;
      if(String(v?.hs||'').toUpperCase()==='AI') rechazos++;
    });
    const descRechazos = rechazos*8;
    const hsCobrar = Math.max(hsReales, HS_MINIMO-descRechazos);
    const vh = getCategoriaVH(r.categoriBase||'');
    const total = Math.round(hsCobrar*vh);
    grandTotal+=total;
    const cobrandoMinimo = hsReales<HS_MINIMO;
    return`<tr>
      <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${r.nombre}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.categoriBase||'—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:${cobrandoMinimo?'var(--naranja)':'var(--verde)'};">${hsReales}hs</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:${rechazos>0?'var(--rojo)':'var(--texto-suave)'};">${rechazos>0?rechazos+'d':'—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:var(--rojo);">${descRechazos>0?'-'+descRechazos+'hs':'—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:#1d4ed8;">
        ${hsCobrar}hs ${cobrandoMinimo?'<span style="font-size:9px;color:var(--naranja);">(mín)</span>':''}
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">$${vh.toLocaleString('es-AR')}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:white;background:#065f46;">$${total.toLocaleString('es-AR')}</td>
    </tr>`;
  }).join('');

  // Fila de total
  tbody.innerHTML += `<tr style="background:#f0fdf4;font-weight:800;">
    <td colspan="7" style="padding:8px 14px;border:1px solid var(--borde);text-align:right;font-size:13px;">TOTAL DEL MES</td>
    <td style="padding:8px 14px;border:1px solid var(--borde);text-align:right;font-size:15px;color:white;background:#065f46;">$${grandTotal.toLocaleString('es-AR')}</td>
  </tr>`;
}

// ── Modal nuevo retén ──
function abrirModalNuevoReten(){
  if($('nret-nombre'))   $('nret-nombre').value='';
  if($('nret-nro'))      $('nret-nro').value='';
  // Poblar categorías
  const selCat=$('nret-cat-base');
  if(selCat){
    const cats=(DB.categoriasSind||[]).map(c=>c.nombre).filter(Boolean);
    selCat.innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }
  // Poblar datalist de nombres desde legajos
  const dl=$('dl-nret-nombre');
  if(dl) dl.innerHTML=(DB.legajos||[]).filter(l=>l.estado==='Activo')
    .map(l=>`<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
  abrirModal('modal-nuevo-reten');
}

function confirmarNuevoReten(){
  const nombre=$('nret-nombre')?.value.trim();
  const nro=$('nret-nro')?.value.trim();
  const cat=$('nret-cat-base')?.value;
  if(!nombre){toast('Ingresá el nombre del retén');return;}
  const yaExiste=(DB.retenes||[]).find(r=>r.nombre===nombre&&r.activo);
  if(yaExiste){toast('Este asociado ya está como retén activo');return;}
  const nuevo={id:Date.now(),nombre,nroSocio:nro,categoriBase:cat||'Operario/a limpieza',activo:true};
  DB.retenes.push(nuevo);
  supaSync('retenes', nuevo);
  cerrarModal('modal-nuevo-reten');
  toast('✅ Retén agregado — '+nombre);
  renderRetenes();
}


// ══════════════════════════════════════════════════════════
// MÓDULO MONOTRIBUTOS
// ══════════════════════════════════════════════════════════
function renderMonotributos(){
  // Poblar selector de año
  const selAnio = $('mono-anio');
  if(selAnio && !selAnio.options.length){
    const anioActual = new Date().getFullYear();
    for(let a=anioActual-1; a<=anioActual+1; a++){
      const opt=document.createElement('option');
      opt.value=a; opt.textContent=a;
      if(a===anioActual) opt.selected=true;
      selAnio.appendChild(opt);
    }
  }
  const anio = parseInt($('mono-anio')?.value)||new Date().getFullYear();
  const filtro = $('mono-filtro')?.value||'';
  const all = (DB.monotributos||[]).filter(r=>r.estado!=='Baja'||(filtro==='Baja'));
  const vigencia = getVigenciaActual();

  // Stats
  let totalCUR=0, fueraCat=0, alDia=0;
  all.forEach(r=>{
    const cur = getCURPersona(r, vigencia);
    totalCUR += cur;
    const proy = getProyeccionAnual(r.nombre, anio);
    const limite = getLimiteCategoria(r.categoria, vigencia);
    if(proy > limite) fueraCat++;
    else alDia++;
  });
  if($('st-mono-total')) $('st-mono-total').textContent = all.length;
  if($('st-mono-fuera')) $('st-mono-fuera').textContent = fueraCat;
  if($('st-mono-cur'))   $('st-mono-cur').textContent   = '$'+totalCUR.toLocaleString('es-AR');
  if($('st-mono-aldia')) $('st-mono-aldia').textContent = alDia;

  const rows = filtro ? all.filter(r=>{
    if(filtro==='Fuera de categoría'){
      const proy=getProyeccionAnual(r.nombre,anio);
      const limite=getLimiteCategoria(r.categoria,vigencia);
      return proy>limite;
    }
    if(filtro==='Al día'){
      const proy=getProyeccionAnual(r.nombre,anio);
      const limite=getLimiteCategoria(r.categoria,vigencia);
      return proy<=limite;
    }
    return true;
  }) : all;

  const tbody = $('tbody-mono'); if(!tbody)return;
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin monotributistas registrados. Usá "+ Nuevo registro".</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r,i)=>{
    const cur = getCURPersona(r, vigencia);
    const proy = getProyeccionAnual(r.nombre, anio);
    const limite = getLimiteCategoria(r.categoria, vigencia);
    const fueraCatRow = proy > limite;
    const netoUltimo = getNetoUltimoMes(r.nombre);
    const pct = limite>0 ? Math.round(proy/limite*100) : 0;
    const barColor = pct>=100?'#dc2626':pct>=80?'#f59e0b':'#10b981';

    return`<tr style="background:${fueraCatRow?'#fff5f5':'white'};">
      <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">
        ${r.nombre}
        ${r.cuit?`<div style="font-size:10px;color:var(--texto-suave);">CUIT: ${r.cuit}</div>`:''}
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">
        <span class="chip" style="font-size:10px;">${r.zona==='capital'?'🏙️ Capital':'🌿 Provincia'}</span>
        ${r.obraSocial?'<div style="font-size:9px;color:#7c3aed;margin-top:2px;">👨‍👩‍👧 Con familia</div>':''}
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        <span style="background:#1e40af;color:white;font-weight:800;border-radius:6px;padding:3px 10px;font-size:13px;">${r.categoria||'—'}</span>
        <button style="background:none;border:none;cursor:pointer;font-size:10px;color:var(--azul);display:block;margin:2px auto 0;" onclick="verHistorialCat(${i})" title="Ver historial">📋 historial</button>
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-size:11px;">$${limite.toLocaleString('es-AR')}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:#7c3aed;">$${cur.toLocaleString('es-AR')}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;color:var(--azul);">${netoUltimo>0?'$'+netoUltimo.toLocaleString('es-AR'):'—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;min-width:120px;">
        <div style="font-weight:700;color:${fueraCatRow?'#dc2626':'#374151'};">$${proy.toLocaleString('es-AR')}</div>
        <div style="background:#e5e7eb;border-radius:4px;height:6px;margin-top:4px;overflow:hidden;">
          <div style="background:${barColor};height:100%;width:${Math.min(pct,100)}%;transition:width .3s;"></div>
        </div>
        <div style="font-size:9px;color:var(--texto-suave);margin-top:2px;">${pct}% del límite</div>
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        ${fueraCatRow
          ?`<span class="badge badge-rojo" style="font-size:10px;">⚠️ Fuera de cat.</span>`
          :`<span class="badge badge-verde" style="font-size:10px;">✅ Al día</span>`}
      </td>
      <td style="padding:6px 8px;border:1px solid var(--borde);">
        <button class="btn btn-xs btn-secondary" onclick="editarMonotributo(${i})" title="Editar">✏️</button>
        ${fueraCatRow?`<button class="btn btn-xs" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:10px;margin-top:2px;" onclick="recategorizarModal(${i})">↑ Recateg.</button>`:''}
      </td>
    </tr>`;
  }).join('');

  // Actualizar tab de alertas
  renderAlertasMonotributo(anio, vigencia);
}

// ── Helpers de cálculo ──
function getVigenciaActual(){
  const hoy = new Date().toISOString().slice(0,7);
  const vigencias = Object.keys(DB.monoTablas||{}).sort();
  // Última vigencia que no supere la fecha actual
  return vigencias.filter(v=>v<=hoy).pop() || vigencias[0] || '2024-01';
}

function getTablaVigente(vigencia){
  return (DB.monoTablas||{})[vigencia] || [];
}

function getLimiteCategoria(cat, vigencia){
  const tabla = getTablaVigente(vigencia);
  return tabla.find(r=>r.cat===cat)?.limiteAnual || 0;
}

function getCURPersona(persona, vigencia){
  // Si tiene CUR manual, usar ese
  if(persona.cur > 0) return persona.cur;
  // Si no, calcular desde la tabla según zona y obra social
  const tabla = getTablaVigente(vigencia);
  const row = tabla.find(r=>r.cat===persona.categoria);
  if(!row) return 0;
  const esCapital = persona.zona === 'capital';
  const conFamilia = !!persona.obraSocial;
  if(esCapital && conFamilia)  return row.curCapitalConFamilia||0;
  if(esCapital && !conFamilia) return row.curCapital||0;
  if(!esCapital && conFamilia) return row.curConFamilia||0;
  return row.curBase||0;
}

function getNetoUltimoMes(nombre){
  // Buscar el último mes con liquidación para esta persona
  const pagos = DB.lqsPagos||{};
  const meses = Object.keys(pagos).sort().reverse();
  for(const mes of meses){
    if(pagos[mes]?.[nombre]?.monto > 0) return pagos[mes][nombre].monto;
  }
  // Si no hay pago registrado, buscar en liquidaciones consolidadas
  const lqs = DB.lqsDescuentos||{};
  const mesesLqs = Object.keys(lqs).sort().reverse();
  if(mesesLqs.length){
    const filas = _getFilasConsolidadas(mesesLqs[0]);
    const f = filas.find(x=>x.nombre===nombre);
    return f?.neto||0;
  }
  return 0;
}

function getProyeccionAnual(nombre, anio){
  // Sumar netos reales de los meses del año y proyectar el resto con el último conocido
  let totalReal=0, ultimoNeto=0, mesesConDatos=0;
  const pagos = DB.lqsPagos||{};
  for(let m=1; m<=12; m++){
    const mes = `${anio}-${String(m).padStart(2,'0')}`;
    if(pagos[mes]?.[nombre]?.monto > 0){
      totalReal += pagos[mes][nombre].monto;
      ultimoNeto = pagos[mes][nombre].monto;
      mesesConDatos = m;
    }
  }
  // Proyectar los meses sin datos usando el último neto conocido
  if(ultimoNeto === 0) ultimoNeto = getNetoUltimoMes(nombre);
  const mesesRestantes = 12 - mesesConDatos;
  return totalReal + (mesesRestantes * ultimoNeto);
}

// ── Tab alertas — con propuesta de recategorización y checkboxes ──
function renderAlertasMonotributo(anio, vigencia){
  const el = $('mono-alerta-body'); if(!el) return;
  const anioUsar = anio||parseInt($('mono-anio')?.value)||new Date().getFullYear();
  const vig = vigencia||getVigenciaActual();
  const tabla = getTablaVigente(vig);

  const fuera = (DB.monotributos||[]).filter((r,idx)=>{
    if(r.estado==='Baja') return false;
    const proy = getProyeccionAnual(r.nombre, anioUsar);
    const limite = getLimiteCategoria(r.categoria, vig);
    return proy > limite;
  });

  if(!fuera.length){
    el.innerHTML=`<div style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      <div style="font-size:40px;margin-bottom:12px;">✅</div>
      <div style="font-size:14px;">Todos los asociados están dentro de su categoría para ${anioUsar}.</div>
    </div>`;
    return;
  }

  // Calcular propuesta para cada uno
  const propuestas = fuera.map(r=>{
    const idxR = (DB.monotributos||[]).indexOf(r);
    const proy = getProyeccionAnual(r.nombre, anioUsar);
    const catSugerida = tabla.find(row=>row.limiteAnual>=proy)?.cat || 'K';
    const curActual = getCURPersona(r, vig);
    const curSugerido = calcularCURSugerido(r, catSugerida, vig);
    const limiteNuevo = getLimiteCategoria(catSugerida, vig);
    return {r, idxR, proy, catSugerida, curActual, curSugerido, limiteNuevo};
  });

  el.innerHTML = `
    <div style="padding:14px 20px;background:#fef3c7;border-bottom:1px solid #fcd34d;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div style="font-size:13px;color:#92400e;">
        <strong>${fuera.length} asociado${fuera.length>1?'s':''}</strong> superan el límite de su categoría en la proyección para ${anioUsar}.
        Revisá las propuestas y aplicá los cambios que correspondan.
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-secondary" onclick="marcarTodosRecateg(true)">✓ Marcar todos</button>
        <button class="btn btn-sm btn-secondary" onclick="marcarTodosRecateg(false)">✕ Desmarcar todos</button>
        <button class="btn btn-sm" style="background:#1d4ed8;color:white;border:none;" onclick="aplicarRecategorizaciones()">↑ Aplicar seleccionados</button>
      </div>
    </div>
    <div id="mono-propuestas-list">
      ${propuestas.map((p,pi)=>`
              style="width:18px;height:18px;cursor:pointer;accent-color:#1d4ed8;">
                ${p.r.jubilado?'<div>👴 Jubilado</div>':''}
                style="width:110px;padding:4px 8px;border:1px solid var(--borde-fuerte);border-radius:6px;font-size:12px;outline:none;"
                title="Podés modificar el CUR propuesto antes de aplicar">
              onclick="rechazarPropuesta(${p.idxR},'${p.r.categoria}',${p.curActual})">✕ Rechazar</button>
      `).join('')}
    </div>
    <div id="mono-propuestas-data" style="display:none;">${JSON.stringify(propuestas.map(p=>({idxR:p.idxR,catSugerida:p.catSugerida,catAnterior:p.r.categoria,curActual:p.curActual,proy:p.proy,nombre:p.r.nombre})))}</div>
  `;
}


// ── Calcular CUR sugerido según factores del asociado ──
function calcularCURSugerido(persona, cat, vigencia){
  const tabla = getTablaVigente(vigencia);
  const row = tabla.find(r=>r.cat===cat);
  if(!row) return 0;
  const esCapital = persona.zona === 'capital';
  const conFamilia = !!persona.obraSocial;
  // Jubilado: exento de SIPA y/o OS según lo declarado
  if(persona.jubilado){
    // Solo paga impuesto integrado
    return row.impuestoIntegrado || Math.round((row.curBase||0) * 0.15); // aprox 15% de la cuota
  }
  if(esCapital && conFamilia)  return row.curCapitalConFamilia||0;
  if(esCapital && !conFamilia) return row.curCapital||0;
  if(!esCapital && conFamilia) return row.curConFamilia||0;
  return row.curBase||0;
}

// ── Marcar/desmarcar todos los checkboxes de propuestas ──
function marcarTodosRecateg(estado){
  document.querySelectorAll('[id^="chk-recateg-"]').forEach(chk=>{
    chk.checked = estado;
  });
}

// ── Aplicar recategorizaciones seleccionadas ──
function aplicarRecategorizaciones(){
  const dataEl = $('mono-propuestas-data');
  if(!dataEl) return;
  let propuestas;
  try { propuestas = JSON.parse(dataEl.textContent); } catch(e){ toast('Error al leer propuestas'); return; }

  const seleccionadas = propuestas.filter((p,pi)=>{
    const chk = $('chk-recateg-'+pi);
    return chk && chk.checked;
  });

  if(!seleccionadas.length){ toast('No hay propuestas seleccionadas'); return; }

  if(!confirm('¿Aplicar recategorización a '+seleccionadas.length+' asociado'+
    (seleccionadas.length>1?'s':'')+' seleccionado'+(seleccionadas.length>1?'s':'')+'?')) return;

  const fecha = new Date().toLocaleDateString('es-AR');
  const vigencia = getVigenciaActual();

  seleccionadas.forEach((p,pi)=>{
    const r = (DB.monotributos||[])[p.idxR];
    if(!r) return;
    // Leer el CUR del input (puede haber sido modificado)
    const inputIdx = propuestas.indexOf(p);
    const curInput = $('cur-propuesto-'+inputIdx);
    const curNuevo = curInput ? parseFloat(curInput.value)||0 : p.curActual;

    // Registrar en historial
    if(!DB.monoCambios) DB.monoCambios=[];
    DB.monoCambios.unshift({
      id: Date.now()+Math.random(),
      nombre: r.nombre,
      fecha,
      catAnterior: p.catAnterior,
      catNueva: p.catSugerida,
      curAnterior: p.curActual,
      curNuevo,
      proyeccionAnual: p.proy,
      motivo: 'Proyección anual supera límite de categoría',
      decidoPor: currentUser?.nombre||'Admin',
      resultado: 'Aprobado',
    });

    // Guardar historial en el asociado
    if(!r.historialCategorias) r.historialCategorias=[];
    r.historialCategorias.push({
      cat: p.catAnterior,
      desde: r.fechaAlta||'—',
      hasta: fecha,
      cur: p.curActual,
    });

    // Aplicar cambios
    r.categoria = p.catSugerida;
    r.cur = curNuevo;
  });

  toast('✅ '+seleccionadas.length+' recategorizaci'+(seleccionadas.length>1?'ones':'ón')+' aplicada'+(seleccionadas.length>1?'s':''));
  renderMonotributos();
  tabMonotributos('historial', null);
}

// ── Rechazar propuesta individual ──
function rechazarPropuesta(idxR, catActual, curActual){
  const r = (DB.monotributos||[])[idxR];
  if(!r) return;
  if(!confirm('¿Rechazar el cambio de categoría para '+r.nombre+'? Se registrará en el historial.')) return;
  const fecha = new Date().toLocaleDateString('es-AR');
  if(!DB.monoCambios) DB.monoCambios=[];
  DB.monoCambios.unshift({
    id: Date.now()+Math.random(),
    nombre: r.nombre,
    fecha,
    catAnterior: catActual,
    catNueva: catActual,
    curAnterior: curActual,
    curNuevo: curActual,
    proyeccionAnual: getProyeccionAnual(r.nombre, new Date().getFullYear()),
    motivo: 'Decisión manual: mantener categoría actual',
    decidoPor: currentUser?.nombre||'Admin',
    resultado: 'Rechazado',
  });
  toast('Cambio rechazado y registrado en historial para '+r.nombre);
  renderMonotributos();
}

// ── Historial de cambios ──
function renderHistorialMono(){
  const filtro = $('mono-hist-filtro')?.value||'';
  const rows = (DB.monoCambios||[]).filter(r=>!filtro||r.resultado===filtro);
  const tbody = $('tbody-mono-hist'); if(!tbody) return;
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin registros en el historial.</td></tr>`;
    return;
  }
  const resColor={'Aprobado':'badge-verde','Rechazado':'badge-rojo'};
  tbody.innerHTML = rows.map(r=>`<tr>
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${r.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.fecha}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
      <span style="background:#6b7280;color:white;font-weight:700;border-radius:6px;padding:2px 8px;">${r.catAnterior}</span>
    </td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
      ${r.catNueva!==r.catAnterior
        ?`<span style="background:#1d4ed8;color:white;font-weight:700;border-radius:6px;padding:2px 8px;">${r.catNueva}</span>`
        :`<span style="color:var(--texto-suave);font-size:11px;">Sin cambio</span>`}
    </td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-size:11px;">$${(r.curAnterior||0).toLocaleString('es-AR')}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-size:11px;font-weight:${r.curNuevo!==r.curAnterior?'700':'400'};color:${r.curNuevo!==r.curAnterior?'#065f46':'inherit'};">
      $${(r.curNuevo||0).toLocaleString('es-AR')}
    </td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;max-width:200px;">${r.motivo||'—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.decidoPor||'—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
      <span class="badge ${resColor[r.resultado]||'badge-gris'}" style="font-size:10px;">${r.resultado}</span>
    </td>
  </tr>`).join('');
}

// ── Importar tabla de categorías ──
function abrirModalImportarTabla(){
  if($('import-vigencia')) $('import-vigencia').value = new Date().toISOString().slice(0,7);
  if($('import-tabla-raw')) $('import-tabla-raw').value = '';
  if($('import-preview')) $('import-preview').innerHTML = '';
  abrirModal('modal-importar-tabla');
}

function previsualizarImportacion(){
  const raw = $('import-tabla-raw')?.value.trim();
  const preview = $('import-preview');
  if(!raw || !preview){ toast('Pegá los datos primero'); return; }
  const parsed = parsearTablaImportada(raw);
  if(!parsed.length){ preview.innerHTML='<div style="color:#dc2626;padding:8px;">No se pudieron interpretar los datos. Verificá el formato.</div>'; return; }
  preview.innerHTML = `
    <div style="font-size:12px;color:#065f46;margin-bottom:8px;">✅ ${parsed.length} categorías detectadas</div>
    <div style="overflow-x:auto;max-height:200px;overflow-y:auto;">
      <table style="border-collapse:collapse;font-size:11px;width:100%;">
        <thead><tr style="background:#374151;color:white;">
          <th style="padding:4px 8px;border:1px solid #6b7280;">Cat.</th>
          <th style="padding:4px 8px;border:1px solid #6b7280;">Límite anual</th>
          <th style="padding:4px 8px;border:1px solid #6b7280;">CUR Provincia</th>
          <th style="padding:4px 8px;border:1px solid #6b7280;">CUR Capital</th>
          <th style="padding:4px 8px;border:1px solid #6b7280;">CUR Prov+Fam</th>
          <th style="padding:4px 8px;border:1px solid #6b7280;">CUR Cap+Fam</th>
        </tr></thead>
        <tbody>${parsed.map(r=>`<tr>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function parsearTablaImportada(raw){
  // Intentar parsear varios formatos:
  // 1. CSV con columnas: cat, limiteAnual, curBase, curCapital, curConFamilia, curCapitalConFamilia
  // 2. Texto tabulado (copiado de Excel)
  // 3. JSON array
  try {
    const json = JSON.parse(raw);
    if(Array.isArray(json)) return json;
  } catch(e){}

  const lineas = raw.split('\n').map(l=>l.trim()).filter(l=>l && !/^cat/i.test(l));
  const resultado = [];
  lineas.forEach(linea=>{
    const cols = linea.split(/[	,;]+/).map(c=>c.trim().replace(/\$/g,'').replace(/\./g,'').replace(',','.'));
    if(cols.length >= 2){
      const cat = cols[0].toUpperCase();
      if(!/^[A-K]$/.test(cat)) return;
      resultado.push({
        cat,
        limiteAnual:       parseFloat(cols[1])||0,
        curBase:           parseFloat(cols[2])||0,
        curCapital:        parseFloat(cols[3])||0,
        curConFamilia:     parseFloat(cols[4])||0,
        curCapitalConFamilia: parseFloat(cols[5])||0,
      });
    }
  });
  return resultado;
}

function confirmarImportacion(){
  const vigencia = $('import-vigencia')?.value;
  const raw = $('import-tabla-raw')?.value.trim();
  if(!vigencia){ toast('Ingresá la vigencia'); return; }
  if(!raw){ toast('Pegá los datos de la tabla'); return; }
  const parsed = parsearTablaImportada(raw);
  if(!parsed.length){ toast('No se pudieron interpretar los datos'); return; }
  if(!DB.monoTablas) DB.monoTablas={};
  DB.monoTablas[vigencia] = parsed;
  cerrarModal('modal-importar-tabla');
  toast('✅ Tabla importada — '+parsed.length+' categorías para vigencia '+vigencia);
  renderTablasCategorias();
}

// ── Proponer recategorización automática para todos ──
function proponerRecategorizacion(){
  const anio = parseInt($('mono-anio')?.value)||new Date().getFullYear();
  const vig = getVigenciaActual();
  const tabla = getTablaVigente(vig);
  let propuestas = 0;
  (DB.monotributos||[]).filter(r=>r.estado!=='Baja').forEach(r=>{
    const proy = getProyeccionAnual(r.nombre, anio);
    const catSugerida = tabla.find(row=>row.limiteAnual>=proy)?.cat;
    if(catSugerida && catSugerida !== r.categoria){
      r._catPropuesta = catSugerida;
      r._curPropuesto = calcularCURSugerido(r, catSugerida, vig);
      propuestas++;
    }
  });
  toast(propuestas>0?'✅ '+propuestas+' propuestas generadas — revisalas en la tab Fuera de categoría':'Todos los asociados están en la categoría correcta');
  if(propuestas>0) tabMonotributos('alerta', null);
}


// ── Tab tablas de categorías ──
function tabMonotributos(tab, btn){
  document.querySelectorAll('#screen-monotributos .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-monotributos .tab-btn').forEach(b=>b.classList.remove('active'));
  const el=$('mono-tab-'+tab);if(el)el.classList.add('active');
  if(btn)btn.classList.add('active');
  if(tab==='padron'||tab==='alerta') renderMonotributos();
  if(tab==='categorias') renderTablasCategorias();
  if(tab==='historial')  renderHistorialMono();
}

function renderTablasCategorias(){
  // Poblar selector de vigencias
  const sel=$('mono-tabla-vigencia');
  if(sel){
    const vigencias=Object.keys(DB.monoTablas||{}).sort().reverse();
    sel.innerHTML=vigencias.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(!sel.value&&vigencias.length) sel.value=vigencias[0];
  }
  const vigencia=$('mono-tabla-vigencia')?.value||getVigenciaActual();
  const tabla=getTablaVigente(vigencia);
  const el=$('mono-tabla-body');if(!el)return;
  if(!tabla.length){el.innerHTML=`<div style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin tabla para esta vigencia.</div>`;return;}
  el.innerHTML=`
    <div style="padding:0 20px 16px;">
      <div style="font-size:12px;color:var(--texto-suave);margin-bottom:12px;">
        Los valores de CUR se actualizan según resolución de ARCA. Vigencia desde: <strong>${vigencia}</strong>
      </div>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          <thead><tr style="background:#374151;color:white;">
            <th style="padding:8px 12px;border:1px solid #6b7280;text-align:center;">Cat.</th>
            <th style="padding:8px;border:1px solid #6b7280;text-align:right;">Límite anual</th>
            <th style="padding:8px;border:1px solid #6b7280;text-align:right;">CUR Provincia</th>
            <th style="padding:8px;border:1px solid #6b7280;text-align:right;">CUR Capital</th>
            <th style="padding:8px;border:1px solid #6b7280;text-align:right;">CUR Prov. + familia</th>
            <th style="padding:8px;border:1px solid #6b7280;text-align:right;">CUR Capital + familia</th>
          </tr></thead>
          <tbody>
            ${tabla.map(r=>`<tr>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── Recategorizar ──
function recategorizarModal(idx){
  const r=(DB.monotributos||[])[idx]; if(!r) return;
  const anio=parseInt($('mono-anio')?.value)||new Date().getFullYear();
  const v=getVigenciaActual();
  const proy=getProyeccionAnual(r.nombre,anio);
  const tabla=getTablaVigente(v);
  const catSugerida=tabla.find(row=>row.limiteAnual>=proy)?.cat||'K';
  if(!confirm(`¿Recategorizar a ${r.nombre} de categoría ${r.categoria} a ${catSugerida}?

Proyección anual: $${proy.toLocaleString('es-AR')}
Nuevo límite: $${(getLimiteCategoria(catSugerida,v)||0).toLocaleString('es-AR')}`)) return;
  // Guardar historial
  if(!r.historialCategorias) r.historialCategorias=[];
  r.historialCategorias.push({cat:r.categoria, desde:r.fechaAlta||'—', hasta:new Date().toLocaleDateString('es-AR')});
  r.categoria=catSugerida;
  r.cur=0; // Reset CUR para que se recalcule según nueva categoría
  toast('✅ Recategorizado a '+catSugerida+'. Actualizá el CUR manualmente desde ARCA.');
  renderMonotributos();
}

function mantenerCategoria(idx){
  const r=(DB.monotributos||[])[idx]; if(!r) return;
  r.estado='Al día'; // Marca como revisado
  toast('Manteniendo categoría '+r.categoria+' para '+r.nombre);
  renderMonotributos();
}

// ── Historial de categorías ──
function verHistorialCat(idx){
  const r=(DB.monotributos||[])[idx]; if(!r) return;
  const hist=r.historialCategorias||[];
  if(!hist.length){toast('Sin historial de categoría para '+r.nombre);return;}
  const lineas=hist.map(h=>'Cat. '+h.cat+': desde '+h.desde+' hasta '+h.hasta);
  lineas.push('Categoría actual: '+r.categoria);
  alert(lineas.join('\n'));
}

// ── Nueva vigencia de tabla ──
function abrirModalNuevaVigencia(){
  abrirModal('modal-nueva-vigencia-mono');
}
function guardarNuevaVigencia(){
  const desde=$('nvig-desde')?.value;
  const jsonStr=$('nvig-json')?.value.trim();
  if(!desde){toast('Ingresá la fecha de vigencia');return;}
  let tabla;
  try{
    tabla=JSON.parse(jsonStr);
    if(!Array.isArray(tabla)) throw new Error();
  } catch(e){
    // Si no es JSON, copiar la tabla vigente actual
    tabla=JSON.parse(JSON.stringify(getTablaVigente(getVigenciaActual())));
  }
  if(!DB.monoTablas) DB.monoTablas={};
  DB.monoTablas[desde]=tabla;
  supaSync('monoTablas', DB.monoTablas[DB.monoTablas.length-1]); cerrarModal('modal-nueva-vigencia-mono');
  toast('✅ Nueva vigencia guardada: '+desde);
  renderTablasCategorias();
}


// ══════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES MONOTRIBUTOS
// ══════════════════════════════════════════════════════════
function abrirModalNuevoMonotributo(idx=null){
  const r=idx!==null?(DB.monotributos||[])[idx]:{};
  if($('mono-modal-title')) $('mono-modal-title').textContent=idx!==null?'Editar monotributista':'Nuevo monotributista';
  if($('mono-idx'))         $('mono-idx').value=idx!==null?idx:'';
  if($('mono-nombre'))      $('mono-nombre').value=r.nombre||'';
  if($('mono-cuit'))        $('mono-cuit').value=r.cuit||'';
  if($('mono-categoria'))   $('mono-categoria').value=r.categoria||'';
  if($('mono-fechaAlta'))   $('mono-fechaAlta').value=r.fechaAlta||new Date().toISOString().slice(0,10);
  if($('mono-zona'))        $('mono-zona').value=r.zona||'provincia';
  if($('mono-obraSocial'))  $('mono-obraSocial').value=r.obraSocial?'true':'false';
  if($('mono-cur'))         $('mono-cur').value=r.cur||0;
  if($('mono-estado'))      $('mono-estado').value=r.estado||'Al día';
  if($('mono-obs'))         $('mono-obs').value=r.obs||'';
  const dl=$('dl-mono-nombre');
  if(dl) dl.innerHTML=(DB.legajos||[]).filter(l=>l.estado==='Activo').map(l=>`<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
  abrirModal('modal-monotributo');
}
function editarMonotributo(i){abrirModalNuevoMonotributo(i);}
function eliminarMonotributo(i){
  if(!confirm('¿Eliminar este registro?')) return;
  DB.monotributos.splice(i,1);
  renderMonotributos();
  toast('Registro eliminado');
}
function guardarMonotributo(){
  const idx=$('mono-idx')?.value;
  const existing=idx!==''?(DB.monotributos||[])[parseInt(idx)]:{};
  const obj={
    nombre:$('mono-nombre')?.value.trim(),
    cuit:$('mono-cuit')?.value.trim(),
    categoria:$('mono-categoria')?.value,
    fechaAlta:$('mono-fechaAlta')?.value,
    zona:$('mono-zona')?.value||'provincia',
    obraSocial:$('mono-obraSocial')?.value==='true',
    jubilado:$('mono-jubilado')?.value==='true',
    cur:parseFloat($('mono-cur')?.value)||0,
    estado:$('mono-estado')?.value||'Al día',
    obs:$('mono-obs')?.value.trim(),
    historialCategorias:existing.historialCategorias||[],
  };
  if(!obj.nombre){toast('Ingresá el nombre');return;}
  if(!obj.categoria){toast('Seleccioná una categoría');return;}
  if(idx!=='') DB.monotributos[parseInt(idx)]={...existing,...obj};
  else DB.monotributos.push({...obj,id:Date.now()});
  cerrarModal('modal-monotributo');
  supaSync('monotributos', DB.monotributos[DB.monotributos.length-1]); toast('✅ Monotributista guardado');
  renderMonotributos();
}


// MÓDULO UNIFORMES — migrado por completo a src/modules/uniformes/
// (rediseño v2, política A.11, ver sql/v032_uniformes.sql). El código
// viejo que vivía acá (tabla plana `uniformes`, sin ciclo de estados)
// se eliminó: ya no está registrado en ningún screenConfig desde que
// se migró (ver main.js).

// ══════════════════════════════════════════════════════════
// MÓDULO RETENCIONES
// ══════════════════════════════════════════════════════════
function renderRetenciones(){
  const filtro=$('ret2-filtro')?.value||'';
  const rows=(DB.retenciones||[]).filter(r=>!filtro||r.tipo===filtro);
  const all=DB.retenciones||[];
  if($('st-ret2-total'))      $('st-ret2-total').textContent      = all.length;
  if($('st-ret2-conflicto'))  $('st-ret2-conflicto').textContent  = all.filter(r=>r.tipo==='conflicto'&&r.estado==='Activa').length;
  if($('st-ret2-enfermedad')) $('st-ret2-enfermedad').textContent = all.filter(r=>r.tipo==='enfermedad'&&r.estado==='Activa').length;
  const totalMonto=all.filter(r=>r.estado==='Activa').reduce((s,r)=>s+(parseFloat(r.monto)||0),0);
  if($('st-ret2-monto')) $('st-ret2-monto').textContent='$'+totalMonto.toLocaleString('es-AR');
  const tbody=$('tbody-ret2');if(!tbody)return;
  if(!rows.length){tbody.innerHTML=`<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin retenciones registradas.</td></tr>`;return;}
  const tipoLabel={'conflicto':'⚡ Conflicto','enfermedad':'🏥 Enfermedad','otra':'📋 Otra'};
  const estadoColor={'Activa':'badge-rojo','Liberada':'badge-verde','Pendiente':'badge-naranja'};
  tbody.innerHTML=rows.map((r,i)=>`<tr>
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${r.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.nroSocio||'—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);"><span class="chip" style="font-size:11px;">${tipoLabel[r.tipo]||r.tipo||'—'}</span></td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.periodo||'—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--rojo);">$${(parseFloat(r.monto)||0).toLocaleString('es-AR')}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;max-width:200px;">${r.motivo||'—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><span class="badge ${estadoColor[r.estado]||'badge-gris'}">${r.estado||'—'}</span></td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">
      <button class="btn btn-xs btn-secondary" onclick="editarRetencion(${i})">✏️</button>
      <button class="btn btn-xs" style="background:#dcfce7;color:#065f46;border:1px solid #9fdaba;" onclick="liberarRetencion(${i})">Liberar</button>
    </td>
  </tr>`).join('');
}
function abrirModalNuevaRetencion(idx=null){
  const r=idx!==null?(DB.retenciones||[])[idx]:{};
  $('ret2-modal-title').textContent=idx!==null?'Editar retención':'Nueva retención';
  $('ret2-idx').value=idx!==null?idx:'';
  ['nombre','nroSocio','tipo','periodo','monto','motivo','estado'].forEach(f=>{
    const el=$('ret2-'+f);if(el)el.value=r[f]||'';
  });
  if($('ret2-estado')&&!r.estado) $('ret2-estado').value='Activa';
  if($('ret2-periodo')&&!r.periodo) $('ret2-periodo').value=new Date().toISOString().slice(0,7);
  const dl=$('dl-ret2-nombre');
  if(dl) dl.innerHTML=(DB.legajos||[]).filter(l=>l.estado==='Activo').map(l=>`<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
  abrirModal('modal-retencion');
}
function editarRetencion(i){abrirModalNuevaRetencion(i);}
function liberarRetencion(i){
  if(!confirm('¿Liberar esta retención?')) return;
  DB.retenciones[i].estado='Liberada';
  toast('✅ Retención liberada');renderRetenciones();
}
function guardarRetencion(){
  const idx=$('ret2-idx')?.value;
  const obj={
    nombre:$('ret2-nombre')?.value.trim(),nroSocio:$('ret2-nroSocio')?.value.trim(),
    tipo:$('ret2-tipo')?.value,periodo:$('ret2-periodo')?.value,
    monto:parseFloat($('ret2-monto')?.value)||0,motivo:$('ret2-motivo')?.value.trim(),
    estado:$('ret2-estado')?.value||'Activa',fecha:new Date().toLocaleDateString('es-AR'),
  };
  if(!obj.nombre){toast('Ingresá el nombre');return;}
  if(idx!=='') DB.retenciones[parseInt(idx)]=obj;
  else DB.retenciones.push({...obj,id:Date.now()});
  cerrarModal('modal-retencion');
  supaSync('retenciones', DB.retenciones[DB.retenciones.length-1]); toast('✅ Retención guardada');renderRetenciones();
}


// ========== PEDIDOS DE ADELANTOS + GESTIÓN DE ADELANTOS — migrado a src/modules/pedidos_adelantos/ + src/modules/gestion_adelantos/ (mis_adelantos / Portal del asociado NO se tocó, sigue mas abajo) ==========

const _grillasExpandidas = new Set();

function renderGrillasLiq(){
  const mes=$('liq-mes-sel')?.value||(new Date().toISOString().slice(0,7));
  const buscar=($('liq-buscar-serv')||{value:''}).value.toLowerCase().trim();
  const supFil=($('liq-sup-fil')||{value:''}).value;
  const tipoFil=($('liq-tipo-fil')||{value:''}).value;

  // Filtro por perfil del supervisor logueado
  const esSupervisor=currentUser?.perfil==='Supervisor';

  // Obtener todas las grillas del mes + objetivos sin grilla (como filas vacías)
  let objetivosVisibles=DB.objetivos.filter(o=>o.estado==='Operativo');
  if(esSupervisor){
    // Supervisor solo ve sus servicios
    objetivosVisibles=objetivosVisibles.filter(o=>o.supervisor===currentUser.funcion||o.supervisor===currentUser.nombre||DB.legajos.some(l=>l.servicio===o.codigo&&l.supervisor===currentUser.nombre));
  }
  if(supFil) objetivosVisibles=objetivosVisibles.filter(o=>o.supervisor===supFil);
  if(buscar) objetivosVisibles=objetivosVisibles.filter(o=>o.nombre.toLowerCase().includes(buscar)||o.codigo.toLowerCase().includes(buscar)||(DB.clientes.find(c=>c.id===o.clienteId)?.nombre||'').toLowerCase().includes(buscar));
  if(tipoFil) /* filtrar por tipo de grilla asociada */ 0;

  const dias=getDiasDelMes(mes);
  const dN=['D','L','M','X','J','V','S'];

  const thead=$('thead-servicios-compacta');
  const tbody=$('tbody-servicios-compacta');
  if(!thead||!tbody) return;

  // Calcular horas totales por día para la fila de totales generales
  const totalesDia={};dias.forEach(d=>totalesDia[d.iso]=0);

  // Header
  thead.innerHTML=`<tr style="background:#374151;color:white;">
    <th style="padding:8px 14px;border:1px solid #6b7280;text-align:left;min-width:240px;position:sticky;left:0;background:white;color:#374151;z-index:3;">
      Servicio / Asociado
    </th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:110px;">Categoría</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:120px;">Cat. alternativa</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:100px;">Supervisor</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:90px;text-align:center;">Tipo hs</th>
    ${dias.map(dia=>{
      const bg=dia.esFeriado?'background:#ffe4e6;color:#111;font-weight:800;':dia.esFinde?'background:#ffff00;color:#111;font-weight:700;':'';
      return`<th style="padding:4px 2px;border:1px solid #6b7280;text-align:center;min-width:30px;font-size:10px;${bg}">
      ${dia.d}</th>`;
    }).join('')}
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:65px;">Total hs</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:95px;">Valor hora</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:65px;">Fact.</th>
    <th style="padding:8px;border:1px solid #6b7280;text-align:right;min-width:95px;">A pagar $</th>
    <th style="padding:8px;border:1px solid #6b7280;min-width:80px;"></th>
  </tr>`;

  if(!objetivosVisibles.length){
    tbody.innerHTML=`<tr><td colspan="100" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      ${esSupervisor?'No tenés servicios asignados':'Sin servicios para mostrar'}
    </td></tr>`;
    return;
  }

  // Construir filas
  let html='';
  objetivosVisibles.forEach(obj=>{
    const cli=DB.clientes.find(c=>c.id===obj.clienteId);
    let grilla=DB.grillasLiq.find(g=>g.periodo===mes&&g.objCodigo===obj.codigo);
    const params=DB.parametrosServicio[obj.codigo]||{diasSemana:[1,2,3,4,5],horasPorDia:8};
    const expandido=_grillasExpandidas.has(obj.codigo);

    // Calcular totales de la fila resumen
    let totalHsObj=0,totalFactObj=0,totalPagarObj=0;
    const horasPorDia={};
    dias.forEach(dia=>{
      let sumDia=0;
      if(grilla){
        (grilla.asociados||[]).forEach(asoc=>{
          const h=parseFloat(asoc.horas?.[dia.iso]||0);
          sumDia+=h;
          if(esHoraFacturableReal(asoc,dia.iso)) totalFactObj+=h;
          totalPagarObj+=0; // se recalcula abajo
        });
      } else {
        // Sin grilla: mostrar horas esperadas según parámetros
        const dow=new Date(dia.iso+'T12:00:00').getDay();
        const ok=params.diasSemana.includes(dow)&&(params.trabajaFeriados||!dia.esFeriado)&&(params.trabajaFinde||!dia.esFinde);
        sumDia=ok?(obj.efts||1)*params.horasPorDia:0;
      }
      horasPorDia[dia.iso]=sumDia;
      totalHsObj+=sumDia;
      totalesDia[dia.iso]=(totalesDia[dia.iso]||0)+sumDia;
    });
    if(grilla){
      let tFact=0,tPagar=0;
      (grilla.asociados||[]).forEach(asoc=>{
        dias.forEach(dia=>{
          const h=parseFloat(asoc.horas?.[dia.iso]||0);
          if(!h)return;
          if(esHoraFacturableReal(asoc,dia.iso))tFact+=h;
          // DELTA_liquidacion_horas_v1 — valor hora real (con vigencia
          // por mes) en vez del legacy getCategoriaVH sin vigencia; día
          // a día porque el valor puede cambiar a mitad de mes.
          const vh=valorHoraEfectivoAsoc(asoc,obj.nombre,dia.iso);
          tPagar+=h*(vh?.valorHora||0);
        });
      });
      totalFactObj=tFact;totalPagarObj=Math.round(tPagar);
      grilla.totalHorasFacturables=tFact;grilla.totalAPagar=totalPagarObj;
    }

    const alertaEFT=grilla?.alertaEFT?`<span class="liq-badge-tipo" style="background:#fef3c7;color:#92400e;">⚠️ EFT</span>`:'';
    const estadoGrilla=grilla?`<span class="liq-badge-tipo" style="background:${grilla.estado==='Cerrada'?'#d1fae5;color:#065f46':'#dbeafe;color:#1e40af'};">${grilla.estado==='Cerrada'?'✓ Cerrada':'Abierta'}</span>`:'<span class="liq-badge-tipo" style="background:#f3f4f6;color:#6b7280;">Sin grilla</span>';

    // FILA RESUMEN DEL SERVICIO (siempre visible)
    html+=`<tr class="liq-row-servicio${expandido?' expandido':''}" onclick="toggleGrilla('${obj.codigo}')" data-obj="${obj.codigo}">
      <td style="padding:8px 12px;border:1px solid #6b7280;position:sticky;left:0;background:inherit;font-weight:700;color:white;">
        <span class="liq-toggle-icon">▶</span>
        ${obj.nombre}
        ${alertaEFT}
        <span style="font-size:10px;opacity:.7;margin-left:6px;">${obj.codigo}</span>
      </td>
      <td style="padding:6px 8px;border:1px solid #6b7280;font-size:11px;color:rgba(255,255,255,.5);">—</td>
      <td style="padding:6px 8px;border:1px solid #6b7280;"></td>
      <td style="padding:6px 8px;border:1px solid #6b7280;font-size:11px;color:rgba(255,255,255,.8);">${obj.supervisor||'—'}</td>
      <td style="padding:6px 8px;border:1px solid #6b7280;"></td>
      ${dias.map(dia=>{
        const h=horasPorDia[dia.iso]||0;
        const bg='';
        return`<td class="liq-celda-dia" style="border:1px solid #6b7280;${bg}color:${h>0?'white':'rgba(255,255,255,.35)'};">${h||''}</td>`;
      }).join('')}
      <td style="padding:6px 8px;border:1px solid #6b7280;text-align:right;font-weight:700;color:white;">${totalHsObj}hs</td>
      <td style="padding:6px 8px;border:1px solid #6b7280;"></td>
      <td style="padding:6px 8px;border:1px solid #6b7280;text-align:right;font-size:11px;color:rgba(255,255,255,.8);">${totalFactObj}hs</td>
      <td style="padding:6px 8px;border:1px solid #6b7280;text-align:right;font-weight:700;color:#86efac;">$${(totalPagarObj||0).toLocaleString('es-AR')}</td>
      <td style="padding:6px 8px;border:1px solid #2d5a9e;">${estadoGrilla}</td>
    </tr>`;

    // FILAS DETALLE (visibles solo cuando expandido)
    if(expandido){
      // Auto-crear grilla si no existe, precargando los asociados asignados
      if(!grilla){
        crearGrillaDesdeObj(obj.codigo, mes);
        grilla=DB.grillasLiq.find(g=>g.periodo===mes&&g.objCodigo===obj.codigo);
      }
      if(grilla){
        // Mostrar filas de asociados
        const asocs=grilla.asociados||[];
        if(true){  // siempre entra
          asocs.forEach((asoc,ai)=>{
            let hsAsoc=0,hsFactAsoc=0,totalPagarAsoc=0;
            dias.forEach(dia=>{
              const h=parseFloat(asoc.horas?.[dia.iso]||0);
              hsAsoc+=h;
              if(esHoraFacturableReal(asoc,dia.iso))hsFactAsoc+=h;
              if(h){const vhDia=valorHoraEfectivoAsoc(asoc,obj.nombre,dia.iso);totalPagarAsoc+=h*(vhDia?.valorHora||0);}
            });
            totalPagarAsoc=Math.round(totalPagarAsoc);
            const legajoAsoc=(DB.legajos||[]).find(l=>String(l.nro)===String(asoc.nro));
            const vhInfo=valorHoraEfectivoAsoc(asoc,obj.nombre,fechaRepresentativaMes(mes));
            const tipoClass=asoc.esReten?'reten':asoc.esEspecial?'especial':asoc.esExtra?'extra':asoc.esEnfermedad?'enfermedad':'';
            const tipoBadge=asoc.esReten?'<span class="liq-badge-tipo liq-badge-reten">Retén</span>':asoc.esEspecial?'<span class="liq-badge-tipo liq-badge-especial">T.Esp.</span>':asoc.esExtra?'<span class="liq-badge-tipo liq-badge-extra">Extra</span>':asoc.esEnfermedad?'<span class="liq-badge-tipo liq-badge-enf">Enf.</span>':'';
            html+=`<tr class="liq-row-asociado ${tipoClass}" data-parent="${obj.codigo}">
              <td style="padding:5px 12px 5px 28px;border:1px solid var(--borde);font-size:12px;position:sticky;left:0;background:inherit;z-index:1;">
                ${asoc.nombre} ${tipoBadge}
              </td>
              <td style="padding:4px 8px;border:1px solid var(--borde);font-size:11px;">
                <div style="font-weight:500;color:var(--azul);">${asoc.categoria||'—'}</div>
                ${legajoAsoc?.categoriaIdLocal
                  ? `<div style="font-size:9px;color:var(--texto-suave);">🔗 ${getCategoriaById(legajoAsoc.categoriaIdLocal)?.nombre||'—'}</div>`
                  : `<select style="width:100%;font-size:9px;padding:1px 2px;border:1px solid var(--rojo);border-radius:3px;outline:none;background:#fff5f5;margin-top:2px;"
                       onclick="event.stopPropagation()"
                       onchange="event.stopPropagation();asignarCategoriaLegajo('${asoc.nro}',this.value)">
                       <option value="">⚠ Vincular categoría</option>
                       ${(DB.categoriasBase||[]).filter(c=>c.activa).map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}
                     </select>`
                }
              </td>
              <td style="padding:2px 4px;border:1px solid var(--borde);font-size:11px;min-width:120px;">
                ${asoc.catAltEstado==='Pendiente'
                  ? `<span style="background:#fef3c7;color:#92400e;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:600;" title="Pendiente de aprobación de Operaciones — ver en Autorizaciones pendientes">⏳ ${asoc.catAltNombre}</span>`
                  : asoc.catAltEstado==='Aprobada'
                    ? `<span style="background:#d1fae5;color:#065f46;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:600;" title="Compite por el valor más alto contra la categoría de legajo">✓ ${asoc.catAltNombre}</span>`
                    : `<select style="width:100%;font-size:10px;padding:2px 3px;border:1px solid var(--borde-fuerte);border-radius:4px;outline:none;background:white;"
                         onclick="event.stopPropagation()"
                         onchange="event.stopPropagation();solicitarCatAlt('${grilla.id}',${ai},this.value)"
                         ${grilla.estado==='Cerrada'?'disabled':''}>
                         <option value="">— Sin alternativa —</option>
                         ${(DB.categoriasBase||[]).filter(c=>c.activa).map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}
                       </select>`
                }
              </td>
              <td style="padding:4px 8px;border:1px solid var(--borde);font-size:11px;color:var(--texto-suave);"></td>
              <td style="padding:2px 4px;border:1px solid var(--borde);min-width:90px;">
                <select style="width:100%;font-size:10px;padding:2px 3px;border:1px solid var(--borde-fuerte);border-radius:4px;outline:none;background:white;"
                        onclick="event.stopPropagation()"
                        onchange="event.stopPropagation();setTipoHoraAsoc('${grilla.id}',${ai},this.value)"
                        ${grilla.estado==='Cerrada'?'disabled':''}>
                  <option value="facturable"   ${(!asoc.tipoHora||asoc.tipoHora==='facturable')?'selected':''}>✅ Facturable</option>
                  <option value="no_facturable" ${asoc.tipoHora==='no_facturable'?'selected':''}>❌ No facturable</option>
                  <option value="art42"         ${asoc.tipoHora==='art42'?'selected':''}>🏥 Art. 42</option>
                  <option value="reten"          ${asoc.tipoHora==='reten'?'selected':''}>🔄 Retén</option>
                </select>
                ${asoc.tipoHora==='no_facturable'&&asoc.motivoTipo?`<div style="font-size:9px;color:var(--rojo);margin-top:2px;">${asoc.motivoTipo}</div>`:''}
                ${asoc.tipoHora==='art42'?`<div style="font-size:9px;color:#7c3aed;margin-top:2px;">Art.42</div>`:''}
              </td>
              ${dias.map(dia=>{
                const rawVal=asoc.horas?.[dia.iso];
                const esEsp=['F','AJ','AI'].includes(String(rawVal||'').toUpperCase());
                const h=esEsp?0:parseFloat(rawVal||0);
                const dispVal=esEsp?String(rawVal).toUpperCase():(h||'');
                const noFact=asoc.facturable?.[dia.iso]===false;
                const dow=new Date(dia.iso+'T12:00:00').getDay();
                const esTrab=params.diasSemana?.includes(dow)&&(params.trabajaFeriados||!dia.esFeriado)&&(params.trabajaFinde||!dia.esFinde);
                // Rango del asociado — solo para colorear, NO para bloquear edición
                const dentroRango=(!asoc.rangoDesde||dia.iso>=asoc.rangoDesde)&&(!asoc.rangoHasta||dia.iso<=asoc.rangoHasta);
                // Estado de autorización de este día
                // Buscar en pendientes activos Y en historial para colorear
                const pendAuth=(DB.pendientesAuth||[]).find(p=>p.grillaId===grilla.id&&p.asocIdx===ai)
                             ||(DB.historialAuth||[]).find(p=>p.grillaId===grilla.id&&p.asocIdx===ai&&!p.supervisorNotificado);
                const pendColor = pendAuth
                  ? pendAuth.estado==='Pendiente'
                    ? 'background:#fef3c7;'  // amarillo — pendiente
                    : pendAuth.estado==='Rechazada'&&!pendAuth.supervisorNotificado
                      ? 'background:#dc2626;color:white;'  // rojo — rechazada
                      : ''
                  : '';
                // Color de fondo
                const bgCell=(h>0||esEsp)
                  ? pendColor||(dia.esFeriado?'background:#ffe4e6;':dia.esFinde?'background:#ffff00;':'')
                  :(dentroRango&&!esTrab?'background:#f5f5f5;':'');
                // Color del texto: F=violeta, AJ=naranja, AI=rojo, noFact=rojo, horas=azul
                const colorVal=esEsp&&rawVal==='F'?'color:#7c3aed;font-weight:700;'
                  :esEsp&&rawVal==='AJ'?'color:#d97706;font-weight:700;'
                  :esEsp?'color:#dc2626;font-weight:700;'
                  :noFact?'color:var(--rojo);'
                  :h>0?'color:var(--azul);font-weight:600;'
                  :'color:var(--texto-muy-suave);';
                return`<td class="liq-celda-dia ${dia.esFeriado?'feriado':dia.esFinde?'finde':!esTrab?'no-laboral':''}" style="border:1px solid var(--borde);${bgCell}">
                  <input type="text" value="${dispVal}"
                    placeholder="${esTrab&&dentroRango&&!h?(params.horasPorDia||8):''}"
                    title="Ingresá horas (ej: 8), F=Franco, AJ=Aus.Justificada, AI=Aus.Injustificada"
                    style="width:30px;${colorVal}border:none;background:transparent;text-align:center;font-size:11px;outline:none;padding:1px 0;text-transform:uppercase;"
                    ${grilla.estado==='Cerrada'?'disabled':''}
                    onclick="event.stopPropagation()"
                    onchange="event.stopPropagation();setHoraGrilla('${grilla.id}',${ai},'${dia.iso}',this.value.trim().toUpperCase())">
                </td>`;
              }).join('')}
              <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:var(--azul);">${hsAsoc}hs</td>
              <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-size:11px;${vhInfo?'color:var(--texto-suave);':'color:var(--rojo);font-weight:600;'}" title="${vhInfo?'Valor hora vigente ('+fechaRepresentativaMes(mes)+')':'Sin categoría vinculada o sin valor cargado en el módulo Categorías'}">${vhInfo?'$'+Math.round(vhInfo.valorHora).toLocaleString('es-AR'):'Sin valor'}</td>
              <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-size:11px;">${hsFactAsoc}hs</td>
              <td style="padding:4px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--verde);">$${totalPagarAsoc.toLocaleString('es-AR')}</td>
              <td style="padding:4px 8px;border:1px solid var(--borde);">
                <button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--rojo);" onclick="event.stopPropagation();quitarAsociadoGrilla('${grilla.id}',${ai})">✕</button>
              </td>
            </tr>`;
          });
          // Fila de totales + buscador para agregar asociados
          html+=`<tr class="liq-row-totales" data-parent="${obj.codigo}">
            <td colspan="5" style="padding:6px 14px 6px 28px;border:1px solid var(--borde);position:sticky;left:0;background:#6b7280;z-index:1;">
              ${grilla.estado!=='Cerrada'?`<button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="event.stopPropagation();cerrarGrilla('${grilla.id}')">✓ Cerrar</button>`:'<span style="font-size:11px;color:white;opacity:.7;">✓ Cerrada</span>'}
            </td>
            ${dias.map(dia=>{
              const tot=(grilla.asociados||[]).reduce((s,a)=>s+parseFloat(a.horas?.[dia.iso]||0),0);
              return`<td style="padding:4px 2px;border:1px solid var(--borde);text-align:center;font-size:11px;font-weight:700;color:white;">${tot||''}</td>`;
            }).join('')}
            <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:var(--azul);">${grilla.totalHorasFacturables+(grilla.totalHorasNoFacturables||0)}hs</td>
            <td style="border:1px solid var(--borde);"></td>
            <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${grilla.totalHorasFacturables||0}hs</td>
            <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:700;color:var(--verde);">$${(grilla.totalAPagar||0).toLocaleString('es-AR')}</td>
            <td style="border:1px solid var(--borde);"></td>
          </tr>
          <tr data-parent="${obj.codigo}" style="background:#f9fafb;">
            <td colspan="4" style="padding:6px 12px 6px 28px;border:1px solid var(--borde);background:#f9fafb;position:sticky;left:0;z-index:1;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11px;color:var(--texto-suave);white-space:nowrap;">+ Agregar:</span>
                <input type="text" id="busq-asoc-${grilla.id}"
                  placeholder="Buscar asociado por nombre o N° socio..."
                  style="width:260px;padding:3px 8px;border:1px solid var(--borde-fuerte);border-radius:5px;font-size:11px;outline:none;"
                  oninput="buscarAsocGrilla('${grilla.id}',this.value)"
                  onclick="event.stopPropagation()"
                  onkeydown="handleBuscadorKeydown(event,'${grilla.id}')">
              </div>
              <div id="res-asoc-${grilla.id}" style="margin-top:4px;display:none;max-height:140px;overflow-y:auto;border:1px solid var(--borde);border-radius:5px;background:white;"></div>
            </td>
            <td colspan="100" style="border:1px solid var(--borde);background:#f9fafb;"></td>
          </tr>`;
        }
      }
    }
  });

  // Fila de TOTALES GENERALES al final
  const totalGenHs=Object.values(totalesDia).reduce((s,v)=>s+v,0);
  html+=`<tr style="background:white;color:#111;font-weight:800;border-top:2px solid #9ca3af;">
    <td colspan="4" style="padding:10px 14px;border:1px solid #6b7280;position:sticky;left:0;background:white;color:#111;z-index:2;">
      TOTAL GENERAL — ${objetivosVisibles.length} servicio${objetivosVisibles.length!==1?'s':''}
    </td>
    ${dias.map(dia=>{
      const t=totalesDia[dia.iso]||0;
      const bg='background:#e9ecef;';
      return`<td style="padding:6px 2px;border:1px solid #6b7280;text-align:center;font-size:11px;${bg}">${t||''}</td>`;
    }).join('')}
    <td style="padding:10px 8px;border:1px solid #6b7280;text-align:right;">${totalGenHs}hs</td>
    <td colspan="3" style="border:1px solid #6b7280;"></td>
    <td style="border:1px solid #6b7280;"></td>
  </tr>`;

  tbody.innerHTML=html;
}

function buscarAsocGrilla(grillaId, query){
  const resEl=document.getElementById('res-asoc-'+grillaId);
  if(!resEl) return;
  const q=query.trim().toLowerCase();
  if(!q){resEl.style.display='none';resEl.innerHTML='';return;}
  const grilla=DB.grillasLiq.find(g=>g.id===grillaId);
  if(!grilla) return;
  const yaEnGrilla=new Set((grilla.asociados||[]).map(a=>a.nombre));
  const resultados=DB.legajos.filter(l=>
    l.estado==='Activo'&&
    !yaEnGrilla.has(l.nombre)&&
    (l.nombre.toLowerCase().includes(q)||(l.nro&&String(l.nro).includes(q)))
  ).slice(0,8);
  if(!resultados.length){
    resEl.style.display='block';
    resEl.innerHTML='<div style="padding:8px 12px;font-size:11px;color:var(--texto-suave);">Sin resultados</div>';
    return;
  }
  resEl.style.display='block';
  // Usar data-attributes para evitar problemas con caracteres especiales en nombres
  resEl.innerHTML=resultados.map(l=>`
    <div class="res-asoc-item"
         data-grilla="${grillaId}"
         data-nombre="${encodeURIComponent(l.nombre)}"
         data-categoria="${encodeURIComponent(l.categoria||l.funcion||'')}"
         data-nro="${l.nro||''}"
         style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--borde);font-size:12px;cursor:pointer;"
         onmouseover="this.style.background='var(--azul-claro)'" 
         onmouseout="this.style.background=''"
         onclick="event.stopPropagation();seleccionarAsocSearch(this)">
      <span><strong>${l.nombre}</strong> <span style="color:var(--texto-suave);margin-left:6px;">N°${l.nro||'—'}</span></span>
      <span style="color:var(--texto-suave);font-size:11px;">${l.categoria||l.funcion||'—'} · ${l.servicio||'Sin servicio'}</span>
    </div>`).join('');
}

// Seleccionar asociado desde el resultado de búsqueda (usa data-attributes)
function seleccionarAsocSearch(el){
  const grillaId  = el.dataset.grilla;
  const nombre    = decodeURIComponent(el.dataset.nombre);
  const categoria = decodeURIComponent(el.dataset.categoria);
  const nro       = el.dataset.nro;
  agregarAsocDesdeSearch(grillaId, nombre, categoria, nro);
}

function toggleGrilla(objCodigo){
  if(_grillasExpandidas.has(objCodigo)) _grillasExpandidas.delete(objCodigo);
  else _grillasExpandidas.add(objCodigo);
  renderGrillasLiq();
}

function expandirTodasGrillas(){
  const mes=$('liq-mes-sel')?.value||(new Date().toISOString().slice(0,7));
  const btn=$('btn-expandir-todo');
  const hayExpandidas=_grillasExpandidas.size>0;
  if(hayExpandidas){
    _grillasExpandidas.clear();
    if(btn) btn.textContent='↕ Expandir todo';
  } else {
    DB.objetivos.filter(o=>o.estado==='Operativo').forEach(o=>_grillasExpandidas.add(o.codigo));
    if(btn) btn.textContent='↕ Comprimir todo';
  }
  renderGrillasLiq();
}

function crearGrillaDesdeObj(objCodigo, mes){
  const obj=DB.objetivos.find(o=>o.codigo===objCodigo); if(!obj) return;
  const calc=calcularHorasMes(mes,objCodigo);
  const legajosAsignados=(DB.legajos||[]).filter(l=>l.servicio===obj.codigo&&l.estado==='Activo');
  legajosAsignados.forEach(l=>validarValorHoraAsociado(l.nro, objCodigo));
  const asocAsignados=legajosAsignados.map(l=>({
    id:l.nro, nro:l.nro, nombre:l.nombre, categoria:l.funcion||'Operario/a limpieza',
    horas:generarHorasPrecargas(mes,obj.codigo), facturable:{}, motivoNoFact:{}, infoEFT:{}, tipoHora:'facturable', motivoTipo:'', esExtra:false, esEnfermedad:false,
  }));
  const nueva={
    id:'GRL-'+Date.now(), periodo:mes, tipo:'servicio',
    objCodigo:obj.codigo, nombre:obj.nombre,
    supervisor:obj.supervisor||'',
    efts:obj.efts||null, horasEFT:obj.efts?obj.efts*200:null,
    horasContratadas:calc.totalHoras,
    asociados:asocAsignados, estado:'Abierta', alertaEFT:null,
    totalHorasFacturables:0, totalHorasNoFacturables:0, totalAPagar:0,
  };
  DB.grillasLiq.push(nueva);
  _grillasExpandidas.add(objCodigo);
  supaSync('grillasLiq', nueva);
  renderGrillasLiq();
  toast(`✓ Grilla "${obj.nombre}" creada con ${asocAsignados.length} asociado${asocAsignados.length!==1?'s':''}`);
}

function quitarAsociadoGrilla(grillaId, asocIdx){
  const g=DB.grillasLiq.find(x=>x.id===grillaId); if(!g) return;
  const nombre=g.asociados[asocIdx]?.nombre;
  g.asociados.splice(asocIdx,1);
  supaSync('grillasLiq', g);
  renderGrillasLiq();
  toast(`${nombre} quitado de la grilla`);
}

function renderGrillaIndividual(g){ return ''; } // Mantenida por compatibilidad
function setHoraGrilla(gId,aIdx,fechaISO,valor){
  const g=DB.grillasLiq.find(x=>x.id===gId);if(!g)return;
  const asoc=g.asociados[aIdx];if(!asoc)return;
  if(!asoc.horas)asoc.horas={};

  const valStr=(valor||'').toString().trim().toUpperCase();
  const esEspecial=['F','AJ','AI'].includes(valStr);
  const nuevaHora=esEspecial?0:parseFloat(valor)||0;

  // ── Valores especiales: F=Franco, AJ=Ausencia Justificada, AI=Ausencia Injustificada ──
  if(esEspecial){
    asoc.horas[fechaISO]=valStr;
    if(!asoc.estadoDia)asoc.estadoDia={};
    asoc.estadoDia[fechaISO]=valStr;
    supaSync('grillasLiq', g);
    renderGrillasLiq();
    return;
  }

  // ── Control Art.42: máximo 3 días laborables consecutivos ──
  // Sábado/domingo/feriado NO interrumpen ni suman a la racha
  // Solo un día LABORABLE sin Art.42 interrumpe la racha
  if(asoc.tipoHora==='art42' && nuevaHora>0){
    const esFeriado=(iso)=>(DB.feriados||[]).some(f=>f.fecha===iso);
    const esFinDeSemana=(iso)=>{const d=new Date(iso+'T12:00:00').getDay();return d===0||d===6;};
    const esNoLaboral=(iso)=>esFeriado(iso)||esFinDeSemana(iso);

    let consecutivos=0;
    let diaCheck=new Date(fechaISO+'T12:00:00');
    diaCheck.setDate(diaCheck.getDate()-1);

    for(let i=0;i<60;i++){
      const isoCheck=diaCheck.toISOString().slice(0,10);
      if(esNoLaboral(isoCheck)){
        // Fin de semana o feriado: se saltea sin interrumpir ni sumar
        diaCheck.setDate(diaCheck.getDate()-1);
        continue;
      }
      // Día laborable: verificar si tiene Art.42
      const hCheck=parseFloat(asoc.horas[isoCheck]||0);
      if(hCheck>0){
        consecutivos++;
        if(consecutivos>=3){
          toast('⛔ Este asociado ya tiene 3 días laborables consecutivos de Art. 42. Debe reportarse al módulo de Enfermos y Accidentados.');
          renderGrillasLiq();
          return;
        }
      } else {
        // Día laborable sin Art.42 — corte, fin de la racha
        break;
      }
      diaCheck.setDate(diaCheck.getDate()-1);
    }
  }

  // Guardar el valor numérico
  asoc.horas[fechaISO]=nuevaHora;

  // ── Horas no facturables: aplica a 'no_facturable' Y 'art42' ──
  if(nuevaHora>0 && (asoc.tipoHora==='no_facturable'||asoc.tipoHora==='art42')){
    if(!asoc.facturable)asoc.facturable={};
    asoc.facturable[fechaISO]=false;
    if(!asoc.motivoNoFact)asoc.motivoNoFact={};
    asoc.motivoNoFact[fechaISO]=asoc.tipoHora==='art42'?'Artículo 42':(asoc.motivoTipo||'No facturable');
    const yaReg=(DB.pendientesAuth||[]).some(p=>
      p.grillaId===g.id&&p.asocIdx===aIdx&&p.estado==='Pendiente'&&p.tipo==='no_facturable');
    if(!yaReg){
      if(!DB.pendientesAuth)DB.pendientesAuth=[];
      const pendNF={
        id:Date.now()+Math.random(), tipo:'no_facturable',
        grillaId:g.id, asocIdx:aIdx,
        detalle:asoc.nombre+' — edición manual — '+fechaISO.split('-').reverse().join('/')+(asoc.motivoTipo?' ('+asoc.motivoTipo+')':''),
        solicitadoPor:currentUser?.nombre||'Supervisor',
        fecha:new Date().toLocaleDateString('es-AR'), estado:'Pendiente',
      };
      DB.pendientesAuth.push(pendNF);
      supaSync('pendientesAuthLiq', {...pendNF, grillaId:idLocalTrunc(pendNF.grillaId)});
      toast('⚠️ Horas no facturables cargadas — pendientes de aprobación por Operaciones.');
    }
  }

  // ── Control EFT total del servicio ──
  if(nuevaHora>0 && g.horasEFT){
    const totalHoras=(g.asociados||[]).reduce((s,a)=>
      s+Object.values(a.horas||{}).reduce((ss,h)=>ss+parseFloat(h||0),0),0);
    if(totalHoras>g.horasEFT){
      const exceso=Math.round(totalHoras-g.horasEFT);
      const yaReg=(DB.pendientesAuth||[]).some(p=>
        p.grillaId===g.id&&p.asocIdx===aIdx&&p.estado==='Pendiente'&&p.tipo==='fuera_eft');
      if(!yaReg){
        if(!DB.pendientesAuth)DB.pendientesAuth=[];
        const pendEFT={
          id:Date.now()+Math.random(), tipo:'fuera_eft',
          grillaId:g.id, asocIdx:aIdx,
          detalle:asoc.nombre+' — edición manual — +'+exceso+'hs sobre el EFT del servicio',
          solicitadoPor:currentUser?.nombre||'Supervisor',
          fecha:new Date().toLocaleDateString('es-AR'), estado:'Pendiente',
        };
        DB.pendientesAuth.push(pendEFT);
        supaSync('pendientesAuthLiq', {...pendEFT, grillaId:idLocalTrunc(pendEFT.grillaId)});
        toast('⚠️ El servicio supera el EFT en +'+exceso+'hs. Las horas quedan pendientes de aprobación.');
      }
    }
  }

  verificarEFTGrilla(g);
  supaSync('grillasLiq', g);
  renderGrillasLiq();
}
function setTipoHoraAsoc(gId,aIdx,tipo){
  const g=DB.grillasLiq.find(x=>x.id===gId);if(!g)return;
  const asoc=g.asociados[aIdx];if(!asoc)return;
  asoc.tipoHora=tipo;

  // Aplicar impacto en facturable/motivoNoFact según el tipo
  const dias=Object.keys(asoc.horas||{});
  if(tipo==='facturable'){
    dias.forEach(d=>{asoc.facturable[d]=true;delete asoc.motivoNoFact[d];});
    asoc.motivoTipo='';
  } else if(tipo==='no_facturable'){
    // Abrir selector de motivo
    abrirModalMotivoTipo(gId,aIdx);
    return;
  } else if(tipo==='art42'){
    // Validar máximo 3 días
    const diasConHoras=dias.filter(d=>parseFloat(asoc.horas[d]||0)>0).length;
    if(diasConHoras>3){
      toast('⛔ Art. 42 tiene un máximo de 3 días. Este asociado tiene '+diasConHoras+' días cargados.');
      // Revertir el select
      renderGrillasLiq();
      return;
    }
    dias.forEach(d=>{asoc.facturable[d]=false;asoc.motivoNoFact[d]='Artículo 42';});
    asoc.motivoTipo='Art.42';
    // Registrar pendiente de autorización
    if(!DB.pendientesAuth)DB.pendientesAuth=[];
    const yaReg=(DB.pendientesAuth||[]).some(p=>p.grillaId===g.id&&p.asocIdx===aIdx&&p.estado==='Pendiente'&&p.tipo==='no_facturable');
    if(!yaReg){
      const pendA42={
        id:Date.now()+Math.random(),tipo:'no_facturable',
        grillaId:g.id,asocIdx:aIdx,
        detalle:asoc.nombre+' — Art.42 — '+diasConHoras+' día(s)',
        solicitadoPor:currentUser?.nombre||'Supervisor',
        fecha:new Date().toLocaleDateString('es-AR'),estado:'Pendiente',
      };
      DB.pendientesAuth.push(pendA42);
      supaSync('pendientesAuthLiq', {...pendA42, grillaId:idLocalTrunc(pendA42.grillaId)});
      toast('🏥 Art.42 registrado — pendiente de aprobación por Operaciones');
    }
  }
  supaSync('grillasLiq', g);
  renderGrillasLiq();
}

// Modal para elegir motivo cuando se marca como No facturable desde la columna
let _motipoGId=null,_motipoAIdx=null;
function abrirModalMotivoTipo(gId,aIdx){
  _motipoGId=gId;_motipoAIdx=aIdx;
  const sel=$('motipo-motivo');
  if(sel){
    const activos=(DB.motivosNoFact||[]).filter(m=>m.activo);
    sel.innerHTML='<option value="">— Seleccionar motivo —</option>'+
      activos.map(m=>'<option value="'+m.nombre+'">'+m.nombre+'</option>').join('');
  }
  abrirModal('modal-motivo-tipo');
}
function confirmarMotivoTipo(){
  const motivo=$('motipo-motivo')?.value;
  if(!motivo){toast('Seleccioná un motivo');return;}
  const g=DB.grillasLiq.find(x=>x.id===_motipoGId);if(!g)return;
  const asoc=g.asociados[_motipoAIdx];if(!asoc)return;
  const dias=Object.keys(asoc.horas||{});
  dias.forEach(d=>{asoc.facturable[d]=false;asoc.motivoNoFact[d]=motivo;});
  asoc.motivoTipo=motivo;
  // Registrar pendiente
  if(!DB.pendientesAuth)DB.pendientesAuth=[];
  const yaReg=(DB.pendientesAuth||[]).some(p=>p.grillaId===_motipoGId&&p.asocIdx===_motipoAIdx&&p.estado==='Pendiente');
  if(!yaReg){
    const pendMT={
      id:Date.now()+Math.random(),tipo:'no_facturable',
      grillaId:_motipoGId,asocIdx:_motipoAIdx,
      detalle:asoc.nombre+' — '+motivo,
      solicitadoPor:currentUser?.nombre||'Supervisor',
      fecha:new Date().toLocaleDateString('es-AR'),estado:'Pendiente',
    };
    DB.pendientesAuth.push(pendMT);
    supaSync('pendientesAuthLiq', {...pendMT, grillaId:idLocalTrunc(pendMT.grillaId)});
  }
  supaSync('grillasLiq', g);
  cerrarModal('modal-motivo-tipo');
  toast('✅ Horas marcadas como no facturables — pendiente de aprobación');
  renderGrillasLiq();
}

function verificarEFTGrilla(g){
  if(!g.efts||!g.horasEFT)return;
  const totalHoras=(g.asociados||[]).reduce((total,asoc)=>total+Object.values(asoc.horas||{}).reduce((s,h)=>s+parseFloat(h||0),0),0);
  const diff=totalHoras-g.horasEFT;
  if(diff>0){
    g.alertaEFT=`+${diff}hs`;
    if(!DB.alertasLiquidacion.some(a=>a.grillaId===g.id&&!a.resuelta)){
      DB.alertasLiquidacion.push({id:Date.now(),grillaId:g.id,tipo:'EFT',mensaje:`${g.nombre||g.objCodigo}: ${diff}hs sobre el EFT (${totalHoras}hs vs ${g.horasEFT}hs)`,resuelta:false,fechaAlerta:new Date().toLocaleDateString('es-AR')});
      construirMenu();
    }
  } else {g.alertaEFT=null;}
}

function abrirModalNuevaGrilla(){
  if($('ng-periodo'))$('ng-periodo').value=new Date().toISOString().slice(0,7);
  poblarSelectsLiquidacion();toggleNuevaGrillaTipo();
  if($('ng-precarga-info'))$('ng-precarga-info').style.display='none';
  if($('ng-alerta-eft'))$('ng-alerta-eft').style.display='none';
  abrirModal('modal-nueva-grilla');
}

function toggleNuevaGrillaTipo(){
  const tipo=$('ng-tipo')?.value;
  const row=$('ng-objetivo-row');if(row)row.style.display=(tipo==='administracion')?'none':'grid';
}

function precargarDatosGrilla(){
  const objCod=$('ng-objetivo')?.value;const periodo=$('ng-periodo')?.value;
  if(!objCod||!periodo)return;
  const obj=DB.objetivos.find(o=>o.codigo===objCod);if(!obj)return;
  const calc=calcularHorasMes(periodo,objCod);
  const infoEl=$('ng-precarga-info');const alertaEl=$('ng-alerta-eft');
  if(infoEl){infoEl.style.display='flex';infoEl.innerHTML=`📊 <strong>${obj.nombre}</strong> — ${periodo}: <strong>${calc.totalHoras}hs</strong> (${calc.diasTrabajados.length} días × ${calc.horasPorDia}hs). EFT: ${obj.efts||'Sin EFT'}${obj.efts?' · '+obj.efts*200+'hs':''}`;
  }
  if(obj.efts&&alertaEl){const horasEFT=obj.efts*200;const diff=calc.totalHoras-horasEFT;alertaEl.style.display='flex';alertaEl.innerHTML=diff>0?`⚠️ Horas del mes (${calc.totalHoras}hs) superan el EFT (${horasEFT}hs). +${diff}hs. El supervisor deberá decidir la distribución.`:`✅ Horas dentro del EFT (${horasEFT}hs). Diferencia: ${diff}hs.`;}
  else if(alertaEl)alertaEl.style.display='none';
}

function crearGrilla(){
  const periodo=$('ng-periodo')?.value;const tipo=$('ng-tipo')?.value||'servicio';
  if(!periodo){toast('Seleccioná el período');return;}
  const obj=tipo!=='administracion'?DB.objetivos.find(o=>o.codigo===$('ng-objetivo')?.value):null;
  if(tipo!=='administracion'&&!obj){toast('Seleccioná un objetivo');return;}
  const calc=tipo!=='administracion'?calcularHorasMes(periodo,obj.codigo):{totalHoras:0,diasTrabajados:[]};
  const mkAsoc=(l,objCod)=>({
    id:l.nro, nombre:l.nombre,
    categoriaFija:l.funcion||'Operario/a limpieza',
    categoriaTemporal:'', valorFijo:getCategoriaVH(l.funcion||''), valorTemporal:0,
    tipoHr:'HRS FAC',
    horas:generarHorasPrecargas(periodo,objCod),
    facturable:{}, esExtra:false, esEnfermedad:false, esReten:false, esEspecial:false,
  });
  const asocAsignados=tipo==='administracion'
    ?(DB.legajos||[]).filter(l=>l.servicio==='ADMINISTRATIVO'&&l.estado==='Activo').map(l=>mkAsoc(l,'ADMINISTRATIVO'))
    :(DB.legajos||[]).filter(l=>l.servicio===obj.codigo&&l.estado==='Activo').map(l=>mkAsoc(l,obj.codigo));
  const nueva={id:'GRL-'+Date.now(),periodo,tipo,objCodigo:obj?.codigo||'ADMINISTRACION',nombre:tipo==='administracion'?'Administración':obj?.nombre,supervisor:$('ng-supervisor')?.value||obj?.supervisor||'',efts:obj?.efts||null,horasEFT:obj?.efts?obj.efts*200:null,horasContratadas:calc.totalHoras,asociados:asocAsignados,estado:'Abierta',alertaEFT:null,totalHorasFacturables:0,totalHorasNoFacturables:0,totalAPagar:0};
  DB.grillasLiq.push(nueva);
  cerrarModal('modal-nueva-grilla');renderLiquidacion();
  toast(`✓ Grilla "${nueva.nombre}" — ${periodo} — ${asocAsignados.length} asociado${asocAsignados.length!==1?'s':''}`);
}

function agregarAsociadoGrilla(gId){
  const g=DB.grillasLiq.find(x=>x.id===gId);if(!g)return;
  const nombre=prompt('Nombre o N° de socio del asociado a agregar:');if(!nombre)return;
  const leg=(DB.legajos||[]).find(l=>l.nombre.toLowerCase().includes(nombre.toLowerCase())||String(l.nro)===nombre.trim());
  if(!leg&&!confirm(`No encontré al asociado "${nombre}". ¿Agregarlo igualmente?`)) return;
  const esExtra=leg?confirm('¿Son horas extras? (Cancelar = Normal)'):false;
  const esEnf=!esExtra&&leg?confirm('¿Es enfermedad <3 días? (Cancelar = Normal)'):false;
  g.asociados.push({
    id:leg?.nro||'—', nombre:leg?.nombre||nombre,
    categoriaFija:leg?.funcion||'Operario/a limpieza',
    categoriaTemporal:'', valorFijo:getCategoriaVH(leg?.funcion||''), valorTemporal:0,
    tipoHr:esExtra?'HRS FAC':esEnf?'HRS FAC':'HRS FAC',
    horas:esEnf?{}:generarHorasPrecargas(g.periodo,g.objCodigo),
    facturable:{}, esExtra, esEnfermedad:esEnf, esReten:false, esEspecial:false,
  });
  renderGrillasLiq();
  toast(`✓ ${leg?.nombre||nombre} agregado${esExtra?' (extras)':''}${esEnf?' (enfermedad)':''}`);
}

function cerrarGrilla(gId){
  const g=DB.grillasLiq.find(x=>x.id===gId);if(!g)return;
  g.estado='Cerrada';renderGrillasLiq();toast('✓ Grilla cerrada');
}

function renderArt42(){
  const tbody = $('tbody-art42');
  if(!tbody) return;
  // Recolectar asociados de grillas con motivo Art.42, solo ≤3 días
  // Los de >3 días van a Enfermos y Accidentados
  const filas = [];
  (DB.grillasLiq||[]).forEach(grilla=>{
    const obj = DB.objetivos.find(o=>o.codigo===grilla.objCodigo);
    (grilla.asociados||[]).forEach(asoc=>{
      const diasArt42 = Object.entries(asoc.motivoNoFact||{})
        .filter(([,m])=>String(m).toLowerCase().includes('42'))
        .map(([dia])=>dia).sort();
      if(!diasArt42.length || diasArt42.length > 3) return;
      const totalHs = diasArt42.reduce((s,d)=>s+parseFloat(asoc.horas?.[d]||0),0);
      const legajo = (DB.legajos||[]).find(l=>l.nombre===asoc.nombre);
      filas.push({
        asociado:asoc.nombre, nroSocio:legajo?.nro||asoc.nro||'—',
        servicio:grilla.objCodigo, supervisor:obj?.supervisor||'—',
        periodo:grilla.periodo, categoria:asoc.categoria||'—',
        dias:diasArt42.length, totalHs,
        fechaDesde:diasArt42[0], fechaHasta:diasArt42[diasArt42.length-1],
      });
    });
  });

  const fmt = iso => iso ? iso.split('-').reverse().join('/') : '—';
  if(!filas.length){
    tbody.innerHTML=`<tr><td colspan="10"><div class="empty-state">
      <div class="icon">🏥</div>
      <p>Sin asociados con horas Art. 42 (≤ 3 días) en las grillas</p>
      <p style="font-size:12px;color:var(--texto-suave);">Los casos de más de 3 días se derivan a Enfermos y Accidentados</p>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = filas.map(f=>{
    return `<tr>
    <td style="font-weight:500;">${f.asociado}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;">${f.nroSocio}</td>
    <td style="font-size:12px;">${f.servicio}</td>
    <td style="font-size:12px;">${f.supervisor}</td>
    <td style="font-size:12px;">${f.periodo}</td>
    <td style="font-size:12px;">${fmt(f.fechaDesde)}</td>
    <td style="font-size:12px;">${fmt(f.fechaHasta)}</td>
    <td style="font-weight:700;color:var(--rojo);">${f.dias}d</td>
    <td style="font-size:12px;">${f.categoria}</td>
    <td style="font-weight:700;color:var(--azul);">${f.totalHs}hs</td>
  </tr>`; }).join('');
}
function abrirModalArt42(){poblarSelectsLiquidacion();if($('a42-periodo'))$('a42-periodo').value=new Date().toISOString().slice(0,7);abrirModal('modal-art42');}
function guardarArt42(){
  const asoc=$('a42-asoc')?.value.trim();const dias=parseInt($('a42-dias')?.value)||0;
  if(!asoc||dias<4){toast('Ingresá asociado y al menos 4 días para Art. 42');return;}
  const leg=(DB.legajos||[]).find(l=>asoc.includes(String(l.nro)));
  const casoA42={id:Date.now(),asociado:asoc.split('(')[0].trim(),nroSocio:leg?.nro||'—',servicio:leg?.servicio||'—',supervisor:leg?.supervisor||'—',periodo:$('a42-periodo')?.value||'',fechaInicio:$('a42-inicio')?.value?new Date($('a42-inicio').value+'T00:00:00').toLocaleDateString('es-AR'):'',dias,horasPorDia:8,categoria:$('a42-categoria')?.value||'Operario/a limpieza',obs:$('a42-obs')?.value||'',estado:'Abierto'};
  DB.art42.push(casoA42);
  supaSync('art42', casoA42);
  cerrarModal('modal-art42');renderArt42();toast(`✓ Caso Art. 42: ${asoc} — ${dias} días`);
}
// Tarjetas de resumen Selección + Ingreso del dashboard de Inicio.
// Gráficos hechos con CSS puro (conic-gradient para donuts, divs para
// barras) — sin sumar ninguna librería nueva al proyecto.
function renderResumenSeleccionIngreso(){
  // Candidatos por estado
  const candEstados = ['Sin citar','Citado','Entrevistado','Aprobado','Psicotecnico','Rechazado'];
  const candColores = {'Sin citar':'#94a3b8','Citado':'#f0c857','Entrevistado':'#7dd4a0','Aprobado':'#5da8f0','Psicotecnico':'#c084f5','Rechazado':'#f87070'};
  const candCounts = candEstados.map(e => ({ e, n: (DB.candidatos||[]).filter(c=>c.estado===e).length }));
  const candMax = Math.max(1, ...candCounts.map(c=>c.n));
  const panelCand = $('panel-candidatos-inicio');
  if(panelCand){
    const hayDatos = candCounts.some(c=>c.n>0);
    panelCand.innerHTML = hayDatos ? candCounts.map(c=>`
      <div class="bar-row">
        <div class="label">${c.e}</div>
        <div class="track"><div class="fill" style="width:${c.n/candMax*100}%;background:${candColores[c.e]};"></div></div>
        <div class="n">${c.n}</div>
      </div>`).join('') : `<div style="text-align:center;padding:16px;color:var(--texto-muy-suave);font-size:13px;">Sin candidatos cargados</div>`;
  }

  // Pedidos de personal por estado
  const pedEstados = ['Pendiente','En búsqueda','Cubierto','Cancelado','Pausado'];
  const pedColores = {'Pendiente':'#f0c857','En búsqueda':'#5da8f0','Cubierto':'#7dd4a0','Cancelado':'#f87070','Pausado':'#94a3b8'};
  const pedCounts = pedEstados.map(e => ({ e, n: (DB.pedidos||[]).filter(p=>p.estado===e).length }));
  const pedMax = Math.max(1, ...pedCounts.map(c=>c.n));
  const panelPed = $('panel-pedidos-inicio');
  if(panelPed){
    const hayDatos = pedCounts.some(c=>c.n>0);
    panelPed.innerHTML = hayDatos ? pedCounts.map(c=>`
      <div class="bar-row">
        <div class="label">${c.e}</div>
        <div class="track"><div class="fill" style="width:${c.n/pedMax*100}%;background:${pedColores[c.e]};"></div></div>
        <div class="n">${c.n}</div>
      </div>`).join('') : `<div style="text-align:center;padding:16px;color:var(--texto-muy-suave);font-size:13px;">Sin pedidos cargados</div>`;
  }

  // Legajos — donut activos/bajas
  const panelLeg = $('panel-legajos-inicio');
  if(panelLeg){
    const legajos = DB.legajos||[];
    const activos = legajos.filter(l=>l.estado==='Activo').length;
    const bajas = legajos.filter(l=>l.estado==='Baja').length;
    const total = legajos.length || 1;
    const pctActivos = Math.round(activos/total*100);
    panelLeg.innerHTML = `
      <div class="donut" style="background:conic-gradient(var(--verde) 0% ${pctActivos}%, var(--rojo) ${pctActivos}% 100%);">
        <div class="donut-hole"><div class="n">${legajos.length}</div><div class="l">total</div></div>
      </div>
      <div class="donut-leyenda">
        <div class="item"><span class="dot" style="background:var(--verde);"></span>Activos: <strong>${activos}</strong></div>
        <div class="item"><span class="dot" style="background:var(--rojo);"></span>Bajas: <strong>${bajas}</strong></div>
      </div>`;
  }

  // Otros indicadores de Ingreso
  const panelIng = $('panel-ingreso-inicio');
  if(panelIng){
    const reasPend = (DB.reasignaciones||[]).filter(r=>r.estado==='Pendiente').length;
    const monoFuera = (DB.monotributos||[]).filter(m=>m.estado==='Fuera de categoría').length;
    const mesActual = new Date().toISOString().slice(0,7);
    const uniMes = (DB.uniformes||[]).filter(u=>(u.fecha||'').slice(0,7)===mesActual).length;
    const retActivas = (DB.retenciones||[]).filter(r=>r.estado==='Activa').length;
    const items = [
      {icon:'🔄', label:'Reasignaciones pendientes', n:reasPend, color:'var(--naranja)'},
      {icon:'💸', label:'Monotributos fuera de cat.', n:monoFuera, color:'var(--rojo)'},
      {icon:'👕', label:'Uniformes entregados (mes)', n:uniMes, color:'var(--azul)'},
      {icon:'🔒', label:'Retenciones activas', n:retActivas, color:'var(--acento)'},
    ];
    panelIng.innerHTML = items.map(i=>`
      <div style="background:var(--fondo);border-radius:var(--radio);padding:12px;text-align:center;">
        <div style="font-size:22px;">${i.icon}</div>
        <div style="font-size:20px;font-weight:800;color:${i.color};margin:4px 0;">${i.n}</div>
        <div style="font-size:10px;color:var(--texto-suave);">${i.label}</div>
      </div>`).join('');
  }
}

export function renderInicio(){
  // Saludo dinámico
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = currentUser?.nombre?.split(' ')[0] || '';
  const funcion = currentUser?.funcion ? ` · ${currentUser.funcion}` : '';
  const hoy = new Date().toLocaleDateString('es-AR', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const salEl = $('saludo-inicio');
  if(salEl) salEl.innerHTML = `${saludo}, <strong>${nombre}</strong>${funcion} &nbsp;·&nbsp; ${hoy.charAt(0).toUpperCase()+hoy.slice(1)}`;

  // Grupos de módulos con íconos grandes para el acceso rápido
  const MODULOS_INICIO = [
    {key:'candidatos',  icon:'👥', label:'Candidatos',         color:'#e8f0fe', border:'#93b4f8'},
    {key:'pedidos',     icon:'📋', label:'Pedidos',             color:'#e8f8ee', border:'#7dd4a0'},
    {key:'legajos',     icon:'📁', label:'Legajos',             color:'#fff8e8', border:'#f0c857'},
    {key:'reasignaciones',icon:'🔄',label:'Reasignaciones',    color:'#fef3e8', border:'#f4a44a'},
    {key:'capacitaciones',icon:'🎓',label:'Capacitaciones',    color:'#f3e8fe', border:'#c084f5'},
    {key:'vacaciones',  icon:'🏖️', label:'Vacaciones',         color:'#e8fefc', border:'#5de8dc'},
    {key:'competencia', icon:'🏆', label:'Competencia',         color:'#fffbea', border:'#f0c857'},
    {key:'clientes',    icon:'🏢', label:'Clientes',            color:'#e8effe', border:'#93b4f8'},
    {key:'objetivos',   icon:'📍', label:'Servicios',           color:'#e8f8ee', border:'#7dd4a0'},
    {key:'crm',         icon:'📊', label:'CRM',                 color:'#fdf0f8', border:'#e879d8'},
    {key:'reclamos',    icon:'📣', label:'Reclamos',            color:'#fee8e8', border:'#f87070'},
    {key:'cobros',      icon:'💳', label:'Cobros',              color:'#f0f8e8', border:'#a4d46a'},
    {key:'legal',       icon:'⚖️', label:'Legal',              color:'#f8f0e8', border:'#e8a46a'},
    {key:'enfermos',    icon:'🏥', label:'Enfermos',            color:'#fee8ee', border:'#f870a0'},
    {key:'configuracion',icon:'⚙️',label:'Configuración',      color:'#f8f8f8', border:'#c0c0c0'},
    {key:'paritarias',  icon:'📜', label:'Paritarias',          color:'#e8f8ee', border:'#7dd4a0'},
    {key:'smvm',        icon:'💵', label:'SMVM',               color:'#e8fee8', border:'#70d470'},
  ];

  const perfil = PERFILES[currentUser?.perfil];
  const modulosAcceso = perfil ? perfil.modulos : [];
  const grilla = $('grilla-acceso-rapido');
  if(grilla){
    const disponibles = MODULOS_INICIO.filter(m => modulosAcceso.includes(m.key));
    // Calcular alertas por módulo
    const alertas = {
      candidatos: DB.candidatos.filter(c=>c.estado==='Sin citar').length,
      reasignaciones: (DB.reasignaciones||[]).filter(r=>r.estado==='Pendiente').length,
      reclamos: (DB.reclamos||[]).filter(r=>r.estado==='Abierto'||r.estado==='En tratamiento').length,
      legal: (DB.casosLegales||[]).filter(c=>c.estado!=='Cerrado').length,
      enfermos: (DB.enfermos||[]).filter(e=>e.estado==='Activo — sin trabajar').length,
      cobros: (DB.facturas||[]).filter(f=>f.estado==='Impago').length,
      pedidos: (DB.pedidos||[]).filter(p=>p.estado==='Pendiente'||p.estado==='En búsqueda').length,
    };

    grilla.innerHTML = disponibles.map(m => {
      const n = alertas[m.key] || 0;
      return `<div onclick="navTo('${m.key}')"
        style="background:${m.color};border:2px solid ${m.border};border-radius:16px;padding:22px 14px;
               text-align:center;cursor:pointer;transition:all .15s;position:relative;
               box-shadow:0 2px 8px rgba(0,0,0,.06);"
        onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.12)'"
        onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(0,0,0,.06)'">
        ${n > 0 ? `<div style="position:absolute;top:8px;right:10px;background:#e53e3e;color:white;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;min-width:20px;">${n}</div>` : ''}
        <div style="font-size:32px;margin-bottom:8px;">${m.icon}</div>
        <div style="font-size:13px;font-weight:600;color:#2d3748;">${m.label}</div>
      </div>`;
    }).join('');
  }

  renderResumenSeleccionIngreso();

  // Panel de alertas
  const panelAlertas = $('panel-alertas-inicio');
  if(panelAlertas){
    const alertasList = [
      {modulo:'candidatos', icon:'👥', color:'var(--azul)',
       n: DB.candidatos.filter(c=>c.estado==='Sin citar').length,
       label:'candidatos sin citar'},
      {modulo:'reasignaciones', icon:'🔄', color:'var(--naranja)',
       n: (DB.reasignaciones||[]).filter(r=>r.estado==='Pendiente').length,
       label:'reasignaciones pendientes'},
      {modulo:'reclamos', icon:'📣', color:'var(--rojo)',
       n: (DB.reclamos||[]).filter(r=>r.estado!=='Cerrado').length,
       label:'reclamos abiertos'},
      {modulo:'cobros', icon:'💳', color:'var(--rojo)',
       n: (DB.facturas||[]).filter(f=>f.estado==='Impago').length,
       label:'facturas impagas'},
      {modulo:'crm', icon:'⚡', color:'var(--rojo)',
       n: DB.leads.flatMap(l=>l.acciones||[]).filter(a=>a.estado==='Vencida').length,
       label:'acciones CRM vencidas'},
      {modulo:'legal', icon:'⚖️', color:'var(--naranja)',
       n: (DB.casosLegales||[]).filter(c=>c.estado!=='Cerrado').length,
       label:'casos legales activos'},
      {modulo:'enfermos', icon:'🏥', color:'var(--naranja)',
       n: (DB.enfermos||[]).filter(e=>e.estado==='Activo — sin trabajar').length,
       label:'asociados de baja médica'},
    ].filter(a => modulosAcceso.includes(a.modulo));

    const conAlerta = alertasList.filter(a=>a.n>0);
    if(!conAlerta.length){
      panelAlertas.innerHTML=`<div style="text-align:center;padding:16px;color:var(--texto-muy-suave);">
        <div style="font-size:24px;margin-bottom:6px;">✅</div>
        <div style="font-size:13px;">Todo al día</div>
      </div>`;
    } else {
      panelAlertas.innerHTML = conAlerta.map(a=>`
        <div onclick="navTo('${a.modulo}')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;
             background:var(--fondo);border-radius:var(--radio);cursor:pointer;border:1px solid var(--borde);"
             onmouseover="this.style.background='var(--azul-claro)'"
             onmouseout="this.style.background='var(--fondo)'">
          <span style="font-size:18px;">${a.icon}</span>
          <span style="flex:1;font-size:13px;color:var(--texto-suave);">${a.label}</span>
          <span style="background:${a.color};color:white;font-size:11px;font-weight:700;
                       padding:2px 9px;border-radius:20px;">${a.n}</span>
        </div>`).join('');
    }
  }

  // Panel de cumpleaños del mes
  const panelCumple = $('panel-cumple-inicio');
  if(panelCumple){
    const mesActual = new Date().getMonth() + 1;
    // Buscar en legajos por fecha de ingreso o campo de cumpleaños
    // Por ahora mostramos los usuarios del sistema (en producción vendrá de legajos con campo cumpleaños)
    const usuariosConCumple = (DB.usuarios||[]).filter(u=>{
      if(!u.fechaNac) return false;
      const [dd,mm] = (u.fechaNac||'').split('/');
      return parseInt(mm)===mesActual;
    });
    // También buscar en legajos si tienen campo cumpleaños
    const legajosConCumple = (DB.legajos||[]).filter(l=>{
      if(!l.fechaNac) return false;
      const [dd,mm] = (l.fechaNac||'').split('/');
      return parseInt(mm)===mesActual;
    });
    const todos = [...usuariosConCumple.map(u=>({nombre:u.nombre,origen:'admin'})),
                   ...legajosConCumple.map(l=>({nombre:l.nombre,origen:'operativo'}))];
    if(!todos.length){
      const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      panelCumple.innerHTML=`<div style="text-align:center;padding:16px;color:var(--texto-muy-suave);">
        <div style="font-size:24px;margin-bottom:6px;">🎉</div>
        <div style="font-size:13px;">Sin cumpleaños registrados en ${meses[mesActual-1]}</div>
        <div style="font-size:11px;margin-top:4px;">Agregá fechas de nacimiento en los legajos</div>
      </div>`;
    } else {
      panelCumple.innerHTML = todos.map(p=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
             background:var(--fondo);border-radius:var(--radio);border:1px solid var(--borde);">
          <span style="font-size:20px;">🎂</span>
          <span style="font-size:13px;font-weight:500;">${p.nombre}</span>
        </div>`).join('');
    }
  }
}

// ========== MÓDULO GESTIÓN DE PRECIOS ==========
function tabPrecios(tab,btn){
  document.querySelectorAll('#screen-precios .tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#screen-precios .tab-btn').forEach(b=>b.classList.remove('active'));
  $('prec-tab-'+tab).classList.add('active');if(btn)btn.classList.add('active');
  if(tab==='historial') renderHistorialPrecios();
  if(tab==='proyeccion') actualizarProyeccion();
}

function renderPrecios(){
  aplicarTramosVencidos(); // punto 4: los tramos que ya vencieron entran solos, sin confirmación manual
  const props=DB.propuestasPrecios||[];
  $('st-prec-pend').textContent=props.filter(p=>p.estado==='Pendiente autorización gerente').length;
  $('st-prec-aprobados').textContent=props.filter(p=>p.estado==='Vigente').length;
  $('st-prec-clausula').textContent=DB.objetivos.filter(o=>o.clausulaActualizacion&&o.clausulaActualizacion!=='Sin cláusula'&&o.clausulaActualizacion!=='Libre negociación').length;
  $('st-prec-sin').textContent=DB.objetivos.filter(o=>!o.clausulaActualizacion||o.clausulaActualizacion==='Sin cláusula'||o.clausulaActualizacion==='Libre negociación').length;
  renderPropuestasPrecio();
  // Poblar selects
  const fS=(id,items)=>{const el=$(id);if(!el)return;const ph=el.options[0]?.outerHTML||'';el.innerHTML=ph+items.map(i=>`<option>${i}</option>`).join('');};
  fS('cf-hist-obj',DB.objetivos.map(o=>o.nombre));
  fS('cf-hist-cli',DB.clientes.map(c=>c.nombre));
  const proyCli=$('proy-cliente');
  if(proyCli){const ph=proyCli.options[0]?.outerHTML||'<option value="">— Todos —</option>';proyCli.innerHTML=ph+DB.clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');}
  poblarObjetivosProyeccion();
  const ppObj=$('pp-objetivo');
  if(ppObj){const ph=ppObj.options[0]?.outerHTML||'';ppObj.innerHTML=ph+DB.objetivos.map(o=>`<option value="${o.id}">${o.nombre}</option>`).join('');}
  fS('pp-clausula',DB.clausulasActualizacion||[]);
}
function poblarObjetivosProyeccion(){
  const sel=$('proy-objetivo');if(!sel)return;
  const clienteId=parseInt($('proy-cliente')?.value)||0;
  const objs=DB.objetivos.filter(o=>o.estado==='Operativo'&&(!clienteId||o.clienteId===clienteId));
  sel.innerHTML='<option value="">— Todos los activos —</option>'+objs.map(o=>`<option>${o.nombre}</option>`).join('');
}

// Punto 6: si varias propuestas comparten loteId, se pueden autorizar
// todas de una desde cualquiera de sus filas — el gerente puede rechazar
// alguna puntual antes de tocar ese botón.
function renderPropuestasPrecio(lista){
  const rows=lista||DB.propuestasPrecios||[];
  const tbody=$('tbody-propuestas-precio');if(!tbody)return;
  const estColor={
    'Pendiente autorización gerente':'badge-acento','Rechazada — interna':'badge-rojo',
    'Autorizada — lista para enviar':'badge-azul','Enviada al cliente':'badge-acento',
    'Rechazada por el cliente':'badge-rojo','Vigente':'badge-verde','Proyección — sin homologar':'badge-gris',
  };
  tbody.innerHTML=rows.map((p)=>{
    const idx=DB.propuestasPrecios.indexOf(p);
    const impactoMensual=p.valorPropuesto-p.valorActual;
    const impacto=impactoMensual*p.proyeccionMeses;
    const esRebaja=p.tipoModificacion==='Rebaja';
    const signo=esRebaja?'-':'+';
    const colorTipo=esRebaja?'var(--rojo)':'var(--verde)';
    const motivoRechazo=p.motivoRechazoGerente||p.motivoRechazoCliente;
    let acciones='—';
    if(p.estado==='Pendiente autorización gerente'){
      acciones=`<button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="autorizarSalidaPrecio(${idx})">✓ Autorizar</button>
        <button class="btn btn-danger btn-xs" onclick="rechazarInternoPrecio(${idx})">✕ Rechazar</button>
        ${p.loteId?`<button class="btn btn-secondary btn-xs" onclick="autorizarLotePrecio('${p.loteId}')" title="Autoriza este y todos los demás pendientes del mismo lote">✓✓ Lote</button>`:''}`;
    } else if(p.estado==='Rechazada — interna'||p.estado==='Rechazada por el cliente'){
      acciones=`<button class="btn btn-secondary btn-xs" onclick="rearmarPropuesta(${idx})">↻ Rearmar</button>`;
    } else if(p.estado==='Autorizada — lista para enviar'){
      acciones=`<button class="btn btn-primary btn-xs" onclick="marcarEnviadaCliente(${idx})">📨 Marcar enviada</button>`;
    } else if(p.estado==='Enviada al cliente'){
      acciones=`<button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="confirmarCierreCliente(${idx})">✓ Aceptó — confirmar cierre</button>
        <button class="btn btn-danger btn-xs" onclick="rechazoClientePrecio(${idx})">✕ Rechazó</button>`;
    }
    return `<tr>
      <td style="font-weight:500;">${p.objetivoNombre}</td>
      <td style="font-size:12px;">${p.clienteNombre}</td>
      <td><span class="badge" style="background:${colorTipo};color:white;font-size:10px;">${p.tipoModificacion}</span></td>
      <td><span class="chip" style="font-size:10px;">${p.clausula||'—'}</span></td>
      <td style="font-size:12px;">$${p.valorActual.toLocaleString('es-AR')}</td>
      <td style="font-weight:700;color:var(--azul);">$${p.valorPropuesto.toLocaleString('es-AR')}</td>
      <td style="font-weight:700;color:${colorTipo};">${signo}${p.pctAumento.toFixed(1)}%</td>
      <td style="font-size:11px;">${p.tramos.length>1?`${p.tramos.length} tramos`:'1 tramo'}</td>
      <td style="font-size:12px;font-weight:500;color:var(--naranja);">${p.fechaVigencia}</td>
      <td><span class="badge ${estColor[p.estado]||'badge-gris'}" style="font-size:10px;">${p.estado}</span>${motivoRechazo?`<div style="font-size:9px;color:var(--texto-suave);margin-top:2px;" title="${motivoRechazo}">💬 ${motivoRechazo.slice(0,28)}${motivoRechazo.length>28?'…':''}</div>`:''}</td>
      <td style="font-size:12px;color:${colorTipo};">${signo}$${Math.round(Math.abs(impacto)/1000)}k en ${p.proyeccionMeses}m</td>
      <td><div style="display:flex;flex-direction:column;gap:3px;">${acciones}</div></td>
    </tr>`;
  }).join('')||`<tr><td colspan="12"><div class="empty-state"><div class="icon">💲</div><p>Sin propuestas de precio</p></div></td></tr>`;
}

function renderHistorialPrecios(){
  const el=$('historial-precios-lista');if(!el)return;
  const filtObj=($('cf-hist-obj')||{value:''}).value;
  const filtCli=($('cf-hist-cli')||{value:''}).value;
  let objs=DB.objetivos.filter(o=>(o.historialPrecios||[]).length>0);
  if(filtObj) objs=objs.filter(o=>o.nombre===filtObj);
  if(filtCli){const cliId=DB.clientes.find(c=>c.nombre===filtCli)?.id;if(cliId) objs=objs.filter(o=>o.clienteId===cliId);}
  if(!objs.length){el.innerHTML='<p class="text-muted">Sin historial de precios registrado.</p>';return;}
  const estColorHist={'Vigente':'var(--verde-claro)','Programado':'var(--acento-suave)','Histórico':'white'};
  el.innerHTML=objs.map(o=>{
    const cli=DB.clientes.find(c=>c.id===o.clienteId);
    const hist=[...(o.historialPrecios||[])].sort((a,b)=>_dmyPrecios(b.fecha)-_dmyPrecios(a.fecha));
    return `<div style="background:white;border:1px solid var(--borde);border-radius:var(--radio-lg);overflow:hidden;">
      <div style="padding:12px 16px;background:var(--fondo);border-bottom:1px solid var(--borde);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;font-size:14px;">${o.nombre}</div>
          <div style="font-size:11px;color:var(--texto-suave);">${cli?.nombre||'—'} · ${o.clausulaActualizacion||'Sin cláusula'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:800;font-size:16px;color:var(--azul);">$${(o.valor||0).toLocaleString('es-AR')}/mes</div>
          ${o.valorHora?`<div style="font-size:11px;color:var(--texto-suave);">$${o.valorHora.toLocaleString('es-AR')}/hora</div>`:''}
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8f9fd;">
            <th style="padding:8px 12px;border:1px solid var(--borde);text-align:left;">Fecha</th>
            <th style="padding:8px 12px;border:1px solid var(--borde);">Tipo</th>
            <th style="padding:8px 12px;border:1px solid var(--borde);">Valor mensual</th>
            <th style="padding:8px 12px;border:1px solid var(--borde);">Valor hora</th>
            <th style="padding:8px 12px;border:1px solid var(--borde);">Motivo</th>
            <th style="padding:8px 12px;border:1px solid var(--borde);">Aprobado por</th>
            <th style="padding:8px 12px;border:1px solid var(--borde);">Estado</th>
          </tr></thead>
          <tbody>
            ${hist.map(h=>`<tr style="background:${estColorHist[h.estado]||'white'}">
              <td style="padding:8px 12px;border:1px solid var(--borde);">${h.fecha}</td>
              <td style="padding:8px 12px;border:1px solid var(--borde);text-align:center;">${h.tipoModificacion==='Rebaja'?'📉 Rebaja':'📈 Aumento'}</td>
              <td style="padding:8px 12px;border:1px solid var(--borde);text-align:right;font-weight:600;">$${(h.valor||0).toLocaleString('es-AR')}</td>
              <td style="padding:8px 12px;border:1px solid var(--borde);text-align:right;">${h.valorHora?'$'+h.valorHora.toLocaleString('es-AR'):'—'}</td>
              <td style="padding:8px 12px;border:1px solid var(--borde);max-width:220px;">${h.motivo||'—'}</td>
              <td style="padding:8px 12px;border:1px solid var(--borde);">${h.aprobadoPor||'—'}</td>
              <td style="padding:8px 12px;border:1px solid var(--borde);text-align:center;"><span class="badge ${h.estado==='Vigente'?'badge-verde':h.estado==='Programado'?'badge-acento':'badge-gris'}" style="font-size:10px;">${h.estado}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

// Punto 7 — mejoras a Proyección financiera: unidad hora/monto (B.3 de
// paso: la columna pasa a llamarse "Servicio" y muestra el nombre, antes
// mostraba importes porque a la fila le faltaba el <td> del nombre),
// tramos múltiples reflejados como saltos en su mes, rebajas (mismo
// mecanismo con signo negativo), simulación adicional con signo propio, y
// vista agrupada por cliente o por servicio.
function actualizarProyeccion(){
  const el=$('tabla-proyeccion');if(!el)return;
  const meses=parseInt($('proy-meses')?.value)||12;
  const incluirPend=($('proy-incluir-pend')?.value)==='1';
  const unidad=$('proy-unidad')?.value||'monto';
  const vista=$('proy-vista')?.value||'servicio';
  const clienteFiltro=parseInt($('proy-cliente')?.value)||0;
  const pctExtra=parseFloat($('proy-pct-extra')?.value)||0;
  const signoExtra=parseInt($('proy-pct-extra-signo')?.value)||1;
  const desdeExtra=parseInt($('proy-pct-extra-desde')?.value)||0;
  const filtObj=($('proy-objetivo')?.value)||'';
  let objs=DB.objetivos.filter(o=>o.estado==='Operativo');
  if(clienteFiltro) objs=objs.filter(o=>o.clienteId===clienteFiltro);
  if(filtObj) objs=objs.filter(o=>o.nombre===filtObj);
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const mesesArr=Array.from({length:meses},(_, i)=>{
    const d=new Date(hoy.getFullYear(),hoy.getMonth()+i,1);
    return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  });
  const mesesDesdeHoy=mesStr=>{const[mm,yy]=mesStr.split('/');return((parseInt(yy)-hoy.getFullYear())*12)+(parseInt(mm)-hoy.getMonth()-1);};
  // Valor MENSUAL (siempre en $, la conversión a hora se hace al mostrar)
  // — refleja: (a) los tramos ya vigentes/programados del objetivo, (b)
  // opcionalmente los tramos de propuestas todavía no confirmadas
  // (autorizadas o enviadas, no rechazadas), (c) la simulación adicional.
  const getMontoEnMes=(obj,mesStr)=>{
    const fMes=new Date(`${mesStr.split('/')[1]}-${mesStr.split('/')[0]}-01`);
    let val=obj.valor||0;
    (obj.historialPrecios||[]).forEach(h=>{const f=_dmyPrecios(h.fecha);if(f&&f<=fMes)val=h.valor;});
    if(incluirPend){
      (DB.propuestasPrecios||[]).filter(p=>p.objetivoId===obj.id&&['Pendiente autorización gerente','Autorizada — lista para enviar','Enviada al cliente'].includes(p.estado))
        .forEach(p=>{p.tramos.forEach(t=>{const f=_dmyPrecios(t.fechaVigencia);if(f&&f<=fMes)val=t.valor;});});
    }
    if(pctExtra>0&&mesesDesdeHoy(mesStr)>=desdeExtra){
      val=Math.round(val*(1+signoExtra*pctExtra/100));
    }
    return val;
  };
  const getValorEnMes=(obj,mesStr)=>{
    const monto=getMontoEnMes(obj,mesStr);
    if(unidad!=='hora')return monto;
    // Valor hora de referencia: para "Por EFT" ya es la unidad natural; en
    // abono fijo/presupuesto se deriva (mensual ÷ horas de referencia).
    return obj.efts?Math.round(monto/obj.efts):null;
  };
  const fmtValor=v=>v==null?'—':(unidad==='hora'?'$'+v.toLocaleString('es-AR')+'/h':'$'+Math.round(v/1000)+'k');

  let filasData; // [{label, vals:[...]}]
  if(vista==='cliente'){
    const porCliente=new Map();
    objs.forEach(o=>{
      const cid=o.clienteId;
      if(!porCliente.has(cid))porCliente.set(cid,[]);
      porCliente.get(cid).push(o);
    });
    filasData=[...porCliente.entries()].map(([cid,lista])=>{
      const cli=DB.clientes.find(c=>c.id===cid);
      // Agrupado por cliente siempre se ve en monto (sumar $/hora entre
      // servicios distintos no tiene sentido) — se fuerza monto acá.
      const vals=mesesArr.map(m=>lista.reduce((s,o)=>s+getMontoEnMes(o,m),0));
      return{label:cli?.nombre||'—',vals};
    });
  } else {
    filasData=objs.map(o=>({label:o.nombre,vals:mesesArr.map(m=>getValorEnMes(o,m))}));
  }
  const unidadEfectiva=vista==='cliente'?'monto':unidad;
  const fmt=v=>v==null?'—':(unidadEfectiva==='hora'?'$'+v.toLocaleString('es-AR')+'/h':'$'+Math.round(v/1000)+'k');

  const totalPorMes=mesesArr.map((m,i)=>filasData.reduce((s,f)=>s+(f.vals[i]||0),0));
  const totalActual=vista==='cliente'?objs.reduce((s,o)=>s+(o.valor||0),0):filasData.reduce((s,f)=>s+(f.vals[0]||0),0);
  el.innerHTML=`
    <div style="margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap;">
      <div style="font-size:13px;"><strong>${unidadEfectiva==='hora'?'Valor hora promedio actual':'Facturación actual'}:</strong> <span style="color:var(--azul);font-weight:700;">${fmt(totalActual)}${unidadEfectiva!=='hora'?'/mes':''}</span></div>
      <div style="font-size:13px;"><strong>Pico proyectado:</strong> <span style="color:var(--verde);font-weight:700;">${fmt(Math.max(...totalPorMes))}</span></div>
      ${incluirPend?'<span class="badge badge-acento" style="font-size:11px;">⚠️ Incluye propuestas pendientes (no convalidadas hasta la confirmación del Gerente)</span>':''}
      ${pctExtra>0?`<span class="badge badge-gris" style="font-size:11px;">🧪 Simulación: ${signoExtra>0?'+':'-'}${pctExtra}% desde el mes ${desdeExtra}</span>`:''}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr>
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);text-align:left;min-width:120px;">${vista==='cliente'?'Cliente':'Servicio'}</th>
        ${mesesArr.map(m=>`<th style="padding:6px 4px;background:#f8f9fd;border:1px solid var(--borde);text-align:center;min-width:70px;font-size:11px;">${m}</th>`).join('')}
        <th style="padding:8px;background:#f8f9fd;border:1px solid var(--borde);">Total</th>
      </tr></thead>
      <tbody>
        ${filasData.map(f=>{
          const totalFila=f.vals.reduce((s,v)=>s+(v||0),0);
          return `<tr>
            <td style="padding:6px 8px;border:1px solid var(--borde);font-weight:500;">${f.label}</td>
            ${f.vals.map((v,i)=>{
              const prev=i>0?f.vals[i-1]:v;
              const sube=v>prev,baja=v<prev;
              const bg=sube?'var(--verde-claro)':baja?'#fde8e8':'white';
              const flecha=sube?'↑':baja?'↓':'';
              const color=sube?'color:var(--verde);font-weight:700;':baja?'color:var(--rojo);font-weight:700;':'';
              return `<td style="padding:6px 4px;border:1px solid var(--borde);text-align:center;background:${bg};font-size:11px;${color}">${fmt(v)}${flecha}</td>`;
            }).join('')}
            <td style="padding:6px 4px;border:1px solid var(--borde);text-align:center;font-weight:700;">${unidadEfectiva==='hora'?'—':'$'+Math.round(totalFila/1000)+'k'}</td>
          </tr>`;
        }).join('')}
        <tr style="background:var(--azul-claro);">
          <td style="padding:8px;border:1px solid var(--borde);font-weight:700;">TOTAL</td>
          ${totalPorMes.map(t=>`<td style="padding:6px 4px;border:1px solid var(--borde);text-align:center;font-weight:700;font-size:11px;">${unidadEfectiva==='hora'?'—':'$'+Math.round(t/1000)+'k'}</td>`).join('')}
          <td style="padding:8px;border:1px solid var(--borde);font-weight:800;color:var(--azul);">${unidadEfectiva==='hora'?'—':'$'+Math.round(totalPorMes.reduce((s,v)=>s+v,0)/1000)+'k'}</td>
        </tr>
      </tbody>
    </table>`;
}

function abrirModalPropuestaPrecio(prellenarDesde){
  const ppObj=$('pp-objetivo');
  if(ppObj){const ph='<option value="">— Seleccionar objetivo —</option>';ppObj.innerHTML=ph+DB.objetivos.map(o=>`<option value="${o.id}">${o.nombre}</option>`).join('');}
  const ppCl=$('pp-clausula');
  if(ppCl){ppCl.innerHTML=(DB.clausulasActualizacion||[]).map(c=>`<option>${c}</option>`).join('');}
  ['pp-pct-teorico','pp-pct-comercial','pp-pct-acordado'].forEach(id=>{if($(id))$(id).value='';});
  ['pp-val-teorico','pp-val-comercial','pp-val-acordado'].forEach(id=>{if($(id))$(id).textContent='—';});
  ['pp-vh-teorico-lbl','pp-vh-comercial-lbl','pp-vh-acordado-lbl'].forEach(id=>{if($(id))$(id).textContent='';});
  if($('pp-motivo'))$('pp-motivo').value='';
  if($('pp-proyeccion-preview'))$('pp-proyeccion-preview').innerHTML='';
  if($('pp-tipo-modificacion'))$('pp-tipo-modificacion').value='Aumento';
  tramosPPTemp=[{id:Date.now(),pct:0,fechaVigencia:''}];
  renderTramosPP();
  toggleTipoModificacionPP();
  abrirModal('modal-propuesta-precio');
  if(prellenarDesde){
    if($('pp-objetivo'))$('pp-objetivo').value=prellenarDesde.objetivoId||'';
    cargarDatosObjetivoEnPP();
    if($('pp-tipo-modificacion'))$('pp-tipo-modificacion').value=prellenarDesde.tipoModificacion||'Aumento';
    toggleTipoModificacionPP();
    _propuestaAnteriorIdPP=prellenarDesde.id;
  } else {
    _propuestaAnteriorIdPP=null;
  }
}

function cargarDatosObjetivoEnPP(){
  const id=parseInt($('pp-objetivo')?.value)||0;
  const obj=DB.objetivos.find(o=>o.id===id);
  if(!obj)return;
  if($('pp-valor-actual')) $('pp-valor-actual').value='$'+obj.valor.toLocaleString('es-AR');
  if($('pp-vh-actual')) $('pp-vh-actual').value=obj.valorHora?'$'+obj.valorHora.toLocaleString('es-AR'):'—';
  if($('pp-modelo')) $('pp-modelo').value=obj.modeloPrecio||'—';
  // Precargar % de paritaria vigente en el nivel "Por paritaria" si existe
  const parVigente=DB.paritarias?.filter(p=>p.homologada).slice(-1)[0];
  if(parVigente&&$('pp-pct-teorico')&&!$('pp-pct-teorico').value){
    $('pp-pct-teorico').value=parVigente.pctAumento;
  }
  const clausula=$('pp-clausula');
  if(clausula&&obj.clausulaActualizacion){
    for(let i=0;i<clausula.options.length;i++){
      if(clausula.options[i].value===obj.clausulaActualizacion){clausula.selectedIndex=i;break;}
    }
  }
  calcularPP('teorico');calcularPP('comercial');calcularPP('acordado');
}



// ========== AGENTE IA PARA CRM — Punto 3 ==========
// Agente compartido para todos los CRMs del sistema
function abrirAgenteIA(contexto, datos){
  const titulosIA={
    crm: '🤖 Agente IA — CRM Comercial',
    reclamos: '🤖 Agente IA — Reclamos',
    cobros: '🤖 Agente IA — Gestión de Cobros',
    reasignaciones: '🤖 Agente IA — Reasignaciones',
  };
  const promptsIA={
    crm: `Analizá el pipeline de ventas: ${DB.leads.length} leads activos, ${DB.leads.filter(l=>l.etapa==='Negociación').length} en negociación, valor total pipeline $${Math.round(DB.leads.filter(l=>l.etapa!=='Contrato'&&l.etapa!=='Cerrado perdido').reduce((s,l)=>s+l.valor,0)/1000)}k/mes. Principales acciones pendientes hoy: ${DB.leads.flatMap(l=>l.acciones||[]).filter(a=>a.estado==='Pendiente').length} acciones. ¿Qué prioridades me recomendás y cómo puedo comunicarme mejor con los prospectos en etapa de negociación?`,
    reclamos: `Analizá los reclamos activos: ${DB.reclamos.filter(r=>r.estado!=='Cerrado').length} sin resolver, ${DB.reclamos.filter(r=>r.prioridad==='Urgente'||r.prioridad==='Alta').length} de alta prioridad. Tipo más frecuente: "${[...Object.entries(DB.reclamos.reduce((a,r)=>{a[r.tipo]=(a[r.tipo]||0)+1;return a},{}))].sort((a,b)=>b[1]-a[1])[0]?.[0]||'—'}". ¿Qué patrones ves y cómo me recomendás comunicarme con los clientes afectados para resolver rápido?`,
    cobros: `Analizá la cartera de cobros: ${DB.facturas.filter(f=>f.estado==='Impago').length} facturas impagas por $${Math.round(DB.facturas.filter(f=>f.estado==='Impago').reduce((s,f)=>s+f.importe,0)/1000)}k. ${DB.facturas.filter(f=>f.estado==='Gestión activa').length} en gestión activa. ¿Cómo debería priorizar los contactos esta semana y qué enfoque de comunicación me recomendás para cada tipo de deudor?`,
    reasignaciones: `Analizá las reasignaciones: ${DB.reasignaciones.filter(r=>r.estado==='Pendiente').length} pendientes de aprobación. Motivos más frecuentes: conflictos y coberturas. ¿Cómo puedo comunicarme mejor con los supervisores y asociados involucrados para hacer las transiciones más fluidas?`,
  };
  const html=`
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div class="alerta alerta-info" style="font-size:12px;">
        El agente analiza el contexto actual del módulo y propone acciones y comunicaciones.
      </div>
      <div style="background:var(--fondo);border-radius:var(--radio);padding:12px;border:1px solid var(--borde);">
        <div style="font-size:11px;font-weight:700;color:var(--texto-suave);margin-bottom:6px;">CONTEXTO ENVIADO AL AGENTE:</div>
        <div style="font-size:12px;color:var(--texto-suave);">${promptsIA[contexto]||'Análisis general del sistema'}</div>
      </div>
      <div id="ia-respuesta-crm" style="background:linear-gradient(135deg,var(--azul-oscuro),var(--azul));color:white;border-radius:var(--radio);padding:14px;min-height:80px;font-size:13px;line-height:1.6;">
        <div style="display:flex;align-items:center;gap:8px;"><span class="ia-dot"></span> Analizando datos...</div>
      </div>
      <div class="form-section">💬 Redactar comunicación</div>
      <div class="form-group">
        <label>¿A quién va dirigida?</label>
        <select id="ia-destinatario">
          <option>Cliente</option><option>Supervisor</option><option>Asociado</option><option>Equipo interno</option>
        </select>
      </div>
      <div class="form-group">
        <label>Tema de la comunicación</label>
        <input type="text" id="ia-tema" placeholder="Ej: Seguimiento de propuesta, Recordatorio de pago, Resolución de reclamo...">
      </div>
      <button class="btn btn-primary" onclick="generarComunicacionIA('${contexto}')">✍️ Generar borrador de comunicación</button>
      <div id="ia-comunicacion-crm" style="display:none;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:14px;font-size:13px;white-space:pre-wrap;"></div>
    </div>`;
  $('pedido-title').textContent=titulosIA[contexto]||'🤖 Agente IA';
  $('pedido-body').innerHTML=html;
  abrirModal('modal-ver-pedido');
  // Simular análisis IA (en producción: Claude API)
  setTimeout(()=>{
    const respuestas={
      crm:`📊 <strong>Análisis del pipeline:</strong><br><br>
• <strong>Prioridad alta:</strong> Clínica Bazterrica está en "Negociación" con $800k/mes — el lead más valioso. Recomiendo contacto esta semana para cerrar.<br>
• <strong>Acción urgente:</strong> Hay ${DB.leads.flatMap(l=>l.acciones||[]).filter(a=>a.estado==='Pendiente').length} acciones pendientes. Las más vencidas primero.<br>
• <strong>Patrón detectado:</strong> Los leads de hospitales/clínicas tienen el mayor valor promedio ($800k). Priorizar este segmento.<br>
• <strong>Sugerencia de comunicación:</strong> Para leads en Negociación, personalizá la propuesta con datos del sector del cliente y destacá los casos de éxito similares.`,
      reclamos:`🔍 <strong>Análisis de reclamos:</strong><br><br>
• <strong>Urgente:</strong> Los reclamos de alta prioridad sin resolver generan riesgo de pérdida del cliente.<br>
• <strong>Patrón detectado:</strong> La mayoría de reclamos ocurre entre la 1ra y 3ra semana del mes.<br>
• <strong>Acción preventiva:</strong> Implementar chequeo proactivo con supervisores en semana 2 de cada mes.<br>
• <strong>Comunicación recomendada:</strong> Contacto dentro de las 24hs con propuesta concreta de solución y fecha de resolución.`,
      cobros:`💳 <strong>Análisis de cartera de cobros:</strong><br><br>
• <strong>Prioridad:</strong> Hospital Alemán tiene la mayor deuda en Impago — contactar al Jefe de Servicios Generales esta semana.<br>
• <strong>Estrategia:</strong> Para deudas >30 días, comenzar con email formal + llamada al día siguiente.<br>
• <strong>Proyección:</strong> Con las gestiones activas, se espera cobrar ~70% de la cartera pendiente este mes.<br>
• <strong>Sugerencia:</strong> Agendar llamadas los Martes y Jueves de 10 a 12hs que es cuando más responden.`,
      reasignaciones:`🔄 <strong>Análisis de reasignaciones pendientes:</strong><br><br>
• <strong>Acción urgente:</strong> ${DB.reasignaciones.filter(r=>r.estado==='Pendiente').length} reasignaciones esperando aprobación del Gerente.<br>
• <strong>Impacto en servicio:</strong> Cada día de demora afecta la cobertura del servicio.<br>
• <strong>Comunicación recomendada:</strong> Notificar a supervisores involucrados con al menos 5 días de anticipación para coordinar la transición.<br>
• <strong>Sugerencia:</strong> El sugeridor IA de destinos puede acelerar la decisión del Coordinador.`,
    };
    const iaEl=$('ia-respuesta-crm');
    if(iaEl) iaEl.innerHTML=respuestas[contexto]||'Análisis completado.';
  },1500);
}

function generarComunicacionIA(contexto){
  const dest=$('ia-destinatario')?.value||'Cliente';
  const tema=$('ia-tema')?.value||'seguimiento';
  const el=$('ia-comunicacion-crm');
  if(!el)return;
  el.style.display='block';
  el.textContent='Generando borrador...';
  setTimeout(()=>{
    const plantillas={
      crm:{Cliente:`Estimado/a [Nombre del contacto],\n\nMe comunico para dar seguimiento a nuestra propuesta sobre ${tema}.\n\nDesde Cooperativa Ohlimpia estamos comprometidos con brindarle un servicio de excelencia adaptado a las necesidades de su organización.\n\nQuedo a disposición para coordinar una reunión y responder cualquier consulta.\n\nSaludos cordiales,\n[Tu nombre]\nCooperativa Ohlimpia`},
      reclamos:{Cliente:`Estimado/a [Nombre del contacto],\n\nNos comunicamos en relación al reclamo sobre ${tema}.\n\nEntendemos la importancia de resolver esta situación con rapidez. Nuestro equipo ya está trabajando en una solución concreta que le comunicaremos en las próximas 24 horas.\n\nPedimos disculpas por los inconvenientes generados y nos comprometemos a implementar las mejoras necesarias.\n\nQuedamos a su disposición,\n[Tu nombre]\nCooperativa Ohlimpia`},
      cobros:{Cliente:`Estimado/a [Nombre del contacto],\n\nNos dirigimos a usted en relación a las facturas pendientes correspondientes a ${tema}.\n\nAdjuntamos el detalle de los comprobantes pendientes y quedamos a disposición para coordinar la forma de pago que resulte más conveniente.\n\nAgradecemos su atención y esperamos resolver esta situación a la brevedad.\n\nSaludos,\n[Tu nombre]\nCooperativa Ohlimpia`},
    };
    const plantilla=plantillas[contexto]?.[dest]||`Estimado/a [Nombre],\n\nNos comunicamos respecto a ${tema}.\n\nQuedamos a su disposición.\n\nSaludos,\n[Tu nombre]\nCooperativa Ohlimpia`;
    el.textContent=plantilla;
  },1000);
}

// ========== PUNTO 4: ORDENAMIENTO DE COLUMNAS ==========
// Sistema genérico de ordenamiento para cualquier tabla
var sortState = {}; // {tableId: {col, dir}} — compartido entre makeTableSortable y activarOrdenamientoTabla


// Activar ordenamiento en todas las tablas del sistema



// ════════════════════════════════════════════════════════════════
// PORTAL ASOCIADO — login simple + pedidos de adelanto/préstamo
// ════════════════════════════════════════════════════════════════


function renderMisAdelantos(){
  // Stats
  const nroSocio = currentUser?.nroSocio;
  const filtroTipo = $('asoc-filtro-tipo')?.value||'';
  const filtroEst  = $('asoc-filtro-estado')?.value||'';

  // Recolectar todos los pedidos del asociado
  const misPedidos = [];

  // De planillas formales (supervisor o propio)
  (DB.planillasAdelantos||[]).forEach(p=>{
    (p.items||[]).forEach(it=>{
      if(it.nroSocio!==nroSocio && it.nombre!==currentUser.nombre) return;
      if(filtroTipo&&filtroTipo!=='Adelanto') return;
      const estado = _calcEstadoAsociado(p, it, 'formal');
      if(filtroEst&&estado!==filtroEst) return;
      misPedidos.push({
        tipo:'Adelanto', monto:it.monto||0,
        periodo:p.periodo||'—', origen:it.origen||'supervisor',
        fecha:p.fechaCreacion||'—',
        estado, obs:it.obs||'',
        depositado:p.depositado||false, fechaDeposito:p.fechaDeposito||'—',
        rechazadoPor: _getPrimerRechazo(p, it),
      });
    });
  });

  // De planillas informales
  (DB.planillasInformales||[]).forEach(p=>{
    (p.items||[]).forEach(it=>{
      if(it.nroSocio!==nroSocio && it.nombre!==currentUser.nombre) return;
      if(filtroTipo&&filtroTipo!=='Adelanto') return;
      const estado = _calcEstadoAsociado(p, it, 'informal');
      if(filtroEst&&estado!==filtroEst) return;
      misPedidos.push({
        tipo:'Adelanto informal', monto:it.monto||0,
        periodo:p.periodo||'—', origen:it.origen||'supervisor',
        fecha:p.fechaCreacion||'—',
        estado, obs:it.obs||'',
        depositado:p.depositado||false, fechaDeposito:p.fechaDeposito||'—',
        rechazadoPor: _getPrimerRechazo(p, it),
      });
    });
  });

  // De solicitudes de préstamo
  (DB.solicitudesPrestamos||[]).forEach(s=>{
    (s.items||[]).forEach(it=>{
      if(it.nroSocio!==nroSocio && it.nombre!==currentUser.nombre) return;
      if(filtroTipo&&filtroTipo!=='Préstamo') return;
      const estado = _calcEstadoAsociado(s, it, 'prestamo');
      if(filtroEst&&estado!==filtroEst) return;
      misPedidos.push({
        tipo:'Préstamo', monto:it.montoSolicitado||0,
        cuotas:it.cuotasSolicitadas||0,
        cuotasAprobadas:it.cuotasAprobadas||it.cuotasSolicitadas||0,
        periodo:s.periodo||'—', origen:it.origen||'supervisor',
        fecha:s.fechaCreacion||'—',
        estado, obs:it.obs||'',
        depositado:s.depositado||false, fechaDeposito:s.fechaDeposito||'—',
        rechazadoPor: _getPrimerRechazo(s, it),
      });
    });
  });

  // Stats
  const activos = misPedidos.filter(p=>!['Depositado','Rechazado'].includes(p.estado)).length;
  const depositados = misPedidos.filter(p=>p.estado==='Depositado').length;
  const prestamos = misPedidos.filter(p=>p.tipo==='Préstamo'&&!['Rechazado'].includes(p.estado)).length;
  if($('st-asoc-activos')) $('st-asoc-activos').textContent=activos;
  if($('st-asoc-depositados')) $('st-asoc-depositados').textContent=depositados;
  if($('st-asoc-prestamos')) $('st-asoc-prestamos').textContent=prestamos;

  const el=$('asoc-solicitudes-body'); if(!el) return;

  if(!misPedidos.length){
    el.innerHTML=`<div style="padding:40px;text-align:center;color:var(--texto-muy-suave);">
      <div style="font-size:36px;margin-bottom:8px;">📋</div>
      <div>No tenés solicitudes registradas.</div>
      <div style="font-size:12px;margin-top:6px;">Usá el botón "+ Solicitar adelanto" para hacer tu pedido.</div>
    </div>`;
    return;
  }

  const estadoColor = {
    'Pendiente de supervisor':'badge-naranja',
    'Aprobado por supervisor':'badge-azul',
    'En revisión RRHH':'badge-naranja',
    'Rechazado por RRHH':'badge-rojo',
    'Aprobado por RRHH':'badge-azul',
    'En revisión Finanzas':'badge-naranja',
    'Aprobado':'badge-verde',
    'Rechazado':'badge-rojo',
    'Depositado':'badge-verde',
  };
  const origenLabel = {
    'asociado':'📲 Pedido por vos',
    'supervisor':'👤 Cargado por supervisor',
  };

  el.innerHTML = misPedidos.map(p=>`
    <div style="border:1px solid ${p.estado==='Rechazado'?'#fca5a5':p.estado==='Depositado'?'#9fdaba':'var(--borde)'};
      border-radius:10px;padding:14px 16px;margin-bottom:12px;
      background:${p.estado==='Rechazado'?'#fff1f2':p.estado==='Depositado'?'#f0fdf4':'white'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-weight:700;font-size:14px;">
            ${p.tipo} — <span style="color:var(--azul);">$${p.monto.toLocaleString('es-AR')}</span>
            ${p.tipo==='Préstamo'?`<span style="font-size:11px;color:var(--texto-suave);font-weight:400;"> (${p.cuotas} cuotas)</span>`:''}
          </div>
          <div style="font-size:11px;color:var(--texto-suave);margin-top:3px;">
            Período: ${p.periodo} · Solicitado: ${p.fecha}
            · <span style="color:var(--texto-suave);">${origenLabel[p.origen]||p.origen}</span>
          </div>
        </div>
        <span class="badge ${estadoColor[p.estado]||'badge-gris'}" style="font-size:11px;">${p.estado}</span>
      </div>
      ${p.estado==='Depositado'?`
          💸 Depositado el ${p.fechaDeposito}
        </div>`:''}
      ${p.estado==='Rechazado'?`
          ❌ Rechazado por ${p.rechazadoPor||'Finanzas'}${p.obs?' — Motivo: '+p.obs:''}
        </div>`:''}
      ${!['Rechazado','Depositado'].includes(p.estado)?`
          ${_barraProgresoAdelantos(p.estado)}
        </div>`:''}
    </div>`).join('');
}

function _calcEstadoAsociado(planilla, item, tipo){
  // Estado visible para el asociado según el flujo de 3 niveles
  if(planilla.depositado) return 'Depositado';
  if(item.estado==='Rechazado') return 'Rechazado';
  if(planilla.estado==='Rechazada'||planilla.estado==='Rechazado por RRHH') return 'Rechazado';
  if(planilla.estado==='Aprobada') return 'Aprobado';
  if(planilla.estado==='Aprobada RRHH'||planilla.estado==='En revisión Finanzas') return 'Aprobado por RRHH';
  if(planilla.estado==='En revisión RRHH'||planilla.estado==='Aprobada supervisor') return 'En revisión RRHH';
  if(planilla.estado==='Enviada') return 'Aprobado por supervisor';
  return 'Pendiente de supervisor';
}

function _getPrimerRechazo(planilla, item){
  if(planilla.rechazadoPorRrhh) return 'RRHH';
  if(planilla.resueltoPor) return planilla.resueltoPor;
  return 'Finanzas';
}

function _barraProgresoAdelantos(estado){
  const pasos = [
    {key:'Pendiente de supervisor', label:'Supervisor'},
    {key:'En revisión RRHH',        label:'RRHH'},
    {key:'En revisión Finanzas',    label:'Finanzas'},
    {key:'Aprobado',                label:'Depositado'},
  ];
  const mapaPos = {
    'Pendiente de supervisor':0,
    'Aprobado por supervisor':1,
    'En revisión RRHH':1,
    'Aprobado por RRHH':2,
    'En revisión Finanzas':2,
    'Aprobado':3,
  };
  const pos = mapaPos[estado]??0;
  return `<div style="display:flex;gap:0;align-items:center;margin-top:4px;">
    ${pasos.map((p,i)=>`
          background:${i<pos?'#1d4ed8':i===pos?'#dbeafe':'white'};
          display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;
          color:${i<pos?'white':i===pos?'#1d4ed8':'#9ca3af'};flex-shrink:0;">
          ${i<pos?'✓':i+1}
        ${i<pasos.length-1?`<div style="height:2px;background:${i<pos?'#1d4ed8':'#e5e7eb'};flex:1;margin:0 4px;"></div>`:''}
      </div>`).join('')}
  </div>`;
}

function abrirModalSolicitarAsociado(){
  const nroSocio = currentUser?.nroSocio;
  const legajo = (DB.legajos||[]).find(l=>l.nro===nroSocio);
  if(!legajo){ toast('Error: no se encontró tu legajo'); return; }
  // Poblar modal
  if($('asoc-sol-nombre')) $('asoc-sol-nombre').textContent = legajo.nombre;
  if($('asoc-sol-servicio')) $('asoc-sol-servicio').textContent = legajo.servicio;
  if($('asoc-sol-supervisor')) $('asoc-sol-supervisor').textContent = legajo.supervisor;
  if($('asoc-sol-tipo')) $('asoc-sol-tipo').value = 'Adelanto';
  if($('asoc-sol-monto')) $('asoc-sol-monto').value = DB.adelantosConfig?.montoFijo||30000;
  if($('asoc-sol-cuotas-row')) $('asoc-sol-cuotas-row').style.display='none';
  if($('asoc-sol-motivo')) $('asoc-sol-motivo').value='';
  actualizarModalAsoc();
  abrirModal('modal-asoc-solicitud');
}

function actualizarModalAsoc(){
  const tipo = $('asoc-sol-tipo')?.value;
  if($('asoc-sol-cuotas-row')) $('asoc-sol-cuotas-row').style.display = tipo==='Préstamo'?'block':'none';
  if(tipo==='Préstamo'){
    // Poblar select cuotas
    const sel=$('asoc-sol-cuotas');
    if(sel && !sel.options.length){
      const cfg=DB.adelantosConfig||{};
      const maxCuotas=cfg.maxCuotas||24;
      const tabla=(cfg.tablaCuotas||[3,6,9,12,18,24]).filter(c=>c<=maxCuotas).sort((a,b)=>a-b);
      const opciones=tabla.length>0?tabla:Array.from({length:maxCuotas},(_,i)=>i+1);
      sel.innerHTML=opciones.map(c=>`<option value="${c}">${c} cuota${c>1?'s':''}</option>`).join('');
    }
  }
}

function confirmarSolicitudAsociado(){
  const nroSocio = currentUser?.nroSocio;
  const nombre = currentUser?.nombre;
  const legajo = (DB.legajos||[]).find(l=>l.nro===nroSocio);
  if(!legajo){toast('Error: legajo no encontrado');return;}

  const tipo = $('asoc-sol-tipo')?.value||'Adelanto';
  const monto = parseFloat($('asoc-sol-monto')?.value)||0;
  const motivo = $('asoc-sol-motivo')?.value||'';
  const alertaMonto = DB.adelantosConfig?.alertaMonto||50000;

  if(!monto){toast('Ingresá el monto del pedido');return;}

  const mes = new Date().toISOString().slice(0,7);
  const fecha = new Date().toLocaleDateString('es-AR');

  if(tipo==='Adelanto'){
    // Crear o agregar a la planilla borrador del supervisor
    if(!DB.planillasAdelantos) DB.planillasAdelantos=[];
    let planilla = DB.planillasAdelantos.find(p=>
      p.periodo===mes && p.supervisorNombre===legajo.supervisor && p.estado==='Borrador'
    );
    if(!planilla){
      planilla = {
        id:Date.now(), periodo:mes,
        supervisorNombre:legajo.supervisor,
        estado:'Borrador', fechaCreacion:fecha, items:[],
      };
      DB.planillasAdelantos.push(planilla);
    }
    planilla.items.push({
      nombre, nroSocio, monto, estado:'Pendiente',
      obs:motivo, origen:'asociado',
    });
    toast('✅ Tu pedido de adelanto fue enviado a '+(legajo.supervisor||'tu supervisor'));
  } else {
    // Préstamo
    const cuotas = parseInt($('asoc-sol-cuotas')?.value)||12;
    if(!DB.solicitudesPrestamos) DB.solicitudesPrestamos=[];
    let sol = DB.solicitudesPrestamos.find(s=>
      s.periodo===mes && s.supervisorNombre===legajo.supervisor && s.estado==='Borrador'
    );
    if(!sol){
      sol = {
        id:Date.now(), periodo:mes,
        supervisorNombre:legajo.supervisor,
        estado:'Borrador', fechaCreacion:fecha, items:[],
      };
      DB.solicitudesPrestamos.push(sol);
    }
    sol.items.push({
      nombre, nroSocio,
      montoSolicitado:monto, cuotasSolicitadas:cuotas,
      montoCuota:Math.round(monto/cuotas),
      estado:'Pendiente', obs:motivo, origen:'asociado',
    });
    toast('✅ Tu pedido de préstamo fue enviado a '+(legajo.supervisor||'tu supervisor'));
  }

  cerrarModal('modal-asoc-solicitud');
  if(monto>=alertaMonto) setTimeout(()=>toast('⚠️ Tu pedido supera el monto de alerta. Puede requerir aprobación especial.'),1500);
  renderMisAdelantos();
}




// ========== REVISIÓN RRHH + GESTIÓN DE ADELANTOS (Finanzas) — migrado a src/modules/gestion_adelantos/ ==========


// INIT — movido a main.js

// ── Funciones utilitarias nuevas ──

// Zona/Localidad candidatos

// Zona/Localidad alta

// ── Módulo Candidatos rediseñado ──




// Helpers que buscan por ID en lugar de índice

















// (Reportes y Sugerencias migrado a src/modules/sugerencias/ — v041)



// ── Módulo Psicotécnico — Gestión ──







// ========== BIND TO WINDOW ==========
window._barraProgresoAdelantos = _barraProgresoAdelantos;
window._calcEstadoAsociado = _calcEstadoAsociado;
window._getFilasConsolidadas = _getFilasConsolidadas;
window._getPrimerRechazo = _getPrimerRechazo;
window.abrirAgenteIA = abrirAgenteIA;
window.abrirCargaRapidaMant = abrirCargaRapidaMant;
window.abrirCargaRapidaReten = abrirCargaRapidaReten;
window.abrirEditarVacAdmin = abrirEditarVacAdmin;
window.abrirModalArt42 = abrirModalArt42;
window.abrirModalCategoriaSind = abrirModalCategoriaSind;
window.abrirModalCliente = abrirModalCliente;
window.abrirModalObjetivo = abrirModalObjetivo;
window.abrirBajaCliente = abrirBajaCliente;
window.abrirBajaObjetivo = abrirBajaObjetivo;
window.abrirAsignarSupervisor = abrirAsignarSupervisor;
window.abrirCambiarSupervisor = abrirCambiarSupervisor;
window.abrirModalConcepto = abrirModalConcepto;
window.abrirModalDescuento = abrirModalDescuento;
window.abrirModalFeriado = abrirModalFeriado;
window.abrirModalImportarTabla = abrirModalImportarTabla;
window.abrirModalMotivoEFT = abrirModalMotivoEFT;
window.abrirModalMotivoNF = abrirModalMotivoNF;
window.abrirModalMotivoTipo = abrirModalMotivoTipo;
window.abrirModalNuevaGrilla = abrirModalNuevaGrilla;
window.abrirModalNuevaRetencion = abrirModalNuevaRetencion;
window.abrirModalNuevaVigencia = abrirModalNuevaVigencia;
window.abrirModalNuevoAdminLiq = abrirModalNuevoAdminLiq;
window.abrirModalNuevoMant = abrirModalNuevoMant;
window.abrirModalNuevoMonotributo = abrirModalNuevoMonotributo;
window.abrirModalNuevoReten = abrirModalNuevoReten;
window.abrirModalNuevoSuplemento = abrirModalNuevoSuplemento;
window.abrirModalParitaria = abrirModalParitaria;
window.abrirModalPropuestaPrecio = abrirModalPropuestaPrecio;
window.abrirModalSolicitarAsociado = abrirModalSolicitarAsociado;
window.accionLiqAdmin = accionLiqAdmin;
window.activarAgente = activarAgente;
window.actualizarEscalaModal = actualizarEscalaModal;
window.actualizarFechaCobro = actualizarFechaCobro;
window.actualizarFuncionUsuario = actualizarFuncionUsuario;
window.actualizarHorasAdmin = actualizarHorasAdmin;
window.actualizarHorasSuplemento = actualizarHorasSuplemento;
window.actualizarModalAsoc = actualizarModalAsoc;
window.actualizarNickname = actualizarNickname;
window.actualizarPermisosPreview = actualizarPermisosPreview;
window.actualizarPreviewFormula = actualizarPreviewFormula;
window.actualizarProyeccion = actualizarProyeccion;
window.actualizarValorHoraAdmin = actualizarValorHoraAdmin;
window.actualizarValorHoraSuplemento = actualizarValorHoraSuplemento;
window.agregarAdjuntoObj = agregarAdjuntoObj;
window.agregarAsocDesdeSearch = agregarAsocDesdeSearch;
window.agregarAsociadoGrilla = agregarAsociadoGrilla;
window.agregarCfgComercial = agregarCfgComercial;
window.agregarContactoCliente = agregarContactoCliente;
window.agregarEtapaCRM = agregarEtapaCRM;
window.agregarFuncionUsuario = agregarFuncionUsuario;
window.agregarItem = agregarItem;
window.agregarMesLiq = agregarMesLiq;
window.agregarPersonaArea = agregarPersonaArea;
window.agregarPregunta = agregarPregunta;
window.agregarRespObjetivo = agregarRespObjetivo;
window.agregarSMVM = agregarSMVM;
window.alertarAccionesVencidasModulo = alertarAccionesVencidasModulo;
window.analizarCobrosIA = analizarCobrosIA;
window.analizarReclamosIA = analizarReclamosIA;
window.anularPago = anularPago;
window.aplicarAumentoAsociados = aplicarAumentoAsociados;
window.aplicarRecategorizaciones = aplicarRecategorizaciones;
window.autorizarSalidaPrecio = autorizarSalidaPrecio;
window.rechazarInternoPrecio = rechazarInternoPrecio;
window.marcarEnviadaCliente = marcarEnviadaCliente;
window.confirmarCierreCliente = confirmarCierreCliente;
window.rechazoClientePrecio = rechazoClientePrecio;
window.rearmarPropuesta = rearmarPropuesta;
window.autorizarLotePrecio = autorizarLotePrecio;
window.pedirMotivoPrecio = pedirMotivoPrecio;
window.confirmarMotivoPrecio = confirmarMotivoPrecio;
window.toggleTipoModificacionPP = toggleTipoModificacionPP;
window.agregarTramoPP = agregarTramoPP;
window.quitarTramoPP = quitarTramoPP;
window.actualizarTramoPP = actualizarTramoPP;
window.renderTramosPP = renderTramosPP;
window.abrirModalLotePrecios = abrirModalLotePrecios;
window.cargarServiciosLotePrecios = cargarServiciosLotePrecios;
window.aplicarPctGeneralLote = aplicarPctGeneralLote;
window.recalcularFilaLote = recalcularFilaLote;
window.guardarLotePrecios = guardarLotePrecios;
window.poblarObjetivosProyeccion = poblarObjetivosProyeccion;
window.asignarColumna = asignarColumna;
window.asignarTodosModulos = asignarTodosModulos;
window.asignarTodosUsuario = asignarTodosUsuario;
window.autorizarPago = autorizarPago;
window.avanzarEtapa = avanzarEtapa;
window.buscarAsocGrilla = buscarAsocGrilla;
window.buscarAsocParaArea = buscarAsocParaArea;
window.calcularCURSugerido = calcularCURSugerido;
window.calcularHorasMes = calcularHorasMes;
window.calcularPP = calcularPP;
window.calcularVacAdmin = calcularVacAdmin;
window.cambiarEstadoVacOp = cambiarEstadoVacOp;
window.cambiarMesPlan = cambiarMesPlan;
window.cambiarMesVac = cambiarMesVac;
window.cargarDatosObjetivoEnPP = cargarDatosObjetivoEnPP;
window.cargarFeriadosArg = cargarFeriadosArg;
window.cerrarGrilla = cerrarGrilla;
window.cerrarNC = cerrarNC;
window.cerrarReclamo = cerrarReclamo;
window.cfgTab = cfgTab;
window.ciclarPermiso = ciclarPermiso;
window.confirmarAgregarAsoc = confirmarAgregarAsoc;
window.confirmarCargaRapidaMant = confirmarCargaRapidaMant;
window.confirmarCargaRapidaReten = confirmarCargaRapidaReten;
window.confirmarImportacion = confirmarImportacion;
window.confirmarMotivoTipo = confirmarMotivoTipo;
window.confirmarNuevoAdminLiq = confirmarNuevoAdminLiq;
window.confirmarNuevoMant = confirmarNuevoMant;
window.confirmarNuevoReten = confirmarNuevoReten;
window.confirmarNuevoSuplemento = confirmarNuevoSuplemento;
window.confirmarBajaObjetivo = confirmarBajaObjetivo;
window.confirmarSolicitudAsociado = confirmarSolicitudAsociado;
window.confirmarSupervisorObjetivo = confirmarSupervisorObjetivo;
window.contactarAsociadosIA = contactarAsociadosIA;
window.crearGrilla = crearGrilla;
window.crearGrillaDesdeObj = crearGrillaDesdeObj;
window.dragLead = dragLead;
window.dropLead = dropLead;
window.confirmarCambioEtapa = confirmarCambioEtapa;
window.marcarLeadPerdido = marcarLeadPerdido;
window.completarClienteBorradorAhora = completarClienteBorradorAhora;
window.completarClienteBorradorDespues = completarClienteBorradorDespues;
window.actualizarHistoriaRetroLead = actualizarHistoriaRetroLead;
window.editarMonotributo = editarMonotributo;
window.editarMotivoEFT = editarMotivoEFT;
window.editarMotivoNF = editarMotivoNF;
window.editarRetencion = editarRetencion;
window.eliminarCategoriaSind = eliminarCategoriaSind;
window.eliminarCfgComercial = eliminarCfgComercial;
window.eliminarConceptoLiq = eliminarConceptoLiq;
window.eliminarDescuentoLiq = eliminarDescuentoLiq;
window.eliminarEtapaCRM = eliminarEtapaCRM;
window.eliminarFeriado = eliminarFeriado;
window.eliminarFuncionUsuario = eliminarFuncionUsuario;
window.eliminarItem = eliminarItem;
window.eliminarMesLiq = eliminarMesLiq;
window.eliminarMonotributo = eliminarMonotributo;
window.eliminarPersonaArea = eliminarPersonaArea;
window.expandirTodasGrillas = expandirTodasGrillas;
window.exportarLiquidacion = exportarLiquidacion;
window.exportarLiquidacionCSV = exportarLiquidacionCSV;
window.filtrarAcciones = filtrarAcciones;
window.filtrarClientes = filtrarClientes;
window.filtrarCobrados = filtrarCobrados;
window.filtrarCobros = filtrarCobros;
window.filtrarPorCliente = filtrarPorCliente;
window.abrirGestionCliente = abrirGestionCliente;
window.toggleGcTodasFacturas = toggleGcTodasFacturas;
window.toggleGcResultado = toggleGcResultado;
window.guardarGestionCliente = guardarGestionCliente;
window.confirmarCompletarGestion = confirmarCompletarGestion;
window.eliminarCobro = eliminarCobro;
window.filtrarLeads = filtrarLeads;
window.filtrarObjetivos = filtrarObjetivos;
window.filtrarReclamos = filtrarReclamos;
window.filtrarVacAdmin = filtrarVacAdmin;
window.filtrarVacOp = filtrarVacOp;
window.formatPeriodoSMVM = formatPeriodoSMVM;
window.generarComunicacionIA = generarComunicacionIA;
window.generarHorasPrecargas = generarHorasPrecargas;
window.generarPlanIA = generarPlanIA;
window.generarPropuestasClientes = generarPropuestasClientes;
window.getCURPersona = getCURPersona;
window.getCategoriaVH = getCategoriaVH;
window.getCategoriasPorTipo = getCategoriasPorTipo;
window.getHorasRetenDeServicios = getHorasRetenDeServicios;
window.getLimiteCategoria = getLimiteCategoria;
window.getNetoUltimoMes = getNetoUltimoMes;
window.getPermisosIniciales = getPermisosIniciales;
window.getProyeccionAnual = getProyeccionAnual;
window.getTablaVigente = getTablaVigente;
window.getValoresPeriodo = getValoresPeriodo;
window.getVigenciaActual = getVigenciaActual;
window.guardarArt42 = guardarArt42;
window.guardarCategoriaSind = guardarCategoriaSind;
window.guardarCliente = guardarCliente;
window.guardarConceptoLiq = guardarConceptoLiq;
window.guardarDescuentoLiq = guardarDescuentoLiq;
window.guardarEvaluacion = guardarEvaluacion;
window.guardarFeriado = guardarFeriado;
window.guardarLead = guardarLead;
window.abrirNuevoLead = abrirNuevoLead;
window.guardarMonotributo = guardarMonotributo;
window.guardarMotivoEFT = guardarMotivoEFT;
window.guardarMotivoNF = guardarMotivoNF;
window.guardarNuevaVigencia = guardarNuevaVigencia;
window.guardarObjetivo = guardarObjetivo;
window.guardarParitaria = guardarParitaria;
window.guardarPropuestaPrecio = guardarPropuestaPrecio;
window.guardarReclamo = guardarReclamo;
window.guardarUsuario = guardarUsuario;
window.guardarVacAdmin = guardarVacAdmin;
window.buscarAsocVac = buscarAsocVac;
window.seleccionarAsocVac = seleccionarAsocVac;
window.guardarVacOp = guardarVacOp;
window.homologarParitaria = homologarParitaria;
window.analizarEstadoCuentaTango = analizarEstadoCuentaTango;
window.confirmarImportacionEstadoCuentaTango = confirmarImportacionEstadoCuentaTango;
window.asignarObjetivoFactura = asignarObjetivoFactura;
window.asignarPeriodoFactura = asignarPeriodoFactura;
window.sincronizarComisionesFactura = sincronizarComisionesFactura;
window.generarDevengosFactura = generarDevengosFactura;
window.habilitarComisionesFactura = habilitarComisionesFactura;
// DELTA_comisiones_v1 — asignación de comisiones en el modal de Servicios
window.toggleComisionesObjetivo = toggleComisionesObjetivo;
window.toggleObjComExterno = toggleObjComExterno;
window.toggleObjComPeriodos = toggleObjComPeriodos;
window.agregarComisionObjetivoTemp = agregarComisionObjetivoTemp;
window.eliminarComisionObjTemp = eliminarComisionObjTemp;
window.guardarComisionesObjetivo = guardarComisionesObjetivo;
// DELTA_comisiones_v1 — pantalla Comisiones
window.tabComisiones = tabComisiones;
window.renderComisiones = renderComisiones;
window.agregarComisionExterno = agregarComisionExterno;
window.eliminarComisionExterno = eliminarComisionExterno;
window.abrirComisionPersona = abrirComisionPersona;
window.toggleModoAvanzadoPago = toggleModoAvanzadoPago;
window.guardarPagoComision = guardarPagoComision;
window.initPermisosUsuarios = initPermisosUsuarios;
window.initResumenMes = initResumenMes;
window.liberarRetencion = liberarRetencion;
window.mantenerCategoria = mantenerCategoria;
window.marcarAccionRealizada = marcarAccionRealizada;
window.marcarCobrado = marcarCobrado;
window.marcarListoIndividual = marcarListoIndividual;
window.marcarTodosListo = marcarTodosListo;
window.marcarTodosRecateg = marcarTodosRecateg;
window.notificarseAuth = notificarseAuth;
window.nuevoObjetivoDesde = nuevoObjetivoDesde;
window.onChangeMagDesde = onChangeMagDesde;
window.overrideVHCat = overrideVHCat;
window.parsearTablaImportada = parsearTablaImportada;
window.poblarSelectCategoriaLiq = poblarSelectCategoriaLiq;
window.poblarSelectFuncionUsuario = poblarSelectFuncionUsuario;
window.poblarSelectMotivoEFT = poblarSelectMotivoEFT;
window.poblarSelectMotivoNF = poblarSelectMotivoNF;
window.poblarSelects = poblarSelects;
window.poblarSelectsLiquidacion = poblarSelectsLiquidacion;
window.poblarSelectsVacaciones = poblarSelectsVacaciones;
window.poblarSelectsComercial = poblarSelectsComercial;
window.precargarDatosGrilla = precargarDatosGrilla;
window.previsualizarImportacion = previsualizarImportacion;
window.proponerRecategorizacion = proponerRecategorizacion;
window.proyectarAumentoAsociados = proyectarAumentoAsociados;
window.quitarAsociadoGrilla = quitarAsociadoGrilla;
window.quitarPersonalAdmin = quitarPersonalAdmin;
window.quitarSuplemento = quitarSuplemento;
window.quitarTodosModulos = quitarTodosModulos;
window.recalcCatVH = recalcCatVH;
window.reactivarObjetivo = reactivarObjetivo;
window.reconciliarPeriodosOperaciones = reconciliarPeriodosOperaciones;
window.recalcClienteVH = recalcClienteVH;
window.recalcLiquidacion = recalcLiquidacion;
window.recalcTotalesLiq = recalcTotalesLiq;
window.recategorizarModal = recategorizarModal;
window.rechazarPropuesta = rechazarPropuesta;
window.registrarAlertaEFT = registrarAlertaEFT;
window.registrarPago = registrarPago;
window.registrarPendienteAuth = registrarPendienteAuth;
window.renderAcciones = renderAcciones;
window.renderAdjuntosObj = renderAdjuntosObj;
window.renderAlertasEFT = renderAlertasEFT;
window.renderAlertasMonotributo = renderAlertasMonotributo;
window.renderAreasPersonal = renderAreasPersonal;
window.renderArt42 = renderArt42;
window.renderCRM = renderCRM;
window.renderCalendarioPlan = renderCalendarioPlan;
// window.renderCalendarioVacaciones ya NO se bindea acá — colisionaba con
// el calendario nuevo del módulo Vacaciones migrado (src/modules/vacaciones/
// calendario.js). La función vieja queda arriba como referencia, sin uso.
window.renderCategoriasSind = renderCategoriasSind;
window.renderCfgEtapasCRM = renderCfgEtapasCRM;
window.renderCfgComercialLista = renderCfgComercialLista;
window.renderClientes = renderClientes;
window.renderCobrados = renderCobrados;
window.renderCobros = renderCobros;
window.renderSaldoPorCliente = renderSaldoPorCliente;
window.renderConceptosLiq = renderConceptosLiq;
window.renderConfigLista = renderConfigLista;
window.renderConfigComercial = renderConfigComercial;
window.renderConfiguracion = renderConfiguracion;
window.renderContactosClienteTemp = renderContactosClienteTemp;
window.renderDescuentosLiq = renderDescuentosLiq;
window.renderEscalaSalarial = renderEscalaSalarial;
window.renderEvaluaciones = renderEvaluaciones;
window.renderFeriados = renderFeriados;
window.renderGrillaFuncionesUsuario = renderGrillaFuncionesUsuario;
window.renderGrillaIndividual = renderGrillaIndividual;
window.renderGrillasLiq = renderGrillasLiq;
window.renderHistorialAuth = renderHistorialAuth;
window.renderHistorialImportaciones = renderHistorialImportaciones;
window.renderHistorialMono = renderHistorialMono;
window.renderHistorialPrecios = renderHistorialPrecios;
window.renderInicio = renderInicio;
window.renderLeads = renderLeads;
window.renderLiqAdmin = renderLiqAdmin;
window.renderLiqArt42 = renderLiqArt42;
window.renderLiqSuplemento = renderLiqSuplemento;
window.renderLiquidacion = renderLiquidacion;
window.renderLiquidaciones = renderLiquidaciones;
window.renderMantResumen = renderMantResumen;
window.renderMantenimiento = renderMantenimiento;
window.renderMesesLiq = renderMesesLiq;
window.renderMisAdelantos = renderMisAdelantos;
window.renderMisAuth = renderMisAuth;
window.renderMonotributos = renderMonotributos;
window.renderMotivosEFT = renderMotivosEFT;
window.renderMotivosEFTLiq = renderMotivosEFTLiq;
window.renderMotivosNF = renderMotivosNF;
window.renderMotivosNFLiq = renderMotivosNFLiq;
window.renderNC = renderNC;
window.renderObjetivos = renderObjetivos;
window.renderParAsociados = renderParAsociados;
window.renderParClientes = renderParClientes;
window.renderParProyeccion = renderParProyeccion;
window.renderParitarias = renderParitarias;
window.renderPendientesAuth = renderPendientesAuth;
window.renderPipeline = renderPipeline;
window.renderPrecios = renderPrecios;
window.renderPropuestasPrecio = renderPropuestasPrecio;
window.renderReclamos = renderReclamos;
window.renderRespObjetivoTemp = renderRespObjetivoTemp;
window.renderResumenMes = renderResumenMes;
window.renderResumenPlan = renderResumenPlan;
window.renderRetenResumen = renderRetenResumen;
window.renderRetenes = renderRetenes;
window.renderSMVM = renderSMVM;
window.renderStatsCRM = renderStatsCRM;
window.renderStatsReclamos = renderStatsReclamos;
window.renderTablaPerfilesModulos = renderTablaPerfilesModulos;
window.renderTablaUsuarios = renderTablaUsuarios;
window.renderTablasCategorias = renderTablasCategorias;
window.renderVacAdmin = renderVacAdmin;
window.renderVacOp = renderVacOp;
window.renderVacaciones = renderVacaciones;
window.resolverAlertaEFT = resolverAlertaEFT;
window.resolverAuth = resolverAuth;
window.seleccionarAsocParaArea = seleccionarAsocParaArea;
window.seleccionarAsocSearch = seleccionarAsocSearch;
window.seleccionarTodasCategorias = seleccionarTodasCategorias;
window.seleccionarTodosClientes = seleccionarTodosClientes;
window.setCatBaseMant = setCatBaseMant;
window.setCatBaseReten = setCatBaseReten;
window.setDescuentoLqs = setDescuentoLqs;
window.setHoraAdmin = setHoraAdmin;
window.setHoraGrilla = setHoraGrilla;
window.setHoraMant = setHoraMant;
window.setHoraReten = setHoraReten;
window.setHoraSuplemento = setHoraSuplemento;
window.setTipoAdmin = setTipoAdmin;
window.setTipoHoraAsoc = setTipoHoraAsoc;
window.setValorLiq = setValorLiq;
window.setValoresPeriodo = setValoresPeriodo;
window.solicitarCatAlt = solicitarCatAlt;
window.asignarCategoriaLegajo = asignarCategoriaLegajo;
window.tabCliModal = tabCliModal;
window.tabObjetivos = tabObjetivos;
window.chequearObjetivosDemorados = chequearObjetivosDemorados;
window.tabCobros = tabCobros;
window.tabCrm = tabCrm;
window.tabLiqAdmin = tabLiqAdmin;
window.tabLiquidacion = tabLiquidacion;
window.tabMantenimiento = tabMantenimiento;
window.tabMonotributos = tabMonotributos;
window.tabObjModal = tabObjModal;
window.tabPrecios = tabPrecios;
window.tabReclamos = tabReclamos;
window.tabRetenes = tabRetenes;
window.tabVacaciones = tabVacaciones;
window.toggleActivoEFT = toggleActivoEFT;
window.toggleActivoNF = toggleActivoNF;
window.toggleConceptoCalculo = toggleConceptoCalculo;
window.toggleCongelarLiquidacion = toggleCongelarLiquidacion;
window.toggleDescuentoBase = toggleDescuentoBase;
window.toggleFueraEFT = toggleFueraEFT;
window.toggleGrilla = toggleGrilla;
window.toggleModeloPrecio = toggleModeloPrecio;
window.recalcularPrecioObjetivo = recalcularPrecioObjetivo;
window.poblarLocalidadesServicio = poblarLocalidadesServicio;
window.heredarFacturacionDeCliente = heredarFacturacionDeCliente;
window.agregarPuestoObj = agregarPuestoObj;
window.renderPuestosObj = renderPuestosObj;
window.toggleResponsableClienteTipo = toggleResponsableClienteTipo;
window.poblarModeloPrecioSegunCliente = poblarModeloPrecioSegunCliente;
window.toggleMotivoNoFact = toggleMotivoNoFact;
window.toggleNuevaGrillaTipo = toggleNuevaGrillaTipo;
window.togglePermiso = togglePermiso;
window.validarFechasArt42 = validarFechasArt42;
window.verCliente = verCliente;
window.verDetalleEvaluacion = verDetalleEvaluacion;
window.verDetalleLqs = verDetalleLqs;
window.verGrillaMantDetalle = verGrillaMantDetalle;
window.verGrillaRetenDetalle = verGrillaRetenDetalle;
window.verGrillaServicioDetalle = verGrillaServicioDetalle;
window.verHistorialCat = verHistorialCat;
window.verLead = verLead;
window.verObjetivo = verObjetivo;
window.verParitaria = verParitaria;
window.verReclamo = verReclamo;
window.verificarAccionesVencidas = verificarAccionesVencidas;
window.verificarEFTGrilla = verificarEFTGrilla;

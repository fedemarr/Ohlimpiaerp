# Ohlimpia ERP — Perfil Desarrollador

## Contexto del proyecto
Leer el CLAUDE.md del proyecto antes de implementar.
Stack: Vanilla JS + Vite + Supabase (sin framework, sin API propia).
Navegación por navTo(key) — no hay router.
Estado global en DB (state.js). Persistencia con supaSync().
La tabla `sugerencias` ya existe en Supabase y tiene datos.

---

## Lo que hay que construir

Un perfil nuevo llamado DEVELOPER con su propia pantalla
que tiene 4 secciones: Inicio, Tickets, Proyección y Seguridad.

El perfil DEVELOPER solo ve esas 4 secciones — nada más del ERP.
Las sugerencias que ya carga la gente desde el módulo existente
se convierten automáticamente en tickets para este perfil.

---

## PASO 1 — Perfil DEVELOPER en state.js

En `src/shared/state.js`, agregar en el objeto PERFILES:

```js
DEVELOPER: {
  nombre: 'Desarrollador',
  color: '#2563EB',
  menu: ['dev_inicio', 'dev_tickets', 'dev_proyeccion', 'dev_seguridad'],
},
```

Agregar usuario desarrollador en DB.usuarios:
```js
{ 
  id: 'dev_fmcode', 
  nombre: 'Fede Dev', 
  usuario: 'fede', 
  password: 'fmcode2026', 
  perfil: 'DEVELOPER' 
}
```

---

## PASO 2 — Módulo developer

Crear `src/modules/developer/` con la estructura estándar del proyecto:

```
src/modules/developer/
  index.js      → re-exports + screenConfigs + window bindings
  developer.js  → toda la lógica de las 4 pantallas
```

---

## PASO 3 — Tabla tickets en Supabase

Crear en Supabase la tabla `tickets`:

```sql
create table tickets (
  id            bigint generated always as identity primary key,
  id_local      text unique,
  sugerencia_id text,        -- referencia a tabla sugerencias (si viene de ahí)
  titulo        text not null,
  descripcion   text,
  tipo          text default 'sugerencia', -- 'bug' | 'sugerencia' | 'consulta' | 'otro'
  estado        text default 'abierto',    -- 'abierto' | 'en_progreso' | 'resuelto' | 'cerrado'
  prioridad     text default 'media',      -- 'alta' | 'media' | 'baja'
  modulo        text,        -- de qué módulo del ERP viene
  autor         text,        -- nombre del usuario que lo creó
  respuesta_dev text,        -- respuesta del desarrollador
  resuelto_at   text,        -- fecha DD/MM/AAAA
  created_at    text,
  updated_at    text
);
```

Agregar en `supabase.js` el mapeo:
```js
// En el objeto de tablas:
tickets: 'tickets',

// En _toSnake():
sugerenciaId:  'sugerencia_id',
resueltoAt:    'resuelto_at',
respuestaDev:  'respuesta_dev',
createdAt:     'created_at',
updatedAt:     'updated_at',

// En _toCamel():
sugerencia_id: 'sugerenciaId',
resuelto_at:   'resueltoAt',
respuesta_dev: 'respuestaDev',
created_at:    'createdAt',
updated_at:    'updatedAt',
```

Agregar en DB (state.js):
```js
tickets: [],
```

Agregar en supaInit() la carga de tickets:
```js
DB.tickets = await supaFetch('tickets');
```

---

## PASO 4 — Las 4 pantallas

### Pantalla 1: dev_inicio

KPIs rápidos + estado del sistema + tickets recientes sin respuesta.

```js
function renderDevInicio() {
  const abiertos    = DB.tickets.filter(t => t.estado === 'abierto').length;
  const sinResp     = DB.tickets.filter(t => !t.respuestaDev && t.estado === 'abierto').length;
  const enProgreso  = DB.tickets.filter(t => t.estado === 'en_progreso').length;
  const resueltos   = DB.tickets.filter(t => t.estado === 'resuelto').length;

  // Cards KPI + lista de tickets urgentes sin respuesta
  // Diseño con los colores del ERP existente
}
```

HTML de la pantalla (inyectar en screen dev_inicio):
```
┌─────────────────────────────────────────────────────────┐
│  Bienvenido, Fede  ·  FMCODE                            │
├────────────┬────────────┬────────────┬──────────────────┤
│  Abiertos  │ Sin resp.  │ En progres │    Resueltos     │
│     8      │     3      │     2      │       15         │
├────────────┴────────────┴────────────┴──────────────────┤
│  Pendientes urgentes                                     │
│  🔴 El modal de legajos no abre   · Hace 2h · RRHH      │
│  🟡 Agregar filtro por sector     · Hace 5h · Operac.   │
│  🔵 Consulta sobre liquidaciones  · Hace 1d · Finanzas  │
└─────────────────────────────────────────────────────────┘
```

---

### Pantalla 2: dev_tickets

Lista completa de tickets con filtros y modal de detalle.

```js
function renderDevTickets() {
  // Tabla con todos los tickets
  // Filtros: estado, tipo, prioridad, módulo
  // Click en fila → abre modal detalle
}

function abrirTicket(idLocal) {
  // Modal con:
  // - título, descripción, tipo, módulo, autor, fecha
  // - selector de estado (abierto/en_progreso/resuelto/cerrado)
  // - selector de prioridad (alta/media/baja)
  // - textarea respuesta del desarrollador
  // - botón "Guardar" y botón "Marcar resuelto"
}

function guardarRespuestaTicket(idLocal) {
  const t = getTicketById(idLocal);
  t.respuestaDev = document.getElementById('dev-respuesta').value;
  t.estado       = document.getElementById('dev-estado').value;
  t.prioridad    = document.getElementById('dev-prioridad').value;
  t.updatedAt    = new Date().toLocaleDateString('es-AR');
  if (t.estado === 'resuelto') t.resueltoAt = t.updatedAt;
  supaSync('tickets', t);
  renderDevTickets();
  cerrarModal('modal-dev-ticket');
}
```

Columnas de la tabla:
```
# | Tipo | Título | Módulo | Autor | Fecha | Prioridad | Estado
```

Badges de estado con colores:
- abierto     → rojo
- en_progreso → amarillo
- resuelto    → verde
- cerrado     → gris

---

### Pantalla 3: dev_proyeccion

Roadmap del sistema con checkboxes editables.

```js
// Los items del roadmap se guardan en una constante local
// (no en Supabase — es info del desarrollador, no del ERP)
// Se puede persistir en localStorage para recordar el estado

const ROADMAP = [
  { fase: 'FASE 1', titulo: 'RRHH — Flujo de ingreso', items: [
    { id: 'f1_1', texto: 'Candidatos',    estado: 'completado' },
    { id: 'f1_2', texto: 'Psicotécnico',  estado: 'completado' },
    { id: 'f1_3', texto: 'Altas',         estado: 'completado' },
    { id: 'f1_4', texto: 'Legajos',       estado: 'completado' },
  ]},
  { fase: 'FASE 2', titulo: 'RRHH — Gestión continua', items: [
    { id: 'f2_1', texto: 'Sanciones',           estado: 'completado' },
    { id: 'f2_2', texto: 'Enfermos/ART',        estado: 'completado' },
    { id: 'f2_3', texto: 'Casos legales',        estado: 'completado' },
    { id: 'f2_4', texto: 'Reasignaciones',       estado: 'en_progreso' },
  ]},
  { fase: 'FASE 3', titulo: 'Operaciones', items: [
    { id: 'f3_1', texto: 'Clientes',         estado: 'en_progreso' },
    { id: 'f3_2', texto: 'Pedidos',          estado: 'pendiente' },
    { id: 'f3_3', texto: 'Supervisores',     estado: 'pendiente' },
  ]},
  { fase: 'FASE 4', titulo: 'Finanzas', items: [
    { id: 'f4_1', texto: 'Liquidaciones',    estado: 'en_progreso' },
    { id: 'f4_2', texto: 'Adelantos',        estado: 'completado' },
    { id: 'f4_3', texto: 'Monotributos',     estado: 'pendiente' },
  ]},
  { fase: 'FASE 5', titulo: 'Panel Desarrollador', items: [
    { id: 'f5_1', texto: 'Tickets',          estado: 'en_progreso' },
    { id: 'f5_2', texto: 'Proyección',       estado: 'en_progreso' },
    { id: 'f5_3', texto: 'Seguridad',        estado: 'pendiente' },
  ]},
];

function toggleRoadmapItem(id) {
  // Cicla entre: pendiente → en_progreso → completado → pendiente
  // Guarda en localStorage: 'ohlimpia_roadmap'
}

function renderDevProyeccion() {
  // Genera HTML con las fases y sus items
  // ✅ completado (verde)
  // 🔄 en_progreso (amarillo, click para cambiar)
  // ⬜ pendiente (gris, click para cambiar)
  // Barra de progreso por fase: X/Y completados
}
```

---

### Pantalla 4: dev_seguridad

Auditoría y métricas de seguridad del sistema.

```js
function renderDevSeguridad() {
  // Secciones:
  // 1. Alertas activas
  // 2. Checklist de seguridad
  // 3. Log de actividad reciente (desde sugerencias/tickets)
  // 4. Acciones recomendadas
}
```

#### Checklist de seguridad (estado hardcodeado, editable con click)

```
AUTENTICACIÓN
  ❌ Contraseñas en texto plano en DB.usuarios → CRÍTICO
     Acción: migrar a Supabase Auth con hash bcrypt

  ⚠️  Sin límite de intentos de login
     Acción: agregar contador de intentos + bloqueo temporal

  ✅ Login por perfil con control de acceso a módulos

DATOS
  ⚠️  Sin validación de unicidad de DNI en legajos
     Acción: agregar check antes de crear legajo

  ✅ Tabla sugerencias con RLS en Supabase
  
  ⚠️  IDs basados en timestamp (Date.now()) — predecibles
     Acción: migrar a UUID para datos sensibles

SUPABASE / RLS
  ⚠️  Verificar RLS activo en todas las tablas
     Tablas a verificar: legajos, candidatos, psicos, tickets

  ⚠️  Anon key expuesta en cliente (normal en Supabase)
     Acción: revisar que RLS bloquee acceso no autenticado

CÓDIGO
  ⚠️  prompt() nativo para inputs sensibles
     Afecta: rechazarCandidatoPorId, rechazarPsico, agendarTurno
     Acción: reemplazar con modales propios

  ⚠️  Passwords visibles en DB.usuarios (array en state.js)
     Acción: no loggear DB en consola en producción
```

Cada ítem del checklist tiene:
- Ícono de estado: ✅ resuelto / ⚠️ pendiente / ❌ crítico
- Título del problema
- Acción recomendada
- Botón "Marcar resuelto" (guarda en localStorage)

---

## PASO 5 — Integración con sugerencias existentes

La tabla `sugerencias` ya existe. Cuando el DEVELOPER entra,
importar automáticamente las sugerencias que no tengan ticket asociado:

```js
async function sincronizarSugerenciasComoTickets() {
  // Traer sugerencias de Supabase que no estén en DB.tickets
  const sugerencias = await supaFetch('sugerencias');
  
  for (const sug of sugerencias) {
    const yaExiste = DB.tickets.find(t => t.sugerenciaId === String(sug.id_local));
    if (!yaExiste) {
      const ticket = {
        id_local:      'tick_' + Date.now() + Math.random().toString(36).slice(2,6),
        sugerenciaId:  String(sug.id_local),
        titulo:        sug.titulo || sug.texto?.slice(0, 60) || 'Sin título',
        descripcion:   sug.texto || sug.descripcion || '',
        tipo:          sug.tipo || 'sugerencia',
        estado:        'abierto',
        prioridad:     'media',
        modulo:        sug.modulo || 'General',
        autor:         sug.autor || sug.nombre || 'Anónimo',
        createdAt:     sug.fecha || new Date().toLocaleDateString('es-AR'),
        updatedAt:     new Date().toLocaleDateString('es-AR'),
      };
      DB.tickets.push(ticket);
      await supaSync('tickets', ticket);
    }
  }
}
```

Llamar a `sincronizarSugerenciasComoTickets()` cada vez que
el DEVELOPER navega a dev_tickets o dev_inicio.

---

## PASO 6 — Registrar en main.js

```js
// Importar
import { developerScreenConfigs, initDeveloper } from '@modules/developer/index.js';

// En registerScreens():
registerScreens(developerScreenConfigs);

// En el callback de auth (después de login exitoso):
if (perfil === 'DEVELOPER') {
  await sincronizarSugerenciasComoTickets();
}
```

---

## Archivos a crear/modificar

```
NUEVOS:
src/modules/developer/developer.js   ← lógica de las 4 pantallas
src/modules/developer/index.js       ← re-exports + screenConfigs + window bindings

MODIFICAR:
src/shared/state.js    ← agregar DEVELOPER en PERFILES + usuario fede + DB.tickets
src/shared/supabase.js ← agregar mapeo tickets en _toSnake/_toCamel + supaInit
src/main.js            ← registrar módulo developer + sincronizarSugerencias
index.html             ← agregar 4 screens: dev_inicio, dev_tickets, dev_proyeccion, dev_seguridad
```

---

## Diseño visual

Seguir exactamente el mismo estilo visual del ERP existente:
- Mismos colores, misma tipografía, mismos badges
- Mismas clases CSS de main.css
- Mismo patrón de tablas y modales que los módulos migrados
- NO inventar estilos nuevos — reutilizar lo que ya existe

---

## Orden de implementación

1. Crear tabla `tickets` en Supabase
2. Agregar mapeo en supabase.js + DB.tickets en state.js
3. Agregar perfil DEVELOPER + usuario fede en state.js
4. Crear developer.js con las 4 funciones render
5. Crear index.js con screenConfigs y window bindings
6. Agregar 4 screens en index.html
7. Registrar en main.js
8. Implementar sincronizarSugerenciasComoTickets()
9. Testear login con usuario fede / fmcode2026
10. Verificar que las sugerencias existentes aparecen como tickets

---

## Reglas obligatorias

1. Seguir el patrón exacto de módulo migrado (igual que candidatos, legajos, etc.)
2. Window bindings para todas las funciones llamadas desde onclick en HTML
3. IDs con comillas en onclick: onclick="fn('${id}')" nunca onclick="fn(${id})"
4. El roadmap persiste en localStorage, no en Supabase
5. El checklist de seguridad persiste en localStorage
6. Los tickets sí van a Supabase con supaSync
7. Respetar el mapeo explícito camelCase ↔ snake_case en supabase.js
8. No romper nada de legacy.js ni de los módulos ya migrados

---

## PASO 7 — IA integrada en el panel de tickets

Cada ticket tiene un botón "Generar prompt con IA" que analiza
el título, descripción, tipo y módulo del ticket y devuelve:
1. Un prompt listo para pasarle a Claude Code
2. Las mejores recomendaciones para resolverlo

### Cómo funciona

```
Dev abre un ticket
        ↓
Hace click en "Generar prompt IA"
        ↓
Se llama a la Anthropic API con el contexto del ticket
        ↓
Claude analiza y devuelve:
  - Prompt listo para Claude Code
  - 3 recomendaciones ordenadas por prioridad
        ↓
Se muestra en un panel dentro del modal del ticket
Con botón "Copiar prompt"
```

### Función principal

```js
async function generarPromptIA(idLocal) {
  const ticket = getTicketById(idLocal);
  
  // Mostrar spinner mientras carga
  document.getElementById('ia-resultado').innerHTML = `
    <div style="text-align:center; padding:20px; color:#6B7280">
      Analizando con IA...
    </div>
  `;

  const contextoERP = `
Estás trabajando en Ohlimpia ERP, un sistema de gestión para 
una cooperativa de limpieza. Stack: Vanilla JS + Vite + Supabase.
Sin frameworks — navegación con navTo(), estado global en DB (state.js),
persistencia con supaSync(), HTML generado como strings en renderX().
Los módulos migrados están en src/modules/. El código legacy está 
en legacy.js (~13.400 líneas). Patrón de módulo: index.js + modulo.js.
  `.trim();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `Sos un experto en el stack de Ohlimpia ERP.
Cuando recibas un ticket, respondé SOLO con JSON válido en este formato exacto:
{
  "prompt": "el prompt completo listo para Claude Code",
  "recomendaciones": [
    { "prioridad": "Alta", "titulo": "...", "detalle": "..." },
    { "prioridad": "Media", "titulo": "...", "detalle": "..." },
    { "prioridad": "Baja", "titulo": "...", "detalle": "..." }
  ]
}
El prompt debe incluir el contexto del ERP, el problema específico 
y los pasos concretos para resolverlo.
No incluyas explicaciones fuera del JSON.`,
        messages: [{
          role: 'user',
          content: `Ticket #${ticket.idLocal}
Tipo: ${ticket.tipo}
Módulo: ${ticket.modulo || 'General'}
Título: ${ticket.titulo}
Descripción: ${ticket.descripcion || 'Sin descripción'}

Contexto del sistema:
${contextoERP}

Generá el prompt para Claude Code y las recomendaciones.`
        }]
      })
    });

    const data = await response.json();
    const texto = data.content?.[0]?.text || '';
    
    // Limpiar posibles backticks de markdown
    const jsonLimpio = texto.replace(/```json|```/g, '').trim();
    const resultado  = JSON.parse(jsonLimpio);

    mostrarResultadoIA(resultado, ticket);

  } catch (err) {
    document.getElementById('ia-resultado').innerHTML = `
      <div style="color:#EF4444; padding:12px">
        Error al generar el prompt. Intentá de nuevo.
      </div>
    `;
  }
}

function mostrarResultadoIA(resultado, ticket) {
  const colores = { Alta: '#EF4444', Media: '#F59E0B', Baja: '#10B981' };
  
  const recsHtml = resultado.recomendaciones.map(r => `
    <div style="border-left: 3px solid ${colores[r.prioridad] || '#6B7280'};
                padding: 8px 12px; margin-bottom: 8px; background: #F8FAFC; border-radius: 4px">
      <div style="font-weight:600; color: ${colores[r.prioridad]}; font-size:12px">
        ${r.prioridad.toUpperCase()}
      </div>
      <div style="font-weight:600; color:#0F172A; margin:2px 0">${r.titulo}</div>
      <div style="color:#475569; font-size:13px">${r.detalle}</div>
    </div>
  `).join('');

  document.getElementById('ia-resultado').innerHTML = `
    <div style="margin-top: 16px">

      <div style="font-weight:700; color:#0F172A; margin-bottom:8px">
        📋 Prompt para Claude Code
      </div>
      <div style="background:#0F172A; color:#E2E8F0; padding:12px; border-radius:8px;
                  font-family:monospace; font-size:12px; white-space:pre-wrap;
                  max-height:200px; overflow-y:auto; line-height:1.5"
           id="prompt-generado">${resultado.prompt}</div>
      <button onclick="copiarPrompt()" 
              style="margin-top:8px; padding:6px 14px; background:#2563EB; color:white;
                     border:none; border-radius:6px; cursor:pointer; font-size:13px">
        Copiar prompt
      </button>

      <div style="font-weight:700; color:#0F172A; margin: 16px 0 8px">
        💡 Recomendaciones
      </div>
      ${recsHtml}
    </div>
  `;
}

function copiarPrompt() {
  const texto = document.getElementById('prompt-generado')?.innerText;
  if (!texto) return;
  navigator.clipboard.writeText(texto)
    .then(() => showToast('Prompt copiado al portapapeles ✓', 'success'))
    .catch(() => showToast('No se pudo copiar', 'error'));
}
```

### Dónde aparece en el modal del ticket

Dentro del modal `modal-dev-ticket`, agregar después del textarea de respuesta:

```html
<div style="margin-top: 16px; border-top: 1px solid #E2E8F0; padding-top: 16px">
  <button onclick="generarPromptIA('${ticket.idLocal}')"
          style="padding:8px 16px; background:#7C3AED; color:white;
                 border:none; border-radius:8px; cursor:pointer; font-size:13px;
                 display:flex; align-items:center; gap:6px">
    🤖  Generar prompt con IA
  </button>
  <div id="ia-resultado"></div>
</div>
```

### La API key

La Anthropic API key se guarda como variable de entorno en Vite:

```
# .env.local
VITE_ANTHROPIC_KEY=sk-ant-...
```

Y se usa en el código así:
```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': import.meta.env.VITE_ANTHROPIC_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
}
```

El header `anthropic-dangerous-direct-browser-access` es necesario
porque la llamada viene del browser directamente (sin backend propio).
Solo usarlo en desarrollo/interno — no exponer la key en producción pública.

---

## Archivos adicionales a modificar

```
MODIFICAR:
.env.local   ← agregar VITE_ANTHROPIC_KEY
src/modules/developer/developer.js  ← agregar generarPromptIA, mostrarResultadoIA, copiarPrompt
src/modules/developer/index.js      ← agregar window.generarPromptIA, window.copiarPrompt
index.html   ← el modal del ticket ya incluye el botón de IA
```

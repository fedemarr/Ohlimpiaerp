# MÓDULO PRE-CANDIDATOS / CANDIDATOS — Especificación Completa

---

## 1. FLUJO DE ESTADOS

Máquina de estados que define el ciclo de vida de un candidato desde su postulación hasta su incorporación o rechazo.

### Diagrama de Transiciones

```
POSTULARME (/postularme?empresa={empresaId})
       |
       v
+-----------------+
|  PRECANDIDATO    | <-- Estado inicial al crear desde formulario público
+--------+--------+
         |
   APROBAR / RECHAZAR
   +------+------+------+
   |                    |
   v                    v
+-----------+    +------------+
| SIN CITAR |    | RECHAZADO  | --> Estado final (histórico)
+-----+-----+    +------------+
      |
  CITAR (+ fecha/hora)
      v
+-----------+
|  CITADO   | --> Se guarda fechaCita y horaCita
+-----+-----+
      |
  ASISTIO = true / false
  +----+----+
  v          v
+----------+  +------------+
|ENTREVISTA|  | RECHAZADO  | --> motivoRechazo = 'No asistio'
+-----+----+  +------------+
      |
  APROBAR / RECHAZAR
  +----+----+
  v          v
+----------+  +------------+
| APROBADO |  | RECHAZADO  |
+-----+----+  +------------+
      |
      v
  Pasar a Psicotecnico (modulo externo)

  CUALQUIER ESTADO ACTIVO --> BAJA --> [BAJA]
```

### Estados Activos (visibles en vista principal)

| Estado | Descripcion |
|--------|-------------|
| `Precandidato` | Recien llegado del formulario publico, pendiente de revision RRHH |
| `Sin citar` | Aprobado por RRHH, pendiente de agendar entrevista |
| `Citado` | Tiene entrevista programada (fecha/hora definidos) |
| `Entrevistado` | Asistio a la entrevista, pendiente de evaluacion final |
| `Aprobado` | Aprobado en entrevista, pendiente de psicotecnico |

### Estados Historicos (archivados)

| Estado | Descripcion |
|--------|-------------|
| `Rechazado` | Rechazado en cualquier etapa |
| `Baja` | Dado de baja voluntariamente |
| `Caducado` | Expiro por falta de accion |
| `MT Social` | Mixta de Trabajo -- modalidad Social |
| `MT con deuda` | Mixta de Trabajo -- tiene deuda pendiente |
| `En Psicotecnico` | Derivado al modulo de psicotecnico |

---

## 2. MODELO DE DATOS

### 2.1 Esquema del Candidato (JSON)

```json
{
  "id": "string (PK, generado con Date.now() o crypto.randomUUID())",
  "apellido": "string",
  "nombre": "string",
  "dni": "string (6-8 digitos, UNIQUE por empresa)",
  "cuit": "string (opcional, 11 digitos)",
  "fecNac": "string (YYYY-MM-DD, opcional)",
  "estadoCivil": "string (Soltero/a|Casado/a|Divorciado/a|Viudo/a, opcional)",
  "genero": "string (Femenino|Masculino|Otro, opcional)",
  "nacionalidad": "string (opcional)",
  "telefono": "string (obligatorio, formato libre)",
  "email": "string (opcional, formato valido)",
  "calle": "string (opcional)",
  "piso": "string (opcional)",
  "zona": "string (opcional, selects dinamicos)",
  "partido": "string (opcional)",
  "localidad": "string (opcional)",
  "disponibilidadHoraria": "string (ej: 'full time', opcional)",
  "medio": "string (Redes|Referido|Web|Volante|Otro, opcional)",
  "nombreReferido": "string (opcional, si medio = 'Referido')",
  "obs": "string (textarea libre, opcional)",
  "estado": "string (default: 'Precandidato')",
  "creadoPor": "string (user ID o 'anonimo' para form publico)",
  "fechaCita": "string (YYYY-MM-DD, solo si estado = Citado)",
  "horaCita": "string (HH:MM, solo si estado = Citado)",
  "asistio": "boolean | null",
  "motivoRechazo": "string (opcional)",
  "motivoBaja": "string (opcional)",
  "empresaId": "string (FK -> empresas.id)",
  "fecha": "string (ISO timestamp de creacion)",
  "origen": "string ('postulacion' | 'importacion' | 'agendar-entrevista')",
  "servicioDeseado": "string (opcional, selects dinamicos)",
  "disponibilidad": "string (opcional, selects dinamicos)",
  "experiencia": "string (opcional, selects dinamicos)"
}
```

### 2.2 Esquema del Turno (Calendario de Entrevistas)

```json
{
  "id": "string (PK)",
  "fecha": "string (YYYY-MM-DD)",
  "hora": "string (HH:MM)",
  "estado": "string ('Pendiente' | 'Confirmado' | 'Cancelado')",
  "candidatoId": "string (FK -> candidatos.id, nullable)",
  "nombre": "string (apellido, nombre del candidato)",
  "responsable": "string (nombre del responsable)",
  "observacion": "string (opcional)",
  "empresaId": "string (FK -> empresas.id)"
}
```

### 2.3 Esquema de Configuracion del Calendario

```json
{
  "id": "string (PK)",
  "empresaId": "string (FK -> empresas.id, UNIQUE)",
  "diasHabilitados": "[1, 2, 3, 4, 5]",
  "horaDesde": "09:00",
  "horaHasta": "17:00",
  "duracionMin": 20,
  "maxPorFranja": 2,
  "responsable": ""
}
```

**Notas sobre `diasHabilitados`:**
- 0 = Domingo
- 1 = Lunes
- 2 = Martes
- 3 = Miercoles
- 4 = Jueves
- 5 = Viernes
- 6 = Sabado

---

## 3. BOTONES POR ESTADO

Solo visibles para perfiles: **RRHH** o **Administrador total**.

| Estado | Botones Disponibles | Accion |
|--------|-------------------|--------|
| **Precandidato** | `Aprobar` | -> Sin citar |
| | `Enviar link entrevista` | -> Abre modal de mensaje WhatsApp |
| | `Rechazar` | -> Rechazado (pide motivo) |
| | `Ver` | -> Detalle completo |
| **Sin citar** | `Citar` | -> Citado (abre modal para fecha/hora) |
| | `Enviar mensaje` | -> Abre modal de mensaje WhatsApp |
| | `Rechazar` | -> Rechazado (pide motivo) |
| | `Ver` | -> Detalle completo |
| | `Editar` | -> Formulario de edicion |
| | `Baja` | -> Baja (pide motivo) |
| **Citado** | `?Asistio?` | -> Abre modal de tracking de asistencia |
| | `Enviar mensaje` | -> Abre modal de mensaje WhatsApp |
| | `Rechazar` | -> Rechazado (pide motivo) |
| | `Ver` | -> Detalle completo |
| | `Editar` | -> Formulario de edicion |
| | `Baja` | -> Baja (pide motivo) |
| **Entrevistado** | `Resultado` | -> Modal Aprobar/Rechazar |
| | `Ver` | -> Detalle completo |
| | `Editar` | -> Formulario de edicion |
| | `Baja` | -> Baja (pide motivo) |
| **Aprobado** | `Pasar a Psicotecnico` | -> En Psicotecnico |
| | `Ver` | -> Detalle completo |
| | `Editar` | -> Formulario de edicion |
| | `Baja` | -> Baja (pide motivo) |
| **Histórico (cualquier estado)** | `Ver` | -> Detalle completo |

---

## 4. MENSAJES WHATSAPP

### Template 1 -- Disponibilidad

```
Hola {nombre}, te contactamos de [empresa]. ¿Podrias confirmarnos tu disponibilidad para una entrevista presencial? ¿Que dia y horario te viene mejor?
```

**Uso:** Se envia cuando el candidato esta en estado Precandidato o Sin citar.

### Template 2 -- Link de Agendado

```
Hola {nombre}, quedamos en coordinar una entrevista. Te paso el link para que elijas el dia y horario que te quede mejor: {link}
```

**Donde `link` se construye asi:**
```
{origin}/agendar-entrevista?dni={dni}&nombre={nombre}&empresa={empresaId}
```

- `origin` = `window.location.origin`
- `nombre` = nombre del candidato (URL-encoded)
- `empresa` = empresaId

**Uso:** Se envia cuando el candidato pasa a estado Sin citar.

### Template 3 -- Confirmacion de Cita

```
Hola {nombre}, pasaste a la etapa de pre-seleccion. Te citamos el {fecha} a las {hora}. ¿Confirmas asistencia?
```

- `fecha` = fechaCita en formato DD/MM/YYYY
- `hora` = horaCita

**Uso:** Se envia despues de crear la cita (estado Citado).

### Funcion de Envio

```javascript
function enviarWhatsApp(telefono, texto) {
  const telLimpio = telefono.replace(/\D/g, '');
  if (!telLimpio) {
    alert('El candidato no tiene telefono valido');
    return;
  }
  window.open(`https://wa.me/${telLimpio}?text=${encodeURIComponent(texto)}`, '_blank');
}
```

### Seleccion de Plantilla (UI)

El modal muestra:
- Campo de telefono (editable)
- Select con 3 opciones:
  - "Confirmacion de disponibilidad" (template 1)
  - "Link para elegir turno" (template 2)
  - "Confirmacion de cita" (template 3)
- Textarea editable con el texto del template seleccionado
- Botones: "Copiar mensaje" y "WhatsApp"

---

## 5. TRACKING DE ASISTENCIA

Proceso cuando el candidato tiene estado **Citado** y se hace clic en **?Asistio?**:

### Paso 1 -- Abrir Modal
El modal muestra:
- **Nombre completo** del candidato (apellido, nombre)
- **Fecha de la cita:** {fechaCita} formateada DD/MM/YYYY
- **Hora de la cita:** {horaCita}

### Paso 2 -- Dos Botones
- **No asistio** (rojo, btn-danger)
- **Si, asistio** (verde, btn-success)

### Paso 3 -- Acciones segun respuesta

| Boton | Accion | Estado resultante |
|-------|--------|------------------|
| **Si, asistio** | `asistio = true` | -> **Entrevistado** |
| **No asistio** | `asistio = false` | -> **Rechazado** |
| | `motivoRechazo = 'No asistio'` | |

### Logica en codigo:

```javascript
async function registrarAsistencia(candidatoId, asistio) {
  const c = getCandById(candidatoId);
  if (!c) return;
  c.asistio = asistio;
  if (asistio) {
    c.estado = 'Entrevistado';
  } else {
    c.estado = 'Rechazado';
    c.motivoRechazo = 'No asistio';
  }
  await supaSync('candidatos', c);
}
```

---

## 6. LINKS PUBLICOS

### 6.1 Formulario de Postulacion

**URL:**
```
/postularme?empresa={empresaId}
```

**Comportamiento:**
- Formulario publico, no requiere autenticacion
- Crea candidato con estado = `Precandidato`
- `creadoPor = 'anonimo'`
- `origen = 'postularme'`
- Los campos del form se cargan desde `config_form_postulacion` (tabla Supabase)
- Al enviar: INSERT en tabla `candidatos` via `getPublicClient()` (sin persistSession)
- Redirige a pagina de agradecimiento

**Validacion de parametros:**
```javascript
const empresaId = new URLSearchParams(window.location.search).get('empresa');
if (!empresaId) {
  // Mostrar: "Este link no es valido: falta identificar la empresa"
}
```

### 6.2 Agendamiento de Entrevista

**URL:**
```
/agendar-entrevista?dni={dni}&nombre={nombre}&empresa={empresaId}
```

**Parametros query:**
| Parametro | Tipo | Requerido | Descripcion |
|-----------|------|-----------|-------------|
| `dni` | string | No (pre-rellenado) | DNI del candidato |
| `nombre` | string | No (pre-rellenado) | Nombre del candidato |
| `empresa` | string | Si | empresaId (para filtrar turnos disponibles) |

**Comportamiento:**
- No requiere autenticacion
- Usa `getPublicClient()` (sin persistSession)
- Muestra grilla semanal con slots disponibles (via Edge Function `agendar-turno`)
- Candidato selecciona fecha y hora
- Confirma datos personales (nombre, apellido, dni, telefono, email, observaciones)
- Se invoca Edge Function `agendar-turno` con `action: 'reservar'`
- La Edge Function:
  - Valida cupo server-side
  - Busca candidato existente por DNI+empresa (actualiza si existe, crea si no)
  - Crea registro en tabla `turnos` con estado `Pendiente`
- Muestra confirmacion

---

## 7. CALENDARIO DE ENTREVISTAS

### 7.1 Configuracion

Valores por defecto (CONFIG_DEFAULT):

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `diasHabilitados` | array de integers | `[1, 2, 3, 4, 5]` | Dias de la semana (0=Dom, 6=Sab) |
| `horaDesde` | string | `"09:00"` | Hora de inicio |
| `horaHasta` | string | `"17:00"` | Hora de fin |
| `duracionMin` | integer | `20` | Duracion de cada slot en minutos |
| `maxPorFranja` | integer | `2` | Maximo de candidatos por slot |
| `responsable` | string | `""` | Nombre del responsable (info) |

### 7.2 Generacion de Slots (getFranjas)

```
Para cada intervalo de [horaDesde, horaHasta) con paso = duracionMin:
  Crear slot = { hora: HH:MM }
```

**Ejemplo con config default:**
```
09:00, 09:20, 09:40, 10:00, 10:20, 10:40, 11:00, 11:20, 11:40,
12:00, 12:20, 12:40, 13:00, 13:20, 13:40, 14:00, 14:20, 14:40,
15:00, 15:20, 15:40, 16:00, 16:20, 16:40
```

### 7.3 Capacidad por Slot

Para cada slot, contar turnos con estado `Pendiente` o `Confirmado`:
```
disponibles = maxPorFranja - count(turnos WHERE fecha=slot.fecha AND hora=slot.hora AND estado IN ('Pendiente','Confirmado'))
```

Si `disponibles > 0`, el slot esta disponible.

### 7.4 Vista de Grid (Admin)

- **Filas:** Franjas horarias (de horaDesde a horaHasta)
- **Columnas:** Dias de la semana (Lun a Dom)
- **Celdas:** Muestran turnos existentes o estan vacias
- **Colores:**
  - `chip-verde` (libre) = slot sin turnos
  - `chip-azul` (pendiente) = tiene turnos pendientes
  - `chip-rojo` (ocupado) = tiene turnos confirmados o lleno
- **Toolbar:** Botones para cambiar semana, ir a Hoy, y "+ Agendar turno"
- **Panel lateral:** Configuracion del agente + Resumen semanal (turnos, confirmados, pendientes, slots libres)

### 7.5 Vista de Grid (Publico - /agendar-entrevista)

- Muestra proximos 10 dias habilitados
- Colores: verde = libre, rojo = completo
- Click en slot libre -> selecciona (cambia a azul con "Elegido")
- Click en slot completo -> no hace nada

### 7.6 Estados del Turno

| Estado | Descripcion |
|--------|-------------|
| `Pendiente` | Candidato agendo, espera confirmacion de RRHH |
| `Confirmado` | RRHH confirmo la cita |
| `Cancelado` | Cita cancelada (soft delete) |

### 7.7 Acciones del Calendario Admin

- **Agendar turno libre:** Abre modal con campos: candidatoId, nombre, responsable, observacion
- **Ver turno:** Muestra detalle del turno
- **Confirmar turno:** Cambia estado a 'Confirmado'
- **Cancelar turno:** Cambia estado a 'Cancelado' (soft)
- **Configuracion:** Dias habilitados (checkboxes), hora desde/hasta, duracion (15/20/30/45/60 min), max por franja (1-5), responsable

---

## 8. FILTROS

### 8.1 Pre-Candidatos (Vista de Precandidatos)

| Filtro | Tipo | Descripcion |
|--------|------|-------------|
| `search` | text input | Busca por apellido, nombre, DNI o telefono (case-insensitive, match parcial) |
| `zona` | select | Filtra por zona exacta |

**Pipeline:**
```
1. DB.candidatos.filter(estado === 'Precandidato')
2. Filtrar por search (apellido || nombre || dni || telefono)
3. Filtrar por zona
4. Ordenar: sort por id DESC (mas recientes primero)
```

### 8.2 Candidatos (Vista Principal)

| Filtro | Tipo | Descripcion |
|--------|------|-------------|
| `activos/historico` | toggle button | Alterna entre ver activos o historicos |
| `search` | text input | Busca por apellido, nombre, DNI o telefono |
| `zona` | select | Filtra por zona exacta |
| `estado` | select | Filtra por estado exacto (solo en modo activos) |

### 8.3 Cadena de Filtros (Pipeline)

```
1. Datos crudos de Supabase (DB.candidatos)
       |
2. EXCLUIR estado = 'Precandidato' (se ven en vista separada)
       |
3. Filtrar por modo: activos/historico
   - Activos: ESTADOS_ACTIVOS_CAND sin Precandidato
     = ['Sin citar', 'Citado', 'Entrevistado', 'Aprobado']
   - Historico: ESTADOS_HISTORICO_CAND
     = ['En Psicotecnico', 'Rechazado', 'Baja', 'Caducado', 'MT Social', 'MT con deuda']
       |
4. Filtrar por search (apellido || nombre || dni || telefono)
   match: toLowerCase().includes(searchTerm.toLowerCase())
       |
5. Filtrar por zona (si seleccionada)
   match: candidato.zona === zonaSeleccionada
       |
6. Filtrar por estado (si seleccionado, solo en modo activos)
   match: candidato.estado === estadoSeleccionado
       |
7. Ordenar: sort por id DESC (mas recientes primero)
   sort((a, b) => String(b.id).localeCompare(String(a.id)))
       |
8. Resultado final renderizado
```

### 8.4 Codigo del Pipeline

```javascript
function filtrarCandidatos(candidatos, { search, zona, estado, modo }) {
  return candidatos
    .filter(c => c.estado !== 'Precandidato')
    .filter(c => {
      if (modo === 'activos') {
        return !esHistoricoCand(c);
      }
      return esHistoricoCand(c);
    })
    .filter(c => {
      if (!search) return true;
      const term = search.toLowerCase();
      return [c.apellido, c.nombre, c.dni, c.telefono]
        .some(v => String(v || '').toLowerCase().includes(term));
    })
    .filter(c => !zona || c.zona === zona)
    .filter(c => !estado || c.estado === estado)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)));
}
```

---

## 9. AUTOSAVE

El formulario de carga/edicion de candidatos guarda automaticamente en `localStorage` para evitar perdida de datos.

### Keys

| Key | Formato | Contenido |
|-----|---------|-----------|
| `candidatos:nuevo` | localStorage key | JSON con datos del formulario de NUEVO candidato (cuando no tiene ID aun) |
| `candidatos:edit:{id}` | localStorage key | JSON con datos del formulario de EDICION (cuando edita un candidato existente) |

### Estructura del valor

```json
{
  "apellido": "...",
  "nombre": "...",
  "dni": "...",
  "_savedAt": "2026-08-18T14:30:00.000Z"
}
```

### Logica

```javascript
// Guardar (se llama en cada change del form)
form.addEventListener('input', () => {
  localStorage.setItem('candidatos:nuevo', JSON.stringify(capturar(form)));
  // o para edicion:
  localStorage.setItem(`candidatos:edit:${id}`, JSON.stringify(capturar(form)));
});

// Cargar (al abrir el formulario)
const autosave = localStorage.getItem('candidatos:nuevo');
if (autosave) {
  const datos = JSON.parse(autosave);
  for (const [k, v] of Object.entries(datos)) {
    const el = form.elements[k];
    if (el) el.value = v;
  }
}

// Limpiar (al enviar exitosamente)
localStorage.removeItem('candidatos:nuevo');
// o para edicion:
localStorage.removeItem(`candidatos:edit:${id}`);
```

---

## 10. IMPORTACION CSV

### 10.1 Columnas Esperadas (28 columnas, orden exacto)

```javascript
const COLUMNAS_HISTORICO = [
  'fecha', 'entrevistadora', 'modalidad', 'apellidos', 'nombres', 'dni',
  'genero', 'telefono', 'edad', 'localidad', 'zona', 'disponibilidad',
  'experiencia', 'presencia', 'exp_verbal', 'compr_consignas',
  'predisposicion', 'rel_interpersonal', 'evaluacion_final', 'observaciones',
  'medio', 'detalle_convocatoria', 'correo_electronico', 'posible_servicio',
  'fecha_psico', 'psicotecnico', 'fecha_ingreso', 'obs_psicotecnico',
];
```

| # | Columna | Mapeo a campo candidato |
|---|---------|------------------------|
| 1 | `fecha` | `obs` (concatenado) |
| 2 | `entrevistadora` | `obs` (concatenado) |
| 3 | `modalidad` | -- |
| 4 | `apellidos` | `apellido` |
| 5 | `nombres` | `nombre` |
| 6 | `dni` | `dni` (validado, 6-8 digitos) |
| 7 | `genero` | `genero` |
| 8 | `telefono` | `telefono` |
| 9 | `edad` | -- |
| 10 | `localidad` | `localidad` |
| 11 | `zona` | `zona` |
| 12 | `disponibilidad` | `disponibilidadHoraria` |
| 13 | `experiencia` | -- |
| 14 | `presencia` | -- |
| 15 | `exp_verbal` | -- |
| 16 | `compr_consignas` | -- |
| 17 | `predisposicion` | -- |
| 18 | `rel_interpersonal` | -- |
| 19 | `evaluacion_final` | `estado` (via `mapearEstadoDesdeResultado`) |
| 20 | `observaciones` | `obs` (concatenado) |
| 21 | `medio` | `medio` |
| 22 | `detalle_convocatoria` | -- |
| 23 | `correo_electronico` | `email` |
| 24 | `posible_servicio` | -- |
| 25 | `fecha_psico` | -- |
| 26 | `psicotecnico` | -- |
| 27 | `fecha_ingreso` | -- |
| 28 | `obs_psicotecnico` | -- |

### 10.2 Mapeo de Estado desde Evaluacion

```javascript
function mapearEstadoDesdeResultado(evaluacionFinal) {
  const e = String(evaluacionFinal || '').toLowerCase().trim();
  if (!e) return 'Entrevistado';
  if (e.includes('aprob')) return 'Aprobado';
  if (e.includes('desaprob')) return 'Rechazado';
  return 'Entrevistado';
}
```

### 10.3 Proceso de Importacion

**Paso 1 -- Subir archivo**
- Input tipo `file` acepta `.csv`
- Se lee con `FileReader.readAsText()`

**Paso 2 -- Parsear CSV**
```javascript
function parsearCsv(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lineas.length) return [];
  const delim = lineas[0].includes(';') ? ';' : ',';
  const filas = [];
  for (const linea of lineas) {
    const campos = [];
    let cur = '';
    let entreComillas = false;
    for (const ch of linea) {
      if (ch === '"') entreComillas = !entreComillas;
      else if (ch === delim && !entreComillas) { campos.push(cur); cur = ''; }
      else cur += ch;
    }
    campos.push(cur);
    filas.push(campos.map(c => c.trim()));
  }
  return filas;
}
```

**Paso 3 -- Validar**
- DNI: debe ser 6-8 digitos (`/^\d{6,8}$/`)
- Duplicados: verificar si el DNI ya existe en la DB
- Fila invalida si: DNI invalido o apellidos+nombres vacios

**Paso 4 -- Preview**
- Muestra tabla con: Fecha, Apellidos, Nombres, DNI, Zona, Evaluacion, Estado destino, Estado
- Chips: verde = OK, naranja = Ya importado, rojo = Invalido
- Conteo: "X filas validas de Y totales (Z invalidas/duplicadas)"

**Paso 5 -- Confirmar Importacion**
- Boton: "Importar X candidatos"
- Cada registro se crea con:
  - `estado`: via `mapearEstadoDesdeResultado(evaluacion_final)`
  - `creadoPor`: `'Importacion historica'`
  - `medio`: `'Importacion historica'`
  - `obs`: concatenacion de entrevistadora, fecha, observaciones

**Paso 6 -- Resultado**
- Toast: "X candidatos importados"
- Se refresca la vista

---

## 11. VALIDACIONES

### 11.1 DNI
- **Longitud:** 6 a 8 digitos numericos
- **Regex:** `/^\d{6,8}$/`
- **Unicidad:** UNIQUE constraint por `empresa_id` + `dni` (en codigo: duplicado check)
- **Mensaje de error:** "El DNI debe tener entre 6 y 8 digitos."

### 11.2 Email
- **Formato valido:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Opcional:** No es obligatorio

### 11.3 Password (para login de usuarios)
- **Minimo:** 6 caracteres
- **Mensaje de error:** "La contrasena debe tener al menos 6 caracteres"

### 11.4 Campos Obligatorios

| Campo | Validacion |
|-------|-----------|
| `nombre` | No vacio, minimo 2 caracteres |
| `apellido` | No vacio, minimo 2 caracteres |
| `dni` | No vacio, formato `/^\d{6,8}$/` |

### 11.5 Funcion de Validacion

```javascript
function validarCandidato(datos, idEditar) {
  if (!esDniValido(datos.dni)) return 'El DNI debe tener entre 6 y 8 digitos.';
  const duplicado = (DB.candidatos || []).some(
    c => c.dni === datos.dni && String(c.id) !== String(idEditar)
  );
  if (duplicado) return `Ya existe un candidato con DNI ${datos.dni}.`;
  return null;
}
```

---

## 12. COLORES CSS

| Clase | Background | Texto | Uso |
|-------|-----------|-------|-----|
| `chip-verde` | `#d4edda` | `#155724` | Aprobado, slot libre |
| `chip-rojo` | `#f8d7da` | `#721c24` | Rechazado, Baja, slot ocupado/lleno |
| `chip-naranja` | `#fff3cd` | `#856404` | Entrevistado |
| `chip-azul` | `#d1ecf1` | `#0c5460` | Citado, En Psicotecnico, turno pendiente |
| `chip-gris` | `#e2e3e5` | `#383d41` | Precandidato |

---

## 13. TABLAS SUPABASE

### candidatos

```sql
create table if not exists public.candidatos (
  id_local text primary key,
  apellido text, nombre text, dni text, cuit text,
  fec_nac text, fecha_nacimiento text,
  estado_civil text, genero text, nacionalidad text,
  telefono text, email text,
  calle text, piso text, zona text, partido text, localidad text,
  disponibilidad_horaria text, disponibilidad text,
  medio text, nombre_referido text, obs text,
  estado text, creado_por text,
  fecha_cita text, hora_cita text,
  motivo_baja text, motivo_rechazo text,
  asistio boolean default false,
  servicio_deseado text, experiencia text,
  fecha text, origen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### turnos

```sql
create table if not exists public.turnos (
  id_local text primary key,
  fecha text, hora text, estado text,
  candidato_id text, nombre text,
  responsable text, observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### calendario_config

```sql
create table if not exists public.calendario_config (
  id_local text primary key,
  empresa_id text not null,
  dias_habilitados jsonb not null default '[1,2,3,4,5]'::jsonb,
  hora_desde text not null default '09:00',
  hora_hasta text not null default '17:00',
  duracion_min integer not null default 20,
  max_por_franja integer not null default 2,
  responsable text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists calendario_config_empresa_uidx
  on public.calendario_config (empresa_id);
```

### config_form_postulacion

```sql
create table if not exists public.config_form_postulacion (
  id_local text primary key,
  campos jsonb not null default '[]'::jsonb,
  speech text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### config_form_entrevista

```sql
create table if not exists public.config_form_entrevista (
  id_local text primary key,
  campos jsonb not null default '[]'::jsonb,
  instrucciones text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### empresas

```sql
create table if not exists public.empresas (
  id text primary key,
  nombre text not null,
  fecha_alta text,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### usuarios

```sql
create table if not exists public.usuarios (
  id uuid primary key,
  email text unique,
  nombre text,
  perfil text,
  nro_socio text,
  empresa_id text references public.empresas(id),
  es_superadmin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### notificaciones

```sql
create table if not exists public.notificaciones (
  id_local text primary key,
  tipo text,
  mensaje text,
  destinatarios jsonb,
  ref_id text,
  leida boolean default false,
  fecha text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### comunicaciones

```sql
create table if not exists public.comunicaciones (
  id_local text primary key,
  tipo text,
  de_text text,
  para_text text,
  mensaje text,
  leido boolean default false,
  fecha text,
  ref_tipo text,
  ref_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### logs

```sql
create table if not exists public.logs (
  id_local text primary key,
  fecha text,
  accion text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### empresa_id en todas las tablas de tenant

```sql
-- Se agrega empresa_id a todas las tablas excepto empresas y perfiles
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
    and tablename not in ('empresas', 'perfiles')
  loop
    execute format('alter table public.%I add column if not exists empresa_id text', t);
    execute format('create index if not exists %I on public.%I (empresa_id)',
      'idx_' || t || '_empresa', t);
  end loop;
end $$;
```

---

## 14. ROW LEVEL SECURITY

### Funciones Helper

```sql
-- Retorna la empresa del usuario logueado
create or replace function public.auth_empresa_id() returns text
language sql stable security definer set search_path = public as $$
  select u.empresa_id from public.usuarios u where u.id = auth.uid();
$$;

-- Retorna true si el usuario es superadmin
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.es_superadmin
  );
$$;
```

### Politicas de Tenant (aplican a todas las tablas de tenant)

```sql
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
    and tablename not in ('empresas', 'perfiles', 'usuarios')
  loop
    -- Habilitar RLS
    execute format('alter table public.%I enable row level security', t);

    -- SELECT: solo ver tu empresa o ser superadmin
    execute format('create policy tenant_select_%I on public.%I
      for select to authenticated
      using (empresa_id = public.auth_empresa_id() or public.is_superadmin())', t, t);

    -- INSERT: solo insertar en tu empresa o ser superadmin
    execute format('create policy tenant_insert_%I on public.%I
      for insert to authenticated
      with check (empresa_id = public.auth_empresa_id() or public.is_superadmin())', t, t);

    -- UPDATE: solo actualizar en tu empresa o ser superadmin
    execute format('create policy tenant_update_%I on public.%I
      for update to authenticated
      using (empresa_id = public.auth_empresa_id() or public.is_superadmin())
      with check (empresa_id = public.auth_empresa_id() or public.is_superadmin())', t, t);

    -- DELETE: solo borrar en tu empresa o ser superadmin
    execute format('create policy tenant_delete_%I on public.%I
      for delete to authenticated
      using (empresa_id = public.auth_empresa_id() or public.is_superadmin())', t, t);
  end loop;
end $$;
```

### Politicas para Candidatos (anonimo)

```sql
-- Insercion anonima para formulario publico /postularme
create policy "anon_insert_candidatos" on public.candidatos
  for insert to anon with check (true);

-- No permite SELECT anonimo (no filtrar datos de otros candidatos)
create policy "anon_select_candidatos" on public.candidatos
  for select to anon using (false);
```

### Politicas para Config Form Postulacion (anonimo)

```sql
-- Anon puede leer configuracion del form publico
create policy "anon_select_config_postulacion" on public.config_form_postulacion
  for select to anon using (true);
```

### Politicas para Config Form Entrevista (anonimo)

```sql
-- Anon puede leer configuracion (instrucciones)
create policy "anon_select_config_entrevista" on public.config_form_entrevista
  for select to anon using (true);
```

### Politicas para Comunicaciones (anonimo)

```sql
-- Anon puede insertar (form publico)
create policy "anon_insert_comunicaciones" on public.comunicaciones
  for insert to anon with check (true);

-- Anon puede leer
create policy "anon_select_comunicaciones" on public.comunicaciones
  for select to anon using (true);
```

---

## 15. CAMPOS FORM PUBLICO DEFAULTS

Array JSON de 10 campos por defecto para el formulario de postulacion:

```json
[
  { "key": "nombre", "label": "Nombre", "type": "text", "required": true, "order": 1 },
  { "key": "apellido", "label": "Apellido", "type": "text", "required": true, "order": 2 },
  { "key": "dni", "label": "DNI", "type": "text", "required": true, "order": 3 },
  { "key": "email", "label": "Email", "type": "email", "required": false, "order": 4 },
  { "key": "telefono", "label": "Telefono", "type": "tel", "required": false, "order": 5 },
  { "key": "fecNac", "label": "Fecha de nacimiento", "type": "date", "required": false, "order": 6 },
  { "key": "zona", "label": "Zona / Localidad", "type": "text", "required": false, "order": 7 },
  { "key": "servicioDeseado", "label": "Servicio deseado", "type": "text", "required": false, "order": 8 },
  { "key": "disponibilidad", "label": "Disponibilidad", "type": "select", "required": false, "options": "Full time,Part time,Solo mananas,Solo tardes", "order": 9 },
  { "key": "experiencia", "label": "Experiencia", "type": "textarea", "required": false, "order": 10 }
]
```

### Tipos Soportados

| Tipo | Render |
|------|--------|
| `text` | `<input type="text">` |
| `email` | `<input type="email">` |
| `tel` | `<input type="tel">` |
| `date` | `<input type="date">` |
| `select` | `<select>` con options separados por coma |
| `textarea` | `<textarea rows="3">` |
| `file` | `<input type="file">` |

---

## 16. PERFILES Y PERMISOS

```json
{
  "Administrador total": {
    "id": "admin",
    "desc": "Superusuario de la empresa: acceso completo a los modulos de su tenant.",
    "modulos": [
      "candidatos", "pre_candidatos", "calendario", "link_postulacion", "importar_historico",
      "legajos", "personal", "capacitaciones", "vacaciones", "descansos",
      "sanciones", "competencia", "enfermos", "legales", "uniformes",
      "liquidacion", "liquidacion_horas", "monotributo", "paritarias",
      "feriados", "descuentos", "retenciones", "adelantos", "prestamos",
      "sugerencias", "comunicaciones", "notificaciones", "usuarios", "empresas", "configuracion"
    ]
  },
  "RRHH": {
    "id": "rrhh",
    "desc": "Todo el sector RRHH: seleccion, ingreso, personal, liquidacion.",
    "modulos": [
      "candidatos", "pre_candidatos", "calendario", "link_postulacion", "importar_historico",
      "legajos", "personal", "capacitaciones", "vacaciones", "descansos",
      "sanciones", "enfermos", "legales", "uniformes",
      "sugerencias", "comunicaciones", "notificaciones"
    ]
  },
  "Operaciones": {
    "id": "ops",
    "desc": "Servicios, reasignaciones, sanciones y novedades de personal.",
    "modulos": [
      "reasignaciones", "sanciones", "enfermos", "legales",
      "comunicaciones", "sugerencias"
    ]
  },
  "Finanzas": {
    "id": "fin",
    "desc": "Liquidacion, retenciones, monotributo, adelantos.",
    "modulos": [
      "liquidacion", "liquidacion_horas", "monotributo",
      "descuentos", "retenciones", "adelantos", "prestamos"
    ]
  },
  "Supervisor": {
    "id": "sup",
    "desc": "Su servicio, su equipo, novedades y aprobaciones.",
    "modulos": [
      "comunicaciones", "sugerencias"
    ]
  },
  "Asociado": {
    "id": "asoc",
    "desc": "Autoconsulta y tramites personales (adelantos, vacaciones).",
    "modulos": [
      "portal_asociado"
    ]
  }
}
```

### Control de Accion en UI

```javascript
function accionesCandidato(c) {
  const u = getCurrentUser();
  if (!u || (u.perfil !== 'RRHH' && u.perfil !== 'Administrador total'))
    return '<span class="muted">--</span>';
  // ... renderizar botones segun estado
}
```

---

## 17. EDGE FUNCTIONS

### 17.1 crear-empresa

**Input:**
```json
{
  "nombre": "string (obligatorio)",
  "nombreAdmin": "string (obligatorio)",
  "email": "string (obligatorio, formato valido)",
  "password": "string (minimo 6 caracteres)"
}
```

**Output (exito):**
```json
{
  "ok": true,
  "empresaId": "uuid",
  "nombre": "string",
  "usuario": "email"
}
```

**Output (error):**
```json
{ "error": "mensaje de error" }
```

**Autorizacion:** Solo superadmin. Valida JWT y verifica `es_superadmin` en tabla `usuarios`.

**Proceso:**
1. Crea fila en `empresas`
2. Crea usuario en Supabase Auth (`admin.createUser`)
3. Crea fila en `usuarios` con perfil `Administrador total`
4. Ejecuta `seedEmpresa()` para crear catalogos iniciales
5. Si falla en cualquier paso, revierte todo (rollback manual)

### 17.2 agendar-turno

**Input (action: 'disponibilidad'):**
```json
{
  "action": "disponibilidad",
  "empresaId": "string (obligatorio)",
  "dias": 14
}
```

**Output (disponibilidad):**
```json
{
  "config": {
    "dias_habilitados": [1,2,3,4,5],
    "hora_desde": "09:00",
    "hora_hasta": "17:00",
    "duracion_min": 20,
    "max_por_franja": 2
  },
  "franjas": ["09:00", "09:20", "09:40", ...],
  "ocupados": { "2026-08-18|09:00": 1, ... },
  "desde": "2026-08-18",
  "hasta": "2026-09-01"
}
```

**Input (action: 'reservar'):**
```json
{
  "action": "reservar",
  "empresaId": "string (obligatorio)",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "nombre": "string (obligatorio)",
  "apellido": "string (obligatorio)",
  "dni": "string (obligatorio, 6-8 digitos)",
  "telefono": "string",
  "email": "string",
  "observaciones": "string"
}
```

**Output (reservar):**
```json
{ "ok": true }
```

**Autorizacion:** Publica (no requiere JWT). Usa `SUPABASE_SERVICE_ROLE_KEY`.

**Proceso (reservar):**
1. Valida empresa activa
2. Carga config del calendario
3. Valida DNI, dia habilitado, franja valida
4. Verifica cupo server-side (evita overbooking)
5. Busca candidato existente por DNI+empresa
   - Si existe: actualiza (fechaCita, horaCita, estado='Citado')
   - Si no existe: crea nuevo registro
6. Crea turno con estado 'Pendiente'

### 17.3 gestionar-usuario

**Acciones:**
- `create`: Crea usuario (Auth + tabla)
- `update`: Actualiza nombre/perfil/activo
- `resetPassword`: Resetea contrasena
- `delete`: Elimina usuario (Auth + tabla)

**Autorizacion:** superadmin o admin de empresa (solo sobre usuarios de su empresa).

### 17.4 enviar-mail

**Input:**
```json
{
  "empresaId": "string (obligatorio)",
  "to": "string (email destino)",
  "subject": "string (asunto)",
  "html": "string (contenido HTML)"
}
```

**Output:**
```json
{ "ok": true, "message": "Email enviado correctamente", "from": "...", "to": "..." }
```

---

## 18. FUNCIONES DE UTILIDAD

### esc() -- Escapar HTML

```javascript
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
```

### esDniValido() -- Validar DNI

```javascript
function esDniValido(dni) {
  return /^\d{6,8}$/.test(String(dni).trim());
}
```

### fechaISOToDisplay() -- Formatear fecha ISO a DD/MM/YYYY

```javascript
function fechaISOToDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
```

### displayToISO() -- Convertir DD/MM/YYYY a YYYY-MM-DD

```javascript
function displayToISO(display) {
  if (!display) return '';
  const m = String(display).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
```

### calcularEdad() -- Calcular edad desde fecha de nacimiento

```javascript
function calcularEdad(fecNacISO) {
  if (!fecNacISO) return null;
  const nac = new Date(fecNacISO + 'T00:00:00');
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  if (hoy.getMonth() < nac.getMonth() ||
      (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}
```

### supaSync() -- Sincronizar con Supabase

```javascript
async function supaSync(dbKey, obj) {
  const table = _SM[dbKey];
  if (!table) throw new Error(`Tabla desconocida para "${dbKey}"`);
  const empresaId = SESSION.currentUser?.empresaId || null;
  if (empresaId && obj.empresaId === undefined && dbKey !== 'empresas')
    obj.empresaId = empresaId;
  const row = _toSnakeRow(obj);
  const { error } = await getClient()
    .from(table)
    .upsert(row, { onConflict: 'id_local' });
  if (error) throw new Error(`supaSync(${dbKey}): ${error.message}`);
  // Reflejo en memoria
  const arr = DB[dbKey] || (DB[dbKey] = []);
  const idx = arr.findIndex(x => String(x.id) === String(obj.id));
  if (idx >= 0) arr[idx] = obj;
  else arr.push(obj);
  return obj;
}
```

### _toSnakeRow() -- Convertir camelCase a snake_case

```javascript
function _toSnakeRow(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    if (k === 'id' || k === 'id_local') {
      out.id_local = String(obj.id_local ?? obj.id);
      continue;
    }
    out[_toSnake(k)] = obj[k];
  }
  if (out.id_local === undefined) out.id_local = String(obj.id ?? Date.now());
  return out;
}
```

### _toCamelRow() -- Convertir snake_case a camelCase

```javascript
function _toCamelRow(row) {
  const out = {};
  for (const k of Object.keys(row || {}))
    out[_toCamel(k)] = row[k];
  return out;
}

function _toCamel(key) {
  if (key === 'id_local') return 'id';
  return String(key).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
```

---

## 19. IMPORTS NECESARIOS

### candidatos.js

```javascript
import { DB } from '../../state.js';
import { supaSync } from '../../shared/supabase.js';
import { ensureModal, cerrarModal, showToast, capturar } from '../../shared/modal.js';
import { esc, esDniValido, fechaISOToDisplay, displayToISO, calcularEdad } from '../../shared/helpers.js';
import { getCurrentUser } from '../../shared/auth.js';
```

### postular.js

```javascript
import { getPublicClient, hayConfigSupabase, _toSnakeRow } from './shared/supabase.js';
```

### agendarEntrevista.js

```javascript
import { getPublicClient, hayConfigSupabase, fnErrorMessage } from './shared/supabase.js';
```

### calendario.js

```javascript
import { DB } from '../../state.js';
import { supaSync } from '../../shared/supabase.js';
import { ensureModal, cerrarModal, showToast, capturar } from '../../shared/modal.js';
import { esc } from '../../shared/helpers.js';
import { getCurrentUser } from '../../shared/auth.js';
import { getCandById } from './candidatos.js';
```

### importadorHistorico.js

```javascript
import { DB } from '../../state.js';
import { supaSync } from '../../shared/supabase.js';
import { showToast, cerrarModal, ensureModal } from '../../shared/modal.js';
import { esc, fechaCsvAISO } from '../../shared/helpers.js';
```

---

## 20. TABLAS SUPABASE MAPEADAS

El objeto `_SM` mapea claves JS (camelCase) a nombres de tabla Supabase (snake_case):

```javascript
const _SM = {
  candidatos: 'candidatos',
  turnos: 'turnos',
  calendarioConfig: 'calendario_config',
  configFormPostulacion: 'config_form_postulacion',
  configFormEntrevista: 'config_form_entrevista',
  empresas: 'empresas',
  usuarios: 'usuarios',
  notificaciones: 'notificaciones',
  comunicaciones: 'comunicaciones',
  logs: 'logs',
  // ... mas tablas del sistema
};
```

### Conversion de claves

```javascript
// camelCase -> snake_case
function _toSnake(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

// snake_case -> camelCase
function _toCamel(key) {
  if (key === 'id_local') return 'id';  // Caso especial
  return String(key).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
```

### Ejemplo de mapeo

| JS Key | DB Column |
|--------|-----------|
| `id` | `id_local` |
| `empresaId` | `empresa_id` |
| `dni` | `dni` |
| `fecNac` | `fec_nac` |
| `estadoCivil` | `estado_civil` |
| `disponibilidadHoraria` | `disponibilidad_horaria` |
| `nombreReferido` | `nombre_referido` |
| `fechaCita` | `fecha_cita` |
| `horaCita` | `hora_cita` |
| `motivoRechazo` | `motivo_rechazo` |
| `motivoBaja` | `motivo_baja` |
| `servicioDeseado` | `servicio_deseado` |
| `creadoPor` | `creado_por` |
| `diasHabilitados` | `dias_habilitados` |
| `horaDesde` | `hora_desde` |
| `horaHasta` | `hora_hasta` |
| `duracionMin` | `duracion_min` |
| `maxPorFranja` | `max_por_franja` |
| `candidatoId` | `candidato_id` |

---

## 21. MODULOS ADICIONALES QUE USA

### 21.1 Documentos por Etapa

El sistema maneja uploads de PDFs separados para cada etapa del proceso de seleccion:

| Tabla | Etapa | Descripcion |
|-------|-------|-------------|
| `documentacion_ingreso` | Documentacion | Antecedentes, libreta, cursos, etc. |
| `preocupacionales` | Preocupacional | Turno medico, resultado, motivo |
| `psicos` | Psicotecnico | Evaluacion psicotecnica |

Cada tabla tiene:
- `dni` y `candidato_id` para vincular al candidato
- `estado` para tracking
- Campos especificos de la etapa

### 21.2 IA Gemini

El sistema integra una Edge Function `analizar-ia` para analisis automatico de candidatos. Se usa para:
- Evaluar perfil del candidato
- Generar resumenes automaticos
- Analizar documentos

### 21.3 Comunicaciones

Tabla `comunicaciones` para mensajeria interna admin <-> asociados:
- `tipo`: tipo de comunicacion
- `de_text` / `para_text`: remitente/destinatario
- `mensaje`: contenido
- `leido`: tracking de lectura
- `ref_tipo` / `ref_id`: referencia a entidad relacionada

### 21.4 Portal del Asociado

El modulo de Asociado incluye:
- **mis_adelantos**: Consulta y solicitud de adelantos
- **sugerencias**: Envio de sugerencias (anonimo o identificado)
- **comunicaciones**: Mensajeria con la empresa

---

## 22. ARCHIVOS DEL MODULO

| Archivo | Funcion |
|---------|---------|
| `src/modules/candidatos/candidatos.js` | Modulo principal: ABM, estados, citas, WhatsApp,_detalle |
| `src/modules/candidatos/calendario.js` | Grilla semanal, configuracion del agente, turnos |
| `src/modules/candidatos/importadorHistorico.js` | Importador CSV de historico |
| `src/postular.js` | Formulario publico de postulacion |
| `src/agendarEntrevista.js` | Formulario publico de agendamiento |
| `src/shared/supabase.js` | Cliente Supabase, sync, mapeo de tablas |
| `src/shared/helpers.js` | Utilidades: esc, fechas, validaciones |
| `src/shared/auth.js` | Autenticacion y sesion |
| `src/state.js` | Estado global (DB, SESSION) |
| `supabase/schema.sql` | Esquema completo de tablas + RLS + seed |
| `supabase/functions/agendar-turno/index.ts` | Edge Function publica |
| `supabase/functions/crear-empresa/index.ts` | Edge Function superadmin |
| `supabase/functions/gestionar-usuario/index.ts` | CRUD de usuarios |
| `supabase/functions/enviar-mail/index.ts` | Envio de emails |

---

## 23. MOTIVOS PREDEFINIDOS

### Motivos de Rechazo

```javascript
const MOTIVOS_RECHAZO = [
  'No cubre perfil',
  'Falta de disponibilidad',
  'No asistio',
  'Perfil laboral',
  'Otro'
];
```

### Motivos de Baja

```javascript
const MOTIVOS_BAJA = [
  'Renuncio al proceso',
  'Consiguio otro trabajo',
  'No contesta',
  'Duplicado',
  'Otro'
];
```

### Medios de Contacto

```javascript
const MEDIOS = ['Redes', 'Referido', 'Web', 'Volante', 'Otro'];
```

---

## 24. RESUMEN DE TRANSICIONES

| Estado Actual | Accion | Estado Destino | Datos adicionales |
|---------------|--------|----------------|-------------------|
| (nuevo) | Enviar form publico | Precandidato | empresaId, origen='postularme' |
| Precandidato | Aprobar | Sin citar | -- |
| Precandidato | Rechazar | Rechazado | motivoRechazo |
| Sin citar | Citar | Citado | fechaCita, horaCita |
| Sin citar | Rechazar | Rechazado | motivoRechazo |
| Citado | Asistio=true | Entrevistado | asistio=true |
| Citado | Asistio=false | Rechazado | asistio=false, motivoRechazo='No asistio' |
| Entrevistado | Aprobar | Aprobado | -- |
| Entrevistado | Rechazar | Rechazado | motivoRechazo |
| Aprobado | Pasar a Psicotecnico | En Psicotecnico | Crea registro en psicos |
| Aprobado | Rechazar | Rechazado | motivoRechazo |
| Cualquier activo | Baja | Baja | motivoBaja |
| (agendar) | Link publico | Citado | via Edge Function agendar-turno |

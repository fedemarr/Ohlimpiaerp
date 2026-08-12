# DELTA — Módulo Comercial v1.3 (Diagnóstico Clientes + Servicios)

**Versión:** 1.3
**Fecha:** 29 de julio de 2026
**Autor del diseño:** Lautaro (con asistencia de Claude web)
**Destinatario:** Fede (implementación)
**Estado:** Cerrado, listo para implementar
**Documentos base:** `DELTA_comercial_clientes_objetivos_v1.1.md`, `DELTA_comercial_satelites_v1.1.md`, `DELTA_comercial_mejoras_v1.2.md`

---

## Cómo leer este documento

Este delta surge de un **diagnóstico sobre el sistema ya implementado por Fede** (post v1.2), comparando las pantallas reales contra dos fuentes: el diseño previo y el **alta de cliente/servicio en papel** que hoy circula por Gmail (los formularios "ALTA - Presupuesto"). El criterio de revisión fue *completitud*: que el sistema capture todos los datos del papel, sin huecos, bien organizados y con una sola fuente de verdad por dato.

Está dividido en dos partes: **ABM de Clientes** y **Servicios** (antes "Objetivos"). Al final, cabos y verificaciones para Fede.

**Nota de criterio:** el sistema NO debe reproducir el Word clavado; debe *capturar los datos*. El formato final (pantalla, PDF, mail) es lo de menos. Lo que importa es que ningún dato del papel quede sin lugar donde guardarse.

**Principio transversal (se repite mucho):** *una sola fuente de verdad por dato*. Un dato que le importa a varias áreas vive en UN solo lugar y las demás lo leen. Las listas de personas se leen de Legajos. Los parámetros (tipos, motivos, listas) viven en el pizarrón central de Configuración.

---

## PARTE 1 — ABM DE CLIENTES

El alta de cliente (tabs Datos generales, Impositivo, Contactos, Facturación) fue verificada y **captura todo el Word y más** (documentación requerida por cliente, múltiples contactos con rol). Lo que sigue son los ajustes y decisiones nuevas.

### 1.1 — Puerta única de clientes (DECISIÓN NUEVA)
Todo cliente **nace como lead en el CRM**. Se elimina la opción de crear un cliente directamente en estado "Prospecto" desde el ABM.

- Estados del cliente en el ABM: **Borrador → Activo → Baja** (+ reactivación). Sin "Prospecto".
- El estado "Prospecto" pertenece al **CRM** (primera etapa del pipeline), no al ABM.
- Para tratos ya cerrados de palabra (negociación informal), el usuario puede **saltar etapas del pipeline rápido**, pero la puerta de entrada es siempre el CRM.
- Cuando el lead se gana, nace el cliente en estado **Borrador** (auto-create, ver delta v1.2 punto 2.4.2), se revisa y se confirma → Activo.

> **Por qué:** evita dos puertas de entrada y clientes duplicados (mismo cliente como lead en CRM y como prospecto en ABM). Conecta con el bug P.11 del delta v1.2 (prospecto que aparecía como Baja): al sacar "Prospecto" del cliente, se ordena ese enredo.
> **Implementación:** se coordina cuando se toque el CRM, ya que depende del auto-create.

### 1.2 — Coordinador de cuentas / Responsable (DECISIÓN NUEVA)
El campo "Responsable interno" registra a quién trae y mantiene la relación con el cliente. Puede ser:
- **Interno:** persona de Legajos (como hoy).
- **Externo:** alguien que no está en Legajos (trae el cliente, mantiene la relación).

Alcance **nivel simple**: solo registrar quién es. **Sin cálculo de comisión.**

> **Ajuste para Fede:** hoy el campo solo busca en Legajos. Debe permitir también cargar un responsable externo (mini-registro de externos, o campo con nombre/contacto — a evaluar según cómo esté armado).
> **[SEMILLA v2]** El coordinador externo suele cobrar comisión sobre facturación. El circuito de comisiones (porcentaje, cálculo, liquidación) es un **módulo aparte** a futuro. No se diseña ahora.

### 1.3 — Tilde "cliente a satisfacer"
Es **solo informativo**: marca quién es la persona clave a tener contenta. No dispara ningún circuito.
> Semilla: a futuro, cuando se diseñe Feedback de clientes, es el candidato natural para saber a quién mandar encuestas de satisfacción.

### 1.4 — Código interno vs Código Tango (VERIFICACIÓN TÉCNICA — Fede)
Confirmar si el cliente se identifica por un **código interno propio del sistema** o si está usando el **Código Tango** como identidad (clave primaria / referencia entre módulos).

- **Evidencia del problema:** en la lista de clientes conviven códigos con formato interno (CLI-0001, CLI-0002) y un código con formato Tango crudo (Coto = "46"). Esa inconsistencia sugiere que el mismo campo mezcla identidad interna y referencia externa.
- **Diseño requerido:** identidad interna propia (formato consistente, generado por el sistema) + campo separado "Código Tango" como **referencia externa** (como el CUIT o el `codigo_monica`). Hoy Tango factura y tiene sus códigos; a futuro Tango deja de usarse y el código interno queda como única identidad.
- **Acción:** si hoy está atado a Tango, evaluar desatarlo **antes de cargar volumen de clientes**.

> Pendiente relacionado: cuando se vea Cobros, Lautaro pasará el PDF que descarga de Tango. Sirve para ver el formato real de los códigos Tango y cerrar este punto.

---

## PARTE 2 — SERVICIOS (antes "Objetivos")

### 2.0 — Unificación de vocabulario: "servicio" (DECISIÓN NUEVA)
"Objetivo" y "servicio" son sinónimos en la cooperativa. **Unificar a "servicio"** en toda la capa visible: título de ventana ("Editar servicio"), campos ("Código del servicio", "Nombre del servicio"), botones ("Guardar servicio", "+ Servicio"), menús, listas, tarjetas de resumen.

> **[NOTA TÉCNICA — Fede]** El reemplazo es SOLO en lo que ve el usuario (textos, labels, botones). **NO renombrar** la tabla `objetivos`, el campo `codigo`, ni las referencias internas entre módulos (`DB.objetivos.codigo` sigue siendo la fuente de verdad canónica). Cambiar la etiqueta visible, no la estructura interna, para no romper relaciones existentes.

### 2.1 — Tab "Datos del servicio"

#### 2.1.1 — Código y Nombre: se mantienen ambos
- **Código del servicio** (ej: CHANGO.BROWN): identificador único, sin espacios, fuente de verdad para relaciones entre módulos.
- **Nombre del servicio** (ej: Chango Mas Brown): nombre legible para las personas.

Cumplen roles distintos (el código identifica, el nombre comunica). No se elimina ninguno; solo se les cambia la palabra "objetivo" por "servicio".

#### 2.1.2 — Dirección + Localidad en dos pasos (CAMBIO)
Reemplazar el texto libre de localidad por **dos campos encadenados**:
- **Paso 1 — Jurisdicción:** desplegable CABA / Provincia de Buenos Aires.
- **Paso 2 — Localidad:** depende del paso 1. Si CABA → lista de los **48 barrios porteños**. Si Provincia → lista de los **135 partidos**.

El campo **Dirección** guarda **solo calle y altura** (ej: "Av. Brown 4563"), sin la localidad, para no duplicar.

> **Nota para Fede:** armar la estructura de forma que **agregar otra provincia a futuro sea fácil** (no clavar dos opciones en el código). Hoy solo hay CABA y Provincia de Bs As.
> Si se necesita la dirección completa en algún lado (factura, remito), se arma juntando calle+altura+localidad+jurisdicción, pero cada dato se guarda por separado.

#### 2.1.3 — Personal necesario, estandarizado en puestos (CAMBIO)
Reemplazar el texto libre "Personal necesario y horario" por una **tabla de puestos** (varias filas). Cada puesto describe una **necesidad**, NO una persona concreta (la asignación de personas ocurre después, en el flujo Operaciones/RRHH).

Se reusa el esqueleto visual de la ventana existente de liquidación de horas (los tildes de días sirven tal cual). Campos por puesto:
- **Cantidad de personas** (ej: 3)
- **Perfil** (H/M, rango de edad; opcional según servicio)
- **Horario** en formato desde/hasta (ej: 9 a 14), no solo "horas por día"
- **Días** (tildes Lunes a Domingos + Feriados)
- **Observación** (texto libre por puesto)

Un servicio puede tener varios puestos (ej: 3 operarios L-V mañana + 1 encargado sábados).

#### 2.1.4 — Supervisor (ya correcto)
El cartel "El supervisor se asigna desde Operaciones una vez firmado el contrato — no se elige acá" es correcto y respeta el flujo de handoff (delta v1.2, 2.2.4). Mantener.

### 2.2 — Tab "Precio y contrato"

#### 2.2.1 — Modelo de precio: qué se carga y qué se calcula (CAMBIO IMPORTANTE)
Hoy los cuatro campos (EFT, valor por EFT, valor hora, mensual) están abiertos para carga manual, y **no cierran entre sí** (bug de consistencia). Corregir según estas reglas, validadas con el Excel de Lautaro:

**Modelo "Por EFT" (por horas):**
- Se cargan: **Cantidad de horas** + **Valor hora**.
- Se calcula (se muestra bloqueado en gris, NO se tipea): **Valor mensual = cantidad de horas × valor hora**.

**Modelo "Abono mensual fijo":**
- Se cargan: **Valor mensual** + **Cantidad de horas** (EFT).
- Se calcula (se muestra bloqueado en gris, NO se tipea): **Valor hora de referencia = valor mensual ÷ cantidad de horas**.

Verificación con datos reales (Excel de Lautaro):
- Chango.caseros: 200 hs × $9.000 = $1.800.000 ✓
- Chango.zarate: 500 hs × $9.000 = $4.500.000 ✓
- Hospital.Campana: 1.200 hs × $12.000 = $14.400.000 ✓
- Smart.fit (fijo): $1.500.000 ÷ 200 hs = $7.500/hora ✓

#### 2.2.2 — Cambios concretos a los campos
- **Título "Modelo de precio":** sacar el "(FT=200hs/mes)". Dejar solo "Por EFT" (el nombre EFT ya recuerda que hay un tope de horas a respetar).
- **Eliminar el campo "Valor por EFT"** (no se usa, confundía).
- **Renombrar "Cantidad de EFTs" → "Cantidad de horas"** (se cargan horas directas: 200, 500, 1.200, como en el Excel).
- El campo calculado se **bloquea en gris** mostrando el resultado, según el modelo elegido.

#### 2.2.3 — Valor mensual = "monto estimado a facturar por mes"
Una vez que existe el valor mensual (cargado en modelo fijo, o calculado en modelo por hora), en el **detalle del servicio** se muestra como **"monto estimado a facturar por mes"**.

> **Política (totales calculados):** este valor **NO se guarda**. Se recalcula siempre con el valor hora vigente. Si cambia el valor hora por paritaria, el monto estimado se actualiza solo. Es "estimado" porque las horas reales pueden variar.

### 2.3 — Tab "Responsables del cliente"

#### 2.3.1 — Dos niveles de contactos (CONFIRMADO, son distintos)
Conviven y son cosas distintas, ambas necesarias:
- **Nivel cliente** (ABM): contactos generales de la empresa (gerente general, cobros corporativo). Valen para toda la relación.
- **Nivel servicio** (este tab): referentes puntuales de ese servicio (ej: site manager de esa sucursal). Pueden variar entre servicios del mismo cliente (caso real: cliente "hit", cada servicio con su propio site manager).

**Decisión:** los contactos del servicio se **cargan a mano en cada servicio** (sin reuso desde el cliente — versión simple; el reuso se puede agregar después si molesta retipear).

#### 2.3.2 — Tilde "recibe la factura" (AGREGAR)
Sumar un **tilde "recibe la factura"** sobre los responsables del servicio, para marcar a quién se le envía el mail con la factura de ese servicio (igual que existe el tilde "cliente a satisfacer"). Puede variar entre servicios del mismo cliente. No es un campo aparte, es un tilde sobre la lista existente.

### 2.4 — Tab "Facturación"

#### 2.4.1 — Herencia con sobrescritura (NOTA TÉCNICA IMPORTANTE)
Período de facturación y Requiere OC: el valor del **cliente es el default**, y el **servicio puede sobrescribirlo**.

> **[NOTA TÉCNICA — Fede]** Al crear el servicio, se **copia** el valor del cliente al servicio (copia propia, no referencia en vivo). El servicio manda sobre lo suyo. Cambiar el valor del cliente después **NO debe alterar** los servicios ya creados. **Evitar** el patrón de "leer en vivo del cliente" — usar copia al momento de crear. (Es como la dirección de envío por defecto en una compra: se ofrece la de siempre, pero se puede cambiar para ese pedido.)

### 2.5 — Logística del servicio (NUEVO — capturar del Word)

El Word tiene una sección Logística (Productos, Elementos de Limpieza, Máquinas) que hoy no está en el sistema. Agregar en el servicio una sección de **necesidad logística**: qué productos, elementos de limpieza y máquinas requiere el servicio para funcionar (la "receta" del servicio, dato estable).

**Frontera clara:**
- **En el servicio:** la *necesidad* (qué se necesita).
- **En el módulo Logística / Pedido de Productos:** la *ejecución* (pedido, cantidades por período, entrega, seguimiento). Logística puede leer esta necesidad como referencia.

> El detalle fino (catálogo de productos, vínculo con `codigo_monica`) se afina cuando se toque el módulo Logística, para no diseñarlo dos veces.

#### 2.5.1 — Campo "Facturación de productos" (MOVER + RENOMBRAR)
El campo que hoy está en el tab "Precio y contrato" como "Productos incluidos en precio" se **mueve a la sección de productos/logística** (su lugar natural: es una característica de los productos; el Word lo escribe pegado a Logística).

- **Nuevo título:** "Facturación de productos" (neutral, no presupone que ya están incluidos).
- **Opciones:** Incluidos en el precio / Factura separada / Renglón aparte en la factura / No lleva productos.
- Dato con una sola fuente de verdad, leído por Finanzas, Operaciones y Logística.

---

## PARTE 3 — CABOS Y VERIFICACIONES PARA FEDE

### Verificaciones técnicas
- **[V.1] Código interno vs Tango** (ver 1.4): confirmar identidad interna propia vs uso del Código Tango como clave. Evidencia: Coto = "46" vs CLI-0001. Evaluar desatar de Tango antes de cargar volumen.
- **[V.2] Rol supervisor / operario en Legajos** (pendiente de delta v1.2): confirmar que el legajo permite identificar rol "supervisor" y "operario" para las listas desplegables.

### Ajustes que cambian lo ya implementado
- **[A.1]** Responsable del cliente: permitir externos, no solo Legajos (ver 1.2).
- **[A.2]** Modelo de precio: pasar de 4 campos manuales a base+calculado con bloqueo en gris (ver 2.2). Eliminar "Valor por EFT", renombrar "Cantidad de EFTs" → "Cantidad de horas", sacar "(FT=200hs/mes)" del título.
- **[A.3]** Personal: de texto libre a tabla de puestos estructurada (ver 2.1.3).
- **[A.4]** Localidad: de texto libre a jurisdicción + localidad encadenadas (ver 2.1.2).
- **[A.5]** Vocabulario: "objetivo" → "servicio" en capa visible (ver 2.0).
- **[A.6]** Facturación de productos: mover a logística + renombrar (ver 2.5.1).

### Pendiente para próxima sesión
- **Servicios:** ver la **lista/pantalla principal** de servicios, la **ficha de detalle** (el "Ver"), y la vista de **Pendiente de asignación** (verificar las reglas de solo-lectura del delta v1.2, 2.2.4, y que se muestren los dos datos: facturación de productos + período de facturación).
- **Cobros:** Lautaro pasará el **PDF que descarga de Tango** — sirve para el circuito de importación de cobros y para cerrar la verificación de códigos Tango (V.1).

### Semillas anotadas (no ahora)
- Comisiones de coordinador externo → módulo económico aparte (v2).
- Tilde "cliente a satisfacer" → futura conexión con encuestas de Feedback.

---

## Commits sugeridos (A.3)
- `fix: modelo de precio calcula valor mensual/hora según modalidad y bloquea el campo derivado`
- `refactor: unificar "objetivo" a "servicio" en la capa visible (sin tocar tabla ni referencias)`
- `feat: localidad del servicio con jurisdicción (CABA/PBA) + lista dependiente`
- `feat: personal necesario del servicio como tabla de puestos estructurada`
- `feat: sección de necesidad logística en el servicio (productos, elementos, máquinas)`
- `refactor: mover y renombrar campo a "Facturación de productos" en sección logística`
- `feat: tilde "recibe la factura" en responsables del servicio`
- `fix: período de facturación y OC se copian del cliente al crear servicio (no referencia en vivo)`

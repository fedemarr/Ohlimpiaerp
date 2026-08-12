# DELTA — Módulo Comercial v1.2

**Versión:** 1.2
**Fecha:** 24 de julio de 2026
**Autor del diseño:** Lautaro (con asistencia de Claude web)
**Destinatario:** Fede (implementación)
**Estado:** Cerrado, listo para implementar
**Documentos base:** `DELTA_comercial_clientes_objetivos_v1.1.md`, `DELTA_comercial_satelites_v1.1.md`

---

## Cómo leer este documento

Este delta recoge las mejoras y correcciones al módulo Comercial detectadas en revisión sobre el sistema en producción. Está dividido en tres partes:

- **Parte 1 — Parches:** bugs y arreglos chicos que no necesitan diseño. Se pueden atacar de entrada.
- **Parte 2 — Delta v1.2:** features nuevas y cambios de proceso, organizados por sub-módulo. Cada uno explica la decisión, el comportamiento esperado y las notas técnicas.
- **Parte 3 — Diferidos, cabos y decisiones abiertas.**

Todo respeta las políticas de `POLITICAS_PROYECTO.md`: soft delete (A.7), historización con vigencia temporal (A.6), fuente única de verdad, commits por cambio lógico en español (A.3), y persistencia en Supabase con scripts SQL versionados (A.5).

**Principio transversal que aparece muchas veces en este delta:** *fuente única de verdad*. Los parámetros (tipo de cliente, categorías, motivos, etc.) viven en un solo lugar — el "pizarrón central" de Configuración — y los demás módulos solo los **leen**, nunca generan los suyos propios. Las listas de personas (supervisores, operarios) se leen de Personal/Legajos filtrando por rol, no se escriben a mano.

---

## PARTE 1 — PARCHES (bugs y arreglos chicos)

Estos no necesitan decisión de diseño. Se reproducen, se corrigen y se cierra cada uno con su commit.

### P.1 — Normalización de datos al guardar
Al guardar, el sistema debe normalizar automáticamente sin importar cómo tipeó el usuario:
- **Nombres** (cliente, contacto, etc.): formato título — primera letra mayúscula, resto minúscula ("Juan Pérez").
- **Códigos de cliente:** todo en mayúscula ("CLI001", nunca "cli001").

> **Por qué importa más de lo que parece:** el código de cliente se usa para relacionar módulos. Si "cli001" y "CLI001" se tratan como distintos, se rompen las relaciones y aparecen duplicados. Esto es un fix preventivo, no solo cosmético.

### P.2 — Gestión de Precios: trae el nombre en vez del código
La pantalla debe mostrar el **código** del cliente, pero está mostrando el nombre. Corregir para que traiga el campo correcto.

### P.3 — Gestión de Precios: valor propuesto fantasma
Cuando se carga un número en una propuesta y luego se borra, el "valor propuesto" queda con el número viejo. El valor calculado debe recalcularse (o limpiarse) cuando se borra el dato de origen. No debe quedar un número fantasma.

### P.4 — Gestión de Precios: falta el símbolo de porcentaje
Cuando se ingresa un número de porcentaje, debe mostrarse con el símbolo "%".

### P.5 — Gestión de Precios: no genera propuesta nueva
Al cargar una nueva propuesta, no se genera. Es la acción principal de la pantalla y está rota. Prioritario.

### P.6 — Gestión de Precios: no trae los datos de la propuesta
La pantalla de detalle de propuesta tiene el molde armado (secciones de información) pero no muestra los datos cargados. Corregir para que traiga y muestre los datos de la propuesta.

### P.7 — Gestión de Precios: muestra importes donde van objetivos
En la pantalla de proyección/comparación, donde debería listar objetivos/servicios está mostrando importes. Está poblando la lista con la columna equivocada.

### P.8 — CRM Pipeline: muestra HTML crudo dentro de las tarjetas
En el tablero de pipeline, las tarjetas de leads muestran código HTML crudo como texto (`style="background:var(--fondo)..."`, `ondragstart="dragLead(event,N)"`) en lugar del nombre del lead. El HTML se está imprimiendo en pantalla en vez de renderizarse.

> **Nota para Fede:** causa probable — escape incorrecto del HTML o comillas mal cerradas que rompen el armado de la tarjeta. Los datos existen (los contadores muestran leads, hay importes), solo se renderizan mal. **Este bug puede ser síntoma de fragilidad de fondo en cómo se construye el pipeline** — ver Parte 3, decisión abierta sobre rehacer vs modificar.

### P.9 — Falta historial de acciones (Gestión de Precios)
No aparece el historial de acciones. Conecta con la política de auditoría A.7. Revisar si el historial no se está **guardando** o solo no se está **mostrando**.

### P.10 — Objetivos/Servicios: responsable cargado no aparece en el VER
En el tab "Pendiente de asignación", se carga el responsable del cliente y al apretar VER no aparece. Revisar si el dato no se guarda o no se lee.

### P.11 — Objetivos/Servicios: prospecto que aparece como "Baja"
Al agregar un prospecto y apretar VER, el estado sale como "Baja" (incorrecto). Además, el contacto clave cargado no aparece. Dos bugs en la misma pantalla.

### P.12 — Cobros: historial de gestiones vacío
En la ventana "Gestiones de cobro", el molde del HISTORIAL DE GESTIONES está en pantalla pero no muestra las gestiones registradas. Traer y mostrar los registros.

---

## PARTE 2 — DELTA v1.2 (features y procesos)

### 2.1 — CLIENTES

#### 2.1.1 — Parámetros con fuente única en Configuración
Los siguientes campos deben ser **parametrizables desde un único lugar (Configuración)**: tipo de cliente, Categoría ARCA, campos de facturación, responsable cliente.

- **Bug a corregir:** hoy "tipo de cliente" existe en Configuración pero los nombres **no coinciden** con lo que aparece en Clientes (desincronización / doble fuente). Corregir para que Clientes **lea** de Configuración.
- **Feature:** sumar los campos que hoy no son parametrizables (Categoría ARCA, facturación, responsable cliente).
- **Regla firme:** los módulos solo **leen** los parámetros. No se generan parámetros propios dentro de cada módulo. Una sola fuente de verdad.

#### 2.1.2 — Campo "tipo de contrato"
Nuevo campo en facturación que distingue si el servicio se factura **por hora** o por **presupuesto fijo**. Este campo tiene impacto transversal: gobierna el comportamiento del modelo de precio en Objetivos/Servicios (ver 2.2.1).

---

### 2.2 — OBJETIVOS / SERVICIOS

#### Concepto clave: qué es el EFT
El **EFT** es el tope de horas facturables pactado con el cliente. Ejemplo: EFT de 200 horas significa que se le factura al cliente 200 horas, independientemente de las horas reales trabajadas. Si se trabajan 210, esas 10 horas de más son a pérdida (las paga la cooperativa, no las cobra), salvo que el cliente apruebe reconocerlas (ver Parte 3, diferido).

El EFT vive en dos mundos: es un **número de facturación** (para Finanzas: EFT × valor hora) y un **número de control operativo** (para Operaciones: tope que no conviene pasar). Es un solo dato con varios lectores.

#### 2.2.1 — Comportamiento del modelo de precio
Según el "tipo de contrato" (2.1.2), el formulario del servicio se comporta distinto:

- **Por hora:** se habilitan *valor hora* + *EFT (horas facturables)*. Se calcula la facturación mensual. Se cierra el campo de monto fijo.
- **Presupuesto fijo:** se habilita el *monto mensual fijo*. Se cierra el valor hora. El *tope de horas* queda como campo que carga **Operaciones** más tarde (no Comercial).

#### 2.2.2 — Cálculo automático de facturación mensual
Cuando es por hora: facturación mensual = **EFT × valor hora**, calculada y mostrada en pantalla.

> **Política (totales calculados):** este número **NO se guarda** en la base. Se recalcula siempre. Si mañana cambia el valor hora, el número se actualiza solo. Guardar el total traería el problema de que quede viejo.

#### 2.2.3 — Campos mínimos del servicio (guía de diseño)
Esto **no genera lógica especial** — es una checklist para que el formulario del servicio no deje afuera ningún campo que las áreas necesitan. Los campos marcados no pueden guardarse vacíos.

| Campo | Áreas que dependen de él |
|---|---|
| Código interno, localidad, dirección | Operaciones, Logística |
| EFT (horas facturables) | Finanzas |
| Fecha de inicio | Operaciones, RRHH, Logística |
| Personal necesario y horario | Operaciones, RRHH |
| Valor hora o presupuesto fijo | Finanzas |

> Nota: "cantidad de horas por mes" y "EFT" son el mismo dato. Un solo campo, sin duplicar.

#### 2.2.4 — Pendiente de asignación: reglas de edición
El tab "Pendiente de asignación" es donde Operaciones asigna supervisor durante el handoff Comercial → Operaciones.

- **Los datos del servicio son de solo lectura ahí.** Ni Operaciones ni Comercial los editan en este tab.
- **Dos excepciones que Operaciones sí puede tocar acá:** el *responsable del cliente* (modificar/agregar) y el *EFT / tope de horas* (necesario en el caso de presupuesto fijo).
- Si hay que corregir cualquier otro dato del servicio, se hace desde el tab **Clientes** o el tab **Operativos** dentro de Objetivos/Servicios, no desde acá.
- **Mostrar además dos datos** en este tab: si se facturan productos aparte o van dentro del precio, y el período de facturación.

> **Lógica de fondo:** las dos excepciones son justo lo que Operaciones *aporta* en el handoff. Operaciones no viene a cambiar lo que pactó Comercial, viene a sumar lo suyo.

#### 2.2.5 — Lista de supervisores (botón "asignar supervisor")
El desplegable de supervisores se arma **leyendo Personal/Legajos y filtrando por rol supervisor**. No es una lista escrita a mano. Cuando RRHH da de alta/baja un supervisor en Personal, la lista se actualiza sola.

> **Verificación técnica para Fede:** confirmar que el legajo permite identificar el rol "supervisor" (campo de rol o categoría). Si no existe, hay que definir cómo se marca a un asociado como supervisor.

#### 2.2.6 — Baja de servicio: razón de la baja
Nuevo campo para registrar **por qué** se da de baja un servicio.
- **Motivo parametrizable** (pizarrón central: precio, disconformidad con supervisor, con operario, calidad, etc.).
- **Más un campo de texto libre** para el detalle.

#### 2.2.7 — Reactivación de un servicio dado de baja
Cuando un servicio dado de baja se levanta, **se reactiva desde el tab Baja conservando toda su historia** (soft delete: nada se borró). Al reactivar, se pueden **modificar las condiciones anteriores** (precio, EFT, supervisor).

> **Cómo se guarda (política A.6):** la reactivación es un **nuevo tramo de vigencia**, NO se pisan las condiciones viejas. El servicio tuvo condiciones desde X hasta la baja, y desde la reactivación tiene condiciones nuevas con nueva fecha de vigencia. Se agrega un tramo, no se sobrescribe. Así queda la línea de tiempo completa: cuándo tuvo el servicio, por qué se dio de baja, cuándo volvió y con qué condiciones.

---

### 2.3 — GESTIÓN DE PRECIOS

> **Atención:** esta pantalla concentra muchos bugs (P.2 a P.7, P.9) y le sumamos features de estructura nueva. Ver Parte 3 — decisión abierta sobre rehacer vs modificar antes de tocarla.

#### 2.3.1 — Aprobación del Gerente Comercial
Falta el paso formal de aprobación. Una propuesta de precio nace en estado **pendiente** y necesita que **el rol Gerente Comercial** la resuelva.

- **Aprueba por rol, no por nombre.** Hoy el rol lo ocupa Jorgelina Bianchi, pero el sistema lee quién ocupa el rol desde Personal. Si mañana cambia la persona, funciona igual sin tocar código.
- El gerente puede **aprobar** o **rechazar con motivo** (ver ciclo de vida abajo).
- Queda registrado quién aprobó/rechazó y cuándo (llena las columnas "APROBADO POR" y "ESTADO" que ya existen vacías; cumple A.7).
- **Solo las propuestas aprobadas cuentan como precio real.** Las pendientes se muestran en proyección pero no son definitivas.

#### 2.3.2 — Negociación por rondas con el cliente
Distinguir dos aprobaciones distintas que conviven:
- **Aprobación interna:** el Gerente Comercial avala la propuesta (2.3.1).
- **Aceptación del cliente:** el cliente dice sí o no al precio.

Cuando el cliente **rechaza**, la propuesta no se borra ni se pisa: queda registrada como "rechazada por el cliente" **con su motivo** (parametrizable + texto libre, misma lógica que 2.2.6), y se crea una **propuesta nueva** para la siguiente ronda. Todo el ida y vuelta del regateo queda asentado.

#### Ciclo de vida completo de una propuesta de precio
```
PENDIENTE
   │
   ├── Gerente APRUEBA ──► APROBADA INTERNAMENTE
   │                          │
   │                          ├── Cliente ACEPTA ──► PRECIO VIGENTE
   │                          └── Cliente RECHAZA (con motivo) ──► se crea propuesta nueva (nueva ronda)
   │
   └── Gerente RECHAZA (con motivo) ──► RECHAZADA INTERNAMENTE (Comercial rearma)
```

#### 2.3.3 — Aumentos escalonados (cronograma de tramos)
Un aumento puede aplicarse **escalonado**: en vez de impactar todo en un mes, se reparte en varios. Ejemplo real: un 10% puede ser todo de una vez, o 5% el mes que viene + 5% en dos meses, o 5% este mes + 5% en tres meses. **Es totalmente variable**: variable en cantidad de tramos, en el porcentaje de cada tramo y en cuándo cae cada uno.

**Diseño (adoptado):** una propuesta de aumento **no guarda un solo valor**, guarda un **cronograma de tramos**. Cada tramo tiene su fecha de vigencia y su valor:
```
Desde junio:      $115
Desde julio:      $130
```
- Un aumento de una sola vez = cronograma de **un** tramo. Un escalonado = cronograma de **varios** tramos. Misma máquina, no dos cosas distintas.
- Cada tramo se apoya en la historización con vigencia temporal (A.6).
- La **proyección financiera** lee el cronograma y muestra en cada mes el valor del tramo que corresponde (ej: $115 en junio, $130 desde julio).

> Esta es la pieza más pesada del módulo. Se implementa completa en v1.2 (decisión de Lautaro: no crear un parche intermedio que después haya que rehacer).

---

### 2.4 — CRM (pipeline de leads)

#### 2.4.1 — Cambio de etapa con campos estructurados
Hoy el pipeline es "mudo": se arrastra la tarjeta de una columna a otra sin registrar nada. Nuevo comportamiento: al cambiar de etapa, se abre una ventana donde se cargan **campos estructurados propios de esa etapa** (no texto libre, para poder hacer estadística después).

Esto además alimenta el historial de acciones (resuelve P.9 desde el origen: si cada cambio de etapa registra qué se hizo, el historial se llena solo).

**Campos por etapa** (las 5 etapas del pipeline + el estado de salida "Cerrado perdido"):

| Etapa | Campos |
|---|---|
| **Prospecto** | Fuente del lead (parametrizable: referido, web, llamada en frío, etc.) + observación libre |
| **Primer contacto** | Fecha del contacto + interlocutor (nombre/cargo) + observación |
| **Propuesta enviada** | Valor propuesto + fecha de envío + observación |
| **Negociación** | Valor ofrecido + contraoferta del cliente + observación |
| **Contrato** | Fecha de cierre + observación (el detalle fuerte pasa al alta del cliente, ver 2.4.2) |
| **Cerrado perdido** (estado de salida) | Motivo de pérdida (parametrizable: precio, sin personal, eligió competencia, no respondió, etc.) + observación |

> Los campos "fuente" y "motivo de pérdida" son parametrizables desde el pizarrón central. Principio de diseño: pocos campos por ventana (el corazón de la etapa + observación), para que la gente los complete.

#### 2.4.2 — Auto-create de cliente al ganar el lead (refinamiento de v1.1)
Ya estaba diseñado en `DELTA_comercial_satelites_v1.1.md` (auto-create hook on lead win). **Verificar cómo quedó implementado**, no inventar de cero.

Refinamiento: cuando el lead se gana (etapa Contrato), el cliente se crea en estado **borrador**, pre-cargado con los datos del lead. Alguien de Comercial lo **revisa y confirma** para volverlo cliente activo. Evita doble carga y evita clientes con datos incompletos.

> Patrón consistente en todo el módulo: los datos nacen provisionales (borrador / pendiente) y alguien los confirma para volverlos oficiales.

---

### 2.5 — RECLAMOS Y NO CONFORMIDADES

#### 2.5.1 — Separar reclamos de no conformidades
Hoy un reclamo cargado aparece **duplicado** en los dos tabs (Reclamos y No conformidades). Son dos cosas distintas por su **origen**:
- **Reclamo:** viene de afuera, lo genera el cliente.
- **No conformidad:** viene de adentro, la detecta la propia cooperativa.

Corregir para que cada uno viva en su tab sin duplicarse. La columna "NC vinculada" ya existe en la pantalla y **no se rompe** (el diseño del circuito reclamo → NC vinculada se difiere, ver Parte 3).

#### 2.5.2 — Tipo de reclamo parametrizable + lista de operarios
- **Tipo de reclamo:** parametrizable (pizarrón central).
- **Lista de operarios:** se lee de Personal/Legajos (misma lógica que supervisores, 2.2.5). Un reclamo puede apuntar a "el servicio en general" o a un operario específico traído del legajo.

---

### 2.6 — COBROS

#### Principio rector: Tango es la única fuente de verdad de los cobros
El tab "Cobros registrados" refleja **exclusivamente lo que Tango dice que se cobró**. La gestora NO escribe ahí. Esto evita dos fuentes de verdad que podrían no coincidir.

#### 2.6.1 — Importación desde Tango puebla los tabs
Al importar el Excel de Tango, el sistema clasifica cada factura:
- Lo que Tango marca como **cobrado** → tab "Cobros registrados" (con recibo, fecha de acreditación, etc.).
- Lo que está **impago** → tab "Facturas pendientes".

> El tab "Facturas pendientes" ya existe y está bien armado (cliente, objetivo, N° factura, importe, vencimiento, días de atraso, contacto, próxima gestión). El trabajo es asegurar que la importación vuelque bien las facturas impagas ahí.

#### 2.6.2 — Circuito cobrado / no cobrado
La gestora trabaja sobre "Facturas pendientes": llama, registra gestiones, hace seguimiento. Cuando se entera de que una factura se cobró, la **marca como cobrada**, PERO:

- **La factura NO cruza a "Cobros registrados".** Se queda en "Facturas pendientes", marcada visualmente como **"cobrada (pendiente de Tango)"**.
- Recién cuando la **próxima importación de Tango** confirma ese cobro, la factura sale de pendientes y aparece en "Cobros registrados" con los datos oficiales.

> **En criollo:** la gestora *anticipa* el dato ("yo sé que esto se cobró"), Tango lo *confirma*. La verdad contable la tiene Tango. La marca de la gestora es provisional y sirve para que no vuelva a llamar al cliente al pedo, pero no reemplaza a Tango.

#### 2.6.3 — Historial de gestiones
Ver P.12 (bug): el historial de gestiones existe como molde pero está vacío. Debe mostrar cada gestión registrada (llamada, mail, promesa de pago, etc.) con su fecha y resultado.

---

## PARTE 3 — DIFERIDOS, CABOS Y DECISIONES ABIERTAS

### Diferidos a v2
- **Horas trabajadas por encima del EFT que el cliente aprueba reconocer.** Necesita definir cómo se cargan, cómo impactan en la facturación del mes y qué evidencia de la aprobación del cliente queda guardada. Fuera del alcance de v1.2.
- **Circuito reclamo → NC vinculada.** La columna "NC vinculada" ya existe y no se rompe, pero el diseño de cómo se vincula un reclamo con su no conformidad interna se hace más adelante.

### Decisión abierta para Fede — rehacer vs modificar (política A.11)
Dos pantallas concentran la mayoría de los bugs y encima reciben las features más pesadas:
- **Gestión de Precios** (bugs P.2–P.7, P.9 + aprobación de gerente + negociación por rondas + cronograma de tramos).
- **Pipeline del CRM** (bug P.8 del HTML crudo + campos estructurados por etapa).

Antes de tocarlas, **Fede debe armar el cuadro comparativo que pide la política A.11** para cada una y traérselo a Lautaro:

| Opción | Tiempo estimado | Riesgo de bugs nuevos | Calidad final |
|--------|----------------|----------------------|---------------|
| Modificar lo existente | (a completar por Fede) | | Hereda deuda técnica |
| Rehacer de cero | (a completar por Fede) | | Limpio, sin deuda |

**No se toca ninguna de las dos pantallas hasta que Lautaro vea la comparación y decida.** Si se elige rehacer, backup con fecha primero y verificar que lo nuevo cumple todo lo del anterior (A.11).

### Verificación técnica pendiente
- Confirmar que el legajo (Personal) permite identificar el rol "supervisor" y el rol/condición de "operario" para las listas desplegables (2.2.5 y 2.5.2).

---

## Resumen de commits sugeridos (A.3)

Cada punto se cierra con su commit en español. Orden sugerido: primero los parches (Parte 1), después el delta por sub-módulo. Ejemplos de mensajes:
- `fix: código de cliente se normaliza a mayúscula al guardar`
- `fix: pipeline CRM renderiza tarjetas en vez de mostrar HTML crudo`
- `feat: aprobación de propuesta de precio por rol Gerente Comercial`
- `feat: aumentos escalonados como cronograma de tramos con vigencia`
- `feat: cambio de etapa CRM abre ventana con campos estructurados`
- `feat: circuito de cobros con Tango como única fuente de verdad`

# Delta de cambios — Módulo Vacaciones v1.1

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Vacaciones (sector administrativo)
**Autor:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-08
**Versión:** 1.1 (delta sobre v1.0)

---

## ⚠️ Cómo usar este documento

Este documento es un **delta de cambios** sobre `DISENO_vacaciones.md` (v1.0). NO reemplaza al documento original — se leen los dos juntos:

1. **`DISENO_vacaciones.md` (v1.0)** — sigue siendo la base. La mayoría del diseño (estados, flujo de aprobación, tabs, roles) NO cambia.
2. **Este documento (v1.1)** — describe SOLO las diferencias respecto de v1.0.

Cada sección de este documento indica:
- Qué dice v1.0.
- Qué cambia en v1.1.
- Por qué cambia (referencia a la política oficial).
- Impacto en código que Fede ya haya escrito.

**Antes de aplicar los cambios:** revisá qué partes ya implementaste. Los cambios impactan el modelo de datos, el modal, las validaciones y el cálculo de saldos.

---

## 📋 Origen de los cambios

Después de terminar v1.0, apareció el documento oficial de RRHH:
**"Política de Vacaciones — Coop. de Trabajo Ohlimpia"** (PDF).

Comparando la política escrita con el diseño v1.0, surgieron 10 diferencias. En esta v1.1 aplicamos 7. Las otras 3 quedan **pendientes para v1.2** después de consultarlas con Gabi (ver §CAMBIOS_FUTUROS al final).

**Importante:** en la sesión de diseño de v1.0, Lautaro definió con certeza el flujo de aprobación secuencial con Consejo (mayoría 2/3), pero el PDF oficial menciona solo la firma del Coordinador de Sector. Lautaro confirmó que el flujo real (el que sigue la cooperativa en la práctica) es el del Consejo — la política escrita está desactualizada en este punto. **El flujo de aprobación de v1.0 se mantiene sin cambios.**

---

## 🔧 Cambio 1 — Anticipación mínima obligatoria (15 días)

### Qué decía v1.0
Soft warning si `fecha_desde < now() + 48hs`. No bloqueaba.

Ubicación en v1.0: §10.6 "Validaciones al elevar" y §3.5 "Sin política de anticipación mínima".

### Qué cambia en v1.1
**Bloqueo obligatorio** si `fecha_desde < now() + 15 días`. Al intentar elevar → error visible: "Las solicitudes de vacaciones deben tener mínimo 15 días de anticipación. Este pedido tiene X días. Ajustá la fecha o pedile a RRHH que autorice una excepción."

### Excepción autorizable por RRHH
Al elevar con menos de 15 días, el sistema permite igual **guardar como borrador** pero NO permite elevar. En el borrador queda una marca "Requiere autorización de RRHH por preaviso corto". RRHH desde su bandeja de administración puede autorizar la excepción con un botón "Autorizar preaviso corto + Aceptar solicitud" (con motivo obligatorio de la excepción). En ese caso, el pedido salta a "Pendiente Consejo" directamente.

### Por qué
Política oficial, sección "IMPORTANTE": "No se aceptarán Solicitudes de Vacaciones que sean pedidas con menos de 15 días de preaviso."

### Impacto en código
- Modificar función de validación al elevar.
- Agregar campo booleano `requiere_autorizacion_preaviso_corto` en tabla `vacaciones` (SQL nuevo con `ALTER TABLE`).
- Agregar botón + modal en Tab 1 (Pendientes) para que RRHH autorice la excepción.

### SQL nuevo
Crear `sql/vXXX_vacaciones_preaviso_corto.sql`:

```sql
BEGIN;
ALTER TABLE public.vacaciones
  ADD COLUMN IF NOT EXISTS requiere_autorizacion_preaviso_corto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_excepcion_preaviso text,
  ADD COLUMN IF NOT EXISTS autorizada_excepcion_por text,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion_excepcion timestamptz;
COMMIT;
```

---

## 🔧 Cambio 2 — Fecha desde debe ser lunes

### Qué decía v1.0
`fecha_desde` no puede ser anterior a hoy. Sin restricción de día de la semana.

Ubicación en v1.0: §10.6 "Validaciones al elevar".

### Qué cambia en v1.1
`fecha_desde` **debe ser un día lunes**. Si no lo es, error al elevar: "Las vacaciones deben comenzar un día lunes. Ajustá la fecha."

### Excepción por feriado (TODO por ahora)
Política oficial dice: "en caso de que sea feriado, el siguiente día hábil". Esto requiere catálogo de feriados. **Alcance de esta versión:** por ahora la validación estricta es "debe ser lunes". Cuando exista el catálogo de feriados, se permite martes si el lunes es feriado. Dejar TODO en el código.

### Por qué
Política oficial, FAQ 1: "Los días se cuentan corridos a partir del día lunes. Siempre deben comenzar un día lunes o, en caso de que sea feriado, el siguiente día hábil."

### Impacto en código
Agregar validación en la función de elevar:

```javascript
function esLunes(fecha) {
  return new Date(fecha).getDay() === 1; // 0=domingo, 1=lunes, ..., 6=sábado
}

// En la validación al elevar:
if (!esLunes(pedido.fecha_desde)) {
  throw new Error('Las vacaciones deben comenzar un día lunes.');
}
```

---

## 🔧 Cambio 3 — Fracción mínima de una semana + termina en domingo

### Qué decía v1.0
Sin regla de duración mínima. Un asociado podía pedir 3 días sueltos.

Ubicación en v1.0: §10.6 "Validaciones al elevar".

### Qué cambia en v1.1
**Cada solicitud debe ser mínimo una semana completa** (lunes a domingo). Si `fecha_hasta - fecha_desde + 1 < 7` → error: "Cada período de vacaciones debe ser mínimo una semana completa (lunes a domingo)."

Adicionalmente: **fecha_hasta debe ser un domingo**. Combinado con la regla del Cambio 2 (desde debe ser lunes), esto garantiza semanas completas.

### Ejemplos válidos
- Lunes 12/oct → Domingo 18/oct (7 días). ✅
- Lunes 12/oct → Domingo 25/oct (14 días). ✅
- Lunes 12/oct → Domingo 1/nov (21 días). ✅

### Ejemplos inválidos
- Lunes 12/oct → Viernes 16/oct (5 días). ❌ Menos de 7.
- Lunes 12/oct → Miércoles 21/oct (10 días). ❌ No termina en domingo.
- Martes 13/oct → Domingo 18/oct (6 días). ❌ No empieza lunes.

### Fraccionamiento
Un asociado que tiene 14 días asignados puede tomarse:
- 14 corridos seguidos (1 pedido). ✅
- 7 + 7 (2 pedidos separados). ✅
- 7 + 3 + 4 (3 pedidos). ❌ Los pedidos de 3 y 4 son menores a 7.

### Por qué
Política oficial, FAQ 2: "Sí, se pueden separar en períodos no menores a una semana (de lunes a domingo)."

### Impacto en código
Agregar validaciones:

```javascript
function esDomingo(fecha) {
  return new Date(fecha).getDay() === 0;
}

function diasCorridos(desde, hasta) {
  return Math.floor((new Date(hasta) - new Date(desde)) / (1000*60*60*24)) + 1;
}

// En la validación al elevar:
if (!esDomingo(pedido.fecha_hasta)) {
  throw new Error('Las vacaciones deben terminar un día domingo (semana completa).');
}
if (diasCorridos(pedido.fecha_desde, pedido.fecha_hasta) < 7) {
  throw new Error('Cada período debe ser mínimo una semana (7 días corridos).');
}
```

---

## 🔧 Cambio 4 — Superposición ampliada al sector

### Qué decía v1.0
Aviso al Gerente al aprobar solo si el **jefe directo** del solicitante tiene vacaciones que se superponen.

Ubicación en v1.0: §3.10 "Superposición con jefe directo (soft warning)" y §16.4 "Reemplazante que también pide vacaciones esos días".

### Qué cambia en v1.1
Aviso al Gerente al aprobar si **cualquier persona del mismo sector** (no solo el jefe directo) tiene vacaciones que se superponen.

Es soft warning, no bloqueo. El Gerente decide.

Mostrar en el modal de aprobación del Gerente:

> "⚠️ Superposición detectada en el sector:
> - Fulano Pérez: 12/oct al 25/oct
> - Sultana García: 15/oct al 21/oct
>
> ¿Confirmás la aprobación igual?"

### Por qué
Política oficial, sección "Procedimiento de solicitud": "es de suma importancia coordinar con los y las compañeros/as del sector, para no superponerse, y de esa forma, no afectar el desarrollo de las tareas."

### Impacto en código
Modificar la query de detección de superposición:

```javascript
function buscarSuperposicionesSector(solicitud) {
  const inicio = solicitud.fecha_desde;
  const fin = solicitud.fecha_hasta;
  const sector = solicitud.sector;
  const legajoSolicitante = solicitud.legajo_id_local;
  
  return DB.vacaciones.filter(v =>
    v.sector === sector &&
    v.legajo_id_local !== legajoSolicitante &&
    (v.estado === 'Aprobada' || v.estado.startsWith('Pendiente')) &&
    !v.anulado &&
    !(v.fecha_hasta < inicio || v.fecha_desde > fin)
  );
}
```

El campo `jefe_directo_legajo_id_local` del legajo **se sigue usando** pero para otra cosa (por ejemplo, un realce visual en el aviso "atención: el jefe directo Fulano está entre los superpuestos"). No es la fuente principal de detección.

---

## 🔧 Cambio 5 — Cálculo automático de días por antigüedad

### Qué decía v1.0
Los días asignados por año se guardan **manualmente** en el legajo (`dias_vacaciones_anuales`) cargado por RRHH.

Ubicación en v1.0: §3.6 "Días asignados manuales por asociado" y §3.17 "Nuevos campos en el legajo administrativo".

### Qué cambia en v1.1
Los días asignados se calculan **automáticamente** por antigüedad al 31/12 del año en curso, usando la escala oficial:

| Antigüedad al 31/12 | Días asignados |
|---|---|
| Hasta 5 años | 14 |
| 5 a 10 años | 21 |
| 10 a 20 años | 28 |
| Más de 20 años | 35 |
| Menos de 6 meses trabajados | 1 día por cada 20 días trabajados (prorrateo) |

### El campo del legajo queda como override opcional
El campo `dias_vacaciones_anuales` en el legajo NO se elimina. Cambia su semántica:
- Si `dias_vacaciones_anuales > 0` → **override manual** que usa RRHH para casos excepcionales. Se usa este valor.
- Si `dias_vacaciones_anuales = 0` o null → cálculo automático por antigüedad.

Esto permite que la mayoría de asociados tengan cálculo automático, pero Gabi puede ajustar casos especiales (por ejemplo, un asociado que negoció más días como beneficio).

### Función de cálculo

```javascript
function calcularDiasAsignadosPorAntiguedad(legajo, fechaReferencia = new Date()) {
  // Override manual tiene prioridad
  if (legajo.dias_vacaciones_anuales && legajo.dias_vacaciones_anuales > 0) {
    return legajo.dias_vacaciones_anuales;
  }
  
  // Calcular antigüedad al 31/12 del año de referencia
  const finDeAnio = new Date(fechaReferencia.getFullYear(), 11, 31);
  const fechaIngreso = new Date(legajo.fecha_ingreso);
  const anosCompletos = (finDeAnio - fechaIngreso) / (1000*60*60*24*365.25);
  
  // Caso especial: menos de 6 meses trabajados
  if (anosCompletos < 0.5) {
    const diasTrabajados = (finDeAnio - fechaIngreso) / (1000*60*60*24);
    return Math.floor(diasTrabajados / 20);
  }
  
  // Escala oficial
  if (anosCompletos <= 5) return 14;
  if (anosCompletos <= 10) return 21;
  if (anosCompletos <= 20) return 28;
  return 35;
}
```

### Por qué
Política oficial, sección "Los plazos serán otorgados de acuerdo a la antigüedad (computada al 31/12 del año en curso)": escala oficial 14/21/28/35 días + prorrateo para menos de 6 meses.

### Impacto en código
- Modificar el módulo Legajos: el campo `dias_vacaciones_anuales` cambia su UI a "Override (opcional)" con explicación "Dejar en 0 para cálculo automático por antigüedad".
- Modificar todas las funciones que leen días asignados (modal de solicitud, Tab 3 Panorama de saldos, validaciones) para usar `calcularDiasAsignadosPorAntiguedad()` en vez de `legajo.dias_vacaciones_anuales`.
- Agregar la función a `src/modules/vacaciones/saldo.js`.

### Impacto en UI
En el Tab 3 (Panorama de saldos), agregar columna "Origen" que diga:
- "Automático (antigüedad)" si el cálculo salió de la escala.
- "Manual" si viene del override del legajo.

En el modal de solicitud, mostrar en la sección "Solicitante":
- "Días asignados este año: 21 días (por antigüedad de 7 años)".
- Si hay override: "Días asignados este año: 30 días (asignados manualmente por RRHH)".

---

## 🔧 Cambio 6 — Ventana anual: 1 de octubre al 30 de septiembre

### Qué decía v1.0
El "año" para el cálculo de saldos era el año calendario (enero a diciembre).

Ubicación en v1.0: §11.4 "Actualización de saldo automático" y §16.5 "Solicitud con fechas del año siguiente".

### Qué cambia en v1.1
El "período de vacaciones" va del **1 de octubre del año X al 30 de septiembre del año X+1**.

Ejemplos:
- Período 2026: del 1/oct/2026 al 30/sep/2027.
- Período 2027: del 1/oct/2027 al 30/sep/2028.

### Antigüedad para calcular los días asignados del período
El período que arranca el 1/oct/año X usa la **antigüedad calculada al 31/12/año X** (aunque los meses de octubre y noviembre del año X sean anteriores a esa fecha).

Ejemplo: Juan tiene fecha de ingreso 1/mar/2018. Al 31/12/2026 tendrá 8 años y 10 meses de antigüedad. Los días del período que empieza 1/oct/2026 son 21 (según escala 5-10 años). Vale para todo el período (oct/2026 a sep/2027).

### Función para saber a qué período pertenece una fecha

```javascript
function periodoDeFecha(fecha) {
  const d = new Date(fecha);
  const mes = d.getMonth(); // 0=enero, 9=octubre
  const anio = d.getFullYear();
  
  // Si el mes es octubre (9), noviembre (10) o diciembre (11) → período = año actual
  // Si el mes es enero (0) a septiembre (8) → período = año anterior
  return (mes >= 9) ? anio : anio - 1;
}

// Ejemplo:
// periodoDeFecha('2027-03-15') → 2026 (marzo 2027 pertenece al período que arrancó en oct/2026)
// periodoDeFecha('2026-11-10') → 2026 (noviembre 2026 pertenece al período que arrancó en oct/2026)
```

### Función para calcular el saldo actual

```javascript
function calcularSaldoDisponible(legajo, fechaReferencia = new Date()) {
  const periodoActual = periodoDeFecha(fechaReferencia);
  const finDeAnio = new Date(periodoActual, 11, 31); // 31/12 del año que arrancó el período
  
  const diasAsignados = calcularDiasAsignadosPorAntiguedad(legajo, finDeAnio);
  
  // Sumar días ya tomados en el período actual
  const inicioperiodo = new Date(periodoActual, 9, 1);       // 1/oct año X
  const finDelPeriodo = new Date(periodoActual + 1, 8, 30);  // 30/sep año X+1
  
  const vacacionesTomadas = DB.vacaciones.filter(v =>
    v.legajo_id_local === legajo.id_local &&
    v.estado === 'Aprobada' &&
    !v.anulado &&
    v.fecha_desde >= inicioperiodo &&
    v.fecha_desde <= finDelPeriodo
  );
  
  const diasTomados = vacacionesTomadas.reduce((acc, v) => acc + v.dias_solicitados, 0);
  
  return diasAsignados - diasTomados;
  // NOTA: aún NO incluye días pendientes de períodos anteriores.
  //       Esa lógica se implementa en el Cambio Pendiente 1 (regla del tercio + caducidad).
}
```

### Por qué
Política oficial: "El periodo de Vacaciones será otorgado entre el 1 de octubre del año en curso y el 30 de septiembre del año siguiente."

### Impacto en código
Este es **el cambio más costoso** para Fede en este delta. Impacta:

1. **Función de cálculo del saldo** — refactor completo (ver arriba).
2. **Tab 3 (Panorama de saldos)** — la columna "Año" cambia a "Período" y muestra "oct/2026 - sep/2027" en vez de "2026".
3. **Modal de nueva solicitud** — al mostrar "Días disponibles del año X", cambiar el label a "Días disponibles del período oct/AAAA - sep/AAAA".
4. **Cualquier query que agrupa por año** — usar la función `periodoDeFecha()` para agrupar por período.
5. **Validación al elevar** — al pedir vacaciones para una fecha, calcular el saldo del período que corresponde a esa fecha.

### Impacto en UI (Tab 3)
Cambiar los labels:
- "Días asignados año 2026" → "Días asignados período 2026 (oct/26 - sep/27)".
- "Días ya tomados en el año" → "Días ya tomados en el período".
- "Días disponibles" → "Días disponibles en el período actual".

Agregar botón "Ver otro período" que permite consultar el saldo de períodos pasados o futuros.

---

## 🔧 Cambio 7 — Aviso proactivo a asociados sobre su saldo

### Qué decía v1.0
No existía esta feature.

### Qué cambia en v1.1
Nueva funcionalidad: RRHH puede generar comunicaciones automáticas informando a cada asociado sus días disponibles del período actual + pendientes del anterior.

### Ubicación en la UI
Dentro del módulo Vacaciones, botón "📢 Comunicar saldos" visible para RRHH y Administrador total.

Al apretar el botón:
1. Modal de configuración: seleccionar período (default: actual).
2. Preview de la lista de asociados con su saldo calculado.
3. Botón "Enviar comunicaciones".

Al confirmar:
- Se genera 1 notificación en `notificaciones_sistema` por cada asociado del sector administrativo.
- Tipo: `vacacion_saldo_anual`.
- Mensaje: "Tu saldo de vacaciones del período oct/2026 - sep/2027 es de X días. Días pendientes de períodos anteriores: Y días (vencen el DD/MM/YYYY)."
- Cuando WhatsApp esté destrabado, se envía también por ese canal.

### Función

```javascript
function generarComunicacionesSaldo(periodo) {
  const administrativosActivos = DB.legajos.filter(l =>
    l.sector_tipo === 'Administrativo' &&
    l.estado === 'Activo' &&
    !l.anulado
  );
  
  administrativosActivos.forEach(legajo => {
    const saldo = calcularSaldoDisponible(legajo, new Date(periodo, 9, 1));
    // TODO en Cambio Pendiente 1: sumar días pendientes de períodos anteriores
    
    crearNotificacion({
      destinatario_rol: 'Individual',
      destinatario_id: legajo.id_local,
      tipo: 'vacacion_saldo_anual',
      titulo: `Tu saldo de vacaciones del período ${periodo}`,
      mensaje: `Tenés ${saldo} días disponibles del período oct/${periodo} - sep/${periodo+1}.`,
      enlace_ruta: '/vacaciones/panorama'
    });
  });
  
  toast(`✅ Se generaron ${administrativosActivos.length} comunicaciones.`);
}
```

### Por qué
Política oficial: "A cada persona le será enviado un formulario informando la cantidad de días disponibles pertenecientes al periodo actual, y pendientes, en caso de no haber gozado las pertenecientes a años anteriores."

### Impacto en código
- Agregar función `generarComunicacionesSaldo()` en `src/modules/vacaciones/saldo.js`.
- Agregar botón "📢 Comunicar saldos" en el header del módulo Vacaciones.
- Agregar tipo `vacacion_saldo_anual` en la lista de notificaciones.

---

## 📋 Cambios que quedan PENDIENTES para v1.2

Los siguientes cambios NO se aplican en esta v1.1. Requieren consulta con Gabi antes de implementarse.

### Cambio Pendiente 1 — Regla del tercio + caducidad de días pendientes

**Qué dice la política oficial:**
"En caso de dejar días pendientes de usufructo, los mismos no podrán ser mayores a un tercio de los correspondientes y caducarán a los dos años."

**Preguntas para Gabi:**
1. ¿La regla del tercio se aplica hoy en la práctica? Ejemplo: si Juan tiene 21 días asignados en el período 2026 y solo se toma 7, ¿los 14 restantes que quedaron pendientes se limitan a 7 (el tercio) o pasan los 14 al período 2027?
2. ¿La caducidad a los 2 años se controla hoy? ¿O los días pendientes se acumulan indefinidamente?
3. ¿Qué hacen hoy con días pendientes acumulados de asociados que llevan varios años sin tomarse todo?

**Impacto de este cambio (cuando se aplique):**
- Modelo de datos: agregar tabla `saldos_vacaciones_por_periodo` que trackee días asignados, tomados, pendientes y caducidad por asociado y período.
- Cálculo de saldo: incluir días pendientes de períodos anteriores en el saldo disponible.
- Validaciones al cerrar el período: aplicar tope del tercio.
- Notificaciones proactivas: avisar a asociados que van a perder días por caducidad.
- Tab 3 (Panorama de saldos): agregar columnas "Días pendientes de períodos anteriores" y "Fecha de caducidad".

**Estimación:** aproximadamente igual al esfuerzo de este delta v1.1.

---

## ✅ Resumen ejecutivo para Fede

Los cambios de v1.1 se ordenan por complejidad de implementación:

### Cambios simples (validaciones puntuales)
- **Cambio 1** — Bloqueo por 15 días de anticipación.
- **Cambio 2** — Debe empezar un lunes.
- **Cambio 3** — Mínimo una semana, termina en domingo.
- **Cambio 4** — Superposición ampliada al sector.

**Estimación:** 4-8 horas.

### Cambios medianos (features nuevas)
- **Cambio 5** — Cálculo automático por antigüedad.
- **Cambio 7** — Aviso proactivo de saldos.

**Estimación:** 8-16 horas.

### Cambio costoso (refactor arquitectural)
- **Cambio 6** — Ventana anual oct-sep (impacta cálculos, queries, UI).

**Estimación:** 12-24 horas.

**Total de v1.1:** 24-48 horas de trabajo para Fede.

**Además:** habrá un delta v1.2 después de consultar con Gabi sobre el histórico y caducidad de días pendientes. Ese delta puede requerir refactor del modelo de datos.

---

## 🎯 Recomendación de orden

Sugiero implementar en este orden:

1. **Primero los cambios simples (1-4)** — dan valor inmediato y son fáciles.
2. **Después Cambio 5** — el override manual permite compatibilidad con lo que ya funciona.
3. **Después Cambio 6** — el más grande. Lautaro debe estar disponible para consultas durante este cambio.
4. **Por último Cambio 7** — depende del Cambio 6 para calcular saldos correctos.

Al terminar v1.1, pausar y consultar con Gabi por el Cambio Pendiente 1 antes de arrancar v1.2.

---

## Cierre

Este delta corrige las diferencias entre el diseño v1.0 y la política oficial de RRHH. Con estos cambios, el módulo refleja fielmente la política escrita en todo lo que no depende del histórico de saldos.

**El módulo Vacaciones NO queda cerrado con este delta.** Queda pendiente la implementación de saldos históricos con regla del tercio y caducidad (Cambio Pendiente 1), que requiere consulta previa con Gabi y probablemente un delta v1.2 similar en magnitud a este.

Ante cualquier duda: preguntar antes de codear (política A.4).

**¡Buenas vacaciones!** 🏖️

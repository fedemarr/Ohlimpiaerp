# DELTA — Gestión de Precios v1

**Fecha:** 30 de julio de 2026
**Autor:** Lautaro (con Claude web)
**Destinatario:** Fede
**Estado:** Cerrado, listo para implementar
**Relacionado:** `DELTA_comercial_mejoras_v1.2.md` (2.3, Gestión de Precios), `DELTA_servicios_ajustes.md` (tres modelos de precio)

---

## Estado actual (diagnóstico)

La pantalla está **más avanzada de lo esperado**. Ya funcionan: el circuito de doble aprobación (cliente + gerente) reflejado en la tabla, los tres niveles de propuesta, el historial de precios, y la proyección financiera mes a mes. Lo que sigue son correcciones y mejoras.

### Bugs confirmados (venían del delta v1.2, siguen pendientes)
- **B.1 (era 3.3):** el % de aumento no muestra el símbolo "%" (si se pone 5, queda "5" en vez de "5%").
- **B.2 (era 3.2):** valor propuesto fantasma — al cargar un aumento y luego borrarlo, el valor calculado abajo queda en pantalla en vez de desaparecer.
- **B.3 (era 3.6):** en el tab **Proyección financiera**, la columna "OBJETIVO" muestra **importes** en lugar de los nombres de los servicios. Debe mostrar el nombre del servicio. Además, con la unificación de vocabulario, la columna debe llamarse **"SERVICIO"**.

---

## 1 — Circuito de aprobación: cambiar a Secuencia A

**El sistema hoy hace Secuencia B** (se acuerda con el cliente y después el gerente confirma). **Cambiar a Secuencia A:** el gerente autoriza ANTES de ir al cliente.

**Ciclo de vida completo de una propuesta:**
1. **Carga de la propuesta** → estado *Pendiente de autorización del gerente*. (NO va el "¿cliente ya aprobó?" acá — el cliente todavía no entró.)
2. **Gerente (1ª intervención) autoriza la salida:**
   - Rechaza con motivo → rechazada internamente, no sale al cliente. Se puede rearmar.
   - Autoriza → *Autorizada, lista para enviar al cliente*.
3. **Se envía la carta al cliente** (con la propuesta ya avalada).
4. **El cliente responde:**
   - Acepta → **Gerente (2ª intervención) confirma el cierre** → precio *Vigente*, impacta facturación desde la fecha de vigencia.
   - Rechaza con motivo → queda registrado, propuesta dada de baja, se puede abrir **nueva ronda con aumento más bajo** (sin pisar la anterior).

> El gerente interviene **dos veces**: autoriza la salida (paso 2) y confirma el cierre (paso 4).
> **Cambio de fondo:** quitar "¿cliente ya aprobó?" del momento de carga; agregar la autorización previa del gerente. Este reordenamiento del flujo central puede inclinar la decisión de **rehacer vs modificar** (A.11) hacia rehacer.

---

## 2 — Los tres niveles de propuesta: renombrar

Los nombres "Teórica / Comercial / Acordada" son confusos. Renombrar según el **origen** de cada aumento:
- **Por paritaria** — surge del convenio, automático (cuánto subió el costo).
- **Propuesta de Ohlimpia** — lo que la empresa decide ofrecer al cliente.
- **Ya acordado con el cliente** — número cerrado de antemano.

Cada nombre indica quién define el número. La propuesta que se envía al gerente es la "Ya acordado" (si existe) o la "Propuesta de Ohlimpia".

---

## 3 — Aumento según el modelo de precio (verificado, mantener)

El aumento respeta el modelo del servicio (los tres modelos de `DELTA_servicios_ajustes.md`):
- **Por EFT / Por horas variables:** el % aplica sobre el **valor hora**, y se recalcula el mensual. (Verificado: Chango $7.083 → $7.225.)
- **Abono mensual fijo:** el % aplica directo sobre el **monto mensual** (no hay valor hora). (Verificado: Hospital Alemán $1.200.000 +5% = $1.260.000.)

Falta solo confirmar "horas variables" (debe comportarse como EFT).

---

## 4 — Aumento escalonado (cronograma de tramos)

Un aumento puede aplicarse **escalonado**: repartido en varios tramos en el tiempo. Es **totalmente variable** (cantidad de tramos, % de cada uno, fechas).

- **Es UNA propuesta (un acuerdo) con varios tramos adentro** — se aprueba una sola vez.
- **Cada tramo:** fecha de vigencia + %.
- **Cálculo sobre el precio ORIGINAL** (no acumulativo): la suma de los tramos = el total pactado (10% = 5% + 5%, ambos sobre el precio de partida). Sin el "escape" del interés compuesto.
- **Carga (Forma A):** se carga el aumento **total** y se **reparte** en tramos. El sistema **valida que los tramos sumen el total** (si no cierra, avisa). Un aumento no escalonado = cronograma de un solo tramo (mismo mecanismo).
- **Entrada en vigencia:** una vez aprobado el paquete, los tramos **entran solos** en su fecha, sin confirmación manual ni aviso. Cada tramo es una vigencia nueva (historización, no se pisa). El precio de cada mes se calcula según el tramo vigente (no se guarda mes por mes).

---

## 5 — Rebaja de precio (NUEVO — era un hueco)

El circuito de "modificación de precio" debe aceptar también **rebajas**, no solo aumentos.

- Usa el **mismo circuito** (propuesta → aprobación → cliente → vigencia) y el mismo mecanismo de **tramos** (una rebaja puede ser de una vez o escalonada).
- **Campo previo "Tipo de modificación: Aumento / Rebaja".** El porcentaje se carga siempre en **positivo**; la dirección la da este campo (no un signo negativo). Menos errores, historial más legible.
- Al elegir **Rebaja**, se activan automáticamente **reglas extra** (porque resigna ingresos):
  - **Motivo obligatorio** (no se puede cargar sin justificar).
  - **Aprobación del gerente sin excepción** (ninguna rebaja entra sin OK explícito).

> La ventana ya se llama "Propuesta de modificación de precio" (no "aumento"), lo cual encaja.

---

## 6 — Carga y aprobación por lote (varios servicios de un cliente)

Las propuestas son **por servicio** (la ventana elige un objetivo puntual). Como un cliente suele tener varios servicios con el **mismo aumento y alguna excepción**, agregar **carga masiva**:

- Elegir el **cliente** → el sistema lista **todos sus servicios** con su precio actual.
- Aplicar un **aumento general a todos** → **ajustar individualmente las excepciones** → guardar (genera una propuesta por servicio).
- Por debajo siguen siendo propuestas individuales por servicio.
- **Aprobación:** el gerente puede **aprobar el lote completo de una vez**, con opción de **rechazar alguna puntual** antes de aprobar el resto.

---

## 7 — Mejoras al tab Proyección financiera

1. **Ver en valor hora o en monto:** opción en el configurador para cambiar la unidad de la grilla. Para abono fijo, mostrar el valor hora de **referencia** (mensual ÷ horas). Coherente con la hora como unidad del sistema.
2. **Reflejar aumentos escalonados:** cada tramo como un salto en su mes de vigencia. (La grilla ya muestra saltos de precio en fechas; extender a varios tramos.)
3. **Reflejar rebajas:** igual que aumentos pero hacia abajo, incluidas rebajas escalonadas.
4. **Aumento adicional proyectado escalonable:** el campo de simulación "% aumento adicional proyectado" debe permitir escalonarlo (y simular rebaja), con la misma flexibilidad que las propuestas reales.
5. **Vista por cliente/servicio:** permitir ver la proyección agrupada por **cliente** (todos sus servicios) o por **servicio** individual, ya que los aumentos pueden variar entre servicios del mismo cliente.

> Mantener el aviso actual de que las propuestas pendientes se muestran pero no son definitivas hasta la aprobación del gerente — respeta el circuito.

---

## Resumen de lo que Fede debe implementar
1. Corregir bugs B.1 (símbolo %), B.2 (valor fantasma), B.3 (columna Objetivo→Servicio con nombres).
2. Reordenar el circuito a **Secuencia A** (gerente autoriza antes del cliente; dos intervenciones).
3. Renombrar los tres niveles de propuesta.
4. Implementar **escalonamiento** (tramos con fecha+%, sobre el original, validación de suma, entran solos).
5. Implementar **rebaja** (campo tipo modificación, motivo obligatorio, aprobación gerente sí o sí, escalonable).
6. **Carga y aprobación por lote** por cliente.
7. Mejoras a la **proyección** (valor hora, tramos, rebajas, simulación escalonable, vista por cliente).

## Decisión abierta (A.11)
Con el reordenamiento del circuito + escalonamiento + rebaja + lote, esta pantalla recibe cambios de fondo. Sigue vigente la decisión de que **Fede evalúe rehacer vs modificar** con su cuadro (tiempo/riesgo/calidad) antes de tocarla, y lo traiga para decidir.

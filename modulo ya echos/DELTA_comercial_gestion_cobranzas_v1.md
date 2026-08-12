# DELTA — Cobros / Gestión de Cobranzas v1

**Versión:** 1
**Fecha:** 30 de julio de 2026
**Autor del diseño:** Lautaro (con asistencia de Claude web)
**Destinatario:** Fede (implementación)
**Estado:** Cerrado
**Relacionado:** `DELTA_comercial_cobros_tango_v2.md` (importación), `DELTA_comercial_mejoras_v1.2.md` (2.6, circuito Cobros)

---

## Principio rector: la cobranza se piensa CENTRADA EN EL CLIENTE, no en la factura suelta

Este es el hilo conductor de todos los cambios de este documento. La gestora no cobra "facturas", cobra a "clientes": llama a un cliente y habla de todo lo que debe. El sistema debe reflejar eso. Las tres decisiones de abajo se desprenden de este único principio.

---

## 1 — Facturas pendientes: dos niveles (saldo por cliente + facturas)

Ya definido en el delta Tango v2 (C.5), se refuerza acá. La pantalla actual muestra directamente la lista de facturas (segundo nivel), correcta pero incompleta. Falta **envolverla con el primer nivel: agrupar por cliente mostrando el saldo total**, y al abrir un cliente, se despliega la lista de facturas que ya existe.

> No hay que rehacer la lista actual, solo agregarle el agrupamiento por cliente por encima.

**Verificación:** la columna "Importe" de cada factura debe mostrar el **saldo remanente** (lo que falta cobrar), no el importe original — clave cuando haya pagos parciales (ver delta Tango v2, C.7).

---

## 2 — La gestión se registra a NIVEL CLIENTE (con marca opcional de facturas)

**Problema detectado:** hoy la ventana de gestión está a nivel factura. Si un cliente tiene 10 facturas pendientes (una por servicio) y la gestora hace una sola llamada por todas, tendría que escribir la misma gestión 10 veces. Absurdo.

**Solución:** la gestión (llamada, mail, etc.) se registra **a nivel cliente**. Una gestión refleja una conversación con el cliente y, por defecto, aplica a **todas** sus facturas pendientes.

- Opcionalmente, la gestora puede **marcar a qué facturas específicas aplica** (para el caso menos común de que la conversación sea solo sobre algunas). Es una **lista simple de checkboxes** — solo marca de alcance, sin otras acciones sobre las facturas desde ahí.
- El historial de gestiones vive a nivel cliente.

---

## 3 — Ventana de gestión rediseñada (a nivel cliente)

La ventana "Gestiones de cobro" pasa de nivel factura a **nivel cliente**:

- **Encabezado:** nombre del cliente, **saldo total pendiente**, contacto de cobro, y la lista de sus facturas pendientes (cada una con su saldo remanente).
- **Historial de gestiones** del cliente (todas las conversaciones con ese cliente).
- **Formulario de nueva gestión:**
  - Tipo (llamada, mail, etc.)
  - **Fecha de la gestión** (cuándo se hizo el contacto)
  - **Fecha límite / próxima gestión** (hasta cuándo se espera respuesta o cuándo volver a contactar; si vence sin cumplirse → estado Vencida + alerta)
  - Estado (ver ciclo de vida abajo)
  - Resultado (texto)
  - **Checkboxes de facturas** a las que aplica la gestión (default: todas)

> **Cambio respecto de lo actual:** el título deja de ser una factura (FA-0001-00045231) y pasa a ser el cliente (ej: "Gestiones de cobro — Chango Mas").

---

## 4 — Gestión con CICLO DE VIDA (Pendiente → Realizada / Vencida)

**Problema detectado:** hoy el formulario registra la gestión en un solo paso (nace con su resultado). Pero una gestión planificada a futuro no tiene resultado todavía, y cuando llega el día de ejecutarla, **no hay forma de volver a ella para registrar la respuesta del cliente**. Vacío real.

**Solución:** una gestión es un objeto con estados, no un registro de un solo paso.

- **Nace Realizada:** la gestora registra algo que ya hizo (con resultado escrito de una). Nace y se cierra en el momento.
- **Nace Pendiente:** planifica a futuro ("llamar el día 5"), con fecha límite, sin resultado todavía. Queda agendada.
- **Pendiente → Realizada:** la gestora **reabre** la gestión pendiente cuando la ejecuta, le agrega el resultado y la cierra.
- **Pendiente → Vencida:** si pasa la fecha límite sin cumplirse, el sistema la marca Vencida + alerta. Puede retomarse y completarse después.

> **[PUNTO CLAVE — Fede]** Una gestión Pendiente debe poder **reabrirse y completarse** con el resultado. Hoy el formulario no lo permite (registra en un solo paso) — ese es el vacío a corregir. El resultado se agrega al ejecutar, no solo al crear.

La columna "Próxima gestión" del tab principal se alimenta de las gestiones Pendientes con su fecha límite.

---

## PENDIENTE para próxima sesión de Cobros
- **Funciones IA** (probabilidad de cobro 85%/60%, Proyección IA, Agente IA): agregadas fuera del diseño acordado. Revisar de dónde sale cada número y si conviene mantenerlas. No tocar por ahora; foco en el circuito base.
- Diagnóstico fino de la pantalla de la gestora (resto de columnas y filtros).
- Notas de crédito/débito y comprobantes "a cuenta" en la vista de detalle (del delta Tango v2).

---

## Estado general del área Cobros tras esta sesión
- **Importación de Tango:** modelo cerrado y validado con datos reales (`DELTA_comercial_cobros_tango_v2.md`).
- **Gestión de cobranzas:** rediseñada centrada en el cliente (este documento).
- **Falta:** implementar el agrupamiento por cliente, el ciclo de vida de gestiones, y revisar las funciones IA.

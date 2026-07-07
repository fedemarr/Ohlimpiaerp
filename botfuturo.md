# Bot de WhatsApp — Registro para la implementación futura

## Qué es este archivo

Registro acumulativo de todo lo que el futuro bot de WhatsApp va a
necesitar cubrir, módulo por módulo, a medida que se van construyendo.

**Decisión de alcance (Lautaro):** el bot de WhatsApp se hace **uno solo,
al final, cuando estén todos los módulos migrados** — no integraciones
sueltas por módulo a medida que se avanza. Este archivo existe para no
perder esa información en el camino: cada vez que un módulo migrado
define una notificación, un flujo de aviso, o cualquier interacción que
en el futuro debería salir por WhatsApp, se anota acá con su contexto,
para que cuando llegue el momento de construir el bot esté todo
relevado en un solo lugar en vez de tener que releer todo el código de
nuevo.

**Bloqueante actual:** Meta Business API todavía no está destrabada —
nada de esto es ejecutable hoy, es solo relevamiento.

---

## Módulo: Vacaciones (sector administrativo)

Ver `DISENO_vacaciones.md` §11.2 y `src/modules/vacaciones/aprobacion.js`
/ `anulacion.js` / `vacaciones.js` — cada transición del flujo ya genera
una notificación interna (campana del sistema, `notificaciones_sistema`,
`src/shared/notificaciones.js`). Cuando se construya el bot, estos son
los mismos eventos que deberían disparar un mensaje de WhatsApp:

| Transición | A quién avisar | Tipo (mismo que usa la campana) |
|---|---|---|
| Elevada (Borrador → Pendiente Gerente) | Gerente del sector | `vacacion_solicitada` |
| Gerente aprueba (→ Pendiente Consejo) | 3 miembros del Consejo + solicitante | `vacacion_a_consejo` |
| Gerente rechaza | Solicitante | `vacacion_rechazada_gerente` |
| Consejo alcanza mayoría "aprobar" (→ Aprobada) | Solicitante + reemplazante + Gerente | `vacacion_aprobada` |
| Consejo alcanza mayoría "rechazar" | Solicitante + Gerente | `vacacion_rechazada_consejo` |
| Solicitante pide anulación (vacación ya aprobada) | 3 miembros del Consejo | `vacacion_anulacion_solicitada` |
| Consejo aprueba la anulación | Solicitante + reemplazante + Gerente | `vacacion_anulada` |
| Consejo rechaza la anulación | Solicitante | `vacacion_anulacion_rechazada` |
| Solicitante anula (Borrador/Pendiente Gerente) | Gerente (si aplica) | `vacacion_anulada_solicitante` |
| Gerente anula a pedido del solicitante | Solicitante | `vacacion_anulada_gerente` |

**Nota técnica para cuando se implemente el bot:** el destinatario hoy
se resuelve por `destinatario_nombre` (texto), no por un id de usuario o
un teléfono — falta mapear nombre → número de WhatsApp de cada persona
cuando llegue el momento (probablemente desde una tabla de contactos o
desde el legajo, todavía no existe ese campo).

---

## Módulo: Descansos (sector operativo)

Ver `DISENO_descansos.md` §10.2 y `src/modules/descansos/aprobacion.js`
/ `anulacion.js` / `descansos.js`. Mismo mecanismo que Vacaciones
(`crearNotificacion()`, campana del sistema) — dos niveles de
aprobación unipersonales (Operaciones → RRHH) en vez de Gerente →
Consejo:

| Transición | A quién avisar | Tipo (mismo que usa la campana) |
|---|---|---|
| Elevado (Borrador → Pendiente Operaciones) | Gerente de Operaciones | `descanso_solicitado` |
| Operaciones aprueba (→ Pendiente RRHH) | Gerente de RRHH + supervisor solicitante | `descanso_a_rrhh` |
| Operaciones rechaza | Supervisor solicitante | `descanso_rechazado_operaciones` |
| RRHH aprueba (→ Aprobado) | Supervisor solicitante + operario | `descanso_aprobado` |
| RRHH rechaza | Supervisor solicitante | `descanso_rechazado_rrhh` |
| Supervisor anula | Gerente de Operaciones y/o RRHH (según en qué etapa estaba) | `descanso_anulado_supervisor` |
| Gerente anula post-aprobación | Supervisor solicitante + operario | `descanso_anulado_post_aprobacion` |

**Mismo pendiente técnico que Vacaciones:** el operario en general NO
es un usuario logueado del sistema (es personal operativo sin cuenta),
así que hoy esas notificaciones "al operario" quedan en la tabla pero
nadie las ve en la campana — es exactamente el caso de uso real para
el bot de WhatsApp (notificar a alguien que no tiene sesión en el ERP).

---

## Módulos pendientes de relevar

Se van a ir agregando acá a medida que se migren:
Reportes y sugerencias (campanita de avisos ya existe, sin WhatsApp),
Reasignaciones, Sanciones, Enfermos y accidentes, Situaciones legales,
Pedidos de adelantos, y cualquier otro módulo que dispare
notificaciones internas.

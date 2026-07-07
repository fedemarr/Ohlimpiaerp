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

## Módulos pendientes de relevar

Se van a ir agregando acá a medida que se migren:
Reportes y sugerencias (campanita de avisos ya existe, sin WhatsApp),
Reasignaciones, Sanciones, Enfermos y accidentes, Situaciones legales,
Pedidos de adelantos, Descansos (operativo), y cualquier otro módulo
que dispare notificaciones internas.

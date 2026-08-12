# DELTA — CRM Comercial v1 (flujo de leads y cambio de etapa)

**Fecha:** 30 de julio de 2026
**Autor:** Lautaro (con Claude web)
**Destinatario:** Fede
**Estado:** Cerrado, listo para implementar
**Relacionado:** `DELTA_comercial_mejoras_v1.2.md` (2.4, CRM y auto-create), `DELTA_comercial_diagnostico_v1.3.md` (1.1, puerta única de clientes)

---

## Estado actual (diagnóstico)

El CRM está bastante avanzado. Funcionan bien: Lista de leads, tab Acciones (con estados Realizada/Pendiente y ciclo de vida), Estadísticas (leads por etapa/responsable/tipo, tasa de conversión), y la ventana "Nuevo lead".

**BUG pendiente (P.8, ya documentado en v1.2):** el **Pipeline** muestra HTML crudo dentro de las tarjetas (`style="background..."`, `ondragstart="dragLead(event,N)"`) en lugar del nombre del lead. **Confirmado que es un bug del pipeline, NO de los datos**: los mismos leads se ven perfectos en la Lista de leads. Fede debe revisar el código que arma las tarjetas del pipeline (escape de HTML / renderizado). Prioritario.

---

## 1 — Cambio de etapa SIEMPRE abre ventana de info

Hoy avanzar un lead de etapa es "mudo" (se mueve la tarjeta sin registrar nada), por eso el historial de acciones queda vacío. Nuevo comportamiento:

**Avanzar un lead de etapa (arrastrando en el pipeline O con el botón en la Lista) SIEMPRE abre una ventana** que pide la info de esa etapa. No hay avance sin registro.

La info cargada:
- Genera una **acción** que queda en el historial del lead (y en el tab Acciones).
- Deja agendada la **próxima acción programada** (tipo, fecha, fecha límite/vencimiento, responsable) — mismo patrón que la ventana "Nuevo lead" y que la gestión de cobranzas.

> Es un poco más de fricción, pero garantiza trazabilidad completa: cada avance deja su rastro y el historial cuenta la historia real del lead.

---

## 2 — Campos por etapa (ventana de cambio de etapa)

Cada etapa pide campos **estructurados** (para estadística) + **observación** (texto libre) + la **próxima acción programada**. Los campos propios de cada una:

| Etapa (al llegar) | Campos propios |
|---|---|
| **Primer contacto** | Fecha del contacto + interlocutor (con quién se habló) |
| **Propuesta enviada** | Valor propuesto + fecha de envío |
| **Negociación** | Valor ofrecido + contraoferta del cliente |
| **Contrato** (ganado) | Fecha de cierre (dispara creación de cliente, ver punto 4) |
| **Cerrado perdido** | Motivo de pérdida (parametrizable: precio, eligió competencia, sin personal, no respondió, etc.) |

> "Prospecto" no lleva ventana de cambio: es donde nace el lead. El origen se carga al crearlo (ya funciona: "Referido", "Manual", etc.).
> Los motivos y orígenes parametrizables salen del pizarrón central de Configuración.

---

## 3 — Registrar un lead directo en etapa avanzada (con historia retroactiva)

El campo "Etapa" en Nuevo lead permite crear un lead directamente en una etapa avanzada. **Caso de uso:** el lead ya avanzó en la vida real (ya hubo reunión, propuesta, etc.) antes de cargarse en el sistema.

Al elegir una etapa avanzada, el sistema **ofrece completar opcionalmente** la info de las etapas anteriores (sus campos estructurados), para reconstruir la historia:
- **Opcional y ágil:** se cargan las etapas de las que se tenga datos, se saltan las demás.
- Lo completado queda en el historial de acciones como registro retroactivo; lo no completado queda vacío.
- **No se obliga** a llenar todo para poder guardar.

---

## 4 — Ganar el lead → creación del cliente (enfoque híbrido)

Al pasar un lead a **Contrato (ganado)**, se dispara el auto-create del cliente en **borrador** (puerta única, delta v1.3 punto 1.1). Como a veces la misma persona gana y da de alta, y a veces son personas distintas, el enfoque es **híbrido**:

El sistema avisa explícitamente que se crea el cliente en borrador y ofrece dos caminos:
- **Completar ahora:** pasa directo al alta del cliente con los datos del lead pre-cargados (misma persona gana y da de alta).
- **Completar después:** el cliente queda en borrador en el ABM (otra persona lo completa).

**En ambos casos:** el ABM de Clientes debe mostrar una **señal visible** de clientes en borrador pendientes de revisión (contador o aviso), para que ninguno quede olvidado sin activar.

> Refuerza la puerta única (v1.3, 1.1) y el auto-create (v1.2, 2.4.2).

---

## 5 — Evolución del valor (no pisar, acumular)

El valor aparece en varias etapas (estimado al crear, propuesto, ofrecido, contraoferta, cierre). **No se pisa entre etapas:** cada etapa registra su valor en su propia acción, dejando la **película completa** de cómo evolucionó el precio en la negociación (ej: 450 → contraoferta 380 → oferta 420 → cierre 400).

- Queda visible en el historial del lead.
- El "valor actual" que muestra la Lista de leads es el más reciente; los anteriores quedan en el historial.
- Coherente con el principio transversal del proyecto: **no pisar, acumular** (historización — igual que cronograma de precios, cobros, servicios).
- **Sale casi solo** con el diseño: como cada cambio de etapa genera una acción con el valor de esa etapa, la evolución queda registrada naturalmente. Solo hay que asegurar que el valor no se pise.

---

## Resumen de lo que Fede debe implementar
1. **Corregir el bug del pipeline** (HTML crudo) — prioritario.
2. **Ventana de cambio de etapa** que siempre se abre, con campos por etapa + observación + próxima acción, y que genera una acción en el historial.
3. **Registro en etapa avanzada** con carga retroactiva opcional de etapas anteriores.
4. **Flujo híbrido de ganar lead → cliente** con señal de pendientes en el ABM.
5. **No pisar el valor** entre etapas (registrar evolución).

## Pendiente para próxima sesión
- Funciones de IA del CRM (Agente IA, y las que aparezcan) — revisar de dónde salen, como en Cobros.
- Diagnóstico fino de Estadísticas si se quiere ampliar.

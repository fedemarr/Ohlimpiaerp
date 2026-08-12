# DELTA — Operaciones / Liquidación de Horas v1 (diagnóstico + ajustes)

**Fecha:** 3 de agosto de 2026
**Autor:** Lautaro (con Claude web)
**Destinatario:** Fede
**Estado:** Diagnóstico de módulo existente + features/bugs a implementar.
**Relacionado:** módulo Categorías (valores por categoría), módulo Servicios (EFT, supervisor), módulo Comisiones (consume las horas facturables), Gestión de Precios (valor hora vigente).

---

## Cómo funciona el módulo (diagnóstico — está BIEN armado)

El módulo ya existe y es sólido. Flujo:
1. Se da de alta un servicio y se le asigna un **supervisor**.
2. Al asignarlo, el sistema le **arma automáticamente la planilla de horas** de ese servicio al supervisor. Cada supervisor ve **solo sus servicios**.
3. Debajo de cada servicio aparecen precargados **los operarios activos** que ya pertenecen a él. Se puede **agregar** a alguien que no aparezca (ventana "Agregar asociado a la grilla").
4. El supervisor carga las horas por día, según el **tipo de contrato** del servicio.
5. La grilla es mensual (una columna por día), con fines de semana en amarillo y feriados en rojo.

Tabs: **Grillas por servicio**, **Autorizaciones pendientes** (vista del Gerente de Operaciones), **Mis autorizaciones** (vista del supervisor).

---

## 1 — Facturable / no facturable y la relación con el EFT

- **Facturable:** horas que se le cobran al cliente.
- **No facturable:** horas que absorbe la empresa (no se cobran) — ej: retén, capacitación, licencia gremial, franquero, etc. (motivos parametrizados).
- **EFT** = tope de horas facturables pactado con el cliente. Dentro del EFT → facturable normal. **Fuera del EFT** → horas extra que son a pérdida salvo que se reconozcan.

### Los dos sellos (independientes) de las horas fuera del EFT
Cuando un servicio supera el EFT, las horas extra tienen **dos aprobaciones independientes**:
1. **Aprobación del Gerente de Operaciones** — avala que están justificadas operativamente (o que la empresa las absorbe a conciencia).
2. **Reconocimiento del cliente** — el cliente acepta pagarlas.

Tres combinaciones: aprobadas por gerente pero no reconocidas por cliente (**pérdida autorizada**) / aprobadas y reconocidas (**se facturan**) / sin aprobar (**pendiente**, genera alerta).

> **Regla clave:** "aprobado por el gerente" NO vuelve facturable una hora. **Solo el reconocimiento del cliente** hace que se facture. Las no facturables aprobadas siguen sin cobrarse (pérdida autorizada).

---

## 2 — Ventana "Agregar asociado a la grilla" (bien diseñada)

Flujo progresivo (se abre según se responde):
- Datos base: **desde / hasta**, **horas por día**, **días que trabaja** (con feriados).
- **"¿Las horas son facturables al cliente?"**
  - **No** → pide **Motivo de no facturación** (lista parametrizada: Art. 42, Retén en base, Retén cubriendo, Capacitación interna/recibida, Franquero, Licencia gremial, etc.).
  - **Sí** → abre **"¿Las horas están dentro del EFT del servicio?"**
    - **Sí, dentro del EFT** → facturable normal, nada más.
    - **No, fuera del EFT** → pide **"¿Autorizadas por el cliente?"** (sello 2) + **Motivo fuera del EFT** (parametrizado).

Los motivos se gestionan desde **Configuración → Operaciones** (pizarrón central).

---

## 3 — Circuito de autorización (bien diseñado)

Las horas que requieren aprobación (no facturables, o fuera del EFT):
1. **Supervisor las carga** → aparecen en **amarillo claro** (stand by). El supervisor marca el sello del cliente.
2. Van a **"Autorizaciones pendientes"** → el **Gerente de Operaciones** ve el detalle (asociado, servicio, período, motivo, quién cargó) y **Aprueba / Rechaza** (sello 1).
3. Resolución:
   - **Rechazada** → aparece en **rojo** en la grilla.
   - **Aprobada** → queda como **fila común**.
4. **"Mis autorizaciones"** (vista del supervisor): al hacer click en **"Me notifiqué"** toma conocimiento formal → las rechazadas **desaparecen** de la grilla; las aprobadas quedan como fila común.

> El "Me notifiqué" (acuse de recibo) es un buen detalle: obliga al supervisor a enterarse de la decisión antes de que la fila cambie.

---

## 4 — Categoría alternativa

La persona tiene su **categoría de legajo** (formal, por convenio), pero en un servicio puntual puede **ejercer otra función** (nivel superior, o adicional por distancia/traslado a un servicio lejano). La **categoría alternativa** registra qué ejerce realmente ahí.

### Regla de valor: el MÁS ALTO
Siempre se toma el **valor más alto** de las dos categorías (legajo vs alternativa). Protege al asociado: nunca cobra menos; si ejerce una función superior o con adicional, se le reconoce; si su legajo ya es más alto, se respeta.

### Aprobación (FEATURE NUEVA — no existe hoy)
Poner una categoría alternativa que impacte en el valor **requiere aprobación previa**. Debe integrarse al **mismo circuito de "Autorizaciones pendientes"** que las horas fuera del EFT: al cargarla, genera un pendiente que el Gerente de Operaciones aprueba/rechaza, con el mismo manejo de estados (amarillo/rojo/normal) y el acuse "Me notifiqué". Hasta que no se apruebe, la categoría alternativa NO impacta en los valores.

---

## 5 — Bug y features de cálculo (grilla)

### BUG — no se ve el número del día
La fila de encabezado de la grilla muestra los colores (amarillo fin de semana, rojo feriado) pero **no muestra el número de cada día** (1, 2, 3…). Corregir — es visual pero necesario para cargar correctamente.

### Columna "Valor hora del asociado" (nueva, después de Total Hs)
Muestra el valor hora **efectivo** de la persona en ese servicio. Sale del **módulo Categorías** (ya creado), tomando el valor de la categoría vigente **en el mes de la planilla** (vigencia temporal — los valores cambian por paritaria; la planilla de agosto usa valores de agosto, etc.). El valor es el de la categoría que corresponda por la regla del **más alto** (legajo vs alternativa aprobada).

### Columna "A pagar"
**A pagar = total de horas trabajadas × valor hora del asociado.** Hoy muestra **$0** (el cálculo no está andando / faltan valores). Implementar leyendo del módulo Categorías por mes.

---

## 6 — Conexión con otros módulos (importante)

Este módulo es la **fuente de las horas** para otros:
- **Comisiones:** la base de comisión son las **horas facturables** = horas dentro del EFT + horas fuera del EFT **reconocidas por el cliente**. Las no facturables (aunque el gerente las apruebe) NO entran en comisión. Este módulo ya discrimina eso bien.
- **Gestión de Precios / facturación:** provee las horas realizadas para el cálculo según modelo (EFT / horas variables / abono).

> Buena noticia: el dato de horas facturables sale **bien discriminado** de este módulo, lo que valida el enfoque de Comisiones ("desde las horas, no desde Tango").

---

## Resumen de lo que Fede debe hacer
1. **Bug:** mostrar el número del día en el encabezado de la grilla.
2. **Feature:** columna "Valor hora del asociado" (desde módulo Categorías, valor del mes, categoría más alta).
3. **Feature:** columna "A pagar" = horas × valor hora (hoy da $0).
4. **Feature nueva:** aprobación de la **categoría alternativa** dentro del circuito de Autorizaciones pendientes.
5. Confirmar que la salida de **horas facturables** alimenta bien a Comisiones (dentro del EFT + extra reconocidas por cliente).

## Verificaciones
- Que el módulo Categorías entregue "valor de la categoría X vigente en el mes M".
- Que las horas extra reconocidas por el cliente se sumen a las facturables del servicio (para Comisiones).

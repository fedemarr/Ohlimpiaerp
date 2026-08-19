# RELEVAMIENTO FUNCIONAL — Sistema Ohlimpia

**Sesión de trabajo:** Lautaro + Claude · 10/08/2026
**Para:** Fede

> **Objetivo:** que Fede corrija o agregue sobre esta base. Cada tema tiene el pedido y las definiciones ya tomadas por Lautaro. Lo no definido está marcado como **A DEFINIR**.

---

## 1. Módulo Legajos — solapas de movimientos

La ficha del legajo suma **cuatro solapas de movimientos**. La solapa existente **Historial completo** queda como vista unificada de todos los movimientos en orden cronológico (cumple la política de auditoría del proyecto).

### Sanciones
Sanciones y reclamos/no conformidades vinculados al asociado. Se alimenta también desde el módulo Reclamos/NC (tema 9): una NC firmada genera el movimiento acá.

### Documentación
Cada documento (DNI, psicotécnico, libreta sanitaria, etc.) con fecha de vencimiento, alerta previa al vencimiento, y el archivo escaneado adjunto.

### Cuenta corriente
Adelantos, préstamos con su plan de cuotas, cuotas de uniformes y sanciones económicas/cargos. **Es la fuente de los descuentos que toma Liquidación** (tema 5).

### Movimientos de estado
Situación del asociado (activo en servicio / ART 42 / legales), reasignaciones de servicio, y cambios de categoría — tanto de función (ej. Operario A a B) como de categoría de monotributo.

---

## 2. Módulo Monotributo

- **Tabla anual:** tabla de categorías de monotributo POR AÑO, que se importa por archivo (Excel/CSV) con categoría y límite anual de facturación. Cada asociado tiene su categoría asignada.
- **Retiros:** el módulo trae los retiros que cobró cada persona mes a mes **DESDE el módulo de liquidación**. Sin carga manual.
- **Cálculo:** suma de retiros del año + proyección de los meses restantes (promedio del año × meses que faltan), comparado contra el límite anual de su categoría.
- **TAB Fuera de categoría:** quien supera el límite (real o proyectado) aparece en la solapa "Fuera de categoría", visible para RRHH/Administración. Ahí se decide: cambiarlo de categoría (queda el movimiento en el legajo) o mantenerlo y seguir pagando igual.

---

## 3. Módulo Uniformes

- **Origen:** la deuda nace en el módulo Uniformes desde el pedido. Según el **MOTIVO** del pedido, se descuenta o no.
- **Plan de cuotas:** si corresponde descontar, toma el precio **VIGENTE** del uniforme (tabla de precios con vigencia, política A.6). RRHH define la cantidad de cuotas y en qué período arranca la primera.
- **Conexión:** solapa con la tabla de descuentos conectada a la liquidación de fin de mes: la cuota se descuenta automáticamente y se refleja en la cuenta corriente del legajo.
- **Baja:** si el asociado se da de baja, el saldo pendiente completo se retiene en su última liquidación.

---

## 4. Módulo Retenciones e informes

- **Lista automática:** el sistema toma automáticamente a toda persona en **ART 42, situación de baja o legales** (sale de los movimientos de estado del legajo), y además permite agregar personas a mano.
- **Reporte del supervisor:** el supervisor carga al asociado que tiene inconvenientes en el servicio (**solo puede elegir asociados de SUS servicios activos**). El motivo es **TIPIFICADO** — lista parametrizable en Configuración (ausencias, abandono, daños, conducta, etc.) — más un campo de observación libre.
- **Decisión:** el caso aparece en el módulo y RRHH decide si aplica retención o no. La retención es por **MONTO o PORCENTAJE** que define RRHH caso por caso.
- **Cierre:** la retención se levanta **MANUALMENTE** por RRHH. Todo queda auditado: quién la puso, quién la levantó y cuándo.

---

## 5. Módulo Liquidación — descuentos

- **Toma automáticamente:** adelantos del mes, cuota del préstamo, descuento de uniformes y retenciones. Todo sale de la cuenta corriente del legajo y del módulo Retenciones — **acá se conecta, no se crea**.
- **Insuficiencia:** si el retiro del mes no cubre todos los descuentos, RRHH decide qué se cubre; el saldo descubierto pasa automáticamente al mes siguiente y queda vivo en la cuenta corriente.
- **Detalle:** el recibo línea por línea ya existe en el módulo; solo agregar los conceptos nuevos como líneas.

---

## 6. Módulo Comercial — alta de cliente y servicio

### 6.a — Contactos del cliente
En la solapa Contactos del alta de cliente, el campo **Rol** pasa de texto libre a **desplegable parametrizable** (se administra en Configuración: Quien nos trajo, Recibe facturas, Gerente de compras, etc.). Se mantienen los contactos ilimitados y la marca "cliente a satisfacer".

### 6.b — Logística del servicio nuevo
Los campos **Productos, Elementos de limpieza y Máquinas** dejan de ser texto libre y pasan a ser **listas parametrizables con selección múltiple** (se clickea lo que pide el servicio, al menos lo básico).

**Opción complementaria:** kits parametrizables por nivel ("Productos básicos", "Básicos + cera", "Intermedios", "Avanzados").

> El módulo de productos de Logística **no existe todavía**: cuando exista, estos campos se conectan a él.

### 6.c — Facturación del servicio
- **Agrupación:** si el servicio se factura de manera independiente o en conjunto con los demás servicios del cliente.
- **Cantidad en descripción:** si en la descripción de la factura va la cantidad de horas hechas, o simplemente cantidad "1" (caso abono fijo).
- **Productos:** si los productos van dentro de la misma factura o se facturan aparte.
- **Detalle de productos:** si la descripción incluye el detalle de productos.
- **OC:** si la orden de compra debe figurar impresa en la factura (hoy existe "Requiere OC"; falta que se refleje en la factura).
- **Descripción:** el texto se define con **PLANTILLAS PARAMETRIZABLES** (lista administrable, ej: `Servicio de limpieza — {servicio} — Período {mes}`), retocables por servicio. *Confirmado por Lautaro el 10/08.*

---

## 7. Módulo Servicios — supervisores múltiples + IA

- **Multi-supervisor:** permitir asignar **MÁS DE UN supervisor** por servicio. El 3% se **DIVIDE** entre los asignados.
- **Recomendación con IA:** al asignar se abre una solapa de supervisores recomendados. La IA sugiere el más cercano o el que lo tiene de paso en su recorrido (usar dirección, provincia y municipio/barrio ya cargados en la base de servicios), y muestra cuánto cobraría por este servicio y cuánto pasaría a ganar **EN TOTAL** al elegirlo.
- **Módulo Supervisores:** crear el módulo. Por ahora, comisión del **3% igual para todos**, calculada sobre la **FACTURACIÓN NETA** del servicio. El porcentaje será modificable a futuro desde este módulo — **no hardcodear**.

---

## 8. CRM Comercial

El pipeline existente (Prospecto, Primer contacto, Propuesta enviada, Negociación, Contrato, Cerrado perdido) se mantiene.

Se agrega la distinción al crear el lead:
- **Cliente existente** — vinculado a su ficha del ABM; es negociación por un servicio nuevo
- **Cliente potencial** — datos mínimos

**Visual:** chip visible en el tablero y filtro en la lista de leads.

**Al ganar:** si era potencial, se convierte en cliente con los datos precargados; si era existente, va directo al alta de servicio.

---

## 9. Reclamos y No Conformidades

- **Rediseño:** el módulo actual (tablas de Reclamos / No conformidades / Indicadores) se rediseña con el **MISMO diseño de tablero del CRM comercial**: pipeline con etapas, acciones y estadísticas.
- **Concepto:** la no conformidad es la "norma" del reclamo. El reclamo es el hecho; la NC lo formaliza con causa raíz, tratamiento, responsable y cierre (estructura que ya existe).
- **Firma:** la NC se debe poder **IMPRIMIR** para que el asociado la firme, y luego **ADJUNTAR LA FOTO** del documento firmado a esa misma NC.
- **Conexión con Legajos:** una NC vinculada a un asociado genera el movimiento en la solapa Sanciones de su legajo (tema 1).

---

## 10. Comisiones — internos vs externos

Hoy **todos** los coordinadores de cuenta importados figuran como "persona externa" parametrizable, pero la mayoría son internos. Corregir así:

- **Cruce:** cruzar TODOS los coordinadores de cuenta contra el módulo Legajos. Coincidencia por nombre y apellido → marcar **INTERNO** y dejarlo **CONECTADO a su legajo** (entidad vinculada, no texto suelto).
- **Externos:** los que no coinciden quedan como **EXTERNOS** parametrizables. El seguimiento de comisiones distingue internos de externos.
- **Cuidados:**
  - Permitir corregir el cruce a mano (homónimos)
  - ⚠️ "Alvaro Uballes" y "Alvaro Uballes Junior" son **DOS personas distintas**
  - Las etiquetas de grupo (CONSEJO, INTERLIM, HOSPITAL, OPERARIOS) **no son personas**: definir su tratamiento con Lautaro

---

## 11. Módulo Pedido de personal

A cada supervisor le aparecen únicamente **SUS servicios activos**. La misma regla de permiso aplica al reporte de inconvenientes del tema 4.

---

## 12. BUG — Módulo Liquidación de horas (grillas por servicio)

**Síntoma:** en la grilla del mes, la fila de encabezado de cada servicio muestra en el total por día el **EFT TOTAL** (ej: 17.632,8) en lugar de la suma de horas de los asociados de ese día (ej: 56 = 8 hs × 7 personas, que es lo que muestra correctamente la fila de cierre de abajo). El error arrastra a la columna TOTAL HS, que llega a valores absurdos (352.656 hs).

**Origen detectado:** el número errado sale de la ficha del servicio.
`17.632,8 = 2.204,1 (cantidad de horas mensual del servicio, su EFT) × 8`
La fila del servicio está tomando el **EFT mensual multiplicado por 8** en vez de sumar las horas cargadas de sus asociados ese día.

**Corrección:** la fila de encabezado del servicio debe sumar las horas cargadas de sus asociados por día, igual que hace la fila de cierre inferior.

**Detalle de formato adicional:** en la ficha del servicio, el "Monto estimado a facturar por mes" se muestra con tres decimales (`$20.528.965,359`), que a primera vista se lee como veinte mil millones. Redondear a dos decimales o mostrar sin centavos.

---

## Etiquetas de grupo en comisiones — definido 10/08

- **CONSEJO:** la comisión se reparte entre Juan Peretti, Juan Elicabe y Richard Recalde.
- **HOSPITAL:** va como persona externa "Juan H".
- **INTERLIM:** es una empresa que consiguió los servicios; va como persona externa (empresa).
- **OPERARIOS:** Lautaro tiene que revisar quiénes lo integran. **Queda pendiente.**

---

## Otras definiciones del 10/08

- **CHANGO.SMARTIN:** DADO DE BAJA (facturó julio 2026; confirmar fecha de baja).
- **UTCYDRA:** servicio tercerizado (vidrios), sin supervisor propio. Productos **NO PAGAN**.
- **GRUSPA, BRIGNONE y DONADO:** productos **PAGAN** (se facturan aparte).
- **Direcciones Chango confirmadas:** CHANGO.SARANDI en Avellaneda y CHANGO.LZAMORA en Almirante Brown (Claypole).
- **Logística:** la migración de los campos de logística del servicio al futuro módulo de productos se decide cuando exista el módulo.

---

## Pendientes de Lautaro

1. Supervisor de DONADO (lo tiene que buscar).
2. % de comisión de DONADO (arranca en agosto, sin fila en la hoja de horas).
3. Integrantes de la etiqueta OPERARIOS.
4. Fecha exacta de baja de CHANGO.SMARTIN.

---

## Datos de referencia ya entregados

Para varios de estos temas ya existe la base de datos armada y verificada:

- **`SERVICIOS_ACTIVOS_JUL2026_para_Fede_FINAL_v5.xlsx`** — 165 servicios con cliente, tipo, modelo, supervisor, valores, productos PAGAN/NO PAGAN, dirección, provincia y municipio/barrio
- **`COORDINADORES_DE_CUENTA_por_servicio_v2.xlsx`** — coordinador y % de comisión por servicio
- **`COMISIONES_ADEUDADAS_dic25_jul26.xlsx`**

> El tema 7 (cercanía de supervisores) y el tema 10 (cruce de internos) se construyen directamente sobre esos datos.

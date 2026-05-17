# Políticas del Proyecto Ohlimpia

**Versión:** 1.0
**Fecha de creación:** 17 de mayo de 2026
**Dictadas por:** Lautaro (líder del proyecto)
**Estado:** Vigentes

---

## Cómo usar este documento

Este archivo define las reglas y la dirección del proyecto Ohlimpia. Está dividido en dos secciones:

- **Políticas firmes:** se aplican siempre, en cada cambio, sin excepción. Si un cambio viola una de estas políticas, hay que frenarlo y corregirlo antes de seguir.
- **Dirección estratégica:** son objetivos del proyecto que se evalúan cuando llegue su momento. No se aplican a cada cambio del día a día.

Este archivo debe vivir en `C:\proyectos\ohlimpia\POLITICAS_PROYECTO.md` para que Claude Code lo lea junto con `CLAUDE.md` al inicio de cada sesión.

---

## SECCIÓN A — Políticas firmes

### A.1 — El usuario no es programador

Lautaro tiene experiencia con Clipper de los años 90, pero no es programador actual. Eso significa:

- Las decisiones técnicas se le explican siempre con peras y manzanas.
- Cuando hay una bifurcación técnica, Claude (web o Code) presenta las opciones con consecuencias, y Lautaro decide.
- No se asume conocimiento de jerga moderna (React, useState, async/await, etc.) sin explicación.
- Si Lautaro asiente sin entender, la responsabilidad es de quien explicó mal, no de él.

### A.2 — Toda decisión debe ser entendible antes de ejecutarse

- Ante cualquier propuesta, Claude tiene la obligación de explicar qué hace, por qué, y cuáles son las alternativas.
- Lautaro tiene la obligación de frenar y pedir aclaración cuando algo no quede claro.
- **No se ejecutan cambios "porque sí" o "porque está de moda".** Cada decisión tiene una justificación que Lautaro entiende.

### A.3 — Commit por cada cambio lógico

- Cada cambio que tenga un sentido propio (arreglar un bug, agregar un campo, modificar una validación) se cierra con un commit.
- Los commits tienen un mensaje claro en español que cualquier persona pueda entender en 6 meses.
- Formato sugerido: `tipo: descripción corta`. Tipos: `feat` (nueva funcionalidad), `fix` (corrección), `docs` (documentación), `refactor` (reorganización sin cambio funcional), `style` (formato), `chore` (mantenimiento).
- **Se prefieren muchos commits chicos a pocos commits grandes.** Si un cambio toca varias cosas, se commitea por partes.

### A.4 — Diagnóstico antes de cada cambio

Antes de tocar código, Claude debe entregar:

1. **Estado actual:** cómo está hecho hoy ese pedazo del sistema.
2. **Qué hay que cambiar y por qué.**
3. **Cómo se propone hacer el cambio:** archivos afectados, base de datos, riesgos.
4. **Cómo se va a probar que el cambio funcionó.**
5. **Cómo se vuelve atrás si algo sale mal.**

Si el cambio es muy chico (ej: corregir un texto), el diagnóstico puede ser de una línea. Si es grande, puede ser un documento.

### A.5 — Base de datos en SQL sobre Supabase

- Toda la persistencia del sistema vive en Supabase (PostgreSQL).
- No se usa almacenamiento local del navegador (`localStorage`, `sessionStorage`) para datos del negocio.
- Las definiciones de tablas se versionan en archivos SQL dentro del repositorio.
- Cada cambio de estructura de tabla genera un script SQL nuevo, no se modifica uno viejo.

### A.6 — Historización de valores económicos con vigencia temporal

**Principio:** todo valor económico que pueda cambiar en el tiempo (precios de facturación, valor hora de venta, valor hora de pago a asociados, precios de productos, etc.) debe almacenarse con fecha de vigencia, no como un valor único.

**Distinción crítica:**

- **Cambio con vigencia:** el valor cambia a partir de cierta fecha. No modifica el pasado. Se crea un registro nuevo con `vigencia_desde` igual a esa fecha. Ejemplo: paritaria que actualiza el valor hora desde el 1 de junio.
- **Corrección de error:** el valor estaba mal cargado. Sí modifica el histórico. Se modifica el registro existente y queda asentado en la auditoría.

**Detalle pendiente:** cómo decide el sistema si un cambio es "vigencia" o "corrección". Se resolverá cuando se diseñe el primer módulo económico.

**Implementación técnica esperada:** tablas con columnas `vigencia_desde` y `vigencia_hasta` (o equivalentes). Patrón estándar de la industria.

### A.7 — Reversibilidad de altas, bajas y modificaciones

**Principio:** ningún registro se elimina físicamente de la base de datos. Toda operación es reversible.

**Implementación:**

- **Borrado lógico (soft delete):** los registros tienen un campo `anulado` (boolean) o `estado` (vigente/anulado). Las consultas filtran por defecto los no anulados, pero los datos siguen ahí.
- **Auditoría:** cada operación de alta, baja o modificación queda registrada con: quién lo hizo, cuándo, qué valor anterior tenía, qué valor nuevo tiene.
- **Restauración:** desde la interfaz debe haber una forma de restaurar un registro anulado o de revertir una modificación a un estado anterior.

**Costo aceptado:** esto agrega complejidad y peso a la base. Es el precio de tener un sistema económico serio.

### A.8 — Buenas prácticas estándar de la industria

Claude tiene autorización para aplicar buenas prácticas no mencionadas explícitamente acá, siempre que:

- Se las explique a Lautaro la primera vez que aparecen.
- No agreguen complejidad sin beneficio claro.
- No traigan tecnología "por moda" sin justificación.

**Ejemplos de buenas prácticas que aplicarán por defecto sin pedir permiso:**
- Nombres claros de variables, funciones y tablas en español.
- Validación de datos antes de guardar (ej: que un DNI no esté duplicado).
- Manejo de errores con mensajes claros para el usuario.
- Separación entre presentación (lo que ve el usuario) y lógica (lo que hace el sistema).
- Mensajes de carga ("Actualizando...") cuando una operación tarda más de 1 segundo.

### A.9 — Refresh inteligente entre módulos

**Principio:** cuando un módulo depende de datos que pueden haber cambiado en otros módulos, debe actualizarse al entrar. Pero no se hace refresh completo de toda la base, solo de lo relacionado.

**Implementación preferida:** usar la función Realtime de Supabase, que avisa automáticamente cuando los datos cambian. Es más eficiente que refrescar manualmente.

**Indicador visual obligatorio:** si el refresh tarda más de medio segundo, debe haber un aviso visible al usuario ("Actualizando datos...").

### A.10 — Documento de traspaso al final de sesión larga

Cuando una conversación se hace muy larga (más de 50-60 mensajes, o cuando Claude lo detecte como necesario), Claude debe generar un archivo de traspaso con:

- Estado actual del sistema.
- Qué se hizo en esta sesión.
- Qué quedó pendiente.
- Cómo retomar en la próxima sesión.

Este archivo se guarda en la carpeta del proyecto como `TRASPASO_AAAA-MM-DD.md` y se sube al inicio de la próxima conversación.

### A.11 — Preferencia por rehacer cuando hay deuda técnica heredada

**Contexto:** este proyecto arrastra deuda técnica de su origen (ver Anexo Histórico al final del documento). Mucho código fue generado por IA sin contexto adecuado y luego dividido en módulos por otra IA. Esto puede haber producido archivos que funcionan pero tienen lógica enredada, duplicada o mal interpretada.

**Principio:** ante un módulo que tenga deuda técnica heredada, **proponer como opción primaria rehacerlo de cero** en lugar de modificarlo. La modificación parcial puede salir más cara que la reescritura limpia.

**Cómo se aplica:**

Cada vez que vayamos a tocar un módulo, Claude web debe presentar las dos opciones con un cuadro comparativo:

| Opción | Tiempo estimado | Riesgo de bugs nuevos | Calidad final |
|--------|----------------|----------------------|---------------|
| Modificar lo existente | X horas | Medio/Alto | Hereda la deuda técnica |
| Rehacer de cero | Y horas | Bajo | Limpio, sin deuda heredada |

Lautaro decide cuál opción tomar en cada caso.

**Criterios que inclinan la decisión hacia rehacer:**

- El módulo tiene más de 1.000 líneas y se entiende mal.
- El feedback de los usuarios cambia el flujo central del módulo, no solo agrega campos.
- El módulo no está bien aislado (sus funciones están enredadas con otros módulos).
- Hay bugs documentados que no se resolvieron porque "es complicado".
- Modificar el módulo requeriría tocar más del 40% de su código.

**Criterios que inclinan la decisión hacia modificar:**

- El módulo es chico (menos de 300 líneas) y se entiende bien.
- El cambio es solo agregar o renombrar campos, sin tocar la lógica.
- El módulo ya tiene historial de funcionar bien en producción.
- Hay urgencia y rehacerlo costaría demasiado tiempo.

**Compromiso obligatorio cuando se elija rehacer:** antes de borrar el módulo viejo, se hace un backup con fecha y se verifica que el nuevo cumple todo lo que hacía el anterior. Nunca se pierde funcionalidad por reescribir.

---

## SECCIÓN B — Dirección estratégica

Estas son metas del proyecto, no reglas de cada cambio. Se evalúan cuando llegue el momento de cada una.

### B.1 — Sistema modular ABM con relaciones cruzadas

El sistema es un ERP cooperativo con múltiples módulos relacionados:

- **Personal (asociados):** ABM con todas las situaciones administrativas posibles (alta, baja, sanciones, ausencias, etc.).
- **Liquidación:** los asociados trabajan por hora; el sistema calcula y permite liquidar mensualmente.
- **Clientes:** ABM de empresas que contratan servicios.
- **Proveedores:** ABM similar a clientes.
- **Productos y maquinarias:** ABM con estados (disponible, en reparación, distribuido).
- **Económico:** impacto contable de toda la operación.
- **Financiero:** flujo de caja real (cobros, pagos).

Los módulos se construyen progresivamente. No todos están listos.

### B.2 — Procesos de gestión avanzados

A medida que el sistema crezca se incorporarán:

- CRM de ventas.
- CRM de cobros.
- Política de precios con vigencias.
- Seguimiento de juicios.
- Reclamos y no conformidades.
- Capacitaciones y evaluaciones.
- Otros procesos transversales según necesidad.

### B.3 — Económico proyectado vs real

**Objetivo:** poder cargar un económico proyectado (presupuesto) y compararlo después con el real.

**Dimensiones de análisis:**
- Por centro de costos.
- Por cliente.
- Por período.

Lo mismo aplica al financiero: tener proyectado y real, y poder compararlos.

### B.4 — Integración con Tango

**Estado actual:** la empresa usa Tango con servidor propio (no nube).

**Niveles de integración posibles, de menor a mayor ambición:**

1. **Importación manual de datos:** exportar de Tango a Excel/CSV y subir a Ohlimpia. Factible.
2. **API de Tango:** si Tango tiene API, integrarla para facturar u obtener datos automáticamente. A averiguar.
3. **Agente de IA que opere Tango:** un proceso automatizado que use Tango como si fuera un usuario. Posible pero complejo (Tango es un sistema viejo de escritorio).
4. **Reemplazo de Tango:** si entorpece demasiado, migrar a Odoo o construir un módulo contable propio.

**Decisión actual:** se evaluará cuando un módulo concreto requiera integrarse. No se planifica en abstracto.

### B.5 — Agentes de IA en módulos del sistema

**Casos de uso previstos:**

- Comunicación automatizada con asociados (WhatsApp, mail, recordatorios).
- Tareas repetitivas (clasificación de candidatos, sugerencias de reasignación).
- Análisis complejos de datos (alertas, predicciones, recomendaciones).

**Decisión actual:** se agrega IA al módulo específico cuando el beneficio sea claro y medible. No se mete IA por defecto.

---

## SECCIÓN C — Convenciones operativas

### C.1 — Cómo se trabaja en cada sesión

**Equipo de tres:**

1. **Lautaro:** decide, ejecuta acciones físicas (clicks, pegar mensajes), prueba.
2. **Claude web (este chat):** piensa, planifica, revisa, redacta instrucciones precisas.
3. **Claude Code (terminal):** modifica archivos, ejecuta comandos, consulta el código.

**Flujo de cada cambio:**

1. Claude web propone el cambio con diagnóstico (política A.4).
2. Lautaro decide si avanza o pide modificaciones.
3. Claude web redacta el mensaje exacto para Claude Code.
4. Lautaro pega el mensaje en Claude Code.
5. Claude Code responde (puede ser un diff o una acción).
6. Lautaro copia la respuesta y la pega en Claude web.
7. Claude web revisa antes de aprobar la siguiente acción.
8. Cuando el cambio está completo, se hace commit (política A.3).

**Regla de oro:** una cosa a la vez. No se le manda un segundo mensaje a Claude Code sin antes pasar por Claude web.

### C.2 — Backup antes de cambios grandes

Antes de cualquier cambio que toque la estructura del proyecto (base de datos, archivos centrales, configuración), se hace una copia de la carpeta del proyecto a Dropbox o equivalente, renombrada con la fecha.

### C.3 — Idioma del proyecto

- **Código y nombres técnicos:** español (`candidato`, `legajo`, `asociado`, etc.).
- **Mensajes al usuario:** español neutro de Argentina.
- **Documentación interna:** español.
- **Mensajes de commit:** español.

---

## Historial de versiones

| Versión | Fecha       | Cambios                                                        |
|---------|-------------|---------------------------------------------------------------|
| 1.0     | 2026-05-17  | Versión inicial dictada por Lautaro.                          |
| 1.1     | 2026-05-17  | Agregada política A.11 (rehacer vs modificar) y Anexo Histórico. |

---

## Anexo Histórico — Origen del proyecto y deuda técnica heredada

Este proyecto no nació con el contexto técnico adecuado. Esto generó deuda técnica que afecta decisiones presentes.

**Fase 1 — Origen sin contexto:** El sistema empezó como una conversación con Claude (web), sin establecer al inicio un contexto de proyecto, sin definir backend, sin armar Claude Code, y sin un repositorio Git. Lautaro pidió funcionalidad, Claude generó código sin un norte claro. El sistema creció de 3.000 líneas a 35.000 líneas en HTML único, agregando módulos sobre módulos.

**Fase 2 — El sistema no funcionaba:** Al intentar probar el sistema, se descubrió que no tenía base de datos real. Era una maqueta interactiva: los datos se guardaban en variables JavaScript en memoria y se perdían al cerrar el navegador. El sistema "funcionaba" visualmente pero no servía para uso real.

**Fase 3 — Migración a entorno profesional:** Se decidió migrar el proyecto a un entorno con Claude Code, Git, Supabase y Vite. Se creó la base de datos en Supabase con las tablas necesarias. Se configuró el deploy en Netlify. Esto fue un avance importante en infraestructura.

**Fase 4 — Reorganización del código:** Claude Code tomó el HTML monolítico y empezó a partirlo en módulos separados (`src/modules/...`). Esta tarea es delicada porque la división se hace en gran parte por proximidad de texto, no por intención original. Resultado posible: archivos que funcionan pero tienen lógica enroscada, duplicada, o mal interpretada respecto del diseño original.

**Estado actual (mayo 2026):**

- 4 módulos migrados: Candidatos, Psicotécnico, Altas, Legajos.
- ~30 módulos pendientes, viviendo en `src/legacy.js` (gran archivo único de ~13.400 líneas).
- 40+ tablas creadas en Supabase, no todas conectadas con el frontend.
- Bugs conocidos documentados en `CLAUDE.md`.

**Consecuencia para las políticas:**

- La política A.11 (preferencia por rehacer) existe por esta historia.
- Cada vez que tocamos un módulo migrado, hay que sospechar de su calidad antes de modificarlo.
- Los módulos que aún están en `legacy.js` son candidatos naturales para rehacer cuando llegue su turno, en vez de migrar pedazos.

**Lo positivo:** la documentación, la arquitectura general (Vite + Supabase + módulos) y el flujo de trabajo actual son buenos. La deuda está localizada en módulos específicos, no en el conjunto.


# Extracción del sector RRHH — Ohlimpia ERP

> Documentación funcional y técnica del sector Recursos Humanos del ERP de la
> Cooperativa Ohlimpia (cooperativa de limpieza, trabajadores = "asociados").
> Objetivo: extraer todo lo que está hecho para poder **reconstruir un sistema
> aparte para otro cliente** o habilitar un esquema multitenant vendido por módulo.

---

## 1. Qué es el sistema (contexto)

- **Stack:** Vite (JS vanilla, sin framework) + Supabase (PostgreSQL) como backend.
  No hay API propia: el cliente JS escribe directo en Supabase.
- **Datos:** estado global mutable `DB` en memoria; persistencia por upsert por
  `id_local` (texto). Todo registro nuevo usa `Date.now()` como id.
- **Auth:** local contra un array `DB.usuarios` (passwords en texto plano — NO usa
  Supabase Auth salvo sesión anónima en el portal del asociado).
- **Navegación:** SPA monolítica, `navTo(key)` muestra/oculta `<div class="screen">`.
  No hay router.

## 2. Qué cubre el sector RRHH (alcance de esta extracción)

El sector RRHH se organiza en 5 áreas funcionales:

### A) Selección e ingreso de personal (flujo completo)
1. **Pedidos de personal** (supervisores piden cubrir puestos)
2. **Candidatos** (ABM + citas/entrevistas/calendario/importación histórica)
3. **Psicotécnico** (evaluación, etapas, aprobación → pasa a alta)
4. **Preocupacional** (examen médico pre-ocupacional)
5. **Documentación de ingreso** (antecedentes, libreta sanitaria, curso)
6. **Altas de asociados** (modal de 8 pasos → crea el legajo + nro de socio)
7. **Legajos** (legajo activo: período de prueba, detalle, impresión, importadores)

### B) Gestión del personal operativo
8. **Capacitaciones** (registro + resultados + evaluación + competencia)
9. **Vacaciones** (administrativos: aprobación Gerente → Consejo)
10. **Descansos** (operativos: aprobación Operaciones → RRHH)
11. **Competencia anual** (ranking individual/equipos/supervisores + premios)
12. **Sanciones disciplinarias** (niveles 0-1-2, catálogo de infracciones, descargos)
13. **Enfermos y accidentes** (casos, certificados médicos, retiros mensuales)
14. **Situaciones legales** (casos con abogados, novedades, adjuntos)
15. **Uniformes** (pedidos con 15 estados, doble handshake RRHH/Logística/Supervisor)
16. **Reasignaciones** (cambio de servicio/supervisor con aprobación + sugeridor IA)

### C) Liquidación y sueldos
17. **Categorías salariales** (categorías base + valores de hora + plus)
18. **SMVM histórico** (salario mínimo vital y móvil)
19. **Liquidación de horas** (grillas por servicio/mes, tipos de hora, Art.42, EFT)
20. **Liquidación Administración** (personal administrativo + adicional supervisión)
21. **Mantenimiento** (liquidación de horas de mantenimiento, horas mínimas)
22. **Retenes** (personal de reemplazo)
23. **Liquidaciones** (proceso completo de liquidación con conceptos configurables)
24. **Monotributos** (gestión de monotributistas, pagos mensuales, importación)
25. **Retenciones** (sobre haberes)
26. **Descuentos por asociado** (descuentos automáticos)
27. **Paritarias** (registro, homologación, aplicación a asociados/clientes)
28. **Feriados** (ABM nacional)

### D) Adelantos y préstamos
29. **Pedidos de adelantos** (supervisor → RRHH → Finanzas)
30. **Gestión de adelantos** (formal/informal, préstamos, depósitos)
31. **Mis adelantos** (portal del asociado — login por nro socio + apellido)

### E) Transversales
32. **Sugerencias** (buzón, persiste en tabla `sugerencias`)
33. **Notificaciones** (bandeja interna entre roles)
34. **Adjuntos** (bucket privado Supabase, PDF, 10MB, validación por etapa)
35. **IA** (análisis de documentos para informe psico, apto médico, antecedentes;
    sugeridor de reasignaciones)

## 3. Roles / perfiles que intervienen en RRHH

| Perfil | Qué hace en RRHH |
|---|---|
| **Administrador total** | Todo (superusuario) |
| **RRHH** | Candidatos, psico, preocupacional, docum, altas, legajos, sanciones, vacaciones (preaviso corto), reasignaciones (aprobación), liquidación, etc. |
| **Operaciones** | Descansos (aprobación etapa 1), pedidos, reasignaciones (solicitud), liquidación de horas |
| **Supervisor** | Pedidos de personal, descansos (solicitud), uniformes (entrega), adelantos (solicitud) |
| **Finanzas** | Legajos (parcial), cobros, liquidaciones, adelantos (aprobación final), ajustes |
| **Asociado** | Portal "Mis adelantos" (login por nro socio + apellido, sesión anónima Supabase) |

## 4. Modelo de estados globales transversales

- **`DB.legajos`** → el asociado. `estado: 'Activo' | 'Baja'`. Es la entidad
  raíz de casi todo el sector (capacitaciones, sanciones, vacaciones, etc.
  referencian por `nroSocio`).
- **`DB.catAltPendientes`** → puente "ya ingresó". `estado: 'Pendiente de alta' | 'Alta completada'`.
  Los guards de idempotencia de psico/preocup/docum lo usan para no duplicar.
- **Convención de estados:** cada flujo tiene sus estados propios en el objeto;
  no hay máquina de estados centralizada.

## 5. Documentos de esta carpeta

| Archivo | Contenido |
|---|---|
| `00_LECTURA_RAPIDA.md` | Este índice + resumen ejecutivo |
| `01_Flujo_Ingreso.md` | Selección e ingreso: pedidos, candidatos, psico, preocup, docum, altas, legajos |
| `02_Gestion_Personal.md` | Capacitaciones, vacaciones, descansos, competencia, sanciones, enfermos/accidentes, legales, uniformes, reasignaciones |
| `03_Liquidacion_y_Sueldos.md` | Categorías, SMVM, liquidación de horas, Liq Admin, mantenimiento, retenes, liquidaciones, monotributos, retenciones, descuentos, paritarias, feriados |
| `04_Adelantos_y_Prestamos.md` | Pedidos/gestion de adelantos, portal del asociado |
| `05_Arquitectura_y_Datos.md` | Arquitectura, perfiles, entidades y tablas Supabase |

## 6. Nota sobre "sistema aparte" vs "multitenant"

- **Sistema aparte (lo más simple):** usar esta documentación como spec funcional.
  El flujo de RRHH no depende de clientes/ventas/CRM, así que es separable.
- **Multitenant sobre el mismo código:** hoy el sistema NO tiene tenant: una sola
  base Supabase, `DB` global, auth local contra `DB.usuarios`. Para vender por
  módulo a múltiples empresas habría que: (a) agregar `empresa_id`/`tenant_id` a
  todas las tablas + RLS por tenant, (b) login a nivel organización, (c) feature
  flags por módulo por cliente. Es un refactor estructural, no un switch.

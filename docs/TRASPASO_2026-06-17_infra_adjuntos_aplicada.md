# Traspaso de sesión — 17/06/2026: Infraestructura de adjuntos aplicada en producción

**Fecha:** 2026-06-17 (sesión corta, retomando después de ~3 semanas)
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 (documento de traspaso al final de sesión)
**Documento previo:** `docs/TRASPASO_2026-05-29_diseno_adjuntos_completo.md`

## Resumen en una frase

Sesión de retorno después de varias semanas. Se revisó el SQL borrador del 29/05 con cabeza fresca, se detectó la falta del trigger `updated_at`, se agregó RLS + policy abierta para seguir convención del sistema, se aplicó el SQL en producción (Supabase reactivado tras pausa por inactividad), y se creó + configuró el bucket de Storage. El backend del módulo de adjuntos quedó completo y listo para programar la UI.

---

# 1. Lo aplicado en producción

## 1.1. Tabla `adjuntos` creada en Supabase

Script aplicado vía SQL Editor, envuelto en transacción (`BEGIN/COMMIT`):

- 16 columnas (id, id_local, dni, etapa, tipo, url, nombre_archivo, fecha_vencimiento, vigente, subido_por_id, subido_por_nombre, subido_en, borrado, borrado_por_id, borrado_por_nombre, borrado_en, created_at, updated_at).
- 4 índices (idx_adjuntos_dni, idx_adjuntos_dni_etapa, idx_adjuntos_vigente, idx_adjuntos_vencimiento).
- Trigger `set_updated_at_adjuntos` que reusa la función `public.tg_set_updated_at()` ya definida en v002.
- RLS habilitado + policy `Acceso total adjuntos` (FOR ALL TO public USING true WITH CHECK true).
- Comentarios documentados en tabla y columnas clave.

Verificación post-aplicación: queries de `information_schema` confirmaron columnas, trigger y policy.

## 1.2. Bucket `ohlimpia-adjuntos` creado en Storage

Configuración:
- **Nombre:** `ohlimpia-adjuntos`
- **Privacidad:** Privado (no público).
- **Límite de tamaño:** 10 MB por archivo.
- **MIME types permitidos:** `application/pdf,image/jpeg,image/png`.

## 1.3. Policies del bucket de Storage

4 policies creadas en `storage.objects`, todas con la misma policy name (`Acceso total adjuntos`) y sufijo numérico autogenerado:

- `Acceso total adjuntos 11udces_0` → SELECT, public, USING (true)
- `Acceso total adjuntos 11udces_1` → INSERT, public, WITH CHECK (true)
- `Acceso total adjuntos 11udces_2` → UPDATE, public, USING (true) WITH CHECK (true)
- `Acceso total adjuntos 11udces_3` → DELETE, public, USING (true)

Sigue la misma convención que las tablas del sistema (RLS habilitado + policy abierta a public). Es deuda de seguridad anotable pero coherente con el patrón actual.

---

# 2. Detalles importantes que aparecieron en esta sesión

## 2.1. Trigger updated_at faltante en el borrador del 29/05

El borrador original no incluía el trigger, solo el `default now()`. Diagnóstico vía Claude Code mostró que el sistema usa una convención centralizada:

```sql
-- Definida una sola vez en v002:
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() ...

-- Cada tabla la reusa con su propio CREATE TRIGGER:
v002 → set_updated_at_candidatos, set_updated_at_personal_rrhh
v007 → set_updated_at_preocupacionales
v009 → set_updated_at_documentacion_ingreso
v011 → set_updated_at_adjuntos (este)
```

El cliente JS **NUNCA** actualiza `updated_at` manualmente — está explícitamente ignorado en `supabase.js:118`.

## 2.2. Supabase Free pausa proyectos inactivos

El proyecto estaba pausado al volver porque pasaron varias semanas sin actividad. Comportamiento normal del plan Free. Se reactivó con un click ("Resume project") en 2-3 minutos. Tiempo disponible para reactivar: hasta 90 días después de la pausa.

**Decisión:** seguir con Free por ahora. Cuando Gabi empiece a usar el sistema en producción real, pasar a Pro (~25 USD/mes) para evitar pausas.

## 2.3. Comportamiento UPDATE/SELECT en policies de Storage

Cuando se elige UPDATE como operación, Supabase **tilda automáticamente SELECT** porque UPDATE requiere leer la fila antes de modificarla. Lo mismo con DELETE. Confirmado por aviso explícito de la UI: *"SELECT has been auto selected as UPDATE and DELETE require it"*.

**Implicancia práctica:** la opción más limpia de crear policies de Storage es una sola policy con las 4 operaciones tildadas (no 4 policies separadas).

## 2.4. Convención del sistema confirmada: RLS + policy abierta

Verificado en el panel de Supabase: TODAS las tablas del schema `public` (candidatos, psicos, preocupacionales, etc.) tienen RLS habilitado + policy "Acceso total" con `USING (true) WITH CHECK (true)`. Es la convención del proyecto, por eso `adjuntos` replica el patrón.

---

# 3. Estado del repo

**Sin cambios en código.** Solo hay un archivo nuevo a commitear: `sql/v011_crear_tabla_adjuntos.sql`.

El proyecto en GitHub sigue en el último commit conocido (`5ec6368` o equivalente — verificar con `git log --oneline -3`).

---

# 4. Pendientes priorizados

## Para la próxima sesión (inmediata)

1. **Commitear el SQL v011** al repo:
   ```
   git add sql/v011_crear_tabla_adjuntos.sql
   git commit -m "feat(sql): crear tabla adjuntos con RLS y trigger updated_at (v011 aplicado en Supabase)"
   git push
   ```

2. **Arrancar implementación del módulo Psicotécnico** (el más simple, todo opcional). Pasos esperados:
   - Agregar el mapeo camel↔snake de los campos de `adjuntos` en `src/shared/supabase.js`.
   - Crear módulo o helpers para subida/lectura/borrado de archivos contra Storage + tabla `adjuntos`.
   - Modificar el modal de Gestión del psicotécnico para incluir la sección "📎 Informe psicotécnico (opcional)".
   - Implementar subida inmediata al seleccionar archivo.
   - Implementar botones "Ver", "Reemplazar", "Eliminar".
   - Probar end-to-end con un candidato de prueba.

## Resto del mini-proyecto (orden sugerido)

3. Pre-ocupacional (con validación obligatoria de apto-medico).
4. Documentación (3 archivos + historial de antecedentes).
5. Alta (4 obligatorios + INAES + renombrado a Soc N al confirmar).
6. Módulo Legajos (tabs + Tab 5 Documentos + carga retroactiva).
7. Alertas y listado "Próximos a vencer".

## Otros pendientes (de sesiones previas)

8. **Netlify desconectado de GitHub.** El sitio público sigue mostrando versión vieja. ~30 min. Hacer antes de mostrar a Gabi.
9. **Mostrarle el flujo a Gabi** y traer feedback. Después de Netlify.

## Pendientes nuevos de Gabi (sesiones futuras)

10. Alerta de cuenta bancaria (Banco Francés).
11. Campo "Nivel de estudios" en legajo.
12. Campo "Experiencia en oficios" en legajo.

## Deudas técnicas (mini-proyecto de "limpieza" propio)

13. DDL faltante de tabla `legajos` (reconstruir + versionar).
14. `nro = max+1` en cliente → secuencia Postgres.
15. Mock de legajos en `legacy.js:6207` + dependencias en liquidación/adelantos.
16. Campo `prelaboral` muerto en psicos.
17. Validación DNI en `guardarEdicionLegajo`.

---

# 5. Lecciones de esta sesión

- **Revisión con cabeza fresca paga.** El SQL del 29/05 parecía completo, pero al revisarlo semanas después detectamos el trigger faltante. El extra de tiempo invertido vale.
- **Aprender RLS antes de aplicar.** No habíamos previsto el aviso de Supabase. Confirmar la convención del sistema (RLS + policy abierta) antes de elegir respuesta evitó una decisión apurada e inconsistente.
- **La UI de Supabase tiene comportamientos automáticos.** UPDATE+SELECT tildados juntos, INSERT con WITH CHECK pero sin USING, etc. Conviene leer el preview antes de Save.
- **Cortar a tiempo evita meter bugs después.** Decidimos no arrancar el módulo Psicotécnico hoy porque tocar código requiere cabeza fresca. Mejor cerrar limpio que avanzar con cansancio.

---

# 6. Cómo retomar la próxima sesión

1. Subir este traspaso al inicio del chat.
2. **Importante:** verificar que el SQL v011 esté commiteado al repo. Si no, hacerlo como primer paso.
3. Confirmar estado del repo: `git log --oneline -3`.
4. Verificar en Supabase que la tabla `adjuntos` sigue ahí y el bucket también (chequeo rápido en SQL Editor: `SELECT count(*) FROM adjuntos`).
5. Levantar entorno (Forma B: dos terminales — Vite + Claude Code).
6. **Arrancar por el módulo Psicotécnico:** primer paso de la implementación. Es el caso más simple, ideal para validar todo el patrón antes de replicarlo en los otros módulos.

---

# 7. Acción inmediata al cerrar esta sesión

Subir al repo:

```
# Mover el SQL a su lugar (si no estaba ahí ya):
mv ~/Descargas/v011_crear_tabla_adjuntos.sql sql/v011_crear_tabla_adjuntos.sql

# Mover este traspaso a docs/:
mv ~/Descargas/TRASPASO_2026-06-17_infra_adjuntos_aplicada.md docs/

# Commit y push:
git add sql/v011_crear_tabla_adjuntos.sql docs/TRASPASO_2026-06-17_infra_adjuntos_aplicada.md
git commit -m "feat(sql): aplicar v011 tabla adjuntos + traspaso sesion 17/06"
git push
```

Y cerrar Vite y Claude Code cuando termines (si los levantaste).

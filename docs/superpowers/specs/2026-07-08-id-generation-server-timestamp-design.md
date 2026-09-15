# Rediseño de IDs y timestamps — CashMap V2

**Fecha:** 2026-07-08
**Estado:** Aprobado, pendiente de implementación

## Contexto

Durante esta sesión se identificaron y parchearon varios bugs de la misma familia:

- Colisión de IDs entre dispositivos (`nextDataId`/`Math.max(Date.now(), ...)` generado localmente en cada dispositivo, sin coordinación)
- Duplicación de registros recurrentes cuando dos dispositivos generan la misma ocurrencia antes de sincronizar entre sí
- Desempates de merge (`mergeMenuRows`, `_mergePrivateRows`) dependientes del reloj de cada dispositivo, vulnerables a desfase de reloj

La raíz común: el cliente genera IDs y confía en su propio reloj (`updatedAt`) sin autoridad central. Este documento propone la solución quirúrgica (no requiere migrar de Google Sheets/GAS ni tocar el sistema de auth actual).

## Alcance

Este cambio cubre:
- Generación de IDs para registros creados por el usuario (transacciones de Inicio, deudas, transacciones de menús personalizados, pagos de deudas, menús)
- Asignación de `updatedAt` en GAS (servidor) en vez de confiar en el reloj del cliente

Fuera de alcance (decidido explícitamente, no se toca):
- Migración a Firestore/Firebase (evaluado y descartado por ahora — ver sección "Alternativas consideradas")
- Migración de datos existentes (ids numéricos actuales permanecen intactos)
- El fix de ocurrencias recurrentes con hash determinista (ya implementado hoy, se mantiene sin cambios)

## Diseño

### 1. Generación de IDs

Dos categorías con reglas distintas:

- **Registros iniciados por el usuario** (crear/editar transacción, deuda, menú, pago, presupuesto): `id = Date.now() * 1e6 + Math.floor(Math.random() * 1e6)` — número grande semi-aleatorio, no `crypto.randomUUID()`. Se descartó UUID (string) durante el diseño de la implementación: los IDs se insertan sin comillas dentro de decenas de atributos `onclick="..."` en toda la app (especialmente `custom-menu.js`), y un string ahí genera un error de sintaxis JS (`openDeudaModal(abc-123-def)`). Auditar y corregir cada uno de esos sitios habría convertido un cambio quirúrgico en un refactor grande de alto riesgo. El número semi-aleatorio evita el problema por completo: sigue siendo un `Number`, cero cambios en ningún `onclick`, y la probabilidad de colisión entre dos dispositivos (mismo milisegundo Y mismo número aleatorio de 0 a 999999) es prácticamente nula.

- **Ocurrencias recurrentes automáticas** (`processRecurringTxs`): se mantiene el hash determinista ya implementado (`_recurringOccurrenceId`, DJB2 de `templateId + fecha`, negativo). Esto es intencional y **no debe cambiarse a UUID aleatorio** — si dos dispositivos generan la misma ocurrencia recurrente antes de sincronizarse, necesitamos que ambos calculen el mismo ID para que el merge los colapse en un solo registro. Un UUID aleatorio rompería esa propiedad y reintroduciría la duplicación.

- **IDs numéricos existentes**: no se migran ni se tocan. Las búsquedas ya son por igualdad (`find(x => x.id === ...)`), por lo que los IDs antiguos (secuenciales/`Date.now()`) y los nuevos (semi-aleatorios grandes) conviven sin conflicto — todos son `Number`, no hay mezcla de tipos.

### 2. Timestamp asignado por el servidor

`Code.gs` (`_pushRows` y `_pushJsonRows`) cambia su lógica de escritura:

- Por cada fila entrante en el push, comparar su contenido (todos los campos excepto `updatedAt`) contra la fila ya almacenada en el Sheet con el mismo `id`.
- Si el contenido es **idéntico** → no escribir nada, ignorar por completo el `updatedAt` entrante. Evita que un push del array completo (patrón actual de `_syncPrivateSheet`/`pushMenuToGas`, que siempre manda todos los registros locales, no solo el editado) pise el timestamp de registros sin cambios reales.
- Si el contenido **difiere** o la fila es **nueva** → escribir con `updatedAt = new Date().toISOString()` calculado en el servidor en ese momento, ignorando cualquier `updatedAt` que el cliente haya enviado.

Esto elimina los bugs de merge causados por desfase de reloj entre dispositivos, sin introducir el riesgo de que un push masivo sobreescriba timestamps de registros no modificados (riesgo identificado y corregido durante el brainstorming — ver "Riesgos considerados").

### 3. Cambios en el cliente

Reemplazar en `js/db.js` y `js/render/deudas.js` los puntos que generan IDs con `Math.max(Date.now(), ...)` o contadores locales:

- `addTx` (Inicio)
- `addMenuTx` (menús personalizados)
- `saveDeuda` (deudas)
- Creación de menús personalizados y menús de deudas compartidas

Todos pasan a `id = Date.now() * 1e6 + Math.floor(Math.random() * 1e6)`. Los contadores `nextDataId`/`nextTxId` quedan vestigiales — antes de eliminarlos, verificar que ningún otro código dependa de que sean numéricos crecientes (por ejemplo, algún cálculo de "próximo id" mostrado en UI).

`processRecurringTxs` no se toca — su generación de ID ya es correcta para su caso de uso.

### 4. Sin migración de datos

No hay script de migración. Los IDs actuales (secuenciales/`Date.now()`) conviven permanentemente con los nuevos (semi-aleatorios grandes) — todos son `Number`, cero cambios en la lógica de búsqueda/edición/borrado ni en los `onclick` existentes.

## Riesgos considerados

- **Cambio de generación de IDs:** riesgo nulo sobre datos existentes — no se reescribe ningún registro actual, solo afecta creaciones futuras. Se descartó UUID (string) por romper decenas de `onclick="..."` que insertan el id sin comillas; el número semi-aleatorio grande evita ese problema por completo (ver sección 1).
- **Timestamp de servidor sin resguardo de contenido:** riesgo real identificado durante el diseño — si GAS estampara `updatedAt = ahora` para *todas* las filas de un push masivo (patrón actual de push-array-completo), cada sync completo bautizaría como "reciente" incluso registros sin cambios, permitiendo que datos viejos de un dispositivo "ganen" sobre ediciones genuinas y recientes de otro dispositivo aún no sincronizado. Mitigado con la comparación de contenido antes de tocar `updatedAt` (sección 2).

## Alternativas consideradas

- **Cambio incremental mínimo (solo IDs del servidor, Sheets igual):** descartado como demasiado limitado — no resolvía el desfase de reloj en el merge.
- **Migración completa a Firestore/Firebase:** resuelve todo de raíz (transacciones atómicas, sync en tiempo real, offline nativo, sin autoconversión de tipos) pero requiere reemplazar GAS+Sheets por completo, reescribir `sync.js` entero, y migrar datos existentes. Estimado en 2-3 días de trabajo con riesgo de migración. Descartado por ahora — se reconsiderará si la app crece a más usuarios/dispositivos o si el polling de 30s deja de ser suficiente.

## Criterios de éxito

- Crear registros simultáneamente offline en 2 dispositivos, sincronizar, confirmar cero colisiones de ID.
- Confirmar que `updatedAt` pulled desde GAS refleja hora de servidor, no la que mandó el cliente, para registros con contenido modificado.
- Confirmar que un push del array completo sin cambios reales no altera `updatedAt` de ningún registro.
- Regresión: ocurrencias recurrentes siguen deduplicando correctamente (sin cambios en esa ruta de código).

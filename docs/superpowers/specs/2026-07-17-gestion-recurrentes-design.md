# Gestión de recurrentes preestablecidos — diseño

## Objetivo

Hoy una "plantilla recurrente" es simplemente cualquier transacción (en Inicio o en un menú) con los campos `recurring`+`recurringNext`. No hay ningún lugar central para verlas, pausarlas, editarlas o borrarlas sin manipular datos a mano por consola — origen directo de los bugs de duplicación de esta sesión (plantillas "Leche" resucitando por dispositivos desincronizados).

Este diseño agrega:
1. Capacidad de **pausar/reanudar** una plantilla sin perder su período.
2. Un **panel central** (Admin → 🔁 Recurrentes) para ver, pausar, editar, eliminar y ver historial de cada plantilla, sin importar si vive en Inicio o en cualquier menú.
3. Poder **crear una plantilla desde cero** ("preestablecerla") sin partir de una transacción ya existente.
4. Un **widget resumen** en Inicio.

No se migra ni se reestructura el modelo de datos existente — se extiende con dos campos opcionales nuevos.

## Modelo de datos (cambios)

```js
// En cualquier tx con recurring:
{
  ...,
  recurring: 'semanal' | 'mensual' | 'anual',
  recurringNext: 'YYYY-MM-DD' | undefined,   // ya existe
  recurringPaused: true | undefined,          // NUEVO — plantilla pausada
  _pausedNext: 'YYYY-MM-DD' | undefined       // NUEVO — guarda recurringNext al pausar, para restaurarlo al reanudar
}

// En ocurrencias generadas por processRecurringTxs():
{
  ...,
  templateId: <id de la plantilla que la generó>  // NUEVO — permite listar historial exacto
}
```

**Regla de pausa:** al pausar, `recurringNext` se mueve a `_pausedNext` y se borra (`processRecurringTxs()` la ignora automáticamente porque exige `recurringNext` truthy — cero cambios de lógica ahí más que agregar `templateId`). Al reanudar: si `_pausedNext` es futuro, se restaura tal cual; si ya quedó en el pasado, se recalcula con `nextOccurrence()` desde hoy (evita ráfaga de ocurrencias atrasadas).

## `processRecurringTxs()` — cambio mínimo

Único cambio: agregar `templateId: t.id` al objeto materializado en ambos loops (Inicio y menús). El filtro de entrada (`t.recurring && t.recurringNext`) no necesita cambiar porque una plantilla pausada ya no tiene `recurringNext`.

## Helper central: `getAllRecurringTemplates()`

Nueva función en `db.js`, escanea `d.inicio` + `d.customMenus[].data` (excluyendo `_deleted`), devuelve array de:

```js
{ id, menuId, menuName, description, amount, type, category, recurring, recurringNext, recurringPaused }
```

Reutilizable tanto por el panel Admin como por el widget de Inicio (solo cuenta).

## Panel Admin "🔁 Recurrentes"

Nuevo botón junto a Usuarios/Categorías/Presupuestos/Menús en el Panel Admin existente.

**Tabla:** Descripción · Monto · Período · Próxima fecha (o badge "⏸ Pausado") · Origen (Inicio / nombre del menú) · Acciones.

**Acciones por fila:**
- **⏸ / ▶ Pausar/Reanudar** — toggle descrito arriba; si el registro vive en un menú compartido, push correspondiente (`onMenuSaved`/`syncPrivateData` según origen).
- **✏️ Editar** — abre el modal de transacción normal ya existente, precargado con los datos de la plantilla. Cambios de monto/categoría/período solo afectan la plantilla (próximas ocurrencias); no toca ocurrencias ya materializadas (son filas independientes).
- **🗑 Eliminar** — usa `deleteTx()` (Inicio) o `deleteMenuTx()` + `pushDeleteToGas()` (menú) — el fix de propagación de borrado ya aplicado esta sesión. No borra las ocurrencias históricas ya generadas.
- **📜 Ver historial** — filtra `{origen}.filter(t => t.templateId === plantilla.id)` ordenado por fecha, muestra en un modal simple de solo lectura.

**Botón "+ Nueva plantilla recurrente":** abre el modal de transacción existente (Inicio o el modal de menú, según selección previa de destino) con el campo Recurrencia forzado/obligatorio. Reutiliza `addTx`/`addMenuTx` sin cambios — si la fecha de inicio ya llegó (hoy o pasado), se crea el primer registro real de inmediato (comportamiento actual sin modificar), y sigue repitiéndose desde ahí.

## Widget en Inicio

Tarjeta o línea sobre el banner de recordatorios existente: "🔁 N plantillas recurrentes activas" (+ "M pausadas" si aplica), con link "Gestionar" que navega directo a Admin → Recurrentes.

## Edge cases

- Plantilla pausada nunca aparece en el banner de recordatorios (`getUpcomingReminders()` ya exige `recurringNext` truthy — gratis).
- Reanudar con fecha pausada vencida → recalcula desde hoy, no dispara backlog.
- Editar período no reconstruye ocurrencias pasadas, solo cambia el cálculo futuro.
- Eliminar plantilla conserva su historial de ocurrencias ya generadas (transacciones independientes, no se tocan).

## Testing

Sin framework de pruebas en este proyecto — verificación manual en navegador: crear plantilla, pausar, reanudar (con fecha vencida y sin vencer), editar monto/período, eliminar, revisar historial, confirmar sync correcto en menú compartido (push/pull en otro dispositivo simulado).

# Historial de compras y mantenimientos — menú Vehículo

**Fecha:** 2026-07-09
**Estado:** Aprobado, pendiente de implementación

## Contexto

El menú tipo "Vehículo" (`menu.menuType === 'vehicle'`) ya gestiona dos tipos de registro dentro de `menu.data[]`, distinguidos por `entryType`:
- `'fuel'` (o sin `entryType`, legado) — cargas de combustible
- `'oil'` — cambios de aceite

El usuario quiere agregar historial de **compras y mantenimientos** del vehículo: reparaciones/taller y repuestos/piezas, que hoy no tienen dónde registrarse.

## Alcance

Agregar un tercer `entryType: 'maintenance'` con dos subtipos (`maintType`), combinados en una sola sección visual de la vista del menú Vehículo. Sin gráficas ni tarjetas de estadística — solo historial editable, igual que ya existe para combustible y aceite.

Fuera de alcance: tipos adicionales (seguro, llantas) — se agregarán después si se piden; gráficas de gasto en mantenimiento.

## Diseño

### 1. Modelo de datos

Nuevo tipo de entrada en `menu.data[]` (mismo array que fuel/oil, mismo patrón de id vía `genId()` a través de `addMenuTx`):

```js
{
  id: <genId()>,
  entryType: 'maintenance',
  maintType: 'reparacion' | 'repuesto',
  date: 'YYYY-MM-DD',
  time: 'HH:mm',           // opcional, mismo campo que ya usan fuel/oil
  cost: <number>,
  odometerKm: <number>,    // opcional
  notes: <string>,         // opcional
  updatedAt: <ISO string>,

  // Si maintType === 'reparacion':
  taller: <string>,
  description: <string>,   // descripción del trabajo realizado

  // Si maintType === 'repuesto':
  pieza: <string>,
  marca: <string>
}
```

### 2. Modal único con campos dinámicos

`#maintenance-modal` en `index.html`, con un `<select>` de Tipo (Reparación/Taller | Repuestos/Piezas) que muestra/oculta los campos específicos según la selección — mismo patrón ya usado en el modal de transacciones (`updateCatOptions()` tras cambiar el tipo).

Campos siempre visibles: Fecha, Hora, Costo, Kilometraje (opcional), Notas (opcional).
Campos condicionales:
- Reparación: Taller, Descripción del trabajo
- Repuesto: Pieza, Marca

### 3. Renderizado — sección combinada "Mantenimiento"

Nueva función `_renderMaintenanceSection(menuId, entries)` en `custom-menu.js`, junto a las ya existentes `_renderFuelHistory`/`_renderOilSection`. Filtra `menu.data` por `entryType === 'maintenance'`, ordena por `date+time` descendente con desempate por `updatedAt` (mismo criterio que el resto de la app, ya corregido en sesiones previas), y renderiza cada fila con:
- Ícono según `maintType`: 🔧 Reparación, ⚙️ Repuesto
- Descripción resumida (taller+descripción, o pieza+marca)
- Costo, fecha/hora, kilometraje si existe
- Botones editar/eliminar (mismo patrón que fuel/oil)

Se agrega esta sección al dispatch de `renderVehicleMenu`, junto a las de fuel/oil.

### 4. Guardado y sincronización

Reutiliza `addMenuTx`/`updateMenuTx`/`deleteMenuTx` (ya generan `id` vía `genId()`, sin cambios necesarios) y `onMenuSaved(menuId)` para push a Drive — mismo mecanismo que fuel/oil ya usan. No requiere cambios en `sync.js` ni en `gas/Code.gs`: estos registros viajan como transacciones normales del menú, ya cubiertas por `_pushRows`/`_pullRows`.

### 5. Sin gráficas ni estadísticas

Por decisión explícita del usuario: solo historial de registros, sin tarjetas de gasto acumulado ni gráfica mensual. Puede agregarse después como extensión separada si se solicita.

## Riesgos considerados

- Ninguno nuevo — reutiliza infraestructura de guardado/sync ya existente y ya corregida (IDs, timestamps). El único código nuevo es de renderizado/UI (modal + sección de historial).

## Criterios de éxito

- Crear un registro de Reparación y uno de Repuesto desde el modal, confirmar que aparecen en la sección "Mantenimiento" combinada, ordenados correctamente por fecha.
- Editar y eliminar un registro de cada subtipo, confirmar que persiste correctamente tras recargar.
- Confirmar que sincroniza a Drive igual que los registros de combustible/aceite (mismo menú compartido).

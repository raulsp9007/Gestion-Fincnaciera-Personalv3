# Recordatorio de recurrentes próximos — diseño

## Objetivo

Avisar al usuario de transacciones recurrentes (`recurring`/`recurringNext`) que van a repetirse pronto, antes de que `processRecurringTxs()` las materialice. Dos canales: banner in-app + notificación local del navegador (opcional).

## Alcance de datos

Recorre:
- `d.inicio[]`
- `d.customMenus[].data[]`

Deudas quedan fuera — no tienen campos `recurring`/`recurringNext`.

## Ventana

Un ítem entra en la lista de recordatorios si:

```
tx.recurring && tx.recurringNext > hoy && tx.recurringNext <= hoy + 3 días
```

`recurringNext <= hoy` ya lo maneja `processRecurringTxs()` (se materializa como transacción real), así que queda fuera de esta ventana.

## Banner (variante B — agrupado)

Ubicación: vista Inicio, arriba de los tabs de mes. Un único banner (no uno por ítem).

Contenido:
- Título: `N recurrentes se repiten pronto` (o singular si N=1)
- Lista: por ítem, descripción, "en X días"/"mañana", y si el ítem viene de un menú personalizado, el nombre del menú entre paréntesis (ej. `Seguro carro (Vehículo)`)
- Botón `✕` (descartar banner completo para esta sesión de recordatorios)
- Botón `🔔 Activar notificaciones` — solo visible si `Notification.permission !== 'granted'`

## Descarte y dedupe

Clave de dedupe por ítem: `${tx.id}:${tx.recurringNext}` — cambia cuando `recurringNext` avanza, así que una ocurrencia descartada/notificada no vuelve a molestar, pero la siguiente sí.

- `localStorage['cashmap_v2_dismissed_reminders']`: array de claves descartadas por el usuario (botón ✕). El banner filtra estas claves de la lista antes de renderizar.
- `localStorage['cashmap_v2_notified_reminders']`: array de claves para las que ya se disparó `Notification`. Evita reenviar la misma notificación en cada carga/poll.

Ambos sets se podan (quitar claves cuyo `recurringNext` ya pasó) para no crecer sin límite.

## Notificación local

- Requiere `Notification` API (soportado en navegador/PWA instalada, no red push).
- Permiso se pide solo al click del botón del banner (`Notification.requestPermission()`), nunca automático al cargar.
- Si `permission === 'granted'`: cada vez que la lista de recordatorios se recalcula (carga de app, y en cada poll de sync si cambia el set), por cada ítem nuevo en ventana cuya clave no esté en `notified_reminders`, dispara `new Notification(title, {body, icon})` y agrega la clave al set.
- Sin service worker push — la notificación solo aparece si hay una pestaña/PWA con la app abierta o recientemente activa. Esto es la limitación aceptada de "notificación local" vs push real (descartado por alcance).

## Hook de integración

En `js/main.js`, `startApp()`, después de `processRecurringTxs()` (línea ~464) y antes de `renderInicio()` (línea ~465): calcular lista de recordatorios y guardarla en variable de módulo; `renderInicio()` renderiza el banner si la lista no está vacía.

También se debe recalcular tras cada poll de sync exitoso (por si llegan recurrentes nuevos de otro dispositivo) — hook en el callback de sync existente.

## Archivos afectados

- `js/db.js` — helper `getUpcomingReminders()` (recorre inicio+menus, aplica ventana+dedupe de descartados)
- `js/render/inicio.js` — render del banner, wiring botón ✕ y botón activar notificaciones
- `js/config.js` / `cashmap_sw.js` — bump versión

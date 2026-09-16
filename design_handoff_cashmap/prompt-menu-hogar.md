# Prompt para Claude Design — Vista de menú "Hogar" (CashMap)

Diseña la vista detalle de un **menú personalizado compartido** llamado "Hogar" dentro de CashMap (app de finanzas familiares). Sigue la paleta **Ink Navy** ya establecida (fondo `#0c1220`, superficie `#131b2e`, acento `#5b8cff`, texto `#e9edf7`/`#8b93ab`, tipografía Space Grotesk).

## Contexto de datos reales

- Menú "Hogar": ícono 🏠, moneda CUP, compartido con otro usuario (rol editor/viewer).
- ~180 movimientos reales: gastos de mercado, pan, leche, medicinas, servicios (agua, electricidad, internet), transporte, y algunos ingresos (salario, ventas, envíos recibidos).
- Categorías con emoji + color propio (ej. 🍞 Pan, 🥛 Leche, 💧 Agua, ⚡ Electricidad, 🚗 Transporte).
- Presupuestos mensuales por categoría (ej. "LecheMia: 2400/4800 CUP, 50%").
- Recurrentes activos dentro de este menú (ej. "LecheDomingo" semanal, 600 CUP).

## Estructura de la pantalla (orden top-to-bottom)

1. **Header**: botón volver, ícono+nombre+moneda+badge "Compartido", acciones (Importar, Acceso, Reporte, Historial, Sync).
2. **Tabs de mes**: pills horizontales scrolleables (sept 2026, ago 2026, ...).
3. **Cards de resumen** (grid 2x2 en mobile): Ingresos, Gastos, Proyección al 30 (con gasto estimado), Saldo total (con arrastrado del mes anterior).
4. **Gráfico "Ingresos vs Gastos"**: barras agrupadas por mes, verde/rojo.
5. **Donut "Gastos por categoría"**: selector de cuántas categorías mostrar (top 8/10/todas) + botón editar colores.
6. **Gráfico "Gastos por semana"**: barras Sem1-Sem4+.
7. **Presupuesto mensual**: barra de progreso por categoría con emoji, monto gastado/límite, botón editar.
8. **Lista de movimientos**: agrupados o en lista plana, cada fila con fecha/hora, monto (signo+color), descripción, chip de categoría (emoji+color), badge "Semanal/Mensual" si es recurrente, acciones editar/eliminar.

## Detalles de estilo

- Cards: radio 16px, fondo `--bg2` (#131b2e), borde 1px `--border` (#232d45).
- Montos: tabular-nums, verde `#4fae7f` ingreso / rojo `#ff8a8a` gasto, negrita.
- Chips de categoría: círculo de color 16-20px + emoji, nunca texto sobre color sólido (mantener contraste).
- Mobile-first: bottom nav + FAB "+" para nueva transacción (oculto si el usuario es viewer).
- Modo oscuro es el único definido — no diseñar variante clara para esta pantalla.

Genera el mockup completo de esta vista, con datos de ejemplo realistas en CUP.

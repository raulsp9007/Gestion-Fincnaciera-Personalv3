'use strict';

// ── Versión y caché — 100% local, sin cuenta ni servidor ──
const APP_VERSION  = 'v3-offline-10';
// Clave propia de V3: V2 vive en el mismo origen (raulsp9007.github.io) y su sync
// borra/reescribe 'cashmap_v2_data'. LEGACY_KEY solo se lee una vez para sembrar.
const CACHE_KEY    = 'cashmap_v3_data';
const LEGACY_KEY   = 'cashmap_v2_data';

// ── Datos por defecto ─────────────────────────────────────
const DEFAULT_DATA = {
  version:     2,
  inicio:      [],
  deudas:      [],
  customMenus: [],
  globalCats:  { inc: {}, exp: {} },
  budgets:     {},
  navOrder:    ['inicio'],
  config:      {}
};

// ── Categorías por defecto — importadas desde v1 live data ─
const DEFAULT_CATS = {
  inc: {
    ingresos:  { label: '💰 Ingresos generales', color: '#4ade80' },
    ventas:    { label: '💱 Ventas',              color: '#06b6d4' },
    envios:    { label: '📦 Envíos recibidos',    color: '#7dd3fc' },
    salario:   { label: '💼 Salario',             color: '#22c55e' },
    freelance: { label: '💻 Freelance/Extra',     color: '#34d399' },
    pension:   { label: '🏦 Pensión/Beneficio',   color: '#c084fc' },
    renta_inc: { label: '🏠 Renta recibida',      color: '#fb923c' },
    bono:      { label: '🎁 Bono/Premio',         color: '#fbbf24' },
    otros_inc: { label: '📌 Otros ingresos',      color: '#94a3b8' },
    ing_cheq:  { label: '💳Chequera',             color: '#a7f3d0' }
  },
  exp: {
    compras:          { label: '🛒 Compras',              color: '#f97316' },
    prestamos:        { label: '🤝 Préstamos',            color: '#f87171' },
    deuda:            { label: '💳 Deuda',                color: '#ef4444' },
    servicios:        { label: '🔧 Servicios',            color: '#60a5fa' },
    otros:            { label: '📌 Otros',                color: '#64748b' },
    internet:         { label: '📡 Internet/Teléfono',   color: '#22d3ee' },
    mercado:          { label: '🛒 Mercado/Despensa',     color: '#a3e635' },
    comida_fuera:     { label: '🍽️ Comida fuera',         color: '#f59e0b' },
    transporte:       { label: '🚗 Transporte',           color: '#a78bfa' },
    salud:            { label: '🏥 Salud/Medicinas',      color: '#f43f5e' },
    educacion:        { label: '📚 Educación',            color: '#818cf8' },
    entrete:          { label: '🎬 Entretenimiento',      color: '#e879f9' },
    ropa:             { label: '👕 Ropa/Calzado',         color: '#f472b6' },
    manten:           { label: '🔧 Mantenimiento',        color: '#9ca3af' },
    deudas_pago:      { label: '💳 Pago de deudas',      color: '#737373' },
    ahorro:           { label: '🏦 Ahorro',               color: '#16a34a' },
    otros_exp:        { label: '📌 Otros gastos',         color: '#475569' },
    spend_eggs:       { label: '🥚Huevo',                 color: '#ca8a04' },
    spend_milk:       { label: '🍼LecheMia',              color: '#bfdbfe' },
    spend_oil:        { label: '🫕Aceite',                color: '#d97706' },
    spend_snacks:     { label: '🍱Merienda',              color: '#f9a8d4' },
    bill_water:       { label: '💧Agua',                  color: '#38bdf8' },
    spend_bread:      { label: '🥖Pan',                   color: '#b45309' },
    spend_sugar:      { label: '🍶Azucar',                color: '#e5e7eb' },
    bill_electricity: { label: '⚡️Electricidad',          color: '#fde047' },
    comida_rap:       { label: '🍔Comida rápida',         color: '#fcd34d' },
    spend_vianda:     { label: '🥗Viandas',               color: '#86efac' },
    spend_rice:       { label: '🍚Arroz',                 color: '#d1fae5' },
    shippment:        { label: '💸Envios',                color: '#c4b5fd' },
    sell:             { label: '💰VentasZelle',           color: '#2dd4bf' },
    moto:             { label: '🏍 Motor',                color: '#a855f7' },
    home_aseo:        { label: '🏠Aseo',                  color: '#5eead4' },
    spend_rent:       { label: '🔑Renta',                 color: '#fca5a5' },
    spend_seccar:     { label: '🚗Seguro/carro',          color: '#93c5fd' },
    spend_seccmed:    { label: '🧑🏼‍⚕️Seguro/medico',       color: '#fb7185' },
    spend_meat:       { label: '🥩Carne',                 color: '#ef4444' }
  }
};

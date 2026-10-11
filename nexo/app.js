/* Nexo · app.js — arranque, router, navegación (móvil y 3 columnas) y ajustes/datos. */

import * as db from './js/db.js';
import {
  h, $, $$, clear, icon, brandLogo, sheet, toast, btn, card, empty, pickFile, download, setCurrency, getCurrency, CURRENCIES, today, isWide,
} from './js/ui.js';
import hoy from './js/hoy.js';
import chat from './js/chat.js';
import finanzas from './js/finanzas.js';
import negocio from './js/negocio.js';
import memoria from './js/memoria.js';
import reuniones from './js/reuniones.js';
import salud from './js/salud.js';
import idiomas from './js/idiomas.js';
import viajes from './js/viajes.js';

/* Orden de la navegación lateral (≥900 px). La barra inferior usa un subconjunto. */
const MODULES = [hoy, chat, finanzas, negocio, memoria, reuniones, salud, idiomas, viajes];
const BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const BOTTOM = ['hoy', 'finanzas', 'chat', 'negocio', 'more'];
const MORE_IDS = ['memoria', 'reuniones', 'salud', 'idiomas', 'viajes'];

const el = {
  main: $('#main'), preview: $('#preview'), title: $('#title'), right: $('#col-right'),
  records: $('#records'), recordsTitle: $('#records-title'), sideNav: $('#side-nav'), bottomNav: $('#bottom-nav'),
  offline: $('#offline-badge'),
};

let watchers = [];
let params = {};
let pendingParams = {};
let routeToken = 0;
let current = hoy;

/* Cada escritura en IndexedDB avisa a los módulos que observan esa tienda. */
db.bus.addEventListener('change', (e) => {
  for (const w of watchers) {
    if (w.stores.includes(e.detail)) { clearTimeout(w.t); w.t = setTimeout(() => w.fn(e.detail), 40); }
  }
});

function makeCtx({ live = true } = {}) {
  return {
    main: el.main,
    preview: el.preview,
    params,
    go: navigate,
    watch(stores, fn) { if (live) watchers.push({ stores: [].concat(stores), fn, t: 0 }); },
  };
}

/* ------------------------------ Router ------------------------------ */
function replay(node) {
  node.classList.remove('view-in');
  void node.offsetWidth;
  node.classList.add('view-in');
}

async function route() {
  const token = ++routeToken;
  const id = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
  const mod = BY_ID[id] || hoy;
  current = mod;
  watchers.forEach((w) => clearTimeout(w.t));
  watchers = [];
  params = pendingParams; pendingParams = {};

  clear(el.main); clear(el.preview); clear(el.records);
  el.title.replaceChildren(icon(mod.icon, 24), mod.title);
  el.right.classList.toggle('mobile-hide', mod.previewOnMobile === false);
  el.recordsTitle.textContent = mod.records ? (mod.recordsTitle || 'Registros') : '';
  document.title = `${mod.title} · Nexo`;
  paintNav(mod.id);

  const ctx = makeCtx();
  try {
    await mod.render(ctx);
    if (token !== routeToken) return;
    if (mod.records && isWide()) await mod.records(el.records, ctx);
  } catch (err) {
    console.error(err);
    if (token === routeToken) {
      clear(el.main).append(card('No se pudo cargar este módulo', {}, h('p', { class: 'muted' }, err.message || String(err))));
    }
  }
  if (token !== routeToken) return;
  replay(el.main); replay(el.preview);
  window.scrollTo(0, 0);
  $('.col-center').scrollTop = 0; $('.col-right').scrollTop = 0;
}

export function navigate(id, p = {}, { transition = false } = {}) {
  const target = `#/${id}`;
  pendingParams = p;
  const apply = () => { if (location.hash !== target) history.pushState(null, '', target); return route(); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (transition && document.startViewTransition && !reduce) document.startViewTransition(apply);
  else apply();
}

/* ------------------------------ Navegación ------------------------------ */
function buildNav() {
  for (const m of MODULES) {
    el.sideNav.append(h('button', { type: 'button', class: 'side-item', dataset: { id: m.id }, onclick: () => navigate(m.id) }, icon(m.icon, 20), m.title));
  }
  const labels = { hoy: 'Hoy', finanzas: 'Finanzas', chat: 'Chat IA', negocio: 'Negocio', more: 'Más' };
  const icons = { hoy: 'calendar', finanzas: 'wallet', chat: 'sparkles', negocio: 'briefcase', more: 'grid' };
  for (const id of BOTTOM) {
    const center = id === 'chat';
    el.bottomNav.append(h('button', {
      type: 'button', class: `nav-btn${center ? ' nav-center' : ''}`, dataset: { id },
      onclick: () => (id === 'more' ? openMore() : navigate(id)),
    },
    center ? h('span', { class: 'orb glow' }, brandLogo(28)) : h('span', { class: 'ind' }, icon(icons[id], 22)),
    h('span', { class: 't' }, labels[id])));
  }
}

function paintNav(id) {
  for (const b of $$('.side-item[data-id]')) b.classList.toggle('active', b.dataset.id === id);
  for (const b of $$('.nav-btn')) {
    const on = b.dataset.id === id || (b.dataset.id === 'more' && MORE_IDS.includes(id));
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  for (const b of $$('.side-item[data-id]')) {
    if (b.dataset.id === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}

/* ------------------------------ Drawers ------------------------------ */
function openMore(active) {
  const s = sheet({
    title: 'Más',
    active,
    tabs: [
      {
        id: 'mod', label: 'Módulos',
        render(body) {
          const grid = h('div', { class: 'tiles' });
          for (const id of MORE_IDS) {
            const m = BY_ID[id];
            grid.append(h('button', { type: 'button', class: 'tile', onclick: () => { s.close(); navigate(id); } }, icon(m.icon, 24), h('span', null, m.title)));
          }
          body.append(grid);
        },
      },
      { id: 'set', label: 'Ajustes', render: renderSettings },
      { id: 'data', label: 'Datos', render: renderData },
    ],
  });
}

function openHistory() {
  const ctx = makeCtx({ live: false });
  sheet({
    title: 'Historial y exportaciones',
    tabs: [
      {
        id: 'hist', label: current.recordsTitle || 'Historial',
        async render(body) {
          if (current.records) await current.records(body, ctx);
          else body.append(empty('Este módulo no tiene historial.', 'history'));
        },
      },
      { id: 'data', label: 'Exportar', render: renderData },
    ],
  });
}

function renderSettings(body) {
  const cur = h('select', { class: 'input', 'aria-label': 'Moneda' }, ...CURRENCIES.map((c) => h('option', { value: c, selected: c === getCurrency() }, c)));
  cur.addEventListener('change', async () => {
    setCurrency(cur.value); await db.setSetting('currency', cur.value); toast(`Moneda: ${cur.value}`); route();
  });
  const name = h('input', { class: 'input', placeholder: 'Tu nombre (para el saludo)', maxlength: 40, autocomplete: 'given-name' });
  db.getSetting('name', '').then((v) => { name.value = v; });
  name.addEventListener('change', async () => { await db.setSetting('name', name.value.trim()); toast('Guardado'); });
  body.append(
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Moneda'), cur),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombre'), name),
    card('Instalar en iPhone', { cls: 'tonal' }, h('p', { class: 'muted small' },
      'En Safari toca Compartir → "Añadir a pantalla de inicio". Nexo se abrirá a pantalla completa y funcionará sin conexión (salvo la IA).')),
    h('p', { class: 'muted small mono' }, 'Nexo · datos solo en este dispositivo (IndexedDB)'),
  );
}

async function shareOrDownload(name, text) {
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  download(name, text);
}

function renderData(body) {
  const usage = h('p', { class: 'muted small mono' }, 'Calculando almacenamiento…');
  navigator.storage?.estimate?.().then((e) => {
    const mb = (n) => (n / 1048576).toFixed(1);
    usage.textContent = `Almacenamiento usado: ${mb(e.usage || 0)} MB de ${mb(e.quota || 0)} MB`;
  }).catch(() => { usage.textContent = ''; });

  const fname = () => `nexo-respaldo-${today()}.json`;
  const exportBtn = btn('Exportar todo (JSON)', { variant: 'primary', icon: 'download', onclick: async () => {
    const text = JSON.stringify(await db.exportAll());
    download(fname(), text); toast('Respaldo descargado');
  } });
  const shareBtn = navigator.canShare ? btn('Compartir / guardar en Archivos', { variant: 'tonal', icon: 'upload', onclick: async () => {
    await shareOrDownload(fname(), JSON.stringify(await db.exportAll()));
  } }) : null;
  const importBtn = btn('Importar respaldo (JSON)', { variant: 'ghost', icon: 'upload', onclick: async () => {
    const file = await pickFile({ accept: 'application/json,.json' });
    if (!file) return;
    try {
      if (file.size > 80 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
      const json = JSON.parse(await file.text());
      if (!confirm('Esto reemplazará TODOS tus datos actuales por los del respaldo. ¿Continuar?')) return;
      const n = await db.importAll(json);
      setCurrency(await db.getSetting('currency', 'USD'));
      toast(`Importados ${n} registros`); route();
    } catch (e) { toast(e.message || 'No se pudo importar', { error: true }); }
  } });
  const wipeBtn = btn('Borrar todos los datos', { variant: 'danger', icon: 'trash', onclick: async () => {
    if (!confirm('¿Borrar TODOS los datos de Nexo en este dispositivo? No se puede deshacer.')) return;
    await db.wipeAll(); setCurrency('USD'); toast('Datos borrados'); route();
  } });
  body.append(usage, h('div', { class: 'form' }, exportBtn, shareBtn, importBtn), h('hr', { class: 'sep' }), wipeBtn);
}

/* ------------------------------ Arranque ------------------------------ */
function paintOnline() {
  const off = !navigator.onLine;
  el.offline.hidden = !off;
  if (off) el.offline.replaceChildren(icon('wifioff', 14), 'sin conexión');
}

async function boot() {
  $('#brand-mark')?.replaceChildren(brandLogo(28));
  $('#mobile-brand-mark')?.replaceChildren(brandLogo(24));
  $('#btn-history').append(icon('history'));
  $('#side-settings').append(icon('settings', 20), 'Ajustes y datos');
  $('#btn-history').addEventListener('click', openHistory);
  $('#side-settings').addEventListener('click', () => openMore('set'));
  buildNav();
  window.addEventListener('online', paintOnline);
  window.addEventListener('offline', paintOnline);
  paintOnline();

  try {
    await db.open();
    setCurrency(await db.getSetting('currency', 'USD'));
    navigator.storage?.persist?.();
  } catch (err) {
    console.error(err);
    el.main.append(card('No se pudo abrir el almacenamiento local', {}, h('p', { class: 'muted' },
      'Nexo guarda todo en IndexedDB. Si estás en navegación privada, ábrelo en una pestaña normal.')));
    return;
  }

  window.addEventListener('popstate', route);
  matchMedia('(min-width: 900px)').addEventListener('change', route);
  route();

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW no registrado:', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('Nexo se actualizó. Reabre la app para ver lo nuevo.');
    });
  }
}

boot();

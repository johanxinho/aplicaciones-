/* Nexo · js/ui.js — helpers compartidos de interfaz.
   Todo el contenido dinámico se inserta con textContent (h()) o pasa por esc()/md(),
   así que nada que venga de la IA o del usuario se ejecuta como HTML. */

import { startRecording, transcribe, fmtDuration } from './ai.js';

/* ------------------------------ DOM ------------------------------ */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function appendKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** h('div', {class:'x', onclick}, 'texto', hijo) — construye nodos sin innerHTML. */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendKids(el, kids);
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  appendKids(el, kids);
  return el;
}

export const clear = (el) => { el.replaceChildren(); return el; };
export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/* ------------------------ Escape y Markdown seguro ------------------------ */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Solo permite http(s) para enlaces escritos por el usuario. */
export function safeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch (_) { return null; }
}

/** Markdown mínimo (títulos, negritas, cursivas, código, listas). Escapa ANTES de formatear. */
export function md(src) {
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  const out = [];
  let list = null; let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(src ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); flushList(); continue; }
    if ((m = /^#{1,4}\s+(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
    if ((m = /^[-*•]\s+(.*)$/.exec(line))) {
      flushPara(); if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara(); if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    flushList(); para.push(inline(line));
  }
  flushPara(); flushList();
  return out.join('');
}
export function setMd(el, text) { el.innerHTML = md(text); return el; }

/* ------------------------------ Iconos ------------------------------ */
const ICONS = {
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18',
  wallet: 'M3 7a2 2 0 0 1 2-2h14v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8H5a2 2 0 0 1-2-2zM16 14h2',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  briefcase: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 6V4h6v2M3 13h18',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6',
  wave: 'M4 12v0M8 8v8M12 4v16M16 9v6M20 11v2',
  heart: 'M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z',
  languages: 'M5 8h8M9 4v4M7 8c0 4 3 7 6 8M11 8c0 3-3 6-6 8M13 20l4-9 4 9M14.5 17h5',
  plane: 'M21 3l-18 7.5 7 2.5 2.5 7z',
  settings: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  history: 'M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  stop: 'M6 6h12v12H6z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 15V3M7 8l5-5 5 5M4 21h16',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  chevron: 'M9 6l6 6-6 6',
  users: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  dumbbell: 'M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  utensils: 'M5 3v8a2 2 0 0 0 2 2v8M9 3v8M7 3v8M17 3c-2 2-2 6 0 8v10',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  wifioff: 'M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.3-1.7M12 20h0',
};

export function icon(name, size = 20) {
  return svg('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon',
  }, svg('path', { d: ICONS[name] || ICONS.sparkles }));
}

export function brandLogo(size = 28) {
  const el = svg('svg', {
    width: size, height: size, viewBox: '0 0 100 100', fill: 'none', class: 'brand-logo-svg',
  });
  el.innerHTML = `
    <defs>
      <linearGradient id="bl-l" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38BDF8"/>
        <stop offset="50%" stop-color="#6366F1"/>
        <stop offset="100%" stop-color="#4F46E5"/>
      </linearGradient>
      <linearGradient id="bl-d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#818CF8"/>
        <stop offset="50%" stop-color="#A855F7"/>
        <stop offset="100%" stop-color="#EC4899"/>
      </linearGradient>
      <linearGradient id="bl-r" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#9333EA"/>
        <stop offset="50%" stop-color="#C084FC"/>
        <stop offset="100%" stop-color="#38BDF8"/>
      </linearGradient>
    </defs>
    <path d="M 24 76 L 24 32 C 24 26 31 23 35 27 L 41 33 C 43 35 44 38 44 41 L 44 76 C 44 80 39 82 36 79 L 26 79 C 24.9 79 24 77.7 24 76 Z" fill="url(#bl-l)"/>
    <path d="M 76 24 L 76 68 C 76 74 69 77 65 73 L 59 67 C 57 65 56 62 56 59 L 56 24 C 56 20 61 18 64 21 L 74 21 C 75.1 21 76 22.3 76 24 Z" fill="url(#bl-r)"/>
    <path d="M 25 31 C 23.5 28.5 26.5 25.5 29 27.5 L 75 69 C 76.5 71.5 73.5 74.5 71 72.5 L 25 31 Z" fill="url(#bl-d)"/>
    <g transform="translate(50, 50)">
      <path d="M 0 -8 Q 1 -1 8 0 Q 1 1 0 8 Q -1 1 -8 0 Q -1 -1 0 -8 Z" fill="#FFFFFF"/>
      <circle cx="0" cy="0" r="1.5" fill="#FFFFFF"/>
    </g>
  `;
  return el;
}

/* ------------------------- Fechas, dinero, formato ------------------------- */
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd();
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);
export const monthKey = (s = today()) => s.slice(0, 7);
export function addMonths(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const daysInMonth = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const fmtDate = (s) => parseYmd(s).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
export const fmtDateLong = (d = new Date()) => d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtMonth = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); };
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (ts) => `${fmtDate(ymd(new Date(ts)))} · ${fmtTime(ts)}`;
export function relDays(s) {
  const n = diffDays(s, today());
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

const SYMBOLS = { USD: '$', MXN: '$', COP: '$', ARS: '$', CLP: '$', EUR: '€', GBP: '£', PEN: 'S/', BRL: 'R$' };
let currency = 'USD';
export const CURRENCIES = Object.keys(SYMBOLS);
export const setCurrency = (c) => { if (SYMBOLS[c]) currency = c; };
export const getCurrency = () => currency;
export function money(n, { sign = false } = {}) {
  const v = Number(n) || 0;
  const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = v < 0 ? '-' : (sign && v > 0 ? '+' : '');
  return `${s}${SYMBOLS[currency]}${body}`;
}

/* ------------------------------ Componentes ------------------------------ */
export function btn(label, { variant = 'tonal', icon: ic, onclick, type = 'button', title, disabled } = {}) {
  return h('button', { type, class: `btn ${variant}`, onclick, title, 'aria-label': title, disabled },
    ic ? icon(ic, 18) : null, label ? h('span', null, label) : null);
}
export function chip(label, { active = false, onclick, icon: ic } = {}) {
  return h('button', { type: 'button', class: `chip${active ? ' active' : ''}`, 'aria-pressed': String(active), onclick },
    ic ? icon(ic, 16) : null, label);
}
export function card(title, opts = {}, ...kids) {
  const { actions, cls = '', sub } = opts;
  return h('section', { class: `card ${cls}` },
    (title || actions) ? h('header', { class: 'card-head' },
      h('div', null, title ? h('h3', null, title) : null, sub ? h('p', { class: 'muted small' }, sub) : null),
      actions ? h('div', { class: 'card-actions' }, actions) : null) : null,
    ...kids);
}
export function empty(text, ic = 'sparkles') {
  return h('div', { class: 'empty' }, icon(ic, 28), h('p', null, text));
}
export function pillTabs({ tabs, active, onChange }) {
  const wrap = h('div', { class: 'pilltabs', role: 'tablist' });
  const paint = (id) => {
    for (const b of wrap.children) {
      const on = b.dataset.id === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
  };
  for (const t of tabs) {
    wrap.append(h('button', {
      type: 'button', role: 'tab', class: 'pilltab', dataset: { id: t.id },
      onclick: () => { paint(t.id); onChange(t.id); },
    }, t.label));
  }
  paint(active || tabs[0].id);
  return wrap;
}

export function toast(msg, { error = false } = {}) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.className = `show${error ? ' error' : ''}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = ''; }, error ? 4200 : 2400);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); }
  catch (_) {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Copiado'); } catch (e) { toast('No se pudo copiar', { error: true }); }
    ta.remove();
  }
}

/** Abre el selector de archivos/cámara. Resuelve con el File o null si se cancela. */
export function pickFile({ accept = 'image/*', capture } = {}) {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept, capture, style: { display: 'none' } });
    i.addEventListener('change', () => { resolve(i.files[0] || null); i.remove(); });
    i.addEventListener('cancel', () => { resolve(null); i.remove(); });
    document.body.append(i);
    i.click();
  });
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------ Bottom sheet / drawer ------------------------ */
const wideMQ = window.matchMedia('(min-width: 900px)');
export const isWide = () => wideMQ.matches;

/**
 * Panel secundario: bottom sheet en móvil, drawer lateral desde 900 px (solo CSS).
 * tabs: [{id,label,render(el)}] con pestañas píldora, o bien content(el)/Node.
 */
export function sheet({ title, tabs, content, active }) {
  const scrim = h('div', { class: 'scrim' });
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => close() }, icon('x'));
  const grip = h('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
  const head = h('header', { class: 'sheet-head' }, h('h2', null, title), closeBtn);
  const el = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' }, grip, head);
  let tabsEl = null;
  const show = (id) => { clear(body); tabs.find((t) => t.id === id).render(body); };
  if (tabs && tabs.length) {
    tabsEl = pillTabs({ tabs, active, onChange: show });
    el.append(tabsEl);
  }
  el.append(body);
  document.body.append(scrim, el);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => { scrim.classList.add('open'); el.classList.add('open'); el.focus({ preventScroll: true }); });

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    scrim.classList.remove('open'); el.classList.remove('open');
    setTimeout(() => { scrim.remove(); el.remove(); }, 260);
  }
  scrim.addEventListener('click', close);

  // Arrastrar hacia abajo para cerrar (solo bottom sheet)
  let y0 = null;
  const start = (e) => { if (!isWide()) y0 = e.touches[0].clientY; };
  const move = (e) => { if (y0 == null) return; const dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; el.style.transition = 'none'; };
  const end = (e) => {
    if (y0 == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? y0) - y0; y0 = null;
    el.style.transition = ''; el.style.transform = '';
    if (dy > 90) close();
  };
  for (const t of [grip, head]) {
    t.addEventListener('touchstart', start, { passive: true });
    t.addEventListener('touchmove', move, { passive: true });
    t.addEventListener('touchend', end);
  }

  if (tabs && tabs.length) show(active || tabs[0].id);
  else if (typeof content === 'function') content(body);
  else if (content) body.append(content);
  return { el, body, close };
}

/* ---------------- Modal de confirmación con glow (campos editables) ---------------- */
function buildField(f) {
  let control;
  if (f.type === 'select') {
    control = h('select', { name: f.name }, ...f.options.map((o) => {
      const v = typeof o === 'object' ? o.value : o;
      return h('option', { value: v, selected: v === f.value }, typeof o === 'object' ? o.label : o);
    }));
  } else if (f.type === 'textarea') {
    control = h('textarea', { name: f.name, rows: f.rows || 3, placeholder: f.placeholder, value: f.value ?? '' });
  } else if (f.type === 'checkbox') {
    control = h('input', { name: f.name, type: 'checkbox', checked: !!f.value });
  } else {
    control = h('input', {
      name: f.name, type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder,
      step: f.step, min: f.min, max: f.max, inputmode: f.inputmode, autocomplete: 'off', enterkeyhint: 'done',
    });
  }
  control.classList.add('input');
  if (f.mono) control.classList.add('mono');
  return h('label', { class: `field${f.type === 'checkbox' ? ' inline' : ''}` }, h('span', { class: 'field-label' }, f.label), control);
}

export function readFields(root) {
  const out = {};
  for (const c of $$('[name]', root)) {
    if (c.type === 'checkbox') out[c.name] = c.checked;
    else if (c.type === 'number') out[c.name] = c.value === '' ? null : parseFloat(c.value);
    else out[c.name] = c.value.trim();
  }
  return out;
}

/**
 * Modal con borde luminoso. fields: [{name,label,type,value,options,required,...}].
 * onConfirm(values) puede ser async; si lanza, el modal sigue abierto.
 */
export function modal({ title, subtitle, content, fields = [], confirmText = 'Guardar', cancelText = 'Cancelar', onConfirm, onCancel }) {
  const scrim = h('div', { class: 'scrim modal-scrim' });
  const form = h('form', { class: 'modal-form', novalidate: true }, ...(content ? [content] : []), ...fields.map(buildField));
  const okBtn = h('button', { type: 'submit', class: 'btn primary' }, h('span', null, confirmText));
  const noBtn = h('button', { type: 'button', class: 'btn ghost' }, h('span', null, cancelText));
  const el = h('div', { class: 'modal glow', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'modal-head' }, h('h2', null, title), subtitle ? h('p', { class: 'muted small' }, subtitle) : null),
    h('div', { class: 'modal-body' }, form),
    h('footer', { class: 'modal-actions' }, noBtn, okBtn));
  // Los botones del footer están fuera del <form>: se enlazan por eventos más abajo.
  okBtn.type = 'button';
  document.body.append(scrim, el);
  const onKey = (e) => { if (e.key === 'Escape') cancel(); };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => { scrim.classList.add('open'); el.classList.add('open'); $('.input', el)?.focus({ preventScroll: true }); });

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    scrim.classList.remove('open'); el.classList.remove('open');
    setTimeout(() => { scrim.remove(); el.remove(); }, 260);
  }
  function cancel() { close(); onCancel && onCancel(); }

  async function confirm() {
    const values = readFields(form);
    for (const f of fields) {
      if (f.required && (values[f.name] == null || values[f.name] === '' || (typeof values[f.name] === 'number' && Number.isNaN(values[f.name])))) {
        toast(`Completa: ${f.label}`, { error: true });
        $(`[name="${f.name}"]`, form)?.focus();
        return;
      }
    }
    okBtn.disabled = true; noBtn.disabled = true;
    try { await onConfirm(values); close(); }
    catch (e) { toast(e.message || 'No se pudo guardar', { error: true }); okBtn.disabled = false; noBtn.disabled = false; }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); confirm(); });
  okBtn.addEventListener('click', confirm);
  noBtn.addEventListener('click', cancel);
  scrim.addEventListener('click', cancel);
  return { el, close, form };
}

/* ------------------------- Cuadro de prompt con glow ------------------------- */
/**
 * onSubmit(text) → puede ser async; devolver false conserva el texto escrito.
 * voice: añade micrófono (graba, transcribe con Gemini y pone el texto en el cuadro).
 */
export function aiBox({ placeholder = 'Escribe…', onSubmit, voice = true, rows = 1, autoSendVoice = false, big = false, label = 'Enviar' }) {
  const input = h('textarea', { rows, placeholder, 'aria-label': placeholder, enterkeyhint: 'send', maxlength: 2000 });
  const timeEl = h('span', { class: 'mono rec-time', hidden: true });
  const send = h('button', { type: 'submit', class: 'icon-btn primary round', 'aria-label': label }, icon('send'));
  const mic = voice ? h('button', { type: 'button', class: 'icon-btn round', 'aria-label': 'Dictar por voz' }, icon('mic')) : null;
  const form = h('form', { class: `aibox glow${big ? ' big' : ''}` },
    input, h('div', { class: 'aibox-row' }, timeEl, h('span', { class: 'grow' }), mic, send));
  let busy = false; let rec = null;

  const fit = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; };
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  const setBusy = (b) => {
    busy = b;
    form.classList.toggle('is-thinking', b);
    send.disabled = b; if (mic && !rec) mic.disabled = b;
  };

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const keep = await onSubmit(text);
      if (keep !== false) { input.value = ''; fit(); }
    } catch (e) {
      toast(e.message || 'Algo salió mal', { error: true });
    } finally { setBusy(false); }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  if (mic) {
    mic.addEventListener('click', async () => {
      if (busy && !rec) return;
      if (rec) { rec.stop(); return; }
      try {
        rec = await startRecording({
          maxMs: 120000,
          onTick: (ms) => { timeEl.hidden = false; timeEl.textContent = fmtDuration(ms); },
        });
      } catch (e) { toast(e.message, { error: true }); return; }
      mic.classList.add('recording'); mic.replaceChildren(icon('stop'));
      const current = rec;
      const result = await current.finished;
      rec = null;
      mic.classList.remove('recording'); mic.replaceChildren(icon('mic')); timeEl.hidden = true;
      setBusy(true);
      try {
        const text = await transcribe(result, { analyze: 'plain' });
        if (text) { input.value = (input.value ? `${input.value} ` : '') + String(text).trim(); fit(); }
        setBusy(false);
        if (autoSendVoice && input.value.trim()) form.requestSubmit();
      } catch (e) { setBusy(false); toast(e.message, { error: true }); }
    });
  }
  return { el: form, input, setBusy, focus: () => input.focus(), submit: () => form.requestSubmit() };
}

/* --------------------------------- Gráficas SVG --------------------------------- */
/** Una sola familia de color (acento) + neutros: coherente con el sistema de diseño. */
export const PALETTE = ['#8C9BFF', '#6F7CFF', '#B39BFF', '#4F8CFF', '#C9CFFF', '#7A5CFF', '#9AA3FF', '#5865E8', '#A7A7B5'];

export function donut(items, { size = 168, thick = 22, top = '', bottom = '' } = {}) {
  const total = sum(items, (i) => i.value);
  const r = (size - thick) / 2; const c = size / 2; const circ = 2 * Math.PI * r;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: 'chart donut', role: 'img', 'aria-label': 'Distribución por categoría' },
    svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': thick }));
  let acc = 0;
  if (total > 0) {
    items.forEach((it, i) => {
      const frac = it.value / total; const len = Math.max(0, frac * circ - (items.length > 1 ? 2 : 0));
      root.append(svg('circle', {
        cx: c, cy: c, r, fill: 'none', stroke: it.color || PALETTE[i % PALETTE.length], 'stroke-width': thick,
        'stroke-dasharray': `${len} ${circ - len}`, 'stroke-dashoffset': -acc * circ, transform: `rotate(-90 ${c} ${c})`, 'stroke-linecap': 'butt',
      }));
      acc += frac;
    });
  }
  root.append(
    svg('text', { x: c, y: c - 4, 'text-anchor': 'middle', class: 'chart-top' }, top),
    svg('text', { x: c, y: c + 16, 'text-anchor': 'middle', class: 'chart-bottom' }, bottom));
  return root;
}

export function bars(items, { height = 120, color = 'var(--accent)', format = (v) => String(Math.round(v)) } = {}) {
  const n = Math.max(items.length, 1); const bw = 26; const gap = 10; const w = n * (bw + gap) + gap;
  const max = Math.max(1, ...items.map((i) => i.value));
  const root = svg('svg', { viewBox: `0 0 ${w} ${height + 30}`, class: 'chart bars', role: 'img', 'aria-label': 'Gráfica de barras' });
  items.forEach((it, i) => {
    const bh = Math.max(2, (it.value / max) * (height - 16)); const x = gap + i * (bw + gap);
    root.append(
      svg('rect', { x, y: height - bh, width: bw, height: bh, rx: 8, fill: it.color || color, opacity: it.value ? 1 : 0.25 }),
      svg('text', { x: x + bw / 2, y: height - bh - 5, 'text-anchor': 'middle', class: 'chart-val' }, it.value ? format(it.value) : ''),
      svg('text', { x: x + bw / 2, y: height + 16, 'text-anchor': 'middle', class: 'chart-label' }, it.label));
  });
  return root;
}

/** series: [{values:number|null[], color, dashed, area}] con el mismo largo. */
export function lineChart({ series, w = 320, h: hh = 130, labels = [], zero = false, format = (v) => String(Math.round(v)) }) {
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  let min = Math.min(...all, zero ? 0 : Infinity); let max = Math.max(...all, zero ? 0 : -Infinity);
  if (!all.length) { min = 0; max = 1; }
  if (min === max) { min -= 1; max += 1; }
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const X = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * (hh - pad.t - pad.b);
  const root = svg('svg', { viewBox: `0 0 ${w} ${hh}`, class: 'chart line', role: 'img', 'aria-label': 'Gráfica de línea' });
  const gid = `g${Math.random().toString(36).slice(2, 8)}`;
  root.append(svg('defs', null, svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
    svg('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': 0.35 }),
    svg('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': 0 }))));
  if (zero && min < 0 && max > 0) {
    root.append(svg('line', { x1: pad.l, x2: w - pad.r, y1: Y(0), y2: Y(0), class: 'chart-grid' }));
  }
  for (const s of series) {
    let d = ''; let started = false; let first = null; let last = null;
    s.values.forEach((v, i) => {
      if (v == null) { started = false; return; }
      d += `${started ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)} `; started = true;
      if (first == null) first = i; last = i;
    });
    if (!d) continue;
    if (s.area && first != null) {
      root.append(svg('path', { d: `${d} L${X(last).toFixed(1)} ${hh - pad.b} L${X(first).toFixed(1)} ${hh - pad.b} Z`, fill: `url(#${gid})` }));
    }
    root.append(svg('path', {
      d, fill: 'none', stroke: s.color || 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'stroke-dasharray': s.dashed ? '4 5' : null,
    }));
    if (s.dot != null && s.values[s.dot] != null) {
      root.append(svg('circle', { cx: X(s.dot), cy: Y(s.values[s.dot]), r: 4, fill: s.color || 'var(--accent)' }));
    }
  }
  if (labels.length) {
    labels.forEach((t, i) => {
      const x = labels.length === 1 ? w / 2 : pad.l + (i / (labels.length - 1)) * (w - pad.l - pad.r);
      root.append(svg('text', { x, y: hh - 6, 'text-anchor': i === 0 ? 'start' : (i === labels.length - 1 ? 'end' : 'middle'), class: 'chart-label' }, t));
    });
  }
  root.append(
    svg('text', { x: w - pad.r, y: 10, 'text-anchor': 'end', class: 'chart-val' }, format(max)));
  return root;
}

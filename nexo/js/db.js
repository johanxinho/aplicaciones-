/* Nexo · db.js — IndexedDB, eventos de cambio, exportar/importar y compresión de fotos */

const DB_NAME = 'nexo';
const DB_VERSION = 1;

/** Todas las tiendas. 'kv' guarda ajustes (keyPath "key"); el resto usa id autoincremental. */
export const STORES = [
  'tasks', 'tx', 'subs', 'goals', 'habits', 'habitlogs', 'followups',
  'clients', 'quotes', 'reminders', 'notes', 'meetings',
  'routines', 'sets', 'meals', 'cards', 'langlog', 'trips', 'chat', 'kv',
];

/** Cada escritura emite 'change' con el nombre de la tienda en detail. */
export const bus = new EventTarget();
const emit = (store) => bus.dispatchEvent(new CustomEvent('change', { detail: store }));

let dbPromise = null;

export function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) {
            d.createObjectStore(s, s === 'kv' ? { keyPath: 'key' } : { keyPath: 'id', autoIncrement: true });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
    });
  }
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    let out;
    const rq = fn(t.objectStore(store));
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
  }));
}

export const all = (store) => run(store, 'readonly', (o) => o.getAll()).then((r) => r || []);
export const get = (store, id) => run(store, 'readonly', (o) => o.get(id));

/** Inserta o actualiza. Devuelve el mismo objeto con su id asignado. */
export async function put(store, obj) {
  const key = await run(store, 'readwrite', (o) => o.put(obj));
  if (store !== 'kv' && obj.id == null) obj.id = key;
  emit(store);
  return obj;
}

export async function del(store, id) {
  await run(store, 'readwrite', (o) => o.delete(id));
  emit(store);
}

export async function clear(store) {
  await run(store, 'readwrite', (o) => o.clear());
  emit(store);
}

/* ---- Ajustes (tienda kv) ---- */
export async function getSetting(key, fallback) {
  const r = await get('kv', key);
  return r ? r.value : fallback;
}
export const setSetting = (key, value) => put('kv', { key, value });

/* ---- Exportar / importar ---- */
const MAX_IMPORT_BYTES = 80 * 1024 * 1024;

export async function exportAll() {
  const data = {};
  for (const s of STORES) data[s] = await all(s);
  return { app: 'nexo', version: DB_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Reemplaza todo el contenido con el de un respaldo, conservando los ids (relaciones). */
export async function importAll(json) {
  if (!json || json.app !== 'nexo' || typeof json.data !== 'object' || json.data === null) {
    throw new Error('El archivo no es un respaldo válido de Nexo.');
  }
  const approx = JSON.stringify(json).length;
  if (approx > MAX_IMPORT_BYTES) throw new Error('El respaldo es demasiado grande.');
  const known = STORES.filter((s) => Array.isArray(json.data[s]));
  for (const s of known) {
    for (const item of json.data[s]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Datos corruptos en "${s}".`);
      if (s === 'kv' ? typeof item.key !== 'string' : false) throw new Error('Ajuste corrupto.');
    }
  }
  const d = await open();
  await new Promise((resolve, reject) => {
    const t = d.transaction(known, 'readwrite');
    for (const s of known) {
      const o = t.objectStore(s);
      o.clear();
      for (const item of json.data[s]) o.put(item);
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Importación cancelada'));
  });
  known.forEach(emit);
  return known.reduce((n, s) => n + json.data[s].length, 0);
}

export async function wipeAll() {
  for (const s of STORES) await clear(s);
}

/* ---- Fotos: se comprimen antes de guardar y de enviar a la IA ---- */
export function compressImage(file, { max = 1280, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || 'image/jpeg')) return reject(new Error('El archivo no es una imagen.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, w, h);
      x.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

/** Miniatura pequeña (para listas y para guardar muchas fotos sin llenar el almacenamiento). */
export const thumbnail = (file) => compressImage(file, { max: 320, quality: 0.6 });

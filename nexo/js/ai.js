/* Nexo · js/ai.js — cliente del endpoint /api/ai y grabación de audio.
   No contiene claves: todo pasa por la Pages Function. */

export class AIError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'AIError'; this.status = status; }
}

/* Estado "pensando": intensifica el glow de toda la interfaz mientras haya llamadas activas. */
let pending = 0;
export function setThinking(on) {
  pending = Math.max(0, pending + (on ? 1 : -1));
  document.body.classList.toggle('ai-thinking', pending > 0);
}

/** Llama a la función de servidor. Devuelve { mode, model, text } o { mode, model, data }. */
export async function ask(mode, payload = {}, { signal } = {}) {
  if (!navigator.onLine) throw new AIError('Sin conexión: la IA necesita internet. El resto de Nexo funciona sin conexión.');
  setThinking(true);
  try {
    let res;
    try {
      res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...payload }),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new AIError('No se pudo conectar con el servidor.');
    }
    let body = null;
    try { body = await res.json(); } catch (_) { /* respuesta no JSON */ }
    if (!res.ok) {
      if ([404, 405, 501].includes(res.status) && !body) {
        throw new AIError('El backend /api/ai no está disponible. Usa "wrangler pages dev" en local o despliega en Cloudflare Pages.', res.status);
      }
      throw new AIError(body?.error || `Error del servidor (${res.status}).`, res.status);
    }
    return body;
  } finally {
    setThinking(false);
  }
}

/** "data:image/jpeg;base64,XXXX" → { mime, data } */
export function toPayload(dataUrl) {
  const m = /^data:([^;,]+)[^,]*;base64,(.*)$/s.exec(dataUrl || '');
  if (!m) throw new AIError('Archivo no válido.');
  return { mime: m[1], data: m[2] };
}

/** Atajo para el modo chat. Devuelve texto (o el objeto JSON según la tarea). */
export async function chat(text, { context, history, task, image } = {}) {
  const r = await ask('chat', {
    text, context, history,
    image: image ? toPayload(image) : undefined,
    options: task ? { task } : undefined,
  });
  return r.data ?? r.text;
}

/* -------------------------------- Audio -------------------------------- */
const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
export const MAX_AUDIO_B64 = 6_000_000; // debe coincidir con el límite del servidor

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new AIError('No se pudo leer el audio.'));
  r.readAsDataURL(blob);
});

/**
 * Empieza a grabar. Devuelve { stop(), finished } donde `finished` resuelve con
 * { blob, mime, durationMs, dataUrl } al parar (manualmente o al llegar a maxMs).
 */
export async function startRecording({ maxMs = 600000, onTick } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new AIError('Este navegador no permite grabar audio.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    throw new AIError(e.name === 'NotAllowedError'
      ? 'Permiso de micrófono denegado. Actívalo en Ajustes → Safari → Micrófono (requiere HTTPS).'
      : 'No se pudo acceder al micrófono.');
  }
  const mime = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
  const chunks = [];
  const t0 = Date.now();
  let timer; let auto;
  let resolveDone;
  const raw = new Promise((r) => { resolveDone = r; });

  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    clearInterval(timer); clearTimeout(auto);
    stream.getTracks().forEach((t) => t.stop());
    const type = rec.mimeType || mime || 'audio/mp4';
    resolveDone({ blob: new Blob(chunks, { type }), mime: type.split(';')[0], durationMs: Date.now() - t0 });
  };
  rec.start(1000);
  timer = setInterval(() => onTick && onTick(Date.now() - t0), 250);
  auto = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, maxMs);

  const finished = raw.then(async (r) => ({ ...r, dataUrl: await blobToDataUrl(r.blob) }));
  return { finished, stop() { if (rec.state !== 'inactive') rec.stop(); return finished; } };
}

/** Envía una grabación a Gemini. analyze: 'plain' | 'meeting' | 'tutor'. */
export async function transcribe(recording, options = {}) {
  const { mime, data } = toPayload(recording.dataUrl);
  if (data.length > MAX_AUDIO_B64) throw new AIError('La grabación es demasiado larga para enviarla.');
  const r = await ask('transcribe', { audio: { mime, data }, options });
  return r.data ?? r.text;
}

export const fmtDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

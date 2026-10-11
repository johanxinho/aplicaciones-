/* Nexo · js/memoria.js
   Módulo de Memoria:
   - Notas, fotos, audios, enlaces y documentos escaneados.
   - Búsqueda en lenguaje natural con IA (cruza el índice de notas) y por etiquetas.
   - Escáner de documentos con IA (extrae título, descripción, texto completo y etiquetas).
   - Grabación de notas de voz con transcripción automática. */

import * as db from './db.js';
import * as ai from './ai.js';
import { notesIndex } from './context.js';
import {
  h, clear, icon, btn, card, empty, modal, toast, today, fmtDate, fmtDateTime,
  copyText, pickFile, safeUrl, setMd, esc,
} from './ui.js';

export default {
  id: 'memoria',
  title: 'Memoria',
  icon: 'file',
  recordsTitle: 'Notas y Recuerdos',

  async render(ctx) {
    const { main, preview, watch } = ctx;

    let activeTag = null;
    let aiSearchResult = null;
    let localQuery = '';

    watch('notes', () => renderAll());

    async function renderAll() {
      const notes = (await db.all('notes')).sort((a, b) => (b.createdAt || b.id) - (a.createdAt || a.id));

      clear(main);
      clear(preview);

      /* ---------------- 1. Barra de Búsqueda y Acciones Rápidas ---------------- */
      const searchInput = h('input', {
        class: 'input',
        placeholder: 'Buscar notas o preguntar a la IA ("dónde guardé…")…',
        value: localQuery,
        enterkeyhint: 'search',
        autocomplete: 'off',
      });

      const searchBtn = btn('Buscar', {
        variant: 'tonal',
        icon: 'search',
        onclick: () => doSearch(),
      });

      const aiSearchBtn = btn('IA', {
        variant: 'primary',
        icon: 'sparkles',
        title: 'Búsqueda inteligente con IA',
        onclick: () => doAiSearch(),
      });

      const searchBar = h('div', { class: 'field-row' },
        searchInput,
        searchBtn,
        aiSearchBtn,
      );

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSearch();
        }
      });
      searchInput.addEventListener('input', () => {
        localQuery = searchInput.value.trim();
        if (!localQuery && !aiSearchResult) renderNotesList();
      });

      async function doSearch() {
        localQuery = searchInput.value.trim();
        aiSearchResult = null;
        renderNotesList();
      }

      async function doAiSearch() {
        const q = searchInput.value.trim();
        if (!q) {
          toast('Escribe una pregunta para la IA', { error: true });
          searchInput.focus();
          return;
        }
        if (!notes.length) {
          toast('No tienes notas guardadas aún', { error: true });
          return;
        }
        toast('Gemini buscando en tu memoria…');
        try {
          const index = await notesIndex(150);
          const res = await ai.ask('chat', {
            text: q,
            context: index,
            options: { task: 'search' },
          });
          const data = res.data || {};
          aiSearchResult = {
            answer: data.answer || 'Búsqueda completada.',
            ids: Array.isArray(data.ids) ? data.ids : [],
          };
          renderNotesList();
        } catch (err) {
          toast(err.message || 'Error en búsqueda con IA', { error: true });
        }
      }

      /* Botones de Captura Rápida */
      const captureRow = h('div', { class: 'chips' },
        btn('Nota', { variant: 'tonal', icon: 'file', onclick: () => createTextNote() }),
        btn('Escanear Doc', { variant: 'primary', icon: 'scan', onclick: () => scanDocument() }),
        btn('Foto', { variant: 'tonal', icon: 'camera', onclick: () => addPhotoNote() }),
        btn('Audio', { variant: 'tonal', icon: 'mic', onclick: () => recordAudioNote() }),
        btn('Enlace', { variant: 'tonal', icon: 'link', onclick: () => addLinkNote() }),
      );

      const topCard = card(null, {}, searchBar, captureRow);
      main.append(topCard);

      /* ---------------- 2. Filtro por Etiquetas ---------------- */
      const allTags = [...new Set(notes.flatMap((n) => n.tags || []))].filter(Boolean).sort();
      const tagChips = h('div', { class: 'chips' });

      const allChip = btn('Todas', {
        variant: activeTag === null ? 'primary' : 'ghost',
        sm: true,
        onclick: () => { activeTag = null; renderNotesList(); },
      });
      tagChips.append(allChip);

      allTags.forEach((tag) => {
        const c = btn(`#${tag}`, {
          variant: activeTag === tag ? 'primary' : 'ghost',
          sm: true,
          onclick: () => {
            activeTag = activeTag === tag ? null : tag;
            renderNotesList();
          },
        });
        tagChips.append(c);
      });

      if (allTags.length) {
        main.append(h('div', { style: { marginBottom: 'var(--space-2)' } }, tagChips));
      }

      /* ---------------- 3. Contenedor de Lista y Resultados ---------------- */
      const listContainer = h('div');
      main.append(listContainer);

      function renderNotesList() {
        clear(listContainer);

        // Si hay respuesta de IA, mostrarla en un bloque glow
        if (aiSearchResult) {
          const aiBanner = card('Resultado de búsqueda con IA', { cls: 'glow' },
            h('p', { class: 'small' }, aiSearchResult.answer),
            h('div', { style: { marginTop: 'var(--space-2)' } },
              btn('Limpiar filtro de IA', {
                variant: 'ghost',
                sm: true,
                onclick: () => {
                  aiSearchResult = null;
                  renderNotesList();
                },
              }),
            ),
          );
          listContainer.append(aiBanner);
        }

        // Filtrado
        let filtered = notes;
        if (aiSearchResult && aiSearchResult.ids.length) {
          const idSet = new Set(aiSearchResult.ids);
          filtered = filtered.filter((n) => idSet.has(n.id));
        } else if (localQuery) {
          const q = localQuery.toLowerCase();
          filtered = filtered.filter((n) => (
            (n.title && n.title.toLowerCase().includes(q)) ||
            (n.body && n.body.toLowerCase().includes(q)) ||
            (n.docText && n.docText.toLowerCase().includes(q)) ||
            (n.url && n.url.toLowerCase().includes(q)) ||
            ((n.tags || []).some((t) => t.toLowerCase().includes(q)))
          ));
        }

        if (activeTag) {
          filtered = filtered.filter((n) => (n.tags || []).includes(activeTag));
        }

        if (!filtered.length) {
          listContainer.append(empty('No se encontraron elementos en Memoria.', 'file'));
          return;
        }

        const grid = h('div', { class: 'list' });
        filtered.forEach((n) => {
          const kindIcon = {
            note: 'file',
            document: 'scan',
            photo: 'camera',
            audio: 'mic',
            link: 'link',
          }[n.kind] || 'file';

          const item = h('div', { class: 'card', style: { padding: 'var(--space-3)' } });

          // Encabezado
          const head = h('div', { class: 'card-head', style: { marginBottom: 'var(--space-2)' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              icon(kindIcon, 18),
              h('h4', { style: { margin: 0, fontSize: '0.95rem' } }, n.title || 'Sin título'),
            ),
            h('span', { class: 'muted small mono' }, fmtDate(n.createdAt ? new Date(n.createdAt).toISOString().slice(0, 10) : today())),
          );
          item.append(head);

          // Imagen si tiene
          if (n.image) {
            const img = h('img', {
              src: n.image,
              alt: n.title || 'Foto',
              style: {
                width: '100%',
                maxHeight: '220px',
                objectFit: 'cover',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-2)',
                cursor: 'pointer',
              },
              onclick: () => viewFullNote(n),
            });
            item.append(img);
          }

          // Audio si tiene
          if (n.audio) {
            const audioEl = h('audio', {
              controls: true,
              src: n.audio,
              style: { width: '100%', marginBottom: 'var(--space-2)' },
            });
            item.append(audioEl);
          }

          // Enlace
          if (n.url) {
            const linkHref = safeUrl(n.url);
            if (linkHref) {
              item.append(h('p', { class: 'small mono', style: { marginBottom: 'var(--space-2)' } },
                h('a', {
                  href: linkHref,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  style: { color: 'var(--accent)', textDecoration: 'underline' },
                }, n.url),
              ));
            }
          }

          // Cuerpo o descripción
          if (n.body) {
            item.append(h('p', { class: 'small muted', style: { whiteSpace: 'pre-line', marginBottom: 'var(--space-2)' } }, n.body));
          }

          // Texto escaneado (OCR)
          if (n.docText) {
            const snippet = n.docText.slice(0, 140) + (n.docText.length > 140 ? '…' : '');
            item.append(h('div', { class: 'codeblock', style: { fontSize: '0.8rem', marginBottom: 'var(--space-2)' } },
              `[Texto extraído]: ${snippet}`,
            ));
          }

          // Etiquetas
          if (n.tags && n.tags.length) {
            const tagsWrap = h('div', { class: 'chips', style: { marginBottom: 'var(--space-2)' } });
            n.tags.forEach((t) => {
              tagsWrap.append(h('span', { class: 'chip sm' }, `#${t}`));
            });
            item.append(tagsWrap);
          }

          // Acciones de la nota
          const actions = h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
            btn('Ver', {
              variant: 'ghost',
              sm: true,
              onclick: () => viewFullNote(n),
            }),
            btn('Copiar', {
              variant: 'ghost',
              sm: true,
              icon: 'copy',
              onclick: () => copyNoteContent(n),
            }),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                if (confirm(`¿Eliminar "${n.title || 'esta nota'}"?`)) {
                  await db.del('notes', n.id);
                  toast('Eliminada');
                }
              },
            }, icon('trash', 14)),
          );
          item.append(actions);

          grid.append(item);
        });

        listContainer.append(grid);
      }

      renderNotesList();

      /* ---------------- 4. Vista Previa Derecha ---------------- */
      renderMemoriaPreview(preview, notes);
    }

    /* Modales y creadores */
    function createTextNote() {
      modal({
        title: 'Nueva Nota',
        fields: [
          { name: 'title', label: 'Título', placeholder: 'Ej. Ideas para proyecto' },
          { name: 'body', label: 'Contenido', type: 'textarea', rows: 4, placeholder: 'Escribe tu nota aquí…', required: true },
          { name: 'tags', label: 'Etiquetas (separadas por coma)', placeholder: 'ideas, trabajo' },
        ],
        async onConfirm(val) {
          const tags = (val.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
          await db.put('notes', {
            kind: 'note',
            title: val.title || 'Nota',
            body: val.body,
            tags,
            createdAt: Date.now(),
          });
          toast('Nota guardada');
        },
      });
    }

    async function addPhotoNote() {
      const file = await pickFile({ accept: 'image/*' });
      if (!file) return;
      toast('Comprimiendo imagen…');
      try {
        const compressed = await db.compressImage(file);
        modal({
          title: 'Guardar Foto',
          content: h('div', { style: { textAlign: 'center', marginBottom: 'var(--space-2)' } },
            h('img', { src: compressed, style: { maxHeight: '180px', borderRadius: 'var(--radius-md)' } }),
          ),
          fields: [
            { name: 'title', label: 'Título o descripción corta', placeholder: 'Ej. Pizarra de reunión' },
            { name: 'note', label: 'Nota adicional', type: 'textarea', rows: 2 },
            { name: 'tags', label: 'Etiquetas', placeholder: 'foto, reunión' },
          ],
          async onConfirm(val) {
            const tags = (val.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
            await db.put('notes', {
              kind: 'photo',
              title: val.title || 'Foto',
              body: val.note || '',
              image: compressed,
              tags,
              createdAt: Date.now(),
            });
            toast('Foto guardada en memoria');
          },
        });
      } catch (err) {
        toast(err.message || 'Error con la foto', { error: true });
      }
    }

    async function scanDocument() {
      const file = await pickFile({ accept: 'image/*' });
      if (!file) return;
      toast('Comprimiendo y enviando a Gemini Flash…');
      try {
        const compressed = await db.compressImage(file);
        const payload = ai.toPayload(compressed);

        const res = await ai.ask('chat', {
          image: payload,
          text: 'Analiza este documento, extrae su información y transcribe su texto.',
          options: { task: 'document' },
        });

        const doc = res.data || {};

        modal({
          title: 'Documento Escaneado con IA',
          subtitle: 'Revisa los datos extraídos antes de guardar:',
          content: h('div', { style: { textAlign: 'center', marginBottom: 'var(--space-2)' } },
            h('img', { src: compressed, style: { maxHeight: '140px', borderRadius: 'var(--radius-md)' } }),
          ),
          fields: [
            { name: 'title', label: 'Título', value: doc.title || 'Documento', required: true },
            { name: 'body', label: 'Descripción / Resumen', type: 'textarea', value: doc.description || '', rows: 2 },
            { name: 'docText', label: 'Texto completo extraído (OCR)', type: 'textarea', value: doc.text || '', rows: 4 },
            { name: 'tags', label: 'Etiquetas', value: (doc.tags || []).join(', ') },
          ],
          async onConfirm(val) {
            const tags = (val.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
            await db.put('notes', {
              kind: 'document',
              title: val.title,
              body: val.body,
              docText: val.docText,
              image: compressed,
              tags,
              createdAt: Date.now(),
            });
            toast('Documento guardado con OCR');
          },
        });
      } catch (err) {
        toast(err.message || 'Error al escanear documento', { error: true });
      }
    }

    async function recordAudioNote() {
      let rec = null;
      const timeSpan = h('span', { class: 'mono', style: { fontSize: '1.2rem', color: 'var(--accent)' } }, '00:00');

      const modalRef = modal({
        title: 'Grabar Nota de Voz',
        subtitle: 'Habla con claridad. Gemini transcribirá tu audio.',
        content: h('div', { style: { textAlign: 'center', padding: 'var(--space-4) 0' } },
          h('div', { style: { marginBottom: 'var(--space-2)' } }, icon('mic', 36)),
          timeSpan,
        ),
        confirmText: 'Detener y Transcribir',
        cancelText: 'Cancelar',
        async onConfirm() {
          if (rec) rec.stop();
        },
        onCancel() {
          if (rec) rec.stop();
        },
      });

      try {
        rec = await ai.startRecording({
          maxMs: 180000, // 3 min máx para nota de voz rápida
          onTick(ms) {
            timeSpan.textContent = ai.fmtDuration(ms);
          },
        });

        const finished = await rec.finished;
        modalRef.close();

        toast('Gemini transcribiendo audio…');
        const text = await ai.transcribe(finished, { analyze: 'plain' });

        modal({
          title: 'Guardar Nota de Audio',
          fields: [
            { name: 'title', label: 'Título', placeholder: 'Ej. Idea en camino' },
            { name: 'body', label: 'Transcripción (editable)', type: 'textarea', value: text || '', rows: 4 },
            { name: 'tags', label: 'Etiquetas', placeholder: 'audio, idea' },
          ],
          async onConfirm(val) {
            const tags = (val.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
            await db.put('notes', {
              kind: 'audio',
              title: val.title || 'Nota de voz',
              body: val.body,
              audio: finished.dataUrl,
              tags,
              createdAt: Date.now(),
            });
            toast('Nota de audio guardada');
          },
        });
      } catch (err) {
        modalRef.close();
        toast(err.message || 'Error al grabar', { error: true });
      }
    }

    function addLinkNote() {
      modal({
        title: 'Guardar Enlace',
        fields: [
          { name: 'url', label: 'URL del enlace', placeholder: 'https://ejemplo.com', required: true },
          { name: 'title', label: 'Título', placeholder: 'Ej. Documentación Cloudflare' },
          { name: 'body', label: 'Nota o descripción', type: 'textarea', rows: 2 },
          { name: 'tags', label: 'Etiquetas', placeholder: 'enlaces, recursos' },
        ],
        async onConfirm(val) {
          const tags = (val.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
          await db.put('notes', {
            kind: 'link',
            url: val.url,
            title: val.title || val.url,
            body: val.body || '',
            tags,
            createdAt: Date.now(),
          });
          toast('Enlace guardado');
        },
      });
    }

    function viewFullNote(n) {
      const parts = [];
      if (n.image) {
        parts.push(h('div', { style: { textAlign: 'center', marginBottom: 'var(--space-3)' } },
          h('img', { src: n.image, style: { maxWidth: '100%', maxHeight: '350px', borderRadius: 'var(--radius-md)' } }),
        ));
      }
      if (n.audio) {
        parts.push(h('audio', { controls: true, src: n.audio, style: { width: '100%', marginBottom: 'var(--space-2)' } }));
      }
      if (n.url) {
        const link = safeUrl(n.url);
        if (link) {
          parts.push(h('p', { class: 'mono small' },
            h('a', { href: link, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)' } }, n.url),
          ));
        }
      }
      if (n.body) {
        parts.push(h('p', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.5 } }, n.body));
      }
      if (n.docText) {
        parts.push(h('div', { class: 'card tonal', style: { marginTop: 'var(--space-2)' } },
          h('h4', { class: 'small muted', style: { margin: '0 0 var(--space-1) 0' } }, 'Texto completo OCR:'),
          h('pre', { class: 'mono small', style: { whiteSpace: 'pre-wrap', margin: 0 } }, n.docText),
        ));
      }
      if (n.tags && n.tags.length) {
        const wrap = h('div', { class: 'chips', style: { marginTop: 'var(--space-2)' } });
        n.tags.forEach((t) => wrap.append(h('span', { class: 'chip sm' }, `#${t}`)));
        parts.push(wrap);
      }

      modal({
        title: n.title || 'Detalle',
        subtitle: n.createdAt ? fmtDateTime(n.createdAt) : '',
        content: h('div', { style: { maxHeight: '420px', overflowY: 'auto' } }, ...parts),
        confirmText: 'Copiar texto',
        cancelText: 'Cerrar',
        async onConfirm() {
          await copyNoteContent(n);
        },
      });
    }

    async function copyNoteContent(n) {
      const parts = [n.title, n.body, n.docText, n.url].filter(Boolean);
      await copyText(parts.join('\n\n'));
    }

    await renderAll();
  },

  async records(container) {
    clear(container);
    const notes = (await db.all('notes')).sort((a, b) => (b.createdAt || b.id) - (a.createdAt || a.id));
    if (!notes.length) {
      container.append(empty('Sin notas guardadas.', 'file'));
      return;
    }
    const list = h('div', { class: 'list' });
    notes.forEach((n) => {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, n.title || 'Nota'),
          h('span', { class: 'row-sub mono' }, `${n.kind.toUpperCase()} · ${fmtDate(n.createdAt ? new Date(n.createdAt).toISOString().slice(0, 10) : today())}`),
        ),
      ));
    });
    container.append(list);
  },
};

function renderMemoriaPreview(container, notes) {
  clear(container);

  const byKind = {
    note: notes.filter((n) => n.kind === 'note').length,
    document: notes.filter((n) => n.kind === 'document').length,
    photo: notes.filter((n) => n.kind === 'photo').length,
    audio: notes.filter((n) => n.kind === 'audio').length,
    link: notes.filter((n) => n.kind === 'link').length,
  };

  const statGrid = h('div', { class: 'stats' },
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Total notas'),
      h('div', { class: 'val' }, String(notes.length)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Documentos OCR'),
      h('div', { class: 'val' }, String(byKind.document)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Fotos y audios'),
      h('div', { class: 'val' }, String(byKind.photo + byKind.audio)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Enlaces'),
      h('div', { class: 'val' }, String(byKind.link)),
    ),
  );

  container.append(card('Resumen de Memoria', {}, statGrid));

  const allTags = [...new Set(notes.flatMap((n) => n.tags || []))].filter(Boolean);
  if (allTags.length) {
    const cloud = h('div', { class: 'chips' });
    allTags.forEach((t) => {
      const count = notes.filter((n) => (n.tags || []).includes(t)).length;
      cloud.append(h('span', { class: 'chip mono' }, `#${t} (${count})`));
    });
    container.append(card('Etiquetas activas', {}, cloud));
  }
}

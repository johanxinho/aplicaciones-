/* Nexo · js/reuniones.js
   Módulo de Reuniones:
   - Grabar audio con MediaRecorder (hasta 10 min a 32 kbps).
   - Transcripción completa con Gemini Flash.
   - Resumen estructurado en viñetas.
   - Extracción automática de tareas y compromisos con fechas que se pasan directamente a Hoy. */

import * as db from './db.js';
import * as ai from './ai.js';
import {
  h, clear, icon, btn, card, empty, modal, toast, today, fmtDate, fmtDateTime,
  copyText, setMd, esc,
} from './ui.js';

export default {
  id: 'reuniones',
  title: 'Reuniones',
  icon: 'wave',
  recordsTitle: 'Historial de Reuniones',

  async render(ctx) {
    const { main, preview, watch } = ctx;

    let isRecording = false;
    let recHandle = null;

    watch(['meetings', 'tasks'], () => renderAll());

    async function renderAll() {
      const meetings = (await db.all('meetings')).sort((a, b) => (b.createdAt || b.id) - (a.createdAt || a.id));

      clear(main);
      clear(preview);

      /* ---------------- 1. Grabadora de Reuniones con Glow ---------------- */
      const timeDisplay = h('div', { class: 'mono', style: { fontSize: '2.4rem', fontWeight: 600, letterSpacing: '2px', margin: 'var(--space-2) 0' } }, '00:00');
      const recStatus = h('p', { class: 'muted small' }, 'Hasta 10 minutos de grabación con cancelación de ruido.');

      const recBtn = btn('Iniciar Grabación de Reunión', {
        variant: 'primary',
        icon: 'mic',
        onclick: () => toggleRecording(),
      });

      const recCard = card('Nueva Reunión con IA', { cls: isRecording ? 'glow is-thinking' : 'glow' },
        h('div', { style: { textAlign: 'center', padding: 'var(--space-3) 0' } },
          timeDisplay,
          recStatus,
          h('div', { style: { marginTop: 'var(--space-3)' } }, recBtn),
        ),
      );
      main.append(recCard);

      async function toggleRecording() {
        if (isRecording) {
          // Detener grabación
          if (recHandle) recHandle.stop();
          return;
        }

        try {
          recBtn.disabled = true;
          recHandle = await ai.startRecording({
            maxMs: 600000, // 10 min
            onTick(ms) {
              timeDisplay.textContent = ai.fmtDuration(ms);
            },
          });

          isRecording = true;
          recCard.classList.add('is-thinking');
          recBtn.disabled = false;
          recBtn.replaceChildren(icon('stop', 18), h('span', null, 'Detener y Procesar con IA'));
          recBtn.className = 'btn danger';
          recStatus.textContent = '🔴 Grabando reunión… Hablen con naturalidad.';

          const result = await recHandle.finished;
          isRecording = false;
          recCard.classList.remove('is-thinking');
          recBtn.replaceChildren(icon('mic', 18), h('span', null, 'Iniciar Grabación de Reunión'));
          recBtn.className = 'btn primary';
          recStatus.textContent = 'Hasta 10 minutos de grabación con cancelación de ruido.';
          timeDisplay.textContent = '00:00';

          if (result.durationMs < 2000) {
            toast('La grabación fue muy corta', { error: true });
            return;
          }

          toast('Gemini transcribiendo y extrayendo tareas…');
          processMeetingAudio(result);
        } catch (err) {
          isRecording = false;
          recCard.classList.remove('is-thinking');
          recBtn.disabled = false;
          recBtn.replaceChildren(icon('mic', 18), h('span', null, 'Iniciar Grabación de Reunión'));
          recBtn.className = 'btn primary';
          toast(err.message || 'Error al iniciar grabación', { error: true });
        }
      }

      async function processMeetingAudio(audioResult) {
        try {
          const res = await ai.transcribe(audioResult, {
            analyze: 'meeting',
            today: today(),
          });

          const data = typeof res === 'object' ? res : { transcript: String(res), summary: '', tasks: [] };
          openMeetingConfirmationModal(data, audioResult.dataUrl);
        } catch (err) {
          toast(err.message || 'Error al procesar la reunión', { error: true });
        }
      }

      /* ---------------- 2. Lista de Reuniones Guardadas ---------------- */
      const listCard = card('Reuniones Procesadas', {
        actions: [
          btn('Subir Audio', {
            variant: 'ghost',
            sm: true,
            icon: 'upload',
            title: 'Subir archivo de audio pregrabado',
            onclick: () => uploadAudioFile(),
          }),
        ],
      });

      if (!meetings.length) {
        listCard.append(empty('No hay reuniones grabadas aún. Inicia una grabación arriba.', 'wave'));
      } else {
        const list = h('div', { class: 'list' });
        meetings.forEach((m) => {
          const row = h('div', { class: 'card tonal', style: { padding: 'var(--space-3)', marginBottom: 'var(--space-2)' } });

          const head = h('div', { class: 'card-head', style: { marginBottom: 'var(--space-2)' } },
            h('div', null,
              h('h4', { style: { margin: 0 } }, m.title || 'Reunión sin título'),
              h('span', { class: 'muted small mono' }, `${m.date || today()} · ${(m.tasks || []).length} tareas`),
            ),
            h('div', { style: { display: 'flex', gap: '6px' } },
              btn('Ver', {
                variant: 'ghost',
                sm: true,
                onclick: () => viewMeetingDetail(m),
              }),
              h('button', {
                class: 'icon-btn sm flat',
                onclick: async () => {
                  if (confirm(`¿Eliminar la reunión "${m.title}"?`)) {
                    await db.del('meetings', m.id);
                    toast('Reunión eliminada');
                  }
                },
              }, icon('trash', 14)),
            ),
          );
          row.append(head);

          if (m.summary) {
            const summaryPreview = h('div', { class: 'md small muted', style: { maxHeight: '110px', overflow: 'hidden' } });
            setMd(summaryPreview, m.summary);
            row.append(summaryPreview);
          }

          if (m.tasks && m.tasks.length) {
            const tasksPreview = h('div', { style: { marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border)' } },
              h('strong', { class: 'small' }, 'Tareas identificadas:'),
              h('ul', { style: { margin: '4px 0 0 0', paddingLeft: '20px', fontSize: '0.85rem' } },
                ...m.tasks.slice(0, 3).map((t) => h('li', null, `${t.title}${t.due ? ` (vence ${t.due})` : ''}`)),
              ),
            );
            row.append(tasksPreview);
          }

          list.append(row);
        });
        listCard.append(list);
      }

      main.append(listCard);

      /* ---------------- 3. Vista Previa Derecha ---------------- */
      renderReunionesPreview(preview, meetings);
    }

    /* Modal de revisión y confirmación antes de guardar reunión y pasar tareas a Hoy */
    function openMeetingConfirmationModal(data, audioDataUrl = null) {
      const tasksState = (data.tasks || []).map((t) => ({
        title: t.title || '',
        due: t.due || null,
        owner: t.owner || null,
        sendToHoy: true,
      }));

      const formWrap = h('div', { class: 'form' });

      const titleInput = h('input', {
        class: 'input',
        value: `Reunión ${fmtDate(today())}`,
        placeholder: 'Título de la reunión',
      });
      formWrap.append(h('label', { class: 'field' },
        h('span', { class: 'field-label' }, 'Título de la reunión'),
        titleInput,
      ));

      const summaryArea = h('textarea', {
        class: 'input',
        rows: 5,
      }, data.summary || '');
      formWrap.append(h('label', { class: 'field' },
        h('span', { class: 'field-label' }, 'Resumen generado por IA'),
        summaryArea,
      ));

      // Tareas con checkbox para pasar a Hoy
      const tasksBox = h('div', { class: 'card tonal', style: { padding: 'var(--space-2)' } },
        h('h4', { class: 'small', style: { margin: '0 0 var(--space-2) 0' } }, 'Tareas para pasar a Hoy:'),
      );

      if (!tasksState.length) {
        tasksBox.append(h('p', { class: 'muted small' }, 'No se detectaron tareas explícitas en el audio.'));
      } else {
        tasksState.forEach((t, i) => {
          const check = h('input', {
            type: 'checkbox',
            checked: t.sendToHoy,
            onchange: (e) => { t.sendToHoy = e.target.checked; },
          });
          const titleField = h('input', {
            class: 'input sm',
            value: t.title,
            style: { flexGrow: 1 },
            oninput: (e) => { t.title = e.target.value.trim(); },
          });
          const dueField = h('input', {
            type: 'date',
            class: 'input sm mono',
            value: t.due || '',
            style: { width: '130px' },
            onchange: (e) => { t.due = e.target.value || null; },
          });

          const itemRow = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
            check,
            titleField,
            dueField,
          );
          tasksBox.append(itemRow);
        });
      }
      formWrap.append(tasksBox);

      // Transcripción completa
      const transcriptBox = h('details', { style: { marginTop: 'var(--space-2)' } },
        h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, 'Ver transcripción completa'),
        h('pre', { class: 'codeblock mono small', style: { maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap' } }, data.transcript || '(vacío)'),
      );
      formWrap.append(transcriptBox);

      modal({
        title: 'Revisión de Reunión',
        subtitle: 'Confirma los puntos y selecciona qué tareas pasar a Hoy:',
        content: formWrap,
        confirmText: 'Guardar y Enviar a Hoy',
        cancelText: 'Descartar',
        async onConfirm() {
          const finalTitle = titleInput.value.trim() || `Reunión ${today()}`;
          const finalSummary = summaryArea.value.trim();

          // 1. Guardar reunión
          await db.put('meetings', {
            title: finalTitle,
            date: today(),
            summary: finalSummary,
            transcript: data.transcript || '',
            tasks: tasksState,
            createdAt: Date.now(),
          });

          // 2. Pasar tareas seleccionadas a la tienda 'tasks' de Hoy
          let addedCount = 0;
          for (const t of tasksState) {
            if (t.sendToHoy && t.title) {
              await db.put('tasks', {
                title: t.title,
                due: t.due || null,
                done: false,
                source: `Reunión: ${finalTitle}`,
                createdAt: Date.now(),
              });
              addedCount += 1;
            }
          }

          toast(`Reunión guardada · ${addedCount} tareas pasadas a Hoy`);
        },
      });
    }

    async function uploadAudioFile() {
      const file = await pickFile({ accept: 'audio/*' });
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        toast('El archivo supera los 8 MB', { error: true });
        return;
      }
      toast('Leyendo y analizando archivo de audio…');
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result;
          const { mime, data } = ai.toPayload(dataUrl);
          const res = await ai.ask('transcribe', {
            audio: { mime, data },
            options: { analyze: 'meeting', today: today() },
          });
          const meetingData = res.data || { transcript: res.text || '', summary: '', tasks: [] };
          openMeetingConfirmationModal(meetingData, dataUrl);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        toast(err.message || 'Error con el archivo de audio', { error: true });
      }
    }

    function viewMeetingDetail(m) {
      const body = h('div', { style: { maxHeight: '450px', overflowY: 'auto' } });

      if (m.summary) {
        const sumWrap = h('div', { class: 'md', style: { marginBottom: 'var(--space-3)' } });
        setMd(sumWrap, m.summary);
        body.append(h('h4', { class: 'small muted' }, 'Resumen:'), sumWrap);
      }

      if (m.tasks && m.tasks.length) {
        const tList = h('div', { class: 'list', style: { marginBottom: 'var(--space-3)' } });
        m.tasks.forEach((t) => {
          tList.append(h('div', { class: 'row' },
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, t.title),
              t.due ? h('span', { class: 'row-sub mono' }, `Vence: ${fmtDate(t.due)}`) : null,
            ),
          ));
        });
        body.append(h('h4', { class: 'small muted' }, 'Tareas asignadas:'), tList);
      }

      if (m.transcript) {
        body.append(
          h('h4', { class: 'small muted' }, 'Transcripción:'),
          h('pre', { class: 'codeblock mono small', style: { maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap' } }, m.transcript),
        );
      }

      modal({
        title: m.title || 'Detalle de Reunión',
        subtitle: m.date ? `${fmtDate(m.date)}` : '',
        content: body,
        confirmText: 'Copiar Resumen',
        cancelText: 'Cerrar',
        async onConfirm() {
          await copyText(`${m.title}\n\nRESUMEN:\n${m.summary}\n\nTAREAS:\n${(m.tasks || []).map((t) => `- ${t.title}`).join('\n')}`);
        },
      });
    }

    await renderAll();
  },

  async records(container) {
    clear(container);
    const meetings = (await db.all('meetings')).sort((a, b) => (b.createdAt || b.id) - (a.createdAt || a.id));
    if (!meetings.length) {
      container.append(empty('Sin reuniones registradas.', 'wave'));
      return;
    }
    const list = h('div', { class: 'list' });
    meetings.forEach((m) => {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, m.title || 'Reunión'),
          h('span', { class: 'row-sub mono' }, `${m.date || today()} · ${(m.tasks || []).length} tareas`),
        ),
      ));
    });
    container.append(list);
  },
};

function renderReunionesPreview(container, meetings) {
  clear(container);

  const totalTasks = meetings.reduce((acc, m) => acc + (m.tasks ? m.tasks.length : 0), 0);

  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Reuniones'),
      h('div', { class: 'val' }, String(meetings.length)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Tareas creadas'),
      h('div', { class: 'val' }, String(totalTasks)),
    ),
  );
  container.append(card('Métricas de Reuniones', {}, stats));

  if (meetings.length) {
    const latest = meetings[0];
    const previewBox = card(`Última: ${latest.title}`, { cls: 'tonal' },
      h('p', { class: 'muted small mono', style: { margin: '0 0 var(--space-2) 0' } }, fmtDate(latest.date || today())),
      h('div', { class: 'md small', style: { maxHeight: '180px', overflowY: 'auto' } }, setMd(h('div'), latest.summary || '(Sin resumen)')),
    );
    container.append(previewBox);
  }
}

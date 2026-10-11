/* Nexo · js/idiomas.js
   Módulo de Idiomas:
   - Tutor por voz con Gemini Flash: transcribe tu audio, responde en el idioma de destino y corrige tus errores en español.
   - Traductor contextual con pronunciación y alternativas.
   - Tarjetas de repaso (Flashcards) basadas en tus errores frecuentes para practicar. */

import * as db from './db.js';
import * as ai from './ai.js';
import {
  h, clear, icon, btn, card, empty, modal, toast, today, addDays, fmtDate,
  copyText, pillTabs,
} from './ui.js';

const LANGUAGES = [
  { id: 'inglés', name: 'Inglés' },
  { id: 'francés', name: 'Francés' },
  { id: 'alemán', name: 'Alemán' },
  { id: 'italiano', name: 'Italiano' },
  { id: 'portugués', name: 'Portugués' },
  { id: 'japonés', name: 'Japonés' },
];

const LEVELS = [
  { id: 'principiante', name: 'Principiante (A1-A2)' },
  { id: 'intermedio', name: 'Intermedio (B1-B2)' },
  { id: 'avanzado', name: 'Avanzado (C1-C2)' },
];

export default {
  id: 'idiomas',
  title: 'Idiomas',
  icon: 'languages',
  recordsTitle: 'Práctica de Idiomas',

  async render(ctx) {
    const { main, preview, watch } = ctx;

    let activeTab = 'tutor'; // 'tutor' | 'traductor' | 'tarjetas'
    let currentLang = await db.getSetting('lang_target', 'inglés');
    let currentLevel = await db.getSetting('lang_level', 'intermedio');

    watch(['cards', 'langlog'], () => renderAll());

    async function renderAll() {
      const t0 = today();
      const [cardsList, langlogs] = await Promise.all([
        db.all('cards'),
        db.all('langlog'),
      ]);

      clear(main);
      clear(preview);

      /* ---------------- 1. Selector de Pestañas ---------------- */
      const tabs = pillTabs({
        tabs: [
          { id: 'tutor', label: 'Tutor por voz' },
          { id: 'traductor', label: 'Traductor' },
          { id: 'tarjetas', label: 'Tarjetas de repaso' },
        ],
        active: activeTab,
        onChange: (id) => {
          activeTab = id;
          renderTabContent();
        },
      });
      main.append(tabs);

      const contentBox = h('div');
      main.append(contentBox);

      function renderTabContent() {
        clear(contentBox);
        if (activeTab === 'tutor') {
          renderTutorSection(contentBox, langlogs);
        } else if (activeTab === 'traductor') {
          renderTraductorSection(contentBox);
        } else if (activeTab === 'tarjetas') {
          renderTarjetasSection(contentBox, cardsList, t0);
        }
      }

      renderTabContent();

      /* ---------------- 2. Vista Previa Derecha ---------------- */
      renderIdiomasPreview(preview, cardsList, langlogs, t0);
    }

    /* ---------------- Sección: Tutor por Voz ---------------- */
    function renderTutorSection(container, langlogs) {
      let isRecording = false;
      let recHandle = null;

      // Selector de idioma y nivel
      const langSelect = h('select', {
        class: 'input sm',
        onchange: async (e) => {
          currentLang = e.target.value;
          await db.setSetting('lang_target', currentLang);
          toast(`Idioma: ${currentLang}`);
        },
      }, ...LANGUAGES.map((l) => h('option', { value: l.id, selected: l.id === currentLang }, l.name)));

      const levelSelect = h('select', {
        class: 'input sm',
        onchange: async (e) => {
          currentLevel = e.target.value;
          await db.setSetting('lang_level', currentLevel);
          toast(`Nivel: ${currentLevel}`);
        },
      }, ...LEVELS.map((lvl) => h('option', { value: lvl.id, selected: lvl.id === currentLevel }, lvl.name)));

      const configCard = card('Configuración de Tutor', {},
        h('div', { class: 'field-row' },
          h('label', { class: 'field', style: { flexGrow: 1 } }, h('span', { class: 'field-label' }, 'Idioma a practicar'), langSelect),
          h('label', { class: 'field', style: { flexGrow: 1 } }, h('span', { class: 'field-label' }, 'Tu nivel actual'), levelSelect),
        ),
      );
      container.append(configCard);

      // Grabadora del tutor
      const timeDisplay = h('div', { class: 'mono', style: { fontSize: '2.2rem', fontWeight: 600, letterSpacing: '2px', margin: 'var(--space-2) 0' } }, '00:00');
      const tutorStatus = h('p', { class: 'muted small' }, `Habla en ${currentLang}. Gemini te responderá y te corregirá.`);

      const recordBtn = btn(`Hablar con Tutor en ${currentLang}`, {
        variant: 'primary',
        icon: 'mic',
        onclick: () => toggleTutorRecording(),
      });

      const tutorCard = card('Conversación con tu Tutor IA', { cls: 'glow' },
        h('div', { style: { textAlign: 'center', padding: 'var(--space-2) 0' } },
          timeDisplay,
          tutorStatus,
          h('div', { style: { marginTop: 'var(--space-3)' } }, recordBtn),
        ),
      );
      container.append(tutorCard);

      async function toggleTutorRecording() {
        if (isRecording) {
          if (recHandle) recHandle.stop();
          return;
        }

        try {
          recordBtn.disabled = true;
          recHandle = await ai.startRecording({
            maxMs: 120000, // 2 min para turnos de tutor
            onTick(ms) {
              timeDisplay.textContent = ai.fmtDuration(ms);
            },
          });

          isRecording = true;
          tutorCard.classList.add('is-thinking');
          recordBtn.disabled = false;
          recordBtn.replaceChildren(icon('stop', 18), h('span', null, 'Terminar y Escuchar Corrección'));
          recordBtn.className = 'btn danger';
          tutorStatus.textContent = `🔴 Grabando… Di lo que piensas en ${currentLang}.`;

          const result = await recHandle.finished;
          isRecording = false;
          tutorCard.classList.remove('is-thinking');
          recordBtn.replaceChildren(icon('mic', 18), h('span', null, `Hablar con Tutor en ${currentLang}`));
          recordBtn.className = 'btn primary';
          tutorStatus.textContent = `Habla en ${currentLang}. Gemini te responderá y te corregirá.`;
          timeDisplay.textContent = '00:00';

          if (result.durationMs < 1200) {
            toast('La grabación fue muy corta', { error: true });
            return;
          }

          toast('Gemini analizando pronunciación y gramática…');
          processTutorTurn(result);
        } catch (err) {
          isRecording = false;
          tutorCard.classList.remove('is-thinking');
          recordBtn.disabled = false;
          recordBtn.replaceChildren(icon('mic', 18), h('span', null, `Hablar con Tutor en ${currentLang}`));
          recordBtn.className = 'btn primary';
          toast(err.message || 'Error al grabar', { error: true });
        }
      }

      async function processTutorTurn(recording) {
        try {
          const res = await ai.transcribe(recording, {
            analyze: 'tutor',
            lang: currentLang,
            level: currentLevel,
          });

          const data = res || {};
          const transcript = data.transcript || '';
          const reply = data.reply || '';
          const replyEs = data.reply_es || '';
          const corrections = Array.isArray(data.corrections) ? data.corrections : [];

          // Guardar en log
          await db.put('langlog', {
            lang: currentLang,
            transcript,
            reply,
            corrections,
            createdAt: Date.now(),
          });

          // Modal de respuesta del tutor
          openTutorResultModal(transcript, reply, replyEs, corrections);
        } catch (err) {
          toast(err.message || 'Error en el tutor de idiomas', { error: true });
        }
      }

      // Historial de interacciones recientes
      const recentLogs = [...langlogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
      const historyCard = card('Últimas Conversaciones con el Tutor', {});
      if (!recentLogs.length) {
        historyCard.append(empty('Sin conversaciones recientes. Graba tu voz arriba.', 'languages'));
      } else {
        const list = h('div', { class: 'list' });
        recentLogs.forEach((l) => {
          list.append(h('div', { class: 'card tonal', style: { padding: 'var(--space-2)' } },
            h('p', { class: 'small', style: { margin: '0 0 4px 0' } },
              h('strong', null, 'Tú: '), l.transcript,
            ),
            h('p', { class: 'small muted', style: { margin: '0 0 4px 0' } },
              h('strong', null, 'Tutor: '), l.reply,
            ),
            (l.corrections && l.corrections.length) ? h('div', { style: { marginTop: '4px' } },
              h('span', { class: 'badge sm expense' }, `${l.corrections.length} corrección(es)`),
            ) : h('span', { class: 'badge sm income' }, '¡Sin errores!'),
          ));
        });
        historyCard.append(list);
      }
      container.append(historyCard);
    }

    function openTutorResultModal(transcript, reply, replyEs, corrections) {
      const modalContent = h('div', { class: 'form' });

      // Lo que dijo el usuario
      modalContent.append(h('div', { class: 'card tonal', style: { padding: 'var(--space-2)' } },
        h('span', { class: 'small muted mono' }, 'Lo que dijiste:'),
        h('p', { style: { margin: '4px 0 0 0', fontWeight: 500 } }, transcript || '(audio no reconocido)'),
      ));

      // Respuesta del tutor
      modalContent.append(h('div', { class: 'card', style: { padding: 'var(--space-2)', border: '1px solid var(--accent)' } },
        h('span', { class: 'small mono', style: { color: 'var(--accent)' } }, 'Respuesta del Tutor:'),
        h('p', { style: { margin: '4px 0', fontSize: '1.05rem', fontWeight: 500 } }, reply),
        replyEs ? h('p', { class: 'small muted', style: { margin: 0, fontStyle: 'italic' } }, `Trad: "${replyEs}"`) : null,
      ));

      // Correcciones
      if (corrections && corrections.length) {
        const corrBox = h('div', { class: 'card tonal', style: { padding: 'var(--space-2)' } },
          h('span', { class: 'small expense mono' }, '⚠️ Correcciones gramaticales:'),
          ...corrections.map((c) => h('div', { style: { marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '6px' } },
            h('p', { class: 'small', style: { margin: '0 0 2px 0' } },
              h('s', { class: 'expense' }, c.original), ' → ', h('strong', { class: 'income' }, c.corrected),
            ),
            h('p', { class: 'small muted', style: { margin: 0 } }, c.explanation),
          )),
        );
        modalContent.append(corrBox);
      } else {
        modalContent.append(h('div', { class: 'card tonal', style: { padding: 'var(--space-2)', textAlign: 'center' } },
          h('span', { class: 'income small' }, '✨ ¡Excelente! No se detectaron errores en esta frase.'),
        ));
      }

      modal({
        title: 'Feedback del Tutor IA',
        content: modalContent,
        confirmText: (corrections && corrections.length) ? 'Guardar Errores en Tarjetas' : 'Continuar',
        cancelText: 'Cerrar',
        async onConfirm() {
          if (corrections && corrections.length) {
            for (const c of corrections) {
              await db.put('cards', {
                front: c.corrected,
                back: `${c.original}\n\nExplicación: ${c.explanation}`,
                lang: currentLang,
                wrong: c.original,
                due: today(),
                box: 1,
                createdAt: Date.now(),
              });
            }
            toast(`${corrections.length} error(es) guardado(s) en tarjetas de repaso`);
          }
        },
      });
    }

    /* ---------------- Sección: Traductor ---------------- */
    function renderTraductorSection(container) {
      const textInput = h('textarea', {
        class: 'input',
        rows: 3,
        placeholder: 'Escribe el texto a traducir…',
      });

      const fromLang = h('input', {
        class: 'input sm',
        value: 'español',
        style: { width: '120px' },
      });

      const toLang = h('input', {
        class: 'input sm',
        value: currentLang,
        style: { width: '120px' },
      });

      const resultBox = h('div', { class: 'card tonal', style: { marginTop: 'var(--space-3)', display: 'none' } });

      const transCard = card('Traductor Contextual con IA', {},
        h('div', { class: 'form' },
          h('div', { class: 'field-row' },
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Desde'), fromLang),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hacia'), toLang),
          ),
          textInput,
          btn('Traducir con IA', {
            variant: 'primary',
            icon: 'sparkles',
            onclick: async () => {
              const text = textInput.value.trim();
              if (!text) { toast('Escribe un texto', { error: true }); return; }
              toast('Traduciendo…');
              try {
                const res = await ai.ask('translate', {
                  text,
                  options: {
                    from: fromLang.value.trim(),
                    to: toLang.value.trim(),
                  },
                });

                const data = res.data || {};
                renderTranslationResult(resultBox, text, data, toLang.value.trim());
              } catch (err) {
                toast(err.message || 'Error al traducir', { error: true });
              }
            },
          }),
          resultBox,
        ),
      );

      container.append(transCard);
    }

    function renderTranslationResult(box, originalText, data, targetLang) {
      clear(box);
      box.style.display = 'block';

      const translation = data.translation || '';
      box.append(
        h('span', { class: 'small muted mono' }, 'Traducción:'),
        h('p', { style: { fontSize: '1.15rem', fontWeight: 600, margin: '4px 0' } }, translation),
      );

      if (data.pronunciation) {
        box.append(h('p', { class: 'small mono muted', style: { margin: '2px 0' } }, `Pronunciación: ${data.pronunciation}`));
      }

      if (data.alternatives && data.alternatives.length) {
        box.append(h('p', { class: 'small muted', style: { margin: '4px 0' } },
          'Alternativas: ', data.alternatives.join(', '),
        ));
      }

      if (data.note) {
        box.append(h('p', { class: 'small muted', style: { margin: '4px 0', fontStyle: 'italic' } }, data.note));
      }

      const actions = h('div', { class: 'chips', style: { marginTop: 'var(--space-2)' } },
        btn('Copiar', {
          variant: 'ghost',
          sm: true,
          icon: 'copy',
          onclick: () => copyText(translation),
        }),
        btn('Guardar como Tarjeta', {
          variant: 'tonal',
          sm: true,
          icon: 'plus',
          onclick: async () => {
            await db.put('cards', {
              front: translation,
              back: originalText,
              lang: targetLang,
              due: today(),
              box: 1,
              createdAt: Date.now(),
            });
            toast('Tarjeta creada');
          },
        }),
      );
      box.append(actions);
    }

    /* ---------------- Sección: Tarjetas de Repaso ---------------- */
    function renderTarjetasSection(container, cardsList, t0) {
      const dueCards = cardsList.filter((c) => !c.due || c.due <= t0);

      // Repaso interactivo de tarjetas pendientes
      const reviewCard = card('Práctica de Tarjetas', {
        actions: [
          btn('Nueva Tarjeta', {
            variant: 'ghost',
            sm: true,
            icon: 'plus',
            onclick: () => createManualCard(),
          }),
        ],
      });

      if (!dueCards.length) {
        reviewCard.append(empty('¡Estás al día! No tienes tarjetas pendientes para repasar hoy.', 'check'));
      } else {
        let currentIndex = 0;
        const cardView = h('div', { class: 'card glow', style: { textAlign: 'center', padding: 'var(--space-4) var(--space-3)' } });

        function showCard(index) {
          clear(cardView);
          if (index >= dueCards.length) {
            cardView.append(
              icon('check', 36),
              h('h3', { style: { margin: 'var(--space-2) 0' } }, '¡Sesión completada!'),
              h('p', { class: 'muted small' }, `Repasaste ${dueCards.length} tarjetas hoy.`),
            );
            return;
          }

          const c = dueCards[index];
          const frontText = h('h3', { style: { fontSize: '1.25rem', marginBottom: 'var(--space-2)' } }, c.front);
          const langTag = h('span', { class: 'chip sm mono', style: { marginBottom: 'var(--space-2)', display: 'inline-block' } }, c.lang || currentLang);
          const backWrap = h('div', { style: { display: 'none', margin: 'var(--space-3) 0', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)' } },
            h('p', { style: { whiteSpace: 'pre-wrap', fontSize: '1.05rem', color: 'var(--accent)' } }, c.back),
          );

          const revealBtn = btn('Mostrar Respuesta', {
            variant: 'tonal',
            onclick: () => {
              revealBtn.style.display = 'none';
              backWrap.style.display = 'block';
              gradeButtons.style.display = 'flex';
            },
          });

          const gradeButtons = h('div', { style: { display: 'none', justifyContent: 'center', gap: '12px' } },
            btn('Me costó 😓', {
              variant: 'danger',
              onclick: async () => {
                c.box = 1;
                c.due = today();
                await db.put('cards', c);
                showCard(index + 1);
              },
            }),
            btn('¡La recordé! 🎉', {
              variant: 'primary',
              onclick: async () => {
                c.box = (c.box || 1) + 1;
                c.due = addDays(today(), Math.pow(2, c.box - 1));
                await db.put('cards', c);
                showCard(index + 1);
              },
            }),
          );

          cardView.append(
            h('span', { class: 'muted small mono', style: { display: 'block', marginBottom: '8px' } }, `Tarjeta ${index + 1} de ${dueCards.length}`),
            langTag,
            frontText,
            backWrap,
            revealBtn,
            gradeButtons,
          );
        }

        showCard(currentIndex);
        reviewCard.append(cardView);
      }
      container.append(reviewCard);

      // Lista de Errores Frecuentes Guardados
      const wrongList = cardsList.filter((c) => c.wrong);
      if (wrongList.length) {
        const errorCard = card(`Mis Errores Frecuentes (${wrongList.length})`, {});
        const list = h('div', { class: 'list' });
        wrongList.forEach((c) => {
          list.append(h('div', { class: 'row' },
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title income' }, c.front),
              h('span', { class: 'row-sub expense mono' }, `Error original: ${c.wrong}`),
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                await db.del('cards', c.id);
                toast('Tarjeta eliminada');
              },
            }, icon('trash', 14)),
          ));
        });
        errorCard.append(list);
        container.append(errorCard);
      }
    }

    function createManualCard() {
      modal({
        title: 'Nueva Tarjeta Flashcard',
        fields: [
          { name: 'front', label: 'Frente (Palabra o frase en idioma objetivo)', placeholder: 'Ej. How are you doing?', required: true },
          { name: 'back', label: 'Dorso (Traducción o significado)', placeholder: 'Ej. ¿Cómo te va?', required: true },
          { name: 'lang', label: 'Idioma', value: currentLang },
        ],
        async onConfirm(val) {
          await db.put('cards', {
            front: val.front,
            back: val.back,
            lang: val.lang,
            due: today(),
            box: 1,
            createdAt: Date.now(),
          });
          toast('Tarjeta creada');
        },
      });
    }

    await renderAll();
  },

  async records(container) {
    clear(container);
    const [cardsList, langlogs] = await Promise.all([db.all('cards'), db.all('langlog')]);

    if (!cardsList.length && !langlogs.length) {
      container.append(empty('Sin historial de idiomas.', 'languages'));
      return;
    }

    const list = h('div', { class: 'list' });
    cardsList.forEach((c) => {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, c.front),
          h('span', { class: 'row-sub mono' }, `${c.lang} · Próximo repaso: ${c.due || 'hoy'}`),
        ),
      ));
    });
    container.append(list);
  },
};

function renderIdiomasPreview(container, cardsList, langlogs, t0) {
  clear(container);

  const dueCount = cardsList.filter((c) => !c.due || c.due <= t0).length;
  const wrongCount = cardsList.filter((c) => c.wrong).length;

  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Repasar hoy'),
      h('div', { class: 'val mono' }, String(dueCount)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Errores guardados'),
      h('div', { class: 'val mono expense' }, String(wrongCount)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Total tarjetas'),
      h('div', { class: 'val mono' }, String(cardsList.length)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Conversaciones'),
      h('div', { class: 'val mono' }, String(langlogs.length)),
    ),
  );

  container.append(card('Progreso de Idiomas', {}, stats));
}

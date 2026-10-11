/* Nexo · js/chat.js
   Copiloto IA:
   - Conversación fluida con Gemini Flash.
   - Inyecta el resumen en tiempo real de todos los módulos mediante buildContext().
   - Responde preguntas complejas: "¿cómo voy este mes?", "organízame la semana", "¿a quién debo cobrarle?".
   - Sugerencias en chips interactivos.
   - Historial persistente en IndexedDB (tienda 'chat').
   - Panel derecho que muestra el contexto activo y estado del copiloto. */

import * as db from './db.js';
import * as ai from './ai.js';
import { buildContext } from './context.js';
import {
  h, clear, icon, btn, card, empty, aiBox, toast, setMd, fmtTime,
} from './ui.js';

const QUICK_PROMPTS = [
  '¿Cómo voy este mes en finanzas y tareas?',
  'Organízame la semana según mis prioridades',
  '¿A quién debo cobrarle y qué presupuestos tengo pendientes?',
  'Dame 3 recomendaciones clave para mejorar hoy',
];

export default {
  id: 'chat',
  title: 'Chat IA',
  icon: 'sparkles',
  previewOnMobile: false,

  async render(ctx) {
    const { main, preview, params, watch } = ctx;

    watch(['chat'], () => renderMessages());

    clear(main);
    clear(preview);

    const logContainer = h('div', { class: 'chat-log' });
    const suggestionsRow = h('div', { class: 'chips' });

    QUICK_PROMPTS.forEach((p) => {
      suggestionsRow.append(h('button', {
        type: 'button',
        class: 'chip',
        onclick: () => submitMessage(p),
      }, icon('sparkles', 14), p));
    });

    const stickyBox = h('div', { class: 'sticky-input' });

    const inputCtrl = aiBox({
      placeholder: 'Pregúntale a Nexo sobre tus tareas, dinero, clientes…',
      voice: true,
      autoSendVoice: true,
      label: 'Enviar',
      async onSubmit(text) {
        await submitMessage(text);
      },
    });

    stickyBox.append(inputCtrl.el);

    const chatCard = card(null, {
      actions: [
        btn('Limpiar historial', {
          variant: 'ghost',
          sm: true,
          icon: 'trash',
          onclick: async () => {
            if (confirm('¿Vaciar la conversación con Nexo?')) {
              await db.clear('chat');
              toast('Historial vaciado');
              renderMessages();
            }
          },
        }),
      ],
    },
    suggestionsRow,
    logContainer,
    stickyBox);

    main.append(chatCard);

    async function submitMessage(text) {
      if (!text.trim()) return;

      // 1. Guardar mensaje del usuario
      await db.put('chat', {
        role: 'user',
        text: text.trim(),
        createdAt: Date.now(),
      });
      await renderMessages();

      // 2. Placeholder de respuesta de la IA
      const typingBubble = h('div', { class: 'msg ai' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')));
      logContainer.append(typingBubble);
      logContainer.scrollTop = logContainer.scrollHeight;

      try {
        const historyRows = await db.all('chat');
        const recentHistory = historyRows.slice(-8).map((m) => ({
          role: m.role,
          text: m.text,
        }));

        const contextData = await buildContext();
        const reply = await ai.chat(text, {
          context: contextData,
          history: recentHistory,
          task: 'default',
        });

        typingBubble.remove();

        await db.put('chat', {
          role: 'model',
          text: typeof reply === 'string' ? reply : JSON.stringify(reply),
          createdAt: Date.now(),
        });

        await renderMessages();
      } catch (err) {
        typingBubble.remove();
        toast(err.message || 'Error al contactar con la IA', { error: true });
        await db.put('chat', {
          role: 'model',
          text: `⚠️ No se pudo obtener respuesta: ${err.message}`,
          createdAt: Date.now(),
        });
        await renderMessages();
      }
    }

    async function renderMessages() {
      clear(logContainer);
      const messages = await db.all('chat');

      if (!messages.length) {
        logContainer.append(
          h('div', { class: 'msg ai' },
            h('p', { class: 'md' }, '👋 ¡Hola! Soy **Nexo**, tu centro de mando con IA. Tengo acceso a tus tareas, gastos, suscripciones, clientes y presupuestos.'),
            h('span', { class: 'when' }, 'Ahora'),
          ),
        );
      } else {
        messages.forEach((m) => {
          const isUser = m.role === 'user';
          const bubble = h('div', { class: `msg ${isUser ? 'user' : 'ai'}` },
            isUser ? h('p', null, m.text) : setMd(h('div', { class: 'md' }), m.text),
            h('span', { class: 'when' }, fmtTime(m.createdAt || Date.now())),
          );
          logContainer.append(bubble);
        });
      }

      // Auto-scroll al fondo
      setTimeout(() => {
        logContainer.scrollTop = logContainer.scrollHeight;
      }, 50);
    }

    await renderMessages();

    // Si venimos con un prompt inicial (ej. desde el hero de Hoy)
    if (params && params.initialPrompt) {
      setTimeout(() => submitMessage(params.initialPrompt), 200);
    }

    /* ---------------- Vista Previa Derecha ---------------- */
    renderChatPreview(preview);
  },
};

async function renderChatPreview(container) {
  clear(container);
  const contextSnippet = await buildContext();

  container.append(
    card('Contexto Activo de Nexo', { cls: 'tonal' },
      h('p', { class: 'muted small' },
        'Gemini recibe de forma privada un resumen consolidado de todos tus módulos para responderte con precisión:'),
      h('div', { class: 'codeblock small mono' }, contextSnippet.slice(0, 1500) + (contextSnippet.length > 1500 ? '…' : '')),
    ),
    card('Capacidades del Copiloto', {},
      h('div', { class: 'md small' },
        setMd(h('div'), `
- **Cruzar datos:** Relaciona tareas pendientes con cobros de clientes.
- **Proyecciones:** Estima tus gastos versus tus ingresos del mes.
- **Acciones directas:** Pídele redactar propuestas comerciales o correos de cobro.
        `),
      ),
    ),
  );
}

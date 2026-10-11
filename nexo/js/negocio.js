/* Nexo · js/negocio.js
   Módulo de Negocio:
   - Gestión de clientes y presupuestos (estados: borrador, enviado, aprobado, pagado).
   - Métricas clave: total facturado, por cobrar, cobrado, pipeline.
   - Recordatorios de cobro y seguimiento.
   - Asistente de redacción con IA: propuestas comerciales y mensajes de cobranza o seguimiento listos para copiar. */

import * as db from './db.js';
import * as ai from './ai.js';
import { businessStats, QUOTE_STATUSES } from './context.js';
import {
  h, clear, icon, btn, card, empty, modal, toast, money, today, fmtDate, setMd, copyText,
} from './ui.js';

export default {
  id: 'negocio',
  title: 'Negocio',
  icon: 'briefcase',
  recordsTitle: 'Presupuestos',

  async render(ctx) {
    const { main, preview, watch } = ctx;

    watch(['clients', 'quotes', 'reminders'], () => renderAll());

    async function renderAll() {
      const [clients, quotes, reminders] = await Promise.all([
        db.all('clients'),
        db.all('quotes'),
        db.all('reminders'),
      ]);

      const b = businessStats(quotes, clients);

      clear(main);
      clear(preview);

      /* ---------------- 1. Métricas Principales de Facturación ---------------- */
      const metricsRow = h('div', { class: 'stats' },
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Por cobrar'),
          h('div', { class: 'val expense' }, money(b.receivable)),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Cobrado este mes'),
          h('div', { class: 'val income' }, money(b.collected)),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Total facturado'),
          h('div', { class: 'val' }, money(b.billed)),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'En negociación'),
          h('div', { class: 'val muted' }, money(b.pipeline)),
        ),
      );
      main.append(metricsRow);

      /* ---------------- 2. A quién cobrar (Urgentes) ---------------- */
      if (b.chase.length) {
        const chaseList = h('div', { class: 'list' });
        b.chase.forEach(({ q, client, days }) => {
          const row = h('div', { class: 'row' },
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, `${client} — ${q.title}`),
              h('span', { class: 'row-sub expense mono' }, `Aprobado hace ${days} días`),
            ),
            h('span', { class: 'amt expense' }, money(q.amount)),
            btn('Cobrar con IA', {
              variant: 'tonal',
              sm: true,
              icon: 'send',
              onclick: async () => {
                toast('Redactando mensaje con IA…');
                try {
                  const draft = await ai.chat(`Redacta un mensaje breve y profesional de cobro para el cliente "${client}" referente al proyecto "${q.title}" por un monto de ${money(q.amount)}. Aprobado hace ${days} días.`, {
                    task: 'message',
                  });

                  modal({
                    title: `Mensaje para ${client}`,
                    subtitle: 'Listo para copiar y enviar por WhatsApp o correo:',
                    content: h('div', { class: 'codeblock' }, draft),
                    confirmText: 'Copiar texto',
                    cancelText: 'Cerrar',
                    async onConfirm() {
                      await copyText(draft);
                    },
                  });
                } catch (err) {
                  toast(err.message || 'Error al redactar', { error: true });
                }
              },
            }),
            btn('Pagado', {
              variant: 'ghost',
              sm: true,
              onclick: async () => {
                q.status = 'pagado';
                q.paidAt = today();
                await db.put('quotes', q);
                toast('Presupuesto marcado como pagado');
              },
            }),
          );
          chaseList.append(row);
        });

        main.append(card('⚠️ Cobros pendientes prioritarios', { cls: 'tonal' }, chaseList));
      }

      /* ---------------- 3. Herramientas de IA para Negocio ---------------- */
      const aiToolsCard = card('Asistente de Ventas y Propuestas con IA', {},
        h('p', { class: 'muted small' },
          'Genera propuestas completas o mensajes de seguimiento comercial en segundos:'),
        h('div', { class: 'chips' },
          btn('Redactar Propuesta Comercial', {
            variant: 'primary',
            icon: 'sparkles',
            onclick: () => {
              modal({
                title: 'Generar Propuesta con IA',
                fields: [
                  { name: 'client', label: 'Cliente', required: true, placeholder: 'Ej. Tech Solutions S.A.' },
                  { name: 'service', label: 'Servicio / Proyecto', required: true, placeholder: 'Ej. Rediseño de app móvil, Consultoría' },
                  { name: 'scope', label: 'Alcance y detalles clave', type: 'textarea', placeholder: 'Entregables, objetivos, plazos esperados…' },
                  { name: 'budget', label: 'Inversión propuesta ($)', type: 'number', step: '0.01' },
                ],
                async onConfirm(val) {
                  toast('Gemini redactando propuesta…');
                  try {
                    const prompt = `Genera una propuesta comercial profesional para el cliente "${val.client}".
Proyecto: ${val.service}.
Alcance: ${val.scope || 'No especificado'}.
Monto propuesto: ${val.budget ? money(val.budget) : 'A definir'}.`;

                    const result = await ai.chat(prompt, { task: 'proposal' });

                    modal({
                      title: `Propuesta para ${val.client}`,
                      content: h('div', { class: 'md', style: { maxHeight: '360px', overflowY: 'auto' } }, setMd(h('div'), result)),
                      confirmText: 'Copiar Markdown',
                      cancelText: 'Cerrar',
                      async onConfirm() {
                        await copyText(result);
                      },
                    });
                  } catch (e) {
                    toast(e.message, { error: true });
                  }
                },
              });
            },
          }),
          btn('Mensaje de Seguimiento Comercial', {
            variant: 'tonal',
            icon: 'send',
            onclick: () => {
              modal({
                title: 'Redactar Mensaje de Seguimiento',
                fields: [
                  { name: 'client', label: 'Cliente o Contacto', required: true, placeholder: 'Ej. Carlos Méndez' },
                  { name: 'context', label: 'Tema de la propuesta o reunión', required: true, placeholder: 'Ej. Envié propuesta de sitio web la semana pasada' },
                ],
                async onConfirm(val) {
                  toast('Redactando…');
                  try {
                    const draft = await ai.chat(`Redacta un mensaje amable y persuasivo de seguimiento para "${val.client}" preguntando por su opinión sobre "${val.context}".`, {
                      task: 'message',
                    });

                    modal({
                      title: `Mensaje para ${val.client}`,
                      content: h('div', { class: 'codeblock' }, draft),
                      confirmText: 'Copiar mensaje',
                      cancelText: 'Cerrar',
                      async onConfirm() {
                        await copyText(draft);
                      },
                    });
                  } catch (e) {
                    toast(e.message, { error: true });
                  }
                },
              });
            },
          }),
        ),
      );
      main.append(aiToolsCard);

      /* ---------------- 4. Recordatorios Comerciales ---------------- */
      const remList = h('div', { class: 'list' });
      const pendingReminders = reminders.filter((r) => !r.done);
      if (!pendingReminders.length) {
        remList.append(empty('Sin recordatorios de negocio pendientes.', 'bell'));
      } else {
        pendingReminders.forEach((r) => {
          const row = h('div', { class: 'row' },
            h('input', {
              type: 'checkbox',
              class: 'check',
              checked: false,
              onclick: async () => {
                r.done = true;
                await db.put('reminders', r);
                toast('Recordatorio completado');
              },
            }),
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, r.text),
              r.date ? h('span', { class: 'row-sub mono' }, fmtDate(r.date)) : null,
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                await db.del('reminders', r.id);
                toast('Eliminado');
              },
            }, icon('trash', 14)),
          );
          remList.append(row);
        });
      }

      main.append(card('Recordatorios de negocio', {
        actions: [
          btn('Nuevo', {
            variant: 'ghost',
            icon: 'plus',
            onclick: () => {
              modal({
                title: 'Nuevo Recordatorio Comercial',
                fields: [
                  { name: 'text', label: 'Recordatorio', required: true, placeholder: 'Ej. Enviar contrato a María' },
                  { name: 'date', label: 'Fecha límite', type: 'date', value: today() },
                ],
                async onConfirm(val) {
                  await db.put('reminders', {
                    text: val.text,
                    date: val.date || null,
                    done: false,
                  });
                  toast('Recordatorio guardado');
                },
              });
            },
          }),
        ],
      }, remList));

      /* ---------------- 5. Vista Previa Derecha ---------------- */
      renderNegocioPreview(preview, clients, quotes);
    }

    await renderAll();
  },

  // Historial de presupuestos en columna izquierda
  async records(container) {
    clear(container);
    const [quotes, clients] = await Promise.all([db.all('quotes'), db.all('clients')]);
    const sorted = [...quotes].sort((a, b) => (b.id - a.id));

    if (!sorted.length) {
      container.append(empty('No hay presupuestos registrados.', 'file'));
      return;
    }

    const list = h('div', { class: 'list' });
    sorted.forEach((q) => {
      const clientName = clients.find((c) => c.id === q.clientId)?.name || 'Cliente';
      const row = h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, q.title),
          h('span', { class: 'row-sub mono' }, `${clientName} · ${q.status.toUpperCase()}`),
        ),
        h('span', { class: `amt ${q.status === 'pagado' ? 'income' : ''}` }, money(q.amount)),
      );
      list.append(row);
    });

    container.append(list);
  },
};

function renderNegocioPreview(container, clients, quotes) {
  clear(container);

  // Lista de Clientes
  const clientsList = h('div', { class: 'list' });
  if (!clients.length) {
    clientsList.append(empty('No tienes clientes guardados.', 'users'));
  } else {
    clients.forEach((c) => {
      const clientQuotes = quotes.filter((q) => q.clientId === c.id);
      const totalClient = clientQuotes.reduce((acc, q) => acc + (Number(q.amount) || 0), 0);

      clientsList.append(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, c.name),
          h('span', { class: 'row-sub' }, `${c.contact || 'Sin contacto'} · ${clientQuotes.length} presupuestos`),
        ),
        h('span', { class: 'amt mono' }, money(totalClient)),
        h('button', {
          class: 'icon-btn sm flat',
          onclick: async () => {
            if (confirm(`¿Eliminar cliente "${c.name}"?`)) {
              await db.del('clients', c.id);
              toast('Cliente eliminado');
            }
          },
        }, icon('trash', 14)),
      ));
    });
  }

  container.append(card('Directorio de Clientes', {
    actions: [
      btn('Nuevo Cliente', {
        variant: 'ghost',
        icon: 'plus',
        onclick: () => {
          modal({
            title: 'Nuevo Cliente',
            fields: [
              { name: 'name', label: 'Nombre o Empresa', required: true, placeholder: 'Ej. Grupo Alfa' },
              { name: 'contact', label: 'Contacto (email o teléfono)', placeholder: 'correo@ejemplo.com' },
              { name: 'note', label: 'Nota / Sector', placeholder: 'Cliente recurrente, sector salud…' },
            ],
            async onConfirm(val) {
              await db.put('clients', {
                name: val.name,
                contact: val.contact || '',
                note: val.note || '',
              });
              toast('Cliente agregado');
            },
          });
        },
      }),
    ],
  }, clientsList));

  // Crear Presupuesto Rápido
  container.append(card('Registrar Presupuesto', { cls: 'tonal' },
    btn('Nuevo Presupuesto', {
      variant: 'primary',
      icon: 'plus',
      onclick: () => {
        if (!clients.length) {
          toast('Registra primero al menos un cliente', { error: true });
          return;
        }

        modal({
          title: 'Nuevo Presupuesto',
          fields: [
            {
              name: 'clientId',
              label: 'Cliente',
              type: 'select',
              options: clients.map((c) => ({ value: c.id, label: c.name })),
              required: true,
            },
            { name: 'title', label: 'Título del proyecto / presupuesto', required: true, placeholder: 'Ej. Mantenimiento anual' },
            { name: 'amount', label: 'Monto total', type: 'number', step: '0.01', required: true },
            {
              name: 'status',
              label: 'Estado inicial',
              type: 'select',
              options: QUOTE_STATUSES.map((s) => ({ value: s, label: s.toUpperCase() })),
              value: 'borrador',
            },
          ],
          async onConfirm(val) {
            await db.put('quotes', {
              clientId: parseInt(val.clientId, 10),
              title: val.title,
              amount: parseFloat(val.amount) || 0,
              status: val.status,
              createdAtYmd: today(),
              sentAt: val.status === 'enviado' ? today() : null,
              approvedAt: val.status === 'aprobado' ? today() : null,
              paidAt: val.status === 'pagado' ? today() : null,
            });
            toast('Presupuesto creado');
          },
        });
      },
    }),
  ));
}

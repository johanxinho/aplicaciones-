/* Nexo · js/hoy.js
   Pantalla de inicio "prompt-first":
   - Cuadro central con glow ("¿Qué quieres hacer hoy?"). Al escribir o hablar, la IA interpreta la intención
     (task: 'intent') y responde, ejecutando acciones o llevando al módulo correspondiente.
   - Saludo dinámico según la hora.
   - Botón "Resumen con IA" que cruza todos los módulos usando buildContext().
   - Tareas con checkbox (añadir, tachar, eliminar, marcar vencidas).
   - Gastos de hoy y acceso directo.
   - Hábitos diarios con racha calculada.
   - Seguimientos pendientes a contactos/personas.
   - Vista previa en la columna derecha. */

import * as db from './db.js';
import * as ai from './ai.js';
import { buildContext, habitStreak, snapshot, financeStats } from './context.js';
import {
  h, clear, icon, btn, card, empty, modal, aiBox, toast, money, today, fmtDate, setMd,
} from './ui.js';

export default {
  id: 'hoy',
  title: 'Hoy',
  icon: 'calendar',
  previewOnMobile: true,

  async render(ctx) {
    const { main, preview, watch, go } = ctx;

    // Observar cambios en las tiendas relevantes
    watch(['tasks', 'habits', 'habitlogs', 'followups', 'tx', 'kv'], () => refresh());

    async function refresh() {
      const s = await snapshot();
      const userName = await db.getSetting('name', '');
      const t0 = today();

      // Saludo según la hora
      const hour = new Date().getHours();
      let saludo = 'Buenos días';
      if (hour >= 12 && hour < 19) saludo = 'Buenas tardes';
      else if (hour >= 19 || hour < 5) saludo = 'Buenas noches';

      clear(main);
      clear(preview);

      /* ---------------- 1. Hero Prompt-First ---------------- */
      const heroReply = h('div', { class: 'hero-reply', hidden: true });

      const promptBox = aiBox({
        placeholder: '¿Qué quieres hacer hoy? (ej. "Gasté $45 en comida" o "Nueva tarea")',
        big: true,
        voice: true,
        autoSendVoice: true,
        label: 'Procesar',
        async onSubmit(text) {
          try {
            const contextText = await buildContext();
            const res = await ai.chat(text, {
              task: 'intent',
              context: contextText,
            });

            if (res && typeof res === 'object') {
              // Si la IA detectó una acción ejecutable
              if (res.action) {
                if (res.action.type === 'add_task') {
                  await db.put('tasks', {
                    title: res.action.title,
                    due: res.action.due || t0,
                    done: false,
                    createdAt: Date.now(),
                    source: 'ai_intent',
                  });
                  toast('Tarea añadida con éxito');
                } else if (res.action.type === 'add_expense' || res.action.type === 'add_income') {
                  await db.put('tx', {
                    type: res.action.type === 'add_income' ? 'income' : 'expense',
                    amount: Math.abs(Number(res.action.amount) || 0),
                    category: res.action.category || 'Otros',
                    note: res.action.note || text,
                    date: t0,
                  });
                  toast(`${res.action.type === 'add_income' ? 'Ingreso' : 'Gasto'} registrado`);
                }
              }

              // Mostrar respuesta y opción de ir al módulo sugerido
              heroReply.hidden = false;
              clear(heroReply).append(
                card('Respuesta de Nexo', {
                  actions: res.module && res.module !== 'hoy'
                    ? [btn(`Ir a ${res.module.toUpperCase()}`, { variant: 'tonal', icon: 'chevron', onclick: () => go(res.module) })]
                    : null,
                },
                h('p', { class: 'md' }, res.reply || 'Listo.')),
              );

              // Si es chat puro, permitir saltar directamente
              if (res.module === 'chat' && !res.action) {
                setTimeout(() => go('chat', { initialPrompt: text }), 900);
              }
            } else if (typeof res === 'string') {
              heroReply.hidden = false;
              clear(heroReply).append(card('Respuesta de Nexo', {}, h('p', { class: 'md' }, res)));
            }
          } catch (err) {
            toast(err.message || 'Error al conectar con la IA', { error: true });
            return false; // conservar texto en caso de error
          }
        },
      });

      const hero = h('div', { class: 'hero' },
        h('span', { class: 'greet' }, `${saludo}${userName ? `, ${userName}` : ''}`),
        h('h2', null, '¿Qué quieres ', h('span', { class: 'grad' }, 'hacer hoy?')),
        promptBox.el,
        heroReply,
      );

      main.append(hero);

      /* ---------------- 2. Botón "Resumen con IA" ---------------- */
      const aiSummaryContainer = h('div', { class: 'ai-summary-box', hidden: true });
      const aiSummaryBtn = btn('Resumen de mi día con IA', {
        variant: 'tonal',
        icon: 'sparkles',
        cls: 'btn-block',
        onclick: async () => {
          aiSummaryBtn.disabled = true;
          aiSummaryContainer.hidden = false;
          clear(aiSummaryContainer).append(card('Analizando tu día…', { cls: 'tonal' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i'))));
          try {
            const contextText = await buildContext();
            const text = await ai.chat(null, {
              task: 'day_summary',
              context: contextText,
            });
            clear(aiSummaryContainer).append(
              card('Resumen Ejecutivo de Nexo', {
                cls: 'ai-result glow',
                actions: [btn('Cerrar', { variant: 'ghost', sm: true, onclick: () => { aiSummaryContainer.hidden = true; } })],
              },
              setMd(h('div', { class: 'md' }), text)),
            );
          } catch (err) {
            clear(aiSummaryContainer).append(card('Error', {}, h('p', { class: 'expense small' }, err.message)));
          } finally {
            aiSummaryBtn.disabled = false;
          }
        },
      });

      main.append(aiSummaryBtn, aiSummaryContainer);

      /* ---------------- 3. Tareas de Hoy ---------------- */
      const pendingTasks = s.tasks.filter((t) => !t.done);
      const completedTasksToday = s.tasks.filter((t) => t.done && t.doneAt === t0);

      const tasksList = h('div', { class: 'list' });
      if (!pendingTasks.length && !completedTasksToday.length) {
        tasksList.append(empty('No tienes tareas pendientes para hoy.', 'check'));
      } else {
        // Tareas pendientes
        pendingTasks.forEach((task) => {
          const isOverdue = task.due && task.due < t0;
          const row = h('div', { class: 'row' },
            h('input', {
              type: 'checkbox',
              class: 'check',
              checked: false,
              'aria-label': 'Completar tarea',
              onclick: async () => {
                task.done = true;
                task.doneAt = t0;
                await db.put('tasks', task);
                toast('Tarea completada');
              },
            }),
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, task.title),
              task.due ? h('span', { class: `row-sub mono${isOverdue ? ' expense' : ''}` }, `${isOverdue ? 'Atrasada · ' : ''}${fmtDate(task.due)}`) : null,
            ),
            h('button', {
              class: 'icon-btn sm flat',
              title: 'Eliminar tarea',
              onclick: async () => {
                await db.del('tasks', task.id);
                toast('Tarea eliminada');
              },
            }, icon('trash', 16)),
          );
          tasksList.append(row);
        });

        // Tareas completadas hoy
        completedTasksToday.forEach((task) => {
          const row = h('div', { class: 'row done' },
            h('input', {
              type: 'checkbox',
              class: 'check',
              checked: true,
              'aria-label': 'Desmarcar tarea',
              onclick: async () => {
                task.done = false;
                delete task.doneAt;
                await db.put('tasks', task);
              },
            }),
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, task.title),
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                await db.del('tasks', task.id);
              },
            }, icon('trash', 16)),
          );
          tasksList.append(row);
        });
      }

      const tasksCard = card('Tareas de hoy', {
        actions: [
          btn('Añadir', {
            variant: 'ghost',
            icon: 'plus',
            onclick: () => {
              modal({
                title: 'Nueva Tarea',
                fields: [
                  { name: 'title', label: 'Descripción de la tarea', required: true, placeholder: 'Ej. Llamar al proveedor' },
                  { name: 'due', label: 'Fecha límite (opcional)', type: 'date', value: t0 },
                ],
                async onConfirm(val) {
                  await db.put('tasks', {
                    title: val.title,
                    due: val.due || null,
                    done: false,
                    createdAt: Date.now(),
                  });
                  toast('Tarea creada');
                },
              });
            },
          }),
        ],
      }, tasksList);

      main.append(tasksCard);

      /* ---------------- 4. Gastos de Hoy ---------------- */
      const f = financeStats(s.tx, s.subs, s.goals);
      const financeCard = card('Gastos de hoy', {
        actions: [btn('Finanzas', { variant: 'ghost', icon: 'wallet', onclick: () => go('finanzas') })],
      },
      h('div', { class: 'stats' },
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Gastado hoy'),
          h('div', { class: 'val expense' }, money(f.todayExpense)),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Balance del mes'),
          h('div', { class: `val ${f.balance >= 0 ? 'income' : 'expense'}` }, money(f.balance, { sign: true })),
        ),
      ));

      main.append(financeCard);

      /* ---------------- 5. Hábitos y Rachas ---------------- */
      const habitsList = h('div', { class: 'list' });
      if (!s.habits.length) {
        habitsList.append(empty('No has creado hábitos todavía.', 'flame'));
      } else {
        s.habits.forEach((hab) => {
          const streak = habitStreak(hab.id, s.habitlogs);
          const isDoneToday = s.habitlogs.some((l) => l.habitId === hab.id && l.date === t0);

          const row = h('div', { class: 'row' },
            h('input', {
              type: 'checkbox',
              class: 'check',
              checked: isDoneToday,
              'aria-label': 'Completar hábito hoy',
              onclick: async () => {
                if (isDoneToday) {
                  const log = s.habitlogs.find((l) => l.habitId === hab.id && l.date === t0);
                  if (log) await db.del('habitlogs', log.id);
                } else {
                  await db.put('habitlogs', { habitId: hab.id, date: t0 });
                  toast(`¡Racha de ${streak + 1} días! 🔥`);
                }
              },
            }),
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, hab.name),
              h('span', { class: 'row-sub mono' }, streak > 0 ? `Racha: ${streak} día${streak > 1 ? 's' : ''} 🔥` : 'Sin racha activa'),
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                if (confirm(`¿Eliminar el hábito "${hab.name}"?`)) {
                  await db.del('habits', hab.id);
                  const logs = s.habitlogs.filter((l) => l.habitId === hab.id);
                  for (const l of logs) await db.del('habitlogs', l.id);
                  toast('Hábito eliminado');
                }
              },
            }, icon('trash', 16)),
          );
          habitsList.append(row);
        });
      }

      const habitsCard = card('Hábitos del día', {
        actions: [
          btn('Añadir', {
            variant: 'ghost',
            icon: 'plus',
            onclick: () => {
              modal({
                title: 'Nuevo Hábito',
                fields: [{ name: 'name', label: 'Nombre del hábito', required: true, placeholder: 'Ej. Leer 20 min, Meditar' }],
                async onConfirm(val) {
                  await db.put('habits', { name: val.name });
                  toast('Hábito creado');
                },
              });
            },
          }),
        ],
      }, habitsList);

      main.append(habitsCard);

      /* ---------------- 6. Seguimientos Pendientes ---------------- */
      const followupsList = h('div', { class: 'list' });
      const pendingFollowups = s.followups.filter((f) => !f.done);
      if (!pendingFollowups.length) {
        followupsList.append(empty('Nadie pendiente por contactar.', 'users'));
      } else {
        pendingFollowups.forEach((fu) => {
          const row = h('div', { class: 'row' },
            h('input', {
              type: 'checkbox',
              class: 'check',
              checked: false,
              onclick: async () => {
                fu.done = true;
                await db.put('followups', fu);
                toast('Seguimiento completado');
              },
            }),
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, fu.person),
              h('span', { class: 'row-sub' }, `${fu.note}${fu.due ? ` · ${fmtDate(fu.due)}` : ''}`),
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                await db.del('followups', fu.id);
                toast('Eliminado');
              },
            }, icon('trash', 16)),
          );
          followupsList.append(row);
        });
      }

      const followupsCard = card('Seguimientos', {
        actions: [
          btn('Añadir', {
            variant: 'ghost',
            icon: 'plus',
            onclick: () => {
              modal({
                title: 'Nuevo Seguimiento',
                fields: [
                  { name: 'person', label: 'Nombre o Persona', required: true, placeholder: 'Ej. Juan Pérez' },
                  { name: 'note', label: 'Motivo o tema', required: true, placeholder: 'Ej. Preguntar por respuesta de cotización' },
                  { name: 'due', label: 'Fecha límite', type: 'date', value: t0 },
                ],
                async onConfirm(val) {
                  await db.put('followups', {
                    person: val.person,
                    note: val.note,
                    due: val.due || null,
                    done: false,
                  });
                  toast('Seguimiento programado');
                },
              });
            },
          }),
        ],
      }, followupsList);

      main.append(followupsCard);

      /* ---------------- 7. Vista Previa (Columna Derecha) ---------------- */
      renderHoyPreview(preview, s, f);
    }

    await refresh();
  },
};

function renderHoyPreview(container, s, f) {
  clear(container);

  // Tarjeta resumen métrico
  const t0 = today();
  const pendingCount = s.tasks.filter((t) => !t.done).length;
  const habitsDone = s.habits.filter((h) => s.habitlogs.some((l) => l.habitId === h.id && l.date === t0)).length;

  container.append(
    card('Pulso de Hoy', { cls: 'tonal' },
      h('div', { class: 'stats' },
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Tareas pendientes'),
          h('div', { class: 'val' }, String(pendingCount)),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Hábitos hoy'),
          h('div', { class: 'val' }, `${habitsDone} / ${s.habits.length}`),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Gastos de hoy'),
          h('div', { class: 'val expense' }, money(f.todayExpense)),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Cobros pendientes'),
          h('div', { class: 'val income' }, money(s.quotes.filter((q) => q.status === 'aprobado').reduce((a, b) => a + (Number(b.amount) || 0), 0))),
        ),
      ),
    ),
    card('Consejo Rápido', {},
      h('p', { class: 'muted small' },
        pendingCount > 0
          ? 'Enfócate en cerrar tu tarea más importante antes del mediodía para maximizar el ritmo del día.'
          : '¡Todas tus tareas están al día! Buen momento para revisar metas de ahorro o clientes potenciales.')),
  );
}

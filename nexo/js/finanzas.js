/* Nexo · js/finanzas.js
   Módulo de Finanzas:
   - Registro de gasto en 2 toques (monto + categoría rápida).
   - Escáner de recibos con IA (foto → extracción de comercio, monto, categoría → confirmación en modal con glow).
   - Resumen mensual y distribución por categoría con gráfica SVG (donut).
   - Previsión del saldo a fin de mes y gráfica de tendencia.
   - Suscripciones con aviso de cobro próximo.
   - Metas de ahorro con barras de progreso y cálculo mensual. */

import * as db from './db.js';
import * as ai from './ai.js';
import { financeStats, upcomingCharges, nextCharge } from './context.js';
import {
  h, clear, icon, btn, card, empty, modal, toast, money, today, monthKey, fmtMonth, fmtDate,
  donut, lineChart, pickFile, isWide,
} from './ui.js';

const QUICK_CATEGORIES = [
  { name: 'Comida', icon: 'utensils' },
  { name: 'Transporte', icon: 'plane' },
  { name: 'Hogar', icon: 'file' },
  { name: 'Ocio', icon: 'sparkles' },
  { name: 'Salud', icon: 'heart' },
  { name: 'Compras', icon: 'wallet' },
  { name: 'Servicios', icon: 'bell' },
  { name: 'Otros', icon: 'grid' },
];

export default {
  id: 'finanzas',
  title: 'Finanzas',
  icon: 'wallet',
  recordsTitle: 'Movimientos',

  async render(ctx) {
    const { main, preview, watch } = ctx;
    let selectedMonth = monthKey();

    watch(['tx', 'subs', 'goals'], () => renderAll());

    async function renderAll() {
      const [tx, subs, goals] = await Promise.all([
        db.all('tx'),
        db.all('subs'),
        db.all('goals'),
      ]);

      const f = financeStats(tx, subs, goals, selectedMonth);
      const upcoming = upcomingCharges(subs, 5);

      clear(main);
      clear(preview);

      /* ---------------- 1. Selector de Mes y Métricas Principales ---------------- */
      const monthBar = h('div', { class: 'row2' },
        h('div', { class: 'card tonal' },
          h('div', { class: 'label' }, 'Mes actual'),
          h('div', { class: 'mono', style: { fontSize: '18px', fontWeight: '600' } }, fmtMonth(selectedMonth)),
        ),
        h('div', { class: 'card tonal' },
          h('div', { class: 'label' }, 'Previsión fin de mes'),
          h('div', { class: `val ${f.forecast >= 0 ? 'income' : 'expense'}` }, money(f.forecast)),
        ),
      );
      main.append(monthBar);

      /* ---------------- 2. Registro Rápido en 2 Toques ---------------- */
      let selectedCat = 'Comida';
      const amountInput = h('input', {
        type: 'number',
        class: 'input mono',
        placeholder: '0.00',
        step: '0.01',
        min: '0.01',
        inputmode: 'decimal',
        style: { fontSize: '24px', fontWeight: 'bold' },
      });
      const noteInput = h('input', {
        type: 'text',
        class: 'input',
        placeholder: 'Nota o detalle (opcional)',
      });

      const catChips = h('div', { class: 'chips' });
      QUICK_CATEGORIES.forEach((c) => {
        const chipBtn = h('button', {
          type: 'button',
          class: `chip${c.name === selectedCat ? ' active' : ''}`,
          onclick: () => {
            selectedCat = c.name;
            for (const b of catChips.children) b.classList.toggle('active', b.textContent.trim() === c.name);
          },
        }, icon(c.icon, 16), c.name);
        catChips.append(chipBtn);
      });

      const quickSaveBtn = btn('Guardar Gasto', {
        variant: 'primary',
        onclick: async () => {
          const val = parseFloat(amountInput.value);
          if (isNaN(val) || val <= 0) {
            toast('Ingresa un monto válido', { error: true });
            amountInput.focus();
            return;
          }

          await db.put('tx', {
            type: 'expense',
            amount: val,
            category: selectedCat,
            note: noteInput.value.trim(),
            date: today(),
          });

          amountInput.value = '';
          noteInput.value = '';
          toast(`Gasto de ${money(val)} guardado`);
        },
      });

      const scanReceiptBtn = btn('Escanear Recibo', {
        variant: 'tonal',
        icon: 'scan',
        onclick: async () => {
          try {
            const file = await pickFile({ accept: 'image/*', capture: 'environment' });
            if (!file) return;

            toast('Analizando recibo con IA…');
            const compressed = await db.compressImage(file, { max: 1280 });
            const payload = ai.toPayload(compressed);

            const res = await ai.ask('receipt', { image: payload });
            const data = res.data || {};

            modal({
              title: 'Confirmar Recibo',
              subtitle: 'Gemini extrajo estos datos. Edita si es necesario:',
              fields: [
                { name: 'merchant', label: 'Comercio / Lugar', value: data.merchant || '', required: true },
                { name: 'amount', label: 'Monto total', type: 'number', step: '0.01', value: data.amount || 0, required: true },
                {
                  name: 'category',
                  label: 'Categoría',
                  type: 'select',
                  value: data.category || 'Comida',
                  options: QUICK_CATEGORIES.map((c) => c.name),
                },
                { name: 'date', label: 'Fecha', type: 'date', value: data.date || today() },
                { name: 'note', label: 'Detalle o nota', value: data.note || '' },
              ],
              async onConfirm(values) {
                await db.put('tx', {
                  type: 'expense',
                  amount: parseFloat(values.amount) || 0,
                  category: values.category || 'Otros',
                  note: `${values.merchant}${values.note ? ` - ${values.note}` : ''}`,
                  date: values.date || today(),
                });
                toast('Gasto de recibo guardado');
              },
            });
          } catch (err) {
            toast(err.message || 'Error al escanear recibo', { error: true });
          }
        },
      });

      const quickExpenseCard = card('Registrar Gasto Rápido', {
        actions: [scanReceiptBtn],
      },
      amountInput,
      catChips,
      noteInput,
      quickSaveBtn);

      main.append(quickExpenseCard);

      /* ---------------- 3. Avisos de Suscripciones Próximas ---------------- */
      if (upcoming.length) {
        const subsAlertList = h('div', { class: 'list' });
        upcoming.forEach(({ sub, date, inDays }) => {
          const row = h('div', { class: 'row' },
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, sub.name),
              h('span', { class: 'row-sub expense mono' },
                inDays === 0 ? '¡Cobro hoy!' : (inDays === 1 ? 'Cobra mañana' : `Cobra en ${inDays} días (${fmtDate(date)})`)),
            ),
            h('span', { class: 'amt expense' }, money(sub.amount)),
            btn('Pagar', {
              variant: 'ghost',
              sm: true,
              onclick: async () => {
                await db.put('tx', {
                  type: 'expense',
                  amount: sub.amount,
                  category: sub.category || 'Servicios',
                  note: `Suscripción: ${sub.name}`,
                  date: today(),
                  subId: sub.id,
                });
                sub.lastPaid = monthKey();
                await db.put('subs', sub);
                toast(`Cobro de ${sub.name} registrado`);
              },
            }),
          );
          subsAlertList.append(row);
        });

        main.append(card('Avisos de cobro próximo', { cls: 'tonal' }, subsAlertList));
      }

      /* ---------------- 4. Gráfica de Saldo y Proyección ---------------- */
      if (f.count > 0) {
        const chartSeries = [
          { values: f.series.actual, color: 'var(--accent)', area: true },
          { values: f.series.projected, color: 'var(--text-3)', dashed: true },
        ];
        const chartCard = card('Evolución y proyección del mes', {},
          lineChart({
            series: chartSeries,
            labels: ['Día 1', `Día ${Math.round(f.dim / 2)}`, `Día ${f.dim}`],
            zero: true,
            format: (v) => money(v),
          }),
          h('p', { class: 'muted small' },
            `Gasto promedio diario: ${money(f.avg)} · Proyección a fin de mes: ${money(f.forecast)}`),
        );
        main.append(chartCard);
      }

      /* ---------------- 5. Metas de Ahorro ---------------- */
      const goalsList = h('div', { class: 'list' });
      if (!f.goals.length) {
        goalsList.append(empty('No tienes metas de ahorro activas.', 'target'));
      } else {
        f.goals.forEach((g) => {
          const row = h('div', { class: 'row' },
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, g.name),
              h('span', { class: 'row-sub mono' }, `${money(g.saved)} de ${money(g.target)} (${g.pct}%)${g.perMonth ? ` · ${money(g.perMonth)}/mes` : ''}`),
              h('div', { class: 'bar', style: { marginTop: '6px' } }, h('i', { style: { width: `${g.pct}%` } })),
            ),
            btn('+ Fondos', {
              variant: 'ghost',
              sm: true,
              onclick: () => {
                modal({
                  title: `Aportar a ${g.name}`,
                  fields: [{ name: 'add', label: 'Monto a sumar', type: 'number', step: '0.01', required: true }],
                  async onConfirm(val) {
                    const extra = parseFloat(val.add) || 0;
                    g.saved = (Number(g.saved) || 0) + extra;
                    await db.put('goals', g);
                    toast(`Sumados ${money(extra)} a la meta`);
                  },
                });
              },
            }),
          );
          goalsList.append(row);
        });
      }

      main.append(card('Metas de ahorro', {
        actions: [
          btn('Nueva', {
            variant: 'ghost',
            icon: 'plus',
            onclick: () => {
              modal({
                title: 'Nueva Meta de Ahorro',
                fields: [
                  { name: 'name', label: 'Nombre de la meta', required: true, placeholder: 'Ej. Fondo de emergencia, Vacaciones' },
                  { name: 'target', label: 'Monto objetivo', type: 'number', step: '0.01', required: true },
                  { name: 'saved', label: 'Ahorrado actualmente', type: 'number', step: '0.01', value: 0 },
                  { name: 'deadline', label: 'Fecha estimada', type: 'date' },
                ],
                async onConfirm(val) {
                  await db.put('goals', {
                    name: val.name,
                    target: parseFloat(val.target) || 0,
                    saved: parseFloat(val.saved) || 0,
                    deadline: val.deadline || null,
                  });
                  toast('Meta creada');
                },
              });
            },
          }),
        ],
      }, goalsList));

      /* ---------------- 6. Vista Previa (Donut y Distribución) ---------------- */
      renderFinanzasPreview(preview, f, subs);
    }

    await renderAll();
  },

  // Columna de historial / registros para pantallas anchas
  async records(container) {
    clear(container);
    const tx = await db.all('tx');
    const sorted = [...tx].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);

    if (!sorted.length) {
      container.append(empty('Sin transacciones registradas.', 'wallet'));
      return;
    }

    const list = h('div', { class: 'list' });
    sorted.slice(0, 30).forEach((t) => {
      const isInc = t.type === 'income';
      const row = h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, t.note || t.category || 'Gasto'),
          h('span', { class: 'row-sub mono' }, `${fmtDate(t.date || today())} · ${t.category || ''}`),
        ),
        h('span', { class: `amt ${isInc ? 'income' : 'expense'}` }, `${isInc ? '+' : '-'}${money(t.amount)}`),
        h('button', {
          class: 'icon-btn sm flat',
          onclick: async () => {
            if (confirm('¿Eliminar este movimiento?')) {
              await db.del('tx', t.id);
              toast('Movimiento eliminado');
            }
          },
        }, icon('trash', 14)),
      );
      list.append(row);
    });

    container.append(list);
  },
};

function renderFinanzasPreview(container, f, subs) {
  clear(container);

  // Donut SVG por Categoría
  if (f.cats.length > 0) {
    const donutItems = f.cats.map((c) => ({ label: c.name, value: c.value }));
    const donutChart = donut(donutItems, {
      top: 'Gastos',
      bottom: money(f.expense),
    });

    const legendList = h('div', { class: 'legend' });
    f.cats.slice(0, 6).forEach((c) => {
      const pct = Math.round((c.value / (f.expense || 1)) * 100);
      legendList.append(h('div', { class: 'row' },
        h('span', { class: 'row-title' }, c.name),
        h('span', { class: 'mono muted small' }, `${pct}%`),
        h('span', { class: 'mono amt expense' }, money(c.value)),
      ));
    });

    container.append(card('Distribución de gastos', { cls: 'tonal' }, donutChart, legendList));
  } else {
    container.append(card('Distribución', { cls: 'tonal' }, empty('Sin gastos registrados este mes.', 'wallet')));
  }

  // Lista de Suscripciones Activas
  const subRows = h('div', { class: 'list' });
  if (!subs.length) {
    subRows.append(empty('No tienes suscripciones registradas.', 'bell'));
  } else {
    subs.forEach((s) => {
      const info = nextCharge(s);
      subRows.append(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, s.name),
          h('span', { class: 'row-sub mono' }, `Día ${s.day} de cada mes`),
        ),
        h('span', { class: 'amt' }, money(s.amount)),
        h('button', {
          class: 'icon-btn sm flat',
          onclick: async () => {
            if (confirm(`¿Eliminar suscripción ${s.name}?`)) {
              await db.del('subs', s.id);
              toast('Suscripción eliminada');
            }
          },
        }, icon('trash', 14)),
      ));
    });
  }

  container.append(card('Suscripciones fijas', {
    actions: [
      btn('Añadir', {
        variant: 'ghost',
        icon: 'plus',
        onclick: () => {
          modal({
            title: 'Nueva Suscripción',
            fields: [
              { name: 'name', label: 'Servicio', placeholder: 'Ej. Netflix, Gimnasio', required: true },
              { name: 'amount', label: 'Costo mensual', type: 'number', step: '0.01', required: true },
              { name: 'day', label: 'Día de cobro (1-31)', type: 'number', min: 1, max: 31, required: true },
              { name: 'category', label: 'Categoría', type: 'select', options: QUICK_CATEGORIES.map((c) => c.name) },
            ],
            async onConfirm(val) {
              await db.put('subs', {
                name: val.name,
                amount: parseFloat(val.amount) || 0,
                day: parseInt(val.day, 10) || 1,
                category: val.category || 'Servicios',
              });
              toast('Suscripción añadida');
            },
          });
        },
      }),
    ],
  }, subRows));
}

/* Nexo · js/viajes.js
   Módulo de Viajes:
   - Planificador inteligente con Gemini Flash: itinerario día a día, lista de equipaje y presupuesto.
   - 100% visible y utilizable sin conexión (guardado en IndexedDB).
   - Checklist interactivo de equipaje offline.
   - Desglose visual de presupuesto con gráfica SVG. */

import * as db from './db.js';
import * as ai from './ai.js';
import {
  h, clear, icon, btn, card, empty, modal, toast, today, addDays, diffDays, fmtDate,
  money, getCurrency, donut, pillTabs, copyText, setMd,
} from './ui.js';

export default {
  id: 'viajes',
  title: 'Viajes',
  icon: 'plane',
  recordsTitle: 'Mis Viajes',

  async render(ctx) {
    const { main, preview, watch } = ctx;

    let selectedTripId = null;
    let activeTab = 'itinerario'; // 'itinerario' | 'equipaje' | 'presupuesto' | 'tips'

    watch('trips', () => renderAll());

    async function renderAll() {
      const trips = (await db.all('trips')).sort((a, b) => a.startDate.localeCompare(b.startDate));

      if (trips.length && (!selectedTripId || !trips.some((t) => t.id === selectedTripId))) {
        // Seleccionar por defecto el próximo viaje o el último
        const upcoming = trips.find((t) => t.endDate >= today());
        selectedTripId = upcoming ? upcoming.id : trips[trips.length - 1].id;
      }

      clear(main);
      clear(preview);

      /* ---------------- 1. Barra de Control y Nuevo Viaje ---------------- */
      const topBar = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: '8px' } },
        h('div', { class: 'chips' },
          ...trips.map((t) => btn(t.destination, {
            variant: t.id === selectedTripId ? 'primary' : 'tonal',
            sm: true,
            icon: 'plane',
            onclick: () => {
              selectedTripId = t.id;
              renderAll();
            },
          })),
        ),
        btn('Planificar Nuevo Viaje con IA', {
          variant: 'primary',
          icon: 'sparkles',
          onclick: () => openNewTripModal(),
        }),
      );
      main.append(topBar);

      if (!trips.length) {
        main.append(card(null, {}, empty('No tienes viajes planificados. Pulsa arriba para crear uno con IA.', 'plane')));
        renderViajesPreview(preview, null);
        return;
      }

      const currentTrip = trips.find((t) => t.id === selectedTripId) || trips[0];
      const plan = currentTrip.plan || {};

      /* ---------------- 2. Resumen del Viaje Activo ---------------- */
      const daysLeft = diffDays(currentTrip.startDate, today());
      let timeStatus = '';
      if (daysLeft > 0) timeStatus = `Faltan ${daysLeft} días para salir`;
      else if (diffDays(currentTrip.endDate, today()) >= 0) timeStatus = '¡Viaje en curso! ✈️';
      else timeStatus = 'Viaje finalizado';

      const tripHeader = card(`${currentTrip.destination}`, {
        sub: `${fmtDate(currentTrip.startDate)} → ${fmtDate(currentTrip.endDate)} · ${timeStatus}`,
        cls: 'glow',
        actions: [
          btn('Copiar Itinerario', {
            variant: 'ghost',
            sm: true,
            icon: 'copy',
            onclick: () => copyTripPlan(currentTrip),
          }),
          h('button', {
            class: 'icon-btn sm flat',
            onclick: async () => {
              if (confirm(`¿Eliminar viaje a "${currentTrip.destination}"?`)) {
                await db.del('trips', currentTrip.id);
                selectedTripId = null;
                toast('Viaje eliminado');
              }
            },
          }, icon('trash', 14)),
        ],
      }, h('p', { class: 'small muted', style: { margin: 0 } }, plan.summary || 'Plan creado con Nexo IA.'));
      main.append(tripHeader);

      /* ---------------- 3. Pestañas del Viaje ---------------- */
      const tabs = pillTabs({
        tabs: [
          { id: 'itinerario', label: 'Itinerario' },
          { id: 'equipaje', label: 'Equipaje' },
          { id: 'presupuesto', label: 'Presupuesto' },
          { id: 'tips', label: 'Consejos IA' },
        ],
        active: activeTab,
        onChange: (id) => {
          activeTab = id;
          renderTripContent();
        },
      });
      main.append(tabs);

      const contentBox = h('div', { style: { marginTop: 'var(--space-2)' } });
      main.append(contentBox);

      function renderTripContent() {
        clear(contentBox);
        if (activeTab === 'itinerario') renderItinerary(contentBox, plan.itinerary || []);
        else if (activeTab === 'equipaje') renderPacking(contentBox, currentTrip);
        else if (activeTab === 'presupuesto') renderBudget(contentBox, plan.budget, currentTrip.budget);
        else if (activeTab === 'tips') renderTips(contentBox, plan.tips || []);
      }

      renderTripContent();

      /* ---------------- 4. Vista Previa Derecha ---------------- */
      renderViajesPreview(preview, currentTrip);
    }

    /* Pestaña: Itinerario día a día */
    function renderItinerary(container, days) {
      if (!days.length) {
        container.append(empty('Sin itinerario detallado.', 'plane'));
        return;
      }

      const list = h('div', { class: 'list' });
      days.forEach((d) => {
        const dayCard = card(`Día ${d.day}: ${d.title || ''}`, {
          sub: d.date ? fmtDate(d.date) : '',
          cls: 'tonal',
        });

        const itemsWrap = h('div', { class: 'list', style: { marginTop: 'var(--space-2)' } });
        (d.items || []).forEach((item) => {
          itemsWrap.append(h('div', { class: 'row' },
            h('span', { class: 'badge sm mono' }, item.time || '--:--'),
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, item.activity),
            ),
            item.cost ? h('span', { class: 'amt mono small muted' }, money(item.cost)) : null,
          ));
        });
        dayCard.append(itemsWrap);
        list.append(dayCard);
      });
      container.append(list);
    }

    /* Pestaña: Equipaje interactivo offline */
    function renderPacking(container, trip) {
      const packing = trip.plan?.packing || [];
      if (!packing.length) {
        container.append(empty('Sin lista de equipaje sugerida.', 'check'));
        return;
      }

      const packedSet = new Set(trip.packedItems || []);

      const totalItems = packing.reduce((acc, cat) => acc + (cat.items ? cat.items.length : 0), 0);
      const packedCount = packing.reduce((acc, cat) => {
        return acc + (cat.items ? cat.items.filter((i) => packedSet.has(i)).length : 0);
      }, 0);

      const progress = h('p', { class: 'muted small mono', style: { marginBottom: 'var(--space-2)' } },
        `Progreso de equipaje: ${packedCount} de ${totalItems} empacados (${totalItems > 0 ? Math.round((packedCount / totalItems) * 100) : 0}%)`,
      );
      container.append(progress);

      const list = h('div', { class: 'list' });
      packing.forEach((cat) => {
        const catCard = card(cat.category, { cls: 'tonal' });
        const itemsList = h('div', { class: 'list' });

        (cat.items || []).forEach((item) => {
          const isPacked = packedSet.has(item);
          const check = h('input', {
            type: 'checkbox',
            class: 'check',
            checked: isPacked,
            onchange: async (e) => {
              if (e.target.checked) packedSet.add(item);
              else packedSet.delete(item);

              trip.packedItems = [...packedSet];
              await db.put('trips', trip);
              progress.textContent = `Progreso de equipaje: ${[...packedSet].length} de ${totalItems} empacados`;
            },
          });

          itemsList.append(h('div', { class: 'row' },
            check,
            h('div', { class: 'row-main' },
              h('span', { class: `row-title ${isPacked ? 'muted' : ''}`, style: isPacked ? { textDecoration: 'line-through' } : {} }, item),
            ),
          ));
        });

        catCard.append(itemsList);
        list.append(catCard);
      });
      container.append(list);
    }

    /* Pestaña: Presupuesto */
    function renderBudget(container, budgetData, maxBudget) {
      if (!budgetData) {
        container.append(empty('Sin desglose presupuestario.', 'wallet'));
        return;
      }

      const totalEstimated = budgetData.total || 0;
      const breakdown = budgetData.breakdown || [];

      const stats = h('div', { class: 'stats' },
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Presupuesto Máximo'),
          h('div', { class: 'val mono' }, maxBudget ? money(maxBudget) : 'Sin límite'),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Total Estimado'),
          h('div', { class: 'val mono income' }, money(totalEstimated)),
        ),
      );
      container.append(stats);

      // Gráfica de Donut de distribución de gasto
      if (breakdown.length) {
        const chartData = breakdown.map((b) => ({
          label: b.category,
          value: b.amount,
        }));

        const donutSvg = donut(chartData, {
          size: 190,
          thick: 26,
          top: money(totalEstimated),
          bottom: 'Estimado',
        });

        const list = h('div', { class: 'list', style: { marginTop: 'var(--space-2)' } });
        breakdown.forEach((b) => {
          list.append(h('div', { class: 'row' },
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, b.category),
            ),
            h('span', { class: 'amt mono' }, money(b.amount)),
          ));
        });

        container.append(card('Distribución por Categoría', {},
          h('div', { style: { display: 'flex', justifyContent: 'center', margin: 'var(--space-2) 0' } }, donutSvg),
          list,
        ));
      }
    }

    /* Pestaña: Consejos IA */
    function renderTips(container, tips) {
      if (!tips.length) {
        container.append(empty('Sin consejos registrados.', 'sparkles'));
        return;
      }

      const tipsCard = card('Recomendaciones y Consejos de Viaje', { cls: 'tonal' });
      const ul = h('ul', { style: { lineHeight: 1.6, paddingLeft: '20px' } });
      tips.forEach((t) => ul.append(h('li', { style: { marginBottom: '8px' } }, t)));
      tipsCard.append(ul);
      container.append(tipsCard);
    }

    /* Modal para crear nuevo viaje */
    function openNewTripModal() {
      const tomorrow = addDays(today(), 1);
      const nextWeek = addDays(today(), 7);

      modal({
        title: 'Planificar Viaje con IA',
        subtitle: 'Gemini armará itinerario, equipaje y presupuesto:',
        fields: [
          { name: 'destination', label: 'Destino', placeholder: 'Ej. Lisboa, Portugal o Kioto, Japón', required: true },
          { name: 'startDate', label: 'Fecha de ida', type: 'date', value: tomorrow, required: true },
          { name: 'endDate', label: 'Fecha de vuelta (máx. 31 días)', type: 'date', value: nextWeek, required: true },
          { name: 'people', label: 'Número de viajeros', type: 'number', value: 1, min: 1, max: 20 },
          { name: 'budget', label: `Presupuesto máx. total (${getCurrency()})`, type: 'number', step: '10', placeholder: 'Ej. 1200' },
          {
            name: 'style',
            label: 'Estilo de viaje',
            type: 'select',
            options: [
              { value: 'equilibrado', label: 'Equilibrado' },
              { value: 'mochilero', label: 'Mochilero / Económico' },
              { value: 'cultural', label: 'Cultural e Histórico' },
              { value: 'gastronómico', label: 'Gastronómico' },
              { value: 'relax', label: 'Relax / Playa' },
              { value: 'lujo', label: 'Lujo / Confort' },
            ],
            value: 'equilibrado',
          },
        ],
        async onConfirm(val) {
          const days = diffDays(val.endDate, val.startDate);
          if (days < 0) throw new Error('La fecha de vuelta debe ser posterior a la fecha de ida.');
          if (days > 31) throw new Error('El viaje no puede superar los 31 días.');

          toast('Gemini diseñando tu viaje completo…');
          try {
            const res = await ai.ask('trip', {
              options: {
                destination: val.destination,
                startDate: val.startDate,
                endDate: val.endDate,
                people: parseInt(val.people, 10) || 1,
                budget: parseFloat(val.budget) || null,
                currency: getCurrency(),
                style: val.style,
              },
            });

            const planData = res.data || {};

            const newTrip = await db.put('trips', {
              destination: val.destination,
              startDate: val.startDate,
              endDate: val.endDate,
              budget: parseFloat(val.budget) || null,
              plan: planData,
              packedItems: [],
              createdAt: Date.now(),
            });

            selectedTripId = newTrip.id;
            toast('¡Viaje creado y guardado en tu teléfono!');
          } catch (err) {
            toast(err.message || 'Error al armar el viaje', { error: true });
          }
        },
      });
    }

    async function copyTripPlan(trip) {
      const plan = trip.plan || {};
      const lines = [
        `# Viaje a ${trip.destination}`,
        `Fechas: ${trip.startDate} a ${trip.endDate}`,
        '',
        `## Resumen`,
        plan.summary || '',
        '',
        `## Itinerario`,
        ...(plan.itinerary || []).flatMap((d) => [
          `### Día ${d.day}: ${d.title} (${d.date || ''})`,
          ...(d.items || []).map((i) => `- ${i.time || ''} ${i.activity}${i.cost ? ` [${money(i.cost)}]` : ''}`),
          '',
        ]),
        `## Consejos`,
        ...(plan.tips || []).map((t) => `- ${t}`),
      ];

      await copyText(lines.join('\n'));
    }

    await renderAll();
  },

  async records(container) {
    clear(container);
    const trips = (await db.all('trips')).sort((a, b) => b.startDate.localeCompare(a.startDate));

    if (!trips.length) {
      container.append(empty('Sin viajes registrados.', 'plane'));
      return;
    }

    const list = h('div', { class: 'list' });
    trips.forEach((t) => {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, t.destination),
          h('span', { class: 'row-sub mono' }, `${fmtDate(t.startDate)} → ${fmtDate(t.endDate)}`),
        ),
        t.budget ? h('span', { class: 'amt mono' }, money(t.budget)) : null,
      ));
    });
    container.append(list);
  },
};

function renderViajesPreview(container, trip) {
  clear(container);

  if (!trip) {
    container.append(card('Viajes Activos', {}, empty('Sin viaje seleccionado.', 'plane')));
    return;
  }

  const daysLeft = diffDays(trip.startDate, today());
  const plan = trip.plan || {};
  const totalDays = diffDays(trip.endDate, trip.startDate) + 1;

  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Duración'),
      h('div', { class: 'val mono' }, `${totalDays} ${totalDays === 1 ? 'día' : 'días'}`),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Días para salida'),
      h('div', { class: 'val mono' }, daysLeft > 0 ? `${daysLeft}d` : '0d'),
    ),
  );

  container.append(card(`Vista previa: ${trip.destination}`, { cls: 'tonal' },
    stats,
    h('p', { class: 'small muted', style: { marginTop: 'var(--space-2)' } }, plan.summary || ''),
  ));
}

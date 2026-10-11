/* Nexo · js/salud.js
   Módulo de Salud:
   - Registro de comidas con foto o texto y estimación de calorías/macros por Gemini Flash.
   - Rutinas de entrenamiento, series y pesos.
   - Gráfica de progresión de cargas por ejercicio.
   - Hábitos con cálculo de rachas continuas. */

import * as db from './db.js';
import * as ai from './ai.js';
import { habitStreak } from './context.js';
import {
  h, clear, icon, btn, card, empty, modal, toast, today, fmtDate, sum,
  pickFile, lineChart, pillTabs,
} from './ui.js';

export default {
  id: 'salud',
  title: 'Salud y Fitness',
  icon: 'heart',
  recordsTitle: 'Registro de Salud',

  async render(ctx) {
    const { main, preview, watch } = ctx;

    let activeTab = 'comidas'; // 'comidas' | 'entrenamiento' | 'habitos'
    let selectedExercise = null;

    watch(['meals', 'routines', 'sets', 'habits', 'habitlogs'], () => renderAll());

    async function renderAll() {
      const t0 = today();
      const [meals, routines, sets, habits, habitlogs] = await Promise.all([
        db.all('meals'),
        db.all('routines'),
        db.all('sets'),
        db.all('habits'),
        db.all('habitlogs'),
      ]);

      clear(main);
      clear(preview);

      /* ---------------- 1. Selector de Pestañas de Salud ---------------- */
      const tabs = pillTabs({
        tabs: [
          { id: 'comidas', label: 'Nutrición' },
          { id: 'entrenamiento', label: 'Entrenamiento' },
          { id: 'habitos', label: 'Hábitos' },
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

        if (activeTab === 'comidas') {
          renderComidasSection(contentBox, meals, t0);
        } else if (activeTab === 'entrenamiento') {
          renderEntrenamientoSection(contentBox, routines, sets, t0);
        } else if (activeTab === 'habitos') {
          renderHabitosSection(contentBox, habits, habitlogs, t0);
        }
      }

      renderTabContent();

      /* ---------------- 2. Vista Previa Derecha ---------------- */
      renderSaludPreview(preview, meals, sets, habits, habitlogs, t0);
    }

    /* ---------------- Sección: Comidas & Nutrición ---------------- */
    function renderComidasSection(container, meals, t0) {
      const todayMeals = meals.filter((m) => m.date === t0);
      const totalCal = sum(todayMeals, (m) => m.calories);
      const totalProt = sum(todayMeals, (m) => m.protein);
      const totalCarbs = sum(todayMeals, (m) => m.carbs);
      const totalFat = sum(todayMeals, (m) => m.fat);

      // Resumen del día
      const stats = h('div', { class: 'stats' },
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Calorías hoy'),
          h('div', { class: 'val mono' }, `${Math.round(totalCal)} kcal`),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Proteína'),
          h('div', { class: 'val mono income' }, `${Math.round(totalProt)} g`),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Carbohidratos'),
          h('div', { class: 'val mono' }, `${Math.round(totalCarbs)} g`),
        ),
        h('div', { class: 'stat' },
          h('div', { class: 'label' }, 'Grasas'),
          h('div', { class: 'val mono muted' }, `${Math.round(totalFat)} g`),
        ),
      );

      const captureCard = card('Registrar Comida con IA', {},
        h('p', { class: 'muted small' },
          'Toma una foto al plato o describe tu comida. Gemini Flash estimará las calorías y macronutrientes.'),
        h('div', { class: 'chips' },
          btn('Foto de comida', {
            variant: 'primary',
            icon: 'camera',
            onclick: () => scanFoodPhoto(),
          }),
          btn('Describir texto', {
            variant: 'tonal',
            icon: 'edit',
            onclick: () => scanFoodText(),
          }),
        ),
      );

      // Lista de comidas de hoy
      const mealsListCard = card(`Comidas de hoy (${todayMeals.length})`, {});
      if (!todayMeals.length) {
        mealsListCard.append(empty('No has registrado comidas hoy.', 'utensils'));
      } else {
        const list = h('div', { class: 'list' });
        todayMeals.forEach((m) => {
          const row = h('div', { class: 'row' },
            m.image ? h('img', {
              src: m.image,
              style: { width: '48px', height: '48px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' },
            }) : icon('utensils', 20),
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, m.name),
              h('span', { class: 'row-sub mono' }, `${Math.round(m.calories)} kcal · ${Math.round(m.protein || 0)}g P · ${Math.round(m.carbs || 0)}g C · ${Math.round(m.fat || 0)}g G`),
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                await db.del('meals', m.id);
                toast('Comida eliminada');
              },
            }, icon('trash', 14)),
          );
          list.append(row);
        });
        mealsListCard.append(list);
      }

      container.append(stats, captureCard, mealsListCard);
    }

    async function scanFoodPhoto() {
      const file = await pickFile({ accept: 'image/*' });
      if (!file) return;
      toast('Comprimiendo imagen y analizando plato…');
      try {
        const compressed = await db.compressImage(file);
        const payload = ai.toPayload(compressed);

        const res = await ai.ask('food', {
          image: payload,
          text: 'Estima calorías y macronutrientes de este plato.',
        });

        confirmFoodModal(res.data || {}, compressed);
      } catch (err) {
        toast(err.message || 'Error al analizar comida', { error: true });
      }
    }

    function scanFoodText() {
      modal({
        title: 'Describir Comida',
        fields: [
          { name: 'desc', label: '¿Qué comiste y qué porción aproximada?', type: 'textarea', placeholder: 'Ej. 200g de pechuga de pollo asada con 1 taza de arroz blanco y ensalada mixta', required: true },
        ],
        async onConfirm(val) {
          toast('Gemini calculando macros…');
          try {
            const res = await ai.ask('food', {
              text: val.desc,
            });
            confirmFoodModal(res.data || {}, null);
          } catch (err) {
            toast(err.message || 'Error al estimar', { error: true });
          }
        },
      });
    }

    function confirmFoodModal(data, imgDataUrl) {
      modal({
        title: 'Confirmar Comida',
        subtitle: 'Ajusta las cantidades si lo deseas antes de guardar:',
        content: imgDataUrl ? h('div', { style: { textAlign: 'center', marginBottom: 'var(--space-2)' } },
          h('img', { src: imgDataUrl, style: { maxHeight: '130px', borderRadius: 'var(--radius-md)' } }),
        ) : null,
        fields: [
          { name: 'name', label: 'Nombre o plato', value: data.name || 'Comida', required: true },
          { name: 'calories', label: 'Calorías (kcal)', type: 'number', value: data.calories || 0, required: true },
          { name: 'protein', label: 'Proteínas (g)', type: 'number', value: data.protein_g || 0 },
          { name: 'carbs', label: 'Carbohidratos (g)', type: 'number', value: data.carbs_g || 0 },
          { name: 'fat', label: 'Grasas (g)', type: 'number', value: data.fat_g || 0 },
        ],
        async onConfirm(val) {
          await db.put('meals', {
            date: today(),
            name: val.name,
            calories: parseFloat(val.calories) || 0,
            protein: parseFloat(val.protein) || 0,
            carbs: parseFloat(val.carbs) || 0,
            fat: parseFloat(val.fat) || 0,
            image: imgDataUrl || null,
            createdAt: Date.now(),
          });
          toast('Comida registrada');
        },
      });
    }

    /* ---------------- Sección: Entrenamiento ---------------- */
    function renderEntrenamientoSection(container, routines, sets, t0) {
      const todaySets = sets.filter((s) => s.date === t0);

      // 1. Selector de rutinas
      const routineCard = card('Rutinas de Entrenamiento', {
        actions: [
          btn('Nueva Rutina', {
            variant: 'ghost',
            sm: true,
            icon: 'plus',
            onclick: () => createRoutine(),
          }),
        ],
      });

      if (!routines.length) {
        routineCard.append(empty('No tienes rutinas creadas. Crea una para registrar tus series rápido.', 'dumbbell'));
      } else {
        const routineChips = h('div', { class: 'chips' });
        routines.forEach((r) => {
          routineChips.append(btn(r.name, {
            variant: 'tonal',
            onclick: () => startRoutineModal(r),
          }));
        });
        routineCard.append(routineChips);
      }
      container.append(routineCard);

      // 2. Registro rápido de serie libre
      const quickSetCard = card('Registrar Serie Libre', {},
        h('div', { class: 'form' },
          h('div', { class: 'field-row' },
            h('input', { id: 'qs-exercise', class: 'input', placeholder: 'Ejercicio (ej. Press banca)', style: { flexGrow: 2 } }),
            h('input', { id: 'qs-weight', class: 'input mono', type: 'number', step: '0.5', placeholder: 'Kg', style: { width: '80px' } }),
            h('input', { id: 'qs-reps', class: 'input mono', type: 'number', placeholder: 'Reps', style: { width: '80px' } }),
          ),
          btn('Guardar Serie', {
            variant: 'primary',
            icon: 'plus',
            onclick: async () => {
              const ex = container.querySelector('#qs-exercise')?.value.trim();
              const w = parseFloat(container.querySelector('#qs-weight')?.value) || 0;
              const r = parseInt(container.querySelector('#qs-reps')?.value, 10) || 0;
              if (!ex) { toast('Escribe el ejercicio', { error: true }); return; }
              if (r <= 0) { toast('Indica repeticiones válidas', { error: true }); return; }

              await db.put('sets', {
                date: t0,
                exercise: ex,
                weight: w,
                reps: r,
                createdAt: Date.now(),
              });
              toast('Serie registrada');
            },
          }),
        ),
      );
      container.append(quickSetCard);

      // 3. Series hechas hoy
      const setsCard = card(`Series de hoy (${todaySets.length})`, {});
      if (!todaySets.length) {
        setsCard.append(empty('Sin series registradas hoy.', 'dumbbell'));
      } else {
        const list = h('div', { class: 'list' });
        todaySets.forEach((s) => {
          list.append(h('div', { class: 'row' },
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, s.exercise),
              h('span', { class: 'row-sub mono' }, `${s.weight} kg × ${s.reps} reps`),
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                await db.del('sets', s.id);
                toast('Serie eliminada');
              },
            }, icon('trash', 14)),
          ));
        });
        setsCard.append(list);
      }
      container.append(setsCard);

      // 4. Progreso por ejercicio (Gráfica de Cargas)
      const allExerciseNames = [...new Set(sets.map((s) => s.exercise))].sort();
      if (allExerciseNames.length) {
        if (!selectedExercise || !allExerciseNames.includes(selectedExercise)) {
          selectedExercise = allExerciseNames[0];
        }

        const selector = h('select', {
          class: 'input',
          style: { marginBottom: 'var(--space-2)' },
          onchange: (e) => {
            selectedExercise = e.target.value;
            renderTabContent();
          },
        }, ...allExerciseNames.map((name) => h('option', { value: name, selected: name === selectedExercise }, name)));

        // Calcular peso máximo por día para el ejercicio seleccionado
        const exSets = sets.filter((s) => s.exercise === selectedExercise).sort((a, b) => a.date.localeCompare(b.date));
        const datesMap = {};
        exSets.forEach((s) => {
          datesMap[s.date] = Math.max(datesMap[s.date] || 0, Number(s.weight) || 0);
        });

        const sortedDates = Object.keys(datesMap).sort();
        const weights = sortedDates.map((d) => datesMap[d]);
        const labels = sortedDates.slice(-7).map((d) => d.slice(5));

        const chartNode = lineChart({
          series: [{ values: weights.slice(-7), color: 'var(--accent)', area: true }],
          labels,
          zero: false,
          format: (v) => `${v} kg`,
        });

        const progressCard = card(`Progresión de Carga: ${selectedExercise}`, {}, selector, chartNode);
        container.append(progressCard);
      }
    }

    function createRoutine() {
      modal({
        title: 'Nueva Rutina',
        fields: [
          { name: 'name', label: 'Nombre de la rutina', placeholder: 'Ej. Torso Pesado, Pierna A', required: true },
          { name: 'exercises', label: 'Ejercicios (separados por coma)', placeholder: 'Press banca, Remo con barra, Fondos', required: true },
        ],
        async onConfirm(val) {
          const exercises = (val.exercises || '').split(',').map((e) => e.trim()).filter(Boolean);
          await db.put('routines', {
            name: val.name,
            exercises,
          });
          toast('Rutina guardada');
        },
      });
    }

    function startRoutineModal(r) {
      const inputs = [];
      const content = h('div', { class: 'form' },
        h('p', { class: 'muted small' }, `Registra las series para "${r.name}":`),
        ...r.exercises.map((ex) => {
          const wInput = h('input', { class: 'input sm mono', type: 'number', step: '0.5', placeholder: 'Kg', style: { width: '80px' } });
          const rInput = h('input', { class: 'input sm mono', type: 'number', placeholder: 'Reps', style: { width: '80px' } });
          inputs.push({ exercise: ex, w: wInput, r: rInput });

          return h('div', { class: 'field-row', style: { alignItems: 'center' } },
            h('span', { class: 'small', style: { flexGrow: 1, fontWeight: 500 } }, ex),
            wInput,
            rInput,
          );
        }),
      );

      modal({
        title: `Entrenar: ${r.name}`,
        content,
        confirmText: 'Registrar Series',
        cancelText: 'Cerrar',
        async onConfirm() {
          let count = 0;
          for (const item of inputs) {
            const weight = parseFloat(item.w.value) || 0;
            const reps = parseInt(item.r.value, 10) || 0;
            if (reps > 0) {
              await db.put('sets', {
                date: today(),
                exercise: item.exercise,
                weight,
                reps,
                createdAt: Date.now(),
              });
              count += 1;
            }
          }
          if (count > 0) toast(`${count} series añadidas`);
        },
      });
    }

    /* ---------------- Sección: Hábitos ---------------- */
    function renderHabitosSection(container, habits, habitlogs, t0) {
      const habitsCard = card('Hábitos y Rachas', {
        actions: [
          btn('Nuevo Hábito', {
            variant: 'ghost',
            sm: true,
            icon: 'plus',
            onclick: () => {
              modal({
                title: 'Nuevo Hábito',
                fields: [
                  { name: 'name', label: 'Nombre del hábito', placeholder: 'Ej. Tomar 2L de agua, Meditar 10 min', required: true },
                ],
                async onConfirm(val) {
                  await db.put('habits', { name: val.name });
                  toast('Hábito creado');
                },
              });
            },
          }),
        ],
      });

      if (!habits.length) {
        habitsCard.append(empty('No tienes hábitos registrados aún.', 'flame'));
      } else {
        const list = h('div', { class: 'list' });
        habits.forEach((hItem) => {
          const streak = habitStreak(hItem.id, habitlogs);
          const doneToday = habitlogs.some((l) => l.habitId === hItem.id && l.date === t0);

          const check = h('input', {
            type: 'checkbox',
            class: 'check',
            checked: doneToday,
            onclick: async (e) => {
              if (e.target.checked) {
                await db.put('habitlogs', { habitId: hItem.id, date: t0 });
                toast(`¡${hItem.name} completado hoy! 🔥`);
              } else {
                const log = habitlogs.find((l) => l.habitId === hItem.id && l.date === t0);
                if (log) await db.del('habitlogs', log.id);
              }
            },
          });

          list.append(h('div', { class: 'row' },
            check,
            h('div', { class: 'row-main' },
              h('span', { class: 'row-title' }, hItem.name),
              h('span', { class: 'row-sub mono' }, `Racha: ${streak} ${streak === 1 ? 'día' : 'días'} 🔥`),
            ),
            h('button', {
              class: 'icon-btn sm flat',
              onclick: async () => {
                if (confirm(`¿Eliminar hábito "${hItem.name}"?`)) {
                  await db.del('habits', hItem.id);
                  toast('Hábito eliminado');
                }
              },
            }, icon('trash', 14)),
          ));
        });
        habitsCard.append(list);
      }

      container.append(habitsCard);
    }

    await renderAll();
  },

  async records(container) {
    clear(container);
    const [meals, sets] = await Promise.all([db.all('meals'), db.all('sets')]);
    const sortedMeals = [...meals].sort((a, b) => (b.id - a.id)).slice(0, 20);

    if (!sortedMeals.length && !sets.length) {
      container.append(empty('Sin registros de salud.', 'heart'));
      return;
    }

    const list = h('div', { class: 'list' });
    sortedMeals.forEach((m) => {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, m.name),
          h('span', { class: 'row-sub mono' }, `${m.date} · ${Math.round(m.calories)} kcal`),
        ),
      ));
    });
    container.append(list);
  },
};

function renderSaludPreview(container, meals, sets, habits, habitlogs, t0) {
  clear(container);

  const todayMeals = meals.filter((m) => m.date === t0);
  const totalCal = sum(todayMeals, (m) => m.calories);
  const totalProt = sum(todayMeals, (m) => m.protein);

  const setsThisWeek = sets.filter((s) => s.date >= t0.slice(0, 8) + '01');
  const daysTrained = new Set(setsThisWeek.map((s) => s.date)).size;

  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Calorías hoy'),
      h('div', { class: 'val mono' }, `${Math.round(totalCal)}`),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Proteína hoy'),
      h('div', { class: 'val mono income' }, `${Math.round(totalProt)} g`),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Días gym este mes'),
      h('div', { class: 'val mono' }, String(daysTrained)),
    ),
    h('div', { class: 'stat' },
      h('div', { class: 'label' }, 'Hábitos activos'),
      h('div', { class: 'val mono' }, String(habits.length)),
    ),
  );

  container.append(card('Métricas de Salud', {}, stats));
}

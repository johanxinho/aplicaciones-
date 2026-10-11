/* Nexo · js/context.js
   Fuente única de números de TODOS los módulos:
   - snapshot(): lee todas las tiendas.
   - financeStats / businessStats / habitStreak / upcomingCharges: cálculos puros que usan
     tanto las pantallas como el resumen que recibe la IA (así nunca discrepan).
   - buildContext(): texto compacto con el estado de todos los módulos para Gemini.

   Modelo de datos (tiendas IndexedDB):
   tasks{id,title,done,due,createdAt,doneAt,source}   habits{id,name}   habitlogs{id,habitId,date}
   followups{id,person,note,due,done}                  tx{id,type,amount,category,note,date,subId}
   subs{id,name,amount,day,category,lastPaid}          goals{id,name,target,saved,deadline}
   clients{id,name,contact,note}   quotes{id,clientId,title,amount,status,sentAt,approvedAt,paidAt}
   reminders{id,text,date,done,quoteId}   notes{id,kind,title,body,url,image,audio,tags,docText}
   meetings{id,title,date,transcript,summary,tasks}    routines{id,name,exercises}   sets{id,date,exercise,weight,reps}
   meals{id,date,name,calories,protein,carbs,fat,image}   cards{id,front,back,lang,wrong,due,box}
   langlog{id,lang,transcript,reply,corrections}   trips{id,destination,startDate,endDate,budget,plan}   chat{id,role,text}   */

import * as db from './db.js';
import {
  today, addDays, diffDays, monthKey, daysInMonth, fmtMonth, fmtDateLong, money, sum, getCurrency, parseYmd,
} from './ui.js';

export const MAX_CONTEXT_CHARS = 12000;
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export async function snapshot() {
  const names = ['tasks', 'habits', 'habitlogs', 'followups', 'tx', 'subs', 'goals', 'clients', 'quotes', 'reminders',
    'notes', 'meetings', 'routines', 'sets', 'meals', 'cards', 'langlog', 'trips'];
  const rows = await Promise.all(names.map((n) => db.all(n)));
  const out = {};
  names.forEach((n, i) => { out[n] = rows[i]; });
  return out;
}

/* ------------------------------ Hábitos ------------------------------ */
export function habitStreak(habitId, logs) {
  const days = new Set(logs.filter((l) => l.habitId === habitId).map((l) => l.date));
  let d = today();
  if (!days.has(d)) d = addDays(d, -1); // la racha sigue viva si ayer se cumplió
  let n = 0;
  while (days.has(d)) { n += 1; d = addDays(d, -1); }
  return n;
}

/* ------------------------------ Finanzas ------------------------------ */
/** Próximo cobro de una suscripción (ymd) y días que faltan. */
export function nextCharge(sub, from = today()) {
  const [y, m, d] = from.split('-').map(Number);
  const clampDay = (yy, mm) => Math.min(sub.day, new Date(yy, mm, 0).getDate());
  let yy = y; let mm = m; let dd = clampDay(yy, mm);
  if (dd < d) { mm += 1; if (mm > 12) { mm = 1; yy += 1; } dd = clampDay(yy, mm); }
  const date = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return { date, inDays: diffDays(date, from) };
}

/** Suscripciones que cobran dentro de `within` días y aún no se han registrado este mes. */
export function upcomingCharges(subs, within = 3) {
  const mk = monthKey();
  return subs
    .map((s) => ({ sub: s, ...nextCharge(s) }))
    .filter((c) => c.inDays <= within && !(c.date.startsWith(mk) && c.sub.lastPaid === mk))
    .sort((a, b) => a.inDays - b.inDays);
}

export function financeStats(tx, subs, goals, mk = monthKey()) {
  const month = tx.filter((t) => (t.date || '').startsWith(mk));
  const exp = month.filter((t) => t.type !== 'income');
  const income = sum(month.filter((t) => t.type === 'income'), (t) => t.amount);
  const expense = sum(exp, (t) => t.amount);
  const byCat = {};
  for (const t of exp) byCat[t.category || 'Otros'] = (byCat[t.category || 'Otros'] || 0) + Number(t.amount || 0);
  const cats = Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const cur = mk === monthKey();
  const dim = daysInMonth(mk);
  const day = cur ? Number(today().slice(8)) : dim;
  const avg = day ? sum(exp.filter((t) => !t.subId), (t) => t.amount) / day : 0; // gasto variable medio por día
  const pendingSubs = cur ? subs.filter((s) => s.lastPaid !== mk) : [];
  const pendingTotal = sum(pendingSubs, (s) => s.amount);
  const remDays = dim - day;
  const balance = income - expense;
  const forecast = cur ? balance - pendingTotal - avg * remDays : balance;

  // Serie diaria del saldo acumulado: real hasta hoy y proyección punteada hasta fin de mes.
  const net = Array(dim).fill(0);
  for (const t of month) net[Number(t.date.slice(8)) - 1] += (t.type === 'income' ? 1 : -1) * Number(t.amount || 0);
  const actual = []; let acc = 0;
  for (let i = 0; i < dim; i += 1) { if (i < day) { acc += net[i]; actual.push(acc); } else actual.push(null); }
  const projected = Array(dim).fill(null);
  if (cur) {
    let v = acc; projected[day - 1] = v;
    for (let i = day; i < dim; i += 1) {
      v -= avg;
      for (const s of pendingSubs) {
        const when = Math.min(s.day, dim);
        if (when === i + 1 || (when <= day && i === day)) v -= Number(s.amount || 0);
      }
      projected[i] = v;
    }
    if (!remDays) projected[dim - 1] = forecast;
  }

  const goalRows = goals.map((g) => {
    const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
    let perMonth = null;
    if (g.deadline && g.target > g.saved) {
      const months = Math.max(1, (parseYmd(g.deadline).getFullYear() - new Date().getFullYear()) * 12 + parseYmd(g.deadline).getMonth() - new Date().getMonth());
      perMonth = (g.target - g.saved) / months;
    }
    return { ...g, pct, perMonth };
  });

  return {
    mk, income, expense, balance, cats, avg, dim, day, pendingSubs, pendingTotal, forecast,
    series: { actual, projected }, goals: goalRows, count: month.length,
    todayExpense: sum(tx.filter((t) => t.date === today() && t.type !== 'income'), (t) => t.amount),
  };
}

/* ------------------------------ Negocio ------------------------------ */
export const QUOTE_STATUSES = ['borrador', 'enviado', 'aprobado', 'pagado'];

export function businessStats(quotes, clients) {
  const by = (s) => quotes.filter((q) => q.status === s);
  const total = (arr) => sum(arr, (q) => q.amount);
  const name = (id) => clients.find((c) => c.id === id)?.name || 'Sin cliente';
  const chase = by('aprobado')
    .map((q) => ({ q, client: name(q.clientId), days: Math.max(0, diffDays(today(), q.approvedAt || q.sentAt || q.createdAtYmd || today())) }))
    .sort((a, b) => b.days - a.days);
  const stale = by('enviado')
    .map((q) => ({ q, client: name(q.clientId), days: Math.max(0, diffDays(today(), q.sentAt || today())) }))
    .filter((x) => x.days >= 3).sort((a, b) => b.days - a.days);
  return {
    billed: total(by('aprobado')) + total(by('pagado')), // facturado = aprobado + pagado
    receivable: total(by('aprobado')),                    // por cobrar = aprobado sin pagar
    collected: total(by('pagado')),
    pipeline: total(by('enviado')),
    drafts: by('borrador').length,
    chase, stale, clientName: name,
  };
}

/* ------------------------------ Texto para la IA ------------------------------ */
export async function notesIndex(limit = 120) {
  const notes = (await db.all('notes')).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  return notes.map((n) => `[${n.id}] ${clip(n.title || n.kind, 60)} | ${(n.tags || []).join(',')} | ${clip(n.docText || n.body || n.url || '', 140)}`).join('\n');
}

export async function buildContext() {
  const s = await snapshot();
  const name = await db.getSetting('name', '');
  const now = new Date();
  const t0 = today();
  const L = [];
  L.push(`FECHA: ${fmtDateLong(now)} de ${now.getFullYear()}, ${now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}. MONEDA: ${getCurrency()}.${name ? ` USUARIO: ${name}.` : ''}`);

  // Hoy
  const pend = s.tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  L.push(`TAREAS PENDIENTES (${pend.length}): ${pend.slice(0, 15).map((t) => `${clip(t.title, 70)}${t.due ? ` [vence ${t.due}${t.due < t0 ? ' ATRASADA' : ''}]` : ''}`).join('; ') || 'ninguna'}. Hechas hoy: ${s.tasks.filter((t) => t.done && t.doneAt === t0).length}.`);
  const fu = s.followups.filter((f) => !f.done);
  if (fu.length) L.push(`SEGUIMIENTOS: ${fu.slice(0, 8).map((f) => `${clip(f.person, 30)} (${clip(f.note, 50)}${f.due ? `, ${f.due}` : ''})`).join('; ')}.`);
  if (s.habits.length) {
    L.push(`HÁBITOS: ${s.habits.map((h) => `${clip(h.name, 30)} racha ${habitStreak(h.id, s.habitlogs)}d ${s.habitlogs.some((l) => l.habitId === h.id && l.date === t0) ? '(hecho hoy)' : '(pendiente hoy)'}`).join('; ')}.`);
  }

  // Finanzas
  const f = financeStats(s.tx, s.subs, s.goals);
  if (f.count || s.subs.length || s.goals.length) {
    L.push(`FINANZAS ${fmtMonth(f.mk)}: ingresos ${money(f.income)}, gastos ${money(f.expense)}, balance ${money(f.balance)}. Gasto de hoy ${money(f.todayExpense)}. Por categoría: ${f.cats.slice(0, 7).map((c) => `${c.name} ${money(c.value)}`).join(', ') || 'sin gastos'}.`);
    L.push(`PREVISIÓN fin de mes: ${money(f.forecast)} (gasto variable medio ${money(f.avg)}/día; suscripciones pendientes este mes ${money(f.pendingTotal)}).`);
    if (s.subs.length) L.push(`SUSCRIPCIONES: ${s.subs.map((x) => `${clip(x.name, 25)} ${money(x.amount)} día ${x.day}${x.lastPaid === monthKey() ? ' (pagada)' : ''}`).join('; ')}.`);
    if (f.goals.length) L.push(`METAS DE AHORRO: ${f.goals.map((g) => `${clip(g.name, 30)} ${money(g.saved)}/${money(g.target)} (${g.pct}%)${g.perMonth ? `, necesita ${money(g.perMonth)}/mes` : ''}`).join('; ')}.`);
  }

  // Negocio
  const b = businessStats(s.quotes, s.clients);
  if (s.quotes.length || s.clients.length) {
    L.push(`NEGOCIO: facturado ${money(b.billed)}, por cobrar ${money(b.receivable)}, cobrado ${money(b.collected)}, enviado sin respuesta ${money(b.pipeline)}, borradores ${b.drafts}, clientes ${s.clients.length}.`);
    if (b.chase.length) L.push(`A QUIÉN COBRAR: ${b.chase.slice(0, 8).map((x) => `${clip(x.client, 30)} ${money(x.q.amount)} "${clip(x.q.title, 30)}" (aprobado hace ${x.days}d)`).join('; ')}.`);
    if (b.stale.length) L.push(`PRESUPUESTOS SIN RESPUESTA: ${b.stale.slice(0, 6).map((x) => `${clip(x.client, 30)} ${money(x.q.amount)} (enviado hace ${x.days}d)`).join('; ')}.`);
    const rem = s.reminders.filter((r) => !r.done).sort((a, c) => (a.date || '9999').localeCompare(c.date || '9999')).slice(0, 6);
    if (rem.length) L.push(`RECORDATORIOS: ${rem.map((r) => `${clip(r.text, 60)}${r.date ? ` (${r.date})` : ''}`).join('; ')}.`);
  }

  // Memoria, reuniones
  if (s.notes.length) {
    const rec = [...s.notes].sort((a, c) => c.createdAt - a.createdAt).slice(0, 8);
    L.push(`MEMORIA (${s.notes.length} elementos; recientes): ${rec.map((n) => `${clip(n.title || n.kind, 40)}${n.tags?.length ? ` #${n.tags.join(' #')}` : ''}`).join('; ')}.`);
  }
  const mt = [...s.meetings].sort((a, c) => c.createdAt - a.createdAt)[0];
  if (mt) L.push(`ÚLTIMA REUNIÓN (${mt.date}) "${clip(mt.title, 40)}": ${clip(mt.summary, 400)}`);

  // Salud
  const weekAgo = addDays(t0, -6);
  const sets = s.sets.filter((x) => x.date >= weekAgo);
  const mealsToday = s.meals.filter((m) => m.date === t0);
  if (sets.length || mealsToday.length || s.routines.length) {
    const days = new Set(sets.map((x) => x.date)).size;
    L.push(`SALUD: ${days} días de entrenamiento en los últimos 7 (${sets.length} series). Hoy comió ~${Math.round(sum(mealsToday, (m) => m.calories))} kcal y ~${Math.round(sum(mealsToday, (m) => m.protein))} g de proteína (aproximado por IA).`);
  }

  // Idiomas
  const wrong = s.cards.filter((c) => c.wrong).slice(0, 4);
  if (wrong.length) L.push(`IDIOMAS: errores frecuentes: ${wrong.map((c) => `"${clip(c.wrong, 30)}" → "${clip(c.front, 30)}"`).join('; ')}. Tarjetas para repasar hoy: ${s.cards.filter((c) => !c.due || c.due <= t0).length}.`);

  // Viajes
  const trips = s.trips.filter((t) => t.endDate >= t0).sort((a, c) => a.startDate.localeCompare(c.startDate)).slice(0, 3);
  if (trips.length) L.push(`VIAJES PRÓXIMOS: ${trips.map((t) => `${clip(t.destination, 40)} ${t.startDate}→${t.endDate}, presupuesto ${money(t.budget || 0)}`).join('; ')}.`);

  const text = L.join('\n');
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}…` : text;
}

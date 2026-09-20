// Data layer. All reads go through fetchRows() so demo mode (?demo=1) can
// substitute generated rows for real PostgREST queries.

import { rest, restAll, storageSignedUrl } from './api.js';

export const DEMO = new URLSearchParams(location.search).has('demo');

function demoQuery(table, { eq = {}, gte = {}, gt = {}, lte = {}, lt = {}, notNull = [], order, limit } = {}) {
  let rows = (window.DEMO_DATA?.[table] ?? []).slice();
  for (const [k, v] of Object.entries(eq)) rows = rows.filter((r) => r[k] === v);
  for (const [k, v] of Object.entries(gte)) rows = rows.filter((r) => r[k] >= v);
  for (const [k, v] of Object.entries(gt)) rows = rows.filter((r) => r[k] > v);
  for (const [k, v] of Object.entries(lte)) rows = rows.filter((r) => r[k] <= v);
  for (const [k, v] of Object.entries(lt)) rows = rows.filter((r) => r[k] < v);
  for (const k of notNull) rows = rows.filter((r) => r[k] != null);
  if (order) {
    const [col, dir] = order;
    rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  if (limit) rows = rows.slice(0, limit);
  return Promise.resolve(rows);
}

export async function fetchRows(table, { select = '*', eq = {}, gte = {}, gt = {}, lte = {}, lt = {}, notNull = [], order, limit } = {}) {
  if (DEMO) return demoQuery(table, { eq, gte, gt, lte, lt, notNull, order, limit });
  const params = [`select=${encodeURIComponent(select)}`];
  for (const [k, v] of Object.entries(eq)) params.push(`${k}=eq.${encodeURIComponent(v)}`);
  for (const [k, v] of Object.entries(gte)) params.push(`${k}=gte.${encodeURIComponent(v)}`);
  for (const [k, v] of Object.entries(gt)) params.push(`${k}=gt.${encodeURIComponent(v)}`);
  for (const [k, v] of Object.entries(lte)) params.push(`${k}=lte.${encodeURIComponent(v)}`);
  for (const [k, v] of Object.entries(lt)) params.push(`${k}=lt.${encodeURIComponent(v)}`);
  for (const k of notNull) params.push(`${k}=not.is.null`);
  if (order) params.push(`order=${order[0]}.${order[1]}`);
  const path = `${table}?${params.join('&')}`;
  if (limit) return rest(`${path}&limit=${limit}`);
  return restAll(path);
}

// ---------------------------------------------------------------------------
// Core store, loaded once after sign-in.

export const store = {
  profiles: [],
  byId: new Map(),
  streaks: new Map(),
  msgStats: new Map(), // user_id -> {count, lastAt, userCount}
  msgByDay: new Map(), // 'YYYY-MM-DD' -> count (user-authored only)
  completions: [], // {user_id, at} deduped completed workouts
  planIndex: [], // {id, user_id, created_at, active, start}
  appstore: [], // {date, downloads, page_views} sorted asc; [] until ingester has run
  loadedAt: null,
  coreLoaded: false,
};

export function isTestAccount(p) {
  return (p.account_type != null && p.account_type !== 'real') || !!p.is_internal || /joeli1989\+/i.test(p.email || '');
}

const day = (ts) => (ts ? String(ts).slice(0, 10) : null);

const PROFILE_SELECT =
  'id,email,name,created_at,gender,dob,goal,goal_target,goal_timeline_weeks,fitness_level,equipment,injuries,exercises_to_avoid,focus_areas,is_pro,is_admin,is_internal,onboarding_complete,preferred_units,account_type,notes';

function indexProfiles(profiles) {
  store.profiles = profiles;
  store.byId = new Map(profiles.map((p) => [p.id, p]));
}

// Intent Lab needs only the account index for its internal/test filter. Keep
// this path small so opening the lab does not wait for the entire customer
// dashboard dataset (notably the paged messages table).
export async function loadIntentCore() {
  if (store.profiles.length) return;
  const profiles = await fetchRows('profiles', { select: PROFILE_SELECT });
  indexProfiles(profiles);
  store.loadedAt = new Date();
}

export async function loadCore() {
  const [profiles, streaks, msgs, sessions, sched, plans, appstore] = await Promise.all([
    fetchRows('profiles', {
      select: PROFILE_SELECT,
    }),
    fetchRows('user_streaks', { select: 'user_id,current_streak,longest_streak,last_active_date' }),
    fetchRows('messages', { select: 'user_id,role,created_at,is_trainer_initiated' }),
    fetchRows('workout_sessions', { select: 'user_id,completed_at,status,scheduled_workout_id' }),
    fetchRows('scheduled_workouts', { select: 'id,user_id,status,completed_at' }),
    fetchRows('plans', { select: 'id,user_id,created_at,active,plan_start_local_date' }),
    // Tolerate absence: the appstore_metrics migration/ingester may not have run yet.
    fetchRows('appstore_metrics', { select: 'date,downloads,page_views', order: ['date', 'asc'] }).catch(() => []),
  ]);

  indexProfiles(profiles);
  store.streaks = new Map(streaks.map((s) => [s.user_id, s]));

  store.msgStats = new Map();
  store.msgByDay = new Map();
  for (const m of msgs) {
    const s = store.msgStats.get(m.user_id) ?? { count: 0, userCount: 0, lastAt: null };
    s.count += 1;
    if (m.role === 'user') {
      s.userCount += 1;
      const d = day(m.created_at);
      if (d) store.msgByDay.set(d, (store.msgByDay.get(d) ?? 0) + 1);
    }
    if (!s.lastAt || m.created_at > s.lastAt) s.lastAt = m.created_at;
    store.msgStats.set(m.user_id, s);
  }

  // Completed workouts, deduped: sessions win; scheduled rows only count when
  // no completed session points at them.
  const claimedSched = new Set(
    sessions.filter((s) => s.completed_at && s.scheduled_workout_id).map((s) => s.scheduled_workout_id)
  );
  store.completions = [
    ...sessions.filter((s) => s.completed_at).map((s) => ({ user_id: s.user_id, at: s.completed_at })),
    ...sched
      .filter((w) => w.status === 'completed' && w.completed_at && !claimedSched.has(w.id))
      .map((w) => ({ user_id: w.user_id, at: w.completed_at })),
  ];

  store.planIndex = plans.map((p) => ({ ...p }));
  store.appstore = appstore;
  store.loadedAt = new Date();
  store.coreLoaded = true;
}

// Monday-start ISO week key for a timestamp.
export function weekKey(ts) {
  const d = new Date(ts);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

// WAWC2 = distinct users completing >=2 workouts in the calendar week.
export function wawc2Series(weeks = 8, userFilter = () => true) {
  const perWeek = new Map();
  for (const c of store.completions) {
    if (!userFilter(store.byId.get(c.user_id) ?? {})) continue;
    const wk = weekKey(c.at);
    if (!perWeek.has(wk)) perWeek.set(wk, new Map());
    const users = perWeek.get(wk);
    users.set(c.user_id, (users.get(c.user_id) ?? 0) + 1);
  }
  const out = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i * 7);
    const wk = weekKey(d.toISOString());
    const users = perWeek.get(wk) ?? new Map();
    let n = 0;
    for (const cnt of users.values()) if (cnt >= 2) n++;
    out.push({ week: wk, value: n });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-user detail fetches (on demand).

const SIGN_TTL_SECONDS = 3600;
const SIGN_REUSE_MS = 50 * 60 * 1000;
const chatImageUrlCache = new Map();

async function resolveChatImage(image) {
  // Demo fixtures can carry a self-contained URL; production rows carry only
  // private Storage paths in meta.images[].path.
  if (DEMO && typeof image?.url === 'string') return image.url;
  const path = typeof image?.path === 'string' ? image.path : '';
  if (!path) return null;
  const cached = chatImageUrlCache.get(path);
  if (cached && Date.now() - cached.fetchedAt < SIGN_REUSE_MS) return cached.url;
  try {
    const url = await storageSignedUrl('user-images', path, SIGN_TTL_SECONDS);
    chatImageUrlCache.set(path, { url, fetchedAt: Date.now() });
    return url;
  } catch (e) {
    console.warn('[admin] Could not load chat image:', e.message);
    return null;
  }
}

export async function fetchUserMessages(userId) {
  const messages = await fetchRows('messages', {
    select: 'id,role,content,meta,created_at,is_trainer_initiated,intent_used,action_card_type',
    eq: { user_id: userId },
    order: ['created_at', 'asc'],
  });
  await Promise.all(
    messages.map(async (m) => {
      const images = Array.isArray(m.meta?.images) ? m.meta.images.slice(0, 3) : [];
      m.chat_image_count = images.length;
      m.chat_image_urls = (await Promise.all(images.map(resolveChatImage))).filter(Boolean);
    })
  );
  return messages;
}

export function fetchUserPlans(userId) {
  return fetchRows('plans', {
    select: 'id,user_id,content,meta,created_at,active,plan_start_local_date',
    eq: { user_id: userId },
    order: ['created_at', 'desc'],
  });
}

export async function fetchPlan(planId) {
  const rows = await fetchRows('plans', {
    select: 'id,user_id,content,meta,created_at,active,plan_start_local_date',
    eq: { id: planId },
  });
  return rows[0] ?? null;
}

export function fetchUserSessions(userId) {
  return fetchRows('workout_sessions', {
    select: 'id,title,day_index,day_number,started_at,completed_at,status,rating,comment,notes',
    eq: { user_id: userId },
    order: ['created_at', 'desc'],
  });
}

export function fetchSessionSets(sessionId) {
  return fetchRows('workout_set_logs', {
    select: 'exercise_name,set_number,weight_kg,reps,rpe,performed_at',
    eq: { session_id: sessionId },
    order: ['id', 'asc'],
  });
}

export function fetchUserOutreach(userId) {
  return fetchRows('trainer_outreach_log', {
    select: 'trigger_type,tone,outreach_goal,attention_tier,reasoning,sent_at,created_at,action_taken,reason_code,outreach_angle',
    eq: { user_id: userId },
    order: ['created_at', 'desc'],
    limit: 100,
  });
}

export function fetchUserAdjustments(userId) {
  return fetchRows('plan_adjustments', {
    select: 'adjustment_type,reason,reasoning,applied_at,rejected_at,created_at',
    eq: { user_id: userId },
    order: ['created_at', 'desc'],
    limit: 100,
  });
}

export function fetchUserScheduled(userId) {
  return fetchRows('scheduled_workouts', {
    select: 'scheduled_date,status,phase,plan_day_index,completed_at,skipped_at,deferred_to_date,actual_duration_sec',
    eq: { user_id: userId },
    order: ['scheduled_date', 'desc'],
    limit: 120,
  });
}

// Pipeline "workings" for one user: classifier decisions, skill runs,
// telemetry events, and (once the chat function writes it) llm_trace calls.
// Each source is tolerated missing — admin policies may lag the dashboard.
export async function fetchUserTrace(userId) {
  const [decisions, skills, events, llm] = await Promise.all([
    fetchRows('classifier_decisions', {
      select: 'intent,confidence,router_disposition,guard_short_circuited,guard_name,ambiguity,created_at',
      eq: { user_id: userId },
      order: ['created_at', 'desc'],
      limit: 200,
    }).catch(() => []),
    fetchRows('skill_invocations', {
      select: 'skill_name,outcome,invoked_at',
      eq: { user_id: userId },
      order: ['invoked_at', 'desc'],
      limit: 200,
    }).catch(() => []),
    fetchRows('telemetry', {
      select: 'event,model,tokens_in,tokens_out,cost_usd,payload,created_at',
      eq: { user_id: userId },
      order: ['created_at', 'desc'],
      limit: 300,
    }).catch(() => []),
    fetchRows('llm_trace', {
      select: 'step,model,prompt_tokens,completion_tokens,latency_ms,created_at',
      eq: { user_id: userId },
      order: ['created_at', 'desc'],
      limit: 200,
    }).catch(() => []),
  ]);
  const items = [
    ...decisions.map((d) => ({
      at: d.created_at,
      kind: 'classifier',
      label: `classifier → ${d.intent} (${Number(d.confidence).toFixed(2)}) · ${d.router_disposition}${d.guard_short_circuited ? ` · guard: ${d.guard_name}` : ''}`,
      detail: d.ambiguity ?? null,
    })),
    ...skills.map((s) => ({
      at: s.invoked_at,
      kind: 'skill',
      label: `skill: ${s.skill_name}${s.outcome ? ` · ${s.outcome}` : ''}`,
      detail: null,
    })),
    ...events.map((t) => ({
      at: t.created_at,
      kind: 'event',
      label: `event: ${t.event}${t.model ? ` · ${t.model}` : ''}${t.tokens_in != null ? ` · ${t.tokens_in}→${t.tokens_out ?? 0} tok` : ''}${t.cost_usd != null ? ` · $${Number(t.cost_usd).toFixed(4)}` : ''}`,
      detail: t.payload ?? null,
    })),
    ...llm.map((l) => ({
      at: l.created_at,
      kind: 'llm',
      label: `llm: ${l.step ?? 'call'} · ${l.model ?? ''} · ${l.prompt_tokens ?? '?'}→${l.completion_tokens ?? '?'} tok · ${l.latency_ms ?? '?'}ms`,
      detail: null,
    })),
  ];
  items.sort((a, b) => (a.at < b.at ? -1 : 1));
  return items;
}

export function fetchRecentPlans(limit = 40) {
  return fetchRows('plans', {
    select: 'id,user_id,content,meta,created_at,active,plan_start_local_date',
    order: ['created_at', 'desc'],
    limit,
  });
}

export function fetchRecentIntentDecisions(limit = 300) {
  return fetchRows('classifier_decisions', {
    select: 'user_id,message_text,intent,confidence,entities,ambiguity,router_disposition,guard_short_circuited,guard_name,created_at',
    order: ['created_at', 'desc'],
    limit,
  });
}

// ---------------------------------------------------------------------------
// Date-bounded visibility queries. These intentionally never use restAll:
// production observability pages must have a hard row ceiling.

export function fetchVisibilityMessages(start, end, limit = 5000) {
  return fetchRows('messages', {
    select: 'id,user_id,role,content,meta,created_at,is_trainer_initiated,intent_used,action_card_type',
    gte: { created_at: start },
    lt: { created_at: end },
    order: ['created_at', 'asc'],
    limit,
  });
}

export function fetchVisibilityDecisions(start, end, limit = 3000) {
  return fetchRows('classifier_decisions', {
    select: 'id,user_id,message_text,intent,confidence,entities,ambiguity,router_disposition,guard_short_circuited,guard_name,created_at',
    gte: { created_at: start },
    lt: { created_at: end },
    order: ['created_at', 'asc'],
    limit,
  });
}

export async function fetchVisibilityAdjustments(start, end, limit = 2000) {
  const select = 'id,user_id,plan_id,adjustment_type,reasoning,reason,created_at,applied_at,rejected_at';
  const [created, applied] = await Promise.all([
    fetchRows('plan_adjustments', {
      select,
      gte: { created_at: start },
      lt: { created_at: end },
      order: ['created_at', 'asc'],
      limit,
    }),
    // An adjustment can be created earlier and only applied inside the
    // inspected period. Keep this second query bounded by applied_at.
    fetchRows('plan_adjustments', {
      select,
      gte: { applied_at: start },
      lt: { applied_at: end },
      order: ['applied_at', 'asc'],
      limit,
    }),
  ]);
  return [...new Map([...created, ...applied].map((row) => [row.id, row])).values()];
}

export function fetchVisibilityPlans(start, end, limit = 1000) {
  return fetchRows('plans', {
    // plans has no title column. Title stays nested in content.meta.title.
    select: 'id,user_id,content,meta,created_at',
    gte: { created_at: start },
    lt: { created_at: end },
    order: ['created_at', 'asc'],
    limit,
  });
}

export function fetchVisibilityTelemetry(start, end, limit = 5000) {
  return fetchRows('telemetry', {
    select: 'id,user_id,event,model,tokens_in,tokens_out,cost_usd,created_at',
    gte: { created_at: start },
    lt: { created_at: end },
    order: ['created_at', 'asc'],
    limit,
  });
}

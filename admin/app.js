// TrainerX admin dashboard — views + hash router.

import { auth } from './api.js';
import {
  DEMO,
  store,
  loadCore,
  loadIntentCore,
  isTestAccount,
  wawc2Series,
  fetchUserMessages,
  fetchUserTrace,
  fetchUserPlans,
  fetchPlan,
  fetchUserSessions,
  fetchSessionSets,
  fetchUserOutreach,
  fetchUserAdjustments,
  fetchUserScheduled,
  fetchRecentPlans,
  fetchRecentIntentDecisions,
  fetchVisibilityMessages,
  fetchVisibilityDecisions,
  fetchVisibilityAdjustments,
  fetchVisibilityPlans,
  fetchVisibilityTelemetry,
} from './data.js';
import { INTENT_CATALOG, SIMULATION_CASES, simulateIntent, runSimulationSuite } from './intent-simulator.js';
import { PROMPT_CATALOG, PROMPT_CATALOG_SYNCED_AT } from './prompt-catalog.js?v=20260831-prompts1';
import {
  LEGACY_TONE_ALIASES,
  TONE_SOURCE_FILES,
  TONE_SYNCED_AT,
  TONE_VARIANTS_SNAPSHOT,
  TRAINER_IDENTITY_SNAPSHOT,
  VOICE_ANTI_PATTERNS,
  VOICE_RULE_GROUPS,
  VOICE_SURFACES,
} from './tone-of-voice.js?v=20260831-tone1';
import {
  attachClassifierDecisions,
  findActionClaims,
  findDeadEnds,
  findRepeatSends,
  findUnresolvedAmbiguity,
  findDeclines,
  pairConversationTurns,
  periodCounts,
  summarizeCosts,
} from './visibility.js?v=20260831-visibility3';

const $app = document.getElementById('app');
let hideTest = localStorage.getItem('tx_hide_test') !== '0';

// ---------------------------------------------------------------------------
// helpers

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
const fmtDateTime = (ts) => (ts ? `${fmtDate(ts)} ${fmtTime(ts)}` : '—');

function messageUsageMeta(m) {
  const usage = m?.meta?.llm_usage;
  if (!usage || typeof usage !== 'object') return '';
  const input = Number(usage.prompt_tokens);
  const output = Number(usage.completion_tokens);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return '';

  const model = String(usage.model ?? '').replace(/^gpt-\d+(?:\.\d+)?-/, '') || 'LLM';
  const cost = Number(usage.estimated_cost_usd);
  const costLabel = usage.estimated_cost_usd != null && Number.isFinite(cost)
    ? ` · est. $${cost.toFixed(cost > 0 && cost < 0.001 ? 5 : 4)}`
    : '';
  const cached = Number(usage.cached_prompt_tokens) || 0;
  const reasoning = Number(usage.reasoning_tokens) || 0;
  const details = [
    `${usage.model ?? 'LLM'} · ${input.toLocaleString()} input / ${output.toLocaleString()} output tokens`,
    cached ? `${cached.toLocaleString()} cached input tokens` : '',
    reasoning ? `${reasoning.toLocaleString()} reasoning tokens (included in output)` : '',
    usage.cost_basis ? `Estimated using ${usage.cost_basis}` : 'Token usage only; no matching list-price estimate',
  ].filter(Boolean).join(' · ');

  return `<span class="llm-usage" title="${esc(details)}">${esc(model)} · ${input.toLocaleString()}→${output.toLocaleString()} tok${costLabel}</span>`;
}

function ago(ts) {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(ts);
}

const displayName = (p) => p?.name || (p?.email ? p.email.split('@')[0] : 'Unknown');
const initials = (p) =>
  displayName(p)
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

function visibleProfiles() {
  return store.profiles.filter((p) => (hideTest ? !isTestAccount(p) : true));
}
const userVisible = (p) => (hideTest ? !isTestAccount(p) : true);

function countSince(items, getTs, days, filterUser) {
  const cutoff = Date.now() - days * 86400 * 1000;
  let n = 0;
  for (const it of items) {
    if (filterUser && !filterUser(it)) continue;
    const ts = getTs(it);
    if (ts && new Date(ts).getTime() >= cutoff) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// bar chart (single series — series-1, thin marks, rounded data ends, tooltip)

function barChart({ data, labelFn, valueLabel }) {
  const W = 520, H = 180, padL = 30, padB = 22, padT = 10;
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - padL - 8, innerH = H - padT - padB;
  const bw = Math.min(34, (innerW / data.length) * 0.62);
  const step = innerW / data.length;
  const y = (v) => padT + innerH - (v / max) * innerH;
  const ticks = [0, Math.ceil(max / 2), max];

  let bars = '', axis = '', grid = '';
  for (const t of ticks) {
    grid += `<line x1="${padL}" x2="${W - 8}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)" stroke-width="1"/>`;
    axis += `<text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${t}</text>`;
  }
  data.forEach((d, i) => {
    const x = padL + i * step + (step - bw) / 2;
    const h = Math.max(d.value > 0 ? 3 : 0, innerH * (d.value / max));
    bars += `<path data-i="${i}" d="M${x},${padT + innerH} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(0, h - 4)} z"
      fill="var(--series-1)" opacity="${d.value === 0 ? 0 : 1}"/>
      <rect data-i="${i}" x="${padL + i * step}" y="${padT}" width="${step}" height="${innerH}" fill="transparent"/>`;
    axis += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${esc(labelFn(d, i))}</text>`;
  });

  const id = 'c' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const wrap = document.getElementById(id);
    if (!wrap) return;
    const tip = wrap.querySelector('.chart-tooltip');
    wrap.querySelectorAll('[data-i]').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const d = data[+el.dataset.i];
        tip.style.display = 'block';
        tip.innerHTML = `<strong>${d.value}</strong> ${esc(valueLabel)} · ${esc(labelFn(d, +el.dataset.i))}`;
        const r = wrap.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 150) + 'px';
        tip.style.top = e.clientY - r.top - 34 + 'px';
      });
      el.addEventListener('mouseleave', () => (tip.style.display = 'none'));
    });
  }, 0);

  return `<div class="chart-wrap" id="${id}">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid}${bars}${axis}</svg>
    <div class="chart-tooltip"></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// shell + router

function shell(active, content) {
  const analyzeOpen = localStorage.getItem('tx_nav_analyze') !== '0' || active.startsWith('analyze-');
  const buildOpen = localStorage.getItem('tx_nav_build') !== '0' || ['intent-simulator', 'prompts', 'tone-of-voice'].includes(active);
  const icon = (name) => {
    const paths = {
      home: '<path d="M3 10.5 10 4l7 6.5v7H6v-7"/><path d="M8.5 17v-4.5h3V17"/>',
      conversations: '<path d="M4 5h12v9H9l-4 3v-3H4z"/><path d="M7 8h6M7 11h4"/>',
      analyze: '<path d="M4 16V9m6 7V4m6 12v-5"/>',
      intent: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2"/><path d="M10 1v3m9 6h-3"/>',
      failures: '<path d="M10 3 18 17H2z"/><path d="M10 8v4m0 2h.01"/>',
      cost: '<circle cx="10" cy="10" r="7"/><path d="M12.5 7.5c-.5-.8-1.3-1-2.4-1-1.4 0-2.3.6-2.3 1.5 0 2.4 4.8.9 4.8 3.5 0 1-.9 1.7-2.5 1.7-1.2 0-2.1-.4-2.7-1.2M10 5v10"/>',
      build: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M7 10h6M10 7v6"/>',
      prompts: '<path d="M5 3h8l2 2v12H5z"/><path d="M8 8h4m-4 3h4m-4 3h3"/>',
      voice: '<path d="M3 10h2l2-4 3 8 2-6 2 4h3"/>',
      simulator: '<path d="M5 4h10v12H5z"/><path d="m8 8 4 2-4 2z"/>',
      settings: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.3 4.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4"/>',
    };
    return `<svg class="nav-icon" viewBox="0 0 20 20" aria-hidden="true">${paths[name]}</svg>`;
  };
  const navLink = (key, label, href, iconName) =>
    `<a class="navlink ${active === key ? 'active' : ''}" href="${href}">${icon(iconName)}<span>${label}</span></a>`;
  $app.innerHTML = `<div class="shell">
    <nav class="sidebar">
      <div class="brand">trainer<span>X</span> admin</div>
      <div class="nav-tree">
        ${navLink('home', 'Home', '#/home', 'home')}
        ${navLink('conversations', 'Conversations', '#/conversations', 'conversations')}
        <button class="nav-group ${active.startsWith('analyze-') ? 'active-parent' : ''}" data-nav-group="analyze" aria-expanded="${analyzeOpen}">
          ${icon('analyze')}<span>Analyze</span><span class="nav-chevron">${analyzeOpen ? '⌃' : '⌄'}</span>
        </button>
        <div class="nav-children ${analyzeOpen ? '' : 'collapsed'}">
          ${navLink('analyze-intents', 'Intents', '#/analyze/intents', 'intent')}
          ${navLink('analyze-failures', 'Failures', '#/analyze/failures', 'failures')}
          ${navLink('analyze-cost', 'Cost', '#/analyze/cost', 'cost')}
        </div>
        <button class="nav-group ${['intent-simulator', 'prompts', 'tone-of-voice'].includes(active) ? 'active-parent' : ''}" data-nav-group="build" aria-expanded="${buildOpen}">
          ${icon('build')}<span>Build</span><span class="nav-chevron">${buildOpen ? '⌃' : '⌄'}</span>
        </button>
        <div class="nav-children ${buildOpen ? '' : 'collapsed'}">
          ${navLink('prompts', 'Prompts', '#/build/prompts', 'prompts')}
          ${navLink('tone-of-voice', 'Tone of Voice', '#/build/tone-of-voice', 'voice')}
          ${navLink('intent-simulator', 'Intent Simulator', '#/build/intent-simulator', 'simulator')}
        </div>
        ${navLink('settings', 'Settings', '#/settings', 'settings')}
      </div>
      <div class="foot">
        <label class="toggle"><input type="checkbox" id="hideTest" ${hideTest ? '' : 'checked'}/> Include internal accounts</label>
        <div>${DEMO ? 'demo data' : esc(auth.session?.user?.email ?? '')}</div>
        <button id="signout">Sign out</button>
      </div>
    </nav>
    <main class="main">${DEMO ? '<div class="demo-banner">Demo mode — generated sample data, not production.</div>' : ''}${content}</main>
  </div>`;
  document.getElementById('signout').onclick = () => {
    auth.signOut();
    location.hash = '';
    location.reload();
  };
  document.getElementById('hideTest').onchange = (e) => {
    hideTest = !e.target.checked;
    localStorage.setItem('tx_hide_test', hideTest ? '1' : '0');
    route();
  };
  document.querySelectorAll('[data-nav-group]').forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.navGroup;
      const open = button.getAttribute('aria-expanded') === 'true';
      localStorage.setItem(`tx_nav_${key}`, open ? '0' : '1');
      route();
    };
  });
}

// ---------------------------------------------------------------------------
// Intent Lab

let intentLabResult = null;
let intentSuiteResults = null;

function intentContextFromForm() {
  return {
    hasActivePlan: document.getElementById('ctxPlan')?.checked ?? true,
    isPro: document.getElementById('ctxPro')?.checked ?? true,
    freePlanUsed: document.getElementById('ctxFreeUsed')?.checked ?? false,
    pendingAction: document.getElementById('ctxPending')?.checked ?? false,
    imageAttached: document.getElementById('ctxImage')?.checked ?? false,
    screenContext: document.getElementById('ctxScreen')?.value ?? '',
  };
}

function renderIntentResult(result) {
  if (!result) return `<div class="intent-empty-state">
    <div class="intent-empty-icon">⌁</div>
    <strong>Run a message through the simulator</strong>
    <span>You’ll see classification, guards, routing, and every write the real flow would attempt.</span>
  </div>`;
  const confidence = Math.round(result.confidence * 100);
  const entityRows = Object.entries(result.entities ?? {});
  return `<div class="intent-result">
    <div class="intent-result-head">
      <div><span class="eyebrow">Simulated decision</span><div class="intent-result-name">${esc(result.intent)}</div></div>
      <div class="confidence-ring" style="--confidence:${confidence * 3.6}deg"><span>${confidence}%</span></div>
    </div>
    <div class="intent-route-summary">
      <span class="pill ${result.disposition === 'guarded' || result.disposition === 'blocked' ? 'bad' : result.disposition === 'ask' ? 'warn' : 'good'}">${esc(result.disposition.replaceAll('_', ' '))}</span>
      <strong>${esc(result.action)}</strong>
    </div>
    <p class="intent-reason">${esc(result.reason)}</p>
    <div class="pipeline">
      ${result.steps.map((step, i) => `<div class="pipeline-step ${result.guard && i >= 2 ? 'muted' : ''}">
        <div class="pipeline-dot">${i + 1}</div><div><strong>${esc(step.label)}</strong><span>${esc(step.detail)}</span></div>
      </div>`).join('')}
    </div>
    <div class="sim-response"><span class="eyebrow">Trainer outcome preview</span><p>${esc(result.response)}</p></div>
    <div class="intent-facts">
      <div><span>Guard</span><strong>${esc(result.guard?.name ?? 'None')}</strong></div>
      <div><span>Would write</span><strong>${esc(result.writes.length ? result.writes.join(', ') : 'Nothing')}</strong></div>
      <div><span>Entities</span><strong>${entityRows.length ? esc(entityRows.map(([k, v]) => `${k}: ${v}`).join(' · ')) : 'None'}</strong></div>
    </div>
    <details class="raw-result"><summary>Inspect simulation JSON</summary><pre>${esc(JSON.stringify(result, null, 2))}</pre></details>
  </div>`;
}

function renderIntentSuite(results) {
  if (!results) return `<div class="suite-placeholder">Run the boundary suite to test ${SIMULATION_CASES.length} high-risk phrases.</div>`;
  const passed = results.filter((r) => r.pass).length;
  return `<div class="suite-summary ${passed === results.length ? 'all-pass' : ''}">
      <strong>${passed}/${results.length} passed</strong><span>${passed === results.length ? 'All simulated boundaries held.' : `${results.length - passed} need attention.`}</span>
    </div>
    <div class="table-scroll"><table class="suite-table"><tr><th>Message</th><th>Expected</th><th>Result</th><th>Why it matters</th></tr>
    ${results.map((r) => `<tr><td>“${esc(r.message)}”</td><td><span class="pill">${esc(r.expected)}</span></td>
      <td><span class="pill ${r.pass ? 'good' : 'bad'}">${r.pass ? 'Pass' : esc(r.actual)}</span></td><td>${esc(r.note)}</td></tr>`).join('')}
    </table></div>`;
}

function bindIntentLab() {
  const form = document.getElementById('intentForm');
  if (!form) return;
  form.onsubmit = (event) => {
    event.preventDefault();
    const message = document.getElementById('intentMessage').value.trim();
    intentLabResult = simulateIntent(message, intentContextFromForm());
    document.getElementById('intentResult').innerHTML = renderIntentResult(intentLabResult);
  };
  form.onkeydown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') form.requestSubmit();
  };
  document.querySelectorAll('[data-example]').forEach((button) => {
    button.onclick = () => {
      const input = document.getElementById('intentMessage');
      input.value = button.dataset.example;
      input.focus();
    };
  });
  document.getElementById('runSuite').onclick = () => {
    intentSuiteResults = runSimulationSuite();
    document.getElementById('suiteResults').innerHTML = renderIntentSuite(intentSuiteResults);
  };
  document.getElementById('resetIntent').onclick = () => {
    intentLabResult = null;
    document.getElementById('intentMessage').value = '';
    document.getElementById('intentResult').innerHTML = renderIntentResult(null);
  };
}

function renderIntentProduction(decisions) {
  const visible = decisions.filter((d) => userVisible(store.byId.get(d.user_id) ?? {}));
  if (!visible.length) return '<div class="empty">No classifier decisions are available for the current account filter.</div>';
  const counts = new Map();
  let unresolved = 0;
  let confidenceTotal = 0;
  for (const row of visible) {
    counts.set(row.intent, (counts.get(row.intent) ?? 0) + 1);
    if (row.ambiguity?.unresolved) unresolved++;
    confidenceTotal += Number(row.confidence) || 0;
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return `<div class="intent-live-stats">
      <div><span>Decisions sampled</span><strong>${visible.length}</strong></div>
      <div><span>Average confidence</span><strong>${Math.round((confidenceTotal / visible.length) * 100)}%</strong></div>
      <div><span>Asked to clarify</span><strong>${Math.round((unresolved / visible.length) * 100)}%</strong></div>
    </div>
    <div class="intent-distribution">${top.map(([intent, count]) => `<div><span>${esc(intent)}</span><div class="dist-track"><i style="width:${Math.max(4, (count / top[0][1]) * 100)}%"></i></div><strong>${count}</strong></div>`).join('')}</div>
    <div class="table-scroll"><table><tr><th>Recent message</th><th>Intent</th><th>Confidence</th><th>Route</th><th>When</th></tr>
      ${visible.slice(0, 8).map((d) => `<tr><td class="intent-message-cell">${esc(d.message_text || 'Message text not retained')}</td>
        <td><span class="pill">${esc(d.intent)}</span></td><td>${Math.round(Number(d.confidence) * 100)}%</td>
        <td>${esc(d.guard_short_circuited ? d.guard_name : d.router_disposition)}</td><td>${ago(d.created_at)}</td></tr>`).join('')}
    </table></div>`;
}

async function viewIntents() {
  shell('intent-simulator', `<div class="intent-page-head">
      <div><div class="page-title">Intent control centre <span class="lab-badge">LAB</span></div>
      <div class="page-sub">Test how a message is understood, which guard wins, and what the router would do — without touching production data.</div></div>
      <div class="no-write-badge"><span></span> Simulation only · no writes</div>
    </div>
    <div class="intent-layout">
      <aside class="intent-catalog card">
        <h3>Intent catalogue <span class="sub">${INTENT_CATALOG.length} routes</span></h3>
        <div class="intent-catalog-list">${INTENT_CATALOG.map((intent) => `<button type="button" class="intent-catalog-item" data-example="${esc(intent.example)}">
          <span class="intent-mark"></span><span><strong>${esc(intent.label)}</strong><small>${esc(intent.id)} · ${esc(intent.group)}</small></span><span class="intent-arrow">›</span>
        </button>`).join('')}</div>
      </aside>
      <section>
        <form class="card intent-composer" id="intentForm">
          <div class="intent-card-title"><div><span class="eyebrow">Dry run</span><h2>Simulate a user message</h2></div><button type="button" class="text-button" id="resetIntent">Reset</button></div>
          <label class="field-label" for="intentMessage">User message</label>
          <textarea id="intentMessage" rows="3" placeholder="Try “next workout now” or paste a real failure…" required>${esc(intentLabResult?.message ?? '')}</textarea>
          <div class="example-chips">${SIMULATION_CASES.slice(0, 4).map((test) => `<button type="button" data-example="${esc(test.message)}">${esc(test.message)}</button>`).join('')}</div>
          <details class="context-panel"><summary>Simulation context <span>change what the router knows</span></summary>
            <div class="context-grid">
              <label><input type="checkbox" id="ctxPlan" checked> Has active plan</label>
              <label><input type="checkbox" id="ctxPro" checked> Pro account</label>
              <label><input type="checkbox" id="ctxFreeUsed"> Free plan already used</label>
              <label><input type="checkbox" id="ctxPending"> Action waiting for approval</label>
              <label><input type="checkbox" id="ctxImage"> Image attached</label>
              <label class="context-text">Screen context <input id="ctxScreen" placeholder="e.g. Day 2 · Upper Body"></label>
            </div>
          </details>
          <button class="btn intent-run" type="submit">Run simulation <span>⌘↵</span></button>
        </form>
        <div class="card" id="intentResult">${renderIntentResult(intentLabResult)}</div>
      </section>
    </div>
    <div class="card suite-card"><div class="intent-card-title"><div><span class="eyebrow">Regression checks</span><h2>High-risk boundary suite</h2></div>
      <button class="btn secondary" id="runSuite">Run ${SIMULATION_CASES.length} tests</button></div>
      <div id="suiteResults">${renderIntentSuite(intentSuiteResults)}</div>
    </div>
    <div class="card"><h3>Recent production decisions <span class="sub">observability only · never replayed</span></h3>
      <div id="intentProduction"><div class="loading">Loading recent classifier decisions…</div></div></div>`);
  bindIntentLab();
  try {
    const decisions = await fetchRecentIntentDecisions(300);
    const target = document.getElementById('intentProduction');
    if (target) target.innerHTML = renderIntentProduction(decisions);
  } catch (error) {
    const target = document.getElementById('intentProduction');
    if (target) target.innerHTML = `<div class="error">${esc(error.message)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Overview

function viewOverview() {
  const users = visibleProfiles();
  const userSet = new Set(users.map((u) => u.id));
  const inSet = (uid) => userSet.has(uid);

  const newUsers7 = countSince(users, (u) => u.created_at, 7);
  const completions = store.completions.filter((c) => inSet(c.user_id));
  const workouts7 = countSince(completions, (c) => c.at, 7);
  const plans7 = countSince(store.planIndex.filter((p) => inSet(p.user_id)), (p) => p.created_at, 7);

  let msgs7 = 0;
  const cutoff = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  for (const [d, n] of store.msgByDay) if (d >= cutoff) msgs7 += n;

  const wawc = wawc2Series(8, userVisible);
  const thisWeek = wawc[wawc.length - 1].value;
  const lastWeek = wawc[wawc.length - 2]?.value ?? 0;
  const delta = thisWeek - lastWeek;

  // messages per day, last 14 days (user-authored)
  const msgDays = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
    msgDays.push({ week: d, value: store.msgByDay.get(d) ?? 0 });
  }

  // App Store metrics (lags ~2 days behind — Apple publishes late)
  const asRows = store.appstore;
  const asCut = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const dl7 = asRows.filter((r) => r.date >= asCut).reduce((a, r) => a + (r.downloads ?? 0), 0);
  const pv7 = asRows.filter((r) => r.date >= asCut).reduce((a, r) => a + (r.page_views ?? 0), 0);
  const asLatest = asRows.length ? asRows[asRows.length - 1].date : null;
  const as14 = asRows.slice(-14);
  // Distinguish "no data from Apple yet" (all null) from a real zero.
  const hasPv = asRows.some((r) => r.page_views != null);
  const hasDl = asRows.some((r) => r.downloads != null);
  const appstoreTiles = `
      <div class="tile"><div class="label">App Store visits · 7d</div><div class="value">${hasPv ? pv7 : '—'}</div>
        <div class="delta">${hasPv ? `to ${asLatest.slice(5)}` : 'no data yet (Apple ~48h)'}</div></div>
      <div class="tile"><div class="label">Downloads · 7d</div><div class="value">${hasDl ? dl7 : '—'}</div>
        <div class="delta">${hasDl && pv7 > 0 ? `${((dl7 / pv7) * 100).toFixed(0)}% of visits` : hasDl ? `to ${asLatest.slice(5)}` : 'awaiting first ingest'}</div></div>`;
  const appstoreCharts = asRows.length
    ? `<div class="grid-2">
      ${hasPv
        ? `<div class="card"><h3>App Store page visits<span class="sub">daily, lags ~2 days</span></h3>
        ${barChart({ data: as14.map((r) => ({ week: r.date, value: r.page_views ?? 0 })), labelFn: (d, i) => (i % 2 === 0 ? d.week.slice(5) : ''), valueLabel: 'visits' })}</div>`
        : `<div class="card"><h3>App Store page visits<span class="sub">daily</span></h3>
        <div class="empty">Apple is still preparing the analytics report — data appears ~48h after first setup.</div></div>`}
      <div class="card"><h3>Downloads<span class="sub">daily, lags ~2 days</span></h3>
        ${barChart({ data: as14.map((r) => ({ week: r.date, value: r.downloads ?? 0 })), labelFn: (d, i) => (i % 2 === 0 ? d.week.slice(5) : ''), valueLabel: 'downloads' })}</div>
    </div>`
    : '';

  // recent activity feed
  const recent = users
    .map((u) => ({ u, lastAt: store.msgStats.get(u.id)?.lastAt }))
    .filter((r) => r.lastAt)
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, 8);

  shell(
    'home',
    `<div class="page-title">Home</div>
    <div class="page-sub">North Star: WAWC₂ — distinct users completing ≥2 workouts in a calendar week. ${
      store.loadedAt ? `Data loaded ${fmtTime(store.loadedAt.toISOString())}.` : ''
    }</div>
    <div class="tiles">
      <div class="tile"><div class="label">WAWC₂ this week</div><div class="value">${thisWeek}</div>
        <div class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta >= 0 ? '+' : ''}${delta} vs last week</div></div>
      <div class="tile"><div class="label">Total users</div><div class="value">${users.length}</div>
        <div class="delta">${newUsers7} new in 7d</div></div>
      <div class="tile"><div class="label">Workouts completed · 7d</div><div class="value">${workouts7}</div></div>
      <div class="tile"><div class="label">User messages · 7d</div><div class="value">${msgs7}</div></div>
      <div class="tile"><div class="label">Plans generated · 7d</div><div class="value">${plans7}</div></div>
      ${appstoreTiles}
    </div>
    ${appstoreCharts}
    <div class="grid-2">
      <div class="card"><h3>WAWC₂<span class="sub">last 8 weeks, week starting</span></h3>
        ${barChart({ data: wawc, labelFn: (d) => d.week.slice(5), valueLabel: 'users' })}</div>
      <div class="card"><h3>User messages per day<span class="sub">last 14 days</span></h3>
        ${barChart({ data: msgDays, labelFn: (d, i) => (i % 2 === 0 ? d.week.slice(5) : ''), valueLabel: 'messages' })}</div>
    </div>
    <div class="card"><h3>Recently active conversations</h3>
      <div class="table-scroll"><table>
        <tr><th>User</th><th>Last message</th><th class="num">Messages</th><th class="num">Workouts</th><th></th></tr>
        ${recent
          .map(
            (r) => `<tr class="rowlink" data-uid="${r.u.id}">
          <td><strong>${esc(displayName(r.u))}</strong><br><span style="color:var(--text-muted)">${esc(r.u.email ?? '')}</span></td>
          <td>${ago(r.lastAt)}</td>
          <td class="num">${store.msgStats.get(r.u.id)?.count ?? 0}</td>
          <td class="num">${completions.filter((c) => c.user_id === r.u.id).length}</td>
          <td>→</td></tr>`
          )
          .join('')}
      </table></div>
    </div>`
  );
  bindRowLinks();
}

function bindRowLinks() {
  document.querySelectorAll('tr.rowlink[data-uid]').forEach((tr) => {
    tr.onclick = () => (location.hash = `#/user/${tr.dataset.uid}`);
  });
}

// ---------------------------------------------------------------------------
// Users

function viewUsers() {
  const q = (document.getElementById('userSearch')?.value ?? '').toLowerCase();
  const users = visibleProfiles()
    .map((u) => {
      const ms = store.msgStats.get(u.id);
      const wk = store.completions.filter((c) => c.user_id === u.id).length;
      const plans = store.planIndex.filter((p) => p.user_id === u.id).length;
      const streak = store.streaks.get(u.id);
      const lastAt = [ms?.lastAt, streak?.last_active_date].filter(Boolean).sort().pop() ?? null;
      return { u, msgs: ms?.count ?? 0, workouts: wk, plans, streak: streak?.current_streak ?? 0, lastAt };
    })
    .filter((r) => !q || `${r.u.name ?? ''} ${r.u.email ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => ((a.lastAt ?? '') < (b.lastAt ?? '') ? 1 : -1));

  shell(
    'users',
    `<div class="page-title">Users</div>
    <div class="page-sub">${users.length} shown${hideTest ? ' (internal & test accounts hidden)' : ''}</div>
    <div class="toolbar"><input type="search" id="userSearch" placeholder="Search name or email…" value="${esc(q)}"/></div>
    <div class="card"><div class="table-scroll"><table>
      <tr><th>User</th><th>Joined</th><th>Goal</th><th>Level</th><th></th>
        <th class="num">Streak</th><th class="num">Msgs</th><th class="num">Workouts</th><th class="num">Plans</th><th>Last active</th></tr>
      ${users
        .map(
          (r) => `<tr class="rowlink" data-uid="${r.u.id}">
        <td><strong>${esc(displayName(r.u))}</strong><br><span style="color:var(--text-muted)">${esc(r.u.email ?? '')}</span></td>
        <td>${fmtDate(r.u.created_at)}</td>
        <td>${r.u.goal ? `<span class="pill">${esc(r.u.goal)}</span>` : '—'}</td>
        <td>${esc(r.u.fitness_level ?? '—')}</td>
        <td>${r.u.is_pro ? '<span class="pill pro">PRO</span>' : ''}${r.u.onboarding_complete ? '' : ' <span class="pill warn">onboarding</span>'}</td>
        <td class="num">${r.streak}</td><td class="num">${r.msgs}</td><td class="num">${r.workouts}</td><td class="num">${r.plans}</td>
        <td>${ago(r.lastAt)}</td></tr>`
        )
        .join('')}
    </table></div></div>`
  );
  bindRowLinks();
  const inp = document.getElementById('userSearch');
  inp.oninput = () => {
    const pos = inp.selectionStart;
    viewUsers();
    const again = document.getElementById('userSearch');
    again.focus();
    again.setSelectionRange(pos, pos);
  };
}

// ---------------------------------------------------------------------------
// Conversations

const dateInput = (date) => date.toISOString().slice(0, 10);
const todayDate = () => dateInput(new Date());
const daysAgoDate = (days) => dateInput(new Date(Date.now() - days * 86400 * 1000));
const visibilityRange = { start: daysAgoDate(6), end: todayDate() };

function visibilityBounds({ includePrevious = false } = {}) {
  const startLocal = new Date(`${visibilityRange.start}T00:00:00`);
  const endLocal = new Date(`${visibilityRange.end}T00:00:00`);
  const endExclusive = new Date(endLocal);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const duration = endExclusive.getTime() - startLocal.getTime();
  const previousStart = new Date(startLocal.getTime() - duration);
  return {
    start: startLocal.toISOString(),
    end: endExclusive.toISOString(),
    queryStart: (includePrevious ? previousStart : startLocal).toISOString(),
    previousStart: previousStart.toISOString(),
  };
}

const clip = (value, length = 150) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

function accountAllowed(userId) {
  return userVisible(store.byId.get(userId) ?? {});
}

function turnHref(turn) {
  return turn.id ? `#/user/${turn.user_id}/message/${turn.id}` : `#/user/${turn.user_id}`;
}

function bindVisibilityRows() {
  document.querySelectorAll('[data-turn-href]').forEach((row) => {
    row.onclick = () => (location.hash = row.dataset.turnHref);
  });
}

function rangeFields() {
  return `<label>From <input type="date" id="rangeStart" value="${visibilityRange.start}" max="${visibilityRange.end}"></label>
    <label>To <input type="date" id="rangeEnd" value="${visibilityRange.end}" min="${visibilityRange.start}" max="${todayDate()}"></label>`;
}

function bindRangeForm(onApply) {
  const form = document.getElementById('rangeForm');
  if (!form) return;
  form.onsubmit = (event) => {
    event.preventDefault();
    const start = document.getElementById('rangeStart').value;
    const end = document.getElementById('rangeEnd').value;
    if (!start || !end || start > end) return;
    const spanDays = (Date.parse(`${end}T00:00:00`) - Date.parse(`${start}T00:00:00`)) / 86400e3;
    visibilityRange.start = spanDays > 30 ? daysAgoDate(30) : start;
    visibilityRange.end = end;
    onApply();
  };
}

async function viewConversations() {
  shell('conversations', `<div class="page-title">Conversations</div><div class="page-sub">Recent user turns across every visible account.</div><div class="loading">Loading bounded conversation feed…</div>`);
  const bounds = visibilityBounds();
  try {
    const [messages, decisions] = await Promise.all([
      fetchVisibilityMessages(bounds.start, bounds.end),
      fetchVisibilityDecisions(bounds.start, bounds.end),
    ]);
    const turns = attachClassifierDecisions(
      pairConversationTurns(messages.filter((row) => accountAllowed(row.user_id))),
      decisions.filter((row) => accountAllowed(row.user_id)),
    ).filter((turn) => turn.id);
    const users = [...new Set(turns.map((turn) => turn.user_id))].map((id) => store.byId.get(id)).filter(Boolean);
    const intents = [...new Set(turns.map((turn) => turn.intent))].sort();
    const stages = [...new Set(turns.map((turn) => turn.stage))].sort();

    shell('conversations', `<div class="page-title">Conversations</div>
      <div class="page-sub">What are users saying, and what did the trainer do next? ${turns.length} turns in this bounded result.</div>
      <form class="visibility-filters" id="rangeForm">${rangeFields()}<button class="btn secondary" type="submit">Apply dates</button>
        <label>User <select id="filterUser"><option value="">All users</option>${users.map((user) => `<option value="${user.id}">${esc(user.email || displayName(user))}</option>`).join('')}</select></label>
        <label>Intent <select id="filterIntent"><option value="">All intents</option>${intents.map((value) => `<option>${esc(value)}</option>`).join('')}</select></label>
        <label>Stage <select id="filterStage"><option value="">All stages</option>${stages.map((value) => `<option>${esc(value)}</option>`).join('')}</select></label>
        <label class="search-field">Search <input type="search" id="filterSearch" placeholder="Message or reply text"></label>
      </form>
      <div class="card visibility-table-card"><div id="conversationRows"></div></div>`);

    const renderRows = () => {
      const user = document.getElementById('filterUser').value;
      const intent = document.getElementById('filterIntent').value;
      const stage = document.getElementById('filterStage').value;
      const query = document.getElementById('filterSearch').value.trim().toLowerCase();
      const filtered = turns.filter((turn) => (!user || turn.user_id === user) && (!intent || turn.intent === intent) &&
        (!stage || turn.stage === stage) && (!query || `${turn.user.content} ${turn.assistant?.content ?? ''}`.toLowerCase().includes(query)));
      document.getElementById('conversationRows').innerHTML = filtered.length ? `<div class="table-scroll"><table class="visibility-table">
        <tr><th>When</th><th>User</th><th>User message</th><th>Trainer reply</th><th>Intent</th><th>Stage</th></tr>
        ${filtered.slice(0, 500).map((turn) => {
          const profile = store.byId.get(turn.user_id);
          return `<tr class="rowlink" data-turn-href="${turnHref(turn)}"><td class="nowrap">${fmtDateTime(turn.user_at)}</td>
            <td>${esc(profile?.email || turn.user_id.slice(0, 8))}</td><td class="turn-copy">${esc(clip(turn.user.content, 180) || 'Image / empty text')}</td>
            <td class="turn-copy ${turn.assistant ? '' : 'missing-reply'}">${turn.assistant ? esc(clip(turn.assistant.content, 180)) : 'No reply'}</td>
            <td><span class="pill">${esc(turn.intent)}</span></td><td><span class="pill stage">${esc(turn.stage)}</span></td></tr>`;
        }).join('')}</table></div>` : '<div class="empty">No turns match these filters.</div>';
      bindVisibilityRows();
    };
    bindRangeForm(viewConversations);
    ['filterUser', 'filterIntent', 'filterStage'].forEach((id) => (document.getElementById(id).onchange = renderRows));
    document.getElementById('filterSearch').oninput = renderRows;
    renderRows();
  } catch (error) {
    shell('conversations', `<div class="page-title">Conversations</div><div class="error">${esc(error.message)}</div>`);
  }
}

// ---------------------------------------------------------------------------
// Analyze · Intents, Failures, Cost

const userLabel = (userId) => {
  const profile = store.byId.get(userId);
  return profile?.email || displayName(profile) || String(userId).slice(0, 8);
};

const inCurrentPeriod = (row, key, bounds) => {
  const at = new Date(row[key]).getTime();
  return at >= new Date(bounds.start).getTime() && at < new Date(bounds.end).getTime();
};

function boundedNotice(count, limit) {
  return count >= limit ? `<div class="query-note warn-note">This result reached its ${limit.toLocaleString()}-row safety limit. Shorten the date range for a complete answer.</div>` : '';
}

function distributionRows(rows, label = 'turns') {
  if (!rows.length) return '<div class="empty">No labelled turns in this period.</div>';
  const max = Math.max(...rows.map((row) => row.count));
  return `<div class="analysis-distribution">${rows.map((row) => `<div><span>${esc(row.label)}</span>
    <div class="dist-track"><i style="width:${Math.max(2, (row.count / max) * 100)}%"></i></div>
    <strong>${row.count}</strong><small>${esc(label)}</small></div>`).join('')}</div>`;
}

async function viewAnalyzeIntents() {
  shell('analyze-intents', `<div class="page-title">Analyze · Intents</div><div class="page-sub">What is the classifier doing, and where is it unsure?</div><div class="loading">Loading bounded intent evidence…</div>`);
  const bounds = visibilityBounds();
  try {
    const [messages, decisions] = await Promise.all([
      fetchVisibilityMessages(bounds.start, bounds.end),
      fetchVisibilityDecisions(bounds.start, bounds.end),
    ]);
    const observations = attachClassifierDecisions(
      pairConversationTurns(messages.filter((row) => accountAllowed(row.user_id))),
      decisions.filter((row) => accountAllowed(row.user_id)),
    );
    const counts = new Map();
    observations.forEach((turn) => counts.set(turn.intent, (counts.get(turn.intent) ?? 0) + 1));
    const distribution = [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const low = observations.filter((turn) => Number.isFinite(turn.confidence) && turn.confidence < 0.7)
      .sort((a, b) => a.confidence - b.confidence);
    const bands = [
      { label: 'Under 0.7', count: low.length },
      { label: '0.7–0.89', count: observations.filter((turn) => turn.confidence >= 0.7 && turn.confidence < 0.9).length },
      { label: '0.9+', count: observations.filter((turn) => turn.confidence >= 0.9).length },
      { label: 'Not recorded', count: observations.filter((turn) => !Number.isFinite(turn.confidence)).length },
    ];
    shell('analyze-intents', `<div class="page-title">Analyze · Intents</div>
      <div class="page-sub">What is the classifier doing, and where is it unsure? ${observations.length} observations in the selected period.</div>
      <form class="visibility-filters" id="rangeForm">${rangeFields()}<button class="btn secondary" type="submit">Apply dates</button></form>
      ${boundedNotice(messages.length, 5000)}${boundedNotice(decisions.length, 3000)}
      <div class="grid-2">
        <section class="card"><h3>Intent distribution <span class="sub">Which routes are being selected?</span></h3>${distributionRows(distribution)}</section>
        <section class="card"><h3>Confidence distribution <span class="sub">How often is the classifier unsure?</span></h3>${distributionRows(bands)}</section>
      </div>
      <section class="card"><h3>Lowest-confidence turns <span class="sub">Under 0.7 · click to inspect context</span></h3>
        ${low.length ? `<div class="table-scroll"><table><tr><th>Confidence</th><th>When</th><th>User</th><th>Message</th><th>Intent</th><th>Route</th></tr>
          ${low.slice(0, 100).map((turn) => `<tr class="rowlink" data-turn-href="${esc(turnHref(turn))}"><td><span class="confidence-low">${Math.round(turn.confidence * 100)}%</span></td>
            <td class="nowrap">${fmtDateTime(turn.user_at)}</td><td>${esc(userLabel(turn.user_id))}</td><td class="turn-copy">${esc(clip(turn.user.content, 220))}</td>
            <td><span class="pill">${esc(turn.intent)}</span></td><td>${esc(turn.guard_name || turn.router_disposition || '—')}</td></tr>`).join('')}</table></div>`
          : '<div class="empty">No turns landed below 0.7.</div>'}
      </section>`);
    bindRangeForm(viewAnalyzeIntents);
    bindVisibilityRows();
  } catch (error) {
    shell('analyze-intents', `<div class="page-title">Analyze · Intents</div><div class="error">${esc(error.message)}</div>`);
  }
}

function trendLabel(stats) {
  if (!stats.prior && !stats.current) return 'No change vs previous period';
  if (!stats.prior) return `New vs 0 previously`;
  const percent = Math.round(((stats.current - stats.prior) / stats.prior) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}% vs previous period (${stats.prior})`;
}

function failurePanel({ id, title, question, stats, rows, severity = '', note = '' }) {
  return `<section class="card failure-panel ${severity}" id="${id}">
    <div class="failure-head"><div><h3>${esc(title)}</h3><p>${esc(question)}</p></div><div class="failure-count"><strong>${stats.current}</strong><span>${esc(trendLabel(stats))}</span></div></div>
    ${rows || '<div class="empty">No offending rows in this period.</div>'}${note ? `<div class="query-note">${esc(note)}</div>` : ''}
  </section>`;
}

function failureTable(headings, rows) {
  if (!rows.length) return '';
  return `<div class="table-scroll"><table><tr>${headings.map((heading) => `<th>${esc(heading)}</th>`).join('')}</tr>${rows.join('')}</table></div>`;
}

async function viewFailures() {
  shell('analyze-failures', `<div class="page-title">Analyze · Failures</div><div class="page-sub">Which shipped failure modes need attention?</div><div class="loading">Running read-only detectors…</div>`);
  const bounds = visibilityBounds({ includePrevious: true });
  try {
    const [messages, decisions, adjustments, plans] = await Promise.all([
      fetchVisibilityMessages(bounds.queryStart, bounds.end),
      fetchVisibilityDecisions(bounds.queryStart, bounds.end),
      fetchVisibilityAdjustments(bounds.queryStart, bounds.end),
      fetchVisibilityPlans(bounds.queryStart, bounds.end),
    ]);
    const visibleMessages = messages.filter((row) => accountAllowed(row.user_id));
    const visibleDecisions = decisions.filter((row) => accountAllowed(row.user_id));
    const observations = attachClassifierDecisions(pairConversationTurns(visibleMessages), visibleDecisions);
    const messageTurns = observations.filter((turn) => turn.id);
    const deadEnds = findDeadEnds(messageTurns);
    const repeats = findRepeatSends(visibleMessages);
    const ambiguity = findUnresolvedAmbiguity(observations);
    const declines = findDeclines(messageTurns);
    const claims = findActionClaims(
      messageTurns,
      adjustments.filter((row) => accountAllowed(row.user_id)),
      plans.filter((row) => accountAllowed(row.user_id)),
    );
    const current = {
      deadEnds: deadEnds.filter((row) => inCurrentPeriod(row, 'user_at', bounds)),
      repeats: repeats.filter((row) => inCurrentPeriod(row, 'last_at', bounds)),
      ambiguity: ambiguity.filter((row) => inCurrentPeriod(row, 'user_at', bounds)),
      declines: declines.filter((row) => inCurrentPeriod(row, 'assistant_at', bounds)),
      claims: claims.filter((row) => inCurrentPeriod(row, 'assistant_at', bounds)),
    };
    const stats = {
      deadEnds: periodCounts(deadEnds, 'user_at', bounds.start, bounds.end, bounds.previousStart),
      repeats: periodCounts(repeats, 'last_at', bounds.start, bounds.end, bounds.previousStart),
      ambiguity: periodCounts(ambiguity, 'user_at', bounds.start, bounds.end, bounds.previousStart),
      declines: periodCounts(declines, 'assistant_at', bounds.start, bounds.end, bounds.previousStart),
      claims: periodCounts(claims, 'assistant_at', bounds.start, bounds.end, bounds.previousStart),
    };
    const criticalClaims = current.claims.filter((row) => !row.mutation_found);
    const declineGroups = [...current.declines.reduce((map, row) => map.set(row.decline_reason, (map.get(row.decline_reason) ?? 0) + 1), new Map())]
      .sort((a, b) => b[1] - a[1]);
    shell('analyze-failures', `<div class="page-title">Analyze · Failures</div>
      <div class="page-sub">Which shipped failure modes need attention? Every row links to the underlying conversation.</div>
      <form class="visibility-filters" id="rangeForm">${rangeFields()}<button class="btn secondary" type="submit">Apply dates</button></form>
      ${boundedNotice(messages.length, 5000)}${boundedNotice(decisions.length, 3000)}
      ${failurePanel({ id: 'claimed', title: 'Action claimed vs applied', question: 'Did the trainer say a plan changed when no matching change exists?', stats: stats.claims,
        severity: criticalClaims.length ? 'critical-panel' : '',
        rows: failureTable(['Status', 'When', 'User', 'Claim', 'Evidence'], current.claims.slice(0, 50).map((turn) => `<tr class="rowlink ${turn.mutation_found ? '' : 'critical-row'}" data-turn-href="${esc(turnHref(turn))}"><td><span class="pill ${turn.mutation_found ? 'good' : 'bad'}">${turn.mutation_found ? 'Verified' : 'No mutation found'}</span></td><td class="nowrap">${fmtDateTime(turn.assistant_at)}</td><td>${esc(userLabel(turn.user_id))}</td><td class="turn-copy">${esc(clip(turn.assistant.content, 220))}</td><td>${esc(turn.mutation_kind || 'No plan_adjustments or new plans row')}</td></tr>`)),
        note: 'Evidence matches an explicit adjustment id or a plan adjustment / new plan row from 10 seconds before to 60 seconds after the reply. Plans has no updated_at field, so in-place JSON changes cannot be proven here.' })}
      ${failurePanel({ id: 'dead-ends', title: 'Dead ends', question: 'Which user messages received no trainer reply within 60 seconds?', stats: stats.deadEnds,
        rows: failureTable(['When', 'User', 'Message', 'Observed reply'], current.deadEnds.slice(0, 50).map((turn) => `<tr class="rowlink" data-turn-href="${esc(turnHref(turn))}"><td class="nowrap">${fmtDateTime(turn.user_at)}</td><td>${esc(userLabel(turn.user_id))}</td><td class="turn-copy">${esc(clip(turn.user.content, 240))}</td><td class="missing-reply">${turn.response_seconds == null ? 'No reply' : `${Math.round(turn.response_seconds)}s later`}</td></tr>`)) })}
      ${failurePanel({ id: 'repeat-sends', title: 'Repeat sends', question: 'Where did a user resend byte-identical text within five minutes?', stats: stats.repeats,
        rows: failureTable(['Last send', 'User', 'Repeated message', 'Sends'], current.repeats.slice(0, 50).map((row) => `<tr class="rowlink" data-turn-href="#/user/${esc(row.user_id)}/message/${esc(row.id)}"><td class="nowrap">${fmtDateTime(row.last_at)}</td><td>${esc(userLabel(row.user_id))}</td><td class="turn-copy">${esc(clip(row.content, 240))}</td><td>${row.count}</td></tr>`)) })}
      ${failurePanel({ id: 'ambiguity', title: 'Unresolved ambiguity', question: 'When ambiguity remained unresolved, did the trainer ask a question next?', stats: stats.ambiguity,
        rows: failureTable(['Question?', 'When', 'User', 'Message', 'Reply'], current.ambiguity.slice(0, 50).map((turn) => `<tr class="rowlink ${turn.followed_by_question ? '' : 'warning-row'}" data-turn-href="${esc(turnHref(turn))}"><td><span class="pill ${turn.followed_by_question ? 'good' : 'bad'}">${turn.followed_by_question ? 'Asked' : 'Not asked'}</span></td><td class="nowrap">${fmtDateTime(turn.user_at)}</td><td>${esc(userLabel(turn.user_id))}</td><td class="turn-copy">${esc(clip(turn.user.content, 180))}</td><td class="turn-copy">${esc(clip(turn.assistant?.content || 'No reply', 180))}</td></tr>`)) })}
      ${failurePanel({ id: 'declines', title: 'Declines', question: 'Why did the trainer honestly decline or fall back?', stats: stats.declines,
        rows: `${declineGroups.length ? `<div class="reason-chips">${declineGroups.map(([reason, count]) => `<span class="pill">${esc(reason)} · ${count}</span>`).join('')}</div>` : ''}${failureTable(['When', 'Reason', 'User', 'Reply'], current.declines.slice(0, 50).map((turn) => `<tr class="rowlink" data-turn-href="${esc(turnHref(turn))}"><td class="nowrap">${fmtDateTime(turn.assistant_at)}</td><td>${esc(turn.decline_reason)}</td><td>${esc(userLabel(turn.user_id))}</td><td class="turn-copy">${esc(clip(turn.assistant.content, 240))}</td></tr>`))}` })}`);
    bindRangeForm(viewFailures);
    bindVisibilityRows();
  } catch (error) {
    shell('analyze-failures', `<div class="page-title">Analyze · Failures</div><div class="error">${esc(error.message)}</div>`);
  }
}

const money = (value) => value == null ? '—' : `$${Number(value).toFixed(Number(value) < 0.01 ? 4 : 2)}`;

function costBars(daily) {
  if (!daily.length) return '<div class="empty">No instrumented LLM usage in this period.</div>';
  const max = Math.max(...daily.map((row) => row.cost), 0.000001);
  return `<div class="cost-bars">${daily.map((row) => `<div title="${esc(`${row.key}: ${money(row.cost)} · ${row.tokens.toLocaleString()} tokens`)}"><i style="height:${Math.max(2, (row.cost / max) * 100)}%"></i><span>${esc(row.key.slice(5))}</span></div>`).join('')}</div>`;
}

async function viewCost() {
  shell('analyze-cost', `<div class="page-title">Analyze · Cost</div><div class="page-sub">What does trainerX spend, and is it moving?</div><div class="loading">Loading bounded usage evidence…</div>`);
  const bounds = visibilityBounds();
  try {
    const [messages, telemetry, plans] = await Promise.all([
      fetchVisibilityMessages(bounds.start, bounds.end),
      fetchVisibilityTelemetry(bounds.start, bounds.end),
      fetchVisibilityPlans(bounds.start, bounds.end),
    ]);
    const summary = summarizeCosts(
      messages.filter((row) => accountAllowed(row.user_id)),
      telemetry.filter((row) => !row.user_id || accountAllowed(row.user_id)),
      plans.filter((row) => accountAllowed(row.user_id)),
    );
    shell('analyze-cost', `<div class="page-title">Analyze · Cost</div>
      <div class="page-sub">What does trainerX spend, and is it moving? Exact estimates come from assistant message usage metadata.</div>
      <form class="visibility-filters" id="rangeForm">${rangeFields()}<button class="btn secondary" type="submit">Apply dates</button></form>
      ${boundedNotice(messages.length, 5000)}${boundedNotice(telemetry.length, 5000)}
      <div class="tiles cost-tiles"><div class="tile"><div class="label">Observed LLM spend</div><div class="value">${money(summary.totalCost)}</div><div class="delta">${summary.pricedCalls} priced replies</div></div>
        <div class="tile"><div class="label">Observed token volume</div><div class="value">${summary.totalTokens.toLocaleString()}</div><div class="delta">input + output</div></div>
        <div class="tile"><div class="label">Cost per active user</div><div class="value">${money(summary.costPerActiveUser)}</div><div class="delta">${summary.activeUsers} users with messages</div></div>
        <div class="tile"><div class="label">Cost per generated plan</div><div class="value unmeasured">Unmeasured</div><div class="delta">plan generation does not write llm_usage</div></div></div>
      <section class="card"><h3>Daily observed spend <span class="sub">Is cost moving over the selected period?</span></h3>${costBars(summary.daily)}</section>
      <div class="grid-2"><section class="card"><h3>By model <span class="sub">Which model accounts for spend?</span></h3>
        ${summary.byModel.length ? `<table><tr><th>Model</th><th class="num">Replies</th><th class="num">Tokens</th><th class="num">Cost</th></tr>${summary.byModel.map((row) => `<tr><td>${esc(row.key)}</td><td class="num">${row.calls}</td><td class="num">${row.tokens.toLocaleString()}</td><td class="num">${money(row.cost)}</td></tr>`).join('')}</table>` : '<div class="empty">No model usage recorded.</div>'}</section>
        <section class="card"><h3>By function signal <span class="sub">Which instrumented path emitted usage?</span></h3>
        ${summary.byFunctionSignal.length ? `<table><tr><th>Telemetry event</th><th class="num">Calls</th><th class="num">Tokens</th><th class="num">Rounded cost</th></tr>${summary.byFunctionSignal.map((row) => `<tr><td>${esc(row.key)}</td><td class="num">${row.calls}</td><td class="num">${row.tokens.toLocaleString()}</td><td class="num">${money(row.cost)}</td></tr>`).join('')}</table>` : '<div class="empty">No function-level telemetry recorded.</div>'}</section></div>
      <div class="query-note">Coverage note: message meta.llm_usage is the precise source for chat spend. Telemetry cost is rounded to four decimals and currently represents chat/chat_stream signals, not every LLM function. Generated-plan unit cost is therefore intentionally not calculated.</div>`);
    bindRangeForm(viewCost);
  } catch (error) {
    shell('analyze-cost', `<div class="page-title">Analyze · Cost</div><div class="error">${esc(error.message)}</div>`);
  }
}

let promptSelectedId = PROMPT_CATALOG[0]?.id ?? null;
const promptFilter = { query: '', category: '', model: '' };

function promptRows() {
  const query = promptFilter.query.trim().toLowerCase();
  return PROMPT_CATALOG.filter((prompt) => (!promptFilter.category || prompt.category === promptFilter.category) &&
    (!promptFilter.model || prompt.modelRole === promptFilter.model) &&
    (!query || `${prompt.name} ${prompt.purpose} ${prompt.function} ${prompt.source} ${prompt.template}`.toLowerCase().includes(query)));
}

function renderPromptList() {
  const rows = promptRows();
  return `<div class="prompt-list-head"><span>${rows.length} shown</span><span>${PROMPT_CATALOG.length} catalogued</span></div>
    <div class="prompt-list">${rows.map((prompt) => `<button type="button" class="prompt-list-item ${prompt.id === promptSelectedId ? 'active' : ''}" data-prompt-id="${esc(prompt.id)}">
      <span><strong>${esc(prompt.name)}</strong><small>${esc(prompt.function)} · ${esc(prompt.category)}</small></span><span class="pill">${esc(prompt.modelRole)}</span>
    </button>`).join('') || '<div class="empty">No prompts match these filters.</div>'}</div>`;
}

function renderPromptDetail(prompt) {
  if (!prompt) return '<div class="empty">Choose a prompt to inspect it.</div>';
  return `<div class="prompt-detail-head"><div><span class="eyebrow">${esc(prompt.category)}</span><h2>${esc(prompt.name)}</h2><p>${esc(prompt.purpose)}</p></div><span class="pill pro">READ ONLY</span></div>
    <div class="prompt-meta-grid">
      <div><span>Calling function</span><strong>${esc(prompt.function)}</strong></div>
      <div><span>Model role</span><strong>${esc(prompt.modelRole)} → ${esc(prompt.defaultModel)}</strong></div>
      <div><span>Source file changed</span><strong>${esc(prompt.changed)}</strong></div>
      <div><span>Source file hash</span><strong class="mono">${esc(prompt.sourceHash)}</strong></div>
    </div>
    <section class="prompt-section"><h3>Source</h3><code class="source-path">${esc(prompt.source)}</code></section>
    <div class="grid-2 prompt-contract"><section class="prompt-section"><h3>Runtime inputs</h3><div class="prompt-chips">${prompt.inputs.map((input) => `<span>${esc(input)}</span>`).join('')}</div></section>
      <section class="prompt-section"><h3>Expected output</h3><p>${esc(prompt.output)}</p></section></div>
    <section class="prompt-section"><div class="prompt-template-head"><div><h3>Redacted source preview</h3><span>${esc(prompt.coverage)}</span></div><span class="pill warn">runtime data removed</span></div>
      <pre class="prompt-template">${esc(prompt.template)}</pre></section>
    ${prompt.composition ? `<section class="prompt-section composition-note"><h3>How it is assembled</h3><p>${esc(prompt.composition)}</p></section>` : ''}
    <div class="query-note">The source file is authoritative. This catalog deliberately excludes customer values, conversation text, environment secrets and live model overrides.</div>`;
}

function bindPromptCatalog() {
  const list = document.getElementById('promptList');
  const detail = document.getElementById('promptDetail');
  const repaintList = () => {
    list.innerHTML = renderPromptList();
    list.querySelectorAll('[data-prompt-id]').forEach((button) => {
      button.onclick = () => {
        promptSelectedId = button.dataset.promptId;
        repaintList();
        detail.innerHTML = renderPromptDetail(PROMPT_CATALOG.find((prompt) => prompt.id === promptSelectedId));
      };
    });
  };
  document.getElementById('promptSearch').oninput = (event) => { promptFilter.query = event.target.value; repaintList(); };
  document.getElementById('promptCategory').onchange = (event) => { promptFilter.category = event.target.value; repaintList(); };
  document.getElementById('promptModel').onchange = (event) => { promptFilter.model = event.target.value; repaintList(); };
  repaintList();
}

function viewPrompts() {
  const categories = [...new Set(PROMPT_CATALOG.map((prompt) => prompt.category))].sort();
  const models = [...new Set(PROMPT_CATALOG.map((prompt) => prompt.modelRole))].sort();
  const functions = new Set(PROMPT_CATALOG.flatMap((prompt) => prompt.function.split(' / ')));
  const selected = PROMPT_CATALOG.find((prompt) => prompt.id === promptSelectedId) ?? PROMPT_CATALOG[0];
  promptSelectedId = selected?.id ?? null;
  shell('prompts', `<div class="page-title">Build · Prompts</div>
    <div class="page-sub">What prompts exist, where are they used, and what context do they receive? Snapshot synced ${fmtDate(PROMPT_CATALOG_SYNCED_AT)}.</div>
    <div class="tiles prompt-tiles"><div class="tile"><div class="label">Prompt surfaces</div><div class="value">${PROMPT_CATALOG.length}</div></div>
      <div class="tile"><div class="label">Categories</div><div class="value">${categories.length}</div></div>
      <div class="tile"><div class="label">Calling functions</div><div class="value">${functions.size}</div></div>
      <div class="tile"><div class="label">Dynamic assemblies</div><div class="value">${PROMPT_CATALOG.filter((prompt) => prompt.coverage.includes('Dynamic')).length}</div></div></div>
    <div class="prompt-warning"><strong>Catalog, not configuration.</strong> This view is a checked-in source snapshot; it cannot edit, publish, execute or reveal a live user-resolved prompt.</div>
    <div class="prompt-filters"><label class="search-field">Search <input type="search" id="promptSearch" placeholder="Name, purpose, function or source" value="${esc(promptFilter.query)}"></label>
      <label>Category <select id="promptCategory"><option value="">All categories</option>${categories.map((value) => `<option ${value === promptFilter.category ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
      <label>Model role <select id="promptModel"><option value="">All model roles</option>${models.map((value) => `<option ${value === promptFilter.model ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label></div>
    <div class="prompt-layout"><aside class="card" id="promptList">${renderPromptList()}</aside><article class="card prompt-detail" id="promptDetail">${renderPromptDetail(selected)}</article></div>`);
  bindPromptCatalog();
}

function viewToneOfVoice() {
  const aliasRows = Object.entries(LEGACY_TONE_ALIASES);
  shell('tone-of-voice', `<div class="page-title">Build · Tone of Voice</div>
    <div class="page-sub">What should Adam sound like, how does tone adapt, and where is the doctrine actually applied? Snapshot synced ${fmtDate(TONE_SYNCED_AT)}.</div>
    <div class="tone-identity card"><div><span class="eyebrow">Trainer identity</span><h2>Adam is a coach texting a client</h2></div><span class="pill pro">READ ONLY</span>
      <blockquote>${esc(TRAINER_IDENTITY_SNAPSHOT)}</blockquote></div>
    <section class="card"><h3>Base voice rules <span class="sub">What should every user-facing message sound like?</span></h3>
      <div class="tone-rule-grid">${VOICE_RULE_GROUPS.map((group) => `<div><h4>${esc(group.title)}</h4><ul>${group.rules.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul></div>`).join('')}</div></section>
    <section class="card"><h3>Situational variants <span class="sub">How does the same voice adapt to the moment?</span></h3>
      <div class="tone-variants">${TONE_VARIANTS_SNAPSHOT.map((tone) => `<div class="tone-variant ${esc(tone.id)}"><span class="tone-dot"></span><h4>${esc(tone.label)}</h4><p>${esc(tone.description)}</p><small>${esc(tone.use)}</small></div>`).join('')}</div></section>
    <section class="card"><h3>Anti-patterns <span class="sub">What must Adam never sound like?</span></h3>
      <div class="table-scroll"><table class="tone-table"><tr><th>Pattern</th><th>What is banned</th></tr>${VOICE_ANTI_PATTERNS.map(([name, example]) => `<tr><td><strong>${esc(name)}</strong></td><td>${esc(example)}</td></tr>`).join('')}</table></div></section>
    <section class="card"><h3>Voice injection map <span class="sub">Which user-facing surfaces actually receive these rules?</span></h3>
      <div class="table-scroll"><table class="tone-table"><tr><th>Surface</th><th>Function</th><th>Tone</th><th>Injection</th><th>Channel overlay</th></tr>
        ${VOICE_SURFACES.map((surface) => `<tr><td><strong>${esc(surface.name)}</strong><small>${esc(surface.source)}</small></td><td>${esc(surface.function)}</td><td><span class="pill">${esc(surface.tone)}</span></td><td><code>${esc(surface.injection)}</code></td><td>${esc(surface.overlay)}</td></tr>`).join('')}</table></div></section>
    <div class="grid-2"><section class="card"><h3>Legacy tone normalization <span class="sub">What do older tone names become?</span></h3>
      <div class="tone-aliases">${aliasRows.map(([from, to]) => `<div><code>${esc(from)}</code><span>→</span><strong>${esc(to)}</strong></div>`).join('')}</div></section>
      <section class="card"><h3>Source integrity <span class="sub">Is this view still synchronized?</span></h3>
      <div class="tone-sources">${TONE_SOURCE_FILES.map(([source, hash, changed]) => `<div title="${esc(source)}"><span>${esc(source.split('/').pop())}</span><code>${esc(hash)}</code><small>${esc(changed)}</small></div>`).join('')}</div></section></div>
    <div class="query-note">Source remains authoritative. This page contains no tone editor, experiment switch, publishing action or resolved customer prompt. Source hashes are verified by the admin test suite.</div>`);
}

function viewSettings() {
  shell('settings', `<div class="page-title">Settings</div><div class="page-sub">Visibility-layer status. This page has no configuration controls.</div>
    <div class="grid-2"><section class="card status-list"><h3>Access</h3><div><span>Admin gate</span><strong>profiles.is_admin</strong></div><div><span>Database access</span><strong>Admin read policies</strong></div><div><span>Mode</span><strong class="good-text">Read-only</strong></div></section>
    <section class="card status-list"><h3>Query safeguards</h3><div><span>Default account scope</span><strong>Real accounts only</strong></div><div><span>Maximum date range</span><strong>31 days</strong></div><div><span>Large-table ceiling</span><strong>5,000 rows per query</strong></div></section></div>
    <div class="query-note">The account-scope toggle lives at the bottom of the sidebar. No setting here writes to Supabase or changes classifier, prompt, plan, or application configuration.</div>`);
}

// ---------------------------------------------------------------------------
// Plans list

async function viewPlans() {
  shell('plans', `<div class="page-title">Plans & Workouts</div><div class="loading">Loading recent plans…</div>`);
  const plans = (await fetchRecentPlans(60)).filter((p) => userVisible(store.byId.get(p.user_id) ?? {}));
  shell(
    'plans',
    `<div class="page-title">Plans & Workouts</div>
    <div class="page-sub">Most recent generated plans across all users.</div>
    <div class="card"><div class="table-scroll"><table>
      <tr><th>User</th><th>Created</th><th>Days</th><th>Title / focus</th><th>Status</th><th></th></tr>
      ${plans
        .map((p) => {
          const u = store.byId.get(p.user_id);
          const days = p.content?.days?.length ?? '—';
          const title = p.content?.meta?.title || p.content?.meta?.goal || p.meta?.title || '';
          return `<tr class="rowlink" data-plan="${p.id}">
          <td><strong>${esc(displayName(u))}</strong><br><span style="color:var(--text-muted)">${esc(u?.email ?? '')}</span></td>
          <td>${fmtDateTime(p.created_at)}</td><td>${days}</td><td>${esc(title)}</td>
          <td>${p.active ? '<span class="pill good">active</span>' : '<span class="pill">inactive</span>'}</td><td>→</td></tr>`;
        })
        .join('')}
    </table></div></div>`
  );
  document.querySelectorAll('tr.rowlink[data-plan]').forEach((tr) => {
    tr.onclick = () => (location.hash = `#/plan/${tr.dataset.plan}`);
  });
}

// ---------------------------------------------------------------------------
// Plan viewer

function renderPlanContent(content) {
  const days = content?.days ?? [];
  if (!days.length) return '<div class="empty">No structured days in this plan.</div>';
  return days
    .map((d) => {
      const blocks = (d.blocks ?? [])
        .map((b) => {
          const exs = (b.exercises ?? [])
            .map(
              (e) => `<tr><td>${esc(e.name)}</td><td class="num">${esc(e.sets ?? '')}</td><td class="num">${esc(e.reps ?? '')}</td>
              <td class="num">${esc(e.weight ?? '')}</td><td class="num">${esc(e.rest ?? '')}</td><td>${esc(e.tempo ?? '')}</td></tr>`
            )
            .join('');
          const blockRest = b.rest_after_block_sec ? `<div class="plan-notes">Rest after block: ${b.rest_after_block_sec}s</div>` : '';
          return `<div class="plan-block"><div class="bl">${esc(b.label ?? 'Block')}</div>
            <div class="table-scroll"><table><tr><th>Exercise</th><th class="num">Sets</th><th class="num">Reps</th><th class="num">Weight</th><th class="num">Rest</th><th>Tempo</th></tr>${exs}</table></div>${blockRest}</div>`;
        })
        .join('');
      return `<div class="plan-day">
        <div class="plan-day-head"><span class="t">Day ${esc(d.day ?? '')} — ${esc(d.title ?? d.type ?? '')}</span>
        <span class="n">${esc(d.type ?? '')}</span></div>
        ${blocks || ''}
        ${d.notes ? `<div class="plan-notes">${esc(d.notes)}</div>` : ''}
      </div>`;
    })
    .join('');
}

async function viewPlan(planId) {
  shell('plans', `<div class="loading">Loading plan…</div>`);
  const p = await fetchPlan(planId);
  if (!p) return shell('plans', `<div class="empty">Plan not found.</div>`);
  const u = store.byId.get(p.user_id);
  shell(
    'plans',
    `<a class="backlink" href="#/plans">← All plans</a>
    <div class="page-title">Plan for ${esc(displayName(u))}</div>
    <div class="page-sub">Created ${fmtDateTime(p.created_at)} · ${p.active ? 'active' : 'inactive'} ·
      starts ${esc(p.plan_start_local_date ?? '—')} · <a href="#/user/${p.user_id}">view user →</a></div>
    <div class="card">${renderPlanContent(p.content)}</div>`
  );
}

// ---------------------------------------------------------------------------
// User detail

let userTab = 'chat';

function startChatAtLatest(root, targetMessageId = null) {
  const chat = root.querySelector('.chat');
  if (!chat) return;

  let pinnedToBottom = true;
  const updatePinnedState = () => {
    pinnedToBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
  };
  const scrollToLatest = () => {
    chat.scrollTop = chat.scrollHeight;
    pinnedToBottom = true;
  };

  chat.addEventListener('scroll', updatePinnedState, { passive: true });
  // Wait for the newly-rendered timeline to receive its final layout, then
  // start at the newest item without a visible animated jump.
  const target = targetMessageId
    ? [...chat.querySelectorAll('[data-message-id]')].find((row) => row.dataset.messageId === targetMessageId)
    : null;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.classList.add('turn-highlight');
      pinnedToBottom = false;
    } else {
      scrollToLatest();
    }
  }));

  // A newest image may receive its height after the first layout. Keep the
  // initial bottom position stable, but never pull an admin back down once
  // they have deliberately scrolled upward.
  chat.querySelectorAll('img').forEach((img) => {
    if (!img.complete) {
      img.addEventListener('load', () => {
        if (pinnedToBottom) requestAnimationFrame(scrollToLatest);
      }, { once: true });
    }
  });
}

async function viewUser(uid, tab = userTab, targetMessageId = null) {
  userTab = tab;
  const u = store.byId.get(uid);
  if (!u) return shell('users', `<div class="empty">User not found.</div>`);
  const streak = store.streaks.get(uid);
  const facts = [
    u.goal && `Goal: ${u.goal}`,
    u.goal_target && `Target: ${u.goal_target}`,
    u.fitness_level && `Level: ${u.fitness_level}`,
    u.equipment && `Equipment: ${u.equipment}`,
    u.injuries && `Injuries: ${u.injuries}`,
    u.exercises_to_avoid && `Avoids: ${u.exercises_to_avoid}`,
    streak?.current_streak != null && `Streak: ${streak.current_streak} (best ${streak.longest_streak})`,
  ].filter(Boolean);

  const tabs = [
    ['chat', 'Conversation'],
    ['plans', 'Plans'],
    ['workouts', 'Workouts'],
    ['trainer', 'Trainer activity'],
  ];

  shell(
    'users',
    `<a class="backlink" href="#/users">← All users</a>
    <div class="detail-head">
      <div class="avatar">${esc(initials(u))}</div>
      <div class="who"><div class="nm">${esc(displayName(u))} ${u.is_pro ? '<span class="pill pro">PRO</span>' : ''}
        ${isTestAccount(u) ? '<span class="pill warn">internal/test</span>' : ''}</div>
      <div class="em">${esc(u.email ?? '')} · joined ${fmtDate(u.created_at)}</div></div>
    </div>
    <div class="facts">${facts.map((f) => `<span class="pill">${esc(f)}</span>`).join('')}</div>
    <div class="tabs">${tabs
      .map(([k, t]) => `<button class="tab ${userTab === k ? 'active' : ''}" data-tab="${k}">${t}</button>`)
      .join('')}</div>
    <div id="tabbody"><div class="loading">Loading…</div></div>`
  );
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => viewUser(uid, b.dataset.tab)));

  const body = document.getElementById('tabbody');
  try {
    if (userTab === 'chat') {
      const workings = localStorage.getItem('tx_workings') === '1';
      const [msgs, trace] = await Promise.all([fetchUserMessages(uid), workings ? fetchUserTrace(uid) : []]);
      body.innerHTML = `<div class="toolbar"><label class="toggle">
          <input type="checkbox" id="workings" ${workings ? 'checked' : ''}/> Show workings
          <span class="sub" style="color:var(--text-muted)">(classifier · skills · telemetry · llm)</span>
        </label></div>${renderChat(msgs, trace)}`;
      document.getElementById('workings').onchange = (e) => {
        localStorage.setItem('tx_workings', e.target.checked ? '1' : '0');
        viewUser(uid, 'chat', targetMessageId);
      };
      startChatAtLatest(body, targetMessageId);
    }
    else if (userTab === 'plans') body.innerHTML = renderUserPlans(await fetchUserPlans(uid));
    else if (userTab === 'workouts') body.innerHTML = await renderWorkouts(uid);
    else if (userTab === 'trainer') {
      const [outreach, adjustments] = await Promise.all([fetchUserOutreach(uid), fetchUserAdjustments(uid)]);
      body.innerHTML = renderTrainer(outreach, adjustments);
    }
  } catch (e) {
    body.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

function tryJson(s) {
  if (typeof s !== 'string' || s[0] !== '{') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Structured assistant messages (plan cards, workout rows) render as cards
// instead of raw JSON.
function structuredBubble(m) {
  const j = tryJson(m.content);
  if (!j) return null;
  if (j.type === 'plan_card') {
    const meta = [j.duration, j.frequency, j.sessionLength].filter(Boolean).join(' · ');
    const msg = (j.message ?? '').replace(/\*\*/g, '');
    return `<div class="bubble struct">
      <div class="st-title">📋 ${esc(j.title ?? 'New plan')}</div>
      ${meta ? `<div class="st-meta">${esc(meta)}</div>` : ''}
      ${msg ? `<div class="st-msg">${esc(msg)}</div>` : ''}
      ${j.plan_id ? `<a href="#/plan/${esc(j.plan_id)}">View full plan →</a>` : ''}
    </div>`;
  }
  // Single-workout messages: {type:"workout", sessionTitle, intro, rows:[…]}
  // and older shapes with an exercises:[…] array.
  const exs = Array.isArray(j.rows) ? j.rows : Array.isArray(j.exercises) ? j.exercises : null;
  if (exs?.length) {
    const hasTempo = exs.some((e) => e.tempo);
    const rows = exs
      .map(
        (e) => `<tr><td>${esc(e.block ?? '')}</td><td>${esc(e.exercise_name ?? e.name ?? '')}</td>
        <td class="num">${esc(e.sets ?? '')}</td><td class="num">${esc(e.reps ?? '')}</td>
        ${hasTempo ? `<td class="num">${esc(e.tempo ?? '')}</td>` : ''}<td class="num">${esc(e.rest ?? '')}</td></tr>`
      )
      .join('');
    const title = j.sessionTitle ?? j.title ?? j.heading ?? 'Workout';
    return `<div class="bubble struct">
      <div class="st-title">🏋️ ${esc(title)}</div>
      ${j.heading && j.heading !== title ? `<div class="st-meta">${esc(j.heading)}</div>` : ''}
      ${j.intro ? `<div class="st-msg">${esc(j.intro)}</div>` : ''}
      <div class="table-scroll"><table>
        <tr><th>Block</th><th>Exercise</th><th class="num">Sets</th><th class="num">Reps</th>${hasTempo ? '<th class="num">Tempo</th>' : ''}<th class="num">Rest</th></tr>${rows}
      </table></div>
    </div>`;
  }
  return null;
}

function messageBubble(m) {
  const structured = structuredBubble(m);
  if (structured) return structured;

  const imageCount = Number(m.chat_image_count) || 0;
  const imageUrls = Array.isArray(m.chat_image_urls) ? m.chat_image_urls : [];
  if (m.role === 'user' && imageCount > 0) {
    const images = imageUrls
      .map(
        (url) => `<a class="chat-image-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
          <img class="chat-image" src="${esc(url)}" alt="User-uploaded image" loading="lazy"/>
        </a>`
      )
      .join('');
    const unavailable = imageCount - imageUrls.length;
    const fallback = unavailable > 0
      ? `<div class="chat-image-unavailable">${unavailable === 1 ? 'Image unavailable' : `${unavailable} images unavailable`}</div>`
      : '';
    const caption = String(m.content ?? '').trim()
      ? `<div class="chat-image-caption">${esc(m.content)}</div>`
      : '';
    return `<div class="bubble image-bubble"><div class="chat-images">${images}${fallback}</div>${caption}</div>`;
  }
  return `<div class="bubble">${esc(m.content ?? '')}</div>`;
}

function traceRow(t) {
  const icons = { classifier: '🧭', skill: '🧠', event: '⚙️', llm: '✨' };
  const label = `<span class="tr-icon">${icons[t.kind] ?? '⚙️'}</span> ${esc(t.label)} <span class="tr-time">${fmtTime(t.at)}</span>`;
  if (t.detail && Object.keys(t.detail).length) {
    return `<details class="trace-row"><summary>${label}</summary><pre>${esc(JSON.stringify(t.detail, null, 2))}</pre></details>`;
  }
  return `<div class="trace-row">${label}</div>`;
}

function renderChat(msgs, trace = []) {
  if (!msgs.length) return '<div class="empty">No messages yet.</div>';
  // Interleave messages and trace items chronologically (Claude-style workings).
  const timeline = [
    ...msgs.map((m) => ({ at: m.created_at, msg: m })),
    ...trace.map((t) => ({ at: t.at, trace: t })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));
  let lastDay = '';
  const parts = ['<div class="chat">'];
  for (const item of timeline) {
    const d = fmtDate(item.at);
    if (d !== lastDay) {
      parts.push(`<div class="day-divider">${d}</div>`);
      lastDay = d;
    }
    if (item.trace) {
      parts.push(traceRow(item.trace));
      continue;
    }
    const m = item.msg;
    const who = m.role === 'user' ? 'user' : 'assistant';
    const tags = [
      m.is_trainer_initiated && '<span class="pill pro">trainer-initiated</span>',
      m.intent_used && `<span class="pill">${esc(m.intent_used)}</span>`,
      m.action_card_type && `<span class="pill warn">${esc(m.action_card_type)}</span>`,
    ]
      .filter(Boolean)
      .join('');
    const bubble = messageBubble(m);
    const usage = messageUsageMeta(m);
    parts.push(`<div class="msg ${who}" data-message-id="${esc(m.id)}">${bubble}
      <div class="meta">${fmtTime(m.created_at)} ${tags}${usage}</div></div>`);
  }
  parts.push('</div>');
  return parts.join('');
}

function renderUserPlans(plans) {
  if (!plans.length) return '<div class="empty">No plans generated yet.</div>';
  return plans
    .map(
      (p) => `<details class="sesh" ${p.active ? 'open' : ''}>
      <summary><span class="t">Plan · ${fmtDate(p.created_at)}</span>
        <span class="d">${p.content?.days?.length ?? 0} days · starts ${esc(p.plan_start_local_date ?? '—')}</span>
        ${p.active ? '<span class="pill good">active</span>' : '<span class="pill">inactive</span>'}</summary>
      <div style="margin-top:10px">${renderPlanContent(p.content)}</div>
    </details>`
    )
    .join('');
}

async function renderWorkouts(uid) {
  const [sessions, sched] = await Promise.all([fetchUserSessions(uid), fetchUserScheduled(uid)]);
  const done = sched.filter((s) => s.status === 'completed').length;
  const skipped = sched.filter((s) => s.status === 'skipped').length;
  const head = `<div class="page-sub">Scheduled (last 120): ${done} completed · ${skipped} skipped · ${sched.length} total</div>`;
  if (!sessions.length) return head + '<div class="empty">No workout sessions.</div>';

  const parts = [head];
  for (const s of sessions.slice(0, 30)) {
    const status =
      s.completed_at || s.status === 'completed'
        ? '<span class="pill good">completed</span>'
        : `<span class="pill">${esc(s.status ?? 'started')}</span>`;
    parts.push(`<details class="sesh" data-sid="${s.id}">
      <summary><span class="t">${esc(s.title ?? `Day ${s.day_index ?? s.day_number ?? ''}`)}</span>
        <span class="d">${fmtDateTime(s.started_at ?? s.completed_at)}</span> ${status}
        ${s.rating ? `<span class="pill">${'★'.repeat(s.rating)}</span>` : ''}</summary>
      <div class="setsbody" style="margin-top:8px"><div class="loading">Loading sets…</div></div>
      ${s.comment ? `<div class="plan-notes">User: ${esc(s.comment)}</div>` : ''}
    </details>`);
  }
  setTimeout(() => {
    document.querySelectorAll('details.sesh[data-sid]').forEach((det) => {
      det.addEventListener(
        'toggle',
        async () => {
          if (!det.open || det.dataset.loaded) return;
          det.dataset.loaded = '1';
          const body = det.querySelector('.setsbody');
          try {
            const sets = await fetchSessionSets(det.dataset.sid);
            if (!sets.length) {
              body.innerHTML = '<div class="empty">No sets logged.</div>';
              return;
            }
            const byEx = new Map();
            for (const st of sets) {
              if (!byEx.has(st.exercise_name)) byEx.set(st.exercise_name, []);
              byEx.get(st.exercise_name).push(st);
            }
            body.innerHTML = [...byEx.entries()]
              .map(
                ([ex, rows]) => `<div class="plan-block"><div class="bl">${esc(ex)}</div>
              <div class="table-scroll"><table><tr><th class="num">Set</th><th class="num">Weight kg</th><th class="num">Reps</th><th class="num">RPE</th></tr>
              ${rows
                .map(
                  (r) =>
                    `<tr><td class="num">${r.set_number ?? ''}</td><td class="num">${r.weight_kg ?? '—'}</td><td class="num">${r.reps ?? '—'}</td><td class="num">${r.rpe ?? '—'}</td></tr>`
                )
                .join('')}</table></div></div>`
              )
              .join('');
          } catch (e) {
            body.innerHTML = `<div class="error">${esc(e.message)}</div>`;
          }
        },
        { once: false }
      );
    });
  }, 0);
  return parts.join('');
}

function renderTrainer(outreach, adjustments) {
  const o = outreach.length
    ? `<div class="card"><h3>Trainer outreach<span class="sub">${outreach.length} recent</span></h3>
      <div class="table-scroll"><table><tr><th>When</th><th>Trigger</th><th>Goal</th><th>Tone</th><th>Tier</th><th>Reasoning</th></tr>
      ${outreach
        .map(
          (r) => `<tr><td>${fmtDateTime(r.sent_at ?? r.created_at)}</td><td><span class="pill">${esc(r.trigger_type ?? '')}</span></td>
        <td>${esc(r.outreach_goal ?? r.outreach_angle ?? '')}</td><td>${esc(r.tone ?? '')}</td><td>${esc(r.attention_tier ?? '')}</td>
        <td style="max-width:340px">${esc(r.reasoning ?? '')}</td></tr>`
        )
        .join('')}</table></div></div>`
    : '<div class="empty">No trainer outreach for this user.</div>';
  const a = adjustments.length
    ? `<div class="card"><h3>Plan adjustments<span class="sub">${adjustments.length} recent</span></h3>
      <div class="table-scroll"><table><tr><th>When</th><th>Type</th><th>Status</th><th>Reason</th></tr>
      ${adjustments
        .map((r) => {
          const status = r.applied_at
            ? '<span class="pill good">applied</span>'
            : r.rejected_at
              ? '<span class="pill bad">rejected</span>'
              : '<span class="pill warn">pending</span>';
          return `<tr><td>${fmtDateTime(r.created_at)}</td><td><span class="pill">${esc(r.adjustment_type ?? '')}</span></td>
          <td>${status}</td><td style="max-width:420px">${esc(r.reason ?? r.reasoning ?? '')}</td></tr>`;
        })
        .join('')}</table></div></div>`
    : '';
  return o + a;
}

// ---------------------------------------------------------------------------
// login + boot

function viewLogin(step = 'email', email = '', err = '') {
  $app.innerHTML = `<div class="login-wrap"><form class="login-card" id="loginForm">
    <h1>trainerX admin</h1>
    <p>${step === 'email' ? 'Sign in with your admin account. A 6-digit code will be emailed to you.' : `Enter the code sent to <strong>${esc(email)}</strong>.`}</p>
    ${step === 'email'
      ? `<input type="email" id="email" placeholder="you@example.com" value="${esc(email)}" autofocus required/>`
      : `<input inputmode="numeric" id="code" placeholder="123456" autofocus required/>`}
    ${err ? `<div class="error">${esc(err)}</div>` : ''}
    <button class="btn" type="submit">${step === 'email' ? 'Send code' : 'Verify & sign in'}</button>
    ${step === 'code' ? '<button class="btn secondary" type="button" id="back">Use a different email</button>' : ''}
  </form></div>`;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (step === 'email') {
        const em = document.getElementById('email').value.trim();
        await auth.requestOtp(em);
        viewLogin('code', em);
      } else {
        await auth.verifyOtp(email, document.getElementById('code').value.trim());
        boot();
      }
    } catch (ex) {
      viewLogin(step, step === 'email' ? document.getElementById('email')?.value ?? '' : email, ex.message);
    }
  };
  const back = document.getElementById('back');
  if (back) back.onclick = () => viewLogin('email', email);
}

async function route() {
  const hash = location.hash || '#/home';
  const [, page, arg, detail, targetMessageId] = hash.split('/');
  const lightweight = ['conversations', 'analyze', 'build', 'intents', 'settings'].includes(page);
  if (lightweight && !store.profiles.length) {
    $app.innerHTML = '<div class="login-wrap"><div class="loading">Loading account index…</div></div>';
    try {
      await loadIntentCore();
    } catch (error) {
      $app.innerHTML = `<div class="login-wrap"><div class="login-card"><h1>Couldn’t load data</h1><p class="error">${esc(error.message)}</p></div></div>`;
      return;
    }
  } else if (!lightweight && !store.coreLoaded) {
    $app.innerHTML = '<div class="login-wrap"><div class="loading">Loading customer data…</div></div>';
    try {
      await loadCore();
    } catch (error) {
      $app.innerHTML = `<div class="login-wrap"><div class="login-card"><h1>Couldn’t load data</h1><p class="error">${esc(error.message)}</p></div></div>`;
      return;
    }
  }
  if (page === 'users') viewUsers();
  else if (page === 'user' && arg) viewUser(arg, 'chat', detail === 'message' ? targetMessageId : null);
  else if (page === 'conversations') viewConversations();
  else if (page === 'plans') viewPlans();
  else if (page === 'analyze' && arg === 'intents') viewAnalyzeIntents();
  else if (page === 'analyze' && arg === 'failures') viewFailures();
  else if (page === 'analyze' && arg === 'cost') viewCost();
  else if (page === 'build' && arg === 'prompts') viewPrompts();
  else if (page === 'build' && arg === 'tone-of-voice') viewToneOfVoice();
  else if ((page === 'build' && arg === 'intent-simulator') || page === 'intents') viewIntents();
  else if (page === 'settings') viewSettings();
  else if (page === 'plan' && arg) viewPlan(arg);
  else viewOverview();
}

async function boot() {
  $app.innerHTML = '<div class="login-wrap"><div class="loading">Loading data…</div></div>';
  try {
    const initialPage = (location.hash || '#/home').split('/')[1];
    if (['conversations', 'analyze', 'build', 'intents', 'settings'].includes(initialPage)) await loadIntentCore();
    else await loadCore();
  } catch (e) {
    $app.innerHTML = `<div class="login-wrap"><div class="login-card">
      <h1>Couldn't load data</h1><p class="error">${esc(e.message)}</p>
      <p>If this is a permissions error, check that your account has <code>is_admin</code> and that the
      admin read-policies migration has been applied.</p>
      <button class="btn secondary" id="so">Sign out</button></div></div>`;
    document.getElementById('so').onclick = () => {
      auth.signOut();
      viewLogin();
    };
    return;
  }
  window.onhashchange = () => void route();
  void route();
}

if (DEMO) {
  boot();
} else if (auth.session) {
  boot();
} else {
  viewLogin();
}

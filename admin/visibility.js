// Pure visibility/detection logic for the read-only admin views.
// No function in this module performs network requests or writes data.

const asTime = (value) => new Date(value).getTime();

export function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseIntentValue(value) {
  if (typeof value === 'string') {
    const parsed = parseJsonObject(value);
    if (parsed) return parseIntentValue(parsed);
    const clean = value.trim();
    return clean && clean.length < 80 ? { label: clean, confidence: null, ambiguity: null } : null;
  }
  const object = parseJsonObject(value);
  if (!object) return null;
  const label = object.intent ?? object.label ?? object.name ?? null;
  if (!label) return null;
  return {
    label: String(label),
    confidence: Number.isFinite(Number(object.confidence)) ? Number(object.confidence) : null,
    ambiguity: parseJsonObject(object.ambiguity) ?? object.ambiguity ?? null,
  };
}

function metaOf(message) {
  return parseJsonObject(message?.meta) ?? {};
}

export function pairConversationTurns(messages) {
  const byUser = new Map();
  for (const message of [...messages].sort((a, b) => asTime(a.created_at) - asTime(b.created_at))) {
    if (!byUser.has(message.user_id)) byUser.set(message.user_id, []);
    byUser.get(message.user_id).push(message);
  }

  const turns = [];
  for (const [userId, rows] of byUser) {
    for (let index = 0; index < rows.length; index++) {
      const user = rows[index];
      if (user.role !== 'user') continue;
      let assistant = null;
      for (let next = index + 1; next < rows.length; next++) {
        if (rows[next].role === 'user') break;
        if (rows[next].role === 'assistant') {
          assistant = rows[next];
          break;
        }
      }
      const userMeta = metaOf(user);
      const assistantMeta = metaOf(assistant);
      const intent = parseIntentValue(userMeta.intent) ?? parseIntentValue(user.intent_used) ??
        parseIntentValue(assistantMeta.intent) ?? parseIntentValue(assistant?.intent_used);
      turns.push({
        id: user.id,
        user_id: userId,
        user,
        assistant,
        user_at: user.created_at,
        assistant_at: assistant?.created_at ?? null,
        response_seconds: assistant ? (asTime(assistant.created_at) - asTime(user.created_at)) / 1000 : null,
        intent: intent?.label ?? 'UNLABELLED',
        confidence: intent?.confidence ?? null,
        ambiguity: intent?.ambiguity ?? parseJsonObject(userMeta.ambiguity) ?? userMeta.ambiguity ?? null,
        stage: String(userMeta.stage ?? assistantMeta.stage ?? 'unlabelled'),
      });
    }
  }
  return turns.sort((a, b) => asTime(b.user_at) - asTime(a.user_at));
}

export function attachClassifierDecisions(turns, decisions) {
  const unused = new Set(decisions.map((_, index) => index));
  const joined = turns.map((turn) => {
    let bestIndex = -1;
    let bestDelta = Infinity;
    decisions.forEach((decision, index) => {
      if (!unused.has(index) || decision.user_id !== turn.user_id) return;
      const delta = Math.abs(asTime(decision.created_at) - asTime(turn.user_at));
      const exactText = String(decision.message_text ?? '') === String(turn.user.content ?? '');
      if ((!exactText && delta > 15_000) || (exactText && delta > 120_000)) return;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) return turn;
    unused.delete(bestIndex);
    const decision = decisions[bestIndex];
    return {
      ...turn,
      decision,
      intent: decision.intent || turn.intent,
      confidence: Number.isFinite(Number(decision.confidence)) ? Number(decision.confidence) : turn.confidence,
      ambiguity: parseJsonObject(decision.ambiguity) ?? decision.ambiguity ?? turn.ambiguity,
      router_disposition: decision.router_disposition ?? null,
      guard_name: decision.guard_short_circuited ? decision.guard_name : null,
      intent_source: turn.intent !== 'UNLABELLED' ? 'message + classifier' : 'classifier',
    };
  });

  const unmatched = [...unused].map((index) => {
    const decision = decisions[index];
    return {
      id: null,
      user_id: decision.user_id,
      user: { id: null, content: decision.message_text ?? '', created_at: decision.created_at, meta: {} },
      assistant: null,
      user_at: decision.created_at,
      assistant_at: null,
      response_seconds: null,
      intent: decision.intent || 'UNLABELLED',
      confidence: Number.isFinite(Number(decision.confidence)) ? Number(decision.confidence) : null,
      ambiguity: parseJsonObject(decision.ambiguity) ?? decision.ambiguity ?? null,
      stage: 'classifier only',
      decision,
      router_disposition: decision.router_disposition ?? null,
      guard_name: decision.guard_short_circuited ? decision.guard_name : null,
      intent_source: 'classifier',
    };
  });
  return [...joined, ...unmatched].sort((a, b) => asTime(b.user_at) - asTime(a.user_at));
}

export function findDeadEnds(turns, { timeoutSeconds = 60, now = Date.now() } = {}) {
  return turns.filter((turn) => {
    const ageSeconds = (now - asTime(turn.user_at)) / 1000;
    if (ageSeconds < timeoutSeconds) return false;
    return turn.response_seconds == null || turn.response_seconds > timeoutSeconds;
  });
}

export function findRepeatSends(messages, windowSeconds = 300) {
  const users = new Map();
  for (const message of messages.filter((row) => row.role === 'user')) {
    if (!users.has(message.user_id)) users.set(message.user_id, []);
    users.get(message.user_id).push(message);
  }
  const findings = [];
  for (const [userId, rows] of users) {
    const sorted = rows.sort((a, b) => asTime(a.created_at) - asTime(b.created_at));
    const consumed = new Set();
    for (let index = 0; index < sorted.length; index++) {
      if (consumed.has(index)) continue;
      const first = sorted[index];
      const matches = [first];
      for (let next = index + 1; next < sorted.length; next++) {
        const delta = (asTime(sorted[next].created_at) - asTime(first.created_at)) / 1000;
        if (delta > windowSeconds) break;
        if (sorted[next].content === first.content) {
          matches.push(sorted[next]);
          consumed.add(next);
        }
      }
      if (matches.length > 1) {
        findings.push({
          id: matches[matches.length - 1].id,
          user_id: userId,
          content: first.content,
          count: matches.length,
          first_at: first.created_at,
          last_at: matches[matches.length - 1].created_at,
        });
      }
    }
  }
  return findings.sort((a, b) => asTime(b.last_at) - asTime(a.last_at));
}

export function replyLooksLikeQuestion(turn) {
  if (!turn.assistant) return false;
  const meta = metaOf(turn.assistant);
  // Stage names express intent, not what the user actually received. Require
  // question-shaped reply text (or an explicit structured question marker).
  return /\?/.test(String(turn.assistant.content ?? '')) || meta.is_question === true;
}

export function findUnresolvedAmbiguity(observations) {
  return observations
    .filter((turn) => (parseJsonObject(turn.ambiguity) ?? turn.ambiguity)?.unresolved === true)
    .map((turn) => ({ ...turn, followed_by_question: replyLooksLikeQuestion(turn) }));
}

export function declineReason(turn) {
  if (!turn.assistant) return null;
  const meta = metaOf(turn.assistant);
  const stage = String(meta.stage ?? turn.stage ?? '').toLowerCase();
  const text = String(turn.assistant.content ?? '').toLowerCase();
  const declineSignal = /fallback|unavailable|declin|error|emptied|no_pending/.test(stage) ||
    /\b(i can(?:not|'t)|i could(?: not|n't)|unable to|right now i can only|there (?:isn't|is not) an active plan|don't have an active plan|couldn't)\b/.test(text);
  if (!declineSignal) return null;
  if (/photo|image|equipment/.test(stage + ' ' + text)) return 'Image or equipment unavailable';
  if (/active plan|no plan/.test(text)) return 'No active plan';
  if (/week|scope|only move|not support|cannot yet|can't yet/.test(text)) return 'Unsupported scope';
  if (/error|failed|couldn't generate|unable to generate/.test(stage + ' ' + text)) return 'Generation or service failure';
  return stage && stage !== 'unlabelled' ? stage.replaceAll('_', ' ') : 'Other honest fallback';
}

export function findDeclines(turns) {
  return turns.flatMap((turn) => {
    const reason = declineReason(turn);
    return reason ? [{ ...turn, decline_reason: reason }] : [];
  });
}

function planClaimText(turn) {
  if (!turn.assistant) return false;
  const text = String(turn.assistant.content ?? '').trim();
  const meta = metaOf(turn.assistant);
  if (/\b(?:i(?:'ve| have) (?:now )?(?:updated|changed|adjusted)|updated your plan|changed your plan|adjusted your plan|plan (?:is|has been) (?:updated|changed|adjusted))\b/i.test(text)) return true;
  const planContext = turn.intent === 'PLAN_ADJUST' || meta.plan_adjustment_id || /plan_adjust/i.test(String(meta.stage ?? ''));
  return planContext && /^(?:done|updated|changed|sorted)(?:[.!]|$)/i.test(text);
}

export function findActionClaims(turns, adjustments, plans, { beforeSeconds = 10, afterSeconds = 60 } = {}) {
  return turns.filter(planClaimText).map((turn) => {
    const claimAt = asTime(turn.assistant_at);
    const meta = metaOf(turn.assistant);
    const adjustmentId = meta.plan_adjustment_id ?? meta.adjustment_id ?? null;
    const inWindow = (value) => {
      if (!value) return false;
      const delta = (asTime(value) - claimAt) / 1000;
      return delta >= -beforeSeconds && delta <= afterSeconds;
    };
    const adjustment = adjustments.find((row) => row.user_id === turn.user_id && (
      (adjustmentId && row.id === adjustmentId) || inWindow(row.applied_at) || inWindow(row.created_at)
    ));
    const plan = plans.find((row) => row.user_id === turn.user_id && inWindow(row.created_at));
    return {
      ...turn,
      mutation_found: !!(adjustment || plan),
      mutation_kind: adjustment ? `plan_adjustment · ${adjustment.adjustment_type ?? 'unknown'}` : plan ? 'new plan row' : null,
      severity: adjustment || plan ? 'verified' : 'critical',
    };
  }).sort((a, b) => {
    if (a.mutation_found !== b.mutation_found) return a.mutation_found ? 1 : -1;
    return asTime(b.assistant_at) - asTime(a.assistant_at);
  });
}

export function extractLlmUsage(messages) {
  return messages.flatMap((message) => {
    const usage = parseJsonObject(metaOf(message).llm_usage);
    if (message.role !== 'assistant' || !usage) return [];
    const input = Number(usage.prompt_tokens);
    const output = Number(usage.completion_tokens);
    if (!Number.isFinite(input) || !Number.isFinite(output)) return [];
    const cost = Number(usage.estimated_cost_usd);
    return [{
      message_id: message.id,
      user_id: message.user_id,
      at: message.created_at,
      model: String(usage.model ?? 'unknown'),
      service_tier: String(usage.service_tier ?? 'unknown'),
      input_tokens: input,
      output_tokens: output,
      total_tokens: Number(usage.total_tokens) || input + output,
      cost_usd: Number.isFinite(cost) ? cost : null,
    }];
  });
}

export function summarizeCosts(messages, telemetry, plans) {
  const usage = extractLlmUsage(messages);
  const totalCost = usage.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
  const totalTokens = usage.reduce((sum, row) => sum + row.total_tokens, 0);
  const activeUsers = new Set(messages.filter((row) => row.role === 'user').map((row) => row.user_id).filter(Boolean));
  const group = (rows, keyFn, valueFn) => {
    const out = new Map();
    for (const row of rows) {
      const key = keyFn(row);
      const value = out.get(key) ?? { cost: 0, tokens: 0, calls: 0 };
      valueFn(value, row);
      value.calls++;
      out.set(key, value);
    }
    return [...out.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  };
  const daily = group(usage, (row) => String(row.at).slice(0, 10), (value, row) => {
    value.cost += row.cost_usd ?? 0;
    value.tokens += row.total_tokens;
  }).sort((a, b) => a.key.localeCompare(b.key));
  const byModel = group(usage, (row) => row.model, (value, row) => {
    value.cost += row.cost_usd ?? 0;
    value.tokens += row.total_tokens;
  });
  const telemetryUsage = telemetry.filter((row) => row.model && (row.tokens_in != null || row.tokens_out != null || row.cost_usd != null));
  const byFunctionSignal = group(telemetryUsage, (row) => String(row.event ?? 'unknown'), (value, row) => {
    value.cost += Number(row.cost_usd) || 0;
    value.tokens += (Number(row.tokens_in) || 0) + (Number(row.tokens_out) || 0);
  });
  return {
    usage,
    totalCost,
    totalTokens,
    activeUsers: activeUsers.size,
    costPerActiveUser: activeUsers.size ? totalCost / activeUsers.size : null,
    generatedPlans: plans.length,
    costPerGeneratedPlan: null,
    daily,
    byModel,
    byFunctionSignal,
    pricedCalls: usage.filter((row) => row.cost_usd != null).length,
    unpricedCalls: usage.filter((row) => row.cost_usd == null).length,
  };
}

export function periodCounts(rows, timestampKey, currentStart, currentEnd, previousStart) {
  const start = asTime(currentStart);
  const end = asTime(currentEnd);
  const previous = asTime(previousStart);
  let current = 0;
  let prior = 0;
  for (const row of rows) {
    const at = asTime(row[timestampKey]);
    if (at >= start && at < end) current++;
    else if (at >= previous && at < start) prior++;
  }
  return { current, prior, delta: current - prior };
}

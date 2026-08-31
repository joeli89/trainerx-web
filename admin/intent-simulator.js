// Read-only Intent Lab model. This mirrors the public routing contract closely
// enough to rehearse flows in the admin UI, but it never calls production chat
// or writes customer data. The UI labels every result as a simulation.

export const INTENT_CATALOG = [
  { id: 'PLAN_CREATE', label: 'Create a plan', group: 'Action', description: 'Build a multi-day training plan or programme.', example: 'Create a 4 day plan with 45 minute sessions' },
  { id: 'WORKOUT_SINGLE', label: 'One-off workout', group: 'Action', description: 'Generate one workout outside scheduled progression.', example: 'Give me a 30 minute back and biceps workout' },
  { id: 'PLAN_ADJUST', label: 'Adjust a plan', group: 'Action', description: 'Change focus, exercises, or schedule in an existing plan.', example: 'I want more arm work in my plan' },
  { id: 'NEXT_WORKOUT', label: 'Next workout', group: 'Action', description: 'Open the next scheduled session from the active plan.', example: 'What’s my next workout?' },
  { id: 'PREF_UPDATE', label: 'Update preference', group: 'Memory', description: 'Remember an ongoing training preference or constraint.', example: 'I hate bench press' },
  { id: 'NUTRITION', label: 'Nutrition', group: 'Coach', description: 'Answer food, calories, macros, protein, or supplement requests.', example: 'How much protein should I eat?' },
  { id: 'Q_AND_A', label: 'Fitness question', group: 'Coach', description: 'Answer a general training, technique, soreness, or recovery question.', example: 'How often should I deload?' },
  { id: 'SMALL_TALK', label: 'Small talk', group: 'Conversation', description: 'Respond conversationally without taking an action.', example: 'Morning mate' },
  { id: 'UNKNOWN', label: 'Unknown', group: 'Fallback', description: 'Ask for clarification when the request cannot be resolved safely.', example: 'Can you sort that thing?' },
  { id: 'CONFIRM_ACTION', label: 'Confirm action', group: 'Pending action', description: 'Apply the action currently waiting for approval.', example: 'Yes, do it' },
  { id: 'DECLINE_ACTION', label: 'Decline action', group: 'Pending action', description: 'Discard the action currently waiting for approval.', example: 'No, leave it' },
];

export const SIMULATION_CASES = [
  { message: 'next workout now', expected: 'NEXT_WORKOUT', note: 'May 2026 regression' },
  { message: 'give me a workout now', expected: 'WORKOUT_SINGLE', note: 'Near-neighbour' },
  { message: 'Need 30 mins back and bi session', expected: 'WORKOUT_SINGLE', note: 'Aug 2026 incident' },
  { message: '30 min sessions, 4 days a week', expected: 'PLAN_CREATE', note: 'Plan-shaped cadence' },
  { message: 'I feel like I wanna grow my arms more', expected: 'PLAN_ADJUST', note: 'Aug 2026 incident' },
  { message: 'I want a workout for arms', expected: 'WORKOUT_SINGLE', note: 'Priority near-neighbour' },
  { message: 'what exercises grow arms fastest', expected: 'Q_AND_A', note: 'Question near-neighbour' },
  { message: 'move Wednesday’s workout to Friday', expected: 'PLAN_ADJUST', note: 'Schedule move' },
  { message: 'set my macros', expected: 'NUTRITION', note: 'Nutrition action' },
  { message: 'I hate bench press', expected: 'PREF_UPDATE', note: 'Preference capture' },
  { message: 'Morning', expected: 'SMALL_TALK', note: 'Aug 2026 incident' },
  { message: 'Can you sort that thing?', expected: 'UNKNOWN', note: 'Unresolved referent' },
];

const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[’]/g, "'");
const contains = (text, pattern) => pattern.test(text);

function extractPlanEntities(text) {
  const entities = {};
  const days = text.match(/\b([2-7])\s*(?:days?|times?|sessions?)\s*(?:a|per)?\s*week\b/) ??
    text.match(/\b([2-7])\s*day\s+(?:plan|split|program(?:me)?)\b/);
  const duration = text.match(/\b(\d{2,3})\s*(?:min|mins|minutes?)\b/);
  if (days) entities.days = days[1];
  if (duration) entities.duration = duration[1];
  return entities;
}

function extractAdjustmentEntities(text) {
  const entities = {};
  const move = text.match(/(?:move|reschedule|shift|push)\s+(.+?)\s+(?:to|for|until)\s+(.+?)(?:[.!?]|$)/);
  if (move) {
    entities.move_from = move[1].trim();
    entities.move_to = move[2].trim();
  }
  const more = text.match(/(?:grow|more|priority|emphasi[sz]e|focus on)\s+(?:my\s+)?(arms?|chest|back|shoulders?|legs?|glutes?|core|cardio|strength|biceps?|triceps?)/);
  const moreReverse = text.match(/(arms?|chest|back|shoulders?|legs?|glutes?|core|cardio|strength|biceps?|triceps?)\s+(?:is|are)\s+(?:my\s+)?priority/);
  const less = text.match(/(?:less|reduce)\s+(arms?|chest|back|shoulders?|legs?|glutes?|core|cardio|strength|biceps?|triceps?)/);
  if (more || moreReverse) entities.focus_more = (more?.[1] ?? moreReverse?.[1]).trim();
  if (less) entities.focus_less = less[1].trim();
  return entities;
}

function hasUnresolvedReferent(text, context) {
  if (context.imageAttached || context.screenContext) return false;
  return /\b(this|that|it|thing|one)\b/.test(text) && !/\b(this|that)\s+(workout|plan|exercise|session)\b/.test(text);
}

function classify(message, context) {
  const text = normalize(message);
  if (!text) return { intent: 'UNKNOWN', confidence: 0, entities: {}, reason: 'No message supplied.' };

  if (context.pendingAction) {
    if (/^(yes|yep|yeah|sure|ok(?:ay)?|do it|confirm|go ahead)\b/.test(text)) {
      return { intent: 'CONFIRM_ACTION', confidence: 0.99, entities: {}, reason: 'Affirmative reply while an action is pending.' };
    }
    if (/^(no|nope|nah|cancel|leave it|don't|do not)\b/.test(text)) {
      return { intent: 'DECLINE_ACTION', confidence: 0.99, entities: {}, reason: 'Negative reply while an action is pending.' };
    }
  }

  if (hasUnresolvedReferent(text, context)) {
    return { intent: 'UNKNOWN', confidence: 0.43, entities: {}, reason: 'The referent cannot be resolved from the supplied context.', ambiguity: 'What does “that” refer to?' };
  }

  if (/\b(next (?:workout|session|one)|what(?:'s| is) next|what am i doing today|my next|from my plan|ready for the next)\b/.test(text)) {
    return { intent: 'NEXT_WORKOUT', confidence: 0.98, entities: {}, reason: 'Scheduled-progression language outranks one-off workout wording.' };
  }

  if (/^(?:what|which|how|why)\b/.test(text) && /\b(exercises?|grow|stretch|train|technique|form|deload|recover|recovery)\b/.test(text)) {
    return { intent: 'Q_AND_A', confidence: 0.93, entities: {}, reason: 'A fitness question is not an instruction to mutate the plan.' };
  }

  const adjustmentEntities = extractAdjustmentEntities(text);
  const priorityChange = Object.keys(adjustmentEntities).some((k) => k.startsWith('focus_'));
  const directAdjustment = /\b(swap|replace|remove|change|edit|move|reschedule|shift|push|instead of)\b/.test(text);
  if (priorityChange || directAdjustment) {
    return {
      intent: 'PLAN_ADJUST', confidence: priorityChange ? 0.94 : 0.96, entities: adjustmentEntities,
      reason: priorityChange ? 'Standing priority language changes the existing plan.' : 'Explicit plan or schedule change language.',
    };
  }

  const planEntities = extractPlanEntities(text);
  const planShaped = /\b(plan|program(?:me)?|split|schedule|same as before|like last time|previous plan)\b/.test(text) || Object.hasOwn(planEntities, 'days');
  if (planShaped) {
    return { intent: 'PLAN_CREATE', confidence: 0.96, entities: planEntities, reason: 'Multi-day or programme-shaped language.' };
  }

  const singleWorkout = /\b(workout|session)\b/.test(text) && (
    /\b(give|create|make|build|want|need|quick|today|now|please|for)\b/.test(text) ||
    /\b\d{2,3}\s*(?:min|mins|minutes?)\b/.test(text)
  );
  if (singleWorkout) {
    const entities = {};
    const duration = text.match(/\b(\d{2,3})\s*(?:min|mins|minutes?)\b/);
    if (duration) entities.duration = duration[1];
    return { intent: 'WORKOUT_SINGLE', confidence: 0.95, entities, reason: 'Singular session language without plan cadence.' };
  }

  if (/\b(calories?|macros?|protein|creatine|supplements?|meal plan|what should i eat|carbs?|fats?|nutrition|diet)\b/.test(text)) {
    return { intent: 'NUTRITION', confidence: 0.96, entities: {}, reason: 'Nutrition or supplement topic.' };
  }

  if (/\b(i hate|i dislike|i prefer|i love|avoid|don't like|do not like|never give me)\b/.test(text)) {
    return { intent: 'PREF_UPDATE', confidence: 0.92, entities: {}, reason: 'The user states an ongoing preference or constraint.' };
  }

  if (/^(hi|hey|hello|yo|morning|good morning|evening|morning mate|how's it going|happy \w+)[!?. ]*$/.test(text)) {
    return { intent: 'SMALL_TALK', confidence: 0.98, entities: {}, reason: 'Greeting or social message without a fitness request.' };
  }

  if (/\b(how|why|what|when|should|can i|is it|stretch|sore|soreness|technique|form|deload|recover|recovery|exercise)\b/.test(text)) {
    return { intent: 'Q_AND_A', confidence: 0.9, entities: {}, reason: 'General fitness or recovery question without a requested action.' };
  }

  return { intent: 'UNKNOWN', confidence: 0.38, entities: {}, reason: 'No intent has enough evidence to act safely.' };
}

function safetyGuard(text) {
  if (/\b(chest pain|can't breathe|cannot breathe|fainted|passed out|numbness|loss of bladder|loss of bowel)\b/.test(text)) {
    return { name: 'red_flag_safety', response: 'Stop training. This needs prompt medical assessment; if symptoms are severe or worsening, seek emergency help now.' };
  }
  if (/\b(sharp pain|severe pain|pain shooting|new pain)\b/.test(text)) {
    return { name: 'pain_clarification', response: 'Stop that movement. Where is the pain, what does it feel like, and did it start suddenly?' };
  }
  return null;
}

function routeResult(classified, context) {
  const { intent, entities, ambiguity } = classified;
  if (ambiguity) return { disposition: 'ask', action: 'Clarify the referent', writes: [], response: 'What does “that” refer to — your plan, your next workout, or a specific exercise?' };

  if (intent === 'PLAN_CREATE') {
    const missing = ['days', 'duration'].filter((k) => !entities[k]);
    if (missing.length) return { disposition: 'ask', action: 'Collect plan parameters', writes: [], response: `Before I build it: ${missing.includes('days') ? 'how many days a week' : ''}${missing.length === 2 ? ', and ' : ''}${missing.includes('duration') ? 'how long per session' : ''}?` };
    if (!context.isPro && context.freePlanUsed) return { disposition: 'blocked', action: 'Show plan access gate', writes: [], response: 'You have already used your free plan generation. Upgrade to create another plan.' };
    return { disposition: 'would_act', action: 'Generate multi-day plan', writes: ['plans', 'scheduled_workouts'], response: `I’d generate a ${entities.days}-day plan with roughly ${entities.duration}-minute sessions.` };
  }
  if (intent === 'WORKOUT_SINGLE') return { disposition: 'would_act', action: 'Generate one-off workout', writes: ['messages'], response: `I’d build one${entities.duration ? ` ${entities.duration}-minute` : ''} session around the request and current constraints.` };
  if (intent === 'PLAN_ADJUST') {
    if (!context.hasActivePlan) return { disposition: 'blocked', action: 'Offer plan creation', writes: [], response: 'There isn’t an active plan to change. I can build one first.' };
    if (entities.move_from || entities.move_to) return { disposition: 'would_propose', action: 'Propose schedule move', writes: ['plan_adjustments (pending)'], response: `I’d propose moving ${entities.move_from ?? 'the selected workout'} to ${entities.move_to ?? 'the requested day'}, then wait for confirmation.` };
    if (entities.focus_more || entities.focus_less) return { disposition: 'would_propose', action: 'Propose focus-volume change', writes: ['plan_adjustments (pending)'], response: `I’d inspect the real plan, explain its current ${entities.focus_more ?? entities.focus_less} volume, and offer a set-by-set change for approval.` };
    return { disposition: 'would_propose', action: 'Propose plan adjustment', writes: ['plan_adjustments (pending)'], response: 'I’d calculate the plan diff and ask for approval before applying it.' };
  }
  if (intent === 'NEXT_WORKOUT') {
    if (!context.hasActivePlan) return { disposition: 'blocked', action: 'Offer plan creation', writes: [], response: 'You don’t have an active plan yet. I can create one.' };
    return { disposition: 'would_act', action: 'Load next scheduled workout', writes: ['messages'], response: 'I’d load the next incomplete scheduled session from the active plan.' };
  }
  if (intent === 'PREF_UPDATE') return { disposition: 'would_act', action: 'Record preference', writes: ['profiles / trainer memory'], response: 'I’d remember this preference first, then acknowledge how it will affect future training.' };
  if (intent === 'NUTRITION') return { disposition: 'respond', action: 'Nutrition coaching reply', writes: ['messages'], response: 'I’d answer using the user’s goal and profile, without changing the training plan.' };
  if (intent === 'Q_AND_A') return { disposition: 'respond', action: 'Fitness coaching reply', writes: ['messages'], response: 'I’d answer directly using profile, plan, and recent-conversation context.' };
  if (intent === 'SMALL_TALK') return { disposition: 'respond', action: 'Conversational reply', writes: ['messages'], response: 'I’d reply naturally without inventing a training action.' };
  if (intent === 'CONFIRM_ACTION') return { disposition: 'would_act', action: 'Apply pending action', writes: ['pending target', 'plan_adjustments'], response: 'I’d apply the pending change exactly once and confirm the concrete result.' };
  if (intent === 'DECLINE_ACTION') return { disposition: 'would_act', action: 'Discard pending action', writes: ['plan_adjustments'], response: 'I’d leave the plan unchanged and close the pending action.' };
  return { disposition: 'ask', action: 'Clarify request', writes: [], response: 'I’m not certain what you want me to change. Can you give me one more detail?' };
}

export function simulateIntent(message, suppliedContext = {}) {
  const context = {
    hasActivePlan: true,
    isPro: true,
    freePlanUsed: false,
    pendingAction: false,
    imageAttached: false,
    screenContext: '',
    ...suppliedContext,
  };
  const text = normalize(message);
  const classified = classify(message, context);
  const guard = safetyGuard(text);
  const routed = guard
    ? { disposition: 'guarded', action: 'Safety response', writes: ['messages'], response: guard.response }
    : routeResult(classified, context);
  const steps = [
    { label: 'Message received', detail: context.imageAttached ? 'Text + image context' : 'Text context' },
    { label: 'Pre-route guards', detail: guard ? `Stopped by ${guard.name}` : 'No guard short-circuit' },
    { label: 'Intent classified', detail: `${classified.intent} · ${Math.round(classified.confidence * 100)}% confidence` },
    { label: 'Router decision', detail: routed.action },
    { label: 'Outcome', detail: routed.writes.length ? `Would touch: ${routed.writes.join(', ')}` : 'No writes' },
  ];
  return { message, context, ...classified, guard, ...routed, steps, simulated: true };
}

export function runSimulationSuite(context = {}) {
  return SIMULATION_CASES.map((test) => {
    const result = simulateIntent(test.message, context);
    return { ...test, actual: result.intent, pass: result.intent === test.expected, confidence: result.confidence };
  });
}

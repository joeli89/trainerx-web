// Demo dataset for ?demo=1 — lets the dashboard be developed/reviewed without
// production access. Only loaded into window; data.js uses it when DEMO is on.
(function () {
  if (!new URLSearchParams(location.search).has('demo')) return;

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const dayMs = 86400 * 1000;
  const demoLlmUsage = (seed) => {
    const prompt = 900 + seed * 17;
    const cached = Math.floor(prompt * 0.2);
    const completion = 70 + (seed % 45);
    return {
      model: 'gpt-5.6-terra', prompt_tokens: prompt, cached_prompt_tokens: cached,
      completion_tokens: completion, reasoning_tokens: 0, total_tokens: prompt + completion,
      service_tier: 'priority',
      estimated_cost_usd: Math.round((((prompt - cached) * 2.5 + cached * 0.25 + completion * 15) / 1_000_000) * 1e8) / 1e8,
      cost_basis: 'openai-priority-short-context-2026-08-25',
    };
  };

  const names = [
    ['Sam Carter', 'sam.carter@example.com', 'build_muscle', 'intermediate', true],
    ['Priya Nair', 'priya.n@example.com', 'lose_fat', 'beginner', true],
    ['Marcus Webb', 'marcus.webb@example.com', 'get_stronger', 'advanced', false],
    ['Elena Rossi', 'elena.rossi@example.com', 'general_fitness', 'intermediate', true],
    ['Tom Hughes', 'tom.h@example.com', 'build_muscle', 'beginner', false],
    ['Aisha Bello', 'aisha.b@example.com', 'lose_fat', 'intermediate', true],
    ['Dan Kim', 'dan.kim@example.com', 'get_stronger', 'intermediate', false],
    ['Laura Pratt', 'laura.p@example.com', 'general_fitness', 'beginner', false],
  ];

  const profiles = names.map(([name, email, goal, level, pro], i) => ({
    id: `u${i + 1}`,
    name,
    email,
    goal,
    fitness_level: level,
    is_pro: pro,
    is_admin: false,
    is_internal: i === 7,
    account_type: i === 7 ? 'internal' : 'real',
    onboarding_complete: i !== 7,
    equipment: i % 2 ? 'full_gym' : 'dumbbells_only',
    injuries: i === 2 ? 'Bad knees' : null,
    exercises_to_avoid: i === 0 ? 'bench press' : null,
    created_at: iso((40 - i * 4) * dayMs),
    goal_target: goal === 'lose_fat' ? 'Drop 6kg' : null,
    preferred_units: 'metric',
  }));

  const user_streaks = profiles.map((p, i) => ({
    user_id: p.id,
    current_streak: [4, 12, 0, 7, 2, 9, 1, 0][i],
    longest_streak: [9, 15, 6, 11, 4, 12, 3, 1][i],
    last_active_date: iso(i * dayMs).slice(0, 10),
  }));

  const chatScripts = [
    ['Morning! Legs felt heavy yesterday', "That's normal after Tuesday's volume — today is an easier pull day. How did you sleep?"],
    ['Can we swap bench press for something else? Shoulder niggle', "Done — I've replaced flat bench with a neutral-grip dumbbell press. Lighter on the shoulder, same pattern. Tell me if it still pinches."],
    ['Missed Monday, travelling for work', "No stress. I've shifted the week: upper session tomorrow, and we drop the optional day. Consistency beats perfection."],
    ['What should I eat before morning sessions?', 'Something small and fast: a banana and a coffee 30–40 min before is plenty for a 45-minute session.'],
    ['That last set of squats was brutal', 'Good — RPE 9 on the top set is exactly where I wanted you. Deload is in 2 weeks.'],
  ];

  const messages = [];
  let mid = 0;
  profiles.forEach((p, ui) => {
    const nMsgs = [22, 34, 8, 18, 5, 26, 12, 2][ui];
    for (let i = nMsgs; i > 0; i--) {
      const [uq, ar] = chatScripts[(i + ui) % chatScripts.length];
      const t = i * 0.6 * dayMs + ui * 3600 * 1000;
      messages.push({
        id: `m${mid++}`,
        user_id: p.id,
        role: 'user',
        content: uq,
        // Typical healthy response latency: assistant row below lands 15s later.
        created_at: iso(t + 15000),
        is_trainer_initiated: false,
        intent_used: null,
        action_card_type: null,
      });
      messages.push({
        id: `m${mid++}`,
        user_id: p.id,
        role: 'assistant',
        content: ar,
        created_at: iso(t),
        is_trainer_initiated: i % 5 === 0,
        intent_used: ['SMALL_TALK', 'PLAN_ADJUST', 'QUESTION', 'LOG_FEEDBACK'][i % 4],
        action_card_type: i % 7 === 0 ? 'plan_card' : null,
        meta: { llm_usage: demoLlmUsage(i + ui) },
      });
    }
  });

  // Structured assistant messages (rendered as cards in the chat view).
  messages.push(
    {
      id: `m${mid++}`, user_id: 'u1', role: 'user', created_at: iso(0.05 * dayMs),
      is_trainer_initiated: false, intent_used: null, action_card_type: null, content: '',
      meta: {
        images: [{
          url: 'demo-chat-image.svg',
        }],
      },
    },
    {
      id: `m${mid++}`, user_id: 'u1', role: 'assistant', created_at: iso(0.2 * dayMs),
      is_trainer_initiated: false, intent_used: 'PLAN_CREATE', action_card_type: 'plan_card',
      content: JSON.stringify({
        type: 'plan_card', title: 'Lean Reset Hypertrophy Block', duration: '4 weeks',
        frequency: '4 days/week', sessionLength: '30min sessions',
        message: 'Perfect — here is your next phase: focused back and biceps work in efficient 30-minute sessions.',
        plan_id: 'p0-0',
      }),
    },
    {
      id: `m${mid++}`, user_id: 'u1', role: 'assistant', created_at: iso(0.15 * dayMs),
      is_trainer_initiated: false, intent_used: 'WORKOUT_SINGLE', action_card_type: null,
      content: JSON.stringify({
        type: 'workout', sessionTitle: 'Back & Biceps Pre-Fatigue', heading: '45-Minute Back & Biceps',
        intro: 'Pre-fatigue the biceps before each pull, then keep 1-2 clean reps in reserve.',
        rows: [
          { block: 'A1', exercise_name: 'Cable Curl (straight bar)', sets: 3, reps: '12-15', tempo: '3-1-1', rest: '30s' },
          { block: 'A2', exercise_name: 'Cable Lat Pulldown (neutral grip)', sets: 3, reps: '8-10', tempo: '3-1-1', rest: '60s' },
          { block: 'B1', exercise_name: 'Incline Dumbbell Curl', sets: 3, reps: '10-12', tempo: '3-1-1', rest: '30s' },
        ],
      }),
    },
    {
      id: `m${mid++}`, user_id: 'u1', role: 'assistant', created_at: iso(0.1 * dayMs),
      is_trainer_initiated: false, intent_used: 'NEXT_WORKOUT', action_card_type: null,
      content: JSON.stringify({
        title: 'Back & Biceps A',
        exercises: [
          { block: 'A1', exercise_name: 'Lat Pulldown', sets: 4, reps: '8-10', rest: '90s' },
          { block: 'B1', exercise_name: 'Seated Row', sets: 3, reps: '10-12', rest: '60s' },
          { block: 'C1', exercise_name: 'Reverse-Grip EZ-Bar Curl', sets: 2, reps: '15', rest: '30s' },
        ],
      }),
    }
  );

  // Visibility-layer fixtures: one example of each shipped failure shape.
  messages.push(
    {
      id: 'vis-dead-end', user_id: 'u1', role: 'user', content: 'I have this kit',
      created_at: iso(3 * 3600 * 1000), meta: { intent: 'PREF_UPDATE', stage: '2C' },
      is_trainer_initiated: false, intent_used: 'PREF_UPDATE', action_card_type: null,
    },
    {
      id: 'vis-repeat-1', user_id: 'u2', role: 'user', content: 'Can you move leg day to Friday?',
      created_at: iso(4 * 3600 * 1000 + 60000), meta: { intent: 'PLAN_ADJUST', stage: '2C' },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-repeat-2', user_id: 'u2', role: 'user', content: 'Can you move leg day to Friday?',
      created_at: iso(4 * 3600 * 1000), meta: { intent: 'PLAN_ADJUST', stage: '2C' },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-repeat-answer', user_id: 'u2', role: 'assistant', content: 'Which leg session do you mean — Lower A or Lower B?',
      created_at: iso(4 * 3600 * 1000 - 10000), meta: { stage: 'clarify_ask', llm_usage: demoLlmUsage(52) },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-ambiguity', user_id: 'u3', role: 'user', content: 'Can you change that?',
      created_at: iso(5 * 3600 * 1000 + 10000),
      meta: { intent: JSON.stringify({ intent: 'PLAN_ADJUST', confidence: 0.64, ambiguity: { unresolved: true, reason: 'referent' } }), stage: '2C' },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-ambiguity-answer', user_id: 'u3', role: 'assistant', content: 'I need one more detail before I change anything.',
      created_at: iso(5 * 3600 * 1000), meta: { stage: 'clarify_ask', llm_usage: demoLlmUsage(61) },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-decline-user', user_id: 'u4', role: 'user', content: 'Move it to next Monday',
      created_at: iso(6 * 3600 * 1000 + 10000), meta: { intent: 'PLAN_ADJUST', stage: '2C' },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-decline-answer', user_id: 'u4', role: 'assistant',
      content: 'Right now I can only move a workout within the current week — want to pick a day this week instead?',
      created_at: iso(6 * 3600 * 1000), meta: { stage: 'move_workout_declined', llm_usage: demoLlmUsage(68) },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-claim-user', user_id: 'u5', role: 'user', content: 'Drop bench press',
      created_at: iso(7 * 3600 * 1000 + 10000), meta: { intent: 'PLAN_ADJUST', stage: '2C' },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-claim-answer', user_id: 'u5', role: 'assistant', content: "I've updated your plan — bench press is out.",
      created_at: iso(7 * 3600 * 1000), meta: { stage: 'plan_adjustment_applied', llm_usage: demoLlmUsage(74) },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-applied-user', user_id: 'u1', role: 'user', content: 'Swap bench for dumbbells',
      created_at: iso(8 * 3600 * 1000 + 10000), meta: { intent: 'PLAN_ADJUST', stage: '2C' },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    },
    {
      id: 'vis-applied-answer', user_id: 'u1', role: 'assistant', content: 'Done. I’ve updated your plan with neutral-grip dumbbell press.',
      created_at: iso(8 * 3600 * 1000), meta: { stage: 'plan_adjustment_applied', plan_adjustment_id: 'adj-demo-applied', llm_usage: demoLlmUsage(81) },
      is_trainer_initiated: false, intent_used: 'PLAN_ADJUST', action_card_type: null,
    }
  );

  const exNames = ['Back Squat', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Bench Press', 'Seated Row', 'Lat Pulldown', 'Overhead Press', 'Leg Press', 'Walking Lunge', 'Plank'];
  function mkPlan(pid, uid, daysN, msAgo, active) {
    return {
      id: pid,
      user_id: uid,
      active,
      created_at: iso(msAgo),
      plan_start_local_date: iso(msAgo).slice(0, 10),
      meta: {},
      content: {
        meta: { title: 'Strength Block — Week 1-4' },
        days: Array.from({ length: daysN }, (_, d) => ({
          day: d + 1,
          type: d % 3 === 2 ? 'rest' : 'workout',
          title: d % 3 === 2 ? 'Rest' : ['Lower A', 'Upper A', 'Lower B', 'Upper B'][d % 4],
          notes: d === 0 ? 'Warm up 5 min on the bike before the first block.' : '',
          blocks:
            d % 3 === 2
              ? []
              : [
                  {
                    label: 'Block A',
                    rest_after_block_sec: 180,
                    exercises: exNames.slice(d % 3, (d % 3) + 3).map((n, j) => ({
                      name: n,
                      sets: 3 + (j === 0 ? 1 : 0),
                      reps: j === 0 ? '5' : '8-10',
                      weight: j === 0 ? '80kg' : '',
                      rest: '120s',
                      tempo: '2-0-1',
                      exercise_type: 'strength',
                    })),
                  },
                  {
                    label: 'Block B',
                    exercises: exNames.slice(4 + (d % 3), 4 + (d % 3) + 2).map((n) => ({
                      name: n,
                      sets: 3,
                      reps: '10-12',
                      weight: '',
                      rest: '90s',
                      tempo: '',
                      exercise_type: 'hypertrophy',
                    })),
                  },
                ],
        })),
      },
    };
  }

  const plans = [];
  profiles.forEach((p, ui) => {
    const n = [2, 3, 1, 2, 1, 2, 1, 0][ui];
    for (let i = 0; i < n; i++) plans.push(mkPlan(`p${ui}-${i}`, p.id, 7, (i * 28 + 2) * dayMs, i === 0));
  });

  const workout_sessions = [];
  const workout_set_logs = [];
  const scheduled_workouts = [];
  let sid = 0, swid = 0;
  profiles.forEach((p, ui) => {
    const weekly = [3, 4, 1, 3, 1, 3, 2, 0][ui];
    for (let w = 0; w < 8; w++) {
      for (let k = 0; k < weekly; k++) {
        const at = (w * 7 + k * 2 + (ui % 2)) * dayMs + 3600 * 1000 * 10;
        const id = `s${sid++}`;
        const completed = !(w === 0 && k === weekly - 1 && ui % 3 === 0);
        workout_sessions.push({
          id,
          user_id: p.id,
          title: ['Lower A', 'Upper A', 'Lower B', 'Upper B'][k % 4],
          day_index: k,
          started_at: iso(at + 50 * 60000),
          completed_at: completed ? iso(at) : null,
          status: completed ? 'completed' : 'started',
          rating: completed ? 3 + ((w + k) % 3) : null,
          comment: w === 0 && k === 0 ? 'Felt strong today' : null,
          scheduled_workout_id: `sw${swid}`,
        });
        scheduled_workouts.push({
          id: `sw${swid++}`,
          user_id: p.id,
          scheduled_date: iso(at).slice(0, 10),
          status: completed ? 'completed' : 'missed',
          phase: 'build',
          plan_day_index: k,
          completed_at: completed ? iso(at) : null,
          actual_duration_sec: completed ? 2700 + k * 300 : null,
        });
        if (completed && w < 2) {
          for (let e = 0; e < 3; e++) {
            for (let st = 1; st <= 3; st++) {
              workout_set_logs.push({
                session_id: id,
                exercise_name: exNames[(k + e) % exNames.length],
                set_number: st,
                weight_kg: 40 + e * 15 + st * 2.5,
                reps: 8 - st,
                rpe: 6 + st,
                performed_at: iso(at - st * 90000),
              });
            }
          }
        }
      }
    }
  });

  const trainer_outreach_log = [];
  profiles.slice(0, 5).forEach((p, i) => {
    trainer_outreach_log.push(
      {
        user_id: p.id,
        trigger_type: 'missed_workout',
        tone: 'direct',
        outreach_goal: 'get back on plan',
        attention_tier: 'amber',
        reasoning: 'Missed two consecutive scheduled sessions; historically responds to a direct nudge referencing the goal.',
        sent_at: iso((i + 1) * dayMs),
        created_at: iso((i + 1) * dayMs),
        action_taken: 'sent',
      },
      {
        user_id: p.id,
        trigger_type: 'streak_milestone',
        tone: 'warm',
        outreach_goal: 'reinforce consistency',
        attention_tier: 'green',
        reasoning: 'Hit a 7-day streak; brief acknowledgement, no ask.',
        sent_at: iso((i + 4) * dayMs),
        created_at: iso((i + 4) * dayMs),
        action_taken: 'sent',
      }
    );
  });

  const plan_adjustments = [
    {
      id: 'adj-demo-applied',
      user_id: 'u1',
      adjustment_type: 'exercise_swap',
      reasoning: 'Swap bench press for neutral-grip dumbbell press',
      applied_at: iso(8 * 3600 * 1000 - 5000),
      rejected_at: null,
      created_at: iso(8 * 3600 * 1000 + 5000),
    },
    {
      user_id: 'u1',
      adjustment_type: 'exercise_swap',
      reason: 'Shoulder niggle on flat bench',
      applied_at: iso(2 * dayMs),
      rejected_at: null,
      created_at: iso(2 * dayMs),
    },
    {
      user_id: 'u3',
      adjustment_type: 'reschedule_week',
      reason: 'Travel — compressed to 3 sessions',
      applied_at: null,
      rejected_at: null,
      created_at: iso(1 * dayMs),
    },
  ];

  const appstore_metrics = [];
  for (let i = 30; i >= 2; i--) {
    const wk = new Date(now - i * dayMs).getDay();
    const weekend = wk === 0 || wk === 6;
    const pv = 120 + Math.round(60 * Math.sin(i / 3)) + (weekend ? 45 : 0);
    appstore_metrics.push({
      date: iso(i * dayMs).slice(0, 10),
      page_views: pv,
      downloads: Math.round(pv * (0.22 + 0.05 * Math.sin(i / 5))),
    });
  }

  const classifier_decisions = [
    {
      id: 'cd-vis-ambiguity', user_id: 'u3', message_text: 'Can you change that?', intent: 'PLAN_ADJUST', confidence: 0.64, entities: {}, router_disposition: 'acted',
      guard_short_circuited: false, guard_name: null, ambiguity: { unresolved: true, reason: 'referent' }, created_at: iso(5 * 3600 * 1000 + 9000),
    },
    {
      user_id: 'u1', message_text: 'Create me a four day plan', intent: 'PLAN_CREATE', confidence: 0.86, entities: { days: '4' }, router_disposition: 'acted',
      guard_short_circuited: false, guard_name: null,
      ambiguity: { unresolved: false, candidates: ['PLAN_CREATE', 'PLAN_ADJUST'], resolved_by: 'confidence_gap' },
      created_at: iso(0.21 * dayMs),
    },
    {
      user_id: 'u1', message_text: 'Morning mate', intent: 'SMALL_TALK', confidence: 0.99, entities: {}, router_disposition: 'let_llm_handle',
      guard_short_circuited: false, guard_name: null, ambiguity: null, created_at: iso(0.6 * dayMs),
    },
    {
      user_id: 'u3', message_text: 'What’s my next workout?', intent: 'NEXT_WORKOUT', confidence: 1, entities: {}, router_disposition: 'acted',
      guard_short_circuited: true, guard_name: 'NEXT_WORKOUT_REGEX', ambiguity: null, created_at: iso(0.9 * dayMs),
    },
    {
      user_id: 'u3', message_text: 'I want more back work', intent: 'PLAN_ADJUST', confidence: 0.94, entities: { focus_more: 'back' }, router_disposition: 'acted',
      guard_short_circuited: false, guard_name: null, ambiguity: { unresolved: false }, created_at: iso(1.2 * dayMs),
    },
    {
      user_id: 'u1', message_text: 'Can you change that?', intent: 'PLAN_ADJUST', confidence: 0.71, entities: {}, router_disposition: 'acted',
      guard_short_circuited: false, guard_name: null, ambiguity: { unresolved: true, reason: 'referent', candidates: ['current exercise', 'active plan'] }, created_at: iso(1.8 * dayMs),
    },
    {
      user_id: 'u3', message_text: 'Need 30 mins back and bi session', intent: 'WORKOUT_SINGLE', confidence: 0.96, entities: { duration: '30' }, router_disposition: 'acted',
      guard_short_circuited: false, guard_name: null, ambiguity: { unresolved: false }, created_at: iso(2.1 * dayMs),
    },
  ];
  const skill_invocations = [
    { user_id: 'u1', skill_name: 'training_principles', outcome: 'consistent', invoked_at: iso(0.2 * dayMs) },
    { user_id: 'u1', skill_name: 'intent_classification', outcome: null, invoked_at: iso(0.21 * dayMs) },
  ];
  const telemetry = [
    {
      user_id: 'u1', event: 'plan_v2_pattern_ceiling', model: null, tokens_in: null, tokens_out: null,
      cost_usd: null, payload: { enforced: true, retries: 1, family: 'leg_press' }, created_at: iso(0.19 * dayMs),
    },
    {
      user_id: 'u1', event: 'chat_completion', model: 'gpt-4.1-mini', tokens_in: 4180, tokens_out: 512,
      cost_usd: 0.0031, payload: null, created_at: iso(0.18 * dayMs),
    },
    { user_id: 'u1', event: 'chat_stream', model: 'gpt-5.6-terra', tokens_in: 1870, tokens_out: 124, cost_usd: 0.0062, created_at: iso(0.3 * dayMs) },
    { user_id: 'u2', event: 'chat', model: 'gpt-5.6-terra', tokens_in: 2100, tokens_out: 178, cost_usd: 0.0079, created_at: iso(1.3 * dayMs) },
    { user_id: 'u3', event: 'chat_stream', model: 'gpt-5.6-sol', tokens_in: 5200, tokens_out: 402, cost_usd: 0.0341, created_at: iso(2.3 * dayMs) },
  ];

  window.DEMO_DATA = {
    appstore_metrics,
    classifier_decisions,
    skill_invocations,
    telemetry,
    llm_trace: [],
    profiles,
    user_streaks,
    messages,
    plans,
    workout_sessions,
    workout_set_logs,
    scheduled_workouts,
    trainer_outreach_log,
    plan_adjustments,
    daily_checkins: [],
  };
})();

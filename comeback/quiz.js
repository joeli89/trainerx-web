// ─── CONFIGURATION ──────────────────────────────────────────────

const SUPABASE_URL = 'https://psvtvitzzwesiohdmppj.supabase.co';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate_lead_magnet_plan`;

// ─── QUIZ DEFINITION ────────────────────────────────────────────

/**
 * Questions 1-10: Yes/No best-practices (each Yes = 1 point toward score)
 * Questions 11-15: Multi-choice qualifying questions
 */
const QUESTIONS = [
  // ── Section A: Best practices (scored) ────────────────────────
  {
    id: 'q1', section: 'scored',
    text: 'Do you currently train at least twice a week, consistently?',
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q2', section: 'scored',
    text: 'Do you follow a structured programme — not just random workouts?',
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q3', section: 'scored',
    text: 'Do you track your progress — weights, reps, or measurements?',
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q4', section: 'scored',
    text: "Does your training plan fit around your actual schedule?",
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q5', section: 'scored',
    text: "When life gets in the way — busy weeks, travel, late nights — do you have a plan for that?",
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q6', section: 'scored',
    text: 'Do you have injury-safe alternatives for exercises that aggravate old problems?',
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q7', section: 'scored',
    text: 'Do you get at least 7 hours of sleep on training nights?',
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q8', section: 'scored',
    text: 'Are you eating enough protein to support muscle recovery?',
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q9', section: 'scored',
    text: 'Does someone or something hold you accountable to your training?',
    sub: null,
    type: 'yesno',
  },
  {
    id: 'q10', section: 'scored',
    text: 'When you walk into the gym, do you know exactly what you\'re doing that session?',
    sub: null,
    type: 'yesno',
  },

  // ── Section B: Qualifying (not scored) ────────────────────────
  {
    id: 'q11', section: 'qualifying', key: 'situation',
    text: 'Which best describes where you\'re at right now?',
    sub: null,
    type: 'single',
    choices: [
      { label: "Haven't trained seriously in 6+ months", value: 'long_break' },
      { label: 'Training, but inconsistently — start-stop cycles', value: 'inconsistent' },
      { label: 'Training regularly but not seeing progress', value: 'stuck' },
      { label: 'Just got back into it in the last month', value: 'recent_return' },
    ],
  },
  {
    id: 'q12', section: 'qualifying', key: 'goal',
    text: 'What\'s the main thing you want to achieve in the next 90 days?',
    sub: null,
    type: 'single',
    choices: [
      { label: 'Lose weight and look leaner', value: 'lose_weight' },
      { label: 'Build muscle and size', value: 'build_muscle' },
      { label: 'Get stronger on the key lifts', value: 'get_stronger' },
      { label: 'Lose fat and build muscle', value: 'recomposition' },
      { label: 'Feel fitter and more energetic', value: 'improve_fitness' },
    ],
  },
  {
    id: 'q13', section: 'qualifying', key: 'obstacle',
    text: 'What\'s the thing that most gets in the way of your training?',
    sub: null,
    type: 'single',
    choices: [
      { label: 'Work and family — not enough time', value: 'time' },
      { label: 'Old injuries — I have to be careful', value: 'injury' },
      { label: "Don't know where to start after the time off", value: 'knowledge' },
      { label: 'Motivation — I start strong then fall off', value: 'motivation' },
      { label: 'All of the above, honestly', value: 'all' },
    ],
  },
  {
    id: 'q14', section: 'qualifying', key: 'equipment',
    text: 'Where do you train?',
    sub: null,
    type: 'single',
    choices: [
      { label: 'Full gym', value: 'Gym' },
      { label: 'Home with some equipment', value: 'Home' },
      { label: 'Bodyweight / outdoors only', value: 'Outdoor' },
    ],
  },
  {
    id: 'q15', section: 'qualifying', key: 'injuries',
    text: 'Any injuries or physical limitations I should know about? (optional)',
    sub: 'Skip if none. This helps us build around what you can\'t do.',
    type: 'text',
    optional: true,
  },
];

// ── Tier definitions ─────────────────────────────────────────────
const TIERS = {
  starting_line:        { label: 'The Starting Line',      range: [0, 3] },
  inconsistent_warrior: { label: 'The Inconsistent Warrior', range: [4, 6] },
  almost_there:         { label: 'Almost There',           range: [7, 9] },
  full_comeback:        { label: 'Full Comeback',           range: [10, 10] },
};

// ─── STATE ──────────────────────────────────────────────────────

const state = {
  phase: 'landing',    // landing | email | questions | loading | results
  name: '',
  email: '',
  currentQuestion: 0,  // 0-indexed into QUESTIONS
  answers: {},         // { q1: 'yes', q2: 'no', ..., q11: 'inconsistent', ... }
  result: null,        // API response
  utm: {},
};

// ─── UTM CAPTURE ────────────────────────────────────────────────

(function captureUTM() {
  const params = new URLSearchParams(window.location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(k => {
    if (params.has(k)) state.utm[k] = params.get(k);
  });
})();

// ─── PHASE TRANSITIONS ──────────────────────────────────────────

function showPhase(name) {
  document.querySelectorAll('.quiz-phase').forEach(el => el.classList.remove('active'));
  document.getElementById(`phase-${name}`).classList.add('active');
  state.phase = name;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── EMAIL PHASE ────────────────────────────────────────────────

document.getElementById('btn-start').addEventListener('click', () => showPhase('email'));

document.getElementById('btn-email-next').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const errorEl = document.getElementById('email-error');

  if (name.length < 2) {
    errorEl.textContent = 'Please enter your first name.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errorEl.textContent = 'Please enter a valid email address.';
    return;
  }

  errorEl.textContent = '';
  state.name = name;
  state.email = email;
  state.currentQuestion = 0;
  renderQuestion();
  showPhase('questions');
});

// Allow Enter key on email inputs
['input-name', 'input-email'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-email-next').click();
  });
});

// ─── QUESTION RENDERING ─────────────────────────────────────────

function renderQuestion() {
  const q = QUESTIONS[state.currentQuestion];
  const total = QUESTIONS.length;
  const num = state.currentQuestion + 1;

  // Progress bar
  const pct = Math.round((num / total) * 100);
  document.getElementById('progress-bar-q').style.width = `${pct}%`;
  document.getElementById('q-step-label').textContent = `Question ${num} of ${total}`;

  // Question text
  document.getElementById('q-text').textContent = q.text;
  document.getElementById('q-sub').textContent = q.sub || '';
  document.getElementById('q-sub').style.display = q.sub ? 'block' : 'none';

  // Back button
  document.getElementById('btn-back').style.display = state.currentQuestion === 0 ? 'none' : 'inline-block';

  // Next button state
  const nextBtn = document.getElementById('btn-next');
  nextBtn.textContent = num === total ? 'Get my plan →' : 'Next →';

  // Choices
  const choicesEl = document.getElementById('q-choices');
  choicesEl.innerHTML = '';

  const existing = state.answers[q.id];

  if (q.type === 'yesno') {
    ['Yes', 'No'].forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn' + (existing === label.toLowerCase() ? ' selected' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.answers[q.id] = label.toLowerCase();
        document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('btn-next').disabled = false;
        // Auto-advance for yes/no after brief delay
        setTimeout(() => document.getElementById('btn-next').click(), 400);
      });
      choicesEl.appendChild(btn);
    });

  } else if (q.type === 'single') {
    q.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn choice-btn--wide' + (existing === choice.value ? ' selected' : '');
      btn.textContent = choice.label;
      btn.dataset.value = choice.value;
      btn.addEventListener('click', () => {
        state.answers[q.id] = choice.value;
        document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('btn-next').disabled = false;
      });
      choicesEl.appendChild(btn);
    });

  } else if (q.type === 'text') {
    const textarea = document.createElement('textarea');
    textarea.className = 'quiz-textarea';
    textarea.placeholder = 'E.g. bad left knee — no deep squats. Or leave blank if none.';
    textarea.rows = 3;
    textarea.value = existing || '';
    textarea.addEventListener('input', () => {
      state.answers[q.id] = textarea.value;
    });
    choicesEl.appendChild(textarea);
    // Optional — always allow next
    document.getElementById('btn-next').disabled = false;
  }

  // Enable next if already answered
  if (existing !== undefined) {
    nextBtn.disabled = false;
  } else if (q.optional) {
    nextBtn.disabled = false;
  } else {
    nextBtn.disabled = true;
  }
}

// ─── NAVIGATION ─────────────────────────────────────────────────

document.getElementById('btn-next').addEventListener('click', () => {
  if (state.currentQuestion < QUESTIONS.length - 1) {
    state.currentQuestion++;
    renderQuestion();
  } else {
    submitQuiz();
  }
});

document.getElementById('btn-back').addEventListener('click', () => {
  if (state.currentQuestion > 0) {
    state.currentQuestion--;
    renderQuestion();
  }
});

// ─── SUBMIT ─────────────────────────────────────────────────────

async function submitQuiz() {
  showPhase('loading');
  startLoadingMessages();

  // Compute score: count "yes" answers on q1-q10
  let score = 0;
  for (let i = 1; i <= 10; i++) {
    if (state.answers[`q${i}`] === 'yes') score++;
  }

  // Map qualifying answers
  const situation = state.answers['q11'] || 'inconsistent';
  const goal = state.answers['q12'] || 'improve_fitness';
  const obstacle = state.answers['q13'] || 'all';
  const equipment = state.answers['q14'] || 'Gym';
  const injuries = state.answers['q15'] || '';

  // Infer fitness level from score + situation
  let fitness_level = 'Intermediate (1-3 years)';
  if (score <= 3 || situation === 'long_break') {
    fitness_level = 'Beginner (0-1 years)';
  } else if (score >= 7 && situation === 'stuck') {
    fitness_level = 'Advanced (3+ years)';
  }

  // Infer days per week from obstacle
  const days_per_week = obstacle === 'time' ? 3 : 4;

  const payload = {
    name: state.name,
    email: state.email,
    score,
    goal,
    fitness_level,
    equipment,
    injuries,
    exercises_to_avoid: '',
    days_per_week,
    situation,
    obstacle,
    ...state.utm,
  };

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    state.result = await res.json();
    renderResults(state.result);
    showPhase('results');
  } catch (err) {
    console.error('Quiz submission failed:', err);
    // Graceful fallback — show a helpful message without a plan
    renderFallbackResults(score, goal);
    showPhase('results');
  }
}

// ─── LOADING MESSAGES ────────────────────────────────────────────

function startLoadingMessages() {
  const messages = [
    'Analysing your answers...',
    'Checking your training readiness...',
    'Building your personalised plan...',
    'Almost ready...',
  ];
  let i = 0;
  const el = document.getElementById('loading-message');
  el.textContent = messages[0];
  const interval = setInterval(() => {
    i = (i + 1) % messages.length;
    el.textContent = messages[i];
  }, 1800);
  // Clean up when results phase is shown
  document.getElementById('phase-results').addEventListener('transitionend', () => clearInterval(interval), { once: true });
}

// ─── RESULTS RENDERING ───────────────────────────────────────────

function renderResults(result) {
  // Score
  document.getElementById('results-score').textContent = result.score;
  document.getElementById('results-tier').textContent = result.tier_label;
  document.getElementById('results-tier-desc').textContent = getTierDesc(result.tier);

  // Insights
  const insightsEl = document.getElementById('results-insights');
  insightsEl.innerHTML = '';
  (result.insights || []).forEach(insight => {
    const li = document.createElement('li');
    li.className = 'results-insight-item';
    li.textContent = insight;
    insightsEl.appendChild(li);
  });

  // Plan preview
  renderPlanPreview(result.plan_preview);

  // CTA
  document.getElementById('results-cta-message').textContent = result.cta_message || '';
}

function getTierDesc(tier) {
  const descs = {
    starting_line:        "You've got the drive — let's build the structure around it.",
    inconsistent_warrior: "You know more than most. The missing piece is a programme that fits your life.",
    almost_there:         "Solid foundations. You need something that adapts as you push harder.",
    full_comeback:        "You're back. Now let's keep the momentum going.",
  };
  return descs[tier] || '';
}

function renderPlanPreview(plan) {
  const container = document.getElementById('plan-days');
  container.innerHTML = '';

  if (!plan || !plan.days || plan.days.length === 0) {
    container.innerHTML = '<p class="plan-error">Plan preview unavailable. Your plan has been emailed to you.</p>';
    return;
  }

  // Show all 7 days; lock days 3-7
  const week1Days = plan.days.slice(0, 7);

  week1Days.forEach((day, index) => {
    const dayEl = document.createElement('div');
    const dayNum = index + 1;
    const isLocked = dayNum > 2;

    dayEl.className = `plan-day-card ${isLocked ? 'locked' : ''}`;

    if (day.type === 'rest_day') {
      dayEl.innerHTML = `
        <div class="plan-day-header">
          <span class="plan-day-num">Day ${dayNum}</span>
          <span class="plan-day-title">Rest Day</span>
        </div>
        ${isLocked ? '<div class="plan-day-lock-overlay"><span>🔒</span></div>' : ''}
        <p class="plan-rest-note">${isLocked ? '' : (day.notes || 'Active recovery. Prioritise sleep and nutrition.')}</p>
      `;
    } else {
      const workout = day.workout || {};
      const blocks = workout.blocks || [];
      const exerciseList = isLocked
        ? `<div class="plan-exercises-locked">Unlock to see ${blocks.reduce((n, b) => n + b.stations.length, 0)} exercises</div>`
        : blocks.map(block =>
            block.stations.map(station =>
              `<div class="plan-exercise">
                <span class="exercise-slot">${station.slot}</span>
                <span class="exercise-name">${station.exercise_name}</span>
                <span class="exercise-sets">${block.rounds}×${station.target_reps || '—'}</span>
              </div>`
            ).join('')
          ).join('');

      dayEl.innerHTML = `
        <div class="plan-day-header">
          <span class="plan-day-num">Day ${dayNum}</span>
          <span class="plan-day-title">${day.title || workout.sessionTitle || 'Training Day'}</span>
        </div>
        ${isLocked ? '<div class="plan-day-lock-overlay"><span>🔒 Unlock in the app</span></div>' : ''}
        <div class="plan-exercises">${exerciseList}</div>
      `;
    }

    container.appendChild(dayEl);
  });

  // CTA overlay on the locked section
  const ctaOverlay = document.createElement('div');
  ctaOverlay.className = 'plan-unlock-cta';
  ctaOverlay.innerHTML = `
    <p>Days 3–7 are waiting. Download trainerX to unlock your full plan — and get it adapted every week.</p>
    <a href="https://apps.apple.com/gb/app/trainerx-ai-personal-trainer/id6755206111"
       class="btn-primary" target="_blank" rel="noopener">
      Unlock on the App Store →
    </a>
  `;
  container.appendChild(ctaOverlay);
}

function renderFallbackResults(score, goal) {
  // Called when the API fails — show score only, no plan
  const tier = scoreToTier(score);
  state.result = {
    score,
    tier,
    tier_label: TIERS[tier].label,
    insights: [
      "We've hit a snag generating your plan — we've emailed it to you instead.",
      "Your Comeback Score is ready below.",
      "Download the app to get your full personalised plan instantly.",
    ],
    plan_preview: null,
    cta_message: "Your plan will be waiting for you in the app.",
  };
  renderResults(state.result);
}

function scoreToTier(score) {
  if (score <= 3) return 'starting_line';
  if (score <= 6) return 'inconsistent_warrior';
  if (score <= 9) return 'almost_there';
  return 'full_comeback';
}

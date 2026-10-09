/* Macro calculator — Mifflin-St Jeor + activity factor + goal + per-kg protein.
   Runs entirely in the browser; nothing is sent or stored. */
(() => {
  const form = document.getElementById('calc-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const f = (n) => form.elements[n];

  const PROTEIN_G_PER_KG = { cut: 2.0, maintain: 1.6, bulk: 1.8 };
  const FAT_SHARE        = { cut: 0.25, maintain: 0.30, bulk: 0.30 };
  const GOAL_ADJUST      = { cut: 0.85, maintain: 1.00, bulk: 1.10 };
  const SUB   = { cut: 'to lose about 1 lb a week', maintain: 'to maintain your weight', bulk: 'to build muscle' };
  const HINTS = { '1.2': 'Little exercise, mostly sitting.', '1.375': 'Desk job plus three gym sessions a week.',
                  '1.55': 'Training most days, or an active job.', '1.725': 'Hard training six days a week, or a physical job.' };

  const val = (n) => parseFloat(f(n).value);
  const checked = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value;

  function read() {
    const units = checked('units');
    let kg, cm;
    if (units === 'metric') { kg = val('weight'); cm = val('cm'); }
    else { kg = val('weight') * 0.45359237; cm = (val('ft') * 12 + (val('in') || 0)) * 2.54; }
    return { units, kg, cm, age: val('age'), sex: checked('sex'), act: parseFloat(checked('activity')), goal: checked('goal') };
  }

  function compute({ kg, cm, age, sex, act, goal }) {
    if (![kg, cm, age, act].every(Number.isFinite) || kg <= 0 || cm <= 0 || age <= 0) return null;
    const bmr   = 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
    const tdee  = bmr * act;
    const kcal  = Math.round(tdee * GOAL_ADJUST[goal] / 10) * 10;
    let protein = Math.round(kg * PROTEIN_G_PER_KG[goal]);
    let fat     = Math.round(kcal * FAT_SHARE[goal] / 9);
    let carbs   = Math.round((kcal - protein * 4 - fat * 9) / 4);
    if (carbs < 50) { carbs = 50; fat = Math.max(40, Math.round((kcal - protein * 4 - carbs * 4) / 9)); }  // very low calories: keep a carb floor
    return { kcal, protein, carbs, fat };
  }

  function render() {
    const inp = read(); const r = compute(inp);
    $('activity-hint').textContent = HINTS[String(inp.act)] || '';
    if (!r) { ['r-kcal','r-protein','r-carbs','r-fat'].forEach(id => $(id).textContent = '—'); $('r-note').textContent = 'Fill in your details above.'; return; }
    const pct = (g, per) => Math.round(g * per / (r.protein * 4 + r.carbs * 4 + r.fat * 9) * 100);
    const pp = pct(r.protein, 4), pc = pct(r.carbs, 4), pf = 100 - pp - pc;
    $('r-kcal').textContent = r.kcal.toLocaleString();
    $('r-sub').textContent = SUB[inp.goal];
    $('r-protein').textContent = r.protein; $('r-carbs').textContent = r.carbs; $('r-fat').textContent = r.fat;
    $('p-protein').textContent = pp + '%'; $('p-carbs').textContent = pc + '%'; $('p-fat').textContent = pf + '%';
    $('b-protein').style.width = pp + '%'; $('b-carbs').style.width = pc + '%'; $('b-fat').style.width = pf + '%';
    const gkg = PROTEIN_G_PER_KG[inp.goal];
    $('r-note').textContent = `Protein at ${gkg} g per kg of bodyweight (${(gkg / 2.2046).toFixed(2)} g per lb). Treat these as a two-week starting point and adjust from what the scale and your training tell you.`;
  }

  function swapUnits() {
    const metric = checked('units') === 'metric';
    const w = f('weight');
    const cur = parseFloat(w.value);
    if (Number.isFinite(cur)) w.value = metric ? (cur * 0.45359237).toFixed(1).replace(/\.0$/, '') : Math.round(cur / 0.45359237);
    document.querySelector('[data-unit="weight"]').textContent = metric ? 'kg' : 'lb';
    const imp = document.querySelector('[data-units="imperial"]'), met = document.querySelector('[data-units="metric"]');
    if (metric) { const cm = Math.round((val('ft') * 12 + (val('in') || 0)) * 2.54); if (Number.isFinite(cm)) f('cm').value = cm; }
    else { const tot = val('cm') / 2.54; if (Number.isFinite(tot)) { f('ft').value = Math.floor(tot / 12); f('in').value = Math.round(tot % 12); } }
    imp.hidden = metric; met.hidden = !metric;
    render();
  }

  form.addEventListener('input', render);
  form.querySelectorAll('input[name="units"]').forEach(el => el.addEventListener('change', swapUnits));
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
})();

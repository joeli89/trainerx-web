/* Macro calculator — Mifflin-St Jeor + activity factor + goal + per-kg protein.
   Runs entirely in the browser; nothing is sent or stored. Inputs mirror into the
   URL so the address is a share link; "Share" renders a PNG card on a canvas. */
(() => {
  const form = document.getElementById('calc-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const f = (n) => form.elements[n];

  const PROTEIN_G_PER_KG = { cut: 2.0, maintain: 1.6, bulk: 1.8 };
  const FAT_SHARE        = { cut: 0.25, maintain: 0.30, bulk: 0.30 };
  const GOAL_ADJUST      = { cut: 0.85, maintain: 1.00, bulk: 1.10 };
  const SUB   = { cut: 'to lose about 1 lb a week', maintain: 'to maintain your weight', bulk: 'to build muscle' };
  const GOAL  = { cut: 'Lose fat', maintain: 'Maintain', bulk: 'Build muscle' };
  const HINTS = { '1.2': 'Little exercise, mostly sitting.', '1.375': 'Desk job plus three gym sessions a week.',
                  '1.55': 'Training most days, or an active job.', '1.725': 'Hard training six days a week, or a physical job.' };
  const PAGE = 'https://trainerx.ai/macro-calculator/';

  const val = (n) => parseFloat(f(n).value);
  const checked = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value;
  const check = (n, v) => { const el = form.querySelector(`input[name="${n}"][value="${v}"]`); if (el) el.checked = true; };

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
    const kcal  = Math.round(bmr * act * GOAL_ADJUST[goal] / 10) * 10;
    let protein = Math.round(kg * PROTEIN_G_PER_KG[goal]);
    let fat     = Math.round(kcal * FAT_SHARE[goal] / 9);
    let carbs   = Math.round((kcal - protein * 4 - fat * 9) / 4);
    if (carbs < 50) { carbs = 50; fat = Math.max(40, Math.round((kcal - protein * 4 - carbs * 4) / 9)); }  // very low calories: keep a carb floor
    const total = protein * 4 + carbs * 4 + fat * 9;
    const pp = Math.round(protein * 4 / total * 100), pc = Math.round(carbs * 4 / total * 100);
    return { kcal, protein, carbs, fat, pp, pc, pf: 100 - pp - pc };
  }

  let last = null;  // last good result, used by share

  function render() {
    const inp = read(); const r = compute(inp);
    $('activity-hint').textContent = HINTS[String(inp.act)] || '';
    $('calc-share').hidden = !r;
    if (!r) { last = null; ['r-kcal','r-protein','r-carbs','r-fat'].forEach(id => $(id).textContent = '—'); $('r-note').textContent = 'Fill in your details above.'; return; }
    last = { ...r, goal: inp.goal };
    $('r-kcal').textContent = r.kcal.toLocaleString();
    $('r-sub').textContent = SUB[inp.goal];
    $('r-protein').textContent = r.protein; $('r-carbs').textContent = r.carbs; $('r-fat').textContent = r.fat;
    $('p-protein').textContent = r.pp + '%'; $('p-carbs').textContent = r.pc + '%'; $('p-fat').textContent = r.pf + '%';
    $('b-protein').style.width = r.pp + '%'; $('b-carbs').style.width = r.pc + '%'; $('b-fat').style.width = r.pf + '%';
    const gkg = PROTEIN_G_PER_KG[inp.goal];
    $('r-note').textContent = `Protein at ${gkg} g per kg of bodyweight (${(gkg / 2.2046).toFixed(2)} g per lb). Treat these as a two-week starting point and adjust from what the scale and your training tell you.`;
    syncUrl(inp);
  }

  /* ── URL ⇄ form ───────────────────────────────────────────────── */
  const FIELDS = ['units', 'sex', 'age', 'weight', 'ft', 'in', 'cm', 'activity', 'goal'];
  function syncUrl(inp) {
    const q = new URLSearchParams();
    q.set('u', inp.units === 'metric' ? 'kg' : 'lb'); q.set('s', inp.sex[0]); q.set('a', f('age').value); q.set('w', f('weight').value);
    if (inp.units === 'metric') q.set('h', f('cm').value); else { q.set('ft', f('ft').value); q.set('in', f('in').value || 0); }
    q.set('act', String(inp.act)); q.set('g', inp.goal);
    history.replaceState(null, '', '?' + q.toString());
  }
  function loadUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has('w')) return false;
    check('units', q.get('u') === 'kg' ? 'metric' : 'imperial');
    check('sex', q.get('s') === 'f' ? 'female' : 'male');
    if (q.has('a')) f('age').value = q.get('a');
    f('weight').value = q.get('w');
    if (q.has('h')) f('cm').value = q.get('h');
    if (q.has('ft')) { f('ft').value = q.get('ft'); f('in').value = q.get('in') || 0; }
    if (q.has('act')) check('activity', q.get('act'));
    if (q.has('g')) check('goal', q.get('g'));
    applyUnits(false);
    return true;
  }

  /* ── units toggle ─────────────────────────────────────────────── */
  function applyUnits(convert) {
    const metric = checked('units') === 'metric';
    const w = f('weight');
    if (convert) {
      const cur = parseFloat(w.value);
      if (Number.isFinite(cur)) w.value = metric ? (cur * 0.45359237).toFixed(1).replace(/\.0$/, '') : Math.round(cur / 0.45359237);
      if (metric) { const cm = Math.round((val('ft') * 12 + (val('in') || 0)) * 2.54); if (Number.isFinite(cm)) f('cm').value = cm; }
      else { const tot = val('cm') / 2.54; if (Number.isFinite(tot)) { f('ft').value = Math.floor(tot / 12); f('in').value = Math.round(tot % 12); } }
    }
    document.querySelector('[data-unit="weight"]').textContent = metric ? 'kg' : 'lb';
    document.querySelector('[data-units="imperial"]').hidden = metric;
    document.querySelector('[data-units="metric"]').hidden = !metric;
    render();
  }

  /* ── share ────────────────────────────────────────────────────── */
  let toastTimer;
  function toast(msg) {
    const t = $('calc-toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  const shareUrl = () => PAGE + location.search;
  const shareText = (r) => `My daily macros: ${r.kcal.toLocaleString()} kcal · ${r.protein}g protein · ${r.carbs}g carbs · ${r.fat}g fat (${GOAL[r.goal].toLowerCase()}). Free calculator:`;

  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl()); toast('Link copied'); }
    catch { prompt('Copy this link', shareUrl()); }
  }

  const logo = new Image(); logo.src = '/images/logo.svg';
  async function renderCard(r) {
    await Promise.all([document.fonts.load('700 120px Inter'), document.fonts.load('600 48px Inter'), document.fonts.load('400 36px Inter'),
                       logo.complete ? null : new Promise(res => { logo.onload = res; logo.onerror = res; })]);
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.fillStyle = '#fff';
    // brand
    if (logo.naturalWidth) x.drawImage(logo, W / 2 - 36, 150, 72, 72);
    x.font = '500 30px Inter'; x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillText('MY DAILY MACROS', W / 2, 290);
    // calories
    x.font = '700 220px Inter'; x.fillStyle = '#fff'; x.letterSpacing = '-10px'; x.fillText(r.kcal.toLocaleString(), W / 2, 540); x.letterSpacing = '0px';
    x.font = '400 40px Inter'; x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillText('calories a day', W / 2, 610);
    x.font = '500 40px Inter'; x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText(SUB[r.goal], W / 2, 665);
    // macros
    const cols = [['Protein', r.protein, r.pp], ['Carbs', r.carbs, r.pc], ['Fat', r.fat, r.pf]];
    const bw = 296, gap = 24, x0 = (W - (bw * 3 + gap * 2)) / 2, y0 = 760, bh = 250;
    cols.forEach(([lbl, g, p], i) => {
      const bx = x0 + i * (bw + gap);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.beginPath(); x.roundRect(bx, y0, bw, bh, 36); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#fff'; x.font = '700 84px Inter'; x.letterSpacing = '-3px'; x.fillText(g + 'g', bx + bw / 2, y0 + 118); x.letterSpacing = '0px';
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.font = '500 34px Inter'; x.fillText(lbl, bx + bw / 2, y0 + 172);
      x.fillStyle = 'rgba(255,255,255,0.45)'; x.font = '500 28px Inter'; x.fillText(p + '%', bx + bw / 2, y0 + 216);
    });
    // split bar
    const by = 1070, bwid = bw * 3 + gap * 2, bhgt = 14;
    x.fillStyle = 'rgba(255,255,255,0.1)'; x.beginPath(); x.roundRect(x0, by, bwid, bhgt, 7); x.fill();
    x.save(); x.beginPath(); x.roundRect(x0, by, bwid, bhgt, 7); x.clip();
    let cx = x0; [[r.pp, '#fff'], [r.pc, 'rgba(255,255,255,0.55)'], [r.pf, 'rgba(255,255,255,0.28)']].forEach(([p, col]) => { const w = bwid * p / 100; x.fillStyle = col; x.fillRect(cx, by, w, bhgt); cx += w; });
    x.restore();
    // footer
    x.font = '500 32px Inter'; x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillText('Free calculator  ·  trainerx.ai/macro-calculator', W / 2, 1230);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }

  async function share() {
    if (!last) return;
    const btn = $('share-btn'); btn.disabled = true;
    try {
      const blob = await renderCard(last);
      const file = new File([blob], 'my-macros.png', { type: 'image/png' });
      const data = { title: 'My daily macros', text: shareText(last), url: shareUrl() };
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ ...data, files: [file] }); }
      else if (navigator.share) { await navigator.share(data); }
      else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-macros.png'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        await navigator.clipboard?.writeText(shareUrl()).catch(() => {});
        toast('Image saved · link copied');
      }
    } catch (e) { if (e?.name !== 'AbortError') toast('Could not share'); }
    finally { btn.disabled = false; }
  }

  form.addEventListener('input', (e) => { if (e.target.name !== 'units') render(); });
  form.querySelectorAll('input[name="units"]').forEach(el => el.addEventListener('change', () => applyUnits(true)));
  form.addEventListener('submit', (e) => e.preventDefault());
  $('share-btn').addEventListener('click', share);
  $('copy-btn').addEventListener('click', copyLink);
  if (!loadUrl()) render();
})();

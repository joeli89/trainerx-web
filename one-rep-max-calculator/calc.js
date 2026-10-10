/* One rep max calculator — Epley and Brzycki, averaged, with a training-load table.
   Runs entirely in the browser; nothing is sent or stored. Inputs mirror into the
   URL so the address is a share link. */
(() => {
  const form = document.getElementById('calc-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const f = (n) => form.elements[n];
  const S = window.txShare;
  const PAGE = 'https://trainerx.ai/one-rep-max-calculator/';
  const LIFTS = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift', ohp: 'Overhead press', other: 'Lift' };
  /* Rep-max percentages: the common chart (NSCA-style), rounded. */
  const TABLE = [[100, 1], [95, 2], [93, 3], [90, 4], [87, 5], [85, 6], [83, 7], [80, 8], [77, 9], [75, 10], [70, 12], [65, 15]];

  const checked = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value;
  const check = (n, v) => { const el = form.querySelector(`input[name="${n}"][value="${v}"]`); if (el) el.checked = true; };
  const unit = () => checked('units') === 'metric' ? 'kg' : 'lb';
  const step = () => unit() === 'kg' ? 2.5 : 5;                 // plate-loadable rounding
  const roundLoad = (w) => Math.round(w / step()) * step();
  const fmt = (w) => (Number.isInteger(w) ? w : w.toFixed(1)).toLocaleString();

  function read() {
    return { w: parseFloat(f('weight').value), r: parseInt(f('reps').value, 10), lift: checked('lift') || 'other' };
  }
  function compute({ w, r }) {
    if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r < 1 || r > 15) return null;
    const epley   = r === 1 ? w : w * (1 + r / 30);
    const brzycki = r === 1 ? w : w * 36 / (37 - r);
    const lombardi = w * Math.pow(r, 0.10);
    const oconner  = w * (1 + 0.025 * r);
    const est = (epley + brzycki) / 2;
    return { est, epley, brzycki, lombardi, oconner, onerm: roundLoad(est) };
  }

  let last = null;
  function render() {
    const inp = read(); const r = compute(inp);
    $('calc-share').hidden = !r; $('table-wrap').hidden = !r;
    $('reps-hint').textContent = inp.r > 10 ? 'Above 10 reps the estimate gets loose — use a heavier set if you can.' : inp.r === 1 ? 'That is your 1RM — the table below still applies.' : '';
    if (!r) { last = null; $('r-1rm').textContent = '—'; $('r-note').textContent = 'Enter a weight and the reps you did with it.'; return; }
    last = { ...r, ...inp, unit: unit() };
    $('r-1rm').textContent = fmt(r.onerm);
    $('r-unit').textContent = unit();
    $('r-sub').textContent = `${LIFTS[inp.lift]} · from ${fmt(inp.w)} ${unit()} × ${inp.r}`;
    $('f-epley').textContent = fmt(roundLoad(r.epley)); $('f-brzycki').textContent = fmt(roundLoad(r.brzycki));
    $('f-lombardi').textContent = fmt(roundLoad(r.lombardi)); $('f-oconner').textContent = fmt(roundLoad(r.oconner));
    document.querySelectorAll('.f-unit').forEach(el => el.textContent = unit());
    $('r-note').textContent = inp.r <= 5
      ? 'Low-rep sets give the most reliable estimate. Treat this as a planning number, not a target to attempt cold.'
      : 'Estimates from higher-rep sets drift by 5–10%. Confirm with a heavy triple before you plan a max attempt.';
    const rows = TABLE.map(([pct, reps]) => `<tr><td>${pct}%</td><td>${fmt(roundLoad(r.est * pct / 100))} <span class="calc-td-unit">${unit()}</span></td><td>${reps}</td></tr>`).join('');
    $('table-body').innerHTML = rows;
    syncUrl(inp);
  }

  function syncUrl(inp) {
    const q = new URLSearchParams();
    q.set('u', unit()); q.set('w', f('weight').value); q.set('r', f('reps').value); q.set('lift', inp.lift);
    history.replaceState(null, '', '?' + q.toString());
  }
  function loadUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has('w')) return false;
    check('units', q.get('u') === 'kg' ? 'metric' : 'imperial');
    f('weight').value = q.get('w'); if (q.has('r')) f('reps').value = q.get('r'); if (q.has('lift')) check('lift', q.get('lift'));
    applyUnits(false); return true;
  }
  function applyUnits(convert) {
    const metric = checked('units') === 'metric';
    const w = f('weight'); const cur = parseFloat(w.value);
    if (convert && Number.isFinite(cur)) w.value = metric ? roundLoadIn(cur * 0.45359237, 2.5) : roundLoadIn(cur / 0.45359237, 5);
    w.step = metric ? 0.5 : 1;
    document.querySelector('[data-unit="weight"]').textContent = metric ? 'kg' : 'lb';
    render();
  }
  const roundLoadIn = (v, s) => Math.round(v / s) * s;

  /* ── share card ───────────────────────────────────────────────── */
  async function renderCard() {
    const r = last, W = 1080, H = 1350;
    const { x, toBlob } = await S.cardContext(W, H);
    S.cardText(x, `${LIFTS[r.lift].toUpperCase()} · ONE REP MAX`, 290, { size: 30, weight: 500, color: 'rgba(255,255,255,0.55)' }, W / 2);
    S.cardText(x, fmt(r.onerm), 540, { size: 220, weight: 700, spacing: -10 }, W / 2);
    S.cardText(x, r.unit + ' estimated 1RM', 610, { size: 40, color: 'rgba(255,255,255,0.6)' }, W / 2);
    S.cardText(x, `from ${fmt(r.w)} ${r.unit} × ${r.r} reps`, 665, { size: 40, weight: 500, color: 'rgba(255,255,255,0.85)' }, W / 2);
    const cols = [[90, 4], [80, 8], [70, 12]];
    const bw = 296, gap = 24, x0 = (W - (bw * 3 + gap * 2)) / 2, y0 = 760, bh = 250;
    cols.forEach(([pct, reps], i) => {
      const bx = x0 + i * (bw + gap);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.beginPath(); x.roundRect(bx, y0, bw, bh, 36); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 2; x.stroke();
      S.cardText(x, fmt(roundLoad(r.est * pct / 100)), y0 + 118, { size: 84, weight: 700, spacing: -3 }, bx + bw / 2);
      S.cardText(x, `${pct}%`, y0 + 172, { size: 34, weight: 500, color: 'rgba(255,255,255,0.7)' }, bx + bw / 2);
      S.cardText(x, `~${reps} reps`, y0 + 216, { size: 28, weight: 500, color: 'rgba(255,255,255,0.45)' }, bx + bw / 2);
    });
    S.cardFooter(x, W, 'Free calculator  ·  trainerx.ai/one-rep-max-calculator');
    return toBlob();
  }
  const shareUrl = () => PAGE + location.search;

  form.addEventListener('input', (e) => { if (e.target.name !== 'units') render(); });
  form.querySelectorAll('input[name="units"]').forEach(el => el.addEventListener('change', () => applyUnits(true)));
  form.addEventListener('submit', (e) => e.preventDefault());
  $('share-btn').addEventListener('click', () => last && S.share({
    button: $('share-btn'), renderCard, filename: 'my-one-rep-max.png', title: 'My one rep max',
    text: `${LIFTS[last.lift]} 1RM: ${fmt(last.onerm)} ${last.unit} (from ${fmt(last.w)} ${last.unit} × ${last.r}). Free calculator:`, url: shareUrl() }));
  $('copy-btn').addEventListener('click', () => S.copyLink(shareUrl()));
  if (!loadUrl()) render();
})();

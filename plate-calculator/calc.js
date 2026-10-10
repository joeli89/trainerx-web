/* Barbell plate calculator — greedy load from the plates you have, drawn as a bar.
   Runs entirely in the browser; nothing is sent or stored. Inputs mirror into the URL. */
(() => {
  const form = document.getElementById('calc-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const f = (n) => form.elements[n];
  const S = window.txShare;
  const PAGE = 'https://trainerx.ai/plate-calculator/';

  /* Plate sets: value, colour, relative diameter and thickness (competition-ish). */
  const PLATES = {
    kg: [[25,'#d6232b',1,1.2],[20,'#1f55d6',1,1],[15,'#f2c21b',.89,.9],[10,'#1fa352',.72,.8],[5,'#f3f3f3',.51,.7],[2.5,'#d6232b',.42,.55],[1.25,'#b9b9b9',.36,.45],[0.5,'#b9b9b9',.3,.35]],
    lb: [[55,'#d6232b',1,1.2],[45,'#1f55d6',1,1],[35,'#f2c21b',.89,.9],[25,'#1fa352',.72,.8],[10,'#f3f3f3',.51,.7],[5,'#2b2b2b',.42,.55],[2.5,'#b9b9b9',.36,.45],[1.25,'#b9b9b9',.3,.35]],
  };
  const DEFAULT_ON = { kg: [25,20,15,10,5,2.5,1.25], lb: [45,35,25,10,5,2.5] };
  const BARS = { kg: [[20,'20 kg'],[15,'15 kg'],[10,'10 kg']], lb: [[45,'45 lb'],[35,'35 lb'],[15,'15 lb']] };

  const checked = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value;
  const check = (n, v) => { const el = form.querySelector(`input[name="${n}"][value="${v}"]`); if (el) el.checked = true; };
  const unit = () => checked('units') === 'metric' ? 'kg' : 'lb';
  const fmt = (w) => Number.isInteger(w) ? String(w) : String(+w.toFixed(2));

  /* Build the plate chips and bar options for the current unit */
  function buildOptions(selected) {
    const u = unit();
    $('plate-chips').innerHTML = PLATES[u].map(([v, col]) =>
      `<label class="chip"><input type="checkbox" name="plate" value="${v}"${(selected || DEFAULT_ON[u]).includes(v) ? ' checked' : ''}><span><i style="background:${col}"></i>${fmt(v)}</span></label>`).join('');
    const bar = f('bar'); const cur = bar.value;
    bar.innerHTML = BARS[u].map(([v, l]) => `<option value="${v}">${l} bar</option>`).join('') + '<option value="custom">Other…</option>';
    bar.value = BARS[u].some(([v]) => String(v) === cur) ? cur : String(BARS[u][0][0]);
    document.querySelectorAll('[data-unit]').forEach(el => el.textContent = u);
  }
  function barWeight() {
    const v = f('bar').value;
    const w = v === 'custom' ? parseFloat(f('bar-custom').value) : parseFloat(v);
    $('bar-custom-wrap').hidden = v !== 'custom';
    return w;
  }

  function read() {
    const plates = [...form.querySelectorAll('input[name="plate"]:checked')].map(el => parseFloat(el.value)).sort((a, b) => b - a);
    return { target: parseFloat(f('weight').value), bar: barWeight(), plates, u: unit() };
  }
  function compute({ target, bar, plates }) {
    if (!Number.isFinite(target) || !Number.isFinite(bar) || target <= 0 || bar <= 0 || !plates.length) return null;
    if (target < bar) return { short: true, bar };
    let side = (target - bar) / 2, load = [];
    for (const p of plates) { let n = Math.floor(side / p + 1e-9); if (n > 0) { load.push([p, n]); side -= n * p; } }
    const loaded = bar + 2 * load.reduce((s, [p, n]) => s + p * n, 0);
    return { load, loaded, remainder: +(target - loaded).toFixed(3), perSide: (loaded - bar) / 2, bar, count: load.reduce((s, [, n]) => s + n, 0) };
  }

  /* ── bar geometry (shared by SVG and canvas) ─────────────────── */
  function layout(r, W, H) {
    const u = unit(), meta = Object.fromEntries(PLATES[u].map(([v, c, d, t]) => [v, { c, d, t }]));
    const cy = H / 2, barH = H * 0.055, sleeveH = H * 0.095, maxD = H * 0.86, plateW = W * 0.028;
    const collarW = W * 0.018, sleeveLen = W * 0.36, inner = W * 0.28;   // inner = half of the shaft shown
    const cx = W / 2;
    const items = [];                                                      // {x,y,w,h,c,label}
    const plates = r?.load ? r.load.flatMap(([p, n]) => Array(n).fill(p)) : [];
    for (const side of [-1, 1]) {
      let x = side === 1 ? cx + inner + collarW : cx - inner - collarW;
      for (const p of plates) {
        const { c, d, t } = meta[p]; const w = plateW * t, h = maxD * d;
        const px = side === 1 ? x : x - w;
        items.push({ x: px, y: cy - h / 2, w, h, c, label: fmt(p) });
        x += side * (w + 2);
      }
    }
    return { cy, barH, sleeveH, cx, inner, collarW, sleeveLen, items };
  }
  function toSvg(r) {
    const W = 1000, H = 320, L = layout(r, W, H);
    const { cy, barH, sleeveH, cx, inner, collarW, sleeveLen, items } = L;
    const shaft = `<rect x="${cx - inner}" y="${cy - barH / 2}" width="${inner * 2}" height="${barH}" rx="${barH / 2}" fill="#9a9a9a"/>`;
    const sleeves = [-1, 1].map(s => `<rect x="${s === 1 ? cx + inner + collarW : cx - inner - collarW - sleeveLen}" y="${cy - sleeveH / 2}" width="${sleeveLen}" height="${sleeveH}" rx="${sleeveH / 2}" fill="#bdbdbd"/>`).join('');
    const collars = [-1, 1].map(s => `<rect x="${s === 1 ? cx + inner : cx - inner - collarW}" y="${cy - sleeveH * 1.3 / 2}" width="${collarW}" height="${sleeveH * 1.3}" rx="3" fill="#6f6f6f"/>`).join('');
    const plates = items.map(i => `<g><rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${Math.min(6, i.w / 2)}" fill="${i.c}" stroke="rgba(0,0,0,0.25)"/>${i.h > 90 ? `<text x="${i.x + i.w / 2}" y="${i.y + i.h - 14}" text-anchor="middle" font-size="12" font-weight="600" font-family="JetBrains Mono, monospace" fill="${i.c === '#f3f3f3' || i.c === '#f2c21b' || i.c === '#b9b9b9' ? '#111' : '#fff'}" transform="rotate(-90 ${i.x + i.w / 2} ${i.y + i.h - 14})">${i.label}</text>` : ''}</g>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Loaded barbell">${sleeves}${shaft}${collars}${plates}</svg>`;
  }
  function drawBar(x, r, X, Y, W, H) {
    const L = layout(r, W, H); const { cy, barH, sleeveH, cx, inner, collarW, sleeveLen, items } = L;
    const rr = (px, py, w, h, rad, col) => { x.fillStyle = col; x.beginPath(); x.roundRect(X + px, Y + py, w, h, rad); x.fill(); };
    [-1, 1].forEach(s => rr(s === 1 ? cx + inner + collarW : cx - inner - collarW - sleeveLen, cy - sleeveH / 2, sleeveLen, sleeveH, sleeveH / 2, '#bdbdbd'));
    rr(cx - inner, cy - barH / 2, inner * 2, barH, barH / 2, '#9a9a9a');
    [-1, 1].forEach(s => rr(s === 1 ? cx + inner : cx - inner - collarW, cy - sleeveH * 0.65, collarW, sleeveH * 1.3, 3, '#6f6f6f'));
    items.forEach(i => { rr(i.x, i.y, i.w, i.h, Math.min(6, i.w / 2), i.c); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1.5; x.stroke(); });
  }

  /* ── render ───────────────────────────────────────────────────── */
  let last = null;
  function render() {
    const inp = read(); const r = compute(inp); const u = inp.u;
    $('calc-share').hidden = !r || r.short;
    if (!r) { last = null; $('r-total').textContent = '—'; $('r-sub').textContent = ''; $('bar-wrap').innerHTML = toSvg(null); $('plate-list').innerHTML = ''; $('r-note').textContent = 'Enter a target weight and pick the plates you have.'; syncUrl(inp); return; }
    if (r.short) { last = null; $('r-total').textContent = fmt(inp.bar); $('r-sub').textContent = `just the bar — ${fmt(inp.target)} ${u} is lighter than the ${fmt(inp.bar)} ${u} bar`; $('bar-wrap').innerHTML = toSvg(null); $('plate-list').innerHTML = ''; $('r-note').textContent = ''; syncUrl(inp); return; }
    last = { ...r, target: inp.target, u };
    $('r-total').textContent = fmt(r.loaded);
    $('r-unit').textContent = u;
    $('r-sub').textContent = r.remainder === 0 ? `${fmt(r.perSide)} ${u} per side on a ${fmt(r.bar)} ${u} bar` : `closest you can load — ${fmt(r.remainder)} ${u} short of ${fmt(inp.target)} ${u}`;
    $('bar-wrap').innerHTML = toSvg(r);
    $('plate-list').innerHTML = r.load.length ? r.load.map(([p, n]) => `<li><b>${n} ×</b> ${fmt(p)} ${u}</li>`).join('') : '<li>No plates — just the bar.</li>';
    $('per-side').textContent = r.load.length ? `Per side, loaded from the inside out:` : '';
    $('r-note').textContent = r.remainder === 0 ? `${r.count} plate${r.count === 1 ? '' : 's'} each side. Put the biggest on first, then clip the collars.` : `Add a ${fmt(r.remainder / 2)} ${u} plate per side to hit it exactly, or round to ${fmt(r.loaded)} ${u}.`;
    syncUrl(inp);
  }
  function syncUrl(inp) {
    const q = new URLSearchParams();
    q.set('u', inp.u); q.set('w', f('weight').value); q.set('bar', f('bar').value === 'custom' ? f('bar-custom').value : f('bar').value); q.set('plates', inp.plates.join(','));
    history.replaceState(null, '', '?' + q.toString());
  }
  function loadUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.has('w')) return false;
    check('units', q.get('u') === 'kg' ? 'metric' : 'imperial');
    const plates = q.has('plates') ? q.get('plates').split(',').map(parseFloat).filter(Number.isFinite) : null;
    buildOptions(plates);
    f('weight').value = q.get('w');
    if (q.has('bar')) { const b = q.get('bar'); if ([...f('bar').options].some(o => o.value === b)) f('bar').value = b; else { f('bar').value = 'custom'; f('bar-custom').value = b; } }
    render(); return true;
  }
  function applyUnits() {
    const metric = checked('units') === 'metric';
    const w = f('weight'); const cur = parseFloat(w.value);
    if (Number.isFinite(cur)) w.value = metric ? Math.round(cur * 0.45359237 / 2.5) * 2.5 : Math.round(cur / 0.45359237 / 5) * 5;
    w.step = metric ? 0.5 : 1;
    buildOptions(null); render();
  }

  /* ── share card ───────────────────────────────────────────────── */
  async function renderCard() {
    const r = last, W = 1080, H = 1350;
    const { x, toBlob } = await S.cardContext(W, H);
    S.cardText(x, 'LOAD THE BAR', 290, { size: 30, weight: 500, color: 'rgba(255,255,255,0.55)' }, W / 2);
    S.cardText(x, fmt(r.loaded), 540, { size: 220, weight: 700, spacing: -10 }, W / 2);
    S.cardText(x, r.u + (r.remainder === 0 ? '' : ` · closest to ${fmt(r.target)}`), 610, { size: 40, color: 'rgba(255,255,255,0.6)' }, W / 2);
    S.cardText(x, `${fmt(r.perSide)} ${r.u} per side on a ${fmt(r.bar)} ${r.u} bar`, 665, { size: 40, weight: 500, color: 'rgba(255,255,255,0.85)' }, W / 2);
    drawBar(x, r, 40, 720, 1000, 340);
    const perSide = r.load.map(([p, n]) => `${n}×${fmt(p)}`).join('   ');
    S.cardText(x, perSide || 'just the bar', 1130, { size: 36, weight: 600, color: 'rgba(255,255,255,0.85)' }, W / 2);
    S.cardFooter(x, W, 'Free calculator  ·  trainerx.ai/plate-calculator');
    return toBlob();
  }
  const shareUrl = () => PAGE + location.search;

  form.addEventListener('input', (e) => { if (e.target.name !== 'units') render(); });
  form.addEventListener('change', (e) => { if (e.target.name === 'bar') render(); });
  form.querySelectorAll('input[name="units"]').forEach(el => el.addEventListener('change', applyUnits));
  form.addEventListener('submit', (e) => e.preventDefault());
  $('share-btn').addEventListener('click', () => last && S.share({
    button: $('share-btn'), renderCard, filename: 'load-the-bar.png', title: 'Load the bar',
    text: `${fmt(last.loaded)} ${last.u}: ${last.load.map(([p, n]) => `${n}×${fmt(p)}`).join(', ')} per side on a ${fmt(last.bar)} ${last.u} bar. Free plate calculator:`, url: shareUrl() }));
  $('copy-btn').addEventListener('click', () => S.copyLink(shareUrl()));
  if (!loadUrl()) { buildOptions(null); render(); }
})();

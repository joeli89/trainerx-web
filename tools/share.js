/* Shared "share this result" plumbing for trainerX tools.
   Each tool supplies its own card renderer (returns a PNG Blob) and share text. */
window.txShare = (() => {
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('calc-toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); }
    catch { prompt('Copy this link', url); }
  }
  async function share({ button, renderCard, filename, title, text, url }) {
    if (button) button.disabled = true;
    try {
      const blob = await renderCard();
      const file = new File([blob], filename, { type: 'image/png' });
      const data = { title, text, url };
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ ...data, files: [file] }); }
      else if (navigator.share) { await navigator.share(data); }
      else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        await navigator.clipboard?.writeText(url).catch(() => {});
        toast('Image saved · link copied');
      }
    } catch (e) { if (e?.name !== 'AbortError') toast('Could not share'); }
    finally { if (button) button.disabled = false; }
  }
  /* Canvas helpers shared by the cards */
  const logo = new Image(); logo.src = '/images/logo.svg';
  async function cardContext(W, H) {
    await Promise.all([document.fonts.load('700 120px Inter'), document.fonts.load('600 48px Inter'), document.fonts.load('400 36px Inter'),
                       logo.complete ? null : new Promise(res => { logo.onload = res; logo.onerror = res; })]);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, W, H);
    x.textAlign = 'center';
    if (logo.naturalWidth) x.drawImage(logo, W / 2 - 36, 150, 72, 72);
    return { c, x, toBlob: () => new Promise(res => c.toBlob(res, 'image/png')) };
  }
  function cardText(x, str, y, { size = 40, weight = 400, color = '#fff', spacing = 0 } = {}, cx) {
    x.font = `${weight} ${size}px Inter`; x.fillStyle = color; x.letterSpacing = spacing + 'px';
    x.fillText(str, cx, y); x.letterSpacing = '0px';
  }
  function cardFooter(x, W, label) { cardText(x, label, 1230, { size: 32, weight: 500, color: 'rgba(255,255,255,0.55)' }, W / 2); }
  return { toast, copyLink, share, cardContext, cardText, cardFooter };
})();

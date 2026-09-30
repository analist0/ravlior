// Apply saved display preferences before first paint (preferences only; no secrets).
try {
  var p = JSON.parse(localStorage.getItem('prefs.v1') || '{}');
  if (p.theme === 'dark' || p.theme === 'light') document.documentElement.dataset.theme = p.theme;
  if (p.motion === 'reduce' || p.motion === 'full') document.documentElement.dataset.motion = p.motion;
  if (p.fontScale) document.documentElement.style.setProperty('--font-scale', String(p.fontScale));
} catch (e) {}

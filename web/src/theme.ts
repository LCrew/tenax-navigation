import type { Config } from '../../shared/schema';

const LIGHT = { bg: '#f4f5fb', surface: '#ffffff', text: '#15172b' };

export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#12142a' : '#ffffff';
}

function prefersLight() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
}

export function applyTheme(site: Config['site']) {
  const t = site.theme;
  const light = site.mode === 'light' || (site.mode === 'auto' && prefersLight());
  const base = light ? LIGHT : t;
  const root = document.documentElement.style;
  root.setProperty('--bg', base.bg);
  root.setProperty('--surface', base.surface);
  root.setProperty('--text', base.text);
  root.setProperty('--accent', t.accent);
  root.setProperty('--on-accent', readableOn(t.accent));
  t.barColors.forEach((c, i) => root.setProperty(`--bar${i + 1}`, c));
  root.setProperty('--on-fill', readableOn(t.barColors[2]));
  root.setProperty('--columns', String(site.columns));
  document.documentElement.dataset.scheme = light ? 'light' : 'dark';
  document.title = site.title;
}

export function watchScheme(cb: () => void) {
  const mq = window.matchMedia?.('(prefers-color-scheme: light)');
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

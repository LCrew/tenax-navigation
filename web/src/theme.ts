import type { Config } from '../../shared/schema';

/** Glass design themes. `auto` follows the device's light/dark setting. */
export type ThemeName = 'light' | 'dark' | 'blue' | 'green' | 'neon';
export type ThemeChoice = 'auto' | ThemeName;
export type Surface = 'glass' | 'solid';

export const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'neon', label: 'Neon' },
];

/** Page colour per theme, for the phone status bar (`theme-color`). Keep in sync with styles.css and public/boot.js. */
const THEME_BG: Record<ThemeName, string> = {
  light: '#F1F1ED',
  dark: '#26282C',
  blue: '#EEF2F7',
  green: '#EDF1EC',
  neon: '#14121F',
};

export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#12142a' : '#ffffff';
}

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  },
};

const isTheme = (v: string | null): v is ThemeChoice => THEMES.some((t) => t.id === v);

/** The viewer's own appearance choices. `theme() === null` means "use the page default". */
export const prefs = {
  theme: (): ThemeChoice | null => {
    const v = store.get('theme');
    return isTheme(v) ? v : null;
  },
  setTheme: (v: ThemeChoice | null) => store.set('theme', v),
  surface: (): Surface => (store.get('surface') === 'solid' ? 'solid' : 'glass'),
  setSurface: (v: Surface) => store.set('surface', v === 'solid' ? 'solid' : null),
};

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function resolveTheme(choice: ThemeChoice): ThemeName {
  return choice === 'auto' ? (prefersDark() ? 'dark' : 'light') : choice;
}

export function applyTheme(site: Config['site']) {
  store.set('site-mode', site.mode); // lets public/boot.js paint the right theme before the config loads
  const theme = resolveTheme(prefs.theme() ?? site.mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.surface = prefs.surface();
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[theme]);

  const t = site.theme;
  const s = root.style;
  s.setProperty('--accent', t.accent);
  t.barColors.forEach((c, i) => s.setProperty(`--bar${i + 1}`, c));
  s.setProperty('--on-fill', readableOn(t.barColors[2]));
  s.setProperty('--columns', String(site.columns));
  document.title = site.title;
}

export function watchScheme(cb: () => void) {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

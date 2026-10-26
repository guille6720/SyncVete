/** SyncVete product theme. Brand default is teal — see docs/ui-v2/BRAND.md */
export const THEME_STORAGE_KEY = 'syncvete-theme';
const THEME_STORAGE_KEY_LEGACY = 'sincvete-theme';

export const COLOR_PRESETS = [
  { id: 'teal', label: 'Verde teal', swatch: '#0d9488' },
  { id: 'emerald', label: 'Esmeralda', swatch: '#059669' },
  { id: 'sky', label: 'Cielo', swatch: '#0284c7' },
  { id: 'indigo', label: 'Índigo', swatch: '#4f46e5' },
  { id: 'violet', label: 'Violeta', swatch: '#7c3aed' },
  { id: 'rose', label: 'Rosa', swatch: '#e11d48' },
  { id: 'amber', label: 'Ámbar', swatch: '#d97706' },
] as const;

export type ColorPresetId = (typeof COLOR_PRESETS)[number]['id'];
export type ThemeMode = 'light' | 'dark';

export interface ThemePreferences {
  mode: ThemeMode;
  accent: ColorPresetId;
}

export const DEFAULT_THEME: ThemePreferences = {
  mode: 'light',
  accent: 'teal',
};

export function isColorPresetId(value: string): value is ColorPresetId {
  return COLOR_PRESETS.some((preset) => preset.id === value);
}

export function parseThemePreferences(raw: string | null): ThemePreferences {
  if (!raw) return DEFAULT_THEME;
  try {
    const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
    const mode = parsed.mode === 'dark' ? 'dark' : 'light';
    const accent = parsed.accent && isColorPresetId(parsed.accent) ? parsed.accent : 'teal';
    return { mode, accent };
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyThemePreferences(prefs: ThemePreferences) {
  const root = document.documentElement;
  root.classList.toggle('dark', prefs.mode === 'dark');
  root.setAttribute('data-accent', prefs.accent);
  root.style.colorScheme = prefs.mode;
}

export function readStoredThemeRaw(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(THEME_STORAGE_KEY) ?? localStorage.getItem(THEME_STORAGE_KEY_LEGACY);
}

export function writeStoredTheme(prefs: ThemePreferences) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  localStorage.removeItem(THEME_STORAGE_KEY_LEGACY);
}

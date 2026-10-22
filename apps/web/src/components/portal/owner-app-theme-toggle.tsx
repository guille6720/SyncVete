'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import {
  DEFAULT_THEME,
  applyThemePreferences,
  parseThemePreferences,
  readStoredThemeRaw,
  writeStoredTheme,
  type ThemeMode,
} from '@/lib/theme';
import { Button } from '@/components/ui/button';

/** Same storage key as the clinic app so Claro/Oscuro stays in sync on this device. */
export function OwnerAppThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME.mode);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const prefs = parseThemePreferences(readStoredThemeRaw());
    setMode(prefs.mode);
    applyThemePreferences(prefs);
    setMounted(true);
  }, []);

  const toggle = () => {
    const prefs = parseThemePreferences(readStoredThemeRaw());
    const next = { ...prefs, mode: (prefs.mode === 'dark' ? 'light' : 'dark') as ThemeMode };
    setMode(next.mode);
    applyThemePreferences(next);
    writeStoredTheme(next);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="gap-1.5"
      aria-label={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {mounted && mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline">{mounted && mode === 'dark' ? 'Claro' : 'Oscuro'}</span>
    </Button>
  );
}

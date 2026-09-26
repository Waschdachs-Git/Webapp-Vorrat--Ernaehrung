import { useEffect } from 'react';
import { useSettings } from './useSettings';

/** Convert a hex colour to an "r g b" string for CSS variables. */
function hexToRgbTriplet(hex: string, lighten = 0): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1]!, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * lighten);
  const r = mix((int >> 16) & 255);
  const g = mix((int >> 8) & 255);
  const b = mix(int & 255);
  return `${r} ${g} ${b}`;
}

/**
 * Applies the chosen theme (system/light/dark) and accent colour to the
 * document. Listens to the OS colour-scheme when set to "system".
 */
export function useTheme(): void {
  const { theme, accentColor } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mql.matches);
      root.classList.toggle('dark', dark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', dark ? '#10100f' : '#f4f3ef');
      }
    };

    apply();
    if (theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
    return;
  }, [theme]);

  // The accent is set inline on <html>, which beats the `.dark` rule in the
  // stylesheet – so the dark variant has to be derived here. Lightening it
  // keeps the green legible on the near-black ground (≥ 4.5:1).
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mql.matches);
      const triplet = hexToRgbTriplet(accentColor, dark ? 0.45 : 0);
      if (triplet) root.style.setProperty('--c-accent', triplet);
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [accentColor, theme]);
}

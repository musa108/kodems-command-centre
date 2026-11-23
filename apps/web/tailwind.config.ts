import type { Config } from 'tailwindcss';
// Palette: deep navy (primary), off-white/light surfaces, muted gold accent. NO dark or grey page backgrounds.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0B2545', 700: '#13315C', 600: '#1B3F73', 500: '#2A5290', 100: '#E4ECF7', 50: '#F1F5FB' },
        gold: { DEFAULT: '#B08D3C', 600: '#97762C', 100: '#F6EED9', 50: '#FBF7EC' },
        paper: '#FAF8F3', ink: '#14233B', muted: '#51627C', line: '#D9E2EE',
        crit: { DEFAULT: '#B42318', bg: '#FDECEA' }, warn: { DEFAULT: '#A15C07', bg: '#FFF4DC' }, ok: { DEFAULT: '#1B7A47', bg: '#E5F6EC' }, info: { DEFAULT: '#1B4F9C', bg: '#E4EEFC' },
      },
      fontFamily: { sans: ['Inter', 'Aptos', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'], display: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'] },
      boxShadow: { card: '0 1px 2px rgba(11,37,69,.06), 0 1px 3px rgba(11,37,69,.05)' },
      keyframes: { fade: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } }, shimmer: { '100%': { transform: 'translateX(100%)' } } },
      animation: { fade: 'fade .18s ease-out' },
    },
  },
  plugins: [],
};
export default config;

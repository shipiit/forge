import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        panelStrong: 'rgb(var(--panel-strong) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        accentSoft: 'rgb(var(--accent-soft) / <alpha-value>)',
        accentWarm: 'rgb(var(--accent-warm) / <alpha-value>)',
        forge1: 'rgb(var(--forge1) / <alpha-value>)',
        forge2: 'rgb(var(--forge2) / <alpha-value>)',
      },
      boxShadow: {
        glow: '0 18px 80px rgba(0,0,0,0.34)',
        glowAccent: '0 18px 60px -18px rgba(124,92,255,0.6)',
        insetLine: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      fontFamily: {
        sans: ["'Segoe UI'", 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-7px)' } },
        dotpulse: { '0%,100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
        spinslow: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        floaty: 'floaty 6s cubic-bezier(.22,1,.36,1) infinite',
        dotpulse: 'dotpulse 2s ease-in-out infinite',
        spinslow: 'spinslow 9s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;

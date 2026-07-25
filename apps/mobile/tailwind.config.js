/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        page: token('page'),
        surface: token('surface'),
        'surface-hover': token('surface-hover'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-soft': token('ink-soft'),
        primary: token('primary'),
        'primary-tint': token('primary-tint'),
        ok: token('ok'),
        warn: token('warn'),
        danger: token('danger'),
        'ok-bright': token('ok-bright'),
        'warn-bright': token('warn-bright'),
        'danger-bright': token('danger-bright'),
        'cat-a': token('cat-a'),
        'cat-b': token('cat-b'),
        'cat-c': token('cat-c'),
        'cat-d': token('cat-d'),
        'cat-e': token('cat-e'),
        'cat-f': token('cat-f'),
        'cat-g': token('cat-g'),
      },
    },
  },
  plugins: [],
};

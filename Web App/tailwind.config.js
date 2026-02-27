/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          900: '#050710',
          800: '#0B0F19',
          700: '#111827',
          600: '#1A2236',
          500: '#243049',
          400: '#334155',
          300: '#475569',
          200: '#64748B',
          100: '#94A3B8',
        },
        accent: {
          500: '#00D4AA',
          400: '#00E6B8',
          300: '#33F0CE',
          200: '#80F5E0',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '24px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(0, 212, 170, 0.25)',
        'glow-strong': '0 0 40px rgba(0, 212, 170, 0.45)',
      },
    },
  },
  plugins: [],
}

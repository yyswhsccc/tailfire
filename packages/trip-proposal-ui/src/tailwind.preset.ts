import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

export const tripProposalPreset: Partial<Config> = {
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'Cinzel', 'serif'],
      },
      colors: {
        'phoenix-charcoal': '#1A1A1A',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.text-shadow-hero': {
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
        },
      })
    }),
  ],
}

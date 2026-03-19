import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'
import { tripProposalPreset } from '@tailfire/trip-proposal-ui/tailwind.preset'

const config: Config = {
  darkMode: ['class'],
  presets: [tripProposalPreset as Config],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui-public/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/trip-proposal-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			phoenix: {
  				gold: {
  					'50': 'hsl(var(--phoenix-gold-50))',
  					'100': 'hsl(var(--phoenix-gold-100))',
  					'200': 'hsl(var(--phoenix-gold-200))',
  					'300': 'hsl(var(--phoenix-gold-300))',
  					'400': 'hsl(var(--phoenix-gold-400))',
  					'500': 'hsl(var(--phoenix-gold-500))',
  					'600': 'hsl(var(--phoenix-gold-600))',
  					'700': 'hsl(var(--phoenix-gold-700))',
  					'800': 'hsl(var(--phoenix-gold-800))',
  					'900': 'hsl(var(--phoenix-gold-900))'
  				}
  			},
  			ember: {
  				red: {
  					'50': 'hsl(var(--ember-red-50))',
  					'100': 'hsl(var(--ember-red-100))',
  					'200': 'hsl(var(--ember-red-200))',
  					'300': 'hsl(var(--ember-red-300))',
  					'400': 'hsl(var(--ember-red-400))',
  					'500': 'hsl(var(--ember-red-500))',
  					'600': 'hsl(var(--ember-red-600))',
  					'700': 'hsl(var(--ember-red-700))',
  					'800': 'hsl(var(--ember-red-800))',
  					'900': 'hsl(var(--ember-red-900))'
  				},
  				orange: {
  					'50': 'hsl(var(--ember-orange-50))',
  					'100': 'hsl(var(--ember-orange-100))',
  					'200': 'hsl(var(--ember-orange-200))',
  					'300': 'hsl(var(--ember-orange-300))',
  					'400': 'hsl(var(--ember-orange-400))',
  					'500': 'hsl(var(--ember-orange-500))',
  					'600': 'hsl(var(--ember-orange-600))',
  					'700': 'hsl(var(--ember-orange-700))',
  					'800': 'hsl(var(--ember-orange-800))',
  					'900': 'hsl(var(--ember-orange-900))'
  				}
  			},
  			golden: {
  				orange: {
  					'50': 'hsl(var(--golden-orange-50))',
  					'100': 'hsl(var(--golden-orange-100))',
  					'200': 'hsl(var(--golden-orange-200))',
  					'300': 'hsl(var(--golden-orange-300))',
  					'400': 'hsl(var(--golden-orange-400))',
  					'500': 'hsl(var(--golden-orange-500))',
  					'600': 'hsl(var(--golden-orange-600))',
  					'700': 'hsl(var(--golden-orange-700))',
  					'800': 'hsl(var(--golden-orange-800))',
  					'900': 'hsl(var(--golden-orange-900))'
  				}
  			},
  			ash: {
  				'50': 'hsl(var(--ash-50))',
  				'100': 'hsl(var(--ash-100))',
  				'200': 'hsl(var(--ash-200))',
  				'300': 'hsl(var(--ash-300))',
  				'400': 'hsl(var(--ash-400))',
  				'500': 'hsl(var(--ash-500))',
  				'600': 'hsl(var(--ash-600))',
  				'700': 'hsl(var(--ash-700))',
  				'800': 'hsl(var(--ash-800))',
  				'900': 'hsl(var(--ash-900))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontSize: {
  			xs: [
  				'0.75rem',
  				{
  					lineHeight: '1rem'
  				}
  			],
  			sm: [
  				'0.8125rem',
  				{
  					lineHeight: '1.25rem'
  				}
  			],
  			base: [
  				'0.875rem',
  				{
  					lineHeight: '1.5rem'
  				}
  			],
  			lg: [
  				'1rem',
  				{
  					lineHeight: '1.5rem'
  				}
  			],
  			xl: [
  				'1.125rem',
  				{
  					lineHeight: '1.75rem'
  				}
  			],
  			'2xl': [
  				'1.5rem',
  				{
  					lineHeight: '2rem'
  				}
  			],
  			'3xl': [
  				'1.875rem',
  				{
  					lineHeight: '2.25rem'
  				}
  			]
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
}

export default config

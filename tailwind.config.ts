import type { Config } from 'tailwindcss'

// 與 student-app 同一套暖色系（奶油底＋琥珀主色）
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#f7f1e8', card: '#fffefb', line: '#e8dcc8' },
        ink: { DEFAULT: '#37302a', soft: '#665d51', mute: '#948675' },
        brand: { DEFAULT: '#d97706', dark: '#a8530a', light: '#fff7ed', ring: '#fed7aa' },
      },
      boxShadow: { card: '0 1px 3px rgba(120,90,40,0.08), 0 1px 2px rgba(120,90,40,0.06)' },
    },
  },
  plugins: [],
}
export default config

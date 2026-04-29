/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        monday: {
          blue: '#0073ea',
          dark: '#1c1f3b',
          sidebar: '#20263e',
          'sidebar-hover': '#2a3252',
          red: '#e2445c',
          green: '#00c875',
          orange: '#fdab3d',
          purple: '#a25ddc',
        }
      }
    }
  },
  plugins: []
}

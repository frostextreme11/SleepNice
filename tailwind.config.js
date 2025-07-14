/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#00F5D4',
        'brand-secondary': '#9B5DE5',
        'brand-background': '#07060D',
        'brand-surface': '#1A1823',
        'brand-glass': 'rgba(26, 24, 35, 0.5)',
      },
      fontFamily: {
          sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
     require('@tailwindcss/typography'),
  ],
}
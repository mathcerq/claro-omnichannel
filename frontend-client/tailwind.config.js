/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        claro: {
          red: '#e3000f',
          'red-dark': '#b0000c',
          'red-light': '#ff1a26',
        },
      },
    },
  },
  plugins: [],
};

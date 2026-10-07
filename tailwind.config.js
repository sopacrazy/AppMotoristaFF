/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}" // Catch App.tsx in root
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4', // green-50
          100: '#dcfce7', // green-100
          500: '#16a34a', // green-600 (Main Brand Color)
          600: '#15803d', // green-700
          700: '#166534', // green-800
          900: '#064e3b', // green-950
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

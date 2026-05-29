/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        landmark: {
          blue: '#003A8C',          // Primary Royal Blue
          navy: '#001F5B',          // Deep Navy Blue
          'navy-dark': '#00113B',   // Darker Navy for hover
          gold: '#D4AF37',          // Luxury Gold
          'gold-rich': '#C9A227',    // Rich Gold
          bg: '#F8F9FC',            // Light Background
          'blue-dark': '#001F5B',   // Deep Navy alias
          'blue-light': '#003A8C',  // Royal Blue alias
          'gold-dark': '#C9A227',   // Rich Gold alias
          'gold-light': '#D4AF37',  // Luxury Gold alias
          cream: '#F8F9FC',         // Background alias
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'landmark': '0 20px 40px -15px rgba(0, 31, 91, 0.08), 0 15px 25px -10px rgba(0, 31, 91, 0.04)',
        'landmark-gold': '0 20px 40px -15px rgba(212, 160, 23, 0.15), 0 15px 25px -10px rgba(212, 160, 23, 0.08)',
        'glass': '0 8px 32px 0 rgba(0, 31, 91, 0.05)',
      }
    },
  },
  plugins: [],
}

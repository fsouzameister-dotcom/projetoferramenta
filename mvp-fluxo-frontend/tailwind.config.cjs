/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1a2f5e",
          dark: "#0f1e3d",
          light: "#2a4a8f",
        },
        accent: {
          DEFAULT: "#00b4a6",
          dark: "#008f83",
          light: "#00d4c4",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}


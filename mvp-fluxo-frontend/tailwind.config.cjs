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
      keyframes: {
        "agent-reply-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 rgba(251, 191, 36, 0.55)",
            borderColor: "rgba(251, 191, 36, 0.95)",
          },
          "50%": {
            boxShadow: "0 0 0 6px rgba(251, 191, 36, 0)",
            borderColor: "rgba(253, 230, 138, 1)",
          },
        },
      },
      animation: {
        "agent-reply-pulse": "agent-reply-pulse 1.1s ease-in-out 5",
      },
    },
  },
  plugins: [],
}


import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f8",
          100: "#eeeef0",
          200: "#d9d9de",
          300: "#b6b6c0",
          400: "#8b8b9a",
          500: "#6b6b7c",
          600: "#545463",
          700: "#434350",
          800: "#2e2e38",
          900: "#1a1a20",
          950: "#0e0e12",
        },
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          200: "#bccffe",
          300: "#8fadfc",
          400: "#5c82f7",
          500: "#3a5ded",
          600: "#2a41d6",
          700: "#2333ac",
          800: "#212e88",
          900: "#1f2a6b",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px 0 rgb(0 0 0 / 0.03)",
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 4px 12px -2px rgb(0 0 0 / 0.06)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;

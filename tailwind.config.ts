import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Warm dark-first neutral ramp, calibrated to chiragsharma.co's
        // palette. Direction is intentionally inverted vs. a typical light
        // scale: 50 = near-black (page background), 900 = cream (primary
        // text) — so `bg-ink-50` / `text-ink-900` read the same way they
        // would in a light-mode scale, just resolving to dark-theme values.
        ink: {
          50: "#0b0a08", // page background
          100: "#131110", // card / elevated surface
          200: "#1c1915", // hover surface, subtle fill
          300: "#2e2a22", // borders, dividers
          400: "#6b6455", // muted icons / dim text
          500: "#948c77", // muted / secondary text
          600: "#b3ab94", // tertiary text
          700: "#cfc7b3", // body text (dimmer)
          800: "#e4ddc9", // body text
          900: "#f3eee1", // primary heading text
        },
        // Repurposed as the signature gold accent (was blue). Every
        // existing `brand-*` usage — buttons, links, focus rings, badges —
        // now resolves to this warm gold instead of touching each call site.
        brand: {
          50: "#fbf3e1",
          100: "#f5e4be",
          200: "#ecd08e",
          300: "#e9c05c",
          400: "#d3a43b",
          500: "#ba8e2e",
          600: "#9c7726",
          700: "#7d5f1f",
          800: "#5e4818",
          900: "#3f3010",
        },
        success: "#4fbe8d",
        danger: "#c1594a",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ['"Space Grotesk"', "Inter", "-apple-system", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgb(0 0 0 / 0.2)",
        card: "0 4px 24px -4px rgb(0 0 0 / 0.4)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      letterSpacing: {
        tightest: "-0.045em",
        widest2: "0.15em",
      },
    },
  },
  plugins: [],
};

export default config;

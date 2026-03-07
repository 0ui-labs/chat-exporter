import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        xl: "var(--radius)",
        "2xl": "calc(var(--radius) + 0.5rem)"
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      boxShadow: {
        panel:
          "0 1px 0 hsl(var(--foreground) / 0.06), 0 24px 64px hsl(190 80% 10% / 0.08)"
      },
      backgroundImage: {
        mesh:
          "radial-gradient(circle at top left, hsl(var(--accent) / 0.15), transparent 36%), radial-gradient(circle at right 10% top 10%, hsl(var(--primary) / 0.18), transparent 28%)"
      }
    }
  },
  plugins: []
};

export default config;

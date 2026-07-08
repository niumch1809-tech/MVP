import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        paper: "#f7f8fb",
        line: "#d7dde8",
        brand: "#2563eb",
        accent: "#0f766e",
        warn: "#b45309",
        danger: "#b91c1c"
      }
    }
  },
  plugins: []
};

export default config;

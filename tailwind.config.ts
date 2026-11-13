import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { fontFamily: { sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "system-ui", "sans-serif"] } } },
} satisfies Config;

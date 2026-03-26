import type { Config } from "tailwindcss";
import { phoenixPreset } from "@tailfire/ui-public/tailwind.preset";

export default {
  presets: [phoenixPreset as Config],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui-public/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-lato)", "Lato", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-cinzel)", "Cinzel", "serif"],
        serif: ["var(--font-cinzel)", "Cinzel", "ui-serif", "Georgia", "serif"],
      },
    },
  },
} satisfies Config;

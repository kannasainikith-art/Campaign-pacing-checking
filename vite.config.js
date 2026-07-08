import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Campaign-pacing-checking/",
  build: {
    rollupOptions: {
      external: ["fsevents"],
    },
  },
});